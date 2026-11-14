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
const cloudData=()=>({providers:(S.providers||[]).map(noKey),chats:S.chats,system:S.system,theme:S.theme,search:noKey(S.search),imgcfg:noKey(S.imgcfg),repo:S.repo,repoNotes:S.repoNotes,ts:S.ts||Date.now()});
const needKey=p=>!p.key&&!/^https?:\/\/(localhost|127\.|10\.|192\.168\.|\[::1\])/i.test(p.url||'');
async function push(){
  const d=cloudData();
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
  S.chats=rd.chats||[];S.system=rd.system||'';S.theme=rd.theme||'auto';S.repo=rd.repo||S.repo;S.repoNotes=rd.repoNotes||S.repoNotes;S.ts=rd.ts||0;
  if(!chat())S.cur=S.chats[0]?S.chats[0].id:null;
  rawSave();applyTheme();render();
  const miss=S.providers.filter(p=>p.on&&needKey(p)).length;
  if(miss)toast(miss+' ta provider er API key ei device e dao (Settings → Providers)');
}
async function syncNow(first){
  if(!C().session||syncing||busy)return;syncing=true;
  try{
    const rows=await sb('/rest/v1/orin_data?select=data');
    if(busy){syncing=false;return}
    const rd=rows&&rows[0]&&rows[0].data;
    if(!rd)await push();
    else if(first){
      if(!S.providers.length||confirm('Cloud e data ache. OK = ei device er data replace hobe. Cancel = ei device er data cloud e jabe.'))applyRemote(rd);else await push();
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
function setMode(m){amode=m;$('abtn').textContent=m==='in'?'Log in':'Create account';$('aq').textContent=m==='in'?'Account nai?':'Account ache?';$('aswitch').textContent=m==='in'?'Create account':'Log in';$('ap').autocomplete=m==='in'?'current-password':'new-password';$('aerr').textContent=''}
async function authGo(){
  const url=(SB_URL||$('au').value).trim(),anon=(SB_KEY||$('ak').value).trim(),email=$('ae').value.trim(),pw=$('ap').value,er=$('aerr');
  if(!url||!anon||!email||!pw){er.textContent='Sob ghor puron koro';return}
  if(amode==='up'&&pw.length<6){er.textContent='Password kompokkhe 6 okkhor';return}
  S.cloud={url,anon,email};rawSave();$('abtn').disabled=true;er.textContent='';
  try{
    const j=await sb(amode==='up'?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:pw})},false);
    if(!j.access_token){er.textContent=(j.identities&&!j.identities.length)||(j.user&&j.user.identities&&!j.user.identities.length)?'Ei email e account ache. Log in koro.':'Email e confirm link pathano hoyeche. Confirm kore Log in koro.';setMode('in');return}
    setSession(j);showAuth(false);$('ap').value='';home=true;await syncNow(true);render();
  }catch(e){er.textContent=e.message}
  finally{$('abtn').disabled=false}
}
async function logout(){
  if(!confirm('Log out korbe? Ei device theke local data muche jabe. Chat ar provider list cloud e save thakbe, kintu API key ar GitHub token cloud e thake na: seguloo muche jabe, abar dite hobe.'))return;
  clearTimeout(pt);
  try{await push()}catch(e){if(!confirm('Cloud e save hoy nai. Tobu logout korbe? Data hariye jete pare.'))return}
  const c=C();S={providers:[],chats:[],cur:null,system:'',theme:S.theme,ts:0,cloud:{url:c.url,anon:c.anon,email:c.email}};
  rawSave();applyTheme();$('sheet').classList.remove('on');closeDrawer();home=true;showAuth(true);setMode('in');render();
}
function cloudHTML(){
  const c=C();
  return '<div class="sec"><h3>Account</h3><p class="h">'+esc(c.email||'')+'<br>'+esc(cst||'ready')+'</p><p class="h">Chat, provider list ar settings sync hoy. API key ar GitHub token sync hoy na (nirapottar jonno): notun device e ekbar dite hobe.</p><div class="row" style="margin-top:0"><button class="btn sm" data-act="csync">Sync now</button><button class="btn ghost sm" data-act="cout">Log out</button></div></div>';
}
function homeHTML(){
  const c=C(),on=S.providers.filter(p=>p.on&&p.model&&p.url),nm=(c.email||'').split('@')[0];
  const rec=S.chats.slice().sort((a,b)=>(b.t||0)-(a.t||0)).slice(0,6);
  return '<div class="home"><div class="hero"><div class="logo"><i></i></div><h2>Hello, '+esc(nm)+'</h2><p>Ki niye kaj korbo ajke?</p></div><button class="btn" data-act="hnew">+ New chat</button>'+sugHTML()+
  (on.length?'<div class="prv"><i></i><span><b>'+esc(on[0].name)+'</b> · '+esc(on[0].model)+(on.length>1?' · +'+(on.length-1)+' fallback':'')+'</span></div>':'<button class="prv" data-act="hset">Provider add koro →</button>')+
  (rec.length?'<h3 class="gl2">Recent chats</h3>'+rec.map(x=>'<button class="rc" data-open="'+x.id+'">'+esc(x.title)+'</button>').join(''):'')+
  '<div class="row" style="justify-content:center;margin-top:20px"><button class="btn ghost sm" data-act="hset">Settings</button><button class="btn ghost sm" data-act="cout">Log out</button></div></div>';
}

