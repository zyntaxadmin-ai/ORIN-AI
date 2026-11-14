/* Orin · agent — agent loop: history trimming, provider calls, system prompt, runAgent.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
const sp=x=>{try{return typeof x==='string'?JSON.parse(x||'{}'):(x||{})}catch(e){return {}}};
const cacheLast=msgs=>{const m=msgs[msgs.length-1];if(!m)return msgs;if(typeof m.content==='string')m.content=[{type:'text',text:m.content,cache_control:{type:'ephemeral'}}];else if(Array.isArray(m.content)&&m.content.length){const b=m.content[m.content.length-1];if(b&&b.type!=='thinking')b.cache_control={type:'ephemeral'}}return msgs};
function shrinkArgs(a){
  if(!a||typeof a!=='object')return a;
  const o=Object.assign({},a);
  for(const k of ['content','old_text','new_text','body','notes'])if(typeof o[k]==='string'&&o[k].length>400)o[k]=o[k].slice(0,150)+'\n[... '+o[k].length+' chars left out of the history to save tokens; the change itself is already staged]';
  if(Array.isArray(o.edits))o.edits=o.edits.map(e=>e&&typeof e==='object'?shrinkArgs(e):e);
  return o;
}
function trimWork(work){
  /* everything below is re-sent on every step, so: keep the last 4 tool results whole, shrink older big ones,
     and cut the big arguments (file contents) of tool calls older than the last 2 turns */
  const ti=[],ai=[],info=new Map();work.forEach((w,i)=>{if(w.role==='tool')ti.push(i);else{ai.push(i);(w.calls||[]).forEach(k=>info.set(k.id,k))}});
  const oldT=new Set(ti.slice(0,-6)),oldA=new Set(ai.slice(0,-2));
  return work.map((w,i)=>{
    if(w.role==='tool'){
      if(!(oldT.has(i)&&w.result.length>3000))return w;
      const k=info.get(w.id),aa=(k&&k.args)||{},what=w.name+(aa.path?' '+aa.path:'')+(aa.start_line||aa.end_line?' lines '+(aa.start_line||1)+'-'+(aa.end_line||'end'):'')+(aa.query?' "'+aa.query+'"':'');
      return Object.assign({},w,{result:w.result.slice(0,800)+'\n[... older output of '+what+' ('+w.result.length+' chars) trimmed to save tokens. If you still need it, read ONLY the part you need with a narrow start_line/end_line (find_in_file gives line numbers).]'});
    }
    if(!oldA.has(i)||!w.calls)return w;
    const nw=Object.assign({},w,{calls:w.calls.map(k=>Object.assign({},k,{args:shrinkArgs(k.args)}))});
    if(w.raw)nw.raw=w.raw.map(pt=>pt&&pt.functionCall?Object.assign({},pt,{functionCall:Object.assign({},pt.functionCall,{args:shrinkArgs(pt.functionCall.args)})}):pt);
    return nw;
  });
}
function agentCall0(p,history,work0,sys){
  const work=trimWork(work0);
  const base=p.url.replace(/\/+$/,'');let url,headers={'Content-Type':'application/json'},body,tr=null;
  if(p.type==='anthropic'){
    url=base+'/v1/messages';headers['x-api-key']=p.key;headers['anthropic-version']='2023-06-01';headers['anthropic-dangerous-direct-browser-access']='true';
    const msgs=history.map(m=>cv(p,m));
    for(const w of work){
      if(w.role==='assistant'){tr=null;msgs.push({role:'assistant',content:(w.text?[{type:'text',text:w.text}]:[]).concat(w.calls.map(k=>({type:'tool_use',id:k.id,name:k.name,input:k.args})))})}
      else{const b={type:'tool_result',tool_use_id:w.id,content:w.result};if(tr)tr.content.push(b);else{tr={role:'user',content:[b]};msgs.push(tr)}}
    }
    const tl=TOOLS.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}));tl[tl.length-1].cache_control={type:'ephemeral'};
    body={model:p.model,max_tokens:8192,stream:true,system:[{type:'text',text:sys,cache_control:{type:'ephemeral'}}],messages:cacheLast(msgs),tools:tl};
  }else if(p.type==='gemini'){
    url=base+'/v1beta/models/'+encodeURIComponent(p.model.trim().replace(/^models\//,'').replace(/\s+/g,'-').toLowerCase())+':streamGenerateContent?alt=sse&key='+encodeURIComponent(p.key);
    const cs=history.map(m=>cv(p,m));
    for(const w of work){
      if(w.role==='assistant'){tr=null;cs.push({role:'model',parts:w.raw||(w.text?[{text:w.text}]:[]).concat(w.calls.map(k=>({functionCall:{name:k.name,args:k.args}})))})}
      else{const b={functionResponse:{name:w.name,response:{result:w.result}}};if(tr)tr.parts.push(b);else{tr={role:'user',parts:[b]};cs.push(tr)}}
    }
    body={contents:cs,systemInstruction:{parts:[{text:sys}]},tools:[{functionDeclarations:TOOLS}]};
  }else{
    url=base+'/chat/completions';if(p.key)headers.Authorization='Bearer '+p.key;
    const msgs=[{role:'system',content:sys}].concat(history.map(m=>cv(p,m)));
    for(const w of work){
      if(w.role==='assistant')msgs.push({role:'assistant',content:w.text||null,tool_calls:w.calls.map(k=>({id:k.id,type:'function',function:{name:k.name,arguments:JSON.stringify(k.args)}}))});
      else msgs.push({role:'tool',tool_call_id:w.id,content:w.result});
    }
    body={model:p.model,messages:msgs,stream:true,tools:TOOLS.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}))};
  }
  return {url,headers,body};
}
async function agentCall(p,history,work,sys,onLive){
  const ctl=new AbortController();curCtl=ctl;let to=setTimeout(()=>ctl.abort(),120000);
  try{
    const {url,headers,body}=agentCall0(p,history,work,sys);const isz=JSON.stringify(body).length;
    if(p.type==='openai'&&/api\.(openai|groq|deepseek|together)\.|openrouter\.ai/.test(p.url))body.stream_options={include_usage:true};
    const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:ctl.signal});
    let text='',calls=[],raw,us=null;
    const ct=r.headers.get('content-type')||'';
    if(!r.ok||!/event-stream/.test(ct)){
      const j=await r.json().catch(()=>({}));
      if(!r.ok){const e=Array.isArray(j)?j[0]:j,x=e&&e.error;throw new Error((x&&(typeof x==='string'?x:x.message||JSON.stringify(x)))||r.status+' '+r.statusText)}
      if(p.type==='anthropic'){
        for(const b of j.content||[]){if(b.type==='text')text+=b.text;else if(b.type==='tool_use')calls.push({id:b.id,name:b.name,args:b.input||{}})}
        if(j.usage){const k=j.usage.cache_read_input_tokens||0;us={i:(j.usage.input_tokens||0)+k+(j.usage.cache_creation_input_tokens||0),o:j.usage.output_tokens||0,k}}
      }else if(p.type==='gemini'){
        const jj=Array.isArray(j)?j[0]:j;const parts=(jj.candidates&&jj.candidates[0]&&jj.candidates[0].content&&jj.candidates[0].content.parts)||[];raw=parts.length?parts:undefined;
        parts.forEach((x,i)=>{if(x.text&&!x.thought)text+=x.text;if(x.functionCall)calls.push({id:'g'+Date.now().toString(36)+i,name:x.functionCall.name,args:x.functionCall.args||{}})});
        if(jj.usageMetadata)us={i:jj.usageMetadata.promptTokenCount||0,o:(jj.usageMetadata.candidatesTokenCount||0)+(jj.usageMetadata.thoughtsTokenCount||0)};
      }else{
        const m=j.choices&&j.choices[0]&&j.choices[0].message;if(!m)throw new Error('Empty reply');
        text=typeof m.content==='string'?m.content:Array.isArray(m.content)?m.content.map(x=>x.text||'').join(''):'';
        calls=(m.tool_calls||[]).filter(t=>t.function).map(t=>({id:t.id||('c'+Math.random().toString(36).slice(2,9)),name:t.function.name,args:sp(t.function.arguments)}));
        if(j.usage&&j.usage.prompt_tokens!=null)us={i:j.usage.prompt_tokens||0,o:j.usage.completion_tokens||0};
      }
    }else{
      const rd=r.body.getReader(),dec=new TextDecoder();let buf='';const tc={},ab={},gp=[];us=null;
      const note=()=>{if(onLive){const pend=Object.values(tc).concat(Object.values(ab)).map(x=>x.name).filter(Boolean).pop();onLive(text,pend)}};
      for(;;){
        clearTimeout(to);to=setTimeout(()=>ctl.abort(),60000);
        const {done,value}=await rd.read();if(done)break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split('\n');buf=lines.pop();
        for(const ln of lines){
          if(!ln.startsWith('data:'))continue;
          const d=ln.slice(5).trim();if(!d||d==='[DONE]')continue;
          let j;try{j=JSON.parse(d)}catch(_){continue}
          if(j.error)throw new Error((typeof j.error==='string'?j.error:j.error.message)||JSON.stringify(j.error));
          if(p.type==='anthropic'){
            if(j.type==='message_start'&&j.message&&j.message.usage){const mu=j.message.usage,k=mu.cache_read_input_tokens||0;us={i:(mu.input_tokens||0)+k+(mu.cache_creation_input_tokens||0),o:mu.output_tokens||0,k}}
            else if(j.type==='message_delta'&&j.usage)us=Object.assign(us||{i:0,o:0},{o:j.usage.output_tokens||0});
            else if(j.type==='content_block_start'&&j.content_block&&j.content_block.type==='tool_use'){ab[j.index]={id:j.content_block.id,name:j.content_block.name,js:''}}
            else if(j.type==='content_block_delta'&&j.delta){
              if(j.delta.type==='text_delta'){text+=j.delta.text||''}
              else if(j.delta.type==='input_json_delta'&&ab[j.index])ab[j.index].js+=j.delta.partial_json||'';
            }
          }else if(p.type==='gemini'){
            const u=j.usageMetadata;if(u)us={i:u.promptTokenCount||0,o:(u.candidatesTokenCount||0)+(u.thoughtsTokenCount||0)};
            for(const x of (j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]){
              gp.push(x);if(x.text&&!x.thought)text+=x.text;
              if(x.functionCall)calls.push({id:'g'+Date.now().toString(36)+calls.length,name:x.functionCall.name,args:x.functionCall.args||{}});
            }
          }else{
            if(j.usage&&(j.usage.prompt_tokens!=null||j.usage.completion_tokens!=null))us={i:j.usage.prompt_tokens||0,o:j.usage.completion_tokens||0};
            const dl=j.choices&&j.choices[0]&&j.choices[0].delta;if(!dl)continue;
            if(typeof dl.content==='string')text+=dl.content;
            for(const t of dl.tool_calls||[]){const k=t.index!=null?t.index:0,o=tc[k]||(tc[k]={id:'',name:'',js:''});if(t.id)o.id=t.id;if(t.function){if(t.function.name)o.name+=t.function.name;if(t.function.arguments)o.js+=t.function.arguments}}
          }
        }
        note();
      }
      if(p.type==='anthropic')calls=Object.keys(ab).sort((x,y)=>x-y).map(k=>({id:ab[k].id,name:ab[k].name,args:sp(ab[k].js)}));
      else if(p.type==='gemini')raw=gp.length?gp:undefined;
      else calls=Object.keys(tc).sort((x,y)=>x-y).map(k=>tc[k]).filter(t=>t.name).map(t=>({id:t.id||('c'+Math.random().toString(36).slice(2,9)),name:t.name,args:sp(t.js)}));
    }
    if(!text.trim()&&!calls.length)throw new Error('Empty reply');
    if(!us)us={i:Math.ceil(isz/3),o:Math.ceil((text.length+JSON.stringify(calls).length)/3),e:1};
    return {text,calls,raw,us};
  }catch(e){
    if(e.name==='AbortError')throw new Error(stopped?'STOP':'Timeout');
    if(e instanceof TypeError)throw new Error('Network/CORS block');
    throw e;
  }finally{clearTimeout(to)}
}
const buildHistory=(c,agent)=>{const lz=agent?lazyPlan(c):null,sm=lz||smartPlan(c);{const lu=[...c.msgs].reverse().find(m=>m.role==='user');if(lu){if(sm&&!lz)lu.sm=sm.n;else delete lu.sm}}let h=c.msgs.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role,content:m.role==='user'?fullText(m,sm)+webCtx(m):m.content,imgs:m.imgs}));if(h.length>60){h=h.slice(-60);while(h.length&&h[0].role!=='user')h.shift()}return h};
function attachNote(c){const fs=chatFiles(c);if(!fs.length)return '';const sm=smartPlan(c);return '\nFiles attached by the user in this chat: '+fs.map(f=>f.name+' ('+f.text.split('\n').length+' lines)').join(', ')+'.'+(sm?' They are too big for the context, so only excerpts are included in the messages; use search_attachment and read_attachment to look at other parts.':'')+(lazyPlan(c)?' Big attached files are not pasted in the messages (to save tokens): for a zip/folder of updated files call compare_attachment and then apply_attachment instead of reading and rewriting each file; use search_attachment/read_attachment for anything else.':'')}
function taskNote(c){if(!c.tasks||!c.tasks.length)return '';return '\nTASK CHECKLIST (continue with the first unfinished task, call complete_task after each):\n'+c.tasks.map((x,i)=>(i+1)+'. ['+(x.done?'x':' ')+'] '+x.t).join('\n')}
function agentSys(c){return agentSys0(c)+attachNote(c)+planNote(c)+taskNote(c)}
function planNote(c){
  const m=S.planMode||'big';let t='';
  if(c.plan&&c.plan.ok)t+='\nAPPROVED PLAN (the user approved it, now implement it): '+c.plan.summary+(c.plan.steps.length?' Steps: '+c.plan.steps.join(' | '):'')+(c.plan.files.length?' Files: '+c.plan.files.join(', '):'');
  else if(m==='always')t+='\nPLAN-FIRST MODE: before changing ANY file, call propose_plan (plain-language summary, files, steps) and then stop and wait for the user to approve. Edits are blocked until then.';
  else if(m==='big')t+='\nPLAN-FIRST MODE: you may edit a single file directly. If the task needs changing more than one file or deleting a file, first call propose_plan (plain-language summary, files, steps), then stop and wait for approval. Edits to a second file are blocked until the user approves.';
  return t;
}
function agentSys0(c){
  const d=dr(c),fs=Object.entries(d.files).map(([p,f])=>p+(f.del?' (delete)':'')).join(', ');
  return (S.system.trim()?S.system.trim()+'\n\n':'')+'[GitHub agent mode]\nYou are a coding agent working in the GitHub repository "'+S.repo.full+'" (branch '+S.repo.branch+') through tools. The user is not technical: explain simply, in the same language the user writes in. Rules: be economical, every step and token costs the user money: call list_files once, read ONLY the files you must change or really need (use search_code, read_files for several small files, and read_file with start_line/end_line instead of whole big files), never re-read a file you already read, to move or rename a file call rename_file (never rewrite its content), and when tool calls are independent make them ALL in the same turn instead of one per turn; never guess the content of an existing file; use write_file with COMPLETE file content for new files or full rewrites, and edit_file for small precise changes; keep changes minimal and working. Your changes are only STAGED as a draft; the user pushes them with a button, so never say they were pushed. Call commit_message once with a short commit message. For issues and pull requests use list_issues/get_issue/list_prs/get_pr; to fix review comments on a PR, get_pr then switch_branch to its branch, make the fixes, and tell the user to push (direct push updates the PR). When the pull-request mode is on'+(S.pushMode==='pr'?' (it IS on now)':'')+', ALWAYS call pr_description with a clear summary (add "Fixes #N" when relevant). For a BIG file (hundreds of lines) never page through it: read_file without a range only gives an outline. Call find_in_file with SEVERAL queries at once (function names, ids, strings) to get line numbers, then read_file with a narrow start_line/end_line (about 80-150 lines) around them and make your edit right away. search_code searches the current live files (staged drafts included) and gives line numbers; it is not a web index, so it is always up to date. Never read the same range twice. Never tell the user you cannot read a large file. For a NEW project call scaffold first (static, map, pwa, react or worker) and then customise; for jobs with more than ~3 steps call set_tasks and tick them with complete_task. After the first push, offer enable_pages (static/map/pwa: mode branch; react: mode workflow) and set_repo_info. When a deploy/build fails call get_actions_log, find the cause and fix the files; use search_docs when unsure about an API or tool, and generate_image when the project needs a picture (needs image provider in Settings). Tool results may end with WARNING lines (syntax errors or possible secrets): fix them before finishing. NEVER write real API keys, tokens or passwords into files: use placeholders and a .env.example, and mention it to the user. Images the user attached can be committed with save_attachment. read_file/list_files/search_code accept a repo parameter (owner/name) to read OTHER repos (read-only). Use search_code to find where something is used across the repo, and edit_many for several changes in one file. Repo notes starting with [auto] are a rough machine summary: if you have already read the key files while doing the task, call save_repo_notes once with a better short overview (purpose, structure, conventions) before your final answer; NEVER read extra files only to write notes, and always call it when the user asks you to remember/save the repo. Finish with a short plain summary of what you changed.'+((S.repoNotes&&S.repoNotes[S.repo.full])?'\nSaved repo notes (may be outdated, verify if unsure):\n'+S.repoNotes[S.repo.full]:'')+(fs?'\nCurrently staged draft files: '+fs:'')+'\nToday: '+new Date().toDateString();
}
const dlabel=k=>{const a=k.args||{},p=a.path||a.name||'';return ({list_repos:'box:repo list',list_files:'folder:list '+p,read_file:'file:read '+p,write_file:'edit:write '+p,edit_file:'scissors:edit '+p,delete_file:'trash:delete '+p,create_repo:'plusc:create repo '+p,commit_message:'chat:commit message',edit_many:'scissors:edit '+p+' ('+((k.args&&k.args.edits)||[]).length+')',search_code:'search:search '+(a.query||''),list_issues:'issue:issues',get_issue:'issue:issue #'+(a.number||''),create_issue:'plusc:issue '+(a.title||''),list_prs:'pr:PR list',get_pr:'pr:PR #'+(a.number||''),switch_branch:'branch:branch '+(a.branch||''),pr_description:'note:PR description',scaffold:'box:scaffold '+(a.template||''),set_tasks:'note:task list',complete_task:'okc:task '+(a.index||'')+' done',enable_pages:'globe:enable Pages',set_repo_info:'note:repo info',propose_plan:'note:plan',search_attachment:'search:file e khujchi: '+(a.query||''),read_attachment:'file:file lines '+(a.start_line||'')+'-'+(a.end_line||''),save_attachment:'image:save image '+p,save_repo_notes:'spark:repo notes save',read_files:'file:read '+((a.paths||[]).length)+' files',rename_file:'edit:rename '+(a.from||'')+' → '+(a.to||''),find_in_file:'search:find '+((a.queries&&a.queries.join(', '))||a.query||'')+' in '+p,compare_attachment:'search:zip vs repo',apply_attachment:'edit:zip theke stage',get_actions_log:'wrench:Actions log porchi',generate_image:'image:generate image '+p,search_docs:'search:docs: '+(a.query||a.url||'')})[k.name]||k.name};
async function ensureNotes(c){
  const R=S.repo.full;if(S.repoNotes&&S.repoNotes[R])return;
  const t=await getTree();if(t.empty||!t.paths.size)return;
  const ps=[...t.paths].sort(),top={};
  ps.forEach(x=>{const i=x.indexOf('/'),k=i<0?'(root files)':x.slice(0,i)+'/';top[k]=(top[k]||0)+1});
  let rd='';const rp=ps.find(x=>/^readme(\.md)?$/i.test(x));
  if(rp){try{rd=(await readFull(c,rp)).replace(/\s+/g,' ').slice(0,500)}catch(e){}}
  const key=ps.filter(x=>!x.includes('/')).slice(0,25).join(', ');
  const n=('[auto] '+ps.length+' files. Folders: '+Object.entries(top).slice(0,15).map(([k,v])=>k+' ('+v+')').join(', ')+'. Root files: '+key+'.'+(rd?' README: '+rd:'')).slice(0,1500);
  S.repoNotes=Object.assign({},S.repoNotes);S.repoNotes[R]=n;rawSave();
}
let planStop=false;
function needPlan(c,name,p){
  const m=S.planMode||'big';if(m==='off'||(c.plan&&c.plan.ok))return false;
  if(m==='always'||name==='scaffold'||name==='apply_attachment')return true;
  const d=c.draft;return name==='delete_file'||!!(d&&d.files&&Object.keys(d.files).length&&!(p in d.files));
}
async function runAgent(c,list){
  RFC.clear();RDG.clear();TOOLNO=0;
  try{await ensureNotes(c)}catch(e){}
  const history=buildHistory(c,true),work=[],log=[],fails=[],sys=agentSys(c);
  let pi=0,final='',by='',done=false,failedAll=false;const tot={i:0,o:0,c:0,e:0,hc:0,k:0};
  try{
    for(let step=0;step<40&&!stopped&&!done&&!failedAll;step++){
      let res=null;
      while(pi<list.length&&!stopped){
        try{res=await agentCall(list[pi],history,work,sys,(t,pn)=>{live=(log.length?log.map(l=>'- '+logTxt(l)).join('\n')+'\n\n':'')+(t||'')+(pn?'\n→ '+pn+'…':'');draw()});by=list[pi].name;break}
        catch(e){if(stopped||e.message==='STOP')break;fails.push(list[pi].name+': '+e.message);pi++}
      }
      if(!res){if(!stopped)failedAll=true;break}
      {const u=res.us,pp=list[pi],k=u.k||0;tot.i+=u.i;tot.o+=u.o;tot.k+=k;if(u.e)tot.e=1;if(pp.pin||pp.pout){tot.c+=((u.i-k+k*0.1)*(+pp.pin||0)+u.o*(+pp.pout||0))/1e6;tot.hc=1}}
      if(!res.calls.length){final=res.text;done=true;break}
      work.push({role:'assistant',text:res.text,calls:res.calls,raw:res.raw});
      for(const k of res.calls){
        log.push(dlabel(k));live=log.map(l=>'- '+logTxt(l)).join('\n');draw();
        let out;TOOLNO++;try{out=await tool(c,k.name,k.args||{})}catch(e){out='Error: '+e.message}
        work.push({role:'tool',id:k.id,name:k.name,result:String(out).slice(0,66000)});
      }
      if(planStop){planStop=false;final=(res.text||'').trim()||'Plan ready. Niche dekho, thik hole Approve koro.';done=true;break}
    }
  }catch(e){fails.push('agent: '+e.message);failedAll=!done&&!stopped}
  const src=srcOf(c),u=tot.i||tot.o?{i:tot.i,o:tot.o,k:tot.k||undefined,e:tot.e||undefined,c:tot.hc?tot.c:undefined}:undefined;
  if(done)c.msgs.push({role:'assistant',content:final.trim()||(dcount(c)?'Kaj sesh. Niche draft dekho.':'Done.'),by,skipped:fails.slice(),log,src,u});
  else if(stopped){if(log.length)c.msgs.push({role:'assistant',content:'Stopped.',by,skipped:[],log,u})}
  else if(failedAll)c.msgs.push({role:'error',content:'Sob provider fail korse. Agent mode e model ke tool calling support korte hobe.\n'+fails.join('\n')});
  else c.msgs.push({role:'assistant',content:'Step limit e pouchhe gechhi. "continue" likho.',by,skipped:[],log,u});
  busy=false;live='';setBusyUI(false);save();render();
}
const logParse=l=>{const m=/^([a-z]+):(.*)$/s.exec(l);return m&&IX[m[1]]?[m[1],m[2]]:[null,String(l).replace(/^[^\w#\s]+\uFE0F?\s*/u,'')]};
const logTxt=l=>logParse(l)[1];
const logHTML=m=>m.log&&m.log.length?'<details class="lg"><summary>'+ico('wrench',14)+m.log.length+' step</summary>'+m.log.map(l=>{const [k,t]=logParse(l);return (k?ico(k,14):'')+esc(t)}).join('<br>')+'</details>':'';
