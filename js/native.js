/* Android app only (Capacitor). In a normal browser NATIVE is false and nothing here runs.
   Plugins are reached through Capacitor.Plugins because the app has no bundler. */
const NATIVE=!!(window.Capacitor&&Capacitor.isNativePlatform&&Capacitor.isNativePlatform());
const NP=n=>NATIVE&&Capacitor.Plugins?Capacitor.Plugins[n]||null:null;

/* ---------- Voice input with Android's own speech recogniser ---------- */
/* the WebView has no Web Speech API, so toggleMic() in readers.js calls this instead */
let nmOn=false,nmBase='',nmReady=false;
function nativeMicInit(SR){
  if(nmReady)return;nmReady=true;
  SR.addListener('partialResults',d=>{
    const t=(d&&d.matches&&d.matches[0])||'',box=$('box');if(!box)return;
    box.value=nmBase+(nmBase&&!/\s$/.test(nmBase)?' ':'')+t;box.dispatchEvent(new Event('input'));
  });
  SR.addListener('listeningState',d=>{nmOn=!!d&&d.status==='started';const m=$('mic');if(m)m.classList.toggle('rec',nmOn)});
}
async function nativeMic(){
  const SR=NP('SpeechRecognition');
  if(!SR){toast('Voice input is not available in this app');return}
  if(nmOn){try{await SR.stop()}catch(e){}return}
  try{
    const av=await SR.available();
    if(!av||!av.available){toast('Install or enable Google speech services to use voice input');return}
    let p=await SR.checkPermissions();
    if(!p||p.speechRecognition!=='granted')p=await SR.requestPermissions();
    if(!p||p.speechRecognition!=='granted'){toast('Allow microphone access to use voice input');return}
    nativeMicInit(SR);
    nmBase=$('box').value;
    await SR.start({language:S.lang||'bn-BD',partialResults:true,popup:false});
  }catch(e){toast('Voice error: '+((e&&e.message)||e))}
}

/* ---------- Android back button ---------- */
/* closes the top-most thing first (dialog, menu, settings sheet, chat list) and only then sends the app to the background */
if(NATIVE){
  const A=NP('App');
  if(A)A.addListener('backButton',()=>{
    if(document.querySelector('.dlg')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return}
    if($('pop')||$('pov')){closePop();return}
    const sh=$('sheet');
    if(sh&&sh.classList.contains('on')){view='';sh.classList.remove('on');return}
    const dr=$('drawer');
    if(dr&&dr.classList.contains('on')){closeDrawer();return}
    if(A.minimizeApp)A.minimizeApp();
  });
}

/* ---------- Keep working in the background (Android app) ---------- */
/* While Orin is writing a reply, a small "foreground service" notification tells Android not to freeze the app or cut
   its network. Without it a reply stops (or shows a network error) as soon as you switch to another app.
   bgBusy() in extras.js calls these two. If the plugin is missing, nothing happens and the app still works as before. */
let fgOn=false;
async function nativeKeepAlive(on){
  const F=NP('ForegroundService');
  if(!F||on===fgOn)return;
  try{
    if(on){
      try{const p=await F.checkPermissions();if(p&&p.display!=='granted')await F.requestPermissions()}catch(e){}
      await F.startForegroundService({id:4217,title:'Orin is working',body:'Writing your reply. Tap to open.',smallIcon:'ic_stat_orin'});
      fgOn=true;
    }else{await F.stopForegroundService();fgOn=false}
  }catch(e){fgOn=false}
}
/* "reply is ready" notification when the app is in the background */
async function nativeNotify(title,body){
  const L=NP('LocalNotifications');if(!L)return false;
  try{
    let p=await L.checkPermissions();
    if(!p||p.display!=='granted')p=await L.requestPermissions();
    if(!p||p.display!=='granted')return false;
    await L.schedule({notifications:[{id:Math.floor(Date.now()%2147483000),title:String(title).slice(0,60),body:String(body).slice(0,200)}]});
    return true;
  }catch(e){return false}
}
