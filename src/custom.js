/* custom.js — the interface designer (Settings → Appearance).

   Round 8, "more detailed customisation, so that every element can be
   changed". One schema drives all of it: the editor is built from it, the
   stylesheet is generated from it and imported themes are validated against
   it. Colours are kept per theme (a dark background means nothing in the
   light theme); shapes, sizes and switches once for both:
     S.x.cz = {a:{…shared}, d:{…dark colours}, l:{…light colours}}
   Only values that differ from the stock look are stored.

   The result is one <style id="cz-style">. Every declaration in it is
   !important, so it beats app.css whatever the order — which is what lets
   boot.js put a cached copy into <head> before the first paint: a custom
   background never flashes the stock one first. Nothing typed or imported
   reaches the CSS as text: colours must be #rrggbb, numbers are clamped to
   their slider, choices come from a fixed list. Loaded after app.js (defer),
   so S, t, I18N, save, pushPrefs, paintSeg … are in scope. */
(()=>{
"use strict";
const $=id=>document.getElementById(id);
const de=document.documentElement;
const HEX=/^#[0-9a-f]{6}$/i;

/* ── strings ── */
Object.assign(I18N.ru,{
 "cz.t":"Конструктор интерфейса","cz.s":"Цвет, форма и видимость каждого элемента. Всё меняется сразу, любой пункт можно сбросить отдельно.",
 "cz.find":"Найти элемент…","cz.none":"Ничего не нашлось","cz.th.d":"Цвета сохраняются для тёмной темы","cz.th.l":"Цвета сохраняются для светлой темы",
 "cz.auto":"авто","cz.reset1":"Сбросить","cz.resetg":"Сбросить раздел","cz.resetall":"Сбросить всё","cz.exp":"Экспорт","cz.imp":"Импорт",
 "cz.exp.ok":"Тема скопирована — её можно отправить другу","cz.imp.t":"Импорт темы","cz.imp.l":"Вставьте текст темы","cz.imp.ok":"Применить",
 "cz.imp.bad":"Это не похоже на тему Meowave","cz.imp.done":"Тема применена","cz.reset.q":"Сбросить все настройки конструктора?","cz.reset.ok":"Сбросить",
 "cz.reset.done":"Вид сброшен","cz.p":"Готовые стили","cz.p.done":"Стиль «{n}» применён","cz.p.std":"Стандарт","cz.p.compact":"Компактный","cz.p.soft":"Мягкий",
 "cz.p.strict":"Строгий","cz.p.solid":"Без стекла","cz.p.oled":"OLED","cz.p.paper":"Бумага",
 "cz.g.base":"Основа","cz.g.base.s":"Фон, текст, линии, размер","cz.g.panel":"Панели","cz.g.panel.s":"Цвет, прозрачность, скругление, тени",
 "cz.g.rail":"Боковое меню","cz.g.rail.s":"Фон, выбранный пункт, подписи","cz.g.bar":"Плеер","cz.g.bar.s":"Фон, полоса прогресса, кнопки",
 "cz.g.cov":"Обложки","cz.g.cov.s":"Скругление, тени, движение","cz.g.ctl":"Кнопки и переключатели","cz.g.ctl.s":"Форма и цвета",
 "cz.g.rows":"Списки треков","cz.g.rows.s":"Плотность, подсветка, разделители","cz.g.home":"Главная и частицы","cz.g.home.s":"Заголовок, подборки, волна",
 "cz.g.fp":"Полноэкранный плеер","cz.g.fp.s":"Обложка и текст песни","cz.g.chat":"Чаты","cz.g.chat.s":"Сообщения, фон, скругление",
 "cz.g.menu":"Меню, окна, уведомления","cz.g.menu.s":"Фон, скругление, затемнение","cz.g.scroll":"Полосы прокрутки","cz.g.scroll.s":"Ширина и цвет",
 "cz.g.tb":"Заголовок окна","cz.g.tb.s":"Фон и название",
 "cz.bg":"Фон приложения","cz.text":"Основной текст","cz.mute":"Второстепенный текст","cz.line":"Линии и рамки","cz.fontK":"Размер текста",
 "cz.zoom":"Масштаб интерфейса","cz.zoom.s":"Всё окно целиком, как масштаб в браузере",
 "cz.surf":"Цвет панелей","cz.surfA":"Непрозрачность","cz.surfA.s":"0% — прозрачное стекло, 100% — сплошной цвет","cz.search":"Поле поиска",
 "cz.radius":"Скругление","cz.shadow":"Тени",
 "cz.railBg":"Фон","cz.railAct":"Выбранный пункт","cz.railIc":"Иконки и подписи","cz.railLbl":"Подписи под иконками","cz.railLogo":"Логотип",
 "cz.barBg":"Фон","cz.barR":"Скругление","cz.seekC":"Полоса прогресса","cz.seekWave":"Волна на полосе прогресса","cz.playBg":"Кнопка воспроизведения",
 "cz.barIc":"Иконки и время","cz.artR":"Скругление обложки",
 "cz.covR":"Скругление","cz.covSh":"Тени","cz.covLift":"Подъём при наведении",
 "cz.shape":"Форма кнопок","cz.shape.pill":"Круглые","cz.shape.round":"Скруглённые","cz.shape.square":"Строгие","cz.priBg":"Главные кнопки",
 "cz.selBg":"Выбранный вариант","cz.swOn":"Включённые переключатели",
 "cz.dens":"Плотность","cz.dens.compact":"Плотно","cz.dens.normal":"Обычно","cz.dens.roomy":"Просторно","cz.hov":"Подсветка при наведении","cz.div":"Разделители",
 "cz.heroK":"Размер заголовка","cz.heroC":"Цвет заголовка","cz.heroSub":"Подзаголовок","cz.hsBg":"Панель «Подборки»","cz.fieldC":"Цвет частиц",
 "cz.fieldA":"Яркость частиц",
 "cz.fpCovR":"Скругление обложки","cz.lyA":"Текущая строка песни","cz.lyI":"Остальные строки",
 "cz.mOut":"Мои сообщения","cz.mIn":"Входящие сообщения","cz.mPane":"Фон переписки","cz.mR":"Скругление сообщений","cz.mFs":"Размер текста",
 "cz.mSide":"Отступы по бокам","cz.mMaxW":"Ширина сообщения","cz.mNarrow":"Узкая лента по центру",
 "cz.menuBg":"Контекстные меню","cz.dlgBg":"Окна и настройки","cz.dlgR":"Скругление окон","cz.toast":"Уведомления","cz.scrim":"Затемнение под окнами",
 "cz.scW":"Ширина","cz.scW.thin":"Тонкие","cz.scW.normal":"Обычные","cz.scW.none":"Скрыть","cz.scC":"Цвет",
 "cz.tbBg":"Фон","cz.tbBrand":"Название и значок"});
Object.assign(I18N.en,{
 "cz.t":"Interface designer","cz.s":"Colour, shape and visibility of every element. Changes apply instantly; any of them can be reset on its own.",
 "cz.find":"Find an element…","cz.none":"Nothing found","cz.th.d":"Colours are saved for the dark theme","cz.th.l":"Colours are saved for the light theme",
 "cz.auto":"auto","cz.reset1":"Reset","cz.resetg":"Reset section","cz.resetall":"Reset all","cz.exp":"Export","cz.imp":"Import",
 "cz.exp.ok":"Theme copied — share it with a friend","cz.imp.t":"Import a theme","cz.imp.l":"Paste the theme text","cz.imp.ok":"Apply",
 "cz.imp.bad":"That doesn't look like a Meowave theme","cz.imp.done":"Theme applied","cz.reset.q":"Reset everything in the designer?","cz.reset.ok":"Reset",
 "cz.reset.done":"Appearance reset","cz.p":"Presets","cz.p.done":"“{n}” applied","cz.p.std":"Standard","cz.p.compact":"Compact","cz.p.soft":"Soft",
 "cz.p.strict":"Sharp","cz.p.solid":"Solid","cz.p.oled":"OLED","cz.p.paper":"Paper",
 "cz.g.base":"Basics","cz.g.base.s":"Background, text, lines, size","cz.g.panel":"Panels","cz.g.panel.s":"Colour, opacity, corners, shadows",
 "cz.g.rail":"Side menu","cz.g.rail.s":"Background, selected item, labels","cz.g.bar":"Player bar","cz.g.bar.s":"Background, progress bar, buttons",
 "cz.g.cov":"Covers","cz.g.cov.s":"Corners, shadows, motion","cz.g.ctl":"Buttons & switches","cz.g.ctl.s":"Shape and colours",
 "cz.g.rows":"Track lists","cz.g.rows.s":"Density, highlight, dividers","cz.g.home":"Home & particles","cz.g.home.s":"Title, collections, the wave",
 "cz.g.fp":"Full-screen player","cz.g.fp.s":"Cover and lyrics","cz.g.chat":"Chats","cz.g.chat.s":"Messages, background, corners",
 "cz.g.menu":"Menus, dialogs, notifications","cz.g.menu.s":"Background, corners, dimming","cz.g.scroll":"Scrollbars","cz.g.scroll.s":"Width and colour",
 "cz.g.tb":"Title bar","cz.g.tb.s":"Background and name",
 "cz.bg":"App background","cz.text":"Primary text","cz.mute":"Secondary text","cz.line":"Lines & borders","cz.fontK":"Text size",
 "cz.zoom":"Interface scale","cz.zoom.s":"The whole window, like browser zoom",
 "cz.surf":"Panel colour","cz.surfA":"Opacity","cz.surfA.s":"0% is clear glass, 100% a solid colour","cz.search":"Search field",
 "cz.radius":"Corner radius","cz.shadow":"Shadows",
 "cz.railBg":"Background","cz.railAct":"Selected item","cz.railIc":"Icons & labels","cz.railLbl":"Labels under icons","cz.railLogo":"Logo",
 "cz.barBg":"Background","cz.barR":"Corner radius","cz.seekC":"Progress bar","cz.seekWave":"Wavy progress bar","cz.playBg":"Play button",
 "cz.barIc":"Icons & time","cz.artR":"Cover corners",
 "cz.covR":"Corner radius","cz.covSh":"Shadows","cz.covLift":"Lift on hover",
 "cz.shape":"Button shape","cz.shape.pill":"Pill","cz.shape.round":"Rounded","cz.shape.square":"Sharp","cz.priBg":"Primary buttons",
 "cz.selBg":"Selected option","cz.swOn":"Switches when on",
 "cz.dens":"Density","cz.dens.compact":"Compact","cz.dens.normal":"Normal","cz.dens.roomy":"Roomy","cz.hov":"Hover highlight","cz.div":"Dividers",
 "cz.heroK":"Title size","cz.heroC":"Title colour","cz.heroSub":"Subtitle","cz.hsBg":"“Collections” sheet","cz.fieldC":"Particle colour",
 "cz.fieldA":"Particle brightness",
 "cz.fpCovR":"Cover corners","cz.lyA":"Current lyric line","cz.lyI":"Other lines",
 "cz.mOut":"My messages","cz.mIn":"Incoming messages","cz.mPane":"Chat background","cz.mR":"Bubble corners","cz.mFs":"Text size",
 "cz.mSide":"Side padding","cz.mMaxW":"Bubble width","cz.mNarrow":"Narrow centred column",
 "cz.menuBg":"Context menus","cz.dlgBg":"Dialogs & settings","cz.dlgR":"Dialog corners","cz.toast":"Notifications","cz.scrim":"Backdrop dimming",
 "cz.scW":"Width","cz.scW.thin":"Thin","cz.scW.normal":"Normal","cz.scW.none":"Hidden","cz.scC":"Colour",
 "cz.tbBg":"Background","cz.tbBrand":"Name & icon"});

/* ── colour helpers ── */
const rgbOf=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lum=h=>{const c=rgbOf(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
/* Text that stays readable on a fill the user picked: whichever of near-black
   and white has the higher contrast ratio against it. */
const onC=h=>{const L=lum(h);return (L+.05)/.05>=1.05/(L+.05)?"#111114":"#ffffff"};
const mix=(h,p)=>p>=100?h:`color-mix(in srgb,${h} ${p}%,transparent)`;
const px=v=>v+"px";

/* ── schema ──
   ty: c colour · r range · s choice · t switch. th: colour kept per theme.
   css(v,P,ctx) returns rules under the prefix P (theme or shared). pv is how
   an untouched colour is previewed: a CSS expression, or [selector, property,
   pseudo] read from the live element. */
const IS_TAURI_DESK=()=>de.dataset.shell==="tauri"&&!/android|ios/.test(de.dataset.os||"");
const G=[
 {id:"base",ic:"format_paint",items:[
  {k:"bg",ty:"c",th:1,pv:"var(--bg)",css:(v,P)=>`${P}{--bg:${v}!important}`},
  {k:"text",ty:"c",th:1,pv:"var(--text)",css:(v,P)=>`${P}{--text:${v}!important}`},
  {k:"mute",ty:"c",th:1,pv:"var(--mute)",css:(v,P)=>`${P}{--mute:${v}!important}`},
  {k:"line",ty:"c",th:1,pv:"var(--line-2)",css:(v,P)=>`${P}{--line:${mix(v,24)}!important;--line-2:${mix(v,40)}!important;--glass-line:${mix(v,22)}!important;--dlg-line:${mix(v,24)}!important}`},
  {k:"fontK",ty:"r",min:85,max:125,step:5,def:100,u:"%",css:(v,P)=>{const s=px((16*v/100).toFixed(2));return `${P}{font-size:${s}!important}${P} body{font-size:${s}!important}`}},
  {k:"zoom",ty:"r",min:80,max:150,step:5,def:100,u:"%",hint:1,only:()=>IS_TAURI_DESK()&&!!window.__TAURI__?.webview?.getCurrentWebview}]},
 {id:"panel",ic:"dashboard",items:[
  {k:"surf",ty:"c",th:1,pv:"var(--surf)"},
  {k:"surfA",ty:"r",min:0,max:100,step:1,def:null,ph:62,u:"%",hint:1},
  {k:"search",ty:"c",th:1,pv:[".search","background-color"],css:(v,P,c)=>`${P} .search,${P} .search:hover,${P} .search:focus-within{background:${mix(v,c.A)}!important}`},
  {k:"radius",ty:"r",min:0,max:36,step:1,def:24,u:"px",css:(v,P)=>`${P}{--r-lg:${px(v)}!important;--r:${px(Math.round(v*.58))}!important}${P} .app>footer.bar{border-radius:${px(v)}!important}`},
  {k:"shadow",ty:"t",def:1,css:(v,P)=>v?"":`${P} :is(.pane,.app>footer.bar,.hsheet,.search,.mb,.ctx){box-shadow:none!important}`}]},
 {id:"rail",ic:"side_navigation",items:[
  {k:"railBg",ty:"c",th:1,pv:[".rail","background-color"],css:(v,P,c)=>`${P} .rail.pane{background:${mix(v,c.A)}!important}`},
  {k:"railAct",ty:"c",th:1,pv:[".rail","background-color","::before"],css:(v,P)=>`${P} .rail::before{background:${mix(v,18)}!important;box-shadow:inset 0 0 0 1px ${mix(v,28)}!important}${P} .navbtn[aria-current="true"] .nav-icon-box .material-symbols-rounded{color:${v}!important}`
   /* the phone layout marks the current tab with a filled icon box instead */
   +`@media (max-width:700px){${P} .rail .navbtn[aria-current="true"] .nav-icon-box{background:${v}!important}${P} .rail .navbtn[aria-current="true"] .nav-icon-box .material-symbols-rounded{color:${onC(v)}!important}}`},
  {k:"railIc",ty:"c",th:1,pv:['.navbtn:not([aria-current="true"])',"color"],css:(v,P)=>`${P} .navbtn:not([aria-current="true"]):not(:hover){color:${v}!important}`},
  {k:"railLbl",ty:"t",def:1,css:(v,P)=>v?"":`${P} .navbtn>span[data-i18n]{display:none!important}${P} .navbtn{padding:9px 0!important}`},
  {k:"railLogo",ty:"t",def:1,css:(v,P)=>v?"":`${P} .rail>.mark{display:none!important}`}]},
 {id:"bar",ic:"play_circle",items:[
  {k:"barBg",ty:"c",th:1,pv:[".app>footer.bar","background-color"],css:(v,P,c)=>`${P} .app>footer.bar{background:${mix(v,c.A)}!important}`},
  {k:"barR",ty:"r",min:0,max:36,step:1,def:24,u:"px",css:(v,P)=>`${P} .app>footer.bar{border-radius:${px(v)}!important}`},
  {k:"seekC",ty:"c",th:1,pv:"var(--accent)",css:(v,P)=>`${P} #btrack .m3w{color:${v}!important}${P} #btrack .m3w-rest{background:${mix(v,24)}!important}${P} #btrack .f,${P} #btrack .h{background:${v}!important}`},
  {k:"seekWave",ty:"t",def:1},
  {k:"playBg",ty:"c",th:1,pv:[".app>footer.bar .play","background-color"],css:(v,P)=>`${P} .app>footer.bar .play{background:${v}!important;color:${onC(v)}!important}${P} .app>footer.bar .play .material-symbols-rounded{color:${onC(v)}!important}`},
  {k:"barIc",ty:"c",th:1,pv:[".app>footer.bar .ctrls .ic","color"],css:(v,P)=>`${P} .app>footer.bar .ic:not([aria-pressed="true"]):not(:hover){color:${v}!important}${P} .app>footer.bar .seek .t{color:${v}!important}`},
  {k:"artR",ty:"r",min:0,max:21,step:1,def:10,u:"px",css:(v,P)=>`${P} .app>footer.bar .np .art{border-radius:${px(v)}!important}`}]},
 {id:"cov",ic:"image",items:[
  {k:"covR",ty:"r",min:0,max:40,step:1,def:24,u:"px",css:(v,P)=>`${P} :is(.plc,.plc .sq,.cover:not(.sm),.hs-art,.dc-cover){border-radius:${px(v)}!important}${P} :is(.art,.cover.sm,.fpq-art,.acc-row-art){border-radius:${px(Math.round(v*.42))}!important}`},
  {k:"covSh",ty:"t",def:1,css:(v,P)=>v?"":`${P} :is(.plc .sq,.cover,.hs-art,.fpx-cover,.art,.dc-cover){box-shadow:none!important}`},
  {k:"covLift",ty:"t",def:1,css:(v,P)=>v?"":`${P} :is(.plc:hover .sq,.hs-card:hover .hs-art){transform:none!important}`}]},
 {id:"ctl",ic:"toggle_on",items:[
  {k:"shape",ty:"s",def:"pill",opts:["pill","round","square"],css:(v,P)=>{const r=v==="round"?12:v==="square"?6:0;if(!r)return "";
   return `${P} :is(.btn,.primary,.m3b,.dlg-btn,.eqbtn,.seg button,.seg::before,.hs-tab,.cz-chip){border-radius:${px(r)}!important}${P} .seg{border-radius:${px(r+3)}!important}`}},
  {k:"priBg",ty:"c",th:1,pv:[".primary","background-color"],css:(v,P)=>`${P} .primary:not(.danger){background:${v}!important;color:${onC(v)}!important}`},
  {k:"selBg",ty:"c",th:1,pv:[".seg","background-color","::before"],css:(v,P)=>`${P} .seg::before{background:${v}!important}${P} .seg button[aria-pressed="true"]{color:${onC(v)}!important}`},
  {k:"swOn",ty:"c",th:1,pv:['.sw[aria-pressed="true"]',"background-color"],css:(v,P)=>`${P} .sw[aria-pressed="true"]{background:${v}!important}${P} .sw[aria-pressed="true"]::after{background:${onC(v)}!important}`}]},
 {id:"rows",ic:"format_list_bulleted",items:[
  {k:"dens",ty:"s",def:"normal",opts:["compact","normal","roomy"],css:(v,P)=>{if(v==="normal")return "";const p=v==="compact"?5:15;
   return `${P} .row{padding-top:${px(p)}!important;padding-bottom:${px(p)}!important;contain-intrinsic-size:auto ${px(43+2*p)}!important}`}},
  {k:"hov",ty:"c",th:1,pv:"color-mix(in srgb,var(--text) 10%,transparent)",css:(v,P)=>`${P} .row:hover{background:${mix(v,14)}!important}`},
  {k:"div",ty:"t",def:1,css:(v,P)=>v?"":`${P} .row{border-top-color:transparent!important}`}]},
 {id:"home",ic:"home",items:[
  {k:"heroK",ty:"r",min:60,max:150,step:5,def:100,u:"%",css:(v,P)=>`${P}{--cz-hero:${v/100}!important}`},
  {k:"heroC",ty:"c",th:1,pv:[".hero h1","color"],css:(v,P)=>`${P} .hero h1{color:${v}!important;-webkit-text-fill-color:${v}!important}`},
  {k:"heroSub",ty:"t",def:1,css:(v,P)=>v?"":`${P} #hero-s{display:none!important}`},
  {k:"hsBg",ty:"c",th:1,pv:[".hsheet","background-color"],css:(v,P,c)=>`${P} .hsheet,${P} .hsheet[data-open="true"]{background:${mix(v,c.A)}!important}`},
  {k:"fieldC",ty:"c",th:1,pv:"rgb(var(--pr) var(--pg) var(--pb))"},
  {k:"fieldA",ty:"r",min:0,max:100,step:5,def:100,u:"%",css:(v,P)=>`${P}{--cz-fa:${v/100}!important}`}]},
 {id:"fp",ic:"fullscreen",items:[
  {k:"fpCovR",ty:"r",min:0,max:48,step:1,def:null,ph:22,u:"px",css:(v,P)=>`${P} .fpx-cover{border-radius:${px(v)}!important}`},
  {k:"lyA",ty:"c",pv:"#ffffff",css:(v,P)=>`${P} #fplyr[data-synced="true"] p[data-on="true"]{background:linear-gradient(90deg,${v} calc(var(--karaoke-pct,0%) - 3%),${mix(v,42)} calc(var(--karaoke-pct,0%) + 3%))!important;-webkit-background-clip:text!important;background-clip:text!important}${P} :is(#fplyr[data-synced="false"] p,#fplyr[data-karaoke="off"] p[data-on="true"]){color:${v}!important;-webkit-text-fill-color:${v}!important}`},
  {k:"lyI",ty:"c",pv:"#ffffff",css:(v,P)=>`${P} :is(#fplyr[data-synced="true"] p:not([data-on="true"]),#fplyr[data-karaoke="off"] p:not([data-on="true"])){color:${v}!important;-webkit-text-fill-color:${v}!important;background:none!important}`}]},
 {id:"chat",ic:"chat",items:[
  {k:"mOut",ty:"c",th:1,pv:"var(--m-out)",css:(v,P)=>`${P}{--m-out:${v}!important;--m-out-t:${onC(v)}!important}`},
  {k:"mIn",ty:"c",th:1,pv:"var(--m-in)",css:(v,P)=>`${P}{--m-in:${v}!important}${P} .mrow:not(.out) .mb{color:${onC(v)}!important}`},
  {k:"mPane",ty:"c",th:1,pv:"var(--m-pane)",css:(v,P,c)=>`${P}{--m-pane:${mix(v,c.A)}!important}`},
  {k:"mR",ty:"r",min:2,max:26,step:1,def:18,u:"px",css:(v,P)=>`${P}{--m-r:${px(v)}!important}`},
  {k:"mFs",ty:"r",min:80,max:140,step:5,def:100,u:"%",css:(v,P)=>`${P} .mb{font-size:${(.92*v/100).toFixed(3)}rem!important}`},
  /* Round 8: the log runs edge to edge now; these bring the column back. */
  {k:"mSide",ty:"r",min:0,max:160,step:2,def:null,ph:14,u:"px",css:(v,P)=>`${P} .mlog{padding-inline:${px(v)}!important}`},
  {k:"mMaxW",ty:"r",min:40,max:100,step:2,def:null,ph:78,u:"%",css:(v,P)=>`${P} .mb{max-width:${v}%!important}`},
  {k:"mNarrow",ty:"t",def:0,css:(v,P)=>v?`${P} .mlog-in{max-width:820px!important}`:""}]},
 {id:"menu",ic:"web_asset",items:[
  {k:"menuBg",ty:"c",th:1,pv:"var(--menu-bg)",css:(v,P,c)=>`${P}{--menu-bg:${mix(v,Math.max(c.A,90))}!important}`},
  {k:"dlgBg",ty:"c",th:1,pv:"var(--dlg-bg)",css:(v,P)=>`${P}{--dlg-bg:${mix(v,97)}!important}`},
  {k:"dlgR",ty:"r",min:4,max:40,step:1,def:null,ph:16,u:"px",css:(v,P)=>`@media (min-width:701px){${P} :is(.modalbox,.mdd,#v-settings.setov-box){border-radius:${px(v)}!important}}`},
  {k:"toast",ty:"c",th:1,pv:"var(--m3-inv-surf)",css:(v,P)=>`${P}{--m3-inv-surf:${v}!important;--m3-inv-on:${onC(v)}!important}`},
  {k:"scrim",ty:"r",min:0,max:90,step:5,def:null,ph:45,u:"%",css:(v,P)=>`${P}{--dlg-scrim:rgb(0 0 0 / ${v}%)!important}`}]},
 {id:"scroll",ic:"swap_vert",items:[
  {k:"scW",ty:"s",def:"normal",opts:["thin","normal","none"],css:(v,P)=>v==="thin"?`${P} *::-webkit-scrollbar{width:7px!important;height:7px!important}`
   :v==="none"?`${P} *::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}${P} *{scrollbar-width:none!important}`:""},
  {k:"scC",ty:"c",th:1,pv:"var(--line-2)",css:(v,P)=>`${P} *::-webkit-scrollbar-thumb{background:${mix(v,60)}!important;background-clip:content-box!important}${P} *::-webkit-scrollbar-thumb:hover{background:${v}!important;background-clip:content-box!important}`}]},
 {id:"tb",ic:"web",only:IS_TAURI_DESK,items:[
  {k:"tbBg",ty:"c",th:1,pv:[".titlebar","background-color"],css:(v,P)=>`${P} .titlebar{background:${v}!important}`},
  {k:"tbBrand",ty:"t",def:1,css:(v,P)=>v?"":`${P} .tb-brand{display:none!important}`}]}];
const ITEMS=G.flatMap(g=>g.items.map(it=>(it.g=g.id,it)));
const BY=Object.fromEntries(ITEMS.map(it=>[it.k,it]));

/* Presets replace the whole set. Colours only where a preset is about colour,
   and then for the theme it was drawn for. */
const PRESETS=[
 {id:"std",v:{}},
 {id:"compact",v:{a:{fontK:90,dens:"compact",radius:16,barR:16,covR:12,artR:7,railLbl:0,scW:"thin",mR:12,dlgR:20}}},
 {id:"soft",v:{a:{radius:32,barR:32,covR:30,artR:16,fpCovR:40,mR:24,dlgR:36}}},
 {id:"strict",v:{a:{radius:6,barR:6,covR:4,artR:3,fpCovR:6,shape:"square",mR:6,dlgR:10,shadow:0,covSh:0,covLift:0}}},
 {id:"solid",v:{a:{surfA:100,shadow:0}}},
 {id:"oled",v:{a:{surfA:100},d:{bg:"#000000",surf:"#0b0b0e",line:"#34343c",railBg:"#0b0b0e",barBg:"#0b0b0e",search:"#0b0b0e",hsBg:"#0b0b0e",
  mPane:"#050507",mIn:"#17171c",menuBg:"#121216",dlgBg:"#0b0b0e",tbBg:"#000000"}}},
 {id:"paper",v:{l:{bg:"#f3eee4",surf:"#fbf8f1",text:"#2a251f",mute:"#776c5f",line:"#8c7c66",railBg:"#f8f4ec",barBg:"#f8f4ec",search:"#fbf8f1",
  hsBg:"#f8f4ec",mPane:"#fbf8f1",mIn:"#ffffff",mOut:"#e9dfcd",menuBg:"#fbf8f1",dlgBg:"#f8f4ec",priBg:"#2a251f",selBg:"#2a251f"}}}];

/* ── store ── */
const empty=()=>({a:{},d:{},l:{}});
function valid(it,v){
 if(v==null||!it)return undefined;
 if(it.ty==="c")return typeof v==="string"&&HEX.test(v)?v.toLowerCase():undefined;
 if(it.ty==="r"){const n=Number(v);if(!Number.isFinite(n))return undefined;const st=it.step||1;
  return Math.min(it.max,Math.max(it.min,Math.round(n/st)*st))}
 if(it.ty==="s")return it.opts.includes(v)?v:undefined;
 if(it.ty==="t")return v===0||v===false||v==="0"?0:1}
/* Validated copy: unknown keys, wrong types and stock values are dropped. */
function clean(o){
 if(!o||typeof o!=="object"||Array.isArray(o))return null;
 const out=empty();
 for(const it of ITEMS)for(const s of it.th?["d","l"]:["a"]){
  const v=valid(it,o[s]?.[it.k]);
  if(v!==undefined&&v!==it.def)out[s][it.k]=v}
 return out}
const isEmpty=c=>!c||!["a","d","l"].some(s=>c[s]&&Object.keys(c[s]).length);
function CZ(){
 if(!S.x.cz||typeof S.x.cz!=="object")S.x.cz=empty();
 for(const s of ["a","d","l"])if(!S.x.cz[s]||typeof S.x.cz[s]!=="object")S.x.cz[s]=empty()[s];
 return S.x.cz}
const TK=()=>de.dataset.theme==="light"?"l":"d";
const slot=it=>it.th?TK():"a";
const getV=it=>CZ()[slot(it)][it.k];
function setV(it,v){
 const c=CZ(),s=slot(it);
 if(v===undefined||v===null||v===it.def)delete c[s][it.k];else c[s][it.k]=v}

/* ── stylesheet ── */
const PANEL_BASE={d:"#1b1b23",l:"#fbfbfd"};
function panelCSS(vals,A,P,th){
 if(vals.surf==null&&A==null)return "";
 const b=vals.surf||PANEL_BASE[th],a=A??62;
 return `${P}{--surf:${mix(b,a)}!important;--surf-2:${mix(b,Math.min(100,a+14))}!important;--glass:${mix(b,a)}!important;--glass-hi:${mix(b,Math.min(100,a+28))}!important}`}
function buildCSS(c){
 const A=c.a.surfA,ctx={A:A??88};
 let out="";
 for(const th of ["d","l"]){
  const P=`html[data-theme="${th==="d"?"dark":"light"}"]`,vals=c[th];
  out+=panelCSS(vals,A,P,th);
  for(const it of ITEMS)if(it.th&&it.css&&vals[it.k]!=null)out+=it.css(vals[it.k],P,ctx)}
 const P="html[data-theme]";
 for(const it of ITEMS)if(!it.th&&it.css&&c.a[it.k]!=null){const s=it.css(c.a[it.k],P,ctx);if(s)out+=s}
 return out.replace(/\}(?=\S)/g,"}\n")}
let ZOOM=1;
function zoomApply(){
 const it=BY.zoom,want=de.dataset.mini==="on"?1:(CZ().a.zoom||100)/100;
 if(!it.only()||Math.abs(want-ZOOM)<.001)return;
 ZOOM=want;
 try{window.__TAURI__.webview.getCurrentWebview().setZoom(want)?.catch?.(e=>console.warn("[meowave] zoom:",e?.message||e))}
 catch(e){console.warn("[meowave] zoom:",e?.message||e)}}
let RAF=0;
function apply(persist){
 cancelAnimationFrame(RAF);RAF=0;
 const c=CZ(),css=buildCSS(c);
 let st=$("cz-style");
 if(!st){st=document.createElement("style");st.id="cz-style";document.head.appendChild(st)}
 if(st.textContent!==css)st.textContent=css;
 window.CZ_FLAT=c.a.seekWave===0;
 const fc=c[TK()].fieldC;window.CZ_FIELD=fc?rgbOf(fc):null;
 zoomApply();
 if(persist)try{css?localStorage.setItem("meowave_cz_css",css):localStorage.removeItem("meowave_cz_css")}catch(_){}
 requestAnimationFrame(()=>{try{paintRail()}catch(_){}})}
const applySoon=()=>{if(!RAF)RAF=requestAnimationFrame(()=>{RAF=0;apply(false)})};
function commit(){S.x.czp="";apply(true);save();try{pushPrefs()}catch(_){}paintHead()}

/* Appearance travels with the account (pushPrefs spreads this in). A blob
   too big for the prefs cap is simply not sent. */
window.customPrefs=()=>{const c=CZ();if(isEmpty(c))return {cz:null};
 const s=JSON.stringify(c);return s.length<=3000?{cz:JSON.parse(s)}:{}};
/* A machine that has never been customised takes the account's look. */
window.czAdopt=r=>{const v=clean(r);if(!v||isEmpty(v)||!isEmpty(CZ()))return;
 S.x.cz=v;apply(true);save();render()};

/* ── editor ── */
const cv=document.createElement("canvas");cv.width=cv.height=1;
const g2=cv.getContext("2d",{willReadFrequently:true});
function toHex(col){
 if(!col||!g2)return "#000000";
 g2.clearRect(0,0,1,1);g2.fillStyle="#000";g2.fillStyle=col;g2.fillRect(0,0,1,1);
 const d=g2.getImageData(0,0,1,1).data;
 return "#"+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,"0")).join("")}
let PROBE=null;
/* What an untouched element looks like right now, as a CSS colour. */
function current(it){
 const pv=it.pv;
 if(Array.isArray(pv)){const el=document.querySelector(pv[0]);
  return el?getComputedStyle(el,pv[2]||null).getPropertyValue(pv[1]).trim():""}
 if(!PROBE||!pv)return "";
 PROBE.style.color="";PROBE.style.color=pv;
 return getComputedStyle(PROBE).color}
const label=k=>t("cz."+k);
const visible=it=>!it.only||it.only();
function ctlHTML(it){
 const id="cz-"+it.k;
 if(it.ty==="c")return `<span class="cz-hex" aria-hidden="true"></span><label class="cz-sw"><input type="color" id="${id}" data-cz="${it.k}" aria-label="${esc(label(it.k))}"><i></i></label>`;
 if(it.ty==="r")return `<input type="range" id="${id}" data-cz="${it.k}" min="${it.min}" max="${it.max}" step="${it.step||1}" aria-label="${esc(label(it.k))}"><output class="cz-v" for="${id}"></output>`;
 if(it.ty==="s")return `<div class="seg" id="${id}" role="group" data-cz="${it.k}" aria-label="${esc(label(it.k))}">${it.opts.map(o=>`<button type="button" data-v="${o}" data-i18n="cz.${it.k}.${o}">${esc(t(`cz.${it.k}.${o}`))}</button>`).join("")}</div>`;
 return `<button type="button" class="sw" id="${id}" data-cz="${it.k}" aria-pressed="false" aria-label="${esc(label(it.k))}"></button>`}
function rowHTML(it){
 const hint=it.hint?`<small data-i18n="cz.${it.k}.s">${esc(t(`cz.${it.k}.s`))}</small>`:"";
 return `<div class="field cz-it" data-k="${it.k}" data-ty="${it.ty}"><div><label${it.ty==="c"||it.ty==="r"?` for="cz-${it.k}"`:""} data-i18n="cz.${it.k}">${esc(label(it.k))}</label>${hint}</div>
  <div class="cz-c">${ctlHTML(it)}<button type="button" class="cz-rs" data-rs="${it.k}" data-i18n-title="cz.reset1" title="${esc(t("cz.reset1"))}" aria-label="${esc(t("cz.reset1"))}"><span class="material-symbols-rounded" aria-hidden="true">restart_alt</span></button></div></div>`}
function groupHTML(gr){
 return `<details class="cz-g" data-g="${gr.id}"><summary><span class="cz-gi" aria-hidden="true"><span class="material-symbols-rounded">${gr.ic}</span></span>
  <span class="cz-gt"><b data-i18n="cz.g.${gr.id}">${esc(t("cz.g."+gr.id))}</b><small data-i18n="cz.g.${gr.id}.s">${esc(t(`cz.g.${gr.id}.s`))}</small></span>
  <span class="cz-n" aria-hidden="true"></span><span class="material-symbols-rounded cz-chev" aria-hidden="true">expand_more</span></summary>
  <div class="cz-body">${gr.items.filter(visible).map(rowHTML).join("")}
  <div class="cz-gfoot"><button type="button" class="btn ghost sm" data-rsg="${gr.id}" data-i18n="cz.resetg">${esc(t("cz.resetg"))}</button></div></div></details>`}
function build(host){
 host.innerHTML=`<h3 data-i18n="cz.t">${esc(t("cz.t"))}</h3><p class="ph" data-i18n="cz.s">${esc(t("cz.s"))}</p>
  <div class="cz-presets" role="group" aria-label="${esc(t("cz.p"))}"><span class="cz-pl" data-i18n="cz.p">${esc(t("cz.p"))}</span>${PRESETS.map(p=>`<button type="button" class="cz-chip" data-czp="${p.id}" aria-pressed="false" data-i18n="cz.p.${p.id}">${esc(t("cz.p."+p.id))}</button>`).join("")}</div>
  <div class="cz-top"><label class="cz-find"><span class="material-symbols-rounded" aria-hidden="true">search</span><input type="search" id="cz-q" autocomplete="off" data-i18n-ph="cz.find" placeholder="${esc(t("cz.find"))}"></label>
   <button type="button" class="btn" id="cz-exp"><span class="material-symbols-rounded" aria-hidden="true">ios_share</span><span data-i18n="cz.exp">${esc(t("cz.exp"))}</span></button>
   <button type="button" class="btn" id="cz-imp"><span class="material-symbols-rounded" aria-hidden="true">download</span><span data-i18n="cz.imp">${esc(t("cz.imp"))}</span></button>
   <button type="button" class="btn ghost" id="cz-reset" data-i18n="cz.resetall">${esc(t("cz.resetall"))}</button></div>
  <p class="cz-note"><span class="material-symbols-rounded" aria-hidden="true">contrast</span><span id="cz-th"></span></p>
  <div class="cz-groups">${G.filter(visible).map(groupHTML).join("")}<p class="cz-empty" id="cz-none" hidden data-i18n="cz.none">${esc(t("cz.none"))}</p></div>
  <i class="cz-probe" aria-hidden="true"></i>`;
 PROBE=host.querySelector(".cz-probe")}
function paintRow(row){
 const it=BY[row.dataset.k];if(!it)return;
 const v=getV(it),set=v!==undefined;
 row.dataset.set=set?"1":"0";
 const el=row.querySelector("[data-cz]");
 if(it.ty==="c"){
  const cur=set?v:current(it),hex=set?v:toHex(cur);
  row.querySelector(".cz-sw").style.setProperty("--c",set?v:cur||"transparent");
  if(document.activeElement!==el)el.value=hex;
  row.querySelector(".cz-hex").textContent=set?v.toUpperCase():t("cz.auto")}
 else if(it.ty==="r"){
  const n=set?v:(it.def??it.ph??it.min);
  if(document.activeElement!==el||!set)el.value=String(n);
  try{paintRange(el)}catch(_){}
  row.querySelector(".cz-v").textContent=set||it.def!=null?n+(it.u==="%"?"%":" px"):t("cz.auto")}
 else if(it.ty==="s"){
  const cur=set?v:it.def;
  el.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.v===cur)));
  try{paintSeg(el)}catch(_){}}
 else{const on=(set?v:it.def)!==0;el.setAttribute("aria-pressed",String(on));el.classList.toggle("on",on)}}
function paintHead(){
 const host=$("cz-panel");if(!host||!host.firstElementChild)return;
 const th=$("cz-th");if(th)th.textContent=t(TK()==="l"?"cz.th.l":"cz.th.d");
 host.querySelectorAll(".cz-chip").forEach(b=>b.setAttribute("aria-pressed",String((S.x.czp||(isEmpty(CZ())?"std":""))===b.dataset.czp)));
 const c=CZ();
 host.querySelectorAll(".cz-g").forEach(gd=>{
  const n=G.find(x=>x.id===gd.dataset.g).items.filter(it=>visible(it)&&c[slot(it)][it.k]!==undefined).length;
  gd.querySelector(".cz-n").textContent=n?String(n):""})}
function paintGroup(gd){gd.querySelectorAll(".cz-it").forEach(paintRow)}
function render(){
 const host=$("cz-panel");if(!host)return;
 if(!host.firstElementChild)build(host);
 host.querySelectorAll(".cz-g[open]").forEach(paintGroup);
 paintHead()}
function find(q){
 const host=$("cz-panel");if(!host)return;
 q=(q||"").trim().toLowerCase();
 let any=false;
 host.querySelectorAll(".cz-g").forEach(gd=>{
  const gt=gd.querySelector(".cz-gt b").textContent.toLowerCase();
  let hit=0;
  gd.querySelectorAll(".cz-it").forEach(r=>{const ok=!q||gt.includes(q)||r.textContent.toLowerCase().includes(q);r.hidden=!ok;if(ok)hit++});
  gd.hidden=!!q&&!hit;
  if(q){if(hit&&!gd.open){gd.dataset.auto="1";gd.open=true}}
  else if(gd.dataset.auto){delete gd.dataset.auto;gd.open=false}
  if(hit)any=true});
 const none=$("cz-none");if(none)none.hidden=!q||any}

/* ── events ── */
function onInput(e){
 const el=e.target.closest?.("[data-cz]");if(!el)return;
 const it=BY[el.dataset.cz];if(!it)return;
 if(it.ty==="c"&&HEX.test(el.value))setV(it,el.value.toLowerCase());
 else if(it.ty==="r")setV(it,valid(it,el.value));
 else return;
 const row=el.closest(".cz-it");if(row){row.dataset.set=getV(it)!==undefined?"1":"0";
  if(it.ty==="c"){row.querySelector(".cz-sw").style.setProperty("--c",el.value);row.querySelector(".cz-hex").textContent=el.value.toUpperCase()}
  else row.querySelector(".cz-v").textContent=el.value+(it.u==="%"?"%":" px")}
 applySoon();
 if(e.type==="change"){commit();if(row)paintRow(row)}}
function resetKeys(keys){
 const c=CZ();
 keys.forEach(k=>{const it=BY[k];if(it)delete c[slot(it)][k]});
 commit();render()}
async function onClick(e){
 const host=$("cz-panel");
 const rs=e.target.closest("[data-rs]");
 if(rs){resetKeys([rs.dataset.rs]);return}
 const rg=e.target.closest("[data-rsg]");
 if(rg){resetKeys(G.find(x=>x.id===rg.dataset.rsg).items.map(it=>it.k));return}
 const segB=e.target.closest(".cz-it .seg button");
 if(segB){const it=BY[segB.closest("[data-cz]").dataset.cz];setV(it,valid(it,segB.dataset.v));commit();paintRow(segB.closest(".cz-it"));return}
 const sw=e.target.closest(".cz-it .sw");
 if(sw){const it=BY[sw.dataset.cz];const on=sw.getAttribute("aria-pressed")!=="true";setV(it,on?1:0);commit();paintRow(sw.closest(".cz-it"));return}
 const chip=e.target.closest("[data-czp]");
 if(chip){const p=PRESETS.find(x=>x.id===chip.dataset.czp);if(!p)return;
  S.x.cz=clean(p.v)||empty();apply(true);S.x.czp=p.id;save();try{pushPrefs()}catch(_){}render();
  toast(t("cz.p.done").replace("{n}",t("cz.p."+p.id)),2200,{icon:"palette"});return}
 if(e.target.closest("#cz-exp")){
  const c=CZ(),body=JSON.stringify({meowave:"theme",v:1,a:c.a,d:c.d,l:c.l});
  const ok=await (window.MW3?.copyText?window.MW3.copyText(body):navigator.clipboard.writeText(body).then(()=>true,()=>false));
  if(ok)toast(t("cz.exp.ok"),2600,{icon:"ios_share"});return}
 if(e.target.closest("#cz-imp")){
  const raw=await askText(t("cz.imp.t"),"",{icon:"palette",label:t("cz.imp.l"),confirm:t("cz.imp.ok"),required:true,max:6000});
  if(!raw)return;
  let v=null;try{const o=JSON.parse(raw);v=o&&(o.meowave==="theme"||o.a||o.d||o.l)?clean(o):null}catch(_){}
  if(!v){toast(t("cz.imp.bad"),3000,{icon:"error"});return}
  S.x.cz=v;commit();render();toast(t("cz.imp.done"),2200,{icon:"check_circle"});return}
 if(e.target.closest("#cz-reset")){
  if(isEmpty(CZ()))return;
  const ok=await askConfirm(t("cz.reset.q"),t("cz.reset.ok"),true,{icon:"restart_alt"});
  if(!ok)return;
  S.x.cz=empty();S.x.czp="std";apply(true);save();try{pushPrefs()}catch(_){}render();toast(t("cz.reset.done"),2200,{icon:"restart_alt"})}
 void host}

function init(){
 const host=$("cz-panel");
 apply(true);
 if(!host)return;
 build(host);paintHead();
 host.addEventListener("input",onInput);
 host.addEventListener("change",onInput);
 host.addEventListener("click",onClick);
 host.addEventListener("toggle",e=>{const gd=e.target;if(gd.classList?.contains("cz-g")&&gd.open)paintGroup(gd)},true);
 host.addEventListener("input",e=>{if(e.target.id==="cz-q")find(e.target.value)});
 /* the settings search marks matching rows; open the sections holding them */
 $("setov-q")?.addEventListener("input",()=>requestAnimationFrame(()=>{
  host.querySelectorAll(".cz-g").forEach(gd=>{const hit=!!gd.querySelector('[data-hit="true"]');
   if(hit&&!gd.open){gd.dataset.auto="1";gd.open=true}else if(!hit&&gd.dataset.auto){delete gd.dataset.auto;gd.open=false}})}));
 new MutationObserver(ms=>{
  if(ms.some(m=>m.attributeName==="data-mini")){zoomApply();return}
  apply(false);render()}).observe(de,{attributes:true,attributeFilter:["data-theme","lang","data-mini"]})}
init();
window.MWCZ={apply,render,get:()=>JSON.parse(JSON.stringify(CZ())),set:o=>{const v=clean(o);if(v){S.x.cz=v;commit();render()}return !!v},css:()=>buildCSS(CZ()),items:()=>ITEMS.map(it=>it.k)};
})();
