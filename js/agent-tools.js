/* Orin · agent-tools — agent tool definitions (TOOLS) and tool() executor.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
const TOOLS=[
 {name:'list_repos',description:"List the user's GitHub repositories (optionally filtered by a text query).",parameters:{type:'object',properties:{query:{type:'string',description:'optional text filter'}}}},
 {name:'list_files',description:'List files in the current repository (with staged draft changes applied). Optionally only under a folder path.',parameters:{type:'object',properties:{path:{type:'string',description:'optional folder prefix, e.g. src'},repo:{type:'string',description:'optional other repo as owner/name (read-only, default branch)'}}}},
 {name:'read_file',description:'Read a text file from the current repository (staged draft version if changed). Optionally from another repo (owner/name, read-only, default branch). A BIG file read without start_line/end_line only returns an outline: use find_in_file first, then read a narrow range.',parameters:{type:'object',properties:{path:{type:'string'},start_line:{type:'integer',description:'optional, 1-based; for big files read in ranges'},end_line:{type:'integer',description:'optional'},repo:{type:'string'}},required:['path']}},
 {name:'write_file',description:'Create or fully overwrite a file with COMPLETE content. Staged as a draft; the user pushes it.',parameters:{type:'object',properties:{path:{type:'string'},content:{type:'string',description:'full file content'}},required:['path','content']}},
 {name:'edit_file',description:'Replace one exact piece of text in an existing file. old_text must appear exactly once. Staged as draft.',parameters:{type:'object',properties:{path:{type:'string'},old_text:{type:'string'},new_text:{type:'string'}},required:['path','old_text','new_text']}},
 {name:'delete_file',description:'Delete a file (staged as draft).',parameters:{type:'object',properties:{path:{type:'string'}},required:['path']}},
 {name:'create_repo',description:'Create a NEW GitHub repository for the user (asks the user to confirm) and switch to it.',parameters:{type:'object',properties:{name:{type:'string'},description:{type:'string'},private:{type:'boolean',description:'default true'}},required:['name']}},
 {name:'edit_many',description:'Apply several exact-text replacements to ONE file in a single call (all-or-nothing). Each old_text must appear exactly once in the file at the moment it is applied.',parameters:{type:'object',properties:{path:{type:'string'},edits:{type:'array',items:{type:'object',properties:{old_text:{type:'string'},new_text:{type:'string'}},required:['old_text','new_text']}}},required:['path','edits']}},
 {name:'search_code',description:'Search the files of the current repo for a text (case-insensitive, plain text, symbols are fine). Searches the live files INCLUDING staged draft changes and returns path:line matches, so it is up to date. For a bigger repo pass path (a folder) to narrow it. With repo (owner/name) it uses GitHub code search on another repo instead.',parameters:{type:'object',properties:{query:{type:'string'},path:{type:'string',description:'optional folder or file prefix to search in'},repo:{type:'string',description:'optional other repo as owner/name'}},required:['query']}},
 {name:'rename_file',description:'Rename or move ONE text file of the current repo (draft included) without rewriting its content: stages a delete of the old path and the same content at the new path. Much cheaper than write_file + delete_file. Folders and binary files are not supported. Afterwards fix references to the old path (search_code).',parameters:{type:'object',properties:{from:{type:'string'},to:{type:'string'}},required:['from','to']}},
 {name:'find_in_file',description:'Find where texts appear INSIDE one file of the current repo (draft included) and get line numbers with a short snippet. Pass several queries at once (function names, ids, strings). Use it before read_file on a big file, then read only a narrow line range around the hit.',parameters:{type:'object',properties:{path:{type:'string'},queries:{type:'array',items:{type:'string'},description:'up to 8 texts to find (case-insensitive)'},context:{type:'integer',description:'optional lines of context around each hit (0-3, default 0)'}},required:['path','queries']}},
 {name:'save_attachment',description:'Save an image the user attached in this chat into the repo as a binary file (e.g. logo.png). Staged as a draft.',parameters:{type:'object',properties:{path:{type:'string'},which:{type:'string',description:'attachment file name or 1-based index among the latest attached images; default first'}},required:['path']}},
{name:'search_attachment',description:'Search inside a file the user attached to this chat (best-matching excerpts with line numbers). Use for big attached files.',parameters:{type:'object',properties:{query:{type:'string'},name:{type:'string',description:'attached file name (optional if only one)'}},required:['query']}},
 {name:'read_attachment',description:'Read a line range of a file the user attached to this chat (max 400 lines).',parameters:{type:'object',properties:{name:{type:'string'},start_line:{type:'integer'},end_line:{type:'integer'}},required:['start_line','end_line']}},
 {name:'save_repo_notes',description:'Save a SHORT overview of this repository (purpose, structure, key files, conventions; max ~1500 chars) so that future chats already know it. Replaces previous notes.',parameters:{type:'object',properties:{notes:{type:'string'}},required:['notes']}},
 {name:'list_issues',description:'List GitHub issues of the current repo (excludes pull requests).',parameters:{type:'object',properties:{state:{type:'string',description:'open (default), closed or all'}}}},
 {name:'get_issue',description:'Read one issue with its comments.',parameters:{type:'object',properties:{number:{type:'integer'}},required:['number']}},
 {name:'create_issue',description:'Create a new issue (asks the user to confirm).',parameters:{type:'object',properties:{title:{type:'string'},body:{type:'string'}},required:['title']}},
 {name:'list_prs',description:'List pull requests of the current repo.',parameters:{type:'object',properties:{state:{type:'string',description:'open (default), closed or all'}}}},
 {name:'get_pr',description:'Read one pull request: description, changed files, reviews and review comments, and its branch name.',parameters:{type:'object',properties:{number:{type:'integer'}},required:['number']}},
 {name:'switch_branch',description:'Switch the working branch of the current repo (e.g. to a PR branch to fix review comments). Refused while there are staged draft changes.',parameters:{type:'object',properties:{branch:{type:'string'}},required:['branch']}},
 {name:'pr_description',description:'Set the pull request description (markdown) used when the user opens a PR. Summarise what and why; add "Fixes #N" to link issues.',parameters:{type:'object',properties:{body:{type:'string'}},required:['body']}},
 {name:'propose_plan',description:'Show the user a short plan and wait for approval BEFORE changing files. After calling this, stop and write one short sentence; do not make changes until the user approves.',parameters:{type:'object',properties:{summary:{type:'string',description:'1-2 plain sentences: what will change and why'},files:{type:'array',items:{type:'string'},description:'file paths that will be created/edited/deleted'},steps:{type:'array',items:{type:'string'},description:'short ordered steps'}},required:['summary','steps']}},
 {name:'scaffold',description:'Stage a ready-made project template as new draft files (skips files that already exist unless overwrite=true). Templates: static (HTML/CSS/JS site), map (Leaflet + OpenStreetMap + GeoJSON), pwa (installable offline app), react (Vite + React + GitHub Pages workflow), worker (Cloudflare Worker). Use this FIRST for a new project, then customise the files.',parameters:{type:'object',properties:{template:{type:'string',enum:['static','map','pwa','react','worker']},title:{type:'string',description:'project title'},description:{type:'string',description:'one-line description'},overwrite:{type:'boolean'}},required:['template','title']}},
 {name:'set_tasks',description:'Create/replace the project task checklist (short, ordered task titles). Use for any job with more than ~3 steps so work can resume in a later message.',parameters:{type:'object',properties:{tasks:{type:'array',items:{type:'string'}}},required:['tasks']}},
 {name:'complete_task',description:'Mark a checklist task as done (1-based index).',parameters:{type:'object',properties:{index:{type:'integer'}},required:['index']}},
 {name:'enable_pages',description:'Turn on GitHub Pages for the current repo (asks the user to confirm). mode "branch" serves the branch root (plain static sites); mode "workflow" uses GitHub Actions (Vite/React etc). The branch must already be pushed.',parameters:{type:'object',properties:{mode:{type:'string',enum:['branch','workflow']}},required:['mode']}},
 {name:'set_repo_info',description:'Set the repo description, homepage URL and topics (asks the user to confirm).',parameters:{type:'object',properties:{description:{type:'string'},homepage:{type:'string'},topics:{type:'array',items:{type:'string'}}}}},
 {name:'get_actions_log',description:'Read GitHub Actions results for the current branch. Finds the latest failed workflow run (or the given run_id) and returns the failed jobs, failed steps and the error part of the log, so you can fix the cause with edit_file/write_file. Use it when a deploy/build failed.',parameters:{type:'object',properties:{run_id:{type:'integer',description:'optional workflow run id'}}}},
 {name:'generate_image',description:'Generate an image with the image provider the user configured in Settings and stage it as a binary file in the repo (saved as JPEG, max ~896px; use a .jpg path). Needs the image provider to be set up.',parameters:{type:'object',properties:{prompt:{type:'string'},path:{type:'string',description:'e.g. images/hero.jpg'}},required:['prompt','path']}},
 {name:'search_docs',description:'Search the web for official documentation / how-to answers (needs the Tavily key from Settings > Web search). Optionally pass url to read one documentation page as text.',parameters:{type:'object',properties:{query:{type:'string'},url:{type:'string',description:'optional https URL of a docs page to read'}}}},
 {name:'read_files',description:'Read several small/medium text files of the current repo in ONE call (max 12 paths, total ~30000 chars; each file is cut if too long: use read_file with start_line for the rest). Cheaper than many read_file calls.',parameters:{type:'object',properties:{paths:{type:'array',items:{type:'string'}}},required:['paths']}},
 {name:'compare_attachment',description:'For a zip/folder the user attached: compare every text file in it with the repo (draft included) and list which are NEW, CHANGED (with +added/-removed line counts) or SAME. Use this INSTEAD of reading repo files one by one. A single top folder in the zip is stripped automatically when the repo has no such folder.',parameters:{type:'object',properties:{name:{type:'string',description:'attachment name (optional if only one zip/folder)'},strip:{type:'string',description:'optional folder prefix to remove from the zip paths'},no_strip:{type:'boolean',description:'do not auto-strip a single top folder'},only:{type:'array',items:{type:'string'},description:'optional: only these paths (after stripping)'}}}},
 {name:'apply_attachment',description:'Stage the NEW and CHANGED text files of an attached zip/folder into the repo as draft changes, WITHOUT you reading or rewriting their content (identical files are skipped). Needs plan approval when plan-first mode is on. Use compare_attachment first. Does not delete files. Afterwards review only the files you really have to, and call commit_message.',parameters:{type:'object',properties:{name:{type:'string'},strip:{type:'string'},no_strip:{type:'boolean'},only:{type:'array',items:{type:'string'},description:'optional: only these paths (after stripping)'},skip:{type:'array',items:{type:'string'},description:'optional: paths NOT to apply'}}}},
 {name:'commit_message',description:'Set a short commit message for the staged changes.',parameters:{type:'object',properties:{message:{type:'string'}},required:['message']}}
];
async function tool(c,name,a){
  if(name==='list_repos'){const l=await fetchRepos(),q=String(a.query||'').toLowerCase();return l.filter(r=>!q||r.full_name.toLowerCase().includes(q)).slice(0,60).map(r=>r.full_name+(r.private?' (private)':'')).join('\n')||'No repos'}
  if(name==='create_repo'){
    const n=String(a.name||'').trim();if(!/^[A-Za-z0-9._-]{1,100}$/.test(n))throw new Error('Invalid repo name');
    const pv=a.private!==false;
    if(!confirm('AI "'+n+'" naam e notun GitHub repo banate chay ('+(pv?'private':'public')+'). Allow?'))throw new Error('User allow kore ni');
    const j=await gh('/user/repos',{method:'POST',body:{name:n,description:String(a.description||'').slice(0,300),private:pv,auto_init:true}});
    S.repo={full:j.full_name,branch:j.default_branch||'main'};ghTree=null;ghRepos=undefined;rawSave();
    return 'Created '+j.full_name+' (branch '+S.repo.branch+') and selected it.';
  }
  if(name==='search_attachment'||name==='read_attachment'){
    const fs=chatFiles(c).filter(f=>!a.name||f.name===a.name);if(!fs.length)throw new Error('Attached file pai ni'+(a.name?' ('+a.name+')':''));
    const f=fs[fs.length-1];
    if(name==='search_attachment'){const r=retrieveChunks(f.id,f.text,String(a.query||''),14000);return f.name+' ('+r.ix.lines+' lines) matches:\n'+r.out}
    const ls=f.text.split('\n'),a0=Math.max(1,parseInt(a.start_line,10)||1),b0=Math.min(ls.length,a0+399,parseInt(a.end_line,10)||a0+99);
    return f.name+' lines '+a0+'-'+b0+' of '+ls.length+':\n'+ls.slice(a0-1,b0).map((x,i)=>(a0+i)+': '+x).join('\n').slice(0,30000);
  }
  const XR=a.repo&&String(a.repo)!==S.repo.full?String(a.repo).trim():null;
  if(XR&&['list_files','read_file','search_code'].includes(name)){
    if(!/^[\w.-]+\/[\w.-]+$/.test(XR))throw new Error('repo owner/name format e dao');
    if(name==='list_files'){
      const j=await gh('/repos/'+XR+'/git/trees/HEAD?recursive=1');let l=(j.tree||[]).filter(x=>x.type==='blob').map(x=>x.path).sort();const pre=String(a.path||'').replace(/^\/+|\/+$/g,'');
      if(pre)l=l.filter(x=>x===pre||x.startsWith(pre+'/'));
      return '['+XR+' · read-only]\n'+(l.slice(0,400).join('\n')||'(no files)')+(l.length>400?'\n... '+(l.length-400)+' more':'');
    }
    if(name==='read_file'){
      const pp=okPath(a.path),x=await gh('/repos/'+XR+'/contents/'+enc(pp),{raw:true});
      if(x.includes('\u0000'))throw new Error('Binary file');
      return sliceRead(x,a);
    }
    const q=String(a.query||'').trim();if(!q)throw new Error('query khali');
    const j=await gh('/search/code?q='+encodeURIComponent(q+' repo:'+XR)+'&per_page=12',{accept:'application/vnd.github.text-match+json'});
    return (j.items||[]).map(x=>x.path).join('\n')||'No matches';
  }
  if(name==='save_repo_notes'){const n=String(a.notes||'').slice(0,2500);S.repoNotes=Object.assign({},S.repoNotes);S.repoNotes[S.repo.full]=n;rawSave();return 'Notes saved ('+n.length+' chars)'}
  if(name==='search_code'){
    const q=String(a.query||'').trim();if(!q)throw new Error('query khali');
    {
      const t0=await getTree(),d0=dr(c),pre=String(a.path||'').replace(/^\/+|\/+$/g,''),ps=new Set(t0.paths);
      for(const [pp,f] of Object.entries(d0.files)){if(f.del)ps.delete(pp);else if(!f.bin)ps.add(pp)}
      const cand=[...ps].filter(x=>!BINX.test(x)&&(!pre||x===pre||x.startsWith(pre+'/'))).sort();
      if(cand.length&&cand.length<=(pre?80:60)&&!t0.trunc){
        const ql=q.toLowerCase(),res=new Array(cand.length);let ix=0;
        await Promise.all(Array.from({length:6},async()=>{while(ix<cand.length){const i=ix++;
          try{const x=await readFull(c,cand[i]);if(x.length>600000)continue;const ls=x.split('\n'),hits=[];ls.forEach((l,k)=>{if(l.toLowerCase().includes(ql))hits.push(k)});if(hits.length)res[i]={p:cand[i],ls,hits}}catch(e){}
        }}));
        const fl=res.filter(Boolean);if(!fl.length)return 'No matches for "'+q+'" in '+cand.length+' files of the current repo (live files, drafts included). Try another word.';
        let out='"'+q+'" in '+fl.length+' of '+cand.length+' files:\n';
        for(const r of fl.slice(0,12))out+='\n'+r.p+' ('+r.hits.length+' match'+(r.hits.length>1?'es':'')+'):\n'+r.hits.slice(0,3).map(k=>'  L'+(k+1)+': '+snip(r.ls[k],ql,180)).join('\n')+(r.hits.length>3?'\n  ... use find_in_file for all '+r.hits.length:'')+'\n';
        return out.slice(0,8000);
      }
    }
    const j=await gh('/search/code?q='+encodeURIComponent(q+' repo:'+S.repo.full)+'&per_page=12',{accept:'application/vnd.github.text-match+json'});
    const it=j.items||[];if(!it.length)return 'No matches (search only covers default branch & may lag; try list_files/read_file).';
    return it.map(x=>x.path+(x.text_matches?'\n'+x.text_matches.slice(0,2).map(m=>'  > '+String(m.fragment||'').replace(/\s+/g,' ').slice(0,200)).join('\n'):'')).join('\n');
  }
  const RF='/repos/'+S.repo.full;
  if(name==='set_tasks'){const t=(Array.isArray(a.tasks)?a.tasks:[]).map(x=>String(x).slice(0,200)).filter(Boolean).slice(0,30);if(!t.length)throw new Error('tasks khali');c.tasks=t.map(x=>({t:x,done:false}));rawSave();return 'Checklist saved ('+t.length+' tasks)'}
  if(name==='complete_task'){const i=parseInt(a.index,10)-1;if(!c.tasks||!c.tasks[i])throw new Error('Oi number er task nai');c.tasks[i].done=true;rawSave();return 'Task '+(i+1)+' done. Remaining: '+c.tasks.filter(x=>!x.done).length}
  if(name==='enable_pages'){
    let pg=null;try{pg=await gh(RF+'/pages')}catch(e){}
    if(pg)return 'Pages already on: '+(pg.html_url||'')+' (source: '+((pg.build_type==='workflow')?'GitHub Actions':(pg.source&&pg.source.branch))+')';
    if(!confirm('AI '+S.repo.full+' e GitHub Pages on korte chay ('+(a.mode==='workflow'?'GitHub Actions':S.repo.branch+' branch')+'). Allow?'))throw new Error('User allow kore ni');
    try{const j=await gh(RF+'/pages',{method:'POST',body:a.mode==='workflow'?{build_type:'workflow'}:{source:{branch:S.repo.branch,path:'/'}}});return 'Pages enabled. URL: '+(j.html_url||'https://'+S.repo.full.split('/')[0]+'.github.io/'+S.repo.full.split('/')[1]+'/')+' (first deploy takes 1-2 min)'}
    catch(e){throw new Error(e.message+' | Hint: branch ke age push korte hobe, ar token e repo (admin) permission lagbe.')}
  }
  if(name==='get_actions_log'){
    let rid=parseInt(a.run_id,10),run=null,head='';
    if(!rid){
      const j=await gh(RF+'/actions/runs?branch='+encodeURIComponent(S.repo.branch)+'&per_page=10'),rs=j.workflow_runs||[];
      if(!rs.length)return 'No workflow runs on branch '+S.repo.branch+' yet (nothing pushed, or no workflow).';
      head='Recent runs:\n'+rs.slice(0,6).map(x=>'#'+x.id+' '+(x.name||'')+' ['+x.status+'/'+(x.conclusion||'-')+'] '+String(x.head_commit&&x.head_commit.message||'').split('\n')[0].slice(0,60)).join('\n')+'\n\n';
      run=rs.find(x=>x.conclusion==='failure')||rs[0];rid=run.id;
    }else run=await gh(RF+'/actions/runs/'+rid);
    if(run.conclusion==='success')return head+'Run #'+rid+' ('+(run.name||'')+') succeeded. Nothing to fix.';
    if(run.status!=='completed')return head+'Run #'+rid+' is still '+run.status+'. Try again in a minute.';
    const jobs=((await gh(RF+'/actions/runs/'+rid+'/jobs?per_page=30')).jobs||[]).filter(x=>x.conclusion==='failure');
    let out=head+'Run #'+rid+' '+(run.name||'')+' => '+run.conclusion+' ('+(run.html_url||'')+')\n';
    if(!jobs.length)return out+'No failed job found (run was '+run.conclusion+').';
    for(const jo of jobs.slice(0,2)){
      out+='\nFAILED JOB: '+jo.name+'\nFailed steps: '+((jo.steps||[]).filter(s=>s.conclusion==='failure').map(s=>s.name).join(', ')||'?')+'\n';
      let log=null;try{log=await gh(RF+'/actions/jobs/'+jo.id+'/logs',{raw:true,accept:'application/vnd.github+json'})}catch(e){}
      if(log){
        log=log.replace(/\x1b\[[0-9;]*m/g,'').replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/gm,'');
        const ls=log.split('\n'),ei=[];ls.forEach((x,i)=>{if(/error|failed|fatal|cannot|not found|exception/i.test(x))ei.push(i)});
        const tail=ls.slice(-60).join('\n'),first=ei.length?ls.slice(Math.max(0,ei[0]-5),ei[0]+15).join('\n'):'';
        out+='\nFirst error context:\n'+first.slice(0,3000)+'\n\nLog tail:\n'+tail.slice(-4000)+'\n';
      }else{
        try{const an=await gh('/repos/'+S.repo.full+'/check-runs/'+jo.id+'/annotations');out+=(an.length?an.slice(0,10).map(x=>'- '+(x.path||'')+(x.start_line?':'+x.start_line:'')+' '+x.message).join('\n'):'(log not readable from browser; no annotations)')+'\n'}
        catch(e){out+='(log not readable: '+e.message+')\n'}
      }
    }
    return out.slice(0,14000)+'\nNow find the cause in the repo files and fix it (edit_file/write_file).';
  }
  if(name==='search_docs'){
    const u=String(a.url||'').trim();
    if(u){
      if(!/^https:\/\//i.test(u))throw new Error('url must start with https://');
      const ctl=new AbortController();curCtl=ctl;const to=setTimeout(()=>ctl.abort(),20000);
      try{const r=await fetch('https://r.jina.ai/'+u,{signal:ctl.signal});if(!r.ok)throw new Error('Page read fail '+r.status);return (await r.text()).slice(0,14000)}
      catch(e){if(e.name==='AbortError')throw new Error('Timeout');if(e instanceof TypeError)throw new Error('Network/CORS block');throw e}
      finally{clearTimeout(to)}
    }
    const q=String(a.query||'').trim();if(!q)throw new Error('query ba url dorkar');
    if(!(S.search&&S.search.key))throw new Error('Settings > Web search e Tavily key dao, tarpor docs search kaj korbe');
    const rs=await webSearch(q+' documentation');
    return rs.length?rs.map((x,i)=>'['+(i+1)+'] '+x.title+' ('+x.url+')\n'+x.content).join('\n\n'):'No results';
  }
  if(name==='set_repo_info'){
    if(!confirm('AI repo info bodlate chay (description/homepage/topics). Allow?'))throw new Error('User allow kore ni');
    const b={};if(typeof a.description==='string')b.description=a.description.slice(0,350);if(typeof a.homepage==='string')b.homepage=a.homepage.slice(0,200);
    if(Object.keys(b).length)await gh(RF,{method:'PATCH',body:b});
    if(Array.isArray(a.topics)&&a.topics.length)await gh(RF+'/topics',{method:'PUT',body:{names:a.topics.map(x=>String(x).toLowerCase().replace(/[^a-z0-9-]/g,'-').slice(0,50)).slice(0,20)}});
    return 'Repo info updated';
  }
  if(name==='list_issues'||name==='list_prs'){
    const st=['open','closed','all'].includes(a.state)?a.state:'open',pr=name==='list_prs';
    let l=pr?await gh(RF+'/pulls?state='+st+'&per_page=25'):(await gh(RF+'/issues?state='+st+'&per_page=40')).filter(x=>!x.pull_request).slice(0,25);
    return l.length?l.map(x=>'#'+x.number+' ['+x.state+'] '+x.title+(pr&&x.head?' (branch '+x.head.ref+')':'')).join('\n'):'None';
  }
  if(name==='get_issue'||name==='get_pr'){
    const n=parseInt(a.number,10);if(!(n>0))throw new Error('number dorkar');
    if(name==='get_issue'){
      const [i,cs]=await Promise.all([gh(RF+'/issues/'+n),gh(RF+'/issues/'+n+'/comments?per_page=30')]);
      return '#'+i.number+' ['+i.state+'] '+i.title+'\n'+(i.body||'(no description)').slice(0,6000)+cs.map(x=>'\n--- '+(x.user&&x.user.login)+':\n'+String(x.body||'').slice(0,2000)).join('');
    }
    const [i,fl,rv,rc]=await Promise.all([gh(RF+'/pulls/'+n),gh(RF+'/pulls/'+n+'/files?per_page=60'),gh(RF+'/pulls/'+n+'/reviews?per_page=30'),gh(RF+'/pulls/'+n+'/comments?per_page=60')]);
    return '#'+i.number+' ['+(i.merged?'merged':i.state)+'] '+i.title+'\nbranch: '+i.head.ref+' -> '+i.base.ref+'\n'+(i.body||'').slice(0,4000)+'\n\nFiles:\n'+fl.map(x=>x.status+' '+x.filename+' (+'+x.additions+' -'+x.deletions+')').join('\n')+
      (rv.filter(x=>x.body).length?'\n\nReviews:\n'+rv.filter(x=>x.body).map(x=>(x.user&&x.user.login)+' ['+x.state+']: '+x.body.slice(0,1500)).join('\n'):'')+
      (rc.length?'\n\nReview comments:\n'+rc.map(x=>(x.user&&x.user.login)+' on '+x.path+(x.line?':'+x.line:'')+': '+String(x.body).slice(0,1000)).join('\n'):'');
  }
  if(name==='create_issue'){
    const t=String(a.title||'').trim().slice(0,250);if(!t)throw new Error('title dorkar');
    if(!confirm('AI '+S.repo.full+' e issue khulte chay:\n"'+t+'"\nAllow?'))throw new Error('User allow kore ni');
    const j=await gh(RF+'/issues',{method:'POST',body:{title:t,body:String(a.body||'').slice(0,60000)}});
    return 'Created issue #'+j.number+' '+(j.html_url||'');
  }
  if(name==='switch_branch'){
    const b=String(a.branch||'').trim();if(!b)throw new Error('branch dorkar');
    if(c.draft&&dcount(c))throw new Error('Staged draft ache. Age push/discard korte hobe, tarpor branch bodlano jabe.');
    await gh(RF+'/branches/'+encodeURIComponent(b));
    S.repo=Object.assign({},S.repo,{branch:b});ghTree=null;c.draft=null;rawSave();updateChip&&updateChip();
    return 'Switched to branch '+b;
  }
  const d=dr(c);
  if(name==='scaffold'){
    const tp=TPL[a.template];if(!tp)throw new Error('Unknown template (static|map|pwa|react|worker)');
    if(needPlan(c,'scaffold',''))throw new Error('Plan approval dorkar (plan-first mode). Age propose_plan call koro, tarpor thamo ar user er approval er opekkha koro.');
    const title=String(a.title||'My Project').slice(0,80),desc=String(a.description||'A new project.').slice(0,200),slug=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'my-project';
    const t=await getTree(),added=[],skipped=[];
    for(const [p,txt] of Object.entries(tp)){
      const ex=t.paths.has(p);if(ex&&!a.overwrite){skipped.push(p);continue}
      const isH=/\.(html?|md)$/i.test(p),isJ=/\.(json|webmanifest|jsonc)$/i.test(p),q=x=>isH?esc(x):isJ?JSON.stringify(x).slice(1,-1):x;
      d.files[p]={content:txt.split('{{TITLE}}').join(q(title)).split('{{DESC}}').join(q(desc)).split('{{SLUG}}').join(slug),ex};added.push(p);
    }
    rawSave();return 'Scaffolded '+a.template+': '+added.join(', ')+(skipped.length?' | skipped existing: '+skipped.join(', '):'')+'. Now customise these files for the user\'s needs.';
  }
  if(name==='compare_attachment'||name==='apply_attachment'){
    const ap=name==='apply_attachment';
    if(ap&&needPlan(c,'apply_attachment',''))throw new Error('Plan approval dorkar (plan-first mode). Age propose_plan call koro, tarpor thamo ar user er approval er opekkha koro.');
    const fs=chatFiles(c).filter(f=>(!a.name||f.name===a.name)&&isPack(f.text));
    if(!fs.length)throw new Error('Zip/folder attachment pai ni'+(a.name?' ('+a.name+')':'')+'. User ke zip ba folder attach korte bolo.');
    const f=fs[fs.length-1],t=await getTree();
    let es=attEntries(f.id,f.text).map(e=>({path:e.name.replace(/\\/g,'/').replace(/^\.?\/+/,''),text:e.text})),strip=String(a.strip||'').replace(/^\/+|\/+$/g,''),note='';
    if(!strip&&!a.no_strip){const tops=new Set(es.map(e=>e.path.split('/')[0]));if(tops.size===1&&es.every(e=>e.path.includes('/'))){const top=[...tops][0];if(![...t.paths].some(q=>q.startsWith(top+'/'))){strip=top;note='(auto-stripped top folder "'+top+'/"; pass no_strip=true if that is wrong)\n'}}}
    if(strip)es=es.filter(e=>e.path.startsWith(strip+'/')).map(e=>({path:e.path.slice(strip.length+1),text:e.text}));
    if(Array.isArray(a.only)&&a.only.length){const on=new Set(a.only.map(x=>String(x).replace(/^\/+/,'')));es=es.filter(e=>on.has(e.path))}
    if(ap&&Array.isArray(a.skip)&&a.skip.length){const sk=new Set(a.skip.map(x=>String(x).replace(/^\/+/,'')));es=es.filter(e=>!sk.has(e.path))}
    if(!es.length)throw new Error('Kono file pai ni (strip/only/skip check koro)');
    const lim=ap?300:250,over=es.length-lim;es=es.slice(0,lim);
    const nz=x=>x.replace(/\r\n/g,'\n').trimEnd(),cur=async q=>{const df=d.files[q];if(df&&df.del)return undefined;if(df&&df.bin)return null;if(df)return df.content;if(!t.paths.has(q))return undefined;try{return await gh('/repos/'+S.repo.full+'/contents/'+enc(q)+'?ref='+encodeURIComponent(S.repo.branch),{raw:true})}catch(e){return null}};
    const res=new Array(es.length);let ix=0;
    await Promise.all(Array.from({length:6},async()=>{while(ix<es.length){const i=ix++,e=es[i];
      try{okPath(e.path)}catch(er){res[i]={st:'BAD',e,why:'invalid path'};continue}
      if(e.text.length>300000){res[i]={st:'BAD',e,why:'file too big (>300KB)'};continue}
      const o=await cur(e.path);
      if(o===undefined)res[i]={st:'NEW',e};
      else if(o===null)res[i]={st:'CHANGED',e,unk:1};
      else if(nz(o)===nz(e.text))res[i]={st:'SAME',e};
      else{const A=o.replace(/\r\n/g,'\n').split('\n'),B=e.text.replace(/\r\n/g,'\n').split('\n');let s=0;while(s<A.length&&s<B.length&&A[s]===B[s])s++;let ea=A.length,eb=B.length;while(ea>s&&eb>s&&A[ea-1]===B[eb-1]){ea--;eb--}res[i]={st:'CHANGED',e,add:eb-s,del:ea-s}}
    }}));
    const by=s=>res.filter(r=>r.st===s),nw=by('NEW'),ch=by('CHANGED'),sm=by('SAME'),bad=by('BAD');
    const ln=r=>r.e.path+(r.st==='NEW'?' ('+r.e.text.split('\n').length+' lines)':r.unk?' (binary/unreadable in repo)':' (+'+r.add+' -'+r.del+')');
    if(!ap){
      return (note+'Attachment "'+f.name+'": '+es.length+' text files compared with the repo ('+S.repo.full+' / '+S.repo.branch+'): '+nw.length+' NEW, '+ch.length+' CHANGED, '+sm.length+' SAME'+(bad.length?', '+bad.length+' skipped':'')+(over>0?', '+over+' more not compared':'')+'.\n'+
        (nw.length?'\nNEW:\n'+nw.map(ln).join('\n'):'')+(ch.length?'\n\nCHANGED:\n'+ch.map(ln).join('\n'):'')+(sm.length?'\n\nSAME (nothing to do): '+sm.map(r=>r.e.path).join(', '):'')+(bad.length?'\n\nSKIPPED: '+bad.map(r=>r.e.path+' ('+r.why+')').join(', '):'')+
        '\n\nNext: apply_attachment stages NEW+CHANGED without you rewriting them. Read a CHANGED file only if you must review it.').slice(0,14000);
    }
    const warn=[];
    for(const r of [...nw,...ch]){d.files[r.e.path]={content:r.e.text,ex:t.paths.has(r.e.path),bs:t.shas[r.e.path]};const w=lintFile(r.e.path,r.e.text);if(w.length&&warn.length<12)warn.push(r.e.path+': '+w.join('; '))}
    rawSave();
    return (note+'Staged '+(nw.length+ch.length)+' files from "'+f.name+'" ('+nw.length+' new, '+ch.length+' changed); skipped '+sm.length+' identical'+(bad.length?', '+bad.length+' invalid/too big ('+bad.map(r=>r.e.path).join(', ')+')':'')+(over>0?', '+over+' more files were over the limit of '+lim:'')+'.\n'+[...nw,...ch].map(r=>(r.st==='NEW'?'+ ':'~ ')+r.e.path).join('\n').slice(0,3000)+(warn.length?'\nWARNING (fix before finishing):\n'+warn.join('\n'):'')+'\nZip does not delete files: tell the user if some old files may need deleting.').slice(0,9000);
  }
  if(name==='propose_plan'){
    c.plan={summary:String(a.summary||'').slice(0,600),files:(Array.isArray(a.files)?a.files:[]).map(x=>String(x).slice(0,200)).slice(0,30),steps:(Array.isArray(a.steps)?a.steps:[]).map(x=>String(x).slice(0,300)).slice(0,20),ok:false};
    planStop=true;rawSave();return 'Plan shown to the user. STOP now: reply with one short sentence asking for approval. Do not change anything until the user approves.';
  }
  if(['write_file','edit_file','edit_many','delete_file','save_attachment','generate_image'].includes(name)&&a.path&&needPlan(c,name,okPath(a.path)))
    throw new Error('Plan approval dorkar (plan-first mode). Age propose_plan call koro, tarpor thamo ar user er approval er opekkha koro.');
  if(name==='save_attachment'){
    const p=okPath(a.path),all=[];
    for(const m of [...c.msgs].reverse()){if(m.role==='user'&&m.imgs&&m.imgs.some(i=>/^image\//.test(i.mime))){m.imgs.filter(i=>/^image\//.test(i.mime)).forEach(i=>all.push(i));break}}
    if(!all.length)throw new Error('Chat e kono image attach kora nai');
    const w=String(a.which||'1'),im=/^\d+$/.test(w)?all[+w-1]:all.find(i=>i.name===w);
    if(!im)throw new Error('Oi attachment pai ni');
    if(im.data.length>2.5e6)throw new Error('Image onek boro (max ~1.8MB)');
    const t=await getTree();d.files[p]={bin:im.data,mime:im.mime,ex:t.paths.has(p),bs:t.shas[p]};rawSave();
    return 'Staged binary '+p+' ('+Math.round(im.data.length*0.75/1024)+' KB)';
  }
  if(name==='generate_image'){
    const p=okPath(a.path),pr=String(a.prompt||'').trim();if(!pr)throw new Error('prompt dorkar');
    if(!imgReady())throw new Error('Image provider set kora nai. Settings > Image generation e URL, key, model dao.');
    if(!/\.(jpe?g)$/i.test(p))throw new Error('Path .jpg hote hobe (image JPEG hishebe save hoy)');
    if(!confirm('AI chobi banate chay ('+S.imgcfg.model+', tomar API credit lagbe):\n"'+pr.slice(0,150)+'"\n→ '+p+'\nAllow?'))throw new Error('User allow kore ni');
    const pic=await genImage(pr),b=String(pic).split(',')[1];
    if(!b||!/^data:image\//.test(pic))throw new Error('Image pawa gelo na (CORS ba format)');
    if(b.length>2.5e6)throw new Error('Image onek boro');
    const t=await getTree();d.files[p]={bin:b,mime:'image/jpeg',ex:t.paths.has(p),bs:t.shas[p]};rawSave();
    return 'Generated and staged '+p+' ('+Math.round(b.length*0.75/1024)+' KB). Use it in the project (e.g. <img src="'+p+'">).';
  }
  if(name==='pr_description'){d.prBody=String(a.body||'').slice(0,60000);rawSave();return 'PR description saved'}
  if(name==='commit_message'){d.msg=String(a.message||'').slice(0,200);rawSave();return 'ok'}
  if(name==='list_files'){
    const t=await getTree(),ps=new Set(t.paths);
    for(const [p,f] of Object.entries(d.files)){if(f.del)ps.delete(p);else ps.add(p)}
    let l=[...ps].sort();const pre=String(a.path||'').replace(/^\/+|\/+$/g,'');
    if(pre)l=l.filter(x=>x===pre||x.startsWith(pre+'/'));
    return (l.length?l.slice(0,400).join('\n'):(t.empty?'(repo empty)':'(no files)'))+(l.length>400?'\n... '+(l.length-400)+' more':'')+(t.trunc?'\n(tree truncated by GitHub)':'');
  }
  if(name==='read_files'){
    const ps=(Array.isArray(a.paths)?a.paths:[]).map(x=>String(x)).slice(0,12);if(!ps.length)throw new Error('paths khali');
    const per=Math.max(2500,Math.floor(30000/ps.length));let out='';
    for(const q of ps){
      try{const pp=okPath(q),x=await readFull(c,pp);out+='\n=== '+pp+' ('+x.split('\n').length+' lines) ===\n'+(x.length>per?x.slice(0,per)+'\n[... cut at '+per+' chars of '+x.length+'; use read_file with start_line for the rest]':x)+'\n'}
      catch(e){out+='\n=== '+q+' ===\nError: '+e.message+'\n'}
    }
    return out.trim();
  }
  if(name==='rename_file'){
    const from=okPath(a.from),to=okPath(a.to);if(from===to)throw new Error('from ar to ek-i');
    if(needPlan(c,'delete_file',from))throw new Error('Plan approval dorkar (plan-first mode). Age propose_plan call koro, tarpor thamo ar user er approval er opekkha koro.');
    const d=dr(c),t=await getTree(),df=d.files[from];
    if(d.files[to]||t.paths.has(to))throw new Error(to+' already ache (ba staged ache). Onno nam dao.');
    if(df&&df.del)throw new Error(from+' er delete already staged');
    if(df&&df.bin)throw new Error('Binary file rename korte pari na (draft e image)');
    let content;
    if(df)content=df.content;
    else{if(!t.paths.has(from))throw new Error('File nai: '+from+' (shudhu file rename hoy, folder na)');content=await readFull(c,from)}
    if(df&&!df.ex)delete d.files[from];else d.files[from]={del:1,ex:true,bs:(df&&df.bs)||t.shas[from]};
    d.files[to]={content,ex:false};if(t.modes[from]&&t.modes[from]!=='100644')d.files[to].mode=t.modes[from];
    rawSave();
    return 'Staged rename '+from+' → '+to+' ('+content.split('\n').length+' lines, content not touched). Update references (imports, links, src) to the old path if any: use search_code for "'+from.split('/').pop()+'".';
  }
  if(name==='find_in_file'){
    const qs=(Array.isArray(a.queries)&&a.queries.length?a.queries:[a.query]).map(x=>String(x==null?'':x).trim()).filter(Boolean).slice(0,8);
    if(!qs.length)throw new Error('queries dorkar');
    const pp=okPath(a.path),x=await readFull(c,pp),ls=x.split('\n'),cx=Math.min(3,Math.max(0,parseInt(a.context,10)||0));
    let out='['+pp+': '+ls.length+' lines, '+x.length+' chars]\n';
    for(const q of qs){
      const ql=q.toLowerCase(),hits=[];ls.forEach((l,i)=>{if(l.toLowerCase().includes(ql))hits.push(i)});
      out+='\n"'+q+'": '+(hits.length?hits.length+' match'+(hits.length>1?'es':''):'no match')+'\n';
      hits.slice(0,10).forEach(i=>{
        if(!cx)out+='L'+(i+1)+': '+snip(ls[i],ql)+'\n';
        else{const s=Math.max(0,i-cx);out+=ls.slice(s,i+cx+1).map((l,k)=>'L'+(s+k+1)+(s+k===i?'> ':'  ')+snip(l,ql,160)).join('\n')+'\n--\n'}
      });
      if(hits.length>10)out+='... '+(hits.length-10)+' more\n';
    }
    return out.slice(0,9000);
  }
  const p=okPath(a.path);
  if(name==='read_file'){
    const dv=d.files[p],key=p+'|'+(a.start_line||'')+'|'+(a.end_line||'')+'|'+(dv?(dv.del?'d':String((dv.content||'').length)):'-'),last=RDG.get(key);
    if(last!==undefined&&TOOLNO-last<=5)return 'You already read exactly this ('+p+(a.start_line||a.end_line?' lines '+(a.start_line||1)+'-'+(a.end_line||'end'):'')+') '+(TOOLNO-last)+' tool call(s) ago and it is still above in this conversation. Do not read it again: use what you have, or call find_in_file to locate something else.';
    const r=sliceRead(await readFull(c,p),a);RDG.set(key,TOOLNO);return r;
  }
  if(name==='write_file'){
    if(typeof a.content!=='string')throw new Error('content dorkar');
    if(a.content.length>300000)throw new Error('File onek boro (max 300KB)');
    const t=await getTree();
    if(t.paths.has(p)){let o=null;try{o=await gh('/repos/'+S.repo.full+'/contents/'+enc(p)+'?ref='+encodeURIComponent(S.repo.branch),{raw:true})}catch(e){}
      if(o!==null&&o.trimEnd()===a.content.trimEnd()){delete d.files[p];rawSave();return 'NO CHANGE: new content is identical to the current file, nothing staged. Tell the user the file already looks like this.'}}
    d.files[p]={content:a.content,ex:t.paths.has(p),bs:t.shas[p]};rawSave();
    return 'Staged '+p+' ('+a.content.split('\n').length+' lines)'+lintNote(p,a.content);
  }
  if(name==='edit_file'){
    const o=String(a.old_text||'');if(!o)throw new Error('old_text khali');
    const cur=await readFull(c,p),n=cur.split(o).length-1;
    if(n!==1)throw new Error(n?'old_text '+n+' jaygay ache, aro boro kore dao':'old_text file e nai');
    if(o===String(a.new_text||''))throw new Error('old_text ar new_text same, kono change nai');
    const t=await getTree(),nc=cur.replace(o,()=>String(a.new_text||''));d.files[p]={content:nc,ex:t.paths.has(p),bs:t.shas[p]};rawSave();
    return 'Edited '+p+lintNote(p,nc);
  }
  if(name==='edit_many'){
    const es=Array.isArray(a.edits)?a.edits:[];if(!es.length)throw new Error('edits khali');
    let cur=await readFull(c,p);
    es.forEach((e,i)=>{const o=String(e&&e.old_text||'');if(!o)throw new Error('edit #'+(i+1)+': old_text khali');const n=cur.split(o).length-1;if(n!==1)throw new Error('edit #'+(i+1)+': '+(n?'old_text '+n+' jaygay ache':'old_text file e nai')+' (kono change apply hoyni)');cur=cur.replace(o,()=>String(e.new_text||''))});
    const t=await getTree();d.files[p]={content:cur,ex:t.paths.has(p),bs:t.shas[p]};rawSave();
    return 'Edited '+p+' ('+es.length+' changes)'+lintNote(p,cur);
  }
  if(name==='delete_file'){
    const t=await getTree(),f=d.files[p];
    if(f&&!f.ex){delete d.files[p];rawSave();return 'Removed draft file '+p}
    if(!t.paths.has(p)&&!t.trunc)throw new Error('File nai: '+p);
    d.files[p]={del:1,ex:true,bs:t.shas[p]};rawSave();return 'Staged delete of '+p;
  }
  throw new Error('Unknown tool '+name);
}
