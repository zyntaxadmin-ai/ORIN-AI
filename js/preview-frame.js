/* Orin · preview frame — runs inside preview.html, which the app shows in a sandboxed iframe (no allow-same-origin).
   The app sends the built project as a message; this script writes it into this document.
   Why a separate page: srcdoc/blob/data iframes inherit the app's Content-Security-Policy and would block the project's inline scripts. */
(function(){
  addEventListener('message',function(e){
    if(e.source!==parent)return;
    var d=e.data;
    if(!d||typeof d.orinPreviewHtml!=='string')return;
    document.open();document.write(d.orinPreviewHtml);document.close();
  });
  try{parent.postMessage({orinPreviewReady:1},'*')}catch(e){}
})();
