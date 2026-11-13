/* Meowave on phones — the behaviour half of the mobile layer (mobile.css is
   the look). Loaded after app.js and only does anything when detect.js has
   marked the page (html[data-mobile]). It reuses app.js's own globals
   (S, save, renderFP, openFP, closeFP) instead of duplicating any logic, so
   the desktop player and the phone player stay one player.

   What it adds:
   · full-screen player: a bottom tab bar Плеер · Текст · Очередь — the way
     back out of the lyrics and the queue, which on a phone had none;
   · swipe down on the full-screen player closes it;
   · swipe left / right on the cover changes track;
   · swipe up on the mini player opens the full-screen player. */
(function(){
 const de=document.documentElement;
 if(!de.hasAttribute("data-mobile"))return;
 const ru=(de.lang||"ru").startsWith("ru");
 const T={player:ru?"Плеер":"Player",lyrics:ru?"Текст":"Lyrics",queue:ru?"Очередь":"Queue"};
 const haptic=()=>{try{navigator.vibrate?.(8)}catch{}};

 /* ── full-screen player tabs ── */
 function setPane(which){
  if(typeof S==="undefined")return;
  if(which==="player")S.fpMode="stage";
  else{S.fpMode="lyric";S.x.fpPane=which==="queue"?"queue":"lyrics"}
  try{save()}catch{}
  try{renderFP()}catch{}
  syncTabs();haptic()}
 function current(){
  const x=document.querySelector("#fpc .fpx");
  if(!x||x.dataset.layout!=="lyrics")return "player";
  return x.dataset.pane==="queue"?"queue":"lyrics"}
 function syncTabs(){
  const bar=document.getElementById("mfp-tabs");if(!bar)return;
  const cur=current();
  bar.querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.pane===cur)));
  bar.style.setProperty("--i",String(["player","lyrics","queue"].indexOf(cur)))}
 function ensureTabs(){
  const x=document.querySelector("#fpc .fpx");if(!x||x.querySelector("#mfp-tabs"))return;
  const bar=document.createElement("nav");
  bar.id="mfp-tabs";bar.className="mfp-tabs";bar.setAttribute("role","tablist");
  bar.innerHTML=["player","lyrics","queue"].map(p=>
   `<button type="button" role="tab" data-pane="${p}">${T[p]}</button>`).join("")+"<i aria-hidden=\"true\"></i>";
  bar.addEventListener("click",e=>{const b=e.target.closest("button[data-pane]");if(b)setPane(b.dataset.pane)});
  x.appendChild(bar);
  /* layout changes come from app.js too (tapping the cover, keyboard) */
  new MutationObserver(syncTabs).observe(x,{attributes:true,attributeFilter:["data-layout","data-pane"]});
  syncTabs();
  wireCoverSwipe()}

 /* ── gestures ── */
 function swipe(el,{onMove,onEnd,allow}){
  let sx=0,sy=0,dx=0,dy=0,axis="",on=false;
  el.addEventListener("touchstart",e=>{
   if(e.touches.length!==1||(allow&&!allow(e))){on=false;return}
   on=true;axis="";dx=dy=0;sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  el.addEventListener("touchmove",e=>{
   if(!on)return;
   dx=e.touches[0].clientX-sx;dy=e.touches[0].clientY-sy;
   if(!axis&&Math.hypot(dx,dy)>10)axis=Math.abs(dx)>Math.abs(dy)?"x":"y";
   if(axis)onMove?.(axis,dx,dy,e)},{passive:true});
  const end=()=>{if(!on)return;on=false;if(axis)onEnd?.(axis,dx,dy);axis=""};
  el.addEventListener("touchend",end,{passive:true});
  el.addEventListener("touchcancel",()=>{on=false;axis="";onEnd?.("",0,0)},{passive:true})}

 const fp=document.getElementById("fp");
 /* belt and braces for overflow:clip on older WebKit: the frame never scrolls */
 fp?.addEventListener("scroll",()=>{if(fp.scrollTop||fp.scrollLeft){fp.scrollTop=0;fp.scrollLeft=0}},{passive:true});
 if(fp){
  /* Pull the player down to close it. Not from inside a scrolled list (the
     lyrics, the queue) unless it is at its top, and not from a slider. */
  const fpc=document.getElementById("fpc");
  swipe(fp,{
   allow:e=>{
    if(e.target.closest("input,.track,#mfp-tabs,.fpset,#fp-settings-popover"))return false;
    const sc=e.target.closest("#fplyr,#fpq");
    return !sc||sc.scrollTop<=0},
   onMove:(axis,dx,dy)=>{
    if(axis!=="y"||dy<=0||!fpc)return;
    fpc.style.transition="none";
    fpc.style.transform=`translate3d(0,${Math.min(dy,600)*.6}px,0)`;
    fpc.style.opacity=String(Math.max(.4,1-dy/700))},
   onEnd:(axis,dx,dy)=>{
    if(!fpc)return;
    fpc.style.transition="";fpc.style.transform="";fpc.style.opacity="";
    if(axis==="y"&&dy>110){haptic();try{closeFP()}catch{}}}})}

 function wireCoverSwipe(){
  const cov=document.getElementById("fpx-cover");if(!cov||cov.dataset.mswipe)return;
  cov.dataset.mswipe="1";
  swipe(cov,{
   onMove:(axis,dx)=>{if(axis==="x")cov.style.transform=`translate3d(${dx*.35}px,0,0) rotate(${dx*.01}deg)`},
   onEnd:(axis,dx)=>{
    cov.style.transform="";
    if(axis!=="x"||Math.abs(dx)<70)return;
    haptic();document.getElementById(dx<0?"next":"prev")?.click()}})}

 /* swipe up on the mini player opens the full-screen one */
 const bar=document.querySelector(".bar");
 if(bar)swipe(bar,{
  allow:e=>!e.target.closest("input,.track,button"),
  onEnd:(axis,dx,dy)=>{if(axis==="y"&&dy<-40){haptic();try{openFP()}catch{}}}});

 /* ── home ("Волна"): the current cover, big, above the title ──
    Tapping it opens the full-screen player (or starts the wave when
    nothing is loaded yet). Follows the mini player, which app.js redraws on
    every track change. */
 const hero=document.getElementById("hero");
 if(hero&&!hero.querySelector(".m-hero-art")){
  const art=document.createElement("div");
  art.className="m-hero-art";art.setAttribute("role","button");art.tabIndex=0;
  art.setAttribute("aria-label",ru?"Открыть плеер":"Open player");
  hero.prepend(art);
  let last=null;
  const paint=()=>{
   const tr=typeof S!=="undefined"?S.current:null;
   let u="";try{u=tr&&tr.mode!=="empty"&&tr.art?cssUrlRaw(tr.art):""}catch{}
   if(u===last)return;last=u;
   art.style.backgroundImage=u?`url("${u.replace(/"/g,"%22")}")`:"";
   art.dataset.empty=String(!u)};
  art.addEventListener("click",()=>{
   haptic();
   const tr=typeof S!=="undefined"?S.current:null;
   if(tr&&tr.mode!=="empty"){try{openFP()}catch{}}
   else document.getElementById("start")?.click()});
  const np=document.getElementById("np");
  if(np)new MutationObserver(paint).observe(np,{childList:true,subtree:true,attributes:true,attributeFilter:["src","style"]});
  addEventListener("mw:legacy",paint);
  setTimeout(paint,0)}

 /* the player is (re)built by renderFP(): add the tabs whenever it appears */
 const fpcEl=document.getElementById("fpc");
 if(fpcEl){new MutationObserver(ensureTabs).observe(fpcEl,{childList:true});ensureTabs()}
})();
