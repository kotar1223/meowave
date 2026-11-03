/* Meowave — discover.js

   Everything that came with the "platform recommendations" round:
   - My Wave 2.0: Yandex Music's own rotor ("Моя волна") with its mood,
     character and language settings and real feedback, or — without a Yandex
     account — a wave mixed from the free services' radios seeded by the
     user's favourites, with the same knobs;
   - the pull-up collections sheet on the home screen (charts, new releases,
     moods, editorial playlists of every connected service);
   - collection pages and artist pages (Spotify's public artist card: header,
     monthly listeners, top tracks with play counts, releases, related);
   - drag & drop / paste of links, app-wide wallpaper settings and the
     cover-follow switch.

   A classic script loaded after app.js: it shares app.js's globals (S, TRACKS,
   queue, setTrack, inv, t …) and plugs into the hooks app.js leaves for it
   (wave2Start, wave2Extend, waveNoteStart, waveNoteEnd). */
(()=>{
"use strict";
if(typeof S==="undefined"||typeof setTrack!=="function")return;

/* ───────────────────────── helpers ───────────────────────── */
const $=id=>document.getElementById(id);
const fill=(k,vars)=>{let s=t(k);for(const [a,b] of Object.entries(vars||{}))s=s.split("{"+a+"}").join(String(b));return s};
const shuffled=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pick=a=>a[Math.floor(Math.random()*a.length)];
const nfmt=n=>{n=+n||0;try{return new Intl.NumberFormat(LANG==="ru"?"ru-RU":"en-US",n>=1e5?{notation:"compact",maximumFractionDigits:1}:{}).format(n)}catch(_){return String(n)}};
const errText=e=>String(e&&e.message||e||"").replace(/^Error:\s*/,"").slice(0,180);
const ICON=(n,sz)=>`<span class="material-symbols-rounded"${sz?` style="font-size:${sz}px"`:""} aria-hidden="true">${n}</span>`;
const img=(u,cls)=>{const s=cssUrlRaw(u);return s?`<img${cls?` class="${cls}"`:""} src="${esc(s)}" alt="" loading="lazy" decoding="async" draggable="false">`:""};
const safeColor=c=>/^#[0-9a-f]{3,8}$/i.test(String(c||""))?c:"";
const addTracks=list=>(list||[]).forEach(x=>{if(x&&!TRACKS.some(y=>sameTrack(y,x)))TRACKS.push(x)});
const artistKey=a=>MWM.fold(sprPrimary(a||"")).trim();
const hasCyr=x=>/[\u0400-\u04FF]/.test(`${x.t||""} ${x.a||""}`);
async function call(cmd,args){
 if(!TAURI)throw new Error(t("dc.desktop"));
 return await inv(cmd,args)}
async function searchOn(src,q){
 if(!TAURI||!q)return [];
 try{const r=await inv("api_search",{query:String(q).trim(),services:[src]});return (r?.tracks||[]).filter(x=>x&&x.s===src)}
 catch(_){return []}}
async function radioOn(src,id){
 if(!TAURI||!id)return [];
 try{const r=await inv("api_radio",{service:src,id:String(id)});return Array.isArray(r)?r:[]}
 catch(_){return []}}

/* ═════════════════════════ My Wave 2.0 ═════════════════════════ */
const WV={src:"",session:null,batch:null,seeds:[],cur:null,seen:new Set(),skipA:new Map(),liked:[],played:[],
 busy:false,ext:null,gen:0,retuneT:0};
function waveCfg(){
 if(!S.x.wave||typeof S.x.wave!=="object")S.x.wave={};
 const w=S.x.wave;
 if(!["auto","ym","ytm","sc","dz"].includes(w.src))w.src="auto";
 if(!["default","favorite","discover","popular"].includes(w.div))w.div="default";
 if(!["all","active","fun","calm","sad"].includes(w.mood))w.mood="all";
 if(!["any","russian","not-russian","without-words"].includes(w.lang))w.lang="any";
 return w}
const ymReady=()=>{const s=svc("ym");return !!(s.conn&&s.on)};
const srvOk=id=>id==="ym"?ymReady():!!(svc(id).on&&svc(id).conn);
/* Yandex first: its rotor is the one recommender here that knows the user. */
function waveSource(){
 const w=waveCfg();
 if(w.src!=="auto"&&srvOk(w.src))return w.src;
 if(ymReady())return "ym";
 return ["ytm","sc","dz"].find(srvOk)||""}
const waveFallback=not=>["ytm","sc","dz"].find(id=>id!==not&&srvOk(id))||"";
const waveLive=()=>PLAYCTX.key==="wave"&&!!S.current&&S.current.mode!=="empty";

/* ── Yandex rotor ── */
function ymSeeds(){
 const w=waveCfg(),s=["user:onyourwave"];
 if(w.mood!=="all")s.push("settingMoodEnergy:"+w.mood);
 if(w.div!=="default")s.push("settingDiversity:"+w.div);
 if(w.lang!=="any")s.push("settingLanguage:"+w.lang);
 return s}
const ymRef=x=>x&&x.s==="ym"&&x.id?(x.alid?`${x.id}:${x.alid}`:String(x.id)):"";
/* What makes the rotor adapt: started, finished, skipped (with seconds). */
function feedback(kind,tr,played){
 if(WV.src!=="ym"||!TAURI)return Promise.resolve();
 return Promise.resolve(inv("wave_ym_feedback",{session:WV.session,batch:WV.batch,seeds:WV.seeds,kind,
  track:tr?(ymRef(tr)||null):null,played:played==null?null:Math.max(0,Math.round(+played||0))}))
  .catch(e=>console.warn("wave feedback:",errText(e)))}
async function ymBatch(fresh){
 if(fresh||!WV.session){
  WV.seeds=ymSeeds();
  const b=await inv("wave_ym_start",{seeds:WV.seeds,queue:WV.played.length?WV.played.slice(-20):null});
  WV.session=b?.session||null;WV.batch=b?.batch||null;
  return take(waveFilter(b?.tracks||[],true),40)}
 const b=await inv("wave_ym_more",{session:WV.session,seeds:WV.seeds,queue:WV.played.slice(-30)});
 if(b?.session)WV.session=b.session;
 if(b?.batch)WV.batch=b.batch;
 return take(waveFilter(b?.tracks||[],true),40)}

/* ── the mixed wave (no Yandex): radios of the user's own seeds ── */
/* `soft` (Yandex) trusts the recommender and only drops what must never play;
   the mixed wave also keeps clear of recent history, of artists skipped twice
   and — for "Unfamiliar" — of artists the user already loves. */
function waveFilter(list,soft){
 const w=waveCfg();
 const recent=soft?null:new Set(HISTORY.slice(0,60).map(h=>h.tr&&MWM.key(h.tr)).filter(Boolean));
 const favA=!soft&&w.div==="discover"?new Set(FAV_ARTISTS.map(artistKey).concat(favTracks().map(x=>artistKey(x.a)))):null;
 const per=new Map(),keys=new Set(),out=[];
 for(const x of list||[]){
  if(!x||!x.id||x.mode==="empty"||x.s==="local")continue;
  if(isDisliked(x)||!playOn(x.s))continue;
  const k=MWM.key(x);
  if(keys.has(k)||WV.seen.has(k)||(recent&&recent.has(k)))continue;
  const a=artistKey(x.a);
  if((WV.skipA.get(a)||0)>=2)continue;
  if(favA&&favA.has(a))continue;
  const n=per.get(a)||0;if(!soft&&n>=2)continue;
  per.set(a,n+1);keys.add(k);out.push(x)}
 return soft?out:spread(langPref(out,w.lang))}
function take(list,n){const out=list.slice(0,n);out.forEach(x=>WV.seen.add(MWM.key(x)));return out}
function langPref(list,lang){
 if(lang!=="russian"&&lang!=="not-russian")return list;
 const want=lang==="russian",a=list.filter(x=>hasCyr(x)===want),b=list.filter(x=>hasCyr(x)!==want),out=[];
 while(a.length||b.length){for(let i=0;i<4&&a.length;i++)out.push(a.shift());if(b.length)out.push(b.shift())}
 return out}
/* The same artist never twice in a row. */
function spread(list){
 const out=[],rest=list.slice();
 while(rest.length){
  const last=out.length?artistKey(out[out.length-1].a):"";
  let i=rest.findIndex(x=>artistKey(x.a)!==last);if(i<0)i=0;
  out.push(rest.splice(i,1)[0])}
 return out}
function pickSeeds(n){
 const cur=waveLive()?[S.current]:[];
 const favs=shuffled(favTracks().filter(x=>!isDisliked(x)));
 const hist=shuffled(HISTORY.slice(0,30).map(h=>h.tr).filter(x=>x&&x.mode!=="empty"&&!isDisliked(x)));
 const pool=[...cur,...shuffled(WV.liked.slice(-8)).slice(0,2),...favs.slice(0,8),...hist.slice(0,6)];
 const out=[],keys=new Set();
 for(const x of pool){const k=MWM.key(x);if(keys.has(k))continue;keys.add(k);out.push(x);if(out.length>=n)break}
 return out}
/* A seed from another service is matched onto the wave's one first. */
async function seedRadio(src,seed){
 let id=seed.s===src?String(seed.id):"";
 if(!id){
  const hits=await searchOn(src,`${sprPrimary(seed.a||"")} ${MWM.core(seed.t||"")}`);
  const best=hits.map(h=>({h,m:MWM.of(seed,h)})).filter(o=>o.m!=null).sort((a,b)=>b.m-a.m)[0];
  /* No copy of this very song there: the artist's best-known one is a fair seed. */
  const sameA=hits.find(h=>artistKey(h.a)===artistKey(seed.a));
  id=String((best?.h||sameA||{}).id||"")}
 if(!id)return [];
 return (await radioOn(src,id)).filter(x=>!(String(x.id)===id&&x.s===src))}
async function artistSeed(src,name){
 const hits=await searchOn(src,name);
 const h=hits.find(x=>artistKey(x.a)===artistKey(name))||hits[0];
 return h?radioOn(src,h.id):[]}
const MOOD_Q={
 active:{ru:["энергичная музыка","бодрые хиты","музыка для тренировки"],en:["energetic workout music","upbeat dance hits","pump up songs"]},
 fun:{ru:["весёлые песни","танцевальные хиты","песни для хорошего настроения"],en:["feel good songs","happy pop hits","good vibes songs"]},
 calm:{ru:["спокойная музыка","расслабляющая музыка","музыка для души"],en:["chill vibes","calm acoustic","relaxing indie"]},
 sad:{ru:["грустные песни","меланхоличные песни","песни о расставании"],en:["sad songs","melancholic indie","heartbreak songs"]},
 all:{ru:["новинки музыки","русские хиты"],en:["new music friday","indie discoveries"]}};
const NOWORDS={active:"instrumental workout",fun:"upbeat instrumental",calm:"ambient instrumental",sad:"sad piano instrumental",all:"lofi instrumental beats"};
function moodQueries(w,bare){
 const lang=w.lang==="russian"?"ru":w.lang==="not-russian"?"en":(LANG==="ru"&&Math.random()<.5?"ru":"en");
 const out=[];
 if(w.lang==="without-words")out.push(NOWORDS[w.mood]||NOWORDS.all);
 else if(w.mood!=="all"){const qs=shuffled(MOOD_Q[w.mood][lang]);out.push(qs[0],qs[1])}
 if(w.div==="popular")out.push((lang==="ru"?"хиты ":"top hits ")+new Date().getFullYear());
 if(bare)out.push(...MOOD_Q.all[lang]);
 return out.filter(Boolean)}
/* YouTube Music has curated mood playlists; for a chosen mood they beat a
   text search by a mile. Best effort, a few seconds at most. */
const YTM_MOOD={active:/энерг|трениров|спорт|workout|energ|pump/i,fun:/вечерин|party|хорош|feel ?good|happy|весел|весёл/i,
 calm:/спокой|chill|relax|расслаб|сон|sleep|focus|сосредот|calm/i,sad:/грус|sad|melanch|меланх|heartbr/i};
async function ytmMoodTracks(mood){
 const re=YTM_MOOD[mood];if(!re)return [];
 const job=(async()=>{
  const home=await hsShelves("ytm");
  const cat=home.flatMap(sh=>sh.cards||[]).find(c=>c.kind==="browse"&&re.test(c.t||""));
  if(!cat)return [];
  const page=await inv("feeds_open",{service:"ytm",kind:"browse",id:cat.id,lang:LANG});
  const lists=(page?.shelves||[]).flatMap(sh=>sh.cards||[]).filter(c=>c.kind==="playlist"||c.kind==="album");
  const two=shuffled(lists).slice(0,2);
  const got=await Promise.all(two.map(c=>inv("feeds_open",{service:"ytm",kind:c.kind,id:c.id,lang:LANG}).then(o=>o?.tracks||[]).catch(()=>[])));
  return shuffled(got.flat())})();
 return Promise.race([job.catch(()=>[]),new Promise(r=>setTimeout(()=>r([]),7000))])}
async function mixBatch(src,first){
 const w=waveCfg();
 const seeds=pickSeeds(w.mood!=="all"?2:(first?4:3));
 const jobs=seeds.map(sd=>seedRadio(src,sd));
 if(seeds.length<2&&FAV_ARTISTS.length)jobs.push(artistSeed(src,pick(FAV_ARTISTS)));
 for(const q of moodQueries(w,!seeds.length&&!FAV_ARTISTS.length))jobs.push(searchOn(src,q));
 if(src==="ytm"&&w.mood!=="all"&&w.lang!=="without-words")jobs.push(ytmMoodTracks(w.mood));
 const lists=(await Promise.all(jobs.map(j=>Promise.resolve(j).catch(()=>[])))).filter(l=>l&&l.length);
 const mixed=[],max=Math.max(0,...lists.map(l=>l.length));
 for(let i=0;i<max;i++)for(const l of lists)if(l[i])mixed.push(l[i]);
 let out=waveFilter(mixed).slice(0,first?30:20);
 /* A few familiar songs keep the wave recognisably "yours". */
 const every=w.div==="favorite"?3:w.div==="default"?6:0;
 if(every&&out.length){
  const fresh=new Set(HISTORY.slice(0,15).map(h=>h.tr&&MWM.key(h.tr)));
  const anchors=shuffled(favTracks().filter(x=>playOn(x.s)&&!isDisliked(x)&&!WV.seen.has(MWM.key(x))&&!fresh.has(MWM.key(x))&&!(waveLive()&&sameTrack(x,S.current))));
  const res=[];out.forEach((x,i)=>{if(i&&i%every===0&&anchors.length)res.push(anchors.shift());res.push(x)});
  out=res}
 return take(out,out.length)}

/* ── the hooks app.js calls ── */
async function wave2Start(){
 if(WV.busy)return;
 const src=waveSource();
 if(!src){toast(t("wv.none"));return}
 WV.busy=true;const gen=++WV.gen;
 const btn=$("start");btn?.setAttribute("aria-busy","true");paintWaveUI();
 try{
  await ensureStreamPort();
  WAVE_SESSION_PLAYED.clear();
  Object.assign(WV,{session:null,batch:null,seeds:[],cur:null,seen:new Set(),skipA:new Map(),played:[]});
  let list=[];
  WV.src=src;
  if(src==="ym"){
   try{list=await ymBatch(true)}catch(e){console.warn("ym wave:",errText(e))}
   if(!list.length){toast(t("wv.ym.fail"),5200);WV.src=waveFallback("ym")}}
  if(!list.length&&WV.src)list=await mixBatch(WV.src,true);
  if(gen!==WV.gen)return;
  if(!list.length){WV.src="";return startWaveLegacy()}
  WAVE=list.slice();addTracks(list);
  if(WV.src==="ym")await Promise.race([feedback("radioStarted"),new Promise(r=>setTimeout(r,1500))]);
  await setTrack(list[0],true,true,"wave");
  if(fp.dataset.open==="true")renderFPBody();
 }catch(e){console.error("wave:",e);toast(t("wave.empty"))}
 finally{WV.busy=false;btn?.removeAttribute("aria-busy");paintWaveUI()}}
function wave2Extend(){
 if(WV.ext)return WV.ext;
 WV.ext=(async()=>{
  try{
   const src=WV.src||waveSource();if(!src)return false;
   let fresh=[];
   if(src==="ym"){
    try{fresh=await ymBatch(false)}catch(e){console.warn("ym wave more:",errText(e))}
    if(!fresh.length&&S.current?.s==="ym")fresh=take(waveFilter(await radioOn("ym",S.current.id),true),30);
    if(!fresh.length){const fb=waveFallback("ym");if(fb)fresh=await mixBatch(fb,false)}}
   else fresh=await mixBatch(src,false);
   if(!fresh.length)return false;
   fresh.forEach(x=>{WAVE.push(x);queue.push(x)});addTracks(fresh);
   if(WAVE.length>400)WAVE.splice(0,WAVE.length-400);
   if(fp.dataset.open==="true")renderFPBody();
   return true}
  catch(e){console.warn("wave extend:",e);return false}
  finally{WV.ext=null}})();
 return WV.ext}
function waveNoteStart(tr){
 if(!tr)return;
 if(WV.cur&&!sameTrack(WV.cur,tr))waveNoteEnd(WV.cur,false);
 WV.cur=tr;WV.seen.add(MWM.key(tr));
 const r=ymRef(tr);if(r){WV.played.push(r);if(WV.played.length>60)WV.played.shift()}
 feedback("trackStarted",tr);
 paintWaveUI()}
function waveNoteEnd(tr,finished){
 if(!tr||!WV.cur||!sameTrack(WV.cur,tr))return;
 const played=Math.max(0,Math.round(+S.pos||0));
 WV.cur=null;
 /* A stream that died at 0:02 also "ends"; only a real listen counts. */
 if(finished&&played<Math.min(30,(+tr.d||60)*.5))finished=false;
 if(finished){
  WV.liked.push(tr);if(WV.liked.length>30)WV.liked.shift();
  feedback("trackFinished",tr,played||+tr.d||0)}
 else{
  /* Skipped inside half a minute: that artist is not welcome right now. */
  if(played<30){const a=artistKey(tr.a);WV.skipA.set(a,(WV.skipA.get(a)||0)+1)}
  feedback("skip",tr,played)}}
/* A new mood or source rebuilds what is queued, not what is playing. */
function waveRetune(){
 clearTimeout(WV.retuneT);
 WV.retuneT=setTimeout(async()=>{
  if(!waveLive())return;
  const gen=++WV.gen,src=waveSource();if(!src)return;
  let list=[];
  try{
   if(src==="ym"){WV.src="ym";list=await ymBatch(true);if(list.length)feedback("radioStarted")}
   else{WV.src=src;list=await mixBatch(src,false)}
  }catch(e){console.warn("wave retune:",errText(e))}
  if(gen!==WV.gen||!waveLive()||!list.length)return;
  list=list.filter(x=>!sameTrack(x,S.current));
  queue=list.slice();WAVE=[S.current,...list];addTracks(list);
  if(fp.dataset.open==="true")renderFPBody();
  paintWaveUI();toast(t("wv.restart"))},650)}

/* ── wave UI on the home screen ──
   The hero says what is actually happening: the brand line while nothing
   plays, the track and "now on your wave" while the wave plays, and "now
   playing" for anything else — the old screen kept saying "Silence. The field
   waits." over a playing track. Tuning lives in an MD3 side sheet with plain
   radio lists instead of a popover of pills and a row of mood buttons. */
const WV_DEF={src:"auto",div:"default",mood:"all",lang:"any"};
const WV_ROWS={
 div:[["default","balance"],["favorite","favorite"],["discover","explore"],["popular","trending_up"]],
 mood:[["all","all_inclusive"],["active","bolt"],["fun","sentiment_very_satisfied"],["calm","spa"],["sad","rainy"]],
 lang:[["any","translate"],["russian","record_voice_over"],["not-russian","language"],["without-words","piano"]]};
const optName=(k,v)=>k==="src"?(v==="auto"?t("wv.src.auto"):svc(v).name)
 :k==="div"?(v==="default"?t("wv.any"):t("wv.div."+v))
 :k==="mood"?(v==="all"?t("wv.any"):t("wv.mood."+v))
 :(v==="any"?t("wv.lang.any"):t("wv.lang."+v));
const optSub=(k,v)=>k==="src"?t(v==="auto"?"wv.src.auto.s":v==="ym"?"wv.src.ym.s":"wv.src.mix.s")
 :k==="lang"?"":t(`wv.${k}.${v}.s`);
/* Non-default settings in words, for the kicker and the sheet header. */
function waveTags(){
 const w=waveCfg(),out=[];
 for(const k of ["mood","div","lang"])if(w[k]!==WV_DEF[k])out.push(optName(k,w[k]));
 return out}
const waveCustom=()=>{const w=waveCfg();return Object.keys(WV_DEF).some(k=>w[k]!==WV_DEF[k])};
function waveLine(){
 const src=waveLive()&&WV.src?WV.src:waveSource();
 if(!src)return {src:"",txt:t("wv.none")};
 const name=svc(src).name;
 return {src,txt:src==="ym"?fill("wv.from",{s:name}):(pickSeeds(1).length?fill("wv.mix",{s:name}):`${t("wv.cap")} · ${name}`)}}
function waveHint(){paintHero()}
const EQ_BARS=`<span class="hero-eq" aria-hidden="true"><b></b><b></b><b></b><b></b></span>`;
function paintHero(){
 const hero=$("hero");if(!hero)return;
 const tr=S.current,has=!!tr&&tr.mode!=="empty",live=has&&waveLive();
 const state=has?(live?"wave":"track"):"idle";
 hero.dataset.state=state;hero.dataset.playing=String(!!S.playing);
 const h=$("hero-t"),p=$("hero-s"),k=$("wavehint"),nx=$("hero-next");
 const key=`${state}|${has?trackKey(tr):""}|${LANG}`;
 if(h&&p&&hero.dataset.key!==key){
  const first=!hero.dataset.key;
  hero.dataset.key=key;
  if(state==="idle"){h.textContent=t("home.t");p.textContent=t("home.s")}
  else{h.textContent=tr.t||"—";p.textContent=tr.a||"—"}
  h.title=state==="idle"?"":h.textContent;
  if(!first){hero.classList.remove("swap");void hero.offsetWidth;hero.classList.add("swap")}}
 if(k){
  const tags=waveTags(),tagHTML=tags.length?`<span class="hero-tags">${esc(tags.join(" · "))}</span>`:"";
  let html,ready=true;
  if(state==="wave")html=`${EQ_BARS}<span>${esc(t("wv.live"))} · ${esc(svc(WV.src||tr.s).name)}</span>${tagHTML}`;
  else if(state==="track"){const s=tr._resolvedSvc||tr.s;html=`<span class="wv-src">${SVC_ICONS[s]||""}</span><span>${esc(t("wv.now"))} · ${esc(svc(s).name||"")}</span>`}
  else{const l=waveLine();ready=!!l.src;html=`<span class="wv-src">${SVC_ICONS[l.src]||""}</span><span>${esc(l.txt)}</span>${l.src?tagHTML:""}`}
  if(k.dataset.html!==html){k.dataset.html=html;k.innerHTML=html}
  k.dataset.ready=String(ready)}
 if(nx){
  const up=state==="wave"?(typeof queue!=="undefined"&&queue.find(x=>x&&!sameTrack(x,tr))):null;
  const txt=up?`${t("wv.next")}: ${up.a?up.a+" — ":""}${up.t||""}`:"";
  if(nx.textContent!==txt)nx.textContent=txt;
  nx.hidden=!txt}
 const st=$("start");
 if(st){
  const [ic,lab]=state==="wave"?(S.playing?["pause",t("np.pause")]:["play_arrow",t("wv.resume")]):["graphic_eq",t("home.start")];
  const sig=ic+"|"+lab;
  if(st.dataset.sig!==sig){st.dataset.sig=sig;st.innerHTML=`${ICON(ic,20)}<span>${esc(lab)}</span>`}
  st.dataset.wave=live&&S.playing?"on":"off"}
 const sk=$("hero-skip");if(sk)sk.hidden=state!=="wave";
 const tb=$("wv-tune");if(tb)tb.dataset.custom=String(waveCustom())}
function paintWaveUI(){paintHero();tunePaint()}

/* ── «Регулировка волны»: MD3 side sheet (bottom sheet on a phone) ── */
const TUNE={open:false,layer:null,back:null,t:0};
function tuneBuild(){
 let el=$("wvs");if(el)return el;
 el=document.createElement("div");
 el.id="wvs";el.className="wvs-wrap";el.hidden=true;el.dataset.open="false";
 el.innerHTML=`<div class="wvs-scrim" data-wvs-close></div>
  <aside class="wvs" role="dialog" aria-modal="true" aria-labelledby="wvs-t" tabindex="-1">
   <i class="wvs-handle" aria-hidden="true"></i>
   <header class="wvs-head">
    <div class="wvs-htxt"><h2 id="wvs-t"></h2><p class="wvs-sub" id="wvs-sub"></p></div>
    <button class="m3i" data-wvs-close id="wvs-x">${ICON("close",22)}</button>
   </header>
   <div class="wvs-body" id="wvs-body"></div>
   <footer class="wvs-foot">
    <button class="m3b m3b-outlined" id="wvs-reset">${ICON("restart_alt",18)}<span></span></button>
    <button class="m3b m3b-filled" id="wvs-go"><span></span></button>
   </footer>
  </aside>`;
 document.body.appendChild(el);
 el.addEventListener("click",e=>{
  if(e.target.closest("[data-wvs-close]")){tuneSet(false);return}
  const o=e.target.closest("[data-wvk]");if(o){setWaveOpt(o.dataset.wvk,o.dataset.wvv);return}
  if(e.target.closest("#wvs-reset")){waveReset();return}
  if(e.target.closest("#wvs-go")){const live=waveLive();tuneSet(false);if(!live)wave2Start()}});
 el.addEventListener("keydown",e=>{
  if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
  const li=e.target.closest?.(".wt-li");if(!li)return;
  const all=[...el.querySelectorAll(".wt-li")],i=all.indexOf(li)+(e.key==="ArrowDown"?1:-1);
  if(all[i]){e.preventDefault();all[i].focus()}});
 /* Bottom-sheet drag on a phone: pull the handle down to close. */
 const sheet=el.querySelector(".wvs");let drag=null;
 sheet.addEventListener("pointerdown",e=>{
  if(!matchMedia("(max-width:700px)").matches||!e.target.closest(".wvs-handle,.wvs-head")||e.target.closest("button"))return;
  drag={y0:e.clientY,id:e.pointerId,dy:0};try{sheet.setPointerCapture(e.pointerId)}catch(_){}});
 sheet.addEventListener("pointermove",e=>{if(!drag||drag.id!==e.pointerId)return;drag.dy=Math.max(0,e.clientY-drag.y0);sheet.style.transform=`translate3d(0,${drag.dy}px,0)`;sheet.style.transition="none"});
 const end=()=>{if(!drag)return;const dy=drag.dy;drag=null;sheet.style.transition="";sheet.style.transform="";if(dy>90)tuneSet(false)};
 sheet.addEventListener("pointerup",end);sheet.addEventListener("pointercancel",end);
 return el}
function tuneRows(){
 const w=waveCfg();
 const srcs=["auto","ym","ytm","sc","dz"].filter(id=>id==="auto"||srvOk(id));
 const row=(k,v,lead)=>{
  const sub=optSub(k,v);
  return `<button class="wt-li" role="radio" aria-checked="${w[k]===v}" data-wvk="${k}" data-wvv="${v}"${k==="mood"?` data-mood="${v}"`:""}>
   <span class="wt-lead">${lead}</span>
   <span class="wt-txt"><b>${esc(optName(k,v))}</b>${sub?`<small>${esc(sub)}</small>`:""}</span>
   <span class="wt-radio" aria-hidden="true"></span></button>`};
 const sec=(k,label,rows)=>`<section class="wt-sec"><h3 class="wt-h" id="wt-h-${k}">${esc(t(label))}</h3><div class="wt-list" role="radiogroup" aria-labelledby="wt-h-${k}">${rows}</div></section>`;
 return sec("src","wv.src",srcs.map(v=>row("src",v,v==="auto"?ICON("auto_awesome",22):`<span class="wt-svc">${SVC_ICONS[v]||ICON("music_note",18)}</span>`)).join(""))
  +sec("mood","wv.mood",WV_ROWS.mood.map(([v,ic])=>row("mood",v,ICON(ic,22))).join(""))
  +sec("div","wv.div",WV_ROWS.div.map(([v,ic])=>row("div",v,ICON(ic,22))).join(""))
  +sec("lang","wv.lang",WV_ROWS.lang.map(([v,ic])=>row("lang",v,ICON(ic,22))).join(""))}
function tuneNow(){
 const live=waveLive(),l=waveLine(),tags=waveTags();
 const src=live&&WV.src?WV.src:l.src;
 return `<div class="wt-now" data-live="${live&&!!S.playing}">
  <span class="wt-now-ic">${live?EQ_BARS:(src?`<span class="wt-svc">${SVC_ICONS[src]||""}</span>`:ICON("graphic_eq",22))}</span>
  <span class="wt-txt"><b>${esc(live?`${t("wv.live")} · ${svc(src).name}`:l.txt)}</b><small>${esc(tags.length?tags.join(" · "):t("wv.sheet.def"))}</small></span></div>`}
function tunePaint(){
 const el=$("wvs");if(!el||el.hidden)return;
 const body=$("wvs-body"),st=body.scrollTop;
 const f=document.activeElement?.closest?.("[data-wvk]");
 const fk=f?`[data-wvk="${f.dataset.wvk}"][data-wvv="${f.dataset.wvv}"]`:"";
 body.innerHTML=tuneNow()+tuneRows();body.scrollTop=st;
 if(fk)body.querySelector(fk)?.focus({preventScroll:true});
 $("wvs-t").textContent=t("wv.sheet");
 $("wvs-sub").textContent=t("wv.sheet.s");
 $("wvs-x").setAttribute("aria-label",t("snk.close"));$("wvs-x").title=t("snk.close");
 const rs=$("wvs-reset");rs.querySelector("span:last-child").textContent=t("wv.reset");rs.disabled=!waveCustom();
 $("wvs-go").querySelector("span").textContent=waveLive()?t("wv.done"):t("home.start")}
function tuneSet(open){
 const el=tuneBuild();open=!!open;
 if(open===TUNE.open)return;
 TUNE.open=open;clearTimeout(TUNE.t);
 $("wv-tune")?.setAttribute("aria-expanded",String(open));
 if(open){
  TUNE.back=document.activeElement;
  el.hidden=false;tunePaint();void el.offsetWidth;el.dataset.open="true";
  TUNE.layer={close:()=>tuneSet(false)};window.MW3?.layer.push(TUNE.layer);
  document.documentElement.dataset.wvs="open";
  requestAnimationFrame(()=>el.querySelector(".wvs")?.focus({preventScroll:true}))}
 else{
  el.dataset.open="false";window.MW3?.layer.drop(TUNE.layer);TUNE.layer=null;
  delete document.documentElement.dataset.wvs;
  TUNE.t=setTimeout(()=>{if(!TUNE.open)el.hidden=true},360);
  const b=TUNE.back;TUNE.back=null;if(b&&b.isConnected)try{b.focus({preventScroll:true})}catch(_){}}}
function setWaveOpt(k,v){
 const w=waveCfg();if(w[k]===v)return;
 w[k]=v;save();paintWaveUI();
 if(waveLive())waveRetune()}
function waveReset(){
 if(!waveCustom())return;
 Object.assign(waveCfg(),WV_DEF);save();paintWaveUI();
 if(waveLive())waveRetune()}

/* ═════════════════════ collections sheet ═════════════════════ */
const HS={svc:"",cache:new Map(),open:false,drag:null,wheel:0};
const CARDS=new Map(),SHELVES=new Map();let CARD_N=0,SHELF_N=0;
const KIND_IC={track:"music_note",album:"album",playlist:"queue_music",radio:"radio",chart:"leaderboard",browse:"explore",artist:"person"};
const KIND_N={ru:{album:"Альбом",playlist:"Плейлист",radio:"Радио",chart:"Чарт",browse:"Подборка",artist:"Артист",track:"Трек"},
 en:{album:"Album",playlist:"Playlist",radio:"Radio",chart:"Chart",browse:"Collection",artist:"Artist",track:"Track"}};
const kindName=k=>(KIND_N[LANG]||KIND_N.en)[k]||"";
const shortName=id=>({ym:LANG==="ru"?"Яндекс":"Yandex",ytm:"YouTube",sc:"SoundCloud",dz:"Deezer"})[id]||svc(id).name;
function trim(map,max){if(map.size<=max)return;let n=map.size-Math.floor(max*.75);for(const k of map.keys()){map.delete(k);if(--n<=0)break}}
function regCard(c,shelf){const k="c"+(++CARD_N);CARDS.set(k,{c,shelf});trim(CARDS,6000);return k}
function regShelf(sh){
 const k="s"+(++SHELF_N);
 SHELVES.set(k,{title:sh.title||"",s:sh.s||"",tracks:(sh.cards||[]).filter(c=>c&&c.kind==="track"&&c.track).map(c=>c.track)});
 trim(SHELVES,800);return k}
function hsServices(){return [...(ymReady()?["ym"]:[]),...["ytm","sc","dz"].filter(id=>svc(id).on)]}
function hsTabs(){
 const el=$("hs-tabs");if(!el)return;
 const list=hsServices();
 if(!list.includes(HS.svc))HS.svc=list[0]||"";
 const sig=list.join(",")+"|"+HS.svc+"|"+LANG;
 if(el.dataset.sig===sig)return;el.dataset.sig=sig;
 el.innerHTML=list.map(id=>`<button class="hs-tab" role="tab" data-hstab="${id}" aria-selected="${id===HS.svc}" title="${esc(svc(id).name)}">${SVC_ICONS[id]||""}<span>${esc(shortName(id))}</span></button>`).join("")}
async function hsShelves(id,force){
 const c=HS.cache.get(id);
 if(!force&&c&&Date.now()-c.at<20*60*1000)return c.shelves;
 if(c&&c.job&&!force)return c.job;
 const job=call("feeds_home",{service:id,lang:LANG}).then(sh=>{
  const shelves=Array.isArray(sh)?sh:[];HS.cache.set(id,{at:Date.now(),shelves});return shelves})
  .catch(e=>{HS.cache.delete(id);throw e});
 HS.cache.set(id,{at:0,shelves:[],job});
 return job}
const stateBox=(icon,title,sub,btns)=>`<div class="hs-state">${ICON(icon,24)}<b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:""}${btns||""}</div>`;
async function hsLoad(id,force){
 const body=$("hs-body");if(!body)return;
 if(!id){body.innerHTML=stateBox("cloud_off",t("hs.empty"),t("wv.none"));return}
 HS.svc=id;hsTabs();
 body.dataset.svc=id;
 const cached=HS.cache.get(id);
 if(!(cached&&cached.at&&!force))body.innerHTML=`<div class="hs-state is-load">${ICON("progress_activity",22)}<span>${esc(t("hs.load"))}</span></div>`;
 try{
  const shelves=await hsShelves(id,force);
  if(HS.svc!==id)return;
  body.innerHTML=shelvesHTML(shelves);icons();
 }catch(e){
  if(HS.svc!==id)return;
  const msg=errText(e);
  const tok=id==="ym"&&/не подключена|token|401|403/i.test(msg);
  body.innerHTML=stateBox("cloud_off",t("hs.err"),tok?t("hs.ymtok"):msg,
   `<span class="hs-state-act"><button class="btn" data-hsretry>${ICON("refresh",16)}<span>${esc(t("hs.retry"))}</span></button></span>`)}}
function shelvesHTML(shelves){
 const out=(shelves||[]).map(shelfHTML).filter(Boolean);
 return out.length?out.join(""):stateBox("inbox",t("hs.empty"))}
function shelfHTML(sh){
 const cards=(sh&&sh.cards||[]).filter(c=>c&&c.id&&c.t);
 if(!cards.length)return "";
 const k=regShelf(sh);
 const pills=cards.every(c=>c.kind==="browse"&&!c.art);
 const tracks=SHELVES.get(k).tracks.length;
 const head=`<div class="hs-head">${sh.title?`<h3>${esc(sh.title)}</h3>`:"<span></span>"}
  ${tracks?`<button class="ic sm hs-shplay" data-shplay="${k}" title="${esc(t("dv.play"))}" aria-label="${esc(t("dv.play"))}">${ICON("play_arrow",18)}</button>`:""}
  ${pills?"":`<span class="hs-nav"><button class="ic sm" data-hsscroll="-1" aria-label="prev">${ICON("chevron_left",18)}</button><button class="ic sm" data-hsscroll="1" aria-label="next">${ICON("chevron_right",18)}</button></span>`}</div>`;
 const inner=pills
  ?`<div class="hs-pills">${cards.map(c=>pillHTML(c,k)).join("")}</div>`
  :`<div class="hs-row">${cards.map(c=>cardHTML(c,k)).join("")}</div>`;
 return `<section class="hs-shelf${pills?" is-pills":""}">${sh.title||!pills?head:""}${inner}</section>`}
function cardHTML(c,sk){
 const k=regCard(c,sk);
 const art=c.art||c.track?.art||"";
 const cc=safeColor(c.color);
 const go=c.kind==="track"?"play_arrow":c.kind==="artist"?"person":"arrow_forward";
 return `<button class="hs-card${c.kind==="artist"?" is-artist":""}" data-card="${k}" data-kind="${esc(c.kind)}" title="${esc(c.t)}">`
  +`<span class="hs-art"${cc?` style="--cc:${cc}"`:""}>${ICON(KIND_IC[c.kind]||"library_music",28)}${img(art)}<i class="hs-go">${ICON(go,20)}</i></span>`
  +`<b>${esc(c.t)}</b>${c.sub?`<small>${esc(c.sub)}</small>`:`<small>${esc(kindName(c.kind))}</small>`}</button>`}
function pillHTML(c,sk){
 const k=regCard(c,sk),cc=safeColor(c.color);
 return `<button class="hs-pill" data-card="${k}"${cc?` style="--cc:${cc}"`:""}>${esc(c.t)}</button>`}
function onCard(k){
 const rec=CARDS.get(k);if(!rec)return;
 const {c,shelf}=rec;
 if(c.kind==="track"&&c.track){
  const sh=SHELVES.get(shelf);
  const list=sh&&sh.tracks.length?sh.tracks:[c.track];
  const key="x:sh:"+(shelf||k);
  xlistSet(key,sh?.title||t("hs.t"),list);
  setTrack(list.find(x=>sameTrack(x,c.track))||c.track,true,false,key);return}
 if(c.kind==="artist")return openArtistPage(c.t,{s:c.s,id:c.id,art:c.art});
 openCollection(c)}
function playShelf(k){
 const sh=SHELVES.get(k);if(!sh||!sh.tracks.length)return;
 const key="x:sh:"+k;xlistSet(key,sh.title||t("hs.t"),sh.tracks);
 setTrack(sh.tracks[0],true,false,key)}
function hsSet(open){
 const sh=$("hsheet");if(!sh)return;
 HS.open=!!open;HS.wheel=0;
 sh.dataset.open=String(HS.open);sh.style.removeProperty("--hs-y");
 $("hs-grip")?.setAttribute("aria-expanded",String(HS.open));
 if(HS.open)document.documentElement.dataset.hs="open";else delete document.documentElement.dataset.hs;
 if(HS.open){tuneSet(false);hsTabs();const b=$("hs-body");if(b&&b.dataset.svc!==HS.svc)hsLoad(HS.svc)}}
function hsTab(id){
 if(!id)return;
 HS.svc=id;hsTabs();
 if(!HS.open)hsSet(true);
 hsLoad(id)}
function hsInit(){
 const sh=$("hsheet"),grip=$("hs-grip"),home=$("v-home");if(!sh||!grip)return;
 grip.addEventListener("pointerdown",e=>{
  if(e.button!==0||e.target.closest(".hs-tab"))return;
  const h=sh.getBoundingClientRect().height,peek=grip.offsetHeight;
  HS.drag={y0:e.clientY,t0:performance.now(),base:HS.open?0:h-peek,max:Math.max(1,h-peek),y:HS.open?0:h-peek,moved:false,id:e.pointerId};
  try{grip.setPointerCapture(e.pointerId)}catch(_){}});
 grip.addEventListener("pointermove",e=>{
  const d=HS.drag;if(!d||d.id!==e.pointerId)return;
  const dy=e.clientY-d.y0;if(!d.moved&&Math.abs(dy)<6)return;
  d.moved=true;d.y=Math.max(0,Math.min(d.max,d.base+dy));
  sh.dataset.drag="1";sh.style.setProperty("--hs-y",d.y.toFixed(1)+"px")});
 const end=e=>{
  const d=HS.drag;HS.drag=null;if(!d)return;
  delete sh.dataset.drag;
  if(!d.moved){if(e.type==="pointerup")hsSet(!HS.open);return}
  const v=(e.clientY-d.y0)/Math.max(1,performance.now()-d.t0);
  hsSet(v<-.35?true:v>.35?false:d.y<d.max/2)};
 grip.addEventListener("pointerup",end);
 grip.addEventListener("pointercancel",end);
 grip.addEventListener("keydown",e=>{
  if(e.target!==grip)return;
  if(e.key==="Enter"||e.key===" "){e.preventDefault();hsSet(!HS.open)}});
 home?.addEventListener("wheel",e=>{
  if(e.ctrlKey||S.view!=="home")return;
  if(!HS.open){if(e.deltaY>8)hsSet(true);return}
  const body=$("hs-body");
  if(e.target.closest("#hs-body")){
   if(body.scrollTop<=0&&e.deltaY<0){HS.wheel+=e.deltaY;if(HS.wheel<-120)hsSet(false)}else HS.wheel=0;
   return}
  if(e.deltaY<0)hsSet(false)},{passive:true});
 /* Broken artwork falls back to the kind icon underneath. */
 for(const id of ["hs-body","dcbody"])$(id)?.addEventListener("error",e=>{if(e.target?.tagName==="IMG")e.target.remove()},true)}

/* ═════════════════ collection and artist pages ═════════════════ */
const DC={stack:[],from:"home"};
const dcTop=()=>DC.stack[DC.stack.length-1]||null;
function dcGo(st){
 if(S.view!=="discover"){DC.from=S.view||"home";DC.stack=[]}
 DC.stack.push(st);if(DC.stack.length>30)DC.stack.shift();
 if(typeof fp!=="undefined"&&fp.dataset.open==="true"&&typeof closeFP==="function")closeFP();
 go("discover");
 const v=$("v-discover");if(v)v.scrollTop=0;
 dcRender()}
function dcBack(){
 DC.stack.pop();
 if(!DC.stack.length){go(DC.from&&DC.from!=="discover"?DC.from:"home");return}
 dcRender();const v=$("v-discover");if(v)v.scrollTop=0}
function dcRender(){
 const st=dcTop(),body=$("dcbody");if(!st||!body)return;
 body.innerHTML=st.type==="artist"?artistHTML(st):colHTML(st);
 icons()}
const backBtn=()=>`<button class="btn dc-back" data-dcback>${ICON("arrow_back",16)}<span>${esc(t("dv.back"))}</span></button>`;
const loadingBox=()=>`<div class="hs-state is-load">${ICON("progress_activity",22)}<span>${esc(t("dv.load"))}</span></div>`;
const errBox=msg=>stateBox("error",t("dv.err"),msg,`<span class="hs-state-act"><button class="btn" data-dcretry>${ICON("refresh",16)}<span>${esc(t("hs.retry"))}</span></button></span>`);
const sec=(title,inner,nav)=>`<section class="dc-sec hs-shelf"><div class="hs-head"><h3>${esc(title)}</h3>${nav?`<span class="hs-nav"><button class="ic sm" data-hsscroll="-1" aria-label="prev">${ICON("chevron_left",18)}</button><button class="ic sm" data-hsscroll="1" aria-label="next">${ICON("chevron_right",18)}</button></span>`:""}</div>${inner}</section>`;
async function openCollection(c){
 if(!c)return;
 const st={type:"col",c,data:null,err:null,key:`x:col:${c.s}:${c.kind}:${c.id}`};
 dcGo(st);
 await colLoad(st)}
async function colLoad(st){
 const c=st.c;st.err=null;
 try{
  let d;
  if(c.s==="sp"){
   const r=await call("spotify_public_playlist_tracks",{urlOrId:`spotify:${c.kind==="album"?"album":"playlist"}:${c.id}`});
   d={title:c.t,tracks:(r||[]).map(x=>({...x,art:x.art||c.art||null,al:x.al||(c.kind==="album"?c.t:"")})),shelves:[]}}
  else d=await call("feeds_open",{service:c.s,kind:c.kind,id:String(c.id),lang:LANG});
  st.data={title:d?.title||c.t||"",tracks:(d?.tracks||[]).filter(x=>x&&x.id),shelves:Array.isArray(d?.shelves)?d.shelves:[]};
  if(st.data.tracks.length)xlistSet(st.key,st.data.title||c.t||t("hs.t"),st.data.tracks);
 }catch(e){st.err=errText(e)}
 if(dcTop()===st)dcRender()}
function colHTML(st){
 const c=st.c,d=st.data;
 const art=c.art||d?.tracks?.find(x=>x.art)?.art||"";
 const n=d?.tracks?.length||0;
 const bg=cssUrl(art);
 let html=`<header class="dc-head">${bg?`<div class="dc-head-bg" style="background-image:url('${bg}')" aria-hidden="true"></div>`:""}${backBtn()}
  <div class="dc-head-in">
   <span class="dc-cover">${ICON(KIND_IC[c.kind]||"library_music",44)}${img(art)}</span>
   <div class="dc-meta">
    <small class="dc-kind">${SVC_ICONS[c.s]||""}<span>${esc(svc(c.s).name)}${kindName(c.kind)?" · "+esc(kindName(c.kind)):""}</span></small>
    <h1>${esc(d?.title||c.t||"")}</h1>
    ${c.sub?`<p>${esc(c.sub)}</p>`:""}
    ${n?`<span class="dc-count">${n} ${esc(t("tracks"))}</span>`:""}
    ${n?`<div class="dc-actions"><button class="primary" data-dcplay>${ICON("play_arrow",18)}<span>${esc(t("dv.play"))}</span></button>`
     +`<button class="btn" data-dcshuffle>${ICON("shuffle",17)}<span>${esc(t("dv.shuffle"))}</span></button>`
     +`<button class="btn" data-dcsave>${ICON("library_add",17)}<span>${esc(t("dv.save"))}</span></button></div>`:""}
   </div></div></header>`;
 if(st.err)return html+errBox(st.err);
 if(!d)return html+loadingBox();
 const rows=n?`<div class="rows dc-rows" data-listctx="${esc(st.key)}">${d.tracks.map(x=>row(x)).join("")}</div>`:"";
 const shelves=d.shelves.length?`<div class="dc-shelves">${d.shelves.map(shelfHTML).join("")}</div>`:"";
 return html+(rows||shelves?rows+shelves:stateBox("inbox",t("hs.empty")))}
function libArtist(name){
 const f=MWM.fold(name).trim();if(!f)return null;
 return artistList().find(a=>MWM.fold(a.name).trim()===f)||null}
async function openArtistPage(name,hint){
 const nm=String(name||"").trim();if(!nm)return;
 if(!TAURI)return legacyOpenArtist(nm);
 /* Only "A, B" and "A feat. B" are split: "Simon & Garfunkel" and "AC/DC"
    are one artist each. */
 const primary=nm.split(/\s*,\s*|\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0].trim()||nm;
 const st={type:"artist",name:primary,hint:hint||{},data:null,err:null,key:"x:ar:"+MWM.fold(primary).trim()};
 dcGo(st);
 await artistLoad(st)}
async function artistLoad(st){
 st.err=null;
 try{
  const h=st.hint||{};
  const d=await call("artist_profile",{name:st.name,spId:h.s==="sp"&&h.id?String(h.id):null});
  if(!d||!d.name)throw new Error(t("hs.empty"));
  st.data=d;
  const top=(d.top||[]).filter(x=>x&&x.id).map(x=>({...x,a:x.a||d.name}));
  if(top.length)xlistSet(st.key,d.name,top);
 }catch(e){st.err=errText(e)}
 if(dcTop()===st)dcRender()}
function artistHTML(st){
 const d=st.data||{},h=st.hint||{};
 const name=d.name||st.name;
 const cover=d.header||d.avatar||h.art||"";
 const ava=d.avatar||h.art||"";
 const color=safeColor(d.color);
 const fav=FAV_ARTISTS.includes(name)||FAV_ARTISTS.includes(st.name);
 const stats=[d.monthly?fill("dv.monthly",{n:nfmt(d.monthly)}):"",
  !d.monthly&&d.followers?fill("dv.followers",{n:nfmt(d.followers)}):"",
  d.rank?fill("dv.rank",{n:d.rank}):""].filter(Boolean).join(" · ");
 let html=`<div class="dc-artist"${color?` style="--ac:${color}"`:""}>
  <header class="dc-hero${d.header?" has-header":""}">
   <div class="dc-hero-img" aria-hidden="true">${img(cover)}</div>
   <div class="dc-hero-fade" aria-hidden="true"></div>
   ${backBtn()}
   <div class="dc-hero-in">
    ${ava?`<span class="dc-ava">${img(ava)}</span>`:""}
    <div class="dc-hero-txt">
     ${d.verified?`<span class="dc-verified">${ICON("verified",17)}<span>${esc(t("dv.verified"))}</span></span>`:""}
     <h1>${esc(name)}</h1>
     ${stats?`<span class="dc-stats">${esc(stats)}</span>`:""}
    </div></div></header>`;
 if(!st.data&&!st.err)return html+loadingBox()+`</div>`;
 const top=listFor(st.key)||[];
 html+=`<div class="dc-actions dc-bar">`
  +(top.length?`<button class="primary" data-dcplay>${ICON("play_arrow",18)}<span>${esc(t("dv.play"))}</span></button>`
   +`<button class="btn" data-dcshuffle>${ICON("shuffle",17)}<span>${esc(t("dv.shuffle"))}</span></button>`:"")
  +`<button class="btn" data-dcradio>${ICON("radio",17)}<span>${esc(t("dv.radio"))}</span></button>`
  +`<button class="btn${fav?" on":""}" data-dcfollow aria-pressed="${fav}">${ICON("favorite",17)}<span>${esc(t(fav?"dv.following":"dv.follow"))}</span></button>`
  +`</div>`;
 if(top.length)html+=sec(t("dv.top"),`<div class="rows dc-rows dc-top" data-listctx="${esc(st.key)}">${top.slice(0,10).map(x=>row(x,x.plays?fill("dv.plays",{n:nfmt(x.plays)}):"")).join("")}</div>`);
 const rel=(arr,title)=>Array.isArray(arr)&&arr.length?sec(title,`<div class="hs-row">${arr.filter(c=>c&&c.id).map(c=>cardHTML({kind:c.kind||"album",s:c.s||d.source||"sp",id:String(c.id),t:c.t||"",sub:c.sub||"",art:c.art||null},null)).join("")}</div>`,true):"";
 html+=rel(d.popular,t("dv.popular"))+rel(d.albums,t("dv.albums"))+rel(d.singles,t("dv.singles"));
 const related=(d.related||[]).filter(r=>r&&r.name);
 if(related.length)html+=sec(t("dv.related"),`<div class="hs-row">${related.map(r=>cardHTML({kind:"artist",s:d.source==="sp"?"sp":"dz",id:String(r.id||""),t:r.name,sub:"",art:r.art||null},null)).join("")}</div>`,true);
 const bio=String(d.bio||"").replace(/<[^>]+>/g,"").replace(/\s+\n/g,"\n").trim();
 const cities=(d.cities||[]).filter(c=>c&&c.city).slice(0,5);
 const gal=(d.gallery||[]).filter(Boolean).slice(0,10);
 if(bio||cities.length||gal.length)html+=sec(t("dv.about"),`<div class="dc-about">`
  +(bio?`<div class="dc-biobox"><p class="dc-bio" data-clamp="${bio.length>420?1:0}">${esc(bio)}</p>${bio.length>420?`<button class="btn ghost sm" data-dcbio>${esc(t("dv.more"))}</button>`:""}</div>`:"")
  +(cities.length?`<div class="dc-cities"><b>${esc(t("dv.cities"))}</b>${cities.map(c=>`<span><em>${esc([c.city,c.country].filter(Boolean).join(", "))}</em><i>${nfmt(c.n)}</i></span>`).join("")}</div>`:"")
  +`</div>`+(gal.length?`<div class="dc-gallery">${gal.map(u=>`<span class="dc-gi">${img(u)}</span>`).join("")}</div>`:""));
 const lib=libArtist(name)||libArtist(st.name);
 if(lib)html+=sec(t("dv.lib"),`<div class="rows dc-rows" data-listctx="art:${esc(lib.name)}">${lib.list.slice(0,30).map(x=>row(x)).join("")}</div>`);
 if(st.err&&!st.data)html+=errBox(st.err);
 if(st.data)html+=`<small class="dc-src">${esc(fill("dv.src",{s:d.source==="dz"?"Deezer":"Spotify"}))}</small>`;
 return html+`</div>`}
function dcPlay(shuf){
 const st=dcTop();if(!st)return;
 const list=listFor(st.key)||[];if(!list.length)return;
 if(shuf&&!S.shuffle)setShuffle(true);
 const first=shuf?pick(list):list[0];
 setTrack(first,true,false,st.key)}
function dcSave(){
 const st=dcTop();if(!st||st.type!=="col")return;
 const list=listFor(st.key)||[];if(!list.length)return;
 importRows(list.map(x=>({...x})),null,st.data?.title||st.c.t||"Meowave",false)}
async function artistRadio(st){
 const top=(listFor(st.key)||[])[0];
 toast(t("dv.load"),1800);
 let list=[];
 try{
  if(top){
   let seed=top;
   if(top.s==="sp"){const rec=await sprResolve(top);if(rec)seed={...top,s:rec.s,id:rec.id}}
   if(seed.s!=="sp")list=await radioOn(seed.s,seed.id)}
  if(!list.length)list=await searchRemote(`${st.name} radio`);
 }catch(_){}
 list=(list||[]).filter(x=>x&&!isDisliked(x)&&playOn(x.s));
 if(!list.length){toast(t("dv.err"));return}
 const key="x:arr:"+MWM.fold(st.name).trim();
 xlistSet(key,`${t("dv.radio")} · ${st.data?.name||st.name}`,list);
 setTrack(list[0],true,false,key)}
function dcFollow(btn){
 const st=dcTop();if(!st||st.type!=="artist")return;
 const name=st.data?.name||st.name;
 const was=FAV_ARTISTS.includes(name)||FAV_ARTISTS.includes(st.name);
 if(was){if(FAV_ARTISTS.includes(name))toggleFavArtist(name);if(st.name!==name&&FAV_ARTISTS.includes(st.name))toggleFavArtist(st.name)}
 else toggleFavArtist(name);
 const on=!was;
 btn.classList.toggle("on",on);btn.setAttribute("aria-pressed",String(on));
 const s=btn.querySelector("span:last-child");if(s)s.textContent=t(on?"dv.following":"dv.follow");
 waveHint()}
function dcRetry(){
 const st=dcTop();if(!st)return;
 st.err=null;st.data=null;dcRender();
 (st.type==="artist"?artistLoad(st):colLoad(st))}

/* The library and the player keep calling openArtist(); in the desktop app it
   now opens the full artist page, the library list stays a click away. */
const legacyOpenArtist=window.openArtist;
window.openArtist=function(name){
 if(!name)return;
 if(!TAURI)return legacyOpenArtist(name);
 openArtistPage(name)};
const legacyRenderArtist=window.renderArtist;
window.renderArtist=function(name){
 legacyRenderArtist(name);
 if(!TAURI)return;
 const h=document.querySelector("#libbody .plhead");
 if(h&&!h.querySelector("[data-artpage]")){
  const b=document.createElement("button");b.className="btn";b.dataset.artpage=name;
  b.innerHTML=ICON("person",16)+" "+esc(t("dv.about"));h.appendChild(b)}};

/* ═══════════════════ links: drag & drop, paste ═══════════════════ */
const LINK_RE=/^(https?:\/\/[^\s]+|spotify:[a-z]+:[A-Za-z0-9]+)$/i;
const MUSIC_HOST=/^(https?:\/\/)?([a-z0-9-]+\.)*(music\.youtube\.com|youtube\.com|youtu\.be|open\.spotify\.com|spotify\.link|music\.yandex\.(ru|com|by|kz|uz)|soundcloud\.com|on\.soundcloud\.com|deezer\.com|deezer\.page\.link|link\.deezer\.com)\b/i;
async function openLink(url){
 const u=String(url||"").trim();
 if(!LINK_RE.test(u)){toast(t("drop.bad"));return}
 if(!TAURI){toast(t("dc.desktop"));return}
 toast(t("drop.busy"),2600);
 try{
  const r=await inv("link_resolve",{url:u});
  const list=(r?.tracks||[]).filter(x=>x&&x.id);
  if(!list.length)throw new Error(t("hs.empty"));
  const key="x:link:"+(r.service||"")+":"+String(list[0].id)+":"+list.length;
  xlistSet(key,r.title||list[0].t||"Link",list);
  await setTrack(list[0],true,false,key);
  toast(list.length>1?fill("drop.list",{n:r.title||list[0].al||"",c:list.length}):fill("drop.one",{n:`${list[0].a||""} — ${list[0].t||""}`}));
 }catch(e){toast(t("drop.bad")+": "+errText(e),5200)}}
const AUDIO_EXT=/\.(mp3|flac|wav|ogg|oga|m4a|aac|opus)$/i,IMG_EXT=/\.(png|jpe?g|gif|webp|avif|bmp)$/i,VID_EXT=/\.(mp4|webm|mov|m4v)$/i;
async function dropFiles(files){
 const audio=files.filter(f=>/^audio\//.test(f.type)||AUDIO_EXT.test(f.name));
 if(audio.length){
  const added=audio.map(f=>{
   const base=f.name.replace(/\.[^/.]+$/,"");
   const p=base.includes(" - ")?base.split(" - "):null;
   return {id:"loc_blob_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),t:(p?p.slice(1).join(" - "):base).trim()||"Unknown",
    a:(p?p[0]:"—").trim()||"—",al:"Local Files",s:"local",mode:"local",url:URL.createObjectURL(f),blob:f}});
  mergeLocal(added);
  setTrack(added[0],true,false,"loc");
  return}
 const pic=files.find(f=>/^(image|video)\//.test(f.type)||IMG_EXT.test(f.name)||VID_EXT.test(f.name));
 const W=window.MWFX?.wall;
 if(pic&&W){
  if(await W.setFile(pic)){W.settings.wallApp=true;W.save();W.render();wallUI();toast(t("wall.set"))}
  return}
 toast(t("drop.bad"))}
function dndInit(){
 const zone=$("dropzone");if(!zone)return;
 let depth=0,internal=false,hideT=0;
 const kinds=e=>[...(e.dataTransfer?.types||[])];
 const field=e=>e.target instanceof Element&&!!e.target.closest("input,textarea,[contenteditable]");
 const wanted=e=>!internal&&!field(e)&&kinds(e).some(k=>k==="Files"||k==="text/uri-list"||k==="text/plain");
 const show=()=>{clearTimeout(hideT);if(zone.hidden){zone.hidden=false;requestAnimationFrame(()=>{zone.dataset.on="true"})}};
 const hide=()=>{clearTimeout(hideT);depth=0;zone.dataset.on="false";hideT=setTimeout(()=>{zone.hidden=true},180)};
 document.addEventListener("dragstart",()=>{internal=true},true);
 document.addEventListener("dragend",()=>{internal=false;hide()},true);
 addEventListener("dragenter",e=>{if(!wanted(e))return;e.preventDefault();depth++;show()});
 addEventListener("dragover",e=>{
  if(!wanted(e))return;e.preventDefault();
  if(e.dataTransfer)e.dataTransfer.dropEffect="copy";
  show();clearTimeout(zone._t);zone._t=setTimeout(hide,600)});
 addEventListener("dragleave",e=>{if(!wanted(e))return;depth=Math.max(0,depth-1);if(!depth)hide()});
 addEventListener("drop",e=>{
  if(internal){internal=false;return}
  if(!kinds(e).length||field(e))return;
  e.preventDefault();hide();
  const dt=e.dataTransfer;if(!dt)return;
  const files=[...(dt.files||[])];
  if(files.length){dropFiles(files);return}
  const txt=dt.getData("text/uri-list")||dt.getData("text/plain")||"";
  const url=txt.split(/\r?\n/).map(s=>s.trim()).find(s=>s&&!s.startsWith("#")&&LINK_RE.test(s))||"";
  if(url)openLink(url);else toast(t("drop.bad"))});
 /* Ctrl+V of a music link anywhere outside a text field plays it. */
 document.addEventListener("paste",e=>{
  const tg=e.target;
  if(tg instanceof Element&&tg.closest("input,textarea,select,[contenteditable],[contenteditable=true]"))return;
  const s=(e.clipboardData?.getData("text")||"").trim();
  if(!s||!LINK_RE.test(s)||!(MUSIC_HOST.test(s)||/^spotify:/i.test(s)))return;
  e.preventDefault();openLink(s)})}

/* ═══════════════════ wallpaper + cover settings ═══════════════════ */
function wallUI(){
 const W=window.MWFX?.wall;if(!W)return;
 const st=W.settings;
 const sw=$("wall-app");if(sw){sw.setAttribute("aria-pressed",String(!!st.wallApp));sw.classList.toggle("on",!!st.wallApp)}
 const box=$("wall-app-box");if(box)box.dataset.on=String(!!st.wallApp);
 const nm=$("wall-app-name");if(nm){nm.textContent=W.has()?(W.name()||t("wall.set")):t("wall.none");nm.title=nm.textContent}
 const clr=$("wall-app-clear");if(clr)clr.disabled=!W.has();
 const rng=(id,v,suf)=>{const r=$(id);if(r){if(+r.value!==+v)r.value=v;paintRange(r)}const o=$(id+"-v");if(o)o.textContent=v+suf};
 rng("wall-app-dim",st.wallAppDim??55,"%");
 rng("wall-app-blur",st.wallAppBlur??0,"px");
 const cf=$("cov-follow");if(cf){const on=st.coverFollow!==false;cf.setAttribute("aria-pressed",String(on));cf.classList.toggle("on",on)}}
function wallInit(){
 const W=window.MWFX?.wall;if(!W)return;
 const st=W.settings;
 const on=(id,ev,fn)=>$(id)?.addEventListener(ev,fn);
 on("wall-app","click",async()=>{
  if(!st.wallApp&&!W.has()){const ok=await W.pick();if(!ok){wallUI();return}}
  st.wallApp=!st.wallApp;W.save();W.render();wallUI()});
 on("wall-app-pick","click",async()=>{if(await W.pick()){st.wallApp=true;W.save();W.render()}wallUI()});
 on("wall-app-url","click",async()=>{
  const inp=$("modal-input"),ml=inp?inp.maxLength:60;
  if(inp)inp.maxLength=2048;
  let u=null;
  try{u=await askText(t("dlg.wall.t"),W.isLink()?st.wallLink:"",{icon:"wallpaper",label:t("dlg.link"),placeholder:"https://…",sub:t("wall.url.ask"),required:true,max:2048})}finally{if(inp)inp.maxLength=ml>0?ml:60}
  if(u==null||!String(u).trim())return;
  if(!(await W.setUrl(u))){toast(t("wall.url.bad"));return}
  st.wallApp=true;W.save();W.render();wallUI();toast(t("wall.set"))});
 on("wall-app-clear","click",async()=>{
  await W.clear();st.wallApp=false;W.save();W.render();
  if(S.fpBgMode==="wallpaper"){S.fpBgMode="dynamic";try{applyFPSettings()}catch(_){}save()}
  wallUI()});
 on("wall-app-dim","input",e=>{st.wallAppDim=+e.target.value;W.save();W.render();wallUI()});
 on("wall-app-blur","input",e=>{st.wallAppBlur=+e.target.value;W.save();W.render();wallUI()});
 on("cov-follow","click",()=>{window.MWFX?.cover?.follow?.(!(st.coverFollow!==false));wallUI()});
 addEventListener("mw:wall",wallUI);
 wallUI()}

/* ═══════════════════════ events + boot ═══════════════════════ */
document.addEventListener("click",e=>{
 const tg=e.target;if(!(tg instanceof Element))return;
 const card=tg.closest("[data-card]");if(card){e.preventDefault();onCard(card.dataset.card);return}
 const sp=tg.closest("[data-shplay]");if(sp){playShelf(sp.dataset.shplay);return}
 const sc=tg.closest("[data-hsscroll]");
 if(sc){
  const rowEl=sc.closest(".hs-shelf")?.querySelector(".hs-row");
  if(rowEl)rowEl.scrollBy({left:(+sc.dataset.hsscroll||1)*rowEl.clientWidth*.85,behavior:RM?"auto":"smooth"});
  return}
 const tab=tg.closest("[data-hstab]");if(tab){hsTab(tab.dataset.hstab);return}
 if(tg.closest("[data-hsretry]")){hsLoad(HS.svc,true);return}
 if(tg.closest("[data-dcback]")){dcBack();return}
 if(tg.closest("[data-dcplay]")){dcPlay(false);return}
 if(tg.closest("[data-dcshuffle]")){dcPlay(true);return}
 if(tg.closest("[data-dcsave]")){dcSave();return}
 if(tg.closest("[data-dcretry]")){dcRetry();return}
 if(tg.closest("[data-dcradio]")){const st=dcTop();if(st&&st.type==="artist")artistRadio(st);return}
 const fol=tg.closest("[data-dcfollow]");if(fol){dcFollow(fol);return}
 const bio=tg.closest("[data-dcbio]");
 if(bio){const p=bio.parentElement?.querySelector(".dc-bio");if(p){const open=p.dataset.clamp==="1";p.dataset.clamp=open?"0":"1";bio.textContent=open?"–":t("dv.more")}return}
 const ap=tg.closest("[data-artpage]");if(ap){openArtistPage(ap.dataset.artpage);return}
 if(tg.closest("#wv-tune")){tuneSet(!TUNE.open);return}
 if(tg.closest("#hero-skip")){next(true);return}});
document.addEventListener("keydown",e=>{
 if(e.key!=="Escape"||e.defaultPrevented)return;
 if(TUNE.open){tuneSet(false);return}
 if(HS.open&&S.view==="home"&&fp.dataset.open!=="true"&&!(typeof settingsIsOpen==="function"&&settingsIsOpen()))hsSet(false)});

/* Services connect late (the keychain answers after boot) and the language
   can change: the sheet tabs, the wave caption and an open page follow. */
function refreshAll(){
 hsTabs();paintWaveUI();
 if(HS.open){const b=$("hs-body");if(b&&b.dataset.svc!==HS.svc)hsLoad(HS.svc)}}
const legacyRenderSrv=window.renderSrv;
if(typeof legacyRenderSrv==="function")window.renderSrv=function(){const r=legacyRenderSrv.apply(this,arguments);try{refreshAll()}catch(_){}return r};
const legacyI18n=window.applyI18n;
if(typeof legacyI18n==="function")window.applyI18n=function(){
 const r=legacyI18n.apply(this,arguments);
 try{
  const hero=$("hero");if(hero)hero.dataset.key="";
  HS.cache.clear();const b=$("hs-body");if(b)b.dataset.svc="";
  refreshAll();
  if(S.view==="discover")dcRender();
 }catch(_){}
 return r};

/* An account signed in or out: its tab of the sheet is read again. */
window.hsForget=id=>{
 if(id)HS.cache.delete(id);else HS.cache.clear();
 const b=$("hs-body");if(b&&(!id||b.dataset.svc===id))b.dataset.svc="";
 try{refreshAll()}catch(_){}};
function init(){
 waveCfg();paintWaveUI();hsTabs();hsInit();wallInit();dndInit();
 window.renderWaveHint=waveHint;window.paintHero=paintHero;
 /* While the wave plays, the hero's main button pauses it rather than
    building a new one from scratch. */
 const st=$("start");if(st)st.onclick=()=>{if(waveLive())toggle();else startWave()};
 /* Ready before the user pulls the sheet up. */
 setTimeout(refreshAll,1600);
 setTimeout(()=>{refreshAll();if(TAURI&&HS.svc&&!HS.cache.has(HS.svc))hsShelves(HS.svc).catch(()=>{})},4200)}

Object.assign(window,{tuneSet,wave2Start,wave2Extend,waveNoteStart,waveNoteEnd,openArtistPage,openCollection,openLink,
 MWDISC:{WV,HS,DC,waveCfg,waveSource,hsLoad,hsSet,dcRender,shelvesHTML,mixBatch,waveFilter}});
init();
})();
