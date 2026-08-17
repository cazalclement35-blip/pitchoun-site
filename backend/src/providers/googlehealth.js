// Google Health API (successeur de l'API Fitbit / Google Fit) — couvre
// Fitbit et les montres Pixel Watch une fois le compte relié via Google.
// https://developers.google.com/health
//
// ⚠️ CONFIANCE LA PLUS BASSE DES 4 INTÉGRATIONS : cette API est trop récente
// (déployée courant 2026) pour que son schéma de réponse exact soit fiable
// de mémoire. Ce qui est vérifié par la documentation officielle :
//   - endpoint OAuth : https://accounts.google.com/o/oauth2/v2/auth
//   - scope de lecture : https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
//   - endpoint de lecture des pas :
//     POST https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp
// Ce qui est une estimation à vérifier avant mise en prod : la forme exacte
// du corps de requête (range/windowSizeDays/dataSourceFamily) et du champ
// contenant la valeur numérique dans la réponse. Avant de compter dessus,
// vérifie et ajuste `fetchDailySteps` ci-dessous contre :
// https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints/dailyRollUp

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'; // endpoint standard Google OAuth2, fiable
const API_BASE = 'https://health.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly';

export const id = 'googlehealth';
export const label = 'Fitbit / Google Health';

export function getAuthorizeUrl(env, state, redirectUri) {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.GOOGLEHEALTH_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('access_type', 'offline'); // pour obtenir un refresh_token
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return u.toString();
}

async function tokenRequest(env, params) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLEHEALTH_CLIENT_ID,
      client_secret: env.GOOGLEHEALTH_CLIENT_SECRET,
      ...params
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Health token error (${res.status}): ${text}`);
  }
  return res.json();
}

export async function exchangeCode(env, code, redirectUri) {
  const data = await tokenRequest(env, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || null,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000
  };
}

export async function refresh(env, refreshToken) {
  if (!refreshToken) throw new Error('Google Health: pas de refresh_token, reconnexion nécessaire.');
  const data = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: refreshToken });
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000
  };
}

// Cherche récursivement une valeur numérique plausible (clé contenant
// "value", "count" ou "steps") dans une réponse dont le schéma exact n'est
// pas garanti. Retourne 0 si rien de probant n'est trouvé.
function findStepsValue(node) {
  if (node == null) return null;
  if (typeof node === 'number') return node;
  if (Array.isArray(node)) {
    for (const item of node) {
      const v = findStepsValue(item);
      if (v != null) return v;
    }
    return null;
  }
  if (typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (/value|count|steps/i.test(key) && typeof value === 'number') return value;
    }
    for (const value of Object.values(node)) {
      const v = findStepsValue(value);
      if (v != null) return v;
    }
  }
  return null;
}

export async function fetchDailySteps(env, accessToken, dateStr) {
  const startTime = `${dateStr}T00:00:00Z`;
  const endTime = `${dateStr}T23:59:59Z`;
  const res = await fetch(`${API_BASE}/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      range: { startTime, endTime },
      windowSizeDays: 1
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google Health steps error (${res.status}): ${text}`);
  }
  const data = await res.json();
  const points = data.rollupDataPoints || data.dailyRollupDataPoints || [];
  let total = 0;
  for (const point of points) {
    total += findStepsValue(point) || 0;
  }
  return total;
}
