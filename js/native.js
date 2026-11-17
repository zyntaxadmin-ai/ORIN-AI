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
