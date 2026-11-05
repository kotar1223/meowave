/* chatplus.js — chats, round 8 (Beta 3.2).
   · sounds for new messages: seven built-in ones synthesised with WebAudio
     (no files), your own audio file, volume, a quieter tick while the chat is
     open, a send sound, «do not disturb» and muting a single chat;
   · send any track, not only the one playing: now playing, favourites,
     recent, playlists and a search across services; and «Send to a chat»
     from any track's menu;
   · photos at full size and GIFs that move: the file is encrypted here
     (AES-256-GCM, a fresh key per file), uploaded to the chat-media bucket
     as ciphertext (migration 17), and the key travels inside the message —
     which is itself end-to-end sealed. Old clients still see the preview;
   · an image viewer that zooms (wheel, pinch, double click, + / − / 0),
     pans and saves;
   · more control over a message: forward, save image, play / queue /
     favourite a shared track, «delete for me», copy.
   Loaded after messenger.js; uses its globals (MS, msPost, msSend, msConvNew,
   msLoadThreads, msPaintList, msName, msLoadFriends, msEnsurePeers) and
   app.js's (S, t, esc, toast, inv, TAURI, sb, sbUser, coverStyle, setTrack,
   queueNext, queueLast, searchRemote, stripTrack, TRACKS, HISTORY, PLAYLISTS). */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const IC=(n,s)=>`<span class="material-symbols-rounded" aria-hidden="true"${s?` style="font-size:${s}px"`:""}>${n}</span>`;
const tf=(k,v)=>{let s=t(k);for(const [a,b] of Object.entries(v||{}))s=s.split(`{${a}}`).join(String(b));return s};
const RU=()=>LANG==="ru";

Object.assign(I18N.ru,{
 "cs.t":"Настройки чатов","cs.snd":"Звук новых сообщений","cs.snd.s":"Играет, когда приходит сообщение, а чат не открыт",
 "cs.kind":"Звук","cs.vol":"Громкость","cs.open":"Тихий звук в открытом чате","cs.open.s":"Короткий щелчок, когда собеседник пишет в открытый чат",
 "cs.send":"Звук отправки","cs.dnd":"Не беспокоить","cs.dnd.s":"Без звуков и всплывающих уведомлений — счётчик непрочитанных остаётся",
 "cs.own":"Свой звук…","cs.own.s":"Файл до 400 КБ: mp3, ogg, wav, m4a","cs.own.big":"Файл больше 400 КБ — выберите короче",
 "cs.own.bad":"Не удалось прочитать звук","cs.try":"Прослушать","cs.look":"Цвета, скругление, ширина ленты — Настройки → Вид → Конструктор → Чаты",
 "cs.mute":"Без звука для этого чата","cs.unmute":"Включить звук для этого чата","cs.muted":"Звук этого чата выключен","cs.unmuted":"Звук этого чата включён",
 "snd.drop":"Капля","snd.bell":"Колокольчик","snd.meow":"Мяу","snd.pop":"Поп","snd.glass":"Стекло","snd.duo":"Два тона","snd.soft":"Тихий","snd.own":"Свой",
 "tp.t":"Отправить трек","tp.now":"Сейчас","tp.fav":"Избранное","tp.rec":"Недавние","tp.pl":"Плейлисты","tp.find":"Поиск",
 "tp.q":"Найти трек — в библиотеке и на площадках","tp.none":"Здесь пока пусто","tp.searching":"Ищем…","tp.nothing":"Ничего не нашлось",
 "tp.queue":"Дальше в очереди","tp.playing":"Играет сейчас","tp.pick":"Выберите плейлист",
 "sh.t":"Отправить в чат","sh.to":"Кому отправить","sh.sent":"Отправлено: {name}","sh.none":"Пока не с кем переписываться — добавьте друзей",
 "ctx.share":"Отправить в чат","ms.fwd":"Переслать","ms.fwd.t":"Переслать сообщение","ms.fwd.done":"Переслано: {name}","ms.save":"Сохранить изображение",
 "ms.hide":"Удалить у меня","ms.hidden":"Сообщение скрыто у вас","ms.qnext":"Играть следующим","ms.qlast":"В конец очереди",
 "ms.fav":"В избранное","ms.faved":"Добавлено в избранное","ms.more":"Ещё",
 "mv.in":"Приблизить","mv.out":"Отдалить","mv.fit":"По размеру окна","mv.save":"Сохранить","mv.close":"Закрыть",
 "md.up":"Отправляем…","md.big":"Файл больше 10 МБ","md.nobucket":"GIF и фото в полном размере появятся после миграции 17 (supabase/FULL_SCHEMA.sql) — отправлено превью",
 "md.fail":"Не удалось загрузить файл","md.load":"Не удалось открыть файл"
});
Object.assign(I18N.en,{
 "cs.t":"Chat settings","cs.snd":"New message sound","cs.snd.s":"Plays when a message arrives and the chat is not open",
 "cs.kind":"Sound","cs.vol":"Volume","cs.open":"Quiet sound in the open chat","cs.open.s":"A short tick when the other person writes into the open chat",
 "cs.send":"Send sound","cs.dnd":"Do not disturb","cs.dnd.s":"No sounds or pop-ups — the unread counter stays",
 "cs.own":"Your own sound…","cs.own.s":"A file up to 400 KB: mp3, ogg, wav, m4a","cs.own.big":"The file is over 400 KB — pick a shorter one",
 "cs.own.bad":"Could not read the sound","cs.try":"Preview","cs.look":"Colours, corners and log width — Settings → Look → Interface builder → Chats",
 "cs.mute":"Mute this chat","cs.unmute":"Unmute this chat","cs.muted":"This chat is muted","cs.unmuted":"This chat is unmuted",
 "snd.drop":"Drop","snd.bell":"Bell","snd.meow":"Meow","snd.pop":"Pop","snd.glass":"Glass","snd.duo":"Two tones","snd.soft":"Soft","snd.own":"Your own",
 "tp.t":"Send a track","tp.now":"Now","tp.fav":"Favourites","tp.rec":"Recent","tp.pl":"Playlists","tp.find":"Search",
 "tp.q":"Find a track — in your library and on the services","tp.none":"Nothing here yet","tp.searching":"Searching…","tp.nothing":"Nothing found",
 "tp.queue":"Up next","tp.playing":"Playing now","tp.pick":"Pick a playlist",
 "sh.t":"Send to a chat","sh.to":"Send to","sh.sent":"Sent: {name}","sh.none":"Nobody to message yet — add friends",
 "ctx.share":"Send to a chat","ms.fwd":"Forward","ms.fwd.t":"Forward message","ms.fwd.done":"Forwarded: {name}","ms.save":"Save image",
 "ms.hide":"Delete for me","ms.hidden":"The message is hidden for you","ms.qnext":"Play next","ms.qlast":"Add to queue",
 "ms.fav":"Add to favourites","ms.faved":"Added to favourites","ms.more":"More",
 "mv.in":"Zoom in","mv.out":"Zoom out","mv.fit":"Fit to window","mv.save":"Save","mv.close":"Close",
 "md.up":"Sending…","md.big":"The file is over 10 MB","md.nobucket":"GIFs and full-size photos arrive with migration 17 (supabase/FULL_SCHEMA.sql) — a preview was sent",
 "md.fail":"Could not upload the file","md.load":"Could not open the file"
});

/* ══════════════ settings ══════════════ */
const CK="mw.chat",OWN="mw.chat.own";
const DEF={on:true,kind:"drop",vol:70,open:true,send:false,dnd:false,mute:[]};
let CFG={...DEF};
try{CFG={...DEF,...JSON.parse(localStorage.getItem(CK)||"{}")}}catch(_){}
if(!Array.isArray(CFG.mute))CFG.mute=[];
const cfgSave=()=>{try{localStorage.setItem(CK,JSON.stringify(CFG))}catch(_){}};

/* ══════════════ sounds ══════════════
   A context of their own: a notification must not go through the music's
   equaliser, speed or HRTF, and it has to play while the music is paused. */
let AC=null,OWNBUF=null,OWNSRC=null;
function ac(){
 if(!AC){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;
  try{AC=new C({latencyHint:"interactive"})}catch(_){AC=new C()}}
 if(AC.state==="suspended")AC.resume().catch(()=>{});
 return AC}
function tone(c,out,{type="sine",f0,f1,t0,dur,att=.004,peak=.8}){
 const o=c.createOscillator(),g=c.createGain();
 o.type=type;o.frequency.setValueAtTime(f0,t0);
 if(f1)o.frequency.exponentialRampToValueAtTime(f1,t0+dur*.9);
 g.gain.setValueAtTime(0,t0);
 g.gain.linearRampToValueAtTime(peak,t0+att);
 g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
 o.connect(g).connect(out);o.start(t0);o.stop(t0+dur+.02)}
const SOUNDS={
 drop:(c,o,t)=>{tone(c,o,{f0:1250,f1:520,t0:t,dur:.2,peak:.9});tone(c,o,{f0:2500,f1:1040,t0:t,dur:.08,peak:.12})},
 bell:(c,o,t)=>{[[1318.5,.5,.9],[1975.5,.25,.65],[2637,.12,.45]].forEach(([f,p,d])=>tone(c,o,{f0:f,t0:t,dur:d,peak:p}))},
 meow:(c,o,t)=>{
  /* A short chirp through a vowel-like band: rises, then falls. */
  const s=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();
  s.type="sawtooth";f.type="bandpass";f.Q.value=3;
  s.frequency.setValueAtTime(480,t);s.frequency.exponentialRampToValueAtTime(820,t+.11);s.frequency.exponentialRampToValueAtTime(430,t+.36);
  f.frequency.setValueAtTime(1100,t);f.frequency.exponentialRampToValueAtTime(1900,t+.12);f.frequency.exponentialRampToValueAtTime(900,t+.36);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.7,t+.03);g.gain.setValueAtTime(.7,t+.22);g.gain.exponentialRampToValueAtTime(.0001,t+.4);
  s.connect(f).connect(g).connect(o);s.start(t);s.stop(t+.42)},
 pop:(c,o,t)=>{tone(c,o,{f0:520,f1:170,t0:t,dur:.1,peak:1})},
 glass:(c,o,t)=>{tone(c,o,{f0:2093,t0:t,dur:.55,peak:.42});tone(c,o,{f0:3136,t0:t+.08,dur:.5,peak:.3})},
 duo:(c,o,t)=>{tone(c,o,{type:"triangle",f0:784,t0:t,dur:.16,peak:.65});tone(c,o,{type:"triangle",f0:1175,t0:t+.12,dur:.26,peak:.65})},
 soft:(c,o,t)=>{tone(c,o,{type:"triangle",f0:660,f1:610,t0:t,dur:.36,att:.035,peak:.45})},
 tick:(c,o,t)=>{tone(c,o,{f0:1800,f1:1200,t0:t,dur:.05,peak:.5})},
 whoosh:(c,o,t)=>{tone(c,o,{f0:300,f1:900,t0:t,dur:.12,peak:.35})}};
const KINDS=["drop","bell","meow","pop","glass","duo","soft"];
async function ownBuffer(){
 if(OWNBUF)return OWNBUF;
 const url=localStorage.getItem(OWN);if(!url)return null;
 const c=ac();if(!c)return null;
 try{const ab=await (await fetch(url)).arrayBuffer();OWNBUF=await c.decodeAudioData(ab);return OWNBUF}catch(e){console.warn("own sound:",e);return null}}
async function play(kind,gain=1){
 const c=ac();if(!c)return;
 const out=c.createGain();
 out.gain.value=Math.max(0,Math.min(1,(CFG.vol/100)))*gain;
 out.connect(c.destination);
 const t0=c.currentTime+.01;
 if(kind==="own"){
  const b=await ownBuffer();if(!b)return SOUNDS.drop(c,out,t0);
  try{OWNSRC?.stop()}catch(_){}
  const s=c.createBufferSource();s.buffer=b;s.connect(out);s.start(t0,0,Math.min(b.duration,4));OWNSRC=s;return}
 (SOUNDS[kind]||SOUNDS.drop)(c,out,t0)}
let lastAt=0;
/* From messenger.js: a message arrived. `open` — into the chat on screen. */
function incoming(peer,open){
 if(CFG.dnd||!CFG.on||CFG.mute.includes(String(peer)))return;
 const now=Date.now();if(now-lastAt<900)return;lastAt=now;
 if(open){if(CFG.open)play("tick",.55);return}
 play(CFG.kind)}
function sent(){if(CFG.send&&!CFG.dnd)play("whoosh",.5)}
/* Notifications themselves respect «do not disturb» and muted chats. */
const quiet=peer=>CFG.dnd||CFG.mute.includes(String(peer));

/* ══════════════ settings dialog ══════════════ */
function sw(id,on){return `<button type="button" class="cs-sw" role="switch" aria-checked="${!!on}" data-cs="${id}"><span></span></button>`}
function settingsBody(){
 const own=!!localStorage.getItem(OWN);
 return `<div class="cs">
  <div class="cs-row"><div><b>${esc(t("cs.snd"))}</b><small>${esc(t("cs.snd.s"))}</small></div>${sw("on",CFG.on)}</div>
  <div class="cs-kinds" role="radiogroup" aria-label="${esc(t("cs.kind"))}">
   ${[...KINDS,...(own?["own"]:[])].map(k=>`<button type="button" class="cs-k" role="radio" aria-checked="${CFG.kind===k}" data-kind="${k}">${IC(k==="own"?"audio_file":"music_note",18)}<span>${esc(t("snd."+k))}</span></button>`).join("")}
   <button type="button" class="cs-k cs-own" data-own="1">${IC("upload",18)}<span>${esc(t("cs.own"))}</span></button>
   <input type="file" accept="audio/*" hidden>
  </div>
  <small class="cs-hint">${esc(t("cs.own.s"))}</small>
  <div class="cs-row"><label for="cs-vol"><b>${esc(t("cs.vol"))}</b></label>
   <span class="cs-vol"><input id="cs-vol" type="range" min="0" max="100" step="5" value="${CFG.vol}"><output>${CFG.vol}%</output>
   <button type="button" class="ic" data-try="1" title="${esc(t("cs.try"))}">${IC("play_arrow",20)}</button></span></div>
  <div class="cs-row"><div><b>${esc(t("cs.open"))}</b><small>${esc(t("cs.open.s"))}</small></div>${sw("open",CFG.open)}</div>
  <div class="cs-row"><div><b>${esc(t("cs.send"))}</b></div>${sw("send",CFG.send)}</div>
  <div class="cs-row"><div><b>${esc(t("cs.dnd"))}</b><small>${esc(t("cs.dnd.s"))}</small></div>${sw("dnd",CFG.dnd)}</div>
  <p class="cs-hint">${esc(t("cs.look"))}</p></div>`}
function openSettings(){
 if(typeof window.mwDialog!=="function")return;
 const d=window.mwDialog({icon:"tune",title:t("cs.t"),body:settingsBody(),cls:"cs-dlg",actions:[{label:t("close"),primary:true}]});
 const root=d.body;
 const repaint=()=>{root.innerHTML=settingsBody();wire()};
 function wire(){
  root.querySelectorAll("[data-cs]").forEach(b=>b.addEventListener("click",()=>{
   const k=b.dataset.cs;CFG[k]=!CFG[k];cfgSave();b.setAttribute("aria-checked",String(!!CFG[k]))}));
  root.querySelectorAll("[data-kind]").forEach(b=>b.addEventListener("click",()=>{
   CFG.kind=b.dataset.kind;cfgSave();
   root.querySelectorAll("[data-kind]").forEach(x=>x.setAttribute("aria-checked",String(x===b)));
   play(CFG.kind)}));
  const file=root.querySelector('input[type="file"]');
  root.querySelector("[data-own]")?.addEventListener("click",()=>file.click());
  file?.addEventListener("change",async()=>{
   const f=file.files?.[0];file.value="";if(!f)return;
   if(f.size>400*1024)return toast(t("cs.own.big"));
   const url=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>res(null);r.readAsDataURL(f)});
   if(!url)return toast(t("cs.own.bad"));
   try{localStorage.setItem(OWN,url)}catch(_){return toast(t("cs.own.big"))}
   OWNBUF=null;
   if(!await ownBuffer()){localStorage.removeItem(OWN);return toast(t("cs.own.bad"))}
   CFG.kind="own";cfgSave();repaint();play("own")});
  const vol=root.querySelector("#cs-vol"),outv=root.querySelector(".cs-vol output");
  vol?.addEventListener("input",()=>{CFG.vol=+vol.value;outv.textContent=CFG.vol+"%"});
  vol?.addEventListener("change",()=>{cfgSave();play(CFG.kind)});
  root.querySelector("[data-try]")?.addEventListener("click",()=>play(CFG.kind))}
 wire()}
function toggleMute(peer){
 peer=String(peer||"");if(!peer)return;
 const on=CFG.mute.includes(peer);
 CFG.mute=on?CFG.mute.filter(x=>x!==peer):[...CFG.mute,peer];cfgSave();
 toast(t(on?"cs.unmuted":"cs.muted"),2400,{icon:on?"notifications_active":"notifications_off"});
 return !on}
const muted=peer=>CFG.mute.includes(String(peer||""));

/* ══════════════ tracks to send ══════════════ */
const trKey=x=>`${x.s}:${x.id}`;
function uniq(list){const seen=new Set();return list.filter(x=>{if(!x||!x.id||x.mode==="empty")return false;const k=trKey(x);if(seen.has(k))return false;seen.add(k);return true})}
const cleanTrack=tr=>{const x=stripTrack(tr);if(x&&!/^https?:/i.test(x.art||""))x.art="";return x};
function rowHtml(x,i){
 return `<button type="button" class="tp-row" data-i="${i}">
  <span class="tp-art" ${coverStyle(x.art)}>${x.art?"":IC("music_note",20)}</span>
  <span class="tp-t"><b>${esc(x.t||"—")}</b><span>${esc(x.a||"")}${x.s?` · ${esc(svcLabel(x.s))}`:""}</span></span>
  ${IC("send",18)}</button>`}
const svcLabel=s=>{try{return (typeof svc==="function"&&svc(s)?.name)||s}catch(_){return s}};
function queueList(){try{return Array.isArray(queue)?queue:[]}catch(_){return []}}
function source(tab,plId){
 if(tab==="now"){
  const cur=S.current&&S.current.mode!=="empty"?[S.current]:[];
  return uniq([...cur,...queueList()]).slice(0,60)}
 if(tab==="fav")return uniq(TRACKS.filter(x=>x.fav).sort((a,b)=>(b.favAt||0)-(a.favAt||0)));
 if(tab==="rec")return uniq(HISTORY.map(h=>h.tr));
 if(tab==="pl"){const p=PLAYLISTS.find(x=>x.id===plId)||PLAYLISTS[0];return p?uniq(p.tracks||[]):[]}
 return []}
/* A dialog to pick one track; resolves with it, or null. */
function pickTrack(){
 return new Promise(resolve=>{
  if(typeof window.mwDialog!=="function")return resolve(null);
  let tab=S.current&&S.current.mode!=="empty"?"now":"fav",plId=PLAYLISTS[0]?.id||null,q="",items=[],req=0,done=false;
  const tabs=[["now","play_circle"],["fav","favorite"],["rec","history"],["pl","queue_music"]];
  const d=window.mwDialog({icon:"music_note",title:t("tp.t"),cls:"tp-dlg wide",
   body:`<label class="tp-q">${IC("search",20)}<input type="search" placeholder="${esc(t("tp.q"))}" autocomplete="off" spellcheck="false"></label>
    <div class="tp-tabs" role="tablist">${tabs.map(([k,ic])=>`<button type="button" role="tab" data-tab="${k}" aria-selected="${k===tab}">${IC(ic,18)}<span>${esc(t("tp."+k))}</span></button>`).join("")}</div>
    <select class="tp-pl" hidden aria-label="${esc(t("tp.pick"))}">${PLAYLISTS.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} (${(p.tracks||[]).length})</option>`).join("")}</select>
    <div class="tp-list" role="list"></div>`,
   actions:[{label:t("cancel")}]});
  const b=d.body,list=b.querySelector(".tp-list"),inp=b.querySelector("input"),sel=b.querySelector(".tp-pl");
  const finish=v=>{if(done)return;done=true;resolve(v)};
  const obs=new MutationObserver(()=>{if(!d.el.isConnected){obs.disconnect();finish(null)}});
  obs.observe(document.body,{childList:true});
  function paint(){
   sel.hidden=tab!=="pl"||!!q;
   b.querySelectorAll("[data-tab]").forEach(x=>x.setAttribute("aria-selected",String(!q&&x.dataset.tab===tab)));
   if(!q)items=source(tab,plId);
   const ql=q.toLowerCase();
   if(q){const local=uniq([...TRACKS,...HISTORY.map(h=>h.tr),...PLAYLISTS.flatMap(p=>p.tracks||[])])
     .filter(x=>`${x.t} ${x.a}`.toLowerCase().includes(ql)).slice(0,30);
    items=local.concat(items.filter(x=>x._remote)).slice(0,60);items=uniq(items)}
   list.innerHTML=items.length?items.map(rowHtml).join(""):`<p class="tp-none">${esc(t(q?"tp.searching":"tp.none"))}</p>`}
  let tm=0;
  inp.addEventListener("input",()=>{
   q=inp.value.trim();items=[];paint();clearTimeout(tm);
   if(q.length<2)return;
   const my=++req;
   tm=setTimeout(async()=>{
    let hits=[];try{hits=await searchRemote(q)||[]}catch(_){}
    if(my!==req||done)return;
    const remote=hits.filter(x=>x&&x.id&&x.s!=="sp").slice(0,30).map(x=>({...x,_remote:true}));
    const ql=q.toLowerCase();
    const local=items.filter(x=>!x._remote&&`${x.t} ${x.a}`.toLowerCase().includes(ql));
    items=uniq([...local,...remote]);
    list.innerHTML=items.length?items.map(rowHtml).join(""):`<p class="tp-none">${esc(t("tp.nothing"))}</p>`},350)});
  b.querySelectorAll("[data-tab]").forEach(x=>x.addEventListener("click",()=>{tab=x.dataset.tab;q="";inp.value="";paint()}));
  sel.addEventListener("change",()=>{plId=sel.value;paint()});
  list.addEventListener("click",e=>{
   const r=e.target.closest("[data-i]");if(!r)return;
   const x=items[+r.dataset.i];if(!x)return;
   finish(x);d.close()});
  paint();
  setTimeout(()=>inp.focus({preventScroll:true}),60)})}

/* Conversations to send something to: open threads first, then friends. */
async function pickChat(title){
 if(typeof window.mwDialog!=="function"||!msMe())return null;
 try{await Promise.all([MS.threads.length?null:msLoadThreads(),msLoadFriends()])}catch(_){}
 const ids=[...new Set([...MS.threads.map(x=>x.peer),...(MS.friends||[])])].filter(id=>id&&id!==msMe());
 return new Promise(resolve=>{
  let done=false;const finish=v=>{if(done)return;done=true;resolve(v)};
  const d=window.mwDialog({icon:"forward",title,cls:"tp-dlg",
   body:ids.length?`<label class="tp-q">${IC("search",20)}<input type="search" placeholder="${esc(t("ms.search"))}" autocomplete="off"></label><div class="tp-list" role="list"></div>`
    :`<p class="tp-none">${esc(t("sh.none"))}</p>`,
   actions:[{label:t("cancel")}]});
  const obs=new MutationObserver(()=>{if(!d.el.isConnected){obs.disconnect();finish(null)}});
  obs.observe(document.body,{childList:true});
  const list=d.body.querySelector(".tp-list"),inp=d.body.querySelector("input");
  if(!list)return;
  const paint=()=>{
   const q=(inp.value||"").trim().toLowerCase();
   list.innerHTML=ids.filter(id=>!q||msName(MS.peers.get(id)).toLowerCase().includes(q)).map(id=>{
    const p=MS.peers.get(id)||{id};
    return `<button type="button" class="tp-row" data-peer="${esc(id)}">${avat(p,38)}<span class="tp-t"><b>${esc(msName(p))}</b></span>${IC("send",18)}</button>`}).join("")
    ||`<p class="tp-none">${esc(t("ms.nofound"))}</p>`};
  inp.addEventListener("input",paint);
  list.addEventListener("click",e=>{const r=e.target.closest("[data-peer]");if(!r)return;finish(r.dataset.peer);d.close()});
  paint();setTimeout(()=>inp.focus({preventScroll:true}),60)})}

/* Posts a payload into a direct chat that may not be on screen. */
async function postTo(peer,payload){
 peer=String(peer);
 const open=MS.conv&&MS.conv.kind==="dm"&&MS.conv.peer===peer&&MS.conv.root?.isConnected;
 if(open){await msPost(MS.conv,payload,null);return true}
 await msEnsurePeers([peer]);
 const r=await msSend(msConvNew("dm",peer),payload,null);
 if(r?.error){toast(msErr(r.error));return false}
 msLoadThreads().then(()=>msPaintList()).catch(()=>{});
 return true}

/* «Send to a chat» from a track's menu anywhere in the app. */
async function shareTrack(tr){
 if(!msMe())return toast(t("ms.auth"));
 const x=cleanTrack(tr);if(!x)return;
 const peer=await pickChat(t("sh.to"));if(!peer)return;
 if(await postTo(peer,{type:"music_card",track:x,text:""}))toast(tf("sh.sent",{name:msName(MS.peers.get(peer))}),2600,{icon:"send"})}

/* The composer's ♪ button: any track, not only the current one. */
async function composerTrack(c){
 const tr=await pickTrack();if(!tr)return;
 const x=cleanTrack(tr);if(!x)return;
 const replyTo=c.reply?.id||null;
 await msPost(c,{type:"music_card",track:x,text:""},replyTo);
 msCtx(c,null)}

/* ══════════════ media: encrypted files in chat-media ══════════════ */
const BUCKET="chat-media",MAXB=10*1024*1024;
const MEDIA=new Map();   // path → {media, url?, p?}
function b64(u8){let s="";for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s)}
function ub64(s){const b=atob(String(s||""));const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
const rid=()=>{const a=new Uint8Array(16);crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(2,"0")).join("")};
async function dims(blob){try{const b=await createImageBitmap(blob);const r={w:b.width,h:b.height};b.close?.();return r}catch(_){return {w:0,h:0}}}
async function toWebp(blob,maxSide,q){
 const bmp=await createImageBitmap(blob);
 const k=Math.min(1,maxSide/Math.max(bmp.width,bmp.height));
 const cv=document.createElement("canvas");cv.width=Math.max(1,Math.round(bmp.width*k));cv.height=Math.max(1,Math.round(bmp.height*k));
 cv.getContext("2d").drawImage(bmp,0,0,cv.width,cv.height);bmp.close?.();
 return await new Promise(res=>cv.toBlob(b=>res(b),"image/webp",q))}
async function thumbOf(blob){
 for(const [side,q] of [[420,.6],[320,.5],[240,.45]]){
  const b=await toWebp(blob,side,q);if(!b)continue;
  const url=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)});
  if(url.length<=40000)return url}
 return null}
/* -> a payload for msPost, or null to fall back to the old inline image. */
async function prepare(file){
 if(!file||!/^image\//.test(file.type))return null;
 if(!sb||!msMe()||!window.crypto?.subtle)return null;
 const gif=file.type==="image/gif";
 let body=file;
 if(!gif&&file.size>1.5*1024*1024){const w=await toWebp(file,2560,.86).catch(()=>null);if(w)body=w}
 if(body.size>MAXB){toast(t("md.big"));return false}
 const [{w,h},thumb]=await Promise.all([dims(file),thumbOf(file).catch(()=>null)]);
 /* No preview means the picture does not decode here: the old path decides. */
 if(!thumb)return null;
 const key=crypto.getRandomValues(new Uint8Array(32)),iv=crypto.getRandomValues(new Uint8Array(12));
 const ck=await crypto.subtle.importKey("raw",key,"AES-GCM",false,["encrypt"]);
 const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},ck,await body.arrayBuffer()));
 const path=`${msMe()}/${rid()}.bin`;
 const up=await sb.storage.from(BUCKET).upload(path,new Blob([ct],{type:"application/octet-stream"}),{contentType:"application/octet-stream",upsert:false});
 if(up.error){
  console.warn("chat-media upload:",up.error);
  if(/bucket|not found|404|row-level|policy|denied/i.test(String(up.error.message||up.error)))toast(t("md.nobucket"),7000);
  else toast(t("md.fail"));
  return {fallback:true,thumb}}
 const media={p:path,k:b64(key),iv:b64(iv),m:body.type||file.type,w,h,n:body.size};
 MEDIA.set(path,{media,url:URL.createObjectURL(body)});
 return {type:"image",image:thumb||"",media}}
async function load(media){
 const have=MEDIA.get(media.p);
 if(have?.url)return have.url;
 if(have?.p)return have.p;
 const p=(async()=>{
  const r=await sb.storage.from(BUCKET).download(media.p);
  if(r.error)throw r.error;
  const ck=await crypto.subtle.importKey("raw",ub64(media.k),"AES-GCM",false,["decrypt"]);
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:ub64(media.iv)},ck,await r.data.arrayBuffer());
  const url=URL.createObjectURL(new Blob([pt],{type:/^image\//.test(media.m||"")?media.m:"image/webp"}));
  MEDIA.set(media.p,{media,url});
  return url})();
 MEDIA.set(media.p,{media,p});
 try{return await p}catch(e){MEDIA.delete(media.p);throw e}}
/* messenger.js renders <img data-mpath> and calls hydrate() after painting
   the log; the real file replaces the preview. */
function note(media){if(media?.p&&!MEDIA.has(media.p))MEDIA.set(media.p,{media});return media?.p||""}
function hydrate(root){
 (root||document).querySelectorAll("img[data-mpath]:not([data-mstate])").forEach(img=>{
  const e=MEDIA.get(img.dataset.mpath);if(!e?.media)return;
  img.dataset.mstate="loading";
  load(e.media).then(url=>{if(img.isConnected){img.src=url;img.dataset.mstate="ok"}})
   .catch(err=>{console.warn("chat-media:",err);img.dataset.mstate="bad"})})}
async function removeMedia(media){
 if(!media?.p||!String(media.p).startsWith(msMe()+"/"))return;
 try{await sb.storage.from(BUCKET).remove([media.p])}catch(_){}}

/* ══════════════ image viewer ══════════════ */
function saveImage(url,name){
 const a=document.createElement("a");a.href=url;a.download=name||`meowave-${Date.now()}`;
 document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),0)}
function extOf(m){return /gif/.test(m)?"gif":/png/.test(m)?"png":/jpe?g/.test(m)?"jpg":"webp"}
function viewer(src,opt={}){
 if(!src)return;
 const v=document.createElement("div");
 v.className="mview2";v.setAttribute("role","dialog");v.setAttribute("aria-modal","true");
 v.innerHTML=`<div class="mv-stage"><img alt="" draggable="false"></div>
  <div class="mv-bar">
   <button class="ic" data-mv="out" title="${esc(t("mv.out"))}">${IC("zoom_out")}</button>
   <output>100%</output>
   <button class="ic" data-mv="in" title="${esc(t("mv.in"))}">${IC("zoom_in")}</button>
   <button class="ic" data-mv="fit" title="${esc(t("mv.fit"))}">${IC("fit_screen")}</button>
   <span class="mv-sep"></span>
   <button class="ic" data-mv="save" title="${esc(t("mv.save"))}">${IC("download")}</button>
   <button class="ic" data-mv="close" title="${esc(t("mv.close"))}">${IC("close")}</button></div>`;
 const stage=v.querySelector(".mv-stage"),img=v.querySelector("img"),out=v.querySelector("output");
 let z=1,x=0,y=0,base=1;
 const apply=()=>{img.style.transform=`translate(${x}px,${y}px) scale(${z})`;out.textContent=Math.round(z*base*100)+"%";v.dataset.zoom=z>1.01?"1":"0"};
 const clamp=()=>{
  const r=stage.getBoundingClientRect(),w=img.naturalWidth*base*z,h=img.naturalHeight*base*z;
  const mx=Math.max(0,(w-r.width)/2),my=Math.max(0,(h-r.height)/2);
  x=Math.max(-mx,Math.min(mx,x));y=Math.max(-my,Math.min(my,y))};
 const fit=()=>{
  const r=stage.getBoundingClientRect();
  base=Math.min(1,r.width/(img.naturalWidth||1),r.height/(img.naturalHeight||1));
  img.style.width=Math.round((img.naturalWidth||0)*base)+"px";img.style.height=Math.round((img.naturalHeight||0)*base)+"px";
  z=1;x=0;y=0;apply()};
 /* Zoom towards a point on screen (the cursor, the pinch centre). */
 const zoomAt=(nz,cx,cy)=>{
  nz=Math.max(1,Math.min(8/Math.max(base,.05),nz));
  const r=stage.getBoundingClientRect(),px=cx-(r.left+r.width/2),py=cy-(r.top+r.height/2);
  x=px-(px-x)*(nz/z);y=py-(py-y)*(nz/z);z=nz;clamp();apply()};
 const center=()=>{const r=stage.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]};
 img.onload=fit;img.src=src;
 stage.addEventListener("wheel",e=>{e.preventDefault();zoomAt(z*Math.exp(-e.deltaY*.0018),e.clientX,e.clientY)},{passive:false});
 stage.addEventListener("dblclick",e=>{zoomAt(z>1.5?1:2.5,e.clientX,e.clientY)});
 const pts=new Map();let pinch=null,drag=null,moved=false;
 stage.addEventListener("pointerdown",e=>{
  stage.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);moved=false;
  if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z};drag=null}
  else drag={x0:e.clientX,y0:e.clientY,x,y}});
 stage.addEventListener("pointermove",e=>{
  if(!pts.has(e.pointerId))return;
  pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pinch&&pts.size===2){const [a,b]=[...pts.values()];zoomAt(pinch.z*Math.hypot(a[0]-b[0],a[1]-b[1])/Math.max(1,pinch.d),(a[0]+b[0])/2,(a[1]+b[1])/2);moved=true;return}
  if(drag&&z>1.01){x=drag.x+(e.clientX-drag.x0);y=drag.y+(e.clientY-drag.y0);clamp();apply()}
  if(drag&&Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)>4)moved=true});
 const up=e=>{pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pts.size)drag=null};
 stage.addEventListener("pointerup",e=>{up(e);if(!moved&&e.target===stage&&z<=1.01)close()});
 stage.addEventListener("pointercancel",up);
 v.querySelector(".mv-bar").addEventListener("click",e=>{
  const k=e.target.closest("[data-mv]")?.dataset.mv;if(!k)return;
  const [cx,cy]=center();
  if(k==="in")zoomAt(z*1.4,cx,cy);else if(k==="out")zoomAt(z/1.4,cx,cy);else if(k==="fit")fit();
  else if(k==="save")saveImage(img.src,`meowave-${Date.now()}.${extOf(opt.mime||"")}`);else if(k==="close")close()});
 const key=e=>{
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close()}
  else if(e.key==="+"||e.key==="="){const [cx,cy]=center();zoomAt(z*1.4,cx,cy)}
  else if(e.key==="-"){const [cx,cy]=center();zoomAt(z/1.4,cx,cy)}
  else if(e.key==="0")fit()};
 const rs=()=>fit();
 function close(){v.classList.add("out");setTimeout(()=>v.remove(),180);removeEventListener("keydown",key,true);removeEventListener("resize",rs)}
 addEventListener("keydown",key,true);addEventListener("resize",rs);
 document.body.appendChild(v)}

/* A click on a picture in the log: the full file when there is one. */
async function view(img){
 if(!img)return;
 const e=img.dataset.mpath&&MEDIA.get(img.dataset.mpath);
 let src=img.currentSrc||img.src,mime=e?.media?.m||(/^data:(image\/[a-z+]+)/i.exec(src)||[])[1]||"";
 if(e?.media){try{src=await load(e.media)}catch(_){toast(t("md.load"))}}
 if(src)viewer(src,{mime})}
/* A small GIF still moves without the bucket: inline, as the old clients
   send pictures. messages_image_cap is 196 608 characters. */
async function inlineGif(file){
 if(!file||file.type!=="image/gif"||file.size>140*1024)return null;
 return await new Promise(res=>{const r=new FileReader();r.onload=()=>res(String(r.result||"")||null);r.onerror=()=>res(null);r.readAsDataURL(file)})}
/* ♥ on a shared track: the same path as the track menu's «Add to favourites». */
function favTrack(x){
 if(!x||!x.id)return;
 let tr=TRACKS.find(y=>String(y.id)===String(x.id)&&y.s===x.s);
 if(tr?.fav)return toast(t("ms.faved"),2200,{icon:"favorite"});
 if(!tr){tr={...x,mode:"local"};TRACKS.push(tr)}
 tr.fav=true;tr.favAt=Date.now();
 try{document.querySelectorAll(`[data-fav="${cssEsc(tr.id)}"]`).forEach(el=>el.setAttribute("aria-pressed","true"))}catch(_){}
 try{queueFav(tr,true);autoDownload(tr,null);renderWaveHint()}catch(e){console.warn("fav:",e)}
 save();
 if(S.view==="library")try{renderLib()}catch(_){}
 toast(t("ms.faved"),2200,{icon:"favorite"})}

/* ══════════════ «delete for me» ══════════════ */
const HK="mw.chat.hidden";
let HIDDEN=new Set();try{HIDDEN=new Set(JSON.parse(localStorage.getItem(HK)||"[]").map(String))}catch(_){}
const hide=id=>{HIDDEN.add(String(id));try{localStorage.setItem(HK,JSON.stringify([...HIDDEN].slice(-3000)))}catch(_){}};
const hidden=id=>HIDDEN.has(String(id));

window.MWChat={incoming,sent,quiet,muted,toggleMute,openSettings,pickTrack,pickChat,postTo,shareTrack,composerTrack,
 prepare,note,hydrate,load,removeMedia,viewer,view,saveImage,extOf,inlineGif,favTrack,hide,hidden,play};
})();
