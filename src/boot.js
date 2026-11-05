/* Runs in <head>, before anything is painted — an external file because the
   CSP forbids inline scripts.

   - The first frame comes up in the saved theme. The page used to paint dark
     and flip to light a moment later, so a light-theme user saw a dark splash
     and a flash on every start.
   - <html data-os> names the platform, so the stylesheet can tune per OS
     (Linux WebKitGTK pays far more for blur than WebView2 does, macOS has
     overlay scrollbars and the traffic-light inset).
   - The splash shows the icon the user picked instead of swapping it in
     after the scripts at the end of <body> have run.
   - The interface designer's look is applied before anything paints.
   - The splash takes the accent colour. */
(function(){
 var de=document.documentElement,st={};
 try{st=JSON.parse(localStorage.getItem("meowave")||"{}")||{}}catch(_){}
 var dark=true;
 try{dark=matchMedia("(prefers-color-scheme: dark)").matches}catch(_){}
 var th=st.theme==="light"||st.theme==="dark"?st.theme:st.theme==="system"?(dark?"dark":"light"):"dark";
 de.setAttribute("data-theme",th);
 var ua=navigator.userAgent||"";
 var pf=(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||"";
 var os=/android/i.test(ua)?"android"
  :/iphone|ipad|ipod/i.test(ua)?"ios"
  :/mac/i.test(pf)||/Mac OS X/.test(ua)?"mac"
  :/win/i.test(pf)||/Windows/.test(ua)?"win"
  :/linux|x11|bsd/i.test(pf+" "+ua)?"linux":"other";
 de.setAttribute("data-os",os);
 /* Inside the desktop shell, not a browser tab: the window chrome rules only
    apply there. Tauri injects its globals before any page script runs. */
 if(window.__TAURI_INTERNALS__||window.__TAURI__)de.setAttribute("data-shell","tauri");
 var icons=["classic","clear-auto","clear-light","clear-dark","midnight","ocean","mint","sunset","sakura","lavender","gold","paper"];
 var ic=st.x&&icons.indexOf(st.x.appIcon)>=0?st.x.appIcon:"classic";
 if(ic==="clear-auto")ic=th==="light"?"clear-dark":"clear-light";
 de.style.setProperty("--boot-icon",'url("./icons/app/'+ic+'.png")');
 /* Round 8 (Beta 3.2): the splash in the user's own accent rather than a
    neutral grey or neon — the one app.js last applied (mw.boot.acc, the
    adaptive cover colour included), else the saved palette choice. */
 try{
  var pal={violet:"179 166 232",indigo:"156 168 236",blue:"141 183 221",cyan:"140 203 208",teal:"127 191 178",
   emerald:"156 199 164",amber:"220 193 150",coral:"231 173 146",rose:"227 163 174",pink:"217 165 207"};
  var acc=localStorage.getItem("mw.boot.acc");
  if(acc==null){
   if(st.accent==="custom"&&/^#[0-9a-f]{6}$/i.test(st.customAccent||"")){var h=st.customAccent;acc=[1,3,5].map(function(i){return parseInt(h.substr(i,2),16)}).join(" ")}
   else acc=pal[st.accent||"violet"]||""}
  if(/^\d{1,3} \d{1,3} \d{1,3}$/.test(acc||"")){de.style.setProperty("--boot-acc","rgb("+acc+")");de.setAttribute("data-boot-acc","1")}
 }catch(_){}
 /* The interface designer's stylesheet (custom.js keeps a copy of the last
    one it generated): in place before the first paint, so a custom
    background is never preceded by the stock one. All of it is !important,
    so it wins over app.css even though it comes first. */
 try{
  var cz=localStorage.getItem("meowave_cz_css");
  if(cz){var el=document.createElement("style");el.id="cz-style";el.textContent=cz;document.head.appendChild(el)}
 }catch(_){}
})();
