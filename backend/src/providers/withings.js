// Withings Public API — https://developer.withings.com/api-reference/
// OAuth2 classique. Scope "user.activity" donne accès aux pas quotidiens.
// Confiance : haute (API stable et documentée depuis des années).

const AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';
const TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';
const MEASURE_URL = 'https://wbsapi.withings.net/v2/measure';

export const id = 'withings';
export const label = 'Withings';

export function getAuthorizeUrl(env, state, redirectUri) {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.WITHINGS_CLIENT_ID);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'user.activity');
  u.searchParams.set('state', state);
  return u.toString();
}

async function tokenRequest(env, params) {
  const body = new URLSearchParams({
    client_id: env.WITHINGS_CLIENT_ID,
    client_secret: env.WITHINGS_CLIENT_SECRET,
    ...params
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await res.json();
  if (data.status !== 0) {
    throw new Error(`Withings token error (status ${data.status}): ${JSON.stringify(data)}`);
  }
  return data.body; // { access_token, refresh_token, expires_in, userid, ... }
}

export async function exchangeCode(env, code, redirectUri) {
  const body = await tokenRequest(env, {
    action: 'requesttoken',
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri
  });
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
    meta: { userid: body.userid }
  };
}

export async function refresh(env, refreshToken) {
  const body = await tokenRequest(env, {
    action: 'requesttoken',
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000
  };
}

export async function fetchDailySteps(env, accessToken, dateStr) {
  const body = new URLSearchParams({
    action: 'getactivity',
    startdateymd: dateStr,
    enddateymd: dateStr,
    data_fields: 'steps'
  });
  const res = await fetch(MEASURE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${accessToken}`
    },
    body
  });
  const data = await res.json();
  if (data.status !== 0) {
    throw new Error(`Withings activity error (status ${data.status}): ${JSON.stringify(data)}`);
  }
  const activities = (data.body && data.body.activities) || [];
  const day = activities.find(a => a.date === dateStr);
  return day ? (day.steps || 0) : 0;
}
