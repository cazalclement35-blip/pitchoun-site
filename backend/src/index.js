import { corsHeaders, json, htmlPage, unauthorized, requirePasscode, randomToken, todayStr } from './http.js';
import { kvGetJSON, kvPutJSON, kvDelete, tokenKey, stepsCacheKey, appleStepsKey, oauthStateKey } from './kv.js';
import * as withings from './providers/withings.js';
import * as polar from './providers/polar.js';
import * as googlehealth from './providers/googlehealth.js';
import * as apple from './providers/apple.js';

const PROVIDERS = { withings, polar, googlehealth };
const STEPS_CACHE_TTL_SECONDS = 600; // évite de marteler les API des montres

function redirectUriFor(url, providerId) {
  return `${url.origin}/auth/${providerId}/callback`;
}

async function getValidAccessToken(env, provider) {
  const stored = await kvGetJSON(env, tokenKey(provider.id));
  if (!stored) return null;
  if (stored.expires_at && stored.expires_at - 60_000 < Date.now()) {
    try {
      const refreshed = await provider.refresh(env, stored.refresh_token);
      const merged = { ...stored, ...refreshed, meta: stored.meta };
      await kvPutJSON(env, tokenKey(provider.id), merged);
      return merged;
    } catch (err) {
      // Le refresh a échoué : le token stocké est probablement mort.
      await kvDelete(env, tokenKey(provider.id));
      throw err;
    }
  }
  return stored;
}

async function handleAuthStart(request, env, url, provider) {
  if (!requirePasscode(request, env, url)) return unauthorized(env);
  const state = randomToken();
  await kvPutJSON(env, oauthStateKey(state), { provider: provider.id }, { expirationTtl: 600 });
  const redirectUri = redirectUriFor(url, provider.id);
  const authorizeUrl = provider.getAuthorizeUrl(env, state, redirectUri);
  return Response.redirect(authorizeUrl, 302);
}

async function handleAuthCallback(request, env, url, provider) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return htmlPage(env, 'Connexion échouée', "Paramètres manquants dans la réponse du fournisseur.", 400);
  }
  const stateEntry = await kvGetJSON(env, oauthStateKey(state));
  if (!stateEntry || stateEntry.provider !== provider.id) {
    return htmlPage(env, 'Connexion échouée', "Cette demande de connexion a expiré ou est invalide, réessaie depuis l'app.", 400);
  }
  await kvDelete(env, oauthStateKey(state));

  try {
    const redirectUri = redirectUriFor(url, provider.id);
    const token = await provider.exchangeCode(env, code, redirectUri);
    await kvPutJSON(env, tokenKey(provider.id), token);
  } catch (err) {
    return htmlPage(env, 'Connexion échouée', `Erreur lors de l'échange du code : ${String(err.message || err)}`, 500);
  }

  const appUrl = env.APP_URL || url.origin;
  return htmlPage(env, 'Connecté ✅', `${provider.label} est relié. Tu peux revenir sur <a href="${appUrl}">l'app</a> et fermer cet onglet.`);
}

async function handleAppleWebhook(request, env, url) {
  if (!requirePasscode(request, env, url)) return unauthorized(env);
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(env, { error: 'invalid_json' }, 400);
  }
  const byDate = apple.extractStepsByDate(payload);
  for (const [dateStr, steps] of Object.entries(byDate)) {
    const existing = (await kvGetJSON(env, appleStepsKey(dateStr))) || 0;
    await kvPutJSON(env, appleStepsKey(dateStr), Math.max(existing, steps));
  }
  await kvPutJSON(env, 'apple:lastSync', { at: Date.now() });
  return json(env, { ok: true, days: Object.keys(byDate).length });
}

async function handleConnections(request, env, url) {
  if (!requirePasscode(request, env, url)) return unauthorized(env);
  const result = {};
  for (const provider of Object.values(PROVIDERS)) {
    const stored = await kvGetJSON(env, tokenKey(provider.id));
    result[provider.id] = { label: provider.label, connected: !!stored };
  }
  const appleSync = await kvGetJSON(env, 'apple:lastSync');
  result.apple = { label: apple.label, connected: !!appleSync, lastSync: appleSync ? appleSync.at : null };
  return json(env, result);
}

async function handleDisconnect(request, env, url, providerId) {
  if (!requirePasscode(request, env, url)) return unauthorized(env);
  if (providerId === 'apple') {
    await kvDelete(env, 'apple:lastSync');
    return json(env, { ok: true });
  }
  const provider = PROVIDERS[providerId];
  if (!provider) return json(env, { error: 'unknown_provider' }, 404);
  await kvDelete(env, tokenKey(provider.id));
  return json(env, { ok: true });
}

async function stepsForProvider(env, provider, dateStr) {
  const cacheKey = stepsCacheKey(provider.id, dateStr);
  const cached = await kvGetJSON(env, cacheKey);
  if (cached && cached.at && Date.now() - cached.at < STEPS_CACHE_TTL_SECONDS * 1000) {
    return cached.steps;
  }
  const token = await getValidAccessToken(env, provider);
  if (!token) return { connected: false };
  const steps = await provider.fetchDailySteps(env, token.access_token, dateStr, token.meta);
  await kvPutJSON(env, cacheKey, { steps, at: Date.now() }, { expirationTtl: STEPS_CACHE_TTL_SECONDS * 2 });
  return { connected: true, steps };
}

async function handleSteps(request, env, url) {
  if (!requirePasscode(request, env, url)) return unauthorized(env);
  const dateStr = url.searchParams.get('date') || todayStr();
  const sources = {};
  let best = null;

  for (const provider of Object.values(PROVIDERS)) {
    try {
      const result = await stepsForProvider(env, provider, dateStr);
      if (!result.connected) continue;
      sources[provider.id] = result.steps;
      if (typeof result.steps === 'number') best = Math.max(best ?? 0, result.steps);
    } catch (err) {
      sources[provider.id] = { error: String(err.message || err) };
    }
  }

  const appleSteps = await kvGetJSON(env, appleStepsKey(dateStr));
  if (typeof appleSteps === 'number') {
    sources.apple = appleSteps;
    best = Math.max(best ?? 0, appleSteps);
  }

  return json(env, { date: dateStr, sources, best });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (path === '/health') {
      return json(env, { ok: true, service: 'suivi-sportif-backend' });
    }

    const authStart = path.match(/^\/auth\/([a-z]+)\/start$/);
    if (authStart && PROVIDERS[authStart[1]]) {
      return handleAuthStart(request, env, url, PROVIDERS[authStart[1]]);
    }

    const authCallback = path.match(/^\/auth\/([a-z]+)\/callback$/);
    if (authCallback && PROVIDERS[authCallback[1]]) {
      return handleAuthCallback(request, env, url, PROVIDERS[authCallback[1]]);
    }

    if (path === '/webhook/apple' && request.method === 'POST') {
      return handleAppleWebhook(request, env, url);
    }

    if (path === '/api/connections') {
      return handleConnections(request, env, url);
    }

    const disconnect = path.match(/^\/api\/disconnect\/([a-z]+)$/);
    if (disconnect && request.method === 'POST') {
      return handleDisconnect(request, env, url, disconnect[1]);
    }

    if (path === '/api/steps') {
      return handleSteps(request, env, url);
    }

    return json(env, { error: 'not_found' }, 404);
  }
};
