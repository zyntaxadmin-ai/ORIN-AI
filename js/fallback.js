/* Orin · smart fallback
   - every provider error is classified (ProvErr.kind) so each kind gets the right reaction
   - temporary errors (rate limit, overloaded, network) are retried a couple of times before moving on
   - a provider that keeps failing "rests" for a few minutes and is tried last; a rejected key or a missing model rests until you edit it
   - withFallback() runs one request through the providers in the best order; chat and agent mode both use it
   Health is kept on this device only (S.health) and is never synced. */

class ProvErr extends Error{
  constructor(msg,kind,status,wait){super(msg);this.kind=kind||'bad';this.status=status||0;this.wait=wait||0}
}
/* kinds: auth (key rejected) · model (model not found) · quota (out of credit) · rate (429) · server (5xx, overloaded)
   net (network/CORS) · timeout · ctx (message too long for this model) · empty · bad (other) */
const FBL={auth:'API key rejected',model:'Model not found',quota:'Out of credit or quota',rate:'Rate limit reached',server:'Provider overloaded or down',net:'Network or CORS block',timeout:'No response in time',ctx:'Message too long for this model',empty:'Empty reply',bad:'Request failed'};
const FB_RETRY=new Set(['rate','server','net']);          /* worth trying again on the same provider */
const FB_LONG=new Set(['auth','model','quota']);          /* will not fix itself in a few minutes */
const RE_CTX=/context|too long|too large|maximum.{0,30}(token|length)|token limit|exceeds|reduce the length|prompt is too/i;
const RE_AUTH=/api[ _-]?key|unauthori[sz]ed|authentication|invalid.{0,12}(key|token)|permission denied/i;
const RE_MODEL=/model.{0,40}(not found|does not exist|not supported|unavailable|invalid)|invalid model|unknown model|no such model/i;
const RE_QUOTA=/quota|billing|credit|insufficient|payment|exceeded your current/i;

/* build a ProvErr from an HTTP status and the provider's own message */
function errFrom(status,msg,retryAfter){
  status=+status||0;msg=String(msg||'').replace(/\s+/g,' ').slice(0,300);
  let kind='bad';
  if(status===401||status===403)kind='auth';
  else if(status===404||RE_MODEL.test(msg)&&status<500)kind='model';
  else if(status===429)kind=RE_QUOTA.test(msg)?'quota':'rate';
  else if(status===402)kind='quota';
  else if(status===408)kind='timeout';
  else if(status>=500||/overloaded|temporarily unavailable|service unavailable|capacity/i.test(msg))kind='server';
  else if((status===400||status===413||status===422)&&RE_CTX.test(msg))kind='ctx';
  else if(status===400&&RE_AUTH.test(msg))kind='auth';
  let wait=0;
  if(retryAfter){const n=parseInt(retryAfter,10);if(n>0)wait=n;else{const d=Date.parse(retryAfter);if(d)wait=Math.max(0,Math.ceil((d-Date.now())/1000))}}
  return new ProvErr(msg||(status?'HTTP '+status:'Error'),kind,status,wait);
}
/* from a failed fetch response r and its parsed JSON body j */
function httpErr(r,j){
  const e=Array.isArray(j)?j[0]:j,x=e&&e.error;
  const msg=(x&&(typeof x==='string'?x:x.message||JSON.stringify(x)))||r.status+' '+r.statusText;
  return errFrom(r.status,msg,r.headers&&r.headers.get('retry-after'));
}
/* an error event inside an already-started stream */
const streamErr=x=>{const msg=typeof x==='string'?x:(x&&(x.message||JSON.stringify(x)))||'Stream error';return errFrom(0,msg)};
/* anything thrown that is not a ProvErr (a plain Error from older code paths) */
const asProvErr=e=>e instanceof ProvErr?e:(/empty reply/i.test(e.message)?new ProvErr(e.message,'empty'):/network|cors/i.test(e.message)?new ProvErr(e.message,'net'):errFrom(0,e.message));

/* one readable line for the error list and the notices */
function errText(e){
  const k=e.kind,l=FBL[k]||FBL.bad,st=e.status?' ('+e.status+')':'';
  const raw=(e.message||'').slice(0,140);
  return (k==='auth'||k==='model'||k==='quota'||k==='bad')&&raw&&raw!==l?l+st+': '+raw:l+st;
}
function failMsg(fails,kinds,agent){
  const h=[],has=k=>kinds.includes(k);
  if(has('auth'))h.push('Check the API key of the provider above (Settings → Providers).');
  if(has('model'))h.push('Check the model name.');
  if(has('quota'))h.push('Add credit, or use another provider.');
  if(has('rate'))h.push('Rate limited: wait a minute, then press Retry.');
  if(has('server'))h.push('The provider seems to be down: try again soon.');
  if(has('net'))h.push('Network problem, or the provider blocks browser access (CORS): check your connection and the Base URL.');
  if(has('capv'))h.push('No provider can read images: turn on "Understands images" for one that can (Settings → Providers → Edit), or remove the images.');
  if(has('capt'))h.push('No provider has tool calling switched on: turn it on for one that supports it, or add one.');
  if(has('capc'))h.push('The chat is too big for these models: start a new chat, or raise the Context window of a provider if it is set too low.');
  if(has('ctx'))h.push('The chat is too long for these models: start a new chat.');
  if(has('timeout'))h.push('No answer in time: raise "First reply timeout" in Settings → Providers, or try another provider.');
  if(agent)h.push('In agent mode the model must support tool calling.');
  return 'All providers failed.\n'+fails.join('\n')+(h.length?'\n\n'+h.join(' '):'');
}

/* ---------- settings (Settings → Providers → Fallback rules) ---------- */
function fbCfg(){
  const f=S.fb||{},n=(v,d,lo,hi)=>{v=+v;return isFinite(v)&&v>=lo&&v<=hi?v:d};
  return {retries:Math.round(n(f.retries,2,0,5)),cool:n(f.cool,3,1,60),ttfb:n(f.ttfb,30,10,300)};
}

/* ---------- health memory ---------- */
const hash32=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return h>>>0};
const hfp=p=>hash32((p.url||'')+'|'+(p.model||'')+'|'+(p.key||'')+'|'+(p.type||''));
function hget(p){
  const h=S.health;if(!h||!p.id)return null;const e=h[p.id];if(!e)return null;
  if(e.fp!==hfp(p)){delete h[p.id];return null}      /* provider was edited: forget the old failures */
  return e;
}
const isResting=p=>{const x=hget(p);return !!(x&&x.until>Date.now())};
function markOk(p){if(S.health&&S.health[p.id]){delete S.health[p.id];rawSave()}}
function markFail(p,e,tries){
  const k=e.kind;if(!p.id||k==='ctx'||k==='bad'||k==='empty')return;   /* about this request, not about the provider */
  const h=(S.health=S.health||{}),x=hget(p)||{n:0},cd=fbCfg().cool*60000,now=Date.now();
  x.fp=hfp(p);x.n=(x.n||0)+(tries>1?2:1);x.kind=k;x.msg=errText(e);x.t=now;
  if(k==='auth'||k==='model')x.until=now+864e5;                       /* until you fix it (editing resets) or press Retry now */
  else if(k==='quota')x.until=now+Math.max(cd,15*6e4);
  else if(x.n>=2)x.until=now+Math.max(cd,Math.min((e.wait||0)*1000,36e5));
  else x.until=0;
  h[p.id]=x;rawSave();
}
function hreset(p){if(S.health&&p&&S.health[p.id]){delete S.health[p.id];rawSave()}}
/* readable status for the settings list: {cls,txt} or null */
function healthInfo(p){
  const x=hget(p);if(!x)return null;
  const left=x.until-Date.now();
  if(left>0){const m=Math.ceil(left/6e4);return {cls:'bad',txt:'Resting'+(FB_LONG.has(x.kind)?' until fixed':' ~'+m+' min')+' · '+x.msg}}
  return {cls:'warn',txt:'Last error: '+x.msg};
}

/* ---------- live notice above the reply while switching ---------- */
let liveNote='';
function setLiveNote(t){
  liveNote=t||'';const el=document.getElementById('liveb');if(!el)return;
  let n=document.getElementById('livenote');
  if(!liveNote){if(n)n.remove();return}
  if(!n){n=document.createElement('div');n.id='livenote';n.className='fbn';n.setAttribute('role','status');el.parentNode.insertBefore(n,el)}
  n.textContent=liveNote;
}
const liveNoteHTML=()=>liveNote?'<div class="fbn" id="livenote" role="status">'+esc(liveNote)+'</div>':'';
/* wait ms, but wake up when Stop is pressed; resolves false if stopped */
const sleepStop=ms=>new Promise(res=>{const t0=Date.now();(function w(){if(stopped)res(false);else if(Date.now()-t0>=ms)res(true);else setTimeout(w,120)})()});

/* ---------- app in the background ----------
   Phones freeze or cut network calls when the browser goes to the background. A call that dies while the page
   was hidden (or offline) says nothing about the provider, so it must not count as a failure or make the provider
   rest: wait until the app is back, then try the same provider again. */
let pageAway=0;   /* last time the page was hidden, shown, frozen, resumed, or went offline/online */
for(const ev of ['visibilitychange','freeze','resume'])document.addEventListener(ev,()=>{pageAway=Date.now()});
for(const ev of ['pagehide','pageshow','online','offline'])window.addEventListener(ev,()=>{pageAway=Date.now()});
const awayNow=()=>document.hidden||navigator.onLine===false;
/* wait until the page is visible and online again, then a moment for the network to wake up; false if Stop was pressed */
async function waitBack(){
  while(awayNow()){if(stopped)return false;await new Promise(r=>setTimeout(r,400))}
  return sleepStop(800);
}
/* did this failed call (started at t0) overlap a time when the app was away? */
const wasAway=t0=>awayNow()||pageAway>=t0;

/* ---------- what a provider can do ----------
   p.cap = {vision:false, tools:false} only holds what you switched OFF in the provider settings; unknown counts as "can".
   Before any call, providers that cannot do the job are left out, so no time is lost on a certain failure. */
const capOn=(p,k)=>!(p.cap&&p.cap[k]===false);
const estTokens=(history,extraChars)=>{let ch=extraChars||0,im=0;for(const m of history){ch+=(typeof m.content==='string'?m.content:JSON.stringify(m.content||'')).length;im+=(m.imgs||[]).length}return Math.ceil(ch/3.2)+im*1500};
/* need: {vision, tools, tok}; returns {kind,why} when the provider is unfit, else null */
function capSkip(p,need){
  if(!need)return null;
  if(need.vision&&!capOn(p,'vision'))return {kind:'capv',why:'does not read images (switched off in its settings)'};
  if(need.tools&&!capOn(p,'tools'))return {kind:'capt',why:'no tool calling (switched off in its settings)'};
  /* only a Context window that YOU set in the provider settings can skip a provider; the automatic 128k/200k/1M is just a guess and must not block a message */
  if(need.tok&&ctxSet(p)){const lim=ctxOf(p);if(need.tok>lim)return {kind:'capc',why:'needs about '+fmtTok(need.tok)+' tokens, its limit is '+fmtTok(lim)}}
  return null;
}

/* providers to try, best first: the one that worked last (if given), healthy before resting */
function fbOrder(list,first){
  let l=list.slice();
  if(first){const i=l.findIndex(p=>p.id===first.id);if(i>0)l=[l[i]].concat(l.slice(0,i),l.slice(i+1))}
  return l.filter(p=>!isResting(p)).concat(l.filter(isResting));
}

/* Run attempt(p) through the providers.
   attempt(p) does one real call and returns its result, or throws (ProvErr, or Error('STOP') when the user pressed Stop).
   opts: first (try this provider first), onStart(p) (called before every attempt).
   Returns {value,p,fails,kinds} on success, {stopped:true,p,...} if stopped, {fails,kinds} if everything failed. */
async function withFallback(list,attempt,opts){
  const o=opts||{},cfg=fbCfg(),fails=[],kinds=[],pool=[];
  for(const p of list){const r=capSkip(p,o.need);if(r){fails.push(p.name+': skipped, '+r.why);kinds.push(r.kind)}else pool.push(p)}
  const order=fbOrder(pool,o.first);
  setLiveNote('');
  for(let i=0;i<order.length;i++){
    const p=order[i];let tries=0,away=0;
    for(;;){
      if(stopped)return {stopped:true,p,fails,kinds};
      tries++;
      const t0=Date.now();
      try{
        if(o.onStart)o.onStart(p);
        const value=await attempt(p);
        markOk(p);return {value,p,fails,kinds};
      }catch(e){
        if(stopped||e.message==='STOP')return {stopped:true,p,fails,kinds};
        const pe=asProvErr(e);
        /* the call died because the app was in the background or offline: not the provider's fault.
           Wait until the app is back and retry the same provider without counting it (at most 5 times). */
        if((pe.kind==='net'||pe.kind==='timeout')&&away<5&&wasAway(t0)){
          away++;tries--;
          setLiveNote('The app was in the background. Reconnecting to '+p.name+'…');
          if(!await waitBack())return {stopped:true,p,fails,kinds};
          setLiveNote('');
          continue;
        }
        if(FB_RETRY.has(pe.kind)&&tries<=cfg.retries&&(pe.wait||0)<=15){
          const w=pe.wait||[1,3,6,10,15][tries-1]||15;
          setLiveNote(p.name+': '+FBL[pe.kind].toLowerCase()+'. Trying again in '+w+'s…');
          if(!await sleepStop(w*1000))return {stopped:true,p,fails,kinds};
          continue;
        }
        markFail(p,pe,tries);
        fails.push(p.name+': '+errText(pe));kinds.push(pe.kind);
        const nx=order[i+1];
        if(nx)setLiveNote(p.name+' failed ('+FBL[pe.kind].toLowerCase()+'). Trying '+nx.name+'…');
        break;
      }
    }
  }
  return {fails,kinds};
}
