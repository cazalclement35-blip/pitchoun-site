export async function kvGetJSON(env, key) {
  const raw = await env.TRACKER_KV.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function kvPutJSON(env, key, value, opts) {
  await env.TRACKER_KV.put(key, JSON.stringify(value), opts);
}

export async function kvDelete(env, key) {
  await env.TRACKER_KV.delete(key);
}

export function tokenKey(provider) {
  return `token:${provider}`;
}

export function stepsCacheKey(provider, dateStr) {
  return `steps:${provider}:${dateStr}`;
}

export function appleStepsKey(dateStr) {
  return `steps:apple:${dateStr}`;
}

export function oauthStateKey(state) {
  return `oauthstate:${state}`;
}
