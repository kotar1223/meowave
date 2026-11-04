/* ── Messenger ────────────────────────────────────────────────────────
   Direct messages that behave like a messenger: the conversation list on the
   left, the open chat on the right (one at a time on a phone), a header that
   says who it is and what they are listening to, real replies (a quote that
   jumps to the original), edits, deletes, read receipts, photos, track cards
   and room invites. The room chat mounts the same log and composer.

   It replaced the "Chats" tab of People, where nothing reacted to a click,
   and group chats, which are gone from the UI (their tables stay so old rows
   are not lost).

   Transport is Supabase (public.messages, polling like the rest of SOC). The
   payload of every message follows the Quasar Messenger spec — `type` is
   text / music_card / listen_party_invite (+ image) — so moving to
   quasar.chat later swaps the transport functions, not the UI.

   Encryption (e2e.js): the payload is sealed on this device for every device
   of every participant; public.messages keeps ciphertext and wrapped keys.
   When someone in the conversation has no registered device yet (an older
   app), the message goes out unsealed as before, and the chat says so with an
   open lock — nothing is downgraded silently. */
"use strict";

Object.assign(I18N.ru,{
 "nav.msgs":"Чаты","ms.search":"Поиск","ms.new":"Новое сообщение","ms.friends":"Друзья",
 "ms.pick":"Выберите чат","ms.pick.s":"Сообщения шифруются на вашем устройстве — сервер хранит только шифротекст.",
 "ms.empty":"Пока нет переписок","ms.empty.s":"Добавьте друзей во вкладке «Люди» и напишите им.",
 "ms.nofound":"Ничего не найдено","ms.you":"Вы: ","ms.you.n":"Вы","ms.photo":"Фото","ms.track":"Трек",
 "ms.invite":"Приглашение в комнату","ms.locked":"Зашифровано для другого устройства",
 "ms.broken":"Не удалось расшифровать","ms.online":"в сети","ms.listening":"слушает",
 "ms.offline":"был(а) недавно","ms.today":"Сегодня","ms.yesterday":"Вчера","ms.unread":"Непрочитанные сообщения",
 "ms.reply":"Ответить","ms.copy":"Копировать текст","ms.edit":"Изменить","ms.del":"Удалить",
 "ms.del.q":"Удалить сообщение?","ms.del.s":"Оно исчезнет у вас и у собеседника.","ms.copied":"Скопировано",
 "ms.editing":"Редактирование","ms.replyto":"В ответ {name}","ms.edited":"изм.","ms.sent":"Отправлено",
 "ms.read":"Прочитано","ms.sending":"Отправляется…","ms.failed":"Не отправлено","ms.retry":"Повторить",
 "ms.e2e":"Сквозное шифрование","ms.e2e.on":"Сквозное шифрование: прочитать сообщения можете только вы и собеседник.",
 "ms.e2e.off":"{name} пока не обновил(а) Meowave — сообщения уходят без сквозного шифрования.",
 "ms.e2e.room.off":"Не у всех в комнате новая версия — чат комнаты пока без сквозного шифрования.",
 "ms.e2e.room.on":"Чат комнаты зашифрован для всех участников.",
 "ms.e2e.nosql":"На сервере не выполнена миграция 16 — ответы, правки и шифрование недоступны.",
 "ms.e2e.na":"Это окружение не поддерживает шифрование WebCrypto.",
 "ms.plain":"Без сквозного шифрования","ms.ph":"Сообщение","ms.attach":"Фото","ms.np":"Отправить текущий трек",
 "ms.np.none":"Сейчас ничего не играет","ms.listen":"Слушать вместе","ms.room":"Пригласить в мою комнату",
 "ms.noroom":"Сначала создайте комнату или зайдите в неё","ms.profile":"Профиль","ms.join":"Войти",
 "ms.play":"Слушать","ms.auth":"Войдите, чтобы переписываться","ms.notfriend":"Писать можно только друзьям",
 "ms.say":"Напишите первым","ms.q.gone":"Сообщение удалено","ms.back":"Назад","ms.send":"Отправить",
 "ms.cancel":"Отмена","ms.newdev":"Новый вход: {label}",
 "ms.newdev.s":"Если это были не вы — удалите устройство в Настройки → Приватность → Устройства шифрования.",
 "ms.room.old":"Сообщения до вашего входа зашифрованы для других участников",
 "ms.devs":"Устройства шифрования","ms.devs.s":"Ключи для сквозного шифрования личных сообщений. Удалите устройство, которым больше не пользуетесь — оно перестанет получать новые сообщения.",
 "ms.dev.this":"это устройство","ms.dev.rm":"Удалить","ms.dev.rm.q":"Удалить устройство?","ms.dev.none":"Пока ни одного устройства",
 "ms.dev.seen":"активно {ago}","ms.dev.key":"Отпечаток ключа"
});
Object.assign(I18N.en,{
 "nav.msgs":"Chats","ms.search":"Search","ms.new":"New message","ms.friends":"Friends",
 "ms.pick":"Choose a chat","ms.pick.s":"Messages are encrypted on your device — the server only keeps ciphertext.",
 "ms.empty":"No conversations yet","ms.empty.s":"Add friends in the People tab and say hi.",
 "ms.nofound":"Nothing found","ms.you":"You: ","ms.you.n":"You","ms.photo":"Photo","ms.track":"Track",
 "ms.invite":"Room invite","ms.locked":"Encrypted for another device","ms.broken":"Could not decrypt",
 "ms.online":"online","ms.listening":"listening to","ms.offline":"last seen recently","ms.today":"Today",
 "ms.yesterday":"Yesterday","ms.unread":"Unread messages","ms.reply":"Reply","ms.copy":"Copy text",
 "ms.edit":"Edit","ms.del":"Delete","ms.del.q":"Delete message?","ms.del.s":"It disappears for both of you.",
 "ms.copied":"Copied","ms.editing":"Editing","ms.replyto":"Reply to {name}","ms.edited":"edited",
 "ms.sent":"Sent","ms.read":"Read","ms.sending":"Sending…","ms.failed":"Not sent","ms.retry":"Retry",
 "ms.e2e":"End-to-end encrypted","ms.e2e.on":"End-to-end encrypted: only you and the other person can read these messages.",
 "ms.e2e.off":"{name} hasn't updated Meowave yet — messages go out without end-to-end encryption.",
 "ms.e2e.room.off":"Not everyone in the room has the new version — the room chat is not end-to-end encrypted yet.",
 "ms.e2e.room.on":"The room chat is encrypted for every member.",
 "ms.e2e.nosql":"Migration 16 has not been run on the server — replies, edits and encryption are unavailable.",
 "ms.e2e.na":"This environment has no WebCrypto, so messages cannot be encrypted.",
 "ms.plain":"Not end-to-end encrypted","ms.ph":"Message","ms.attach":"Photo","ms.np":"Send the current track",
 "ms.np.none":"Nothing is playing","ms.listen":"Listen together","ms.room":"Invite to my room",
 "ms.noroom":"Create or join a room first","ms.profile":"Profile","ms.join":"Join","ms.play":"Play",
 "ms.auth":"Sign in to chat","ms.notfriend":"You can only message friends","ms.say":"Say hi first",
 "ms.q.gone":"Message deleted","ms.back":"Back","ms.send":"Send","ms.cancel":"Cancel",
 "ms.newdev":"New sign-in: {label}",
 "ms.newdev.s":"If this wasn't you, remove the device in Settings → Privacy → Encryption devices.",
 "ms.room.old":"Messages from before you joined are encrypted for the other members",
 "ms.devs":"Encryption devices","ms.devs.s":"Keys for end-to-end encrypted direct messages. Remove a device you no longer use and it stops receiving new messages.",
 "ms.dev.this":"this device","ms.dev.rm":"Remove","ms.dev.rm.q":"Remove this device?","ms.dev.none":"No devices yet",
 "ms.dev.seen":"active {ago}","ms.dev.key":"Key fingerprint"
});

const MS={uid:"",open:null,peers:new Map(),peersAt:0,threads:[],last:new Map(),seen:new Map(),primed:false,
 unread:0,q:"",cache:new Map(),friends:null,friendsAt:0,schema:null,conv:null,room:null,pend:0,busy:false};
const msMe=()=>(typeof sbUser!=="undefined"&&sbUser?.id)||"";
const msName=p=>(p&&p.username)||t("chat.anon");
const msNoCol=e=>/column|PGRST204|42703/i.test(String(e?.message||e||""));
const msNoFn=e=>/function|PGRST202|42883/i.test(String(e?.message||e||""));
const msAad=r=>r.room_id
 ?`room|${r.room_id}|${r.sender}`
 :`dm|${[String(r.sender),String(r.recipient)].sort().join("|")}|${r.sender}`;
/* Muted name colours, one per person (Telegram does the same for groups). */
function msHue(id){let h=0;for(const ch of String(id||""))h=(h*31+ch.charCodeAt(0))>>>0;return [205,150,25,265,330,60,180][h%7]}

/* ── E2E: this device's key and everyone else's public ones ── */
const E2E={dev:null,priv:null,uid:null,keys:new Map(),srv:null,busy:null};
const e2eOk=()=>!!(window.MWE2E&&MWE2E.supported());
const e2eSlot=()=>E2E.uid&&E2E.dev?`${E2E.uid}:${E2E.dev.id}`:"";
function e2eLabel(){
 const ua=navigator.userAgent||"";
 const os=/Android/i.test(ua)?"Android":/iPhone|iPad|iPod/i.test(ua)?"iOS":/Mac OS X|Macintosh/i.test(ua)?"macOS"
  :/Windows/i.test(ua)?"Windows":/Linux|X11/i.test(ua)?"Linux":"?";
 return `${os} · ${typeof TAURI!=="undefined"&&TAURI?"Meowave":(LANG==="ru"?"браузер":"browser")}`}
async function e2eInit(){
 if(!e2eOk()||!sb||!msMe())return false;
 if(E2E.uid===msMe()&&E2E.priv)return true;
 if(E2E.busy)return E2E.busy;
 const uid=msMe();
 E2E.busy=(async()=>{
  const key="mw.e2e.dev."+uid;
  let dev=null,priv=null;
  try{dev=JSON.parse(localStorage.getItem(key)||"null")}catch(_){}
  if(dev&&dev.id&&dev.priv&&dev.pub){try{priv=await MWE2E.importPriv(dev.priv)}catch(_){priv=null}}
  if(!priv){
   dev=await MWE2E.newDevice();priv=await MWE2E.importPriv(dev.priv);
   try{localStorage.setItem(key,JSON.stringify(dev))}catch(e){console.warn("e2e: key not stored",e)}}
  if(msMe()!==uid)return false;
  E2E.dev=dev;E2E.priv=priv;E2E.uid=uid;E2E.keys.clear();E2E.srv=null;
  const {error}=await sb.from("e2e_devices").upsert(
   {user_id:uid,device_id:dev.id,pub:dev.pub,label:e2eLabel()},{onConflict:"user_id,device_id"});
  if(error){
   const m=String(error.message||error);
   console.warn("e2e register:",m);
   /* No table: the server predates migration 16. Anything else (offline, a
      hiccup) is retried by the next init. */
   E2E.srv=/e2e_devices|relation|schema cache|PGRST20[25]|42P01/i.test(m)?false:null;
   if(E2E.srv===false)MS.schema=false}
  else{E2E.srv=true;setTimeout(e2eHousekeeping,6000)}
  return true})().catch(e=>{console.warn("e2e init:",e?.message||e);return false}).finally(()=>{E2E.busy=null});
 return E2E.busy}
/* A device added while this one is running (a phone signed in an hour ago)
   gets the history shared without waiting for this app to restart. */
setInterval(()=>{if(E2E.srv&&E2E.dev&&!document.hidden&&msMe()===E2E.uid)e2eHousekeeping().catch(()=>{})},120000);
/* {targets:[{slot,pub}], missing:[uid]} for a set of participants. */
async function e2eTargets(uids){
 const now=Date.now(),all=[...new Set(uids.map(String))];
 const need=all.filter(u=>{const c=E2E.keys.get(u);return !c||now-c.at>60000});
 if(need.length){
  const {data,error}=await sb.from("e2e_devices").select("user_id,device_id,pub").in("user_id",need);
  if(error)throw error;
  const fresh=new Map(need.map(u=>[u,{at:now,list:[]}]));
  for(const r of data||[]){
   try{fresh.get(String(r.user_id))?.list.push({slot:`${r.user_id}:${r.device_id}`,dev:r.device_id,pub:await MWE2E.importPub(r.pub)})}
   catch(_){/* a malformed key is skipped, not fatal */}}
  fresh.forEach((v,k)=>E2E.keys.set(k,v))}
 const targets=[],missing=[];
 for(const u of all){
  let l=E2E.keys.get(u)?.list||[];
  /* This device can always read its own messages, registered or not. */
  if(u===E2E.uid&&!l.some(x=>x.dev===E2E.dev.id))
   l=[...l,{slot:e2eSlot(),dev:E2E.dev.id,pub:await MWE2E.importPub(E2E.dev.pub)}];
  if(!l.length)missing.push(u);
  targets.push(...l)}
 return {targets,missing}}
/* Fields for a sealed row, or null when someone has no device (plain send). */
async function msSeal(uids,payload,rowLike){
 if(MS.schema===false||!(await e2eInit())||E2E.srv===false)return null;
 const {targets,missing}=await e2eTargets(uids);
 if(missing.length)return null;
 const s=await MWE2E.seal(targets,payload,msAad(rowLike));
 return {body:"🔒",image:null,ciphertext:s.ciphertext,e2e:s.e2e}}
/* A new own device appeared: say so (it could be someone else), and hand it
   the keys to recent history so it does not open on a wall of locks. */
async function e2eHousekeeping(){
 if(!E2E.srv||msMe()!==E2E.uid)return;
 const {data,error}=await sb.from("e2e_devices").select("device_id,pub,label,created_at").eq("user_id",E2E.uid);
 if(error||!data)return;
 const kk="mw.e2e.known."+E2E.uid,sk="mw.e2e.shared."+E2E.uid;
 let known,shared;
 try{known=new Set(JSON.parse(localStorage.getItem(kk)||"[]"))}catch(_){known=new Set()}
 try{shared=new Set(JSON.parse(localStorage.getItem(sk)||"[]"))}catch(_){shared=new Set()}
 const others=data.filter(d=>d.device_id!==E2E.dev.id);
 if(known.size)others.filter(d=>!known.has(d.device_id)).forEach(d=>
  notify(t("ms.newdev").replace("{label}",d.label||"?"),t("ms.newdev.s"),{icon:"devices",ms:10000}));
 data.forEach(d=>known.add(d.device_id));
 try{localStorage.setItem(kk,JSON.stringify([...known].slice(-40)))}catch(_){}
 const todo=others.filter(d=>!shared.has(d.device_id));
 if(!todo.length)return;
 try{
  await e2eShareHistory(todo);
  todo.forEach(d=>shared.add(d.device_id));
  localStorage.setItem(sk,JSON.stringify([...shared].slice(-40)))}
 catch(e){console.warn("e2e share:",e?.message||e)}}
async function e2eShareHistory(devs){
 const targets=[];
 for(const d of devs){try{targets.push({slot:`${E2E.uid}:${d.device_id}`,pub:await MWE2E.importPub(d.pub)})}catch(_){}}
 if(!targets.length)return;
 const me=E2E.uid,slot=e2eSlot();
 const {data,error}=await sb.from("messages").select("id,e2e").not("e2e","is",null)
  .or(`sender.eq.${me},recipient.eq.${me}`).order("id",{ascending:false}).limit(600);
 if(error)throw error;
 const items=[];
 for(const r of data||[]){
  const k=r.e2e?.k||{};
  if(!k[slot])continue;
  const need=targets.filter(x=>!k[x.slot]);
  if(!need.length)continue;
  try{const add=await MWE2E.rewrap(r.e2e,slot,E2E.priv,need);if(add)items.push({id:r.id,k:add})}catch(_){}}
 for(let i=0;i<items.length;i+=100){
  const {error:e2}=await sb.rpc("e2e_add_keys",{items:items.slice(i,i+100)});
  if(e2)throw e2}}

/* ── payloads ── */
const MS_IMG=/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
function msClean(p){
 if(!p||typeof p!=="object")return {type:"broken"};
 const s=(v,n)=>typeof v==="string"?v.slice(0,n):(typeof v==="number"?String(v).slice(0,n):"");
 const out={type:["text","image","music_card","listen_party_invite"].includes(p.type)?p.type:"text",text:s(p.text,4000)};
 if(out.type==="image"){const im=s(p.image,300000);if(MS_IMG.test(im))out.image=im;else out.type="text"}
 if(out.type==="music_card"){
  const x=p.track||{};
  out.track={s:s(x.s,24),id:s(x.id,300),t:s(x.t,300),a:s(x.a,300),al:s(x.al,300),art:s(x.art,2000),d:Math.max(0,+x.d||0)};
  if(!out.track.t)out.type="text"}
 if(out.type==="listen_party_invite"){
  const r=p.room||{},x=p.track||{};
  out.room={id:s(r.id,64),code:s(r.code,12).toUpperCase(),name:s(r.name,80)};
  out.track={t:s(x.t,300),a:s(x.a,300)};
  if(!JOIN_RE.test(out.room.code))out.type="text"}
 return out}
function msLegacy(r){
 const im=typeof r.image==="string"&&MS_IMG.test(r.image)?r.image:null;
 return {type:im?"image":"text",text:r.body&&r.body!=="🔒"?r.body:(im?"":r.body||""),image:im,sealed:false}}
function msPlainFields(p){
 if(p.type==="image")return {body:p.text||"",image:p.image};
 if(p.type==="music_card")return {body:`${p.text?p.text+"\n":""}🎵 ${p.track.a||"?"} — ${p.track.t}`,image:null};
 if(p.type==="listen_party_invite")return {body:`${p.room.name||t("ms.invite")} — ${p.room.code}`,image:null};
 return {body:p.text,image:null}}
async function msOpen(r){
 if(!r.ciphertext||!r.e2e)return msLegacy(r);
 const ck=`${r.id}|${r.edited_at||""}|${Object.keys(r.e2e.k||{}).length}`;
 const hit=MS.cache.get(ck);if(hit)return hit;
 let p;
 if(!(await e2eInit()))p={type:"locked"};
 else{
  try{const o=await MWE2E.open(r,e2eSlot(),E2E.priv,msAad(r));p=o?msClean(o):{type:"locked"}}
  catch(_){p={type:"broken"}}}
 p.sealed=true;
 MS.cache.set(ck,p);
 if(MS.cache.size>4000)MS.cache.delete(MS.cache.keys().next().value);
 return p}
function msPreview(p){
 if(!p)return "";
 if(p.type==="locked")return "🔒 "+t("ms.locked");
 if(p.type==="broken")return t("ms.broken");
 if(p.type==="image")return "🖼 "+(p.text||t("ms.photo"));
 if(p.type==="music_card")return "🎵 "+(p.track?.a?p.track.a+" — ":"")+(p.track?.t||t("ms.track"));
 if(p.type==="listen_party_invite")return "🎧 "+(p.room?.name||t("ms.invite"));
 return String(p.text||"").replace(/\s+/g," ").trim()}

/* ── time ── */
const msLoc=()=>LANG==="ru"?"ru-RU":"en-GB";
const msDay=ts=>{const d=new Date(ts);return isNaN(d)?"":`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`};
function msClock(ts){const d=new Date(ts);return isNaN(d)?"":d.toLocaleTimeString(msLoc(),{hour:"2-digit",minute:"2-digit"})}
function msDayLabel(ts){
 const d=new Date(ts),n=new Date();
 if(msDay(d)===msDay(n))return t("ms.today");
 if(msDay(d)===msDay(n.getTime()-864e5))return t("ms.yesterday");
 return d.toLocaleDateString(msLoc(),{day:"numeric",month:"long",...(d.getFullYear()!==n.getFullYear()?{year:"numeric"}:{})})}
function msListTime(ts){
 const d=new Date(ts),n=Date.now();
 if(isNaN(d))return "";
 if(msDay(d)===msDay(n))return msClock(d);
 if(n-d<6*864e5)return d.toLocaleDateString(msLoc(),{weekday:"short"});
 return d.toLocaleDateString(msLoc(),{day:"2-digit",month:"2-digit",year:"2-digit"})}

/* ── server ── */
const msPair=(q,peer)=>{const me=msMe();
 return q.or(`and(recipient.eq.${peer},sender.eq.${me}),and(recipient.eq.${me},sender.eq.${peer})`)};
const msFilter=(q,c)=>c.kind==="room"?q.eq("room_id",c.room):msPair(q,c.peer);
async function msEnsurePeers(ids){
 if(Date.now()-MS.peersAt>10*60000){MS.peers.clear();MS.peersAt=Date.now()}
 const need=[...new Set((ids||[]).map(String))].filter(id=>id&&!MS.peers.has(id));
 if(!need.length)return;
 let r=await sb.from("profiles").select("id,username,avatar_url,privacy,equipped_badge,equipped_badges").in("id",need);
 if(r.error)r=await sb.from("profiles").select("id,username,avatar_url,privacy").in("id",need);
 (r.data||[]).forEach(p=>MS.peers.set(String(p.id),maskProf(p)));
 need.forEach(id=>{if(!MS.peers.has(id))MS.peers.set(id,{id,username:t("chat.anon")})})}
async function msLoadFriends(force){
 if(!force&&MS.friends&&Date.now()-MS.friendsAt<60000)return MS.friends;
 const me=msMe();
 const {data,error}=await sb.from("friendships").select("requester,addressee,status")
  .or(`requester.eq.${me},addressee.eq.${me}`).eq("status","accepted");
 if(error)return MS.friends||[];
 const ids=(data||[]).map(f=>String(f.requester===me?f.addressee:f.requester));
 await msEnsurePeers(ids);
 MS.friends=ids;MS.friendsAt=Date.now();
 return ids}
async function msLoadThreads(){
 const me=msMe();if(!me)return;
 let th;
 const r=await sb.rpc("dm_threads");
 if(!r.error)th=(r.data||[]).map(x=>({peer:String(x.peer),last_id:+x.last_id,unread:+x.unread||0}));
 else{
  if(msNoFn(r.error))MS.schema=false;
  const {data,error}=await sb.from("messages").select("id,sender,recipient")
   .or(`recipient.eq.${me},sender.eq.${me}`).is("room_id",null).is("chat_id",null)
   .order("id",{ascending:false}).limit(300);
  if(error)throw error;
  const m=new Map();
  (data||[]).forEach(x=>{const p=String(x.sender===me?x.recipient:x.sender);if(p&&!m.has(p))m.set(p,{peer:p,last_id:x.id,unread:0})});
  th=[...m.values()]}
 const need=th.filter(x=>MS.last.get(x.peer)?.id!==x.last_id).map(x=>x.last_id);
 if(need.length){
  const {data}=await sb.from("messages").select("*").in("id",need.slice(0,120));
  for(const row of data||[])MS.last.set(String(row.sender===me?row.recipient:row.sender),row)}
 await msEnsurePeers(th.map(x=>x.peer));
 await Promise.all(th.slice(0,60).map(x=>{const row=MS.last.get(x.peer);return row?msOpen(row).then(p=>{x.p=p}):null}));
 if(msMe()!==me)return;
 MS.threads=th;
 msRecount();
 await msNotifyNew(th);
 presLoad(th.map(x=>x.peer))}
function msRecount(){
 const viewing=S.view==="chats"&&!document.hidden;
 MS.unread=MS.threads.reduce((n,x)=>n+(viewing&&MS.open===x.peer?0:x.unread),0);
 const b=document.getElementById("msg-badge");
 if(b){b.hidden=!MS.unread;b.textContent=MS.unread>99?"99+":String(MS.unread)}
 document.getElementById("nav-more-btn")?.classList.toggle("has-dot",MS.unread>0)}
async function msNotifyNew(th){
 const me=msMe();
 for(const x of th){
  const prev=MS.seen.get(x.peer);
  MS.seen.set(x.peer,x.last_id);
  if(!MS.primed||(prev!==undefined&&x.last_id<=prev))continue;
  const row=MS.last.get(x.peer);
  if(!row||row.sender===me||row.read_at)continue;
  if(MS.open===x.peer&&S.view==="chats"&&!document.hidden)continue;
  const p=x.p||await msOpen(row);
  notify(msName(MS.peers.get(x.peer)),msPreview(p).slice(0,140),{icon:"chat",onClick:()=>msgrOpen(x.peer)})}
 MS.primed=true}
async function msSend(c,payload,replyTo){
 const me=msMe();
 const base=c.kind==="room"?{room_id:c.room,sender:me}:{recipient:c.peer,sender:me};
 let fields=null;
 try{fields=await msSeal(msUids(c),payload,base)}
 catch(e){
  /* The peer has keys but sealing failed: refuse rather than leak. */
  if(!/e2e_devices|relation|schema cache|PGRST20[25]|42P01/i.test(String(e?.message||e)))throw e;
  MS.schema=false}
 c.sealed=!!fields;msBanner(c);
 const row={...base,...(fields||msPlainFields(payload))};
 if(replyTo&&MS.schema!==false)row.reply_to=replyTo;
 let r=await sb.from("messages").insert(row).select().single();
 if(r.error&&msNoCol(r.error)){
  MS.schema=false;c.sealed=false;msBanner(c);
  r=await sb.from("messages").insert({...base,...msPlainFields(payload)}).select().single()}
 return r}
async function msEditSend(c,row,payload){
 let fields=null;
 if(row.ciphertext){try{fields=await msSeal(msUids(c),payload,row)}catch(e){throw e}}
 if(!fields)fields={...msPlainFields(payload),...(row.ciphertext?{ciphertext:null,e2e:null}:{})};
 const r=await sb.from("messages").update(fields).eq("id",row.id).select().single();
 if(r.error&&/PGRST116|0 rows|multiple \(or no\)/i.test(String(r.error.message)))r.error={message:t("ms.e2e.nosql")};
 return r}
const msUids=c=>c.kind==="room"
 ?[...new Set([msMe(),...(SOC.roomMembers||[]).map(m=>String(m.user_id))])]
 :[msMe(),c.peer];
function msErr(e){
 const m=String(e?.message||e||"");
 if(/row-level security|violates row-level|42501/i.test(m))return t("ms.notfriend");
 return m||t("ms.failed")}

/* ── shell & list ── */
function msShell(root){
 root.innerHTML=`
  <aside class="msgr-side">
   <div class="msgr-side-hd"><h2>${t("nav.msgs")}</h2>
    <button class="ic" id="msgr-new" title="${t("ms.new")}"><span class="material-symbols-rounded">edit_square</span></button></div>
   <label class="msgr-search"><span class="material-symbols-rounded">search</span>
    <input id="msgr-q" type="search" placeholder="${t("ms.search")}" autocomplete="off" spellcheck="false"></label>
   <div class="msgr-list" id="msgr-list" role="listbox"></div>
  </aside>
  <section class="msgr-main" id="msgr-main"></section>`;
 const q=root.querySelector("#msgr-q");
 q.value=MS.q;
 q.addEventListener("input",()=>{MS.q=q.value.trim().toLowerCase();msPaintList()});
 root.querySelector("#msgr-new").onclick=()=>{q.focus();q.select();MS.q="";q.value="";msPaintList(true)};
 root.querySelector("#msgr-list").addEventListener("click",e=>{
  const b=e.target.closest("[data-peer]");if(b)msgrOpen(b.dataset.peer)})}
function msRowHtml(peer,x){
 const p=MS.peers.get(peer)||{id:peer};
 const row=MS.last.get(peer);
 const mine=row&&row.sender===msMe();
 const prev=x?.p?msPreview(x.p):"";
 const tick=mine&&row?`<span class="material-symbols-rounded mli-tick${row.read_at?" read":""}">${row.read_at?"done_all":"check"}</span>`:"";
 return `<button class="mli${MS.open===peer?" on":""}" data-peer="${esc(peer)}" role="option" aria-selected="${MS.open===peer}">
  ${avat(p,48,presStatus(peer)||null)}
  <span class="mli-main">
   <span class="mli-top"><b>${esc(msName(p))}</b>${row?`<span class="mli-time">${tick}${esc(msListTime(row.sent_at))}</span>`:""}</span>
   <span class="mli-bot"><span class="mli-last">${prev?`${mine?`<i>${t("ms.you")}</i>`:""}${esc(prev.slice(0,90))}`:esc(presTrack(peer)?`🎧 ${presTrack(peer).t}`:"")}</span>
    ${x?.unread?`<b class="mli-unread">${x.unread>99?"99+":x.unread}</b>`:""}</span>
  </span></button>`}
function msPaintList(showFriends){
 const list=document.getElementById("msgr-list");if(!list)return;
 const q=MS.q;
 const match=id=>!q||msName(MS.peers.get(id)).toLowerCase().includes(q);
 const th=MS.threads.filter(x=>match(x.peer));
 const inTh=new Set(MS.threads.map(x=>x.peer));
 const fr=(MS.friends||[]).filter(id=>!inTh.has(id)&&match(id));
 let html=th.map(x=>msRowHtml(x.peer,x)).join("");
 if(fr.length&&(q||showFriends||!th.length||fr.length<=8))
  html+=`<p class="msgr-sec">${t("ms.friends")}</p>`+fr.map(id=>msRowHtml(id,null)).join("");
 if(!html)html=q?`<div class="msgr-none"><span class="material-symbols-rounded">search_off</span><p>${t("ms.nofound")}</p></div>`
  :`<div class="msgr-none"><span class="material-symbols-rounded">forum</span><b>${t("ms.empty")}</b><p>${t("ms.empty.s")}</p></div>`;
 if(list.dataset.html!==html){list.dataset.html=html;list.innerHTML=html}
 else list.querySelectorAll("[data-peer]").forEach(b=>{const on=b.dataset.peer===MS.open;b.classList.toggle("on",on);b.setAttribute("aria-selected",on)})}
function msPaintEmpty(){
 const main=document.getElementById("msgr-main");if(!main)return;
 MS.conv=null;
 document.getElementById("msgr")?.setAttribute("data-open","false");
 main.innerHTML=`<div class="msgr-pick"><span class="material-symbols-rounded">chat</span><b>${t("ms.pick")}</b><p>${t(e2eOk()?"ms.pick.s":"ms.e2e.na")}</p></div>`}

async function renderMessenger(){
 const root=document.getElementById("msgr");if(!root)return;
 if(!sb||!msMe()){
  root.dataset.open="false";root.dataset.auth="false";
  root.innerHTML=`<div class="msgr-auth"></div>`;
  needAuth(root.firstElementChild);return}
 if(MS.uid!==msMe())msReset();
 if(root.dataset.auth!=="true"||!root.querySelector(".msgr-side")){root.dataset.auth="true";msShell(root)}
 msPaintList();
 if(MS.open&&MS.conv?.peer===MS.open&&root.querySelector(".mconv"))root.dataset.open="true";
 else if(MS.open)msOpenConv(MS.open);
 else msPaintEmpty();
 socTimer("msgr",msTick,3000);
 try{await Promise.all([msLoadThreads(),msLoadFriends()]);msPaintList()}
 catch(e){const l=document.getElementById("msgr-list");if(l)l.innerHTML=socErrBox(socialFail(e))}}
function msReset(){
 MS.uid=msMe();MS.open=null;MS.conv=null;MS.threads=[];MS.last.clear();MS.seen.clear();MS.primed=false;
 MS.peers.clear();MS.friends=null;MS.cache.clear();MS.unread=0;MS.schema=null;msRecount()}
let msTickN=0;
async function msTick(){
 if(document.hidden||!msMe()||S.view!=="chats")return;
 if(MS.busy)return;MS.busy=true;
 try{
  if(MS.conv&&MS.conv.root?.isConnected)await msPollConv(MS.conv);
  if(++msTickN%3===0){await msLoadThreads();msPaintList();if(MS.conv)msPaintHead(MS.conv)}}
 catch(e){console.warn("messenger:",e?.message||e)}
 finally{MS.busy=false}}
/* Unread badge and notifications while the messenger is closed. */
setInterval(()=>{
 if(!msMe()||document.hidden||S.view==="chats"||MS.busy)return;
 if(MS.uid!==msMe())msReset();
 MS.busy=true;
 msLoadThreads().catch(e=>console.warn("messenger bg:",e?.message||e)).finally(()=>{MS.busy=false})},15000);
setTimeout(()=>{if(msMe()){if(MS.uid!==msMe())msReset();msLoadThreads().catch(()=>{});e2eInit()}},4000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&MS.conv&&S.view==="chats"){msMarkRead(MS.conv);msRecount()}});

function msgrOpen(peer){
 peer=String(peer||"");if(!peer||!msMe()||peer===msMe())return;
 /* First open of the session (e.g. "Message" on a profile right after
    start-up): reset now, or renderMessenger's reset would drop the peer. */
 if(MS.uid!==msMe())msReset();
 MS.open=peer;
 if(S.view!=="chats")go("chats");
 else msOpenConv(peer)}

/* ── conversation ── */
function msConvNew(kind,id){
 return {kind,peer:kind==="dm"?String(id):null,room:kind==="room"?id:null,rows:[],byId:new Map(),extra:new Map(),
  pay:new Map(),pending:[],lastId:0,oldestId:0,more:true,loading:false,pollN:0,firstUnread:null,root:null,
  reply:null,edit:null,sealed:null,sending:false,newBelow:0}}
function msComposerHtml(){
 return `<div class="mcomp">
  <div class="mctx" hidden><span class="material-symbols-rounded mctx-ic">reply</span>
   <span class="mctx-t"><b></b><span></span></span>
   <button class="ic" data-mc="x" title="${t("ms.cancel")}"><span class="material-symbols-rounded">close</span></button></div>
  <div class="mbar">
   <button class="ic" data-mc="att" title="${t("ms.attach")}"><span class="material-symbols-rounded">add_photo_alternate</span></button>
   <button class="ic" data-mc="np" title="${t("ms.np")}"><span class="material-symbols-rounded">music_note</span></button>
   <textarea class="minp" rows="1" maxlength="2000" placeholder="${t("ms.ph")}" autocomplete="off"></textarea>
   <button class="msend" data-mc="send" title="${t("ms.send")}" disabled><span class="material-symbols-rounded">send</span></button>
   <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
  </div></div>`}
function msConvHtml(c){
 const p=MS.peers.get(c.peer)||{id:c.peer};
 return `<div class="mconv" data-kind="dm">
  <header class="mhead">
   <button class="ic mback" data-mact="back" title="${t("ms.back")}"><span class="material-symbols-rounded">arrow_back</span></button>
   <span class="mwho" data-person="${esc(c.peer)}">
    <span class="mwho-av">${avat(p,40,presStatus(c.peer)||"offline")}</span>
    <span class="mwho-t"><b>${esc(msName(p))}</b><span class="mstat"></span></span></span>
   <span class="grow"></span>
   <span class="me2e" hidden><span class="material-symbols-rounded">lock</span></span>
   <button class="ic" data-mact="listen" title="${t("ms.listen")}" hidden><span class="material-symbols-rounded">headphones</span></button>
   <button class="ic" data-mact="invite" title="${t("ms.room")}"><span class="material-symbols-rounded">podcasts</span></button>
   <button class="ic" data-mact="profile" title="${t("ms.profile")}"><span class="material-symbols-rounded">person</span></button>
  </header>
  <div class="mbanner" hidden></div>
  <div class="mlog"><div class="mlog-in"></div></div>
  <button class="mdown" hidden title="↓"><span class="material-symbols-rounded">keyboard_arrow_down</span><b hidden></b></button>
  ${msComposerHtml()}</div>`}
async function msOpenConv(peer){
 const main=document.getElementById("msgr-main"),root=document.getElementById("msgr");
 if(!main||!root)return;
 const c=MS.conv=msConvNew("dm",peer);
 await msEnsurePeers([peer]);
 if(MS.conv!==c)return;
 main.innerHTML=msConvHtml(c);
 c.root=main.querySelector(".mconv");
 root.dataset.open="true";
 msWire(c);
 msPaintHead(c);
 msPaintList();
 icons();
 /* Fresh presence for the header right away, not on the next slow tick. */
 presLoad([peer]).then(()=>{if(MS.conv===c)msPaintHead(c)}).catch(()=>{});
 const th=MS.threads.find(x=>x.peer===peer);
 await msLoadOlder(c,true);
 if(MS.conv!==c)return;
 if(th?.unread){
  const first=c.rows.filter(r=>r.sender===peer&&!r.read_at)[0];
  if(first){c.firstUnread=first.id;msPaintLog(c);
   requestAnimationFrame(()=>c.root.querySelector(".munread")?.scrollIntoView({block:"center"}))}}
 msMarkRead(c);
 if(matchMedia("(pointer:fine)").matches)c.root.querySelector(".minp")?.focus();
 e2eInit().then(async ok=>{
  if(MS.conv!==c)return;
  if(!ok||E2E.srv===false){c.sealed=false;msBanner(c);return}
  try{const {missing}=await e2eTargets(msUids(c));c.sealed=!missing.length}catch(_){c.sealed=null}
  msBanner(c)})}
function msBanner(c){
 const root=c.root;if(!root)return;
 const ban=root.querySelector(".mbanner"),lock=root.querySelector(".me2e");
 let msg="",on=false;
 if(!e2eOk())msg=t("ms.e2e.na");
 else if(MS.schema===false)msg=t("ms.e2e.nosql");
 else if(c.sealed===false)msg=c.kind==="room"?t("ms.e2e.room.off"):t("ms.e2e.off").replace("{name}",msName(MS.peers.get(c.peer)));
 else if(c.sealed===true)on=true;
 if(ban){ban.hidden=!msg;ban.innerHTML=msg?`<span class="material-symbols-rounded">lock_open</span><span>${esc(msg)}</span>`:""}
 if(lock){lock.hidden=!on;lock.title=c.kind==="room"?t("ms.e2e.room.on"):t("ms.e2e.on")}}
function msPaintHead(c){
 if(c.kind!=="dm")return;
 const h=c.root?.querySelector(".mhead");if(!h)return;
 const p=MS.peers.get(c.peer)||{id:c.peer};
 const st=presStatus(c.peer),tr=presTrack(c.peer);
 const stat=h.querySelector(".mstat");
 const txt=tr?`${t("ms.listening")} ${tr.a?tr.a+" — ":""}${tr.t||""}`:st==="online"||st==="listening"?t("ms.online"):t("ms.offline");
 if(stat){stat.textContent=txt;stat.classList.toggle("on",!!(tr||st==="online"||st==="listening"))}
 const b=h.querySelector(".mwho-t b");if(b)b.textContent=msName(p);
 const lb=h.querySelector('[data-mact="listen"]');if(lb)lb.hidden=!tr}
async function msLoadOlder(c,initial){
 if(c.loading||!c.more)return;
 c.loading=true;
 const n=initial?50:40;
 try{
  let q=msFilter(sb.from("messages").select("*"),c).order("id",{ascending:false}).limit(n);
  if(!initial&&c.oldestId)q=q.lt("id",c.oldestId);
  const {data,error}=await q;
  if(error)throw error;
  if((data||[]).length<n)c.more=false;
  const log=c.root?.querySelector(".mlog");
  const h0=log?.scrollHeight||0,t0=log?.scrollTop||0;
  msMerge(c,data||[]);
  await msDecrypt(c);
  msPaintLog(c,{stick:initial,anim:false});
  if(!initial&&log)log.scrollTop=t0+(log.scrollHeight-h0)}
 catch(e){toast(socialFail(e))}
 finally{c.loading=false}}
function msMerge(c,rows){
 for(const r of rows){
  if(!r||r.id==null)continue;
  c.byId.set(r.id,r);
  if(r.id>c.lastId)c.lastId=r.id;
  if(!c.oldestId||r.id<c.oldestId)c.oldestId=r.id}
 c.rows=[...c.byId.values()].sort((a,b)=>a.id-b.id)}
/* Decrypts what is new and fetches reply targets that are not loaded. */
async function msDecrypt(c){
 for(const r of c.rows){
  const k=`${r.edited_at||""}|${r.ciphertext?Object.keys(r.e2e?.k||{}).length:0}`;
  if(c.pay.get(r.id)?._k===k)continue;
  const p={...await msOpen(r),_k:k};
  c.pay.set(r.id,p)}
 const missing=[...new Set(c.rows.map(r=>r.reply_to).filter(id=>id&&!c.byId.has(id)&&!c.extra.has(id)))];
 if(missing.length){
  const {data}=await sb.from("messages").select("*").in("id",missing.slice(0,50));
  for(const r of data||[]){c.extra.set(r.id,r);c.pay.set(r.id,await msOpen(r))}
  missing.forEach(id=>{if(!c.extra.has(id))c.extra.set(id,null)})}}
async function msPollConv(c){
 if(c.loading)return;
 const {data,error}=await msFilter(sb.from("messages").select("*"),c).gt("id",c.lastId||0)
  .order("id",{ascending:true}).limit(100);
 if(error)return;
 let changed=false,incoming=0;
 if(data?.length){
  msMerge(c,data);changed=true;
  incoming=data.filter(r=>r.sender!==msMe()).length}
 if(c.rows.length&&++c.pollN%2===0){
  const cols=MS.schema===false?"id":"id,edited_at,read_at";
  let r=await msFilter(sb.from("messages").select(cols),c).gte("id",c.oldestId).order("id",{ascending:false}).limit(400);
  if(r.error&&msNoCol(r.error)){MS.schema=false;r=await msFilter(sb.from("messages").select("id"),c).gte("id",c.oldestId).limit(400)}
  if(!r.error){
   const meta=new Map((r.data||[]).map(x=>[x.id,x]));
   const refetch=[];
   for(const row of c.rows){
    const m=meta.get(row.id);
    if(!m){if(meta.size<400){c.byId.delete(row.id);c.pay.delete(row.id);changed=true}continue}
    if("edited_at" in m&&(m.edited_at||null)!==(row.edited_at||null))refetch.push(row.id);
    if("read_at" in m&&(m.read_at||null)!==(row.read_at||null)){row.read_at=m.read_at;changed=true}}
   if(refetch.length){
    const {data:rows}=await sb.from("messages").select("*").in("id",refetch);
    msMerge(c,rows||[]);changed=true}
   if(changed)c.rows=[...c.byId.values()].sort((a,b)=>a.id-b.id)}}
 /* "Encrypted for another device": another device of ours may have shared
    the key since (e2e_add_keys). Look again now and then. */
 if(c.rows.length&&c.pollN%10===5){
  const ids=c.rows.filter(r=>c.pay.get(r.id)?.type==="locked").map(r=>r.id).slice(-100);
  if(ids.length){
   const {data:ks}=await sb.from("messages").select("id,e2e").in("id",ids);
   for(const x of ks||[]){
    const row=c.byId.get(x.id);
    if(row&&x.e2e&&Object.keys(x.e2e.k||{}).length!==Object.keys(row.e2e?.k||{}).length){row.e2e=x.e2e;changed=true}}}}
 if(!changed)return;
 await msDecrypt(c);
 const log=c.root?.querySelector(".mlog");
 const up=log&&log.scrollHeight-log.scrollTop-log.clientHeight>160;
 if(up&&incoming)c.newBelow+=incoming;
 msPaintLog(c);
 if(incoming)msMarkRead(c)}
function msMarkRead(c){
 if(c.kind!=="dm"||MS.schema===false||document.hidden||S.view!=="chats"||MS.conv!==c)return;
 const me=msMe();
 if(!c.rows.some(r=>r.sender===c.peer&&r.recipient===me&&!r.read_at))return;
 sb.rpc("mark_read",{peer:c.peer}).then(({error})=>{
  if(error){if(msNoFn(error))MS.schema=false;return}
  const now=new Date().toISOString();
  c.rows.forEach(r=>{if(r.sender===c.peer&&!r.read_at)r.read_at=now});
  const th=MS.threads.find(x=>x.peer===c.peer);
  if(th){th.unread=0;msRecount();msPaintList()}})}

/* ── log ── */
function msPeer(c,uid){
 if(uid===msMe())return {id:uid,username:S.username||sbProfile?.username||t("ms.you.n"),avatar_url:S.avatar||sbProfile?.avatar_url||null};
 if(c.kind==="room"){const m=(SOC.roomMembers||[]).find(x=>String(x.user_id)===String(uid));if(m?.profile)return m.profile}
 return MS.peers.get(String(uid))||{id:uid,username:"…"}}
function msItems(c){
 const me=msMe(),out=[];
 let rows=[...c.rows,...c.pending];
 /* A room shows what this device can read; history from before joining is
    one quiet line rather than a column of locks. */
 if(c.kind==="room"){
  const locked=rows.filter(r=>c.pay.get(r.id)?.type==="locked").length;
  rows=rows.filter(r=>c.pay.get(r.id)?.type!=="locked");
  if(locked)out.push({key:"old",sig:"old"+LANG,html:`<div class="mday old" data-key="old"><span><span class="material-symbols-rounded">lock</span>${t("ms.room.old")}</span></div>`})}
 if(!rows.length){
  out.push({key:"empty",sig:"e"+LANG+c.kind,html:`<div class="mempty" data-key="empty"><span class="material-symbols-rounded">waving_hand</span><b>${t("ms.say")}</b>${c.kind==="dm"&&e2eOk()?`<span>${t("ms.e2e.on")}</span>`:""}</div>`});
  return out}
 let day="",prev=null;
 rows.forEach((r,i)=>{
  const d=msDay(r.sent_at);
  if(d!==day){day=d;prev=null;out.push({key:"d"+d,sig:"d"+d+LANG+msDayLabel(r.sent_at),html:`<div class="mday" data-key="d${d}"><span>${esc(msDayLabel(r.sent_at))}</span></div>`})}
  if(c.firstUnread&&r.id===c.firstUnread)out.push({key:"unr",sig:"unr"+LANG,html:`<div class="munread" data-key="unr"><span>${t("ms.unread")}</span></div>`});
  const next=rows[i+1];
  const gap=(a,b)=>Math.abs(Date.parse(b.sent_at)-Date.parse(a.sent_at))<7*60000;
  const cont=!!(prev&&prev.sender===r.sender&&gap(prev,r));
  const last=!(next&&next.sender===r.sender&&msDay(next.sent_at)===d&&gap(r,next));
  out.push(msItem(c,r,{cont,last,mine:r.sender===me}));
  prev=r});
 return out}
function msItem(c,r,f){
 const p=r._p?{...r._p,sealed:c.sealed===true}:(c.pay.get(r.id)||msLegacy(r));
 const read=f.mine&&c.kind==="dm"&&!!r.read_at;
 const q=r.reply_to?(c.byId.get(r.reply_to)||c.extra.get(r.reply_to)):null;
 const sig=[r.id,r.edited_at||"",read?1:0,f.cont?1:0,f.last?1:0,r._pending?1:0,r._failed?1:0,p._k||"",p.type,
  r.reply_to||"",q?`${q.id}.${q.edited_at||""}`:(q===null?"x":""),LANG,c.kind==="room"&&!f.mine?msName(msPeer(c,r.sender)):""].join("|");
 return {key:"m"+r.id,sig,html:()=>msBubble(c,r,p,f,read)}}
function msTickHtml(r,read){
 const ic=r._failed?"error":r._pending?"schedule":read?"done_all":"check";
 const tt=r._failed?t("ms.failed"):r._pending?t("ms.sending"):read?t("ms.read"):t("ms.sent");
 return `<span class="material-symbols-rounded mtick${read?" read":""}${r._failed?" bad":""}" title="${tt}">${ic}</span>`}
function msBubble(c,r,p,{cont,last,mine},read){
 const room=c.kind==="room",who=!mine?msPeer(c,r.sender):null;
 const media=p.type==="image"&&!p.text;
 const cls=["mrow",mine?"out":"in",cont?"cont":"",last?"last":"",r._pending?"pending":"",r._failed?"failed":"",media?"media":"",room?"inroom":""].filter(Boolean).join(" ");
 const name=room&&!mine&&!cont?`<b class="mname" data-person="${esc(r.sender)}" style="--hue:${msHue(r.sender)}">${esc(msName(who))}</b>`:"";
 const ava=room&&!mine?`<span class="mava">${last?avat(who||{id:r.sender},30):""}</span>`:"";
 const plain=!p.sealed&&!r._pending&&!room&&c.sealed===true?`<span class="material-symbols-rounded mplain" title="${t("ms.plain")}">lock_open</span>`:"";
 const meta=`<span class="mmeta">${plain}${r.edited_at?`<i>${t("ms.edited")}</i>`:""}<time datetime="${esc(r.sent_at)}" title="${esc(new Date(r.sent_at).toLocaleString(msLoc()))}">${esc(msClock(r.sent_at))}</time>${mine&&!room?msTickHtml(r,read):(mine&&(r._pending||r._failed)?msTickHtml(r,false):"")}</span>`;
 return `<div class="${cls}" data-key="m${esc(r.id)}" data-mid="${esc(r.id)}">${ava}<div class="mb">${name}${r.reply_to?msQuote(c,r.reply_to):""}${msContent(r,p)}${meta}${!r._pending&&!r._failed?`<button class="ic mrep" data-mrep title="${t("ms.reply")}"><span class="material-symbols-rounded">reply</span></button>`:""}</div>${r._failed?`<button class="ic mretry" data-mretry="${esc(r.id)}" title="${t("ms.retry")}"><span class="material-symbols-rounded">refresh</span></button>`:""}</div>`}
function msContent(r,p){
 if(p.type==="locked")return `<div class="mtext mlock"><span class="material-symbols-rounded">lock</span>${t("ms.locked")}</div>`;
 if(p.type==="broken")return `<div class="mtext mlock"><span class="material-symbols-rounded">gpp_bad</span>${t("ms.broken")}</div>`;
 let h="";
 if(p.type==="image"&&p.image)h+=`<img class="mimg" src="${esc(p.image)}" alt="" decoding="async">`;
 if(p.type==="music_card"&&p.track)h+=`<div class="mcard" data-mplay="${esc(r.id)}" role="button" tabindex="0" title="${t("ms.play")}">
   <span class="mcard-art" ${coverStyle(p.track.art)}><span class="material-symbols-rounded">play_arrow</span></span>
   <span class="mcard-t"><b>${esc(p.track.t)}</b><span>${esc(p.track.a||"")}</span>${p.track.s?`<i>${esc(msSvc(p.track.s))}</i>`:""}</span></div>`;
 if(p.type==="listen_party_invite"&&p.room)h+=`<div class="minvite"><span class="material-symbols-rounded">podcasts</span>
   <span class="minvite-t"><b>${esc(p.room.name||t("ms.invite"))}</b><span>${esc(p.track?.t?`${p.track.a?p.track.a+" — ":""}${p.track.t}`:p.room.code)}</span></span>
   <button class="btn sm" data-join="${esc(p.room.code)}">${t("ms.join")}</button></div>`;
 if(p.text)h+=`<div class="mtext">${chatBodyHtml({body:p.text})}</div>`;
 return h||`<div class="mtext"></div>`}
const msSvc=s=>{try{return (typeof svc==="function"&&svc(s)?.name)||s}catch(_){return s}};
function msQuote(c,id){
 const r=c.byId.get(id)||c.extra.get(id);
 if(!r)return `<button class="mquote gone" data-goto="${esc(id)}"><span><b>…</b><span>${t("ms.q.gone")}</span></span></button>`;
 const p=c.pay.get(r.id)||msLegacy(r);
 const who=r.sender===msMe()?t("ms.you.n"):msName(msPeer(c,r.sender));
 const th=p.type==="image"&&p.image?`<img src="${esc(p.image)}" alt="">`:"";
 return `<button class="mquote" data-goto="${esc(r.id)}" style="--hue:${msHue(r.sender)}">${th}<span><b>${esc(who)}</b><span>${esc(msPreview(p).slice(0,140))}</span></span></button>`}
function msSync(box,items,anim){
 const have=new Map();
 for(const n of [...box.children]){const k=n.dataset.key;if(k&&!have.has(k))have.set(k,n);else n.remove()}
 const keep=new Set(items.map(i=>i.key));
 have.forEach((n,k)=>{if(!keep.has(k)){n.remove();have.delete(k)}});
 const tpl=document.createElement("template");
 let prev=null,added=0;
 for(const it of items){
  let n=have.get(it.key);
  if(!n||n.dataset.sig!==it.sig){
   tpl.innerHTML=(typeof it.html==="function"?it.html():it.html).trim();
   const nn=tpl.content.firstElementChild;
   nn.dataset.sig=it.sig;
   if(n)n.replaceWith(nn);else{added++;if(anim)nn.classList.add("mnew")}
   n=nn}
  const want=prev?prev.nextElementSibling:box.firstElementChild;
  if(want!==n)box.insertBefore(n,want);
  prev=n}
 return added}
function msPaintLog(c,{stick=false,anim=true}={}){
 const log=c.root?.querySelector(".mlog");if(!log)return;
 const near=log.scrollHeight-log.scrollTop-log.clientHeight<160;
 const added=msSync(log.firstElementChild,msItems(c),anim&&!stick);
 if(added)icons();
 if(stick||near){log.scrollTop=log.scrollHeight;c.newBelow=0}
 msDown(c)}
function msDown(c){
 const b=c.root?.querySelector(".mdown"),log=c.root?.querySelector(".mlog");if(!b||!log)return;
 const up=log.scrollHeight-log.scrollTop-log.clientHeight>320;
 b.hidden=!up;
 const n=b.querySelector("b");if(n){n.hidden=!c.newBelow;n.textContent=c.newBelow>99?"99+":c.newBelow}}
async function msGoto(c,id){
 id=+id;
 for(let i=0;i<8&&!c.byId.has(id)&&c.more&&id<c.oldestId;i++)await msLoadOlder(c,false);
 const n=c.root?.querySelector(`.mrow[data-mid="${id}"]`);
 if(!n)return toast(t("ms.q.gone"));
 n.scrollIntoView({block:"center",behavior:"smooth"});
 n.classList.remove("flash");void n.offsetWidth;n.classList.add("flash")}

/* ── composer & actions ── */
function msGrow(inp){inp.style.height="auto";inp.style.height=Math.min(inp.scrollHeight,148)+"px"}
function msCtx(c,mode,row){
 const box=c.root?.querySelector(".mctx");if(!box)return;
 c.reply=null;c.edit=null;
 const inp=c.root.querySelector(".minp");
 if(!mode){box.hidden=true;msSendState(c);return}
 const p=c.pay.get(row.id)||msLegacy(row);
 if(mode==="reply"){
  c.reply={id:row.id};
  box.querySelector(".mctx-ic").textContent="reply";
  box.querySelector("b").textContent=t("ms.replyto").replace("{name}",row.sender===msMe()?t("ms.you.n"):msName(msPeer(c,row.sender)));
 }else{
  c.edit={row,p};
  box.querySelector(".mctx-ic").textContent="edit";
  box.querySelector("b").textContent=t("ms.editing");
  inp.value=p.text||"";msGrow(inp)}
 box.querySelector(".mctx-t span").textContent=msPreview(p).slice(0,160);
 box.style.setProperty("--hue",msHue(row.sender));
 box.hidden=false;
 inp.focus();
 msSendState(c)}
function msSendState(c){
 const inp=c.root?.querySelector(".minp"),b=c.root?.querySelector(".msend");
 if(inp&&b)b.disabled=!inp.value.trim()&&!c.edit}
async function msPost(c,payload,replyTo){
 const tmp={id:"p"+(++MS.pend),sender:msMe(),recipient:c.peer,room_id:c.room,sent_at:new Date().toISOString(),
  reply_to:replyTo||null,_p:payload,_pending:true};
 c.pending.push(tmp);
 msPaintLog(c,{stick:true});
 try{
  const r=await msSend(c,payload,replyTo);
  if(r.error)throw r.error;
  c.pending=c.pending.filter(x=>x!==tmp);
  msMerge(c,[r.data]);
  /* The sealed payload is known here; no need to decrypt our own message. */
  if(r.data)c.pay.set(r.data.id,{...msClean(payload),sealed:!!r.data.ciphertext,_k:`|${r.data.ciphertext?Object.keys(r.data.e2e?.k||{}).length:0}`});
  if(c.kind==="dm"){
   MS.last.set(c.peer,r.data);
   const th=MS.threads.find(x=>x.peer===c.peer);
   const p={...msClean(payload),sealed:!!r.data?.ciphertext};
   if(th){th.last_id=r.data.id;th.p=p}else MS.threads.unshift({peer:c.peer,last_id:r.data.id,unread:0,p});
   MS.threads.sort((a,b)=>b.last_id-a.last_id);
   msPaintList()}}
 catch(e){
  tmp._pending=false;tmp._failed=msErr(e);
  toast(tmp._failed)}
 msPaintLog(c,{stick:true})}
async function msSubmit(c){
 const inp=c.root?.querySelector(".minp");if(!inp)return;
 const text=inp.value.replace(/^\s*\n+|\s+$/g,"");
 if(c.edit){
  const {row,p}=c.edit;
  if(!text.trim()&&p.type==="text")return;
  if(text===(p.text||"")){msCtx(c,null);inp.value="";msGrow(inp);return}
  const next={...msClean(p),text};
  msCtx(c,null);inp.value="";msGrow(inp);
  const r=await msEditSend(c,row,next);
  if(r.error)return toast(msErr(r.error));
  msMerge(c,[r.data]);
  if(r.data)c.pay.set(r.data.id,{...msClean(next),sealed:!!r.data.ciphertext,_k:`${r.data.edited_at||""}|${r.data.ciphertext?Object.keys(r.data.e2e?.k||{}).length:0}`});
  msPaintLog(c);
  return}
 if(!text.trim())return;
 const replyTo=c.reply?.id||null;
 inp.value="";msGrow(inp);msCtx(c,null);
 await msPost(c,{type:"text",text},replyTo)}
async function msAttach(c,file){
 if(!file)return;
 const img=await compressChatImage(file);
 if(!img)return;
 const inp=c.root?.querySelector(".minp");
 const text=(inp?.value||"").trim();
 const replyTo=c.reply?.id||null;
 if(inp){inp.value="";msGrow(inp)}
 msCtx(c,null);
 await msPost(c,{type:"image",image:img,text},replyTo)}
async function msShareNow(c){
 const cur=S.current;
 if(!cur||cur.mode==="empty")return toast(t("ms.np.none"));
 const tr=stripTrack(cur);
 if(tr&&!/^https?:/i.test(tr.art||""))tr.art="";
 await msPost(c,{type:"music_card",track:tr,text:""},c.reply?.id||null);
 msCtx(c,null)}
async function msInvite(c){
 if(!SOC.room)return toast(t("ms.noroom"),4200,{actions:[{label:t("nav.rooms"),run:()=>go("rooms")}]});
 const cur=S.current&&S.current.mode!=="empty"?S.current:null;
 await msPost(c,{type:"listen_party_invite",room:{id:SOC.room.id,code:SOC.room.join_code,name:SOC.room.name},
  track:cur?{t:cur.t,a:cur.a}:{} ,text:""},null)}
function msPlayTrack(tr){
 if(!tr)return;
 const x=roomTrackOf(tr);
 if(x)setTrack(x,true,false,"chat")}
async function msAct(c,row,act){
 const p=c.pay.get(row.id)||row._p||msLegacy(row);
 if(act==="reply")return msCtx(c,"reply",row);
 if(act==="copy"){
  const s=p.text||(p.type==="music_card"?`${p.track.a} — ${p.track.t}`:"");
  navigator.clipboard?.writeText(s).then(()=>toast(t("ms.copied"))).catch(()=>{});return}
 if(act==="edit")return msCtx(c,"edit",row);
 if(act==="del"){
  if(!await askConfirm(t("ms.del.q"),t("ms.del"),true,{icon:"delete",sub:t("ms.del.s")}))return;
  const {error}=await sb.from("messages").delete().eq("id",row.id);
  if(error)return toast(msErr(error));
  c.byId.delete(row.id);c.pay.delete(row.id);
  c.rows=c.rows.filter(r=>r.id!==row.id);
  msPaintLog(c);
  if(c.kind==="dm"){MS.last.delete(c.peer);msLoadThreads().then(msPaintList).catch(()=>{})}}}
let msMenuEl=null;
function msMenuClose(){
 if(!msMenuEl)return;
 msMenuEl.remove();msMenuEl=null;
 document.removeEventListener("pointerdown",msMenuAway,true);
 document.removeEventListener("keydown",msMenuKey,true)}
const msMenuAway=e=>{if(msMenuEl&&!msMenuEl.contains(e.target))msMenuClose()};
const msMenuKey=e=>{if(e.key==="Escape"){e.preventDefault();msMenuClose()}};
function msMenu(c,row,x,y){
 msMenuClose();
 if(row._pending)return;
 const mine=row.sender===msMe();
 const p=c.pay.get(row.id)||row._p||msLegacy(row);
 const readable=p.type!=="locked"&&p.type!=="broken";
 if(row._failed)return msMenuShow(c,row,x,y,[["retry","refresh",t("ms.retry")],["drop","delete",t("ms.del"),"danger"]]);
 msMenuShow(c,row,x,y,[
  readable?["reply","reply",t("ms.reply")]:null,
  readable&&(p.text||p.type==="music_card")?["copy","content_copy",t("ms.copy")]:null,
  mine&&readable&&(p.type==="text"||p.type==="image")?["edit","edit",t("ms.edit")]:null,
  mine?["del","delete",t("ms.del"),"danger"]:null].filter(Boolean))}
function msMenuShow(c,row,x,y,items){
 if(!items.length)return;
 const m=document.createElement("div");
 m.className="mmenu";m.setAttribute("role","menu");
 m.innerHTML=items.map(([k,ic,l,cls])=>`<button role="menuitem" data-mm="${k}" class="${cls||""}"><span class="material-symbols-rounded">${ic}</span><span>${esc(l)}</span></button>`).join("");
 document.body.appendChild(m);msMenuEl=m;
 const w=m.offsetWidth,h=m.offsetHeight;
 m.style.left=Math.max(8,Math.min(x,innerWidth-w-8))+"px";
 m.style.top=Math.max(8,Math.min(y,innerHeight-h-8))+"px";
 m.addEventListener("click",e=>{
  const b=e.target.closest("[data-mm]");if(!b)return;
  const k=b.dataset.mm;msMenuClose();
  if(k==="retry")return msRetry(c,row.id);
  if(k==="drop"){c.pending=c.pending.filter(x=>x!==row);return msPaintLog(c)}
  msAct(c,row,k)});
 setTimeout(()=>{document.addEventListener("pointerdown",msMenuAway,true);document.addEventListener("keydown",msMenuKey,true)},0);
 m.querySelector("button")?.focus({preventScroll:true})}
async function msRetry(c,id){
 const tmp=c.pending.find(x=>x.id===id);if(!tmp)return;
 c.pending=c.pending.filter(x=>x!==tmp);
 await msPost(c,tmp._p,tmp.reply_to)}
const msRowOf=(c,el)=>{
 const id=el?.closest(".mrow")?.dataset.mid;if(id==null)return null;
 return c.byId.get(+id)||c.pending.find(x=>x.id===id)||null};
function msWire(c){
 const root=c.root,log=root.querySelector(".mlog"),inp=root.querySelector(".minp"),file=root.querySelector('input[type="file"]');
 root.addEventListener("click",async e=>{
  const el=e.target instanceof Element?e.target:null;if(!el)return;
  const act=el.closest("[data-mact]")?.dataset.mact;
  if(act==="back"){MS.open=null;msPaintEmpty();msPaintList();return}
  if(act==="profile")return openProfile(c.peer);
  if(act==="listen")return msPlayTrack(presTrack(c.peer));
  if(act==="invite")return msInvite(c);
  const mc=el.closest("[data-mc]")?.dataset.mc;
  if(mc==="x"){if(c.edit){inp.value="";msGrow(inp)}return msCtx(c,null)}
  if(mc==="att")return file.click();
  if(mc==="np")return msShareNow(c);
  if(mc==="send")return msSubmit(c);
  const go2=el.closest("[data-goto]");if(go2)return msGoto(c,go2.dataset.goto);
  const join=el.closest("[data-join]");if(join)return joinRoomByCode(join.dataset.join);
  const card=el.closest("[data-mplay]");
  if(card){const p=c.pay.get(+card.dataset.mplay)||c.pending.find(x=>x.id===card.dataset.mplay)?._p;return msPlayTrack(p?.track)}
  const chip=el.closest("[data-chat-play]");if(chip)return msPlayQuery(chip.dataset.chatPlay);
  if(el.closest("[data-mretry]"))return msRetry(c,el.closest("[data-mretry]").dataset.mretry);
  if(el.closest("[data-mrep]")){const r=msRowOf(c,el);if(r)msCtx(c,"reply",r);return}
  if(el.closest(".mimg")&&!el.closest("a"))return msViewImage(el.closest(".mimg").src);
  if(el.closest(".mdown")){log.scrollTo({top:log.scrollHeight,behavior:"smooth"});c.newBelow=0;msDown(c)}});
 root.addEventListener("contextmenu",e=>{
  const r=msRowOf(c,e.target);if(!r)return;
  if(e.target.closest("a"))return;
  e.preventDefault();msMenu(c,r,e.clientX,e.clientY)});
 /* Long press on touch screens opens the same menu. */
 let lp=0,lpXY=null;
 log.addEventListener("pointerdown",e=>{
  if(e.pointerType==="mouse")return;
  const r=msRowOf(c,e.target);if(!r)return;
  lpXY=[e.clientX,e.clientY];
  lp=setTimeout(()=>{lp=0;navigator.vibrate?.(12);msMenu(c,r,lpXY[0],lpXY[1])},480)});
 const lpStop=()=>{clearTimeout(lp);lp=0};
 log.addEventListener("pointerup",lpStop);log.addEventListener("pointercancel",lpStop);
 log.addEventListener("pointermove",e=>{if(lp&&lpXY&&Math.hypot(e.clientX-lpXY[0],e.clientY-lpXY[1])>10)lpStop()});
 log.addEventListener("dblclick",e=>{
  if(e.target.closest("a,button,.mtext"))return;
  const r=msRowOf(c,e.target);if(r&&!r._pending&&!r._failed)msCtx(c,"reply",r)});
 log.addEventListener("scroll",()=>{
  msMenuClose();msDown(c);
  if(log.scrollTop<140&&c.more&&!c.loading)msLoadOlder(c,false)},{passive:true});
 inp.addEventListener("input",()=>{msGrow(inp);msSendState(c)});
 inp.addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey&&!e.isComposing){e.preventDefault();msSubmit(c);return}
  if(e.key==="Escape"&&(c.reply||c.edit)){e.preventDefault();if(c.edit){inp.value="";msGrow(inp)}msCtx(c,null);return}
  /* ↑ in an empty composer edits your last message, as in Telegram. */
  if(e.key==="ArrowUp"&&!inp.value&&!c.edit){
   const mine=[...c.rows].reverse().find(r=>r.sender===msMe()&&["text","image"].includes(c.pay.get(r.id)?.type));
   if(mine){e.preventDefault();msCtx(c,"edit",mine)}}});
 inp.addEventListener("paste",e=>{
  const f=[...(e.clipboardData?.files||[])].find(x=>/^image\//.test(x.type));
  if(f){e.preventDefault();msAttach(c,f)}});
 file.addEventListener("change",()=>{const f=file.files?.[0];file.value="";msAttach(c,f)});
 root.addEventListener("dragover",e=>{if([...(e.dataTransfer?.items||[])].some(i=>i.kind==="file")){e.preventDefault();root.classList.add("drop")}});
 root.addEventListener("dragleave",e=>{if(e.target===root)root.classList.remove("drop")});
 root.addEventListener("drop",e=>{
  root.classList.remove("drop");
  const f=[...(e.dataTransfer?.files||[])].find(x=>/^image\//.test(x.type));
  if(f){e.preventDefault();msAttach(c,f)}})}
async function msPlayQuery(q){
 if(!q)return;
 try{const hits=await searchRemote(q);if(hits&&hits.length)return setTrack(hits[0],true,false,"chat")}catch(_){}
 go("search");
 const inp=document.getElementById("q");if(inp){inp.value=q;search(q)}}
function msViewImage(src){
 if(!src)return;
 const v=document.createElement("div");
 v.className="mview";
 v.innerHTML=`<img src="${esc(src)}" alt=""><button class="ic" aria-label="${t("ms.cancel")}"><span class="material-symbols-rounded">close</span></button>`;
 const close=()=>{v.classList.add("out");setTimeout(()=>v.remove(),200);removeEventListener("keydown",key,true)};
 const key=e=>{if(e.key==="Escape"){e.preventDefault();close()}};
 v.addEventListener("click",close);
 addEventListener("keydown",key,true);
 document.body.appendChild(v)}

/* ── room chat ──────────────────────────────────────────────────────
   Same log and composer inside the room screen. Members change while the room
   is open, so each message is sealed for whoever is in the room right then;
   someone who joins later sees one line about earlier messages instead of
   locks. */
function msRoomMount(box,room){
 if(!box||!room)return;
 let c=MS.room;
 if(c&&c.room===room.id&&c.root&&box.contains(c.root))return;
 c=MS.room=msConvNew("room",room.id);
 box.innerHTML=`<div class="mconv mroomchat" data-kind="room"><div class="mbanner" hidden></div>
  <div class="mlog"><div class="mlog-in"></div></div>
  <button class="mdown" hidden><span class="material-symbols-rounded">keyboard_arrow_down</span><b hidden></b></button>
  ${msComposerHtml()}</div>`;
 c.root=box.querySelector(".mconv");
 c.root.querySelector('[data-mc="np"]')?.remove();
 msWire(c);
 icons();
 msLoadOlder(c,true);
 e2eInit().then(async ok=>{
  if(MS.room!==c)return;
  if(!ok||E2E.srv===false){c.sealed=false;return msBanner(c)}
  try{const {missing}=await e2eTargets(msUids(c));c.sealed=!missing.length}catch(_){c.sealed=null}
  msBanner(c)});
 socTimer("mroom",async()=>{
  if(!SOC.room||SOC.room.id!==c.room||!c.root?.isConnected){socClear("mroom");if(MS.room===c)MS.room=null;return}
  if(document.hidden)return;
  try{await msPollConv(c)}catch(_){}
  /* Membership moves: refresh who a message would be sealed for. */
  if(c.pollN%10===0)e2eTargets(msUids(c)).then(({missing})=>{c.sealed=!missing.length;msBanner(c)}).catch(()=>{})},2500)}

/* ── settings: encryption devices ── */
async function paintE2EDevices(){
 const box=document.getElementById("e2e-devs");if(!box)return;
 if(!sb||!msMe()){box.innerHTML=`<p class="ph" style="margin:0">${t("ms.auth")}</p>`;return}
 await e2eInit();
 const {data,error}=await sb.from("e2e_devices").select("device_id,pub,label,created_at,last_seen").eq("user_id",msMe()).order("last_seen",{ascending:false});
 if(error){box.innerHTML=`<p class="ph" style="margin:0">${esc(MS.schema===false||E2E.srv===false?t("ms.e2e.nosql"):socialFail(error))}</p>`;return}
 if(!data?.length){box.innerHTML=`<p class="ph" style="margin:0">${t("ms.dev.none")}</p>`;return}
 const rows=await Promise.all(data.map(async d=>{
  const fp=await MWE2E.fingerprint(d.pub).catch(()=>"");
  const me=d.device_id===E2E.dev?.id;
  return `<div class="e2e-dev"><span class="material-symbols-rounded">${/Android|iOS/.test(d.label||"")?"smartphone":"computer"}</span>
   <span class="e2e-dev-t"><b>${esc(d.label||"?")}${me?` · <i>${t("ms.dev.this")}</i>`:""}</b>
   <span>${t("ms.dev.seen").replace("{ago}",ago(Date.parse(d.last_seen)))} · <span title="${t("ms.dev.key")}">${esc(fp)}</span></span></span>
   ${me?"":`<button class="btn sm danger" data-e2e-rm="${esc(d.device_id)}">${t("ms.dev.rm")}</button>`}</div>`}));
 box.innerHTML=rows.join("");
 box.querySelectorAll("[data-e2e-rm]").forEach(b=>b.onclick=async()=>{
  if(!await askConfirm(t("ms.dev.rm.q"),t("ms.dev.rm"),true,{icon:"devices"}))return;
  const {error:e}=await sb.from("e2e_devices").delete().eq("user_id",msMe()).eq("device_id",b.dataset.e2eRm);
  if(e)return toast(socialFail(e));
  E2E.keys.delete(msMe());paintE2EDevices()})}

if(typeof applyI18n==="function")applyI18n();
if(S.view==="chats")renderMessenger();
