/* search2.js — the search screen, round 8 (Beta 3.2).
   · before anything is typed: «В тренде» — YouTube Music's charts for Russia,
     the US or the whole world (Yandex Music's chart first for Russia when an
     account is connected), kept for half an hour; recent searches as chips;
   · with a query: artists, playlists and albums from YouTube Music (Deezer
     fills a short row) above the tracks, and your own playlists and library
     artists that match before them.
   Hooked from app.js's search(): MWSearch.idle(box) for the empty field,
   MWSearch.start(q) once typing settles (the request runs alongside the track
   search), MWSearch.more(q,box,alive) after the track rows are painted.
   Uses app.js globals (t, esc, LANG, I18N, TAURI, inv, PLAYLISTS, row, icons,
   xlistSet, setTrack, go, renderLib, artistList, cssUrlRaw, search, plOpen,
   S) and discover.js's MWDISC.shelvesHTML, whose cards open through the
   home sheet's own click handler. */
(()=>{
"use strict";
const IC=(n,s)=>`<span class="material-symbols-rounded" aria-hidden="true"${s?` style="font-size:${s}px"`:""}>${n}</span>`;
const tf=(k,v)=>{let s=t(k);for(const [a,b] of Object.entries(v||{}))s=s.split(`{${a}}`).join(String(b));return s};
const imgOf=u=>{const s=cssUrlRaw(u);return s?`<img src="${esc(s)}" alt="" loading="lazy" decoding="async" draggable="false">`:""};

Object.assign(I18N.ru,{
 "sr.trend":"В тренде","sr.reg.ru":"Россия","sr.reg.us":"США","sr.reg.world":"Весь мир",
 "sr.recent":"Вы искали","sr.clear":"Очистить","sr.rm":"Убрать из истории",
 "sr.load":"Загружаем чарты…","sr.err":"Чарты не загрузились","sr.retry":"Обновить",
 "sr.all":"Показать все · {n}","sr.less":"Свернуть","sr.play":"Слушать",
 "sr.artists":"Артисты","sr.playlists":"Плейлисты","sr.albums":"Альбомы","sr.tracks":"Треки",
 "sr.mine":"В вашей медиатеке","sr.pl":"Ваш плейлист · {n}","sr.art":"В медиатеке · {n}",
 "sr.off":"Чарты загружаются в приложении — в браузерной версии их нет",
 "sr.f.all":"Всё","sr.f.tracks":"Треки","sr.f.artists":"Артисты","sr.f.playlists":"Плейлисты","sr.f.albums":"Альбомы",
 "sr.alltr":"Все треки · {n}"});
Object.assign(I18N.en,{
 "sr.trend":"Trending","sr.reg.ru":"Russia","sr.reg.us":"USA","sr.reg.world":"Worldwide",
 "sr.recent":"Recent searches","sr.clear":"Clear","sr.rm":"Remove from history",
 "sr.load":"Loading the charts…","sr.err":"The charts didn't load","sr.retry":"Refresh",
 "sr.all":"Show all · {n}","sr.less":"Show less","sr.play":"Play",
 "sr.artists":"Artists","sr.playlists":"Playlists","sr.albums":"Albums","sr.tracks":"Tracks",
 "sr.mine":"In your library","sr.pl":"Your playlist · {n}","sr.art":"In your library · {n}",
 "sr.off":"Charts load in the app — the browser version has none",
 "sr.f.all":"All","sr.f.tracks":"Tracks","sr.f.artists":"Artists","sr.f.playlists":"Playlists","sr.f.albums":"Albums",
 "sr.alltr":"All tracks · {n}"});

const REGIONS=["ru","us","world"];
const TTL=30*60e3;
const LS_REG="mw.search.region",LS_REC="mw.search.recent",LS_TR="mw.search.trend.";
const st={all:false};
const region=()=>{const r=localStorage.getItem(LS_REG);return REGIONS.includes(r)?r:(LANG==="ru"?"ru":"us")};

/* ─────────── trending ─────────── */
const mem=new Map(),inflight=new Map();
function cachedTrend(r){
 let c=mem.get(r);
 if(!c){
  try{c=JSON.parse(localStorage.getItem(LS_TR+r)||"null")}catch(_){c=null}
  if(c&&Array.isArray(c.shelves))mem.set(r,c);else c=null}
 /* Shelf titles come back in the interface language. */
 return c&&c.lang===LANG?c:null}
function fetchTrend(r){
 if(inflight.has(r))return inflight.get(r);
 const p=Promise.resolve(inv("search_trending",{region:r,lang:LANG})).then(sh=>{
  const c={at:Date.now(),lang:LANG,shelves:(Array.isArray(sh)?sh:[]).slice(0,8)};
  mem.set(r,c);
  try{localStorage.setItem(LS_TR+r,JSON.stringify(c))}catch(_){}
  return c}).finally(()=>inflight.delete(r));
 inflight.set(r,p);
 return p}

function trendBody(c,r){
 const sh=(c.shelves||[]).filter(s=>s&&Array.isArray(s.cards)&&s.cards.some(x=>x&&x.id&&x.t));
 const i=sh.findIndex(s=>s.cards.every(x=>x.kind==="track"&&x.track));
 let top="";
 if(i>=0){
  const s=sh.splice(i,1)[0];
  const tracks=s.cards.map(x=>x.track).filter(Boolean);
  const key="x:trend:"+r,title=s.title||t("sr.trend");
  xlistSet(key,title,tracks);
  top=`<section class="s2-top">
   <div class="s2-toph"><h3>${esc(title)}</h3>
    <button class="btn sm s2-play" data-s2play="${esc(key)}">${IC("play_arrow",17)}<span>${esc(t("sr.play"))}</span></button></div>
   <div class="rows s2-rank${st.all?" is-all":""}" data-listctx="${esc(key)}">${tracks.map(x=>row(x)).join("")}</div>
   ${tracks.length>10?`<button class="s2-all" data-s2all>${esc(st.all?t("sr.less"):tf("sr.all",{n:tracks.length}))}</button>`:""}
  </section>`}
 const rest=sh.length&&window.MWDISC?.shelvesHTML?MWDISC.shelvesHTML(sh):"";
 return top+rest}

/* Chart playlists are music videos and often come without a length: a blank
   reads better than a row of «0:00». */
const fixDur=root=>root.querySelectorAll(".s2-rank .row .dur").forEach(d=>{if(d.textContent.trim()==="0:00")d.textContent=""});
const stateHTML=(ic,txt,act)=>`<div class="hs-state${ic==="progress_activity"?" is-load":""}">${IC(ic,22)}<span>${esc(txt)}</span>${act||""}</div>`;

function idle(box){
 if(!box)return;
 delete box.dataset.s2f;
 const r=region();
 const recent=recentHTML();
 if(!TAURI){
  box.innerHTML=recent+empty("search",t("s.idle.t"),t("s.idle.s"))+`<p class="s2-note">${esc(t("sr.off"))}</p>`;
  icons();return}
 const c=cachedTrend(r);
 box.innerHTML=`<div class="s2-idle">${recent}
  <section class="s2-trend" data-reg="${r}">
   <div class="s2-th"><h2>${esc(t("sr.trend"))}</h2>
    <div class="s2-seg" role="group" aria-label="${esc(t("sr.trend"))}">${REGIONS.map(x=>`<button data-s2reg="${x}" aria-pressed="${x===r}">${esc(t("sr.reg."+x))}</button>`).join("")}</div>
    <button class="ic sm s2-re" data-s2re title="${esc(t("sr.retry"))}" aria-label="${esc(t("sr.retry"))}">${IC("refresh",18)}</button></div>
   <div class="s2-tb">${c?trendBody(c,r):stateHTML("progress_activity",t("sr.load"))}</div>
  </section></div>`;
 fixDur(box);icons();
 if(!c||Date.now()-c.at>TTL)loadTrend(box,r,!!c)}

function loadTrend(box,r,quiet){
 const body=()=>{const s=box.querySelector(".s2-trend");return s&&s.dataset.reg===r?s.querySelector(".s2-tb"):null};
 const re=box.querySelector("[data-s2re]");re?.classList.add("is-spin");
 fetchTrend(r).then(c=>{
  const b=body();if(!b)return;
  b.innerHTML=trendBody(c,r);fixDur(b);icons()
 }).catch(e=>{
  const b=body();if(!b||quiet)return;
  b.innerHTML=stateHTML("cloud_off",t("sr.err")+(e?` — ${String(e).slice(0,160)}`:""),
   `<span class="hs-state-act"><button class="btn" data-s2re>${IC("refresh",16)}<span>${esc(t("sr.retry"))}</span></button></span>`);
  icons()
 }).finally(()=>re?.classList.remove("is-spin"))}

/* ─────────── recent searches ─────────── */
const recentList=()=>{try{const a=JSON.parse(localStorage.getItem(LS_REC)||"[]");return Array.isArray(a)?a.filter(x=>typeof x==="string"&&x).slice(0,8):[]}catch(_){return []}};
function remember(q){
 q=String(q||"").trim();
 if(q.length<2||q.length>80||/^https?:|\.com\/|youtu\.?be/i.test(q))return;
 const l=recentList().filter(x=>x.toLowerCase()!==q.toLowerCase());
 l.unshift(q);
 try{localStorage.setItem(LS_REC,JSON.stringify(l.slice(0,8)))}catch(_){}}
function forget(q){
 const l=q==null?[]:recentList().filter(x=>x!==q);
 try{localStorage.setItem(LS_REC,JSON.stringify(l))}catch(_){}}
function recentHTML(){
 const l=recentList();if(!l.length)return "";
 return `<section class="s2-recent"><div class="s2-rh"><span>${esc(t("sr.recent"))}</span><button class="s2-link" data-s2clear>${esc(t("sr.clear"))}</button></div>
  <div class="s2-chips">${l.map(q=>`<span class="s2-chip"><button data-s2q="${esc(q)}">${IC("history",16)}<span>${esc(q)}</span></button><button class="s2-x" data-s2qx="${esc(q)}" title="${esc(t("sr.rm"))}" aria-label="${esc(t("sr.rm"))}">${IC("close",14)}</button></span>`).join("")}</div></section>`}

/* ─────────── artists, playlists, albums for a query ─────────── */
const CARDS=new Map();
function cardsFor(q){
 const k=LANG+"|"+q;
 if(CARDS.has(k))return CARDS.get(k);
 const services=SERVICES.filter(s=>s.on&&!s.local).map(s=>s.id);
 const p=TAURI&&services.length&&q.length>=2
  ?Promise.resolve(inv("search_cards",{query:q,services,lang:LANG})).then(x=>Array.isArray(x)?x:[]).catch(e=>{console.warn("search cards:",e);CARDS.delete(k);return []})
  :Promise.resolve([]);
 CARDS.set(k,p);
 while(CARDS.size>30)CARDS.delete(CARDS.keys().next().value);
 return p}
const fold=s=>String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ё/g,"е");
/* Your own playlists and the artists of your library that match. An artist
   the services already returned is not shown twice. */
function mineFor(q,remote){
 const f=fold(q);if(f.length<2)return {pls:[],arts:[]};
 const taken=new Set((remote||[]).flatMap(s=>s.cards||[]).filter(c=>c.kind==="artist").map(c=>fold(c.t)));
 const pls=(PLAYLISTS||[]).filter(p=>fold(p.name).includes(f)).slice(0,8);
 const arts=(typeof artistList==="function"?artistList():[]).filter(a=>fold(a.name).includes(f)&&!taken.has(fold(a.name))).slice(0,8);
 return {
  pls:pls.map(p=>{const art=p.cover||(p.tracks||[]).find(x=>x.art)?.art||"";
   return `<button class="hs-card" data-s2pl="${esc(p.id)}" title="${esc(p.name)}"><span class="hs-art">${IC("queue_music",28)}${imgOf(art)}<i class="hs-go">${IC("arrow_forward",20)}</i></span><b>${esc(p.name)}</b><small>${esc(tf("sr.pl",{n:(p.tracks||[]).length}))}</small></button>`}),
  arts:arts.map(a=>`<button class="hs-card is-artist" data-artpage="${esc(a.name)}" title="${esc(a.name)}"><span class="hs-art">${IC("person",28)}${imgOf(a.art)}</span><b>${esc(a.name)}</b><small>${esc(tf("sr.art",{n:a.list.length}))}</small></button>`)}}
/* One kind as a shelf: the services' cards through the home sheet's renderer
   (it registers them for its click handler), yours put in front of them. */
function shelfFor(key,shelf,local){
 const title=t("sr."+key);
 const nav=`<span class="hs-nav"><button class="ic sm" data-hsscroll="-1" aria-label="prev">${IC("chevron_left",18)}</button><button class="ic sm" data-hsscroll="1" aria-label="next">${IC("chevron_right",18)}</button></span>`;
 if(!shelf||!window.MWDISC?.shelvesHTML)
  return local.length?`<section class="hs-shelf"><div class="hs-head"><h3>${esc(title)}</h3>${nav}</div><div class="hs-row">${local.join("")}</div></section>`:"";
 const tmp=document.createElement("div");
 tmp.innerHTML=MWDISC.shelvesHTML([{...shelf,title}]);
 if(local.length)tmp.querySelector(".hs-row")?.insertAdjacentHTML("afterbegin",local.join(""));
 return tmp.querySelector(".hs-shelf")?tmp.innerHTML:""}

/* «Всё» shows a row of each kind with the first tracks between the artists
   and the playlists; a chip narrows the page to one kind, shown as a grid. */
const FILT={q:"",f:"all"};
const KINDS=["artists","playlists","albums"];
function paintMore(box,q,remote){
 box.querySelectorAll(".s2-filt,.s2-sec,.s2-h,.s2-alltr").forEach(e=>e.remove());
 const by={};
 (remote||[]).forEach(s=>{if(s&&KINDS.includes(s.title)&&Array.isArray(s.cards)&&s.cards.length)by[s.title]=s});
 const mine=mineFor(q,remote);
 const html={artists:shelfFor("artists",by.artists,mine.arts),playlists:shelfFor("playlists",by.playlists,mine.pls),albums:shelfFor("albums",by.albums,[])};
 const kinds=KINDS.filter(k=>html[k]);
 if(!kinds.length){delete box.dataset.s2f;return}
 const hits=box.querySelector("#hits");
 if(!hits)box.querySelector(".empty")?.remove();
 const n=hits?hits.querySelectorAll(".row").length:0;
 const opts=["all",...(n?["tracks"]:[]),...kinds];
 if(FILT.q!==q)Object.assign(FILT,{q,f:"all"});
 const f=opts.includes(FILT.f)?FILT.f:"all";
 box.dataset.s2f=f;
 const el=(tag,cls,inner,attrs)=>{const e=document.createElement(tag);e.className=cls;if(inner!=null)e.innerHTML=inner;
  for(const [a,b] of Object.entries(attrs||{}))e.setAttribute(a,b);return e};
 const filt=el("div","s2-filt",opts.map(k=>`<button data-s2f="${k}" aria-pressed="${k===f}">${esc(t("sr.f."+k))}</button>`).join(""),{role:"group"});
 const sec=k=>html[k]?el("div","s2-sec",html[k],{"data-sec":k}):null;
 const parts=[filt,sec("artists")];
 if(hits){
  parts.push(el("h3","s2-h",esc(t("sr.tracks"))));
  parts.push(hits);
  if(n>8)parts.push(el("button","s2-alltr",`<span>${esc(tf("sr.alltr",{n}))}</span>${IC("arrow_forward",16)}`,{"data-s2f":"tracks"}))}
 parts.push(sec("playlists"),sec("albums"));
 const frag=document.createDocumentFragment();
 parts.filter(Boolean).forEach(p=>frag.appendChild(p));
 box.prepend(frag);
 icons()}
function setFilter(box,f){
 FILT.f=f;box.dataset.s2f=f;
 box.querySelectorAll(".s2-filt [data-s2f]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.s2f===f)));
 document.getElementById("v-search")?.scrollTo?.({top:0,behavior:"smooth"})}

function start(q){if(q)cardsFor(q)}
/* app.js waits this long for the cards before painting the tracks, so both
   usually appear together instead of the rows jumping down a moment later. */
function settle(q,ms){return Promise.race([cardsFor(q),new Promise(r=>setTimeout(r,ms||600))])}
async function more(q,box,alive){
 if(!box||!q)return;
 const live=typeof alive==="function"?alive:()=>true;
 paintMore(box,q,null);
 const remote=await cardsFor(q);
 if(!live())return;
 paintMore(box,q,remote);
 /* Kept as a recent search once the results have been on screen a moment —
    not for every half-typed prefix. */
 setTimeout(()=>{if(live())remember(document.getElementById("q")?.value||q)},2200)}

/* ─────────── events ─────────── */
const qBox=()=>document.getElementById("q");
function runQuery(q){
 const inp=qBox();if(!inp)return;
 inp.value=q;
 document.getElementById("search-clear")?.classList.toggle("visible",!!q);
 go("search");search(q);inp.focus()}
document.addEventListener("click",e=>{
 const tg=e.target;if(!(tg instanceof Element)||!tg.closest("#sres"))return;
 const box=document.getElementById("sres");
 const fb=tg.closest("[data-s2f]");if(fb){setFilter(box,fb.dataset.s2f);return}
 const reg=tg.closest("[data-s2reg]");
 if(reg){const r=reg.dataset.s2reg;if(REGIONS.includes(r)){localStorage.setItem(LS_REG,r);st.all=false;idle(box)}return}
 if(tg.closest("[data-s2re]")){const r=region();mem.delete(r);try{localStorage.removeItem(LS_TR+r)}catch(_){}
  const b=box.querySelector(".s2-tb");if(b)b.innerHTML=stateHTML("progress_activity",t("sr.load"));
  loadTrend(box,r,false);return}
 if(tg.closest("[data-s2all]")){
  st.all=!st.all;
  box.querySelector(".s2-rank")?.classList.toggle("is-all",st.all);
  const b=tg.closest("[data-s2all]"),n=box.querySelectorAll(".s2-rank .row").length;
  b.textContent=st.all?t("sr.less"):tf("sr.all",{n});return}
 const pl=tg.closest("[data-s2play]");
 if(pl){const list=listFor(pl.dataset.s2play)||[];if(list.length)setTrack(list[0],true,false,pl.dataset.s2play);return}
 const x=tg.closest("[data-s2qx]");if(x){forget(x.dataset.s2qx);idle(box);return}
 if(tg.closest("[data-s2clear]")){forget(null);idle(box);return}
 const q=tg.closest("[data-s2q]");if(q){runQuery(q.dataset.s2q);return}
 const mine=tg.closest("[data-s2pl]");
 if(mine){
  const id=mine.dataset.s2pl;
  go("library");
  document.querySelector('#libtabs [data-tab="pl"]')?.click();
  plOpen=id;renderLib();return}});
/* A track started from the results is a search worth remembering. */
document.addEventListener("click",e=>{
 const tg=e.target;if(!(tg instanceof Element))return;
 if(tg.closest("#sres #hits [data-track], #sres .s2-more [data-card], #sres .s2-more [data-artpage], #sres .s2-more [data-s2pl]"))remember(qBox()?.value||"")},true);

window.MWSearch={idle,start,settle,more,remember,trending:fetchTrend};
/* The idle screen was painted by app.js before this file loaded. */
if(!(qBox()?.value||"").trim()&&S.view==="search")idle(document.getElementById("sres"));
})();
