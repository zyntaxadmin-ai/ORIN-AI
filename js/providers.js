/* Orin · providers — AI providers: OpenAI/Anthropic/Gemini style calls, streaming.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---------- Providers ---------- */
function cv(p,m){
  const im=m.imgs&&m.imgs.length?m.imgs:null,pdf=i=>i.mime==='application/pdf';
  const tx=m.content||(im?(im.some(pdf)?'Summarize this document.':'Describe this image.'):' ');
  if(p.type==='gemini')return{role:m.role==='assistant'?'model':'user',parts:(im||[]).map(i=>({inlineData:{mimeType:i.mime,data:i.data}})).concat([{text:tx}])};
  if(!im)return{role:m.role,content:m.content};
  if(p.type==='anthropic')return{role:m.role,content:im.map(i=>pdf(i)?{type:'document',source:{type:'base64',media_type:i.mime,data:i.data}}:{type:'image',source:{type:'base64',media_type:i.mime,data:i.data}}).concat([{type:'text',text:tx}])};
  return{role:m.role,content:[{type:'text',text:tx}].concat(im.map(i=>pdf(i)?{type:'file',file:{filename:i.name||'file.pdf',file_data:'data:application/pdf;base64,'+i.data}}:{type:'image_url',image_url:{url:'data:'+i.mime+';base64,'+i.data}}))};
}
async function callProvider(p,history,onDelta){
  const ctl=new AbortController();curCtl=ctl;lastUsage=null;let to=setTimeout(()=>ctl.abort(),120000);
  const sys=S.system.trim();const base=p.url.replace(/\/+$/,'');
  try{
    let url,headers={'Content-Type':'application/json'},body;
    if(p.type==='anthropic'){
      url=base+'/v1/messages';headers['x-api-key']=p.key;headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';
      body={model:p.model,max_tokens:4096,stream:true,messages:cacheLast(history.map(m=>cv(p,m)))};if(sys)body.system=[{type:'text',text:sys,cache_control:{type:'ephemeral'}}];
    }else if(p.type==='gemini'){
      url=base+'/v1beta/models/'+encodeURIComponent(p.model.trim().replace(/^models\//,'').replace(/\s+/g,'-').toLowerCase())+':streamGenerateContent?alt=sse&key='+encodeURIComponent(p.key);
      body={contents:history.map(m=>cv(p,m))};
      if(sys)body.systemInstruction={parts:[{text:sys}]};
    }else{
      url=base+'/chat/completions';if(p.key)headers.Authorization='Bearer '+p.key;
      body={model:p.model,stream:true,messages:(sys?[{role:'system',content:sys}]:[]).concat(history.map(m=>cv(p,m)))};
      if(/api\.(openai|groq|deepseek|together)\.|openrouter\.ai/.test(base))body.stream_options={include_usage:true};
    }
    const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:ctl.signal});
    if(!r.ok){const j=await r.json().catch(()=>({}));const e=Array.isArray(j)?j[0]:j;const x=e&&e.error;throw new Error((x&&(typeof x==='string'?x:x.message||JSON.stringify(x)))||r.status+' '+r.statusText)}
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='',out='';
    for(;;){
      clearTimeout(to);to=setTimeout(()=>ctl.abort(),60000);
      const {done,value}=await rd.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\n');buf=lines.pop();
      for(const ln of lines){
        if(!ln.startsWith('data:'))continue;
        const d=ln.slice(5).trim();if(!d||d==='[DONE]')continue;
        let j;try{j=JSON.parse(d)}catch(_){continue}
        if(j.error)throw new Error(j.error.message||JSON.stringify(j.error));
        if(p.type==='anthropic'){if(j.type==='message_start'&&j.message&&j.message.usage){const mu=j.message.usage,k=mu.cache_read_input_tokens||0;lastUsage={i:(mu.input_tokens||0)+k+(mu.cache_creation_input_tokens||0),o:mu.output_tokens||0,k}}else if(j.type==='message_delta'&&j.usage)lastUsage=Object.assign(lastUsage||{i:0,o:0},{o:j.usage.output_tokens||0})}
        else if(p.type==='gemini'){const u=j.usageMetadata;if(u)lastUsage={i:u.promptTokenCount||0,o:(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0)}}
        else if(j.usage&&(j.usage.prompt_tokens!=null||j.usage.completion_tokens!=null))lastUsage={i:j.usage.prompt_tokens||0,o:j.usage.completion_tokens||0};
        const t=p.type==='anthropic'?(j.type==='content_block_delta'?j.delta&&j.delta.text:''):
          p.type==='gemini'?((j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]).map(x=>x.text||'').join(''):
          j.choices&&j.choices[0]&&j.choices[0].delta&&j.choices[0].delta.content;
        if(t){out+=t;onDelta(out)}
      }
    }
    if(!out)throw new Error('Empty reply');
    return out;
  }catch(e){
    if(e.name==='AbortError')throw new Error(stopped?'STOP':'Timeout');
    if(e instanceof TypeError)throw new Error('Network/CORS block');
    throw e;
  }finally{clearTimeout(to)}
}
let live='',raf=0,lastUsage=null;
const fmtTok=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1000?(n/1000).toFixed(n>=10000?0:1)+'k':String(n||0);
const fmtCost=c=>'$'+(c<0.01?c.toFixed(4):c.toFixed(2));
const usageStr=u=>u?' · ↑'+fmtTok(u.i)+(u.k?' ('+fmtTok(u.k)+' cached)':'')+' ↓'+fmtTok(u.o)+(u.e?'~':'')+(u.c!=null?' · '+fmtCost(u.c):''):'';
function mkUsage(p,hist,out){const us=lastUsage;let i,o,e=0;if(us&&(us.i||us.o)){i=us.i||0;o=us.o||0}else{e=1;i=Math.ceil(hist.reduce((a,m)=>a+(m.content||'').length,0)/3);o=Math.ceil(out.length/3)}const k=(us&&us.k)||0,r={i,o};if(k)r.k=k;if(e)r.e=1;if(p.pin||p.pout)r.c=((i-k+k*0.1)*(+p.pin||0)+o*(+p.pout||0))/1e6;return r}
function updateFab(){const f=$('tobot'),m=$('msgs');if(!f)return;const far=!home&&m.scrollHeight-m.scrollTop-m.clientHeight>240;f.classList.toggle('on',far);if(far){const r=m.getBoundingClientRect();f.style.left=(r.right-54)+'px';f.style.top=(r.bottom-52)+'px'}}
let lastT=0;
const draw=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(!busy)return;
  const now=performance.now();if(now-lastT<60){draw();return}lastT=now;
  const el=$('liveb'),m=$('msgs');
  if(!el){render(true);return}
  const near=m.scrollHeight-m.scrollTop-m.clientHeight<140;
  el.innerHTML=md(live);
  if(near)m.scrollTop=m.scrollHeight;
  updateFab();
})};
let pend=[];
/* big text files live in IndexedDB (not localStorage); messages keep {name,id,size,tok} */
const FT=new Map(),MAXF=15e6,etok=n=>Math.ceil((typeof n==='string'?n.length:n)/3.2),fmtSz=n=>n>=1e6?(n/1e6).toFixed(1)+'MB':Math.max(1,Math.round(n/1e3))+'KB';
let fdb;
const idb=()=>fdb||(fdb=new Promise((res,rej)=>{try{const r=indexedDB.open('orin-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('f');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}}));
async function fput(id,text){FT.set(id,text);try{const d=await idb();await new Promise((res,rej)=>{const t=d.transaction('f','readwrite');t.objectStore('f').put(text,id);t.oncomplete=res;t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)});return true}catch(e){return false}}
async function fload(){try{const d=await idb();await new Promise(res=>{const q=d.transaction('f').objectStore('f').openCursor();q.onsuccess=()=>{const c=q.result;if(c){FT.set(c.key,c.value);c.continue()}else res()};q.onerror=()=>res()})}catch(e){}}
async function fclean(){try{const used=new Set();S.chats.forEach(c=>c.msgs.forEach(m=>(m.files||[]).forEach(f=>f.id&&used.add(f.id))));const d=await idb(),t=d.transaction('f','readwrite'),st=t.objectStore('f');for(const k of [...FT.keys()])if(!used.has(k)){st.delete(k);FT.delete(k)}}catch(e){}}
const ftext=f=>f.text!==undefined?f.text:(FT.has(f.id)?FT.get(f.id):'[file content ei device e nai]');
function fullText(m,sm){return (m.content||'')+(m.files||[]).map(f=>'\n\n[File: '+f.name+']'+(sm&&sm.res.has(f.id||f.name)?sm.res.get(f.id||f.name):'\n'+ftext(f))).join('')}
/* Smart mode: when attached files exceed the model's context budget, send only chunks relevant to the question */
const CHI=new Map(),STOP=new Set('the and for are but not you with this that from have was were will can all any how what when where which who why your our ko ki ke kore koro kothay ache ami tumi eta ota ar na hoy hobe dao dekho bolo please file'.split(' '));
const tokz=t=>(t.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu)||[]);
function chunkIdx(id,text){
  let ix=CHI.get(id);if(ix&&ix.len===text.length)return ix;
  const lines=text.split('\n'),ch=[];let cur=[],sz=0,sl=1;
  const flush=el=>{if(cur.length){ch.push({sl,el,text:cur.join('\n')});cur=[];sz=0}};
  lines.forEach((ln,i)=>{
    if(ln.length>3500){flush(i);for(let k=0;k<ln.length;k+=3500)ch.push({sl:i+1,el:i+1,text:ln.slice(k,k+3500)});sl=i+2;return}
    if(!cur.length)sl=i+1;cur.push(ln);sz+=ln.length+1;if(sz>=3500)flush(i+1)});
  flush(lines.length);
  const df=new Map();let tot=0;
  ch.forEach(c=>{const tf=new Map();tokz(c.text).forEach(w=>tf.set(w,(tf.get(w)||0)+1));c.tf=tf;c.n=c.text.length;tot+=c.n;tf.forEach((_,w)=>df.set(w,(df.get(w)||0)+1))});
  ix={chunks:ch,df,avg:tot/Math.max(1,ch.length),len:text.length,lines:lines.length};CHI.set(id,ix);return ix;
}
function rankChunks(ix,query){
  const qs=[...new Set(tokz(query).filter(w=>!STOP.has(w)))],N=ix.chunks.length;
  return ix.chunks.map((c,i)=>{let sc=0;for(const w of qs){const f=c.tf.get(w);if(!f)continue;const d=ix.df.get(w)||1,idf=Math.log(1+(N-d+.5)/(d+.5));sc+=idf*f*2.5/(f+1.5*(.25+.75*c.n/ix.avg))}return {i,sc}});
}
function retrieveChunks(id,text,query,maxChars){
  const ix=chunkIdx(id,text),rk=rankChunks(ix,query),hit=rk.filter(x=>x.sc>0).sort((a,b)=>b.sc-a.sc),pick=new Set();let used=0;
  const add=i=>{if(!ix.chunks[i])return false;const n=ix.chunks[i].n;if(pick.has(i)||used+n>maxChars)return false;pick.add(i);used+=n;return true};
  add(0);
  for(const x of hit){if(!add(x.i)&&used>maxChars*0.95)break}
  if(hit.length)for(const i of [...pick]){if(i)add(i-1);add(i+1)}
  if(!hit.length){const N=ix.chunks.length,step=Math.max(1,Math.floor(N/Math.max(1,Math.floor(maxChars/3500))));for(let i=0;i<N;i+=step)add(i)}
  return {ix,out:[...pick].sort((a,b)=>a-b).map(i=>'--- lines '+ix.chunks[i].sl+'-'+ix.chunks[i].el+' ---\n'+ix.chunks[i].text).join('\n'),n:pick.size};
}
const fbudget=ctx=>Math.floor(ctx*0.55);
const curCtx=()=>{let l=S.providers.filter(p=>p.on&&p.model&&p.url);if(S.pick){const o=l.find(p=>p.id===S.pick);if(o)l=[o]}return l.length?ctxOf(l[0]):128e3};
function chatFiles(c){const o=[];(c.msgs||[]).forEach(m=>(m.files||[]).forEach(f=>{const t=ftext(f);o.push({id:f.id||f.name,name:f.name,text:t,tok:etok(t)})}));return o}
const LAZY_TOK=6000,attEnt=new Map();
function attEntries(id,text){
  const k=id+':'+text.length;let r=attEnt.get(k);if(r)return r;
  r=[];const re=/(?:^|\n)=== (.+?) ===\n/g,ms=[];let m;
  while((m=re.exec(text)))ms.push({name:m[1],s:m.index,b:re.lastIndex});
  ms.forEach((x,i)=>r.push({name:x.name,text:text.slice(x.b,i+1<ms.length?ms[i+1].s:text.length)}));
  attEnt.set(k,r);return r;
}
const isPack=t=>/^=== .+? ===\n/.test(t);
/* Agent mode: big attachments are NOT pasted into every step (that costs tokens on each of 30+ steps); the agent gets an index and tools instead */
function lazyPlan(c){
  const fs=chatFiles(c);if(!fs.length||fs.reduce((a,f)=>a+f.tok,0)<=LAZY_TOK)return null;
  const res=new Map();let n=0;
  fs.forEach(f=>{
    if(f.tok<=1500)return;n++;
    const es=isPack(f.text)?attEntries(f.id,f.text):null;
    res.set(f.id,'\n[Agent mode: this file ('+fmtSz(f.text.length)+', '+f.text.split('\n').length+' lines, ~'+fmtTok(f.tok)+' token) is NOT pasted here, to save tokens. '+(es?'It is a zip/folder with '+es.length+' files:\n'+es.slice(0,120).map(e=>'- '+e.name+' ('+e.text.split('\n').length+' lines)').join('\n').slice(0,6000)+'\nTo update the repo from it use compare_attachment (which files are new/changed) and then apply_attachment (stages them without you rewriting them); use read_attachment/search_attachment only to look at details.':'Use search_attachment / read_attachment to look at it.')+']');
  });
  return n?{res,n,lazy:1}:null;
}
function smartPlan(c){
  const fs=chatFiles(c),tot=fs.reduce((a,f)=>a+f.tok,0),fb=fbudget(curCtx());
  if(!fs.length||tot<=fb)return null;
  const um=[...c.msgs].reverse().filter(m=>m.role==='user'),q=((um[0]&&um[0].content)||'')+((um[0]&&um[0].content||'').length<25&&um[1]?' '+um[1].content:'');
  const per=Math.floor(fb*3.2/fs.length),res=new Map();let n=0;
  fs.forEach(f=>{const r=retrieveChunks(f.id,f.text,q,per);n+=r.n;res.set(f.id,'\n[Smart mode: file boro ('+fmtSz(f.text.length)+', '+r.ix.lines+' lines), tai shudhu prosner shathe milano ongsho dewa holo. Baki ongsho dorkar hole user ke prosno shuddho kore bolte bolo'+(agentOn()?' ba search_attachment/read_attachment tool use koro':'')+'.]\n'+r.out)});
  return {res,n};
}
const ctxOf=p=>+p.ctx||(p.type==='gemini'?1e6:p.type==='anthropic'?2e5:128e3);
function renderTray(){const t=$('tray');t.classList.toggle('on',pend.length>0);t.innerHTML=pend.map((a,i)=>'<div class="pc">'+(a.kind==='image'?'<img src="data:'+a.mime+';base64,'+a.data+'" alt="">':a.kind==='pdf'?ico('pdf'):ico('file'))+'<span>'+esc(a.name)+(a.kind==='text'&&a.tok?'<small class="pcs">'+fmtSz(a.size||a.text.length)+' · ~'+fmtTok(a.tok)+' token'+(a.tok>fbudget(curCtx())?' · Smart':'')+'</small>':'')+'</span><button data-rmp="'+i+'" aria-label="Remove">'+ico('x',14)+'</button></div>').join('')}
function readImg(f){return new Promise((ok,no)=>{const r=new FileReader();r.onerror=no;r.onload=()=>{const im=new Image();im.onerror=no;im.onload=()=>{const k=Math.min(1,1280/Math.max(im.width,im.height)),w=Math.round(im.width*k),h=Math.round(im.height*k),cn=document.createElement('canvas');cn.width=w;cn.height=h;const x=cn.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(im,0,0,w,h);ok(cn.toDataURL('image/jpeg',.82).split(',')[1])};im.src=r.result};r.readAsDataURL(f)})}
async function addFiles(list){
  for(const f of list){
    if(pend.length>=10){toast('Max 10 ta file');break}
    try{
      if(f.type.startsWith('image/'))pend.push({kind:'image',name:f.name,mime:'image/jpeg',data:await readImg(f)});
      else if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){if(f.size>10e6)toast(f.name+' onek boro (max 10MB)');else pend.push({kind:'pdf',name:f.name,mime:'application/pdf',data:await b64(f)})}
      else if(/\.zip$/i.test(f.name)){
        if(f.size>150e6){toast(f.name+' onek boro (max 150MB)');continue}
        const r=await zipToText(f);if(!r.n){toast(f.name+': porar moto text file pai ni');continue}
        pend.push({kind:'text',name:f.name,text:r.text,size:r.text.length,tok:etok(r.text)});toast(f.name+': '+r.n+' ta file pora hoyeche'+(r.skipped?' ('+r.skipped+' ta skip: binary/boro/node_modules)':''));
      }
      else if(/\.(docx|xlsx|pptx)$/i.test(f.name)){
        if(f.size>60e6){toast(f.name+' onek boro');continue}
        const t=await officeToText(f);if(!t.trim()){toast(f.name+': kono text pai ni');continue}
        pend.push({kind:'text',name:f.name,text:t,size:t.length,tok:etok(t)});
      }
      else if(f.size>MAXF)toast(f.name+' onek boro (max '+fmtSz(MAXF)+')');
      else{const t=await f.text();if(t.includes('\u0000')){toast(f.name+': ei file support kore na');continue}pend.push({kind:'text',name:f.name,text:t,size:f.size,tok:etok(t)})}
    }catch(e){toast(f.name+' porte parlam na')}
  }
  renderTray();
}
