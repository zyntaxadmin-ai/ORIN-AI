const C='orin-v3';
/* Same-origin files are also cached when they are fetched, so this list only speeds up the first offline start. Keep it in step with index.html. */
const SHELL=['./','index.html','css/app.css','js/core.js','js/cloud.js','js/providers.js','js/readers.js','js/github.js','js/checks.js','js/preview.js','js/templates.js','js/agent-tools.js','js/agent.js','js/push.js','js/chat.js','js/settings.js'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  /* network first, but always revalidate (GitHub Pages sends max-age=600): the html and its scripts must come from the same deploy */
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok){const k=r.clone();caches.open(C).then(c=>c.put(e.request,k))}return r}).catch(()=>caches.match(e.request).then(x=>x||Response.error())));
});
