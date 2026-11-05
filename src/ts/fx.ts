/* fx.ts — Meowave visual effects: the fullscreen "flow" backdrop, wallpapers
   (image / GIF / video) and the cover physics of the full player.

   Loaded before app.js and kept free of its globals at load time: everything
   app.js owns (S, level, fp) is read lazily, at call time.

   Flow backdrop
   -------------
   The cover is reduced once to a small, colour-corrected texture (dark covers
   are lifted and slightly saturated, so a near-black sleeve gives a deep but
   visible colour field instead of a black-blue blot). Every frame a handful of
   frame a WebGL shader warps that texture with drifting fractal noise into a
   canvas about 1/7 of the window wide, which the compositor scales up. Driven
   by real time, never rotated, paused while hidden.

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

/* fx.ts — was src/fx.js until step 2 of the stack rewrite; the code, the
   shaders and window.MWFX are unchanged. It waits for nothing: main.ts
   imports it before the classic scripts run (modules go first), so
   window.MWFX is there when app.js's initFPSettings() wires the wallpaper
   controls at start-up — the moment fx.js, the first deferred script, used
   to run at. */

/** The shader's uniforms, looked up once in glInit(). */
interface FlowU { uA: WebGLUniformLocation | null; uB: WebGLUniformLocation | null; uMix: WebGLUniformLocation | null; uT: WebGLUniformLocation | null; uRes: WebGLUniformLocation | null }
interface Tex { tex: HTMLCanvasElement; info: { lum: number; tint: number[] } }
interface Flow {
  cv: HTMLCanvasElement | null; gl: WebGLRenderingContext | null; g2: CanvasRenderingContext2D | null; prog: WebGLProgram | null;
  u: FlowU; tA: WebGLTexture | null; tB: WebGLTexture | null;
  mix: number; t: number; raf: number; last: number; url: string; cur: Tex | null; ok: boolean; speed: number; drawn: number;
}
/** mw.fx in localStorage: wallpaper look and the cover's pull towards the pointer. */
interface FxSettings {
  wallDim: number; wallBlur: number; wallApp: boolean; wallAppDim: number; wallAppBlur: number; wallLink: string; coverFollow: boolean;
  [k: string]: unknown;
}
/** The stored wallpaper file (IndexedDB "meowave-fx", key "wallpaper"). */
interface WallRec { blob: Blob; type?: string; name?: string }
interface Spring { v: number; t: number; vel: number; k: number; c: number }
interface Cov { el: HTMLElement | null; x: Spring; y: Spring; s: Spring; mx: Spring; my: Spring; raf: number; last: number; hold: boolean }

declare global {
  interface Window { MWFX?: typeof MWFX }
}

const RM=typeof matchMedia==="function"&&matchMedia("(prefers-reduced-motion:reduce)").matches;
const clamp=(v:number,a:number,b:number):number=>Math.max(a,Math.min(b,v));

/* ───────────────────────── colour helpers ───────────────────────── */
function rgb2hsl(r:number,g:number,b:number):[number,number,number]{r/=255;g/=255;b/=255;
 const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
 if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
  h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6}
 return [h,s,l]}
function hsl2rgb(h:number,s:number,l:number):[number,number,number]{
 if(!s){const v=Math.round(l*255);return [v,v,v]}
 const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
 const f=(t:number):number=>{t<0&&(t+=1);t>1&&(t-=1);
  return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p};
 return [Math.round(f(h+1/3)*255),Math.round(f(h)*255),Math.round(f(h-1/3)*255)]}

/* ───────────────────────── flow backdrop ───────────────────────── */
/* WebGL "liquid" backdrop. The cover becomes a small colour-corrected texture;
   a fragment shader samples it through two layers of slowly drifting fractal
   noise (domain warping), so the colours flow like ink in water instead of
   spinning. Rendered at ~1/8 of the window and upscaled by the compositor,
   which costs next to nothing, and driven by real time, so the motion speed
   does not depend on the frame rate. A new cover cross-fades in over 1.2 s.
   Without WebGL the cover is drawn once, blurred, with no animation. */
const FLOW:Flow={cv:null,gl:null,g2:null,prog:null,u:{} as FlowU,tA:null,tB:null,mix:1,t:Math.random()*60,
 raf:0,last:0,url:"",cur:null,ok:false,speed:1,drawn:0};
const VS="attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}";
const FS=`precision mediump float;
uniform sampler2D uA;uniform sampler2D uB;uniform float uMix;uniform float uT;uniform vec2 uRes;
varying vec2 v;
float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p=p*2.02+vec2(1.7,9.2);a*=.5;}return s;}
vec3 warp(sampler2D t,vec2 uv,float tm){
 vec2 q=vec2(fbm(uv*1.35+vec2(0.,tm*.045)),fbm(uv*1.35+vec2(5.2,-tm*.04)));
 vec2 r=vec2(fbm(uv*1.15+2.4*q+vec2(1.7,9.2)+tm*.03),fbm(uv*1.15+2.4*q+vec2(8.3,2.8)-tm*.035));
 vec2 w=uv+(r-.5)*.95;
 w=(w-.5)/1.3+.5;
 return texture2D(t,w).rgb;}
void main(){
 vec2 c=v-.5;float a=uRes.x/uRes.y;if(a>1.)c.y/=a;else c.x*=a;vec2 uv=c+.5;
 vec3 col=mix(warp(uA,uv,uT),warp(uB,uv,uT+23.),uMix);
 float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,1.18);
 col+=(h(gl_FragCoord.xy+fract(uT))-.5)*(1.6/255.);
 gl_FragColor=vec4(col,1.);}`;

function flowCanvas():HTMLCanvasElement|null{
 if(FLOW.cv&&FLOW.cv.isConnected)return FLOW.cv;
 const host=document.getElementById("fp");if(!host)return null;
 host.querySelectorAll(":scope>.fp-flow,:scope>.fp-grain").forEach(n=>n.remove());
 const cv=document.createElement("canvas");
 cv.className="fp-flow";cv.setAttribute("aria-hidden","true");
 host.insertBefore(cv,host.firstChild);
 const grain=document.createElement("div");grain.className="fp-grain";grain.setAttribute("aria-hidden","true");
 host.insertBefore(grain,cv.nextSibling);
 FLOW.cv=cv;FLOW.ok=glInit(cv);
 if(!FLOW.ok)FLOW.g2=cv.getContext("2d");
 flowSize();
 addEventListener("resize",flowSize,{passive:true});
 return cv}
function glInit(cv:HTMLCanvasElement):boolean{
 let gl:WebGLRenderingContext|null=null;
 try{gl=cv.getContext("webgl",{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:"low-power"})}catch(_){}
 if(!gl)return false;
 const sh=(type:number,src:string):WebGLShader|null=>{const o=gl.createShader(type)!;gl.shaderSource(o,src);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)){console.warn("[fx] shader:",gl.getShaderInfoLog(o));return null}return o};
 const vs=sh(gl.VERTEX_SHADER,VS),fs=sh(gl.FRAGMENT_SHADER,FS);if(!vs||!fs)return false;
 const pr=gl.createProgram()!;gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);
 if(!gl.getProgramParameter(pr,gl.LINK_STATUS))return false;
 gl.useProgram(pr);
 const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
 const loc=gl.getAttribLocation(pr,"p");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 for(const k of ["uA","uB","uMix","uT","uRes"] as const)FLOW.u[k]=gl.getUniformLocation(pr,k);
 const mk=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.MIRRORED_REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.MIRRORED_REPEAT);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([16,16,20,255]));return t};
 FLOW.tA=mk();FLOW.tB=mk();
 gl.uniform1i(FLOW.u.uA,0);gl.uniform1i(FLOW.u.uB,1);
 cv.addEventListener("webglcontextlost",e=>{e.preventDefault();FLOW.ok=false});
 cv.addEventListener("webglcontextrestored",()=>{FLOW.ok=glInit(cv);if(FLOW.cur)upload(FLOW.tB,FLOW.cur.tex);flowKick()});
 FLOW.gl=gl;FLOW.prog=pr;return true}
function upload(t:WebGLTexture|null,canvas:TexImageSource):void{
 const gl=FLOW.gl;if(!gl)return;
 gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas)}
function flowSize(){
 const cv=FLOW.cv;if(!cv)return;
 const W=innerWidth||1280,H=innerHeight||800;
 const w=Math.round(Math.max(128,Math.min(260,W/7))),h=Math.max(72,Math.round(w*H/W));
 if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;flowDraw(0)}}

/* Small, blurred, colour-corrected copy of the cover (128 px, a power of two,
   so the shader may mirror-repeat it). */
function buildTexture(img:CanvasImageSource):Tex{
 const n=24,t=document.createElement("canvas");t.width=t.height=n;
 const x=t.getContext("2d",{willReadFrequently:true})!;
 x.imageSmoothingEnabled=true;x.imageSmoothingQuality="high";
 x.drawImage(img,0,0,n,n);
 let info={lum:.3,tint:[120,120,140]};
 try{
  const d=x.getImageData(0,0,n,n),px=d.data;
  let L=0,cnt=n*n,tr=0,tg=0,tb=0,tw=0;
  for(let i=0;i<px.length;i+=4){const l=(.2126*px[i]!+.7152*px[i+1]!+.0722*px[i+2]!)/255;L+=l}
  L/=cnt;
  /* Dark sleeves are lifted towards a mid tone; bright ones are pulled down
     a little so white text keeps its contrast. */
  const lift=L<.34?(.34-L)/.34:0,damp=L>.62?(L-.62)/.38:0;
  for(let i=0;i<px.length;i+=4){
   let [h,s,l]=rgb2hsl(px[i]!,px[i+1]!,px[i+2]!);
   l=l*(1+1.1*lift)+.1*lift;
   l=l*(1-.32*damp);
   s=Math.min(1,s*(1.06+.12*lift));
   l=clamp(l*.9,.05,.62);
   const [r,g,b]=hsl2rgb(h,s,l);px[i]=r;px[i+1]=g;px[i+2]=b;
   const wgt=s*s+.02;tr+=r*wgt;tg+=g*wgt;tb+=b*wgt;tw+=wgt}
  x.putImageData(d,0,0);
  info={lum:L,tint:[tr/tw|0,tg/tw|0,tb/tw|0]};
 }catch(_){/* cross-origin cover: draw it as-is */}
 const m=document.createElement("canvas");m.width=m.height=64;
 const mx=m.getContext("2d")!;mx.imageSmoothingEnabled=true;mx.imageSmoothingQuality="high";
 mx.filter="blur(2px)";mx.drawImage(t,0,0,64,64);
 const o=document.createElement("canvas");o.width=o.height=128;
 const ox=o.getContext("2d")!;ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality="high";
 ox.filter="blur(3px)";ox.drawImage(m,-4,-4,136,136);
 return {tex:o,info}}

function loadImage(url:string):Promise<HTMLImageElement>{
 return new Promise((res,rej)=>{
  const tryLoad=(cors:boolean):void=>{const im=new Image();if(cors)im.crossOrigin="anonymous";
   im.decoding="async";
   im.onload=()=>res(im);
   im.onerror=()=>cors?tryLoad(false):rej(new Error("cover"));
   im.src=url};
  tryLoad(/^https?:/i.test(url))})}

function setCover(url:string):void{
 flowCanvas();
 if(!url){FLOW.url="";return}
 if(url===FLOW.url)return;
 FLOW.url=url;
 loadImage(url).then(img=>{
  if(FLOW.url!==url)return;
  const t=buildTexture(img);
  if(FLOW.ok){
   /* What is on screen now becomes A; the new cover fades in as B. */
   if(FLOW.cur){upload(FLOW.tA,FLOW.cur.tex);FLOW.mix=0}else{upload(FLOW.tA,t.tex);FLOW.mix=1}
   upload(FLOW.tB,t.tex)}
  FLOW.cur=t;
  const fp=document.getElementById("fp");
  if(fp){const [r,g,b]=t.info.tint;fp.style.setProperty("--flow-tint",`${r} ${g} ${b}`)}
  flowDraw(0);flowKick();
 }).catch(()=>{})}

const easeIO=(t:number):number=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
function flowDraw(dt:number):void{
 const cv=FLOW.cv;if(!cv)return;
 if(FLOW.ok&&FLOW.gl){
  const gl=FLOW.gl;
  FLOW.t+=dt*FLOW.speed;
  if(FLOW.mix<1)FLOW.mix=Math.min(1,FLOW.mix+dt/1.2);
  gl.viewport(0,0,cv.width,cv.height);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,FLOW.tA);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,FLOW.tB);
  gl.uniform1f(FLOW.u.uMix,easeIO(FLOW.mix));
  gl.uniform1f(FLOW.u.uT,FLOW.t);
  gl.uniform2f(FLOW.u.uRes,cv.width,cv.height);
  gl.drawArrays(gl.TRIANGLES,0,3);
  return}
 const g=FLOW.g2;if(!g)return;
 const w=cv.width,h=cv.height;
 g.fillStyle="#101014";g.fillRect(0,0,w,h);
 if(FLOW.cur){const s=Math.max(w,h)*1.25;g.drawImage(FLOW.cur.tex,(w-s)/2,(h-s)/2,s,s)}}

/* The same canvas can be lent to another surface — the mini player shows the
   full-screen player's moving cover behind its card. One WebGL context, one
   texture pair; only the parent element changes. null gives it back. */
let FLOW_HOST:Element|null=null;
function flowHost(el?:Element|null):boolean{
 const cv=flowCanvas();if(!cv)return false;
 const grain=cv.nextElementSibling&&cv.nextElementSibling.classList.contains("fp-grain")?cv.nextElementSibling:null;
 const target=el||document.getElementById("fp");if(!target)return false;
 FLOW_HOST=el||null;
 target.insertBefore(cv,target.firstChild);
 if(grain)target.insertBefore(grain,cv.nextSibling);
 FLOW.last=0;flowSize();flowDraw(0);flowKick();
 return FLOW.ok}
function flowActive(){
 if(document.hidden)return false;
 if(FLOW_HOST)return FLOW_HOST.isConnected&&document.documentElement.dataset.mini==="on";
 const fp=document.getElementById("fp");
 if(!fp||fp.dataset.open!=="true")return false;
 const m=fp.dataset.bgMode||"dynamic";
 /* "clips" keeps the album flow underneath until its video covers it */
 return m==="dynamic"||(m==="clips"&&fp.dataset.clip!=="on")}
/* Drawn at up to 40 fps: the field moves a fraction of a pixel per frame, so
   more frames would not look any smoother, while every one of them makes the
   compositor re-blur a full-window layer. Time-based, so the speed holds. */
function flowLoop(now:number):void{
 FLOW.raf=0;
 if(!flowActive())return;
 if(FLOW.last&&now-FLOW.last<24){FLOW.raf=requestAnimationFrame(flowLoop);return}
 const dt=FLOW.last?Math.min(.08,(now-FLOW.last)/1000):0;
 FLOW.last=now;
 flowDraw(RM?0:dt);
 if(FLOW.ok&&((!RM&&FLOW.speed>0)||FLOW.mix<1))FLOW.raf=requestAnimationFrame(flowLoop)}
function flowKick(){
 if(!FLOW.raf&&flowActive()){FLOW.last=0;FLOW.raf=requestAnimationFrame(flowLoop)}
 else if(!flowActive()&&!FLOW.ok)flowDraw(0)}
document.addEventListener("visibilitychange",flowKick);

/* ───────────────────────── wallpapers ───────────────────────── */
const FX_KEY="mw.fx";
/* wallDim/wallBlur: the full player. wallApp*: the same picture behind the
   whole interface. wallLink: an https:// wallpaper instead of a stored file. */
const FXS:FxSettings=Object.assign({wallDim:35,wallBlur:0,wallApp:false,wallAppDim:55,wallAppBlur:0,wallLink:"",coverFollow:true},(()=>{try{return JSON.parse(localStorage.getItem(FX_KEY)||"{}")}catch(_){return {}}})());
const saveFx=()=>{try{localStorage.setItem(FX_KEY,JSON.stringify(FXS))}catch(_){}};
const WALL={url:"",type:"",name:"",loaded:false};
function idb():Promise<IDBDatabase>{
 return new Promise((res,rej)=>{
  if(!window.indexedDB)return rej(new Error("no idb"));
  const r=indexedDB.open("meowave-fx",1);
  r.onupgradeneeded=()=>r.result.createObjectStore("kv");
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbGet(k:string):Promise<WallRec|undefined>{const db=await idb();return new Promise((res,rej)=>{
 const q=db.transaction("kv").objectStore("kv").get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
async function idbSet(k:string,v:unknown):Promise<void>{const db=await idb();return new Promise((res,rej)=>{
 const tx=db.transaction("kv","readwrite");v===undefined?tx.objectStore("kv").delete(k):tx.objectStore("kv").put(v,k);
 tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}

const WALL_MAX=200*1024*1024;
function wallKind(type:string,name:string):string{
 if(/^video\//.test(type)||/\.(mp4|webm|mov|m4v)$/i.test(name))return "video";
 return "image"}
const linkName=(u:string):string=>{try{const x=new URL(u);return decodeURIComponent(x.pathname.split("/").filter(Boolean).pop()||x.hostname)}catch(_){return u}};
const linkKind=(u:string):string=>/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)?"video":"image";
async function wallLoad(){
 if(WALL.loaded)return;WALL.loaded=true;
 if(FXS.wallLink){WALL.url=FXS.wallLink;WALL.type=linkKind(FXS.wallLink);WALL.name=linkName(FXS.wallLink);wallRender();return}
 try{const rec=await idbGet("wallpaper");
  if(rec&&rec.blob){WALL.url=URL.createObjectURL(rec.blob);WALL.type=wallKind(rec.type||rec.blob.type,rec.name||"");WALL.name=rec.name||""}
 }catch(_){}
 wallRender()}
async function wallSetFile(file?:File|null):Promise<boolean>{
 if(!file)return false;
 if(file.size>WALL_MAX){toastSafe(lang()==="ru"?"Файл слишком большой (до 200 МБ)":"File is too large (200 MB max)");return false}
 const kind=wallKind(file.type,file.name);
 if(kind==="image"&&!/^image\//.test(file.type)&&!/\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(file.name)){
  toastSafe(lang()==="ru"?"Нужна картинка, GIF или видео":"Pick an image, GIF or video");return false}
 try{await idbSet("wallpaper",{blob:file,type:file.type,name:file.name})}catch(e){console.warn("wallpaper store:",e)}
 if(WALL.url&&WALL.url.startsWith("blob:"))URL.revokeObjectURL(WALL.url);
 if(FXS.wallLink){FXS.wallLink="";saveFx()}
 WALL.url=URL.createObjectURL(file);WALL.type=kind;WALL.name=file.name;WALL.loaded=true;
 wallRender();return true}
async function wallClear(){
 try{await idbSet("wallpaper",undefined)}catch(_){}
 if(WALL.url&&WALL.url.startsWith("blob:"))URL.revokeObjectURL(WALL.url);
 if(FXS.wallLink){FXS.wallLink="";saveFx()}
 WALL.url="";WALL.type="";WALL.name="";wallRender()}
/* A wallpaper from the web: only https, only something that looks like a
   picture or a video. The link is kept instead of a copy of the file. */
async function wallSetUrl(raw:unknown):Promise<boolean>{
 const u=String(raw||"").trim();
 let ok=false;try{ok=new URL(u).protocol==="https:"}catch(_){}
 if(!ok)return false;
 try{await idbSet("wallpaper",undefined)}catch(_){}
 if(WALL.url&&WALL.url.startsWith("blob:"))URL.revokeObjectURL(WALL.url);
 FXS.wallLink=u;saveFx();
 WALL.url=u;WALL.type=linkKind(u);WALL.name=linkName(u);WALL.loaded=true;
 wallRender();return true}
function wallPick():Promise<boolean>{
 return new Promise(res=>{
  const inp=document.createElement("input");inp.type="file";
  inp.accept="image/*,video/mp4,video/webm,.gif,.mp4,.webm,.mov";
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];res(f?await wallSetFile(f):false)};
  inp.click()})}
function wallNode(host:Element,cls:string,dim?:number,blur?:number):HTMLElement{
 let el=host.querySelector<HTMLElement>(":scope > ."+cls);
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
 el.style.setProperty("--wall-dim",((dim??FXS.wallDim)/100).toFixed(2));
 const bl=+(blur??FXS.wallBlur)||0;
 el.style.setProperty("--wall-blur",bl+"px");
 /* Blur eats the edges; a matching zoom keeps them off screen. */
 el.style.setProperty("--wall-zoom",(1+bl/400).toFixed(3));
 return el}
function wallRender(){
 const fp=document.getElementById("fp");
 const inFp=fp&&(fp.dataset.bgMode||"")==="wallpaper";
 if(fp){const el=wallNode(fp,"fp-wall");el.hidden=!inFp||!WALL.url;playIf(el,inFp&&fp.dataset.open==="true");
  fp.dataset.hasWall=String(!!WALL.url)}
 /* Behind the whole interface when the user asked for it. The player has a
    backdrop of its own, so the app copy pauses while the player is open. */
 if(FXS.wallApp&&WALL.url){
  const el=wallNode(document.body,"app-wall",FXS.wallAppDim,FXS.wallAppBlur);el.hidden=false;
  playIf(el,!(fp&&fp.dataset.open==="true"));
  document.documentElement.dataset.wall=WALL.type||"image"}
 else{
  document.querySelectorAll("body>.app-wall").forEach(n=>n.remove());
  document.documentElement.removeAttribute("data-wall")}
 const st=document.getElementById("fp-wall-name");
 if(st)st.textContent=WALL.url?(WALL.name||(lang()==="ru"?"Обои выбраны":"Wallpaper set")):(lang()==="ru"?"Не выбраны":"None");
 const clr=document.getElementById("fp-wall-clear") as HTMLButtonElement|null;if(clr)clr.disabled=!WALL.url;
 try{dispatchEvent(new CustomEvent("mw:wall"))}catch(_){}}
function playIf(el:Element,on:boolean|null):void{
 const v=el.querySelector("video");if(!v)return;
 if(on&&!document.hidden){const p:Promise<void>|undefined=v.play();p&&p.catch&&p.catch(()=>{})}else v.pause()}
document.addEventListener("visibilitychange",()=>wallRender());
const lang=()=>{try{return typeof LANG!=="undefined"?LANG:"ru"}catch(_){return "ru"}};
function toastSafe(m:string):void{try{typeof toast==="function"?toast(m):console.warn(m)}catch(_){}}

/* ───────────────────────── cover physics ───────────────────────── */
/* One spring per axis; k = stiffness, c = damping, unit mass. */
function spring(v:number,k:number,c:number):Spring{return {v,t:v,vel:0,k,c}}
function stepSpring(s:Spring,dt:number):boolean{
 const a=-s.k*(s.v-s.t)-s.c*s.vel;s.vel+=a*dt;s.v+=s.vel*dt;
 return Math.abs(s.v-s.t)>.0005||Math.abs(s.vel)>.0005}
const COV:Cov={el:null,x:spring(0,240,22),y:spring(0,240,22),s:spring(1,260,20),
 mx:spring(0,90,14),my:spring(0,90,14),raf:0,last:0,hold:false};
function coverEl():HTMLElement|null{return document.querySelector<HTMLElement>("#fpc .fpx-cover")}
function coverApply(){
 const el=COV.el;if(!el||!el.isConnected)return;
 const x=COV.x.v+COV.mx.v,y=COV.y.v+COV.my.v,s=COV.s.v;
 const still=Math.abs(x)<.05&&Math.abs(y)<.05&&Math.abs(s-1)<.0005;
 el.style.translate=still?"":`${x.toFixed(2)}px ${y.toFixed(2)}px`;
 el.style.scale=still?"":s.toFixed(4)}
function coverLoop(now:number):void{
 COV.raf=0;
 const dt=COV.last?Math.min(1/30,(now-COV.last)/1000):1/60;COV.last=now;
 let moving=false;
 for(const k of ["x","y","s","mx","my"] as const){
  /* Sub-step for stability with stiff springs on slow frames. */
  const n=dt>1/50?2:1;for(let i=0;i<n;i++)moving=stepSpring(COV[k],dt/n)||moving}
 coverApply();
 if(moving||COV.hold)COV.raf=requestAnimationFrame(coverLoop);
 else{for(const k of ["x","y","s","mx","my"] as const){COV[k].v=COV[k].t;COV[k].vel=0}coverApply();COV.last=0}}
function coverKick(){if(!COV.raf){COV.last=0;COV.raf=requestAnimationFrame(coverLoop)}}
function setSpring(s:Spring,k:number,c:number):void{s.k=k;s.c=c}
/* FLIP: the element is already at its final place; start it where `from` was. */
function coverFlyFrom(from?:DOMRectReadOnly|null,opts:{k?:number;c?:number}={}):void{
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
function coverFlyTo(to?:DOMRectReadOnly|null):void{
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
 for(const k of ["x","y","s","mx","my"] as const){COV[k].t=k==="s"?1:0;COV[k].v=COV[k].t;COV[k].vel=0}
 const el=coverEl();if(el){el.style.translate="";el.style.scale=""}}
/* Pointer pull: a few pixels towards the cursor, on a soft spring. */
addEventListener("pointermove",e=>{
 if(RM||e.pointerType==="touch"||FXS.coverFollow===false)return;
 const fp=document.getElementById("fp");if(!fp||fp.dataset.open!=="true")return;
 const el=coverEl();if(!el)return;COV.el=el;
 const r=el.getBoundingClientRect();
 const nx=clamp((e.clientX-(r.left+r.width/2))/(innerWidth/2),-1,1);
 const ny=clamp((e.clientY-(r.top+r.height/2))/(innerHeight/2),-1,1);
 COV.mx.t=nx*9;COV.my.t=ny*7;coverKick()},{passive:true});
document.addEventListener("pointerleave",()=>{COV.mx.t=0;COV.my.t=0;coverKick()});

/* ───────────────────────── public API ───────────────────────── */
export const MWFX={
 flow:{setCover,kick:flowKick,host:flowHost,speed:(v:number)=>{FLOW.speed=clamp(+v||0,0,3)}},
 wall:{load:wallLoad,pick:wallPick,clear:wallClear,render:wallRender,settings:FXS,save:saveFx,has:()=>!!WALL.url,
  setFile:wallSetFile,setUrl:wallSetUrl,name:()=>WALL.name,kind:()=>WALL.type,isLink:()=>!!FXS.wallLink},
 cover:{el:coverEl,flyFrom:coverFlyFrom,flyTo:coverFlyTo,land:coverLand,reset:coverReset,
  rect:()=>{const e=coverEl();return e?e.getBoundingClientRect():null},
  /* The cursor pull can be switched off; the springs settle back to centre. */
  follow:(on:unknown)=>{FXS.coverFollow=!!on;saveFx();if(!on){COV.mx.t=0;COV.my.t=0;coverKick()}},
  following:()=>FXS.coverFollow!==false}
};

window.MWFX=MWFX;
