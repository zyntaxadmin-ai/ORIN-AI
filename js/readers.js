/* Orin · readers — zip / folder / office file readers (no libraries).
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---- zip / folder / office readers (no libraries; DecompressionStream) ---- */
const BIN_EXT=/\.(png|jpe?g|gif|webp|bmp|ico|pdf|zip|gz|tgz|rar|7z|mp[34]|mov|avi|mkv|wav|woff2?|ttf|otf|eot|exe|dll|so|dylib|class|jar|bin|o|a|wasm|pyc|psd|sqlite|db|docx|xlsx|pptx|map|min\.js)$/i,SKIP_DIR=/(^|\/)(node_modules|\.git|dist|build|__pycache__|\.next|vendor|\.venv|venv|\.idea)\//;
async function inflate(u8){const r=new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(r).arrayBuffer())}
async function zipList(file){
  const tail=new DataView(await file.slice(Math.max(0,file.size-66000)).arrayBuffer());let i=tail.byteLength-22;
  for(;i>=0;i--)if(tail.getUint32(i,true)===0x06054b50)break;
  if(i<0)throw new Error('Valid zip na');
  const cnt=tail.getUint16(i+10,true),cdSize=tail.getUint32(i+12,true),cdOff=tail.getUint32(i+16,true);
  if(cdOff===0xffffffff||cnt===0xffff)throw new Error('zip64 support nai');
  const cd=new DataView(await file.slice(cdOff,cdOff+cdSize).arrayBuffer()),dec=new TextDecoder(),out=[];let p=0;
  for(let k=0;k<cnt&&p+46<=cd.byteLength;k++){
    if(cd.getUint32(p,true)!==0x02014b50)break;
    const fl=cd.getUint16(p+8,true),method=cd.getUint16(p+10,true),cs=cd.getUint32(p+20,true),us=cd.getUint32(p+24,true),nl=cd.getUint16(p+28,true),el=cd.getUint16(p+30,true),cl=cd.getUint16(p+32,true),off=cd.getUint32(p+42,true);
    out.push({name:dec.decode(new Uint8Array(cd.buffer,p+46,nl)),method,cs,us,off,enc:fl&1});p+=46+nl+el+cl;
  }
  return out;
}
async function zipRead(file,e){
  const h=new DataView(await file.slice(e.off,e.off+30).arrayBuffer()),st=e.off+30+h.getUint16(26,true)+h.getUint16(28,true);
  const raw=new Uint8Array(await file.slice(st,st+e.cs).arrayBuffer());
  if(e.method===0)return raw;if(e.method===8)return inflate(raw);throw new Error('zip method '+e.method);
}
const zipStr=async(f,e)=>new TextDecoder().decode(await zipRead(f,e));
function packText(items){let out='',n=0,skipped=0;for(const [name,t] of items){if(out.length+t.length>MAXF){skipped++;continue}out+='\n=== '+name+' ===\n'+t;n++}return {text:out.trimStart(),n,skipped}}
async function zipToText(file){
  const es=(await zipList(file)).filter(e=>!e.name.endsWith('/')),items=[];let skipped=0;
  for(const e of es){
    if(BIN_EXT.test(e.name)||SKIP_DIR.test('/'+e.name)||e.us>1.5e6||e.enc){skipped++;continue}
    try{const t=await zipStr(file,e);if(t.includes('\u0000')){skipped++;continue}items.push([e.name,t])}catch(_){skipped++}
  }
  const r=packText(items);r.skipped+=skipped;return r;
}
async function dirToText(list){
  const items=[];let skipped=0;
  for(const f of list){const n=f.webkitRelativePath||f.name;
    if(BIN_EXT.test(n)||SKIP_DIR.test('/'+n)||f.size>1.5e6){skipped++;continue}
    try{const t=await f.text();if(t.includes('\u0000')){skipped++;continue}items.push([n,t])}catch(_){skipped++}}
  const r=packText(items);r.skipped+=skipped;return r;
}
async function addDir(list){
  if(!list.length)return;if(pend.length>=10){toast('Max 10 ta file');return}
  const nm=((list[0].webkitRelativePath||'').split('/')[0]||'folder')+'/';
  toast('Folder pora hocche…');const r=await dirToText(list);
  if(!r.n){toast('Porar moto text file pai ni');return}
  pend.push({kind:'text',name:nm,text:r.text,size:r.text.length,tok:etok(r.text)});renderTray();
  toast(nm+': '+r.n+' ta file'+(r.skipped?' ('+r.skipped+' ta skip: binary/boro/node_modules)':''));
}
const xmlDec=x=>x.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&amp;/g,'&');
const numSort=(a,b)=>(+(a.match(/(\d+)\.xml$/)||[0,0])[1])-(+(b.match(/(\d+)\.xml$/)||[0,0])[1]);
const colIdx=r=>{let n=0;for(const ch of (r.match(/^[A-Z]+/)||[''])[0])n=n*26+ch.charCodeAt(0)-64;return n-1};
const csvq=v=>/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
async function officeToText(file){
  const es=await zipList(file),by=n=>es.find(e=>e.name===n),nm=file.name.toLowerCase();
  if(nm.endsWith('.docx')){const e=by('word/document.xml');if(!e)throw new Error('docx na');return xmlDec((await zipStr(file,e)).replace(/<w:tab\/>/g,'\t').replace(/<w:br\/>/g,'\n').replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,'')).replace(/\n{3,}/g,'\n\n')}
  if(nm.endsWith('.pptx')){
    const sl=es.filter(e=>/^ppt\/slides\/slide\d+\.xml$/.test(e.name)).sort((a,b)=>numSort(a.name,b.name));let o='';
    for(const [i,e] of sl.entries())o+='--- Slide '+(i+1)+' ---\n'+xmlDec((await zipStr(file,e)).replace(/<\/a:p>/g,'\n').replace(/<[^>]+>/g,''))+'\n';return o;
  }
  const ss=[];const sse=by('xl/sharedStrings.xml');
  if(sse){const x=await zipStr(file,sse);for(const m of x.matchAll(/<si>([\s\S]*?)<\/si>/g))ss.push(xmlDec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>t[1]).join('')))}
  const wb=by('xl/workbook.xml'),names=wb?[...(await zipStr(file,wb)).matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m=>xmlDec(m[1])):[];
  const sh=es.filter(e=>/^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)).sort((a,b)=>numSort(a.name,b.name));let o='';
  for(const [i,e] of sh.entries()){
    o+='--- Sheet: '+(names[i]||'Sheet'+(i+1))+' ---\n';const x=await zipStr(file,e);
    for(const r of x.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){
      const row=[];for(const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
        const at=c[1],ref=(at.match(/r="([A-Z]+\d+)"/)||[])[1]||'',t=(at.match(/t="(\w+)"/)||[])[1],body=c[2]||'';let v='';
        if(t==='inlineStr')v=xmlDec([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m=>m[1]).join(''));
        else{const m=body.match(/<v>([\s\S]*?)<\/v>/);if(m)v=t==='s'?(ss[+m[1]]||''):xmlDec(m[1])}
        row[colIdx(ref)]=csvq(v)}
      o+=Array.from(row,v=>v||'').join(',')+'\n'}}
  return o;
}
function updatePill(){const p=S.pick&&S.providers.find(x=>x.id===S.pick&&x.on);$('modelb').innerHTML=esc(p?p.name:'Auto')+IC.chev}
function closePop(){['pov','pop'].forEach(i=>{const e=$(i);if(e)e.remove()})}
function pop(anchor,html){
  closePop();const r=anchor.getBoundingClientRect();
  const o=document.createElement('div');o.id='pov';o.onclick=closePop;
  const p=document.createElement('div');p.id='pop';p.innerHTML=html;
  p.style.left=Math.max(8,Math.min(r.left,innerWidth-250))+'px';if(r.top<260)p.style.top=(r.bottom+8)+'px';else p.style.bottom=(innerHeight-r.top+8)+'px';
  document.body.append(o,p);
}
function modelMenu(){
  const l=S.providers.filter(p=>p.on&&p.model&&p.url);
  return '<button class="pi" data-pk="auto"><span><b>Auto</b><small>Fallback order e cholbe</small></span>'+(!S.pick?'<i>'+ico('check',16)+'</i>':'')+'</button>'+
  l.map(p=>'<button class="pi" data-pk="'+p.id+'"><span><b>'+esc(p.name)+'</b><small>'+esc(p.model)+'</small></span>'+(S.pick===p.id?'<i>'+ico('check',16)+'</i>':'')+'</button>').join('');
}
let rec=null,recOn=false;
function toggleMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast('Ei browser e voice nai. Chrome e try koro');return}
  if(recOn){rec&&rec.stop();return}
  const box=$('box'),base=box.value;
  rec=new SR();rec.lang=S.lang||'bn-BD';rec.interimResults=true;rec.continuous=false;
  rec.onstart=()=>{recOn=true;$('mic').classList.add('rec')};
  rec.onresult=e=>{let t='';for(const r of e.results)t+=r[0].transcript;box.value=base+(base&&!/\s$/.test(base)?' ':'')+t;box.dispatchEvent(new Event('input'))};
  rec.onerror=e=>{toast(e.error==='not-allowed'||e.error==='service-not-allowed'?'Mic permission dao':e.error==='no-speech'?'Kichu shunte pai ni':'Voice error: '+e.error)};
  rec.onend=()=>{recOn=false;$('mic').classList.remove('rec')};
  try{rec.start()}catch(e){toast('Mic chalu hoy ni')}
}
const gl=t=>'<div class="gl">'+t+'</div>';
function themeHTML(){return '<div class="sec"><h3>Theme</h3><div class="row" style="margin-top:6px">'+['auto','light','dark'].map(t=>'<button class="btn '+(S.theme===t?'':'ghost')+' sm" data-theme="'+t+'">'+t+'</button>').join('')+'</div></div>'}
function webHTML(){return '<div class="sec"><h3>Web search</h3><p class="h">Composer er globe icon chalu korle message pathanor age web e khuje AI ke dewa hobe. <b>Tavily</b> API key lagbe (tavily.com e free plan ache).</p><input class="f" id="tk" type="password" autocomplete="off" placeholder="tvly-…" value="'+qa((S.search||{}).key)+'"></div>'}
function imgHTML(){const g=S.imgcfg||{};return '<div class="sec"><h3>Image generation</h3><p class="h">Composer er image icon chalu korle message ta chobir prompt hishebe jabe. OpenAI-compatible <code>/images/generations</code> API lagbe.</p><div class="chips">'+IMGP.map((x,i)=>'<button type="button" class="chip" data-ipre="'+i+'">'+x[0]+'</button>').join('')+'</div>'+
 '<label>Base URL</label><input class="f" id="iu" value="'+qa(g.url)+'" placeholder="https://api.openai.com/v1">'+
 '<label>API key</label><input class="f" id="ik" type="password" autocomplete="off" value="'+qa(g.key)+'">'+
 '<label>Model</label><input class="f" id="im" value="'+qa(g.model)+'" placeholder="gpt-image-1">'+
 '<label>Size (optional)</label><input class="f" id="is" value="'+qa(g.size)+'" placeholder="1024x1024"></div>'}
const IMGP=[['OpenAI','https://api.openai.com/v1','gpt-image-1',''],['Together','https://api.together.xyz/v1','black-forest-labs/FLUX.1-schnell','']];
function voiceHTML(){return '<div class="sec"><h3>Voice input</h3><p class="h">Mic er bhasha. Chrome e bhalo kaj kore.</p><div class="row" style="margin-top:0">'+[['bn-BD','Bangla'],['en-US','English'],['hi-IN','Hindi']].map(x=>'<button class="btn '+((S.lang||'bn-BD')===x[0]?'':'ghost')+' sm" data-lang="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></div>'}
let curCtl=null,stopped=false;
function setBusyUI(on){const b=$('sendb');b.innerHTML=on?IC.stop:IC.up;b.setAttribute('aria-label',on?'Stop':'Send')}
function b64(f){return new Promise((ok,no)=>{const r=new FileReader();r.onerror=no;r.onload=()=>ok(r.result.split(',')[1]);r.readAsDataURL(f)})}
function provList(){let l=S.providers.filter(p=>p.on&&p.model&&p.url);if(S.pick){const o=l.find(p=>p.id===S.pick);if(o)l=[o]}return l}
const qa=t=>esc(t||'').replace(/"/g,'&quot;');
const srcOf=c=>{const u=c.msgs[c.msgs.length-1];return u&&u.web&&u.web.r?u.web.r.map(x=>({title:x.title,url:x.url})):undefined};
const webCtx=m=>m.web&&m.web.r&&m.web.r.length?'\n\n[Web search results for "'+m.web.q+'" (today: '+new Date().toDateString()+'). Use them if helpful and cite as [n].]\n'+m.web.r.map((x,i)=>'['+(i+1)+'] '+x.title+' ('+x.url+')\n'+x.content).join('\n\n'):'';
const srcHTML=s=>s&&s.length?'<div class="src">'+ico('globe',14)+' '+s.map((x,i)=>/^https?:\/\//.test(x.url)?'<a href="'+qa(x.url)+'" target="_blank" rel="noopener">['+(i+1)+'] '+esc((x.title||x.url).slice(0,50))+'</a>':'').join('')+'</div>':'';
async function webSearch(qry){
  const ctl=new AbortController();curCtl=ctl;const to=setTimeout(()=>ctl.abort(),20000);
  try{
    const r=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+S.search.key},body:JSON.stringify({query:qry.slice(0,400),max_results:5,search_depth:'basic'}),signal:ctl.signal});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error((j.detail&&(j.detail.error||j.detail))||j.error||r.status);
    return (j.results||[]).map(x=>({title:x.title||x.url,url:x.url,content:(x.content||'').slice(0,700)}));
  }catch(e){
    if(e.name==='AbortError')throw new Error(stopped?'STOP':'Timeout');
    if(e instanceof TypeError)throw new Error('Network/CORS block');
    throw e;
  }finally{clearTimeout(to)}
}
function shrink(src){
  return new Promise((ok,no)=>{
    const im=new Image();if(!src.startsWith('data:'))im.crossOrigin='anonymous';
    im.onerror=()=>src.startsWith('data:')?no(new Error('Bad image')):ok(src);
    im.onload=()=>{try{const k=Math.min(1,896/Math.max(im.width,im.height)),cn=document.createElement('canvas');cn.width=Math.round(im.width*k);cn.height=Math.round(im.height*k);const x=cn.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,cn.width,cn.height);x.drawImage(im,0,0,cn.width,cn.height);ok(cn.toDataURL('image/jpeg',.85))}catch(e){ok(src)}};
    im.src=src;
  });
}
const imgReady=()=>{const g=S.imgcfg||{};return !!(g.url&&g.key&&g.model)};
async function genImage(prompt){
  const g=S.imgcfg,ctl=new AbortController();curCtl=ctl;const to=setTimeout(()=>ctl.abort(),120000);
  try{
    const body={model:g.model,prompt,n:1};
    if(g.size)body.size=g.size;
    if(/dall-e/i.test(g.model))body.response_format='b64_json';
    const r=await fetch(g.url.replace(/\/+$/,'')+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+g.key},body:JSON.stringify(body),signal:ctl.signal});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){const x=j.error;throw new Error((x&&(typeof x==='string'?x:x.message||JSON.stringify(x)))||j.message||r.status+' '+r.statusText)}
    const d=j.data&&j.data[0],src=d&&(d.b64_json?'data:image/png;base64,'+d.b64_json:d.url);
    if(!src)throw new Error('Empty reply');
    return await shrink(src);
  }catch(e){
    if(e.name==='AbortError')throw new Error(stopped?'STOP':'Timeout (120s)');
    if(e instanceof TypeError)throw new Error('Network/CORS block');
    throw e;
  }finally{clearTimeout(to)}
}
async function runImg(c){
  const um=c.msgs[c.msgs.length-1];
  try{
    const pic=await genImage(um.content);
    c.msgs.push({role:'assistant',content:'[Generated image: '+um.content+']',by:S.imgcfg.model,pic});
  }catch(e){if(!stopped&&e.message!=='STOP')c.msgs.push({role:'error',content:'Image fail: '+e.message})}
  busy=false;setBusyUI(false);save();render();
}
let imgMode=false;
function updateModes(){$('webb').classList.toggle('on',!!S.web);$('imgb').classList.toggle('on',imgMode);$('box').placeholder=imgMode?'Ki chobi banabe likho…':'Message likho…'}
async function run(c,list){
  const history=buildHistory(c);
  const fails=[];let done=false;
  for(const p of list){
    if(stopped)break;
    try{
      live='';const out=await callProvider(p,history,t=>{live=t;draw()});
      c.msgs.push({role:'assistant',content:out,by:p.name,skipped:fails.slice(),src:srcOf(c),u:mkUsage(p,history,out)});done=true;break;
    }catch(e){if(stopped||e.message==='STOP'){if(live)c.msgs.push({role:'assistant',content:live,by:p.name,skipped:[],src:srcOf(c),u:mkUsage(p,history,live)});done=true;break}fails.push(p.name+': '+e.message)}
  }
  if(!done&&!stopped)c.msgs.push({role:'error',content:'Sob provider fail korse.\n'+fails.join('\n')});
  busy=false;live='';setBusyUI(false);save();render();
}
