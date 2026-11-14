/* Orin · core — state, storage, helpers, markdown, chat list, UI refresh.
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
const PRESETS=[
 ['OpenRouter','openai','https://openrouter.ai/api/v1'],
 ['Groq','openai','https://api.groq.com/openai/v1'],
 ['DeepSeek','openai','https://api.deepseek.com/v1'],
 ['Together','openai','https://api.together.xyz/v1'],
 ['OpenAI','openai','https://api.openai.com/v1'],
 ['Anthropic','anthropic','https://api.anthropic.com'],
 ['Gemini','gemini','https://generativelanguage.googleapis.com']];
const KEY='my-ai-v1';
const strip=(k,v)=>k==='imgs'?undefined:v;
let S={providers:[],chats:[],cur:null,system:'',theme:'light'};
try{const r=localStorage.getItem(KEY);if(r)S=Object.assign(S,JSON.parse(r))}catch(e){}
if(S.theme==='auto'&&!S.t2){S.theme='light';S.t2=1}
const $=id=>document.getElementById(id);
const uid=()=>Math.random().toString(36).slice(2,10);
const _s=(p,w)=>'<svg viewBox="0 0 24 24" width="'+(w||20)+'" height="'+(w||20)+'" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>';
const IC={
 menu:_s('<path d="M4 7h16M4 12h16M4 17h10"/>'),
 edit:_s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'),
 gear:_s('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
 plus:_s('<path d="M12 5v14M5 12h14"/>'),
 globe:_s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>'),
 image:_s('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>'),
 mic:_s('<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>'),
 up:_s('<path d="M12 19V5M5 12l7-7 7 7"/>'),
 stop:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
 copy:_s('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 017.5 4H16"/>'),
 refresh:_s('<path d="M20 11a8 8 0 10-2.2 5.6M20 4v7h-7"/>'),
 dl:_s('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
 chev:_s('<path d="M6 9l6 6 6-6"/>',14),
 cup:_s('<path d="M6 15l6-6 6 6"/>',14),
 cdn:_s('<path d="M6 9l6 6 6-6"/>',14),
 dots:'<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>',
 pin:_s('<path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z"/>',14),
 x:_s('<path d="M6 6l12 12M18 6L6 18"/>'),
 dn:_s('<path d="M12 5v14M5 12l7 7 7-7"/>')
};
const IX={
 check:'<path d="M20 6L9 17l-5-5"/>',
 file:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/>',
 pdf:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
 note:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
 folder:'<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
 branch:'<path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/>',
 pr:'<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7M6 9v12"/>',
 trash:'<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/>',
 undo:'<path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 00-4-4H4"/>',
 scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
 plusc:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
 issue:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 okc:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
 xc:'<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
 spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',
 bot:'<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5M9 13.5v1.5M15 13.5v1.5"/><circle cx="12" cy="3.8" r="1.2"/>',
 github:'<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>',
 cloud:'<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>',
 save:'<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
 hist:'<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
 clip:'<path d="M21 11.5l-9 9a5.5 5.5 0 01-7.8-7.8l9-9a3.7 3.7 0 015.2 5.2l-9 9a1.8 1.8 0 01-2.6-2.6l8.4-8.4"/>',
 camera:'<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
 chat:'<path d="M21 12a8 8 0 01-11.6 7.1L3 21l1.9-5.4A8 8 0 1121 12z"/>',
 palette:'<path d="M12 3a9 9 0 100 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.8 1.8-1.8H17a4 4 0 004-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
 lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
 wrench:'<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
 box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3.3 7.5L12 12.5l8.7-5M12 22V12.5"/>',
 edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
 pin:'<path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z"/>',
 up:'<path d="M12 19V5M5 12l7-7 7 7"/>',
 x:'<path d="M6 6l12 12M18 6L6 18"/>',
 refresh:'<path d="M20 11a8 8 0 10-2.2 5.6M20 4v7h-7"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
 image:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-9 9"/>'
};
const ico=(k,w)=>_s(IX[k]||'',w||16).replace('<svg','<svg class="ic"');
const ibtn=(a,l,k)=>'<button '+a+' aria-label="'+l+'" title="'+l+'">'+IC[k]+'</button>';
function initIcons(){const m={menu:'menu',newc:'edit',gear:'gear',plus:'plus',webb:'globe',imgb:'image',mic:'mic',dclose:'x',tobot:'dn'};for(const k in m){const e=$(k);if(e)e.innerHTML=IC[m[k]]}$('dset').innerHTML=IC.gear+'<span>Settings</span>';setBusyUI(false)}
const SUG=[['Email likho','Professional email draft','Ekta professional email likhte help koro: '],['Code bujhao','Step by step explain','Ei code ta step by step bujhiye dao:\n'],['Idea dao','Notun project er idea','Amake ekta project er jonno 5 ta notun idea dao.'],['Bangla te likho','Golpo, kobita, lekha','Bangla te ekta chotto golpo likho.']];
const sugHTML=()=>'<div class="sug">'+SUG.map((x,i)=>'<button data-sug="'+i+'"><b>'+x[0]+'</b><span>'+x[1]+'</span></button>').join('')+'</div>';
const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
let qw=0;
function rawSave(){try{localStorage.setItem(KEY,JSON.stringify(S,strip))}catch(e){if(Date.now()-qw>30000){qw=Date.now();toast('Storage bhore geche! Purono chat delete koro ba Backup export koro')}}}
function save(){S.ts=Date.now();rawSave();schedPush()}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),Math.max(1800,String(t).length*55))}
function inl(t){
  const cs=[],hold=h=>{cs.push(h);return '\u0000'+(cs.length-1)+'\u0000'};
  t=t.replace(/`([^`\n]+)`/g,(_,c)=>hold('<code>'+c+'</code>'));
  t=t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,a,u)=>hold('<a href="'+u+'" target="_blank" rel="noopener">'+a+'</a>'));
  t=t.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<.,;:!?)])/g,(_,q,u)=>q+hold('<a href="'+u+'" target="_blank" rel="noopener">'+u+'</a>'));
  t=t.replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>').replace(/(^|[^\w])__([^\s_](?:[^_\n]*[^\s_])?)__(?!\w)/g,'$1<b>$2</b>').replace(/~~([^~\n]+)~~/g,'<s>$1</s>').replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<i>$2</i>').replace(/(^|[^\w])_([^\s_](?:[^_\n]*[^\s_])?)_(?!\w)/g,'$1<i>$2</i>');
  let n=0;while(/\u0000\d+\u0000/.test(t)&&n++<3)t=t.replace(/\u0000(\d+)\u0000/g,(_,i)=>cs[i]);
  return t;
}
function tbl(rows){
  const R=rows.map(r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));
  const sep=R[1]&&R[1].every(c=>/^:?-{1,}:?$/.test(c));
  const head=sep?R[0]:null,body=sep?R.slice(2):R;
  return '<div class="tw"><table>'+(head?'<thead><tr>'+head.map(c=>'<th>'+inl(c)+'</th>').join('')+'</tr></thead>':'')+'<tbody>'+body.map(r=>'<tr>'+r.map(c=>'<td>'+inl(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function md(t){
  return esc(t).split('```').map((p,i)=>{
    if(i%2)return '<div class="cw"><button class="cp" data-cc="1">Copy</button><pre><code>'+p.replace(/^[\w-]*\n/,'')+'</code></pre></div>';
    let h='',tb=[];const stk=[],LI=/^(\s*)([*+-]|\d+[.)])\s+(.*)$/;
    const eL=()=>{while(stk.length)h+='</'+stk.pop().t+'>'};
    const eT=()=>{if(tb.length){h+=tbl(tb);tb=[]}};
    const L=p.split('\n');
    for(let k=0;k<L.length;k++){
      const ln=L[k];let m;
      if(/^\s*\|.*\|\s*$/.test(ln)){eL();tb.push(ln);continue}
      eT();
      if(/^\s*(-{3,}|\*{3,})\s*$/.test(ln)){eL();h+='<hr>'}
      else if(m=ln.match(/^(#{1,6})\s+(.*)$/)){eL();const n=m[1].length<=3?3:4;h+='<h'+n+'>'+inl(m[2])+'</h'+n+'>'}
      else if(m=ln.match(LI)){
        const ind=m[1].replace(/\t/g,'    ').length,ty=/\d/.test(m[2])?'ol':'ul';
        while(stk.length&&stk[stk.length-1].ind>ind)h+='</'+stk.pop().t+'>';
        const top=stk[stk.length-1];
        if(!top||ind>top.ind){h+=ty==='ol'&&parseInt(m[2])>1?'<ol start="'+parseInt(m[2])+'">':'<'+ty+'>';stk.push({t:ty,ind})}
        else if(top.t!==ty){h+='</'+stk.pop().t+'><'+ty+'>';stk.push({t:ty,ind})}
        let x=m[3],tk='';const c=x.match(/^\[([ xX])\]\s+(.*)$/);
        if(c){tk='<input type="checkbox" disabled'+(c[1]===' '?'':' checked')+'> ';x=c[2]}
        h+='<li'+(c?' class="tk"':'')+'>'+tk+inl(x)+'</li>';
      }
      else if(m=ln.match(/^&gt;\s?(.*)$/)){eL();h+='<blockquote>'+inl(m[1])+'</blockquote>'}
      else if(!ln.trim()){
        let j=k+1;while(j<L.length&&!L[j].trim())j++;
        if(stk.length&&j<L.length&&LI.test(L[j]))continue;
        eL();h+='<div class="sp"></div>';
      }
      else{eL();h+='<p>'+inl(ln)+'</p>'}
    }
    eL();eT();return h;
  }).join('');
}
function copyText(t){return (navigator.clipboard&&window.isSecureContext?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>{const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.append(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()})}
function applyTheme(){if(S.theme==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.dataset.theme=S.theme}
function chat(){return S.chats.find(c=>c.id===S.cur)}
function newChat(){const c={id:uid(),title:'New chat',msgs:[],t:Date.now()};S.chats.unshift(c);S.cur=c.id;home=false;save();closeDrawer();render();$('box').focus()}


