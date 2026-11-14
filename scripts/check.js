#!/usr/bin/env node
/* Orin checks (run by .github/workflows/check.yml, also fine to run locally: node scripts/check.js [rootDir]).
   - every file an html page loads exists, and every js/*.js file is loaded by some page
   - each script parses, and the scripts of a page joined in load order parse together
     (they share one global scope, so a duplicate const/let/function name across files is an error)
   - index.html has a Content-Security-Policy without 'unsafe-inline' for scripts, and nothing in the
     app would be blocked by it: no inline <script>, no inline on...= handlers (templates.js is user project data, skipped)
   - sw.js lists the same files, sw.js parses, manifest.json is valid JSON
   - no token / API key pattern is committed */
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(process.argv[2]||'.');
const rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const ex=f=>fs.existsSync(path.join(root,f));
const fail=[];const bad=m=>fail.push(m);
const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html')).sort();
if(!pages.includes('index.html'))bad('index.html is missing');
const parse=(code,name)=>{try{new vm.Script(code,{filename:name});return true}catch(e){bad(name+': '+e.message);return false}};
const loaded=new Set(),assets=new Set(),css=new Set();
let nScripts=0;
for(const pg of pages){
  const html=rd(pg);
  const srcs=[...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/g)].map(m=>m[1]);
  const inline=[...html.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  const sheets=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
  if(pg==='index.html'&&!srcs.length)bad('index.html loads no scripts');
  if(pg==='index.html'&&inline.length)bad('index.html has an inline <script>: the Content-Security-Policy blocks it, move it to js/');
  const parts=[];
  for(const f of srcs){loaded.add(f);assets.add(f);if(!ex(f)){bad(pg+' references a missing file: '+f);continue}const t=rd(f);parts.push(t);parse(t,f);nScripts++}
  inline.forEach((t,i)=>{parts.push(t);parse(t,pg+' inline script '+(i+1))});
  for(const f of sheets){css.add(f);assets.add(f);if(!ex(f))bad(pg+' references a missing file: '+f)}
  if(parts.length>1)parse(parts.join('\n'),'all scripts of '+pg+' joined in load order');
}
if(ex('js'))for(const f of fs.readdirSync(path.join(root,'js')))if(f.endsWith('.js')&&!loaded.has('js/'+f))bad('js/'+f+' is not loaded by any html page');
/* Content-Security-Policy of the app page */
if(pages.includes('index.html')){
  const html=rd('index.html');
  const m=html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i);
  if(!m)bad('index.html has no Content-Security-Policy meta tag');
  else{
    const dir=n=>{const x=m[1].split(';').map(s=>s.trim()).find(s=>s.startsWith(n+' '));return x||''};
    const ss=dir('script-src');
    if(!ss)bad('CSP has no script-src');
    else if(/'unsafe-inline'/.test(ss))bad("CSP script-src must not contain 'unsafe-inline'");
    if(!/^default-src 'none'/.test(m[1].trim()))bad("CSP should start with default-src 'none'");
    if(!dir('object-src').includes("'none'"))bad("CSP should have object-src 'none'");
  }
  if(/\son[a-z]{3,}\s*=\s*["']/i.test(html.replace(/<meta[^>]*>/gi,'')))bad('index.html has an inline on…= handler: the CSP blocks it, use addEventListener');
  for(const f of [...loaded]){
    if(f==='js/templates.js'||!ex(f))continue;
    const t=rd(f),hit=t.match(/[\s'"`]on(click|change|input|error|load|submit|focus|blur|keydown|keyup|keypress|mouse[a-z]+|touch[a-z]+)=\\?["']/i);
    if(hit)bad(f+': inline handler "'+hit[0].trim()+'" in generated html: the CSP blocks it, use data- attributes and addEventListener');
  }
}
if(ex('sw.js')){
  const sw=rd('sw.js');parse(sw,'sw.js');
  for(const f of [...assets,...pages.filter(p=>p!=='index.html')])if(!sw.includes("'"+f+"'"))bad('sw.js does not list '+f+' (add it to SHELL)');
}
try{JSON.parse(rd('manifest.json'))}catch(e){bad('manifest.json: '+e.message)}
const SECRET=/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|sk-(ant-|proj-)?[A-Za-z0-9_-]{30,}/;
const scan=[...pages,'sw.js','manifest.json','README.md',...assets].filter(ex);
for(const f of scan){const m=rd(f).match(SECRET);if(m)bad('possible secret in '+f+': '+m[0].slice(0,8)+'…')}
if(fail.length){console.error('FAILED:\n- '+fail.join('\n- '));process.exit(1)}
console.log('OK: '+pages.length+' pages, '+nScripts+' scripts, '+css.size+' stylesheet(s); each parses, each page parses together; CSP present and strict for scripts; sw.js, manifest.json, secrets scan fine');
