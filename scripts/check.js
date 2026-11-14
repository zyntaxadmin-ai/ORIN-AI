#!/usr/bin/env node
/* Orin checks (run by .github/workflows/check.yml, also fine to run locally: node scripts/check.js [rootDir]).
   - every file index.html loads exists, and every js/*.js file is loaded
   - each script parses, and all scripts joined in load order parse together
     (they share one global scope, so a duplicate const/let/function name across files is an error)
   - sw.js lists the same files, sw.js parses, manifest.json is valid JSON
   - no token / API key pattern is committed */
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(process.argv[2]||'.');
const rd=f=>fs.readFileSync(path.join(root,f),'utf8');
const fail=[];const bad=m=>fail.push(m);
const html=rd('index.html');
const srcs=[...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"[^>]*>/g)].map(m=>m[1]);
const css=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
const inline=[...html.matchAll(/<script\b(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(!srcs.length&&!inline.length)bad('index.html loads no scripts');
for(const f of [...srcs,...css])if(!fs.existsSync(path.join(root,f)))bad('index.html references a missing file: '+f);
const jsDir=path.join(root,'js');
if(fs.existsSync(jsDir))for(const f of fs.readdirSync(jsDir))if(f.endsWith('.js')&&!srcs.includes('js/'+f))bad('js/'+f+' is not loaded by index.html');
const parse=(code,name)=>{try{new vm.Script(code,{filename:name});return true}catch(e){bad(name+': '+e.message+(e.stack?' ('+String(e.stack).split('\n')[0]+')':''));return false}};
const parts=[];
for(const f of srcs){if(!fs.existsSync(path.join(root,f)))continue;const t=rd(f);parts.push(t);parse(t,f)}
inline.forEach((t,i)=>{parts.push(t);parse(t,'index.html inline script '+(i+1))});
if(parts.length>1)parse(parts.join('\n'),'all scripts joined in load order');
if(fs.existsSync(path.join(root,'sw.js'))){
  const sw=rd('sw.js');parse(sw,'sw.js');
  for(const f of [...srcs,...css])if(!sw.includes("'"+f+"'"))bad('sw.js does not list '+f+' (add it to SHELL)');
}
try{JSON.parse(rd('manifest.json'))}catch(e){bad('manifest.json: '+e.message)}
const SECRET=/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|sk-(ant-|proj-)?[A-Za-z0-9_-]{30,}/;
const scan=['index.html','sw.js','manifest.json','README.md',...srcs,...css].filter(f=>fs.existsSync(path.join(root,f)));
for(const f of scan){const m=rd(f).match(SECRET);if(m)bad('possible secret in '+f+': '+m[0].slice(0,8)+'…')}
if(fail.length){console.error('FAILED:\n- '+fail.join('\n- '));process.exit(1)}
console.log('OK: '+srcs.length+' scripts + '+css.length+' stylesheet(s); each parses, all parse together; sw.js, manifest.json, secrets scan fine');
