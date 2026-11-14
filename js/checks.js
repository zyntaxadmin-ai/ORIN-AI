/* Orin · checks — pre-push checks (syntax, secrets).
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
/* ---- pre-push checks ---- */
const SECRET_RES=[['AWS key',/AKIA[0-9A-Z]{16}/],['GitHub token',/\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],['Google API key (Firebase/Maps web key hole domain restrict koro)',/AIza[0-9A-Za-z_\-]{35}/],['OpenAI/Anthropic key',/\bsk-(ant-|proj-)?[A-Za-z0-9_\-]{20,}/],['Slack token',/xox[baprs]-[A-Za-z0-9-]{10,}/],['Stripe secret key',/\b[sr]k_live_[A-Za-z0-9]{16,}/],['Private key',/-----BEGIN [A-Z ]*PRIVATE KEY-----/],['Tavily key',/tvly-[A-Za-z0-9]{16,}/],['Supabase service key',/service_role/i],['Secret/password assignment',/(?:api[_-]?key|secret|passwd|password|token|private[_-]?key)["']?\s*[:=]\s*["']([A-Za-z0-9_\-+\/=]{20,})["']/i]];
function scanSecrets(path,text){
  const out=[];if(/(^|\/)\.env(\.|$)/.test(path)&&!/\.(example|sample|template)$/.test(path))out.push('.env file commit korbe na (secret thake)');
  text.split('\n').forEach((ln,i)=>{if(ln.length>3000||out.length>=4)return;for(const [k,re] of SECRET_RES){const m=re.exec(ln);if(m&&!(m[1]&&/your|example|placeholder|xxxx|changeme|\*{4}|<.*>/i.test(m[1]))){if(k==='Supabase service key'&&!/eyJ/.test(ln))continue;out.push(k+' (line '+(i+1)+')');break}}});
  return out;
}
function lintFile(path,text){
  const ext=((path.match(/\.([a-z0-9]+)$/i)||[])[1]||'').toLowerCase(),out=[];
  const okErr=e=>/await|import|export|Cannot use/i.test(e.message);
  try{
    if(ext==='json')JSON.parse(text);
    else if(/^(js|mjs|cjs)$/.test(ext)){if(!/^\s*(import|export)\s/m.test(text))new Function(text)}
    else if(/^html?$/.test(ext)){
      const re=/<script\b([^>]*)>([\s\S]*?)<\/script>/gi;let m;
      while((m=re.exec(text))){if(/\bsrc\s*=/i.test(m[1]))continue;const ty=(m[1].match(/type\s*=\s*["']?([^"'\s>]+)/i)||[])[1]||'';if(ty&&!/javascript|ecmascript/i.test(ty))continue;if(/^\s*(import|export)\s/m.test(m[2]))continue;if(m[2].trim()){try{new Function(m[2])}catch(e){if(!okErr(e))throw e}}}
      if((text.match(/<script\b/gi)||[]).length!==(text.match(/<\/script>/gi)||[]).length)out.push('<script> tag thikmoto bondho hoyni');
    }else if(ext==='css'){const t=text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'');if((t.match(/{/g)||[]).length!==(t.match(/}/g)||[]).length)out.push('CSS e { } milche na')}
  }catch(e){if(!okErr(e))out.push('Syntax error: '+e.message)}
  return out.map(x=>path+': '+x).concat(scanSecrets(path,text).map(x=>path+': SECRET? '+x));
}
function checkDraft(c){const d=c.draft,out=[];if(!d)return out;for(const [p,f] of Object.entries(d.files)){if(f.del||f.bin||typeof f.content!=='string')continue;out.push(...lintFile(p,f.content))}return out}
const lintNote=(p,t)=>{const l=lintFile(p,t);return l.length?'\nWARNING (fix this before finishing): '+l.join('; '):''};
