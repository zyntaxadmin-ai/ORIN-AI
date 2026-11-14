/* Orin · preview — live preview of a project in an iframe.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---- live preview ---- */
const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',json:'application/json',css:'text/css'};
const mimeOf=p=>MIME[((p.match(/\.([a-z0-9]+)$/i)||[])[1]||'').toLowerCase()]||'application/octet-stream';
let pvc=null,pvEntry='',pvErrs=[],pvMode=0,pvHtml=null,pvN=0;
/* the preview runs in preview.html (own page, no CSP) inside the sandboxed iframe: load it, wait for its "ready" message, then send the project html */
function setPreview(html){pvHtml=html;$('pvf').src='preview.html?v='+(++pvN)}
function closePreviewFrame(){pvHtml=null;$('pvf').src='preview.html?v='+(++pvN)}
const isRel=u=>u&&!/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
const resolveP=(base,ref)=>{try{return decodeURIComponent(new URL(ref.split('#')[0].split('?')[0],'http://p/'+base).pathname.slice(1))}catch(e){return ''}};
function pickEntry(d){const h=Object.keys(d.files).filter(p=>/\.html?$/i.test(p)&&!d.files[p].del).sort((a,b)=>a.split('/').length-b.split('/').length);return h[0]||''}
async function buildPreview(c,entry){
  const d=c.draft,R=d.repo,B=d.branch,cache={};
  const text=async p=>{if(p in cache)return cache[p];const f=d.files[p];let t=null;if(f){if(f.del)t=null;else if(!f.bin)t=f.content}else{try{t=await gh('/repos/'+R+'/contents/'+enc(p)+'?ref='+encodeURIComponent(B),{raw:true})}catch(e){t=null}}return cache[p]=t};
  const bin=async p=>{const f=d.files[p];if(f&&f.bin)return 'data:'+(f.mime||mimeOf(p))+';base64,'+f.bin;
    try{const r=await fetch('https://api.github.com/repos/'+R+'/contents/'+enc(p)+'?ref='+encodeURIComponent(B),{headers:{Authorization:'Bearer '+S.gh.token,Accept:'application/vnd.github.raw+json'}});if(!r.ok)return null;const b=await r.blob();if(b.size>2.5e6)return null;
      return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)})}catch(e){return null}};
  const cssUrls=async(css,base)=>{const m=[...css.matchAll(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/g)].filter(x=>isRel(x[2].trim()));for(const x of m){const u=await bin(resolveP(base,x[2].trim()));if(u)css=css.split(x[0]).join('url('+u+')')}return css};
  let html=await text(entry);if(html==null)throw new Error('Entry HTML pai ni: '+entry);
  const dir=entry.includes('/')?entry.slice(0,entry.lastIndexOf('/')+1):'';
  const files={};
  async function repl(re,fn){const ms=[...html.matchAll(re)];for(const m of ms){const r=await fn(m);if(r!=null)html=html.replace(m[0],()=>r)}}
  await repl(/<link\b[^>]*>/gi,async m=>{const t=m[0];if(!/rel\s*=\s*["']?stylesheet/i.test(t))return null;const h=(t.match(/href\s*=\s*["']([^"']+)["']/i)||[])[1];if(!isRel(h))return null;const p=resolveP(entry,h);let css=await text(p);if(css==null)return null;css=await cssUrls(css,p);return '<style data-src="'+esc(p)+'">'+css.replace(/<\/style/gi,'<\\/style')+'</style>'});
  await repl(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi,async m=>{if(!isRel(m[2])||/type\s*=\s*["']?module/i.test(m[1]+m[3]))return null;const js=await text(resolveP(entry,m[2]));if(js==null)return null;return '<script'+(m[1]+m[3]).replace(/\s+$/,'')+'>'+js.replace(/<\/script/gi,'<\\/script')+'<\/script>'});
  await repl(/(<(?:img|source|video|audio)\b[^>]*?\b(?:src|poster)\s*=\s*["'])([^"']+)(["'])/gi,async m=>{if(!isRel(m[2]))return null;const u=await bin(resolveP(entry,m[2]));return u?m[1]+u+m[3]:null});
  for(const m of new Set([...html.matchAll(/["'`]([\w./-]+\.(?:json|geojson|csv|txt))["'`]/g)].map(x=>x[1]))){if(!isRel(m))continue;const p=resolveP(entry,m),t=await text(p);if(t!=null&&t.length<1.5e6)files[p]=t}
  for(const [p,f] of Object.entries(d.files)){if(!f.del&&!f.bin&&/\.(json|geojson|csv|txt)$/i.test(p)&&f.content.length<1.5e6)files[p]=f.content}
  const shim='<script>(function(){var F='+JSON.stringify(files).replace(/</g,'\\u003c').replace(/\u2028|\u2029/g,'')+',D='+JSON.stringify(dir)+';function S(m){try{parent.postMessage(Object.assign({orin:1},m),"*")}catch(e){}}function N(u){try{return decodeURIComponent(new URL(String(u).split("#")[0].split("?")[0],"http://p/"+D).pathname.slice(1))}catch(e){return ""}}'+
   'addEventListener("error",function(e){S({t:"err",m:(e.message||"error")+(e.lineno?" (line "+e.lineno+")":"")})});addEventListener("unhandledrejection",function(e){S({t:"err",m:"Promise: "+((e.reason&&e.reason.message)||e.reason)})});'+
   'var ce=console.error;console.error=function(){S({t:"err",m:[].slice.call(arguments).map(String).join(" ")});ce.apply(console,arguments)};'+
   'var of=window.fetch;window.fetch=function(u){try{var p=N(typeof u==="string"?u:u.url);if(F[p]!==undefined)return Promise.resolve(new Response(F[p],{headers:{"Content-Type":p.slice(-4)===".csv"?"text/csv":"application/json"}}))}catch(e){}return of.apply(this,arguments)};'+
   'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href");if(/^(#|[a-z][a-z0-9+.-]*:|\\/\\/)/i.test(h))return;e.preventDefault();S({t:"nav",h:N(h)})},true);})()<\/script>';
  return /<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,m=>m+shim):shim+html;
}
async function openPreview(c,entry){
  pvc=c;pvEntry=entry||pickEntry(c.draft)||'index.html';pvErrs=[];
  $('pv').classList.add('on');$('pvt').textContent=pvEntry;renderPvErrs();
  try{setPreview(await buildPreview(c,pvEntry))}catch(e){setPreview('<p style="font:16px sans-serif;padding:16px">'+esc(e.message)+'</p>')}
}
function renderPvErrs(){const e=$('pve');if(!pvErrs.length){e.classList.remove('on');e.innerHTML='';return}e.classList.add('on');e.innerHTML=pvErrs.slice(0,8).map(x=>'<div>'+esc(x)+'</div>').join('')+'<button class="btn sm" id="pvs">'+ico('chat',15)+'AI ke fix korte bolo</button>'}
addEventListener('message',e=>{
  const m=e.data;
  if(m&&m.orinPreviewReady&&e.source===$('pvf').contentWindow){if(pvHtml!=null)e.source.postMessage({orinPreviewHtml:pvHtml},'*');return}
  if(!m||!m.orin||e.source!==$('pvf').contentWindow)return;
  if(m.t==='err'){if(!pvErrs.includes(m.m)&&pvErrs.length<20){pvErrs.push(m.m);renderPvErrs()}}
  else if(m.t==='nav'&&pvc&&pvc.draft){const p=m.h;if(/\.html?$/i.test(p)||p===''||p.endsWith('/'))openPreview(pvc,p===''||p.endsWith('/')?p+'index.html':p);else toast('Ei link preview te khule na')}
});
const RFC=new Map(),RDG=new Map();let TOOLNO=0;
const BINX=/\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp[34]|mov|avi|wasm|exe|bin|so|dll|jar)$/i;
const snip=(ln,ql,w)=>{w=w||200;if(ln.length<=w)return ln.trim();const i=ln.toLowerCase().indexOf(ql),s=Math.max(0,(i<0?0:i)-Math.floor(w/3));return (s?'…':'')+ln.slice(s,s+w).trim()+(s+w<ln.length?'…':'')};
const OUTL=/^\s{0,2}(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+[\w$]+|class\s+[\w$]+|(?:const|let|var)\s+[\w$]+\s*=)|^(?:def|class|func|fn|struct|interface|type|impl)\s+\w+|^#{1,3}\s+\S|^<(?:script|style|section|header|main|footer|nav|body|template)\b/;
function outline(ls,max){
  const hits=[];ls.forEach((l,i)=>{if(OUTL.test(l))hits.push(i)});
  let pick=hits;if(hits.length>max){const st=hits.length/max;pick=Array.from({length:max},(_,k)=>hits[Math.floor(k*st)])}
  return {total:hits.length,shown:pick.length,text:pick.map(i=>(i+1)+': '+ls[i].trim().slice(0,80)).join('\n')};
}
function sliceRead(x,a){
  const lim=20000,ls=x.split('\n'),n=ls.length,s0=Math.max(1,parseInt(a.start_line,10)||1),e0=Math.min(n,parseInt(a.end_line,10)||n);
  if(s0===1&&e0===n&&x.length<=lim)return x;
  if(!a.start_line&&!a.end_line&&x.length>lim){
    const o=outline(ls,100);
    if(o.total>=5)return '[BIG FILE: '+n+' lines, '+x.length+' chars, so it is NOT dumped (saves tokens). Do not page through it. Call find_in_file with several queries at once to get line numbers, then read_file with a narrow start_line/end_line (80-150 lines). Outline, "line: declaration" ('+o.shown+' of '+o.total+' shown):\n'+o.text+']';
  }
  const out=[];let len=0;
  for(let i=s0-1;i<e0;i++){if(len+ls[i].length+1>lim&&out.length)break;out.push(ls[i]);len+=ls[i].length+1}
  const last=s0-1+out.length;
  return '[lines '+s0+'-'+last+' of '+n+' ('+x.length+' chars total)'+(last<Math.min(n,e0)||last<n&&!a.end_line?'. NOT finished: call read_file again with start_line='+(last+1)+' to read the rest':'')+']\n'+out.join('\n');
}
async function readFull(c,p){
  const d=dr(c),f=d.files[p];
  if(f){if(f.del)throw new Error('File draft e deleted');if(f.bin)throw new Error('Binary file, porte parbo na');return f.content}
  const t=await getTree();if(!t.trunc&&!t.paths.has(p))throw new Error('File nai: '+p);
  const ck=S.repo.full+'@'+S.repo.branch+':'+p;if(RFC.has(ck))return RFC.get(ck);
  const txt=await gh('/repos/'+S.repo.full+'/contents/'+enc(p)+'?ref='+encodeURIComponent(S.repo.branch),{raw:true});
  if(txt.includes('\u0000'))throw new Error('Binary file, porte parbo na');
  if(RFC.size>=60)RFC.delete(RFC.keys().next().value);
  RFC.set(ck,txt);return txt;
}
