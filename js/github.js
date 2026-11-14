/* Orin · github — GitHub API helper, repo list, branches, history, tree cache.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---------- GitHub agent ---------- */
const enc=x=>String(x).split('/').map(encodeURIComponent).join('/');
const agentOn=()=>!!(S.repo&&S.gh&&S.gh.token);
let rsub='',hist=null,flist,fq='';
let ghTree=null,ghRepos,rfilter='',dview={},pushing=false,rloading=false;
const GH_HELP='<p class="h">AI ke repo te kaj korate GitHub token lagbe (ekbar). Steps: <b>github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)</b>. Note e Orin likho, Expiration dao, <b>repo</b> box tick koro, Generate koro, token copy kore niche paste koro. Token kauke dio na.</p>';
function ghHTML(){const pm=S.planMode||'big';return '<div class="sec"><h3>Plan-first (nirapotta)</h3><p class="h">AI file bodlanor age plan dekhabe, tumi Approve korle tarpor kaj korbe.</p><div class="seg">'+[['off','Off'],['big','Boro kaj e'],['always','Shob kaj e']].map(x=>'<button data-plm="'+x[0]+'" class="'+(pm===x[0]?'on':'')+'">'+x[1]+'</button>').join('')+'</div><p class="h" style="margin-top:8px">"Boro kaj e" = ek file e AI nijei bodlay; ek-er beshi file ba delete e age plan lage.</p></div><div class="sec"><h3>GitHub (agent mode)</h3><p class="h">AI nijei repo er file porbe, likhbe, ar tumi Push chaple GitHub e jabe. Composer er + → GitHub repo theke repo bechhe nao.</p><input class="f" id="gt" type="password" autocomplete="off" placeholder="ghp_…" value="'+qa((S.gh||{}).token)+'"><div class="row"><button class="btn ghost sm" data-act="ropen">Repo bechhe nao</button></div></div>'}
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
  const t=S.gh&&S.gh.token;if(!t)throw new Error('GitHub token nai');
  const h={Authorization:'Bearer '+t,Accept:opt.accept||(opt.raw?'application/vnd.github.raw+json':'application/vnd.github+json'),'X-GitHub-Api-Version':'2022-11-28'};
  if(opt.body)h['Content-Type']='application/json';
  for(let att=0;;att++){
    const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),30000);
    try{
      const r=await fetch('https://api.github.com'+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined,signal:ctl.signal});
      if(opt.raw&&r.ok)return await r.text();
      const j=r.status===204?null:await r.json().catch(()=>null);
      if(!r.ok){
        const w=opt.method&&opt.method!=='GET',rw=rateWait(r,j);
        /* a rate-limited request was not processed, so it is safe to retry (also writes); short waits only */
        if(rw!==null&&att<2&&rw<=25){await new Promise(ok=>setTimeout(ok,window.__fast?20:rw*1000+400));continue}
        if(rw!==null)throw new Error('GitHub '+r.status+': rate limit. '+(rw>=60?Math.ceil(rw/60)+' minute':rw+' second')+' por abar try koro (onek request ek sathe gele GitHub kichukkhon thamiye dey).');
        throw new Error('GitHub '+r.status+': '+((j&&j.message)||r.statusText)+(r.status===401?' (token thik nai)':r.status===403?' (token er permission nai)':w&&r.status===404?' (token e repo write permission ache?)':''))
      }
      return j;
    }catch(e){
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
document.addEventListener('change',e=>{if(e.target.id!=='rbr'||!S.repo)return;const nb=e.target.value,c=chat();
  if(c&&dcount(c)&&c.draft.branch!==nb){if(!confirm('Ei chat er draft muche jabe. Branch bodlabe?')){e.target.value=S.repo.branch;return}c.draft=null}
  S.repo.branch=nb;ghTree=null;save();render();toast('Branch: '+nb)});
function loadRepos(){if(rloading)return;rloading=true;fetchRepos().then(l=>{ghRepos=l}).catch(e=>{ghRepos=e.message}).finally(()=>{rloading=false;if(view==='repo'&&$('rl'))$('rl').innerHTML=repoListHTML()})}
function repoListHTML(){
  if(ghRepos===undefined)return '<p class="h">Loading…</p>';
  if(typeof ghRepos==='string')return '<p class="h" style="color:var(--err)">'+esc(ghRepos)+'</p>';
  const l=ghRepos.filter(r=>!rfilter||r.full_name.toLowerCase().includes(rfilter));
  return l.map(r=>'<button class="rc" data-rp="'+qa(r.full_name)+'">'+(S.repo&&S.repo.full===r.full_name?ico('check',14):'')+esc(r.full_name)+(r.private?' '+ico('lock',13):'')+'</button>').join('')||'<p class="h">Kono repo pailam na</p>';
}
function loadHist(){const R=S.repo.full,B=S.repo.branch;hist={repo:R,branch:B,loading:1};gh('/repos/'+R+'/commits?sha='+encodeURIComponent(B)+'&per_page=25').then(j=>{hist={repo:R,branch:B,list:j}}).catch(e=>{hist={repo:R,branch:B,err:e.message}}).finally(()=>{if(view==='repo'&&rsub==='hist'&&$('rsub'))$('rsub').innerHTML=histHTML()})}
function histHTML(){
  if(!hist||hist.loading)return '<p class="h">Loading…</p>';if(hist.err)return '<p class="h">'+esc(hist.err)+'</p>';
  return '<p class="h">Restore = notun commit ja purono state e fire jay. Kono history mushe jay na (abar restore kore ferot ana jay).</p>'+hist.list.map((x,i)=>'<div class="hi"><b>'+esc(String((x.commit&&x.commit.message)||'').split('\n')[0].slice(0,80))+'</b><small>'+esc(x.sha.slice(0,7))+' · '+esc(new Date(x.commit.author.date).toLocaleString())+' · '+esc(x.commit.author.name||'')+'</small>'+(i?'<button class="chip" data-hrest="'+qa(x.sha)+'">'+ico('undo',14)+'Ekhane restore koro</button>':'<span class="chip">ekhon</span>')).join('</div>')+'</div>';
}
async function restoreTo(sha){
  const R=S.repo.full,B=S.repo.branch;
  if(!confirm(R+' ('+B+') ke '+sha.slice(0,7)+' commit er obosthay phire nibe? (notun commit hishebe, history thakbe)'))return;
  try{
    const head=await gh('/repos/'+R+'/git/ref/heads/'+enc(B)),cm=await gh('/repos/'+R+'/git/commits/'+sha);
    const nc=await gh('/repos/'+R+'/git/commits',{method:'POST',body:{message:'Restore to '+sha.slice(0,7)+' (via Orin)',tree:cm.tree.sha,parents:[head.object.sha]}});
    await gh('/repos/'+R+'/git/refs/heads/'+enc(B),{method:'PATCH',body:{sha:nc.sha}});
    ghTree=null;toast('Restore hoyeche');loadHist();if(view==='repo')drawSheet();
  }catch(e){toast(e.message)}
}
function fileListHTML(){
  if(flist===undefined)return '<p class="h">Loading…</p>';if(typeof flist==='string')return '<p class="h">'+esc(flist)+'</p>';
  const q=fq.toLowerCase(),l=flist.filter(x=>!q||x.toLowerCase().includes(q));
  return '<div class="fl">'+l.slice(0,80).map(x=>'<button data-fatt="'+qa(x)+'">'+ico('file',14)+esc(x)+'</button>').join('')+'</div>'+(l.length>80?'<p class="h">… aro '+(l.length-80)+' ta, search kore khujo</p>':l.length?'':'<p class="h">Kichu pai ni</p>');
}
function loadFiles(){flist=undefined;getTree().then(t=>{flist=[...t.paths].sort()}).catch(e=>{flist=e.message}).finally(()=>{if(view==='repo'&&rsub==='files'&&$('fl'))$('fl').innerHTML=fileListHTML()})}
function subHTML(){
  if(rsub==='hist')return histHTML();
  if(rsub==='files')return '<p class="h">File chat e attach hobe (AI porte parbe). Max 10 ta attach.</p><input class="f" id="fq" placeholder="File khujo…" value="'+qa(fq)+'"><div id="fl" style="margin-top:6px">'+fileListHTML()+'</div>';
  return '';
}
function updateChip(){
  const e=$('rchip');if(!S.repo){e.className='';e.innerHTML='';return}
  const c=chat(),n=c?dcount(c):0;
  e.className='on';e.innerHTML='<button data-act="ropen">'+ico('box',15)+esc(S.repo.full)+' · '+esc(S.repo.branch)+(n?' · '+n+' draft':'')+(agentOn()?'':' · token nai')+'</button><button data-act="rclear" aria-label="Remove repo">'+ico('x',14)+'</button>';
}
function okPath(p){
  if(typeof p!=='string')throw new Error('path dorkar');
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
  const t={key,at:Date.now(),paths:new Set(),modes:{},shas:{},trunc:false,empty:false};
  try{const j=await gh('/repos/'+S.repo.full+'/git/trees/'+encodeURIComponent(S.repo.branch)+'?recursive=1');(j.tree||[]).forEach(x=>{if(x.type==='blob'){t.paths.add(x.path);t.modes[x.path]=x.mode;t.shas[x.path]=x.sha}});t.trunc=!!j.truncated}
  catch(e){if(/ 409/.test(e.message))t.empty=true;else throw e}
  ghTree=t;return t;
}
