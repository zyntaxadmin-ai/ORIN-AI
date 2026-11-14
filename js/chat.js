/* Orin · chat — send() and render().
   Plain script (no modules): shares one global scope with the other js/*.js files, loaded in the order listed in index.html. */
let busy=false;
async function send(){
  const txt=$('box').value.trim();if((!txt&&!pend.length)||busy)return;
  let list=S.providers.filter(p=>p.on&&p.model&&p.url);
  if(S.pick){const o=list.find(p=>p.id===S.pick);if(o)list=[o]}
  if(recOn&&rec)rec.stop();
  if(imgMode){if(pend.length){toast('Image mode e attachment hobe na. Attachment soriye dao');return}if(!txt){toast('Chobir description likho');return}if(!imgReady()){toast('Age Settings e image provider add koro');spage='img';openSheet();return}}
  else if(!list.length){toast('Age Settings e provider add koro');spage='prov';openSheet();return}
  if(!imgMode){
    const lim=ctxOf(list[0]),oc=chat(),fb=fbudget(lim),pf=pend.reduce((a,x)=>a+(x.kind==='text'?x.tok||etok(x.text):0),0),of=oc?chatFiles(oc).reduce((a,f)=>a+f.tok,0):0,nf=oc?oc.msgs.reduce((a,m)=>a+(m.content||'').length,0):0,est=etok(nf+txt.length)+Math.min(pf+of,fb);
    if(est>lim*0.85&&!confirm('Ei message e proy ~'+fmtTok(est)+' token jabe, kintu '+list[0].name+' er limit ~'+fmtTok(lim)+' token. Model error dite pare. Tobu pathabe?\n(Chhoto file dile ba Gemini model use korle bhalo. Settings e provider er "Context window" thik kora jay.)'))return;
  }
  if(!chat())newChat();
  const c=chat();c.t=Date.now();const um={role:'user',content:txt};
  const ims=pend.filter(a=>a.kind==='image'||a.kind==='pdf'),fl=pend.filter(a=>a.kind==='text');
  if(ims.length){um.imgs=ims.map(a=>({mime:a.mime,data:a.data,name:a.name}));um.atts=ims.map(a=>({name:a.name,pdf:a.kind==='pdf'}))}
  if(fl.length){um.files=[];for(const a of fl){const id=uid(),ok=await fput(id,a.text),f={name:a.name,id,size:a.size||a.text.length,tok:a.tok||etok(a.text)};if(!ok){if(a.text.length<=2e5)f.text=a.text;else{toast(a.name+': storage fail, file save hoyni');continue}}um.files.push(f)}}
  if(c.title==='New chat')c.title=(txt||(pend[0]&&pend[0].name)||'File').slice(0,32);
  c.msgs.push(um);pend=[];renderTray();
  $('box').value='';$('box').style.height='auto';busy=true;stopped=false;setBusyUI(true);save();render(true);
  if(imgMode){um.gen=1;await runImg(c);return}
  if(S.web&&txt){
    if(!(S.search&&S.search.key))toast('Web search er jonno Settings e Tavily key dao');
    else try{const r=await webSearch(txt);if(r.length)um.web={q:txt,r}}catch(e){if(stopped||e.message==='STOP'){busy=false;setBusyUI(false);save();render();return}toast('Web search fail: '+e.message)}
  }
  await (agentOn()?runAgent(c,list):run(c,list));
}

/* ---------- Render ---------- */
function render(typing){
  const c=chat();
  updatePill();updateChip();setTimeout(updateFab,0);
  $('form').style.display=home?'none':'';
  if(home){$('title').textContent='Orin';$('msgs').innerHTML=homeHTML();return}$('title').textContent=c?c.title:'Orin';
  const el=$('msgs');
  if(!c||!c.msgs.length&&!typing){
    el.innerHTML='<div class="empty"><div class="logo"><i></i></div><h2>Ki jante chao?</h2><p>'+(S.providers.length?'Likhte shuru koro, ba niche theke ekta bachho.':'Shuru korar age ekta provider add korte hobe.')+'</p>'+(S.providers.length?sugHTML():'<button class="btn" data-act="hset" style="margin-top:14px">Provider add koro</button>')+'</div>';return}
  let h='';
  const from=Math.max(0,c.msgs.length-60);c.msgs.forEach((m,i)=>{if(i<from)return;
    if(m.role==='user')h+='<div class="m u">'+(m.imgs?m.imgs.map(x=>x.mime==='application/pdf'?'<span class="tag">'+ico('pdf',13)+esc(x.name||'PDF')+'</span>':'<img class="th" src="data:'+x.mime+';base64,'+x.data+'">').join(''):(m.atts||[]).map(a=>'<span class="tag">'+(a.pdf?ico('pdf',13):ico('image',13))+esc(a.name)+'</span>').join(''))+(m.files||[]).map(f=>'<span class="tag">'+ico('file',13)+esc(f.name)+'</span>').join('')+(m.sm?'<span class="tag">'+ico('search',13)+'Smart · '+m.sm+' ongsho</span>':'')+(m.content?esc(m.content).replace(/\n/g,'<br>'):'')+'</div><div class="meta r">'+ibtn('data-edit="'+i+'"','Edit','edit')+'</div>';
    else if(m.role==='assistant'){
      h+='<div class="m a">'+logHTML(m)+(m.pic?'<img class="gi" alt="" src="'+qa(m.pic)+'">':md(m.content))+'</div>'+srcHTML(m.src)+'<div class="meta"><span>'+esc(m.by||'')+(m.skipped&&m.skipped.length?' (fallback)':'')+usageStr(m.u)+'</span>'+(m.pic?ibtn('data-save="'+i+'"','Save image','dl'):ibtn('data-copy="'+i+'"','Copy','copy'))+(i===c.msgs.length-1?ibtn('data-regen="1"','Regenerate','refresh'):'')+'</div>';
    }else h+='<div class="m e">'+esc(m.content).replace(/\n/g,'<br>')+'</div>'+(i===c.msgs.length-1?'<div class="meta">'+ibtn('data-regen="1"','Retry','refresh')+'<span>Retry</span></div>':'');
  });
  {const tu=c.msgs.reduce((a,m)=>{if(m.u){a.i+=m.u.i;a.o+=m.u.o;if(m.u.c!=null){a.c+=m.u.c;a.hc=1}if(m.u.e)a.e=1;a.n++}return a},{i:0,o:0,c:0,n:0});
  if(tu.n>1)h+='<div class="src" style="align-self:center;margin-top:0">Total: ↑'+fmtTok(tu.i)+' ↓'+fmtTok(tu.o)+(tu.e?'~':'')+(tu.hc?' · '+fmtCost(tu.c):'')+'</div>'}
  if(!busy)h+=taskHTML(c)+planHTML(c)+draftHTML(c);
  if(typing||busy)h+='<div class="m a" id="liveb">'+(live?md(live):'<div class="dots"><span></span><span></span><span></span></div>')+'</div>';
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
  $('clist').innerHTML=h||'<p class="empty">Kono chat nai</p>';
}
function openDrawer(){renderList();$('drawer').classList.add('on');$('ov').classList.add('on')}
function closeDrawer(){$('drawer').classList.remove('on');$('ov').classList.remove('on')}

