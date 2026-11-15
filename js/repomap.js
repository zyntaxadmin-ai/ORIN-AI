/* Orin · repo map — a cached index of the repo's code: every file with its functions, classes, routes and
   headings, each with a line number. The agent can then find the right file and line in ONE tool call
   (repo_map) instead of list_files + several searches + reading whole files, which saves steps and tokens.

   - Declarations are found with small regexes per language (no parser, no library).
   - Files are fetched 6 at a time and remembered by their blob sha, so a file is read only once, ever:
     later calls and later chats are instant, and a changed file gets a new sha and is read again.
   - Staged draft files are included (marked [staged]), deleted ones are left out.
   Plain script: shares the global scope. It uses getTree, dr, gh and enc only when a tool runs, so it can load before them. */

const RM_MAXSYM=80;                 /* symbols kept per file */
const RM_MAXFILES=400;              /* files read per call; call again to continue */
const RM_BUDGET=9000;               /* characters in a reply (about 2500 tokens) */
const RM_CACHE_KEY='orin_symcache';
const RM_CACHE_MAX=400000;          /* characters kept in localStorage */
const RM_CODE=/\.(js|jsx|mjs|cjs|ts|tsx|mts|cts|vue|svelte|py|go|rs|md|mdx|html?|java|kt|kts|cs|php|rb|swift|dart|scala|sh|sql)$/i;
const RM_SKIP=/(^|\/)(node_modules|dist|build|out|vendor|\.next|\.nuxt|coverage|__pycache__|\.venv|target)\/|\.min\.(js|css)$|\.map$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;
const RM_NOT_METHOD=/^(?:if|for|while|switch|catch|function|return|else|do|try|with)$/;
const RM_METHOD=/^\s{2,4}(?:(?:public|private|protected|static|async|override|readonly|get|set)\s+)*([\w$]+)\s*(?:<[^>]*>)?\([^)]*\)\s*(?::\s*[^={]+)?\{\s*$/;

/* a rule is [regex, label(match)] */
const rmKind=k=>m=>k+' '+m[1];
const RM_JS=[
  [/^\s{0,4}(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([\w$]+)/,rmKind('fn')],
  [/^\s{0,2}(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([\w$]+)/,rmKind('class')],
  [/^\s{0,2}(?:export\s+)?(?:declare\s+)?interface\s+([\w$]+)/,rmKind('interface')],
  [/^\s{0,2}(?:export\s+)?(?:declare\s+)?type\s+([\w$]+)\s*(?:<[^=]*>)?\s*=/,rmKind('type')],
  [/^\s{0,2}(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+([\w$]+)/,rmKind('enum')],
  [/^\s*[\w$]+\.(get|post|put|patch|delete|all)\(\s*['"`](\/[^'"`]*)/,m=>'route '+m[1].toUpperCase()+' '+m[2]],
  [/^(?:export\s+)?(?:const|let|var)\s+([\w$]+)/,rmKind('const')]
];
const RM_PY=[
  [/^\s{0,4}(?:async\s+)?def\s+(\w+)/,rmKind('def')],
  [/^class\s+(\w+)/,rmKind('class')]
];
const RM_GO=[
  [/^func\s+(?:\([^)]*\)\s*)?(\w+)/,rmKind('func')],
  [/^type\s+(\w+)\s+(?:struct|interface)/,rmKind('type')]
];
const RM_RS=[
  [/^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(fn|struct|enum|trait|mod)\s+(\w+)/,m=>m[1]+' '+m[2]]
];
const RM_MD=[
  [/^(#{1,3})\s+(.+?)\s*#*\s*$/,m=>m[1]+' '+m[2].slice(0,60)]
];
const RM_SQL=[
  [/^\s*create\s+(?:or\s+replace\s+)?(table|view|function|index|policy|trigger)\s+(?:if\s+not\s+exists\s+)?([\w."]+)/i,m=>m[1].toLowerCase()+' '+m[2]]
];
const RM_SH=[
  [/^(?:function\s+)?([\w-]+)\s*\(\)\s*\{/,rmKind('fn')],
  [/^function\s+([\w-]+)/,rmKind('fn')]
];
const RM_OOP=[
  [/^\s{0,4}(?:[\w@]+\s+){0,4}(class|interface|enum|struct|trait|object|record|module|protocol)\s+(\w+)/,m=>m[1]+' '+m[2]],
  [/^\s{0,6}(?:[\w@]+\s+){0,4}(?:fun|func|def|function|sub)\s+(\w+)/,rmKind('fn')]
];
const RM_RULES={
  js:RM_JS,jsx:RM_JS,mjs:RM_JS,cjs:RM_JS,ts:RM_JS,tsx:RM_JS,mts:RM_JS,cts:RM_JS,vue:RM_JS,svelte:RM_JS,
  py:RM_PY,go:RM_GO,rs:RM_RS,md:RM_MD,mdx:RM_MD,sql:RM_SQL,sh:RM_SH,
  java:RM_OOP,kt:RM_OOP,kts:RM_OOP,cs:RM_OOP,php:RM_OOP,rb:RM_OOP,swift:RM_OOP,dart:RM_OOP,scala:RM_OOP,
  html:[],htm:[]
};

/* [[line, label], ...] for one file; line numbers are 1-based */
function rmSymbols(path,text){
  const m=path.match(/\.([A-Za-z0-9]+)$/),kind=m?m[1].toLowerCase():'',rules=RM_RULES[kind];
  if(!rules)return [];
  const isJs=rules===RM_JS,isHtml=kind==='html'||kind==='htm';
  const lines=text.split('\n'),out=[];
  let inClass=false,ids=0;
  for(let i=0;i<lines.length&&out.length<RM_MAXSYM;i++){
    const ln=lines[i].length>600?lines[i].slice(0,600):lines[i];
    if(isHtml){
      const t=ln.match(/<title>([^<]{1,60})/i);
      if(t)out.push([i+1,'title '+t[1].trim()]);
      for(const id of ln.matchAll(/\bid="([\w-]{1,40})"/g)){if(ids<12){ids++;out.push([i+1,'#'+id[1]])}}
      continue;
    }
    let label=null;
    for(const r of rules){const h=ln.match(r[0]);if(h){label=r[1](h);break}}
    if(!label&&isJs&&inClass){
      const h=ln.match(RM_METHOD);
      if(h&&!RM_NOT_METHOD.test(h[1]))label='method '+h[1];
    }
    if(label){
      if(isJs&&label.startsWith('class '))inClass=true;
      out.push([i+1,label.slice(0,70)]);
    }
  }
  return out;
}
const rmEntry=(p,text,sha,draft)=>({p,n:text.split('\n').length,s:rmSymbols(p,text),sha,draft:!!draft});

/* ---------- cache by blob sha: {sha: [lines, [[line,label],...]]} ---------- */
let rmMem=null;
function rmLoad(){
  if(rmMem)return rmMem;
  try{rmMem=JSON.parse(localStorage.getItem(RM_CACHE_KEY)||'{}')||{}}catch(e){rmMem={}}
  return rmMem;
}
function rmSave(){
  const m=rmMem||{};let s=JSON.stringify(m);
  if(s.length>RM_CACHE_MAX){                       /* too big: forget the oldest half */
    const ks=Object.keys(m);
    for(let i=0;i<ks.length/2;i++)delete m[ks[i]];
    s=JSON.stringify(m);
  }
  try{localStorage.setItem(RM_CACHE_KEY,s)}catch(e){}
}

/* The index of the current repo (staged drafts included), limited to a folder with pre.
   Returns {files:[{p,n,s,sha,draft}], pending, failed, fetched, trunc, empty}. Stops after about 25 s;
   files not read yet are counted in pending and the next call continues. */
async function rmBuild(c,pre){
  const t=await getTree(),d=dr(c),cache=rmLoad(),all=new Set(t.paths);
  for(const [p,f] of Object.entries(d.files)){if(f.del)all.delete(p);else if(!f.bin)all.add(p)}
  const paths=[...all].filter(p=>!RM_SKIP.test(p)&&(!pre||p===pre||p.startsWith(pre+'/'))).sort();
  const files=[],todo=[];
  for(const p of paths){
    const f=d.files[p],sha=t.shas[p];
    if(f&&typeof f.content==='string'){files.push(rmEntry(p,f.content,null,true));continue}
    if(!RM_CODE.test(p)||(t.sizes&&t.sizes[p]>300000)){files.push({p,n:0,s:[],sha});continue}
    const hit=sha&&cache[sha];
    if(hit)files.push({p,n:hit[0],s:hit[1],sha});else todo.push(p);
  }
  const batch=todo.slice(0,RM_MAXFILES),deadline=Date.now()+25000;
  let next=0,done=0,failed=0;
  await Promise.all(Array.from({length:6},async()=>{
    while(next<batch.length&&Date.now()<deadline&&!stopped){
      const p=batch[next++];
      try{
        const x=await gh('/repos/'+S.repo.full+'/contents/'+enc(p)+'?ref='+encodeURIComponent(S.repo.branch),{raw:true});
        const sha=t.shas[p];
        if(x.includes('\u0000')){files.push({p,n:0,s:[],sha})}
        else{const e=rmEntry(p,x,sha);files.push(e);if(sha)cache[sha]=[e.n,e.s]}
      }catch(e){failed++;files.push({p,n:0,s:[]})}
      done++;
    }
  }));
  const seen=new Set(files.map(e=>e.p));
  for(const p of todo)if(!seen.has(p))files.push({p,n:0,s:[]});      /* not read yet: listed by name only */
  if(done>failed)rmSave();
  files.sort((a,b)=>a.p<b.p?-1:1);
  return {files,pending:todo.length-done,failed,fetched:done-failed,trunc:!!t.trunc,empty:!!t.empty};
}

/* ---------- output ---------- */
function rmLine(e,cap){
  const sy=e.s.slice(0,cap).map(x=>x[1]+':'+x[0]).join(', ');
  const more=e.s.length>cap&&cap>0?', … +'+(e.s.length-cap)+' more':'';
  return e.p+(e.n?' ('+e.n+' lines)':'')+(e.draft?' [staged]':'')+(sy?': '+sy+more:'');
}
function rmNote(r){
  let n='';
  if(r.pending>0)n+='\n[Indexing paused: '+r.pending+' file(s) not read yet and listed by name only. Call repo_map again to continue.]';
  if(r.failed)n+='\n['+r.failed+' file(s) could not be read.]';
  if(r.trunc)n+='\n[GitHub cut the file list of this very large repo: some files are missing.]';
  return n;
}
/* the whole map, as detailed as fits in the budget */
function rmFormat(r,pre){
  const head='[repo map · '+S.repo.full+'@'+S.repo.branch+(pre?' · '+pre+'/':'')+' · '+r.files.length+' files · "name:line"]\n';
  for(const cap of [RM_MAXSYM,15,6,0]){
    const body=r.files.map(e=>rmLine(e,cap)).join('\n');
    if(body.length<=RM_BUDGET)return head+body+(cap<RM_MAXSYM?'\n[Some symbols are left out to keep this short: pass path (a folder) or find (names) for the details.]':'')+rmNote(r);
  }
  /* even the file names alone do not fit: show folders (deep enough to tell them apart), or the first names */
  const dirs=rmDirs(r.files);
  const tail='\nCall repo_map again with path (a folder) or find (names).'+rmNote(r);
  if(dirs.count>1)return head+'Too many files to list ('+r.files.length+'). Folders: '+dirs.text+tail;
  const names=[];let len=0;
  for(const e of r.files){const l=rmLine(e,0);if(len+l.length>RM_BUDGET-1500)break;names.push(l);len+=l.length+1}
  return head+'Too many files to list ('+r.files.length+'); the first '+names.length+':\n'+names.join('\n')+tail;
}
/* folder counts (file names not included) at the first depth (1-6) that splits the files into at least 6 groups */
function rmDirs(files){
  let groups={};
  for(let depth=1;depth<=6;depth++){
    groups={};
    for(const e of files){const k=e.p.split('/').slice(0,-1).slice(0,depth).join('/')||'(root files)';groups[k]=(groups[k]||0)+1}
    if(Object.keys(groups).length>=6)break;
  }
  const list=Object.entries(groups).sort((a,b)=>b[1]-a[1]).slice(0,60);
  return {count:Object.keys(groups).length,text:list.map(([k,v])=>k+' ('+v+')').join(', ')};
}
/* matches for one or more names/words: a file matches when every word is in its path, a symbol when every word is in its label or path */
function rmFind(r,qs){
  return qs.map(q=>{
    const words=q.toLowerCase().split(/\s+/).filter(Boolean),hits=[];
    for(const e of r.files){
      const pl=e.p.toLowerCase();
      if(words.every(w=>pl.includes(w)))hits.push(e.p+(e.n?' ('+e.n+' lines)':''));
      for(const [ln,lab] of e.s){
        const l=lab.toLowerCase();
        if(words.every(w=>l.includes(w)||pl.includes(w)))hits.push(e.p+':'+ln+'  '+lab);
      }
    }
    const shown=hits.slice(0,15).join('\n');
    return '"'+q+'": '+(hits.length?hits.length+' hit'+(hits.length>1?'s':''):'no declaration or file name matches (use search_code for text inside files)')+
      (shown?'\n'+shown:'')+(hits.length>15?'\n… '+(hits.length-15)+' more: use a longer name or path':'');
  }).join('\n\n');
}

/* the agent tool */
async function repoMapTool(c,a){
  const pre=String(a.path||'').replace(/^\/+|\/+$/g,'');
  const qs=(Array.isArray(a.find)?a.find:(a.find?[a.find]:[])).map(x=>String(x).trim()).filter(Boolean).slice(0,8);
  const r=await rmBuild(c,pre);
  if(r.empty)return '(repo empty)';
  if(!r.files.length)return 'No files'+(pre?' under '+pre:'')+'.';
  return qs.length?rmFind(r,qs)+rmNote(r):rmFormat(r,pre);
}
