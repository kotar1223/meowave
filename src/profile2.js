/* profile2.js — the profile, round 8 (Beta 3.2).
   · Banners: a solid colour, a gradient, one of the presets or your own
     picture. Every banner you have used stays in «Мои баннеры», so swapping
     back is one click; uploaded pictures get their own file each
     (banners/<id>/banner-<time>.<ext>) instead of overwriting one, and a
     picture dropped from the list is deleted from storage.
   · A colour or a gradient is a small spec ({k:"color"|"grad"|"mesh", …})
     kept in profiles.prefs.banner through set_prefs, so friends see it too;
     a picture stays in banner_url as before. Choosing a colour clears
     banner_url, so an older build shows its default strip rather than a
     stale picture.
   · One look for your own profile and someone else's: a taller banner, a
     bigger avatar on its edge, name / badges / bio beside it, the numbers as
     a compact row and the actions in the header (see app.css «pf2»).
   Uses app.js globals: S, sb, sbUser, sbProfile, save, pushPrefs,
   renderProfile, uploadBanner, fillProfileSettings, toast, t, esc, I18N,
   LANG, cssUrlRaw, openSettings. */
(()=>{
"use strict";
const IC=(n,s)=>`<span class="material-symbols-rounded" aria-hidden="true"${s?` style="font-size:${s}px"`:""}>${n}</span>`;

Object.assign(I18N.ru,{
 "pb.t":"Баннер профиля","pb.mine":"Мои баннеры","pb.mine.s":"Всё, что вы ставили, — для быстрой смены",
 "pb.presets":"Готовые","pb.color":"Сплошной цвет","pb.grad":"Свой градиент","pb.angle":"Угол","pb.apply":"Применить градиент",
 "pb.img":"Своя картинка","pb.img.s":"PNG, JPEG, WebP или GIF до 4 МБ — кадрируется 3:1","pb.upload":"Загрузить",
 "pb.none":"Без баннера","pb.set":"Баннер обновлён","pb.del":"Убрать из списка","pb.custom":"Другой цвет",
 "pb.p.aurora":"Аврора","pb.p.sunset":"Закат","pb.p.ocean":"Океан","pb.p.forest":"Лес","pb.p.neon":"Неон","pb.p.desert":"Пустыня",
 "pb.p.night":"Ночь","pb.p.rose":"Роза","pb.p.mint":"Мята","pb.p.graphite":"Графит","pb.p.peach":"Персик","pb.p.lavender":"Лаванда","pb.p.accent":"Ваш акцент",
 "pf.banner":"Баннер","pf.edit":"Изменить профиль","pf.guest":"Гость"});
Object.assign(I18N.en,{
 "pb.t":"Profile banner","pb.mine":"My banners","pb.mine.s":"Everything you have used, for a quick swap",
 "pb.presets":"Presets","pb.color":"Solid colour","pb.grad":"Your gradient","pb.angle":"Angle","pb.apply":"Apply gradient",
 "pb.img":"Your picture","pb.img.s":"PNG, JPEG, WebP or GIF up to 4 MB — cropped to 3:1","pb.upload":"Upload",
 "pb.none":"No banner","pb.set":"Banner updated","pb.del":"Remove from the list","pb.custom":"Another colour",
 "pb.p.aurora":"Aurora","pb.p.sunset":"Sunset","pb.p.ocean":"Ocean","pb.p.forest":"Forest","pb.p.neon":"Neon","pb.p.desert":"Desert",
 "pb.p.night":"Night","pb.p.rose":"Rose","pb.p.mint":"Mint","pb.p.graphite":"Graphite","pb.p.peach":"Peach","pb.p.lavender":"Lavender","pb.p.accent":"Your accent",
 "pf.banner":"Banner","pf.edit":"Edit profile","pf.guest":"Guest"});

/* ─────────── specs ─────────── */
const HEX=/^#[0-9a-f]{6}$/i;
function clean(s){
 if(!s||typeof s!=="object")return null;
 const cs=(Array.isArray(s.c)?s.c:[s.c]).filter(c=>HEX.test(String(c||""))).slice(0,4);
 if(s.k==="color"&&cs.length)return {k:"color",c:cs[0].toLowerCase()};
 if(s.k==="grad"&&cs.length>=2){const a=Math.round(Number(s.a));return {k:"grad",a:Number.isFinite(a)?((a%360)+360)%360:135,c:cs.slice(0,3).map(x=>x.toLowerCase())}}
 if(s.k==="mesh"&&cs.length>=3)return {k:"mesh",c:cs.map(x=>x.toLowerCase())};
 if(s.k==="img"&&typeof s.u==="string"&&/^(https:\/\/|data:image\/)/.test(s.u)&&s.u.length<2_000_000)return {k:"img",u:s.u};
 return null}
function css(s){
 s=clean(s);if(!s)return "";
 if(s.k==="color")return `linear-gradient(180deg,rgb(255 255 255/.07),rgb(0 0 0/.16)),${s.c}`;
 if(s.k==="grad")return `linear-gradient(${s.a}deg,${s.c.join(",")})`;
 if(s.k==="mesh"){const [b,x,y,z]=s.c;
  return `radial-gradient(ellipse at 16% 20%,${x} 0,transparent 58%),radial-gradient(ellipse at 84% 26%,${y} 0,transparent 54%)`
   +(z?`,radial-gradient(ellipse at 52% 112%,${z} 0,transparent 62%)`:"")+`,${b}`}
 if(s.k==="img"){const u=cssUrlRaw(s.u);return u?`center/cover no-repeat url('${u}')`:""}
 return ""}
const key=s=>JSON.stringify(clean(s));
const PRESETS=[
 ["aurora",{k:"mesh",c:["#0b1026","#2dd4bf","#6366f1","#a855f7"]}],
 ["sunset",{k:"grad",a:120,c:["#f97316","#ec4899","#8b5cf6"]}],
 ["ocean",{k:"grad",a:135,c:["#0ea5e9","#1e3a8a"]}],
 ["forest",{k:"grad",a:135,c:["#052e16","#166534","#65a30d"]}],
 ["neon",{k:"mesh",c:["#0a0a12","#f0abfc","#22d3ee","#a78bfa"]}],
 ["desert",{k:"grad",a:160,c:["#78350f","#d97706","#fde68a"]}],
 ["night",{k:"grad",a:180,c:["#0f172a","#1e1b4b","#312e81"]}],
 ["rose",{k:"grad",a:135,c:["#831843","#db2777","#f9a8d4"]}],
 ["mint",{k:"grad",a:135,c:["#064e3b","#10b981","#a7f3d0"]}],
 ["graphite",{k:"grad",a:135,c:["#111827","#374151","#6b7280"]}],
 ["peach",{k:"mesh",c:["#2a1a1f","#fb923c","#f472b6","#fde047"]}],
 ["lavender",{k:"grad",a:135,c:["#312e81","#7c3aed","#c4b5fd"]}]];
const SWATCHES=["#0f172a","#1f2937","#7f1d1d","#b91c1c","#c2410c","#a16207","#15803d","#0f766e","#0369a1","#1d4ed8","#6d28d9","#be185d"];
function accentSpec(){
 const rgb=getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim().split(/[\s,/]+/).map(Number);
 if(rgb.length<3||rgb.some(n=>!Number.isFinite(n)))return null;
 const hx=v=>"#"+v.map(n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,"0")).join("");
 const mix=(k,base)=>rgb.map((n,i)=>n*k+base[i]*(1-k));
 return {k:"mesh",c:[hx(mix(.18,[10,10,18])),hx(rgb),hx(mix(.55,[255,255,255])),hx(mix(.6,[20,10,40]))]}}

/* ─────────── state ─────────── */
const LS_STYLE="mw.banner.style",LS_GAL="mw.banners";
let STYLE=(()=>{try{return clean(JSON.parse(localStorage.getItem(LS_STYLE)||"null"))}catch(_){return null}})();
const signed=()=>typeof sb!=="undefined"&&sb&&typeof sbUser!=="undefined"&&sbUser;
/* The account's copy wins once it has been read: that is how a banner
   follows you to another machine. */
function myStyle(){
 const pr=typeof sbProfile!=="undefined"&&sbProfile&&sbProfile.prefs;
 if(signed()&&pr&&Object.prototype.hasOwnProperty.call(pr,"banner"))return clean(pr.banner);
 return STYLE}
function setStyle(s){
 STYLE=clean(s);
 try{STYLE?localStorage.setItem(LS_STYLE,JSON.stringify(STYLE)):localStorage.removeItem(LS_STYLE)}catch(_){}
 if(typeof sbProfile!=="undefined"&&sbProfile)sbProfile.prefs={...(sbProfile.prefs||{}),banner:STYLE}}
const gal=()=>{try{const a=JSON.parse(localStorage.getItem(LS_GAL)||"[]");return Array.isArray(a)?a.map(clean).filter(Boolean):[]}catch(_){return []}};
function galSave(list){
 for(let l=list.slice(0,12);;){
  try{localStorage.setItem(LS_GAL,JSON.stringify(l));return l}
  catch(_){/* quota: drop the oldest picture kept inline (a guest's data URL) */
   const i=l.map(x=>x.k==="img"&&x.u.startsWith("data:")).lastIndexOf(true);
   if(i<0){l=l.slice(0,-1);if(!l.length)return l}else l.splice(i,1)}}}
function galAdd(s){
 s=clean(s);if(!s)return;
 const k=key(s),old=gal();
 const next=[s,...old.filter(x=>key(x)!==k)];
 const kept=galSave(next);
 next.filter(x=>!kept.some(y=>key(y)===key(x))).forEach(dropFile)}
/* Our own pictures in the banners bucket; anything else is not ours to delete. */
function ownPath(u){
 const m=/\/object\/public\/banners\/([^?#]+)/.exec(String(u||""));if(!m||!signed())return null;
 const p=decodeURIComponent(m[1]);
 return p.startsWith(sbUser.id+"/")?p:null}
function dropFile(s){
 if(!s||s.k!=="img")return;
 const p=ownPath(s.u);if(!p)return;
 const cur=String((typeof sbProfile!=="undefined"&&sbProfile?.banner_url)||S.banner||"");
 if(ownPath(cur)===p)return;
 sb.storage.from("banners").remove([p]).catch(()=>{})}

/* ─────────── applying ─────────── */
async function setBannerUrl(u){
 S.banner=u||"";
 if(typeof sbProfile!=="undefined"&&sbProfile)sbProfile={...sbProfile,banner_url:u||null};
 save();
 if(signed()){
  const {error}=await sb.from("profiles").upsert({id:sbUser.id,banner_url:u||null});
  if(error)console.warn("banner:",error.message||error)}}
async function apply(s){
 s=clean(s);
 if(s&&s.k==="img"){setStyle(null);await setBannerUrl(s.u)}
 else{setStyle(s);await setBannerUrl(null)}
 if(s)galAdd(s);
 try{pushPrefs()}catch(_){}
 try{renderProfile()}catch(_){}
 try{fillProfileSettings()}catch(_){}
 toast(t("pb.set"))}
/* Called by app.js's uploadImage: a picture replaces a colour at once, and
   the uploaded file joins «Мои баннеры». */
function imageChosen(){if(myStyle()){setStyle(null);try{pushPrefs()}catch(_){}}}
function added(u){if(u)galAdd({k:"img",u})}

/* ─────────── rendering ─────────── */
/* The banner of a profile row: {cls, style} for the .banner element. */
function specOf(p){
 const own=signed()&&p&&String(p.id||"")===String(sbUser.id);
 return own?myStyle():clean(p&&p.prefs&&p.prefs.banner)}
function attrs(s){
 const c=css(s);
 return c?{cls:" has-style",style:` style="background:${esc(c)}"`}:{cls:"",style:""}}
function cardBg(p){const c=css(specOf(p));return c?`background:${esc(c)}`:""}

/* ─────────── the picker ─────────── */
function tile(s,label,extra=""){
 const c=css(s);
 return `<button type="button" class="pb-tile" data-pb='${esc(JSON.stringify(clean(s)))}' style="background:${esc(c)}" title="${esc(label||"")}" aria-label="${esc(label||"")}">${extra}${label?`<span class="pb-l">${esc(label)}</span>`:""}</button>`}
function body(){
 const mine=gal(),cur=key(myStyle()||(S.banner?{k:"img",u:S.banner}:null));
 const acc=accentSpec();
 const mark=h=>h.replace(/data-pb='([^']*)'/g,(m,j)=>m+(j===esc(cur)?' aria-current="true"':""));
 return mark(`<div class="pb">
  <div class="pb-prev"><span class="pb-prev-b"></span></div>
  ${mine.length?`<section><div class="pb-h"><b>${esc(t("pb.mine"))}</b><small>${esc(t("pb.mine.s"))}</small></div>
   <div class="pb-grid">${mine.map((s,i)=>`<span class="pb-wrap">${tile(s,"")}<button type="button" class="pb-x" data-pbdel="${i}" title="${esc(t("pb.del"))}" aria-label="${esc(t("pb.del"))}">${IC("close",14)}</button></span>`).join("")}</div></section>`:""}
  <section><div class="pb-h"><b>${esc(t("pb.presets"))}</b></div>
   <div class="pb-grid">${acc?tile(acc,t("pb.p.accent")):""}${PRESETS.map(([id,s])=>tile(s,t("pb.p."+id))).join("")}</div></section>
  <section><div class="pb-h"><b>${esc(t("pb.color"))}</b></div>
   <div class="pb-sw">${SWATCHES.map(c=>`<button type="button" class="pb-dot" data-pb='${esc(JSON.stringify({k:"color",c}))}' style="background:${c}" aria-label="${c}"></button>`).join("")}
    <label class="pb-dot pb-own" title="${esc(t("pb.custom"))}">${IC("colorize",16)}<input type="color" data-pbcolor value="#6d28d9"></label></div></section>
  <section><div class="pb-h"><b>${esc(t("pb.grad"))}</b></div>
   <div class="pb-gr"><input type="color" data-g="0" value="#6366f1"><input type="color" data-g="1" value="#ec4899"><input type="color" data-g="2" value="#0b1026">
    <label class="pb-ang"><span>${esc(t("pb.angle"))}</span><input type="range" min="0" max="360" step="5" value="135" data-g="a"><output>135°</output></label>
    <button type="button" class="btn sm" data-pbgrad>${IC("gradient",16)}<span>${esc(t("pb.apply"))}</span></button></div></section>
  <section class="pb-img"><div class="pb-h"><b>${esc(t("pb.img"))}</b><small>${esc(t("pb.img.s"))}</small></div>
   <div class="pb-row"><button type="button" class="btn sm" data-pbup>${IC("upload",16)}<span>${esc(t("pb.upload"))}</span></button>
    <button type="button" class="btn sm ghost" data-pbnone>${IC("hide_image",16)}<span>${esc(t("pb.none"))}</span></button></div>
   <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-pbfile></section>
 </div>`)}
let DLG=null;
function pick(){
 if(typeof window.mwDialog!=="function"){document.getElementById("prof-ban-input")?.click();return}
 DLG?.close();
 const d=DLG=window.mwDialog({icon:"palette",title:t("pb.t"),body:body(),cls:"pb-dlg wide",actions:[{label:t("close"),primary:true}]});
 const root=d.body;
 const prev=()=>root.querySelector(".pb-prev-b");
 const show=s=>{const p=prev();if(p)p.style.background=css(s)||""};
 const gradSpec=()=>{const g=i=>root.querySelector(`[data-g="${i}"]`)?.value;
  return clean({k:"grad",a:+g("a"),c:[g(0),g(1),g(2)]})};
 show(myStyle()||(S.banner?{k:"img",u:S.banner}:null));
 const repaint=()=>{root.innerHTML=body();wire()};
 function wire(){
  show(myStyle()||(S.banner?{k:"img",u:S.banner}:null));
  root.querySelectorAll("[data-pb]").forEach(b=>{
   const s=(()=>{try{return JSON.parse(b.dataset.pb)}catch(_){return null}})();
   b.addEventListener("pointerenter",()=>show(s));
   b.addEventListener("pointerleave",()=>show(myStyle()||(S.banner?{k:"img",u:S.banner}:null)));
   b.addEventListener("click",async()=>{await apply(s);repaint()})});
  root.querySelectorAll("[data-pbdel]").forEach(b=>b.addEventListener("click",e=>{
   e.stopPropagation();
   const l=gal(),i=+b.dataset.pbdel,[gone]=l.splice(i,1);
   galSave(l);dropFile(gone);repaint()}));
  root.querySelector("[data-pbcolor]")?.addEventListener("change",async e=>{await apply({k:"color",c:e.target.value});repaint()});
  root.querySelectorAll("[data-g]").forEach(i=>i.addEventListener("input",()=>{
   const o=root.querySelector(".pb-ang output");if(o)o.textContent=(root.querySelector('[data-g="a"]')?.value||0)+"°";
   show(gradSpec())}));
  root.querySelector("[data-pbgrad]")?.addEventListener("click",async()=>{await apply(gradSpec());repaint()});
  const file=root.querySelector("[data-pbfile]");
  root.querySelector("[data-pbup]")?.addEventListener("click",()=>file?.click());
  file?.addEventListener("change",async()=>{
   const f=file.files?.[0];file.value="";if(!f)return;
   d.close();
   await uploadBanner(f);
   try{fillProfileSettings()}catch(_){}});
  root.querySelector("[data-pbnone]")?.addEventListener("click",async()=>{
   setStyle(null);await setBannerUrl(null);
   try{pushPrefs()}catch(_){}
   try{renderProfile()}catch(_){}
   repaint()})}
 wire()}

/* Settings → Profile → Banner opens the same picker. */
document.addEventListener("click",e=>{
 const b=e.target instanceof Element&&e.target.closest("#set-ban-pick,[data-pfbanner]");
 if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();pick()},true);
document.addEventListener("click",e=>{
 if(e.target instanceof Element&&e.target.closest("[data-pfedit]")){e.preventDefault();try{openSettings("prof")}catch(_){}}});

window.MWProf={pick,apply,css,clean,specOf,attrs,cardBg,myStyle,style:()=>myStyle(),imageChosen,added,PRESETS};
})();
