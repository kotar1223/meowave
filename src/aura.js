/* aura.js — the home background, round 8 (Beta 3.2): "the wave is still
   jerky", "full optimisation, the wave eats a lot".
   · «Фон главной»: Волна (the particle field, unchanged) · Аура · Выкл.
     Аура is a few soft blobs in the accent's hues on a tiny canvas — an
     eighth of the window per side — stretched by CSS: the bilinear upscale is
     the blur, so a frame is four radial gradients on ~240×135 pixels instead
     of thousands of sprites and a physics loop. It breathes with the bass,
     mids and treble like the wave does. Выкл stops every background
     animation, the haze included: nothing under the glass panels moves, so
     their backdrop blur is never recomputed.
   · «Частота фона»: 60 or 30 updates a second for whichever background
     runs. Each update makes every glass panel above re-blur; 30 halves that.
   Hooked from app.js's frame() (MWAura.bg / MWAura.on / MWAura.frame) and
   resize(). Uses app.js globals: S, AB, BOOT, I18N, t, seg, setSeg,
   setParticlesEnabled, resize, draw, fieldAccent, oklchOf, oklchLin. */
(()=>{
"use strict";
const LSM="mw.bg.mode",LSF="mw.bg.fps",LST="mw.bg.tabs";
const rd=(k,d)=>{try{return localStorage.getItem(k)||d}catch(_){return d}};
const wr=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};

Object.assign(I18N.ru,{
 "bg.mode":"Фон главной","bg.mode.s":"Волна из частиц, лёгкая аура или спокойный фон без анимации",
 "bg.wave":"Волна","bg.aura":"Аура","bg.off":"Выкл",
 "bg.fps":"Частота фона","bg.fps.s":"30 кадров вдвое легче для видеокарты: стеклянные панели реже пересчитывают размытие",
 "bg.tabs":"Фон во вкладках","bg.tabs.s":"В поиске, медиатеке и других вкладках: фон двигается (панели без размытия — так он не тормозит) или скрыт",
 "bg.tabs.move":"Двигается","bg.tabs.off":"Выключен"});
Object.assign(I18N.en,{
 "bg.mode":"Home background","bg.mode.s":"A particle wave, a light aura or a calm still background",
 "bg.wave":"Wave","bg.aura":"Aura","bg.off":"Off",
 "bg.fps":"Background frame rate","bg.fps.s":"30 fps is half the GPU work: the glass panels re-blur half as often",
 "bg.tabs":"Background in tabs","bg.tabs.s":"In search, the library and the other tabs: the background keeps moving (panels without blur, so it stays light) or is hidden",
 "bg.tabs.move":"Moving","bg.tabs.off":"Off"});

const M={bg:"wave",on:false,fps:60,tabs:"move"};
const MODES=["wave","aura","off"];
M.bg=MODES.includes(rd(LSM,"wave"))?rd(LSM,"wave"):"wave";
M.fps=rd(LSF,"60")==="30"?30:60;
/* Round 10: "I don't want the wave to stop in the tabs — optimise it or turn
   it off there". Round 9 held the field still behind other screens (each
   update re-blurred every glass panel above it); a frozen wave read as a
   broken one. Now it either moves there — at 30 updates a second, with the
   panels' backdrop blur dropped (app.css html[data-tw="move"]) so a frame
   costs one canvas, not fifty blur passes — or is not there at all. */
M.tabs=rd(LST,"move")==="off"?"off":"move";
document.documentElement.dataset.tw=M.tabs;

/* the canvas sits with the field, under everything */
const cv=document.createElement("canvas");cv.id="aura";cv.setAttribute("aria-hidden","true");
const anchor=document.getElementById("fieldgl")||document.getElementById("field");
if(anchor)anchor.after(cv);else document.body.prepend(cv);
const g=cv.getContext("2d",{alpha:true});
let W=0,H=0;
function size(){
 const w=Math.max(96,Math.ceil(innerWidth/8)),h=Math.max(54,Math.ceil(innerHeight/8));
 if(w!==W||h!==H){W=cv.width=w;H=cv.height=h}}

/* palette: the accent's hue at four lightness/hue offsets, chroma capped like
   every colour the app derives itself (no neon) */
function tone(rgb,dh,C,L){
 let [,c,h]=oklchOf(rgb);
 c=Math.max(.035,Math.min(c,C));
 let lin=oklchLin(L,c,h+dh);
 for(let i=0;i<12&&lin.some(v=>v<-1e-4||v>1+1e-4);i++){c*=.82;lin=oklchLin(L,c,h+dh)}
 return lin.map(v=>{v=Math.max(0,Math.min(1,v));return 255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055)})}
const BLOBS=[
 /* x, y, radius (× the longer side), drift x/y, speed x/y, phase, band, hue offset */
 {x:.24,y:.3,r:.62,ax:.12,ay:.09,fx:.11,fy:.07,ph:0,band:"bass",dh:0},
 {x:.8,y:.7,r:.56,ax:.1,ay:.11,fx:.08,fy:.1,ph:1.7,band:"mid",dh:.66},
 {x:.64,y:.16,r:.42,ax:.13,ay:.08,fx:.13,fy:.09,ph:3.1,band:"high",dh:-.72},
 {x:.3,y:.84,r:.48,ax:.09,ay:.09,fx:.06,fy:.12,ph:4.4,band:"lvl",dh:.2}];
const DARK={L:[.54,.48,.62,.38],C:.11,A:[.58,.5,.42,.6]};
const LIGHT={L:[.86,.82,.9,.78],C:.08,A:[.55,.5,.42,.5]};
let pal=null,palT=0,palKey="",tgt=null,tm=0;
function target(){
 const light=document.documentElement.dataset.theme==="light",P=light?LIGHT:DARK;
 let rgb=[200,200,220];try{rgb=fieldAccent()}catch(_){}
 const key=rgb.join(",")+(light?"l":"d");
 if(key===palKey&&tgt)return;
 palKey=key;
 tgt={light,c:BLOBS.map((b,i)=>tone(rgb,b.dh,P.C,P.L[i])),a:P.A};
 if(!pal)pal={c:tgt.c.map(c=>c.slice()),a:tgt.a.slice()}}

function paint(dt,lvl){
 if(!W)size();
 const now=performance.now();
 if(now-palT>500||!tgt){palT=now;target()}
 const k=dt>0?1-Math.exp(-dt*2.5):1;
 for(let i=0;i<BLOBS.length;i++){
  const a=pal.c[i],b=tgt.c[i];for(let j=0;j<3;j++)a[j]+=(b[j]-a[j])*k;
  pal.a[i]+=(tgt.a[i]-pal.a[i])*k}
 const ab=typeof AB==="object"?AB:{bass:0,mid:0,high:0,lvl:0,beat:0};
 const sp=(typeof S==="object"&&+S.pspeed)||.35;
 tm+=dt*(.16+.34*sp)*(1+ab.mid*.8);
 g.clearRect(0,0,W,H);
 const R=Math.max(W,H);
 for(let i=0;i<BLOBS.length;i++){
  const b=BLOBS[i],band=b.band==="lvl"?lvl:(ab[b.band]||0);
  const x=(b.x+b.ax*Math.sin(tm*b.fx*6.283+b.ph))*W,y=(b.y+b.ay*Math.cos(tm*b.fy*6.283+b.ph*1.3))*H;
  const r=b.r*R*(1+.22*band+.1*ab.beat);
  const al=Math.min(.9,pal.a[i]*(.78+.5*band+.18*ab.beat));
  const [cr,cg,cb]=pal.c[i].map(Math.round);
  const gr=g.createRadialGradient(x,y,0,x,y,r);
  gr.addColorStop(0,`rgba(${cr},${cg},${cb},${al})`);
  gr.addColorStop(.5,`rgba(${cr},${cg},${cb},${al*.42})`);
  gr.addColorStop(1,`rgba(${cr},${cg},${cb},0)`);
  g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2)}}

/* called by app.js's frame() at the background's update rate; dt=0 is the
   one static frame for reduced motion */
M.frame=(dt,lvl)=>paint(dt,lvl||0);
M.resize=()=>{size();if(typeof BOOT==="object"&&BOOT.reduce)paint(0,0)};

function apply(first){
 const de=document.documentElement;
 de.dataset.bg=M.bg;
 M.on=M.bg==="aura";
 const want=M.bg==="wave";
 try{
  if(!want){
   setParticlesEnabled(false);
   if(!first)draw(0);
   resize();
  }else if(!first){
   /* resize() restores the canvases and rebuilds the emptied field */
   setParticlesEnabled(true);
   resize();
  }
 }catch(_){}
 if(M.on){size();paint(0,0)}
 document.querySelectorAll(".bg-wave-only").forEach(f=>f.classList.toggle("bg-na",!want))}
M.set=v=>{if(!MODES.includes(v)||v===M.bg)return;M.bg=v;wr(LSM,v);apply(false)};
M.setFps=v=>{M.fps=+v===30?30:60;wr(LSF,String(M.fps))};
M.setTabs=v=>{M.tabs=v==="off"?"off":"move";wr(LST,M.tabs);document.documentElement.dataset.tw=M.tabs;
 if(document.getElementById("bgtabs"))setSeg("bgtabs",M.tabs)};

/* settings: two rows above the wave's own controls (Вид) */
function inject(){
 const dens=document.getElementById("dens"),f=dens?.closest(".field");
 if(!f||document.getElementById("bgmode"))return;
 const row=(id,lab,sub,btns)=>{const d=document.createElement("div");d.className="field";
  d.innerHTML=`<div><label data-i18n="${lab}">${t(lab)}</label><small data-i18n="${sub}">${t(sub)}</small></div>
<div class="seg" id="${id}" role="group">${btns}</div>`;return d};
 const a=row("bgmode","bg.mode","bg.mode.s",MODES.map(m=>`<button data-v="${m}" data-i18n="bg.${m}">${t("bg."+m)}</button>`).join(""));
 const b=row("bgfps","bg.fps","bg.fps.s",`<button data-v="60">60</button><button data-v="30">30</button>`);
 const c=row("bgtabs","bg.tabs","bg.tabs.s",`<button data-v="move" data-i18n="bg.tabs.move">${t("bg.tabs.move")}</button><button data-v="off" data-i18n="bg.tabs.off">${t("bg.tabs.off")}</button>`);
 f.before(a,b,c);
 /* density and glow only mean something for the wave */
 for(const id of ["dens","glow"])document.getElementById(id)?.closest(".field")?.classList.add("bg-wave-only");
 seg("bgmode",v=>M.set(v));seg("bgfps",v=>M.setFps(v));seg("bgtabs",v=>M.setTabs(v));
 setSeg("bgmode",M.bg);setSeg("bgfps",M.fps);setSeg("bgtabs",M.tabs)}

/* dimmed behind other screens exactly like the field: go() toggles .dim on
   the field's canvases, the aura follows */
const fg=document.getElementById("fieldgl")||document.getElementById("field");
if(fg){const sync=()=>cv.classList.toggle("dim",fg.classList.contains("dim"));sync();
 new MutationObserver(sync).observe(fg,{attributes:true,attributeFilter:["class"]})}

window.MWAura=M;
inject();apply(true);
addEventListener("resize",()=>{if(M.on)size()});
})();
