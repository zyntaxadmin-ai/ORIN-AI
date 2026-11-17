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
  S.chats=rd.chats||[];S.system=rd.system||'';if(rd.temp==null)delete S.temp;else S.temp=rd.temp;if(rd.autosum===false)S.autosum=false;else delete S.autosum;S.theme=rd.theme||'auto';S.repo=rd.repo||S.repo;S.repoNotes=rd.repoNotes||S.repoNotes;S.ts=rd.ts||0;
  if(!chat())S.cur=S.chats[0]?S.chats[0].id:null;
  rawSave();applyTheme();render();
  const miss=S.providers.filter(p=>p.on&&needKey(p)).length;
  if(miss)toast(miss+(miss>1?' providers need':' provider needs')+' an API key on this device (Settings → Providers)');
}
async function syncNow(first){
  if(!C().session||syncing||busy)return;syncing=true;
  try{
    const rows=await sb('/rest/v1/orin_data?select=data');
    if(busy){syncing=false;return}
    const rd=rows&&rows[0]&&rows[0].data;
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
    setSession(j);showAuth(false);$('ap').value='';home=true;await syncNow(true);render();
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
  return '<div class="sec"><h3>Account</h3><p class="h">'+esc(c.email||'')+'<br>'+esc(cst||'ready')+'</p><p class="h">Chats, the provider list and settings sync across devices. API keys and the GitHub token never sync, for security: enter them once on each new device.</p><div class="row" style="margin-top:0"><button class="btn sm" data-act="csync">Sync now</button><button class="btn ghost sm" data-act="cout">Log out</button></div></div>';
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


