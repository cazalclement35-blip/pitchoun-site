// Polar AccessLink API — https://www.polar.com/accesslink-api/
// Confiance : moyenne. Le flux OAuth et l'inscription utilisateur sont bien
// documentés ; le modèle "transactionnel" pour lire l'activité quotidienne
// (créer une transaction -> lister -> lire chaque jour -> committer) est
// correct dans ses grandes lignes mais mérite d'être revérifié contre
// https://www.polar.com/accesslink-api/swagger.yaml si un point coince.
//
// Particularité : les tokens Polar AccessLink n'expirent normalement pas
// tant que l'utilisateur ne révoque pas l'accès — il n'y a donc pas de
// refresh_token classique. On gère quand même un refresh défensif au cas où.
//
// Limite connue : les données ne sont disponibles ici qu'après que l'appli
// Polar Flow du téléphone ait synchronisé la montre — "aujourd'hui" peut donc
// être en retard tant que la synchro du soir n'a pas eu lieu.

const AUTHORIZE_URL = 'https://flow.polar.com/oauth2/authorization';
const TOKEN_URL = 'https://polarremote.com/v2/oauth2/token';
const API_BASE = 'https://www.polaraccesslink.com';

export const id = 'polar';
export const label = 'Polar';

export function getAuthorizeUrl(env, state, redirectUri) {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.POLAR_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'accesslink.read_all');
  u.searchParams.set('state', state);
  return u.toString();
}

function basicAuthHeader(env) {
  return 'Basic ' + btoa(`${env.POLAR_CLIENT_ID}:${env.POLAR_CLIENT_SECRET}`);
}

async function registerUserIfNeeded(env, accessToken, polarUserId) {
  const res = await fetch(`${API_BASE}/v3/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ 'member-id': `suivi-sportif-${polarUserId}` })
  });
  // 200/201 = enregistré, 409 = déjà enregistré : les deux sont OK.
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polar user registration failed (${res.status}): ${text}`);
  }
}

export async function exchangeCode(env, code, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': basicAuthHeader(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polar token exchange failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  const polarUserId = String(data.x_user_id);
  await registerUserIfNeeded(env, data.access_token, polarUserId);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    // Pas d'expiration connue -> on met une échéance lointaine, le refresh
    // défensif prendra le relais si jamais un refresh_token est bien fourni.
    expires_at: Date.now() + 1000 * 60 * 60 * 24 * 365,
    meta: { polarUserId }
  };
}

export async function refresh(env, refreshToken) {
  if (!refreshToken) {
    throw new Error('Polar: pas de refresh_token disponible, reconnexion manuelle nécessaire.');
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': basicAuthHeader(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Polar token refresh failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + 1000 * 60 * 60 * 24 * 365
  };
}

export async function fetchDailySteps(env, accessToken, dateStr, meta) {
  const polarUserId = meta && meta.polarUserId;
  if (!polarUserId) return 0;
  const headers = { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' };

  const createRes = await fetch(`${API_BASE}/v3/users/${polarUserId}/activity-transactions`, {
    method: 'POST',
    headers
  });
  if (createRes.status === 204) return null; // rien de nouveau à synchroniser
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Polar create transaction failed (${createRes.status}): ${text}`);
  }
  const { 'transaction-id': transactionId } = await createRes.json();

  const listRes = await fetch(`${API_BASE}/v3/users/${polarUserId}/activity-transactions/${transactionId}`, { headers });
  if (!listRes.ok) return null;
  const { 'activity-log': activityLogUrls = [] } = await listRes.json();

  let stepsForDate = null;
  for (const path of activityLogUrls) {
    const fullUrl = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const dayRes = await fetch(fullUrl, { headers });
    if (!dayRes.ok) continue;
    const day = await dayRes.json();
    if (day.date === dateStr) {
      stepsForDate = day.steps ?? day['active-steps'] ?? 0;
    }
  }

  // Commit défensif de la transaction (best-effort, ne doit pas faire
  // échouer la lecture des pas si la commande exacte diffère de la doc).
  try {
    await fetch(`${API_BASE}/v3/users/${polarUserId}/activity-transactions/${transactionId}`, {
      method: 'PUT',
      headers
    });
  } catch { /* non bloquant */ }

  return stepsForDate ?? 0;
}
