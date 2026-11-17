/* Orin · cloud — cloud sync (Supabase).
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---------- Cloud sync (Supabase) ---------- */
let cst='',syncing=false,pt=0;
const C=()=>S.cloud||{};
async function sb(path,opt={},auth=true){
  const c=C();const h=Object.assign({apikey:c.anon,'Content-Type':'application/json'},opt.headers||{});
  if(auth){await refreshTok();h.Authorization='Bearer '+C().session.at}
  const r=await fetch(c.url.replace(/\/+$/,'')+path,Object.assign({},opt,{headers:h}));
  const j=await r.json().catch(()=>null);
  if(!r.ok)throw new Error((j&&(j.msg||j.message||j.error_description||j.error))||r.status);
  return j;
}
function setSession(j){S.cloud.session={at:j.access_token,rt:j.refresh_token,exp:Math.floor(Date.now()/1000)+(j.expires_in||3600),uid:j.user.id};rawSave()}
async function refreshTok(){
  const c=C();if(!c.session)throw new Error('Not logged in');
  if(c.session.exp-60>Date.now()/1000)return;
  setSession(await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:c.session.rt})},false));
}
/* API keys (providers, Tavily, image API) and the GitHub token are NOT uploaded: they stay on each device */
const noKey=o=>o?Object.assign({},o,{key:''}):o;
const cloudData=()=>({providers:(S.providers||[]).map(noKey),chats:S.chats,system:S.system,temp:S.temp,autosum:S.autosum,theme:S.theme,search:noKey(S.search),imgcfg:noKey(S.imgcfg),repo:S.repo,repoNotes:S.repoNotes,ts:S.ts||Date.now()});
const needKey=p=>!p.key&&!/^https?:\/\/(localhost|127\.|10\.|192\.168\.|\[::1\])/i.test(p.url||'');
/* ---------- API keys: encrypted on this device, then synced ----------
   The keys are encrypted (AES-GCM) with a key made from the account password (PBKDF2), so the cloud only ever holds
   ciphertext. The derived key is kept on the device (S.cloud.ek, never uploaded) so later syncs do not ask for the password. */
const b64e=u=>{let s='';new Uint8Array(u).forEach(x=>s+=String.fromCharCode(x));return btoa(s)};
const b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function deriveEk(pw,salt){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  const k=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64d(salt),iterations:200000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  return b64e(await crypto.subtle.exportKey('raw',k));
}
const ekKey=raw=>crypto.subtle.importKey('raw',b64d(raw),'AES-GCM',false,['encrypt','decrypt']);
function keysObj(){
  const p={};(S.providers||[]).forEach(x=>{if(x.key)p[x.id]=x.key});
  return {p,s:(S.search&&S.search.key)||'',i:(S.imgcfg&&S.imgcfg.key)||'',g:(S.gh&&S.gh.token)||''};
}
async function encKeys(){
  const c=C();if(!c.ek||!c.es||!(window.crypto&&crypto.subtle))return null;
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await ekKey(c.ek),new TextEncoder().encode(JSON.stringify(keysObj())));
  return {s:c.es,v:b64e(iv),c:b64e(ct)};
}
async function decKeys(kv){
  const c=C();if(!kv||!c.ek||!(window.crypto&&crypto.subtle))return null;
  try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64d(kv.v)},await ekKey(c.ek),b64d(kv.c))))}catch(e){return null}
}
/* over=false: only fill keys this device does not have. over=true: the cloud copy wins (used when the cloud data is newer). */
function mergeKeys(o,over){
  const put=(cur,v)=>v&&(over||!cur)?v:cur;
  (S.providers||[]).forEach(p=>{p.key=put(p.key,o.p&&o.p[p.id])});
  S.search=Object.assign({},S.search,{key:put(S.search&&S.search.key,o.s)});
  S.imgcfg=Object.assign({},S.imgcfg,{key:put(S.imgcfg&&S.imgcfg.key,o.i)});
  if(o.g&&(over||!(S.gh&&S.gh.token)))S.gh=Object.assign({},S.gh,{token:o.g});
}
let lastKv=null;
/* turns key sync on for this device: takes over the keys saved in the cloud (if any), adds this device's keys, uploads */
async function keysetup(pw){
  if(!(window.crypto&&crypto.subtle))throw new Error('This browser cannot encrypt keys');
  const rows=await sb('/rest/v1/orin_data?select=data'),rd=rows&&rows[0]&&rows[0].data,kv=rd&&rd.kv;
  const es=(kv&&kv.s)||b64e(crypto.getRandomValues(new Uint8Array(16)));
  const old=S.cloud;
  S.cloud=Object.assign({},old,{ek:await deriveEk(pw,es),es});
  if(kv){
    const o=await decKeys(kv);
    if(!o){S.cloud=old;throw new Error('Could not unlock the saved keys. Use the password the keys were saved with.')}
    mergeKeys(o,false);
  }
  rawSave();await push();render();
}
async function push(){
  const d=cloudData();
  /* a device that has not unlocked the keys must not erase them from the cloud: it re-sends the encrypted copy it last saw */
  const kv=await encKeys();if(kv)d.kv=lastKv=kv;else if(lastKv)d.kv=lastKv;
  await sb('/rest/v1/orin_data?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:C().session.uid,data:d,updated_at:new Date().toISOString()},strip)});
  cst='synced '+new Date().toLocaleTimeString();
}
function schedPush(){if(!C().session)return;clearTimeout(pt);pt=setTimeout(()=>push().catch(e=>{cst='error: '+e.message}),1500)}
function applyRemote(rd){
  /* keys: keep the ones on this device; only a key that an older version left in the cloud is taken over, and only when this device has none */
  const lk=new Map((S.providers||[]).map(p=>[p.id,p.key||'']));
  const withKey=(o,k)=>Object.assign({},o||{},{key:k||''});
  S.providers=(rd.providers||[]).map(p=>Object.assign({},p,{key:lk.get(p.id)||p.key||''}));
  S.search=withKey(rd.search||S.search,(S.search&&S.search.key)||(rd.search&&rd.search.key));
  S.imgcfg=withKey(rd.imgcfg||S.imgcfg,(S.imgcfg&&S.imgcfg.key)||(rd.imgcfg&&rd.imgcfg.key));
  S.chats=rd.chats||[];S.system=rd.system||'';if(rd.temp==null)delete S.temp;else S.temp=rd.temp;if(rd.autosum===false)S.autosum=false;else delete S.autosum;S.theme=rd.theme||'auto';S.repo=rd.repo||S.repo;S.repoNotes=rd.repoNotes||S.repoNotes;S.ts=rd.ts||0;
  if(!chat())S.cur=S.chats[0]?S.chats[0].id:null;
  rawSave();applyTheme();render();
  const warn=()=>{const miss=S.providers.filter(p=>p.on&&needKey(p)).length;
    if(miss)toast(miss+(miss>1?' providers need':' provider needs')+' an API key on this device (Settings → Account → Sync API keys)')};
  if(C().ek&&rd.kv)decKeys(rd.kv).then(o=>{if(o){mergeKeys(o,true);rawSave();render()}}).finally(warn);else warn();
}
async function syncNow(first){
  if(!C().session||syncing||busy)return;syncing=true;
  try{
    const rows=await sb('/rest/v1/orin_data?select=data');
    if(busy){syncing=false;return}
    const rd=rows&&rows[0]&&rows[0].data;
    if(rd&&rd.kv)lastKv=rd.kv;
    if(!rd)await push();
    else if(first){
      if(!S.providers.length||await dlg({title:'Use your cloud data?',body:'Your account already has data in the cloud.\n\nUse cloud data replaces what is on this device. Keep this device uploads this device’s data to the cloud instead.',ok:'Use cloud data',cancel:'Keep this device'}))applyRemote(rd);else await push();
      cst='synced '+new Date().toLocaleTimeString();
    }else if((rd.ts||0)>(S.ts||0)){applyRemote(rd);cst='synced '+new Date().toLocaleTimeString()}
    else if((rd.ts||0)<(S.ts||0))await push();
    else cst='synced '+new Date().toLocaleTimeString();
  }catch(e){cst='error: '+e.message}
  syncing=false;
}
const SB_URL='https://qrfetnudthvmcqslxlnp.supabase.co',SB_KEY='sb_publishable_RBh5MV6JmwMtkH9-H8fbEg_V9-Fa9Js';
let home=true,amode='in';
function showAuth(on){const a=$('auth');a.classList.toggle('on',on);if(on){$('adv').style.display=SB_KEY?'none':'block';$('au').value=SB_URL||C().url||'';$('ak').value=SB_KEY||C().anon||'';$('ae').value=C().email||''}}
function setMode(m){amode=m;$('abtn').textContent=m==='in'?'Log in':'Create account';$('aq').textContent=m==='in'?'New to Orin?':'Already have an account?';$('aswitch').textContent=m==='in'?'Create account':'Log in';$('ap').autocomplete=m==='in'?'current-password':'new-password';$('aerr').textContent=''}
async function authGo(){
  const url=(SB_URL||$('au').value).trim(),anon=(SB_KEY||$('ak').value).trim(),email=$('ae').value.trim(),pw=$('ap').value,er=$('aerr');
  if(!url||!anon||!email||!pw){er.textContent='Fill in all fields';return}
  if(amode==='up'&&pw.length<6){er.textContent='Password must be at least 6 characters';return}
  S.cloud={url,anon,email};rawSave();$('abtn').disabled=true;er.textContent='';
  try{
    const j=await sb(amode==='up'?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:pw})},false);
    if(!j.access_token){er.textContent=(j.identities&&!j.identities.length)||(j.user&&j.user.identities&&!j.user.identities.length)?'An account with this email already exists. Log in instead.':'We sent a confirmation link to your email. Confirm it, then log in.';setMode('in');return}
    setSession(j);showAuth(false);$('ap').value='';home=true;await syncNow(true);
    try{await keysetup(pw)}catch(e){toast(e.message)}
    render();
  }catch(e){er.textContent=e.message}
  finally{$('abtn').disabled=false}
}
async function logout(){
  if(!await ask('Log out?','Local data on this device will be removed. Your chats and provider list stay in the cloud, but API keys and the GitHub token are never synced, so you will need to enter them again.','Log out',true))return;
  clearTimeout(pt);clearTimeout(slT);slT=0;
  try{await push()}catch(e){if(!await ask('Cloud save failed','Your latest changes could not be saved to the cloud. Logging out now may lose them.','Log out anyway',true))return}
  const c=C();S={providers:[],chats:[],cur:null,system:'',theme:S.theme,ts:0,cloud:{url:c.url,anon:c.anon,email:c.email}};
  rawSave();applyTheme();$('sheet').classList.remove('on');closeDrawer();home=true;showAuth(true);setMode('in');render();
}
function cloudHTML(){
  const c=C();
  return '<div class="sec"><h3>Account</h3><p class="h">'+esc(c.email||'')+'<br>'+esc(cst||'ready')+'</p><p class="h">Chats, the provider list and settings sync across devices. API keys and the GitHub token sync too, but only encrypted with your account password, so the cloud cannot read them. If keys are missing on a device, press Sync API keys and enter your password.</p><div class="row" style="margin-top:0"><button class="btn sm" data-act="csync">Sync now</button><button class="btn sm" data-act="keysync">Sync API keys</button><button class="btn ghost sm" data-act="cout">Log out</button></div></div>';
}
function homeHTML(){
  const c=C(),on=S.providers.filter(p=>p.on&&p.model&&p.url),nm=(c.email||'').split('@')[0],hr=new Date().getHours();
  const gr=hr<5?'Hello':hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  /* one satellite per active provider (up to 6), spread over three rings; the first provider is the amber one */
  const sats=on.slice(0,6).map((p,i)=>{const o=i%3,dur=[17,26,37][o]+Math.floor(i/3)*6;return '<span class="ob o'+(o+1)+(i===0?' pri':'')+'" style="animation-duration:'+dur+'s;animation-delay:-'+(i*5.3).toFixed(1)+'s'+(i%2?';animation-direction:reverse':'')+'"><b></b></span>'}).join('');
  const orb='<div class="orb" aria-hidden="true"><i class="r r1"></i><i class="r r2"></i><i class="r r3"></i>'+sats+'<div class="core"><i></i></div></div>';
  const st=on.length?'<div class="hm"><i></i><span><b>'+esc(on[0].name)+'</b>'+(on.length>1?' · +'+(on.length-1)+' backup':'')+'</span></div>':'<button type="button" class="hm add" data-act="hset"><i></i><span>Add a provider to start</span></button>';
  return '<div class="home">'+orb+'<h2 class="hgreet">'+gr+(nm?', '+esc(nm):'')+'</h2><p class="hsub">Type below to start a new chat.</p>'+
  '<form class="comp hcomp" id="hform"><textarea id="hbox" rows="2" placeholder="Ask Orin anything…" aria-label="Message Orin"></textarea><div class="bar">'+st+'<span class="sp1"></span><button class="send" id="hsend" aria-label="Send" disabled>'+IC.up+'</button></div></form>'+
  '<div class="hchips">'+SUG.map((x,i)=>'<button type="button" data-hs="'+i+'">'+x[0]+'</button>').join('')+'</div></div>';
}


