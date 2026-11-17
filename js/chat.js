/* Orin · chat — send() and render().
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
let busy=false;
async function send(){
  const txt=$('box').value.trim();if((!txt&&!pend.length)||busy)return;
  let list=provList();
  if(recOn&&rec)rec.stop();
  if(imgMode){if(pend.length){toast('Image mode doesn’t support attachments. Remove them first');return}if(!txt){toast('Describe the image you want');return}if(!imgReady()){toast('Add an image provider in Settings first');spage='img';openSheet();return}}
  else if(!list.length){toast('Add a provider in Settings first');spage='prov';openSheet();return}
  if(!imgMode){
    const lim=ctxOf(list[0]),oc=chat(),fb=fbudget(lim),pf=pend.reduce((a,x)=>a+(x.kind==='text'?x.tok||etok(x.text):0),0),of=oc?chatFiles(oc).reduce((a,f)=>a+f.tok,0):0,nf=oc?ctxChars(oc):0,est=etok(nf+txt.length)+Math.min(pf+of,fb);
    if(est>lim*0.85&&!await ask('This message may be too long','It is about '+fmtTok(est)+' tokens, but '+list[0].name+' supports about '+fmtTok(lim)+'. The model may return an error.\n\nTry attaching smaller files or using a Gemini model. You can also set the context window per provider in Settings.','Send anyway'))return;
  }
  if(!chat())newChat();
  const c=chat();c.t=Date.now();const um={role:'user',content:txt};
  const ims=pend.filter(a=>a.kind==='image'||a.kind==='pdf'),fl=pend.filter(a=>a.kind==='text');
  if(ims.length){um.imgs=ims.map(a=>({mime:a.mime,data:a.data,name:a.name}));um.atts=ims.map(a=>({name:a.name,pdf:a.kind==='pdf'}))}
  if(fl.length){um.files=[];for(const a of fl){const id=uid(),ok=await fput(id,a.text),f={name:a.name,id,size:a.size||a.text.length,tok:a.tok||etok(a.text)};if(!ok){if(a.text.length<=2e5)f.text=a.text;else{toast(a.name+': storage is full, file was not saved');continue}}um.files.push(f)}}
  if(c.title==='New chat')c.title=(txt||(pend[0]&&pend[0].name)||'File').slice(0,32);
  c.msgs.push(um);pend=[];renderTray();
  $('box').value='';$('box').style.height='auto';busy=true;stopped=false;setBusyUI(true);save();render(true);
  if(imgMode){um.gen=1;await runImg(c);return}
  if(S.web&&txt){
    if(!(S.search&&S.search.key))toast('Add a Tavily key in Settings to use web search');
    else try{const r=await webSearch(txt);if(r.length)um.web={q:txt,r}}catch(e){if(stopped||e.message==='STOP'){busy=false;setBusyUI(false);save();render();return}toast('Web search fail: '+e.message)}
  }
  await (agentOn()?runAgent(c,list):run(c,list));
}

/* ---------- Render ---------- */
/* small label above a message: "Me" for the user, the provider name (as set in Settings) that wrote the reply for the AI */
const whoHTML=m=>{const n=m.by||'';if(!n&&!m.model)return '';return '<div class="who">'+esc(n||m.model)+(m.skipped&&m.skipped.length?' (fallback)':'')+'</div>'};
const liveWho=()=>liveBy?whoHTML(liveBy).replace('class="who"','class="who" id="livewho" data-k="'+qa(liveBy.by+'|'+liveBy.model)+'"'):'';
let rst={id:null,n:0};   /* what the last render showed: only messages added since then get the entrance animation */
function render(typing){
  const c=chat();
  updatePill();updateChip();setTimeout(updateFab,0);
  if(wide.matches)renderList();
  $('form').style.display=home?'none':'';
  if(home){rst={id:null,n:0};const hv=$('hbox')?$('hbox').value:'';$('title').textContent='Orin';$('msgs').innerHTML=homeHTML();if(hv){$('hbox').value=hv;$('hsend').disabled=false}return}$('title').textContent=c?c.title:'Orin';
  const el=$('msgs');
  if(!c||!c.msgs.length&&!typing){
    rst={id:c?c.id:null,n:0};
    el.innerHTML='<div class="empty"><div class="logo"><i></i></div><h2>What can I help with?</h2><p>'+(S.providers.length?'Type a message, or start from a suggestion.':'Add a provider to get started.')+'</p>'+(S.providers.length?sugHTML():'<button class="btn" data-act="hset" style="margin-top:14px">Add provider</button>')+'</div>';return}
  const fresh=rst.id===c.id&&c.msgs.length>rst.n?rst.n:1e9;rst={id:c.id,n:c.msgs.length};
  let h='';
  const from=Math.max(0,c.msgs.length-60);c.msgs.forEach((m,i)=>{if(i<from)return;
    if(m.role==='user')h+='<div class="who r">Me</div><div class="m u'+(i>=fresh?' fresh':'')+'">'+(m.imgs?m.imgs.map(x=>x.mime==='application/pdf'?'<span class="tag">'+ico('pdf',13)+esc(x.name||'PDF')+'</span>':'<img class="th" src="data:'+x.mime+';base64,'+x.data+'">').join(''):(m.atts||[]).map(a=>'<span class="tag">'+(a.pdf?ico('pdf',13):ico('image',13))+esc(a.name)+'</span>').join(''))+(m.files||[]).map(f=>'<span class="tag">'+ico('file',13)+esc(f.name)+'</span>').join('')+(m.sm?'<span class="tag">'+ico('search',13)+'Smart · '+m.sm+' excerpts</span>':'')+(m.content?esc(m.content).replace(/\n/g,'<br>'):'')+'</div><div class="meta r">'+ibtn('data-edit="'+i+'"','Edit','edit')+'</div>';
    else if(m.role==='assistant'){
      h+=whoHTML(m)+'<div class="m a">'+logHTML(m)+(m.pic?'<img class="gi" alt="" src="'+qa(m.pic)+'">':mdm(m))+'</div>'+srcHTML(m.src)+'<div class="meta"><span>'+usageStr(m.u).replace(/^ · /,'')+'</span>'+(m.pic?ibtn('data-save="'+i+'"','Save image','dl'):ibtn('data-copy="'+i+'"','Copy','copy'))+ibtn('data-fork="'+i+'"','Fork: new chat from here','fork')+(i===c.msgs.length-1?ibtn('data-regen="1"','Regenerate','refresh')+(m.cut&&!m.pic?'<button class="chip" data-cont="1">Continue</button>':''):'')+'</div>';
    }else h+='<div class="m e">'+esc(m.content).replace(/\n/g,'<br>')+'</div>'+(i===c.msgs.length-1?'<div class="meta">'+ibtn('data-regen="1"','Retry','refresh')+'<span>Retry</span></div>':'');
  });
  {const tu=c.msgs.reduce((a,m)=>{if(m.u){a.i+=m.u.i;a.o+=m.u.o;if(m.u.c!=null){a.c+=m.u.c;a.hc=1}if(m.u.e)a.e=1;a.n++}return a},{i:0,o:0,c:0,n:0});
  if(tu.n>1)h+='<div class="src" style="align-self:center;margin-top:0">Total: ↑'+fmtTok(tu.i)+' ↓'+fmtTok(tu.o)+(tu.e?'~':'')+(tu.hc?' · '+fmtCost(tu.c):'')+'</div>'}
  if(!busy)h+=taskHTML(c)+planHTML(c)+draftHTML(c);
  if(typing||busy)h+=(busy?liveWho()+liveNoteHTML():'')+'<div class="m a" id="liveb">'+liveInner()+'</div>';
  el.innerHTML=h;el.scrollTop=el.scrollHeight;
}
let q='';
function renderList(){
  const l=S.chats.filter(c=>!q||c.title.toLowerCase().includes(q)||c.msgs.some(m=>(m.content||'').toLowerCase().includes(q)));
  const item=c=>'<div class="sw"><div class="ca"><button class="pa" data-pin="'+c.id+'">'+(c.pin?'Unpin':'Pin')+'</button><button class="da" data-sdel="'+c.id+'">Delete</button></div><div class="ci '+(c.id===S.cur?'cur':'')+'"><button class="t" data-open="'+c.id+'">'+(c.pin?'<span class="pn">'+IC.pin+'</span>':'')+esc(c.title)+'</button><button class="x" data-more="'+c.id+'" aria-label="Options">'+IC.dots+'</button></div></div>';
  let h;
  if(q)h=l.map(item).join('');
  else{
    const today=new Date().setHours(0,0,0,0),g={};
    const nm=c=>{if(c.pin)return 'Pinned';if(!c.t)return 'Older';const d=c.t>=today?0:Math.ceil((today-c.t)/864e5);return d===0?'Today':d===1?'Yesterday':d<=7?'Previous 7 days':'Older'};
    l.slice().sort((a,b)=>(b.t||0)-(a.t||0)).forEach(c=>{const k=nm(c);(g[k]=g[k]||[]).push(c)});
    h=['Pinned','Today','Yesterday','Previous 7 days','Older'].filter(k=>g[k]).map(k=>'<div class="gh">'+k+'</div>'+g[k].map(item).join('')).join('');
  }
  $('clist').innerHTML=h||'<p class="empty">'+(q?'No matching chats':'No chats yet')+'</p>';
}
const wide=matchMedia('(min-width:1024px)');
wide.addEventListener('change',()=>{if(wide.matches)renderList()});
function openDrawer(){renderList();$('drawer').classList.add('on');$('ov').classList.add('on')}
function closeDrawer(){$('drawer').classList.remove('on');$('ov').classList.remove('on')}

