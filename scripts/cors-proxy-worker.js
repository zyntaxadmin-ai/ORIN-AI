/* Optional: lets the web version of Orin reach services that block browsers (Cloudflare's API, for example).
   Not part of the app: paste this into a new Cloudflare Worker (dash.cloudflare.com -> Workers & Pages -> Create -> Hello World -> Edit code),
   deploy it, then put its address followed by ?url= into Orin -> Settings -> Connectors -> Browser access.
   It only forwards to the hosts listed below and only for the origin below, so it is not an open proxy.
   The Android app does not need it. */
const ALLOW_HOSTS = ['api.vercel.com', 'api.netlify.com', 'api.cloudflare.com', 'api.render.com', 'api.supabase.com'];
const ALLOW_ORIGIN = 'https://zyntaxadmin-ai.github.io';   // where your Orin runs; change it if you host Orin somewhere else

export default {
  async fetch(req) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || '*',
      'Vary': 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.headers.get('Origin') !== ALLOW_ORIGIN) return new Response('Forbidden', { status: 403 });
    const target = new URL(req.url).searchParams.get('url');
    let u;
    try { u = new URL(target); } catch (e) { return new Response('Missing ?url=', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOW_HOSTS.includes(u.hostname)) return new Response('Host not allowed', { status: 403, headers: cors });
    const h = new Headers(req.headers);
    ['host', 'origin', 'referer', 'cf-connecting-ip'].forEach(k => h.delete(k));
    const r = await fetch(u.toString(), { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body });
    const out = new Headers(r.headers);
    Object.entries(cors).forEach(([k, v]) => out.set(k, v));
    return new Response(r.body, { status: r.status, headers: out });
  }
};
