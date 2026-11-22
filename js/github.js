/* Orin · github — GitHub API helper, repo list, branches, history, tree cache.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---------- GitHub agent ---------- */
const enc=x=>String(x).split('/').map(encodeURIComponent).join('/');
const agentOn=()=>!!(S.repo&&S.gh&&S.gh.token);
let rsub='',hist=null,flist,fq='';
let ghTree=null,ghRepos,rfilter='',dview={},pushing=false,rloading=false;
let ghAcc='';   /* html of the last "Check access" result, shown in Settings → GitHub */
const GH_HELP='<p class="h">To let the assistant work on your repositories you need a GitHub token (one time). Go to <b>github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)</b>. Name it Orin, choose an expiration, tick <b>repo</b>, generate it, then copy and paste it below. Never share the token.</p>';
function ghHTML(){
  const pm=S.planMode||'big';
  const seg=[['off','Off'],['big','Big tasks'],['always','Always']]
    .map(x=>'<button data-plm="'+x[0]+'" class="'+(pm===x[0]?'on':'')+'">'+x[1]+'</button>').join('');
  return '<div class="sec"><h3>Plan first</h3>'+
    '<p class="h">Before changing files, the assistant shows a plan and waits for your approval.</p>'+
    '<div class="seg">'+seg+'</div>'+
    '<p class="h" style="margin-top:8px">Big tasks: the assistant edits a single file on its own, but asks for a plan before touching more than one file or deleting anything.</p></div>'+
    '<div class="sec"><h3>GitHub agent mode</h3>'+
    '<p class="h">The assistant reads and writes repository files by itself, and nothing reaches GitHub until you press Push. Choose a repository from the + menu in the composer.</p>'+
    '<input class="f" id="gt" type="password" autocomplete="off" placeholder="ghp_…" aria-label="GitHub token" value="'+qa((S.gh||{}).token)+'">'+
    '<div class="row"><button class="btn ghost sm" data-act="ropen">Choose a repository</button>'+
    '<button class="btn ghost sm" data-act="gcheck">Check access</button></div>'+
    '<div id="gacc">'+ghAcc+'</div></div>';
}
/* What can the saved token do? Reads /user (classic scopes come in a header), the rate limit, and push rights on the chosen repo. */
async function ghAccess(){
  const t=S.gh&&S.gh.token;if(!t)throw new Error('GitHub token is missing');
  const r=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+t,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
  if(r.status===401)throw new Error('GitHub rejected the token (401). It may be wrong, expired or revoked.');
  if(!r.ok)throw new Error('GitHub answered '+r.status+' when checking the token.');
  const u=await r.json(),sc=r.headers.get('x-oauth-scopes');
  const out={
    login:u.login,
    fine:/^github_pat_/.test(t),
    scopes:sc===null?null:sc.split(',').map(s=>s.trim()).filter(Boolean),
    limit:r.headers.get('x-ratelimit-limit'),
    left:r.headers.get('x-ratelimit-remaining'),
    reset:parseInt(r.headers.get('x-ratelimit-reset'),10)||0,
    repo:S.repo?S.repo.full:'',
    perm:null
  };
  if(S.repo){
    try{out.perm=(await gh('/repos/'+enc(S.repo.full))).permissions||{}}
    catch(e){out.perm={err:e.message}}
  }
  return out;
}
function ghAccHTML(a){
  const row=(ok,txt)=>'<p class="h">'+(ok?'✓ ':'⚠ ')+txt+'</p>';
  let h=row(true,'Signed in as <b>@'+esc(a.login)+'</b> ('+(a.fine?'fine-grained token':'classic token')+')');
  if(a.fine)h+=row(true,'Fine-grained tokens do not list their permissions here. The repo needs <b>Contents</b>, <b>Pull requests</b>, <b>Issues</b>, <b>Actions</b> (read), <b>Pages</b> and <b>Workflows</b>.');
  else if(a.scopes){
    h+=row(a.scopes.includes('repo'),'<b>repo</b> scope '+(a.scopes.includes('repo')?'is on: files can be read and written.':'is missing: the assistant cannot read private repos or push.'));
    h+=row(a.scopes.includes('workflow'),'<b>workflow</b> scope '+(a.scopes.includes('workflow')?'is on.':'is missing: pushing files under .github/workflows/ will be refused.'));
  }
  if(a.repo){
    if(a.perm&&a.perm.err)h+=row(false,esc(a.repo)+': '+esc(a.perm.err));
    else if(a.perm)h+=row(!!a.perm.push,esc(a.repo)+(a.perm.push?': you can push.':': read only, push is not allowed.'));
  }else h+='<p class="h">Choose a repository to also check push rights on it.</p>';
  if(a.left!==null&&a.limit!==null)h+='<p class="h">Rate limit: '+esc(a.left)+' of '+esc(a.limit)+' requests left'+(a.reset?', resets at '+new Date(a.reset*1000).toLocaleTimeString():'')+'.</p>';
  return h;
}
/* seconds to wait if GitHub answered with a rate limit (primary or secondary), else null */
function rateWait(r,j){
  if(r.status!==403&&r.status!==429)return null;
  const m=String((j&&j.message)||'').toLowerCase(),ra=parseInt(r.headers.get('retry-after'),10);
  if(ra>0)return ra;
  if(r.headers.get('x-ratelimit-remaining')==='0'){const rs=parseInt(r.headers.get('x-ratelimit-reset'),10);return rs>0?Math.max(1,rs-Math.floor(Date.now()/1000)):60}
  if(r.status===429||/secondary rate limit|rate limit exceeded|abuse detection/.test(m))return 60;
  return null;
}
async function gh(path,opt={}){
  const t=S.gh&&S.gh.token;if(!t)throw new Error('GitHub token is missing');
  const h={Authorization:'Bearer '+t,Accept:opt.accept||(opt.raw?'application/vnd.github.raw+json':'application/vnd.github+json'),'X-GitHub-Api-Version':'2022-11-28'};
  if(opt.body)h['Content-Type']='application/json';
  let away=0;
  for(let att=0;;att++){
    const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),30000),t0=Date.now();
    try{
      const r=await fetch('https://api.github.com'+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined,signal:ctl.signal});
      if(opt.raw&&r.ok)return await r.text();
      const j=r.status===204?null:await r.json().catch(()=>null);
      if(!r.ok){
        const w=opt.method&&opt.method!=='GET',rw=rateWait(r,j);
        /* a rate-limited request was not processed, so it is safe to retry (also writes); short waits only */
        if(rw!==null&&att<2&&rw<=25){await new Promise(ok=>setTimeout(ok,window.__fast?20:rw*1000+400));continue}
        if(rw!==null)throw new Error('GitHub '+r.status+': rate limit reached. Wait about '+(rw>=60?Math.ceil(rw/60)+' min':rw+' sec')+' and try again (GitHub pauses accounts that send many requests at once).');
        throw new Error('GitHub '+r.status+': '+((j&&j.message)||r.statusText)+(r.status===401?' (invalid token)':r.status===403?' (the token lacks permission)':w&&r.status===404?' (does the token have write access to this repo?)':''))
      }
      return j;
    }catch(e){
      /* the app was in the background or offline while a read ran: wait until it is back, then repeat the read.
         Reads only (GET): a write may already have gone through. */
      if((e.name==='AbortError'||e instanceof TypeError)&&(opt.method||'GET')==='GET'&&away<6&&(wasAway(t0)||justBack())&&await waitBack()){away++;continue}
      if(e.name==='AbortError')throw new Error('GitHub timeout');
      if(e instanceof TypeError)throw new Error('GitHub network error');
      throw e;
    }finally{clearTimeout(to)}
  }
}
async function fetchRepos(){let all=[];for(let pg=1;pg<=3;pg++){const j=await gh('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member&page='+pg);all=all.concat(j);if(j.length<100)break}return all}
let ghBr=null;
function branchHTML(){const cur=S.repo.branch,l=ghBr&&ghBr.repo===S.repo.full?ghBr.list:[cur],ls=l.includes(cur)?l:[cur].concat(l);return '<select class="f" id="rbr">'+ls.map(b=>'<option value="'+qa(b)+'"'+(b===cur?' selected':'')+'>'+esc(b)+'</option>').join('')+'</select>'}
function loadBranches(){const R=S.repo.full;gh('/repos/'+R+'/branches?per_page=100').then(j=>{ghBr={repo:R,list:j.map(x=>x.name)}}).catch(()=>{ghBr={repo:R,list:[S.repo.branch]}}).finally(()=>{if(view==='repo'&&$('rbw')&&S.repo&&S.repo.full===R)$('rbw').innerHTML=branchHTML()})}
document.addEventListener('change',async e=>{if(e.target.id!=='rbr'||!S.repo)return;const nb=e.target.value,c=chat();
  if(c&&dcount(c)&&c.draft.branch!==nb){if(!await ask('Switch branch?','Switching branch discards the staged draft in this chat.','Discard and switch',true)){e.target.value=S.repo.branch;return}c.draft=null}
  S.repo.branch=nb;ghTree=null;save();render();toast('Branch: '+nb)});
function loadRepos(){if(rloading)return;rloading=true;fetchRepos().then(l=>{ghRepos=l}).catch(e=>{ghRepos=e.message}).finally(()=>{rloading=false;if(view==='repo'&&$('rl'))$('rl').innerHTML=repoListHTML()})}
function repoListHTML(){
  if(ghRepos===undefined)return '<p class="h">Loading…</p>';
  if(typeof ghRepos==='string')return '<p class="h" style="color:var(--err)">'+esc(ghRepos)+'</p>';
  const l=ghRepos.filter(r=>!rfilter||r.full_name.toLowerCase().includes(rfilter));
  return l.map(r=>'<button class="rc" data-rp="'+qa(r.full_name)+'">'+(S.repo&&S.repo.full===r.full_name?ico('check',14):'')+esc(r.full_name)+(r.private?' '+ico('lock',13):'')+'</button>').join('')||'<p class="h">No repositories found</p>';
}
function loadHist(){const R=S.repo.full,B=S.repo.branch;hist={repo:R,branch:B,loading:1};gh('/repos/'+R+'/commits?sha='+encodeURIComponent(B)+'&per_page=25').then(j=>{hist={repo:R,branch:B,list:j}}).catch(e=>{hist={repo:R,branch:B,err:e.message}}).finally(()=>{if(view==='repo'&&rsub==='hist'&&$('rsub'))$('rsub').innerHTML=histHTML()})}
function histHTML(){
  if(!hist||hist.loading)return '<p class="h">Loading…</p>';if(hist.err)return '<p class="h">'+esc(hist.err)+'</p>';
  return '<p class="h">Restoring creates a new commit that returns the branch to that state. No history is lost, and you can restore again to undo it.</p>'+hist.list.map((x,i)=>'<div class="hi"><b>'+esc(String((x.commit&&x.commit.message)||'').split('\n')[0].slice(0,80))+'</b><small>'+esc(x.sha.slice(0,7))+' · '+esc(new Date(x.commit.author.date).toLocaleString())+' · '+esc(x.commit.author.name||'')+'</small>'+(i?'<button class="chip" data-hrest="'+qa(x.sha)+'">'+ico('undo',14)+'Restore this version</button>':'<span class="chip">Current</span>')).join('</div>')+'</div>';
}
async function restoreTo(sha){
  const R=S.repo.full,B=S.repo.branch;
  if(!await ask('Restore this version?','This returns '+R+' ('+B+') to commit '+sha.slice(0,7)+'. It is saved as a new commit, so no history is lost.','Restore'))return;
  try{
    const head=await gh('/repos/'+R+'/git/ref/heads/'+enc(B)),cm=await gh('/repos/'+R+'/git/commits/'+sha);
    const nc=await gh('/repos/'+R+'/git/commits',{method:'POST',body:{message:'Restore to '+sha.slice(0,7)+' (via Orin)',tree:cm.tree.sha,parents:[head.object.sha]}});
    await gh('/repos/'+R+'/git/refs/heads/'+enc(B),{method:'PATCH',body:{sha:nc.sha}});
    ghTree=null;toast('Restored');loadHist();if(view==='repo')drawSheet();
  }catch(e){toast(e.message)}
}
function fileListHTML(){
  if(flist===undefined)return '<p class="h">Loading…</p>';if(typeof flist==='string')return '<p class="h">'+esc(flist)+'</p>';
  const q=fq.toLowerCase(),l=flist.filter(x=>!q||x.toLowerCase().includes(q));
  return '<div class="fl">'+l.slice(0,80).map(x=>'<button data-fatt="'+qa(x)+'">'+ico('file',14)+esc(x)+'</button>').join('')+'</div>'+(l.length>80?'<p class="h">… '+(l.length-80)+' more. Use search to narrow down.</p>':l.length?'':'<p class="h">No files found</p>');
}
function loadFiles(){flist=undefined;getTree().then(t=>{flist=[...t.paths].sort()}).catch(e=>{flist=e.message}).finally(()=>{if(view==='repo'&&rsub==='files'&&$('fl'))$('fl').innerHTML=fileListHTML()})}
function subHTML(){
  if(rsub==='hist')return histHTML();
  if(rsub==='files')return '<p class="h">Attach a file to this chat so the assistant can read it. Up to 10 attachments.</p><input class="f" id="fq" placeholder="Search files…" aria-label="Search files" value="'+qa(fq)+'"><div id="fl" style="margin-top:6px">'+fileListHTML()+'</div>';
  return '';
}
function updateChip(){
  const b=$('plus');if(!b)return;
  const n=typeof skActive==='function'?skActive(chat()).length:0;
  b.classList.toggle('has',!!S.repo||n>0);
}
function okPath(p){
  if(typeof p!=='string')throw new Error('path is required');
  p=p.trim().replace(/^\.?\/+/,'');
  if(!p||p.length>200||/[\\\u0000-\u001f]/.test(p)||p.split('/').some(x=>x===''||x==='.'||x==='..'))throw new Error('Invalid path: '+p);
  if(/^\.git(\/|$)/i.test(p)||/^\.github\/workflows(\/|$)/i.test(p))throw new Error('Blocked path (security): '+p);
  return p;
}
function dr(c){const R=S.repo;if(!c.draft||c.draft.repo!==R.full||c.draft.branch!==R.branch)c.draft={repo:R.full,branch:R.branch,files:{},msg:''};return c.draft}
const dcount=c=>c.draft?Object.keys(c.draft.files).length:0;
const defMsg=c=>{const u=[...c.msgs].reverse().find(m=>m.role==='user');return 'Update via Orin'+(u&&u.content?': '+u.content.replace(/\s+/g,' ').slice(0,60):'')};
async function getTree(){
  const key=S.repo.full+'@'+S.repo.branch;
  if(ghTree&&ghTree.key===key&&Date.now()-ghTree.at<60000)return ghTree;
  const t={key,at:Date.now(),paths:new Set(),modes:{},shas:{},sizes:{},trunc:false,empty:false};
  try{
    const j=await gh('/repos/'+S.repo.full+'/git/trees/'+encodeURIComponent(S.repo.branch)+'?recursive=1');
    (j.tree||[]).forEach(x=>{if(x.type==='blob'){t.paths.add(x.path);t.modes[x.path]=x.mode;t.shas[x.path]=x.sha;t.sizes[x.path]=x.size}});
    t.trunc=!!j.truncated;
  }
  catch(e){if(/ 409/.test(e.message))t.empty=true;else throw e}
  ghTree=t;return t;
}
