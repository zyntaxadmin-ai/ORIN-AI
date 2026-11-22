/* Orin · connectors — link other services (Vercel, Netlify, Cloudflare, Render, Supabase, Notify, MCP servers, any API)
   so the agent can read their deploys, logs and data and act on them (always asking before it changes something).
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html.

   A connector is a plain object:
     {id, name, ic, desc, help, fields:[{k,label,ph,type}], isOn(cfg), test(cfg), tools:[{name, description, parameters, run(a,cfg), confirm(a)}]}
   Add one with cnRegister({...}); it then shows up in Settings → Connectors and its tools reach the agent.
   Tokens live in S.cn (this device only, never synced). */

const CN_REG=[];
function cnRegister(c){const i=CN_REG.findIndex(x=>x.id===c.id);if(i>=0)CN_REG[i]=c;else CN_REG.push(c)}
const cnGet=id=>(S.cn&&S.cn[id])||{};
function cnSet(id,o){S.cn=Object.assign({},S.cn);S.cn[id]=Object.assign({},S.cn[id],o);rawSave()}
let cnView='',cnRes='';

/* ---------- HTTP ----------
   In the Android app requests go through the phone's own network stack (no CORS). In a browser they use fetch();
   services that do not allow browsers can be reached through your own proxy (Settings → Connectors → Browser access). */
async function cnHttp(url,opt){
  opt=opt||{};
  const h=Object.assign({Accept:'application/json'},opt.headers||{});
  const body=opt.body,isObj=body!=null&&typeof body!=='string';
  if(isObj)h['Content-Type']='application/json';
  const method=opt.method||'GET';
  const N=(typeof NATIVE!=='undefined'&&NATIVE&&typeof NP==='function')?NP('CapacitorHttp'):null;
  if(N){
    const r=await N.request({url,method,headers:h,data:body==null?undefined:body,responseType:'text',connectTimeout:15000,readTimeout:(opt.timeout||30000)});
    const hd={};for(const k in (r.headers||{}))hd[k.toLowerCase()]=r.headers[k];
    const tx=typeof r.data==='string'?r.data:JSON.stringify(r.data);
    return {status:r.status,ok:r.status>=200&&r.status<300,headers:hd,text:tx||''};
  }
  const px=(S.cn&&S.cn.proxy||'').trim(),target=px?px+encodeURIComponent(url):url;
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),opt.timeout||30000);
  try{
    const r=await fetch(target,{method,headers:h,body:body==null?undefined:(isObj?JSON.stringify(body):body),signal:ctl.signal});
    const hd={};r.headers.forEach((v,k)=>{hd[k.toLowerCase()]=v});
    return {status:r.status,ok:r.ok,headers:hd,text:await r.text()};
  }catch(e){
    if(e.name==='AbortError')throw new Error('No answer in time');
    if(e instanceof TypeError)throw new Error('Network error or the service blocks browser access (CORS). Use the Android app, or set a proxy in Settings → Connectors → Browser access.');
    throw e;
  }finally{clearTimeout(to)}
}
const cnParse=t=>{try{return JSON.parse(t)}catch(e){return null}};
const cnMsg=(j,t)=>{
  if(j&&typeof j==='object'){
    const e=j.error||j.errors||j.message;
    if(typeof e==='string')return e;
    if(Array.isArray(e)&&e[0])return e[0].message||JSON.stringify(e[0]);
    if(e&&e.message)return e.message;
    if(j.msg)return j.msg;
  }
  return String(t||'').slice(0,200);
};
/* JSON request; throws "<Service> <status>: <message>" when the service says no */
async function cnJson(name,url,opt){
  const r=await cnHttp(url,opt),j=cnParse(r.text);
  if(!r.ok)throw new Error(name+' '+r.status+': '+cnMsg(j,r.text)+(r.status===401||r.status===403?' (check the token and its permissions)':''));
  return j===null?r.text:j;
}
const cnDate=x=>{if(!x)return '';const d=new Date(typeof x==='number'||/^\d+$/.test(x)?+x:x);return isNaN(d)?String(x):d.toISOString().slice(0,16).replace('T',' ')};
const cnCut=(t,n)=>{t=String(t==null?'':t);return t.length>n?t.slice(0,n)+'…':t};
/* the useful part of a build log: the lines that look like errors first, then the end of the log */
function cnLog(lines,max){
  lines=lines.map(x=>String(x).replace(/\s+$/,'')).filter(Boolean);
  if(!lines.length)return 'The log is empty.';
  const err=lines.filter(x=>/error|failed|fatal|cannot find|not found|ERR!|exception/i.test(x)).slice(0,15);
  const tail=lines.slice(-(max||80));
  return (err.length?'Lines that look like errors:\n'+err.join('\n')+'\n\n':'')+'End of the log ('+lines.length+' lines in total):\n'+tail.join('\n');
}
const cnDone=(what)=>'Done: '+what;
const cnAsk=async(title,body,ok)=>{if(!await ask(title,body,ok||'Allow'))throw new Error('The user declined this action')};

/* ---------- Vercel ---------- */
const vcq=(c,p)=>'https://api.vercel.com'+p+(c.team?(p.includes('?')?'&':'?')+'teamId='+encodeURIComponent(c.team):'');
const vcJ=(c,p,o)=>cnJson('Vercel',vcq(c,p),Object.assign({},o,{headers:{Authorization:'Bearer '+c.token}}));
cnRegister({
  id:'vercel',name:'Vercel',ic:'cloud',desc:'Projects, deployments, build logs, redeploy',
  help:'Vercel → Account Settings → Tokens → Create. For a team project also paste the Team ID (Team Settings → General).',
  fields:[{k:'token',label:'Access token',type:'password',ph:'token'},{k:'team',label:'Team ID (optional)',ph:'team_…'}],
  test:async c=>{const j=await vcJ(c,'/v9/projects?limit=5');return 'Connected. '+(j.projects||[]).length+' project(s) visible.'},
  tools:[
   {name:'vercel_projects',description:'[Vercel] List projects with their latest deployment state.',parameters:{type:'object',properties:{limit:{type:'integer'}}},
    run:async(a,c)=>{const j=await vcJ(c,'/v9/projects?limit='+Math.min(50,a.limit||30));
      return (j.projects||[]).map(p=>{const d=(p.latestDeployments||[])[0];return p.name+' · '+(p.framework||'no framework')+(d?' · latest: '+(d.readyState||d.state||'?')+' '+(d.url?'https://'+d.url:''):'')}).join('\n')||'No projects'}},
   {name:'vercel_deployments',description:'[Vercel] List recent deployments (newest first), optionally for one project name. Shows id, state (READY, ERROR, BUILDING...), target, time, URL and commit message.',parameters:{type:'object',properties:{project:{type:'string'},limit:{type:'integer'}}},
    run:async(a,c)=>{const j=await vcJ(c,'/v6/deployments?limit='+Math.min(30,a.limit||10)+(a.project?'&app='+encodeURIComponent(a.project):''));
      return (j.deployments||[]).map(d=>(d.uid||d.id)+' · '+(d.readyState||d.state)+' · '+(d.target||'preview')+' · '+cnDate(d.created||d.createdAt)+' · https://'+d.url+' · '+cnCut((d.meta&&(d.meta.githubCommitMessage||d.meta.gitlabCommitMessage))||d.name,80)).join('\n')||'No deployments'}},
   {name:'vercel_build_log',description:'[Vercel] Read the build log of one deployment (id like dpl_… or its URL). Returns the error lines and the end of the log. Use it when a deployment is in ERROR state, then fix the cause in the repo.',parameters:{type:'object',properties:{deployment:{type:'string'}},required:['deployment']},
    run:async(a,c)=>{const id=String(a.deployment||'').replace(/^https?:\/\//,'').trim();
      const j=await vcJ(c,'/v3/deployments/'+encodeURIComponent(id)+'/events?limit=-1&builds=1');
      const ev=Array.isArray(j)?j:(j.events||[]);return cnLog(ev.map(e=>(e.payload&&e.payload.text)||e.text||'').filter(Boolean),80)}},
   {name:'vercel_redeploy',description:'[Vercel] Redeploy an existing deployment (asks the user to confirm).',parameters:{type:'object',properties:{deployment:{type:'string'},production:{type:'boolean'}},required:['deployment']},
    confirm:a=>'Redeploy '+a.deployment+' on Vercel?',
    run:async(a,c)=>{const id=String(a.deployment||'').replace(/^https?:\/\//,'').trim();
      const d=await vcJ(c,'/v13/deployments/'+encodeURIComponent(id));
      const r=await vcJ(c,'/v13/deployments?forceNew=1',{method:'POST',body:{name:d.name,deploymentId:d.id||d.uid,target:a.production===false?undefined:(d.target||undefined)}});
      return cnDone('new deployment '+(r.id||r.uid)+' ('+(r.readyState||r.status||'queued')+') https://'+r.url)}}
  ]});

/* ---------- Netlify ---------- */
const nlJ=(c,p,o)=>cnJson('Netlify','https://api.netlify.com/api/v1'+p,Object.assign({},o,{headers:{Authorization:'Bearer '+c.token}}));
async function nlSite(c,x){
  x=String(x||'').trim();if(!x)throw new Error('site is required (name or id)');
  if(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(x))return x;
  const l=await nlJ(c,'/sites?filter=all&per_page=100'),m=l.find(s=>s.name===x||s.url===x||s.ssl_url===x||(s.custom_domain===x));
  if(!m)throw new Error('No Netlify site named '+x);return m.id;
}
cnRegister({
  id:'netlify',name:'Netlify',ic:'cloud',desc:'Sites, deploys, deploy logs, trigger a build',
  help:'Netlify → User settings → Applications → Personal access tokens → New access token.',
  fields:[{k:'token',label:'Personal access token',type:'password',ph:'nfp_…'}],
  test:async c=>{const l=await nlJ(c,'/sites?per_page=5');return 'Connected. '+l.length+' site(s) visible.'},
  tools:[
   {name:'netlify_sites',description:'[Netlify] List sites.',parameters:{type:'object',properties:{query:{type:'string'}}},
    run:async(a,c)=>{const q=String(a.query||'').toLowerCase(),l=await nlJ(c,'/sites?filter=all&per_page=60');
      return l.filter(s=>!q||s.name.toLowerCase().includes(q)).map(s=>s.name+' · '+s.id+' · '+(s.ssl_url||s.url)+' · '+((s.published_deploy&&s.published_deploy.state)||'')).join('\n')||'No sites'}},
   {name:'netlify_deploys',description:'[Netlify] Recent deploys of a site (name or id): id, state, branch, time, error message.',parameters:{type:'object',properties:{site:{type:'string'}},required:['site']},
    run:async(a,c)=>{const id=await nlSite(c,a.site),l=await nlJ(c,'/sites/'+id+'/deploys?per_page=8');
      return l.map(d=>d.id+' · '+d.state+' · '+(d.branch||'')+' · '+cnDate(d.created_at)+' · '+cnCut(d.title||d.commit_ref||'',60)+(d.error_message?' · ERROR: '+cnCut(d.error_message,200):'')).join('\n')||'No deploys'}},
   {name:'netlify_deploy_log',description:'[Netlify] Error message, build issues and (when available) the log of one deploy id. Use it when a deploy failed, then fix the cause in the repo.',parameters:{type:'object',properties:{deploy:{type:'string'}},required:['deploy']},
    run:async(a,c)=>{const d=await nlJ(c,'/deploys/'+encodeURIComponent(a.deploy));
      let out=['State: '+d.state,d.error_message?'Error: '+d.error_message:''];
      const ms=(d.summary&&d.summary.messages)||[];ms.slice(0,10).forEach(m=>out.push((m.type||'')+': '+(m.title||'')+' '+(m.description||'')));
      try{const r=await cnHttp('https://api.netlify.com/api/v1/deploys/'+encodeURIComponent(a.deploy)+'/log',{headers:{Authorization:'Bearer '+c.token,Accept:'text/plain'}});
        if(r.ok&&r.text)out.push(cnLog(r.text.split('\n'),80))}catch(e){}
      return out.filter(Boolean).join('\n')}},
   {name:'netlify_build',description:'[Netlify] Start a new build of a site (asks the user to confirm).',parameters:{type:'object',properties:{site:{type:'string'}},required:['site']},
    confirm:a=>'Start a new Netlify build for '+a.site+'?',
    run:async(a,c)=>{const id=await nlSite(c,a.site),r=await nlJ(c,'/sites/'+id+'/builds',{method:'POST',body:{}});return cnDone('build '+(r.id||'')+' started ('+(r.deploy_state||r.state||'queued')+')')}}
  ]});

/* ---------- Cloudflare (Pages and Workers) ---------- */
async function cfJ(c,p,o){
  const j=await cnJson('Cloudflare','https://api.cloudflare.com/client/v4'+p,Object.assign({},o,{headers:{Authorization:'Bearer '+c.token}}));
  if(j&&j.success===false)throw new Error('Cloudflare: '+cnMsg(j,''));return j;
}
async function cfAcc(c){
  if(c.account)return c.account;
  const j=await cfJ(c,'/accounts?per_page=5');if(!j.result||!j.result.length)throw new Error('No Cloudflare account found for this token. Paste the Account ID.');
  return j.result[0].id;
}
cnRegister({
  id:'cloudflare',name:'Cloudflare',ic:'cloud',desc:'Pages deployments and logs, Workers',
  help:'Cloudflare → My Profile → API Tokens → Create token. Give it Pages: Read (and Edit to retry deployments) and Workers Scripts: Read. Cloudflare blocks browsers, so this works best in the Android app, or through a proxy.',
  fields:[{k:'token',label:'API token',type:'password',ph:'token'},{k:'account',label:'Account ID (optional)',ph:'found on the dashboard'}],
  test:async c=>{const a=await cfAcc(c),j=await cfJ(c,'/accounts/'+a+'/pages/projects?per_page=5');return 'Connected. Account '+a.slice(0,6)+'…, '+(j.result||[]).length+' Pages project(s).'},
  tools:[
   {name:'cloudflare_pages',description:'[Cloudflare] List Pages projects with the status of the latest deployment.',parameters:{type:'object',properties:{}},
    run:async(a,c)=>{const acc=await cfAcc(c),j=await cfJ(c,'/accounts/'+acc+'/pages/projects?per_page=40');
      return (j.result||[]).map(p=>{const d=p.latest_deployment;return p.name+' · '+(p.subdomain||'')+(d?' · latest: '+(d.latest_stage&&d.latest_stage.status)+' ('+(d.latest_stage&&d.latest_stage.name)+') '+d.id:'')}).join('\n')||'No Pages projects'}},
   {name:'cloudflare_deployments',description:'[Cloudflare] Recent deployments of a Pages project.',parameters:{type:'object',properties:{project:{type:'string'}},required:['project']},
    run:async(a,c)=>{const acc=await cfAcc(c),j=await cfJ(c,'/accounts/'+acc+'/pages/projects/'+encodeURIComponent(a.project)+'/deployments?per_page=8');
      return (j.result||[]).map(d=>d.id+' · '+d.environment+' · '+(d.latest_stage&&d.latest_stage.name)+':'+(d.latest_stage&&d.latest_stage.status)+' · '+cnDate(d.created_on)+' · '+(d.url||'')).join('\n')||'No deployments'}},
   {name:'cloudflare_deploy_log',description:'[Cloudflare] Build log of one Pages deployment. Use it when a deployment failed, then fix the cause in the repo.',parameters:{type:'object',properties:{project:{type:'string'},deployment:{type:'string'}},required:['project','deployment']},
    run:async(a,c)=>{const acc=await cfAcc(c),j=await cfJ(c,'/accounts/'+acc+'/pages/projects/'+encodeURIComponent(a.project)+'/deployments/'+encodeURIComponent(a.deployment)+'/history/logs');
      return cnLog(((j.result&&j.result.data)||[]).map(x=>x.line),80)}},
   {name:'cloudflare_retry',description:'[Cloudflare] Retry a Pages deployment (asks the user to confirm).',parameters:{type:'object',properties:{project:{type:'string'},deployment:{type:'string'}},required:['project','deployment']},
    confirm:a=>'Retry deployment '+a.deployment+' of '+a.project+' on Cloudflare Pages?',
    run:async(a,c)=>{const acc=await cfAcc(c),j=await cfJ(c,'/accounts/'+acc+'/pages/projects/'+encodeURIComponent(a.project)+'/deployments/'+encodeURIComponent(a.deployment)+'/retry',{method:'POST'});
      return cnDone('retry started: '+((j.result&&j.result.id)||''))}},
   {name:'cloudflare_workers',description:'[Cloudflare] List Worker scripts.',parameters:{type:'object',properties:{}},
    run:async(a,c)=>{const acc=await cfAcc(c),j=await cfJ(c,'/accounts/'+acc+'/workers/scripts');return (j.result||[]).map(w=>w.id+' · modified '+cnDate(w.modified_on)).join('\n')||'No Workers'}}
  ]});

/* ---------- Render ---------- */
const rdJ=(c,p,o)=>cnJson('Render','https://api.render.com/v1'+p,Object.assign({},o,{headers:{Authorization:'Bearer '+c.token}}));
async function rdSvc(c,x){
  x=String(x||'').trim();if(!x)throw new Error('service is required (name or id)');
  if(/^srv-/.test(x))return rdJ(c,'/services/'+x);
  const l=await rdJ(c,'/services?limit=50&name='+encodeURIComponent(x)),m=(l||[]).map(i=>i.service||i).find(s=>s.name===x)||((l||[])[0]&&((l[0].service)||l[0]));
  if(!m)throw new Error('No Render service named '+x);return m;
}
cnRegister({
  id:'render',name:'Render',ic:'cloud',desc:'Services, deploys, logs, trigger a deploy',
  help:'Render → Account Settings → API Keys → Create API Key.',
  fields:[{k:'token',label:'API key',type:'password',ph:'rnd_…'}],
  test:async c=>{const l=await rdJ(c,'/services?limit=5');return 'Connected. '+l.length+' service(s) visible.'},
  tools:[
   {name:'render_services',description:'[Render] List services.',parameters:{type:'object',properties:{}},
    run:async(a,c)=>{const l=await rdJ(c,'/services?limit=50');return l.map(i=>{const s=i.service||i;return s.name+' · '+s.id+' · '+s.type+(s.suspended==='suspended'?' · SUSPENDED':'')+((s.serviceDetails&&s.serviceDetails.url)?' · '+s.serviceDetails.url:'')}).join('\n')||'No services'}},
   {name:'render_deploys',description:'[Render] Recent deploys of a service (name or id): id, status, commit, time.',parameters:{type:'object',properties:{service:{type:'string'}},required:['service']},
    run:async(a,c)=>{const s=await rdSvc(c,a.service),l=await rdJ(c,'/services/'+s.id+'/deploys?limit=8');
      return l.map(i=>{const d=i.deploy||i;return d.id+' · '+d.status+' · '+cnDate(d.createdAt)+' · '+cnCut((d.commit&&d.commit.message)||d.trigger||'',70)}).join('\n')||'No deploys'}},
   {name:'render_logs',description:'[Render] Latest log lines of a service (name or id). Use it when a deploy failed or the service misbehaves.',parameters:{type:'object',properties:{service:{type:'string'},limit:{type:'integer'}},required:['service']},
    run:async(a,c)=>{const s=await rdSvc(c,a.service),j=await rdJ(c,'/logs?ownerId='+encodeURIComponent(s.ownerId)+'&resource='+encodeURIComponent(s.id)+'&direction=backward&limit='+Math.min(200,a.limit||100));
      return cnLog(((j.logs||[]).slice().reverse()).map(l=>l.message),100)}},
   {name:'render_deploy',description:'[Render] Trigger a new deploy of a service (asks the user to confirm).',parameters:{type:'object',properties:{service:{type:'string'},clear_cache:{type:'boolean'}},required:['service']},
    confirm:a=>'Trigger a new deploy of '+a.service+' on Render?',
    run:async(a,c)=>{const s=await rdSvc(c,a.service),r=await rdJ(c,'/services/'+s.id+'/deploys',{method:'POST',body:{clearCache:a.clear_cache?'clear':'do_not_clear'}});return cnDone('deploy '+(r.id||'')+' started ('+(r.status||'created')+')')}}
  ]});

/* ---------- Supabase (management API: projects and SQL) ---------- */
const sbJ=(c,p,o)=>cnJson('Supabase','https://api.supabase.com/v1'+p,Object.assign({},o,{headers:{Authorization:'Bearer '+c.token}}));
async function sbRef(c,x){
  x=String(x||'').trim();if(!x)throw new Error('project is required (name or ref)');
  const l=await sbJ(c,'/projects'),m=l.find(p=>p.id===x||p.name===x||p.ref===x);
  if(!m)throw new Error('No Supabase project "'+x+'". Known: '+l.map(p=>p.name).join(', '));return m.id||m.ref;
}
const SQL_WRITE=/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|vacuum|reindex|call|do|copy|merge|set|reset|lock|refresh|security)\b/i;
const sqlRows=j=>Array.isArray(j)?j:(j&&j.result)||[];
const sqlOut=rows=>{rows=sqlRows(rows);if(!rows.length)return 'OK, no rows.';return cnCut(JSON.stringify(rows.slice(0,100)),12000)+(rows.length>100?'\n('+rows.length+' rows, first 100 shown)':'')};
cnRegister({
  id:'supabase',name:'Supabase',ic:'save',desc:'Projects, tables, SQL, edge functions',
  help:'Supabase → Account → Access Tokens → Generate new token (starts with sbp_). This is the management token, not your project API key.',
  fields:[{k:'token',label:'Access token',type:'password',ph:'sbp_…'}],
  test:async c=>{const l=await sbJ(c,'/projects');return 'Connected. '+l.length+' project(s): '+l.slice(0,4).map(p=>p.name).join(', ')},
  tools:[
   {name:'supabase_projects',description:'[Supabase] List projects (name, ref, region, status).',parameters:{type:'object',properties:{}},
    run:async(a,c)=>{const l=await sbJ(c,'/projects');return l.map(p=>p.name+' · '+p.id+' · '+p.region+' · '+p.status).join('\n')||'No projects'}},
   {name:'supabase_tables',description:'[Supabase] List tables and columns of a project (schema public).',parameters:{type:'object',properties:{project:{type:'string'}},required:['project']},
    run:async(a,c)=>{const ref=await sbRef(c,a.project);
      const j=await sbJ(c,'/projects/'+ref+'/database/query',{method:'POST',body:{query:"select table_name, string_agg(column_name||' '||data_type, ', ' order by ordinal_position) as columns from information_schema.columns where table_schema='public' group by table_name order by table_name"}});
      return sqlRows(j).map(r=>r.table_name+': '+r.columns).join('\n')||'No tables in schema public'}},
   {name:'supabase_sql',description:'[Supabase] Run one SQL statement on a project. Reading (select) runs directly; anything that changes data or structure asks the user to confirm first. Keep results small (use limit).',parameters:{type:'object',properties:{project:{type:'string'},query:{type:'string'}},required:['project','query']},
    confirm:a=>{const q=String(a.query||'');return (SQL_WRITE.test(q)||!/^\s*(select|with|explain|show|table)\b/i.test(q))?'Run this SQL on Supabase project '+a.project+'?\n\n'+cnCut(q,600):null},
    run:async(a,c)=>{const ref=await sbRef(c,a.project);return sqlOut(await sbJ(c,'/projects/'+ref+'/database/query',{method:'POST',body:{query:String(a.query)}}))}},
   {name:'supabase_functions',description:'[Supabase] List edge functions of a project.',parameters:{type:'object',properties:{project:{type:'string'}},required:['project']},
    run:async(a,c)=>{const ref=await sbRef(c,a.project),l=await sbJ(c,'/projects/'+ref+'/functions');return (l||[]).map(f=>f.slug+' · '+f.status+' · v'+f.version+' · updated '+cnDate(f.updated_at)).join('\n')||'No edge functions'}}
  ]});

/* ---------- Notify ---------- */
/* ntfy.sh (free push notifications to your phone: install the ntfy app and subscribe to your topic) */
async function ntfySend(title,message,cfg){
  cfg=cfg||cnGet('notify');if(!cfg.topic)throw new Error('Add an ntfy topic in Settings → Connectors → Notify');
  const srv=(cfg.server||'https://ntfy.sh').replace(/\/+$/,'');
  const h={};if(cfg.token)h.Authorization='Bearer '+cfg.token;
  const r=await cnHttp(srv,{method:'POST',headers:h,body:{topic:cfg.topic,title:cnCut(title,100),message:cnCut(message,1000)}});
  if(!r.ok)throw new Error('ntfy '+r.status+': '+cnCut(r.text,160));
}
cnRegister({
  id:'notify',name:'Notify',ic:'chat',desc:'Phone notifications when a long reply is ready',
  help:'Notifications on this device need no setup. For push on your phone even when Orin is closed, install the free ntfy app, subscribe to a hard-to-guess topic name and paste the same name here.',
  fields:[{k:'auto',label:'Notify me when a reply that took a while finishes while Orin is in the background',type:'check'},{k:'topic',label:'ntfy topic (optional)',ph:'orin-my-secret-topic'},{k:'server',label:'ntfy server (optional)',ph:'https://ntfy.sh'},{k:'token',label:'ntfy access token (optional)',type:'password'}],
  isOn:c=>!!c.topic,
  test:async c=>{
    const out=[];
    if(typeof notifyLocal==='function'){const ok=await notifyLocal('Orin','Test notification',true);out.push(ok?'This device: notification sent.':'This device: not allowed. Allow notifications for Orin in the system settings.')}
    if(c.topic){await ntfySend('Orin','Test notification',c);out.push('ntfy: sent to topic "'+c.topic+'".')}
    return out.join(' ')||'Saved.'},
  tools:[{name:'send_notification',description:'[Notify] Send a push notification to the user\'s phone (needs an ntfy topic). Use it when a long task is finished or something needs attention.',parameters:{type:'object',properties:{title:{type:'string'},message:{type:'string'}},required:['message']},
    run:async(a)=>{await ntfySend(a.title||'Orin',a.message);return cnDone('notification sent')}}]});

/* ---------- Custom API (any REST service with a header token) ---------- */
function cnCustomList(){return (S.cn&&S.cn.custom)||[]}
function cnCustomConnector(x){
  const nm=x.name||'API',tn=('api_'+x.id).slice(0,40);
  return {id:'custom:'+x.id,custom:x,name:nm,ic:'globe',desc:x.base||'Custom API',isOn:()=>!!x.base,
    test:async()=>{const r=await cnHttp(x.base,{headers:cnCustomHeaders(x)});return 'Answered with status '+r.status+'.'},
    tools:[{name:tn+'_request',description:'['+nm+'] Call the '+nm+' REST API at '+x.base+'. Give method, a path starting with / and an optional JSON body. Changes (anything but GET) ask the user to confirm.'+(x.note?' '+x.note:''),
      parameters:{type:'object',properties:{method:{type:'string',description:'GET (default), POST, PUT, PATCH or DELETE'},path:{type:'string'},body:{type:'object'}},required:['path']},
      confirm:a=>String(a.method||'GET').toUpperCase()==='GET'?null:String(a.method).toUpperCase()+' '+x.base.replace(/\/+$/,'')+(a.path||'')+(a.body?'\n\n'+cnCut(JSON.stringify(a.body),400):''),
      run:async a=>{
        const m=String(a.method||'GET').toUpperCase();if(!/^(GET|POST|PUT|PATCH|DELETE)$/.test(m))throw new Error('Unsupported method');
        const p=String(a.path||'');if(!p.startsWith('/'))throw new Error('path must start with /');
        const r=await cnHttp(x.base.replace(/\/+$/,'')+p,{method:m,headers:cnCustomHeaders(x),body:a.body});
        return 'HTTP '+r.status+'\n'+cnCut(r.text,14000)}}]};
}
const cnCustomHeaders=x=>{const h={};if(x.hname&&x.hval)h[x.hname]=x.hval;return h};

/* ---------- MCP servers (remote, Streamable HTTP) ---------- */
/* Any MCP server that speaks HTTP can be added by URL; its tools then reach the agent as mcp_<server>_<tool>. */
let mcpSeq=0;const mcpSid=new Map();
function cnMcpList(){return (S.cn&&S.cn.mcp)||[]}
async function mcpRpc(s,method,params,note){
  const body={jsonrpc:'2.0',method};if(params!==undefined)body.params=params;
  const id=note?null:++mcpSeq;if(!note)body.id=id;
  const h={'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'};
  if(s.token)h.Authorization='Bearer '+s.token;
  const sid=mcpSid.get(s.id);if(sid)h['Mcp-Session-Id']=sid;
  const r=await cnHttp(s.url,{method:'POST',headers:h,body});
  if(r.headers['mcp-session-id'])mcpSid.set(s.id,r.headers['mcp-session-id']);
  if(note)return null;
  if(!r.ok){if(r.status===404&&sid){mcpSid.delete(s.id);await mcpInit(s);return mcpRpc(s,method,params,note)}throw new Error('MCP '+r.status+': '+cnCut(r.text,200))}
  let msg=null;
  if(/event-stream/.test(r.headers['content-type']||'')){
    for(const ln of r.text.split('\n')){if(!ln.startsWith('data:'))continue;const j=cnParse(ln.slice(5).trim());if(j&&j.id===id)msg=j}
  }else msg=cnParse(r.text);
  if(!msg)throw new Error('MCP: no answer from the server');
  if(msg.error)throw new Error('MCP: '+(msg.error.message||JSON.stringify(msg.error)));
  return msg.result;
}
async function mcpInit(s){
  mcpSid.delete(s.id);
  await mcpRpc(s,'initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'Orin',version:'1.0'}});
  try{await mcpRpc(s,'notifications/initialized',{},true)}catch(e){}
}
async function mcpList(s){
  await mcpInit(s);
  let tools=[],cur;
  for(let i=0;i<4;i++){const r=await mcpRpc(s,'tools/list',cur?{cursor:cur}:{});tools=tools.concat(r.tools||[]);cur=r.nextCursor;if(!cur)break}
  return tools;
}
/* providers only accept a small subset of JSON schema (Gemini is the strictest) */
function cnSchema(x,top){
  if(!x||typeof x!=='object')return top?{type:'object',properties:{note:{type:'string',description:'not used'}}}:{type:'string'};
  const o={},t=Array.isArray(x.type)?(x.type.find(v=>v!=='null')||'string'):x.type;
  o.type=t||(x.properties?'object':'string');
  if(x.description)o.description=cnCut(x.description,300);
  if(x.enum&&o.type==='string')o.enum=x.enum.map(String);
  if(o.type==='object'){
    o.properties={};for(const k in (x.properties||{}))o.properties[k]=cnSchema(x.properties[k]);
    if(!Object.keys(o.properties).length)o.properties={note:{type:'string',description:'not used'}};
    if(Array.isArray(x.required)&&x.required.length)o.required=x.required.filter(k=>o.properties[k]);
    if(o.required&&!o.required.length)delete o.required;
  }
  if(o.type==='array')o.items=cnSchema(x.items||{type:'string'});
  return o;
}
const cnSlug=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,20)||'x';
function cnMcpConnector(s){
  return {id:'mcp:'+s.id,mcp:s,name:s.name||'MCP server',ic:'spark',desc:s.url,isOn:()=>!!s.url&&!!(s.tools&&s.tools.length),
    test:async()=>{const t=await mcpList(s);const r=cnMcpList().map(x=>x.id===s.id?Object.assign({},x,{tools:t.map(k=>({name:k.name,description:k.description||'',inputSchema:k.inputSchema,ro:!!(k.annotations&&k.annotations.readOnlyHint)}))}):x);
      S.cn=Object.assign({},S.cn,{mcp:r});rawSave();return 'Connected. '+t.length+' tool(s): '+t.slice(0,6).map(k=>k.name).join(', ')+(t.length>6?'…':'')},
    tools:(s.tools||[]).map(t=>({name:('mcp_'+cnSlug(s.name)+'_'+t.name.replace(/[^A-Za-z0-9_-]/g,'_')).slice(0,64),
      description:'['+(s.name||'MCP')+'] '+cnCut(t.description||t.name,600),parameters:cnSchema(t.inputSchema,true),
      confirm:a=>t.ro?null:'Let '+(s.name||'the MCP server')+' run "'+t.name+'"?\n\n'+cnCut(JSON.stringify(a),500),
      run:async a=>{
        if(!mcpSid.has(s.id))await mcpInit(s);
        const args=Object.assign({},a);if(t.inputSchema&&t.inputSchema.properties&&!t.inputSchema.properties.note)delete args.note;
        const r=await mcpRpc(s,'tools/call',{name:t.name,arguments:args});
        const tx=(r.content||[]).map(c=>c.type==='text'?c.text:'['+c.type+']').join('\n');
        return (r.isError?'Error from the tool: ':'')+(tx||JSON.stringify(r.structuredContent||r))}}))};
}

/* ---------- registry used by the agent ---------- */
const cnAllList=()=>CN_REG.concat(cnCustomList().map(cnCustomConnector),cnMcpList().map(cnMcpConnector));
const cnIsOn=c=>c.isOn?!!c.isOn(cnGet(c.id)):!!cnGet(c.id).token;
const cnActive=()=>cnAllList().filter(cnIsOn);
const cnToolList=()=>{const out=[];for(const c of cnActive())for(const t of c.tools)out.push({c,t});return out};
/* every tool the agent may call: the built-in ones, the extra ones and those of connected services */
const allTools=()=>TOOLS.concat(typeof EXTRA_TOOLS!=='undefined'?EXTRA_TOOLS:[],cnToolList().map(x=>({name:x.t.name,description:x.t.description,parameters:x.t.parameters})));
async function cnRun(name,a){
  const x=cnToolList().find(y=>y.t.name===name);if(!x)return null;
  const cfg=x.c.mcp||x.c.custom||cnGet(x.c.id);
  if(x.t.confirm){const q=x.t.confirm(a);if(q)await cnAsk(x.c.name+': allow this?',q)}
  return cnCut(await x.t.run(a,cfg),30000);
}
/* label shown in the step list while a connector tool runs */
const cnLabel=k=>{const x=cnToolList().find(y=>y.t.name===k.name);if(!x)return null;const a=k.args||{};return 'cloud:'+x.c.name+' · '+k.name.replace(/^[a-z]+_/,'').replace(/_/g,' ')+(a.project||a.service||a.site||a.deployment?' '+cnCut(a.project||a.service||a.site||a.deployment,28):'')};
function cnNote(){
  const l=cnActive();if(!l.length)return '';
  return '\n[Connected services] You can use these through tools: '+l.map(c=>c.name+' ('+c.tools.map(t=>t.name).join(', ')+')').join('; ')+'. Use them to see why a deploy failed (read the log, then fix the repo files), check status, or read data. Anything that changes a service asks the user first. Never print or ask for tokens.';
}

/* ---------- Settings → Connectors ---------- */
const cnById=id=>cnAllList().find(c=>c.id===id);
function cnRow(c,st,sub,act,id){
  return '<button class="mrow" data-cn="'+act+'" data-id="'+qa(id)+'"><span class="mi">'+ico(c.ic||'cloud',20)+'</span><span class="mt"><b>'+esc(c.name)+'</b><small>'+(st?'<i class="sd '+st+'"></i>':'')+esc(sub)+'</small></span><span class="ar">›</span></button>';
}
function cnPage(){
  const h1=$('sheet').querySelector('h1');
  if(cnView){const v=cnDetail();return v}
  h1.textContent='Connectors';
  const g=S.gh&&S.gh.token;
  let h='<div class="sec"><h3>Connected services</h3><p class="h">Connect a service once and the agent can use it: read why a deploy failed, check a database, trigger a build, send you a notification. Anything that changes something asks you first. Tokens stay on this device. Connector tools work in agent mode (pick a GitHub repository from the + menu).</p></div>';
  h+='<div class="grp">'+cnRow({name:'GitHub',ic:'github'},g?'ok':'','Repositories, pull requests, Actions'+(g?' · connected':' · not connected'),'gh','gh')+
    CN_REG.map(c=>{const on=cnIsOn(c);return cnRow(c,on?'ok':'',on?'Connected':c.desc,'open',c.id)}).join('')+'</div>';
  const cu=cnCustomList(),mc=cnMcpList();
  if(mc.length||cu.length)h+='<div class="gl">Your own</div><div class="grp">'+mc.map(s=>{const c=cnMcpConnector(s);return cnRow(c,cnIsOn(c)?'ok':'warn','MCP · '+(s.tools&&s.tools.length?s.tools.length+' tools':'not connected yet'),'open',c.id)}).join('')+cu.map(x=>{const c=cnCustomConnector(x);return cnRow(c,'ok','Custom API · '+x.base,'open',c.id)}).join('')+'</div>';
  h+='<div class="sec"><h3>Add more</h3><p class="h">Any MCP server (a URL) or any REST API with a token can be added. New services appear here as plugins are added to Orin.</p><div class="row"><button class="btn sm" data-cn="newmcp">Add MCP server</button><button class="btn sm ghost" data-cn="newapi">Add custom API</button></div></div>';
  h+='<div class="sec"><h3>Browser access</h3><p class="h">The Android app talks to these services directly. In a normal browser some of them (Cloudflare, for example) block requests from web pages. If so, put the small proxy from <b>scripts/cors-proxy-worker.js</b> on your own Cloudflare Worker and paste its address here, ending in <b>?url=</b>. Leave empty if everything works.</p><input class="f" id="cnpx" placeholder="https://my-proxy.workers.dev/?url=" value="'+qa((S.cn&&S.cn.proxy)||'')+'"><div class="row"><button class="btn sm ghost" data-cn="saveproxy">Save</button></div></div>';
  return h;
}
function cnDetail(){
  const h1=$('sheet').querySelector('h1');
  if(cnView==='newmcp'||cnView==='newapi'){
    const m=cnView==='newmcp';h1.textContent=m?'Add MCP server':'Add custom API';
    return '<div class="sec">'+(m?'<p class="h">Paste the address of a remote MCP server (Streamable HTTP). Orin reads its tools and offers them to the agent.</p>':'<p class="h">Any REST API that uses a token in a header. The agent gets one tool to call it; changes ask you first.</p>')+
      '<label>Name</label><input class="f" id="cnn" placeholder="'+(m?'My tools':'My API')+'">'+
      '<label>'+(m?'Server URL':'Base URL')+'</label><input class="f" id="cnu" placeholder="https://…">'+
      (m?'<label>Access token (optional)</label><input class="f" id="cnt" type="password" autocomplete="off">':'<label>Header name (optional)</label><input class="f" id="cnh" placeholder="Authorization"><label>Header value (optional)</label><input class="f" id="cnt" type="password" autocomplete="off" placeholder="Bearer …"><label>Note for the assistant (optional)</label><input class="f" id="cnd" placeholder="what this API is for">')+
      '<div class="row"><button class="btn" data-cn="'+(m?'addmcp':'addapi')+'">Add</button><button class="btn ghost" data-cn="back">Cancel</button></div><div id="cnres" class="h">'+esc(cnRes)+'</div></div>';
  }
  const c=cnById(cnView);if(!c){cnView='';return cnPage()}
  h1.textContent=c.name;
  const cfg=c.mcp||c.custom||cnGet(c.id);
  let h='<div class="sec"><h3>'+esc(c.name)+'</h3>'+(c.help?'<p class="h">'+esc(c.help)+'</p>':'');
  if(c.mcp||c.custom){
    h+='<p class="h">'+esc(c.mcp?c.mcp.url:c.custom.base)+'</p>';
  }else{
    h+=c.fields.map(f=>f.type==='check'
      ?'<label class="ck"><input type="checkbox" data-cnf="'+f.k+'" '+(cfg[f.k]!==false?'checked':'')+'> '+esc(f.label)+'</label>'
      :'<label>'+esc(f.label)+'</label><input class="f" data-cnf="'+f.k+'" type="'+(f.type==='password'?'password':'text')+'" autocomplete="off" placeholder="'+qa(f.ph||'')+'" value="'+qa(cfg[f.k]||'')+'">').join('');
  }
  h+='<div class="row">'+(c.mcp||c.custom?'':'<button class="btn" data-cn="save" data-id="'+qa(c.id)+'">Save</button>')+'<button class="btn ghost" data-cn="test" data-id="'+qa(c.id)+'">'+(c.mcp?'Connect / refresh tools':'Test')+'</button>'+
    ((c.mcp||c.custom)?'<button class="btn danger" data-cn="remove" data-id="'+qa(c.id)+'">Remove</button>':(cnIsOn(c)?'<button class="btn danger" data-cn="disc" data-id="'+qa(c.id)+'">Disconnect</button>':''))+'</div>';
  h+='<div id="cnres" class="h">'+esc(cnRes)+'</div>';
  if(c.tools&&c.tools.length)h+='<h3 style="margin-top:14px">What the agent can do</h3><p class="h">'+c.tools.map(t=>'<b>'+esc(t.name)+'</b>'+(t.confirm?' (asks first)':'')).join(' · ')+'</p>';
  return h+'</div>';
}
function cnReadFields(c){
  const o={};document.querySelectorAll('[data-cnf]').forEach(e=>{o[e.dataset.cnf]=e.type==='checkbox'?e.checked:e.value.trim()});return o;
}
const cnUid=()=>Math.random().toString(36).slice(2,8);
document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t||!t.dataset.cn)return;
  const a=t.dataset.cn,id=t.dataset.id;
  const redraw=()=>drawSheet();
  if(a==='gh'){spage='gh';redraw()}
  else if(a==='open'){cnView=id;cnRes='';redraw()}
  else if(a==='back'){cnView='';cnRes='';redraw()}
  else if(a==='newmcp'||a==='newapi'){cnView=a;cnRes='';redraw()}
  else if(a==='saveproxy'){const v=$('cnpx').value.trim();S.cn=Object.assign({},S.cn,{proxy:v});rawSave();toast('Saved')}
  else if(a==='save'){const c=cnById(id);cnSet(id,cnReadFields(c));cnRes='Saved.';toast('Saved');redraw()}
  else if(a==='disc'){if(await ask('Disconnect?','The saved token for this service is removed from this device.','Disconnect',true)){S.cn=Object.assign({},S.cn);delete S.cn[id];rawSave();cnRes='';redraw()}}
  else if(a==='test'){
    const c=cnById(id);if(!c)return;if(!c.mcp&&!c.custom)cnSet(id,cnReadFields(c));
    t.disabled=true;cnRes='Testing…';const r=$('cnres');if(r)r.textContent=cnRes;
    try{cnRes='✓ '+await c.test(c.mcp||c.custom||cnGet(id))}catch(er){cnRes='✗ '+er.message}
    redraw();
  }
  else if(a==='addmcp'||a==='addapi'){
    const nm=$('cnn').value.trim(),u=$('cnu').value.trim();
    if(!/^https:\/\//i.test(u)&&!/^http:\/\/(localhost|127\.)/i.test(u)){cnRes='Enter a full https:// address.';redraw();return}
    const x={id:cnUid(),name:nm||(a==='addmcp'?'MCP server':'API'),token:($('cnt')||{}).value||''};
    if(a==='addmcp'){x.url=u;S.cn=Object.assign({},S.cn,{mcp:cnMcpList().concat([x])});rawSave();cnView='mcp:'+x.id;
      cnRes='Connecting…';redraw();
      try{cnRes='✓ '+await cnMcpConnector(x).test()}catch(er){cnRes='✗ '+er.message}
    }else{
      x.base=u;x.hname=($('cnh')||{}).value.trim();x.hval=x.token;delete x.token;x.note=($('cnd')||{}).value.trim();
      S.cn=Object.assign({},S.cn,{custom:cnCustomList().concat([x])});rawSave();cnView='custom:'+x.id;cnRes='Added.';
    }
    redraw();
  }
  else if(a==='remove'){
    if(!await ask('Remove?','This service is removed from Orin.','Remove',true))return;
    const k=id.startsWith('mcp:')?'mcp':'custom',sid=id.split(':')[1];
    S.cn=Object.assign({},S.cn);S.cn[k]=(S.cn[k]||[]).filter(x=>x.id!==sid);rawSave();cnView='';cnRes='';redraw();
  }
});
const cnSummary=()=>{const n=cnActive().length+(S.gh&&S.gh.token?1:0);return n?n+(n===1?' service connected':' services connected'):'Vercel, Supabase, Cloudflare, Netlify, Render…'};
