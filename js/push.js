/* Orin · push — draft/diff views, push, deploy status, PR actions, undo.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
const origC={};
const okey=(d,p)=>d.repo+'@'+d.branch+':'+p;
async function loadOrig(d,p){const k=okey(d,p);if(k in origC)return;try{origC[k]=await gh('/repos/'+d.repo+'/contents/'+enc(p)+'?ref='+encodeURIComponent(d.branch),{raw:true})}catch(e){origC[k]=''}}
function lineDiff(a,b){
  const A=a.split('\n'),B=b.split('\n');let st=0;
  while(st<A.length&&st<B.length&&A[st]===B[st])st++;
  let ea=A.length,eb=B.length;while(ea>st&&eb>st&&A[ea-1]===B[eb-1]){ea--;eb--}
  const a2=A.slice(st,ea),b2=B.slice(st,eb),n=a2.length,m=b2.length,mid=[];
  if(n*m>4e6){a2.forEach(x=>mid.push(['-',x]));b2.forEach(x=>mid.push(['+',x]))}
  else{
    const w=m+1,L=new Uint32Array((n+1)*w);
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i*w+j]=a2[i]===b2[j]?L[(i+1)*w+j+1]+1:Math.max(L[(i+1)*w+j],L[i*w+j+1]);
    let i=0,j=0;
    while(i<n&&j<m){if(a2[i]===b2[j]){mid.push([' ',a2[i]]);i++;j++}else if(L[(i+1)*w+j]>=L[i*w+j+1]){mid.push(['-',a2[i]]);i++}else{mid.push(['+',b2[j]]);j++}}
    while(i<n)mid.push(['-',a2[i++]]);while(j<m)mid.push(['+',b2[j++]]);
  }
  return A.slice(0,st).map(x=>[' ',x]).concat(mid,A.slice(ea).map(x=>[' ',x]));
}
function diffHTML(ops){
  const keep=new Array(ops.length).fill(false);let ad=0,de=0;
  ops.forEach((o,i)=>{if(o[0]!==' '){if(o[0]==='+')ad++;else de++;for(let k=Math.max(0,i-3);k<=Math.min(ops.length-1,i+3);k++)keep[k]=true}});
  const rows=[];let gap=false;
  ops.forEach((o,i)=>{if(!keep[i]){if(!gap){rows.push('<div class="dk">…</div>');gap=true}return}gap=false;rows.push('<div class="'+(o[0]==='+'?'da':o[0]==='-'?'dd':'dn')+'">'+o[0]+' '+esc(o[1])+'</div>')});
  const more=rows.length>400;
  return '<div class="dif"><div class="ds">+'+ad+' −'+de+'</div>'+rows.slice(0,400).join('')+(more?'<div class="dk">… (rest not shown)</div>':'')+'</div>';
}
function fileDiffHTML(d,p,f){
  if(f.bin)return '<div class="dif"><div class="ds">Binary / image · '+Math.round(f.bin.length*0.75/1024)+' KB</div></div>';
  if(!f.ex)return diffHTML(f.content.split('\n').map(x=>['+',x]));
  const o=origC[okey(d,p)];if(o===undefined)return '<div class="dif"><div class="ds">Loading…</div></div>';
  return f.del?diffHTML(o.split('\n').map(x=>['-',x])):diffHTML(lineDiff(o,f.content));
}
function taskHTML(c){
  const t=c.tasks;if(!t||!t.length)return '';const n=t.filter(x=>x.done).length;
  return '<div class="dc"><b>'+ico('check')+'Tasks '+n+'/'+t.length+'</b>'+t.map(x=>'<div class="tkr'+(x.done?' dn':'')+'">'+ico(x.done?'okc':'clock',15)+esc(x.t)+'</div>').join('')+'<div class="row" style="margin-top:4px"><button class="btn ghost sm" data-act="tkclr">Clear</button></div></div>';
}
function planHTML(c){
  const pl=c.plan;if(!pl)return '';
  return '<div class="dc"><b>'+ico('note')+'Plan '+(pl.ok?'(approved)':'')+'</b><small>'+esc(pl.summary)+'</small>'+
   (pl.files.length?'<div class="pf">'+pl.files.map(f=>'<span class="tag">'+ico('file',13)+esc(f)+'</span>').join('')+'</div>':'')+
   (pl.steps.length?'<ol class="pst">'+pl.steps.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>':'')+
   (pl.ok?'':'<div class="row" style="margin-top:4px"><button class="btn sm" data-act="plok">'+ico('okc',15)+'Approve and start</button><button class="btn ghost sm" data-act="plno">Request changes</button></div>')+'</div>';
}
function draftHTML(c){
  let h='';const d=c.draft;
  if(d&&dcount(c)){
    const fs=Object.entries(d.files),pr=S.pushMode==='pr';
    h+='<div class="dc"><b>'+ico('note')+'Draft: '+fs.length+' file</b><small>'+esc(d.repo)+' · '+esc(d.branch)+'</small>'+
    fs.map(([p,f])=>'<div class="df"><div class="fr"><button data-dv="'+qa(p)+'"><span class="tg '+(f.del?'d':f.ex?'e':'n')+'">'+(f.del?'delete':f.ex?'edit':'new')+'</span>'+esc(p)+'</button><button class="fx" data-fx="'+qa(p)+'" aria-label="Remove this file" title="Remove this file">'+IC.x+'</button></div>'+(dview[p]?fileDiffHTML(d,p,f):'')+'</div>').join('')+
    (()=>{const iss=checkDraft(c);return iss.length?'<div class="lw">'+iss.slice(0,6).map(x=>ico('xc',14)+esc(x)).join('<br>')+'</div>':''})()+
    '<input class="f cm" placeholder="Commit message" value="'+qa(d.msg||defMsg(c))+'">'+
    (pr?'<textarea class="f pb" rows="3" placeholder="PR description (optional, the AI can write it)">'+esc(d.prBody||'')+'</textarea>':'')+'<div class="seg"><button data-pm="direct" class="'+(pr?'':'on')+'">Push directly</button><button data-pm="pr" class="'+(pr?'on':'')+'">Branch + PR</button></div>'+
    '<small>'+(pr?'Goes to a new branch and merges into \''+esc(d.branch)+'\' when you press Merge. (Safer)':'Goes straight to \''+esc(d.branch)+'\'. You can undo it afterwards.')+'</small>'+
    '<div class="row" style="margin-top:4px"><button class="btn sm" data-act="gpush">'+(pr?ico('pr',15)+'Open PR':ico('up',15)+'Push')+'</button><button class="btn ghost sm" data-act="gdisc">Discard</button>'+(Object.keys(d.files).some(x=>/\.(html?|css|js|svg)$/i.test(x)&&!d.files[x].del)?'<button class="btn ghost sm" data-act="pview">'+ico('globe',15)+'Preview</button>':'')+'</div></div>';
  }
  const u=c.pushed;
  if(u&&u.pr){
    const st=u.merged?ico('okc')+'Merged':u.closed?ico('xc')+'PR closed':ico('pr')+'Pull request opened';
    h+='<div class="dc">'+st+' → '+esc(u.repo)+' · <a href="https://github.com/'+qa(u.repo)+'/pull/'+u.pr.n+'" target="_blank" rel="noopener">#'+u.pr.n+'</a>'+(u.merged||u.closed?'':'<div class="row" style="margin-top:4px"><button class="btn sm" data-act="gmerge">Merge</button><button class="btn ghost sm" data-act="gclose">Close</button></div>')+depHTML(u)+'</div>';
  }else if(u)h+='<div class="dc">'+(u.undone?ico('undo')+'Undone ('+esc(u.repo)+')':ico('okc')+'Pushed '+u.n+' file → '+esc(u.repo)+' · <a href="https://github.com/'+qa(u.repo)+'/commit/'+qa(u.sha)+'" target="_blank" rel="noopener">'+esc(u.sha.slice(0,7))+'</a>'+(u.prev?' <button class="btn ghost sm" data-act="gundo">'+ico('undo',14)+'Undo</button>':''))+depHTML(u)+'</div>';
  return h;
}
async function pushDraft(c){
  const d=c.draft;if(!d||!dcount(c)||pushing)return;
  const R=d.repo,B=d.branch,msg=(d.msg||'').trim()||defMsg(c),fs=Object.entries(d.files),wantPR=S.pushMode==='pr';
  if(!await ask(wantPR?'Open a pull request?':'Push to '+B+'?',wantPR?'This creates a new branch in '+R+' with '+fs.length+(fs.length===1?' file':' files')+' and opens a pull request.':'This pushes '+fs.length+(fs.length===1?' file':' files')+' to '+R+' ('+B+').',wantPR?'Open PR':'Push'))return;
  if(fs.some(([x])=>/^\.github\/workflows\//i.test(x))&&!await ask('Workflow file included','This draft contains a GitHub Actions workflow file. Pushing it needs the “workflow” scope on your token (GitHub → Settings → Developer settings → Tokens → tick “workflow”).','Push anyway'))return;
  pushing=true;toast(wantPR?'Creating pull request…':'Pushing…');
  try{
    const br=enc(B);let head=null,sha,prev=null,modes={},pr=null;
    try{head=await gh('/repos/'+R+'/git/ref/heads/'+br)}catch(e){if(!/ 409/.test(e.message))throw e}
    if(!head){
      for(const [p,f] of fs){if(f.del)continue;const j=await gh('/repos/'+R+'/contents/'+enc(p),{method:'PUT',body:{message:msg,content:f.bin||btoa(unescape(encodeURIComponent(f.content))),branch:B}});sha=j.commit.sha}
      if(!sha)throw new Error('Nothing to push');
    }else{
      prev=head.object.sha;
      if(S.repo&&S.repo.full===R&&S.repo.branch===B){try{modes=(await getTree()).modes}catch(e){}}
      let target=B;
      const cm=await gh('/repos/'+R+'/git/commits/'+prev),tree=[];
      for(const [p,f] of fs){
        if(f.del)tree.push({path:p,mode:modes[p]||'100644',type:'blob',sha:null});
        else{const b=await gh('/repos/'+R+'/git/blobs',{method:'POST',body:f.bin?{content:f.bin,encoding:'base64'}:{content:f.content,encoding:'utf-8'}});tree.push({path:p,mode:f.mode||modes[p]||'100644',type:'blob',sha:b.sha})}
      }
      const t=await gh('/repos/'+R+'/git/trees',{method:'POST',body:{base_tree:cm.tree.sha,tree}});
      if(t.sha===cm.tree.sha)throw new Error('No changes: these files already match what is on GitHub.');
      {/* did someone else change the same files since they were staged? */
        const mine=fs.filter(([x,f])=>f.ex&&f.bs);
        if(mine.length){
          let rt=null;try{rt=await gh('/repos/'+R+'/git/trees/'+cm.tree.sha+'?recursive=1')}catch(e){}
          if(rt&&!rt.truncated){
            const now={};(rt.tree||[]).forEach(x=>{if(x.type==='blob')now[x.path]=x.sha});
            const bad=mine.filter(([x,f])=>now[x]!==f.bs).map(([x])=>x+(now[x]?'':' (deleted on GitHub)'));
            if(bad.length&&!await dlg({title:'Files changed on GitHub',body:'These files changed on GitHub after you staged them:\n\n'+bad.slice(0,8).join('\n')+(bad.length>8?'\n… +'+(bad.length-8)+' more':'')+'\n\nPushing will overwrite those changes.',ok:'Overwrite and push',cancel:'Keep draft',danger:true}))throw new Error('Push cancelled because files changed on GitHub. Your draft is kept; ask the AI to merge your changes into the new version.');
          }
        }
      }
      if(wantPR){
        target='orin/'+(msg.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,30)||'update')+'-'+Math.random().toString(36).slice(2,6);
        await gh('/repos/'+R+'/git/refs',{method:'POST',body:{ref:'refs/heads/'+target,sha:prev}});
      }
      const nc=await gh('/repos/'+R+'/git/commits',{method:'POST',body:{message:msg,tree:t.sha,parents:[prev]}});
      try{await gh('/repos/'+R+'/git/refs/heads/'+enc(target),{method:'PATCH',body:{sha:nc.sha}})}
      catch(e){if(/ 422/.test(e.message))throw new Error('A new commit landed on '+B+' while pushing. Your draft is safe; push again.');throw e}
      sha=nc.sha;
      if(wantPR){
        const pl=await gh('/repos/'+R+'/pulls',{method:'POST',body:{title:msg,head:target,base:B,body:(f0=>f0.trim()?f0:'Created with Orin.')(String(c.draft.prBody||'')).slice(0,60000)}});
        pr={n:pl.number,head:target};prev=null;
      }
    }
    c.pushed={repo:R,branch:B,sha,prev,n:fs.length,undone:false,pr};c.draft=null;c.plan=null;ghTree=null;for(const k in origC)delete origC[k];save();toast(pr?'PR #'+pr.n+' opened':'Pushed');if(!pr)watchDeploy(c,R,sha,B);
  }catch(e){c.msgs.push({role:'error',content:(wantPR?'PR':'Push')+' fail: '+e.message});save()}
  pushing=false;render();
}
const sleep=ms=>new Promise(r=>setTimeout(r,window.__fast?Math.min(ms,20):ms));
function depHTML(u){
  const d=u.dep;if(!d)return '';
  const act='https://github.com/'+qa(u.repo)+'/actions';
  if(d.st==='completed'){
    if(d.c==='success')return '<div class="dep">'+ico('okc')+'Deployed'+(d.url&&/^https:\/\//.test(d.url)?' · <a href="'+qa(d.url)+'" target="_blank" rel="noopener">View site</a>':'')+(d.site?'<br><small>'+(d.site.ok?'Site check passed':'Site check found a problem')+': '+esc(d.site.msg)+'</small>'+(d.site.ok?'':' <button class="chip" data-act="gsitefix">'+ico('chat',14)+'Ask AI to fix</button>'):'')+'</div>';
    return '<div class="dep bad">'+ico('xc')+'Deploy failed ('+esc(d.c||'?')+') · <a href="'+act+'" target="_blank" rel="noopener">View log</a> <button class="chip" data-act="gdepfix">'+ico('chat',14)+'Ask AI to fix</button></div>';
  }
  return '<div class="dep">'+ico('clock')+'Deploy '+(d.st==='in_progress'?'running':'queued')+'…'+(d.stuck?'<br><small>This is taking a while and may be stuck. Open <a href="'+act+'" target="_blank" rel="noopener">Actions</a>, cancel the run and re-run it.</small>':'')+' <button class="chip" data-act="gdep">'+ico('refresh',14)+'Check</button></div>';
}
async function watchDeploy(c,R,sha,B,force){
  const u=c.pushed;if(!u)return;
  let pg=null;try{pg=await gh('/repos/'+R+'/pages')}catch(e){}
  if(!pg||(!force&&pg.source&&pg.source.branch&&pg.source.branch!==B))return;
  u.dep={st:'queued',sha,url:pg.html_url};save();render();
  for(let i=0;i<45;i++){
    await sleep(9000);if(c.pushed!==u)return;
    try{
      const j=await gh('/repos/'+R+'/actions/runs?head_sha='+encodeURIComponent(sha)+'&per_page=10'),rs=j.workflow_runs||[];
      const run=rs.find(x=>/pages/i.test(x.name||''))||rs[0];
      if(run){u.dep.st=run.status;u.dep.c=run.conclusion;u.dep.run=run.id;if(run.status!=='completed'&&Date.now()-new Date(run.created_at)>5*60e3)u.dep.stuck=1;else delete u.dep.stuck}
      save();render();
      if(run&&run.status==='completed'){if(run.conclusion==='success'&&typeof postDeploy==='function')postDeploy(c,u);return}
    }catch(e){}
  }
}
async function prAct(c,kind){
  const u=c.pushed;if(!u||!u.pr||u.merged||u.closed||pushing)return;
  if(!await ask(kind==='merge'?'Merge pull request?':'Close pull request?',kind==='merge'?'PR #'+u.pr.n+' will be merged into '+u.branch+'.':'PR #'+u.pr.n+' will be closed without merging.',kind==='merge'?'Merge':'Close PR',kind!=='merge'))return;
  pushing=true;
  try{
    if(kind==='merge'){
      let mr;
      try{mr=await gh('/repos/'+u.repo+'/pulls/'+u.pr.n+'/merge',{method:'PUT',body:{merge_method:'squash'}})}
      catch(e){if(/ 405/.test(e.message))mr=await gh('/repos/'+u.repo+'/pulls/'+u.pr.n+'/merge',{method:'PUT',body:{merge_method:'merge'}});else throw e}
      u.merged=true;if(mr&&mr.sha)setTimeout(()=>watchDeploy(c,u.repo,mr.sha,u.branch),0);
    }else{await gh('/repos/'+u.repo+'/pulls/'+u.pr.n,{method:'PATCH',body:{state:'closed'}});u.closed=true}
    try{await gh('/repos/'+u.repo+'/git/refs/heads/'+enc(u.pr.head),{method:'DELETE'})}catch(e){}
    ghTree=null;save();toast(kind==='merge'?'Merged':'PR closed');
  }catch(e){c.msgs.push({role:'error',content:(kind==='merge'?'Merge':'Close')+' fail: '+e.message});save()}
  pushing=false;render();
}
async function undoPush(c){
  const u=c.pushed;if(!u||u.undone||!u.prev)return;
  if(!await ask('Undo this push?','This moves '+u.repo+' back to the state before the push.','Undo push',true))return;
  try{
    const h=await gh('/repos/'+u.repo+'/git/ref/heads/'+enc(u.branch));
    if(h.object.sha!==u.sha)throw new Error('More commits were added after this push, so it can’t be undone');
    await gh('/repos/'+u.repo+'/git/refs/heads/'+enc(u.branch),{method:'PATCH',body:{sha:u.prev,force:true}});
    u.undone=true;ghTree=null;save();toast('Undone');
  }catch(e){c.msgs.push({role:'error',content:'Undo fail: '+e.message});save()}
  render();
}
function regen(){
  const c=chat();if(!c||busy)return;
  while(c.msgs.length&&c.msgs[c.msgs.length-1].role!=='user')c.msgs.pop();
  if(!c.msgs.length)return;
  if(c.msgs[c.msgs.length-1].gen){if(!imgReady()){toast('Add an image provider in Settings first');return}busy=true;stopped=false;setBusyUI(true);save();render(true);runImg(c);return}
  const list=provList();if(!list.length){toast('Add a provider in Settings first');return}
  busy=true;stopped=false;setBusyUI(true);save();render(true);(agentOn()?runAgent(c,list):run(c,list));
}
/* Continue: a reply that was cut off (output limit or Stop) is carried on by a follow-up message */
function contMsg(){
  const c=chat();if(!c||busy)return;
  const last=c.msgs[c.msgs.length-1];if(!last||last.role!=='assistant')return;
  const list=provList();if(!list.length){toast('Add a provider in Settings first');return}
  delete last.cut;
  c.msgs.push({role:'user',content:'Continue exactly where you stopped. Do not repeat anything you already wrote.',cont:1});
  busy=true;stopped=false;setBusyUI(true);save();render(true);(agentOn()?runAgent(c,list):run(c,list));
}
/* Fork: copy the chat up to and including message i into a new chat, to try another direction without losing this one.
   Agent state (draft, plan, tasks) and the summary stay with the original chat. */
function forkChat(i){
  const c=chat();if(!c||busy)return;
  const msgs=JSON.parse(JSON.stringify(c.msgs.slice(0,i+1)));
  msgs.forEach(m=>{delete m.cut;delete m.u});
  if(!msgs.length)return;
  const n={id:uid(),title:('Fork: '+c.title).slice(0,60),msgs,t:Date.now()};
  S.chats.unshift(n);S.cur=n.id;home=false;save();closeDrawer();render();toast('New chat created from this message');$('box').focus();
}
async function editMsg(i){
  const c=chat();if(!c||busy)return;const m=c.msgs[i];if(!m||m.role!=='user')return;
  if(i<c.msgs.length-1&&!await ask('Edit this message?','Every message after it will be removed.','Edit'))return;
  $('box').value=m.content||'';pend=[];
  (m.imgs||[]).forEach(x=>pend.push({kind:x.mime==='application/pdf'?'pdf':'image',name:x.name||'image',mime:x.mime,data:x.data}));
  (m.files||[]).forEach(f=>{const t=ftext(f);pend.push({kind:'text',name:f.name,text:t,size:f.size||t.length,tok:etok(t)})});
  c.msgs.splice(i);save();render();renderTray();$('box').dispatchEvent(new Event('input'));$('box').focus();
}
