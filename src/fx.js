/* Meowave visual effects: the fullscreen "flow" backdrop, wallpapers
   (image / GIF / video) and the cover physics of the full player.

   Loaded before app.js and kept free of its globals at load time: everything
   app.js owns (S, level, fp) is read lazily, at call time.

   Flow backdrop
   -------------
   The cover is reduced once to a small, colour-corrected texture (dark covers
   are lifted and slightly saturated, so a near-black sleeve gives a deep but
   visible colour field instead of a black-blue blot). Every frame a handful of
   slowly rotating, oversized copies of that texture are layered into a tiny
   canvas — about 120 px wide — which the compositor scales to the window. The
   upscale itself is the blur, so the per-frame cost is a few drawImage calls on
   a thumbnail-sized canvas. Capped at 30 fps, paused while hidden.

   Cover physics
   -------------
   Springs (semi-implicit Euler) drive the CSS `translate` and `scale`
   properties of the cover. Those compose with `transform`, so the existing
   float / beat CSS animations keep running underneath. Used for:
   - opening and closing the full player: the cover flies from and back into
     the mini player's artwork;
   - switching between the centred stage and the lyrics layout;
   - a track change: the new cover lands with a small bounce;
   - a gentle pull towards the pointer. */
(function(){
"use strict";
const RM=typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion:reduce)").matches;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ───────────────────────── colour helpers ───────────────────────── */
function rgb2hsl(r,g,b){r/=255;g/=255;b/=255;
 const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
 if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
  h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6}
 return [h,s,l]}
function hsl2rgb(h,s,l){
 if(!s){const v=Math.round(l*255);return [v,v,v]}
 const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
 const f=t=>{t<0&&(t+=1);t>1&&(t-=1);
  return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p};
 return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)]}

/* ───────────────────────── flow backdrop ───────────────────────── */
const FLOW={cv:null,g:null,cur:null,prev:null,mix:1,t:0,raf:0,last:0,url:"",pulse:0,
 seed:Math.random()*100,on:false};
const LAYERS=[
 /* scale, rotation speed (rad/s), orbit radius, orbit speed, alpha, phase */
 {s:2.3,r:.045,o:.00,os:0,  a:1,  p:0},
 {s:1.7,r:-.07,o:.22,os:.05,a:.62,p:1.7},
 {s:1.35,r:.09,o:.30,os:-.07,a:.5,p:3.1},
 {s:1.1,r:-.12,o:.26,os:.09,a:.38,p:4.6}];

function flowCanvas(){
 if(FLOW.cv&&FLOW.cv.isConnected)return FLOW.cv;
 const host=document.getElementById("fp");if(!host)return null;
 const cv=document.createElement("canvas");
 cv.className="fp-flow";cv.setAttribute("aria-hidden","true");
 host.insertBefore(cv,host.firstChild);
 const grain=document.createElement("div");grain.className="fp-grain";grain.setAttribute("aria-hidden","true");
 host.insertBefore(grain,cv.nextSibling);
 FLOW.cv=cv;FLOW.g=cv.getContext("2d",{alpha:false});
 flowSize();
 addEventListener("resize",flowSize,{passive:true});
 return cv}
function flowSize(){
 const cv=FLOW.cv;if(!cv)return;
 const w=120,h=Math.max(48,Math.round(w*(innerHeight||800)/(innerWidth||1280)));
 if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;flowDraw(0)}}

/* Small, blurred, colour-corrected copy of the cover. */
function buildTexture(img){
 const n=24,t=document.createElement("canvas");t.width=t.height=n;
 const x=t.getContext("2d",{willReadFrequently:true});
 x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";
 x.drawImage(img,0,0,n,n);
 let info={lum:.3,tint:[120,120,140]};
 try{
  const d=x.getImageData(0,0,n,n),px=d.data;
  let L=0,cnt=n*n,tr=0,tg=0,tb=0,tw=0;
  for(let i=0;i<px.length;i+=4){const l=(.2126*px[i]+.7152*px[i+1]+.0722*px[i+2])/255;L+=l}
  L/=cnt;
  /* Dark sleeves are lifted towards a mid tone; bright ones are pulled down
     a little so white text keeps its contrast. */
  const lift=L<.34?(.34-L)/.34:0,damp=L>.62?(L-.62)/.38:0;
  for(let i=0;i<px.length;i+=4){
   let [h,s,l]=rgb2hsl(px[i],px[i+1],px[i+2]);
   l=l*(1+1.1*lift)+.1*lift;
   l=l*(1-.32*damp);
   s=Math.min(1,s*(1.06+.12*lift));
   l=clamp(l*.92,.05,.66);
   const [r,g,b]=hsl2rgb(h,s,l);px[i]=r;px[i+1]=g;px[i+2]=b;
   const wgt=s*s+.02;tr+=r*wgt;tg+=g*wgt;tb+=b*wgt;tw+=wgt}
  x.putImageData(d,0,0);
  info={lum:L,tint:[tr/tw|0,tg/tw|0,tb/tw|0]};
 }catch(_){/* cross-origin cover: draw it as-is */}
 /* Two upscale passes give a smooth gradient instead of 24 visible blocks. */
 const m=document.createElement("canvas");m.width=m.height=64;
 const mx=m.getContext("2d");mx.imageSmoothingEnabled=true;mx.imageSmoothingQuality="high";
 mx.filter="blur(2px)";mx.drawImage(t,0,0,64,64);
 const o=document.createElement("canvas");o.width=o.height=160;
 const ox=o.getContext("2d");ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality="high";
 ox.drawImage(m,0,0,160,160);
 return {tex:o,info}}

function loadImage(url){
 return new Promise((res,rej)=>{
  const tryLoad=cors=>{const im=new Image();if(cors)im.crossOrigin="anonymous";
   im.decoding="async";
   im.onload=()=>res(im);
   im.onerror=()=>cors?tryLoad(false):rej(new Error("cover"));
   im.src=url};
  tryLoad(/^https?:/i.test(url))})}

function setCover(url){
 flowCanvas();
 if(!url){FLOW.url="";return}
 if(url===FLOW.url)return;
 FLOW.url=url;
 loadImage(url).then(img=>{
  if(FLOW.url!==url)return;
  const t=buildTexture(img);
  FLOW.prev=FLOW.cur;FLOW.cur=t;FLOW.mix=FLOW.prev?0:1;
  const fp=document.getElementById("fp");
  if(fp){const [r,g,b]=t.info.tint;fp.style.setProperty("--flow-tint",`${r} ${g} ${b}`)}
  flowKick();
 }).catch(()=>{})}

function drawComposition(g,tex,w,h,time,alpha){
 const p=FLOW.pulse;
 g.globalAlpha=alpha;
 for(let i=0;i<LAYERS.length;i++){
  const L=LAYERS[i];
  const ang=L.p+time*L.r*(1+p*.8);
  const oa=L.p*1.3+time*L.os;
  const cx=w/2+Math.cos(oa)*L.o*w,cy=h/2+Math.sin(oa*1.1)*L.o*h;
  const size=Math.max(w,h)*L.s*(1+p*.06*(i?1:.5));
  g.save();
  g.globalAlpha=alpha*L.a;
  g.translate(cx,cy);g.rotate(ang);
  g.drawImage(tex,-size/2,-size/2,size,size);
  g.restore()}
 g.globalAlpha=1}

function flowDraw(dt){
 const g=FLOW.g,cv=FLOW.cv;if(!g||!cv)return;
 const w=cv.width,h=cv.height;
 if(!FLOW.cur){g.fillStyle="#101014";g.fillRect(0,0,w,h);return}
 FLOW.t+=dt;
 if(FLOW.mix<1)FLOW.mix=Math.min(1,FLOW.mix+dt/1.1);
 if(FLOW.prev&&FLOW.mix<1)drawComposition(g,FLOW.prev.tex,w,h,FLOW.t+FLOW.seed,1);
 drawComposition(g,FLOW.cur.tex,w,h,FLOW.t+FLOW.seed,FLOW.prev?ease(FLOW.mix):1);
 if(FLOW.mix>=1)FLOW.prev=null}
const ease=t=>1-Math.pow(1-t,3);

function flowActive(){
 const fp=document.getElementById("fp");
 return !!fp&&fp.dataset.open==="true"&&(fp.dataset.bgMode||"dynamic")==="dynamic"&&!document.hidden}
function flowLoop(now){
 FLOW.raf=0;
 if(!flowActive())return;
 const dt=FLOW.last?Math.min(.1,(now-FLOW.last)/1000):0;
 if(now-FLOW.last>=31||!FLOW.last){
  FLOW.last=now;
  let lv=0;try{lv=typeof level==="function"?level():0}catch(_){}
  FLOW.pulse+=(lv-FLOW.pulse)*Math.min(1,dt*6);
  flowDraw(RM?0:dt)}
 if(!RM||FLOW.mix<1)FLOW.raf=requestAnimationFrame(flowLoop)}
function flowKick(){
 if(!FLOW.raf&&flowActive()){FLOW.last=0;FLOW.raf=requestAnimationFrame(flowLoop)}
 else if(!flowActive())flowDraw(0)}
document.addEventListener("visibilitychange",flowKick);

/* ───────────────────────── wallpapers ───────────────────────── */
const FX_KEY="mw.fx";
const FXS=Object.assign({wallDim:35,wallBlur:0,wallApp:false},(()=>{try{return JSON.parse(localStorage.getItem(FX_KEY)||"{}")}catch(_){return {}}})());
const saveFx=()=>{try{localStorage.setItem(FX_KEY,JSON.stringify(FXS))}catch(_){}};
const WALL={url:"",type:"",name:"",loaded:false};
function idb(){
 return new Promise((res,rej)=>{
  if(!window.indexedDB)return rej(new Error("no idb"));
  const r=indexedDB.open("meowave-fx",1);
  r.onupgradeneeded=()=>r.result.createObjectStore("kv");
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbGet(k){const db=await idb();return new Promise((res,rej)=>{
 const q=db.transaction("kv").objectStore("kv").get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function idbSet(k,v){const db=await idb();return new Promise((res,rej)=>{
 const tx=db.transaction("kv","readwrite");v===undefined?tx.objectStore("kv").delete(k):tx.objectStore("kv").put(v,k);
 tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}

const WALL_MAX=200*1024*1024;
function wallKind(type,name){
 if(/^video\//.test(type)||/\.(mp4|webm|mov|m4v)$/i.test(name))return "video";
 return "image"}
async function wallLoad(){
 if(WALL.loaded)return;WALL.loaded=true;
 try{const rec=await idbGet("wallpaper");
  if(rec&&rec.blob){WALL.url=URL.createObjectURL(rec.blob);WALL.type=wallKind(rec.type||rec.blob.type,rec.name||"");WALL.name=rec.name||""}
 }catch(_){}
 wallRender()}
async function wallSetFile(file){
 if(!file)return false;
 if(file.size>WALL_MAX){toastSafe(lang()==="ru"?"Файл слишком большой (до 200 МБ)":"File is too large (200 MB max)");return false}
 const kind=wallKind(file.type,file.name);
 if(kind==="image"&&!/^image\//.test(file.type)&&!/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name)){
  toastSafe(lang()==="ru"?"Нужна картинка, GIF или видео":"Pick an image, GIF or video");return false}
 try{await idbSet("wallpaper",{blob:file,type:file.type,name:file.name})}catch(e){console.warn("wallpaper store:",e)}
 if(WALL.url)URL.revokeObjectURL(WALL.url);
 WALL.url=URL.createObjectURL(file);WALL.type=kind;WALL.name=file.name;WALL.loaded=true;
 wallRender();return true}
async function wallClear(){
 try{await idbSet("wallpaper",undefined)}catch(_){}
 if(WALL.url)URL.revokeObjectURL(WALL.url);
 WALL.url="";WALL.type="";WALL.name="";wallRender()}
function wallPick(){
 return new Promise(res=>{
  const inp=document.createElement("input");inp.type="file";
  inp.accept="image/*,video/mp4,video/webm,.gif,.mp4,.webm,.mov";
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];res(f?await wallSetFile(f):false)};
  inp.click()})}
function wallNode(host,cls){
 let el=host.querySelector(":scope > ."+cls);
 if(!el){el=document.createElement("div");el.className=cls;el.setAttribute("aria-hidden","true");
  if(cls==="app-wall")host.insertBefore(el,host.firstChild);
  else{const ref=host.querySelector(":scope > .fp-grain")||host.firstChild;host.insertBefore(el,ref?ref.nextSibling:null)}}
 const want=WALL.url?`${WALL.type}|${WALL.url}`:"";
 if(el.dataset.src!==want){
  el.dataset.src=want;el.innerHTML="";
  if(WALL.url){
   if(WALL.type==="video"){const v=document.createElement("video");
    v.src=WALL.url;v.muted=true;v.loop=true;v.autoplay=true;v.playsInline=true;v.setAttribute("muted","");
    el.appendChild(v)}
   else{const im=document.createElement("img");im.src=WALL.url;im.alt="";im.decoding="async";el.appendChild(im)}}}
 el.style.setProperty("--wall-dim",(FXS.wallDim/100).toFixed(2));
 el.style.setProperty("--wall-blur",FXS.wallBlur+"px");
 return el}
function wallRender(){
 const fp=document.getElementById("fp");
 const inFp=fp&&(fp.dataset.bgMode||"")==="wallpaper";
 if(fp){const el=wallNode(fp,"fp-wall");el.hidden=!inFp||!WALL.url;playIf(el,inFp&&fp.dataset.open==="true")}
 const appEl=wallNode(document.body,"app-wall");
 const appOn=FXS.wallApp&&!!WALL.url;
 appEl.hidden=!appOn;document.documentElement.toggleAttribute("data-wall",appOn);
 playIf(appEl,appOn&&!(fp&&fp.dataset.open==="true"&&inFp));
 const st=document.getElementById("fp-wall-name");
 if(st)st.textContent=WALL.url?(WALL.name||(lang()==="ru"?"Обои выбраны":"Wallpaper set")):(lang()==="ru"?"Не выбраны":"None");
 const clr=document.getElementById("fp-wall-clear");if(clr)clr.disabled=!WALL.url}
function playIf(el,on){
 const v=el.querySelector("video");if(!v)return;
 if(on&&!document.hidden){const p=v.play();p&&p.catch&&p.catch(()=>{})}else v.pause()}
document.addEventListener("visibilitychange",()=>wallRender());
const lang=()=>{try{return typeof LANG!=="undefined"?LANG:"ru"}catch(_){return "ru"}};
function toastSafe(m){try{typeof toast==="function"?toast(m):console.warn(m)}catch(_){}}

/* ───────────────────────── cover physics ───────────────────────── */
/* One spring per axis; k = stiffness, c = damping, unit mass. */
function spring(v,k,c){return {v,t:v,vel:0,k,c}}
function stepSpring(s,dt){
 const a=-s.k*(s.v-s.t)-s.c*s.vel;s.vel+=a*dt;s.v+=s.vel*dt;
 return Math.abs(s.v-s.t)>.0005||Math.abs(s.vel)>.0005}
const COV={el:null,x:spring(0,240,22),y:spring(0,240,22),s:spring(1,260,20),
 mx:spring(0,90,14),my:spring(0,90,14),raf:0,last:0,hold:false};
function coverEl(){return document.querySelector("#fpc .fpcover-stage, #fpc .fpcover-lg")}
function coverApply(){
 const el=COV.el;if(!el||!el.isConnected)return;
 const x=COV.x.v+COV.mx.v,y=COV.y.v+COV.my.v,s=COV.s.v;
 const still=Math.abs(x)<.05&&Math.abs(y)<.05&&Math.abs(s-1)<.0005;
 el.style.translate=still?"":`${x.toFixed(2)}px ${y.toFixed(2)}px`;
 el.style.scale=still?"":s.toFixed(4)}
function coverLoop(now){
 COV.raf=0;
 const dt=COV.last?Math.min(1/30,(now-COV.last)/1000):1/60;COV.last=now;
 let moving=false;
 for(const k of ["x","y","s","mx","my"]){
  /* Sub-step for stability with stiff springs on slow frames. */
  const n=dt>1/50?2:1;for(let i=0;i<n;i++)moving=stepSpring(COV[k],dt/n)||moving}
 coverApply();
 if(moving||COV.hold)COV.raf=requestAnimationFrame(coverLoop);
 else{for(const k of ["x","y","s","mx","my"]){COV[k].v=COV[k].t;COV[k].vel=0}coverApply();COV.last=0}}
function coverKick(){if(!COV.raf){COV.last=0;COV.raf=requestAnimationFrame(coverLoop)}}
function setSpring(s,k,c){s.k=k;s.c=c}
/* FLIP: the element is already at its final place; start it where `from` was. */
function coverFlyFrom(from,opts={}){
 const el=coverEl();if(!el||!from||RM)return;
 COV.el=el;
 const to=el.getBoundingClientRect();if(!to.width)return;
 const dx=(from.left+from.width/2)-(to.left+to.width/2),dy=(from.top+from.height/2)-(to.top+to.height/2);
 const sc=clamp(from.width/to.width,.05,4);
 const k=opts.k||230,c=opts.c||21;
 setSpring(COV.x,k,c);setSpring(COV.y,k,c);setSpring(COV.s,k+30,c);
 COV.x.v=dx;COV.y.v=dy;COV.s.v=sc;COV.x.t=0;COV.y.t=0;COV.s.t=1;
 COV.x.vel=COV.y.vel=COV.s.vel=0;
 coverApply();coverKick()}
/* Reverse FLIP: from its place towards `to` (closing into the mini player). */
function coverFlyTo(to){
 const el=coverEl();if(!el||!to||RM)return;
 COV.el=el;
 const from=el.getBoundingClientRect();if(!from.width)return;
 setSpring(COV.x,300,30);setSpring(COV.y,300,30);setSpring(COV.s,320,32);
 COV.x.t=(to.left+to.width/2)-(from.left+from.width/2);
 COV.y.t=(to.top+to.height/2)-(from.top+from.height/2);
 COV.s.t=clamp(to.width/from.width,.05,4);
 COV.mx.t=0;COV.my.t=0;coverKick()}
/* Track change: the new sleeve drops in with a small bounce. */
function coverLand(){
 const el=coverEl();if(!el||RM)return;
 COV.el=el;
 setSpring(COV.s,300,13);
 COV.s.v=.9;COV.s.vel=1.4;COV.s.t=1;
 setSpring(COV.y,260,18);COV.y.v=10;COV.y.t=0;COV.y.vel=0;COV.x.v=COV.x.t=0;
 coverKick()}
function coverReset(){
 for(const k of ["x","y","s","mx","my"]){COV[k].t=k==="s"?1:0;COV[k].v=COV[k].t;COV[k].vel=0}
 const el=coverEl();if(el){el.style.translate="";el.style.scale=""}}
/* Pointer pull: a few pixels towards the cursor, on a soft spring. */
addEventListener("pointermove",e=>{
 if(RM||e.pointerType==="touch")return;
 const fp=document.getElementById("fp");if(!fp||fp.dataset.open!=="true")return;
 const el=coverEl();if(!el)return;COV.el=el;
 const r=el.getBoundingClientRect();
 const nx=clamp((e.clientX-(r.left+r.width/2))/(innerWidth/2),-1,1);
 const ny=clamp((e.clientY-(r.top+r.height/2))/(innerHeight/2),-1,1);
 COV.mx.t=nx*9;COV.my.t=ny*7;coverKick()},{passive:true});
document.addEventListener("pointerleave",()=>{COV.mx.t=0;COV.my.t=0;coverKick()});

/* ───────────────────────── public API ───────────────────────── */
window.MWFX={
 flow:{setCover,kick:flowKick},
 wall:{load:wallLoad,pick:wallPick,clear:wallClear,render:wallRender,settings:FXS,save:saveFx,has:()=>!!WALL.url},
 cover:{el:coverEl,flyFrom:coverFlyFrom,flyTo:coverFlyTo,land:coverLand,reset:coverReset,
  rect:()=>{const e=coverEl();return e?e.getBoundingClientRect():null}}
};
})();
