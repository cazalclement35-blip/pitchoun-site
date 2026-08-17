export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Passcode',
    'Vary': 'Origin'
  };
}

export function json(env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
  });
}

export function htmlPage(env, title, message, status = 200) {
  const body = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#FAF6EF;color:#1C2B1A;display:flex;
align-items:center;justify-content:center;min-height:100vh;margin:0;padding:2rem;text-align:center}
.box{max-width:420px}h1{font-size:1.3rem;margin-bottom:.6rem}p{color:#6B7F6A;line-height:1.5}
a{color:#4A7048;font-weight:600}</style></head>
<body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders(env) } });
}

export function unauthorized(env) {
  return json(env, { error: 'unauthorized' }, 401);
}

export function requirePasscode(request, env, url) {
  const header = request.headers.get('X-App-Passcode');
  const query = url.searchParams.get('passcode');
  const provided = header || query;
  return !!env.APP_PASSCODE && provided === env.APP_PASSCODE;
}

export function randomToken(bytes = 24) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
