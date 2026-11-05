/* m3.ts — Material 3 layers on top of app.js: dialogs, the playback-failure
   flow ("Details" / "Other source"), the YouTube Music check and the mini
   player. Loaded after app.js, so its globals (S, t, inv, toast, load …) are
   in scope; nothing here runs before the DOM is parsed (defer). */

/* m3.ts — was src/m3.js until step 2 of the stack rewrite (HANDOFF.md);
   the layers, the dialog, the failure flow, the YouTube Music check, the
   mini player and the icon picker are unchanged, and so are
   window.mwDialog / mwCloseLayer / mwFailSnack / MW3. It needs app.js's
   globals at start (I18N, S, t, esc, toast, window.applyI18n … — see
   globals.d.ts), so initM3() runs in afterLegacy() — the first of them, so
   every later module finds window.mwDialog in place.

   The old script ran right after app.js, before discover.js and
   messenger.js; a module cannot start between two classic scripts, so this
   one now starts after messenger.js (discover.ts, a module too, starts
   right after it, as before). Nothing they do at load needs it — app.js,
   discover.ts and messenger.js reach mwDialog, MW3, mwCloseLayer and
   mwFailSnack only from handlers, each behind a guard. What moves:
   - messenger.js's applyI18n() at load now runs before this wrapper
     exists; init() below labels the mini button and the icon picker
     itself, and the mini player is closed at that point;
   - the applyI18n() wrappers nest as before: this one inside,
     discover.ts's outside;
   - the Escape listener (document, capture) still runs before
     discover.ts's (document, bubble), and the icon picker's click listener
     handles only its own targets. */

/** Whatever is on top owns Escape: a dialog, the wave sheet (discover.ts). */
interface M3Layer { close(): void }
/** app.js's stream probe of a track that failed to play. */
interface M3Why { ok?: boolean; why?: string }
/** One row of the YouTube Music check (ytm.rs SelfTest). */
interface M3YtcRow {
  client: string;
  status: string;
  reason?: string;
  formats?: number;
  /** HTTP status of the first bytes / of a range three quarters in, 0 if not reached */
  start?: number;
  deep?: number;
  /** HTTP status of an open-ended bytes=0- request */
  open?: number | null;
  /** the largest window that came through whole, KiB; 0 — none did, missing from older builds */
  window_kb?: number | null;
  /** HTTP status of the full 2 MiB window when it did not come through */
  window_code?: number;
  /** the window the proxy reads in right now, KiB */
  proxy_kb?: number;
  ms?: number;
}
/** stream.rs stream_alt: where a track YouTube refused really plays from. */
interface M3Alt { s: string; id?: string | number; t?: string; a?: string }
/** The window as it was before the mini player. */
interface M3MiniSaved { fs?: boolean; max?: boolean; w?: number; h?: number; x?: number; y?: number }
interface M3Mini {
  on: boolean;
  busy: boolean;
  saved: M3MiniSaved | null;
  timer: number;
  key: string;
  lyKey: string;
  lyAsked: string;
  lyIdx: number;
  el: HTMLElement | null;
  guard: number;
  yielded: boolean;
  /** the OS did not take the mouse once: the window is moved by hand for the rest of the session */
  manualDrag?: boolean;
}
/** One drag of the mini card. */
interface M3Drag {
  x: number;
  y: number;
  t0: number;
  manual: boolean;
  pos: TauriPosition | null | undefined;
  sf: number;
  raf: number;
  last: [number, number] | null;
  done: boolean;
  asked: boolean;
}
interface M3Api {
  dialog(options: MwDialogOptions): MwDialogHandle;
  layer: { push(l: M3Layer): void; drop(l: M3Layer): void; top(): M3Layer | null };
  toast: typeof toast;
  copyText(text: string): Promise<boolean>;
  pickSource(tr: MwTrack | null | undefined): Promise<void>;
  failDetails(tr: MwTrack | null | undefined, url: unknown, why: M3Why | null | undefined): Promise<void>;
  ytcDialog(videoId?: string | number | null): void;
  miniToggle(on?: boolean | null): Promise<void>;
  altNote(tr: MwTrack, r: M3Alt): void;
  altInfo(tr: MwTrack | null | undefined, r: M3Alt): void;
  readonly miniOn: boolean;
}

declare global {
  interface Window {
    /** the one Material 3 dialog every module uses */
    mwDialog?: (options: MwDialogOptions) => MwDialogHandle;
    /** app.js (Escape, Back): closes the layer on top; false when there is none */
    mwCloseLayer?: () => boolean;
    /** app.js: a track did not play — a snackbar with "Other source" and "Details" */
    mwFailSnack?: (tr: MwTrack, url: unknown, why: M3Why | null | undefined) => void;
    /** discover.ts: layer; app.js: altNote; custom.ts: copyText (falls back to execCommand where the Clipboard API is refused) */
    MW3?: M3Api;
  }
}

export function initM3(): void {
const $=(id:string)=>document.getElementById(id);
const IC=(n:string,size?:number)=>`<span class="material-symbols-rounded" aria-hidden="true"${size?` style="font-size:${size}px"`:""}>${n}</span>`;
const errText=(e:unknown)=>String(e&&(e as {message?:unknown}).message||e||"").replace(/^Error:\s*/,"").slice(0,240);
const tf=(k:string,vars?:Record<string,unknown>)=>{let s=t(k);for(const [a,b] of Object.entries(vars||{}))s=s.split(`{${a}}`).join(String(b));return s};

/* ── layers: whatever is on top owns Escape ── */
const LAYERS:M3Layer[]=[];
const layer={
 push(l:M3Layer){LAYERS.push(l)},
 drop(l:M3Layer){const i=LAYERS.indexOf(l);if(i>=0)LAYERS.splice(i,1)},
 top(){return LAYERS[LAYERS.length-1]||null}};
window.mwCloseLayer=()=>{const l=layer.top();if(!l)return false;l.close();return true};
document.addEventListener("keydown",e=>{
 if(e.key!=="Escape"||!LAYERS.length)return;
 e.preventDefault();e.stopImmediatePropagation();
 layer.top()?.close()},true);

/* ── MD3 dialog ── */
let DLG_N=0;
function dialog({icon,title,body,actions=[],cls=""}:MwDialogOptions):MwDialogHandle{
 const id="mdd"+(++DLG_N);
 const wrap=document.createElement("div");
 wrap.className="mdd-wrap";wrap.dataset.open="false";
 wrap.innerHTML=`<div class="mdd ${cls}" role="dialog" aria-modal="true" aria-labelledby="${id}t">
  <div class="mdd-h">${icon?`<span class="mdd-ic">${IC(icon,24)}</span>`:""}
  <h2 class="mdd-t" id="${id}t">${esc(title||"")}</h2></div>
  <div class="mdd-b"></div>
  <div class="mdd-a"></div></div>`;
 const bodyEl=wrap.querySelector<HTMLElement>(".mdd-b")!,actEl=wrap.querySelector<HTMLElement>(".mdd-a")!;
 if(typeof body==="string")bodyEl.innerHTML=body;else if(body)bodyEl.appendChild(body);
 const back=document.activeElement as HTMLElement|null;
 const api={el:wrap,body:bodyEl,closed:false,close,setActions};
 const me={close};
 function close(){
  if(api.closed)return;api.closed=true;
  layer.drop(me);wrap.dataset.open="false";
  setTimeout(()=>wrap.remove(),240);
  if(back&&back.isConnected)try{back.focus({preventScroll:true})}catch(_){}}
 function setActions(list?:MwDialogAction[]|null){
  actEl.innerHTML="";
  for(const a of list||[]){
   const b=document.createElement("button");b.type="button";
   b.className="m3b "+(a.primary?"m3b-filled":a.tonal?"m3b-tonal":"m3b-text");
   b.innerHTML=(a.icon?IC(a.icon,18):"")+`<span>${esc(a.label)}</span>`;
   if(a.id)b.id=a.id;
   b.addEventListener("click",async()=>{
    let keep=false;
    try{keep=(await a.run?.(api))===false}catch(e){console.warn("dialog action:",e)}
    if(!keep)close()});
   actEl.appendChild(b)}}
 setActions(actions);
 wrap.addEventListener("pointerdown",e=>{if(e.target===wrap)close()});
 document.body.appendChild(wrap);layer.push(me);
 /* Focus lands on the dialog itself, not on its first button: a programmatic
    focus after a key press would otherwise draw the focus ring round a
    button at the foot of every dialog that opens on its own (playback
    failure). Enter still runs the main action and Tab reaches the buttons. */
 const box=wrap.querySelector<HTMLElement>(".mdd")!;box.tabIndex=-1;
 box.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||e.target!==box||e.isComposing)return;
  const b=actEl.querySelector<HTMLButtonElement>(".m3b-filled")||(actEl.children.length===1?actEl.firstElementChild as HTMLButtonElement|null:null);
  if(b&&!b.disabled){e.preventDefault();b.click()}});
 requestAnimationFrame(()=>{wrap.dataset.open="true";
  const f=bodyEl.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled]),textarea:not([disabled])");
  (f||box).focus({preventScroll:true})});
 return api}
/* Shared with the later modules (src/ts/update.ts, chats) so every dialog is this one. */
window.mwDialog=dialog;

async function copyText(text:string){
 try{await navigator.clipboard.writeText(text);toast(t("fail.copied"),2200,{icon:"content_copy"});return true}
 catch(_){
  /* Clipboard API can be refused in a webview; a selected textarea and
     execCommand still work there. */
  try{const ta=document.createElement("textarea");ta.value=text;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();
   const ok=document.execCommand("copy");ta.remove();if(ok){toast(t("fail.copied"),2200,{icon:"content_copy"});return true}}catch(_){}
  return false}}

/* ── playback failure ── */
function streamRef(url:unknown,tr:MwTrack|null|undefined){
 const m=/\/stream\/([^/?#]+)\/([^?#]+)/.exec(String(url||""));
 const dec=(s:string)=>{try{return decodeURIComponent(s)}catch(_){return s}};
 return m?{service:dec(m[1]!),id:dec(m[2]!)}:{service:tr?._resolvedSvc||tr?.s||"",id:String(tr?._resolvedId||tr?.id||"")}}
const svcName=(id:string|undefined)=>(typeof svc==="function"&&svc(id)?.name)||id||"—";

let FAILSNK:MwToastHandle|null|undefined=null;
window.mwFailSnack=(tr,url,why)=>{
 const msg=why&&!why.ok&&why.why?`${t("load.err")} — ${humanStreamError(why.why)}`:t("load.err");
 // One failure snackbar at a time: a newer failure replaces the older one.
 try{FAILSNK?.dismiss?.()}catch{}
 FAILSNK=toast(msg,12000,{icon:"error",actions:[
  {label:t("fail.other"),run:()=>pickSource(tr)},
  {label:t("fail.more"),run:()=>failDetails(tr,url,why)}]})};

async function failDetails(tr:MwTrack|null|undefined,url:unknown,why:M3Why|null|undefined){
 const ref=streamRef(url,tr);
 let diag="";
 if(TAURI){try{diag=String(await inv("stream_diag",ref)||"").trim()}catch(e){diag=String((e as Error)?.message||e)}}
 const lines=[
  `${tr?.a||"—"} — ${tr?.t||"—"}`,
  `${t("fail.src")}: ${svcName(ref.service)} · ${ref.id}`,
  `${t("fail.probe")}: ${why?.ok?"OK":(why?.why||"—")}`,
  ""].concat(diag?diag.split("\n"):[t("fail.none")]);
 const text=lines.join("\n").trim();
 const acts:MwDialogAction[]=[{label:t("fail.copy"),icon:"content_copy",run:()=>{copyText(text);return false}}];
 if(ref.service==="ytm")acts.push({label:t("ytc.run"),tonal:true,run:()=>{ytcDialog(ref.id)}});
 acts.push({label:t("fail.other"),primary:true,run:()=>{pickSource(tr)}});
 dialog({icon:"troubleshoot",title:t("fail.t"),cls:"wide",
  body:`<p class="mdd-p">${esc(t("fail.s"))}</p><pre class="mdd-pre" tabindex="0">${esc(text)}</pre>`,actions:acts})}

/* Every copy of the track the search finds, best match first — the same
   ranking the silent fallback uses, but the user chooses. */
async function pickSource(tr:MwTrack|null|undefined){
 if(!tr)return;
 const d=dialog({icon:"swap_horiz",title:t("src.t"),cls:"wide",
  body:`<p class="mdd-p">${esc(t("src.s"))}</p><div class="m3-list" id="src-list" role="list"><div class="m3-wait"><span class="m3-spin" aria-hidden="true"></span><span>${esc(t("src.load"))}</span></div></div>`,
  actions:[{label:t("dlg.cancel")}]});
 const clean=typeof cleanMusicTitle==="function"?cleanMusicTitle(tr.a,tr.t):{query:`${tr.a||""} ${tr.t||""}`.trim()};
 const qs=[...new Set([clean.query,`${tr.a||""} ${tr.t||""}`.trim()].filter(Boolean))];
 let hits:MwTrack[]=[];
 for(const q of qs){
  try{const r=await searchRemote(q);if(r?.length)hits=hits.concat(r)}catch(_){}
  if(hits.length>=8)break}
 if(d.closed)return;
 const box=d.body.querySelector("#src-list");if(!box)return;
 const seen=new Set<string>();
 const rows:{h:MwTrack;m:number|null}[]=[];
 for(const h of hits){
  if(!h||!h.id||h.s==="sp"||h.s==="local")continue;
  if(h.s===tr.s&&String(h.id)===String(tr.id))continue;
  const k=`${h.s}:${h.id}`;if(seen.has(k))continue;seen.add(k);
  rows.push({h,m:MWM.of(tr,h)})}
 rows.sort((a,b)=>(b.m??-1)-(a.m??-1));
 /* Real matches first; unrelated hits only fill in when there are few, so a
    list of other songs is never presented as "the same track". */
 const good=rows.filter(r=>r.m!=null);
 const top=good.concat(rows.filter(r=>r.m==null).slice(0,Math.max(0,4-good.length))).slice(0,8);
 if(!top.length){box.innerHTML=`<div class="m3-wait">${IC("search_off",22)}<span>${esc(t("src.none"))}</span></div>`;return}
 box.innerHTML=top.map((r,i)=>{
  const h=r.h,art=cssUrlRaw(h.art);
  const tag=r.m==null?t("src.maybe"):r.m>=.85?t("src.exact"):t("src.close");
  return `<button class="m3-li" role="listitem" data-src-i="${i}">
   <span class="m3-li-art">${art?`<img src="${esc(art)}" alt="" loading="lazy" draggable="false">`:IC("music_note",20)}</span>
   <span class="m3-li-txt"><b>${esc(h.t||"—")}</b><small><span class="m3-svc">${SVC_ICONS[h.s!]||""}${esc(svcName(h.s))}</span> · ${esc(h.a||"—")}${+h.d!?` · ${fmt(+h.d!)}`:""}</small></span>
   <span class="m3-li-tag" data-q="${r.m==null?"low":r.m>=.85?"hi":"mid"}">${esc(tag)}</span>
   <span class="m3-li-go">${IC("play_arrow",20)}</span></button>`}).join("");
 box.addEventListener("click",e=>{
  const b=(e.target as Element).closest<HTMLElement>("[data-src-i]");if(!b)return;
  const r=top[+b.dataset.srcI!];if(!r)return;
  d.close();useSource(tr,r.h)});
 box.addEventListener("error",e=>{if((e.target as Element|null)?.tagName==="IMG")(e.target as Element).remove()},true)}

function useSource(tr:MwTrack,h:MwTrack){
 fallbackAttempted.add(trackKey(h));
 if(!sameTrack(tr,S.current)){setTrack(h,true);return}
 /* _net: the user chose this service, so a downloaded file of the track does
    not get to stand in for it (see offId in app.js). */
 const resolved={...tr,id:h.id,s:h.s,mode:"local",_resolved:true,_resolvedId:h.id,_resolvedSvc:h.s,_net:true};
 if(tr._spOrig){
  try{sprMap().set(sprKey(tr),{s:h.s,id:String(h.id),t:h.t,a:h.a,d:+h.d!||0,score:0,at:Date.now()});sprSave()}catch(_){}
  S.current!._resolvedSvc=h.s}
 else{S.current=resolved;S.playing=true;renderNP();paint();sync()}
 toast(tf("src.now",{s:svcName(h.s)}),2600,{icon:"swap_horiz"});
 load(resolved,true,0)}

/* ── YouTube Music check ── */
Object.assign(I18N.ru,{
 "ytc.win.no":"окна не проходят",
 "ytc.bot":"Гостевой клиент: YouTube просит подтвердить, что вы не бот. Ваш вход в YouTube Music такие клиенты не используют — это не ошибка, пока работают другие.",
 "ytc.proxy":"Плеер читает окнами по {n}"});
Object.assign(I18N.en,{
 "ytc.win.no":"no window passes",
 "ytc.bot":"A guest client: YouTube asks to confirm you are not a bot. Your YouTube Music sign-in is not used by these clients — not an error while the others work.",
 "ytc.proxy":"The player reads in {n} windows"});
const CLIENT_N:Record<string,string|undefined>={ANDROID_VR:"Android VR",ANDROID_SDKLESS:"Android · SDK-less",IOS:"iOS",ANDROID:"Android",ANDROID_TESTSUITE:"Android Test Suite",WEB_REMIX:"Web"};
const okCode=(c:number|null|undefined)=>c===200||c===206;
const kb=(n:number)=>n>=1024?`${Math.round(n/102.4)/10} ${LANG==="ru"?"МБ":"MB"}`:`${n} ${LANG==="ru"?"КБ":"KB"}`;
const isBot=(r:M3YtcRow)=>/LOGIN_REQUIRED/.test(r.status||"")||/not a bot|sign in/i.test(r.reason||"");
/* `window_kb`: the largest window (2 MB → 64 KB) that came through whole.
   The proxy reads googlevideo in such windows and shrinks them when one is
   refused, so any window that passes is enough to play. */
const winOk=(r:M3YtcRow)=>r.window_kb==null||r.window_kb>0;
function ytcVerdict(r:M3YtcRow){
 if(r.status==="OK"&&okCode(r.start)&&okCode(r.deep)&&winOk(r))return "ok";
 if(r.status==="OK"&&okCode(r.start))return "part";
 return "bad"}
function ytcRowsHTML(rows:M3YtcRow[]){
 return rows.map(r=>{
  const v=ytcVerdict(r);
  const ic=v==="ok"?"check_circle":v==="part"?"error":"cancel";
  const bits:string[]=[];
  if(r.status==="OK"){
   bits.push(tf("ytc.formats",{n:r.formats}));
   bits.push(`${t("ytc.start")} ${r.start||"—"}`);
   bits.push(`${t("ytc.deep")} ${r.deep||"—"}`);
   if(r.window_kb!=null)bits.push(r.window_kb>0
    ?`${t("ytc.win")} ${kb(r.window_kb)}${r.window_kb<2048&&r.window_code?` (2 ${LANG==="ru"?"МБ":"MB"} → ${r.window_code})`:""}`
    :`${t("ytc.win.no")}${r.window_code?` (${r.window_code})`:""}`);
   if(r.open)bits.push(`${t("ytc.open")} ${r.open}`)}
  else if(isBot(r))bits.push(t("ytc.bot"));
  else bits.push([r.status,r.reason].filter(Boolean).join(" — "));
  bits.push(`${r.ms} ${LANG==="ru"?"мс":"ms"}`);
  return `<div class="m3-li is-static" role="listitem" data-v="${v}">
   <span class="m3-li-lead">${IC(ic,22)}</span>
   <span class="m3-li-txt"><b>${esc(CLIENT_N[r.client]||r.client)}</b><small>${esc(bits.join(" · "))}</small></span>
   <span class="m3-li-tag" data-q="${v==="ok"?"hi":v==="part"?"mid":"low"}">${esc(t("ytc."+v))}</span></div>`}).join("")}
function ytcReport(rows:M3YtcRow[]){
 return ["Meowave · YouTube Music check · "+new Date().toISOString(),
  ...rows.map(r=>`${r.client}: ${r.status}${r.reason?` (${r.reason})`:""} formats=${r.formats} start=${r.start} deep=${r.deep} open=${r.open??"?"} win=${r.window_kb??"?"}KB${r.window_code?` (2048KB:${r.window_code})`:""} ${r.ms}ms`),
  rows[0]?.proxy_kb?`proxy window: ${rows[0].proxy_kb}KB`:""].filter(Boolean).join("\n")}
async function ytcRun(videoId?:string|number|null):Promise<M3YtcRow[]>{
 if(!TAURI)throw new Error(t("ytc.desk"));
 const rows=await inv<M3YtcRow[]>("ytm_selftest",{videoId:videoId||null});
 return Array.isArray(rows)?rows:[]}
function ytcSummary(rows:M3YtcRow[]){
 const good=rows.filter(r=>ytcVerdict(r)==="ok").length;
 const pk=rows[0]?.proxy_kb;
 const proxy=good&&pk&&pk<2048?`<small class="ytc-proxy">${esc(tf("ytc.proxy",{n:kb(pk)}))}</small>`:"";
 return {good,html:`<div class="ytc-sum" data-ok="${good>0}">${IC(good?"verified":"wifi_off",22)}<span>${esc(good?tf("ytc.sum.ok",{n:good,m:rows.length}):t("ytc.sum.bad"))}${proxy}</span></div>`}}

/* In a dialog (from the failure details) … */
function ytcDialog(videoId?:string|number|null){
 const d=dialog({icon:"network_check",title:t("ytc.t"),cls:"wide",
  body:`<p class="mdd-p">${esc(t("ytc.s"))}</p><div class="m3-list" role="list"><div class="m3-wait"><span class="m3-spin" aria-hidden="true"></span><span>${esc(t("ytc.busy"))}</span></div></div>`,
  actions:[{label:t("snk.close")}]});
 ytcRun(videoId).then(rows=>{
  if(d.closed)return;
  const list=d.body.querySelector(".m3-list")!;
  list.innerHTML=ytcSummary(rows).html+ytcRowsHTML(rows);
  d.setActions([{label:t("ytc.copy"),icon:"content_copy",run:()=>{copyText(ytcReport(rows));return false}},{label:t("snk.close"),primary:true}])
 }).catch(e=>{
  if(d.closed)return;
  d.body.querySelector(".m3-list")!.innerHTML=`<div class="m3-wait">${IC("error",22)}<span>${esc(errText(e))}</span></div>`})}

/* … and inline in Settings → Network. */
function ytcPanelInit(){
 const btn=$("ytc-run"),out=$("ytc-out"),cp=$("ytc-copy");if(!btn||!out)return;
 let last:M3YtcRow[]|null=null;
 btn.addEventListener("click",async()=>{
  if(btn.getAttribute("aria-busy")==="true")return;
  btn.setAttribute("aria-busy","true");cp&&(cp.hidden=true);
  out.innerHTML=`<div class="m3-wait"><span class="m3-spin" aria-hidden="true"></span><span>${esc(t("ytc.busy"))}</span></div>`;
  try{const rows=await ytcRun();last=rows;out.innerHTML=ytcSummary(rows).html+ytcRowsHTML(rows);if(cp)cp.hidden=false}
  catch(e){out.innerHTML=`<div class="m3-wait">${IC("error",22)}<span>${esc(errText(e))}</span></div>`}
  finally{btn.removeAttribute("aria-busy")}});
 cp?.addEventListener("click",()=>{if(last)copyText(ytcReport(last))})}

/* ═══════════════════ YouTube → another source ═══════════════════
   The proxy answers a refused YouTube track with the same recording from
   Yandex Music or SoundCloud (stream.rs `ytm_alternative`). The listener is
   told once per track where it really plays from, and why. */
const svcLabel=(id:string)=>SERVICES.find(s=>s.id===id)?.name||({ym:"Yandex Music",sc:"SoundCloud",ytm:"YouTube Music",dz:"Deezer",am:"Apple Music"} as Record<string,string|undefined>)[id]||id;
function altNote(tr:MwTrack,r:M3Alt){
 toast(t("alt.note").replace("{s}",svcLabel(r.s)),7000,{icon:"swap_horiz",actions:[{label:t("alt.why"),run:()=>altInfo(tr,r)}]})}
function altInfo(tr:MwTrack|null|undefined,r:M3Alt){
 const b=document.createElement("div");
 b.innerHTML=`<p class="mdd-p">${esc(t("alt.s").replace("{s}",svcLabel(r.s)))}</p>
  ${r.t?`<div class="m3-li m3-li-tag"><span class="m3-li-lead">${IC("graphic_eq",20)}</span><span class="m3-li-body"><b>${esc(r.t)}</b><small>${esc(r.a||"")} · ${esc(svcLabel(r.s))}</small></span></div>`:""}
  <p class="mdd-p mdd-mute">${esc(t("alt.fix"))}</p>`;
 dialog({icon:"swap_horiz",title:t("alt.t"),body:b,actions:[
  {label:t("ytc.run"),run:()=>{ytcDialog?.(tr?.id)}},
  {label:t("wv.done"),primary:true}]})}
function altSwitchInit(){
 const panel=$("ytc-panel");if(!panel||$("ytm-alt"))return;
 const f=document.createElement("div");f.className="field";
 f.innerHTML=`<div><label for="ytm-alt" data-i18n="alt.set">${esc(t("alt.set"))}</label><small data-i18n="alt.set.s">${esc(t("alt.set.s"))}</small></div><button class="sw" id="ytm-alt" aria-pressed="true" aria-label="${esc(t("alt.set"))}"></button>`;
 panel.insertBefore(f,panel.querySelector(".ytc-acts"));
 const sw=f.querySelector("#ytm-alt")!;
 const paint=()=>sw.setAttribute("aria-pressed",String(S.x?.ytmAlt!==false));paint();
 sw.addEventListener("click",()=>{S.x.ytmAlt=S.x.ytmAlt===false;paint();save()})}

/* ═════════════════════════ mini player ═════════════════════════
   The same window, shrunk to a card that stays above everything else: cover,
   the current line of synced lyrics, transport and like. Window geometry is
   saved on the way in and restored on the way out; the mini card's own size
   and position are remembered between uses. */
const MINI:M3Mini={on:false,busy:false,saved:null,timer:0,key:"",lyKey:"",lyAsked:"",lyIdx:-2,el:null,guard:0,yielded:false};
const MINI_W=420,MINI_H=196;
const curWin=()=>{const w=window.__TAURI__?.window;return w?.getCurrentWindow?.()||w?.getCurrent?.()||null};
const DPI=():TauriDpi=>window.__TAURI__?.dpi||window.__TAURI__?.window||{};
const tryA=async<T>(f:()=>T|PromiseLike<T>,fb?:T)=>{try{const v=await f();return v===undefined?fb:v}catch(e){console.warn("[meowave] mini:",(e as Error)?.message||e);return fb}};
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
function miniCfg():MwMiniCfg{if(!S.x.mini||typeof S.x.mini!=="object")S.x.mini={pin:true};return S.x.mini}

function miniBuild(){
 if(MINI.el)return MINI.el;
 const el=document.createElement("div");
 el.className="mini";el.id="mini";el.hidden=true;
 el.setAttribute("role","region");el.setAttribute("aria-label",t("mini.t"));
 el.innerHTML=`<div class="mini-bg" aria-hidden="true"><i></i></div>
  <span class="mini-grip" aria-hidden="true"></span>
  <div class="mini-card">
   <div class="mini-art"><img alt="" draggable="false" hidden><span class="material-symbols-rounded mini-art-ph" aria-hidden="true">music_note</span><i class="mini-eq" aria-hidden="true"><b></b><b></b><b></b></i></div>
   <div class="mini-meta">
    <span class="mini-kick"></span>
    <b class="mini-t"></b>
    <span class="mini-a"></span>
   </div>
   <div class="mini-top">
    <button class="m3i" data-mini="pin" aria-pressed="true">${IC("keep",18)}</button>
    <button class="m3i" data-mini="exit">${IC("open_in_full",18)}</button>
   </div>
   <p class="mini-ly" aria-live="off"></p>
   <div class="mini-seekrow">
    <span class="mini-time">0:00</span>
    <div class="mini-seek" data-mini="seek" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i class="mini-fill"></i><i class="mini-knob"></i></div>
    <span class="mini-time mini-dur">0:00</span>
   </div>
   <div class="mini-ctrls">
    <button class="m3i" data-mini="dis">${IC("thumb_down",20)}</button>
    <button class="m3i" data-mini="prev">${IC("skip_previous",26)}</button>
    <button class="mini-play" data-mini="play">${IC("play_arrow",28)}</button>
    <button class="m3i" data-mini="next">${IC("skip_next",26)}</button>
    <button class="m3i" data-mini="fav" aria-pressed="false">${IC("favorite",20)}</button>
   </div>
  </div>`;
 document.body.appendChild(el);
 el.addEventListener("click",e=>{
  const b=(e.target as Element).closest<HTMLElement>("[data-mini]");if(!b)return;
  const k=b.dataset.mini;
  if(k==="exit")miniToggle(false);
  else if(k==="pin")miniPin(!(miniCfg().pin!==false));
  else if(k==="play")toggle();
  else if(k==="next")next(true);
  else if(k==="prev")prev();
  else if(k==="fav")document.querySelector<HTMLElement>("#np .heart")?.click();
  else if(k==="dis")document.getElementById("npdislike")?.click();
  setTimeout(miniPaint,60)});
 /* The card is the window: dragging anywhere that is not a control moves it.
    Not data-tauri-drag-region, whose double-click maximises the window —
    exactly what a mini player must not do. */
 el.addEventListener("mousedown",e=>{
  if(!miniDragFrom(e))return;
  const w=TAURI&&curWin();if(!w)return;
  e.preventDefault();miniDrag(w,e)});
 const seek=el.querySelector<HTMLElement>(".mini-seek")!;
 const seekAt=(x:number)=>{const r=seek.getBoundingClientRect();const d=+S.dur||+S.current?.d!||0;if(d>0)seekSeconds(clamp((x-r.left)/Math.max(1,r.width),0,1)*d);miniPaint()};
 seek.addEventListener("pointerdown",e=>{e.stopPropagation();seek.setPointerCapture?.(e.pointerId);seekAt(e.clientX);
  const mv=(ev:PointerEvent)=>seekAt(ev.clientX),up=()=>{seek.removeEventListener("pointermove",mv);seek.removeEventListener("pointerup",up)};
  seek.addEventListener("pointermove",mv);seek.addEventListener("pointerup",up)});
 seek.addEventListener("keydown",e=>{
  if(e.key==="ArrowRight"){e.preventDefault();seekSeconds((+S.pos||0)+5)}
  if(e.key==="ArrowLeft"){e.preventDefault();seekSeconds(Math.max(0,(+S.pos||0)-5))}});
 el.querySelector(".mini-art img")!.addEventListener("error",e=>{(e.target as HTMLImageElement).hidden=true});
 MINI.el=el;miniLabels();return el}
function miniLabels(){
 const el=MINI.el;if(!el)return;
 const L:Record<string,string|undefined>={pin:t("mini.pin"),exit:t("mini.exit"),dis:t("mini.dis"),prev:t("np.prev"),next:t("np.next"),fav:t("act.fav"),play:t("np.play"),seek:t("mini.seek")};
 el.querySelectorAll<HTMLElement>("[data-mini]").forEach(b=>{const v=L[b.dataset.mini!];if(v){b.title=v;b.setAttribute("aria-label",v)}})}

/* Round 6, "the mini player still does not move": the press was tested with
   closest("button,[data-mini],input") — and <html> carries data-mini="on"
   while the mini player is open, so every press counted as a press on a
   control and no drag ever started. Controls are looked up inside the card
   only. Double presses are ignored (no maximise, no second move loop). */
function miniDragFrom(e:MouseEvent){
 const el=MINI.el;
 if(!el||e.button!==0||e.detail>1||!el.contains(e.target as Node))return false;
 const hit=(e.target as Element).closest?.("button,input,a,[data-mini]");
 return !(hit&&el.contains(hit))}

/* The native move loop (startDragging) is asked straight from the mousedown,
   as Tauri's own drag regions do, with no pointer capture in its way. When
   the OS does not take the mouse — the page keeps receiving moves with the
   button held well after the request — the window is moved by hand:
   setPosition from the screen-space delta, one IPC call per frame. That
   fallback is remembered for the rest of the session. */
function miniDrag(w:TauriWindow,e:MouseEvent){
 const D=DPI(),host=MINI.el;if(!host)return;
 const st:M3Drag={x:e.screenX,y:e.screenY,t0:performance.now(),manual:MINI.manualDrag===true,pos:null,sf:1,raf:0,last:null,done:false,asked:false};
 host.dataset.drag="1";
 const flush=()=>{
  if(st.done||!st.pos||!st.last||st.raf||!D.PhysicalPosition)return;
  st.raf=requestAnimationFrame(()=>{st.raf=0;if(st.done||!st.last)return;
   const [ax,ay]=st.last;
   w.setPosition(new D.PhysicalPosition!(Math.round(st.pos!.x+ax*st.sf),Math.round(st.pos!.y+ay*st.sf))).catch(()=>{})})};
 const byHand=()=>{
  st.manual=true;MINI.manualDrag=true;
  if(st.asked)return;st.asked=true;
  Promise.all([tryA(()=>w.scaleFactor(),devicePixelRatio||1),tryA(()=>w.outerPosition(),null)])
   .then(([sf,pos])=>{st.sf=sf||1;st.pos=pos;flush()})};
 const up=()=>{if(st.done)return;st.done=true;delete host.dataset.drag;
  if(st.raf)cancelAnimationFrame(st.raf);
  removeEventListener("mousemove",mv,true);removeEventListener("mouseup",up,true);removeEventListener("blur",up)};
 const mv=(ev:MouseEvent)=>{
  if(!(ev.buttons&1)){up();return}
  const dx=ev.screenX-st.x,dy=ev.screenY-st.y;
  if(!st.manual){
   if(performance.now()-st.t0<250||Math.hypot(dx,dy)<10)return;
   byHand()}
  st.last=[dx,dy];flush()};
 addEventListener("mousemove",mv,true);addEventListener("mouseup",up,true);addEventListener("blur",up);
 if(st.manual||!w.startDragging)byHand();
 else w.startDragging().catch(byHand)}

function miniLyric(tr:MwTrack){
 const el=MINI.el!.querySelector<HTMLElement>(".mini-ly")!;
 const L=typeof lyricsFor==="function"?lyricsFor(tr):null;
 const key=trackKey(tr);
 if((!L||L.state==="idle")&&MINI.lyAsked!==key&&typeof fetchLyrics==="function"){MINI.lyAsked=key;fetchLyrics(tr)}
 let text="",idx=-1;
 if(L?.lines?.length&&L.synced){
  const off=typeof getLyricOffset==="function"?getLyricOffset(tr):0;
  const pos=(A.audio&&!A.audio.paused&&Number.isFinite(A.audio.currentTime)?A.audio.currentTime:+S.pos||0)+off+LY_LEAD;
  for(let i=0;i<L.lines.length;i++){const at=L.lines[i]!.at;if(at==null)continue;if(pos>=at)idx=i;else break}
  text=idx>=0?String(L.lines[idx]!.text||"").trim():"";
  if(!text)text=idx<0?"♪":"♪ ♪"}
 if(MINI.lyKey===key&&MINI.lyIdx===idx&&el.dataset.has===String(!!L?.synced))return;
 MINI.lyKey=key;MINI.lyIdx=idx;
 el.dataset.has=String(!!L?.synced);
 el.classList.remove("in");void el.offsetWidth;
 el.textContent=text;
 if(text)el.classList.add("in")}

function miniPaint(){
 if(!MINI.on||!MINI.el)return;
 const el=MINI.el,tr=S.current,empty=!tr||tr.mode==="empty";
 const key=empty?"":trackKey(tr);
 el.dataset.empty=String(empty);
 el.dataset.playing=String(!!S.playing);
 if(key!==MINI.key){
  MINI.key=key;
  el.querySelector(".mini-t")!.textContent=empty?t("mini.idle"):(tr.t||"—");
  el.querySelector(".mini-a")!.textContent=empty?t("mini.idle.s"):(tr.a||"—");
  const src=empty?"":cssUrlRaw(tr.art);
  const img=el.querySelector<HTMLImageElement>(".mini-art img")!;
  if(src){img.hidden=false;if(img.getAttribute("src")!==src)img.src=src}else{img.hidden=true;img.removeAttribute("src")}
  el.querySelector<HTMLElement>(".mini-bg i")!.style.backgroundImage=src?`url("${src.replace(/"/g,"%22")}")`:"";
  window.MWFX?.flow?.setCover?.(src||"");
  MINI.lyIdx=-2}
 const wave=PLAYCTX.key==="wave"&&!empty;
 const sname=empty?"":svcName(tr._resolvedSvc||tr.s);
 el.querySelector(".mini-kick")!.textContent=empty?t("mini.t"):(wave?`${t("wv.cap")} · ${sname}`:sname);
 el.dataset.wave=String(wave);
 const play=el.querySelector<HTMLElement>('[data-mini="play"]')!;
 const want=S.playing?"pause":"play_arrow";
 if(play.dataset.ic!==want){play.dataset.ic=want;play.innerHTML=IC(want,26);const l=S.playing?t("np.pause"):t("np.play");play.title=l;play.setAttribute("aria-label",l)}
 const d=+S.dur||+tr?.d!||0,p=clamp(+S.pos||0,0,d||0);
 const pct=d>0?p/d*100:0;
 el.style.setProperty("--mini-p",pct.toFixed(2)+"%");
 const seek=el.querySelector(".mini-seek")!;seek.setAttribute("aria-valuenow",String(Math.round(pct)));
 el.querySelector(".mini-time")!.textContent=fmt(p);
 el.querySelector(".mini-dur")!.textContent=d>0?fmt(d):"—";
 const heart=document.querySelector("#np .heart");
 el.querySelector('[data-mini="fav"]')!.setAttribute("aria-pressed",heart?.getAttribute("aria-pressed")==="true"?"true":"false");
 el.querySelector('[data-mini="pin"]')!.setAttribute("aria-pressed",String(miniCfg().pin!==false));
 if(!empty)miniLyric(tr);else{const ly=el.querySelector<HTMLElement>(".mini-ly")!;ly.textContent="";ly.dataset.has="false"}}

async function miniPin(on:boolean){
 const c=miniCfg();c.pin=!!on;save();
 const w=TAURI&&curWin();
 MINI.yielded=false;
 if(w&&MINI.on){await tryA(()=>w.setAlwaysOnTop(!!on));miniGuard(!!on)}
 miniPaint();
 toast(on?t("mini.pin.on"):t("mini.pin.off"),1800,{icon:on?"keep":"keep_off"})}

/* Round 6: "it broke full screen everywhere" — a window that stays above
   all others also stays above a full-screen game or video. While pinned, the
   mini player asks the backend (fsguard.rs) every 1.5 s whether another app
   is full screen on its monitor, and steps back for as long as it is. */
function miniGuard(on:boolean){
 clearInterval(MINI.guard);MINI.guard=0;
 const w=TAURI&&curWin();
 if(!on||!w)return;
 let busy=false;
 MINI.guard=setInterval(async()=>{
  if(busy||!MINI.on)return;busy=true;
  try{
   const full=await inv("other_fullscreen");
   if(!MINI.on||miniCfg().pin===false)return;
   if(full&&!MINI.yielded){MINI.yielded=true;await tryA(()=>w.setAlwaysOnTop(false))}
   else if(!full&&MINI.yielded){MINI.yielded=false;await tryA(()=>w.setAlwaysOnTop(true))}}
  catch(_){clearInterval(MINI.guard);MINI.guard=0}
  finally{busy=false}},1500)}

/* setFullscreen(false) returns before the window has left full screen; the
   size read right after it was the full-screen one. */
async function miniLeaveFs(w:TauriWindow){
 await tryA(()=>w.setFullscreen(false));
 document.documentElement.dataset.fullscreen="false";
 for(let i=0;i<12&&await tryA(()=>w.isFullscreen(),false);i++)await new Promise(r=>setTimeout(r,50));
 await new Promise(r=>setTimeout(r,80))}

async function miniEnter(){
 const el=miniBuild();
 if(typeof closeFP==="function"&&fp?.dataset.open==="true")closeFP();
 if(typeof settingsIsOpen==="function"&&settingsIsOpen())closeSettings(true);
 const w=TAURI&&curWin(),D=DPI(),c=miniCfg();
 if(w&&D.LogicalSize){
  const sf=await tryA(()=>w.scaleFactor(),1)||1;
  const saved:M3MiniSaved={fs:await tryA(()=>w.isFullscreen(),false)};
  if(saved.fs)await miniLeaveFs(w);
  saved.max=await tryA(()=>w.isMaximized(),false);
  if(saved.max)await tryA(()=>w.unmaximize());
  const sz=await tryA(()=>w.innerSize(),null),pos=await tryA(()=>w.outerPosition(),null);
  if(sz){saved.w=Math.round(sz.width/sf);saved.h=Math.round(sz.height/sf)}
  if(pos){saved.x=pos.x;saved.y=pos.y}
  MINI.saved=saved;
  const mw=clamp(+c.w!||MINI_W,320,760),mh=clamp(+c.h!||MINI_H,150,460);
  await tryA(()=>w.setMinSize(new D.LogicalSize!(320,150)));
  await tryA(()=>w.setSize(new D.LogicalSize!(mw,mh)));
  let x=c.x,y=c.y;
  const mon=await tryA(()=>window.__TAURI__!.window!.currentMonitor?.(),null);
  if(mon){
   const msf=mon.scaleFactor||sf,area=mon.workArea||{position:mon.position,size:mon.size};
   const ax=area.position.x,ay=area.position.y,aw=area.size.width,ah=area.size.height;
   const pw=Math.round(mw*msf),ph=Math.round(mh*msf);
   const ok=Number.isFinite(x)&&Number.isFinite(y)&&x!>=ax-pw/2&&y!>=ay&&x!<=ax+aw-pw/2&&y!<=ay+ah-ph/2;
   if(!ok){x=ax+aw-pw-Math.round(24*msf);y=ay+ah-ph-Math.round((mon.workArea?24:72)*msf)}}
  if(Number.isFinite(x)&&Number.isFinite(y)&&D.PhysicalPosition)await tryA(()=>w.setPosition(new D.PhysicalPosition!(Math.round(x!),Math.round(y!))));
  MINI.yielded=false;
  if(c.pin!==false)await tryA(()=>w.setAlwaysOnTop(true))}
 MINI.on=true;MINI.key="";MINI.lyIdx=-2;
 miniGuard(c.pin!==false);
 el.hidden=false;
 document.documentElement.dataset.mini="on";
 /* the full-screen player's moving cover, lent to the mini card */
 try{el.dataset.flow=String(!!window.MWFX?.flow?.host?.(el.querySelector(".mini-bg")))}catch(_){el.dataset.flow="false"}
 miniLabels();miniPaint();
 clearInterval(MINI.timer);MINI.timer=setInterval(miniPaint,250);
 requestAnimationFrame(()=>{el.dataset.open="true"})}

async function miniExit(){
 const w=TAURI&&curWin(),D=DPI(),c=miniCfg(),saved:M3MiniSaved=MINI.saved||{};
 clearInterval(MINI.timer);MINI.timer=0;miniGuard(false);MINI.yielded=false;
 if(w&&D.LogicalSize){
  const sf=await tryA(()=>w.scaleFactor(),1)||1;
  const sz=await tryA(()=>w.innerSize(),null),pos=await tryA(()=>w.outerPosition(),null);
  if(sz){c.w=Math.round(sz.width/sf);c.h=Math.round(sz.height/sf)}
  if(pos){c.x=pos.x;c.y=pos.y}
  save();
  await tryA(()=>w.setAlwaysOnTop(false));
  await tryA(()=>w.setSize(new D.LogicalSize!(Math.max(360,saved.w||1280),Math.max(520,saved.h||800))));
  await tryA(()=>w.setMinSize(new D.LogicalSize!(360,520)));
  if(Number.isFinite(saved.x)&&Number.isFinite(saved.y)&&D.PhysicalPosition)await tryA(()=>w.setPosition(new D.PhysicalPosition!(saved.x!,saved.y!)));
  if(saved.max)await tryA(()=>w.maximize());
  /* back to full screen if that is where the mini player was opened from */
  if(saved.fs){await tryA(()=>w.setFullscreen(true));document.documentElement.dataset.fullscreen="true"}}
 MINI.on=false;MINI.saved=null;
 if(MINI.el){MINI.el.dataset.open="false";MINI.el.hidden=true}
 delete document.documentElement.dataset.mini;
 try{window.MWFX?.flow?.host?.(null)}catch(_){}
 $("minibtn")?.focus({preventScroll:true})}

async function miniToggle(on?:boolean|null){
 on=on??!MINI.on;
 if(on===MINI.on||MINI.busy)return;
 MINI.busy=true;
 try{if(on)await miniEnter();else await miniExit()}
 catch(e){console.warn("[meowave] mini:",e);toast(t("mini.err"))}
 finally{MINI.busy=false}}

/* Entry points: a button in the player bar and Ctrl+M. */
function miniButton(){
 const right=document.querySelector(".bar .right"),exp=$("expand");
 if(!right||$("minibtn"))return;
 const b=document.createElement("button");
 b.className="ic";b.id="minibtn";
 b.innerHTML=IC("picture_in_picture_alt");
 right.insertBefore(b,exp||null);
 b.addEventListener("click",()=>miniToggle(true));
 miniBtnLabel()}
function miniBtnLabel(){const b=$("minibtn");if(!b)return;const l=t("mini.on");b.title=l;b.setAttribute("aria-label",l)}
addEventListener("keydown",e=>{
 if(!(e.ctrlKey||e.metaKey)||e.altKey||e.code!=="KeyM")return;
 if((e.target as HTMLElement|null)?.matches?.("input,textarea")||(e.target as HTMLElement|null)?.isContentEditable)return;
 e.preventDefault();miniToggle()});

/* Language switches repaint labels that live outside data-i18n. */
const prevI18n=window.applyI18n;
if(typeof prevI18n==="function")window.applyI18n=function(this:unknown){
 const r=prevI18n.apply(this,arguments as unknown as []);
 try{miniBtnLabel();miniLabels();MINI.key="";miniPaint();iconPicker()}catch(_){}
 return r};

/* ═════════════════════════ app icon ═════════════════════════
   Round 5: the icon comes in colours and without a background. The choice
   drives the running window's icon (taskbar / Alt-Tab) through setIcon and
   every logo inside the app. «Без фона · авто» follows the system theme for
   the window (that is what the taskbar wears) and the app theme inside. */
const APP_ICONS=["classic","clear-auto","clear-light","clear-dark","midnight","ocean","mint","sunset","sakura","lavender","gold","paper"];
/* Round 6: the neon variants are gone (no neon anywhere); «Классика» is the
   default and what the exe ships with, so a fresh start needs no setIcon. */
const ICON_DEFAULT="classic";
const iconId=()=>APP_ICONS.includes(S.x?.appIcon!)?S.x.appIcon!:ICON_DEFAULT;
function iconFile(id:string,forWindow:boolean){
 if(id!=="clear-auto")return id;
 const dark=forWindow?matchMedia("(prefers-color-scheme: dark)").matches:document.documentElement.dataset.theme!=="light";
 return dark?"clear-light":"clear-dark"}
const iconUrl=(f:string)=>`./icons/app/${f}.png`;
function iconLogos(){
 const u=iconUrl(iconFile(iconId(),false));
 document.querySelectorAll(".rail-logo,.tb-icon,.splash-mark img,.about-app-icon").forEach(img=>{if(img.getAttribute("src")!==u)img.setAttribute("src",u)});
 const l=document.querySelector('link[rel="icon"]');if(l&&l.getAttribute("href")!==u)l.setAttribute("href",u)}
let ICON_SET="";
async function iconWindow(){
 if(!TAURI)return;
 const f=iconFile(iconId(),true);
 if(ICON_SET===f)return;
 /* The exe already carries the default variant: a fresh start needs no call. */
 if(!ICON_SET&&f===ICON_DEFAULT){ICON_SET=f;return}
 const w=curWin(),I=window.__TAURI__?.image?.Image;
 if(!w?.setIcon||!I?.new)return;
 try{
  const img=new Image();img.src=iconUrl(f);await img.decode();
  const n=256,c=document.createElement("canvas");c.width=c.height=n;
  const g=c.getContext("2d")!;g.drawImage(img,0,0,n,n);
  const px=g.getImageData(0,0,n,n).data;
  const icon=await I.new(new Uint8Array(px.buffer.slice(0)),n,n);
  await w.setIcon(icon);ICON_SET=f}
 catch(e){console.warn("[meowave] icon:",(e as Error)?.message||e)}}
function iconPicker(){
 const host=$("appicons");if(!host)return;
 const cur=iconId();
 host.setAttribute("aria-label",t("set.icon"));
 host.innerHTML=APP_ICONS.map(id=>`<button type="button" class="appicon" role="radio" data-appicon="${id}" ${id.startsWith("clear")?`data-clear="${iconFile(id,false).slice(6)}"`:""} aria-checked="${id===cur}" title="${esc(t("ico."+id))}"><span class="appicon-pv"><img src="${iconUrl(iconFile(id,false))}" alt="" width="40" height="40" draggable="false"></span><span class="appicon-l">${esc(t("ico."+id))}</span></button>`).join("")}
function iconApply(){iconLogos();iconWindow()}
document.addEventListener("click",e=>{
 const b=(e.target as Element).closest?.<HTMLElement>("#appicons [data-appicon]");if(!b)return;
 if(b.dataset.appicon===iconId())return;
 S.x.appIcon=b.dataset.appicon;save();iconPicker();iconApply();
 toast(t("ico.set"),2400,{icon:"check_circle"})});
try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{if(iconId()==="clear-auto")iconWindow()})}catch(_){}
new MutationObserver(()=>{iconPicker();if(iconId()==="clear-auto")iconLogos()}).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});

function init(){miniButton();ytcPanelInit();altSwitchInit();iconPicker();iconApply()}
init();
window.MW3={dialog,layer,toast,copyText,pickSource,failDetails,ytcDialog,miniToggle,altNote,altInfo,get miniOn(){return MINI.on}};
}
