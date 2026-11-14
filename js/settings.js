/* Orin · settings — settings screens, event handlers, start-up.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---------- Settings ---------- */
let editing=null,view='',spage='';
function openSheet(){view=view||'';drawSheet();$('sheet').classList.add('on')}
function settingsPages(){return{prov:['Providers & Models'],sys:['System prompt'],search:['Web search'],img:['Image generation'],gh:['GitHub'],app:['Appearance & Voice'],acct:['Account & Sync'],bk:['Backup']}}
function settingsMenu(){
  const on=S.providers.filter(p=>p.on),g=S.gh&&S.gh.token,im=S.imgcfg||{},cl=S.cloud&&S.cloud.session;
  const row=(k,ic,t,sub)=>'<button class="mrow" data-sp="'+k+'"><span class="mi">'+ic+'</span><span class="mt"><b>'+t+'</b><small>'+esc(sub)+'</small></span><span class="ar">›</span></button>';
  return gl('AI')+row('prov',ico('bot',20),'Providers & Models',S.providers.length?S.providers.length+' provider · '+(on[0]?on[0].model:'sob off'):'Kono provider nai — add koro')+
   row('sys',ico('chat',20),'System prompt',S.system.trim()?S.system.trim().slice(0,50):'Set kora nai')+
   gl('Tools')+row('search',ico('globe',20),'Web search',S.search&&S.search.key?'Chalu (Tavily)':'Key dewa nai')+
   row('img',ico('image',20),'Image generation',im.model?im.model:'Set kora nai')+
   row('gh',ico('github',20),'GitHub',g?(S.repo?S.repo.full+' · '+S.repo.branch:'Token ache, repo bechhe nai'):'Connect kora nai')+
   gl('App')+row('app',ico('palette',20),'Appearance & Voice','Theme: '+(S.theme||'auto')+' · Mic: '+({'bn-BD':'Bangla','en-US':'English','hi-IN':'Hindi'}[S.lang||'bn-BD']||''))+
   gl('Account & data')+row('acct',ico('cloud',20),'Account & Sync',cl?(S.cloud.email||'Logged in'):'Log in kora nai')+
   row('bk',ico('save',20),'Backup','Export / Import');
}
function drawSheet(){
  const b=$('sbody');$('sheet').querySelector('h1').textContent=view==='repo'?'GitHub':'Settings';
  if(view==='repo'){
    const has=!!(S.gh&&S.gh.token);
    b.innerHTML='<div class="sec"><h3>GitHub token</h3>'+(has?'<p class="h">Token save ache. Bodlate chaile notun ta paste koro. Nirapottar jonno eta cloud sync hoy na: prottek device e alada dite hobe.</p>':GH_HELP)+'<input class="f" id="gt" type="password" autocomplete="off" placeholder="ghp_…" value="'+qa((S.gh||{}).token)+'"><div class="row"><button class="btn sm" data-act="gsave">'+(has?'Reload repos':'Connect')+'</button></div></div>'+
    (has&&S.repo?'<div class="sec"><h3>'+esc(S.repo.full)+'</h3><div class="row"><button class="btn sm ghost" data-act="rsub" data-sub="hist">'+ico('hist',15)+'History</button><button class="btn sm ghost" data-act="rsub" data-sub="files">'+ico('clip',15)+'File attach</button></div><div id="rsub">'+subHTML()+'</div></div>':'')+
    (has?'<div class="sec"><h3>Repo bechhe nao</h3>'+(S.repo?'<p class="h">Ekhon: <b>'+esc(S.repo.full)+'</b> · '+esc(S.repo.branch)+' <button class="chip" data-act="rclear">Bondho koro</button></p>':'')+(S.repo?'<label>Branch</label><div id="rbw">'+branchHTML()+'</div><label>Repo</label>':'')+'<input class="f" id="rq" placeholder="Search repo…" value="'+qa(rfilter)+'"><div id="rl" style="margin-top:6px">'+repoListHTML()+'</div></div>'+
    '<div class="sec"><h3>Notun repo banao</h3><label>Name</label><input class="f" id="nn" placeholder="my-project"><label>Description (optional)</label><input class="f" id="nd"><label><input type="checkbox" id="np" checked> Private</label><div class="row"><button class="btn sm" data-act="rnew">Create repo</button></div></div>':'');
    const gt=$('gt');if(gt)gt.oninput=()=>{S.gh={token:gt.value.trim()};save()};
    if(has&&ghRepos===undefined)loadRepos();
    if(has&&S.repo&&(!ghBr||ghBr.repo!==S.repo.full))loadBranches();
    return;
  }
  if(editing){
    const p=editing;
    b.innerHTML='<div class="sec"><h3>'+(p._new?'Add provider':'Edit provider')+'</h3>'+
    (p._new?'<label>Quick fill</label><div class="chips">'+PRESETS.map((x,i)=>'<button type="button" class="chip" data-preset="'+i+'">'+x[0]+'</button>').join('')+'</div>':'')+
    '<label>Name</label><input class="f" id="pn" value="'+esc(p.name||'')+'">'+
    '<label>Format</label><select class="f" id="pt"><option value="openai">OpenAI-compatible (most providers)</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option></select>'+
    '<label>Base URL</label><input class="f" id="pu" value="'+esc(p.url||'')+'" placeholder="https://…/v1">'+
    '<label>API key</label><input class="f" id="pk" type="password" value="'+esc(p.key||'')+'" autocomplete="off">'+
    '<label>Model name</label><input class="f" id="pm" value="'+esc(p.model||'')+'" placeholder="e.g. llama-3.3-70b-versatile">'+
    '<label>Context window (tokens, optional)</label><input class="f" id="pcx" inputmode="numeric" placeholder="auto: Gemini 1M · Claude 200k · baki 128k" value="'+qa(p.ctx||'')+'">'+
    '<label>Price per 1M input tokens $ (optional)</label><input class="f" id="pci" inputmode="decimal" value="'+qa(p.pin||'')+'">'+
    '<label>Price per 1M output tokens $ (optional)</label><input class="f" id="pco" inputmode="decimal" value="'+qa(p.pout||'')+'">'+
    '<div class="row"><button class="btn" data-act="psave">Save</button><button class="btn ghost" data-act="pcancel">Cancel</button>'+(p._new?'':'<button class="btn danger" data-rmed="1">Delete</button>')+'</div></div>';
    $('pt').value=p.type||'openai';return;
  }
  const SP=settingsPages();
  if(!spage||!SP[spage]){$('sheet').querySelector('h1').textContent='Settings';b.innerHTML=settingsMenu();return}
  $('sheet').querySelector('h1').textContent=SP[spage][0];
  if(spage==='prov')b.innerHTML='<div class="sec"><h3>Providers</h3><p class="h">Upor theke nichey order e try hobe. Fail korle porer ta.</p>'+
   (S.providers.map((p,i)=>'<div class="pr '+(p.on?'':'off')+'"><span class="rk">'+(i+1)+'</span><div class="n"><b>'+esc(p.name)+'</b><small>'+esc(p.model)+(needKey(p)?' · <span class="nk">key nai</span>':'')+'</small></div>'+
   '<div class="mv"><button class="sm-ib" data-up="'+i+'" aria-label="Move up">'+IC.cup+'</button><button class="sm-ib" data-dn="'+i+'" aria-label="Move down">'+IC.cdn+'</button></div>'+
   '<button class="tgl '+(p.on?'on':'')+'" data-tg="'+i+'" role="switch" aria-checked="'+(p.on?'true':'false')+'" aria-label="Enabled"></button><button class="sm-ib" data-ed="'+i+'" aria-label="Edit">'+IC.edit+'</button></div>').join('')||'<p class="h">Kono provider nai.</p>')+
   '<div class="row"><button class="btn" data-act="padd">+ Add provider</button></div></div>';
  else if(spage==='sys')b.innerHTML='<div class="sec"><h3>System prompt</h3><p class="h">Prothom e AI ke ki bole dibe (optional). Shob chat e lagbe.</p><textarea class="f" id="sp" rows="8">'+esc(S.system)+'</textarea></div>';
  else if(spage==='search')b.innerHTML=webHTML();
  else if(spage==='img')b.innerHTML=imgHTML();
  else if(spage==='gh')b.innerHTML=ghHTML();
  else if(spage==='app')b.innerHTML=themeHTML()+voiceHTML();
  else if(spage==='acct')b.innerHTML=cloudHTML();
  else if(spage==='bk')b.innerHTML='<div class="sec"><h3>Backup</h3><p class="h">Provider, key ar chat ekta file e save kore onno device e import korte paro.</p><div class="row" style="margin-top:0"><button class="btn ghost sm" data-act="exp">Export</button><button class="btn ghost sm" data-act="imp">Import</button></div><p class="h" style="margin-top:10px">API key shudhu ei browser e save thake. Backup file onno kauke dio na.</p></div>';
  const sp=$('sp');if(sp)sp.oninput=()=>{S.system=sp.value;save()};
  const gt2=$('gt');if(gt2)gt2.oninput=()=>{S.gh={token:gt2.value.trim()};save()};
  const tk=$('tk');if(tk)tk.oninput=()=>{S.search={key:tk.value.trim()};save()};
  ['iu','ik','im','is'].forEach((id,n)=>{const e=$(id);if(e)e.oninput=()=>{S.imgcfg=Object.assign({},S.imgcfg,{[['url','key','model','size'][n]]:e.value.trim()});save()}});
}
function readForm(){return{name:$('pn').value.trim(),type:$('pt').value,url:$('pu').value.trim(),key:$('pk').value.trim(),model:$('pm').value.trim(),ctx:parseInt($('pcx').value,10)||0,pin:parseFloat($('pci').value)||0,pout:parseFloat($('pco').value)||0}}

document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;const d=t.dataset;
  if(d.open){S.cur=d.open;home=false;save();closeDrawer();render()}
  else if(d.sdel){if(!confirm('Ei chat ta delete korbe?'))return;S.chats=S.chats.filter(c=>c.id!==d.sdel);if(S.cur===d.sdel)S.cur=S.chats[0]?.id||null;save();renderList();render()}
  else if(d.del){closePop();if(!confirm('Ei chat ta delete korbe?'))return;S.chats=S.chats.filter(c=>c.id!==d.del);if(S.cur===d.del)S.cur=S.chats[0]?.id||null;save();renderList();render()}
  else if(d.rmp!==undefined){pend.splice(+d.rmp,1);renderTray()}
  else if(d.add){closePop();$(d.add).click()}
  else if(d.pk!==undefined){S.pick=d.pk==='auto'?null:d.pk;rawSave();closePop();updatePill()}
  else if(d.lang){S.lang=d.lang;rawSave();drawSheet()}
  else if(d.dv!==undefined){dview[d.dv]=!dview[d.dv];render();if(dview[d.dv]){const c=chat(),f=c&&c.draft&&c.draft.files[d.dv];if(f&&f.ex&&!(okey(c.draft,d.dv) in origC))loadOrig(c.draft,d.dv).then(render)}}
  else if(d.fx!==undefined){const c=chat();if(c&&c.draft){delete c.draft.files[d.fx];if(!Object.keys(c.draft.files).length)c.draft=null;save();render()}}
  else if(d.act==='gdep'){const c=chat();if(c&&c.pushed&&c.pushed.dep)watchDeploy(c,c.pushed.repo,c.pushed.dep.sha,c.pushed.branch,true)}
  else if(d.act==='gdepfix'){const c=chat();if(c&&c.pushed&&c.pushed.dep&&!busy){const u=c.pushed;$('box').value='GitHub Actions e deploy fail hoyeche'+(u.dep.run?' (run #'+u.dep.run+')':'')+'. get_actions_log diye log poro, asol karon khuje fix koro.';send()}}
  else if(d.pm){S.pushMode=d.pm==='pr'?'pr':'direct';rawSave();render()}
  else if(d.act==='gmerge'){const c=chat();if(c)prAct(c,'merge')}
  else if(d.act==='gclose'){const c=chat();if(c)prAct(c,'close')}
  else if(d.cc){const code=t.parentElement.querySelector('code');if(code)copyText(code.textContent).then(()=>{t.textContent='Copied';setTimeout(()=>{t.textContent='Copy'},1200)})}
  else if(d.rp){const r=(Array.isArray(ghRepos)?ghRepos:[]).find(x=>x.full_name===d.rp);if(!r)return;
    const c=chat();if(c&&dcount(c)&&c.draft.repo!==r.full_name){if(!confirm('Ei chat er draft muche jabe. Repo bodlabe?'))return;c.draft=null}
    S.repo={full:r.full_name,branch:r.default_branch||'main'};ghTree=null;save();view='';$('sheet').classList.remove('on');render();toast('Repo: '+r.full_name)}
  else if(d.act==='ropen'){closePop();editing=null;view='repo';openSheet()}
  else if(d.act==='gsave'){const g=$('gt');if(g)S.gh={token:g.value.trim()};ghRepos=undefined;ghTree=null;save();drawSheet()}
  else if(d.act==='rsub'){rsub=rsub===d.sub?'':d.sub;if(rsub==='hist')loadHist();if(rsub==='files')loadFiles();drawSheet()}
  else if(d.hrest){restoreTo(d.hrest)}
  else if(d.fatt!==undefined){
    if(pend.length>=10){toast('Max 10 ta file');return}
    readFull(chat()||{draft:null},d.fatt).then(tx=>{pend.push({kind:'text',name:d.fatt.split('/').pop(),text:tx.slice(0,MAXF),size:tx.length,tok:etok(tx)});renderTray();view='';$('sheet').classList.remove('on');render();toast('Attach hoyeche: '+d.fatt)}).catch(e=>toast(e.message));
  }
  else if(d.act==='rclear'){S.repo=null;ghTree=null;save();if(view==='repo')drawSheet();render()}
  else if(d.act==='rnew'){const n=$('nn').value.trim();if(!/^[A-Za-z0-9._-]{1,100}$/.test(n)){toast('Repo name e shudhu english okkhor, number, - _ . cholbe');return}
    t.disabled=true;gh('/user/repos',{method:'POST',body:{name:n,description:$('nd').value.trim().slice(0,300),private:$('np').checked,auto_init:true}}).then(j=>{S.repo={full:j.full_name,branch:j.default_branch||'main'};ghTree=null;ghRepos=undefined;const c=chat();if(c)c.draft=null;save();view='';$('sheet').classList.remove('on');render();toast('Repo banano hoyeche: '+j.full_name)}).catch(e=>{t.disabled=false;toast(e.message)})}
  else if(d.act==='gpush'){const c=chat();if(c){const iss=checkDraft(c);if(iss.length&&!confirm('Push er age somossha pawa geche:\n\n'+iss.slice(0,6).join('\n')+'\n\nTobu push korbe?'))return;pushDraft(c)}}
  else if(d.act==='pview'){const c=chat();if(c&&c.draft)openPreview(c)}
  else if(d.act==='gundo'){const c=chat();if(c)undoPush(c)}
  else if(d.act==='plok'){const c=chat();if(c&&c.plan&&!busy){c.plan.ok=true;if(c.plan.steps.length)c.tasks=c.plan.steps.map(x=>({t:x,done:false}));save();$('box').value='Plan OK, kaj shuru koro.';send()}}
  else if(d.act==='tkclr'){const c=chat();if(c){c.tasks=null;save();render()}}
  else if(d.act==='plno'){const c=chat();if(c){c.plan=null;save();render();$('box').focus();toast('Ki bodlate chao likho')}}
  else if(d.plm){S.planMode=d.plm;save();drawSheet()}
  else if(d.act==='gdisc'){const c=chat();if(c&&confirm('Draft discard korbe?')){c.draft=null;save();render()}}
  else if(d.ipre!==undefined){const x=IMGP[+d.ipre];S.imgcfg=Object.assign({},S.imgcfg,{url:x[1],model:x[2],size:x[3]});save();drawSheet()}
  else if(d.save){const m=chat().msgs[+d.save];if(m&&m.pic){const a=document.createElement('a');a.href=m.pic;a.download='orin-image.jpg';a.target='_blank';a.rel='noopener';a.click()}}
  else if(d.more){const c=S.chats.find(x=>x.id===d.more);pop(t,'<button class="pi" data-pin="'+d.more+'"><span>'+ico('pin',15)+(c&&c.pin?'Unpin':'Pin')+'</span></button><button class="pi" data-ren="'+d.more+'"><span>'+ico('edit',15)+'Rename</span></button><button class="pi" data-del="'+d.more+'"><span>'+ico('trash',15)+'Delete</span></button>')}
  else if(d.pin){closePop();const c=S.chats.find(x=>x.id===d.pin);if(c){c.pin=!c.pin;save();renderList()}}
  else if(d.ren){closePop();const c=S.chats.find(x=>x.id===d.ren);const n=c&&prompt('Chat er naam',c.title);if(n&&n.trim()){c.title=n.trim().slice(0,60);save();renderList();render()}}
  else if(d.regen)regen()
  else if(d.edit!==undefined)editMsg(+d.edit)
  else if(d.copy){copyText(chat().msgs[+d.copy].content).then(()=>toast('Copied'))}
  else if(d.preset){const x=PRESETS[+d.preset];editing=Object.assign(readForm(),{_new:true,name:x[0],type:x[1],url:x[2]});drawSheet()}
  else if(d.up!==undefined||d.dn!==undefined){const i=+(d.up??d.dn),j=d.up!==undefined?i-1:i+1;if(S.providers[j]){[S.providers[i],S.providers[j]]=[S.providers[j],S.providers[i]];save();drawSheet()}}
  else if(d.tg){S.providers[+d.tg].on=!S.providers[+d.tg].on;save();drawSheet()}
  else if(d.ed){editing=Object.assign({},S.providers[+d.ed],{_idx:+d.ed});drawSheet()}
  else if(d.rmed){if(confirm('Delete this provider?')){S.providers.splice(editing._idx,1);editing=null;save();drawSheet()}}
  else if(d.sug!==undefined){const x=SUG[+d.sug];if(home||!chat())newChat();const b=$('box');b.value=x[2];b.dispatchEvent(new Event('input'));b.focus();b.setSelectionRange(b.value.length,b.value.length)}
  else if(d.rm){if(confirm('Delete this provider?')){S.providers.splice(+d.rm,1);save();drawSheet()}}
  else if(d.theme){S.theme=d.theme;save();applyTheme();drawSheet()}
  else if(d.act==='padd'){editing={_new:true,type:'openai'};drawSheet()}
  else if(d.act==='pcancel'){editing=null;drawSheet()}
  else if(d.act==='psave'){const f=readForm();if(!f.name||!f.url||!f.model){toast('Name, URL ar model dorkar');return}
    if(editing._new)S.providers.push(Object.assign({id:uid(),on:true},f));else Object.assign(S.providers[editing._idx],f);
    editing=null;save();drawSheet();toast('Saved')}
  else if(d.act==='csync')syncNow().then(drawSheet)
  else if(d.act==='cout')logout()
  else if(d.act==='hnew')newChat()
  else if(d.sp){spage=d.sp;editing=null;drawSheet();$('sbody').scrollTop=0}
  else if(d.act==='hset'){editing=null;view='';spage=S.providers.length?'':'prov';openSheet()}
  else if(d.act==='exp'){const a=document.createElement('a');const ex=JSON.parse(JSON.stringify(Object.assign({},S,{cloud:undefined}),strip));ex.chats.forEach(c=>c.msgs.forEach(m=>(m.files||[]).forEach(f=>{if(f.id&&f.text===undefined&&FT.has(f.id))f.text=FT.get(f.id)})));a.href=URL.createObjectURL(new Blob([JSON.stringify(ex)],{type:'application/json'}));a.download='orin-backup.json';a.click()}
  else if(d.act==='imp'){const i=document.createElement('input');i.type='file';i.accept='.json';i.onchange=()=>i.files[0].text().then(x=>{try{S=Object.assign(S,JSON.parse(x));S.chats.forEach(c=>c.msgs.forEach(m=>(m.files||[]).forEach(f=>{if(f.id&&f.text!==undefined){fput(f.id,f.text);delete f.text}})));save();applyTheme();drawSheet();render();toast('Imported')}catch(_){toast('Invalid file')}});i.click()}
});
$('pvx').innerHTML=IC.x;$('pvx').onclick=()=>{$('pv').classList.remove('on');$('pvf').srcdoc=''};
$('pvr').onclick=()=>{if(pvc&&pvc.draft)openPreview(pvc,pvEntry)};
$('pvd').onclick=()=>{pvMode=(pvMode+1)%3;const w=[['Phone','390px'],['Tablet','768px'],['Desktop','100%']][pvMode];$('pvd').textContent=w[0];$('pvf').style.width=w[1]};$('pvf').style.width='390px';
$('pve').addEventListener('click',e=>{if(e.target.closest('#pvs')){const t='Preview te ei error gulo ashche, fix koro:\n- '+pvErrs.slice(0,8).join('\n- ');$('pvx').click();$('box').value=t;if(!busy)send()}});
$('fdir').onchange=e=>{addDir([...e.target.files]);e.target.value=''};
['fi','fimg','fcam'].forEach(id=>{$(id).onchange=e=>{addFiles([...e.target.files]);e.target.value=''}});
$('plus').onclick=e=>pop(e.currentTarget,'<button class="pi" data-add="fimg"><span>'+ico('image',16)+'Photos</span></button><button class="pi" data-add="fcam"><span>'+ico('camera',16)+'Camera</span></button><button class="pi" data-add="fi"><span>'+ico('file',16)+'Files / zip / Word / Excel</span></button><button class="pi" data-add="fdir"><span>'+ico('folder',16)+'Folder</span></button><button class="pi" data-act="ropen"><span>'+ico('box',16)+'GitHub repo</span></button>');
$('modelb').onclick=e=>pop(e.currentTarget,modelMenu());
$('mic').onclick=toggleMic;
$('tobot').onclick=()=>{const m=$('msgs');m.scrollTo({top:m.scrollHeight,behavior:'smooth'})};
$('msgs').addEventListener('scroll',updateFab,{passive:true});addEventListener('resize',updateFab);
(()=>{const W=144,L=$('clist');let row=null,open=null,sx=0,sy=0,base=0,mode=0,swiped=0,sr=null;
  const close=r=>{if(r){r.classList.remove('drag');r.style.transform='';r.dataset.o='';const w=r.parentElement;setTimeout(()=>{if(!r.dataset.o)w.classList.remove('act')},220)}};
  L.addEventListener('pointerdown',e=>{const r=e.target.closest('.ci');if(!r)return;if(open&&open!==r){close(open);open=null}row=r;sx=e.clientX;sy=e.clientY;base=r.dataset.o?-W:0;mode=0});
  L.addEventListener('pointermove',e=>{if(!row)return;const dx=e.clientX-sx,dy=e.clientY-sy;
    if(!mode){if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.3){mode=1;try{row.setPointerCapture(e.pointerId)}catch(_){}}else if(Math.abs(dy)>8)mode=2}
    if(mode===1){row.parentElement.classList.add('act');row.classList.add('drag');row.style.transform='translateX('+Math.max(-W,Math.min(0,base+dx))+'px)'}});
  const end=e=>{if(!row)return;const r=row;row=null;if(mode!==1)return;const x=Math.max(-W,Math.min(0,base+(e.clientX-sx)));r.classList.remove('drag');
    if(x<-W/2){r.style.transform='translateX('+(-W)+'px)';r.dataset.o='1';open=r}else{close(r);if(open===r)open=null}
    swiped=Date.now();sr=r};
  L.addEventListener('pointerup',end);L.addEventListener('pointercancel',end);
  L.addEventListener('click',e=>{const r=e.target.closest('.ci');if(!r)return;const fresh=r===sr&&Date.now()-swiped<350;if(fresh||r.dataset.o){e.stopPropagation();e.preventDefault();if(!fresh){close(r);open=null}}},true);
})();
$('dclose').onclick=closeDrawer;$('dset').onclick=()=>{closeDrawer();editing=null;view='';spage='';openSheet()};
$('webb').onclick=()=>{S.web=!S.web;rawSave();updateModes();toast(S.web?(S.search&&S.search.key?'Web search ON':'Web search ON. Settings e Tavily key dao'):'Web search OFF')};
$('imgb').onclick=()=>{imgMode=!imgMode;updateModes();toast(imgMode?(imgReady()?'Image mode ON':'Image mode ON. Settings e image provider dao'):'Image mode OFF')};
document.addEventListener('input',e=>{const t=e.target;if(t.id==='fq'){fq=t.value;if($('fl'))$('fl').innerHTML=fileListHTML();return}
  if(t.classList&&t.classList.contains('pb')){const c=chat();if(c&&c.draft){c.draft.prBody=t.value;rawSave()}}
  if(t.classList&&t.classList.contains('cm')){const c=chat();if(c&&c.draft){c.draft.msg=t.value;rawSave()}}
  else if(t.id==='rq'){rfilter=t.value.toLowerCase();const l=$('rl');if(l)l.innerHTML=repoListHTML()}});
$('cq').oninput=e=>{q=e.target.value.toLowerCase();renderList()};
$('menu').onclick=openDrawer;$('homeb').onclick=()=>{home=true;closeDrawer();render()};$('aswitch').onclick=()=>setMode(amode==='in'?'up':'in');$('abtn').onclick=authGo;$('ov').onclick=closeDrawer;
$('newc').onclick=$('newc2').onclick=newChat;
$('gear').onclick=()=>{editing=null;view='';spage='';openSheet()};
$('back').onclick=()=>{if(view){view='';$('sheet').classList.remove('on');render();return}if(editing){editing=null;drawSheet()}else if(spage){spage='';drawSheet()}else{$('sheet').classList.remove('on');updatePill()}};
$('form').onsubmit=e=>{e.preventDefault();if(busy){stopped=true;if(curCtl)curCtl.abort()}else send()};
$('box').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229&&window.innerWidth>700){e.preventDefault();send()}});
let tr=0;$('box').addEventListener('input',e=>{if(tr)return;tr=requestAnimationFrame(()=>{tr=0;const b=e.target;b.style.height='auto';b.style.height=Math.min(b.scrollHeight,140)+'px'})});
$('box').addEventListener('paste',e=>{const fs=[...((e.clipboardData&&e.clipboardData.files)||[])].filter(f=>/^image\//.test(f.type)||f.type==='application/pdf');if(fs.length){e.preventDefault();addFiles(fs)}});
document.addEventListener('dragover',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files'))e.preventDefault()});
document.addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files.length&&!home){e.preventDefault();addFiles([...e.dataTransfer.files])}});
initIcons();applyTheme();render();updateModes();
fload().then(()=>{fclean();render()});
setMode('in');
if(!C().session)showAuth(true);else syncNow(false);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncNow(false)});
try{if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js')}catch(e){}
