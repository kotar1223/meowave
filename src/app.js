/* Boot error surface. A top-level throw used to mean a silent black window:
   the splash never finished and nothing anywhere said why. Any uncaught error
   or rejection now paints itself onto the splash and the window title, so a
   broken boot is readable at a glance instead of a debugging session. */
(function(){
 const paint=(kind,msg,src,line)=>{
  try{
   const txt=`${kind}: ${msg||"unknown"}`+(src?` (${String(src).split("/").pop()}:${line||"?"})`:"");
   console.error("[meowave]",txt);
   document.title="⚠ "+txt.slice(0,140);
   const sp=document.getElementById("splash");
   if(!sp)return;
   let box=document.getElementById("booterr");
   if(!box){box=document.createElement("pre");box.id="booterr";sp.appendChild(box)}
   box.textContent+=(box.textContent?"\n":"")+txt;
  }catch(_){/* never let the reporter throw */}
 };
 addEventListener("error",e=>paint("error",e.message,e.filename,e.lineno));
 addEventListener("unhandledrejection",e=>{
  const r=e.reason;paint("promise",r&&r.message||String(r))});
})();

/* boot: частицы собирают круг -> ударная волна */
const BOOT={done:false,reduce:matchMedia("(prefers-reduced-motion: reduce)").matches};
document.documentElement.classList.add("booting");
function bootFinish(){
 if(BOOT.done)return;BOOT.done=true;
 const sp=document.getElementById("splash");
 sp?.classList.add("done");
 if(!BOOT.reduce)shock(1.45);else F.mode=S.playing?"flow":"cloud";
 /* сначала гасим чёрную подложку, и только потом возвращаем канвас под UI —
    иначе частицы на секунду пропадают за ещё не исчезнувшим сплэшем */
 setTimeout(()=>sp?.setAttribute("hidden",""),BOOT.reduce?60:420);
 setTimeout(()=>document.documentElement.classList.remove("booting"),BOOT.reduce?120:1050);
}
/* i18n */
const I18N={
ru:{"nav.home":"Волна","nav.search":"Поиск","nav.library":"Медиа","nav.settings":"Настройки",
"top.ph":"Поиск по всем сервисам",
"home.t":"Тишина. Поле ждёт.","home.s":"Запустите волну: поток соберётся из ваших артистов, обложка и очередь откроются на весь экран.","home.start":"Запустить волну",
"lib.pl":"Плейлисты","lib.fav":"Избранное","lib.rec":"Недавнее",
"set.t":"Настройки","set.acc":"Аккаунты","set.acc.s":"Authorization Code + PKCE, без сервера. Spotify — схема meowave://callback, Google/YouTube — localhost-редирект.",
"set.sp":"Пространственный звук","set.sp.s":"PannerNode в режиме HRTF: источник летает вокруг головы по орбите и проходит над ней. Плюс ConvolverNode для комнаты.",
"set.sp.on":"Движение вокруг головы","set.sp.hint":"Только в наушниках","set.sp.speed":"Скорость оборота","set.sp.rad":"Радиус орбиты","set.sp.elev":"Проход над головой",
"set.q":"Качество","set.q.s":"Lossless там, где сервис его отдаёт.","set.q.l":"Поток","q.low":"Низкое","q.mid":"Среднее","q.high":"Высокое",
"set.look":"Вид","set.look.s":"Плотность частиц влияет на нагрузку сильнее всего остального.","set.theme":"Тема","set.accent":"Акцентный цвет","set.accent.s":"По умолчанию без цвета",
"set.dens":"Плотность частиц","set.speed":"Скорость движения","set.glow":"Свечение","set.blur":"Блюр панелей","set.lang":"Язык",
"set.lite":"Экономный режим","set.lite.s":"Для слабых ПК: меньше частиц, без блюра и дымки",
"th.dark":"Тёмная","th.light":"Светлая","th.sys":"Системная","off":"Выкл","s.slow":"Медленно","s.mid":"Средне","s.fast":"Быстро","s.light":"Лёгкий","s.strong":"Сильно",
"d.low":"Меньше","d.mid":"Средне","d.high":"Много",
"ob.lang.t":"Язык интерфейса","ob.lang.s":"Меняется в любой момент в настройках.","ob.step2":"Шаг 2 из 3",
"ob.theme.t":"Тема","ob.theme.s":"Чёрно-белая основа. Цветной акцент опционален.",
"ob.done.t":"Готово","ob.done.s":"Сервисы подключаются в настройках. Токены уходят в системный keychain, не в файлы.",
"ob.next":"Далее","ob.back":"Назад","ob.go":"Открыть",
"s.idle.t":"Одна строка, четыре сервиса","s.idle.s":"Запросы уходят параллельно, у каждого результата виден источник.",
"s.none.t":"Ничего не нашлось","s.none.s":"Попробуйте имя артиста или часть названия.","s.ing":"опрашиваем","s.found":"найдено",
"fav.none.t":"Избранное пусто","fav.none.s":"Отмечайте треки сердцем, метаданные останутся локально.",
"rec.none.t":"Здесь пока пусто","rec.none.s":"Всё, что вы слушали, появится тут автоматически.",
"pl.none.t":"Плейлисты соберутся сами","pl.none.s":"Они группируют избранное и историю по артистам.",
"queue":"Очередь","lyrics":"Текст","now":"Играет","tracks":"треков","q.none":"Очередь пуста — найдите треки в поиске","load.err":"Не удалось воспроизвести",
"connect":"Подключить","disconnect":"Отключить","connected":"Подключено","noauth":"Не подключено","eq.name":"Свой пресет","acc.none":"Без цвета",
"nav.profile":"Профиль","pr.email":"Email","pr.pass":"Пароль","pr.signin":"Войти","pr.signup":"Создать аккаунт","pr.magic":"Magic link",
"pr.auth.t":"Вход в аккаунт","pr.auth.s":"Email и пароль или magic link на почту. Данные защищены Row Level Security на стороне Supabase.",
"pr.magic.sent":"Ссылка для входа отправлена на почту","pr.hours":"Часы прослушивания","pr.genre":"Любимый жанр","pr.favs":"В избранном",
"pr.logout":"Выйти","pr.del":"Удалить аккаунт","pr.del.confirm":"Точно удалить? Нажмите ещё раз — это необратимо",
"mem.t":"Память","mem.s":"Сколько окно занимает на самом деле","mem.btn":"Замерить","mem.work":"Считаю…","mem.self":"приложение","mem.webv":"вебвью","mem.heap":"JS-стек","unit.mb":"МБ",
"pr.name":"Имя","pr.name.ph":"Имя пользователя","pr.name.saved":"Имя сохранено","pr.ava.hint":"Тап по аватару — загрузить фото",
"pr.nosupa":"Supabase не настроен: заполните SUPABASE_URL и SUPABASE_ANON_KEY в .env рядом с приложением.",
"tok.ph":"Вставьте токен сервиса","tok.save":"Сохранить","tok.hint":"Токен уйдёт в системный keychain (Credential Manager)",
"bd.t":"Значки","bd.s":"Достижения открываются сами, когда статистика перешагивает порог. Проверка идёт на сервере.",
"bd.have":"Открыто","bd.none":"Каталог значков не загрузился","bd.new":"Новый значок",
"bd.code.ph":"Промокод","bd.code.go":"Активировать","bd.code.hint":"Код проверяется на сервере, в приложении его нет",
"bd.code.empty":"Введите код","bd.code.auth":"Сначала войдите в аккаунт","bd.code.checking":"Проверяем…",
"bd.code.ok":"Значок открыт","bd.code.dup":"Этот значок у вас уже есть","bd.code.bad":"Код не найден",
"bd.code.exp":"Срок кода истёк","bd.code.used":"Код исчерпан",
"unit.min":"мин","unit.hr":"ч",
"np.addto":"В плейлист","np.dislike":"Больше не предлагать",
"dis.on":"Трек скрыт — больше не попадётся","dis.off":"Трек снова в подборках",
"dis.t":"Скрытые треки","dis.s":"Не попадают в волну, очередь и автопереход.","dis.none":"Пока ничего не скрыто",
"dis.clr":"Вернуть все","dis.cleared":"Скрытые треки возвращены",
"acc.adaptive":"Под обложку","acc.adaptive.s":"Акцент берётся из обложки трека",
"dl.preset.t":"Как скачивать","dl.preset.s":"С обработкой применяются эквалайзер и скорость","dl.raw":"Как есть",
"dl.withfx":"С эквалайзером и скоростью","dl.fx.need":"Нужен ffmpeg — установите его, чтобы применять обработку",
"dl.fx.busy":"Обрабатываем звук…",
"ly.load":"Ищем текст…","ly.gen":"Распознаём текст нейросетью…","ly.none":"Текста нет",
"ly.slow":"Это занимает несколько минут — сворачивать окно не обязательно",
"ly.decode":"Готовим звук…","ly.listen":"Слушаем трек…","ly.seek":"Нажмите на строку, чтобы перейти",
"ly.src.ytm":"YouTube Music","ly.src.lrc":"LRCLIB","ly.src.ai":"Распознано нейросетью",
"ly.plain":"Без тайм-кодов","ly.retry":"Попробовать ещё раз","ly.err":"Не удалось получить текст",
"s.nosvc":"Все сервисы выключены — включите их в шапке",
"wave.need":"Волна собирается из ваших любимых треков. Пока отмечено {n} — добавьте ещё, и она заиграет.",
"wave.ready":"В избранном {n} треков — волна подберёт похожее и запустится сразу.",
"wave.need.toast":"Отметьте сердцем ещё {n} трека — по ним волна и подбирает музыку",
"wave.empty":"Не удалось собрать подборку, попробуйте позже",
"loc.svc":"Мои файлы","loc.svc.src":"с диска","np.none":"Нет трека","np.none.s":"Подключите сервис и выполните поиск",
"lib.loc":"Мои файлы","lib.art":"Артисты",
"loc.addfolder":"Добавить папку","loc.clear":"Очистить","loc.clear.ask":"Убрать все локальные треки из библиотеки? Файлы на диске не удаляются.","loc.cleared":"Локальные треки убраны","loc.removed":"Трек убран из библиотеки","loc.none.t":"Пока пусто","loc.none.s":"Добавьте файлы или папку — они читаются прямо с диска.",
"art.none.t":"Артистов пока нет","art.none.s":"Послушайте что-нибудь или добавьте треки в избранное.","art.follow":"Отслеживать","art.unfollow":"Не отслеживать",
"acc.custom":"Свой цвет",
"dl.t":"Скачивание","dl.s":"Файлы сохраняются в выбранную папку. Треки из YouTube перекодируются в mp3 — ffmpeg идёт в комплекте.","dl.dir":"Папка","dl.dir.none":"не выбрана","dl.pick":"Выбрать","dl.ask":"Спрашивать каждый раз","dl.ask.s":"Иначе всё идёт в папку выше","dl.autofav":"Скачивать избранное","dl.autofav.s":"Копия при добавлении в избранное","dl.autopl":"Скачивать в плейлисты","dl.autopl.s":"Подпапка с именем плейлиста","dl.ff.yes":"Конвертация в mp3 и обработка доступны","dl.ff.no":"ffmpeg не найден: треки из YouTube сохранятся как .webm, обработка недоступна","dl.pl.start":"Скачиваем «{n}»: {c} треков","dl.pl.done":"Готово: {ok}, не вышло: {bad}","dl.pl.local":"В плейлисте только локальные файлы",
"pl.dl":"Скачать всё",
"ctx.rmlocal":"Убрать из библиотеки","ctx.artist":"Открыть артиста","ctx.eq":"Эквалайзер для трека","ctx.eq.off":"Не привязывать",
"eq.pinned":"Пресет закреплён за треком","eq.unpinned":"Привязка снята",
"upd.t":"Обновления","upd.s":"Проверка при запуске. Обновление скачивается и устанавливается само, подпись проверяется.","upd.check":"Проверить сейчас","upd.btn":"Проверить","upd.checking":"Проверяем…","upd.none":"Установлена последняя версия ({v})","upd.found":"Доступна версия {v}","upd.ask":"Обновить до {v}?","upd.install":"Обновить","upd.installing":"Скачиваем обновление…","upd.fail":"Не удалось проверить",
"about.tg":"Канал проекта","about.tgchat":"Чат разработки","about.thanks":"Спасибо чату за тесты, идеи и сообщения об ошибках.",
"snd.rate":"Скорость","snd.boost":"Громче","snd.boost.off":"выкл","snd.slowed":"slowed","snd.nightcore":"nightcore","snd.normal":"обычно","dlg.ok":"ОК","dlg.cancel":"Отмена",
"upd.norelease":"Релизов пока нет — это первая версия",
"pr.ban.hint":"Нажмите, чтобы сменить баннер","pr.ban.cta":"Сменить баннер","pr.badges":"значков","img.big":"Изображение слишком большое","crop.avatar":"Аватар","crop.banner":"Баннер","crop.cover":"Обложка плейлиста","crop.zoom":"Масштаб","crop.reset":"Сброс","crop.save":"Сохранить","crop.hint":"Перетащите изображение, колесо мыши — масштаб.","plctx.cover":"Сменить обложку","plctx.coveroff":"Убрать обложку","plctx.cover.ok":"Обложка обновлена","plctx.cover.off":"Обложка убрана","plctx.rename":"Переименовать","plctx.renamed":"Название изменено","plctx.rmtrack":"Убрать из плейлиста","plctx.eq":"Эквалайзер для плейлиста","eq.pl.pinned":"Пресет закреплён за плейлистом",
"img.big.gif":"GIF слишком большой","img.fail":"Не удалось обработать изображение","img.up":"Загружаем…","img.ok":"Изображение сохранено",
"bd.secret":"Секретное достижение","bd.pin.hint":"Нажмите на открытый значок, чтобы закрепить его в профиле (до 5).","bd.pin.auth":"Сначала войдите в аккаунт","bd.pin.max":"Можно закрепить не больше 5 значков","bd.g.status":"Статус","bd.g.ach":"Достижения","bd.g.code":"По коду",
"pl.auth":"Сначала войдите в аккаунт","pl.made":"Плейлист «{n}» создан","pl.dup":"Этот трек уже в плейлисте","pl.added":"Добавлено в «{n}»","pl.back":"Плейлисты","pl.playall":"Играть всё","pl.del":"Удалить","pl.del.ask":"Удалить плейлист «{n}»?","pl.deleted":"Плейлист удалён","pl.empty.t":"Плейлист пуст","pl.empty.s":"Добавляйте треки через меню правой кнопки мыши.","pl.new":"Новый плейлист","pl.new.s":"Соберите свою подборку","pl.auto":"Автоподборки по артистам",
"ctx.play":"Играть","ctx.qnext":"Играть следующим","ctx.qlast":"В конец очереди","ctx.all":"Вся фонотека","ctx.fav":"В избранное","ctx.unfav":"Убрать из избранного","ctx.addto":"Добавить в плейлист","ctx.nopl":"Плейлистов пока нет","ctx.newpl":"Новый плейлист","ctx.newpl.ask":"Название плейлиста",
"q.from":"Играет из","q.next.ok":"«{n}» — следующим","q.last.ok":"«{n}» — в конец очереди","q.clear":"Очистить очередь","q.rm":"Убрать из очереди",
"dl.desktop":"Скачивание доступно только в приложении","dl.already":"Этот файл уже на диске","dl.noport":"Локальный поток недоступен","dl.start":"Скачиваем {n}…","dl.ok":"Сохранено: {n}","dl.fail":"Не удалось скачать",
"set.tab.net":"Сеть",
"px.t":"Обход блокировок","px.s":"Выключено по умолчанию. Через прокси идут только заблокированные сервисы — Яндекс Музыка всегда напрямую, иначе она отвечает отказом на зарубежные адреса.",
"px.on":"Использовать прокси","px.off":"Выключено","px.v.on":"Вкл","px.v.off":"Выкл",
"px.save":"Сохранить","px.test":"Проверить","px.empty":"Введите адрес прокси",
"px.saved.on":"Прокси включён","px.saved.off":"Прокси выключен","px.desktop":"Доступно только в приложении",
"px.testing":"Проверяем соединение…","px.test.ok":"Работает — заблокированный сайт открылся","px.test.bad":"Не отвечает: клиент запущен, но туннель выключен?",
"px.find":"Найти автоматически","px.find.s":"Ищет уже запущенный клиент на этом компьютере","px.find.btn":"Искать",
"px.searching":"Смотрим локальные порты…","px.find.none":"Ничего не найдено — запустите клиент и включите туннель",
"px.works":"проверено, трафик проходит","px.noworks":"порт открыт, но туннель не отвечает","px.use":"Использовать",
"px.all":"Весь трафик через прокси","px.all.s":"Не рекомендуется: ломает Яндекс Музыку",
"px.how":"Откуда взять адрес","px.how.s":"Ссылки VLESS, VMess, Shadowsocks, Hysteria2 и Trojan нельзя вставить сюда напрямую — это не прокси, а туннели. Их нужно открыть в клиенте, который поднимет локальный порт SOCKS5.",
"px.g1":"Установите клиент: v2rayN, Nekoray, Hiddify или sing-box","px.g2":"Добавьте в него бесплатную подписку с конфигами",
"px.g3":"Включите туннель и запомните локальный порт SOCKS (обычно 10808 или 2080)","px.g4":"Вернитесь сюда, нажмите «Искать» — порт найдётся сам",
"px.cfg":"Бесплатные конфиги",
"set.tab.sound":"Звук","set.tab.look":"Вид","set.tab.lib":"Фонотека","set.tab.about":"О приложении",
"ym.g1":"Войдите в свой аккаунт на music.yandex.ru","ym.g2":"Откройте инструменты разработчика:",
"ym.g3":"Перейдите в","ym.g4":"Найдите ключ","ym.g5":"Скопируйте значение и вставьте в поле выше",
"ym.open":"Открыть Яндекс Музыку","ym.docs":"Документация",
"loc.t":"Локальные треки","loc.s":"Файлы не копируются и никуда не отправляются — читаются с диска напрямую. Теги берутся из имени файла.",
"loc.add":"Добавить файлы","loc.folder":"Добавить папку","loc.folder.s":"Со всеми вложенными",
"loc.fmt":"mp3, flac, wav, ogg, m4a","loc.pick":"Выбрать…",
"loc.count":"В фонотеке {n} локальных треков","loc.empty":"Пока ничего не добавлено",
"loc.added":"Добавлено треков: {n}","loc.none":"Аудиофайлы не найдены","loc.err":"Не удалось прочитать файлы",
"loc.desktop":"Импорт доступен только в приложении","loc.nodlg":"Диалог выбора файлов недоступен",
"cache.t":"Кэш и данные","cache.s":"Обложки и метаданные, сохранённые на диске.","cache.size":"Занято","cache.clr":"Очистить","cache.done":"Кэш очищен",
"data.reset":"Сбросить избранное и историю","data.reset.s":"Настройки и токены останутся","data.reset.btn":"Сбросить","data.done":"Избранное и история очищены",
"about.ver":"Версия","about.s":"Кросс-сервисный плеер с собственным звуковым трактом: эквалайзер, HRTF-орбита и визуализатор работают на всех сервисах, потому что звук идёт через нас, а не через чужой плеер.",
"nologin":"Без входа","ready":"Готов"},
en:{"nav.home":"Wave","nav.search":"Search","nav.library":"Media","nav.settings":"Settings",
"top.ph":"Search across services",
"home.t":"Silence. The field waits.","home.s":"Start the wave: the stream builds from your artists, cover and queue open fullscreen.","home.start":"Start the wave",
"lib.pl":"Playlists","lib.fav":"Favorites","lib.rec":"Recent",
"set.t":"Settings","set.acc":"Accounts","set.acc.s":"Authorization Code + PKCE, no server. Spotify uses meowave://callback, Google/YouTube a localhost redirect.",
"set.sp":"Spatial audio","set.sp.s":"PannerNode in HRTF mode: the source orbits your head and passes overhead. Plus a ConvolverNode for room.",
"set.sp.on":"Orbit around the head","set.sp.hint":"Headphones only","set.sp.speed":"Orbit speed","set.sp.rad":"Orbit radius","set.sp.elev":"Overhead arc",
"set.q":"Quality","set.q.s":"Lossless where the service serves it.","set.q.l":"Stream","q.low":"Low","q.mid":"Medium","q.high":"High",
"set.look":"Appearance","set.look.s":"Particle density costs more than everything else combined.","set.theme":"Theme","set.accent":"Accent color","set.accent.s":"No color by default",
"set.dens":"Particle density","set.speed":"Movement speed","set.glow":"Glow","set.blur":"Panel blur","set.lang":"Language",
"set.lite":"Lite mode","set.lite.s":"For weak PCs: fewer particles, no blur or haze",
"th.dark":"Dark","th.light":"Light","th.sys":"System","off":"Off","s.slow":"Slow","s.mid":"Medium","s.fast":"Fast","s.light":"Light","s.strong":"Strong",
"d.low":"Fewer","d.mid":"Medium","d.high":"Many",
"ob.lang.t":"Interface language","ob.lang.s":"Changeable any time in settings.","ob.step2":"Step 2 of 3",
"ob.theme.t":"Theme","ob.theme.s":"Black and white base. Color accent optional.",
"ob.done.t":"Done","ob.done.s":"Connect services in settings. Tokens go to the system keychain, never to files.",
"ob.next":"Next","ob.back":"Back","ob.go":"Open",
"s.idle.t":"One field, four services","s.idle.s":"Queries fire in parallel, every result shows its source.",
"s.none.t":"Nothing found","s.none.s":"Try an artist name or part of a title.","s.ing":"querying","s.found":"found",
"fav.none.t":"No favorites yet","fav.none.s":"Heart any track, metadata stays local.",
"rec.none.t":"Nothing here yet","rec.none.s":"Everything you play shows up here automatically.",
"pl.none.t":"Playlists build themselves","pl.none.s":"They group your favorites and history by artist.",
"queue":"Queue","lyrics":"Lyrics","now":"Playing","tracks":"tracks","q.none":"Queue is empty — search for tracks","load.err":"Playback failed",
"connect":"Connect","disconnect":"Disconnect","connected":"Connected","noauth":"Not connected","eq.name":"Custom preset","acc.none":"No color",
"nav.profile":"Profile","pr.email":"Email","pr.pass":"Password","pr.signin":"Sign in","pr.signup":"Create account","pr.magic":"Magic link",
"pr.auth.t":"Sign in","pr.auth.s":"Email + password or a magic link. Data is guarded by Supabase Row Level Security.",
"pr.magic.sent":"Sign-in link sent to your inbox","pr.hours":"Hours listened","pr.genre":"Favorite genre","pr.favs":"Favorites",
"pr.logout":"Sign out","pr.del":"Delete account","pr.del.confirm":"Really delete? Click again — this is irreversible",
"mem.t":"Memory","mem.s":"What the window really costs","mem.btn":"Measure","mem.work":"Measuring…","mem.self":"app","mem.webv":"webview","mem.heap":"JS heap","unit.mb":"MB",
"pr.name":"Name","pr.name.ph":"Username","pr.name.saved":"Name saved","pr.ava.hint":"Tap the avatar to upload a photo",
"pr.nosupa":"Supabase is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY in .env next to the app.",
"tok.ph":"Paste service token","tok.save":"Save","tok.hint":"Token goes to the system keychain (Credential Manager)",
"bd.t":"Badges","bd.s":"Achievements unlock themselves once your stats cross a threshold. The check runs on the server.",
"bd.have":"Unlocked","bd.none":"Badge catalog failed to load","bd.new":"New badge",
"bd.code.ph":"Promo code","bd.code.go":"Redeem","bd.code.hint":"Codes are verified server-side; the app holds no list",
"bd.code.empty":"Enter a code","bd.code.auth":"Sign in first","bd.code.checking":"Checking…",
"bd.code.ok":"Badge unlocked","bd.code.dup":"You already have this badge","bd.code.bad":"Code not found",
"bd.code.exp":"Code expired","bd.code.used":"Code exhausted",
"unit.min":"min","unit.hr":"h",
"np.addto":"Add to playlist","np.dislike":"Don't play this again",
"dis.on":"Hidden — this will not come up again","dis.off":"Track is back in rotation",
"dis.t":"Hidden tracks","dis.s":"Excluded from the wave, the queue and autoplay.","dis.none":"Nothing hidden yet",
"dis.clr":"Restore all","dis.cleared":"Hidden tracks restored",
"acc.adaptive":"From artwork","acc.adaptive.s":"The accent is taken from the cover",
"dl.preset.t":"How to download","dl.preset.s":"Processing bakes in the equaliser and the speed","dl.raw":"As-is",
"dl.withfx":"With equaliser and speed","dl.fx.need":"ffmpeg is required to apply processing",
"dl.fx.busy":"Processing audio…",
"ly.load":"Looking for lyrics…","ly.gen":"Transcribing with a neural net…","ly.none":"No lyrics",
"ly.slow":"This takes a few minutes — feel free to keep listening",
"ly.decode":"Preparing audio…","ly.listen":"Listening to the track…","ly.seek":"Click a line to jump there",
"ly.src.ytm":"YouTube Music","ly.src.lrc":"LRCLIB","ly.src.ai":"Transcribed by AI",
"ly.plain":"No timings","ly.retry":"Try again","ly.err":"Could not fetch lyrics",
"s.nosvc":"All services are off — enable them in the header",
"wave.need":"The wave is built from your favorite tracks. {n} so far — add a few more and it will play.",
"wave.ready":"{n} favorites — the wave will find similar music and start right away.",
"wave.need.toast":"Heart {n} more track(s) — the wave builds its picks from them",
"wave.empty":"Could not build a selection, try again later",
"loc.svc":"My Files","loc.svc.src":"from disk","np.none":"No track","np.none.s":"Connect a service and search for music",
"lib.loc":"My Files","lib.art":"Artists",
"loc.addfolder":"Add folder","loc.clear":"Clear","loc.clear.ask":"Remove all local tracks from the library? Files on disk are kept.","loc.cleared":"Local tracks removed","loc.removed":"Track removed from the library","loc.none.t":"Nothing here yet","loc.none.s":"Add files or a folder — they are read straight off the disk.",
"art.none.t":"No artists yet","art.none.s":"Play something or add tracks to favorites.","art.follow":"Follow","art.unfollow":"Unfollow",
"acc.custom":"Custom colour",
"dl.t":"Downloads","dl.s":"Files are saved to the folder you choose. YouTube tracks are converted to mp3 — ffmpeg ships with the app.","dl.dir":"Folder","dl.dir.none":"not set","dl.pick":"Choose","dl.ask":"Ask every time","dl.ask.s":"Otherwise everything goes to the folder above","dl.autofav":"Download favorites","dl.autofav.s":"Keep a copy when a track is favorited","dl.autopl":"Download playlist adds","dl.autopl.s":"Into a subfolder named after the playlist","dl.ff.yes":"mp3 conversion and processing available","dl.ff.no":"ffmpeg not found: YouTube tracks stay .webm and processing is unavailable","dl.pl.start":"Downloading “{n}”: {c} tracks","dl.pl.done":"Done: {ok}, failed: {bad}","dl.pl.local":"This playlist only has local files",
"pl.dl":"Download all",
"ctx.rmlocal":"Remove from library","ctx.artist":"Open artist","ctx.eq":"Equaliser for this track","ctx.eq.off":"Unpin",
"eq.pinned":"Preset pinned to this track","eq.unpinned":"Preset unpinned",
"upd.t":"Updates","upd.s":"Checked at startup. Updates download and install themselves; the signature is verified.","upd.check":"Check now","upd.btn":"Check","upd.checking":"Checking…","upd.none":"You are on the latest version ({v})","upd.found":"Version {v} available","upd.ask":"Update to {v}?","upd.install":"Update","upd.installing":"Downloading the update…","upd.fail":"Could not check",
"about.tg":"Project channel","about.tgchat":"Development chat","about.thanks":"Thanks to the chat for testing, ideas and bug reports.",
"snd.rate":"Speed","snd.boost":"Louder","snd.boost.off":"off","snd.slowed":"slowed","snd.nightcore":"nightcore","snd.normal":"normal","dlg.ok":"OK","dlg.cancel":"Cancel",
"upd.norelease":"No releases published yet — this is the first version",
"pr.ban.hint":"Click to change the banner","pr.ban.cta":"Change banner","pr.badges":"badges","img.big":"Image is too large","crop.avatar":"Avatar","crop.banner":"Banner","crop.cover":"Playlist cover","crop.zoom":"Zoom","crop.reset":"Reset","crop.save":"Save","crop.hint":"Drag the image, scroll to zoom.","plctx.cover":"Change cover","plctx.coveroff":"Remove cover","plctx.cover.ok":"Cover updated","plctx.cover.off":"Cover removed","plctx.rename":"Rename","plctx.renamed":"Renamed","plctx.rmtrack":"Remove from playlist","plctx.eq":"Equaliser for this playlist","eq.pl.pinned":"Preset pinned to this playlist",
"img.big.gif":"GIF is too large","img.fail":"Could not process the image","img.up":"Uploading…","img.ok":"Image saved",
"bd.secret":"Secret achievement","bd.pin.hint":"Click an unlocked badge to pin it to your profile (up to 5).","bd.pin.auth":"Sign in first","bd.pin.max":"You can pin up to 5 badges","bd.g.status":"Status","bd.g.ach":"Achievements","bd.g.code":"By code",
"pl.auth":"Sign in first","pl.made":"Playlist “{n}” created","pl.dup":"This track is already in the playlist","pl.added":"Added to “{n}”","pl.back":"Playlists","pl.playall":"Play all","pl.del":"Delete","pl.del.ask":"Delete playlist “{n}”?","pl.deleted":"Playlist deleted","pl.empty.t":"Playlist is empty","pl.empty.s":"Add tracks from the right-click menu.","pl.new":"New playlist","pl.new.s":"Build your own selection","pl.auto":"Automatic artist mixes",
"ctx.play":"Play","ctx.qnext":"Play next","ctx.qlast":"Add to queue","ctx.all":"Whole library","ctx.fav":"Add to favorites","ctx.unfav":"Remove from favorites","ctx.addto":"Add to playlist","ctx.nopl":"No playlists yet","ctx.newpl":"New playlist","ctx.newpl.ask":"Playlist name",
"q.from":"Playing from","q.next.ok":"“{n}” plays next","q.last.ok":"“{n}” added to the queue","q.clear":"Clear the queue","q.rm":"Remove from the queue",
"dl.desktop":"Downloads work in the desktop app only","dl.already":"This file is already on disk","dl.noport":"Local stream unavailable","dl.start":"Downloading {n}…","dl.ok":"Saved: {n}","dl.fail":"Download failed",
"set.tab.net":"Network",
"px.t":"Bypass blocking","px.s":"Off by default. Only blocked services go through the proxy — Yandex Music always goes direct, because it refuses foreign exit addresses.",
"px.on":"Use a proxy","px.off":"Off","px.v.on":"On","px.v.off":"Off",
"px.save":"Save","px.test":"Test","px.empty":"Enter a proxy address",
"px.saved.on":"Proxy enabled","px.saved.off":"Proxy disabled","px.desktop":"Desktop app only",
"px.testing":"Testing the connection…","px.test.ok":"Works — a blocked site loaded","px.test.bad":"No answer: client running but tunnel off?",
"px.find":"Find automatically","px.find.s":"Looks for a client already running on this machine","px.find.btn":"Scan",
"px.searching":"Checking local ports…","px.find.none":"Nothing found — start a client and enable its tunnel",
"px.works":"verified, traffic flows","px.noworks":"port open but the tunnel does not answer","px.use":"Use this",
"px.all":"Route all traffic","px.all.s":"Not recommended: it breaks Yandex Music",
"px.how":"Where to get an address","px.how.s":"VLESS, VMess, Shadowsocks, Hysteria2 and Trojan links cannot be pasted here: they are tunnels, not proxies. Open them in a client, which exposes a local SOCKS5 port.",
"px.g1":"Install a client: v2rayN, Nekoray, Hiddify or sing-box","px.g2":"Add a free subscription of configs to it",
"px.g3":"Enable the tunnel and note its local SOCKS port (usually 10808 or 2080)","px.g4":"Come back here and press Scan — the port is found for you",
"px.cfg":"Free configs",
"set.tab.sound":"Sound","set.tab.look":"Appearance","set.tab.lib":"Library","set.tab.about":"About",
"ym.g1":"Sign in to your account at music.yandex.ru","ym.g2":"Open developer tools:",
"ym.g3":"Go to","ym.g4":"Find the key","ym.g5":"Copy the value and paste it in the field above",
"ym.open":"Open Yandex Music","ym.docs":"Documentation",
"loc.t":"Local tracks","loc.s":"Files are never copied or uploaded — they are read straight off the disk. Tags come from the file name.",
"loc.add":"Add files","loc.folder":"Add folder","loc.folder.s":"Including subfolders",
"loc.fmt":"mp3, flac, wav, ogg, m4a","loc.pick":"Choose…",
"loc.count":"{n} local tracks in the library","loc.empty":"Nothing added yet",
"loc.added":"Tracks added: {n}","loc.none":"No audio files found","loc.err":"Could not read the files",
"loc.desktop":"Import works in the desktop app only","loc.nodlg":"File dialog unavailable",
"cache.t":"Cache and data","cache.s":"Artwork and metadata stored on disk.","cache.size":"Used","cache.clr":"Clear","cache.done":"Cache cleared",
"data.reset":"Reset favorites and history","data.reset.s":"Settings and tokens are kept","data.reset.btn":"Reset","data.done":"Favorites and history cleared",
"about.ver":"Version","about.s":"A cross-service player with its own audio path: the EQ, HRTF orbit and visualiser work on every service because the sound flows through us, not somebody else's player.",
"nologin":"No sign-in needed","ready":"Ready"}};
let LANG="ru";
const t=k=>I18N[LANG][k]??I18N.ru[k]??k;
/* Social strings kept apart from the main dictionaries only so the block stays
   readable; t() reads them identically. */
Object.assign(I18N.ru,{
 "nav.people":"Люди","people.search":"Найти людей","people.search.ph":"Имя пользователя","people.empty":"Введите имя пользователя","people.none":"Люди не найдены","people.open":"Открыть профиль","people.add":"Предложить дружбу","people.pending":"Заявка отправлена","people.friend":"Вы друзья","people.accept":"Принять","people.notice":"Новая заявка в друзья",
"nav.chats":"Чаты","nav.rooms":"Комнаты","nav.top":"Топ","set.tab.priv":"Приватность",
"soc.auth":"Войдите в аккаунт — эта часть живёт на сервере.","soc.nouser":"Пользователь не найден",
"chat.newgrp":"Новая группа","chat.grpmembers":"группа","chat.photo":"Фото","chat.empty":"Пока никого. Добавьте друга в профиле и напишите ему.",
"chat.anon":"Без имени","chat.gone":"Чат удалён","chat.nomsgs":"Нет сообщений — напишите первым.","chat.ph":"Сообщение…",
/* These were used by the social screens but never defined, so t() fell through
   to returning the key itself and the interface showed "people.you" where a
   sentence belonged. */
"chat.newdm":"Новый диалог","chat.sent":"Отправлено","chat.read":"Прочитано",
"people.loading":"Загружаем…","people.you":"Это вы","people.message":"Написать",
"people.notfriend":"Не в друзьях","people.incoming":"Входящие заявки","people.reject":"Отклонить",
"people.notice.s":"Заявок: {n}",
"chat.invite":"Пригласить в комнату","chat.invited":"Приглашение отправлено","chat.noroom":"Сначала зайдите в комнату",
"chat.custom":"Настроить группу","chat.rename":"Название группы","chat.about.ph":"Описание группы",
"chat.avatar.q":"Сменить аватарку группы?","chat.addwho":"Кого добавить (имя)","chat.added":"Добавлен",
"room.new":"Создать комнату","room.join":"Войти по коду","room.silent":"тишина","room.none":"Пока нет публичных комнат — создайте свою.",
"room.newname":"Название комнаты","room.privq":"Сделать приватной?","room.privyes":"Приватная",
"room.nocode":"Комната не найдена","room.queue":"Очередь","room.reqs":"Заявки","room.chat":"Чат комнаты",
"room.live":"играет","room.paused":"пауза","room.qempty":"Очередь пуста","room.noreqs":"Заявок нет",
"room.findph":"Найти трек…","room.req.sent":"Отправлено хосту",
"top.s":"По суммарным часам прослушивания. Скрыться можно в настройках приватности.","top.empty":"Пока пусто",
"fr.t":"Друзья","fr.addph":"Имя друга","fr.add":"Добавить","fr.reqs":"Входящие заявки","fr.sent":"Отправленные",
"fr.wait":"ждёт ответа","fr.mine":"Мои друзья","fr.none":"Друзей пока нет","fr.rm":"Убрать из друзей","fr.sent.ok":"Заявка отправлена",
"pv.t":"Конфиденциальность","pv.s":"Кто что может видеть. Личные сообщения всегда доступны только друзьям — это не настраивается.",
"pv.profile":"Кто видит мой профиль","pv.hours":"Кто видит часы прослушивания","pv.board":"Участвовать в топе","pv.board.s":"Иначе вас не будет в лидерборде часов",
"pv.everybody":"Все","pv.friends":"Друзья","pv.nobody":"Никто",
"pr.bio":"О себе","pr.bio.ph":"Пара слов о вас","pr.bio.save":"Сохранить","pr.bio.saved":"Сохранено",
"set.tab.prof":"Профиль","sprof.t":"Профиль","sprof.s":"Имя, описание и картинки профиля. Страница профиля показывает их, здесь они меняются.","sprof.ava":"Аватарка","sprof.ban":"Баннер","sprof.pick":"Выбрать","sprof.set":"загружена","soc.hidden":"Скрытый","pv.avatar":"Кто видит мою аватарку","pv.email":"Кто видит мою почту","pv.user":"Кто видит мой юзернейм","pv.user.s":"Скрытый юзернейм нельзя найти для заявки в друзья","room.privpub":"Публичная",
"room.kick":"Убрать из комнаты","room.leave":"Выйти","room.del":"Удалить комнату","room.delq":"Удалить комнату? Она исчезнет для всех.","room.deleted":"Комната удалена","room.copycode":"Скопировать код","room.copied":"Код скопирован","room.kicked":"Убран","room.addq.ph":"Найти и добавить в очередь…","soc.needsql":"База отстала: прогони целиком supabase/FULL_SCHEMA.sql в SQL-редакторе Supabase — он идемпотентный и покрывает все миграции",
"sp.desc":"Вход нужен для импорта плейлистов. Плеер не стримит Spotify напрямую (DRM), треки подбираются на YouTube Music.","sp.login":"Войти в Spotify","sp.logout":"Выйти","sp.loading":"Загрузка плейлистов…","sp.nolists":"Плейлистов нет","sp.import":"Импорт","sp.importing":"Импортирую {n} треков…","sp.imported":"Готово: {ok} из {n} найдено","sp.empty":"В плейлисте нет треков","sp.browser":"Открываю браузер для входа…","sp.capped":"Импортирую первые {n} треков — остальные пропущены"});
Object.assign(I18N.en,{
 "nav.people":"People","people.search":"Find people","people.search.ph":"Username","people.empty":"Enter a username","people.none":"No people found","people.open":"Open profile","people.add":"Send friend request","people.pending":"Request sent","people.friend":"Friends","people.accept":"Accept","people.notice":"New friend request",
"nav.chats":"Chats","nav.rooms":"Rooms","nav.top":"Top","set.tab.priv":"Privacy",
"soc.auth":"Sign in first — this part lives on the server.","soc.nouser":"No such user",
"chat.newgrp":"New group","chat.grpmembers":"group","chat.photo":"Photo","chat.empty":"Nobody here yet. Add a friend on the profile and write to them.",
"chat.anon":"No name","chat.gone":"Chat deleted","chat.nomsgs":"No messages yet — write first.","chat.ph":"Message…",
"chat.newdm":"New chat","chat.sent":"Sent","chat.read":"Read",
"people.loading":"Loading…","people.you":"This is you","people.message":"Message",
"people.notfriend":"Not friends","people.incoming":"Incoming requests","people.reject":"Decline",
"people.notice.s":"{n} pending",
"chat.invite":"Invite to room","chat.invited":"Invite sent","chat.noroom":"Join a room first",
"chat.custom":"Customize group","chat.rename":"Group name","chat.about.ph":"Group description",
"chat.avatar.q":"Change the group avatar?","chat.addwho":"Who to add (name)","chat.added":"Added",
"room.new":"Create room","room.join":"Join by code","room.silent":"silence","room.none":"No public rooms yet — make one.",
"room.newname":"Room name","room.privq":"Make it private?","room.privyes":"Private",
"room.nocode":"Room not found","room.queue":"Queue","room.reqs":"Requests","room.chat":"Room chat",
"room.live":"playing","room.paused":"paused","room.qempty":"Queue is empty","room.noreqs":"No requests",
"room.findph":"Find a track…","room.req.sent":"Sent to the host",
"top.s":"By total listening hours. You can hide in privacy settings.","top.empty":"Empty so far",
"fr.t":"Friends","fr.addph":"Friend's name","fr.add":"Add","fr.reqs":"Incoming requests","fr.sent":"Sent",
"fr.wait":"waiting","fr.mine":"My friends","fr.none":"No friends yet","fr.rm":"Remove friend","fr.sent.ok":"Request sent",
"pv.t":"Privacy","pv.s":"Who gets to see what. Direct messages are always friends-only — that one is not configurable.",
"pv.profile":"Who sees my profile","pv.hours":"Who sees my listening hours","pv.board":"Appear in the top","pv.board.s":"Otherwise you are not in the hours leaderboard",
"pv.everybody":"Everybody","pv.friends":"Friends","pv.nobody":"Nobody",
"pr.bio":"About me","pr.bio.ph":"A couple of words","pr.bio.save":"Save","pr.bio.saved":"Saved",
"set.tab.prof":"Profile","sprof.t":"Profile","sprof.s":"Name, description and profile pictures. The profile page displays them, this is where they change.","sprof.ava":"Avatar","sprof.ban":"Banner","sprof.pick":"Choose","sprof.set":"uploaded","soc.hidden":"Hidden","pv.avatar":"Who sees my avatar","pv.email":"Who sees my email","pv.user":"Who sees my username","pv.user.s":"A hidden username cannot be found for friend requests","room.privpub":"Public",
"room.kick":"Remove from room","room.leave":"Leave","room.del":"Delete room","room.delq":"Delete the room? It disappears for everyone.","room.deleted":"Room deleted","room.copycode":"Copy code","room.copied":"Code copied","room.kicked":"Removed","room.addq.ph":"Find and add to the queue…","soc.needsql":"The database is behind: run all of supabase/FULL_SCHEMA.sql in the Supabase SQL editor — it is idempotent and covers every migration",
"sp.desc":"Sign-in is for playlist import. The player cannot stream Spotify directly (DRM); tracks are matched on YouTube Music.","sp.login":"Sign in to Spotify","sp.logout":"Sign out","sp.loading":"Loading playlists…","sp.nolists":"No playlists","sp.import":"Import","sp.importing":"Importing {n} tracks…","sp.imported":"Done: {ok} of {n} matched","sp.empty":"The playlist is empty","sp.browser":"Opening the browser to sign in…","sp.capped":"Importing the first {n} tracks — the rest are skipped"});
function applyI18n(){
  document.documentElement.lang=LANG;
  /* textContent, not innerHTML: a translated string is text, and a label that
     also holds an icon must keep it. Anything with element children gets only
     its own text nodes rewritten, so <button><i/><span/></button> survives. */
  document.querySelectorAll("[data-i18n]").forEach(e=>{
   const s=t(e.dataset.i18n);
   if(!e.firstElementChild){if(e.textContent!==s)e.textContent=s;return}
   const txt=[...e.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());
   if(txt){if(txt.textContent!==s)txt.textContent=s}
   else e.append(s)});
  document.querySelectorAll("[data-i18n-ph]").forEach(e=>e.placeholder=t(e.dataset.i18nPh));
  /* The re-renders below rebuild whole panels, which discards anything half
     typed. Switching language used to wipe the username field and the promo
     code box mid-entry. */
  const keep=["un-input","bd-code","au-email","q","pname","px-url"]
   .map(id=>[id,document.getElementById(id)?.value])
   .filter(([,v])=>v);
  renderSrv();renderAccounts();renderNP();renderLib();renderPresets();renderSwatches();obThemes();renderProfile();
  keep.forEach(([id,v])=>{const el=document.getElementById(id);if(el&&!el.value)el.value=v});
  if(S.view==="search")search(document.getElementById("q").value,true);
  if(fp.dataset.open==="true")renderFP();
  icons();
  /* Every segmented control sizes its sliding indicator from the pixel width of
     the selected button. Translating the labels changes those widths — "Высокое"
     and "High" are nowhere near the same size — and nothing was recomputing the
     indicator, so it stayed under the old geometry and the switch looked broken
     after a language change. Layout has to settle first, hence the frame wait. */
  requestAnimationFrame(()=>{paintAllSegs();paintRail();document.fonts?.ready?.then(()=>{paintAllSegs();paintRail()})});
}

/* data */
/* conn выставляется на старте из системного keychain (см. initServices) */
/* free:true — works without any sign-in (guest InnerTube / public client_id),
   so these have no token row and are connected from the first launch. */
const SERVICES=[
 {id:"ytm",name:"YouTube Music",conn:false,free:true,lossless:false,redir:"guest",lat:[360,880]},
 {id:"sc",name:"SoundCloud",conn:false,free:true,lossless:false,redir:"public client_id",lat:[280,640]},
 {id:"ym",name:"Yandex Music",conn:false,free:false,lossless:true,redir:"meowave://callback",lat:[400,1020]},
 /* Local files are one more service to the UI, minus network and search. */
 /* name/redir are resolved through i18n at render time (see svc()): a literal
    here stayed Russian with the interface set to English. */
 {id:"local",nameKey:"loc.svc",conn:true,on:true,free:true,local:true,lossless:true,redirKey:"loc.svc.src",lat:[0,0]}];
SERVICES.forEach(s=>s.on=s.conn);
/* A track can outlive the service it came from (saved library, removed
   provider), so never hand back undefined — callers read .name straight off. */
const svc=id=>{
 const s=SERVICES.find(x=>x.id===id);
 if(!s)return {id,name:id||"—",conn:false,free:false,lossless:false,redir:"",lat:[300,700]};
 /* Translated lazily so switching language relabels it without a reload. */
 return s.nameKey?{...s,name:t(s.nameKey),redir:s.redirKey?t(s.redirKey):s.redir}:s};

/* The player starts empty: TRACKS only holds real search results and restored
   favorites. Demo tracks, demo playlists and hardcoded lyrics are gone — they
   could not be opened and they broke the favorites handler. */
/* `let`, not `const`: removeLocal / clearLocal rebuild this array by
   reassignment, which threw "Assignment to constant variable" and killed both
   handlers outright. */
let TRACKS=[];

/* Real listening history instead of hardcoded demo rows. */
let HISTORY=[];
function pushHistory(tr){
 if(!tr||tr.mode==="empty")return;
 HISTORY=HISTORY.filter(h=>!(String(h.tr.id)===String(tr.id)&&h.tr.s===tr.s));
 HISTORY.unshift({tr,at:Date.now()});
 HISTORY=HISTORY.slice(0,50);
 if(S.view==="library"&&S.tab!=="fav")renderLib();
 save()}
function ago(ts){
 const m=Math.round((Date.now()-ts)/60000);
 if(m<1)return LANG==="ru"?"только что":"just now";
 if(m<60)return LANG==="ru"?`${m} мин назад`:`${m} min ago`;
 const h=Math.round(m/60);
 if(h<24)return LANG==="ru"?`${h} ч назад`:`${h} h ago`;
 const d=Math.round(h/24);
 return LANG==="ru"?`${d} дн. назад`:`${d} d ago`}
const FREQ=[32,60,150,400,1000,2400,4000,8000,12000,16000];
const FLAB=["32","60","150","400","1k","2.4k","4k","8k","12k","16k"];
const PRESETS=[
  {id:"flat",n:{ru:"Ровно",en:"Flat"},g:[0,0,0,0,0,0,0,0,0,0]},
  {id:"soft",n:{ru:"Мягко",en:"Soft"},g:[1,2,1.5,0,-.5,-1.5,-3,-4.5,-5,-6]},
  {id:"bass",n:{ru:"Бас",en:"Bass"},g:[8,7,5.5,2.5,0,-1,-.5,.5,1,1]},
  {id:"drive",n:{ru:"Драйв",en:"Drive"},g:[3,5,2,-1.5,-2,.5,3,4.5,4,2.5]},
  {id:"night",n:{ru:"Ночь",en:"Night"},g:[2,3.5,2.5,1,.5,-1,-2.5,-5,-6.5,-8]},
  {id:"voice",n:{ru:"Голос",en:"Voice"},g:[-2,-3,-2,1,3.5,3,1.5,0,-1,-2]}];
/* [id, css color, "r g b" — тот же цвет для частиц и неоновых теней] */
const ACCENTS=[
 ["none","oklch(80% 0 0)",""],
 ["violet","#a78bfa","167 139 250"],
 ["indigo","#818cf8","129 140 248"],
 ["blue","#60a5fa","96 165 250"],
 ["cyan","#22d3ee","34 211 238"],
 ["teal","#2dd4bf","45 212 191"],
 ["lime","#a3e635","163 230 53"],
 ["amber","#fbbf24","251 191 36"],
 ["orange","#fb923c","251 146 60"],
 ["red","#f87171","248 113 113"],
 ["pink","#f472b6","244 114 182"]];

/* state */
/* Title is resolved through i18n when rendered, not stored: a literal here
   stayed Russian under an English interface. */
const EMPTY_TRACK={id:"empty",s:"ytm",t:"",a:"Meowave",al:"",d:0,mode:"empty",art:null};
const S={view:"home",tab:"pl",playing:false,current:EMPTY_TRACK,pos:0,dur:0,
 shuffle:false,repeat:false,vol:.8,muted:false,quality:"high",
 glow:1,blur:14,theme:"dark",accent:"none",dens:2200,pspeed:.35,
 /* One explicit switch for weak machines. No auto-detection: the automatic
   tier system misjudged real hardware and its cuts looked like breakage, so
   this is the user's call, applied and reverted in one click. */
 lite:false,
 /* Playback speed (0.5-1.5) and post-volume boost (1-3x). */
 rate:1,boost:1,
 /* Downloads: target folder, whether to ask each time, and optional automatic
    copies. All off until the user opts in. */
 dlDir:"",dlAsk:false,dlAutoFav:false,dlAutoPl:false,
 /* raw | fx — whether a download bakes in the equaliser and the speed. */
 dlMode:"raw",
 /* Any colour, not just the preset swatches. */
 customAccent:"#a78bfa",
 /* Per-track equaliser: { "svc:id": presetId }. */
 eqByTrack:{},
 /* Playlist id -> preset id. Applied while that playlist is the open one. */
 eqByPl:{},
 /* Playlist id -> cropped cover data URL, so covers survive offline. */
 plCovers:{},
 /* "service:id" -> 1 for tracks the user asked never to hear again. */
 dislikes:{},
eq:[...PRESETS[0].g],preset:"flat",custom:[],fpTab:"queue",listen:0,stab:"acc",
sp:{on:false,speed:.10,rad:.7,elev:.55},
eqMode:"global",preamp:0};
const fmt=s=>{s=Math.max(0,Math.floor(s||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`};
/* Listening total for the profile card. Under an hour it reads in minutes,
   otherwise in hours — "0.0 ч" after a first session read as broken. */
const fmtListen=s=>{s=Math.max(0,Math.floor(s||0));
 return s<3600?Math.round(s/60)+" "+t("unit.min"):(s/3600).toFixed(1)+" "+t("unit.hr")};
/* Short bottom notice so errors are visible without opening the console. */
/* In-app dialogs.

   window.prompt/confirm render the webview's own chrome — the "tauri.localhost
   says" box — which instantly breaks the illusion that this is an app rather
   than a browser. They are also modal to the whole process and cannot be
   themed. These replacements return promises with the same shape, so callers
   only need an await. */
let modalRes=null;
function closeModal(ok){
 const el=document.getElementById("modal");if(!el)return;
 el.dataset.open="false";
 const r=modalRes;modalRes=null;
 /* A confirm dialog has no text field, but #modal-input still exists and its
    value is "". Resolving that made every askConfirm() falsy, so "delete
    playlist" and "clear local files" were cancelled every single time even
    after the user pressed OK. Only a dialog that actually asked for text
    resolves to text; a confirm resolves to true. */
 const wantsInput=el.dataset.input==="true";
 const val=wantsInput?(document.getElementById("modal-input")?.value?.trim()||""):null;
 /* The delayed hide must not outlive this dialog: chained flows (type a room
    name, OK, immediately get the private/public confirm) opened the next
    dialog inside the 200 ms window, and this timer then hid the wrapper under
    it — the new dialog existed but was invisible, which read as "it flashed
    and everything closed". showModal cancels the timer for the same reason. */
 clearTimeout(el._hide);
 el._hide=setTimeout(()=>{el.hidden=true},200);
 if(r)r(ok?(wantsInput?val:true):null)}

function showModal({title,label,value="",confirm,cancel,input=true,danger=false}){
 const el=document.getElementById("modal");
 if(!el)return Promise.resolve(null);
 clearTimeout(el._hide);
 el.hidden=false;
 document.getElementById("modal-title").textContent=title||"";
 const lab=document.getElementById("modal-label");
 lab.textContent=label||"";lab.hidden=!label;
 const inp=document.getElementById("modal-input");
 inp.hidden=!input;
 el.dataset.input=String(!!input);
 if(input){inp.value=value||""}
 const okBtn=document.getElementById("modal-ok");
 okBtn.textContent=confirm||t("dlg.ok");
 okBtn.className="primary sm"+(danger?" danger":"");
 document.getElementById("modal-cancel").textContent=cancel||t("dlg.cancel");
 requestAnimationFrame(()=>{el.dataset.open="true";if(input)inp.focus();else okBtn.focus()});
 return new Promise(r=>{modalRes=r})}

/* Drop-in replacements. askText resolves to the string or null; askConfirm to
   true or null, so both are falsy when dismissed. */
const askText=(title,value="")=>showModal({title,label:"",value,input:true});
const askConfirm=(title,confirm,danger=true)=>
 showModal({title,input:false,confirm,danger});

document.addEventListener("click",e=>{
 if(e.target.closest("#modal-ok"))return closeModal(true);
 if(e.target.closest("#modal-cancel")||e.target.id==="modal")return closeModal(false)});
document.addEventListener("keydown",e=>{
 const el=document.getElementById("modal");
 if(!el||el.dataset.open!=="true")return;
 if(e.key==="Escape"){e.preventDefault();closeModal(false)}
 if(e.key==="Enter"&&e.target.id==="modal-input"){e.preventDefault();closeModal(true)}});

function toast(msg,ms=3200){
 const box=document.getElementById("toasts");if(!box||!msg)return;
 const el=document.createElement("div");el.className="toast";el.textContent=msg;
 box.appendChild(el);
 setTimeout(()=>{el.classList.add("out");setTimeout(()=>el.remove(),320)},ms)}
const icons=()=>window.lucide&&lucide.createIcons();
const fp=document.getElementById("fp");

/* audio
   source -> 9×Biquad -> [HRTF Panner -> dry + Convolver wet] | bypass -> gain -> analyser -> out */
const A={ctx:null,src:null,audio:null,media:null,bands:[],pan:null,air:null,conv:null,dry:null,wet:null,byp:null,gain:null,an:null,data:null,started:false,theta:0,
 /* gen bumps on every track change; events from the previous src are dropped */
 gen:0,onMeta:null,onTime:null,onEnd:null,onErr:null,lastPos:0};
/* Exactly one <audio> element for the whole app. */
function ensureAudioEl(){
 if(A.audio)return A.audio;
 const au=A.audio=document.createElement("audio");
 au.crossOrigin="anonymous";au.preload="auto";
 au.addEventListener("loadedmetadata",()=>A.onMeta?.());
 au.addEventListener("durationchange",()=>A.onMeta?.());
 au.addEventListener("timeupdate",()=>A.onTime?.());
 au.addEventListener("ended",()=>A.onEnd?.());
 au.addEventListener("error",()=>A.onErr?.());
 /* The media load algorithm resets playbackRate to defaultPlaybackRate, and it
    runs again on every src swap. Re-asserting the rate once the new resource is
    actually ready is what stops slowed/nightcore reverting to 1x on skip. */
  au.addEventListener("loadedmetadata",()=>applyRate());
  au.addEventListener("canplay",()=>applyRate());
  /* WebKitGTK re-clamps the rate when playback actually starts, not only on
     load — the speed slider "did nothing" exactly there. Re-assert on both
     transport events. */
  au.addEventListener("play",()=>applyRate());
  au.addEventListener("playing",()=>{applyRate();S.playing=true;sync()});
 au.addEventListener("pause",()=>{if(!au.ended){S.playing=false;sync()}});
 if(A.ctx&&!A.media){A.media=A.ctx.createMediaElementSource(au);A.media.connect(A.bands[0])}
 return au}
function ir(ctx,room="hall"){
 /* Room impulse responses, generated rather than shipped as .wav files: a
    convolution reverb only needs a decaying noise burst to read as a space, and
    four of those cost nothing to synthesise while four real IRs would be
    megabytes of assets to download and cache.

    The three knobs that actually change the character:
      len   — how long the tail rings (small room vs concert hall)
      decay — how fast it falls away (a bright small room decays steeply)
      pre   — pre-delay, the gap before the first reflection, which is what
              makes a large space sound large rather than just long. */
 const P={small:{len:.45,decay:5.5,pre:.004},
          hall:{len:1.5,decay:2.8,pre:.012},
          large:{len:3.2,decay:1.8,pre:.028}}[room]||{len:1.5,decay:2.8,pre:.012};
 const n=Math.floor(ctx.sampleRate*P.len),b=ctx.createBuffer(2,n,ctx.sampleRate);
 const preN=Math.floor(ctx.sampleRate*P.pre);
 for(let c=0;c<2;c++){
  const d=b.getChannelData(c);
  for(let i=0;i<n;i++){
   if(i<preN){d[i]=0;continue}
   const x=(i-preN)/(n-preN);
   /* Slight per-channel decorrelation so the reverb has width instead of
      collapsing to the centre of the stereo image. */
   d[i]=(Math.random()*2-1)*Math.pow(1-x,P.decay)*(c?.94:1)}}
 return b}
function loop(ctx,root){
 /* legacy demo generator kept only for compatibility; it is never started */
 const sr=ctx.sampleRate,spb=.5,steps=16,len=Math.floor(sr*steps*spb),b=ctx.createBuffer(2,len,sr);
 const L=b.getChannelData(0),R=b.getChannelData(1),seq=[0,0,7,0,3,0,10,7],ch=[[0,3,7],[0,5,10],[-2,3,8],[0,3,7]],st=n=>root*Math.pow(2,n/12);
 for(let s=0;s<steps;s++){const off=Math.floor(s*spb*sr),f=st(seq[s%8]),nl=Math.floor(spb*sr*.95);
  for(let i=0;i<nl;i++){const tt=i/sr,env=Math.exp(-tt*4.2),k=off+i;if(k>=len)break;
   let v=Math.sin(2*Math.PI*f*tt)*.5+Math.sin(4*Math.PI*f*tt)*.15+Math.sin(Math.PI*f*tt)*.2;v*=env*.32;
   if(s%4===0){const ke=Math.exp(-tt*16);v+=Math.sin(2*Math.PI*(56+88*ke)*tt)*ke*.5}
   if(s%4===2){const he=Math.exp(-tt*44);v+=(Math.random()*2-1)*he*.09}
   L[k]+=v;R[k]+=v*.96}}
 for(let i=0;i<len;i++){const tt=i/sr,bar=Math.floor(tt/(spb*8))%ch.length,c=ch[bar];let v=0;
  for(let k=0;k<3;k++){const f=st(c[k]+24);v+=Math.sin(2*Math.PI*f*tt+Math.sin(tt*.6+k))*.05+Math.sin(2*Math.PI*f*1.004*tt)*.035}
  const sw=.6+.4*Math.sin(tt*.8);L[i]+=v*sw;R[i]+=v*sw*.92}
 for(let i=0;i<len;i++){L[i]=Math.tanh(L[i]*1.1)*.85;R[i]=Math.tanh(R[i]*1.1)*.85}
 return b}
function initAudio(){
 if(A.ctx)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
 const ctx=new C();A.ctx=ctx;
 A.bands=FREQ.map((f,i)=>{const b=ctx.createBiquadFilter();
  b.type=i===0?"lowshelf":i===FREQ.length-1?"highshelf":"peaking";b.frequency.value=f;b.Q.value=1.05;b.gain.value=S.eq[i];return b});
 A.bands.forEach((b,i)=>{if(i)A.bands[i-1].connect(b)});
 /* Preamp sits before the filter bank, which is the only correct place for it:
    a boosted band adds gain, and cutting after the fact would also cut the
    signal the user asked to be louder. Trimming the input instead is how a
    hardware EQ avoids clipping its own output. */
 A.pre=ctx.createGain();A.pre.gain.value=1;
 A.pre.connect(A.bands[0]);
 A.pan=ctx.createPanner();A.pan.panningModel="HRTF";A.pan.distanceModel="inverse";
 A.pan.refDistance=1;A.pan.maxDistance=12;A.pan.rolloffFactor=.6;
 A.conv=ctx.createConvolver();A.conv.buffer=ir(ctx);
A.dry=ctx.createGain();A.wet=ctx.createGain();A.byp=ctx.createGain();
  A.gain=ctx.createGain();A.an=ctx.createAnalyser();A.an.fftSize=512;A.an.smoothingTimeConstant=.84;
  /* Boost stage. The volume slider alone cannot exceed 1.0, so quiet masters
     stayed quiet. A separate gain node can, but raw amplification clips hard,
     so it feeds a compressor acting as a limiter: loudness rises, the peaks
     stay inside the rails instead of turning into distortion. */
  A.boost=ctx.createGain();A.boost.gain.value=1;
  A.lim=ctx.createDynamicsCompressor();
  A.lim.threshold.value=-1.5;A.lim.knee.value=0;A.lim.ratio.value=20;
  A.lim.attack.value=.003;A.lim.release.value=.25;
  A.data=new Uint8Array(A.an.frequencyBinCount);
  A.air=ctx.createBiquadFilter();A.air.type="lowpass";A.air.frequency.value=20000;A.air.Q.value=.5;
  /* Room reverb — regenerated when the mode changes so the IR always matches. */
  A.spatialRoom="hall";A.conv=ctx.createConvolver();A.conv.buffer=ir(ctx,A.spatialRoom);
  const out=A.bands[A.bands.length-1];out.connect(A.pan);out.connect(A.byp);
  A.pan.connect(A.air);A.air.connect(A.dry);A.air.connect(A.conv);A.conv.connect(A.wet);
  A.dry.connect(A.gain);A.wet.connect(A.gain);A.byp.connect(A.gain);
  A.gain.connect(A.boost);A.boost.connect(A.lim);A.lim.connect(A.an);A.an.connect(ctx.destination);
 if(ctx.listener.positionZ){ctx.listener.positionX.value=0;ctx.listener.positionY.value=0;ctx.listener.positionZ.value=0}
 A.gain.gain.value=S.muted?0:S.vol;applySpatial();applyBoost();applyRate();
 /* If <audio> existed before the first user gesture, wire it up now. */
 if(A.audio&&!A.media){A.media=ctx.createMediaElementSource(A.audio);A.media.connect(A.bands[0])}}
function load(tr,auto){
 if(!tr||tr.mode==="empty")return;
 initAudio();if(!A.ctx)return;
 /* Stop a generated source (test tone); the <audio> element keeps living. */
 if(A.src&&A.src!==A.audio){try{A.src.stop()}catch(e){}try{A.src.disconnect()}catch(e){}A.src=null}
 if(tr?.mode==="local"&&tr?.s!=="mock"){
  const url=streamUrl(tr)||tr.url||"";
  if(!url){/* the proxy port is unknown yet; without it src is empty and <audio> is mute */
   ensureStreamPort().then(p=>{if(p)load(tr,auto)});return}

  /* The <audio> element and its MediaElementSource are created EXACTLY ONCE
     per page; changing track only swaps src. Recreating the node was the
     cause of "you have to restart the player": a second
     createMediaElementSource call on the same element throws
     InvalidStateError, and the stale listeners stayed alive and fought over
     the progress bar. */
  const au=ensureAudioEl();
  const gen=++A.gen;
  au.pause();
  au.src=url;
  /* Assigning src resets playbackRate to 1, so the chosen speed has to be
     reapplied per track or slowed/nightcore silently reverted on skip. */
  applyRate();
  A.src=au;A.lastPos=0;
  /* Events from the previous track can land after the swap; gen rejects them. */
  A.onMeta=()=>{if(gen!==A.gen)return;if(Number.isFinite(au.duration)&&au.duration>0){S.dur=au.duration;renderNP();paint();if(fp.dataset.open==="true")renderFP()}};
  /* Listening time is measured from the element's own clock, not from the render
     loop: rAF is throttled or stopped when the window is hidden, and the old
     `S.listen += 0` here meant local playback — i.e. every service now — never
     counted a single second. Deltas are clamped so a seek isn't counted as
     listening. */
  A.onTime=()=>{
   if(gen!==A.gen)return;
   const now=au.currentTime;
   if(!seeking){
    const dt=now-(A.lastPos??now);
    if(dt>0&&dt<2){S.listen+=dt;noteListening(dt)}
   }
   A.lastPos=now;
   if(seeking)return;
   S.pos=now;paint()};
  A.onEnd=()=>{if(gen===A.gen)next()};
  A.onErr=()=>{
   if(gen!==A.gen)return;
   console.error("audio load failed",au.error?.code,au.error?.message||"",url);
   S.playing=false;sync();explainFailure(url,tr)};
  au.load();
  /* load() has just reset the rate again; applyRate keeps default and current
     in step and the readiness listeners re-assert it after the swap. */
  applyRate();
  if(auto){A.ctx.resume();au.play().catch(e=>{if(gen!==A.gen)return;console.error("play() rejected:",e);S.playing=false;sync()});A.started=true}
  return}
 const b=A.ctx.createBufferSource();b.buffer=loop(A.ctx,tr.root||1);b.loop=true;b.connect(A.bands[0]);A.src=b;
 if(auto){A.ctx.resume();b.start();A.started=true}}
/* EQ including preamp. When mode is "global" the preamp is fixed at 1 and only
   the bands move; when "track" the preamp belongs to the preset too. */
function applyEQ(){
 if(!A.ctx)return;
 A.pre.gain.setTargetAtTime(S.eqMode==="track"?Math.pow(10,S.preamp/20):1,A.ctx.currentTime,.02);
 A.bands.forEach((b,i)=>b.gain.setTargetAtTime(S.eq[i],A.ctx.currentTime,.02))}

/* Playback speed — the slowed / nightcore control.

   preservesPitch is deliberately turned OFF. Keeping the pitch is what a
   podcast app wants; "slowed + reverb" and nightcore are defined by the pitch
   moving with the speed. With it on, 0.8x just sounds like a dragging version
   of the same track.

   Only <audio> playback can be retimed: the generated test tone has no rate. */
function applyRate(){
 const r=Math.max(.5,Math.min(1.5,S.rate||1));
 if(A.audio){
  A.audio.preservesPitch=false;
  A.audio.mozPreservesPitch=false;
  A.audio.webkitPreservesPitch=false;
  /* defaultPlaybackRate is the value load() restores playbackRate from; setting
     only the latter meant the speed survived until the next track and no
     further. */
   A.audio.defaultPlaybackRate=r;
   if(A.audio.playbackRate!==r)A.audio.playbackRate=r;
   /* WebKitGTK re-clamps the element rate a beat after seeks and resumes.
      One deferred re-assert catches it without polling forever. */
   clearTimeout(applyRate._t);
   applyRate._t=setTimeout(()=>{
    if(A.audio&&Math.abs(A.audio.playbackRate-r)>0.01)A.audio.playbackRate=r},350)}
 const el=document.getElementById("rate-v");
 if(el)el.textContent=r.toFixed(2)+"×";
 const sl=document.getElementById("rate");
 if(sl&&+sl.value!==Math.round(r*100)){sl.value=Math.round(r*100);paintRange(sl)}
 document.querySelectorAll("[data-rate]").forEach(b=>
  b.setAttribute("aria-pressed",Math.abs(+b.dataset.rate-r)<.001));
 /* A retimed track finishes sooner or later than its stated duration; the
    progress clock reads the media element for local playback, so only the
    synthetic clock needs telling. */
}

/* Extra loudness above the volume slider's ceiling, limited so it cannot clip. */
function applyBoost(){
 const b=Math.max(1,Math.min(3,S.boost||1));
 if(A.boost&&A.ctx)A.boost.gain.setTargetAtTime(b,A.ctx.currentTime,.05);
 const el=document.getElementById("boost-v");
 if(el)el.textContent=b<=1?t("snd.boost.off"):"+"+Math.round(20*Math.log10(b))+" dB";
 const sl=document.getElementById("boost");
 if(sl&&+sl.value!==Math.round(b*100)){sl.value=Math.round(b*100);paintRange(sl)}}
function applySpatial(){
 if(!A.ctx)return;const on=S.sp.on,n=A.ctx.currentTime;
 A.byp.gain.setTargetAtTime(on?0:1,n,.06);
 A.dry.gain.setTargetAtTime(on?.9:0,n,.06);
 A.wet.gain.setTargetAtTime(on?.15+.2*S.sp.rad:0,n,.06);
 document.getElementById("sp3d").setAttribute("aria-pressed",on);
 document.getElementById("sp-on").setAttribute("aria-pressed",on);
 if(!on){A.air.frequency.setTargetAtTime(20000,n,.1);
  if(A.pan.positionX){A.pan.positionX.setTargetAtTime(0,n,.1);A.pan.positionY.setTargetAtTime(0,n,.1);A.pan.positionZ.setTargetAtTime(-1,n,.1)}}}
function orbit(dt){
 if(!A.ctx||!S.sp.on)return;
 A.theta+=dt*S.sp.speed*Math.PI*2;
 const r=.6+S.sp.rad*3.4,th=A.theta;
 const x=Math.sin(th)*r, z=Math.cos(th)*r*.85, y=Math.sin(th*2)*r*.55*S.sp.elev;
 const n=A.ctx.currentTime;
 if(A.pan.positionX){A.pan.positionX.setTargetAtTime(x,n,.02);A.pan.positionY.setTargetAtTime(y,n,.02);A.pan.positionZ.setTargetAtTime(z,n,.02)}
 else A.pan.setPosition(x,y,z);
 /* слушатель смотрит в -z: источник сзади (z>0) звучит глуше — теневая фильтрация головы */
 const behind=Math.max(0,z/(r*.85));
 A.air.frequency.setTargetAtTime(19000-13000*behind*behind,n,.05)}
function level(){if(!A.an||!S.playing)return 0;A.an.getByteFrequencyData(A.data);
 let s=0;for(let i=0;i<40;i++)s+=A.data[i];return Math.min(1,s/(40*195))}
function bins(n){if(!A.an)return new Array(n).fill(0);A.an.getByteFrequencyData(A.data);
 const out=[];const step=Math.floor(A.data.length*.6/n);
 for(let i=0;i<n;i++){let s=0;for(let j=0;j<step;j++)s+=A.data[i*step+j];out.push(s/(step*255))}return out}

/* particle field */
let spriteCache={};
let particlesEnabled=true;
function setParticlesEnabled(v){particlesEnabled=!!v; if(!particlesEnabled){F.p.length=0;F.n=0}}

/* Performance tiers.
   2200 particles means 2200 drawImage calls per frame, and on integrated
   graphics the blurred glass panels (backdrop-filter) recomposite the whole
   window on top of that. Users on weak hardware reported single-digit FPS.

   Rather than ask people to guess a particle count, measure: sample real frame
   times for ~1.4s after boot and drop a tier if we can't hold the budget. The
   check is one-way (never upgrades) so a brief hiccup can't cause oscillation,
   and "high" is only ever chosen by an explicit user override. */
/* The performance-tier system is gone entirely — no auto-detect, no modes,
   no stripped effects. It repeatedly misjudged real machines and its cuts
   only made the app look broken. The particle density slider in Вид is the
   one honest control, exactly like the beta. */

function sprite(a){
 const de=document.documentElement,dark=de.dataset.theme!=="light";
 /* Alpha is quantised to 50 steps before it becomes a cache key. Continuous
    alpha meant a near-unique key per particle, so the cache never hit and every
    frame built thousands of 32×32 radial gradients — the actual reason the
    field ran at 30 fps. Fifty steps is below what the eye resolves in a
    glow. */
 const q=Math.round(a*50);
 const k=q+(dark?"d":"l")+(de.dataset.accent||"n");
 if(spriteCache[k])return spriteCache[k];
 const cs=getComputedStyle(de);
 const r=cs.getPropertyValue("--pr").trim(),g=cs.getPropertyValue("--pg").trim(),b=cs.getPropertyValue("--pb").trim();
 const qa=q/50;
 const c=document.createElement("canvas");c.width=c.height=32;const x=c.getContext("2d");
 /* цветное гало */
 const halo=x.createRadialGradient(16,16,0,16,16,16);
 halo.addColorStop(0,`rgba(${r},${g},${b},${qa*.85})`);
 halo.addColorStop(.3,`rgba(${r},${g},${b},${qa*.3})`);
 halo.addColorStop(1,`rgba(${r},${g},${b},0)`);
 x.fillStyle=halo;x.fillRect(0,0,32,32);
 /* белое раскалённое ядро — только на тёмной теме, где additive-режим даёт неон */
 if(dark){
  const core=x.createRadialGradient(16,16,0,16,16,4.5);
  core.addColorStop(0,`rgba(255,255,255,${qa*.9})`);core.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=core;x.beginPath();x.arc(16,16,4.5,0,7);x.fill()}
 spriteCache[k]=c;return c}

const cv=document.getElementById("field"),gx=cv.getContext("2d",{alpha:true,desynchronized:true});
const F={p:[],n:0,w:0,h:0,dpr:1,t:0,mode:"cloud",mx:-1e4,my:-1e4,px:-1e4,py:-1e4,
 /* скорость курсора: частицы увлекаются движением, а не только отталкиваются */
 pvx:0,pvy:0,pt:0,burstT:0};
function build(n){
 F.n=n;F.p=[];
 /* Continuous alpha, exactly as the original.

    I previously quantised this to 8 steps so the draw loop could reuse one
    sprite per step. It measured faster and looked worse: with only 8 distinct
    brightnesses the field lost its haze and read as a dull, grey-tinted cloud
    instead of glowing dust. The lookup it saved was never the bottleneck.
    Sorting by alpha also reshuffled `lane`, which quietly changed the wave
    layout itself. */
 for(let i=0;i<n;i++)F.p.push({x:Math.random()*F.w,y:Math.random()*F.h,vx:0,vy:0,hx:0,hy:0,
  a:.2+Math.random()*.55,s:.5+Math.random()*.85,ph:Math.random()*Math.PI*2,lane:i%9,r:Math.random()});
}
function safeParticleDensity(){
 const mem=Number(navigator.deviceMemory)||4,cores=Number(navigator.hardwareConcurrency)||4;
 if(matchMedia("(pointer:coarse)").matches||mem<=2||cores<=2)return 700;
 if(mem<=4||cores<=4)return 1200;
 return Math.min(S.dens,2200)}
/* стартовая раскладка: частицы приходят из-за краёв экрана и стягиваются в круг */
function scatterEdges(){
 if(!particlesEnabled||!F.n)return;
 const cx=F.w/2,cy=F.h/2,R=Math.hypot(F.w,F.h)*.62;
 F.p.forEach(p=>{const a=Math.random()*Math.PI*2,d=R*(.75+Math.random()*.5);
  p.x=cx+Math.cos(a)*d;p.y=cy+Math.sin(a)*d;p.vx=0;p.vy=0});
}
/* ударная волна: круг разлетается и растягивается в бегущую волну */
function shock(strength=1.4){
 if(!particlesEnabled||!F.n){F.mode=S.playing?"flow":"cloud";return}
 F.burstT=performance.now();
 const cx=F.w/2,cy=F.h/2;
 F.p.forEach(p=>{const dx=p.x-cx,dy=p.y-cy,d=Math.hypot(dx,dy)||1;
  p.vx+=dx/d*(430+Math.random()*280)*strength;
  p.vy+=dy/d*(150+Math.random()*130)*strength*.55});
 F.mode="flow";
 setTimeout(()=>{if(!S.playing&&F.mode==="flow")F.mode="cloud"},2800);
}
function resize(){
 /* At dpr 2 the field is four times the pixels for a glow that is deliberately
    soft — nothing in it has an edge sharp enough to benefit. Capping at 1.5
    roughly halves the fill cost on a HiDPI screen and is invisible. Lite mode
    goes to 1: on weak GPUs the fill rate is the wall. */
 F.dpr=Math.min(S.lite?1:1.5,window.devicePixelRatio||1);
 F.w=innerWidth;F.h=innerHeight;
 cv.width=F.w*F.dpr;cv.height=F.h*F.dpr;gx.setTransform(F.dpr,0,0,F.dpr,0,0);
 if(!F.p.length)build(innerWidth<900?Math.round(safeParticleDensity()*.45):safeParticleDensity())}
resize();addEventListener("resize",()=>{resize()});
addEventListener("pointermove",e=>{
 const now=performance.now(),dt=Math.max(8,now-F.pt)/1000;
 if(F.px>-1e3){
  /* сглаживание: без него рывки мыши дают дёрганье всего поля */
  const k=1-Math.exp(-dt*14);
  F.pvx+=((e.clientX-F.px)/dt-F.pvx)*k;
  F.pvy+=((e.clientY-F.py)/dt-F.pvy)*k}
 F.pt=now;F.px=e.clientX;F.py=e.clientY;F.mx=e.clientX;F.my=e.clientY});
addEventListener("pointerleave",()=>{F.mx=F.my=F.px=F.py=-1e4;F.pvx=F.pvy=0});
/* клик по фону — локальный всплеск в точке курсора */
addEventListener("pointerdown",e=>{
 if(e.target.closest("button,input,a,.pane,.row,.q"))return;
 poke(e.clientX,e.clientY)});
function poke(cx,cy){
 if(!particlesEnabled)return;
 const r=260,R2=r*r;
 for(let i=0;i<F.n;i++){const p=F.p[i],dx=p.x-cx,dy=p.y-cy,d2=dx*dx+dy*dy;
  if(d2>R2)continue;const d=Math.sqrt(d2)||1,q=1-d/r;
  p.vx+=dx/d*q*q*620;p.vy+=dy/d*q*q*620-90*q}}
function burst(strength=1){
 F.burstT=performance.now();
 const cx=F.w/2,cy=F.h/2;
 F.p.forEach(p=>{const a=Math.atan2(p.y-cy,p.x-cx)+(Math.random()-.5)*.9,v=(130+Math.random()*380)*strength;
  p.vx+=Math.cos(a)*v;p.vy+=Math.sin(a)*v-42*strength})}
function ring(){F.mode="ring"}
function step(dt,lvl){
 const sp=S.pspeed;F.t+=dt*sp;
 const w=F.w,h=F.h,n=F.n,mode=F.mode;
 const amp=h*(.05+.16*lvl);
 /* после burst притяжение к цели плавно восстанавливается за ~3.6с (smoothstep) */
 let hold=1;
 if(F.burstT){const e=(performance.now()-F.burstT)/3600;
  if(e>=1)F.burstT=0;else hold=e*e*(3-2*e)}
 /* критически демпфированное следование: чистая экспонента, без перелёта */
 const base=1-Math.exp(-dt*(1.5+sp*1.7)),decay=Math.exp(-dt*1.3);
 for(let i=0;i<n;i++){
  const p=F.p[i];
  if(mode==="gather"){
   /* boot-кольцо: плотный вращающийся круг в центре */
   const a=(i/n)*Math.PI*2+F.t*.22,rr=Math.min(w,h)*.17*(1+.025*Math.sin(F.t*2.2+p.ph));
   p.hx=w/2+Math.cos(a)*rr;p.hy=h/2+Math.sin(a)*rr;
  }else if(mode==="ring"){
   const a=(i/n)*Math.PI*2,rr=Math.min(w,h)*.3*(1+.03*Math.sin(F.t*1.2+p.ph));
   p.hx=w/2+Math.cos(a)*rr;p.hy=h/2+Math.sin(a)*rr*.92;
  }else if(mode==="cloud"){
   p.hx=(((i/n)*1.2+F.t*.02)%1.2-.1)*w;
   p.hy=h*.5+Math.sin(p.ph+F.t*.35+i*.004)*h*.22+Math.cos(F.t*.22+p.lane)*h*.05;
  }else{
   const ph=i/n;
   p.hx=(((ph*1.2+F.t*.05)%1.2)-.1)*w;
   p.hy=h*.5+Math.sin(ph*Math.PI*4+F.t*1.1+p.lane*.7)*amp+(p.lane-4)*h*.028+Math.sin(F.t*.5+p.ph)*6;
  }
  const dx=p.x-F.mx,dy=p.y-F.my,d2=dx*dx+dy*dy;
  if(d2<26000){const d=Math.sqrt(d2)||1,q=1-d/161.3;p.vx+=dx/d*q*q*460*dt;p.vy+=dy/d*q*q*460*dt}
  const f=Math.min(1,base*(.55+p.r*.9)*(mode==="gather"?2.4:1))*hold;
  p.x+=(p.hx-p.x)*f+p.vx*dt;
  p.y+=(p.hy-p.y)*f+p.vy*dt;
  p.vx*=decay;p.vy*=decay;
 }}
function draw(lvl){
 gx.clearRect(0,0,F.w,F.h);
 if(!F.n)return;
 gx.globalCompositeOperation=document.documentElement.dataset.theme==="light"?"source-over":"lighter";
 const gl=.6+S.glow*.5;
 for(let i=0;i<F.n;i++){const p=F.p[i],sz=(2+p.s*2.8+lvl*2.6)*gl;
  gx.drawImage(sprite(p.a),p.x-sz,p.y-sz,sz*2,sz*2)}
 gx.globalCompositeOperation="source-over"}

/* cover visualiser */
const vis={c:null,g:null};
/* getComputedStyle() forces a style recalculation, and drawVis() runs on every
   frame the fullscreen player is open — so reading one variable through it cost
   a recalc per frame for a value that only ever changes with the theme
   (--text is defined exactly twice, both on data-theme; see app.css). */
let visText=null,visTextTheme=null;
function visColor(){
 const de=document.documentElement,th=de.dataset.theme;
 if(visTextTheme!==th){visTextTheme=th;visText=getComputedStyle(de).getPropertyValue("--text").trim()}
 return visText}
function drawVis(){
 if(!particlesEnabled)return;
 if(!vis.c)return;const c=vis.c,g=vis.g,w=c.width,h=c.height;
 g.clearRect(0,0,w,h);
 const b=bins(48);
 g.strokeStyle=visColor();g.globalAlpha=.55;g.lineWidth=1.5*(devicePixelRatio||1);
 g.beginPath();
 for(let i=0;i<b.length;i++){const x=(i/(b.length-1))*w,y=h*.78-b[i]*h*.5;i?g.lineTo(x,y):g.moveTo(x,y)}
 g.stroke();g.globalAlpha=1}

/* Render gating.
   Rule: the canvas only stops when the window is genuinely invisible
   (minimised or hidden). Merely losing focus must NOT stop it — the window is
   still on screen and a frozen field looks broken. Losing focus only lowers
   the frame budget.

   The 3D orbit is deliberately NOT part of this: it moves audio, not pixels,
   so it keeps running on its own timer even while the window is hidden.
   Otherwise the sound parked wherever the panner happened to stop. */
/* budget 0 means "every frame the compositor offers" — i.e. the display's own
   refresh rate. The old fixed 33 ms hard-capped the field at 30 fps on every
   machine, including the 120 Hz ones, and that cap was the 30 fps the user
   saw. An unfocused window still gets throttled, just not a focused one. */
let last=performance.now(),raf=0,lastFrame=0,renderOn=true,budget=0;
function frame(now){
 if(budget>0&&now-lastFrame<budget){raf=requestAnimationFrame(frame);return}
 lastFrame=now;
 const dt=Math.min(.05,(now-last)/1000);last=now;
 const lvl=level();step(dt,lvl);draw(lvl);
 if(fp.dataset.open==="true")drawVis();
 /* Non-local playback has no media element to read a clock from, so its
    position and listening time advance here instead. */
 if(S.playing&&S.current?.mode!=="local"){S.pos+=dt;S.listen+=dt;noteListening(dt);if(S.pos>=S.dur){S.repeat?S.pos=0:next()}paint()}
 raf=requestAnimationFrame(frame)
}
/* The orbit runs off the render loop: setInterval is not throttled in a hidden
   window the way rAF is, so the sound keeps circling the head. */
let orbitLast=performance.now();
setInterval(()=>{
 const now=performance.now(),dt=Math.min(.25,(now-orbitLast)/1000);orbitLast=now;
 if(S.sp.on&&S.playing)orbit(dt);
},1000/30);
function setRender(on){
 /* on comes from Rust meaning "the window is visible"; document.hidden concurs */
 on=!!on&&!document.hidden;
 if(on===renderOn)return;
 renderOn=on;
 if(on){
  last=performance.now();lastFrame=0;
  resize();
  if(!raf)raf=requestAnimationFrame(frame)}
 else{
  cancelAnimationFrame(raf);raf=0;
  /* Stopping the loop stops the drawing, but the canvas keeps its backing
     store: a full-window RGBA surface on the GPU, held for as long as the app
     is minimised. Resizing it to 1x1 releases that texture, and the sprite
     cache goes with it since those are canvases too. Both are rebuilt by the
     resize() above when the window comes back — rebuilding costs a few
     milliseconds once, against hundreds of megabytes held indefinitely. */
  cv.width=cv.height=1;
  spriteCache={};
  vis.c=null;vis.g=null}
}
/* Visible but unfocused: the field stays alive at ~30 fps instead of full rate. */
function setFocused(f){budget=f?0:33}
document.addEventListener("visibilitychange",()=>setRender(!document.hidden));
window.addEventListener("blur",()=>setFocused(false));
window.addEventListener("focus",()=>{setFocused(true);setRender(true)});
raf=requestAnimationFrame(frame)

/* render */
function renderSrv(){
 /* Names go through svc() so the localised ones resolve. */
 document.getElementById("srv").innerHTML=SERVICES.map(s=>
  `<button class="s" data-svc="${s.id}" data-conn="${s.conn}" data-on="${!!(s.conn&&s.on)}"><span class="d"></span>${esc(svc(s.id).name)}</button>`).join("")}
let tokOpen=null;
function renderAccounts(){
 document.getElementById("accounts").innerHTML=SERVICES.map(s=>s.free?`
  <div class="acc"><span class="an"><b>${esc(svc(s.id).name)}</b><span>${t("nologin")} · ${esc(svc(s.id).redir||"")}</span></span>
  <span class="btn on" aria-disabled="true">${t("ready")}</span></div>`:`
  <div class="acc"><span class="an"><b>${esc(svc(s.id).name)}</b><span>${s.conn?t("connected")+" · keychain: meowave/"+s.id:t("noauth")}</span></span>
  <button class="btn ${s.conn?"on":""}" data-acc="${s.id}">${s.conn?t("disconnect"):t("connect")}</button></div>
  ${tokOpen===s.id?`<div class="tokrow"><input id="tok-${s.id}" type="password" placeholder="${t("tok.ph")}" autocomplete="off">
   <button class="btn" data-toksave="${s.id}">${t("tok.save")}</button><small style="color:var(--mute);font-size:.72rem">${t("tok.hint")}</small></div>
   ${s.id==="ym"?ymGuide():""}`:""}`).join("")}
/* Where to get the Yandex token; the bare field gave no hint. */
function ymGuide(){
 return `<div class="guide">
  <ol>
   <li>${t("ym.g1")}</li>
   <li>${t("ym.g2")} <code>F12</code></li>
   <li>${t("ym.g3")} <code>Application -> Local Storage -> music.yandex.ru</code></li>
   <li>${t("ym.g4")} <code>oauth</code> -> <code>access_token</code></li>
   <li>${t("ym.g5")}</li>
  </ol>
  <div class="grow">
   <button class="btn" data-open-url="https://music.yandex.ru">${t("ym.open")}</button>
   <button class="btn" data-open-url="https://yandex.ru/dev/music/">${t("ym.docs")}</button>
  </div></div>`}
function renderSwatches(){
 const html=ACCENTS.map(([id,c])=>`<button class="sws" data-sw="${id}" aria-pressed="${S.accent===id}"
  style="background:${id==="none"?"transparent":c}" title="${id==="none"?t("acc.none"):id}">
  ${id==="none"?'<span style="position:absolute;inset:9px;border-radius:50%;background:var(--mute)"></span>':""}</button>`).join("")
 /* Takes its colour from the artwork. The whole implementation was already here
    (adaptAccent / liftForUi / applyAccentRgb) but there was no way to select it,
    and setAccent("adaptive") found no entry and wiped the accent instead. */
 +`<button class="sws" data-sw="adaptive" aria-pressed="${S.accent==="adaptive"}"
   title="${t("acc.adaptive")} — ${t("acc.adaptive.s")}"
   style="background:conic-gradient(from 210deg,#f472b6,#818cf8,#22d3ee,#a3e635,#fbbf24,#f472b6)">
   <span style="position:absolute;inset:9px;border-radius:50%;background:var(--panel)"></span></button>`
 /* Any colour at all, not just the twelve presets. The native picker is used
    rather than a hand-built one: it is the control people already know, and it
    supports the OS eyedropper. */
 +`<label class="sws custom" title="${t("acc.custom")}" style="background:${S.accent==="custom"?S.customAccent:"conic-gradient(from 0deg,#f87171,#fbbf24,#4ade80,#22d3ee,#818cf8,#e879f9,#f87171)"}">
   <input type="color" id="accpick" value="${S.customAccent||"#a78bfa"}"></label>`;
 document.getElementById("accent").innerHTML=html;
 const ob=document.getElementById("obaccent");if(ob)ob.innerHTML=html;
 /* input fires continuously while the user drags inside the OS picker.
    Re-rendering the swatches on every tick destroyed the <input> that owns
    the open dialog, so the picker snapped shut after the first movement —
    "нажимаешь и оно сразу выбирается". While picking, only the colour is
    applied live; the swatch row is rebuilt once, when the dialog closes. */
 document.querySelectorAll("#accpick, .sws.custom input").forEach(el=>{
  el.oninput=e=>applyCustomAccent(e.target.value);
  el.onchange=e=>{applyCustomAccent(e.target.value);renderSwatches();save();pushPrefs()}})}

/* Port *and* token for the local stream proxy. Declared this early because
   cssUrlRaw routes remote covers through the relay, and cover rendering runs
   long before ensureStreamPort() would otherwise initialise these. Binding to
   127.0.0.1 alone is not access control — every request carries the token. */
let STREAM_PORT=null,STREAM_KEY="";
/* hex -> "r g b", the space-separated form the CSS variables expect. */
function hexRgb(hex){
 const h=String(hex||"").replace("#","");
 const n=h.length===3?h.split("").map(c=>c+c).join(""):h;
 const v=parseInt(n,16);
 if(!Number.isFinite(v)||n.length!==6)return null;
 return [(v>>16)&255,(v>>8)&255,v&255].join(" ")}

/* Applies the colour everywhere — UI variables AND the particle field —
   without touching the DOM that hosts the open colour dialog. The field's
   sprites bake the colour in, so the cache is flushed; the very next frame
   redraws in the new colour, keeping the player and the wave in step. */
function applyCustomAccent(hex){
 const rgb=hexRgb(hex);if(!rgb)return;
 S.customAccent=hex;S.accent="custom";
 const st=document.documentElement.style;
 document.documentElement.dataset.accent="custom";
 st.setProperty("--accent",hex);
 st.setProperty("--accent-soft",`rgb(${rgb} / .16)`);
 st.setProperty("--accent-rgb",rgb);
 const [r,g,b]=rgb.split(" ");
 st.setProperty("--pr",r);st.setProperty("--pg",g);st.setProperty("--pb",b);
 spriteCache={}}

/* Full commit: apply + rebuild the swatch row. Safe to call at boot or from
   code, but never from the live oninput of the picker itself. */
function setCustomAccent(hex){
 applyCustomAccent(hex);
 renderSwatches();save();pushPrefs()}

/* Appearance travels with the account, so a reinstall or a second machine
   looks the same. Debounced: dragging a colour picker fires continuously.
   Dislikes ride along: there is no dedicated table, and the jsonb column is
   capped server-side, so only the most recent keys fit — a dislike list long
   enough to hit the cap has done its job many times over. */
let prefsTimer=0;
function pushPrefs(){
 if(!sb||!sbUser)return;
 clearTimeout(prefsTimer);
 prefsTimer=setTimeout(async()=>{
  try{await sb.rpc("set_prefs",{p:{accent:S.accent,customAccent:S.customAccent,
   theme:S.theme,glow:S.glow,blur:S.blur,dens:S.dens,
   dislikes:Object.keys(S.dislikes||{}).slice(-200)}})}
  catch(e){console.warn("prefs:",e.message||e)}},900)}
/* A track is identified by (id, service): ids are unique per service only. */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cssEsc=s=>window.CSS?.escape?CSS.escape(String(s)):String(s).replace(/[^\w-]/g,"\\$&");
/* Cover URLs come from third-party CDNs and land in two nested contexts at
   once: a CSS url() inside an HTML attribute. esc() alone is not enough there —
   the HTML parser turns &#39; back into a real quote before the CSS parser sees
   it, so the url() closes and the rest of the attribute becomes CSS. Percent-
   encode everything that could terminate either context, reject anything that
   is not an image URL, then HTML-escape what is left. ';' is left alone: every
   call site quotes the url(), where it terminates nothing, and encoding it
   breaks the ";base64," separator inside data URLs — the browser then reads
   "image/gif%3bbase64" as the MIME type and refuses to decode the image, which
   is how playlist covers went invisible. */
const cssUrlRaw=s=>{
  const u=String(s??"");
  if(!u||!/^(https?:\/\/|data:image\/|blob:)/i.test(u))return "";
  /* Remote artwork is relayed through our own proxy: the cover hosts are
     blocked on many networks even when search works, and a direct cross-origin
     image taints the canvas the adaptive accent samples from. data:/blob: pass
     through untouched; without the Tauri shell (plain browser) there is no
     relay, so the direct URL is kept. */
  if(/^https?:\/\//i.test(u)&&STREAM_PORT)
   return `http://127.0.0.1:${STREAM_PORT}/img/${encodeURIComponent(u)}?k=${encodeURIComponent(STREAM_KEY)}`;
  return u.replace(/[\\'"()\s<>]/g,c=>"%"+c.charCodeAt(0).toString(16).padStart(2,"0"))};
const cssUrl=s=>esc(cssUrlRaw(s));
/* style="" for a cover: the image when we trust it, the placeholder gradient
   otherwise. Centralised so no call site can forget cssUrl(). The gradient
   stays as a second background layer under the image: an inline
   background-image replaces the CSS one entirely, so while a remote cover is
   still loading (every track change) the tile would show nothing at all —
   on the fullscreen player that read as a black flash. */
const coverStyle=(url,l1,l2)=>{
 const u=cssUrl(url);
 return u
  ?`style="--l1:${l1||"54%"};--l2:${l2||"22%"};background-image:url('${u}'),linear-gradient(150deg,oklch(var(--l1) 0 0),oklch(var(--l2) 0 0))"`
  :`style="--l1:${l1||"54%"};--l2:${l2||"22%"}"`};
function findTrack(id,s){
 const key=String(id);
 const hit=TRACKS.find(x=>String(x.id)===key&&(!s||x.s===s))||TRACKS.find(x=>String(x.id)===key);
 if(hit)return hit;
 if(String(S.current?.id)===key)return S.current;
 /* Recent and playlist rows are rendered from HISTORY / PLAYLISTS, and those
    entries are not necessarily in TRACKS: a restored history survives a restart
    while TRACKS starts empty. The lookup returned null and the click silently
    did nothing, which is the "recent sometimes will not switch" bug. Anything
    found here is adopted into TRACKS so next/prev can reach it too. */
 const from=HISTORY.map(h=>h.tr)
  .concat(PLAYLISTS.flatMap(p=>p.tracks||[]))
  .concat(queue);
 const found=from.find(x=>x&&String(x.id)===key&&(!s||x.s===s))||from.find(x=>x&&String(x.id)===key);
 if(found&&!TRACKS.some(x=>String(x.id)===String(found.id)&&x.s===found.s))TRACKS.push(found);
 return found||null}
const isCur=tr=>String(S.current?.id)===String(tr.id)&&S.current?.s===tr.s;
/* removable: a local file can be dropped from the library.
   rmPid: inside an open playlist, the row can be taken out of it. */
function row(tr,extra="",removable=false,rmPid=null){
 return `<div class="row" data-track="${esc(tr.id)}" data-svc="${esc(tr.s)}" data-playing="${isCur(tr)}">
  <span class="art" ${coverStyle(tr.art,tr.l1,tr.l2)}></span>
  <span class="meta"><b>${esc(tr.t)}</b><span>${esc(tr.a)}${tr.al?" · "+esc(tr.al):""}${extra?" · "+esc(extra):""}</span></span>
  <span class="src">${esc(svc(tr.s).name)}</span><span class="dur">${fmt(tr.d)}</span>
  <button class="heart" data-fav="${esc(tr.id)}" data-svc="${esc(tr.s)}" aria-pressed="${!!tr.fav}" aria-label="fav"><i data-lucide="heart" width="14" height="14"></i></button>
  ${removable?`<button class="heart rm" data-rmlocal="${esc(tr.id)}" aria-label="remove"><i data-lucide="x" width="14" height="14"></i></button>`:""}
  ${rmPid?`<button class="heart rm" data-rmpl="${esc(rmPid)}" data-rmtrack="${esc(tr.id)}" data-rmsvc="${esc(tr.s)}" aria-label="remove from playlist" title="${esc(t("plctx.rmtrack"))}"><i data-lucide="x" width="14" height="14"></i></button>`:""}</div>`}

/* Artists, derived from the library rather than stored: a track always knows
   its artist, so a separate table would only be one more thing to keep in
   sync. Favourite artists are stored, since that is a user decision. */
function artistList(){
 const by=new Map();
 TRACKS.filter(x=>x.mode!=="empty").forEach(x=>{
  const k=(x.a||"—").trim();if(!k||k==="—")return;
  if(!by.has(k))by.set(k,[]);
  by.get(k).push(x)});
 return [...by.entries()].map(([name,list])=>({
  name,list,
  art:list.find(x=>x.art)?.art||null,
  fav:FAV_ARTISTS.includes(name)}))
  .sort((a,b)=>(b.fav?1:0)-(a.fav?1:0)||b.list.length-a.list.length)}

let FAV_ARTISTS=[];
function toggleFavArtist(name){
 FAV_ARTISTS=FAV_ARTISTS.includes(name)
  ?FAV_ARTISTS.filter(x=>x!==name)
  :[...FAV_ARTISTS,name];
 save();renderLib();
 if(sb&&sbUser)syncFavArtists()}
async function syncFavArtists(){
 /* Through the RPC, not a direct upsert: it caps the array server-side, and the
    guard trigger on profiles rejects an oversized one anyway. */
 try{const {error}=await sb.rpc("set_fav_artists",{names:FAV_ARTISTS});if(error)throw error}
 catch(e){console.warn("fav artists:",e.message||e)}}

/* Artist page: everything by them in the library, plus a follow toggle. */
let artOpen=null;
function renderArtist(name){
 const b=document.getElementById("libbody");
 const a=artistList().find(x=>x.name===name);
 if(!a){artOpen=null;return renderLib()}
 b.innerHTML=`<div class="plhead">
   <button class="btn" id="artback">← ${t("lib.art")}</button>
   <b>${esc(a.name)}</b><span>${a.list.length} ${t("tracks")}</span>
   <button class="btn ${a.fav?"on":""}" id="artfav">${a.fav?t("art.unfollow"):t("art.follow")}</button>
   <button class="btn" id="artplay">${t("pl.playall")}</button></div>
   <div class="rows" data-listctx="art:${esc(a.name)}">`+a.list.map(x=>row(x)).join("")+`</div>`;
 document.getElementById("artback").onclick=()=>{artOpen=null;renderLib()};
 document.getElementById("artfav").onclick=()=>{toggleFavArtist(a.name);renderArtist(a.name)};
 document.getElementById("artplay").onclick=()=>{
  /* buildQueue fills the rest from the artist context; assigning `queue` by hand
     here is what used to make the panel and the playback order disagree. */
  setTrack(a.list[0],true,true,"art:"+a.name)};
 icons()}

/* Removing imported files. They are only referenced by path, so this forgets
   them — it never deletes anything from disk. */
async function removeLocal(id){
 const tr=TRACKS.find(x=>x.s==="local"&&String(x.id)===String(id));
 if(!tr)return;
 TRACKS=TRACKS.filter(x=>!(x.s==="local"&&String(x.id)===String(id)));
 LOCAL_PATHS=LOCAL_PATHS.filter(p=>p!==tr.path);
 if(isCur(tr)){S.playing=false;sync()}
 save();renderLib();renderLocalInfo();renderWaveHint();
 toast(t("loc.removed"))}
async function clearLocal(){
 if(!await askConfirm(t("loc.clear.ask"),t("loc.clear")))return;
 TRACKS=TRACKS.filter(x=>x.s!=="local");
 LOCAL_PATHS=[];
 save();renderLib();renderLocalInfo();renderWaveHint();
 toast(t("loc.cleared"))}
const empty=(ic,h,p)=>`<div class="empty"><i data-lucide="${ic}" width="26" height="26"></i><h3>${h}</h3><p>${p}</p></div>`;
/* Playlist artwork.

   A single stretched cover told you nothing about the playlist and looked
   arbitrary — whichever track happened to be first. A 2x2 mosaic of the first
   four distinct covers reads as "a collection" at a glance, which is what the
   tile is for. Fewer than four covers falls back to what exists rather than
   padding with blanks, and a hand-picked cover always wins.

   `--l1`/`--l2` keep the original gradient for playlists with no artwork at
   all, so an empty playlist still looks deliberate. */
function plCover(p,l1=52,l2=20){
 /* The gradient sits under the picture as a second background layer: if the
    URL ever fails to decode (offline, dead CDN), the tile still shows a
    deliberate colour instead of vanishing into the page. */
 if(p.cover){const u=cssUrl(p.cover);if(u)
  return `<span class="sq" style="--l1:${l1}%;--l2:${l2}%;background-image:url('${u}'),linear-gradient(150deg,oklch(var(--l1) 0 0),oklch(var(--l2) 0 0))"></span>`}
 /* Distinct covers only: an album added whole would otherwise produce four
    identical squares, which looks like a rendering bug. */
 const seen=new Set(),arts=[];
 for(const tr of p.tracks||[]){
  if(!tr.art||seen.has(tr.art))continue;
  const u=cssUrl(tr.art);if(!u)continue;
  seen.add(tr.art);arts.push(u);
  if(arts.length===4)break}
 if(!arts.length)return `<span class="sq" style="--l1:${l1}%;--l2:${l2}%"></span>`;
 if(arts.length<4)
  return `<span class="sq" style="--l1:${l1}%;--l2:${l2}%;background-image:url('${arts[0]}'),linear-gradient(150deg,oklch(var(--l1) 0 0),oklch(var(--l2) 0 0))"></span>`;
 return `<span class="sq mosaic">`+arts.map(a=>
  `<i style="background-image:url('${a}')"></i>`).join("")+`</span>`}

function renderLib(){
 const b=document.getElementById("libbody");
 /* All three tabs are built from live data. The demo playlists are gone: they
    were artwork with no tracks behind them and could never open. */
 /* An open artist page replaces the whole view. */
 if(artOpen&&S.tab==="art")return renderArtist(artOpen);
 if(S.tab==="pl"){
  /* An opened playlist replaces the grid. */
  if(plOpen){
   const pl=PLAYLISTS.find(p=>p.id===plOpen);
   if(pl){
    b.innerHTML=`<div class="plhead">
      <button class="btn" id="plback">← ${t("pl.back")}</button>
      <b>${esc(pl.name)}</b><span>${pl.tracks.length} ${t("tracks")}</span>
      ${pl.tracks.length?`<button class="btn" id="plplay">${t("pl.playall")}</button>`:""}
      ${pl.tracks.length?`<button class="btn" id="pldl">${t("pl.dl")}</button>`:""}
      <button class="btn danger" id="pldel">${t("pl.del")}</button></div>`
     +(pl.tracks.length
       ?`<div class="rows" data-listctx="pl:${esc(pl.id)}">`+pl.tracks.map(x=>row(x,"",false,pl.id)).join("")+`</div>`
       :empty("list-music",t("pl.empty.t"),t("pl.empty.s")));
    document.getElementById("plback").onclick=()=>{plOpen=null;renderLib()};
    document.getElementById("pldl")?.addEventListener("click",()=>downloadPlaylist(pl.id));
    document.getElementById("pldel")?.addEventListener("click",()=>deletePlaylist(pl.id));
    document.getElementById("plplay")?.addEventListener("click",()=>{
     pl.tracks.forEach(x=>{if(!TRACKS.some(y=>String(y.id)===String(x.id)&&y.s===x.s))TRACKS.push(x)});
     setTrack(pl.tracks[0],true,true,"pl:"+pl.id)});
    icons();return}
   plOpen=null}

  /* Real playlists first; the artist auto-groups stay below as a suggestion,
     since they cost nothing and fill an otherwise empty tab. */
  const fav=TRACKS.filter(x=>x.fav);
  const byArtist=new Map();
  fav.concat(HISTORY.map(h=>h.tr)).forEach(x=>{
   if(!x)return;
   const k=x.a||"—";
   if(!byArtist.has(k))byArtist.set(k,new Map());
   byArtist.get(k).set(x.s+":"+x.id,x)});
  const groups=[...byArtist.entries()].map(([a,m])=>({a,list:[...m.values()]}))
   .filter(g=>g.list.length>1).sort((x,y)=>y.list.length-x.list.length).slice(0,12);
  PL_GROUPS=groups;

  const mkBtn=`<button class="plc plnew" id="plnew"><span class="sq">
    <i data-lucide="plus" width="22" height="22"></i></span><b>${t("pl.new")}</b><span>${t("pl.new.s")}</span></button>`;
  const mine=PLAYLISTS.map(p=>
   `<button class="plc" data-plid="${esc(p.id)}">${plCover(p)}
    <b>${esc(p.name)}</b><span>${p.tracks.length} ${t("tracks")}</span></button>`).join("");
  b.innerHTML=`<div class="plgrid">${mkBtn}${mine}</div>`
   +(!PLAYLISTS.length&&!groups.length
     ?empty("list-music",t("pl.none.t"),t("pl.none.s"))
     :"")
   +(groups.length?`<p class="eyebrow" style="margin:22px 0 10px">${t("pl.auto")}</p>
     <div class="plgrid">`+groups.map((g,i)=>
     `<button class="plc" data-pl="${i}">${plCover({tracks:g.list},40+i*4,12+i*2)}
      <b>${esc(g.a)}</b><span>${g.list.length} ${t("tracks")}</span></button>`).join("")+`</div>`:"");
  document.getElementById("plnew").onclick=async()=>{
   const n=await askText(t("ctx.newpl.ask"));if(n)newPlaylist(n)}}
 else if(S.tab==="fav"){
  /* Newest first: the thing you just hearted is the thing you want to see. */
  const f=TRACKS.filter(x=>x.fav).sort((a,b)=>(b.favAt||0)-(a.favAt||0));
  b.innerHTML=f.length?`<div class="rows" data-listctx="fav">`+f.map(x=>row(x)).join("")+`</div>`:empty("heart",t("fav.none.t"),t("fav.none.s"))}
 /* Imported files had no view of their own: they only surfaced through search,
    so there was no way to see what was imported or to remove any of it. */
 else if(S.tab==="loc"){
  const loc=TRACKS.filter(x=>x.s==="local");
  b.innerHTML=`<div class="plhead">
    <b>${t("lib.loc")}</b><span>${loc.length} ${t("tracks")}</span>
    <button class="btn" id="loc-add">${t("loc.add")}</button>
    <button class="btn" id="loc-addf">${t("loc.addfolder")}</button>
    ${loc.length?`<button class="btn danger" id="loc-clear">${t("loc.clear")}</button>`:""}</div>`
   +(loc.length
     ?`<div class="rows" data-listctx="loc">`+loc.map(x=>row(x,null,true)).join("")+`</div>`
     :empty("folder",t("loc.none.t"),t("loc.none.s")));
  document.getElementById("loc-add").onclick=pickLocal;
  document.getElementById("loc-addf").onclick=pickLocalFolder;
  document.getElementById("loc-clear")?.addEventListener("click",clearLocal)}
 /* Artists, built from what is actually in the library. */
 else if(S.tab==="art"){
  const arts=artistList();
  b.innerHTML=arts.length
   ?`<div class="plgrid">`+arts.map(a=>`
     <button class="plc" data-artist="${esc(a.name)}">
      <span class="sq" ${coverStyle(a.art,"54%","22%")}></span>
      <b>${esc(a.name)}</b><span>${a.list.length} ${t("tracks")}${a.fav?" · ♥":""}</span></button>`).join("")+`</div>`
   :empty("user",t("art.none.t"),t("art.none.s"))}
 else b.innerHTML=HISTORY.length
  ?`<div class="rows" data-listctx="rec">`+HISTORY.map(h=>row(h.tr,ago(h.at))).join("")+`</div>`
  :empty("history",t("rec.none.t"),t("rec.none.s"));
 icons()}
/* opening an artist playlist */
let PL_GROUPS=[];
function openPl(i){
 const g=PL_GROUPS[i];if(!g)return;
 const b=document.getElementById("libbody");
 b.innerHTML=`<div class="plhead">
   <button class="btn" id="plback">← ${esc(g.a)}</button>
   <b>${esc(g.a)}</b><span>${g.list.length} ${t("tracks")}</span>
   <button class="btn" id="grpplay">${t("pl.playall")}</button></div>
  <div class="rows" data-listctx="grp:${i}">`+g.list.map(x=>row(x)).join("")+`</div>`;
 document.getElementById("plback").onclick=()=>renderLib();
 document.getElementById("grpplay").onclick=()=>setTrack(g.list[0],true,true,"grp:"+i);
 icons()}
let tok=0;
async function search(v,silent){
 const box=document.getElementById("sres"),cnt=document.getElementById("scount"),q=(v||"").trim().toLowerCase(),my=++tok;
 if(!q){cnt.textContent="";box.innerHTML=empty("search",t("s.idle.t"),t("s.idle.s"));icons();return}
 const act=SERVICES.filter(s=>s.conn&&s.on&&!s.local);
 cnt.textContent=act.length?`${t("s.ing")}: ${act.map(s=>svc(s.id).name).join(", ")}`:t("s.nosvc");
 box.innerHTML=act.map(s=>`<div class="pend" data-p="${s.id}"><span class="dots3"><i></i><i></i><i></i></span>${esc(svc(s.id).name)}</div>`).join("")
  +`<div class="rows" id="hits" data-listctx="search"></div>`;
 /* Local files resolve instantly, so show them before the network answers. */
 const localHits=SERVICES.find(s=>s.id==="local")?.on
  ?TRACKS.filter(x=>x.s==="local"&&(x.t+" "+x.a+" "+x.al).toLowerCase().includes(q))
  :[];
 const list0=box.querySelector("#hits");
 if(list0&&localHits.length)list0.insertAdjacentHTML("beforeend",localHits.map(x=>row(x)).join(""));
 /* The visible order is the play order for the "search" context. */
 SEARCH_HITS=localHits.slice();

 /* Debounced here rather than in searchRemote(): this is the only caller that
    fires per keystroke. */
 await new Promise(r=>setTimeout(r,180));
 if(my!==tok)return;
 const remote=await searchRemote(q);
 if(my!==tok)return;

 /* Render whatever actually arrived instead of walking the active-service
    list: results from a service missing from act were silently dropped,
    which is why search sometimes looked empty despite a good response. */
 const fresh=[];
 remote.forEach(x=>{
  const known=TRACKS.find(y=>String(y.id)===String(x.id)&&y.s===x.s);
  if(known){Object.assign(known,{...x,fav:known.fav});fresh.push(known)}
  else{TRACKS.push(x);fresh.push(x)}});

 box.querySelectorAll(".pend").forEach(p=>p.remove());
 const list=box.querySelector("#hits");
 if(list&&fresh.length)list.insertAdjacentHTML("beforeend",fresh.map(x=>row(x)).join(""));
 SEARCH_HITS=[...localHits,...fresh];

 const found=fresh.length+localHits.length;
 cnt.textContent=`${t("s.found")}: ${found}`;
 if(!found)box.innerHTML=empty("circle-slash",t("s.none.t"),t("s.none.s"));
 icons()}
/* The bar is built once and then updated field by field.

   Rewriting #np's innerHTML was the flicker: every renderNP() threw away the
   artwork element, so the browser refetched and repainted the cover, and
   lucide.createIcons() rebuilt the heart svg from scratch. renderNP() runs on
   metadata, on quality changes, on favourites and on every language switch, so
   that teardown happened constantly while nothing had visibly changed. Now the
   nodes are created once and only their text, background and pressed state are
   touched — an unchanged value writes nothing at all. */
let NPB=null;
function npBuild(){
 const host=document.getElementById("np");
 if(NPB&&NPB.host===host&&host.contains(NPB.art))return NPB;
 host.innerHTML=`<span class="art"></span>
  <span class="meta"><b></b><span></span></span>
  <span class="npacts">
   <button class="heart" data-fav="" data-svc="" aria-pressed="false" aria-label="fav" style="opacity:1"><i data-lucide="heart" width="15" height="15"></i></button>
   <button class="ic npic" id="npadd" aria-label="playlist" title=""><i data-lucide="list-plus" width="16" height="16"></i></button>
   <button class="ic npic npdis" id="npdislike" aria-label="dislike" title=""><i data-lucide="thumbs-down" width="16" height="16"></i></button>
  </span>`;
 NPB={host,art:host.querySelector(".art"),ttl:host.querySelector(".meta b"),
  sub:host.querySelector(".meta span"),heart:host.querySelector(".heart"),
  acts:host.querySelector(".npacts"),add:host.querySelector("#npadd"),dis:host.querySelector("#npdislike"),
  lastArt:null,lastTtl:null,lastSub:null};
 icons();
 return NPB}

function renderNP(){
 const tr=S.current,b=npBuild(),dur=document.getElementById("tdur");
 const empty=!tr||tr.mode==="empty";

 /* Titles and hints are the only thing a language switch changes, and they are
    plain text writes — no node is replaced, so no icon is rebuilt. */
 b.add.title=t("np.addto");b.dis.title=t("np.dislike");
 b.acts.hidden=empty;

 const ttl=empty?t("np.none"):(tr.t||"");
 const sub=empty?t("np.none.s")
  :`${tr.a||""} · ${svc(tr.s).name}${S.quality==="lossless"&&svc(tr.s).lossless?" · lossless":""}`;
 /* A real track change animates; a re-render caused by a favourite toggle or a
    language switch must not, or the bar would twitch constantly. The title is
    the signal, since that is the part the user reads. */
 const swapped=b.lastTtl!==null&&b.lastTtl!==ttl;
 if(b.lastTtl!==ttl){b.ttl.textContent=ttl;b.lastTtl=ttl}
 if(b.lastSub!==sub){b.sub.textContent=sub;b.lastSub=sub}
 if(swapped){
  b.host.removeAttribute("data-swap");void b.host.offsetWidth;b.host.dataset.swap="1"}

 /* An identical background-image assignment still counts as a style change in
    some webviews, so the current value is remembered rather than re-read. */
 const artKey=empty?"":(tr.art||`l:${tr.l1||"54%"}/${tr.l2||"22%"}`);
 if(b.lastArt!==artKey){
  b.art.hidden=empty;
  /* Assigned through the style property, so there is no HTML parsing step —
     but the url() still has to be closed safely, hence cssUrlRaw. */
  const u=empty?"":cssUrlRaw(tr?.art);
  if(u){b.art.style.backgroundImage=`url('${u}')`;b.art.style.removeProperty("--l1");b.art.style.removeProperty("--l2")}
  else{b.art.style.removeProperty("background-image");b.art.style.setProperty("--l1",tr?.l1||"54%");b.art.style.setProperty("--l2",tr?.l2||"22%")}
  b.lastArt=artKey}

 if(!empty){
  b.heart.dataset.fav=String(tr.id);b.heart.dataset.svc=tr.s;
  b.heart.setAttribute("aria-pressed",String(!!tr.fav));
  b.dis.setAttribute("aria-pressed",String(isDisliked(tr)))}

 dur.textContent=empty?"0:00":fmt(S.dur)}
function paint(){
 const p=S.dur>0?Math.min(1,S.pos/S.dur)*100:0;
 const f=document.querySelector("#btrack .f");if(f){f.style.width=p+"%";document.querySelector("#btrack .h").style.left=p+"%"}
 document.getElementById("tcur").textContent=fmt(S.pos);
 const ff=document.querySelector("#fptrack .f");
 if(ff){ff.style.width=p+"%";document.querySelector("#fptrack .h").style.left=p+"%";document.getElementById("fpcur").textContent=fmt(S.pos)}
 if(S.fpTab==="lyrics")syncLyrics()}
let queue=[];
/* Track key the full player last drew, so a re-render caused by a seek, a
   favourite toggle or a language switch does not replay the cover animation —
   only an actual change of song does. */
let fpLastKey=null;
function renderFP(){
 const tr=S.current,pc=S.dur>0?S.pos/S.dur*100:0;
 const key=trackKey(tr);
 const swapped=fpLastKey!==null&&fpLastKey!==key;
 fpLastKey=key;
 document.getElementById("fpc").innerHTML=`
  <button class="ic close" id="fpclose" aria-label="close"><i data-lucide="x" width="17" height="17"></i></button>
  <div class="cover" ${coverStyle(tr.art,tr.l1,tr.l2)}><canvas class="vis" id="vis"></canvas></div>
  <div class="fpr">
   <div class="eyebrow">${t("now")} · ${svc(tr.s).name}${svc(tr.s).lossless&&S.quality==="lossless"?" · lossless":""}</div>
   <h2>${esc(tr.t)}</h2><p class="by">${esc(tr.a)} · ${esc(tr.al)}</p>
   <div class="fpctrls">
    <button class="ic" data-act="shuffle" aria-pressed="${S.shuffle}"><i data-lucide="shuffle" width="17" height="17"></i></button>
    <button class="ic" data-act="prev"><i data-lucide="skip-back" width="20" height="20"></i></button>
    <button class="play" data-act="play"><i data-lucide="${S.playing?"pause":"play"}" width="20" height="20"></i></button>
    <button class="ic" data-act="next"><i data-lucide="skip-forward" width="20" height="20"></i></button>
    <button class="ic" data-act="repeat" aria-pressed="${S.repeat}"><i data-lucide="repeat" width="17" height="17"></i></button>
    <button class="heart" data-fav="${esc(tr.id)}" data-svc="${esc(tr.s)}" aria-pressed="${!!tr.fav}" style="opacity:1;margin-left:4px"><i data-lucide="heart" width="17" height="17"></i></button>
   </div>
   <div class="fpseek"><span class="t" id="fpcur" style="font-size:.72rem;color:var(--mute)">${fmt(S.pos)}</span>
    <div class="track" id="fptrack"><div class="f" style="width:${pc}%"></div><div class="h" style="left:${pc}%"></div></div>
    <span class="t" style="font-size:.72rem;color:var(--mute)">${fmt(S.dur)}</span></div>
   <div class="fpswitch" role="tablist">
    <button role="tab" data-fptab="queue" aria-selected="${S.fpTab==="queue"}">${t("queue")}</button>
    <button role="tab" data-fptab="lyrics" aria-selected="${S.fpTab==="lyrics"}">${t("lyrics")}</button>
   </div>
   <div class="fpbody" id="fpbody"></div>
  </div>`;
 renderFPBody();
 wireSeek("fptrack");
 /* innerHTML above replaced the panel, so the attribute lands on fresh nodes
    and the animation runs from its first frame without needing a reflow. */
  const c=document.getElementById("fpc");
  if(swapped)c.dataset.swap="1";else c.removeAttribute("data-swap");
  c.dataset.playing=S.playing?"true":"false";
 vis.c=document.getElementById("vis");
 if(vis.c){const r=vis.c.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);
  vis.c.width=r.width*d;vis.c.height=r.height*d;vis.g=vis.c.getContext("2d")}
 icons()}
/* Restarts the panel animation. Removing the attribute and reading offsetWidth
   forces the browser to drop the finished animation before it is reapplied;
   without the reflow the second identical assignment is a no-op and the second
   tab switch would not animate at all. */
const FPTABS=["queue","lyrics"];
let fpLastTab=null;
function animFPBody(el){
 const i=FPTABS.indexOf(S.fpTab),j=FPTABS.indexOf(fpLastTab);
 el.dataset.dir=(j>-1&&i<j)?"back":"fwd";
 fpLastTab=S.fpTab;
 el.removeAttribute("data-anim");void el.offsetWidth;el.dataset.anim="in"}

function renderFPBody(anim){
 const el=document.getElementById("fpbody");if(!el)return;
 if(anim)animFPBody(el);
 if(S.fpTab==="queue"){
  if(!queue.length){el.innerHTML=`<p class="hollow">${t("q.none")}</p>`;return}
  /* Where the queue came from, and a way to empty it. Without this the panel
     was a list with no explanation of why those tracks and not others. */
  el.innerHTML=`<div class="qhead"><span>${t("q.from")}: <b>${esc(ctxName(PLAYCTX.key))}</b></span>
    <button class="btn sm" id="qclr">${t("q.clear")}</button></div>`
   +`<div class="qlist" data-listctx="queue">`
   +queue.map((x,i)=>`<div class="q" data-track="${esc(x.id)}" data-svc="${esc(x.s)}" style="--i:${Math.min(i,12)}">
     <i class="n">${String(i+1).padStart(2,"0")}</i>
     <b>${esc(x.t)}</b><em>${esc(x.a)}</em>
     <button class="qrm" data-qrm="${esc(x.id)}" data-qsvc="${esc(x.s)}" aria-label="${esc(t("q.rm"))}" title="${esc(t("q.rm"))}"><i data-lucide="x" width="13" height="13"></i></button>
    </div>`).join("")
   +`</div>`;
  document.getElementById("qclr").onclick=()=>{queue=[];renderFPBody()};
  icons();
  return}
 renderLyrics()}

/* ─────────────────────────── lyrics ───────────────────────────

   Three sources, tried in order and cached per track for the session:
     1. LRCLIB — free, no key, and the only one of the three with per-line
        timings, so it is preferred even for YouTube tracks.
     2. YouTube Music's own lyrics tab — always correct, never timed.
     3. Whisper, in the browser, on the audio already being played — for
        SoundCloud rips and local files that neither database knows.

   The view is the same in all three cases; only the header line and whether
   lines highlight in time differ. */
const LYRICS=new Map();          /* trackKey -> {state,source,synced,lines} */
let lyReq=0;                     /* rejects results from a previous track */

function lyricsFor(tr){return tr?LYRICS.get(trackKey(tr)):null}

function renderLyrics(){
 const el=document.getElementById("fpbody");if(!el)return;
 const tr=S.current;
 const L=lyricsFor(tr);
 /* Nothing is playing yet: the placeholder track has no artist and no id, so a
    lookup would only spin "Looking for lyrics…" forever. */
 if(!tr||tr.mode==="empty"){el.innerHTML=`<p class="hollow">${t("q.none")}</p>`;return}

 if(!L||L.state==="idle"){el.innerHTML=`<p class="hollow">${t("ly.load")}</p>`;fetchLyrics(tr);return}
 if(L.state==="loading"){el.innerHTML=`<p class="hollow">${t("ly.load")}</p>`;return}
 if(L.state==="transcribing"){
  el.innerHTML=`<p class="hollow">${t("ly.gen")}<br><small id="lyprog" class="lypulse" style="opacity:.6">${L.progress||""}</small><br><small style="opacity:.45">${t("ly.slow")}</small></p>`;return}
 if(L.state==="error"){
  el.innerHTML=`<p class="hollow">${t("ly.err")}<br><button class="btn sm" id="lyretry" style="margin-top:10px">${t("ly.retry")}</button></p>`;
  document.getElementById("lyretry").onclick=()=>{LYRICS.delete(trackKey(tr));renderLyrics()};
  return}
 if(!L.lines?.length){
  el.innerHTML=`<p class="hollow">${t("ly.none")}<br><button class="btn sm" id="lygen" style="margin-top:10px">${t("ly.gen")}</button></p>`;
  const g=document.getElementById("lygen");
  if(g)g.onclick=()=>transcribeLyrics(tr);
  return}

 const badge=L.source==="ytm"?t("ly.src.ytm"):L.source==="ai"?t("ly.src.ai"):t("ly.src.lrc");
 el.innerHTML=`<div class="lyr" id="lyr" data-synced="${!!L.synced}">`
  +`<div class="lysrc">${esc(badge)}${L.synced?" · "+t("ly.seek"):" · "+t("ly.plain")}</div>`
  /* Timed lines are seek targets: clicking one jumps there, which is what makes
     lyrics usable for finding a part of a song rather than just reading. */
  +L.lines.map((l,i)=>`<p data-i="${i}"${L.synced&&l.at!=null?` data-at="${l.at}" tabindex="0" role="button"`:""}>${esc(l.text)||"&nbsp;"}</p>`).join("")
  +`</div>`;
 lyLast=-1;
 syncLyrics(true)}

/* Click or Enter on a timed line seeks to it. */
function lySeekFrom(el){
 const at=parseFloat(el?.dataset.at||"");
 if(!isFinite(at))return;
 seekSeconds(at);
 /* The highlight would otherwise wait for the next tick. */
 lyUserScroll=0;syncLyrics(true)}
document.addEventListener("click",e=>{
 const p=e.target.closest?.("#lyr p[data-at]");
 if(p)lySeekFrom(p)});
document.addEventListener("keydown",e=>{
 if(e.key!=="Enter"&&e.key!==" ")return;
 const p=e.target.closest?.("#lyr p[data-at]");
 if(p){e.preventDefault();lySeekFrom(p)}});

async function fetchLyrics(tr){
 if(!tr||tr.mode==="empty")return;
 const key=trackKey(tr),my=++lyReq;
 LYRICS.set(key,{state:"loading"});
 renderLyrics();
 try{
  const res=TAURI?await inv("lyrics_get",{
   service:tr.s||"",id:String(tr.id||""),artist:tr.a||"",title:tr.t||"",
   album:tr.al||"",duration:Math.round(tr.d||S.dur||0)}):null;
  if(my!==lyReq)return;
  const lines=(res?.lines||[]).filter(l=>l.text!==undefined);
  LYRICS.set(key,{state:"done",source:res?.source||"none",synced:!!res?.synced,lines});
 }catch(e){
  console.warn("lyrics:",e);
  if(my!==lyReq)return;
  LYRICS.set(key,{state:"error"})}
 if(S.fpTab==="lyrics"&&sameTrack(tr,S.current))renderLyrics()}

/* Highlight follows the clock. Only the changed lines are touched — rewriting
   every <p> on each tick restarted the CSS transitions, which is what made a
   scrolling lyric look like it was flickering rather than gliding. */
let lyLast=-1;
function syncLyrics(force){
 const L=lyricsFor(S.current),box=document.getElementById("lyr");
 if(!L?.lines?.length||!box)return;
 if(!L.synced){if(force)lyLast=-1;return}

 /* The rate control retimes the audio, but the timestamps describe the track
    at 1x. S.pos is already the element's own clock, so nothing to correct. */
 let idx=-1;
 for(let i=0;i<L.lines.length;i++){
  const at=L.lines[i].at;
  if(at==null)continue;
  if(S.pos+.15>=at)idx=i;else break}
 if(idx===lyLast&&!force)return;
 lyLast=idx;

 const kids=box.querySelectorAll("p");
 kids.forEach((p,i)=>{
  const on=i===idx;
  if((p.dataset.on==="true")!==on)p.dataset.on=on;
  /* Neighbours fade in as the line approaches instead of every line sitting at
     the same dead grey. */
  const near=Math.abs(i-idx);
  const step=near===0?"0":near<=2?String(near):"far";
  if(p.dataset.near!==step)p.dataset.near=step});

 /* Autoscroll is suspended while the user is doing something in the panel:
    selecting a line, or having scrolled it by hand. Otherwise the next tick
    yanks the view away mid-selection. */
 const sc=box.parentElement;
 if(!sc)return;
 if(!force&&(lySelecting(box)||performance.now()-lyUserScroll<4000))return;

 /* Position measured from the rects, not offsetTop: offsetTop is relative to
    the nearest *positioned* ancestor, which is not the scroller, so the value
    could exceed the content height and slam the panel to the bottom. That is
    the "jumps to the very end" bug. */
 const cur=kids[idx];
 if(cur){
  const delta=cur.getBoundingClientRect().top-sc.getBoundingClientRect().top;
  const want=sc.scrollTop+delta-sc.clientHeight/2+cur.offsetHeight/2;
  const to=Math.max(0,Math.min(want,sc.scrollHeight-sc.clientHeight));
  if(Math.abs(sc.scrollTop-to)>2)sc.scrollTo({top:to,behavior:force?"auto":"smooth"})}}

/* True while a selection covers part of the lyrics. */
function lySelecting(box){
 const sel=getSelection?.();
 if(!sel||sel.isCollapsed||!sel.rangeCount)return false;
 return box.contains(sel.getRangeAt(0).commonAncestorContainer)}

/* Manual scrolling wins for a few seconds. `scrollTo` fires this too, so our
   own programmatic scrolls are ignored via a flag. */
let lyUserScroll=0;
document.addEventListener("pointerdown",e=>{
 if(e.target.closest?.("#lyr"))lyUserScroll=performance.now()},true);
document.addEventListener("wheel",e=>{
 if(e.target.closest?.(".fpbody"))lyUserScroll=performance.now()},{passive:true,capture:true});

/* AI transcription — the last resort, for SoundCloud rips and local files no
   lyrics database has ever seen.

   Whisper runs *in the app*, via transformers.js: WebGPU when the machine has
   it, WASM otherwise. That choice is deliberate — it is free with no key and no
   account, nothing about the user's library leaves the machine, and there is no
   third-party service to go down or start charging. The tiny multilingual model
   is ~40 MB, cached by the webview after the first run.

   Whisper returns chunk timestamps, so the result is synced like LRCLIB's, not
   a flat wall of text. */
let WHISPER=null,WHISPER_ID=null;

/* Model choice follows the hardware, because it decides whether this takes one
   minute or fifteen.
     WebGPU  -> whisper-base, fp32. Roughly 3× the parameters of tiny and a
                markedly lower word error rate, especially on sung vocals, which
                is the hardest case here and the one tiny mangles.
     WASM    -> whisper-tiny, q8. base on CPU is slower than real time on a
                laptop, which is worse than a slightly wrong transcript.
   Both are multilingual. `--turbo` and the distil models are English-only or
   too large for a first-run download. */
function whisperModel(){
 return navigator.gpu
  ?{id:"onnx-community/whisper-base",dtype:"fp32",device:"webgpu"}
  :{id:"onnx-community/whisper-tiny",dtype:"q8",device:"wasm"}}

async function whisperPipe(onProgress){
 const want=whisperModel();
 if(WHISPER&&WHISPER_ID===want.id)return WHISPER;
 const {pipeline,env}=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm");
 /* Only the CDN's own model files; nothing is uploaded. */
 env.allowLocalModels=false;
 try{
  WHISPER=await pipeline("automatic-speech-recognition",want.id,{
   dtype:want.dtype,
   device:want.device,
   progress_callback:p=>{if(p?.status==="progress"&&onProgress)onProgress(Math.round(p.progress||0)+"%")}});
  WHISPER_ID=want.id;
 }catch(e){
  /* A WebGPU adapter can exist and still fail to allocate, and the base model
     is the larger download. Falling back beats reporting "transcription
     failed" on a machine that can do it slowly. */
  console.warn("whisper",want.id,"failed, falling back:",e);
  WHISPER=await pipeline("automatic-speech-recognition","onnx-community/whisper-tiny",{
   dtype:"q8",device:"wasm",
   progress_callback:p=>{if(p?.status==="progress"&&onProgress)onProgress(Math.round(p.progress||0)+"%")}});
  WHISPER_ID="onnx-community/whisper-tiny"}
 return WHISPER}

/* Decodes the track to the 16 kHz mono Float32 Whisper expects. The audio comes
   from the local proxy, so this is a same-origin fetch of bytes already on the
   machine or already in the proxy's cache. */
async function trackPcm(tr){
 const url=streamUrl(tr)||tr.url;
 if(!url)throw new Error("no stream url");
 const buf=await (await fetch(url)).arrayBuffer();
 const OfflineCtx=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 /* A throwaway context purely for decoding; the playback graph is untouched. */
 const tmp=new (window.AudioContext||window.webkitAudioContext)();
 let decoded;
 try{decoded=await tmp.decodeAudioData(buf)}finally{tmp.close()}
 const off=new OfflineCtx(1,Math.ceil(decoded.duration*16000),16000);
 const src=off.createBufferSource();src.buffer=decoded;src.connect(off.destination);src.start();
 const out=await off.startRendering();
 return out.getChannelData(0)}

async function transcribeLyrics(tr){
 const key=trackKey(tr),my=++lyReq;
 const startedAt=Date.now();
 const setProgress=p=>{
  const cur=LYRICS.get(key);
  if(cur){cur.progress=p;LYRICS.set(key,cur)}
  const el=document.getElementById("lyprog");
  if(el)el.textContent=p};
 /* Inference on a 3-minute track takes minutes, and a static "listening…"
   line reads as "broken". An elapsed clock keeps the wait honest. */
 const ticker=setInterval(()=>{
  const cur=LYRICS.get(key);
  if(!cur||cur.state!=="transcribing"){clearInterval(ticker);return}
  const s=Math.floor((Date.now()-startedAt)/1000);
  const el=document.getElementById("lyprog");
  if(el)el.textContent=(cur.progress||"")+" · "+Math.floor(s/60)+":"+String(s%60).padStart(2,"0")},1000);
 LYRICS.set(key,{state:"transcribing",progress:t("ly.listen")});
 renderLyrics();
 try{
  const pipe=await whisperPipe(setProgress);
  if(my!==lyReq)return;
  setProgress(t("ly.decode"));
  const pcm=await trackPcm(tr);
  if(my!==lyReq)return;
  setProgress(t("ly.listen"));
  /* transformers.js transcribes in English unless told otherwise, so Russian
     songs came back transliterated. The script of the title/artist is the
     cheapest reliable hint at the song's language. */
  const hasCyr=/[а-яё]/i.test(`${tr.t||""} ${tr.a||""}`);
  const res=await pipe(pcm,{
   return_timestamps:true,
   chunk_length_s:30,
   stride_length_s:5,
   /* Whisper otherwise guesses the language per 30-second chunk and can switch
      mid-song, which produces transliterated nonsense. One detection for the
      whole track is both faster and more consistent. */
   language:hasCyr?"ru":"en",
   task:"transcribe",
   /* Sung vocals make the greedy decoder loop on a phrase. A small beam and the
      repetition penalty are what stop "oh oh oh oh" filling the whole panel. */
   num_beams:navigator.gpu?3:1,
   no_repeat_ngram_size:4,
   temperature:0});
  if(my!==lyReq)return;
  const lines=(res?.chunks||[])
   .map(c=>({at:Array.isArray(c.timestamp)?c.timestamp[0]:null,text:String(c.text||"").trim()}))
   .filter(l=>l.text);
  LYRICS.set(key,lines.length
   ?{state:"done",source:"ai",synced:lines.every(l=>l.at!=null),lines:mergeAiLines(lines)}
   :{state:"done",source:"none",synced:false,lines:[]});
 }catch(e){
  console.warn("transcribe:",e);
  if(my!==lyReq)return;
  LYRICS.set(key,{state:"error"})}
 if(sameTrack(tr,S.current)&&S.fpTab==="lyrics")renderLyrics()}

/* Whisper splits on pauses, so a sung line arrives as three fragments and the
   panel reads like a stutter. Fragments that start within a couple of seconds of
   each other and do not end a sentence are joined into one line. */
function mergeAiLines(lines){
 const out=[];
 for(const l of lines){
  const prev=out[out.length-1];
  const short=l.text.length<24&&!/[.!?…]$/.test(l.text);
  const close=prev&&l.at!=null&&prev.at!=null&&l.at-prev.at<2.2;
  if(prev&&close&&short&&prev.text.length<70){
   prev.text=(prev.text+" "+l.text).replace(/\s+/g," ").trim();
   continue}
  out.push({...l})}
 return out}
function renderBands(){
 const bands=document.getElementById("bands");
 if(!bands)return;
 bands.innerHTML=FREQ.map((f,i)=>`
  <div class="band"><output id="ev${i}">${S.eq[i]>0?"+":""}${S.eq[i].toFixed(1)}</output>
  <div class="vt" data-b="${i}" tabindex="0" role="slider" aria-valuemin="-12" aria-valuemax="12" aria-valuenow="${S.eq[i]}" aria-label="${FLAB[i]} Hz">
   <span class="z"></span><span class="f"></span><span class="kn"></span></div><label>${FLAB[i]}</label></div>`).join("");
 FREQ.forEach((_,i)=>paintBand(i))}
function paintBand(i){
 const vt=document.querySelector(`.vt[data-b="${i}"]`);if(!vt)return;
 const H=76,mid=H/2,y=mid-(S.eq[i]/12)*mid,f=vt.querySelector(".f"),kn=vt.querySelector(".kn");
 f.style.top=Math.min(mid,y)+"px";f.style.height=Math.abs(mid-y)+"px";kn.style.top=(y-5.5)+"px";
 vt.setAttribute("aria-valuenow",S.eq[i].toFixed(1));
 document.getElementById("ev"+i).textContent=(S.eq[i]>0?"+":"")+S.eq[i].toFixed(1)}
const allP=()=>[...PRESETS,...S.custom];
function renderPresets(){
 document.getElementById("presets").innerHTML=allP().map(p=>
  `<button class="pchip" data-p="${esc(p.id)}" aria-pressed="${S.preset===p.id}">${esc(p.n[LANG]||p.n.ru||p.n)}</button>`).join("")}
function setBand(i,v){S.eq[i]=Math.max(-12,Math.min(12,v));paintBand(i);applyEQ();
 const m=allP().find(p=>p.g.every((g,j)=>Math.abs(g-S.eq[j])<.05));S.preset=m?m.id:null;renderPresets();save()}

/* playback */
/* ctx: which list this play came from — see PLAYCTX. Passing it here rather
   than setting a global first keeps "what plays next" decided in one place. */
async function setTrack(tr,play=true,openFull=false,ctx,keepQueue){
 if(!tr)return;
 if(ctx!==undefined)setContext(ctx);
 if(tr.mode==="local")await ensureStreamPort();
 S.current=tr;S.dur=tr.d||0;S.pos=0;
 /* Per-track equaliser: if this track has a preset pinned to it, apply it.
    Set from the context menu; a track without one keeps whatever is active,
    rather than being reset to flat behind the user's back. */
 applyTrackPreset(tr);
 /* Lyrics belong to the previous song until the new ones arrive; dropping the
    highlight index here stops the first tick of the new track lighting up a
    line left over from the old one. */
 lyLast=-1;
 /* The queue is a schedule, and a schedule has to survive the tracks it
    schedules. An unconditional rebuild here refilled it from the pool on every
    single advance, so it never ran out and next() never once reached its
    end-of-list logic: stopAtEnd(), waveExtend() and roomAdvance() were all
    dead code and a finished list wrapped forever with repeat off (the
    "queue is stuck in a loop" report). So the schedule is rebuilt when a list
    is entered and kept when one is merely being walked through — next() and
    the queue-panel jump pass `keepQueue`. */
 if(!keepQueue)buildQueue(tr);
 /* A room's schedule is server-side and is consumed as it plays: the row for
    the track that just started leaves the queue, so what the panel lists is
    only what has not played yet. Without this the DJ's local snapshot and the
    server rows drift apart and roomAdvance() hands out tracks that already
    went by. Listeners never consume — roomConsume() checks the role. */
 if(String(PLAYCTX.key||"").startsWith("room:"))roomConsume(S.current);
 load(tr,play);S.playing=play;sync();renderNP();paint();
 /* The cover drives the accent colour when adaptive mode is on. */
 adaptAccent(tr);
 pushHistory(tr);noteTrackStart(tr);
 document.querySelectorAll(".row").forEach(r=>r.dataset.playing=
  (String(r.dataset.track)===String(tr.id)&&r.dataset.svc===tr.s));
 if(openFull)openFP();else if(fp.dataset.open==="true")renderFP()}
function toggle(){
 initAudio();
 if(S.current?.mode==="empty")return go("search");
 if(A.audio&&S.current?.mode==="local"){
  if(S.playing){A.audio.pause();S.playing=false}
  else {
   A.ctx.resume();
   /* After an error the src can be empty; reload rather than fail silently. */
   if(!A.audio.src)load(S.current,true);
   else A.audio.play().catch(e=>{console.warn(e);load(S.current,true)});
   S.playing=true}
 }else if(!A.started&&A.ctx){load(S.current,true);S.playing=true}
 else if(A.ctx){S.playing?A.ctx.suspend():A.ctx.resume();S.playing=!S.playing}
 else S.playing=!S.playing;
 sync()}
const sameTrack=(a,b)=>!!a&&!!b&&String(a.id)===String(b.id)&&a.s===b.s;

/* The queue is now what actually plays next.

   Before, `queue` was a display-only slice of TRACKS while next() walked TRACKS
   in its own order with its own shuffle roll — so the list shown in the player
   and the track that followed were unrelated. That is the "queue does not match
   reality" report. One array is now built here and next() pops from it, so the
   panel is the schedule rather than a decoration. */
function playablePool(){
 /* Enabled services first; if that leaves nothing (every service toggled off,
    but the library still holds tracks) fall back to everything playable, so the
    player does not simply stop. Computed once — this runs on every next(). */
 const playable=TRACKS.filter(x=>x.mode!=="empty"&&!isDisliked(x));
 const enabled=playable.filter(x=>svc(x.s).on);
 return enabled.length?enabled:playable}

/* ───────────────────── playback context ─────────────────────

   Starting a track from Favorites has to continue through Favorites, not
   through the whole library. Every list in the app therefore declares what it
   is via data-listctx on its container, the click handler reads it, and the
   queue is built from that list instead of from TRACKS.

   The list is resolved by key on every use rather than captured once: a
   playlist can gain tracks, a favorite can be un-hearted, and a stale snapshot
   would keep playing what is no longer there. */
let PLAYCTX={key:"all"};
let SEARCH_HITS=[];

function listFor(key){
 const k=String(key||"all");
 if(k==="fav")return TRACKS.filter(x=>x.fav).sort((a,b)=>(b.favAt||0)-(a.favAt||0));
 if(k==="loc")return TRACKS.filter(x=>x.s==="local");
 if(k==="rec")return HISTORY.map(h=>h.tr).filter(Boolean);
 if(k==="search")return SEARCH_HITS.slice();
 if(k==="wave")return WAVE.slice();
 if(k.startsWith("pl:"))return (PLAYLISTS.find(p=>p.id===k.slice(3))?.tracks||[]).slice();
 if(k.startsWith("art:"))return (artistList().find(a=>a.name===k.slice(4))?.list||[]).slice();
 if(k.startsWith("grp:"))return (PL_GROUPS[+k.slice(4)]?.list||[]).slice();
 /* A room's line-up lives server-side, not in a local array like the rest. */
 if(k.startsWith("room:"))return (SOC.roomQueue||[]).map(r=>r.track).slice();
 return null}

/* Shown in the queue panel: "playing from Favorites". */
function ctxName(key){
 const k=String(key||"all");
 if(k==="fav")return t("lib.fav");
 if(k==="loc")return t("lib.loc");
 if(k==="rec")return t("lib.rec");
 if(k==="search")return t("nav.search");
 if(k==="wave")return t("nav.home");
 if(k.startsWith("pl:"))return PLAYLISTS.find(p=>p.id===k.slice(3))?.name||t("lib.pl");
 if(k.startsWith("art:"))return k.slice(4);
 if(k.startsWith("grp:"))return PL_GROUPS[+k.slice(4)]?.a||t("lib.art");
 return t("ctx.all")}

/* The pool the queue is built from: the context when it still holds something
   playable, the whole library otherwise. */
function contextPool(){
 const list=listFor(PLAYCTX.key);
 if(!list)return playablePool();
 const playable=list.filter(x=>x&&x.mode!=="empty"&&!isDisliked(x));
 const enabled=playable.filter(x=>svc(x.s).on);
 const pool=enabled.length?enabled:playable;
 /* A context that has emptied out (everything un-hearted, playlist deleted)
    must not strand the player on one track. */
 return pool.length?pool:playablePool()}

function setContext(key){
 const next=key||"all";
 if(PLAYCTX.key===next)return;
 PLAYCTX={key:next}}

function buildQueue(cur){
 const pool=contextPool();
 if(S.shuffle){
  const l=pool.filter(x=>!sameTrack(x,cur));
  /* Fisher-Yates, so a shuffled queue is a real order the user can read ahead
     of rather than a fresh random pick at every track end. */
  for(let i=l.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[l[i],l[j]]=[l[j],l[i]]}
  queue=l}
 else{
  const i=pool.findIndex(x=>sameTrack(x,cur));
  /* Everything that follows the chosen track and nothing before it: the queue
     has to be able to run out, because next() decides what happens when it
     does (extend the wave, take the room's next row, or stop with repeat
     off). Wrapping here refilled it on every advance, so it never drained and
     all of those decisions were unreachable — the reported "a finished list
     plays forever with repeat off". A track that is not in the pool at all
     (playing from history after a restart) schedules the whole pool. */
  const after=i<0?pool:pool.slice(i+1);
  queue=after.filter(x=>!sameTrack(x,cur))}
 /* No slice(0,20): the queue *is* the schedule now, and a truncated one made
    the panel disagree with what actually played after track 20. */
 if(fp.dataset.open==="true"&&S.fpTab==="queue")renderFPBody()}

/* Puts a track next in line without changing what is playing. */
function queueNext(tr){
 if(!tr)return;
 queue=queue.filter(x=>!sameTrack(x,tr));
 queue.unshift(tr);
 toast(t("q.next.ok").replace("{n}",tr.t||""));
 if(fp.dataset.open==="true"&&S.fpTab==="queue")renderFPBody()}

/* Appends to the end of the queue. */
function queueLast(tr){
 if(!tr)return;
 queue=queue.filter(x=>!sameTrack(x,tr));
 queue.push(tr);
 toast(t("q.last.ok").replace("{n}",tr.t||""));
 if(fp.dataset.open==="true"&&S.fpTab==="queue")renderFPBody()}

function queueRemove(id,s){
 queue=queue.filter(x=>!(String(x.id)===String(id)&&x.s===s));
 if(fp.dataset.open==="true"&&S.fpTab==="queue")renderFPBody()}

function next(){
 if(S.repeat&&A.audio&&S.current?.mode==="local"){A.audio.currentTime=0;A.audio.play().catch(console.warn);return}
 /* Take the head of the visible queue — that is the promise the panel made. */
 let nx=null;
 while(queue.length&&!nx){
  const c=queue.shift();
  if(c&&!isDisliked(c)&&c.mode!=="empty")nx=c}
 if(!nx){
  const l=contextPool().filter(x=>!sameTrack(x,S.current));
  /* The queue is drained; what follows decides what "the end" means. */
  if(String(PLAYCTX.key||"").startsWith("room:")){
   /* A room listener decides nothing: the host's row is the clock and
      paintRoomPlayback() follows it on its own tick. */
   if(!(SOC.roomRole==="owner"||SOC.roomRole==="dj"))return;
   roomAdvance()
    .then(advanced=>{if(!advanced)stopAtEnd()})
    .catch(e=>{console.warn("room advance:",e);toast(String(e.message||e))});
   return}
  /* The wave is radio, not a playlist: when its queue runs out, pull fresh
     search results instead of replaying the same tracks in a circle.
     waveExtend() appends them to the queue as well as to WAVE — pushing into
     WAVE alone left this re-entrant call with an empty queue again. */
  if(PLAYCTX.key==="wave"){
   waveExtend()
    .then(extended=>{if(extended)next();else stopAtEnd()})
    .catch(e=>{console.warn("wave extend:",e);stopAtEnd()});
   return}
  /* Pool of one: nothing can ever follow, and the bar must not be left
     claiming the track is still playing (the old bare `return` did that). */
  if(!l.length){if(!S.repeat)stopAtEnd();return}
  /* A finished list stops with repeat off — it used to wrap to the top and
     play forever, which read as "the queue is stuck in a loop". Repeat is
     handled at the top of this function: it restarts the current track. */
  if(!S.repeat)return stopAtEnd();
  nx=S.shuffle?l[Math.floor(Math.random()*l.length)]:l[0]}
 setTrack(nx,true,false,undefined,true)}

function stopAtEnd(){
 S.playing=false;S.pos=S.dur;sync();renderNP();paint()}

/* Pulls more tracks for the wave from artists already in it, skipping
   everything ever played. Returns false when there is nothing new left. */
async function waveExtend(){
 const played=new Set(HISTORY.map(h=>h.tr&&h.tr.s+":"+h.tr.id));
 const artists=[...new Set(WAVE.map(x=>x.a).filter(Boolean))];
 if(!artists.length)return false;
 /* Random artist each attempt: the search returns the same top-N per query,
    so walking them in order exhausts the first artist before touching the rest. */
 const order=artists.slice().sort(()=>Math.random()-.5);
 for(const a of order){
  const r=await searchRemote(a).catch(()=>[]);
  const fresh=r.filter(x=>x.mode!=="empty"&&!isDisliked(x)
   &&!played.has(x.s+":"+x.id)&&!WAVE.some(w=>sameTrack(w,x)));
  if(!fresh.length)continue;
  /* Prune what has been played so the rebuilt queue is only unheard music —
     otherwise the old tracks keep coming back around forever. */
  WAVE=WAVE.filter(w=>!played.has(w.s+":"+w.id));
  fresh.slice(0,4).forEach(x=>{
   WAVE.push(x);
   /* Straight into the queue as well: next() re-enters itself right after a
      successful extension and only the queue can hand it something to play. */
   queue.push(x);
   if(!TRACKS.some(t=>sameTrack(t,x)))TRACKS.push(x)});
  if(fp.dataset.open==="true"&&S.fpTab==="queue")renderFPBody();
  return true}
 return false}

function prev(){
 if(S.pos>4){S.pos=0;if(A.audio&&S.current?.mode==="local")A.audio.currentTime=0;return paint()}
 /* History is the honest "previous": it is what was actually played, in order,
    which walking TRACKS backwards was never able to reproduce. */
 const back=HISTORY.map(h=>h.tr).filter(x=>x&&!sameTrack(x,S.current)&&!isDisliked(x));
 if(back.length)return setTrack(back[0],S.playing);
 const l=contextPool();if(!l.length)return;
 const i=l.findIndex(x=>sameTrack(x,S.current));
 setTrack(l[(i-1+l.length)%l.length],S.playing)}
/* Play/pause icon swap without rebuilding every icon on the page.

   sync() runs on play, pause, seek, error and track change. It used to assign
   innerHTML on the button and then call icons(), which walks the whole document
   and replaces every <i data-lucide> element it finds — including the ones in
   the bar that had not changed. That full sweep, several times a second around
   a track change, was the visible flicker. Swapping the one attribute on the
   existing svg costs nothing. */
function setPlayIcon(btn,name,size){
 if(!btn)return;
 const cur=btn.firstElementChild;
 if(cur&&cur.tagName.toLowerCase()==="svg"&&cur.dataset.icon===name)return;
 btn.innerHTML=`<i data-lucide="${name}" width="${size}" height="${size}"></i>`;
 window.lucide&&lucide.createIcons({nameAttr:"data-lucide",attrs:{}});
 const made=btn.firstElementChild;
 if(made)made.dataset.icon=name}
function sync(){
  const name=S.playing?"pause":"play";
  setPlayIcon(document.getElementById("play"),name,18);
  document.getElementById("hero").classList.toggle("fade",S.playing);
  F.mode=BOOT.done?(S.playing?"flow":"cloud"):"gather";
  const fpc=document.getElementById("fpc");
  if(fpc)fpc.dataset.playing=S.playing?"true":"false";
  setPlayIcon(document.querySelector('#fpc [data-act="play"]'),name,20)}

/* nav */
function go(v){
  S.view=v;
  document.querySelectorAll(".navbtn").forEach(b=>b.setAttribute("aria-current",b.dataset.nav===v));
  paintRail();
 document.querySelectorAll(".view").forEach(x=>x.dataset.active=(x.id==="v-"+v));
 cv.classList.toggle("dim",v!=="home");
 if(v==="search")search(document.getElementById("q").value);
 /* Social screens rebuild on entry; leaving one stops its polling so a
    forgotten timer never keeps hitting the API from the background. */
  /* The conversation lives inside the People tab now: the old "chats" view id
     never matches, so this used to wipe SOC.chat on the way in from openChat
     and the chat opened into nothing. */
  if(v!=="people"&&SOC.chat){SOC.chat=null;socClear("chat")}
  if(v==="people")renderPeople();
 if(v==="rooms")SOC.room?paintRoomShell():renderRooms();
 if(v==="top")renderTop();
 liveRefresh(v)}

/* Keeps the open screen current without a tab bounce.

   Everything social was render-on-entry only: a new friend request, an accepted
   request, a new chat or a new room appeared solely because the user left the
   tab and came back — or restarted the app. That is the "you have to re-enter
   the tab for anything to show up" report.

   One timer, keyed to the visible screen, replacing itself on every navigation,
   so at most one poll is ever in flight. The chat and room screens are excluded:
   they already run their own faster loops, and a second one would fight them
   for the same DOM. A hidden window polls nothing. */
function liveRefresh(v){
  socClear("live");
  const isProfileCard=()=>!!document.getElementById("people-actions");
  const tick=()=>{
   if(document.hidden||!sbUser)return;
   /* Never repaint under the user: an open conversation, an open profile card,
      the chat list, or a half-typed search would be destroyed by a blind
      re-render. The chat list has its own 5 s poll via socTimer("chat",…). */
   if(v==="people"){
    if(SOC.chat||isProfileCard()||PEOPLE_TAB==="chats")return;
    if(PEOPLE_TAB==="find")return;
    renderPeople();
    return}
   if(v==="top")renderTop()};
  if(v==="people")socTimer("live",tick,6000);
  else if(v==="top")socTimer("live",tick,20000)}
/* A window that comes back from the background should not show a stale screen
   for the rest of the interval. */
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden&&sbUser)liveRefresh(S.view)});
document.querySelectorAll(".navbtn").forEach(b=>b.onclick=()=>go(b.dataset.nav));
document.getElementById("q").addEventListener("input",e=>{go("search");search(e.target.value)});
document.getElementById("q").addEventListener("focus",()=>go("search"));
document.getElementById("srv").addEventListener("click",e=>{
 const b=e.target.closest("[data-svc]");if(!b)return;const s=svc(b.dataset.svc);
 if(!s.conn)return go("settings");
 s.on=!s.on;renderSrv();if(S.view==="search")search(document.getElementById("q").value)});
/* The "by artist / similar" switch is gone: the wave is always seeded from
   favorite tracks now. */
document.getElementById("libtabs").addEventListener("click",e=>{
 const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;
 [...b.parentElement.children].forEach(x=>x.setAttribute("aria-selected",x===b));renderLib()});
document.getElementById("settabs").addEventListener("click",e=>{
 const b=e.target.closest("[data-stab]");if(!b)return;
 S.stab=b.dataset.stab;showSettingsTab(S.stab);save()});
function showSettingsTab(id){
 document.querySelectorAll("#settabs [data-stab]").forEach(b=>b.setAttribute("aria-selected",b.dataset.stab===id));
 document.querySelectorAll(".stab").forEach(p=>p.dataset.active=(p.dataset.stab===id));
 if(id==="lib")refreshCacheSize();
 if(id==="net")pxLoad();
 /* Widths are only measurable once the panel is displayed. */
 requestAnimationFrame(()=>{paintAllSegs();paintAllRanges()})}
document.body.addEventListener("click",e=>{
 const f=e.target.closest("[data-fav]");
 if(f){
  /* Real service ids are strings ("wU26xVT_vBU"), not numbers. The old +id gave
     NaN, the track was never found, and the handler threw on tr.fav — which
     killed every other click handler on the page. */
  const tr=findTrack(f.dataset.fav,f.dataset.svc);
  if(!tr){e.stopPropagation();return}
  tr.fav=!tr.fav;
  /* Stamp the moment it was hearted. TRACKS is in whatever order search and
     imports happened to fill it, so without this the Favorites tab showed
     newly added songs at the very bottom. */
  if(tr.fav)tr.favAt=Date.now();
  if(tr.fav&&!TRACKS.some(x=>x.id===tr.id&&x.s===tr.s))TRACKS.push(tr);
  document.querySelectorAll(`[data-fav="${cssEsc(tr.id)}"]`).forEach(el=>el.setAttribute("aria-pressed",!!tr.fav));
  if(S.view==="library"&&(S.tab==="fav"||S.tab==="pl"))renderLib();
  renderWaveHint();
  /* Mirror the change to the account; queued and batched, works offline. */
  queueFav(tr,tr.fav);
  if(tr.fav)autoDownload(tr,null);
  save();e.stopPropagation();return}
 /* Bar actions on the current track. These sit before the [data-track] branch
    on purpose: the buttons live inside #np, which is not a row, but a stray
    match later would still swallow the click. */
 if(e.target.closest("#npdislike")){e.stopPropagation();toggleDislike(S.current);return}
 if(e.target.closest("#npadd")){
  e.stopPropagation();
  const tr=S.current;
  if(tr&&tr.mode!=="empty"){const r=e.target.closest("#npadd").getBoundingClientRect();openAddMenu(r.left,r.top,tr)}
  return}
 const r=e.target.closest("[data-track]");if(r){
  const tr=findTrack(r.dataset.track,r.dataset.svc);
  if(!tr)return;
  /* Which list this row belongs to decides what plays next. Declared by the
     container, so a row does not have to know where it was rendered. */
  const holder=r.closest("[data-listctx]");
  const from=holder?.dataset.listctx;
  if(from==="queue"){
   /* Jumping ahead in the queue consumes everything above it — that is what the
      list promised. The context is unchanged: this is the same queue. */
   const i=queue.findIndex(x=>sameTrack(x,tr));
   if(i>=0)queue=queue.slice(i+1);
   setTrack(tr,true,false,undefined,true);
   if(fp.dataset.open==="true"&&S.fpTab==="queue")renderFPBody();
   return}
  setTrack(tr,true,false,from);
  return}
 const ts=e.target.closest("[data-toksave]");
 if(ts){const id=ts.dataset.toksave,inp=document.getElementById("tok-"+id),v=(inp?.value||"").trim();
  if(!v){inp?.focus();return}
  saveToken(id,v).then(()=>{const s=svc(id);s.conn=true;s.on=true;tokOpen=null;renderAccounts();renderSrv();icons()})
   .catch(err=>console.error("token save failed",err));
  return}
 const a=e.target.closest("[data-acc]");
 if(a){const s=svc(a.dataset.acc);
  if(s.free)return;
  if(s.conn){deleteToken(s.id).catch(()=>{});s.conn=false;s.on=false;tokOpen=null}
  else tokOpen=tokOpen===s.id?null:s.id;
  renderAccounts();renderSrv();icons();
  if(tokOpen)document.getElementById("tok-"+tokOpen)?.focus();
  return}
 const pl=e.target.closest("[data-pl]");if(pl){openPl(+pl.dataset.pl);return}
 const realPl=e.target.closest("[data-plid]");if(realPl){plOpen=realPl.dataset.plid;renderLib();return}
 const art=e.target.closest("[data-artist]");if(art){artOpen=art.dataset.artist;renderArtist(artOpen);return}
 const rm=e.target.closest("[data-rmlocal]");if(rm){e.stopPropagation();removeLocal(rm.dataset.rmlocal);return}
 const rmp=e.target.closest("[data-rmpl]");if(rmp){
  e.stopPropagation();
  removeFromPlaylist(rmp.dataset.rmpl,{id:rmp.dataset.rmtrack,s:rmp.dataset.rmsvc});return}
 const qrm=e.target.closest("[data-qrm]");if(qrm){
  e.stopPropagation();
  queueRemove(qrm.dataset.qrm,qrm.dataset.qsvc);return}
 const ou=e.target.closest("[data-open-url]");if(ou){openExternal(ou.dataset.openUrl);return}
 const bd=e.target.closest("[data-badge]");
 if(bd&&bd.dataset.owned==="true"){togglePin(bd.dataset.badge);return}
 const px=e.target.closest("[data-pxuse]");if(px){
  const u=px.dataset.pxuse;
  const f=document.getElementById("px-url");if(f)f.value=u;
  pxSave({url:u,enabled:true});return}
 const sw=e.target.closest("[data-sw]");if(sw){setAccent(sw.dataset.sw);return}});
/* The wave is seeded from favorite TRACKS (it used to key off artists).
   It needs at least WAVE_MIN of them, or there is nothing to build on. */
const WAVE_MIN=5;
const favTracks=()=>TRACKS.filter(x=>x.fav&&x.mode!=="empty");
function renderWaveHint(){
 const el=document.getElementById("wavehint");if(!el)return;
 const n=favTracks().length,ok=n>=WAVE_MIN;
 el.dataset.ready=ok;
 el.innerHTML=ok
  ?t("wave.ready").replace("{n}",`<b>${n}</b>`)
  :t("wave.need").replace("{n}",`<b>${n}/${WAVE_MIN}</b>`)}

/* Seed with the favorites, pull more through a search on their artists,
   shuffle the union and use it as the queue. */
async function startWave(){
 const seeds=favTracks();
 if(seeds.length<WAVE_MIN){
  go("search");
  toast(t("wave.need.toast").replace("{n}",WAVE_MIN-seeds.length));
  document.getElementById("q")?.focus();
  return}
 await ensureStreamPort();
 const btn=document.getElementById("start");
 btn?.setAttribute("aria-busy","true");
 try{
  const artists=[...new Set(seeds.map(x=>x.a).filter(Boolean))].slice(0,4);
  const found=[];
  for(const a of artists){
   const r=await searchRemote(a).catch(()=>[]);
   r.slice(0,6).forEach(x=>{
    /* A search for the artist can still surface the disliked track itself —
       that is exactly the track the user said never to offer again. */
    if(isDisliked(x))return;
    if(!TRACKS.some(y=>String(y.id)===String(x.id)&&y.s===x.s)){TRACKS.push(x);found.push(x)}
    else found.push(TRACKS.find(y=>String(y.id)===String(x.id)&&y.s===x.s))})}
  const pool=[...seeds,...found].filter(Boolean);
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  if(!pool.length){toast(t("wave.empty"));return}
  WAVE=pool;
  /* The wave is its own context: the shuffled union is the schedule, and
     buildQueue reads it back from WAVE via listFor("wave"). */
  await setTrack(pool[0],true,true,"wave");
  if(fp.dataset.open==="true")renderFPBody();
 }finally{btn?.removeAttribute("aria-busy")}}
let WAVE=[];
document.getElementById("start").onclick=startWave;
document.getElementById("play").onclick=toggle;
document.getElementById("next").onclick=next;
document.getElementById("prev").onclick=prev;
document.getElementById("shuffle").onclick=()=>setShuffle(!S.shuffle);
document.getElementById("repeat").onclick=()=>setRepeat(!S.repeat);
document.getElementById("vol").oninput=e=>{S.vol=e.target.value/100;S.muted=false;
 if(A.gain)A.gain.gain.setTargetAtTime(S.vol,A.ctx.currentTime,.02);save()};
document.getElementById("mute").onclick=e=>{S.muted=!S.muted;const b=e.currentTarget;
 b.setAttribute("aria-pressed",S.muted);
 b.innerHTML=`<i data-lucide="${S.muted?"volume-x":"volume-2"}" width="16" height="16"></i>`;icons();
 if(A.gain)A.gain.gain.setTargetAtTime(S.muted?0:S.vol,A.ctx.currentTime,.02)};
/* Speed and loudness. initAudio() is called first because the graph may not
   exist yet if the user reaches for these before pressing play. */
document.getElementById("rate").oninput=e=>{
 initAudio();S.rate=+e.target.value/100;applyRate();save()};
document.getElementById("ratechips").onclick=e=>{
 const b=e.target.closest("[data-rate]");if(!b)return;
 initAudio();S.rate=+b.dataset.rate;applyRate();save()};
document.getElementById("boost").oninput=e=>{
 initAudio();S.boost=+e.target.value/100;applyBoost();save()};
document.getElementById("sp3d").onclick=()=>{initAudio();S.sp.on=!S.sp.on;applySpatial();save()};
/* Progress bar. While the handle is dragged, timeupdate is ignored: it used to
   yank the handle back to the stale position on every frame. */
let seeking=false;
/* Seeks to an absolute position in seconds. Shared by the lyrics and by
   anything else that knows a timestamp rather than a pixel. */
function seekSeconds(pos){
 const p=Math.max(0,Math.min(pos,S.dur||pos));
 S.pos=p;paint();
 if(A.audio&&S.current?.mode==="local"&&Number.isFinite(A.audio.duration)){
  try{A.audio.currentTime=p}catch(e){console.warn("seek:",e)}}}
function seekTo(el,x,commit){
 const r=el.getBoundingClientRect();
 const pos=Math.max(0,Math.min(1,(x-r.left)/r.width))*(S.dur||0);
 S.pos=pos;paint();
 if(commit&&A.audio&&S.current?.mode==="local"&&Number.isFinite(A.audio.duration)){
  try{A.audio.currentTime=pos}catch(e){console.warn("seek:",e)}}}
function wireSeek(id){
 const el=document.getElementById(id);if(!el)return;
 el.addEventListener("pointerdown",e=>{
  if(!S.dur)return;
  seeking=true;el.setPointerCapture?.(e.pointerId);
  seekTo(el,e.clientX,false);
  const mv=ev=>seekTo(el,ev.clientX,false);
  const up=ev=>{seeking=false;seekTo(el,ev.clientX,true);
   el.removeEventListener("pointermove",mv);el.removeEventListener("pointerup",up);el.removeEventListener("pointercancel",up)};
  el.addEventListener("pointermove",mv);el.addEventListener("pointerup",up);el.addEventListener("pointercancel",up)})}
wireSeek("btrack");

/* EQ dock */
const dock=document.getElementById("dock"),eqbtn=document.getElementById("eqbtn");
eqbtn.onclick=()=>{const open=dock.dataset.open!=="true";dock.dataset.open=open;eqbtn.setAttribute("aria-expanded",open)};
document.getElementById("bands").addEventListener("pointerdown",e=>{
 const vt=e.target.closest(".vt");if(!vt)return;const i=+vt.dataset.b;vt.setPointerCapture(e.pointerId);
 const mv=ev=>{const r=vt.getBoundingClientRect();setBand(i,((r.height/2)-(ev.clientY-r.top))/(r.height/2)*12)};
 mv(e);vt.addEventListener("pointermove",mv);vt.addEventListener("pointerup",()=>vt.removeEventListener("pointermove",mv),{once:true})});
document.getElementById("bands").addEventListener("keydown",e=>{
 const vt=e.target.closest(".vt");if(!vt)return;const i=+vt.dataset.b;
 if(e.key==="ArrowUp"||e.key==="ArrowRight"){setBand(i,S.eq[i]+.5);e.preventDefault()}
 if(e.key==="ArrowDown"||e.key==="ArrowLeft"){setBand(i,S.eq[i]-.5);e.preventDefault()}
 if(e.key==="Home"){setBand(i,0);e.preventDefault()}});
document.getElementById("presets").addEventListener("click",e=>{
 const b=e.target.closest("[data-p]");if(!b)return;
 const p=allP().find(x=>x.id===b.dataset.p);S.eq=[...p.g];S.preset=p.id;renderBands();applyEQ();renderPresets();save()});
/* Sliding highlight for every segmented control.
   Measured from the live DOM rather than hardcoded, because the button widths
   depend on the language: the same control is "Красота|Баланс" in Russian and
   "Beauty|Balance" in English. */
function paintSeg(seg){
 if(!seg)return;
 const on=seg.querySelector('[data-v][aria-pressed="true"]');
 if(!on){seg.style.setProperty("--so","0");return}
 seg.style.setProperty("--sx",(on.offsetLeft)+"px");
 seg.style.setProperty("--sw",(on.offsetWidth)+"px");
 seg.style.setProperty("--so","1")}
function paintAllSegs(){document.querySelectorAll(".seg").forEach(paintSeg)}
/* Same idea for the nav rail: one pill that glides between the buttons.
   Measured, not hardcoded, because the labels change with the language. */
function paintRail(){
 const rail=document.querySelector(".rail");if(!rail)return;
 const on=rail.querySelector('.navbtn[aria-current="true"]');
 if(!on){rail.classList.remove("pill-on");return}
 rail.style.setProperty("--ry",on.offsetTop+"px");
 rail.style.setProperty("--rh",on.offsetHeight+"px");
 rail.style.setProperty("--rx",on.offsetLeft+"px");
 rail.style.setProperty("--rw",on.offsetWidth+"px");
 rail.classList.add("pill-on")}
/* Any aria-pressed change repaints its own control, so this works for segments
   wired elsewhere in the file without touching their handlers. Scoped to the app
   shell rather than document.body: the observer fired for every aria-pressed in
   the document, including hearts in a long list. */
new MutationObserver(ms=>{
  const seen=new Set();let rail=false;
  ms.forEach(m=>{const s=m.target.closest?.(".seg");if(s&&!seen.has(s)){seen.add(s);paintSeg(s)}
   if(!rail&&m.target.closest?.(".navbtn"))rail=true});
  if(rail)paintRail();
}).observe(document.getElementById("app")||document.body,
  {subtree:true,attributes:true,attributeFilter:["aria-pressed","aria-current"]});
addEventListener("resize",paintAllSegs);
addEventListener("resize",paintRail);

/* Range fill. CSS cannot read an input's value, so mirror it into a variable. */
function paintRange(r){
 const min=+r.min||0,max=+r.max||100,v=+r.value;
 r.style.setProperty("--fill",((v-min)/(max-min||1)*100).toFixed(2)+"%")}
function paintAllRanges(){document.querySelectorAll('input[type=range]').forEach(paintRange)}
document.addEventListener("input",e=>{
 if(e.target.matches?.('input[type=range]'))paintRange(e.target)},true);

/* The performance mode picker and FPS readout were removed with the tier
   system — they measured the loop's own throttle and only caused alarm. */

/* Proxy settings.
   Off unless the user turns it on, and the address is validated against a real
   blocked host before it is trusted: a listening port proves nothing, since a
   client can be running with its tunnel switched off. */
let PX={enabled:false,url:"",all_traffic:false,extra_hosts:[]};
const pxMsg=(text,cls)=>{
 const el=document.getElementById("px-msg");if(!el)return;
 el.textContent=text||"";
 el.style.color=cls==="err"?"#f87171":cls==="ok"?"#4ade80":"var(--mute)"};

function pxPaint(){
 const seg=(id,on)=>document.querySelectorAll(`#${id} [data-v]`).forEach(b=>
  b.setAttribute("aria-pressed",b.dataset.v===(on?"on":"off")));
 seg("px-toggle",PX.enabled);seg("px-all",PX.all_traffic);
 const url=document.getElementById("px-url");if(url&&url.value!==PX.url)url.value=PX.url||"";
 const st=document.getElementById("px-state");
 if(st)st.textContent=PX.enabled?(PX.url||"—"):t("px.off")}

async function pxLoad(){
 if(!TAURI)return;
 try{PX=await inv("proxy_get")||PX;pxPaint()}catch(e){console.warn("proxy_get:",e)}}

async function pxSave(next,quiet){
 if(!TAURI)return pxMsg(t("px.desktop"),"err");
 try{
  PX=await inv("proxy_set",{cfg:{...PX,...next}});
  pxPaint();
  if(!quiet)pxMsg(PX.enabled?t("px.saved.on"):t("px.saved.off"),"ok");
  return true;
 }catch(e){
  /* The Rust side rejects VLESS/VMess links with an explanation; show it
     verbatim rather than a generic failure. */
  pxMsg(String(e).replace(/^Error:\s*/,""),"err");
  pxPaint();
  return false}}

async function pxTest(){
 if(!TAURI)return pxMsg(t("px.desktop"),"err");
 const url=(document.getElementById("px-url")?.value||"").trim();
 if(!url)return pxMsg(t("px.empty"),"err");
 pxMsg(t("px.testing"));
 try{
  const ok=await inv("proxy_test",{url});
  pxMsg(ok?t("px.test.ok"):t("px.test.bad"),ok?"ok":"err");
 }catch(e){pxMsg(String(e).replace(/^Error:\s*/,""),"err")}}

async function pxDetect(){
 if(!TAURI)return pxMsg(t("px.desktop"),"err");
 const box=document.getElementById("px-found");
 pxMsg(t("px.searching"));
 if(box)box.innerHTML="";
 try{
  const found=await inv("proxy_detect");
  if(!found?.length){pxMsg(t("px.find.none"),"err");return}
  pxMsg("");
  if(box)box.innerHTML=found.map(f=>`
   <div class="acc"><span class="an"><b>${esc(f.likely)} · :${f.port}</b>
    <span>${f.works?t("px.works"):t("px.noworks")}</span></span>
   <button class="btn ${f.works?"on":""}" data-pxuse="${esc(f.url)}">${t("px.use")}</button></div>`).join("");
  icons();
 }catch(e){pxMsg(String(e).replace(/^Error:\s*/,""),"err")}}

document.getElementById("px-toggle")?.addEventListener("click",async e=>{
 const b=e.target.closest("[data-v]");if(!b)return;
 const on=b.dataset.v==="on";
 /* Turning it on with an empty address would silently do nothing: send the
    user to the field instead of pretending it worked. */
 if(on&&!(document.getElementById("px-url")?.value||"").trim()){
  pxMsg(t("px.empty"),"err");document.getElementById("px-url")?.focus();return}
 await pxSave({enabled:on,url:(document.getElementById("px-url")?.value||"").trim()})});
document.getElementById("px-all")?.addEventListener("click",e=>{
 const b=e.target.closest("[data-v]");if(!b)return;
 pxSave({all_traffic:b.dataset.v==="on"})});
document.getElementById("px-save")?.addEventListener("click",()=>
 pxSave({url:(document.getElementById("px-url")?.value||"").trim()}));
document.getElementById("px-test")?.addEventListener("click",pxTest);
document.getElementById("px-detect")?.addEventListener("click",pxDetect);

/* Library: import and data maintenance */
document.getElementById("locadd").onclick=pickLocal;
document.getElementById("locfolder").onclick=pickLocalFolder;
document.getElementById("cacheclr").onclick=async()=>{
 if(!TAURI)return;
 try{await inv("cache_clear");refreshCacheSize();toast(t("cache.done"))}catch(e){toast(String(e))}};
document.getElementById("datareset").onclick=()=>{
  /* Un-heart everything on the account too: the reset only deleted the local
     flags, so pullFavorites() resurrected the whole list on the next start. */
  TRACKS.filter(x=>x.fav).forEach(x=>queueFav(x,false));
  TRACKS.forEach(x=>x.fav=false);
  HISTORY=[];LOCAL_PATHS=[];
  for(let i=TRACKS.length-1;i>=0;i--)if(TRACKS[i].s==="local")TRACKS.splice(i,1);
  renderLib();renderWaveHint();renderLocalInfo();
  save();flushFavorites().catch(()=>{});toast(t("data.done"))};
document.getElementById("psave").onclick=()=>{
 const inp=document.getElementById("pname"),v=(inp.value||"").trim();if(!v){inp.focus();return}
 const id="c"+Date.now();S.custom.push({id,n:{ru:v,en:v},g:[...S.eq]});S.preset=id;inp.value="";renderPresets();save()};

/* fullscreen */
/* Shuffle and repeat are part of playback state, so they have to be persisted
   and — for shuffle — reflected in the queue immediately. Toggling shuffle used
   to leave the already-built queue in its old order, so the panel disagreed with
   what played next, and neither flag survived a restart. */
function setShuffle(on){
 S.shuffle=on;
 document.querySelectorAll("#shuffle,[data-act=shuffle]").forEach(el=>el.setAttribute("aria-pressed",String(on)));
 buildQueue(S.current);
 save()}
function setRepeat(on){
 S.repeat=on;
 document.querySelectorAll("#repeat,[data-act=repeat]").forEach(el=>el.setAttribute("aria-pressed",String(on)));
 save()}
/* Order matters now. The closed panel is `content-visibility:hidden`, so it has
   no layout at all: renderFP() measures the visualiser canvas with
   getBoundingClientRect, and measuring it while hidden returns zeros — the
   canvas would come out 0x0 and the visualiser would silently never draw.
   Opening first gives the subtree a layout to measure. */
function openFP(){fp.dataset.open="true";renderFP()}
function closeFP(){
 fp.dataset.open="false";
 /* The full player is the largest surface in the app: a cover, a canvas and a
    blurred sheet. Once closed it is not coming back this second, so its canvas
    backing store is released rather than parked on the GPU. renderFP()
    recreates it on the next open. */
 if(vis.c){vis.c.width=vis.c.height=1}
 vis.c=null;vis.g=null}
document.getElementById("expand").onclick=openFP;
fp.addEventListener("click",e=>{
 if(e.target===fp||e.target.closest("#fpclose"))return closeFP();
 const tb=e.target.closest("[data-fptab]");
 if(tb){
  if(S.fpTab===tb.dataset.fptab)return;
  S.fpTab=tb.dataset.fptab;save();
  document.querySelectorAll("[data-fptab]").forEach(x=>x.setAttribute("aria-selected",x===tb));
  renderFPBody(true);return}
 const a=e.target.closest("[data-act]");
 if(a){const k=a.dataset.act;
  if(k==="play")toggle();if(k==="next")next();if(k==="prev")prev();
  if(k==="shuffle")setShuffle(!S.shuffle);
  if(k==="repeat")setRepeat(!S.repeat)}
 });
/* The fullscreen bar is rebuilt by every renderFP, so bind after rendering. */

/* settings segs */
function seg(id,fn){
 const host=document.getElementById(id);
 if(!host)return;
 host.addEventListener("click",e=>{
  const b=e.target.closest("button");
  /* A disabled option must not become the selection — the pill would move onto
     an option that cannot be honoured. */
  if(!b||b.disabled)return;
  [...b.parentElement.children].forEach(x=>x.setAttribute("aria-pressed",x===b));fn(b.dataset.v,b);save()})}
function setSeg(id,v){document.querySelectorAll(`#${id} button`).forEach(b=>b.setAttribute("aria-pressed",b.dataset.v==String(v)))}
seg("quality",v=>{S.quality=v;renderNP()});
seg("glow",v=>{S.glow=+v;document.documentElement.style.setProperty("--glow",v)});
seg("blur",v=>{S.blur=+v;document.documentElement.style.setProperty("--blur",v+"px")});
seg("dens",v=>{S.dens=+v;build(innerWidth<900?Math.round(+v*.45):+v)});
seg("pspeed",v=>{S.pspeed=+v});
seg("theme",v=>setTheme(v));
seg("lang",v=>{LANG=v;applyI18n()});
function setTheme(v){S.theme=v;
 const d=matchMedia("(prefers-color-scheme: dark)").matches;
 document.documentElement.dataset.theme=v==="system"?(d?"dark":"light"):v;
 spriteCache={}}
function setAccent(id){
 S.accent=id;document.documentElement.dataset.accent=id;
 const st=document.documentElement.style,a=ACCENTS.find(x=>x[0]===id);
 if(id==="adaptive"){
  /* Nothing to apply until a cover has been sampled; keep whatever is on screen
     until then rather than flashing grey. */
  spriteCache={};renderSwatches();save();pushPrefs();
  adaptAccent(S.current);
  return}
 if(id==="none"||!a||!a[2]){
  ["--accent","--accent-soft","--accent-rgb","--pr","--pg","--pb"].forEach(p=>st.removeProperty(p))}
 else{const[r,g,b]=a[2].split(" ");
  st.setProperty("--accent",a[1]);st.setProperty("--accent-soft",`rgb(${a[2]} / .16)`);st.setProperty("--accent-rgb",a[2]);
  st.setProperty("--pr",r);st.setProperty("--pg",g);st.setProperty("--pb",b)}
 spriteCache={};renderSwatches();save();pushPrefs()}

/* Lite mode: one switch that applies the whole weak-PC profile at once and
   remembers what was there before, so switching back restores the user's own
   values rather than factory defaults. */
let litePrev=null;
function applyLite(){
 /* removeAttribute, not "": a present-but-empty data-lite still matches the
   CSS [data-lite] selectors, which silently killed every blur in the app. */
 if(S.lite)document.documentElement.setAttribute("data-lite","1");
 else document.documentElement.removeAttribute("data-lite");
 document.getElementById("lite")?.setAttribute("aria-pressed",String(S.lite));
 if(S.lite){
  if(!litePrev)litePrev={dens:S.dens,glow:S.glow,blur:S.blur};
  /* These land exactly on existing seg options so the controls stay honest
     about what is active while lite is on. */
  S.dens=Math.min(S.dens,900);S.glow=Math.min(S.glow,0);S.blur=0;
 }else if(litePrev){
  S.dens=litePrev.dens;S.glow=litePrev.glow;S.blur=litePrev.blur;litePrev=null}
 document.documentElement.style.setProperty("--glow",S.glow);
 document.documentElement.style.setProperty("--blur",S.blur+"px");
 build(innerWidth<900?Math.round(S.dens*.45):S.dens);
 setSeg("dens",S.dens);setSeg("glow",S.glow);setSeg("blur",S.blur);
 resize()}
document.getElementById("lite").onclick=()=>{S.lite=!S.lite;applyLite();save()};

/* persistence */
let obDone=false;
function save(){try{localStorage.setItem("meowave",JSON.stringify({
 lang:LANG,theme:S.theme,accent:S.accent,glow:S.glow,blur:S.blur,dens:S.dens,pspeed:S.pspeed,
 lite:S.lite,litePrev,quality:S.quality,vol:S.vol,eq:S.eq,preset:S.preset,custom:S.custom,
  sp:{on:S.sp.on,speed:S.sp.speed,rad:S.sp.rad,elev:S.sp.elev},ob:obDone,listen:Math.round(S.listen),
 /* Store whole tracks: an id alone is useless because TRACKS starts empty on
    the next run, leaving nothing to restore the favorites from */
 /* favAt is part of the saved shape: without it the newest-first order in the
    Favorites tab is lost on every restart. */
 favt:TRACKS.filter(x=>x.fav).map(({id,s,t,a,al,d,art,mode,favAt})=>({id,s,t,a,al,d,art,mode,favAt,fav:true})),
 hist:HISTORY.slice(0,50).map(h=>({at:h.at,tr:(({id,s,t,a,al,d,art,mode})=>({id,s,t,a,al,d,art,mode}))(h.tr)})),
 stab:S.stab,rate:S.rate,boost:S.boost,shuffle:S.shuffle,repeat:S.repeat,
 dlDir:S.dlDir,dlAsk:S.dlAsk,dlAutoFav:S.dlAutoFav,dlAutoPl:S.dlAutoPl,dlMode:S.dlMode,
 customAccent:S.customAccent,eqByTrack:S.eqByTrack,eqByPl:S.eqByPl,dislikes:S.dislikes,
 plCovers:Object.fromEntries(PLAYLISTS.filter(p=>p.cover).map(p=>[p.id,p.cover])),
 /* Playlists themselves: whole tracks, so the library works with no account. */
 pls:PLAYLISTS.map(plSerialize),
 favArtists:FAV_ARTISTS,
 /* Local tracks with their paths, so the library survives a restart */
 loct:TRACKS.filter(x=>x.s==="local").map(({id,s,t,a,al,d,art,mode,path,fav})=>({id,s,t,a,al,d,art,mode,path,fav:!!fav}))}))}catch(e){}}
function restore(){try{
 const d=JSON.parse(localStorage.getItem("meowave")||"null");if(!d)return;
 if(d.lang)LANG=d.lang;
 if(d.theme)S.theme=d.theme;
 if(d.accent)S.accent=d.accent;
 if(d.glow!=null)S.glow=d.glow;
 if(d.blur!=null)S.blur=d.blur;
 if(d.dens)S.dens=d.dens;
 if(d.lite!==undefined){S.lite=!!d.lite;if(d.litePrev)litePrev=d.litePrev}
 if(d.pspeed)S.pspeed=d.pspeed;
 if(d.quality)S.quality=d.quality;
 if(d.vol!=null)S.vol=d.vol;
 if(Array.isArray(d.eq)&&d.eq.length===FREQ.length)S.eq=d.eq;
 if(d.preset!==undefined)S.preset=d.preset;
 if(Array.isArray(d.custom))S.custom=d.custom;
  if(d.sp){S.sp.speed=d.sp.speed??S.sp.speed;S.sp.rad=d.sp.rad??S.sp.rad;S.sp.elev=d.sp.elev??S.sp.elev;
   /* The spatial toggle is playback state the user set deliberately: it used
      to reset to off on every launch. */
   S.sp.on=!!d.sp.on}
 if(Array.isArray(d.favt))d.favt.forEach((x,i)=>{
  const known=TRACKS.find(y=>String(y.id)===String(x.id)&&y.s===x.s);
  /* Favorites saved before favAt existed get a synthetic stamp that preserves
     their stored order, so old libraries do not all collapse to "now". */
  const at=x.favAt||i+1;
  if(known){known.fav=true;known.favAt=known.favAt||at}
  else TRACKS.push({...x,fav:true,favAt:at})});
 if(Array.isArray(d.loct))d.loct.forEach(x=>{
  if(!TRACKS.some(y=>String(y.id)===String(x.id)&&y.s==="local"))TRACKS.push(x);
  if(x.path&&!LOCAL_PATHS.includes(x.path))LOCAL_PATHS.push(x.path)});
 if(Array.isArray(d.hist))HISTORY=d.hist.filter(h=>h?.tr?.id).map(h=>{
  const known=TRACKS.find(y=>String(y.id)===String(h.tr.id)&&y.s===h.tr.s);
  return {at:h.at,tr:known||h.tr}});
 if(d.stab)S.stab=d.stab;
 if(d.dlDir)S.dlDir=d.dlDir;
 ["dlAsk","dlAutoFav","dlAutoPl"].forEach(k=>{if(d[k]!==undefined)S[k]=!!d[k]});
 if(d.dlMode==="raw"||d.dlMode==="fx")S.dlMode=d.dlMode;
 if(d.customAccent)S.customAccent=d.customAccent;
 if(d.dislikes&&typeof d.dislikes==="object")S.dislikes=d.dislikes;
 if(d.eqByTrack&&typeof d.eqByTrack==="object")S.eqByTrack=d.eqByTrack;
 if(d.eqByPl&&typeof d.eqByPl==="object")S.eqByPl=d.eqByPl;
 if(d.plCovers&&typeof d.plCovers==="object")S.plCovers=d.plCovers;
 if(Array.isArray(d.pls))PLAYLISTS=d.pls.filter(p=>p&&p.id&&p.name)
  .map(p=>({...p,cover:p.cover||d.plCovers?.[p.id]||null,tracks:Array.isArray(p.tracks)?p.tracks:[]}));
 if(Array.isArray(d.favArtists))FAV_ARTISTS=d.favArtists;
 if(d.rate)S.rate=Math.max(.5,Math.min(1.5,d.rate));
 if(d.boost)S.boost=Math.max(1,Math.min(3,d.boost));
 if(d.shuffle!==undefined)S.shuffle=!!d.shuffle;
 if(d.repeat!==undefined)S.repeat=!!d.repeat;
 /* Repair for the removed "performance tier" builds. Their broken auto-detect
    force-saved glow .35/.7 and blur 0/8 and a reduced density into settings,
    which is exactly the dim, grey-tinted field people saw. If those exact
    forced values are present alongside the old perf key, restore the beta
    defaults — a value the user picked by hand can't collide with all three. */
 if(d.perf!==undefined&&!d.perfManual){
  if(d.glow===.35||d.glow===.7)S.glow=1;
  if(d.blur===0||d.blur===8)S.blur=14;
  if(d.dens===260||d.dens===500||d.dens===900||d.dens===1200)S.dens=2200}
 if(d.listen)S.listen=d.listen;
 obDone=!!d.ob;
}catch(e){}}
document.getElementById("sp-on").onclick=()=>{initAudio();S.sp.on=!S.sp.on;applySpatial();save()};
document.getElementById("sp-speed").oninput=e=>{S.sp.speed=e.target.value/100;document.getElementById("sp-speed-v").textContent=S.sp.speed.toFixed(2);save()};
document.getElementById("sp-rad").oninput=e=>{S.sp.rad=e.target.value/100;document.getElementById("sp-rad-v").textContent=e.target.value;applySpatial();save()};
document.getElementById("sp-elev").oninput=e=>{S.sp.elev=e.target.value/100;document.getElementById("sp-elev-v").textContent=e.target.value;save()};

addEventListener("keydown",e=>{
  if(e.target.matches("input"))return;
  /* An open dialog owns Escape: the modal's own handler closes it, and the
     fullscreen player behind it must not close in the same keystroke. */
  if(document.getElementById("modal")?.dataset.open==="true")return;
  if(document.getElementById("cropper")?.dataset.open==="true")return;
  if(e.code==="Space"){e.preventDefault();toggle()}
  if(e.key==="Escape")closeFP();
  if(e.key.toLowerCase()==="l"&&fp.dataset.open==="true"){S.fpTab="lyrics";renderFP()}
  if(e.key.toLowerCase()==="e")eqbtn.click();
  if(e.shiftKey&&e.key==="ArrowRight")next();
  if(e.shiftKey&&e.key==="ArrowLeft")prev()});

/* onboarding */
const OB={step:0};
document.getElementById("oblang").innerHTML=`
 <button class="opt" role="radio" aria-checked="true" data-v="ru" style="--i:0"><b>Русский</b><small>Полный интерфейс</small><span class="tick"><i data-lucide="check" width="16" height="16"></i></span></button>
 <button class="opt" role="radio" aria-checked="false" data-v="en" style="--i:1"><b>English</b><small>Full interface</small><span class="tick"><i data-lucide="check" width="16" height="16"></i></span></button>`;
function obThemes(){
 const box=document.getElementById("obtheme");if(!box)return;
 box.innerHTML=[["dark",t("th.dark"),LANG==="ru"?"Почти чёрный фон, белые частицы":"Near-black canvas, white particles"],
  ["light",t("th.light"),LANG==="ru"?"Белая основа, тёмные частицы":"White base, dark particles"],
  ["system",t("th.sys"),LANG==="ru"?"Следовать за системой":"Follow the OS"]]
  .map(([v,n,d],i)=>`<button class="opt" role="radio" aria-checked="${S.theme===v}" data-v="${v}" style="--i:${i}"><b>${n}</b><small>${d}</small><span class="tick"><i data-lucide="check" width="16" height="16"></i></span></button>`).join("");
 icons()}
obThemes();renderSwatches();
document.getElementById("oblang").addEventListener("click",e=>{
 const b=e.target.closest("[data-v]");if(!b)return;
 [...b.parentElement.children].forEach(x=>x.setAttribute("aria-checked",x===b));
 LANG=b.dataset.v;applyI18n();
 document.querySelectorAll("#lang button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.v===LANG));
 burst(.5)});
document.getElementById("obtheme").addEventListener("click",e=>{
 const b=e.target.closest("[data-v]");if(!b)return;
 [...b.parentElement.children].forEach(x=>x.setAttribute("aria-checked",x===b));
 setTheme(b.dataset.v);
 document.querySelectorAll("#theme button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.v===S.theme))});
function obGo(n){
 OB.step=n;
 document.querySelectorAll(".obstep").forEach(s=>s.dataset.on=(+s.dataset.step===n));
 document.querySelectorAll("#obprog i").forEach((d,i)=>d.dataset.on=(i===n));
 document.getElementById("obback").style.visibility=n?"visible":"hidden";
 document.querySelector("#obnext span").textContent=n===2?t("ob.go"):t("ob.next");
 document.querySelectorAll(`.obstep[data-step="${n}"] .opt`).forEach(o=>{o.style.animation="none";o.offsetHeight;o.style.animation=""});
 if(n===2){ring();setTimeout(()=>burst(1.1),900)}else{F.mode="cloud";burst(.35)}}
document.getElementById("obnext").onclick=()=>OB.step<2?obGo(OB.step+1):finish();
document.getElementById("obback").onclick=()=>obGo(Math.max(0,OB.step-1));
function finish(){
 const ob=document.getElementById("ob");
 burst(2.2);F.mode="cloud";
 ob.classList.add("out");setTimeout(()=>ob.hidden=true,520);
 const app=document.getElementById("app");app.setAttribute("aria-hidden","false");app.classList.add("ready");
 obDone=true;save()}

/* tauri bridge */
const TAURI=window.__TAURI__?.core;
const TAURI_EVENT=window.__TAURI__?.event;
const inv=(cmd,args)=>TAURI?.invoke(cmd,args);
const MOBILE=window.MeowaveMobile;
const ANDROID=!!MOBILE?.androidBridge;
const SECURE=MOBILE?.ports?.secureStore;

/* Rust tells us when the window is minimised or loses focus; see the render
   gating above. Without this the field keeps painting behind other windows. */
/* render = the window is visible at all; focus = it is the active window. One
   event used to imply both, so losing focus froze the field for good. */
TAURI_EVENT?.listen?.("meowave://render",e=>setRender(!!e.payload))
  .catch(err=>console.warn("render events:",err));
TAURI_EVENT?.listen?.("meowave://focus",e=>setFocused(!!e.payload))
  .catch(()=>{});

/* Titlebar buttons (min/max/close). The strip itself is a drag region via
   data-tauri-drag-region, so only the buttons need explicit handlers. */
if(TAURI){
  /* Tauri v2 renamed the getter: the global bundle ships getCurrentWindow(),
     and the v1-era getCurrent() is gone from some builds — dereferencing it
     left win undefined and the throw killed the whole script, which is the
     "app stuck on the splash" report. Every access below is guarded, and the
     getter is tried by both names. */
  const W=window.__TAURI__.window||{};
  const win=(W.getCurrentWindow?.()||W.getCurrent?.()||null);
  document.getElementById("tb-min")?.addEventListener("click",()=>win?.minimize?.());
  document.getElementById("tb-max")?.addEventListener("click",()=>win?.toggleMaximize?.());
  document.getElementById("tb-close")?.addEventListener("click",()=>win?.close?.());
  /* Keep a data-max attribute on <html> so CSS can style the titlebar when
     the window is maximised (no rounded corners needed). */
  const syncMax=async()=>{try{const m=await win?.isMaximized?.();document.documentElement.dataset.max=m?"true":"false"}catch(e){}};
  syncMax();
  win?.onMaximizedChange?.(e=>{document.documentElement.dataset.max=e.payload?"true":"false"});
}

/* Persistent storage lives in %LOCALAPPDATA%\Meowave (see paths.rs). In a plain
   browser there's no Rust side, so fall back to localStorage. */
const store={
 async read(name){
  if(TAURI){try{const s=await inv("store_read",{name});return s?JSON.parse(s):null}catch(e){console.warn("store read:",e);return null}}
  try{return JSON.parse(localStorage.getItem("mw.store."+name)||"null")}catch(e){return null}
 },
 async write(name,value){
  const json=JSON.stringify(value);
  if(TAURI){try{return await inv("store_write",{name,json})}catch(e){console.warn("store write:",e);return}}
  try{localStorage.setItem("mw.store."+name,json)}catch(e){}
 },
 async clear(name){
  if(TAURI){try{return await inv("store_delete",{name})}catch(e){return}}
  localStorage.removeItem("mw.store."+name);
 }
};
async function ensureStreamPort(){
 if(STREAM_PORT||!TAURI)return STREAM_PORT;
 try{
  const info=await inv("stream_info");
  STREAM_PORT=info?.port||null;STREAM_KEY=info?.token||"";
 }catch(e){console.warn("stream proxy:",e)}
 return STREAM_PORT;
}
/* The backend only knows "best available" vs "smallest": hq is a bool all the
   way down to ytm.rs / api.rs. Both top settings therefore map to 1 — the old
   `quality==="high"` test sent lossless down the low-quality path, so the
   highest setting produced the worst stream. */
const hqFlag=()=>(S.quality==="high"||S.quality==="lossless")?1:0;
/* Which containers this webview can actually decode.
   A per-platform fact, and for YouTube Music it decides whether anything
   plays at all: the service hands out Opus-in-WebM by default, Chromium
   decodes it, WKWebView on an older macOS and WebKitGTK without the GStreamer
   plugins refuse the file — while SoundCloud and Yandex, both mp3, play
   everywhere. Asking for a container we can decode is what makes the three
   platforms behave the same instead of one of them just being broken. */
const CAN=(()=>{
 const el=document.createElement("video");
 const can=s=>{try{const r=el.canPlayType(s);return r==="probably"||r==="maybe"}catch(e){return false}};
 return {webm:can('audio/webm;codecs="opus"'),mp4:can('audio/mp4;codecs="mp4a.40.2"')};
})();
/* One-shot swap to the other container after a codec failure, keyed to the
   track so it exists exactly as long as that track is the failing one. */
let codecRetry=null;
/* trackKey() is defined further down (per-track EQ); it is the same
   "service:id" identity everywhere, and it is only read from here at
   playback time — long after the script has finished evaluating. */
function ytmFmt(tr){
 if(!tr||tr.s!=="ytm")return "best";
 if(codecRetry&&codecRetry.key!==trackKey(tr))codecRetry=null;
 if(codecRetry)return codecRetry.fmt;
 return CAN.webm?"webm":CAN.mp4?"mp4":"best";
}
function streamUrl(tr){
 if(!STREAM_PORT||!tr?.id)return null;
 const fmt=tr.s==="ytm"?`&fmt=${encodeURIComponent(ytmFmt(tr))}`:"";
 return `http://127.0.0.1:${STREAM_PORT}/stream/${encodeURIComponent(tr.s)}/${encodeURIComponent(tr.id)}?k=${encodeURIComponent(STREAM_KEY)}&hq=${hqFlag()}${fmt}`;
}
/* The media element only reports a numeric code, so every failure used to look
   identical: "Не удалось воспроизвести". The proxy knows the real reason —
   it answers "resolve failed: <why>" — and when it answers with bytes instead,
   the network path is fine and the problem is the codec. One probe tells the
   two apart, and it is only ever spent after something has already failed. */
async function probeStream(url){
 try{
  const r=await fetch(url,{headers:{Range:"bytes=0-64"}});
  if(r.status>=400){
   const txt=(await r.text().catch(()=>"")).trim().replace(/\s+/g," ");
   return {ok:false,why:txt.slice(0,200)||`HTTP ${r.status}`};
  }
  return {ok:true,ct:(r.headers.get("content-type")||"").toLowerCase()};
 }catch(e){return {ok:false,why:String(e.message||e)}}
}
async function explainFailure(url,tr){
 if(!url){toast(t("load.err"));return}
 const key=trackKey(tr);
 if(codecRetry&&codecRetry.key!==key)codecRetry=null;
 const why=await probeStream(url);
 /* Bytes arrived but this webview will not decode that container, and YouTube
    Music ships the other one too: swap and try exactly once before believing
    the track itself is broken. */
 if(why.ok&&tr?.s==="ytm"&&!codecRetry){
  const alt=ytmFmt(tr)==="mp4"?"webm":"mp4";
  const playable=alt==="webm"?CAN.webm:CAN.mp4;
  const wrong=!!why.ct&&((why.ct.includes("webm")&&!CAN.webm)||(why.ct.includes("mp4")&&!CAN.mp4));
  if(playable&&wrong){
   codecRetry={key,fmt:alt};
   console.warn(`[meowave] stream refused as ${why.ct||"unknown type"}; retrying as ${alt}`);
   load(tr,true);
   return;
  }
 }
 toast(why.ok?t("load.err"):`${t("load.err")} — ${why.why}`);
}
/* Pure fetch: no debounce and no "is this still the newest query" check. Those
   belong to the search box, and keeping them here broke startWave(), which
   calls this in a loop — every iteration but the last cancelled itself against
   the shared counter and returned [], so the wave was built from favorites
   only. */
async function searchRemote(query){
 if(!TAURI||!query.trim())return [];
 /* local is excluded: those files live on disk and the frontend filters them. */
 const services=SERVICES.filter(s=>s.on&&!s.local).map(s=>s.id);
 if(!services.length)return [];
 try{
  const r=await inv("api_search",{query:query.trim(),services});
  return r?.tracks||[];
 }catch(e){console.warn("service search:",e);return []}
}
/* dev-фолбэк в обычном браузере: localStorage вместо keychain */
/* Local tracks.
   Paths are persisted and re-registered on boot; otherwise the proxy would not
   know which file to serve for /stream/local/<id> after a restart. */
let LOCAL_PATHS=[];
const dlgApi=()=>window.__TAURI__?.dialog;
async function pickLocal(){
 if(!TAURI)return toast(t("loc.desktop"));
 const dlg=dlgApi();
 if(!dlg?.open)return toast(t("loc.nodlg"));
 try{
  const sel=await dlg.open({multiple:true,directory:false,
   filters:[{name:"Audio",extensions:["mp3","flac","wav","ogg","oga","m4a","aac","opus"]}]});
  if(!sel)return;
  mergeLocal(await inv("local_add",{paths:Array.isArray(sel)?sel:[sel]}));
 }catch(e){console.error("local pick:",e);toast(t("loc.err"))}}
async function pickLocalFolder(){
 if(!TAURI)return toast(t("loc.desktop"));
 const dlg=dlgApi();
 if(!dlg?.open)return toast(t("loc.nodlg"));
 try{
  const f=await dlg.open({directory:true,multiple:false});
  if(!f)return;
  mergeLocal(await inv("local_scan",{folder:Array.isArray(f)?f[0]:f,depth:4}));
 }catch(e){console.error("local scan:",e);toast(t("loc.err"))}}
function mergeLocal(added){
 if(!added?.length)return toast(t("loc.none"));
 let n=0;
 added.forEach(x=>{
  if(!TRACKS.some(y=>String(y.id)===String(x.id)&&y.s==="local")){TRACKS.push(x);n++}
  if(x.path&&!LOCAL_PATHS.includes(x.path))LOCAL_PATHS.push(x.path)});
 renderLocalInfo();renderWaveHint();save();
 if(S.view==="library")renderLib();
 toast(t("loc.added").replace("{n}",n))}
function renderLocalInfo(){
 const el=document.getElementById("locinfo");if(!el)return;
 const n=TRACKS.filter(x=>x.s==="local").length;
 el.textContent=n?t("loc.count").replace("{n}",n):t("loc.empty")}
/* External links open in the system browser, not inside the player window. */
/* Opens a link in the user's own browser.

   This used to fall back to printing the URL in a toast, which is what made it
   look like the app was "just showing a link": the opener plugin was
   registered in Rust but not permitted in capabilities, so every call threw and
   landed in the catch. With the permission in place openUrl works; the shell
   command is kept as a second path so a missing plugin still opens a browser
   rather than doing nothing useful. */
async function openExternal(url){
 if(!/^https?:\/\//i.test(url))return;
 try{
  const op=window.__TAURI__?.opener;
  if(op?.openUrl){await op.openUrl(url);return}
 }catch(e){console.warn("opener plugin:",e)}
 try{
  if(TAURI){await inv("open_external",{url});return}
 }catch(e){console.warn("open_external:",e)}
 /* Browser build only. */
 window.open(url,"_blank","noopener")}
async function refreshCacheSize(){
 const el=document.getElementById("cachesz");if(!el)return;
 if(!TAURI){el.textContent="—";return}
 try{const b=await inv("cache_size");el.textContent=(b/1048576).toFixed(1)+" MB"}
 catch(e){el.textContent="—"}}

async function saveToken(id,tok){if(TAURI)return inv("set_service_token",{service:id,token:tok});localStorage.setItem("mw.tok."+id,tok)}
async function deleteToken(id){if(TAURI)return inv("delete_service_token",{service:id});localStorage.removeItem("mw.tok."+id)}
async function initServices(){
 try{
  const ids=TAURI?await inv("list_connected_services")
   :SERVICES.map(s=>s.id).filter(id=>localStorage.getItem("mw.tok."+id));
  /* "local" is not a keychain service and Rust never reports it, so the blanket
     assignment below switched it off on every start — local files then vanished
     from search, from the queue and from next(). A local provider is connected
     by definition. */
  SERVICES.forEach(s=>{if(s.local)return;s.conn=ids.includes(s.id);s.on=s.conn});
  renderSrv();renderAccounts();icons();
 }catch(e){console.warn("keychain unavailable:",e)}}

/* supabase: аккаунты */
let sb=null,sbUser=null,sbProfile=null,sbStats=null,delArmed=false;
async function initSupabase(){
  try{
   const cfg=TAURI?await inv("get_supabase_config")
    :{url:localStorage.getItem("mw.sb.url"),anon_key:localStorage.getItem("mw.sb.key")};
   if(!cfg?.url||!cfg?.anon_key)throw new Error("no supabase config");
   /* createClient comes from the locally bundled UMD build (window.supabase).
      The old dynamic import from jsdelivr died on networks where the CDN is
      blocked — which took account sign-in down with it. The CDN import stays
      only as a fallback for stale checkouts that predate the vendored file. */
   let createClient=window.supabase?.createClient;
   if(!createClient){
    ({createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"))}
   /* Route every Supabase call through our own relay: the webview's network
      stack dies on machines with an IPv6 address but no v6 route ("Load
      failed" on sign-in), while the Rust side falls back to v4 properly. */
   const supaFetch=(url,opts={})=>{
    if(STREAM_PORT&&typeof url==="string"&&url.startsWith("https://")){
     url=`http://127.0.0.1:${STREAM_PORT}/relay/${encodeURIComponent(url)}?k=${encodeURIComponent(STREAM_KEY)}`}
    return fetch(url,opts)};
   sb=createClient(cfg.url,cfg.anon_key,{
    global:{fetch:supaFetch},
    ...(ANDROID?{auth:{storage:MOBILE.supabaseStorage,persistSession:true,detectSessionInUrl:false}}:{})});
 if(ANDROID)await handleMobileAuthCallback();
  const {data:{session}}=await sb.auth.getSession();
  sbUser=session?.user||null;
  if(sbUser)await loadProfile();
  sb.auth.onAuthStateChange(async(_ev,sess)=>{
   const wasSignedIn=!!sbUser;
   /* Sign-out: push what is still queued while the session is alive, then drop
      the badge state. Favorites stay in localStorage — they are this machine's
      library too, not only the account's, and wiping them on sign-out would
      look like data loss. */
   if(wasSignedIn&&!sess?.user)await flushFavorites();
   sbUser=sess?.user||null;sbProfile=null;sbStats=null;delArmed=false;
   if(!sbUser){OWNED=new Set()}
   if(sbUser)await loadProfile();
   renderProfile()});
 }catch(e){console.warn("supabase init:",e.message||e)}
 renderProfile()}
/* The server's own listening counter. The profile card used to print the
   in-memory S.listen, which is this session plus whatever localStorage had —
   so the hours read differently on every machine and looked "not saved". The
   account total is the source of truth; the local number only ever fills in
   seconds not yet flushed. */
async function handleMobileAuthCallback(url=location.href){
 if(!ANDROID||!sb||!/^meowave:\/\/auth\/callback/i.test(url))return false;
 const callback=MOBILE.auth.parseCallback(url);
 if(callback.code){const {error}=await sb.auth.exchangeCodeForSession(callback.code);if(error)throw error;return true}
 if(callback.accessToken&&callback.refreshToken){const {error}=await sb.auth.setSession({access_token:callback.accessToken,refresh_token:callback.refreshToken});if(error)throw error;return true}
 return false}
window.addEventListener("meowave://auth-callback",e=>handleMobileAuthCallback(e.detail?.url).catch(console.warn));

async function loadStats(){
 if(!sb||!sbUser)return null;
 try{
  const {data,error}=await sb.from("user_stats").select("listen_seconds").eq("user_id",sbUser.id).maybeSingle();
  if(error)throw error;
  sbStats=data||{listen_seconds:0};
  /* Never show less than this machine already knows about. */
  const srv=Number(sbStats.listen_seconds)||0;
  if(srv>S.listen){S.listen=srv;save()}
  return sbStats;
 }catch(e){console.warn("user_stats:",e.message||e);return null}}

async function loadProfile(){
 /* privacy/bio columns arrive with migration 10; on a database that has not
    had it applied yet the wide select fails outright, which used to take the
    whole profile down. Retry without the new columns and carry on. */
 let {data,error}=await sb.from("profiles").select("username,avatar_url,banner_url,bio,accent,card_style,pinned_badges,prefs,privacy,is_public").eq("id",sbUser.id).maybeSingle();
 if(error){
  console.warn("profiles (wide):",error.message);
  ({data,error}=await sb.from("profiles").select("username,avatar_url,banner_url,bio,accent,card_style,pinned_badges,prefs").eq("id",sbUser.id).maybeSingle())}
 if(error)console.warn("profiles:",error.message);
 sbProfile=data||{username:sbUser.email?.split("@")[0]||"",avatar_url:null,banner_url:null,pinned_badges:[]};
 /* Dislikes are a union, not an overwrite: hidden on any machine means hidden
    everywhere, and un-hiding stays a local act (there is no timestamp to tell
    which side is newer). */
 const remoteDislikes=Array.isArray(sbProfile?.prefs?.dislikes)?sbProfile.prefs.dislikes:[];
 if(remoteDislikes.length){
  S.dislikes=S.dislikes||{};
  const before=Object.keys(S.dislikes).length;
  remoteDislikes.forEach(k=>S.dislikes[k]=1);
  if(Object.keys(S.dislikes).length!==before)save()}
 /* Repair pass for accounts created before the two were linked: if the privacy
    blob says the profile is visible but the column the policies read says it is
    not, the column is wrong and nobody could see this account's hours or
    badges. Fixed once, silently, rather than asking the user to toggle a
    setting they already set. */
 const wantPublic=(sbProfile?.privacy?.profile||"all")!=="none";
 if(sbProfile&&"is_public" in sbProfile&&sbProfile.is_public!==wantPublic){
  sbProfile.is_public=wantPublic;
  sb.from("profiles").upsert({id:sbUser.id,is_public:wantPublic})
    .then(({error})=>{if(error)console.warn("is_public sync:",error.message)})}
 PINNED=Array.isArray(sbProfile.pinned_badges)?sbProfile.pinned_badges:[];
 await loadBadgeCatalog();
 await loadOwnedBadges();
 await loadStats();
 await loadPlaylists();
 /* Merge the account's favorites with whatever this machine has. */
 await pullFavorites();
 /* Catch up on anything earned while signed out or on another device. */
 syncAchievements()}

/* Listening time is reported in batches rather than per track: fewer requests,
   and report_listening_v2() clamps each call, so a tampered client can only
   inflate its own numbers — and since 09_hardening the client cannot write
   user_stats directly at all. Unsent seconds accumulate here between flushes. */
const REPORT={secs:0,spatial:0,tracks:0,ids:new Set(),last:Date.now(),
 /* Session length and the set of genres seen: only the client can observe
    these, and v2 takes them as maxima rather than sums. */
 sessionStart:Date.now(),genres:new Set()};
function noteListening(dt){
 REPORT.secs+=dt;
 if(S.sp.on)REPORT.spatial+=dt;
 /* A "session" is continuous listening, not app uptime: without this a window
    left open overnight would claim a 1440-minute session and hand out the
    marathon badge. A gap of more than a minute starts a new one. */
 const now=Date.now();
 if(now-REPORT.last>60000)REPORT.sessionStart=now;
 REPORT.last=now}
function noteTrackStart(tr){
 if(!tr||tr.mode==="empty")return;
 const key=tr.s+":"+tr.id;
 if(!REPORT.ids.has(key)){REPORT.ids.add(key);REPORT.tracks++}
 /* No genre metadata comes back from any of the services, so the album is the
    closest available proxy for "musical variety". Better an honest approximation
    than a counter that never moves and a badge nobody can earn. */
 const g=(tr.al||"").trim().toLowerCase();
 if(g)REPORT.genres.add(g)}
async function flushListening(force){
 const secs=Math.floor(REPORT.secs);
 if(!sb||!sbUser)return;
 if(!force&&secs<60&&!REPORT.tracks)return;
 if(!secs&&!REPORT.tracks)return;
 const hour=new Date().getHours();
 /* v2, not v1: the extra counters behind seven of the fourteen achievements
    (streaks, early/late sessions, session length, variety) are only written by
    this function, so on v1 those badges were unreachable. */
 const payload={seconds:secs,new_tracks:REPORT.tracks,
  spatial:Math.floor(REPORT.spatial),
  local_hour:hour,
  session_minutes:Math.floor((Date.now()-REPORT.sessionStart)/60000),
  genres:REPORT.genres.size,
  liked:TRACKS.filter(x=>x.fav).length,
  playlists:PLAYLISTS.length};
  try{
   const {error}=await sb.rpc("report_listening_v2",payload);
   if(error)throw error;
   REPORT.secs-=secs;REPORT.spatial=0;REPORT.tracks=0;
  /* Keep the card in step with what the server now holds. */
  if(sbStats)sbStats.listen_seconds=(Number(sbStats.listen_seconds)||0)+secs;
  if(S.view==="profile")renderProfile();
  syncAchievements();
 }catch(e){console.warn("report_listening:",e.message||e)}}
setInterval(()=>flushListening(false),60000);
/* Listening time only reached localStorage when something else happened to call
   save(). A long session that ended with a crash, a kill or an update lost every
   minute of it — which is exactly the "hours are not saved" report. A minute is
   cheap: this is one small JSON write. */
setInterval(()=>save(),60000);
/* A closing window must not lose the current batch. */
window.addEventListener("beforeunload",()=>{save();flushListening(true);flushFavorites()});
/* beforeunload does not fire reliably when a window is destroyed by the OS or
   the updater; pagehide and the hidden transition do. */
window.addEventListener("pagehide",()=>{save();flushListening(true)});
document.addEventListener("visibilitychange",()=>{if(document.hidden){save();flushListening(true)}});
function authMsg(msg,cls){const el=document.getElementById("authmsg");if(el){el.textContent=msg||"";el.className="authmsg "+(cls||"")}}
async function doAuth(kind){
 const email=(document.getElementById("au-email")?.value||"").trim();
 const pass=document.getElementById("au-pass")?.value||"";
 if(!email)return authMsg(t("pr.email")+"?","err");
 try{
  if(kind==="magic"){
   const {error}=await sb.auth.signInWithOtp({email,...(ANDROID?{options:{emailRedirectTo:MOBILE.auth.redirectTo}}:{})});
   if(error)throw error;
   return authMsg(t("pr.magic.sent"),"ok")}
  if(!pass)return authMsg(t("pr.pass")+"?","err");
  const {error}=kind==="in"
   ?await sb.auth.signInWithPassword({email,password:pass})
   :await sb.auth.signUp({email,password:pass,...(ANDROID?{options:{emailRedirectTo:MOBILE.auth.redirectTo,data:{username:null,is_public:false}}}:{})});
  if(error)throw error;
 }catch(e){authMsg(e.message||String(e),"err")}}
/* кроп по центру + ресайз до 256px на клиенте, затем в Storage bucket "avatars" */
/* Avatars and banners.
   An animated GIF must be uploaded byte-for-byte: drawing it to a canvas keeps
   only the first frame, which is why animated avatars "didn't work" before —
   they uploaded fine and arrived as a still image. Everything else is resized,
   because a 12 MP phone photo as a 40px avatar is pure waste. */
const IMG_MAX={avatar:2*1024*1024,banner:4*1024*1024};
/* Image editor: drag to reposition, wheel or slider to zoom, then crop.

   Previously an uploaded picture was centre-cropped silently, so a photo whose
   subject was not dead centre came out beheaded and there was nothing the user
   could do about it. This is the Telegram-style editor: the frame is fixed, the
   image moves behind it, and what you see inside the frame is exactly what gets
   saved.

   The maths is deliberately in source-image pixels rather than screen pixels:
   the preview can be any size, and doing it the other way round makes the
   result depend on the window width. */
const CROP={img:null,shape:"square",scale:1,min:1,x:0,y:0,drag:null,resolve:null};

function cropFrameSize(){
 const box=document.getElementById("crop-stage");
 if(!box)return {w:320,h:320};
 const w=box.clientWidth;
 /* The frame's aspect matches where the image is going: square for avatars and
    playlist covers, 3:1 for banners. */
 return {w,h:CROP.shape==="banner"?Math.round(w/3):w};
}

function cropClamp(){
 const f=cropFrameSize();
 /* Scale is "source pixels per frame pixel" inverted: cover the frame at
    minimum. Anything less would leave empty edges in the output. */
 const drawW=CROP.img.width*CROP.scale;
 const drawH=CROP.img.height*CROP.scale;
 CROP.x=Math.min(0,Math.max(f.w-drawW,CROP.x));
 CROP.y=Math.min(0,Math.max(f.h-drawH,CROP.y));
}

function cropPaint(){
 const c=document.getElementById("crop-canvas");
 if(!c||!CROP.img)return;
 const f=cropFrameSize();
 const dpr=Math.min(2,devicePixelRatio||1);
 c.width=f.w*dpr;c.height=f.h*dpr;
 c.style.height=f.h+"px";
 const x=c.getContext("2d");
 x.setTransform(dpr,0,0,dpr,0,0);
 x.clearRect(0,0,f.w,f.h);
 x.imageSmoothingQuality="high";
 x.drawImage(CROP.img,CROP.x,CROP.y,CROP.img.width*CROP.scale,CROP.img.height*CROP.scale);
 const sl=document.getElementById("crop-zoom");
 if(sl){
  const v=Math.round((CROP.scale/CROP.min)*100);
  if(+sl.value!==v){sl.value=Math.min(300,Math.max(100,v));paintRange(sl)}}
}

/* Fits the image so it just covers the frame, centred — the sane starting
   point, and the same thing the old silent crop produced. */
function cropReset(){
 const f=cropFrameSize();
 CROP.min=Math.max(f.w/CROP.img.width,f.h/CROP.img.height);
 CROP.scale=CROP.min;
 CROP.x=(f.w-CROP.img.width*CROP.scale)/2;
 CROP.y=(f.h-CROP.img.height*CROP.scale)/2;
 cropPaint()}

/* Zooms around the frame's centre, so the thing the user is looking at stays
   put instead of drifting off. */
function cropZoom(next){
 const f=cropFrameSize();
 const prev=CROP.scale;
 CROP.scale=Math.max(CROP.min,Math.min(CROP.min*3,next));
 const k=CROP.scale/prev;
 CROP.x=f.w/2-(f.w/2-CROP.x)*k;
 CROP.y=f.h/2-(f.h/2-CROP.y)*k;
 cropClamp();cropPaint()}

/* Renders the visible region at the target resolution. */
async function cropResult(){
 const f=cropFrameSize();
 const out=CROP.shape==="banner"?{w:1200,h:400}:{w:512,h:512};
 const c=document.createElement("canvas");
 c.width=out.w;c.height=out.h;
 const x=c.getContext("2d");
 x.imageSmoothingQuality="high";
 /* One transform maps frame space to output space, so the exported pixels are
    the previewed pixels — no second, subtly different crop calculation. */
 const k=out.w/f.w;
 x.drawImage(CROP.img,CROP.x*k,CROP.y*k,
  CROP.img.width*CROP.scale*k,CROP.img.height*CROP.scale*k);

 /* An avatar is a square image that every surface then masks into a circle.
    The corners it keeps are the bug: JPEG has no alpha, so they were saved as
    solid white, and anti-aliasing left a pale fringe just inside the CSS mask —
    the "white pixels on the avatar" that look unfinished on a dark theme.

    Cutting the circle here, in the export, means the stored file already ends
    where the picture ends. The rim is erased with a feathered ring rather than
    a hard clip so the edge stays smooth at any display size. */
 const round=CROP.shape==="square";
 if(round){
  const r=out.w/2;
  x.globalCompositeOperation="destination-in";
  const g=x.createRadialGradient(r,r,r-1.5,r,r,r);
  g.addColorStop(0,"rgba(0,0,0,1)");
  g.addColorStop(1,"rgba(0,0,0,0)");
  x.fillStyle=g;
  x.beginPath();x.arc(r,r,r,0,Math.PI*2);x.fill();
  x.globalCompositeOperation="source-over"}

 /* Transparency has to survive, so a cut-out avatar is never encoded as JPEG:
    that is what filled the corners with white in the first place. WebP keeps
    alpha and is supported by the webview; PNG is the fallback. */
 const webp=c.toDataURL("image/webp").startsWith("data:image/webp");
 const type=webp?"image/webp":(round?"image/png":"image/jpeg");
 const ext=webp?"webp":(round?"png":"jpg");
 const q=type==="image/png"?undefined:.88;
 const blob=await new Promise(r=>c.toBlob(r,type,q));
 return {blob,ext,type,dataUrl:c.toDataURL(type,q)}}

/* Opens the editor. Resolves with the crop result, or null if cancelled. */
async function openCropper(file,shape){
 if(!file)return null;
 /* Animated GIFs are stored as-is: cropping one frame would kill the
    animation, and people upload them precisely because they move. */
 if(file.type==="image/gif")
  return {blob:file,ext:"gif",type:"image/gif",dataUrl:await fileDataUrl(file),animated:true};
 let bmp;
 try{bmp=await createImageBitmap(file)}
 catch(e){toast(t("img.fail"));return null}
 CROP.img=bmp;CROP.shape=shape;
 const el=document.getElementById("cropper");
 el.hidden=false;
 el.dataset.shape=shape;
 document.getElementById("crop-title").textContent=
  shape==="banner"?t("crop.banner"):shape==="cover"?t("crop.cover"):t("crop.avatar");
 requestAnimationFrame(()=>{el.dataset.open="true";cropReset()});
 return new Promise(r=>{CROP.resolve=r})}

function closeCropper(v){
 const el=document.getElementById("cropper");
 if(el){el.dataset.open="false";setTimeout(()=>{el.hidden=true},200)}
 const r=CROP.resolve;CROP.resolve=null;
 CROP.img?.close?.();CROP.img=null;
 if(r)r(v||null)}

const fileDataUrl=f=>new Promise(r=>{
 const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f)});

/* Pointer handling: one set of events covers mouse, touch and pen. */
(()=>{
 const stage=()=>document.getElementById("crop-stage");
 document.addEventListener("pointerdown",e=>{
  const st=stage();
  if(!st||!CROP.img||!e.target.closest("#crop-stage"))return;
  CROP.drag={px:e.clientX,py:e.clientY};
  st.setPointerCapture?.(e.pointerId);
  st.dataset.drag="true"});
 document.addEventListener("pointermove",e=>{
  if(!CROP.drag||!CROP.img)return;
  CROP.x+=e.clientX-CROP.drag.px;
  CROP.y+=e.clientY-CROP.drag.py;
  CROP.drag={px:e.clientX,py:e.clientY};
  cropClamp();cropPaint()});
 document.addEventListener("pointerup",()=>{
  CROP.drag=null;
  const st=stage();if(st)st.dataset.drag="false"});
 /* Wheel zoom must not scroll the panel behind the dialog. */
 document.addEventListener("wheel",e=>{
  if(!CROP.img||!e.target.closest("#crop-stage"))return;
  e.preventDefault();
  cropZoom(CROP.scale*(e.deltaY<0?1.12:1/1.12))},{passive:false});
 addEventListener("resize",()=>{if(CROP.img){cropClamp();cropPaint()}});
 document.getElementById("crop-zoom")?.addEventListener("input",e=>{
  cropZoom(CROP.min*(+e.target.value/100))});
 document.getElementById("crop-reset")?.addEventListener("click",cropReset);
 document.getElementById("crop-cancel")?.addEventListener("click",()=>closeCropper(null));
 document.getElementById("crop-ok")?.addEventListener("click",async()=>{
  const r=await cropResult();closeCropper(r)});
 document.addEventListener("keydown",e=>{
  const el=document.getElementById("cropper");
  if(!el||el.dataset.open!=="true")return;
  if(e.key==="Escape"){e.preventDefault();closeCropper(null)}});
})();

async function prepImage(file,kind){
 const animated=file.type==="image/gif";
 if(animated){
  if(file.size>IMG_MAX[kind])throw new Error(t("img.big.gif"));
  return {blob:file,ext:"gif",type:"image/gif"}}
 const img=await createImageBitmap(file);
 const c=document.createElement("canvas");
 if(kind==="avatar"){
  const side=Math.min(img.width,img.height);
  c.width=c.height=256;
  c.getContext("2d").drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,256,256);
 }else{
  /* 3:1 crop from the centre, matching how the banner is displayed. */
  const tw=1200,th=400,scale=Math.max(tw/img.width,th/img.height);
  const sw=tw/scale,sh=th/scale;
  c.width=tw;c.height=th;
  c.getContext("2d").drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,0,0,tw,th)}
 /* WebP where available: roughly half the bytes of JPEG at the same quality,
    and storage was a stated constraint. */
 const webp=c.toDataURL("image/webp").startsWith("data:image/webp");
 const type=webp?"image/webp":"image/jpeg";
 const blob=await new Promise(r=>c.toBlob(r,type,.86));
 if(!blob)throw new Error(t("img.fail"));
 return {blob,ext:webp?"webp":"jpg",type}}

async function uploadImage(file,kind){
 if(!file||!sb||!sbUser)return;
 const bucket=kind==="avatar"?"avatars":"banners";
 /* Let the user frame the picture instead of silently centre-cropping it.
    Cancelling the editor cancels the upload — nothing is written until they
    confirm what they can see. */
 const cropped=await openCropper(file,kind==="avatar"?"square":"banner");
 if(!cropped)return;
 try{
  toast(t("img.up"));
  const {blob,ext,type}=cropped;
  if(blob.size>IMG_MAX[kind])throw new Error(t(kind==="avatar"?"img.big":"img.big.gif"));
  /* The extension is part of the name, so switching from gif to webp would
     otherwise leave the old animated file being served. Remove the variants
     we might have written before. */
  const base=`${sbUser.id}/${kind}`;
  const path=`${base}.${ext}`;
  const stale=["gif","webp","jpg"].filter(e=>e!==ext).map(e=>`${base}.${e}`);
  const {error}=await sb.storage.from(bucket).upload(path,blob,{upsert:true,contentType:type});
  if(error)throw error;
  sb.storage.from(bucket).remove(stale).catch(()=>{});
  const url=sb.storage.from(bucket).getPublicUrl(path).data.publicUrl+"?v="+Date.now();
  const col=kind==="avatar"?"avatar_url":"banner_url";
  const {error:e2}=await sb.from("profiles").upsert({id:sbUser.id,[col]:url});
  if(e2)throw e2;
  sbProfile={...sbProfile,[col]:url};renderProfile();
  toast(t("img.ok"));
 }catch(e){toast(e.message||String(e))}}
const uploadAvatar=f=>uploadImage(f,"avatar");
const uploadBanner=f=>uploadImage(f,"banner");
/* Favorites sync.
   Favorites used to live only in localStorage, so they were tied to one
   machine. Now localStorage is the offline cache and the account is the truth.

   Merge rule on sign-in: union, never overwrite. Whoever signs in on a second
   machine expects to end up with both sets, and a "server wins" rule would
   silently delete everything they hearted while signed out. Deletions are
   therefore explicit — they travel as removals, not as an absence. */
const FAVQ={adds:new Map(),removes:new Map(),timer:0};
const favKey=tr=>tr.s+"\u0000"+tr.id;

function favRow(tr){
 return {source:tr.s,source_track_id:String(tr.id),title:tr.t||"\u2014",
  artist:tr.a||null,album:tr.al||null,duration:Math.max(0,Math.round(tr.d||0)),
  cover_url:tr.art||null,...(ANDROID?MOBILE.sanitizeCloudTrack(tr):{local_path:tr.path||null})}
}

/* Queue a change instead of firing a request per heart click. */
function queueFav(tr,on){
 const k=favKey(tr);
 if(on){FAVQ.removes.delete(k);FAVQ.adds.set(k,favRow(tr))}
 else{FAVQ.adds.delete(k);FAVQ.removes.set(k,[tr.s,String(tr.id)])}
 if(!sb||!sbUser)return;
 clearTimeout(FAVQ.timer);
 FAVQ.timer=setTimeout(()=>flushFavorites(),1200)}

async function flushFavorites(){
 if(!sb||!sbUser)return;
 if(!FAVQ.adds.size&&!FAVQ.removes.size)return;
 /* Take the batch before awaiting: clicks during the request belong to the next
    flush, not to this one. */
 const adds=[...FAVQ.adds.values()],removes=[...FAVQ.removes.values()];
 FAVQ.adds.clear();FAVQ.removes.clear();
 try{
  const {error}=await sb.rpc("sync_favorites",{adds,removes});
  if(error)throw error;
 }catch(e){
  console.warn("sync_favorites:",e.message||e);
  /* Put it back so nothing is lost when the network returns. */
  adds.forEach(r=>FAVQ.adds.set(r.source+"\u0000"+r.source_track_id,r));
  removes.forEach(r=>FAVQ.removes.set(r[0]+"\u0000"+r[1],r))}}

/* Pull the account's favorites and merge them into the local set. */
async function pullFavorites(){
 if(!sb||!sbUser)return;
 try{
  const {data,error}=await sb.from("favorites")
   .select("source,source_track_id,title,artist,album,duration,cover_url,local_path,added_at")
   .order("added_at",{ascending:true});
  if(error)throw error;

  let added=0;
  for(const r of data||[]){
   const known=TRACKS.find(x=>String(x.id)===String(r.source_track_id)&&x.s===r.source);
   if(known){
    known.fav=true;
    /* The server knows when this was hearted; carry it over so the Favorites
       tab can show newest first. Without it the list fell back to library
       insertion order and anything added later sank to the bottom. */
    known.favAt=Date.parse(r.added_at)||known.favAt||Date.now();
    /* Prefer whatever has real metadata: rows saved before a duration was
       known carry 0. */
    if(!known.art&&r.cover_url)known.art=r.cover_url;
    if((!known.d||known.d===0)&&r.duration)known.d=r.duration;
    continue}
   TRACKS.push({id:r.source_track_id,s:r.source,t:r.title,a:r.artist||"\u2014",
    al:r.album||"",d:r.duration||0,art:r.cover_url||null,
    /* Everything plays through the local proxy, so every track is "local" to
       the audio element regardless of which service it came from. */
    mode:"local",
    ...(r.local_path?{path:r.local_path}:{}),fav:true,
    favAt:Date.parse(r.added_at)||Date.now()});
   added++}

  /* Anything hearted offline is not on the server yet: push it now. */
  const remote=new Set((data||[]).map(r=>r.source+"\u0000"+r.source_track_id));
  TRACKS.filter(x=>x.fav&&!remote.has(favKey(x))).forEach(x=>{
   FAVQ.adds.set(favKey(x),favRow(x))});

  /* Local files whose path is missing on this machine stay visible but can't
     play; mark them so the UI can grey them out instead of failing on click. */
  if(TAURI){
   const paths=TRACKS.filter(x=>x.s==="local"&&x.path).map(x=>x.path);
   if(paths.length){
    try{await inv("local_rehydrate",{paths})}catch(e){console.warn("rehydrate:",e)}}}

  if(added||FAVQ.adds.size){save();if(S.view==="library")renderLib();renderWaveHint()}
  await flushFavorites();
 }catch(e){console.warn("pull favorites:",e.message||e)}}


/* User playlists, context menu and downloads.

   Local-first: the list lives in localStorage and is fully usable with no
   account at all — playlists used to be server-only, so anyone who never
   signed in simply had none. Signed in, the server copy wins for playlists
   it knows about, and purely local ones are pushed up on the next load. */
let PLAYLISTS=[],plOpen=null;

/* Local playlist ids carry a "loc-" prefix so a server row and its shadow
   can never collide; the prefix is what "managed by the server" means. */
const locPid=()=>"loc-"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const isLocalPl=p=>p&&String(p.id).startsWith("loc-");
const plSerialize=p=>({id:p.id,name:p.name,cover:p.cover||null,
 tracks:(p.tracks||[]).map(({id,s,t,a,al,d,art,mode})=>({id,s,t,a,al,d,art,mode}))});

async function loadPlaylists(){
 if(!sb||!sbUser)return PLAYLISTS;
 try{
  const {data,error}=await sb.from("playlists")
   /* No media_ref here: the production database does not have that column yet,
      and asking for it failed the whole select — signed-in users got no
      playlists at all. plRow still reads it if a future schema adds it. */
   .select("id,name,is_public,updated_at,cover_url,playlist_tracks(source,source_track_id,title,artist,album,duration,cover_url,local_path,position)")
   .eq("owner_id",sbUser.id).order("updated_at",{ascending:false});
  if(error)throw error;
  const server=(data||[]).map(p=>({...p,
   /* Server value first; the local cache covers the offline case and the
      moment right after a crop, before the update round-trip lands. */
   cover:p.cover_url||S.plCovers?.[p.id]||null,
   tracks:(p.playlist_tracks||[]).sort((a,b)=>a.position-b.position).map(plRow)}));
  /* Playlists created while signed out are pushed up now; their local id is
     swapped for the server's so later edits hit the real row. A playlist whose
     id got remapped loses its pinned EQ preset (keyed by id) — rare enough to
     live with rather than building an id-migration table. */
  const adopted=[];
  for(const p of PLAYLISTS.filter(isLocalPl)){
   try{
    const {data:pid,error:e1}=await sb.rpc("create_playlist",{name:p.name,public_flag:false});
    if(e1||!pid)throw e1||new Error("no id returned");
    const {error:e2}=await sb.rpc("playlist_sync",{pid,tracks:p.tracks.map(plPayload),replace_all:true});
    if(e2)throw e2;
    if(p.cover)sb.from("playlists").update({cover_url:p.cover}).eq("id",pid).then(()=>{},()=>{});
    if(plOpen===p.id)plOpen=pid;
    adopted.push({...p,id:pid});
   }catch(e){console.warn("push local playlist:",e.message||e);adopted.push(p)}
  }
  PLAYLISTS=[...server,...adopted];
  save();if(S.view==="library")renderLib();
 }catch(e){console.warn("playlists:",e.message||e)}
 return PLAYLISTS}

/* Server row -> the shape the player already understands, so a playlist track
   is playable without any special-casing downstream. */
const plRow=r=>({id:r.source_track_id,s:r.source,t:r.title||"—",a:r.artist||"—",
 al:r.album||"",d:r.duration||0,art:r.cover_url||null,
 mode:"local",...(r.media_ref?{mediaRef:r.media_ref}:{}),...(r.local_path?{path:r.local_path}:{})});
const plPayload=tr=>({source:tr.s,source_track_id:String(tr.id),title:tr.t||"—",
 artist:tr.a||null,album:tr.al||null,duration:Math.max(0,Math.round(tr.d||0)),
 cover_url:tr.art||null,...(ANDROID?MOBILE.sanitizeCloudTrack(tr):{local_path:tr.path||null})});

async function newPlaylist(name){
 const n=(name||"").trim();if(!n)return;
 const pl={id:locPid(),name:n,cover:null,tracks:[]};
 PLAYLISTS.unshift(pl);save();renderLib();
 /* toast() assigns textContent, so escaping here would display the entities
    literally: a playlist called "Rock & Roll" showed as "Rock &amp; Roll". */
 toast(t("pl.made").replace("{n}",n));
 if(sb&&sbUser){
  try{
   const {data,error}=await sb.rpc("create_playlist",{name:n,public_flag:false});
   if(error)throw error;
   /* Adopt the server id while the playlist is still empty, so every later
      edit syncs against the real row. Offline, the loc- id is kept. */
   if(data){if(plOpen===pl.id)plOpen=data;pl.id=data;save()}
  }catch(e){console.warn("create playlist:",e.message||e)}
 }
 return pl.id}

async function addToPlaylist(pid,tr){
 const pl=PLAYLISTS.find(p=>p.id===pid);if(!pl)return;
 if(pl.tracks.some(x=>String(x.id)===String(tr.id)&&x.s===tr.s))
  return toast(t("pl.dup"));
 /* Optimistic: the local list is the offline truth. A server-synced playlist
    rolls the change back if the round trip fails, so the two never disagree. */
 pl.tracks.push(tr);save();
 if(S.view==="library"&&S.tab==="pl")renderLib();
 toast(t("pl.added").replace("{n}",pl.name));
 autoDownload(tr,pl.name);
 if(sb&&sbUser&&!isLocalPl(pl)){
  try{
   const {error}=await sb.rpc("playlist_sync",{pid,tracks:pl.tracks.map(plPayload),replace_all:true});
   if(error)throw error;
  }catch(e){
   pl.tracks=pl.tracks.filter(x=>!(String(x.id)===String(tr.id)&&x.s===tr.s));
   save();if(S.view==="library"&&S.tab==="pl")renderLib();
   toast(String(e.message||e))}
 }}

/* Per-track equaliser presets.
   Stored as a map of "service:id" -> preset id, not as a copy of the curve:
   editing a preset then updates every track using it, which is what people
   expect from a preset. */
const trackKey=tr=>tr?`${tr.s}:${tr.id}`:"";

/* Disliked tracks.

   Stored as a plain set of "service:id" keys rather than a copy of the track:
   the point is only "never offer this again", and a key survives the track
   object being rebuilt by a later search. Everything that picks what to play
   goes through isDisliked(), so one filter covers the queue, autoplay and the
   wave seed. */
function isDisliked(tr){return !!tr&&!!S.dislikes?.[trackKey(tr)]}
function toggleDislike(tr){
 if(!tr||tr.mode==="empty")return;
 S.dislikes=S.dislikes||{};
 const k=trackKey(tr),was=!!S.dislikes[k];
 if(was)delete S.dislikes[k];
 else{
  S.dislikes[k]=1;
  /* Hiding something also means unhearting it: keeping it in favourites would
     put it straight back into the wave seed. */
  if(tr.fav){tr.fav=false;queueFav(tr,false);
   document.querySelectorAll(`[data-fav="${cssEsc(tr.id)}"]`).forEach(el=>el.setAttribute("aria-pressed","false"))}
  queue=queue.filter(x=>!sameTrack(x,tr));
  HISTORY=HISTORY.filter(h=>!sameTrack(h.tr,tr))}
 save();
 /* The account keeps a copy, so the wave on another machine already knows
    what was hidden here. */
 pushPrefs();
 toast(t(was?"dis.off":"dis.on"));
 /* Skip forward when the thing being hidden is the thing playing. */
 if(!was&&sameTrack(tr,S.current))next();
 else{renderNP();renderWaveHint();if(S.view==="library")renderLib()}
 if(fp.dataset.open==="true"&&S.fpTab==="queue")renderFPBody();
 renderDislikes();
 document.querySelectorAll("#npdislike").forEach(b=>b.setAttribute("aria-pressed",String(isDisliked(S.current))))}

/* Hiding a track was one-way: the keys lived in localStorage with no UI to read
   them back, so an accidental hide was permanent. This is that list. */
function renderDislikes(){
 const box=document.getElementById("disbox");
 if(!box)return;
 const keys=Object.keys(S.dislikes||{});
 if(!keys.length){box.textContent=t("dis.none");return}
 box.innerHTML=`<p style="margin:0 0 8px">${keys.length}</p>`
  +`<div class="ctxchips">`+keys.map(k=>{
   /* The key is "service:id"; the track object may be long gone, so show
      whatever the library still knows and fall back to the key. */
   const [s,...rest]=k.split(":");
   const id=rest.join(":");
   const tr=TRACKS.find(x=>x.s===s&&String(x.id)===id);
   const label=tr?`${tr.a||"—"} — ${tr.t||id}`:`${svc(s).name}: ${id}`;
   return `<button data-undis="${esc(k)}" title="${esc(t("dis.off"))}">${esc(label)} ✕</button>`
  }).join("")+`</div>`
  +`<button class="btn" id="disclr" style="margin-top:10px">${esc(t("dis.clr"))}</button>`;
 box.querySelectorAll("[data-undis]").forEach(b=>b.onclick=()=>{
  delete S.dislikes[b.dataset.undis];
  save();renderDislikes();renderLib();renderWaveHint()});
 const clr=document.getElementById("disclr");
 if(clr)clr.onclick=()=>{
  S.dislikes={};save();renderDislikes();renderLib();renderWaveHint();
  toast(t("dis.cleared"))}}

/* Adaptive accent: the palette follows the artwork.

   The cover is drawn into a 16×16 canvas and the most saturated non-extreme
   pixel wins. Downscaling to 16 pixels is what makes this cheap enough to run
   on every track change — the browser does the averaging in the draw call, and
   there are 256 pixels to score rather than a million. Grey and near-black
   pixels are skipped, otherwise a dark cover always resolves to charcoal.

   Only remote covers reach this: a local file with no artwork keeps the chosen
   accent instead of resetting the whole interface to grey. */
let accentAdaptCache={};
function adaptAccent(tr){
 if(S.accent!=="adaptive")return;
 if(!tr||!tr.art)return;
 const hit=accentAdaptCache[trackKey(tr)];
 if(hit)return applyAccentRgb(hit);
 const img=new Image();
 img.crossOrigin="anonymous";
 img.onload=()=>{
  try{
   const c=document.createElement("canvas");c.width=c.height=16;
   const g=c.getContext("2d",{willReadFrequently:true});
   g.drawImage(img,0,0,16,16);
   const d=g.getImageData(0,0,16,16).data;
   let best=null,bestScore=-1;
   for(let i=0;i<d.length;i+=4){
    const r=d[i],gg=d[i+1],b=d[i+2],a=d[i+3];
    if(a<200)continue;
    const mx=Math.max(r,gg,b),mn=Math.min(r,gg,b);
    /* Reject the ends of the range: pure black and blown-out white carry no
       hue, and a UI accent taken from them is invisible either way. */
    if(mx<45||mn>225)continue;
    const sat=mx===0?0:(mx-mn)/mx;
    /* Saturation matters more than brightness, but a mid-tone reads better on
       both themes than a very dark or very bright pixel of the same hue. */
    const score=sat*2+(1-Math.abs(mx/255-.62));
    if(score>bestScore){bestScore=score;best=[r,gg,b]}}
   if(!best)return;
   const rgb=liftForUi(best);
   accentAdaptCache[trackKey(tr)]=rgb;
   /* The cache is per session and bounded: covers change constantly. */
   const keys=Object.keys(accentAdaptCache);
   if(keys.length>200)delete accentAdaptCache[keys[0]];
   if(sameTrack(tr,S.current))applyAccentRgb(rgb);
  }catch(e){/* a cover served without CORS taints the canvas; keep the accent */}};
  img.onerror=()=>{};
  /* Through the relay when available: same-origin bytes keep the canvas
     untainted, and blocked cover hosts are bypassed. */
  img.src=cssUrlRaw(tr.art)||tr.art}

/* Pushes a colour towards a lightness that works as an accent on either theme,
   keeping its hue. A muted album cover otherwise produces an accent too dim to
   read against the panel background. */
function liftForUi([r,g,b]){
 const light=document.documentElement.dataset.theme==="light";
 const mx=Math.max(r,g,b)/255;
 const want=light?.72:.82;
 if(mx<.05)return [r,g,b];
 let k=want/mx;
 /* Never darken a bright colour by much, and never over-brighten past white. */
 k=Math.max(light?.55:1,Math.min(k,2.6));
 const out=[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v*k))));
 /* Guarantee some saturation survives the lift, or the accent turns grey. */
 const omx=Math.max(...out),omn=Math.min(...out);
 if(omx-omn<28){
  const i=out.indexOf(omx);
  out[i]=Math.min(255,out[i]+28)}
 return out}

function applyAccentRgb([r,g,b]){
 const st=document.documentElement.style;
 document.documentElement.dataset.accent="adaptive";
 st.setProperty("--accent",`rgb(${r} ${g} ${b})`);
 st.setProperty("--accent-soft",`rgb(${r} ${g} ${b} / .16)`);
 st.setProperty("--accent-rgb",`${r} ${g} ${b}`);
 st.setProperty("--pr",r);st.setProperty("--pg",g);st.setProperty("--pb",b);
 /* The particle sprites are pre-tinted, so their cache has to go. */
 spriteCache={}}
function applyTrackPreset(tr){
 /* A track's own preset wins over its playlist's: the more specific choice is
    the one the user made last and about this exact song. */
 const id=S.eqByTrack?.[trackKey(tr)]||plPresetFor(tr);
 if(!id)return;
 const p=allP().find(x=>x.id===id);
 if(!p)return;
 S.eq=[...p.g];S.preset=p.id;
 renderBands();applyEQ();renderPresets()}

/* The playlist-level preset applies to whichever playlist is currently open,
   which is the only unambiguous answer: a track can sit in several playlists,
   and guessing between them would change the sound at random. */
function plPresetFor(tr){
 if(!plOpen)return null;
 const pl=PLAYLISTS.find(p=>p.id===plOpen);
 if(!pl||!pl.tracks.some(x=>String(x.id)===String(tr.id)&&x.s===tr.s))return null;
 return S.eqByPl?.[plOpen]||null}
function pinPresetToTrack(tr,presetId){
 if(!tr)return;
 S.eqByTrack=S.eqByTrack||{};
 if(presetId)S.eqByTrack[trackKey(tr)]=presetId;
 else delete S.eqByTrack[trackKey(tr)];
 save();
 toast(presetId?t("eq.pinned"):t("eq.unpinned"))}

async function deletePlaylist(pid){
 const pl=PLAYLISTS.find(p=>p.id===pid);if(!pl)return;
 if(!await askConfirm(t("pl.del.ask").replace("{n}",pl.name),t("pl.del")))return;
 PLAYLISTS=PLAYLISTS.filter(p=>p.id!==pid);plOpen=null;save();renderLib();toast(t("pl.deleted"));
 if(sb&&sbUser&&!isLocalPl(pl)){
  try{
   const {error}=await sb.from("playlists").delete().eq("id",pid).eq("owner_id",sbUser.id);
   if(error)throw error;
  }catch(e){console.warn("delete playlist:",e.message||e)}
 }}

async function removeFromPlaylist(pid,tr){
 const pl=PLAYLISTS.find(p=>p.id===pid);if(!pl)return;
 const next=pl.tracks.filter(x=>!(String(x.id)===String(tr.id)&&x.s===tr.s));
 if(next.length===pl.tracks.length)return;
 pl.tracks=next;save();renderLib();
 if(sb&&sbUser&&!isLocalPl(pl)){
  try{
   const {error}=await sb.rpc("playlist_sync",{pid,tracks:next.map(plPayload),replace_all:true});
   if(error)throw error;
  }catch(e){
   pl.tracks.push(tr);save();renderLib();
   toast(String(e.message||e))}
 }}

/* Downloads go through Rust: the service URLs are signed and short-lived, and
   opening one in a browser window was never what the user meant. */
/* Download settings. */
function renderDlSettings(){
 const d=document.getElementById("dl-dir");
 if(d)d.textContent=S.dlDir||t("dl.dir.none");
 [["dl-ask","dlAsk"],["dl-autofav","dlAutoFav"],["dl-autopl","dlAutoPl"]].forEach(([id,key])=>{
  const el=document.getElementById(id);
  if(el)el.setAttribute("aria-pressed",!!S[key])});
 setSeg("dl-mode",S.dlMode);
 /* Processing needs ffmpeg. Rather than letting the choice fail at download
    time, the option is disabled and says why. */
 const fx=document.querySelector('#dl-mode [data-v="fx"]');
 if(fx){
  const ok=HAS_FFMPEG!==false;
  fx.disabled=!ok;
  fx.title=ok?"":t("dl.fx.need");
  if(!ok&&S.dlMode==="fx"){S.dlMode="raw";setSeg("dl-mode","raw")}}
 const ff=document.getElementById("dl-ff");
 if(ff)ff.textContent=HAS_FFMPEG===null?"":HAS_FFMPEG?t("dl.ff.yes"):t("dl.ff.no")}

let HAS_FFMPEG=null;
async function checkFfmpeg(){
 if(!TAURI)return;
 try{HAS_FFMPEG=await inv("has_ffmpeg")}catch(e){HAS_FFMPEG=false}
 renderDlSettings()}

document.getElementById("dl-pick")?.addEventListener("click",pickDownloadDir);
seg("dl-mode",v=>{S.dlMode=v});
[["dl-ask","dlAsk"],["dl-autofav","dlAutoFav"],["dl-autopl","dlAutoPl"]].forEach(([id,key])=>{
 document.getElementById(id)?.addEventListener("click",()=>{
  S[key]=!S[key];
  /* Auto-download needs somewhere to write; asking mid-download is worse than
     asking now. */
  if(S[key]&&(key==="dlAutoFav"||key==="dlAutoPl")&&!S.dlDir)pickDownloadDir();
  renderDlSettings();save()})});

/* Update check. */
async function checkUpdate(manual){
 if(!TAURI)return;
 const st=document.getElementById("upd-state");
 if(manual&&st)st.textContent=t("upd.checking");
 try{
  const u=await inv("update_check");
  if(!u?.available){if(st)st.textContent=t("upd.none").replace("{v}",u?.current_version||"");return}
  if(st)st.textContent=t("upd.found").replace("{v}",u.version);
  const go=await showModal({title:t("upd.ask").replace("{v}",u.version),
   label:(u.body||"").slice(0,300),input:false,confirm:t("upd.install")});
  if(!go)return;
  toast(t("upd.installing"),20000);
  await inv("update_install");
 }catch(e){
  /* Before the first tagged release the endpoint has no latest.json, and the
     raw error ("could not fetch a valid release JSON") reads like a broken
     app rather than "nothing published yet". */
  const msg=String(e.message||e);
  const none=/release JSON|404|not found/i.test(msg);
  if(st)st.textContent=none?t("upd.norelease"):msg;
  if(manual)toast(none?t("upd.norelease"):t("upd.fail")+": "+msg,5200)}}
document.getElementById("upd-btn")?.addEventListener("click",()=>checkUpdate(true));
/* Memory, on demand from Настройки → О приложении.
   Rust counts this process plus every descendant, because the webview renders
   in its own processes on Windows and macOS — reporting only our own RSS would
   advertise ~40 MB for a window that really costs several hundred. The heap
   line is Chromium-only (performance.memory) and simply does not appear on
   WebKit rather than showing a wrong zero. */
document.getElementById("mem-btn")?.addEventListener("click",async()=>{
 const el=document.getElementById("mem-info");if(!el)return;
 el.textContent=t("mem.work");
 try{
  const m=await inv("mem_info");
  const mb=t("unit.mb");
  const heap=(typeof performance!=="undefined"&&performance.memory&&performance.memory.usedJSHeapSize)||0;
  let s=`${m.total_mb} ${mb} — ${t("mem.self")} ${m.self_mb} ${mb}, ${t("mem.webv")} ${m.children_mb} ${mb} (${m.procs})`;
  if(heap)s+=` · ${t("mem.heap")} ${Math.round(heap/1048576)} ${mb}`;
  el.textContent=s;
 }catch(e){el.textContent=String(e.message||e)}});

/* Asks once where downloads should go, then remembers it. Being prompted on
   every single track is worse than never being asked, so the folder is a
   setting with an explicit "ask every time" option. */
async function pickDownloadDir(){
 if(!TAURI)return null;
 const dlg=dlgApi();
 if(!dlg?.open){toast(t("loc.nodlg"));return null}
 try{
  const f=await dlg.open({directory:true,multiple:false,
   defaultPath:S.dlDir||undefined});
  if(!f)return null;
  const dir=Array.isArray(f)?f[0]:f;
  S.dlDir=dir;save();renderDlSettings();
  return dir;
 }catch(e){console.warn("pick dir:",e);return null}}

/* Windows rejects these characters outright, and a stray separator would
   silently write somewhere else entirely. */
const safeName=s=>String(s||"").replace(/[<>:"\/\|?*\x00-\x1f]/g,"_").trim().slice(0,80)||"Meowave";

/* sub: when the track came from a playlist, files are grouped in a subfolder
   named after it. */
const joinPath=(dir,name)=>{
 /* Separator taken from the path itself: a hardcoded "\" produced file names
    containing a backslash on macOS and Linux. */
 const sep=dir.includes("\\")&&!dir.includes("/")?"\\":"/";
 return dir.replace(/[\\/]+$/,"")+sep+name};
async function downloadTrack(tr,sub,dirOverride){
  if(!TAURI)return toast(t("dl.desktop"));
  if(tr.s==="local")return toast(t("dl.already"));
  /* The proxy has to be up: Rust downloads through it, using its own port. */
  if(!await ensureStreamPort())return toast(t("dl.noport"));

  let dir=dirOverride||S.dlDir||null;
  /* A batch (playlist download) resolves the folder once, upstream. Asking
     per track meant a dialog for every song in the playlist. */
  if(!dirOverride&&(S.dlAsk||!dir)){
   dir=await pickDownloadDir();
   if(!dir)return null}
 if(sub)dir=joinPath(dir,safeName(sub));

 toast(t("dl.start").replace("{n}",tr.t||""));
 try{
  const path=await inv("download_track",{
   service:tr.s,id:String(tr.id),
   name:`${tr.a||"—"} - ${tr.t||"track"}`,
   folder:dir,hq:hqFlag()===1,fmt:tr.s==="ytm"?ytmFmt(tr):"best"});
  toast(t("dl.ok").replace("{n}",String(path).split(/[\\/]/).pop()),5200);
  return path;
 }catch(e){toast(t("dl.fail")+": "+String(e.message||e),5200);return null}}

/* Bakes the live sound into the file: the nine EQ bands and the playback rate.
   The plain download saves what the service sent, which loses the whole point
   of a "slowed" or "sped up" export — those live in the Web Audio graph, not in
   the bytes. Needs ffmpeg, so the button is only offered when it is present. */
async function downloadProcessed(tr,sub,dirOverride){
  if(!TAURI)return toast(t("dl.desktop"));
  if(tr.s==="local")return toast(t("dl.already"));
  if(!HAS_FFMPEG)return toast(t("dl.fx.need"),5200);
  if(!await ensureStreamPort())return toast(t("dl.noport"));

  let dir=dirOverride||S.dlDir||null;
  if(!dirOverride&&(S.dlAsk||!dir)){
   dir=await pickDownloadDir();
   if(!dir)return null}
 if(sub)dir=joinPath(dir,safeName(sub));

 /* S.rate is the playback speed. S.sp.speed is the orbit speed of the 3D
    panner — a completely different control that happened to have a similar
    name, and using it here exported the wrong tempo. */
 const rate=S.rate||1;
 const tag=rate>1.02?"speed up":rate<0.98?"slowed":"eq";
 toast(t("dl.fx.busy").replace("{n}",tr.t||""),4000);
 try{
  const path=await inv("download_processed",{
   service:tr.s,id:String(tr.id),
   name:`${tr.a||"—"} - ${tr.t||"track"}`,
   folder:dir,hq:hqFlag()===1,
   fmt:tr.s==="ytm"?ytmFmt(tr):"best",
   gains:S.eq.map(Number),rate,suffix:tag});
  toast(t("dl.ok").replace("{n}",String(path).split(/[\\/]/).pop()),5200);
  return path;
 }catch(e){
  const msg=String(e.message||e);
  toast(msg==="ffmpeg-missing"?t("dl.fx.need"):t("dl.fail")+": "+msg,5200);
  return null}}

/* Downloads a whole playlist, one track at a time. Sequential on purpose:
   several services rate-limit hard, and a parallel burst gets the entire batch
   throttled rather than finishing sooner. */
async function downloadPlaylist(pid){
 const pl=PLAYLISTS.find(p=>p.id===pid);
 if(!pl||!pl.tracks.length)return;
 if(!TAURI)return toast(t("dl.desktop"));
  let dir=S.dlDir;
  /* One decision for the whole batch — including when dlAsk is on. */
  if(!dir||S.dlAsk){const picked=await pickDownloadDir();if(!picked)return;dir=picked}
  const list=pl.tracks.filter(x=>x.s!=="local");
  if(!list.length)return toast(t("dl.pl.local"));
  let ok=0,bad=0;
  const one=S.dlMode==="fx"&&HAS_FFMPEG?downloadProcessed:downloadTrack;
  toast(t("dl.pl.start").replace("{n}",pl.name).replace("{c}",list.length),4000);
  for(const tr of list){(await one(tr,pl.name,dir))?ok++:bad++}
 toast(t("dl.pl.done").replace("{ok}",ok).replace("{bad}",bad),6000)}

/* Optional: keep a copy whenever a track is favourited or added to a playlist.
   Off by default — quietly filling someone's disk is not a nice surprise. */
function autoDownload(tr,playlistName){
 if(!TAURI||!tr||tr.s==="local")return;
 const want=playlistName?S.dlAutoPl:S.dlAutoFav;
 if(!want||!S.dlDir)return;
 /* Honours the raw/processed choice, so an automatic copy is the same file the
    user would have got by hand. */
 (S.dlMode==="fx"&&HAS_FFMPEG?downloadProcessed:downloadTrack)(tr,playlistName||null)}

/* Context menu. Right-click used to fall through to the webview's own menu
   ("reload", "view source"), which is useless in a player. */
const CTX={el:null,tr:null};
function closeCtx(){if(CTX.el){CTX.el.remove();CTX.el=null;CTX.tr=null}}
function openCtx(x,y,tr){
 closeCtx();
 CTX.tr=tr;
 const m=document.createElement("div");
 m.className="ctx pane";
 const pls=PLAYLISTS.map(p=>
  `<button data-ctx="pl" data-pid="${esc(p.id)}">${esc(p.name)} <em>${p.tracks.length}</em></button>`).join("");
 const remote=tr.s!=="local";
 m.innerHTML=`
  <button data-ctx="play"><i data-lucide="play" width="14" height="14"></i>${t("ctx.play")}</button>
  <button data-ctx="qnext"><i data-lucide="corner-down-right" width="14" height="14"></i>${t("ctx.qnext")}</button>
  <button data-ctx="qlast"><i data-lucide="list-end" width="14" height="14"></i>${t("ctx.qlast")}</button>
  <button data-ctx="fav"><i data-lucide="heart" width="14" height="14"></i>${tr.fav?t("ctx.unfav"):t("ctx.fav")}</button>
  <button data-ctx="artist"><i data-lucide="user" width="14" height="14"></i>${t("ctx.artist")}</button>
  ${tr.s==="local"?`<button data-ctx="rmlocal"><i data-lucide="trash-2" width="14" height="14"></i>${t("ctx.rmlocal")}</button>`:""}
  ${remote?`<div class="sep"></div>
  <span class="lbl">${t("dl.preset.t")}</span>
  <button data-ctx="dl"><i data-lucide="download" width="14" height="14"></i>${t("dl.raw")}</button>
  <button data-ctx="dlfx"${HAS_FFMPEG?"":" disabled title=\""+esc(t("dl.fx.need"))+"\""}><i data-lucide="sliders-horizontal" width="14" height="14"></i>${t("dl.withfx")}</button>`:""}
  <div class="sep"></div>
  <span class="lbl">${t("ctx.addto")}</span>
  ${pls||`<span class="lbl dim">${t("ctx.nopl")}</span>`}
  <button data-ctx="newpl"><i data-lucide="plus" width="14" height="14"></i>${t("ctx.newpl")}</button>
  <div class="sep"></div>
  <span class="lbl">${t("ctx.eq")}</span>
  <div class="ctxchips">
   ${allP().map(p=>`<button data-ctx="eq" data-eq="${esc(p.id)}"
    aria-pressed="${S.eqByTrack?.[trackKey(tr)]===p.id}">${esc(p.n?.[LANG]||p.n?.ru||p.id)}</button>`).join("")}
   ${S.eqByTrack?.[trackKey(tr)]?`<button data-ctx="eqoff" class="off">${t("ctx.eq.off")}</button>`:""}
  </div>`;
 document.body.appendChild(m);
 CTX.el=m;
 placeMenu(m,x,y);
 icons()}

/* Positions a floating menu inside the viewport.
   Flips above the anchor when there is no room below — the old version clamped
   to the bottom edge, so a menu opened from the player bar covered the very
   control that opened it. */
function placeMenu(m,x,y){
 const r=m.getBoundingClientRect(),pad=8;
 let left=x,top=y;
 if(left+r.width>innerWidth-pad)left=Math.max(pad,innerWidth-r.width-pad);
 if(top+r.height>innerHeight-pad){
  const above=y-r.height-10;
  top=above>pad?above:Math.max(pad,innerHeight-r.height-pad)}
 m.style.left=left+"px";
 m.style.top=top+"px";
 requestAnimationFrame(()=>m.dataset.open="true")}


/* The "+" on the player bar.
   A focused menu rather than the full right-click one: from the bar the two
   things people want are "put this somewhere" and "keep this on the device".
   The full menu is still a right-click away on any row. */
function openAddMenu(x,y,tr){
 closeCtx();
 CTX.tr=tr;
 const m=document.createElement("div");
 m.className="ctx pane";
 const remote=tr.s!=="local";
 const pls=PLAYLISTS.map(p=>
  `<button data-ctx="pl" data-pid="${esc(p.id)}">${esc(p.name)} <em>${p.tracks.length}</em></button>`).join("");
 m.innerHTML=`
  <span class="lbl">${t("ctx.addto")}</span>
  ${pls||`<span class="lbl dim">${t("ctx.nopl")}</span>`}
  <button data-ctx="newpl"><i data-lucide="plus" width="14" height="14"></i>${t("ctx.newpl")}</button>
  <div class="sep"></div>
  <button data-ctx="fav"><i data-lucide="heart" width="14" height="14"></i>${tr.fav?t("ctx.unfav"):t("ctx.fav")}</button>
  <button data-ctx="qnext"><i data-lucide="corner-down-right" width="14" height="14"></i>${t("ctx.qnext")}</button>
  ${remote?`<div class="sep"></div>
  <span class="lbl">${t("dl.preset.t")}</span>
  <button data-ctx="dl"><i data-lucide="download" width="14" height="14"></i>${t("dl.raw")}</button>
  <button data-ctx="dlfx"${HAS_FFMPEG?"":" disabled title=\""+esc(t("dl.fx.need"))+"\""}><i data-lucide="sliders-horizontal" width="14" height="14"></i>${t("dl.withfx")}</button>`
  :`<div class="sep"></div><span class="lbl dim">${t("dl.already")}</span>`}`;
 document.body.appendChild(m);
 CTX.el=m;
 placeMenu(m,x,y);
 icons()}

/* Context menu for a playlist tile.

   Everything a playlist needs was previously only reachable by opening it, and
   changing its artwork was not possible at all. Right-click is where people
   look for this, so it lives here: cover, download, a default equaliser preset
   for the whole playlist, rename and delete.

   Kept separate from the track menu rather than overloading one builder: the
   two share no actions, and a single function branching on type is how the
   wrong item ends up acting on the wrong target. */
const PLCTX={el:null,pid:null};
function closePlCtx(){if(PLCTX.el){PLCTX.el.remove();PLCTX.el=null;PLCTX.pid=null}}
function openPlCtx(x,y,pid){
 closeCtx();closePlCtx();
 const pl=PLAYLISTS.find(p=>p.id===pid);if(!pl)return;
 PLCTX.pid=pid;
 const m=document.createElement("div");
 m.className="ctx pane";
 const cur=S.eqByPl?.[pid];
 m.innerHTML=`
  <button data-plctx="play"><i data-lucide="play" width="14" height="14"></i>${t("pl.playall")}</button>
  <button data-plctx="cover"><i data-lucide="image" width="14" height="14"></i>${t("plctx.cover")}</button>
  ${pl.cover?`<button data-plctx="coveroff"><i data-lucide="image-off" width="14" height="14"></i>${t("plctx.coveroff")}</button>`:""}
  <button data-plctx="dl"><i data-lucide="download" width="14" height="14"></i>${t("pl.dl")}</button>
  <button data-plctx="rename"><i data-lucide="pencil" width="14" height="14"></i>${t("plctx.rename")}</button>
  <div class="sep"></div>
  <span class="lbl">${t("plctx.eq")}</span>
  <div class="ctxchips">
   ${allP().map(p=>`<button data-plctx="eq" data-eq="${esc(p.id)}"
    aria-pressed="${cur===p.id}">${esc(p.n?.[LANG]||p.n?.ru||p.id)}</button>`).join("")}
   ${cur?`<button data-plctx="eqoff" class="off">${t("ctx.eq.off")}</button>`:""}
  </div>
  <div class="sep"></div>
  <button data-plctx="del" class="danger"><i data-lucide="trash-2" width="14" height="14"></i>${t("pl.del")}</button>`;
 document.body.appendChild(m);
 PLCTX.el=m;
 placeMenu(m,x,y);
 icons()}

addEventListener("click",e=>{
 if(!PLCTX.el)return;
 const b=e.target.closest("[data-plctx]");
 if(!b){closePlCtx();return}
 const pid=PLCTX.pid,act=b.dataset.plctx;
 const pl=PLAYLISTS.find(p=>p.id===pid);
 closePlCtx();
 if(!pl)return;
 if(act==="play"&&pl.tracks.length)setTrack(pl.tracks[0],true,true,"pl:"+pl.id)
 else if(act==="cover")pickPlCover(pid);
 else if(act==="coveroff")setPlCover(pid,null);
 else if(act==="dl")downloadPlaylist(pid);
 else if(act==="rename")renamePlaylist(pid);
 else if(act==="eq"){S.eqByPl={...(S.eqByPl||{}),[pid]:b.dataset.eq};save();toast(t("eq.pl.pinned"))}
 else if(act==="eqoff"){const n={...(S.eqByPl||{})};delete n[pid];S.eqByPl=n;save();toast(t("eq.unpinned"))}
 else if(act==="del")deletePlaylist(pid);
 e.stopPropagation()},true);


/* Playlist cover picker: crop first, then store. Kept as a data URL so a cover
   survives offline and does not need a Storage bucket per playlist \u2014 512px
   webp is a few tens of kilobytes. GIFs skip the editor on purpose (cropping
   would freeze the animation) but are capped, because they are stored as-is:
   a multi-megabyte base64 would silently blow past the localStorage quota and
   the cover would be gone on the next start. */
document.getElementById("plc-file")?.addEventListener("change",async e=>{
 const f=e.target.files?.[0];
 const pid=e.target.dataset.pid;
 e.target.value="";
 if(!f||!pid)return;
 const r=await openCropper(f,"cover");
 if(!r)return;
 if(r.blob.size>2*1024*1024)return toast(t("img.big"));
 setPlCover(pid,r.dataUrl)});

/* Playlist cover: a local image, cropped square in the same editor used for
   avatars, then stored with the playlist. */
async function pickPlCover(pid){
 const f=document.getElementById("plc-file");
 if(!f)return;
 f.dataset.pid=pid;
 f.value="";
 f.click()}

async function setPlCover(pid,dataUrl){
 const pl=PLAYLISTS.find(p=>p.id===pid);if(!pl)return;
 pl.cover=dataUrl||null;
 /* Persist to the account when signed in; the column already exists. */
 if(sb&&sbUser&&!isLocalPl(pl)){
  try{await sb.from("playlists").update({cover_url:pl.cover}).eq("id",pid)}
  catch(e){console.warn("cover:",e.message||e)}}
 save();renderLib();
 toast(dataUrl?t("plctx.cover.ok"):t("plctx.cover.off"))}

async function renamePlaylist(pid){
 const pl=PLAYLISTS.find(p=>p.id===pid);if(!pl)return;
 const n=await askText(t("plctx.rename"),pl.name);
 if(!n||n===pl.name)return;
 pl.name=n;
 if(sb&&sbUser&&!isLocalPl(pl)){
  try{await sb.from("playlists").update({name:n}).eq("id",pid)}
  catch(e){console.warn("rename:",e.message||e)}}
 save();renderLib();toast(t("plctx.renamed"))}

addEventListener("contextmenu",e=>{
 /* Inside a text field the native menu is the expected one (cut/copy/paste),
    so it stays. Everywhere else the webview's "Reload / View source" menu is
    both useless and a reminder that this is a browser. */
 if(e.target.closest("input,textarea,[contenteditable]"))return;
 e.preventDefault();
 /* Playlist tiles first: a tile is not inside a row, but checking the row
    first would still match nothing and fall through silently. */
 const tile=e.target.closest("[data-plid]");
 if(tile){openPlCtx(e.clientX,e.clientY,tile.dataset.plid);return}
 const row=e.target.closest("[data-track]");
 if(!row)return;
 const tr=findTrack(row.dataset.track,row.dataset.svc);
 if(tr)openCtx(e.clientX,e.clientY,tr)});
addEventListener("click",e=>{
 if(!CTX.el)return;
 const b=e.target.closest("[data-ctx]");
 if(!b){closeCtx();return}
 const tr=CTX.tr,act=b.dataset.ctx;
 if(b.disabled){e.stopPropagation();return}
 closeCtx();
 if(!tr)return;
 if(act==="play")setTrack(tr,true);
 else if(act==="qnext")queueNext(tr);
 else if(act==="qlast")queueLast(tr);
 else if(act==="fav"){
  tr.fav=!tr.fav;
  if(tr.fav)tr.favAt=Date.now();
  if(tr.fav&&!TRACKS.some(x=>String(x.id)===String(tr.id)&&x.s===tr.s))TRACKS.push(tr);
  document.querySelectorAll(`[data-fav="${cssEsc(tr.id)}"]`).forEach(el=>el.setAttribute("aria-pressed",!!tr.fav));
  queueFav(tr,tr.fav);if(tr.fav)autoDownload(tr,null);
  renderWaveHint();save();
  if(S.view==="library")renderLib()}
 else if(act==="dl")downloadTrack(tr);
 else if(act==="dlfx")downloadProcessed(tr);
 else if(act==="rmlocal")removeLocal(tr.id);
 else if(act==="artist"){go("library");S.tab="art";artOpen=tr.a;
  document.querySelectorAll("[data-tab]").forEach(x=>x.setAttribute("aria-selected",x.dataset.tab==="art"));
  renderArtist(tr.a)}
 else if(act==="eq")pinPresetToTrack(tr,b.dataset.eq);
 else if(act==="eqoff")pinPresetToTrack(tr,null);
 else if(act==="pl")addToPlaylist(b.dataset.pid,tr);
 else if(act==="newpl"){
  askText(t("ctx.newpl.ask")).then(n=>{
   if(n)newPlaylist(n).then(pid=>{if(pid)addToPlaylist(pid,tr)})})}
},true);
addEventListener("keydown",e=>{if(e.key==="Escape")closeCtx()});
/* Closes on press anywhere outside the menu. It used to close on any scroll
   event too, which is what made it vanish "by itself": wheel inertia after
   scrolling the list, and the lyrics panel's own autoscroll both fire scroll
   events continuously, so the menu died within moments of opening. */
addEventListener("pointerdown",e=>{
 if(CTX.el&&!e.target.closest(".ctx"))closeCtx()},true);

/* Badges.
   badges.json is the catalog the app ships; the database only stores ids and
   who owns what, so adding a badge never needs a schema change. Unlocks are
   granted server-side (check_achievements / claim_client_badge) because a
   client-side grant is just a request the user can forge. */
let BADGES=null,OWNED=new Set(),badgeMsgTimer=0;
/* Colours come from the catalog itself when it provides them, so the art and
   the frames can never disagree. */
let RARITY_COLOR={common:"#8b8b96",uncommon:"#3fb950",rare:"#4a9eff",
 epic:"#a855f7",legendary:"#f5a524",secret:"#e0679a"};

async function loadBadgeCatalog(){
 if(BADGES)return BADGES;
 try{
  const r=await fetch("assets/badges/badges.json");
  if(!r.ok)throw new Error("HTTP "+r.status);
  const j=await r.json();
  if(j.rarity_colors)RARITY_COLOR={...RARITY_COLOR,...j.rarity_colors};
  /* v2 ships one flat array whose `unlock` is status | achievement | code;
     "status" means a maintainer grants it, so the UI groups those separately
     instead of showing them as "locked, keep trying". That used to be a
     hardcoded id list here and in three build scripts. v1 split the catalog into
     achievements/codes and is still read so a stale one renders. */
  BADGES=Array.isArray(j.badges)
   ?j.badges.map(x=>({...x,
     source:x.unlock==="status"?"status":(x.unlock==="achievement"?"achievement":"code"),
     name:typeof x.name==="string"?{ru:x.name,en:x.name}:x.name,
     desc:x.desc||(typeof x.description==="string"?{ru:x.description,en:x.description}:x.description)}))
   :[...(j.achievements||[]).map(x=>({...x,source:"achievement"})),
     ...(j.codes||[]).map(x=>({...x,source:"code"}))];
 }catch(e){console.warn("badge catalog:",e);BADGES=[]}
 return BADGES}

/* The first badge seed in production used different ids than the catalog
   (first_note vs first_listen and so on). Rows already granted under those
   names would render as "owned but nothing lights up" forever, so they are
   translated to their catalog equivalents on read. Keep in sync with
   supabase/seed_badges.mjs — after the next seed run the badges table speaks
   catalog ids natively and only these old user_badges rows need the map. */
const LEGACY_BADGE={first_note:"first_listen",hour_one:"listener_i",
 night_owl:"night_listener",crate_digger:"collector",day_of_sound:"marathon_listener"};

async function loadOwnedBadges(){
 if(!sb||!sbUser){OWNED=new Set();return OWNED}
 try{
  const {data,error}=await sb.from("user_badges").select("badge_id").eq("user_id",sbUser.id);
  if(error)throw error;
  OWNED=new Set((data||[]).map(r=>LEGACY_BADGE[r.badge_id]||r.badge_id));
 }catch(e){console.warn("owned badges:",e.message||e)}
 return OWNED}

/* claimClientBadges() used to live here: it reported services_connected and
   custom_presets to claim_client_badge(). No badge in badges.json uses either
   metric, so it always returned [] after walking the whole catalog. The RPC
   stays in the schema for when such a badge exists. */

/* Called after listening time is reported: the server re-checks every
   threshold and returns whatever it just granted. */
async function syncAchievements(){
 if(!sb||!sbUser)return;
 try{
  const {data,error}=await sb.rpc("check_achievements");
  if(error)throw error;
  const fresh=(data||[]).map(r=>typeof r==="string"?r:r.badge_id).filter(Boolean);
  if(fresh.length){
   await loadOwnedBadges();
   fresh.forEach(id=>announceBadge(id));
   if(S.view==="profile")renderProfile()}
 }catch(e){console.warn("achievements:",e.message||e)}}

function badgeById(id){return (BADGES||[]).find(b=>b.id===id)}
function announceBadge(id){
 const b=badgeById(id);
 toast((b?`${t("bd.new")}: ${b.name[LANG]||b.name.ru}`:t("bd.new")),4200)}

const badgeName=b=>b.name?.[LANG]||b.name?.ru||b.id;
const badgeDesc=b=>b.desc?.[LANG]||b.desc?.ru||"";
function badgeTile(b,owned){
 const c=RARITY_COLOR[b.rarity]||RARITY_COLOR.common;
 const name=badgeName(b),desc=badgeDesc(b);
 /* Secret badges keep their description hidden until earned — spelling out the
    condition would defeat the point. */
 const secret=b.rarity==="secret"&&!owned;
 const shown=secret?t("bd.secret"):desc;
 const pinned=PINNED.includes(b.id);
 return `<div class="bdg" data-owned="${owned}" data-pin="${pinned}" data-badge="${esc(b.id)}"
  title="${esc(name)}${shown?" — "+esc(shown):""}"${owned?` role="button" tabindex="0"`:""}>
  <span class="bdgart" style="--ring:${c}"><img src="assets/badges/${esc(b.file)}" alt="" loading="lazy"></span>
  <b>${esc(name)}</b><span>${esc(shown)}</span></div>`}

function renderBadges(){
 const box=document.getElementById("bdgbox");if(!box)return;
 const cat=BADGES||[];
 if(!cat.length){box.innerHTML=`<p class="ph" style="margin:0">${t("bd.none")}</p>`;return}
 const owned=b=>OWNED.has(b.id);
 /* Staff badges are not obtainable: Owner, Admin, Developer and Moderator are
    handed out by hand, so listing them greyed-out to everyone else is a row of
    permanent locks that only advertises a club nobody can join. They stay
    visible to whoever actually holds one. */
 const STAFF=new Set(["owner","admin","developer","moderator"]);
 const visible=cat.filter(b=>!STAFF.has(b.id)||owned(b));
 /* Grouped by how a badge is obtained. A status badge in the "keep going"
    pile would be misleading: no amount of listening unlocks Owner. */
 const groups=[
  {key:"bd.g.status",list:visible.filter(b=>b.source==="status")},
  {key:"bd.g.ach",list:visible.filter(b=>b.source==="achievement")},
  {key:"bd.g.code",list:visible.filter(b=>b.source==="code")}];
 const mine=visible.filter(owned);
 box.innerHTML=
  `<p class="ph" style="margin:0 0 4px">${t("bd.have")}: ${mine.length} / ${visible.length}</p>
   <p class="ph" style="margin:0 0 14px">${t("bd.pin.hint")}</p>`
  +groups.filter(g=>g.list.length).map(g=>{
    /* Owned first inside each group, so progress is visible at a glance. */
    const sorted=[...g.list].sort((a,b)=>(owned(b)?1:0)-(owned(a)?1:0));
    return `<p class="eyebrow" style="margin:16px 0 8px">${t(g.key)} · ${g.list.filter(owned).length}/${g.list.length}</p>
     <div class="bdgrid">${sorted.map(b=>badgeTile(b,owned(b))).join("")}</div>`}).join("")}

/* Pinned badges: the row shown next to the name on the profile card.
   Capped at 5 server-side; the click just toggles membership. */
let PINNED=[];
async function togglePin(id){
 if(!OWNED.has(id))return;
 if(!sb||!sbUser)return toast(t("bd.pin.auth"));
 const next=PINNED.includes(id)?PINNED.filter(x=>x!==id):[...PINNED,id];
 if(next.length>5)return toast(t("bd.pin.max"));
 try{
  const {data,error}=await sb.rpc("set_pinned_badges",{ids:next});
  if(error)throw error;
  PINNED=data||next;
  renderBadges();renderPinned();
 }catch(e){toast(String(e.message||e))}}
function renderPinned(){
 const el=document.getElementById("pinrow");if(!el)return;
 el.innerHTML=PINNED.map(id=>{
  const b=(BADGES||[]).find(x=>x.id===id);if(!b)return "";
  const c=RARITY_COLOR[b.rarity]||RARITY_COLOR.common;
  return `<span class="pinb" style="--ring:${c}" title="${esc(badgeName(b))}">
   <img src="assets/badges/${esc(b.file)}" alt=""></span>`}).join("")}

/* Promo codes are validated server-side: the plaintext is hashed there and
   compared, so the app never holds a list of valid codes. */
async function redeemCode(){
 const inp=document.getElementById("bd-code"),msg=document.getElementById("bd-msg");
 const raw=(inp?.value||"").trim();
 const say=(text,cls)=>{if(msg){msg.textContent=text;msg.style.color=cls==="err"?"#f87171":cls==="ok"?"#4ade80":"var(--mute)"}};
 if(!raw)return say(t("bd.code.empty"),"err");
 if(!sb||!sbUser)return say(t("bd.code.auth"),"err");
 say(t("bd.code.checking"));
 try{
  const {data,error}=await sb.rpc("redeem_badge_code",{raw_code:raw});
  if(error)throw error;
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error(t("bd.code.bad"));
  await loadOwnedBadges();renderBadges();
  if(row.already_owned)say(t("bd.code.dup"),"ok");
  else{say(t("bd.code.ok"),"ok");announceBadge(row.badge_id)}
  inp.value="";
 }catch(e){
  /* The function raises plain messages: invalid code / code expired /
     code exhausted. Map the known ones, show the rest verbatim. */
  const m=String(e.message||e);
  const key={"invalid code":"bd.code.bad","code expired":"bd.code.exp","code exhausted":"bd.code.used"};
  const hit=Object.keys(key).find(k=>m.includes(k));
  say(hit?t(key[hit]):m,"err")}}

function renderProfile(){
 const box=document.getElementById("profbody");if(!box)return;
 if(!sb){box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${t("pr.nosupa")}</p></div>`;return}
 if(!sbUser){
  box.innerHTML=`<div class="panel pane"><h3>${t("pr.auth.t")}</h3><p class="ph">${t("pr.auth.s")}</p>
   <div class="authform">
    <input id="au-email" type="email" placeholder="${t("pr.email")}" autocomplete="email">
    <input id="au-pass" type="password" placeholder="${t("pr.pass")}" autocomplete="current-password">
    <div class="authrow">
     <button class="primary" id="au-in">${t("pr.signin")}</button>
     <button class="btn" id="au-up">${t("pr.signup")}</button>
     <button class="btn" id="au-magic">${t("pr.magic")}</button>
    </div>
    <p class="authmsg" id="authmsg"></p>
   </div></div>`;
  document.getElementById("au-in").onclick=()=>doAuth("in");
  document.getElementById("au-up").onclick=()=>doAuth("up");
  document.getElementById("au-magic").onclick=()=>doAuth("magic");
  return}
 const p=sbProfile||{},favs=TRACKS.filter(x=>x.fav).length;
 /* Whichever is larger: the account total the server has confirmed, or this
    machine's tally including seconds not yet flushed. Printing S.listen alone
    made the figure look like it reset on a new device. */
 const secs=Math.max(Number(sbStats?.listen_seconds)||0,S.listen||0);
 /* Badges count what the catalog can actually show, not raw rows: a legacy id
    with no tile would otherwise read as "owned but dark". */
 const ownedShown=(BADGES||[]).filter(b=>OWNED.has(b.id)).length;
 box.innerHTML=`<div class="panel pane" style="overflow:hidden;padding:0">
   <div class="banner">
    ${p.banner_url?`<img src="${esc(p.banner_url)}" alt="">`:""}
   </div>
   <div style="padding:var(--sp-6)">
   <div class="profhead">
    <span class="avatar">
     ${p.avatar_url?`<img src="${esc(p.avatar_url)}" alt="">`:""}
    </span>
    <div>
     <div class="uname"><b class="unview">${esc(p.username||t("pr.name.ph"))}</b></div>
     <div class="pinrow" id="pinrow"></div>
     ${sbProfile?.bio?`<p class="pbio">${esc(sbProfile.bio)}</p>`:""}
     <p class="pmail">${esc(sbUser.email||"")}</p>
     <p class="authmsg" id="authmsg"></p>
    </div>
   </div>
   <div class="stats">
    <div class="stat"><b>${fmtListen(secs)}</b><span>${t("pr.hours")}</span></div>
    <div class="stat"><b>${favs}</b><span>${t("pr.favs")}</span></div>
    <div class="stat"><b>${ownedShown}</b><span>${t("pr.badges")}</span></div>
   </div>
   </div>
  </div>
  <div class="panel pane">
   <h3>${t("bd.t")}</h3>
   <p class="ph">${t("bd.s")}</p>
   <div id="bdgbox"></div>
   <div class="tokrow" style="margin-top:14px">
    <input id="bd-code" placeholder="${t("bd.code.ph")}" autocomplete="off" maxlength="40">
    <button class="btn" id="bd-redeem">${t("bd.code.go")}</button>
    <small style="color:var(--mute);font-size:.72rem" id="bd-msg">${t("bd.code.hint")}</small>
   </div>
  </div>
  <div class="panel pane">
   <div class="authrow">
    <button class="btn" id="au-out">${t("pr.logout")}</button>
    <button class="btn danger" id="au-del">${delArmed?t("pr.del.confirm"):t("pr.del")}</button>
   </div>
  </div>`;
 renderBadges();
 document.getElementById("bd-redeem").onclick=redeemCode;
 document.getElementById("bd-code").addEventListener("keydown",e=>{if(e.key==="Enter")redeemCode()});
 renderPinned();
 /* Friends live in the People tab now; a second copy under the player was the
    reported "friends are stuck at the bottom". */
 paintPrivacy();
 fillProfileSettings();
 document.getElementById("au-out").onclick=()=>sb.auth.signOut();
 document.getElementById("au-del").onclick=async()=>{
  if(!delArmed){delArmed=true;renderProfile();return}
  const {error}=await sb.rpc("delete_account");
  if(error){authMsg(error.message,"err");delArmed=false;return}
  await sb.auth.signOut()};
 icons()}

/* ─────────────────────── social ───────────────────────

   Friends, direct and group chats, listen rooms with a host-approved queue,
   and a listening-hours leaderboard. The database side lives in
   migrations/04_social.sql and 10_social2.sql; this section is only the UI.

   Updates arrive by polling, not realtime channels: a 3–5 s interval per open
   screen is a couple of tiny REST calls, keeps working through flaky
   connections, and has none of the channel lifecycle bugs. */

const SOC={chat:null,room:null,roomRole:null,roomQueue:[],requests:[],timers:{}};
const socTimer=(k,fn,ms)=>{clearInterval(SOC.timers[k]);SOC.timers[k]=setInterval(fn,ms)};
const socClear=k=>{clearInterval(SOC.timers[k]);delete SOC.timers[k]};
const socClearAll=()=>{Object.keys(SOC.timers).forEach(socClear)};

const needAuth=box=>{box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${t("soc.auth")}</p></div>`;return};

/* Social screens fail soft. An unmigrated database (the chat_members policy
   recursion), a dropped request or a schema cache miss must produce a readable
   panel — never a silently blank tab, which is exactly what "чаты не
   открываются" was. */
function socialFail(e){
 const m=String(e?.message||e);
 console.warn("social:",m);
 return /recursion|row-level|policy|permission|does not exist|schema cache|relation/i.test(m)
  ?`${t("soc.needsql")} (${m})`:m}
const socErrBox=(msg)=>`<div class="panel pane"><p class="ph" style="margin:0;color:oklch(72% .17 25)">${esc(msg)}</p></div>`;

/* Profile bubble: the picture when there is one, the first letter when not. */
const avat=(p,size=34)=>{
 const u=p?.avatar_url?esc(cssUrl(p.avatar_url)):"";
 return u
  ?`<span class="avat" style="width:${size}px;height:${size}px;background-image:url('${u}')"></span>`
  :`<span class="avat ghost" style="width:${size}px;height:${size}px">${esc((p?.username||"?")[0].toUpperCase())}</span>`};

/* A room invite inside a message body: any "MEOW-XXXX" code becomes a join
   button, so an invite is one tap regardless of who sent it. */
const JOIN_RE=/MEOW-[2-9A-HJ-NP-Z]{4}/;
function chatBodyHtml(m){
 const img=m.image?`<img class="chatimg" src="${esc(m.image)}" alt="" loading="lazy">`:"";
 const join=m.body&&JOIN_RE.test(m.body)
  ?`<button class="btn sm joinchip" data-join="${esc(m.body.match(JOIN_RE)[0])}"><i data-lucide="radio-tower" width="13" height="13"></i>${esc(m.body)}</button>`
  :esc(m.body||"");
 return img+join}

let PEOPLE_QUERY="";
let PEOPLE_RESULTS=[];
let PEOPLE_TAB="friends";
let FRIEND_PENDING=0;

/* Animated in-app notification. A toast is a status line; this is the card the
   user is meant to notice and act on, so it has an icon, a title and its own
   entrance. Desktop notifications stay as a secondary channel. */
function notify(title,body,opts={}){
  const box=document.getElementById("notes");
  if(!box)return;
  const el=document.createElement("div");
  el.className="note";
  el.innerHTML=`<span class="noteic"><i data-lucide="${esc(opts.icon||"bell")}" width="16" height="16"></i></span>
   <span class="notetxt"><b>${esc(title)}</b>${body?`<span>${esc(body)}</span>`:""}</span>
   <button class="notex" aria-label="close"><i data-lucide="x" width="13" height="13"></i></button>`;
  box.appendChild(el);
  icons();
  const kill=()=>{if(el.dataset.gone)return;el.dataset.gone="1";el.classList.add("out");setTimeout(()=>el.remove(),320)};
  el.querySelector(".notex").onclick=kill;
  if(opts.onClick)el.querySelector(".notetxt").onclick=()=>{kill();opts.onClick()};
  setTimeout(kill,opts.ms||6000);
  try{if(typeof Notification!=="undefined"&&Notification.permission==="granted")new Notification(title,{body})}catch(e){}
}

/* Incoming friend requests drive both the rail badge and the notification.
   Polled on a short interval so nothing needs a tab switch or a restart. */
async function refreshFriendNotice(){
  if(!sb||!sbUser)return;
  const {data,error}=await sb.from("friendships").select("requester,addressee,status")
    .eq("addressee",sbUser.id).eq("status","pending");
  if(error)return;
  const n=(data||[]).length,b=document.getElementById("friend-badge");
  if(b){b.hidden=!n;b.textContent=n>9?"9+":String(n)}
  if(n>FRIEND_PENDING&&FRIEND_PENDING!==-1){
    notify(t("people.notice"),t("people.notice.s").replace("{n}",n),
      {icon:"user-plus",onClick:()=>{go("people");setPeopleTab("friends")}});
    if(S.view==="people"&&PEOPLE_TAB==="friends")renderPeople();
  }
  FRIEND_PENDING=n;
}
setInterval(()=>{if(sbUser)refreshFriendNotice()},15000);

function setPeopleTab(tab){
  PEOPLE_TAB=tab;
  document.querySelectorAll("#peopletabs [data-ptab]").forEach(b=>
    b.setAttribute("aria-selected",String(b.dataset.ptab===tab)));
  renderPeople();
}
document.getElementById("peopletabs")?.addEventListener("click",e=>{
  const b=e.target.closest("[data-ptab]");if(!b)return;
  SOC.chat=null;socClear("chat");
  setPeopleTab(b.dataset.ptab);
});

/* Someone else's profile: the same card the owner sees, minus anything their
   privacy settings hide. Showing only a name and a bio made it look broken. */
async function renderPeopleProfile(id){
  const box=document.getElementById("peoplebody");if(!box)return;
  hideChatPane();
  box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${t("people.loading")}</p></div>`;
  const {data:p,error}=await sb.from("profiles")
    .select("id,username,avatar_url,banner_url,bio,privacy,pinned_badges")
    .eq("id",id).maybeSingle();
  if(error||!p){box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${esc(error?.message||t("soc.nouser"))}</p></div>`;return}

  const mine=p.id===sbUser.id;
  const rel=mine?null:(await sb.from("friendships").select("requester,addressee,status")
    .or(`and(requester.eq.${sbUser.id},addressee.eq.${p.id}),and(requester.eq.${p.id},addressee.eq.${sbUser.id})`)
    .maybeSingle()).data;
  const friend=rel?.status==="accepted";
  const view=mine?p:maskProf(p);
  const pv=p.privacy||{};
  /* hours: all | friends | me — the profile must not leak a number the owner
     chose to hide. */
  const showHours=mine||pv.hours==="all"||(pv.hours==="friends"&&friend);
  let secs=null;
  if(showHours){
    const {data:st}=await sb.from("user_stats").select("listen_seconds").eq("user_id",p.id).maybeSingle();
    secs=Number(st?.listen_seconds)||0;
  }
  const {data:ub}=await sb.from("user_badges").select("badge_id").eq("user_id",p.id);
  const owned=new Set((ub||[]).map(r=>LEGACY_BADGE[r.badge_id]||r.badge_id));
  await loadBadgeCatalog();
  const pins=(Array.isArray(p.pinned_badges)?p.pinned_badges:[]).filter(x=>owned.has(x));
  const pinHtml=pins.map(bid=>{
    const b=(BADGES||[]).find(x=>x.id===bid);if(!b)return "";
    const c=RARITY_COLOR[b.rarity]||RARITY_COLOR.common;
    return `<span class="pinb" style="--ring:${c}" title="${esc(badgeName(b))}"><img src="assets/badges/${esc(b.file)}" alt=""></span>`;
  }).join("");

  box.innerHTML=`<div class="panel pane public-profile" style="padding:0;overflow:hidden">
    <div class="banner">${view.banner_url?`<img src="${esc(view.banner_url)}" alt="">`:""}</div>
    <div style="padding:var(--sp-6)">
      <div class="profhead">
        <span class="avatar">${view.avatar_url?`<img src="${esc(view.avatar_url)}" alt="">`:`<span class="avatar-ph">${esc((view.username||"?")[0].toUpperCase())}</span>`}</span>
        <div>
          <div class="uname"><b class="unview">${esc(view.username||t("chat.anon"))}</b></div>
          <div class="pinrow">${pinHtml}</div>
          ${p.bio?`<p class="pbio">${esc(p.bio)}</p>`:""}
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${showHours?fmtListen(secs):"—"}</b><span>${t("pr.hours")}</span></div>
        <div class="stat"><b>${owned.size}</b><span>${t("pr.badges")}</span></div>
        <div class="stat"><b>${friend?t("people.friend"):t("people.notfriend")}</b><span>${t("fr.t")}</span></div>
      </div>
      <div class="public-actions" id="people-actions"></div>
      <div style="margin-top:14px"><button class="btn" id="people-back">← ${t("nav.people")}</button></div>
    </div>
  </div>`;

  document.getElementById("people-back").onclick=()=>setPeopleTab(PEOPLE_TAB);
  const a=document.getElementById("people-actions");
  if(mine){a.innerHTML=`<span class="mut">${t("people.you")}</span>`;icons();return}
  if(friend){
    a.innerHTML=`<button class="primary" id="people-dm"><i data-lucide="message-circle" width="15" height="15"></i>${t("people.message")}</button>
      <button class="btn danger" id="people-unfr">${t("fr.rm")}</button>`;
    document.getElementById("people-dm").onclick=()=>openChat("d:"+p.id);
    document.getElementById("people-unfr").onclick=async()=>{
      await sb.from("friendships").delete().eq("requester",rel.requester).eq("addressee",rel.addressee);
      renderPeopleProfile(p.id)};
  }else if(rel?.status==="pending"&&rel.requester===sbUser.id){
    a.innerHTML=`<span class="mut">${t("people.pending")}</span>`;
  }else if(rel?.status==="pending"){
    a.innerHTML=`<button class="primary" id="people-accept">${t("people.accept")}</button>`;
    document.getElementById("people-accept").onclick=async()=>{
      const {error}=await sb.from("friendships").update({status:"accepted"})
        .eq("requester",rel.requester).eq("addressee",rel.addressee);
      if(error)return toast(error.message);
      refreshFriendNotice();renderPeopleProfile(p.id)};
  }else{
    a.innerHTML=`<button class="primary" id="people-add"><i data-lucide="user-plus" width="15" height="15"></i>${t("people.add")}</button>`;
    document.getElementById("people-add").onclick=async()=>{
      const {error}=await sb.rpc("add_friend_by_username",{name:p.username});
      if(error)return toast(error.message);
      notify(t("people.pending"),view.username||"",{icon:"user-plus"});
      renderPeopleProfile(p.id)};
  }
  icons();
}

/* Re-triggering a CSS animation needs the class gone for one frame, otherwise
   a second render with the same class does nothing at all — which is why tab
   switches looked instant and unanimated. animationend bubbles, so a child
   row's own animation must not strip the container's class early. */
function animIn(el,cls){
  if(!el)return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  const off=e=>{
   if(e.target!==el)return;
   el.classList.remove(cls);
   el.removeEventListener("animationend",off)};
  el.addEventListener("animationend",off);
}

async function renderPeople(){
  const box=document.getElementById("peoplebody");if(!box)return;
  if(!sb||!sbUser){hideChatPane();return needAuth(box)}
  /* The chat tab paints into #chatbody, so the list container stays empty and
     the entrance animation belongs to the pane, not here. */
  if(PEOPLE_TAB==="chats"){box.innerHTML="";return renderChats()}
  hideChatPane();
  if(PEOPLE_TAB==="find")await renderPeopleFind(box);
  else await renderPeopleFriends(box);
  animIn(box,"peo-enter");
}

function peopleRow(p,sub){
  return `<button class="people-row" data-person="${esc(p.id)}">${avat(p,42)}
    <span class="meta"><b>${esc(p.username||t("chat.anon"))}</b><span>${esc(sub||p.bio||t("people.open"))}</span></span>
    <i data-lucide="chevron-right" width="16" height="16"></i></button>`;
}

async function renderPeopleFind(box){
  box.innerHTML=`<div class="panel pane people-search">
    <div class="tokrow">
      <input id="people-q" placeholder="${t("people.search.ph")}" value="${esc(PEOPLE_QUERY)}" maxlength="24" autocomplete="off">
      <button class="primary" id="people-go">${t("people.search")}</button>
    </div>
    <div id="people-results"><p class="ph">${t("people.empty")}</p></div></div>`;
  const input=document.getElementById("people-q"),results=document.getElementById("people-results");
  const run=async()=>{
    PEOPLE_QUERY=input.value.trim();
    if(!PEOPLE_QUERY){results.innerHTML=`<p class="ph">${t("people.empty")}</p>`;return}
    const {data,error}=await sb.from("profiles").select("id,username,avatar_url,bio,privacy")
      .ilike("username",`%${PEOPLE_QUERY}%`).neq("id",sbUser.id).limit(20);
    if(error){results.innerHTML=`<p class="ph">${esc(error.message)}</p>`;return}
    PEOPLE_RESULTS=(data||[]).map(maskProf);
    results.innerHTML=PEOPLE_RESULTS.length
      ?PEOPLE_RESULTS.map(p=>peopleRow(p)).join("")
      :`<p class="ph">${t("people.none")}</p>`;
    results.querySelectorAll("[data-person]").forEach(b=>b.onclick=()=>renderPeopleProfile(b.dataset.person));
    icons()};
  document.getElementById("people-go").onclick=run;
  input.onkeydown=e=>{if(e.key==="Enter")run()};
  if(PEOPLE_QUERY)run(); else icons();
}

/* Friends moved out of the profile page and into this tab, where they belong
   next to search and chats. */
async function renderPeopleFriends(box){
  const me=sbUser.id;
  const {data,error}=await sb.from("friendships").select("*").or(`requester.eq.${me},addressee.eq.${me}`);
  if(error){box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${esc(error.message)}</p></div>`;return}
  const rows=data||[];
  const accepted=rows.filter(r=>r.status==="accepted");
  const pendingIn=rows.filter(r=>r.status==="pending"&&r.addressee===me);
  const pendingOut=rows.filter(r=>r.status==="pending"&&r.requester===me);
  const otherId=r=>r.requester===me?r.addressee:r.requester;
  const ids=[...accepted,...pendingIn,...pendingOut].map(otherId);
  const profs=ids.length?(await sb.from("profiles").select("id,username,avatar_url,bio,privacy").in("id",ids)).data?.map(maskProf)||[]:[];
  const prof=id=>profs.find(p=>p.id===id)||{id,username:"…"};

  box.innerHTML=`<div class="panel pane people-search">
    <div class="tokrow" style="margin:0 0 12px">
      <input id="fr-add" placeholder="${t("fr.addph")}" autocomplete="off" maxlength="24">
      <button class="btn" id="fr-addbtn">${t("fr.add")}</button>
    </div>
    ${pendingIn.length?`<p class="eyebrow" style="margin:6px 0 6px">${t("fr.reqs")} · ${pendingIn.length}</p>`+pendingIn.map(r=>{
      const p=prof(otherId(r));
      return `<div class="reqrow">${avat(p,34)}
        <span class="meta"><b>${esc(p.username)}</b><span>${t("people.incoming")}</span></span>
        <button class="primary sm" data-acc="${r.requester}|${r.addressee}">${t("people.accept")}</button>
        <button class="btn sm danger" data-dec="${r.requester}|${r.addressee}">${t("people.reject")}</button></div>`}).join(""):""}
    ${pendingOut.length?`<p class="eyebrow" style="margin:14px 0 6px">${t("fr.sent")}</p>`+pendingOut.map(r=>{
      const p=prof(otherId(r));
      return `<div class="chatrow asrow" style="grid-template-columns:auto 1fr auto">${avat(p,30)}
        <span class="meta"><b>${esc(p.username)}</b></span><span class="mut">${t("fr.wait")}</span></div>`}).join(""):""}
    <p class="eyebrow" style="margin:14px 0 6px">${t("fr.mine")} · ${accepted.length}</p>
    ${accepted.length?accepted.map(r=>{
      const p=prof(otherId(r));
      return `<div class="friend-row">
        <button class="people-row" data-person="${esc(p.id)}">${avat(p,42)}
          <span class="meta"><b>${esc(p.username)}</b><span>${esc(p.bio||t("people.open"))}</span></span></button>
        <button class="btn sm" data-dm="${esc(p.id)}"><i data-lucide="message-circle" width="14" height="14"></i></button>
        <button class="ic" data-unfr="${r.requester}|${r.addressee}" title="${t("fr.rm")}"><i data-lucide="user-minus" width="14" height="14"></i></button>
      </div>`}).join(""):`<p class="ph">${t("fr.none")}</p>`}
  </div>`;

  const add=async()=>{
    const n=document.getElementById("fr-add").value.trim();if(!n)return;
    const {error}=await sb.rpc("add_friend_by_username",{name:n});
    if(error)return toast(error.message);
    notify(t("fr.sent.ok"),n,{icon:"user-plus"});
    renderPeople()};
  document.getElementById("fr-addbtn").onclick=add;
  document.getElementById("fr-add").addEventListener("keydown",e=>{if(e.key==="Enter")add()});
  box.querySelectorAll("[data-person]").forEach(b=>b.onclick=()=>renderPeopleProfile(b.dataset.person));
  box.querySelectorAll("[data-dm]").forEach(b=>b.onclick=e=>{e.stopPropagation();openChat("d:"+b.dataset.dm)});
  box.querySelectorAll("[data-acc]").forEach(b=>b.onclick=async()=>{
    const [requester,addressee]=b.dataset.acc.split("|");
    const {error}=await sb.from("friendships").update({status:"accepted"}).eq("requester",requester).eq("addressee",addressee);
    if(error)return toast(error.message);
    refreshFriendNotice();renderPeople()});
  box.querySelectorAll("[data-dec]").forEach(b=>b.onclick=async()=>{
    const [requester,addressee]=b.dataset.dec.split("|");
    await sb.from("friendships").delete().eq("requester",requester).eq("addressee",addressee);
    refreshFriendNotice();renderPeople()});
  box.querySelectorAll("[data-unfr]").forEach(b=>b.onclick=async()=>{
    const [requester,addressee]=b.dataset.unfr.split("|");
    await sb.from("friendships").delete().eq("requester",requester).eq("addressee",addressee);
    renderPeople()});
  icons();
}

/* ── chats list ─────────────────────────────────────────── */
/* The chat pane is a sibling of #peoplebody: the list and the conversation are
   two states of the same tab, so one is emptied while the other renders. */
function hideChatPane(){
  const c=document.getElementById("chatbody");
  if(c){c.innerHTML=""; c.classList.remove("chat-open");}
}
async function renderChats(){
  const box=document.getElementById("chatbody");if(!box)return;
  const list=document.getElementById("peoplebody");if(list)list.innerHTML="";
  /* The pane is display:none until this class lands, so it goes on before
     anything is written into it — including the sign-in prompt, which was
     otherwise rendered into an invisible box. */
  box.classList.add("chat-open");
  if(!sb||!sbUser)return needAuth(box);
 try{
  const me=sbUser.id;
 /* Group chats: my memberships first, then the chat rows themselves. */
 const mem=await sb.from("chat_members").select("chat_id,role").eq("user_id",me);
 const gids=(mem.data||[]).map(m=>m.chat_id);
 const groups=gids.length?(await sb.from("chats").select("*").in("id",gids)).data||[]:[];
 /* DM partners: recent direct messages, newest per person. */
 const dms=await sb.from("messages").select("sender,recipient,body,image,sent_at")
  .or(`recipient.eq.${me},sender.eq.${me}`).is("room_id",null).is("chat_id",null)
  .order("id",{ascending:false}).limit(120);
 const partners=new Map();
 (dms.data||[]).forEach(m=>{const p=m.sender===me?m.recipient:m.sender;
  if(p&&!partners.has(p))partners.set(p,m)});
 const pids=[...partners.keys()];
 const profs=pids.length?(await sb.from("profiles").select("id,username,avatar_url,privacy").in("id",pids)).data?.map(maskProf)||[]:[];
 const gl=gids.length?(await sb.from("messages").select("chat_id,body,image,sent_at").in("chat_id",gids)
  .order("id",{ascending:false}).limit(200)).data||[]:[];
 const gLast=new Map();gl.forEach(m=>{if(!gLast.has(m.chat_id))gLast.set(m.chat_id,m)});
 const rowHtml=(key,name,last,img,extra="")=>`
  <button class="chatrow" data-openchat="${esc(key)}">
   ${img}
   <span class="meta"><b>${esc(name)}</b><span>${last?esc(String(last).slice(0,64)):extra}</span></span>
   <i data-lucide="chevron-right" width="15" height="15"></i></button>`;
 const dmRows=[...partners.entries()].map(([pid,m])=>{
  const p=profs.find(x=>x.id===pid)||{username:t("chat.anon")};
  return rowHtml("d:"+pid,p.username,m.image?t("chat.photo"):m.body,avat(p,34))}).join("");
 const grpRows=groups.map(g=>rowHtml("g:"+g.id,g.name,
  (gLast.get(g.id)?.body)||(gLast.get(g.id)?.image?t("chat.photo"):""),
  avat({avatar_url:g.avatar},34),t("chat.grpmembers"))).join("");
 box.innerHTML=`<div class="panel pane people-search">
   <div class="tokrow" style="margin:0 0 12px">
    <button class="btn" id="newgrp"><i data-lucide="users" width="14" height="14"></i>${t("chat.newgrp")}</button>
    <button class="btn" id="newdm"><i data-lucide="user-plus" width="14" height="14"></i>${t("chat.newdm")}</button>
   </div>
   ${grpRows}${dmRows||(!grpRows?`<p class="ph">${t("chat.empty")}</p>`:"")}
  </div>`;
 /* A DM has to be startable from the chat list, not only from a friend row. */
 document.getElementById("newdm").onclick=async()=>{
  const n=await askText(t("chat.addwho"));
  if(!n)return;
  const {data:p}=await sb.from("profiles").select("id").ilike("username",n.trim()).maybeSingle();
  if(!p)return toast(t("soc.nouser"));
  openChat("d:"+p.id)};
 document.getElementById("newgrp").onclick=async()=>{
  const n=await askText(t("chat.newgrp"));
  if(!n)return;
  /* Through the RPC, not a bare insert: the tables exist but their policies
     once went missing mid-migration, and a raw insert then died with an
     opaque RLS error. The RPC creates the chat and the owner membership in
     one shot and reports real reasons. */
  let data=null,error=null;
  try{({data,error}=await sb.rpc("create_group_chat",{name:n}))}
  catch(e){error=e}
  if(error){
   const m=String(error.message||error);
   toast(/does not exist|404/i.test(m)?t("soc.needsql"):m,5200);
   return}
  openChat("g:"+data.id)};
 box.querySelectorAll("[data-openchat]").forEach(b=>b.onclick=()=>openChat(b.dataset.openchat));
 icons()
 }catch(e){box.innerHTML=socErrBox(socialFail(e))}}

/* ── one chat ───────────────────────────────────────────── */
function chatKeyParts(key){return key.startsWith("d:")?{dm:key.slice(2)}:{chat:key.slice(2)}}
async function openChat(key){
  const me=sbUser.id;const{dm,chat}=chatKeyParts(key);
  let name=t("chat.anon");
  if(dm){
   const target=maskProf((await sb.from("profiles").select("id,username,avatar_url,privacy").eq("id",dm).maybeSingle()).data);
   name=target?.username||name;
   SOC.chat={key,name,dm,chat:null,targetCache:target,isOwner:false}}
  else{
   const group=(await sb.from("chats").select("*").eq("id",chat).maybeSingle()).data;
   if(!group)return toast(t("chat.gone"));
   SOC.chat={key,name:group.name,dm:null,chat,group,isOwner:group.created_by===me,showMembers:false};
   await loadChatMembers()}
  /* Each open gets its own entrance animation. */
  if(SOC.chat)SOC.chat._painted=false;
  go("people");
  PEOPLE_TAB="chats";
  document.querySelectorAll("#peopletabs [data-ptab]").forEach(b=>
   b.setAttribute("aria-selected",String(b.dataset.ptab==="chats")));
  const list=document.getElementById("peoplebody");if(list)list.innerHTML="";
  /* The pane slides in only on open, not on every 5 s repaint. */
  const box=document.getElementById("chatbody");
  if(box)box.classList.add("chat-open");
  await paintChat();
  animIn(box,"chat-enter");
  socTimer("chat",paintChat,5000)}

/* "14:32" — a chat needs the clock time, not "5 minutes ago". */
function msgClock(ts){
 const d=new Date(ts);
 if(isNaN(d))return "";
 return d.toLocaleTimeString(LANG==="ru"?"ru-RU":"en-GB",{hour:"2-digit",minute:"2-digit"});
}
async function paintChat(){
  const box=document.getElementById("chatbody");if(!box||!SOC.chat)return;
  /* The poll runs every five seconds for as long as the conversation is open;
     one dropped request must not blank it or spam unhandled rejections. */
  try{await paintChatInner(box)}
  catch(e){console.warn("paintChat:",e?.message||e)}
}
async function paintChatInner(box){
  const list0=document.getElementById("peoplebody");if(list0)list0.innerHTML="";
  const{dm,chat}=SOC.chat;
 const {data}=dm
  ?await sb.from("messages").select("*")
      .or(`and(recipient.eq.${dm},sender.eq.${sbUser.id}),and(recipient.eq.${sbUser.id},sender.eq.${dm})`)
      .order("id",{ascending:true}).limit(80)
  :await sb.from("messages").select("*").eq("chat_id",chat).order("id",{ascending:true}).limit(80);
 const msgs=data||[];
 const me=sbUser.id;
 /* Read state for a DM: the other side has seen everything up to the newest
    message they themselves sent after ours. Approximate but honest, and it
    needs no extra table. */
 const theirLast=dm?msgs.filter(m=>m.sender===dm).slice(-1)[0]:null;
 const seenUpTo=theirLast?theirLast.id:0;
 const list=msgs.map(m=>{
  const mine=m.sender===me;
  const who=SOC.chat.dm?null:(SOC.chat.membersCache||[]).find(x=>x.user_id===m.sender);
  const read=mine&&dm&&m.id<seenUpTo;
  const tick=mine&&dm?`<i class="tick ${read?"read":""}" title="${read?t("chat.read"):t("chat.sent")}">${read?"✓✓":"✓"}</i>`:"";
  return `<div class="msg ${mine?"mine":""}">
   ${!mine&&SOC.chat.chat?`<span class="who">${esc(who?.profile?.username||"…")}</span>`:""}
   ${chatBodyHtml(m)}
   <time>${esc(msgClock(m.sent_at))}${tick}</time></div>`}).join("");
 const hdr=SOC.chat.dm
  ?`${avat(SOC.chat.targetCache||{username:SOC.chat.name},34)}<b>${esc(SOC.chat.name)}</b>`
  :`<i data-lucide="users" width="16" height="16"></i><b>${esc(SOC.chat.name)}</b>
    <span class="mut" data-togglemembers>${(SOC.chat.membersCache||[]).length}</span>`;
 const memberList=SOC.chat.chat&&SOC.chat.showMembers
  ?`<div class="memstrip">${(SOC.chat.membersCache||[]).map(m=>
     `${avat(m.profile,24)}<span>${esc(m.profile?.username||"")}</span>${m.role==="owner"?"👑":""}`).join("")}
     <button class="btn sm" id="addmem"><i data-lucide="user-plus" width="13" height="13"></i></button></div>`:"";
  const old=box.querySelector(".chatlog");
  const stick=!old||old.scrollHeight-old.scrollTop-old.clientHeight<80;
  /* A repaint every few seconds must not eat what is being typed. */
  const draft=document.getElementById("chat-inp")?.value||"";
  /* Focus and caret have to survive the rebuild too: the poll used to rip the
     input out from under a mid-sentence typist every five seconds, which read
     as "the chat input keeps jumping". */
  const inpOld=document.getElementById("chat-inp");
  const typing=!!inpOld&&document.activeElement===inpOld;
  const caret=typing?inpOld.selectionStart:null;
  /* Message entrance animation belongs to the first render of a conversation
     only; every poll repaint recreates identical nodes and must stay still. */
  const firstPaint=!SOC.chat._painted;SOC.chat._painted=true;
 box.innerHTML=`<div class="panel pane chatpane">
  <div class="chathdr"><button class="ic" data-back>${'<i data-lucide="arrow-left" width="16" height="16"></i>'}</button>
   ${hdr}
   <span class="grow"></span>
   <button class="ic" id="chat-invite" title="${t("chat.invite")}"><i data-lucide="radio-tower" width="15" height="15"></i></button>
   ${SOC.chat.chat&&SOC.chat.isOwner?`<button class="ic" id="chat-cfg" title="${t("chat.custom")}"><i data-lucide="pencil" width="15" height="15"></i></button>`:""}
  </div>
  ${memberList}
  <div class="chatlog${firstPaint?" first":""}">${list||`<p class="ph">${t("chat.nomsgs")}</p>`}</div>
  <div class="chatrow-input">
   <button class="ic" id="chat-img" title="${t("chat.photo")}"><i data-lucide="image" width="16" height="16"></i></button>
   <input id="chat-inp" placeholder="${t("chat.ph")}" maxlength="2000" autocomplete="off">
   <button class="primary sm" id="chat-send"><i data-lucide="send" width="15" height="15"></i></button>
   <input type="file" id="chat-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
  </div></div>`;
 const log=box.querySelector(".chatlog");
 if(stick)log.scrollTop=log.scrollHeight;
  const inp0=document.getElementById("chat-inp");
  if(inp0&&draft){inp0.value=draft}
  if(typing&&inp0){inp0.focus();try{inp0.setSelectionRange(caret,caret)}catch(e){}}
 box.querySelector("[data-back]").onclick=()=>{SOC.chat=null;socClear("chat");renderChats()};
 box.querySelector("[data-togglemembers]")?.addEventListener("click",()=>{
  SOC.chat.showMembers=!SOC.chat.showMembers;loadChatMembers().then(()=>paintChat())});
 const send=async(image=null)=>{
  const inp=document.getElementById("chat-inp");
  const body=inp?.value.trim()||"";
  if(!body&&!image)return;
  const row=dm?{recipient:dm,sender:me,body,image}:{chat_id:chat,sender:me,body,image};
  const {error}=await sb.from("messages").insert(row);
  if(error)return toast(error.message);
  if(inp)inp.value="";
  paintChat()};
 document.getElementById("chat-send").onclick=()=>send();
 document.getElementById("chat-inp").addEventListener("keydown",e=>{if(e.key==="Enter")send()});
 document.getElementById("chat-img").onclick=()=>document.getElementById("chat-file").click();
 document.getElementById("chat-file").onchange=async e=>{
  const f=e.target.files?.[0];e.target.value="";if(!f)return;
  const img=await compressChatImage(f);
  if(img)send(img)};
 document.getElementById("chat-invite").onclick=async()=>{
  if(!SOC.room)return toast(t("chat.noroom"));
  const{dm,chat}=SOC.chat;
  const {error}=await sb.from("messages").insert(dm
   ?{recipient:dm,sender:me,body:`🎧 ${SOC.room.name} — ${SOC.room.join_code}`}
   :{chat_id:chat,sender:me,body:`🎧 ${SOC.room.name} — ${SOC.room.join_code}`});
  toast(error?error.message:t("chat.invited"));if(!error)paintChat()};
 document.getElementById("chat-cfg")?.addEventListener("click",customizeGroup);
 document.getElementById("addmem")?.addEventListener("click",async()=>{
  const n=await askText(t("chat.addwho"));
  if(!n)return;
  const p=(await sb.from("profiles").select("id").eq("username",n).maybeSingle()).data;
  if(!p)return toast(t("soc.nouser"));
  const {error}=await sb.from("chat_members").insert({chat_id:chat,user_id:p.id});
  toast(error?error.message:t("chat.added"));if(!error)loadChatMembers().then(paintChat)});
 box.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>joinRoomByCode(b.dataset.join));
 icons()}

async function loadChatMembers(){
 const c=SOC.chat;if(!c||!c.chat)return;
 try{
  const rows=(await sb.from("chat_members").select("user_id,role").eq("chat_id",c.chat)).data||[];
  const ids=rows.map(r=>r.user_id);
  const ps=ids.length?(await sb.from("profiles").select("id,username,avatar_url,privacy").in("id",ids)).data?.map(maskProf)||[]:[];
  c.membersCache=rows.map(r=>({...r,profile:ps.find(p=>p.id===r.user_id)}))
 }catch(e){console.warn("chat members:",e?.message||e)}}

async function customizeGroup(){
 const c=SOC.chat;if(!c||!c.chat)return;
 const name=await askText(t("chat.rename"),c.name);
 if(name&&name!==c.name){
  const {error}=await sb.from("chats").update({name}).eq("id",c.chat);
  if(!error){c.name=name;SOC.chat.name=name}}
  const about=await askText(t("chat.about.ph"),c.group?.about||"");
  /* Cancel (null) must leave the description alone, not wipe it. */
  if(about!=null&&about!==(c.group?.about||"")){
   const {error}=await sb.from("chats").update({about:about||null}).eq("id",c.chat);
   if(!error)c.group={...(c.group||{}),about:about||null}}
 const wantPic=await askConfirm(t("chat.avatar.q"),t("dlg.ok"),false);
 if(wantPic){
  const f=document.createElement("input");f.type="file";f.accept="image/png,image/jpeg,image/webp";
  const picked=new Promise(r=>{f.onchange=()=>r(f.files?.[0]||null);f.oncancel=()=>r(null)});
  f.click();
  const file=await picked;
  if(file){const img=await compressChatImage(file,96,14000);
   if(img)await sb.from("chats").update({avatar:img}).eq("id",c.chat)}}
 openChat("g:"+c.chat)}

/* Chat pictures are compressed hard before they ever leave the machine:
   720 px max side, webp, and a retry ladder if the result is still fat. The
   500 MB database is the whole reason this exists — a "photo chat" that sends
   4 MB jpegs fills it in an afternoon. */
async function compressChatImage(file,maxSide=720,budget=150000){
 try{
  const bmp=await createImageBitmap(file);
  const k=Math.min(1,maxSide/Math.max(bmp.width,bmp.height));
  const c=document.createElement("canvas");
  c.width=Math.max(1,Math.round(bmp.width*k));c.height=Math.max(1,Math.round(bmp.height*k));
  c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
  bmp.close?.();
   for(const q of[.72,.55,.4]){
    const url=c.toDataURL("image/webp",q);
    /* The last rung accepts any size: previously this compared a number to a
       string (q===".4".slice(1) is 0.4==="4"), so a photo that would not fit
       the budget even at the lowest quality silently failed to send. */
    if(url.length<=budget||q===.4)return url}
 }catch(e){toast(t("img.fail"))}
 return null}

/* ── rooms ──────────────────────────────────────────────── */
async function renderRooms(){
 const box=document.getElementById("roombody");if(!box)return;
 if(!sb||!sbUser)return needAuth(box);
 if(SOC.room)return paintRoomShell(); /* already inside one */
 try{
  const {data}=await sb.from("rooms").select("id,name,join_code,is_private,updated_at,track,playing,room_members(user_id)")
   .eq("is_private",false).order("updated_at",{ascending:false}).limit(30);
 const list=data||[];
 box.innerHTML=`<div class="panel pane">
  <div class="tokrow" style="margin:0 0 12px">
   <button class="primary sm" id="mkroom"><i data-lucide="plus" width="14" height="14"></i>${t("room.new")}</button>
   <input id="joincode" placeholder="MEOW-XXXX" maxlength="9" style="text-transform:uppercase">
   <button class="btn" id="joinbtn">${t("room.join")}</button>
  </div>
  ${list.map(r=>`<button class="chatrow" data-roomid="${r.id}">
    <span class="avat ghost">🎧</span>
    <span class="meta"><b>${esc(r.name)}</b><span>${r.playing?esc(r.track?.t||""):t("room.silent")} · ${(r.room_members||[]).length}</span></span>
    <i data-lucide="chevron-right" width="15" height="15"></i></button>`).join("")
   ||`<p class="ph">${t("room.none")}</p>`}
 </div>`;
 document.getElementById("mkroom").onclick=async()=>{
  const n=await askText(t("room.newname"));
  if(!n)return;
  /* One decision, two buttons: "Private" is OK, "Public" is cancel — there is
     no third "abort" state worth a dialog of its own. */
  const priv=await showModal({title:t("room.privq"),input:false,
   confirm:t("room.privyes"),cancel:t("room.privpub")});
  const {data,error}=await sb.rpc("create_room",{name:n,private:!!priv});
  if(error)return toast(error.message);
  enterRoom(data)};
 document.getElementById("joinbtn").onclick=()=>joinRoomByCode(document.getElementById("joincode").value);
 box.querySelectorAll("[data-roomid]").forEach(b=>b.onclick=async()=>{
   const {data}=await sb.from("rooms").select("*").eq("id",b.dataset.roomid).maybeSingle();
   if(data)enterRoom(data)});
 icons()
 }catch(e){box.innerHTML=socErrBox(socialFail(e))}}

async function joinRoomByCode(code){
 if(!sb||!sbUser)return go("rooms");
 const {data,error}=await sb.rpc("join_room",{code});
 if(error)return toast(t("room.nocode"));
 enterRoom(data)}

function roomTrackOf(tr){
  /* Room tracks use the same proxy/audio path as normal search results. */
  return tr?{...tr,mode:"local"}:null}

async function enterRoom(row){
 SOC.room=row;
 await refreshRoomState();
 go("rooms");
 paintRoomShell();
 roomLoop()}

/* The room loop: one interval that both publishes (DJ) and follows (listener).
   The DJ's client is the clock: it writes track/position every few seconds and
   on every change. Listeners read the same row and correct their drift only
   when it exceeds a second and a half — constantly re-seeking sounds worse
   than being a little off. */
function roomLoop(){
 socTimer("room",roomTick,3000)}
async function roomTick(){
 if(!SOC.room)return;
 const dj=SOC.roomRole==="owner"||SOC.roomRole==="dj";
 /* The host broadcasts whatever they are playing, full stop.

    This used to require PLAYCTX.key to equal "room:<id>", i.e. the track had to
    have been started from the room's own queue panel. Playing anything the
    normal way — from the wave, a search result, the library — left the room row
    untouched, so the host heard music and everyone else sat in silence looking
    at "тишина". That is the reported "rooms work very strangely": the
    expectation is simply that the host presses play and the room follows.

    So the condition is the role, not the playback context. */
 if(dj&&S.current&&S.current.mode!=="empty"){
  const playing=!!S.playing;
  const sameTrack=SOC.room.track&&String(S.current.id)===String(SOC.room.track.id)&&S.current.s===SOC.room.track.s;
  if(!sameTrack||Math.abs((SOC.room.position||0)-S.pos)>2||SOC.room.playing!==playing){
   const patch={track:stripTrack(S.current),position:S.pos,playing,updated_at:new Date().toISOString()};
   const {data,error}=await sb.from("rooms").update(patch).eq("id",SOC.room.id).select().single();
   if(!error&&data)SOC.room=data}}
 await refreshRoomState();
 paintRoomPlayback()}

function stripTrack(tr){return tr&&tr.mode!=="empty"
 ?{s:tr.s,id:tr.id,t:tr.t,a:tr.a,al:tr.al,art:tr.art,d:tr.d}:null}

async function refreshRoomState(){
  if(!SOC.room)return;
  /* The room poll runs every three seconds; one failed round trip must not
     throw through roomTick and kill the interval chain. */
  try{
  const {data}=await sb.from("rooms").select("*").eq("id",SOC.room.id).maybeSingle();
  if(!data){SOC.room=null;return renderRooms()}
  SOC.room=data;
  const mem=(await sb.from("room_members").select("user_id,role").eq("room_id",data.id)).data||[];
  SOC.roomRole=mem.find(m=>m.user_id===sbUser.id)?.role||null;
  const ids=mem.map(m=>m.user_id);
  const ps=ids.length?(await sb.from("profiles").select("id,username,avatar_url,privacy").in("id",ids)).data?.map(maskProf)||[]:[];
  SOC.roomMembers=mem.map(m=>({...m,profile:ps.find(p=>p.id===m.user_id)}));
  SOC.roomQueue=(await sb.from("room_queue").select("*").eq("room_id",data.id).order("position")).data||[];
  SOC.requests=(await sb.from("room_requests").select("*").eq("room_id",data.id).eq("status","pending").order("id",{ascending:false}).limit(20)).data||[];
  const roomChat=(await sb.from("messages").select("*").eq("room_id",data.id).order("id",{ascending:true}).limit(60)).data||[];
  SOC.roomChat=roomChat
  }catch(e){console.warn("room state:",e?.message||e)}}

/* The listener side of sync: called after every refresh. */
function paintRoomPlayback(){
 if(!SOC.room||!SOC.room.track)return;
 const r=SOC.room;
 const isDj=SOC.roomRole==="owner"||SOC.roomRole==="dj";
 /* The host is the clock and never follows the row it just wrote — regardless
    of where its current track was started from. Tying this to PLAYCTX made the
    host chase its own broadcast and re-seek itself whenever it played from
    anywhere but the room panel. */
 if(isDj)return;
 const localIsIt=S.current&&String(S.current.id)===String(r.track.id)&&S.current.s===r.track.s;
 const ahead=(Date.now()-new Date(r.updated_at).getTime())/1000;
 const want=r.playing?(r.position||0)+ahead:(r.position||0);
 if(!localIsIt){
  const tr=roomTrackOf(r.track);
  if(tr)setTrack(tr,r.playing,r.playing,"room:"+r.id);
  return}
  if(r.playing&&Math.abs(S.pos-want)>1.5&&S.current?.mode==="local")
  seekSeconds(Math.max(0,want));
 else if(!r.playing&&S.playing)toggle()}

function paintRoomShell(){
 const box=document.getElementById("roombody");if(!box)return;
 const r=SOC.room;if(!r)return renderRooms();
 const isOwner=SOC.roomRole==="owner";
 const isDj=isOwner||SOC.roomRole==="dj";
 const me=sbUser.id;
 const chat=SOC.roomChat||[];
 const members=SOC.roomMembers||[];
 const memberHtml=members.map(m=>`
  <span class="memchip" data-uid="${m.user_id}" title="${esc(m.profile?.username||"")}">
   ${avat(m.profile,22)}
   <i>${esc((m.profile?.username||"?").slice(0,12))}${m.role==="owner"?" 👑":""}</i>
   ${isOwner&&m.user_id!==me?`<button class="qrm" data-kick="${m.user_id}" title="${t("room.kick")}"><i data-lucide="x" width="11" height="11"></i></button>`:""}
  </span>`).join("");
 box.innerHTML=`<div class="panel pane roompane">
  <div class="chathdr">
   <button class="ic" id="leaveroom" title="${t("room.leave")}"><i data-lucide="log-out" width="16" height="16"></i></button>
   <b>${esc(r.name)}</b>
   <button class="codechip" id="copycode" title="${t("room.copycode")}">${esc(r.join_code)}${r.is_private?" · 🔒":""}</button>
   <span class="grow"></span>
   ${isOwner?`<button class="btn sm danger" id="delroom">${t("room.del")}</button>`:""}
  </div>
  <div class="memstrip">${memberHtml}</div>
  <div class="roomnow" id="roomnow"></div>
  <div class="roomcols">
   <div>
    <p class="eyebrow">${t("room.queue")}</p>
    <div class="qlist roomq" id="roomql"></div>
    <div class="tokrow roomadd" style="margin-top:8px">
     <input id="reqq" placeholder="${isDj?t("room.addq.ph"):t("room.findph")}">
    </div>
    <div id="reqres" class="reqres"></div>
    ${isDj?`<p class="eyebrow" style="margin-top:12px">${t("room.reqs")}</p>
      <div id="roomreqs"></div>`:""}
   </div>
   <div>
    <p class="eyebrow">${t("room.chat")}</p>
    <div class="chatlog roomlog" id="roomlog">${chat.map(m=>{
     const mine=m.sender===me;
     const who=members.find(x=>x.user_id===m.sender)?.profile;
     return `<div class="msg ${mine?"mine":""}">
      ${!mine?`<span class="who">${esc(who?.username||"…")}</span>`:""}
      ${chatBodyHtml(m)}<time>${esc(ago(m.sent_at))}</time></div>`}).join("")}</div>
    <div class="chatrow-input">
     <input id="room-inp" placeholder="${t("chat.ph")}" maxlength="2000" autocomplete="off">
     <button class="primary sm" id="room-send"><i data-lucide="send" width="15" height="15"></i></button>
    </div>
   </div>
  </div></div>`;
 document.getElementById("leaveroom").onclick=async()=>{
  /* The RPC also sweeps the room away when the last member leaves; the plain
     delete is the pre-11 fallback so leaving never gets stuck. */
  const {error}=await sb.rpc("leave_room",{r:r.id});
  if(error)await sb.from("room_members").delete().eq("room_id",r.id).eq("user_id",me);
  SOC.room=null;socClearAll();renderRooms()};
  document.getElementById("delroom")?.addEventListener("click",async()=>{
  if(!await askConfirm(t("room.delq"),t("room.del"),true))return;
  await sb.from("rooms").delete().eq("id",r.id);
   SOC.room=null;socClearAll();renderRooms();toast(t("room.deleted"))});
 document.getElementById("copycode").onclick=()=>{
  navigator.clipboard?.writeText(r.join_code).then(()=>toast(t("room.copied"))).catch(()=>{})};
 box.querySelectorAll("[data-kick]").forEach(b=>b.onclick=async()=>{
  await sb.from("room_members").delete().eq("room_id",r.id).eq("user_id",b.dataset.kick);
  toast(t("room.kicked"));
  refreshRoomState().then(paintRoomShell)});
 document.getElementById("room-send").onclick=sendRoomMsg;
 document.getElementById("room-inp").addEventListener("keydown",e=>{if(e.key==="Enter")sendRoomMsg()});
 /* One search box, two behaviours: DJs put the track straight into the queue,
    listeners propose it and wait for a ✓. The queue only moves when a DJ is
    playing the room context, so a listener search can never seize playback. */
 document.getElementById("reqq").addEventListener("input",async e=>{
  const q=e.target.value.trim();if(q.length<2)return;
  const res=await searchRemote(q).catch(()=>[]);
  const host=document.getElementById("reqres");
  host.innerHTML=(res||[]).slice(0,6).map(x=>
   `<button class="btn sm" data-full='${esc(JSON.stringify({s:x.s,id:x.id,t:x.t,a:x.a,al:x.al,art:x.art,d:x.d}))}'>
     ${isDj?"＋ ":""}${esc(x.t)} — ${esc(x.a)}</button>`).join("");
  host.querySelectorAll("[data-full]").forEach(b=>b.onclick=async()=>{
   const tr=JSON.parse(b.dataset.full);
   if(isDj){
    const {error}=await sb.from("room_queue").insert({room_id:r.id,track:tr,added_by:me});
    if(error)return toast(error.message);
    host.innerHTML="";
    /* Nothing on air yet: start the room on this track right away instead of
       making the DJ find a play button. */
    if(!r.track&&PLAYCTX.key!=="room:"+r.id)setTrack(tr,true,true,"room:"+r.id);
    refreshRoomState().then(()=>{paintRoomLists();paintRoomNow()})}
   else{
    const {error}=await sb.from("room_requests").insert({room_id:r.id,user_id:me,track:tr});
    toast(error?error.message:t("room.req.sent"));
    if(!error)host.innerHTML=""}})});
 paintRoomNow();
 paintRoomLists();
 const log=document.getElementById("roomlog");
 if(log)log.scrollTop=log.scrollHeight;
 box.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>joinRoomByCode(b.dataset.join));
 icons()}

async function sendRoomMsg(){
 const inp=document.getElementById("room-inp");
 const body=inp?.value.trim();if(!body)return;
 const {error}=await sb.from("messages").insert({room_id:SOC.room.id,sender:sbUser.id,body});
 if(error)return toast(error.message);
 inp.value="";
 refreshRoomState().then(paintRoomShell)}

function paintRoomNow(){
 const el=document.getElementById("roomnow");if(!el)return;
 const r=SOC.room;const isDj=SOC.roomRole==="owner"||SOC.roomRole==="dj";
 const tr=r.track;
 el.innerHTML=tr?`
  <span class="art" ${coverStyle(tr.art)}></span>
  <span class="meta"><b>${esc(tr.t)}</b><span>${esc(tr.a)}</span></span>
  ${isDj?`<button class="ic" id="roomplay"><i data-lucide="${S.playing?"pause":"play"}" width="16" height="16"></i></button>`:
    `<span class="mut">${r.playing?t("room.live"):t("room.paused")}</span>`}`
  :`<p class="ph" style="margin:0">${t("room.silent")}</p>`;
 document.getElementById("roomplay")?.addEventListener("click",()=>{
  if(PLAYCTX.key!=="room:"+r.id&&r.track)setTrack(roomTrackOf(r.track),true,true,"room:"+r.id);
  else toggle();
  roomTick()})}

function paintRoomLists(){
 const ql=document.getElementById("roomql");if(!ql)return;
 const isDj=SOC.roomRole==="owner"||SOC.roomRole==="dj";
 ql.innerHTML=(SOC.roomQueue||[]).map((q,i)=>`
  <div class="q" style="--i:${Math.min(i,12)}">
   <i class="n">${String(i+1).padStart(2,"0")}</i>
   <b>${esc(q.track?.t||"")}</b><em>${esc(q.track?.a||"")}</em>
   ${isDj?`<button class="qrm" data-delm="${q.id}"><i data-lucide="x" width="13" height="13"></i></button>`:""}
  </div>`).join("")||`<p class="ph">${t("room.qempty")}</p>`;
 ql.querySelectorAll("[data-delm]").forEach(b=>b.onclick=async()=>{
  await sb.from("room_queue").delete().eq("id",+b.dataset.delm);
  refreshRoomState().then(()=>{paintRoomLists()})});
 const rq=document.getElementById("roomreqs");
 if(rq){
  const me=sbUser.id;
  rq.innerHTML=(SOC.requests||[]).map(q=>{
   const who=(SOC.roomMembers||[]).find(x=>x.user_id===q.user_id)?.profile;
   return `<div class="reqrow">
    ${avat(who,24)}<span class="meta"><b>${esc(who?.username||"")}</b><span>${esc(q.track?.t||"")} — ${esc(q.track?.a||"")}</span></span>
    <button class="primary sm" data-ok="${q.id}">✓</button>
    <button class="btn sm danger" data-no="${q.id}">✗</button></div>`}).join("")
   ||`<p class="ph">${t("room.noreqs")}</p>`;
  rq.querySelectorAll("[data-ok]").forEach(b=>b.onclick=async()=>{
   const {error}=await sb.rpc("approve_request",{req:+b.dataset.ok});
   if(error)toast(error.message);
   refreshRoomState().then(()=>{paintRoomLists();paintRoomNow()})});
  rq.querySelectorAll("[data-no]").forEach(b=>b.onclick=async()=>{
   await sb.from("room_requests").update({status:"declined"}).eq("id",+b.dataset.no);
   refreshRoomState().then(paintRoomLists)})}}

/* The row whose track is starting leaves the server queue. Fire-and-forget:
   roomTick() refreshes the room state every three seconds, so a dropped round
   trip delays the panel, never playback. */
function roomConsume(tr){
 if(!sb||!tr||tr.mode==="empty")return;
 if(!(SOC.roomRole==="owner"||SOC.roomRole==="dj"))return;
 const row=(SOC.roomQueue||[]).find(q=>q.track&&String(q.track.id)===String(tr.id)&&q.track.s===tr.s);
 if(!row)return;
 sb.from("room_queue").delete().eq("id",row.id).then(()=>{},e=>console.warn("room consume:",e?.message||e));}

/* When the DJ's track ends inside a room, the queue's head takes over. The row
   itself is consumed by setTrack() -> roomConsume(), so this only has to find
   what is left after the refresh. */
async function roomAdvance(){
 if(!SOC.room)return false;
 await refreshRoomState();
 const nextRow=(SOC.roomQueue||[])[0];
 if(!nextRow)return false;
 setTrack(roomTrackOf(nextRow.track),true,true,"room:"+SOC.room.id);
 return true}

/* ── leaderboard ────────────────────────────────────────── */
async function renderTop(){
 const box=document.getElementById("topbody");if(!box)return;
 if(!sb||!sbUser)return needAuth(box);
 try{
  const {data,error}=await sb.rpc("leaderboard",{limit_:10});
  if(error)return box.innerHTML=`<div class="panel pane"><p class="ph">${esc(error.message)}</p></div>`;
  const me=sbUser.id;
  /* The RPC ships each row's privacy blob so avatar/name hiding is honoured
     right here, without a second query per row. */
  const rows=(data||[]).map(r=>r.user_id===me?r:maskProf(r));
  box.innerHTML=`<div class="panel pane">
   <p class="ph">${t("top.s")}</p>
   ${rows.map((r,i)=>`
    <div class="chatrow asrow ${r.user_id===me?"me":""}" style="grid-template-columns:28px auto 1fr auto">
     <b class="rank">${i<3?["🥇","🥈","🥉"][i]:i+1}</b>
     ${avat(r,34)}
     <span class="meta"><b>${esc(r.username||t("chat.anon"))}</b></span>
     <span class="mut">${fmtListen(r.seconds)}</span>
    </div>`).join("")||`<p class="ph">${t("top.empty")}</p>`}
  </div>`;
  icons()
 }catch(e){box.innerHTML=socErrBox(socialFail(e))}}

/* ── friends, on the profile ────────────────────────────── */
async function renderFriendsBox(){
 const host=document.getElementById("profbody");if(!host||!sbUser)return;
 let box=document.getElementById("frbox");
 if(!box){box=document.createElement("div");box.id="frbox";host.appendChild(box)}
 const me=sbUser.id;
 const {data}=await sb.from("friendships").select("*").or(`requester.eq.${me},addressee.eq.${me}`);
 const rows=data||[];
 const accepted=rows.filter(r=>r.status==="accepted");
 const pendingIn=rows.filter(r=>r.status==="pending"&&r.addressee===me);
 const pendingOut=rows.filter(r=>r.status==="pending"&&r.requester===me);
 const otherId=r=>r.requester===me?r.addressee:r.requester;
 const ids=[...accepted,...pendingIn,...pendingOut].map(otherId);
 const profs=ids.length?(await sb.from("profiles").select("id,username,avatar_url,privacy").in("id",ids)).data?.map(maskProf)||[]:[];
 const prof=id=>profs.find(p=>p.id===id)||{username:"…"};
 box.innerHTML=`<div class="panel pane">
  <h3>${t("fr.t")}</h3>
  <div class="tokrow" style="margin:0 0 12px">
   <input id="fr-add" placeholder="${t("fr.addph")}" autocomplete="off">
   <button class="btn" id="fr-addbtn">${t("fr.add")}</button>
  </div>
  ${pendingIn.length?`<p class="eyebrow">${t("fr.reqs")}</p>`+pendingIn.map(r=>`
   <div class="reqrow">${avat(prof(otherId(r)),28)}
    <span class="meta"><b>${esc(prof(otherId(r)).username)}</b></span>
     <button class="primary sm" data-acc="${r.requester}|${r.addressee}">✓</button>
     <button class="btn sm danger" data-dec="${r.requester}|${r.addressee}">✗</button></div>`).join(""):""}
  ${pendingOut.length?`<p class="eyebrow">${t("fr.sent")}</p>`+pendingOut.map(r=>`
   <div class="chatrow asrow" style="grid-template-columns:auto 1fr auto">${avat(prof(otherId(r)),28)}
    <span class="meta"><b>${esc(prof(otherId(r)).username)}</b></span><span class="mut">${t("fr.wait")}</span></div>`).join(""):""}
  <p class="eyebrow">${t("fr.mine")} · ${accepted.length}</p>
  ${accepted.map(r=>{const p=prof(otherId(r));
   return `<div class="chatrow asrow" style="grid-template-columns:auto 1fr auto auto">
    ${avat(p,34)}<span class="meta"><b>${esc(p.username)}</b></span>
    <button class="btn sm" data-dm="${p.id}"><i data-lucide="message-circle" width="13" height="13"></i></button>
     <button class="ic" data-unfr="${r.requester}|${r.addressee}" title="${t("fr.rm")}"><i data-lucide="user-minus" width="14" height="14"></i></button></div>`}).join("")
   ||`<p class="ph">${t("fr.none")}</p>`}
 </div>`;
 document.getElementById("fr-addbtn").onclick=async()=>{
  const n=document.getElementById("fr-add").value.trim();if(!n)return;
  const {error}=await sb.rpc("add_friend_by_username",{name:n});
  toast(error?error.message:t("fr.sent.ok"));
  if(!error)renderFriendsBox()};
 document.getElementById("fr-add").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("fr-addbtn").click()});
 box.querySelectorAll("[data-acc]").forEach(b=>b.onclick=async()=>{
   const [requester,addressee]=b.dataset.acc.split("|");
   await sb.from("friendships").update({status:"accepted"}).eq("requester",requester).eq("addressee",addressee);
  renderFriendsBox()});
 box.querySelectorAll("[data-dec]").forEach(b=>b.onclick=async()=>{
   const [requester,addressee]=b.dataset.dec.split("|");
   await sb.from("friendships").delete().eq("requester",requester).eq("addressee",addressee);
  renderFriendsBox()});
 box.querySelectorAll("[data-unfr]").forEach(b=>b.onclick=async()=>{
   const [requester,addressee]=b.dataset.unfr.split("|");
   await sb.from("friendships").delete().eq("requester",requester).eq("addressee",addressee);
  renderFriendsBox()});
 box.querySelectorAll("[data-dm]").forEach(b=>b.onclick=()=>openChat("d:"+b.dataset.dm));
 icons()}

/* ── privacy settings ───────────────────────────────────── */
function paintPrivacy(){
 if(!sbUser){document.getElementById("pv-profile")&&(document.querySelector('[data-stab="priv"]').style.opacity=.5);return}
 const pv=sbProfile?.privacy||{};
 const set=(id,val)=>{document.querySelectorAll(`#${id} button`).forEach(b=>
   b.setAttribute("aria-pressed",String(b.dataset.v===val)))};
 set("pv-profile",pv.profile||"all");
 set("pv-hours",pv.hours||"me");
 set("pv-avatar",pv.avatar||"all");
 set("pv-email",pv.email||"none");
 set("pv-user",pv.username||"all");
 const sw=document.getElementById("pv-board");
 if(sw)sw.setAttribute("aria-pressed",String(pv.board!==false))}
async function savePrivacy(patch){
 const pv={...(sbProfile?.privacy||{}),...patch};
 sbProfile={...sbProfile,privacy:pv};
 /* `privacy` is a client-side blob; `is_public` is the column the row-level
    security policies actually test. Nothing kept them in step, so every
    account whose profile row predates the privacy UI — or that ever toggled it —
    could be left with is_public=false while the UI claimed "visible to all".
    The policies on user_stats and user_badges then returned nothing, and the
    other person's page rendered with only the columns that live on `profiles`:
    the avatar and the bio. Exactly the reported symptom.

    "Nobody" is the only setting that means private; "friends" still needs the
    row readable, because friendship is filtered client-side. */
 const isPublic=pv.profile!=="none";
 sbProfile.is_public=isPublic;
 const {error}=await sb.from("profiles").upsert({id:sbUser.id,privacy:pv,is_public:isPublic});
 if(error)toast(error.message)}
/* id in the markup -> key inside the privacy blob */
const PRIV_SEG={"pv-profile":"profile","pv-hours":"hours","pv-avatar":"avatar","pv-email":"email","pv-user":"username"};
Object.entries(PRIV_SEG).forEach(([id,key])=>{
 document.getElementById(id)?.addEventListener("click",e=>{
  const b=e.target.closest("button[data-v]");if(!b)return;
  savePrivacy({[key]:b.dataset.v});
  paintPrivacy()})});
document.getElementById("pv-board")?.addEventListener("click",()=>{
 const pv=sbProfile?.privacy||{};
 savePrivacy({board:pv.board===false?true:false});
 paintPrivacy()});

/* ── profile settings tab ────────────────────────────────── */
/* Editing lives in Settings; the profile page only displays. The tab is filled
   whenever the profile renders, and the pickers reuse the same cropper and
   upload path the page used to have. */
function fillProfileSettings(){
 const un=document.getElementById("set-un");
 const bio=document.getElementById("set-bio");
 if(!un||!bio)return;
 un.value=sbProfile?.username||"";
 bio.value=sbProfile?.bio||"";
 const hint=document.getElementById("set-ava-hint");
 if(hint)hint.textContent=sbProfile?.avatar_url?t("sprof.set"):"";
 un.onchange=async()=>{
  if(!sbUser||!un.value.trim())return;
  const {error}=await sb.from("profiles").upsert({id:sbUser.id,username:un.value.trim()});
  toast(error?error.message:t("pr.name.saved"));
  if(!error)sbProfile={...sbProfile,username:un.value.trim()}}}
document.getElementById("set-bio-save")?.addEventListener("click",async()=>{
 if(!sbUser)return;
 const v=document.getElementById("set-bio").value.trim();
 const {error}=await sb.from("profiles").upsert({id:sbUser.id,bio:v||null});
 toast(error?error.message:t("pr.bio.saved"));
 if(!error)sbProfile={...sbProfile,bio:v}});
document.getElementById("set-ava-pick")?.addEventListener("click",()=>document.getElementById("set-ava").click());
document.getElementById("set-ban-pick")?.addEventListener("click",()=>document.getElementById("set-ban").click());
document.getElementById("set-ava")?.addEventListener("change",async e=>{
 const f=e.target.files?.[0];e.target.value="";
 if(f&&sbUser){await uploadAvatar(f);fillProfileSettings()}});
document.getElementById("set-ban")?.addEventListener("change",async e=>{
 const f=e.target.files?.[0];e.target.value="";
 if(f&&sbUser){await uploadBanner(f);fillProfileSettings()}});

/* Privacy masking for other people's profiles: applied where a name or an
   avatar is about to be shown in chats, rooms, friends and the leaderboard.
   Own views pass through unmasked — you always see yourself. */
const maskProf=p=>{
 if(!p)return null;
 const pv=p.privacy||{};
 return {...p,
  username:pv.username==="none"?t("soc.hidden"):p.username,
  avatar_url:pv.avatar==="none"?null:p.avatar_url}};

/* The queue panel labels the context; rooms deserve a name there too. */

/* boot */
restore();
setTheme(S.theme);setAccent(S.accent);
/* Lite has to be on the document before the first sprite is drawn, or the
   field warms up at full dpr and only drops down a frame later. */
applyLite();
/* Boot exactly as the beta did: the user's own glow, blur and density are
   applied directly — nothing second-guesses them. */
document.documentElement.style.setProperty("--glow",S.glow);
document.documentElement.style.setProperty("--blur",S.blur+"px");
build(innerWidth<900?Math.round(safeParticleDensity()*.45):safeParticleDensity());
setSeg("theme",S.theme);setSeg("lang",LANG);setSeg("quality",S.quality);
setSeg("dens",S.dens);setSeg("pspeed",S.pspeed);setSeg("glow",S.glow);setSeg("blur",S.blur);
document.getElementById("vol").value=Math.round(S.vol*100);
document.getElementById("shuffle").setAttribute("aria-pressed",String(S.shuffle));
document.getElementById("repeat").setAttribute("aria-pressed",String(S.repeat));
if(S.current?.mode==="empty")document.getElementById("np").innerHTML=`<span class="meta"><b>${t("np.none")}</b><span>${t("np.none.s")}</span></span>`;
document.getElementById("sp-speed").value=Math.round(S.sp.speed*100);
document.getElementById("sp-speed-v").textContent=S.sp.speed.toFixed(2);
document.getElementById("sp-rad").value=Math.round(S.sp.rad*100);
document.getElementById("sp-rad-v").textContent=Math.round(S.sp.rad*100);
document.getElementById("sp-elev").value=Math.round(S.sp.elev*100);
document.getElementById("sp-elev-v").textContent=Math.round(S.sp.elev*100);
["sp-on","sp3d"].forEach(id=>document.getElementById(id)?.setAttribute("aria-pressed",String(S.sp.on)));
applyI18n();
renderBands();renderNP();paint();sync();go("home");search("");
showSettingsTab(S.stab);renderWaveHint();renderLocalInfo();renderDislikes();
/* Restore a custom accent before the first paint, or the field builds its
   sprites with the default colour and only corrects itself on the next change. */
if(S.accent==="custom"&&S.customAccent)setCustomAccent(S.customAccent);
renderDlSettings();checkFfmpeg();
/* Cover relay needs the proxy port: fetch it now and repaint the surfaces
   that may have rendered direct (broken) cover URLs before it arrived. */
if(TAURI)ensureStreamPort().then(p=>{
 if(p){renderNP();if(S.view==="library")renderLib();if(fp.dataset.open==="true")renderFP()}});
/* Startup update check, quiet unless something is available. */
if(TAURI)setTimeout(()=>checkUpdate(false),4000);
requestAnimationFrame(()=>{paintAllSegs();paintAllRanges()});
/* Hand the local paths back to Rust, or the proxy cannot resolve them. */
if(TAURI&&LOCAL_PATHS.length)inv("local_rehydrate",{paths:LOCAL_PATHS}).catch(e=>console.warn("rehydrate:",e));
icons();
if(obDone){
 document.getElementById("ob").hidden=true;
 const app=document.getElementById("app");app.setAttribute("aria-hidden","false");app.classList.add("ready");
}else obGo(0);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{if(S.theme==="system")setTheme("system")});

/* частицы стартуют за краями экрана и стягиваются в круг */
if(!BOOT.reduce){F.mode="gather";scatterEdges()}

/* волна срабатывает, когда бэкенд ответил, но не раньше 1.15с (чтобы круг успел собраться)
   и не позже 4.5с — иначе медленная сеть завешала бы сплэш навсегда */
const bootMin=new Promise(r=>setTimeout(r,BOOT.reduce?0:1150));
const bootReady=Promise.allSettled([initServices(),initSupabase()]);
Promise.race([
 Promise.all([bootMin,bootReady]),
 new Promise(r=>setTimeout(r,4500))
]).then(bootFinish);


/* ── Spotify ───────────────────────────────────────────────

   Sign-in exists in Rust (PKCE, keychain, refresh). What the app can honestly
   do with the account is bring the library over: Spotify streams are DRM'd
   and the webview has no Widevine, so tracks are imported by name and matched
   to a playable source. */

let SP={me:null,lists:null};
async function renderSpotify(){
 const panel=document.getElementById("sppanel"),body=document.getElementById("spbody");
 if(!panel||!TAURI)return;
 try{
  const available=await inv("spotify_available");
  if(!available){panel.hidden=true;return}
  panel.hidden=false;
 }catch(e){panel.hidden=true;return}
 if(!SP.me)SP.me=await inv("spotify_me").catch(()=>null);
 if(!SP.me){
  body.innerHTML=`<p class="ph" style="margin:0 0 10px">${t("sp.desc")}</p>
   <button class="btn" id="sp-login">${t("sp.login")}</button>`;
  document.getElementById("sp-login").onclick=async()=>{
   toast(t("sp.browser"));
   try{SP.me=await inv("spotify_login");renderSpotify()}
   catch(e){toast(String(e.message||e),5200)}};
  return}
 body.innerHTML=`<p class="ph" style="margin:0 0 10px">${esc(SP.me.display_name||SP.me.id)} · ${SP.me.product||"free"} <button class="btn sm" id="sp-out" style="margin-left:8px">${t("sp.logout")}</button></p>
  <div id="splists"><p class="ph">${t("sp.loading")}</p></div>`;
 document.getElementById("sp-out").onclick=async()=>{
  await inv("spotify_logout").catch(()=>{});SP={me:null,lists:null};renderSpotify()};
 if(!SP.lists){
  SP.lists=await inv("spotify_playlists").catch(e=>{toast(String(e.message||e));return null})}
 const list=document.getElementById("splists");
 if(!SP.lists){list.innerHTML=`<p class="ph">${t("sp.nolists")}</p>`;return}
 list.innerHTML=(SP.lists||[]).map(p=>
  `<div class="chatrow asrow" style="grid-template-columns:auto 1fr auto">
   <span class="avat ghost">♫</span>
   <span class="meta"><b>${esc(p.name)}</b><span>${p.total} ${t("tracks")}</span></span>
   <button class="btn sm" data-spimp="${esc(p.id)}" data-spname="${esc(p.name)}">${t("sp.import")}</button></div>`).join("")
  ||`<p class="ph">${t("sp.nolists")}</p>`;
 list.querySelectorAll("[data-spimp]").forEach(b=>b.onclick=()=>importSpotifyPlaylist(b.dataset.spimp,b.dataset.spname))}

/* Matching is sequential on purpose: a burst of searches trips YouTube's
   guest quota and half the playlist arrives unmatched. */
const SP_IMPORT_MAX=200;
async function importSpotifyPlaylist(pid,name){
 const rows=await inv("spotify_playlist_tracks",{pid}).catch(e=>{toast(String(e.message||e));return null});
 if(!rows||!rows.length)return toast(t("sp.empty"));
 /* Say when the list is cut, rather than reporting "done: N of N" against a
    count the import never attempted. */
 const take=rows.slice(0,SP_IMPORT_MAX);
 if(rows.length>take.length)toast(t("sp.capped").replace("{n}",take.length),6500);
 toast(t("sp.importing").replace("{n}",take.length),6000);
 /* Awaited, and awaited for real: newPlaylist() is async, so without `await`
    plId was a Promise, `PLAYLISTS.find(p=>p.id===plId)` never matched and
    addToPlaylist() added every track to nothing — an empty playlist and a
    toast that reported success anyway. */
 const plId=await newPlaylist(name);
 if(!plId)return;
 const pl=PLAYLISTS.find(p=>p.id===plId);
 let ok=0;
 for(const r of take){
  const q=`${r.a||""} ${r.t||""}`.trim();
  if(!q)continue;
  const hits=await searchRemote(q).catch(()=>[]);
  const hit=(hits||[]).find(x=>x.s==="ytm");
  /* Counted only when the track really landed: the counter used to go up
     whatever addToPlaylist decided, duplicates included. */
  if(hit&&pl&&!pl.tracks.some(x=>String(x.id)===String(hit.id)&&x.s===hit.s)){
   await addToPlaylist(plId,hit);ok++}
  await new Promise(res=>setTimeout(res,150))}
 renderLib();
 toast(t("sp.imported").replace("{ok}",ok).replace("{n}",take.length),5200)}

if(TAURI)setTimeout(renderSpotify,800);
