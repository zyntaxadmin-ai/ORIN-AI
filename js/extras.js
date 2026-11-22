/* Orin · extras — things that make long agent runs comfortable:
   keep working in the background, notifications, memory, extra GitHub tools (branch, re-run, dispatch),
   fetch_url, site check after a deploy, chat export/import.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */

/* ---------- Keep working while the app is in the background ---------- */
let wlock=null,bgOn=false,bgT0=0;
async function wakeLock(on){
  try{
    if(on&&!wlock&&navigator.wakeLock&&!document.hidden){wlock=await navigator.wakeLock.request('screen');wlock.addEventListener('release',()=>{wlock=null})}
    else if(!on&&wlock){const w=wlock;wlock=null;await w.release()}
  }catch(e){wlock=null}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&bgOn)wakeLock(true)});
/* called by setBusyUI(): a reply or an agent run starts (on) or ends (off) */
function bgBusy(on){
  const was=bgOn;bgOn=!!on;
  wakeLock(on);
  if(typeof nativeKeepAlive==='function')nativeKeepAlive(on);
  try{if(on){if(!was)bgT0=Date.now();localStorage.setItem('orin-run',JSON.stringify({id:S.cur,t:Date.now()}))}else localStorage.removeItem('orin-run')}catch(e){}
  if(!on&&was)bgFinished();
}
/* a run that took a while ended while the app was in the background: tell the user */
function bgFinished(){
  if(!document.hidden||Date.now()-bgT0<15000)return;
  const cfg=cnGet('notify'),c=chat(),title='Orin',body=((c&&c.title)||'Chat')+': your reply is ready';
  if(cfg.auto!==false)notifyLocal(title,body,false);
  if(cfg.topic)ntfySend(title,body,cfg).catch(()=>{});
}
async function notifyLocal(title,body,askPerm){
  if(typeof NATIVE!=='undefined'&&NATIVE&&typeof nativeNotify==='function')return nativeNotify(title,body);
  if(!('Notification' in window))return false;
  let p=Notification.permission;
  if(p==='default'&&askPerm)p=await Notification.requestPermission();
  if(p!=='granted')return false;
  try{const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();if(reg&&reg.showNotification){await reg.showNotification(title,{body,icon:'icon-192.png',tag:'orin'});return true}}catch(e){}
  try{new Notification(title,{body,icon:'icon-192.png'});return true}catch(e){return false}
}
/* the app was closed (or the phone killed it) while a reply was running: say so, with a Retry button */
(function(){
  try{
    const r=JSON.parse(localStorage.getItem('orin-run')||'null');localStorage.removeItem('orin-run');if(!r)return;
    const c=S.chats.find(x=>x.id===r.id),l=c&&c.msgs[c.msgs.length-1];
    if(l&&l.role==='user'){c.msgs.push({role:'error',content:'This reply was interrupted because the app was closed or put to sleep by the phone. Tap Retry to run it again.'});rawSave()}
  }catch(e){}
})();

/* ---------- Memory: short notes the assistant keeps across all chats ---------- */
const MEM_MAX=40;
const memList=()=>Array.isArray(S.mem)?S.mem:[];
function memNote(){
  const l=memList();if(!l.length)return '';
  return '\n[Memory: things the user asked you to remember. Use them quietly, do not mention this list.]\n'+l.map((m,i)=>(i+1)+'. '+m.t).join('\n');
}
function memAdd(t){
  t=String(t||'').replace(/\s+/g,' ').trim().slice(0,300);if(!t)throw new Error('note is empty');
  const l=memList();if(l.some(m=>m.t.toLowerCase()===t.toLowerCase()))return false;
  S.mem=l.concat([{t,ts:Date.now()}]).slice(-MEM_MAX);save();return true;
}
function memPage(){
  const l=memList();
  return '<div class="sec"><h3>Memory</h3><p class="h">Short notes the assistant knows in every chat (your name, how you like answers, your usual stack). The assistant can add notes itself when you say "remember …". Synced with your account.</p>'+
   (l.map((m,i)=>'<div class="pr"><div class="n"><b style="font-weight:500">'+esc(m.t)+'</b></div><button class="chip" data-mem="del" data-i="'+i+'">Delete</button></div>').join('')||'<p class="h">Nothing remembered yet.</p>')+
   '<label>Add a note</label><input class="f" id="memin" maxlength="300" placeholder="e.g. I deploy everything on Vercel"><div class="row"><button class="btn sm" data-mem="add">Add</button>'+(l.length?'<button class="btn sm ghost" data-mem="clear">Clear all</button>':'')+'</div></div>';
}

/* ---------- Reading web pages ---------- */
function xText(html){
  try{
    const d=new DOMParser().parseFromString(html,'text/html');
    d.querySelectorAll('script,style,noscript,svg,iframe,template').forEach(e=>e.remove());
    d.querySelectorAll('p,div,br,li,h1,h2,h3,h4,h5,h6,tr,section,article,pre').forEach(e=>e.append('\n'));
    return ((d.title?'Title: '+d.title+'\n\n':'')+(d.body?d.body.textContent:'')).replace(/[ \t]+/g,' ').replace(/\n\s*\n\s*\n+/g,'\n\n').trim();
  }catch(e){return html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}
}
const xUrl=u=>{u=String(u||'').trim();if(!/^https?:\/\/[^\s]+$/i.test(u))throw new Error('url must start with http:// or https://');return u};
async function fetchUrl(url,start){
  url=xUrl(url);let text='',via='directly';
  try{
    const r=await cnHttp(url,{headers:{Accept:'text/html,text/plain,application/json,*/*'},timeout:25000});
    if(!r.ok)throw new Error('The site answered '+r.status);
    text=/html/i.test(r.headers['content-type']||'')||/^\s*<(!doctype|html)/i.test(r.text)?xText(r.text):r.text;
  }catch(e){
    if(!/network|CORS|blocks browser/i.test(e.message))throw e;
    /* a browser may not read other sites directly: use a reader service that fetches the page for us */
    const j=await cnHttp('https://r.jina.ai/'+url,{headers:{Accept:'text/plain'},timeout:30000});
    if(!j.ok)throw new Error('Could not read the page ('+j.status+')');
    text=j.text;via='through a reader service';
  }
  const s=Math.max(0,parseInt(start,10)||0),out=text.slice(s,s+14000);
  return 'Page '+url+' (read '+via+', '+text.length+' characters)'+(s?', from character '+s:'')+':\n\n'+out+(text.length>s+14000?'\n\n[... more: call fetch_url again with start='+(s+14000)+']':'');
}

/* ---------- Is the live site really working? ---------- */
const BAD_PAGE=/(404|page not found|not found|application error|something went wrong|internal server error|bad gateway|service unavailable|deployment (has )?(not found|failed)|there isn.t a github pages site here)/i;
async function siteCheck(url){
  url=xUrl(url);const L=[];let ok=true;
  let r=null;
  try{r=await cnHttp(url,{headers:{Accept:'text/html,*/*'},timeout:25000})}catch(e){r=null}
  if(!r){
    /* browser blocks reading the site: a reader service can still tell if the page has real content */
    try{
      const j=await cnHttp('https://r.jina.ai/'+url,{headers:{Accept:'text/plain'},timeout:30000}),t=j.text||'';
      L.push('The browser cannot read this site directly, so the page was read through a reader service (no status code or file checks).');
      L.push('Text on the page: '+t.length+' characters');
      if(!j.ok){ok=false;L.push('The reader got status '+j.status)}
      const m=BAD_PAGE.exec(t.slice(0,1500));if(m){ok=false;L.push('The page looks like an error page ("'+m[0]+'")')}
      if(t.trim().length<40){ok=false;L.push('The page is almost empty')}
    }catch(e){ok=false;L.push('Could not reach the site: '+e.message)}
    return {ok,lines:L};
  }
  L.push('HTTP '+r.status+' for '+url);
  if(!r.ok){ok=false}
  const html=r.text,tt=(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1];
  if(tt)L.push('Title: '+tt.trim().slice(0,100));
  const txt=xText(html);L.push('Visible text: '+txt.length+' characters');
  const m=BAD_PAGE.exec((tt||'')+' '+txt.slice(0,800));if(m&&txt.length<1500){ok=false;L.push('The page looks like an error page ("'+m[0]+'")')}
  if(!tt&&txt.length<40&&!/<script/i.test(html)){ok=false;L.push('The page is empty')}
  /* files the page loads from its own site */
  const refs=[...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref|img[^>]*\ssrc)\s*=\s*["']([^"']+)["']/gi)].map(x=>x[1]).filter(u=>!/^(data:|#|mailto:|javascript:|tel:)/i.test(u));
  const seen=new Set(),list=[];
  for(const u of refs){let a;try{a=new URL(u,url)}catch(e){continue}if(a.origin!==new URL(url).origin||seen.has(a.href))continue;seen.add(a.href);list.push(a.href);if(list.length>=12)break}
  const miss=[];
  await Promise.all(list.map(async a=>{try{let x=await cnHttp(a,{method:'HEAD',headers:{Accept:'*/*'},timeout:15000});if(x.status===405||x.status===501)x=await cnHttp(a,{headers:{Accept:'*/*'},timeout:15000});if(!x.ok)miss.push(a.replace(new URL(url).origin,'')+' ('+x.status+')')}catch(e){}}));
  if(list.length)L.push('Checked '+list.length+' file(s) the page loads: '+(miss.length?miss.length+' missing: '+miss.join(', '):'all found'));
  if(miss.length)ok=false;
  const mixed=(html.match(/(?:src|href)\s*=\s*["']http:\/\//gi)||[]).length;
  if(/^https:/i.test(url)&&mixed)L.push('Warning: '+mixed+' link(s) use http:// on an https page (browsers may block them)');
  L.push('Not checked: errors in the browser console (use Preview for a draft before pushing).');
  return {ok,lines:L};
}
/* after a successful deploy: look at the live site and show the result on the deploy card */
async function postDeploy(c,u){
  const d=u&&u.dep;if(!d||!d.url)return;
  await sleep(5000);
  let r;try{r=await siteCheck(d.url)}catch(e){r={ok:false,lines:[e.message]}}
  if(c.pushed!==u)return;
  d.site={ok:r.ok,msg:r.lines.filter(x=>!/^Not checked/.test(x)).slice(0,3).join(' · ').slice(0,300)};
  save();render();
}

/* ---------- Extra agent tools ---------- */
const EXTRA_TOOLS=[
 {name:'fetch_url',description:'Read any web page or text/JSON URL the user gave you (or that you found) and get its text. Long pages come in parts: pass start for the next part. Use it for docs links, issues in other sites, APIs.',parameters:{type:'object',properties:{url:{type:'string'},start:{type:'integer',description:'character offset to continue from'}},required:['url']}},
 {name:'check_site',description:'Check that a LIVE website really works: HTTP status, title, page text, whether it is an error page, and whether the files it loads (JS, CSS, images) exist. Use it after a deploy finished (the deploy card also does it automatically) and when the user says the site is broken. Then fix the repo files if something is wrong.',parameters:{type:'object',properties:{url:{type:'string'}},required:['url']}},
 {name:'create_branch',description:'Create a new branch in the current repo from another branch (default: the current one) and switch to it (asks the user to confirm). Refused while there are staged draft changes only for the switch: the branch is still created.',parameters:{type:'object',properties:{name:{type:'string'},from:{type:'string',description:'optional source branch'}},required:['name']}},
 {name:'list_workflows',description:'List the GitHub Actions workflows of the current repo (name, file, state).',parameters:{type:'object',properties:{}}},
 {name:'rerun_workflow',description:'Re-run a GitHub Actions run (asks the user to confirm). failed_only re-runs only the failed jobs. Get run ids from get_actions_log.',parameters:{type:'object',properties:{run_id:{type:'integer'},failed_only:{type:'boolean'}},required:['run_id']}},
 {name:'dispatch_workflow',description:'Start a workflow that has workflow_dispatch (asks the user to confirm). workflow is the file name (e.g. deploy.yml) or id; ref defaults to the current branch.',parameters:{type:'object',properties:{workflow:{type:'string'},ref:{type:'string'},inputs:{type:'object'}},required:['workflow']}},
 {name:'run_checks',description:'After the user has pushed, wait (up to about 4 minutes) for the GitHub Actions run of the latest push on the current branch and return CHECKS PASSED or the failed job log. Use it to verify code. If it FAILED, fix the cause in the files, stage the fix, tell the user to push again, then call run_checks again (at most 3 rounds).',parameters:{type:'object',properties:{}}},
 {name:'remember',description:'Save one short fact about the user or their preferences in the global memory, so it is known in every future chat. Use it when the user says "remember …" or states a lasting preference. One fact per call, max 300 characters.',parameters:{type:'object',properties:{note:{type:'string'}},required:['note']}},
 {name:'forget',description:'Remove one memory note by its 1-based number in the Memory list shown in the system prompt.',parameters:{type:'object',properties:{index:{type:'integer'}},required:['index']}}
];
async function extraTool(c,name,a){
  if(name==='fetch_url')return fetchUrl(a.url,a.start);
  if(name==='check_site'){const r=await siteCheck(a.url);return (r.ok?'SITE CHECK OK':'SITE CHECK FOUND PROBLEMS')+'\n'+r.lines.join('\n')}
  if(name==='remember'){return memAdd(a.note)?'Remembered.':'Already remembered.'}
  if(name==='forget'){const l=memList(),i=(parseInt(a.index,10)||0)-1;if(i<0||i>=l.length)throw new Error('No such note');const t=l[i].t;S.mem=l.filter((_,k)=>k!==i);save();return 'Removed: '+t}
  const R=S.repo&&S.repo.full;
  if(name==='run_checks'){
    const rf='/repos/'+R+'/actions/runs?branch='+encodeURIComponent(S.repo.branch)+'&per_page=5';let run=null;
    for(let i=0;i<40;i++){
      const rs=(await gh(rf)).workflow_runs||[];run=rs[0]||null;
      if(!run){if(i>=4)return 'No workflow runs on branch '+S.repo.branch+'. Nothing was pushed, or the repo has no workflow. Tell the user to open the Code screen (sidebar) and tap Add check workflow.'}
      else if(run.status==='completed')break;
      if(!await sleepStop(6000))return 'Stopped.';
    }
    if(!run||run.status!=='completed')return 'The run is still '+(run?run.status:'missing')+' after 4 minutes. Call run_checks again.';
    const age=Math.round((Date.now()-Date.parse(run.created_at))/60000),old=age>15?'\nNote: this run is '+age+' minutes old. If the user pushed just now, GitHub may not have started the new run yet: call run_checks again in a minute.':'';
    if(run.conclusion==='success')return 'CHECKS PASSED: run #'+run.id+' ('+(run.name||'')+') '+(run.html_url||'')+old;
    if(run.conclusion==='failure'||run.conclusion==='timed_out')return 'CHECKS FAILED.\n'+await tool(c,'get_actions_log',{run_id:run.id})+old;
    return 'The run ended as '+run.conclusion+' ('+(run.html_url||'')+').'+old;
  }
  if(name==='list_workflows'){const j=await gh('/repos/'+R+'/actions/workflows');return (j.workflows||[]).map(w=>w.name+' · '+w.path.split('/').pop()+' · '+w.state).join('\n')||'No workflows'}
  if(name==='create_branch'){
    const n=String(a.name||'').trim();if(!/^[A-Za-z0-9._\/-]{1,100}$/.test(n)||/\.\.|\/\/|\.lock$|^\/|\/$/.test(n))throw new Error('Invalid branch name');
    const from=String(a.from||S.repo.branch);
    await cnAsk('Create a branch?','Create branch "'+n+'" from "'+from+'" in '+R+'?','Create branch');
    const ref=await gh('/repos/'+R+'/git/ref/heads/'+enc(from));
    await gh('/repos/'+R+'/git/refs',{method:'POST',body:{ref:'refs/heads/'+n,sha:ref.object.sha}});
    if(c.draft&&dcount(c))return 'Created branch '+n+' from '+from+'. Not switched, because there is a staged draft: push or discard it, then call switch_branch.';
    S.repo=Object.assign({},S.repo,{branch:n});ghTree=null;c.draft=null;rawSave();if(typeof updateChip==='function')updateChip();
    return 'Created branch '+n+' from '+from+' and switched to it.';
  }
  if(name==='rerun_workflow'){
    const id=parseInt(a.run_id,10);if(!id)throw new Error('run_id is required');
    await cnAsk('Re-run workflow?','Re-run '+(a.failed_only?'the failed jobs of ':'')+'run #'+id+' in '+R+'?','Re-run');
    await gh('/repos/'+R+'/actions/runs/'+id+(a.failed_only?'/rerun-failed-jobs':'/rerun'),{method:'POST'});
    return 'Re-run of #'+id+' requested. Check it with get_actions_log in a minute.';
  }
  if(name==='dispatch_workflow'){
    const w=String(a.workflow||'').trim();if(!w)throw new Error('workflow is required');
    const ref=String(a.ref||S.repo.branch);
    await cnAsk('Start workflow?','Start workflow "'+w+'" on '+ref+' in '+R+'?','Start');
    await gh('/repos/'+R+'/actions/workflows/'+encodeURIComponent(w)+'/dispatches',{method:'POST',body:{ref,inputs:(a.inputs&&typeof a.inputs==='object')?a.inputs:undefined}});
    return 'Workflow '+w+' started on '+ref+'.';
  }
  const x=await cnRun(name,a);
  return x===null?undefined:x;
}

/* ---------- Chat export / import ---------- */
function xDownload(name,text,type){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type||'text/plain'}));a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}
const xSlug=t=>String(t||'chat').toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'chat';
function chatMd(c){
  let o='# '+c.title+'\n\n_Exported from Orin on '+new Date().toISOString().slice(0,10)+'_\n\n';
  for(const m of c.msgs){
    if(m.role==='user')o+='## Me\n\n'+(m.content||'')+((m.files||[]).length?'\n\n_Files: '+m.files.map(f=>f.name).join(', ')+'_':'')+((m.atts||[]).length?'\n\n_Attachments: '+m.atts.map(f=>f.name).join(', ')+'_':'')+'\n\n';
    else if(m.role==='assistant')o+='## Orin'+(m.model?' ('+m.model+')':'')+'\n\n'+(m.content||'')+'\n\n';
  }
  return o;
}
function chatJson(c){
  const k=JSON.parse(JSON.stringify(c,(key,v)=>key==='imgs'||key==='pic'?undefined:v));
  return JSON.stringify({orinChat:1,chat:k},null,1);
}
function mdToChat(text,fallbackTitle){
  const t=/^#\s+(.+)$/m.exec(text),parts=text.split(/^##\s+(Me|Orin)(?:\s*\(.*\))?\s*$/m),msgs=[];
  for(let i=1;i<parts.length;i+=2){
    const body=(parts[i+1]||'').trim();if(!body)continue;
    msgs.push({role:parts[i]==='Me'?'user':'assistant',content:body});
  }
  if(!msgs.length){if(!text.trim())throw new Error('The file is empty');msgs.push({role:'user',content:text.trim().slice(0,20000)})}
  return {id:uid(),title:(t?t[1]:fallbackTitle||'Imported chat').slice(0,60),msgs,t:Date.now()};
}
function importChatFile(f){
  return f.text().then(tx=>{
    let c;
    if(/\.json$/i.test(f.name)||/^\s*\{/.test(tx)){
      const j=JSON.parse(tx);
      if(!j.orinChat||!j.chat||!Array.isArray(j.chat.msgs))throw new Error('This is not an Orin chat file. (A full backup is imported from Backup → Import.)');
      c=j.chat;c.id=uid();c.t=Date.now();delete c.sum;delete c.draft;delete c.pushed;delete c.plan;delete c.tasks;
    }else c=mdToChat(tx,f.name.replace(/\.[a-z]+$/i,''));
    S.chats.unshift(c);S.cur=c.id;home=false;save();
    return c;
  });
}
function xBackupHTML(){
  return '<div class="sec"><h3>Single chat</h3><p class="h">Export one chat from the ⋯ menu in the chat list (Markdown to read, JSON to bring it back into Orin). Import a chat file here: an Orin JSON export, or a Markdown/text file with “## Me” and “## Orin” headings.</p><div class="row" style="margin-top:0"><button class="btn ghost sm" data-xi="chat">Import a chat</button></div></div>';
}

document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;const d=t.dataset;
  if(d.xmd||d.xjs){
    const id=d.xmd||d.xjs,c=S.chats.find(x=>x.id===id);if(typeof closePop==='function')closePop();if(!c)return;
    if(d.xmd)xDownload('orin-'+xSlug(c.title)+'.md',chatMd(c),'text/markdown');else xDownload('orin-'+xSlug(c.title)+'.json',chatJson(c),'application/json');
    toast('Exported');
  }else if(d.xi==='chat'){
    const i=document.createElement('input');i.type='file';i.accept='.md,.txt,.json,text/markdown,text/plain,application/json';
    i.onchange=()=>{const f=i.files[0];if(!f)return;importChatFile(f).then(c=>{$('sheet').classList.remove('on');view='';spage='';render();toast('Imported: '+c.title)}).catch(er=>toast(er.message||'Could not import'))};
    i.click();
  }else if(d.mem){
    if(d.mem==='add'){const b=$('memin');try{if(b&&b.value.trim()){memAdd(b.value);drawSheet()}}catch(er){toast(er.message)}}
    else if(d.mem==='del'){S.mem=memList().filter((_,k)=>k!==+d.i);save();drawSheet()}
    else if(d.mem==='clear'){if(await ask('Clear memory?','All remembered notes are deleted.','Clear',true)){S.mem=[];save();drawSheet()}}
  }else if(d.act==='gsitefix'){
    const c=chat();if(c&&c.pushed&&c.pushed.dep&&c.pushed.dep.site&&!busy){
      $('box').value='The live site check after the deploy found a problem: '+c.pushed.dep.site.msg+'\nUse check_site on '+c.pushed.dep.url+', find the cause in the repo files and fix it.';send();
    }
  }
});

/* label shown in the step list while one of the extra tools runs ("icon:text", icons come from IX in core.js) */
function xLabel(k){
  const a=k.args||{};
  return ({fetch_url:'globe:read '+(a.url||''),check_site:'globe:check site '+(a.url||''),create_branch:'branch:new branch '+(a.name||''),
    list_workflows:'wrench:workflows',run_checks:'wrench:wait for checks',rerun_workflow:'refresh:re-run #'+(a.run_id||''),dispatch_workflow:'wrench:start '+(a.workflow||''),
    remember:'note:remember',forget:'note:forget'})[k.name]||null;
}
