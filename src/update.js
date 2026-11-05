/* update.js — the version and updates (Настройки → О приложении).
   The number comes from Rust (src-tauri/tauri.conf.json is the only source;
   scripts/version.mjs keeps the copies equal) and reads "Beta 3.2".
   Installed builds update from signed GitHub releases. A source checkout
   (npm run dev) checks the branch it tracks at launch and updates with
   git pull; `tauri dev` then rebuilds and restarts the window by itself.
   Loaded after app.js and m3.js, so their globals (t, inv, toast, esc,
   TAURI, LANG) are in scope. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const tf=(k,vars)=>{let s=t(k);for(const [a,b] of Object.entries(vars||{}))s=s.split(`{${a}}`).join(String(b));return s};

Object.assign(I18N.ru,{
 "upd.latest":"{v} — актуальная версия",
 "upd.latest.t":"Установлена актуальная версия — {v}",
 "upd.src":"Сборка из исходников: при запуске проверяем ветку {b} на GitHub, обновление — git pull одной кнопкой, окно перезапустится само.",
 "upd.changes":"Что нового",
 "upd.behind":"Новых изменений: {n}",
 "upd.schema":"В обновлении есть изменения базы данных. После него выполните supabase/FULL_SCHEMA.sql в Supabase (SQL Editor → вставить → Run) — скрипт можно запускать повторно.",
 "upd.later":"Позже",
 "upd.pulling":"Скачиваем обновление (git pull)…",
 "upd.pulled":"Обновлено до {v}",
 "upd.rebuild":"Пересобираем приложение — окно перезапустится само через минуту-две. Если этого не случилось, запустите npm run dev заново.",
 "upd.nothing":"Изменения не касаются самого приложения — перезапуск не нужен.",
 "upd.e.git":"Git не найден. Установите Git или обновитесь вручную: git pull",
 "upd.e.up":"У ветки нет удалённой ветки на GitHub — выполните git pull вручную",
 "upd.e.time":"GitHub не ответил вовремя — проверьте сеть и попробуйте ещё раз",
 "upd.e.auth":"Нет доступа к репозиторию. Проверьте вход в GitHub: выполните git pull в терминале один раз",
 "upd.e.local":"git pull не прошёл: в папке есть свои изменения или коммиты, которые мешают. Ничего не тронуто:",
 "upd.e.src":"Это сборка из исходников — обновляется через git pull",
 "upd.auto":"Доступна {v} — Настройки → О приложении",
 "upd.open":"Обновить"
});
Object.assign(I18N.en,{
 "upd.latest":"{v} — up to date",
 "upd.latest.t":"You have the latest version — {v}",
 "upd.src":"Built from source: at startup we check branch {b} on GitHub; updating is a one-click git pull and the window restarts by itself.",
 "upd.changes":"What’s new",
 "upd.behind":"New changes: {n}",
 "upd.schema":"This update changes the database. Afterwards run supabase/FULL_SCHEMA.sql in Supabase (SQL Editor → paste → Run) — the script is safe to run again.",
 "upd.later":"Later",
 "upd.pulling":"Downloading the update (git pull)…",
 "upd.pulled":"Updated to {v}",
 "upd.rebuild":"Rebuilding — the window restarts by itself in a minute or two. If it does not, run npm run dev again.",
 "upd.nothing":"The changes do not touch the app itself — no restart needed.",
 "upd.e.git":"Git was not found. Install Git or update by hand: git pull",
 "upd.e.up":"This branch has no upstream on GitHub — run git pull by hand",
 "upd.e.time":"GitHub did not answer in time — check the network and try again",
 "upd.e.auth":"No access to the repository. Check your GitHub sign-in: run git pull in a terminal once",
 "upd.e.local":"git pull failed: local changes or commits are in the way. Nothing was touched:",
 "upd.e.src":"This is a build from source — it updates with git pull",
 "upd.auto":"{v} is available — Settings → About",
 "upd.open":"Update"
});

let VER=null;
async function version(){
 if(VER)return VER;
 try{VER=await inv("app_version")}catch(e){console.warn("app_version:",e)}
 return VER||{version:"",label:"",source:false}}
const label=v=>v?.label||v?.version||"Meowave";

async function paint(){
 if(!TAURI)return;
 const v=await version();
 const el=$("appver");
 if(el&&v.version){
  const extra=v.source&&v.commit?` · ${v.branch||"HEAD"} @ ${v.commit}`:"";
  el.textContent=`${v.label} (${v.version}${extra})`}
 /* The panel's description says how this copy updates. It stays a data-i18n
    element so switching the language rewrites it like everything else. */
 const s=document.querySelector('[data-i18n="upd.s"],[data-i18n="upd.s.src"]');
 if(s&&v.source){
  for(const L of ["ru","en"]){const d=I18N[L];if(d)d["upd.s.src"]=(d["upd.src"]||I18N.ru["upd.src"]).split("{b}").join(v.branch||"—")}
  s.dataset.i18n="upd.s.src";s.textContent=t("upd.s.src")}}

function why(e){
 const m=String(e?.message||e||"").replace(/^Error:\s*/,"");
 if(m==="git_missing")return t("upd.e.git");
 if(m==="no_upstream")return t("upd.e.up");
 if(m==="git_timeout")return t("upd.e.time");
 if(m==="source_checkout")return t("upd.e.src");
 if(/authentication|could not read username|permission denied|repository not found|403|401/i.test(m))return t("upd.e.auth");
 if(/not possible to fast-forward|would be overwritten|diverg|unmerged|conflict|uncommitted/i.test(m))return t("upd.e.local")+" "+m.slice(0,220);
 return m.slice(0,240)}

function changes(u){
 const lines=String(u.body||"").split("\n").map(s=>s.trim()).filter(Boolean).slice(0,12);
 let h="";
 if(u.kind==="git"&&u.behind)h+=`<p class="upd-n">${esc(tf("upd.behind",{n:u.behind}))}</p>`;
 if(lines.length)h+=`<p class="upd-h">${esc(t("upd.changes"))}</p><ul class="upd-list">${lines.map(l=>`<li>${esc(l)}</li>`).join("")}</ul>`;
 if(u.schema_changed)h+=`<p class="upd-warn">${esc(t("upd.schema"))}</p>`;
 return h||`<p>${esc(tf("upd.found",{v:u.new_label||u.version}))}</p>`}

async function install(u){
 if(u.kind!=="git"){
  toast(t("upd.installing"),20000);
  await inv("update_install");return}
 const tt=toast(t("upd.pulling"),60000,{icon:"downloading"});
 let r;
 try{r=await inv("update_pull")}finally{tt?.dismiss?.()}
 VER=null;
 toast(tf("upd.pulled",{v:r.label||r.version}),5000,{icon:"check_circle"});
 const st=$("upd-state");if(st)st.textContent=tf("upd.pulled",{v:r.label||r.version});
 const note=[r.rebuild?t("upd.rebuild"):t("upd.nothing")];
 if(r.schema_changed)note.push(t("upd.schema"));
 if(typeof window.mwDialog==="function")
  window.mwDialog({icon:"system_update",title:tf("upd.pulled",{v:r.label||r.version}),
   body:note.map(n=>`<p>${esc(n)}</p>`).join(""),actions:[{label:t("close"),primary:true}]});
 else toast(note.join(" "),9000)}

const SKIP="mw.upd.skip";
async function check(manual){
 if(!TAURI)return;
 const st=$("upd-state");
 if(manual&&st)st.textContent=t("upd.checking");
 const v=await version();
 let u;
 try{u=await inv("update_check")}catch(e){
  const msg=String(e?.message||e||"");
  /* No release published yet (installed builds) reads as "up to date". */
  if(/release JSON|404|not found|endpoint|failed to fetch/i.test(msg)&&!v.source){
   if(st)st.textContent=tf("upd.latest",{v:label(v)});
   if(manual)toast(tf("upd.latest.t",{v:label(v)}),4000);
   return}
  if(st)st.textContent=`${label(v)} · ${why(e)}`;
  if(manual)toast(t("upd.fail")+": "+why(e),6000);
  return}
 if(!u?.available){
  if(st)st.textContent=tf("upd.latest",{v:u?.label||label(v)});
  if(manual)toast(tf("upd.latest.t",{v:u?.label||label(v)}),4000);
  return}
 const nv=u.new_label||u.version;
 if(st)st.textContent=tf("upd.found",{v:nv});
 /* At launch a dismissed version only gets a quiet snackbar, not the dialog
    again on every start. */
 const key=`${u.kind}:${u.version}:${u.behind||0}`;
 if(!manual&&localStorage.getItem(SKIP)===key){
  toast(tf("upd.auto",{v:nv}),8000,{icon:"system_update",actions:[{label:t("upd.open"),run:()=>check(true)}]});
  return}
 const go=async()=>{try{await install(u)}catch(e){toast(t("upd.fail")+": "+why(e),9000)}};
 if(typeof window.mwDialog==="function"){
  window.mwDialog({icon:"system_update",title:tf("upd.ask",{v:nv}),body:changes(u),cls:"upd-dlg",
   actions:[{label:t("upd.later"),run:()=>{localStorage.setItem(SKIP,key)}},
            {label:t("upd.install"),primary:true,icon:"download",run:()=>{go()}}]});
  return}
 if(await showModal({title:tf("upd.ask",{v:nv}),icon:"system_update",label:String(u.body||"").slice(0,300),input:false,confirm:t("upd.install")}))go();
 else localStorage.setItem(SKIP,key)}

window.mwUpdate={check,version,paint};
paint();
})();
