/* Orin · code — the "Code" screen: repository, task list and GitHub Actions checks (tests and builds run on GitHub, free).
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded after extras.js. */
let cdRuns=null,cdMsg='',cdFor='',cdLoading=false;
const cdKey=()=>S.repo?S.repo.full+'@'+S.repo.branch:'';
async function cdLoad(){
  if(!(S.gh&&S.gh.token&&S.repo))return;
  const key=cdKey();cdFor=key;cdLoading=true;
  try{
    const j=await gh('/repos/'+S.repo.full+'/actions/runs?branch='+encodeURIComponent(S.repo.branch)+'&per_page=6');
    if(cdFor===key){cdRuns=j.workflow_runs||[];cdMsg=''}
  }catch(e){if(cdFor===key){cdRuns=null;cdMsg=e.message}}
  cdLoading=false;
  if(spage==='code'&&$('sheet').classList.contains('on'))drawSheet();
}
function cdOpen(){closeDrawer();editing=null;view='';spage='code';cdRuns=null;cdMsg='';openSheet();cdLoad()}
const cdDot=r=>r.status!=='completed'?'warn':(r.conclusion==='success'?'ok':(r.conclusion==='failure'||r.conclusion==='timed_out'?'bad':''));
const cdWord=r=>r.status!=='completed'?(r.status==='in_progress'?'running':'waiting'):(r.conclusion||'done');
function cdPage(){
  const g=S.gh&&S.gh.token,c=chat();
  if(!g||!S.repo)return '<div class="sec"><h3>Code</h3><p class="h">Choose a GitHub repository first. Then the assistant reads and changes your code, and your tests and builds can run on GitHub for free (GitHub Actions).</p><div class="row"><button class="btn" data-'+(g?'act="ropen"':'sp="gh"')+'>'+(g?'Choose a repository':'Add GitHub token')+'</button></div></div>';
  const n=c?dcount(c):0,tk=(c&&c.tasks)||[];
  let h='<div class="sec"><h3>'+esc(S.repo.full)+'</h3><p class="h">Branch <b>'+esc(S.repo.branch)+'</b> · '+(n?n+(n===1?' file':' files')+' staged, not pushed yet':'nothing staged')+'</p></div>';
  if(tk.length)h+='<div class="sec"><h3>Tasks</h3><ul class="cdt">'+tk.map(x=>'<li class="'+(x.done?'dn':'')+'">'+(x.done?'✓ ':'○ ')+esc(x.t)+'</li>').join('')+'</ul></div>';
  h+='<div class="sec"><h3>Checks on GitHub</h3>';
  if(cdMsg)h+='<p class="h">'+esc(cdMsg)+'</p>';
  else if(cdRuns===null)h+='<p class="h">Loading…</p>';
  else if(!cdRuns.length)h+='<p class="h">No runs on this branch yet. Either nothing was pushed, or the repo has no workflow. A workflow is a small file that tells GitHub how to test and build your project.</p>';
  else h+=cdRuns.map(r=>'<a class="mrow" href="'+qa(r.html_url)+'" target="_blank" rel="noopener"><span class="mt"><b>'+esc(r.name||'Workflow')+' #'+esc(r.run_number)+'</b><small><i class="sd '+cdDot(r)+'"></i>'+esc(cdWord(r))+' · '+esc(cnDate(r.created_at))+' · '+esc(String(r.head_commit&&r.head_commit.message||'').split('\n')[0].slice(0,50))+'</small></span><span class="ar">›</span></a>').join('');
  h+='<div class="row"><button class="btn sm" data-cd="fix">Run checks and fix with AI</button><button class="btn sm ghost" data-cd="refresh">'+(cdLoading?'Loading…':'Refresh')+'</button>'+
    (cdRuns&&cdRuns.length?'<button class="btn sm ghost" data-cd="rerun">Re-run latest</button>':'')+
    (cdRuns&&!cdRuns.length?'<button class="btn sm ghost" data-cd="addwf">Add check workflow</button>':'')+'</div>'+
    '<p class="h" style="margin-top:10px">How it works: the assistant changes files (staged), you press Push in the chat, GitHub runs your tests and build, and the assistant reads the result and fixes what failed. Nothing is pushed without your tap.</p><div id="cdres" class="h"></div></div>';
  return h;
}
const cdFlow={
  node:['name: Orin check','on:','  push:','  pull_request:','  workflow_dispatch:','jobs:','  check:','    runs-on: ubuntu-latest','    steps:','      - uses: actions/checkout@v4','      - uses: actions/setup-node@v4','        with:','          node-version: 20','      - name: Install','        run: if [ -f package-lock.json ]; then npm ci; else npm install; fi','      - name: Test','        run: npm test --if-present','      - name: Build','        run: npm run build --if-present',''].join('\n'),
  py:['name: Orin check','on:','  push:','  pull_request:','  workflow_dispatch:','jobs:','  check:','    runs-on: ubuntu-latest','    steps:','      - uses: actions/checkout@v4','      - uses: actions/setup-python@v5','        with:','          python-version: "3.12"','      - name: Install','        run: if [ -f requirements.txt ]; then pip install -r requirements.txt; fi','      - name: Compile','        run: python -m compileall -q .','      - name: Test','        run: if ls test*.py tests 1>/dev/null 2>&1; then pip install pytest && pytest -q; fi',''].join('\n'),
  plain:['name: Orin check','on:','  push:','  pull_request:','  workflow_dispatch:','jobs:','  check:','    runs-on: ubuntu-latest','    steps:','      - uses: actions/checkout@v4','      - name: Check JSON files','        run: find . -name "*.json" -not -path "./node_modules/*" -not -path "./.git/*" -print0 | xargs -0 -r -n1 node -e "JSON.parse(require(\'fs\').readFileSync(process.argv[1],\'utf8\'))"',''].join('\n')
};
async function cdAddWorkflow(out){
  const R=S.repo.full,B=S.repo.branch,path='.github/workflows/orin-check.yml';
  let ex=null;try{ex=await gh('/repos/'+R+'/contents/'+path+'?ref='+encodeURIComponent(B))}catch(e){}
  if(ex&&ex.sha){out('The file '+path+' already exists on this branch.');return}
  const t=await getTree(),has=f=>t.paths&&t.paths.has(f);
  const kind=has('package.json')?'node':(has('requirements.txt')||has('pyproject.toml')?'py':'plain');
  const nm={node:'Node.js (install, test, build)',py:'Python (install, compile, test)',plain:'basic (checks JSON files)'}[kind];
  if(!await ask('Add a check workflow?','Orin will commit '+path+' to '+R+' ('+B+'): '+nm+'. It runs on every push. You can edit it later.','Add'))return;
  try{
    await gh('/repos/'+R+'/contents/'+path,{method:'PUT',body:{message:'Add Orin check workflow',content:btoa(cdFlow[kind]),branch:B}});
    ghTree=null;out('Added '+path+'. Push something, or tap Run checks, and the first run starts.');
  }catch(e){out('GitHub refused: '+e.message+'. Writing workflow files needs the "workflow" permission on your token (classic token: tick workflow; fine-grained token: Workflows → Read and write).')}
}
document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t||!t.dataset.cd)return;
  const a=t.dataset.cd,out=m=>{const r=$('cdres');if(r)r.textContent=m};
  if(a==='refresh'){cdRuns=null;drawSheet();cdLoad()}
  else if(a==='rerun'){
    const r=cdRuns&&cdRuns[0];if(!r)return;
    if(!await ask('Re-run?','Run #'+r.run_number+' ('+(r.name||'')+') will run again.','Re-run'))return;
    try{await gh('/repos/'+S.repo.full+'/actions/runs/'+r.id+'/rerun',{method:'POST'});out('Re-run requested.');setTimeout(cdLoad,4000)}catch(er){out('✗ '+er.message)}
  }
  else if(a==='addwf'){await cdAddWorkflow(out);cdLoad()}
  else if(a==='fix'){
    if(busy){toast('Wait for the current reply to finish');return}
    if(!agentOn()){toast('Choose a repository first');return}
    $('sheet').classList.remove('on');spage='';
    if(home||!chat())newChat();
    $('box').value='Check my project with GitHub Actions: call run_checks to wait for the result of the latest run. If it passed, tell me. If it failed, read the log, fix the cause in the files and tell me to push; then call run_checks again (at most 3 rounds).';
    send();
  }
});
$('dcode').onclick=cdOpen;
