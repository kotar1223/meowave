/* covers.js — artwork for tracks saved without one.
   Tracks brought over from a Yandex Music library used to arrive with no
   cover: the importer's rows never carried it. The importer is fixed in
   Rust (ymlib.rs → ym_row now sends `art`); this repairs what is already in
   the library, once per track:
   · Yandex — the covers of up to 200 tracks per request (`ym_covers`);
   · YouTube Music — the video thumbnail is the cover, no request at all.
   Ids that Yandex had no cover for are remembered, so a start-up never asks
   twice. Loaded after app.js (TRACKS, PLAYLISTS, HISTORY, save, renderLib, inv). */
(()=>{
"use strict";
const TRIED="mw.covers.tried";
const tried=new Set((()=>{try{return JSON.parse(localStorage.getItem(TRIED)||"[]")}catch(_){return []}})());
const remember=()=>{try{localStorage.setItem(TRIED,JSON.stringify([...tried].slice(-5000)))}catch(_){}};
const ytThumb=id=>`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
const ymKey=id=>String(id).split(":")[0];

function everyTrack(){
 const seen=new Set(),out=[];
 const add=x=>{if(x&&typeof x==="object"&&!seen.has(x)){seen.add(x);out.push(x)}};
 try{(TRACKS||[]).forEach(add)}catch(_){}
 try{(PLAYLISTS||[]).forEach(p=>(p.tracks||[]).forEach(add))}catch(_){}
 /* «Недавнее» keeps its own copies of the tracks it lists. */
 try{(HISTORY||[]).forEach(h=>add(h&&h.tr))}catch(_){}
 return out}

let running=false;
async function repair(){
 if(running||!TAURI)return 0;
 running=true;
 let changed=0;
 try{
  const missing=everyTrack().filter(x=>!x.art&&x.id&&(x.s==="ym"||x.s==="ytm"));
  if(!missing.length)return 0;
  for(const x of missing)
   if(x.s==="ytm"&&/^[A-Za-z0-9_-]{11}$/.test(String(x.id))){x.art=ytThumb(x.id);changed++}
  const ids=[...new Set(missing.filter(x=>x.s==="ym"&&!tried.has(ymKey(x.id))).map(x=>ymKey(x.id)))];
  for(let i=0;i<ids.length;i+=200){
   const part=ids.slice(i,i+200);
   let map;
   try{map=await inv("ym_covers",{ids:part})||{}}catch(e){console.warn("ym_covers:",e);break}
   part.forEach(id=>tried.add(id));
   for(const x of missing)
    if(x.s==="ym"&&!x.art&&map[ymKey(x.id)]){x.art=map[ymKey(x.id)];changed++}}
  remember();
  if(changed){
   try{save()}catch(e){console.warn(e)}
   try{renderLib()}catch(_){}}
 }finally{running=false}
 return changed}

window.mwCovers={repair};
/* After the library has loaded and the first screen is drawn. */
setTimeout(()=>{repair().catch(e=>console.warn("cover repair:",e))},9000);
})();
