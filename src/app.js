/* Boot error surface. A top-level throw used to mean a silent black window:
   the splash never finished and nothing anywhere said why. Any uncaught error
   or rejection now paints itself onto the splash and the window title, so a
   broken boot is readable at a glance instead of a debugging session. */
(function(){
 const paint=(kind,msg,src,line)=>{
  try{
   const txt=`${kind}: ${msg||"unknown"}`+(src?` (${String(src).split("/").pop()}:${line||"?"})`:"");
   console.error("[meowave]",txt);
   document.title="Meowave: "+txt.slice(0,140);
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

/* boot: the splash dissolves into the interface (app.css, "Splash") */
const motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
const BOOT={done:false,reduce:motionMedia.matches};
motionMedia.addEventListener("change", e => {
  BOOT.reduce = e.matches;
  if(typeof onReducedMotionChange === "function") onReducedMotionChange(e.matches);
});
document.documentElement.classList.add("booting");
function bootFinish(){
 if(BOOT.done)return;BOOT.done=true;
 const sp=document.getElementById("splash");
 /* One move: the mark and name fade back, the backdrop dissolves (.1 s
    later), and underneath the interface rises into place in three layers
    (.app.ready). The field breathes out from the middle as it is uncovered —
    a soft push, not the old shockwave. With onboarding still ahead, its card
    takes the stage instead and adds .ready itself when done. */
 sp?.classList.add("done");
 if(obDone)document.getElementById("app")?.classList.add("ready");
 if(!BOOT.reduce)shock(.5);else F.mode=S.playing?"flow":"cloud";
 if(sp){sp.hidden=true;setTimeout(()=>{sp.style.display="none"},BOOT.reduce?80:900)}
 document.documentElement.classList.remove("booting");
}
/* i18n */
const I18N={
ru:{"nav.home":"Волна","nav.search":"Поиск","nav.library":"Медиа","nav.settings":"Настройки","nav.more":"Ещё","nav.back":"Назад","srv.title":"Сервисы поиска","srv.btn":"Сервисы","srv.active":"Сервисы","eq.title":"Эквалайзер и Звук","set.sp.t":"3D Пространственный звук","import.ph":"Spotify, YouTube Music, music.yandex.ru/users/.../playlists/... или SoundCloud","import.name":"Название плейлиста",
"top.ph":"Поиск по всем сервисам",
"wv.tune":"Регулировка","wv.src":"Откуда волна","wv.src.auto":"Авто","wv.div":"Характер","wv.div.favorite":"Любимое","wv.div.discover":"Незнакомое","wv.div.popular":"Популярное","wv.mood":"Настроение","wv.mood.active":"Бодрое","wv.mood.fun":"Весёлое","wv.mood.calm":"Спокойное","wv.mood.sad":"Грустное","wv.lang":"Язык","wv.lang.russian":"Русский","wv.lang.not-russian":"Иностранный","wv.lang.without-words":"Без слов","wv.restart":"Волна перестроена","wv.ym.fail":"Моя волна Яндекса не ответила — собираем волну из ваших треков","wv.none":"Подключите сервис, чтобы запустить волну","wv.from":"Моя волна · {s}",
"hs.t":"Подборки","hs.load":"Загружаем подборки…","hs.err":"Не удалось загрузить подборки","hs.retry":"Повторить","hs.empty":"Здесь пока пусто","hs.ymtok":"Для подборок Яндекса нужен токен (Настройки → Аккаунты)",
"dv.back":"Назад","dv.play":"Слушать","dv.shuffle":"Перемешать","dv.save":"В медиатеку","dv.saved":"Сохранено в плейлисты","dv.load":"Открываем…","dv.err":"Не удалось открыть","dv.tracks":"Треки","dv.top":"Популярные треки","dv.albums":"Альбомы","dv.singles":"Синглы и EP","dv.related":"Похожие артисты","dv.about":"Об артисте","dv.monthly":"{n} слушателей в месяц","dv.followers":"{n} подписчиков","dv.cities":"Где слушают","dv.follow":"Отслеживать","dv.following":"Вы отслеживаете","dv.lib":"В вашей медиатеке","dv.radio":"Радио артиста","dv.plays":"{n} прослушиваний","dv.src":"Данные: {s}",
"fps.align.r":"Справа","set.wall":"Обои приложения","set.wall.s":"Картинка, GIF или видео за всем интерфейсом","wall.none":"Не выбраны","wall.file":"Файл","wall.url":"По ссылке","wall.clear":"Убрать","wall.dim":"Затемнение","wall.blur":"Размытие","wall.url.ask":"Ссылка на картинку, GIF или видео (https://…)","wall.url.bad":"Нужна ссылка https:// на картинку или видео",
"alt.note":"YouTube не отдал трек — играет из {s}","alt.why":"Почему","alt.t":"Трек играет из другого сервиса","alt.s":"YouTube попросил подтвердить, что вы не бот, и отказался отдавать звук. Так бывает с VPN, общим или корпоративным IP. Чтобы трек не молчал, Meowave нашёл ту же запись в {s} и играет её оттуда.","alt.fix":"Чтобы снова слушать с YouTube: выключите VPN для Meowave (раздельное туннелирование), смените сервер VPN или направьте YouTube через прокси в Настройки → Сеть.","alt.set":"Подменять источник, если YouTube отказывает","alt.set.s":"Тот же трек из Яндекс Музыки или SoundCloud — только точное совпадение","alt.from":"Найдено: {t} — {a}","snk.close":"Закрыть","fail.more":"Подробнее","fail.other":"Другой источник","fail.t":"Почему трек не играет","fail.s":"Всё, что приложение знает о сбое. Если повторяется — скопируйте и пришлите разработчику.","fail.copy":"Копировать","fail.copied":"Скопировано","fail.src":"Источник","fail.probe":"Проверка потока","fail.none":"Подробностей нет: сервис ответил, но файл не воспроизвёлся.","src.t":"Другой источник","src.s":"Тот же трек на других сервисах — выберите, откуда играть.","src.load":"Ищем копии трека…","src.none":"Других источников не нашлось","src.exact":"Точно","src.close":"Похоже","src.maybe":"Другая версия?","src.now":"Играет из: {s}","ytc.t":"Проверка YouTube Music","ytc.s":"Спрашивает каждый клиент YouTube, отдаёт ли он звук на ваше подключение, и проверяет начало и середину файла. Если YouTube Music не играет — пришлите результат.","ytc.run":"Проверить YouTube Music","ytc.btn":"Проверить","ytc.busy":"Проверяем клиенты YouTube… это займёт до минуты","ytc.ok":"Работает","ytc.part":"Только начало","ytc.bad":"Не отдаёт","ytc.sum.ok":"Звук целиком отдают клиенты: {n} из {m} — YouTube Music должен играть","ytc.sum.bad":"Ни один клиент не отдаёт звук целиком. Обычно виноват VPN или общий IP — смените сервер или выключите VPN","ytc.desk":"Проверка работает только в приложении","ytc.copy":"Копировать отчёт","ytc.formats":"форматов: {n}","ytc.start":"начало","ytc.deep":"середина","ytc.win":"окно","ytc.open":"запрос «до конца»","wv.sheet":"Регулировка волны","wv.sheet.s":"Меняется сразу — играющая волна перестроится на ходу","wv.sheet.def":"Настройки по умолчанию","wv.reset":"Сбросить","wv.done":"Готово","wv.live":"Моя волна","wv.now":"Сейчас играет","wv.next":"Дальше","wv.resume":"Продолжить","wv.src.auto.s":"Яндекс, если подключён, иначе другие сервисы","wv.src.ym.s":"Моя волна Яндекса — знает ваши вкусы","wv.src.mix.s":"Из ваших треков и похожих на них","wv.div.default.s":"Любимое и новое вперемешку","wv.div.favorite.s":"Чаще то, что вы уже любите","wv.div.discover.s":"Больше незнакомых артистов","wv.div.popular.s":"Хиты и то, что слушают все","wv.mood.all.s":"Волна подстроится сама","wv.mood.active.s":"Энергично и в ритм","wv.mood.fun.s":"Легко и солнечно","wv.mood.calm.s":"Чтобы выдохнуть","wv.mood.sad.s":"Для дождливого вечера","mini.t":"Мини-плеер","mini.on":"Мини-плеер поверх окон (Ctrl+M)","mini.exit":"Развернуть (Ctrl+M)","mini.pin":"Поверх всех окон","mini.pin.on":"Мини-плеер поверх всех окон","mini.pin.off":"Мини-плеер как обычное окно","mini.idle":"Ничего не играет","mini.idle.s":"Запустите волну или трек","mini.seek":"Позиция","mini.dis":"Не нравится","mini.err":"Не удалось переключить мини-плеер","wv.any":"Любое","wv.lang.any":"Любой","wv.cap":"Волна","wv.mix":"Из ваших треков · {s}","dv.verified":"Подтверждённый артист","dv.rank":"#{n} в мире","dv.gallery":"Галерея","dv.popular":"Популярные релизы","dv.more":"Ещё","wall.set":"Обои установлены","drop.files":"Добавлено файлов: {n}",
"set.covf":"Обложка следует за курсором","set.covf.s":"Лёгкий наклон обложки в полноэкранном плеере",
"drop.t":"Отпустите, чтобы включить","drop.s":"Ссылка на трек, альбом или плейлист: YouTube Music, Spotify, Яндекс Музыка, SoundCloud, Deezer","drop.busy":"Открываем ссылку…","drop.bad":"Эту ссылку не получилось открыть","drop.list":"«{n}»: {c} треков в очереди","drop.one":"Играет: {n}",
"home.t":"Тишина. Поле ждёт.","home.s":"Запустите волну: поток соберётся из ваших артистов, обложка и очередь откроются на весь экран.","home.start":"Запустить волну",
"lib.pl":"Плейлисты","lib.fav":"Избранное","lib.rec":"Недавнее",
"set.t":"Настройки","set.acc":"Аккаунты","set.acc.s":"Подключите свои аккаунты — лайки и плейлисты переедут в библиотеку, а ваши подборки появятся в шторке. Вход идёт на странице самого сервиса; Meowave хранит только ключ сессии, в системном keychain.",
"set.sp":"Пространственный звук","set.sp.s":"PannerNode в режиме HRTF: источник летает вокруг головы по орбите и проходит над ней. Плюс ConvolverNode для комнаты.",
"set.sp.on":"Движение вокруг головы","set.sp.hint":"Только в наушниках","set.sp.speed":"Скорость оборота","set.sp.rad":"Радиус орбиты","set.sp.elev":"Проход над головой",
"set.q":"Качество","set.q.s":"Lossless там, где сервис его отдаёт.","set.q.l":"Поток","q.low":"Низкое","q.mid":"Среднее","q.high":"Высокое",
"set.look":"Вид","set.look.s":"Плотность частиц влияет на нагрузку сильнее всего остального.","set.theme":"Тема","set.accent":"Акцентный цвет","set.accent.s":"По умолчанию без цвета",
"set.dens":"Плотность частиц","set.speed":"Скорость движения","set.glow":"Свечение волны","set.blur":"Блюр панелей","set.lang":"Язык","set.font.ui":"Шрифт интерфейса",
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
"pr.auth.up.title":"Создайте аккаунт для синхронизации библиотеки и статистики","pr.auth.in.title":"Войдите в аккаунт Meowave","pr.auth.guest":"Продолжить без аккаунта","pr.auth.guest.ok":"Гостевой профиль активен","ly.search_genius":"Искать на Genius","ly.genius_prompt":"Поиск текста на Genius (Артист Название):","ly.found_genius":"Текст найден на Genius","ly.src.genius":"Genius",
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
"bd.code.exp":"Срок кода истёк","bd.code.used":"Код исчерпан","bd.code.throttle":"Слишком много попыток — попробуйте через 15 минут",
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
"loc.svc":"Мои файлы","loc.svc.src":"с диска","np.none":"Нет трека","np.none.s":"Подключите сервис и выполните поиск","np.playing":"Слушает","np.paused":"Пауза",
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
"snd.rate":"Скорость","snd.boost":"Громче","snd.boost.off":"выкл","snd.slowed":"slowed","snd.nightcore":"nightcore","snd.normal":"обычно","dlg.ok":"ОК","dlg.cancel":"Отмена","set.icon":"Иконка приложения","set.icon.s":"Значок окна на панели задач и в самом приложении","ico.set":"Иконка изменена","acc.in":"Войти","acc.out":"Выйти","acc.import":"Импорт","acc.paste":"Вставить ключ","acc.token":"Токен","acc.as":"Вы вошли как {u}","acc.stale":"Сессия не подтвердилась — войдите заново","acc.wait":"Ждём входа в отдельном окне…","acc.wait.b":"Ждём входа в браузере…","acc.in.s":"Вход откроется в вашем браузере","acc.in.s2":"Вход на странице сервиса","acc.browser":"Открыт {b} — войдите как обычно. Meowave сам заберёт вход и закроет окно","acc.browser.open":"Окно входа уже открыто в браузере","acc.nobrowser":"Браузер на Chromium не найден — вход в окне {s}","acc.err.closed":"Вход не завершён — браузер закрыт","acc.off.ytm":"Играет без входа · войдите, чтобы перенести библиотеку","acc.off.sc":"Играет без входа · войдите, чтобы перенести библиотеку","acc.off.dz":"Играет без входа · войдите, чтобы перенести библиотеку","acc.off.ym":"Нужен вход: поиск, Моя волна и lossless","acc.off.sp":"Не подключён · звук находится на других площадках","acc.d.ytm":"Лайки, плейлисты и личные миксы в шторке","acc.d.sc":"Лайки, плейлисты и подборки «для вас» в шторке","acc.d.dz":"Любимые треки и плейлисты, ваша полка в шторке","acc.d.ym":"Моя волна, лайки, плейлисты и lossless","acc.d.sp":"Любимые треки и плейлисты · нужен свой Client ID","acc.lib":"Что перенести","acc.all":"Перенести всё","acc.all.t":"Перенести библиотеку {s}?","acc.all.s":"Любимые треки попадут в избранное, плейлисты ({n}) — в библиотеку. Уже перенесённые обновятся, а не задвоятся.","acc.all.ok":"Перенести","acc.liked":"Любимые треки","acc.liked.s":"Попадут в избранное","acc.pl":"Плейлист","acc.tofav":"В избранное","acc.importing":"Переносим…","acc.again":"Ещё раз","acc.note":"Треки играют с родной площадки. Повторный перенос плейлиста обновляет его, а не создаёт копию.","acc.window":"Откроется окно {s} — войдите как обычно, оно закроется само","acc.ok":"{s}: вы вошли как {u}","acc.ok0":"{s} подключён","acc.err.jar":"Вход не отдал сессию — воспользуйтесь «Вставить ключ»","acc.err.time":"Вход не завершён — окно закрыто","acc.out.t":"Выйти из {s}?","acc.out.s":"Перенесённые треки и плейлисты останутся. Пропадёт только ваша полка в шторке.","acc.paste.t":"Ключ сессии {s}","acc.paste.ok":"Подключить","acc.paste.h":"Хранится только в системном keychain","acc.paste.l.ytm":"Заголовок Cookie","acc.paste.l.sc":"oauth_token","acc.paste.l.dz":"arl","acc.paste.s.ytm":"Если вход не получается: откройте music.youtube.com в своём браузере, F12 → «Сеть», обновите страницу, выберите запрос browse и скопируйте значение заголовка Cookie целиком.","acc.paste.s.sc":"Откройте soundcloud.com в своём браузере, F12 → «Приложение» → Cookies → soundcloud.com и скопируйте значение oauth_token.","acc.paste.s.dz":"Откройте deezer.com в своём браузере, F12 → «Приложение» → Cookies → deezer.com и скопируйте значение arl.","acc.paste.bad":"Не похоже на ключ сессии — проверьте, что скопировано целиком","acc.desk":"Вход в аккаунты работает в приложении для компьютера","acc.sp.cid.t":"Spotify Client ID","acc.sp.cid.s":"Создайте приложение на developer.spotify.com/dashboard с Redirect URI http://localhost:8080/callback и вставьте его Client ID.","acc.link":"Импорт по ссылке","acc.link.s":"Плейлист или альбом с любой площадки — без входа","ico.clear-auto":"Авто без фона","ico.clear-light":"Белая без фона","ico.clear-dark":"Тёмная без фона","ico.classic":"Классика","ico.midnight":"Полночь","ico.ocean":"Океан","ico.mint":"Мята","ico.sunset":"Закат","ico.sakura":"Сакура","ico.lavender":"Лаванда","ico.gold":"Золото","ico.paper":"Бумага","set.cbg":"Фон по обложке","set.cbg.s":"Фон приложения мягко принимает цвета текущей обложки","set.cbg.k":"Насыщенность","set.cfade":"Смена цвета","set.cfade.s":"Как быстро акцент и фон переходят к новой обложке","cf.0":"Сразу","cf.1":"Плавно","cf.2":"Очень плавно","dlg.name":"Название","dlg.create":"Создать","dlg.save":"Сохранить","dlg.next":"Далее","dlg.find":"Найти","dlg.add":"Добавить","dlg.link":"Ссылка","dlg.user":"Имя пользователя","dlg.newpl.s":"Соберите свою подборку — треки добавляются из любого списка через правый клик.","dlg.rename.t":"Переименовать плейлист","dlg.pldel.s":"Плейлист исчезнет из библиотеки. Избранное и сами треки останутся.","dlg.genius.t":"Найти текст на Genius","dlg.genius.l":"Исполнитель и название","dlg.quasar.t":"Вход по Quasar ID","dlg.quasar.l":"Quasar ID или почта","dlg.wall.t":"Обои по ссылке","dlg.loc.t":"Очистить локальные треки?","dlg.loc.s":"Все локальные треки уйдут из библиотеки. Файлы на диске не удаляются.","dlg.room.t":"Новая комната","dlg.add.t":"Добавить в группу","dlg.upd.s":"Что нового:",
"upd.norelease":"Релизов пока нет — это первая версия",
"pr.ban.hint":"Нажмите, чтобы сменить баннер","pr.ban.cta":"Сменить баннер","pr.badges":"Значки","img.big":"Изображение слишком большое","crop.avatar":"Аватар","crop.banner":"Баннер","crop.cover":"Обложка плейлиста","crop.zoom":"Масштаб","crop.reset":"Сброс","crop.save":"Сохранить","crop.hint":"Перетащите изображение, колесо мыши — масштаб.","plctx.cover":"Сменить обложку","plctx.coveroff":"Убрать обложку","plctx.cover.ok":"Обложка обновлена","plctx.cover.off":"Обложка убрана","plctx.rename":"Переименовать","plctx.renamed":"Название изменено","plctx.rmtrack":"Убрать из плейлиста","plctx.eq":"Эквалайзер для плейлиста","eq.pl.pinned":"Пресет закреплён за плейлистом",
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
"ym.acc.desc":"Вход по аккаунту: откроется страница Яндекса, войдите — и библиотека подключится. Токен хранится в системном keychain.",
"ym.acc.login":"Войти через аккаунт Яндекса","ym.acc.browser":"Открываю браузер для входа…","ym.acc.wait":"После входа на странице-помощнике вернитесь в Meowave — библиотека подтянется сама", "ym.acc.library":"Синхронизировать библиотеку (лайки и плейлисты)","ym.acc.open":"Открыть страницу вставки токена:",
 "dc.t":"Discord","dc.s":"Друзья в Discord увидят, что вы слушаете: трек, исполнителя, обложку и время. Нужно только запущенное приложение Discord на этом компьютере.","dc.cid":"Своё приложение Discord","dc.cid.s":"Необязательно. Application ID с discord.com/developers — тогда вместо «Meowave» Discord покажет название вашего приложения. Пусто — встроенное.","dc.noid":"Discord-приложение не задано","dc.live":"Подключено — друзья видят, что вы слушаете","dc.desktop":"Работает только в приложении для компьютера","dc.prev":"Так это увидят друзья","dc.listen":"Слушает",
 "dc.on":"Показывать в Discord, что я слушаю","dc.on.ok":"Discord найден","dc.on.no":"Discord не запущен — статус появится, когда вы его откроете",
 "dc.tmpl":"Свой текст","dc.tmpl.s":"Можно вставить: {title} — название, {artist} — исполнитель, {album} — альбом, {service} — площадка",
 "dc.save":"Сохранить","dc.test":"Отправить сейчас","dc.saved":"Сохранено","dc.sent":"Отправлено в Discord","dc.fail":"Discord не отвечает — проверьте, что он запущен","dc.st.as":"Подключено как {u} — друзья видят, что вы слушаете","dc.st.closed":"Discord закрыл соединение:","dc.st.badid":"Discord не принял ID приложения — проверьте его в «Для разработчиков»","dc.st.noapp":"В этой сборке нет встроенного приложения Discord — укажите своё в разделе «Для разработчиков»","dc.st.off":"Выключено","dc.adv":"Для разработчиков","dc.pause.hide":"Скрывать статус","dc.pause.show":"Писать «На паузе»","dc.pause":"На паузе","dc.o.btn.s":"Открывает трек на его площадке","dc.o.btn":"Кнопка «Слушать»","dc.o.time":"Время и полоса прогресса","dc.o.art":"Обложка трека","dc.disp.app":"Meowave","dc.disp.artist":"Исполнитель","dc.disp.track":"Трек","dc.disp.s":"Что видно рядом с вашим именем на сервере","dc.disp":"В списке участников","dc.l2.none":"Ничего","dc.l2.service":"Площадка","dc.l2.album":"Альбом","dc.l2.artist":"Исполнитель","dc.l2":"Вторая строка","dc.l1.custom":"Свой текст","dc.l1.at":"Исполнитель — название","dc.l1.title":"Название","dc.l1":"Первая строка","dc.inlist":"В списке участников:","dc.btn":"Слушать",
 "fp.mode":"Переключить вид плеера","ly.custom.t":"Крупная лирика","ly.custom.s":"Размер и вес строк влияют на режим большой лирики","ly.size":"Размер строк","ly.weight":"Жирность","ly.glow":"Свечение активной строки","ly.cov":"Обложка (режим лирики)","ly.gap":"Междустрочный зазор","ly.font":"Шрифт",
"loc.t":"Локальные треки","loc.s":"Файлы не копируются и никуда не отправляются — читаются с диска напрямую. Теги берутся из имени файла.",
"loc.add":"Добавить файлы","loc.folder":"Добавить папку","loc.folder.s":"Со всеми вложенными",
"loc.fmt":"mp3, flac, wav, ogg, m4a","loc.pick":"Выбрать…",
"loc.count":"В фонотеке {n} локальных треков","loc.empty":"Пока ничего не добавлено",
"loc.added":"Добавлено треков: {n}","loc.none":"Аудиофайлы не найдены","loc.err":"Не удалось прочитать файлы",
"loc.desktop":"Импорт доступен только в приложении","loc.nodlg":"Диалог выбора файлов недоступен",
"cache.t":"Кэш и данные","cache.s":"Обложки и метаданные, сохранённые на диске.","cache.size":"Занято","cache.clr":"Очистить","cache.done":"Кэш очищен",
"data.reset":"Сбросить избранное и историю","data.reset.s":"Настройки и токены останутся","data.reset.btn":"Сбросить","data.done":"Избранное и история очищены",
"about.ver":"Версия","about.s":"Кросс-сервисный плеер с собственным звуковым трактом: эквалайзер, HRTF-орбита и визуализатор работают на всех сервисах, потому что звук идёт через нас, а не через чужой плеер.",
"import.t":"Импорт плейлиста","import.s":"Вставьте ссылку на плейлист из Spotify, YouTube Music или SoundCloud","import.btn":"Импорт","import.check":"Проверить","import.dest_pl":"Создать новый плейлист","import.dest_fav":"Добавить в Избранное","import.submit":"Импортировать","import.enter_url":"Введите ссылку на плейлист",
"fp.set.t":"Настройки плеера","fp.set.bg":"Фон плеера","fp.bg.dynamic":"Альбом","fp.bg.ambient":"Эмбиент","fp.bg.black":"OLED","fp.bg.wall":"Обои","fp.wall.t":"Обои: картинка, GIF или видео","fp.wall.pick":"Выбрать","fp.wall.clear":"Убрать","fp.wall.dim":"Затемнение","fp.wall.blur":"Размытие обоев","fp.wall.app":"Обои на фоне всего приложения","fp.wall.app_sub":"Не только в полноэкранном плеере","fp.set.glow":"Подсветка","fp.set.blur":"Размытие фона","fp.set.font":"Шрифт текста","fp.set.fill":"Режим караоке","fp.fill.smooth":"Плавное","fp.fill.line":"Построчно","fp.set.wobble":"Раскачка обложки","fp.set.wobble_sub":"Анимация бита и парения",
"chat.share_np":"Поделиться текущим треком","wave.moods":"Настроения и жанры","wave.artists":"Рекомендованные артисты",
"cancel":"Отмена","close":"Закрыть","fp.fill.off":"Без заливки","np.play":"Воспроизвести","np.pause":"Пауза","np.prev":"Предыдущий","np.next":"Следующий","np.shuffle":"Перемешать","np.repeat":"Повтор","act.fav":"В избранное","nav.quests":"Квесты и Значки","upd.up_to_date":"Установлена последняя версия","pr.auth.guest.desc":"Локальный профиль Meowave","fp.set.zoom":"Масштаб обложки (YouTube Music)","fp.zoom.normal":"Обычный","fp.zoom.large":"Крупный","fp.zoom.full":"На весь экран","fp.set.drift":"Плавный дрейф и парение","fp.set.drift_sub":"Анимация движения обложки на весь экран",
"pr.err.email":"Введите email","pr.err.pass":"Введите пароль","pr.welcome":"Добро пожаловать!","people.profile":"Профиль",
"ly.edit.title":"Редактор текста и таймингов","ly.edit.desc":"Свой текст с таймингами [мм:сс.хх] или авто-синхронизация по треку",
"ly.edit.auto":"Авто-тайминги (Genius/текст)","ly.edit.auto.title":"Равномерно распределить метки времени по треку",
"ly.edit.stamp":"Поставить метку","ly.edit.stamp.title":"Записать текущую секунду трека",
"ly.edit.clear":"Очистить метки","ly.edit.clear.title":"Очистить все тайминги и оставить чистый текст",
"ly.edit.ph":"[00:12.50] Первая строка текста\\n[00:16.80] Вторая строка текста...",
"ly.edit.reset":"Сбросить на оригинал","ly.edit.cleared":"Метки времени очищены",
"ly.edit.nolines":"Нет строк текста для расстановки таймингов","ly.edit.applied":"Авто-тайминги распределены по треку",
"ly.edit.reset_ok":"Сброшено на оригинальный текст","ly.edit.saved":"Текст песни сохранён",
"tb.fs":"Полноэкранный режим (F11)","tb.max":"Развернуть","search.clear":"Очистить",
"nologin":"Без входа","ready":"Готов"},
en:{"nav.home":"Wave","nav.search":"Search","nav.library":"Media","nav.settings":"Settings","nav.more":"More","nav.back":"Back","srv.title":"Search Services","srv.btn":"Services","srv.active":"Services","eq.title":"Equalizer & Sound","set.sp.t":"3D Spatial Audio","import.ph":"Spotify, YouTube Music, music.yandex.ru or SoundCloud playlist link","import.name":"Playlist name",
"top.ph":"Search across services",
"wv.tune":"Tune","wv.src":"Wave source","wv.src.auto":"Auto","wv.div":"Character","wv.div.favorite":"Favourite","wv.div.discover":"Unfamiliar","wv.div.popular":"Popular","wv.mood":"Mood","wv.mood.active":"Energetic","wv.mood.fun":"Upbeat","wv.mood.calm":"Calm","wv.mood.sad":"Sad","wv.lang":"Language","wv.lang.russian":"Russian","wv.lang.not-russian":"Foreign","wv.lang.without-words":"No vocals","wv.restart":"Wave rebuilt","wv.ym.fail":"Yandex My Wave did not answer — building the wave from your tracks","wv.none":"Connect a service to start the wave","wv.from":"My Wave · {s}",
"hs.t":"Collections","hs.load":"Loading collections…","hs.err":"Could not load collections","hs.retry":"Retry","hs.empty":"Nothing here yet","hs.ymtok":"Yandex collections need a token (Settings → Accounts)",
"dv.back":"Back","dv.play":"Play","dv.shuffle":"Shuffle","dv.save":"Add to library","dv.saved":"Saved to playlists","dv.load":"Opening…","dv.err":"Could not open","dv.tracks":"Tracks","dv.top":"Popular tracks","dv.albums":"Albums","dv.singles":"Singles & EPs","dv.related":"Fans also like","dv.about":"About","dv.monthly":"{n} monthly listeners","dv.followers":"{n} followers","dv.cities":"Where people listen","dv.follow":"Follow","dv.following":"Following","dv.lib":"In your library","dv.radio":"Artist radio","dv.plays":"{n} plays","dv.src":"Data: {s}",
"fps.align.r":"Right","set.wall":"App wallpaper","set.wall.s":"An image, GIF or video behind the whole interface","wall.none":"None","wall.file":"File","wall.url":"From link","wall.clear":"Remove","wall.dim":"Dim","wall.blur":"Blur","wall.url.ask":"Link to an image, GIF or video (https://…)","wall.url.bad":"Needs an https:// link to an image or video",
"alt.note":"YouTube refused the track — playing it from {s}","alt.why":"Why","alt.t":"Playing from another service","alt.s":"YouTube asked to confirm you are not a bot and refused to serve the audio. This happens behind VPNs and shared or corporate IPs. So the track is not silent, Meowave found the same recording on {s} and plays it from there.","alt.fix":"To listen from YouTube again: exclude Meowave from the VPN (split tunnelling), switch the VPN server, or route YouTube through a proxy in Settings → Network.","alt.set":"Switch source when YouTube refuses","alt.set.s":"The same track from Yandex Music or SoundCloud — exact matches only","alt.from":"Found: {t} — {a}","snk.close":"Dismiss","fail.more":"Details","fail.other":"Other source","fail.t":"Why the track did not play","fail.s":"Everything the app knows about the failure. If it keeps happening, copy it and send it to the developer.","fail.copy":"Copy","fail.copied":"Copied","fail.src":"Source","fail.probe":"Stream check","fail.none":"No details: the service answered, but the file did not play.","src.t":"Other source","src.s":"The same track on other services — pick where to play it from.","src.load":"Looking for copies of the track…","src.none":"No other source found","src.exact":"Exact","src.close":"Close","src.maybe":"Other version?","src.now":"Playing from {s}","ytc.t":"YouTube Music check","ytc.s":"Asks every YouTube client whether it serves audio to your connection and checks the start and the middle of the file. If YouTube Music does not play, send the result.","ytc.run":"Check YouTube Music","ytc.btn":"Run check","ytc.busy":"Checking YouTube clients… this can take up to a minute","ytc.ok":"Works","ytc.part":"Start only","ytc.bad":"Refused","ytc.sum.ok":"{n} of {m} clients serve the whole file — YouTube Music should play","ytc.sum.bad":"No client serves the whole file. Usually a VPN or a shared IP — switch the server or turn the VPN off","ytc.desk":"The check only works in the desktop app","ytc.copy":"Copy report","ytc.formats":"formats: {n}","ytc.start":"start","ytc.deep":"middle","ytc.win":"window","ytc.open":"open-ended request","wv.sheet":"Tune your wave","wv.sheet.s":"Applies instantly — a playing wave rebuilds on the fly","wv.sheet.def":"Default settings","wv.reset":"Reset","wv.done":"Done","wv.live":"My Wave","wv.now":"Now playing","wv.next":"Up next","wv.resume":"Resume","wv.src.auto.s":"Yandex if connected, otherwise the other services","wv.src.ym.s":"Yandex My Wave — knows your taste","wv.src.mix.s":"From your tracks and ones like them","wv.div.default.s":"Favourites and new music mixed","wv.div.favorite.s":"More of what you already love","wv.div.discover.s":"More artists you have not heard","wv.div.popular.s":"Hits and what everyone plays","wv.mood.all.s":"The wave adapts on its own","wv.mood.active.s":"Energetic, on the beat","wv.mood.fun.s":"Light and sunny","wv.mood.calm.s":"To breathe out","wv.mood.sad.s":"For a rainy evening","mini.t":"Mini player","mini.on":"Mini player on top (Ctrl+M)","mini.exit":"Expand (Ctrl+M)","mini.pin":"Always on top","mini.pin.on":"Mini player stays on top","mini.pin.off":"Mini player as a normal window","mini.idle":"Nothing playing","mini.idle.s":"Start the wave or a track","mini.seek":"Position","mini.dis":"Dislike","mini.err":"Could not switch the mini player","wv.any":"Any","wv.lang.any":"Any","wv.cap":"Wave","wv.mix":"From your tracks · {s}","dv.verified":"Verified artist","dv.rank":"#{n} in the world","dv.gallery":"Gallery","dv.popular":"Popular releases","dv.more":"More","wall.set":"Wallpaper set","drop.files":"Files added: {n}",
"set.covf":"Cover follows the cursor","set.covf.s":"A slight tilt of the cover in the fullscreen player",
"drop.t":"Drop to play","drop.s":"A track, album or playlist link: YouTube Music, Spotify, Yandex Music, SoundCloud, Deezer","drop.busy":"Opening the link…","drop.bad":"Could not open this link","drop.list":"“{n}”: {c} tracks queued","drop.one":"Playing: {n}",
"home.t":"Silence. The field waits.","home.s":"Start the wave: the stream builds from your artists, cover and queue open fullscreen.","home.start":"Start the wave",
"lib.pl":"Playlists","lib.fav":"Favorites","lib.rec":"Recent",
"set.t":"Settings","set.acc":"Accounts","set.acc.s":"Connect your accounts: likes and playlists move into your library, and your own collections appear in the sheet. You sign in on the service’s own page; Meowave keeps only the session key, in the system keychain.",
"set.sp":"Spatial audio","set.sp.s":"PannerNode in HRTF mode: the source orbits your head and passes overhead. Plus a ConvolverNode for room.",
"set.sp.on":"Orbit around the head","set.sp.hint":"Headphones only","set.sp.speed":"Orbit speed","set.sp.rad":"Orbit radius","set.sp.elev":"Overhead arc",
"set.q":"Quality","set.q.s":"Lossless where the service serves it.","set.q.l":"Stream","q.low":"Low","q.mid":"Medium","q.high":"High",
"set.look":"Appearance","set.look.s":"Particle density costs more than everything else combined.","set.theme":"Theme","set.accent":"Accent color","set.accent.s":"No color by default",
"set.dens":"Particle density","set.speed":"Movement speed","set.glow":"Wave glow","set.blur":"Panel blur","set.lang":"Language","set.font.ui":"UI font",
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
"pr.auth.up.title":"Create an account to sync library and stats","pr.auth.in.title":"Sign in to your Meowave account","pr.auth.guest":"Continue without account","pr.auth.guest.ok":"Guest profile active","ly.search_genius":"Search on Genius","ly.genius_prompt":"Search Genius for lyrics (Artist Title):","ly.found_genius":"Lyrics found on Genius","ly.src.genius":"Genius",
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
"bd.code.exp":"Code expired","bd.code.used":"Code exhausted","bd.code.throttle":"Too many attempts — try again in 15 minutes",
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
"loc.svc":"My Files","loc.svc.src":"from disk","np.none":"No track","np.none.s":"Connect a service and search for music","np.playing":"Listening","np.paused":"Paused",
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
"snd.rate":"Speed","snd.boost":"Louder","snd.boost.off":"off","snd.slowed":"slowed","snd.nightcore":"nightcore","snd.normal":"normal","dlg.ok":"OK","dlg.cancel":"Cancel","set.icon":"App icon","set.icon.s":"The window icon on the taskbar and inside the app","ico.set":"Icon changed","acc.in":"Sign in","acc.out":"Sign out","acc.import":"Import","acc.paste":"Paste key","acc.token":"Token","acc.as":"Signed in as {u}","acc.stale":"The session was not confirmed, sign in again","acc.wait":"Waiting for the sign-in window…","acc.wait.b":"Waiting for the sign-in in your browser…","acc.in.s":"Signs in in your own browser","acc.in.s2":"Signs in on the service’s page","acc.browser":"{b} is open: sign in as usual. Meowave picks the session up and closes the window","acc.browser.open":"The sign-in is already open in your browser","acc.nobrowser":"No Chromium-based browser found, signing in in a {s} window","acc.err.closed":"The sign-in did not finish, the browser was closed","acc.off.ytm":"Plays without an account · sign in to bring your library","acc.off.sc":"Plays without an account · sign in to bring your library","acc.off.dz":"Plays without an account · sign in to bring your library","acc.off.ym":"Needs sign-in: search, My Wave and lossless","acc.off.sp":"Not connected · the sound comes from other services","acc.d.ytm":"Likes, playlists and your own mixes in the sheet","acc.d.sc":"Likes, playlists and picks made for you in the sheet","acc.d.dz":"Favourite tracks and playlists, your shelf in the sheet","acc.d.ym":"My Wave, likes, playlists and lossless","acc.d.sp":"Liked songs and playlists · needs your own Client ID","acc.lib":"What to bring over","acc.all":"Bring everything","acc.all.t":"Bring over your {s} library?","acc.all.s":"Liked tracks go to favourites, playlists ({n}) into the library. Ones already brought over are updated, not duplicated.","acc.all.ok":"Bring over","acc.liked":"Liked songs","acc.liked.s":"Go to favourites","acc.pl":"Playlist","acc.tofav":"To favourites","acc.importing":"Importing…","acc.again":"Again","acc.note":"Tracks play from their home service. Bringing a playlist over again updates it instead of making a copy.","acc.window":"A {s} window opens: sign in as usual, it closes by itself","acc.ok":"{s}: signed in as {u}","acc.ok0":"{s} connected","acc.err.jar":"The sign-in gave no session, use “Paste key”","acc.err.time":"The sign-in did not finish, the window was closed","acc.out.t":"Sign out of {s}?","acc.out.s":"Imported tracks and playlists stay. Only your shelf in the sheet goes away.","acc.paste.t":"{s} session key","acc.paste.ok":"Connect","acc.paste.h":"Kept only in the system keychain","acc.paste.l.ytm":"Cookie header","acc.paste.l.sc":"oauth_token","acc.paste.l.dz":"arl","acc.paste.s.ytm":"If the sign-in does not work: open music.youtube.com in your browser, F12 → Network, reload, pick a browse request and copy the whole Cookie request header.","acc.paste.s.sc":"Open soundcloud.com in your browser, F12 → Application → Cookies → soundcloud.com and copy the oauth_token value.","acc.paste.s.dz":"Open deezer.com in your browser, F12 → Application → Cookies → deezer.com and copy the arl value.","acc.paste.bad":"That does not look like a session key, check that it was copied whole","acc.desk":"Account sign-in works in the desktop app","acc.sp.cid.t":"Spotify Client ID","acc.sp.cid.s":"Create an app at developer.spotify.com/dashboard with the Redirect URI http://localhost:8080/callback and paste its Client ID.","acc.link":"Import by link","acc.link.s":"A playlist or album from any service, no sign-in","ico.clear-auto":"Auto, transparent","ico.clear-light":"White, transparent","ico.clear-dark":"Dark, transparent","ico.classic":"Classic","ico.midnight":"Midnight","ico.ocean":"Ocean","ico.mint":"Mint","ico.sunset":"Sunset","ico.sakura":"Sakura","ico.lavender":"Lavender","ico.gold":"Gold","ico.paper":"Paper","set.cbg":"Background from cover","set.cbg.s":"The app background gently takes on the colours of the current cover","set.cbg.k":"Intensity","set.cfade":"Colour change","set.cfade.s":"How fast the accent and background move to a new cover","cf.0":"Instant","cf.1":"Smooth","cf.2":"Very smooth","dlg.name":"Name","dlg.create":"Create","dlg.save":"Save","dlg.next":"Next","dlg.find":"Find","dlg.add":"Add","dlg.link":"Link","dlg.user":"Username","dlg.newpl.s":"Build your own selection — add tracks from any list with a right-click.","dlg.rename.t":"Rename playlist","dlg.pldel.s":"The playlist disappears from your library. Favourites and the tracks themselves stay.","dlg.genius.t":"Find lyrics on Genius","dlg.genius.l":"Artist and title","dlg.quasar.t":"Sign in with Quasar ID","dlg.quasar.l":"Quasar ID or email","dlg.wall.t":"Wallpaper from a link","dlg.loc.t":"Clear local tracks?","dlg.loc.s":"Every local track leaves the library. Files on disk are kept.","dlg.room.t":"New room","dlg.add.t":"Add to group","dlg.upd.s":"What’s new:",
"upd.norelease":"No releases published yet — this is the first version",
"pr.ban.hint":"Click to change the banner","pr.ban.cta":"Change banner","pr.badges":"Badges","img.big":"Image is too large","crop.avatar":"Avatar","crop.banner":"Banner","crop.cover":"Playlist cover","crop.zoom":"Zoom","crop.reset":"Reset","crop.save":"Save","crop.hint":"Drag the image, scroll to zoom.","plctx.cover":"Change cover","plctx.coveroff":"Remove cover","plctx.cover.ok":"Cover updated","plctx.cover.off":"Cover removed","plctx.rename":"Rename","plctx.renamed":"Renamed","plctx.rmtrack":"Remove from playlist","plctx.eq":"Equaliser for this playlist","eq.pl.pinned":"Preset pinned to this playlist",
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
"ym.acc.desc":"Sign in with your Yandex account: a Yandex page opens, you sign in, and the library connects. The token lives in the OS keychain.",
"ym.acc.login":"Sign in with your Yandex account","ym.acc.browser":"Opening the browser for sign-in…","ym.acc.wait":"Once signed in on the helper page, come back to Meowave — the library will sync automatically", "ym.acc.library":"Sync library (likes and playlists)","ym.acc.open":"Open the token paste page:",
 "dc.t":"Discord","dc.s":"Friends on Discord see what you are listening to: track, artist, cover and time. All it needs is the Discord app running on this computer.","dc.cid":"Your own Discord application","dc.cid.s":"Optional. An Application ID from discord.com/developers — Discord then shows your app’s name instead of “Meowave”. Empty means the built-in one.","dc.noid":"No Discord application set","dc.live":"Connected — friends can see what you are listening to","dc.desktop":"Works in the desktop app only","dc.prev":"How friends will see it","dc.listen":"Listening to",
 "dc.on":"Show what I’m listening to on Discord","dc.on.ok":"Discord detected","dc.on.no":"Discord is not running — the status appears once you open it",
 "dc.tmpl":"Custom text","dc.tmpl.s":"You can use {title}, {artist}, {album} and {service}",
 "dc.save":"Save","dc.test":"Send now","dc.saved":"Saved","dc.sent":"Sent to Discord","dc.fail":"Discord is not responding — check that it is running","dc.st.as":"Connected as {u} — friends can see what you are listening to","dc.st.closed":"Discord closed the connection:","dc.st.badid":"Discord rejected the application ID — check it under “For developers”","dc.st.noapp":"This build has no built-in Discord application — set your own under “For developers”","dc.st.off":"Off","dc.adv":"For developers","dc.pause.hide":"Hide the status","dc.pause.show":"Say “Paused”","dc.pause":"When paused","dc.o.btn.s":"Opens the track on its service","dc.o.btn":"“Listen” button","dc.o.time":"Time and progress bar","dc.o.art":"Track cover","dc.disp.app":"Meowave","dc.disp.artist":"Artist","dc.disp.track":"Track","dc.disp.s":"What shows next to your name on a server","dc.disp":"In the member list","dc.l2.none":"Nothing","dc.l2.service":"Service","dc.l2.album":"Album","dc.l2.artist":"Artist","dc.l2":"Second line","dc.l1.custom":"Custom","dc.l1.at":"Artist — title","dc.l1.title":"Title","dc.l1":"First line","dc.inlist":"In the member list:","dc.btn":"Listen",
 "fp.mode":"Switch the player view","ly.custom.t":"Large lyrics","ly.custom.s":"Line size and weight drive the large-lyrics mode","ly.size":"Line size","ly.weight":"Weight","ly.glow":"Active line glow","ly.cov":"Cover size (lyric mode)","ly.gap":"Line gap","ly.font":"Font",
"loc.t":"Local tracks","loc.s":"Files are never copied or uploaded — they are read straight off the disk. Tags come from the file name.",
"loc.add":"Add files","loc.folder":"Add folder","loc.folder.s":"Including subfolders",
"loc.fmt":"mp3, flac, wav, ogg, m4a","loc.pick":"Choose…",
"loc.count":"{n} local tracks in the library","loc.empty":"Nothing added yet",
"loc.added":"Tracks added: {n}","loc.none":"No audio files found","loc.err":"Could not read the files",
"loc.desktop":"Import works in the desktop app only","loc.nodlg":"File dialog unavailable",
"cache.t":"Cache and data","cache.s":"Artwork and metadata stored on disk.","cache.size":"Used","cache.clr":"Clear","cache.done":"Cache cleared",
"data.reset":"Reset favorites and history","data.reset.s":"Settings and tokens are kept","data.reset.btn":"Reset","data.done":"Favorites and history cleared",
"about.ver":"Version","about.s":"A cross-service player with its own audio path: the EQ, HRTF orbit and visualiser work on every service because the sound flows through us, not somebody else's player.",
"import.t":"Import Playlist","import.s":"Paste a playlist link from Spotify, YouTube Music or SoundCloud","import.btn":"Import","import.check":"Check","import.dest_pl":"Create new playlist","import.dest_fav":"Add to Favorites","import.submit":"Import","import.enter_url":"Enter a playlist URL",
"fp.set.t":"Player Settings","fp.set.bg":"Player Background","fp.bg.dynamic":"Album","fp.bg.ambient":"Ambient","fp.bg.black":"OLED","fp.bg.wall":"Wallpaper","fp.wall.t":"Wallpaper: image, GIF or video","fp.wall.pick":"Choose","fp.wall.clear":"Remove","fp.wall.dim":"Dim","fp.wall.blur":"Wallpaper blur","fp.wall.app":"Wallpaper behind the whole app","fp.wall.app_sub":"Not only in the full player","fp.set.glow":"Backlight Glow","fp.set.blur":"Background Blur","fp.set.font":"Lyrics Font","fp.set.fill":"Karaoke Mode","fp.fill.smooth":"Smooth","fp.fill.line":"Per-line","fp.set.wobble":"Cover Wobble & Float","fp.set.wobble_sub":"Beat bounce & floating animation",
"chat.share_np":"Share current track","wave.moods":"Moods & Genres","wave.artists":"Recommended Artists",
"cancel":"Cancel","close":"Close","fp.fill.off":"Off","np.play":"Play","np.pause":"Pause","np.prev":"Previous","np.next":"Next","np.shuffle":"Shuffle","np.repeat":"Repeat","act.fav":"Add to favorites","nav.quests":"Quests & Badges","upd.up_to_date":"You are on the latest version","pr.auth.guest.desc":"Local Meowave profile","fp.set.zoom":"Artwork scale (YouTube Music)","fp.zoom.normal":"Normal","fp.zoom.large":"Large","fp.zoom.full":"Fullscreen","fp.set.drift":"Smooth drift and float","fp.set.drift_sub":"Fullscreen cover floating animation",
"pr.err.email":"Enter your email","pr.err.pass":"Enter your password","pr.welcome":"Welcome!","people.profile":"Profile",
"ly.edit.title":"Lyrics & Timings Editor","ly.edit.desc":"Custom lyrics with timestamps [mm:ss.xx] or auto-sync",
"ly.edit.auto":"Auto-timings (Genius/text)","ly.edit.auto.title":"Evenly distribute timestamps across track",
"ly.edit.stamp":"Add stamp","ly.edit.stamp.title":"Record current playback second",
"ly.edit.clear":"Clear stamps","ly.edit.clear.title":"Clear all timestamps and keep plain text",
"ly.edit.ph":"[00:12.50] First lyrics line\\n[00:16.80] Second lyrics line...",
"ly.edit.reset":"Reset to original","ly.edit.cleared":"Timestamps cleared",
"ly.edit.nolines":"No lyrics lines to timestamp","ly.edit.applied":"Auto-timings distributed across track",
"ly.edit.reset_ok":"Reset to original lyrics","ly.edit.saved":"Lyrics saved",
"tb.fs":"Fullscreen (F11)","tb.max":"Maximize","search.clear":"Clear",
"nologin":"No sign-in needed","ready":"Ready"}};
let LANG="ru";
const t=k=>I18N[LANG][k]??I18N.ru[k]??k;
/* Strings of the redesigned full player, its settings sheet, the settings
   window and the listening-comfort features. */
Object.assign(I18N.ru,{
"fpx.close":"Свернуть","sleep.t":"Таймер сна","sleep.left":"Осталось","sleep.off":"Выключен","sleep.offb":"Выкл","sleep.trackb":"Трек",
"fps.g.bg":"Фон","fps.speed":"Скорость движения","fps.bright":"Яркость фона","fps.g.text":"Текст и шрифт",
"fps.font":"Шрифт плеера","fps.font_sub":"Название, артист и текст песни","fps.lysize":"Размер текста песни",
"fps.align":"Выравнивание текста","fps.align.l":"Слева","fps.align.c":"По центру",
"fps.lyblur":"Размывать дальние строки","fps.lyblur_sub":"Фокус остаётся на текущей строке",
"fps.g.cover":"Обложка и поведение","fps.size":"Размер обложки",
"fps.shrink":"Уменьшать на паузе","fps.shrink_sub":"Обложка мягко отступает, пока музыка стоит",
"fps.beat":"Пульс под бит","fps.beat_sub":"Обложка слегка дышит в такт басу",
"fps.idle":"Прятать управление","fps.idle_sub":"Через 3,5 секунды без движения мыши",
"rv.t":"Реверберация","rv.room":"Комната","rv.hall":"Зал","rv.church":"Собор","rv.plate":"Пластина",
"rv.mix":"Смесь","rv.size":"Хвост","rv.tone":"Тон",
"lc.t":"Комфорт прослушивания","lc.s":"Мягкие паузы, ровная громкость и плавные переходы между треками.",
"lc.fade":"Плавная пауза","lc.fade.s":"Звук затихает и возвращается за доли секунды, без щелчка",
"lc.norm":"Выравнивание громкости","lc.norm.s":"Тихие и громкие треки звучат ровно; уровень запоминается для каждого трека",
"lc.trans":"Мягкий переход","lc.trans.s":"затухание в конце трека и плавный старт следующего",
"set.search":"Поиск настроек","fp.set.font":"Шрифт полноэкранного плеера"});
Object.assign(I18N.en,{
"fpx.close":"Collapse","sleep.t":"Sleep timer","sleep.left":"Left","sleep.off":"Off","sleep.offb":"Off","sleep.trackb":"Track",
"fps.g.bg":"Background","fps.speed":"Motion speed","fps.bright":"Background brightness","fps.g.text":"Text & font",
"fps.font":"Player font","fps.font_sub":"Title, artist and lyrics","fps.lysize":"Lyrics size",
"fps.align":"Lyrics alignment","fps.align.l":"Left","fps.align.c":"Centre",
"fps.lyblur":"Blur distant lines","fps.lyblur_sub":"Keeps the focus on the current line",
"fps.g.cover":"Cover & behaviour","fps.size":"Cover size",
"fps.shrink":"Shrink when paused","fps.shrink_sub":"The cover steps back while the music is stopped",
"fps.beat":"Beat pulse","fps.beat_sub":"The cover breathes with the bass",
"fps.idle":"Hide controls","fps.idle_sub":"After 3.5 seconds without mouse movement",
"rv.t":"Reverb","rv.room":"Room","rv.hall":"Hall","rv.church":"Cathedral","rv.plate":"Plate",
"rv.mix":"Mix","rv.size":"Decay","rv.tone":"Tone",
"lc.t":"Listening comfort","lc.s":"Soft pauses, even loudness and smooth transitions between tracks.",
"lc.fade":"Soft pause","lc.fade.s":"Sound fades out and back in within a fraction of a second, no click",
"lc.norm":"Volume levelling","lc.norm.s":"Quiet and loud tracks play at an even level; remembered per track",
"lc.trans":"Soft transition","lc.trans.s":"fade at the end of a track and a gentle start of the next",
"set.search":"Search settings","fp.set.font":"Full player font"});
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
  document.querySelectorAll("[data-i18n-title]").forEach(e=>e.title=t(e.dataset.i18nTitle));
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
 {id:"ytm",name:"YouTube Music",conn:true,free:true,lossless:false,redir:"guest",lat:[360,880]},
 {id:"sc",name:"SoundCloud",conn:true,free:true,lossless:false,redir:"public client_id",lat:[280,640]},
 /* Deezer's catalogue and charts are public; a full track is matched on
    Yandex / YouTube Music / SoundCloud, the 30 s preview is the last resort. */
 {id:"dz",name:"Deezer",conn:true,free:true,lossless:false,redir:"public API",lat:[300,720]},
 {id:"ym",name:"Yandex Music",conn:false,free:false,lossless:true,redir:"meowave://callback",lat:[400,1020]},
 {id:"sp",name:"Spotify",conn:false,free:false,lossless:false,redir:"http://localhost:8080/callback",lat:[250,500]},
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
/* Can a track from this service be played right now? Spotify is metadata only
   (sprPlay finds the sound elsewhere), so its tracks — artist top tracks,
   public albums — stay playable without a Spotify login. A connected Spotify
   switched off in the header is still honoured. */
const playOn=id=>id==="sp"?(svc("sp").on||!svc("sp").conn):!!svc(id).on;

/* The player starts empty: TRACKS only holds real search results and restored
   favorites. Demo tracks, demo playlists and hardcoded lyrics are gone — they
   could not be opened and they broke the favorites handler. */
/* `let`, not `const`: removeLocal / clearLocal rebuild this array by
   reassignment, which threw "Assignment to constant variable" and killed both
   handlers outright. */
let TRACKS=[];

/* Real listening history instead of hardcoded demo rows. */
let HISTORY=[];
let PREV_STACK=[];
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
/* A quiet, curated palette: soft, slightly greyed tones that sit well on a
   dark glass interface instead of Tailwind's saturated neons. The ids are the
   old ones, so a saved choice maps onto its calmer counterpart. */
const ACCENTS=[
 ["none","oklch(82% 0 0)",""],
 ["violet","#b3a6e8","179 166 232"],
 ["indigo","#9ca8ec","156 168 236"],
 ["blue","#8db7dd","141 183 221"],
 ["cyan","#8ccbd0","140 203 208"],
 ["teal","#7fbfb2","127 191 178"],
 ["emerald","#9cc7a4","156 199 164"],
 ["amber","#dcc196","220 193 150"],
 ["coral","#e7ad92","231 173 146"],
 ["rose","#e3a3ae","227 163 174"],
 ["pink","#d9a5cf","217 165 207"]];

/* state */
/* Title is resolved through i18n when rendered, not stored: a literal here
   stayed Russian under an English interface. */
const EMPTY_TRACK={id:"empty",s:"ytm",t:"",a:"Meowave",al:"",d:0,mode:"empty",art:null};
const S={view:"home",tab:"pl",playing:false,current:EMPTY_TRACK,pos:0,dur:0,guest:false,
 equippedBadge:localStorage.getItem("meowave_equipped_badge")||null,
 /* Up to three worn badges, in the order they were put on. The single id
    above stays as the first of them for older code and older servers. */
 equippedBadges:(()=>{try{const a=JSON.parse(localStorage.getItem("meowave_equipped_badges")||"null");
  if(Array.isArray(a))return [...new Set(a.filter(x=>typeof x==="string"&&x))].slice(0,3)}catch(_){}
  const one=localStorage.getItem("meowave_equipped_badge");return one?[one]:[]})(),
 shuffle:false,repeat:false,vol:.8,muted:false,quality:"high",
 /* Per-service on/off switches, {ytm:true,sc:false,...}. Filled by restore()
    and kept in sync by the header chip clicks; initServices() applies it after
    the keychain answers. */
 svcOn:null,
 /* Discord Rich Presence: on/off + the user's status template. Sent to Rust
    on change; discord_update fires from track events and the minute timer. */
 discord:{on:false,tmpl:"{title}",cid:"",l1:"title",l2:"artist",disp:2,art:true,time:true,btn:true,pause:"show"},
 /* Fullscreen player layout: "stage" (centered cover, mockup 1) or "lyric"
    (cover left, oversized lyrics right, mockup 2). */
 fpMode:"stage",
 /* Large-lyrics customization: px size, weight, glow multiplier, cover size,
    font family. Applied as CSS variables by applyLyVars(). */
 ly:{size:44,weight:640,glow:1,cov:320,gap:14,font:""},
 fpBgMode:"dynamic",fpGlow:100,fpBlur:75,lyKaraoke:"karaoke",fpWobble:true,fpZoom:"normal",fpDrift:true,profileTrack:null,avatar:null,banner:null,
 glow:0,blur:14,theme:"dark",accent:"none",dens:3200,pspeed:.35,
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
 customAccent:"#b3a6e8",
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
eqMode:"global",preamp:0,
/* Newer preferences live in one object so save()/load stay one line each. */
x:{glow2:true,fpPane:"lyrics",flowSpeed:100,lyAlign:"left",lyBlur:true,beat:false,shrink:true,idle:true,
 fadePP:true,trans:0,norm:false,rvOn:false,rvMix:25,rvSize:2.4,rvTone:52,rvPre:22,rvRoom:"hall"}};
window.S=S;
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

/* Round 5 dialog: icon chip + headline + supporting text, an MD3 text field
   with a floating label, a counter and a clear button, and a text "Cancel"
   next to a filled pill. Every option is optional, so the old two-argument
   askText(title,value) callers keep working and simply get the new look.
   `required` keeps OK disabled until something is typed — for names that
   must not be empty; free-text fields (a group description) leave it off so
   clearing the text stays possible. For a confirm, `label` is the supporting
   text (the update dialog passes its release notes there). */
function showModal({title,label="",sub="",value="",placeholder="",confirm,cancel,input=true,danger=false,icon,required=false,hint="",max=0,secret=false}){
 const el=document.getElementById("modal");
 if(!el)return Promise.resolve(null);
 /* Only one dialog can be shown at a time — the DOM holds a single #modal.
    A second showModal while one is open used to overwrite the global resolver
    and the first Promise never settled, hanging whatever awaited it. Now the
    previous dialog is dismissed (null) first, which is exactly what the
    askText/askConfirm contract already treats as "cancelled". */
 if(modalRes){const prev=modalRes;modalRes=null;prev(null)}
 clearTimeout(el._hide);
 el.hidden=false;
 const $m=id=>document.getElementById(id);
 $m("modal-title").textContent=title||"";
 const subText=sub||(!input?label:"");
 const subEl=$m("modal-sub");
 if(subEl){subEl.textContent=subText||"";subEl.hidden=!subText}
 const ic=$m("modal-ic");
 if(ic){
  const name=icon||(input?"edit":danger?"delete":"help");
  const g=ic.firstElementChild||ic.appendChild(document.createElement("span"));
  g.className="material-symbols-rounded";g.textContent=name;
  ic.dataset.tone=danger?"danger":""}
 const field=$m("modal-field"),foot=$m("modal-foot");
 const lab=$m("modal-label");
 const fieldLabel=input?label:"";
 if(lab){lab.textContent=fieldLabel||"";lab.hidden=!fieldLabel}
 const inp=$m("modal-input");
 if(field)field.hidden=!input;
 if(field)field.dataset.nolabel=String(!fieldLabel);
 if(foot)foot.hidden=!input;
 const hintEl=$m("modal-hint");if(hintEl)hintEl.textContent=hint||"";
 el.dataset.input=String(!!input);
 el.dataset.required=String(!!(input&&required));
 el.dataset.danger=String(!!danger);
 inp.hidden=!input;
 if(input){inp.maxLength=max>0?max:60;inp.type=secret?"password":"text";inp.value=value||"";inp.placeholder=placeholder||" "}
 const okBtn=$m("modal-ok");
 okBtn.textContent=confirm||t("dlg.ok");
 okBtn.className="primary sm"+(danger?" danger":"");
 $m("modal-cancel").textContent=cancel||t("dlg.cancel");
 modalSync();
 /* Without a field the box itself takes focus (Enter confirms below), so no
    focus ring sits on the button at its foot. */
 requestAnimationFrame(()=>{el.dataset.open="true";
  if(input){inp.focus();try{inp.select()}catch(_){}}else el.querySelector(".modalbox")?.focus({preventScroll:true})});
 return new Promise(r=>{modalRes=r})}

/* Counter, clear button and the "required" gate follow the field live. The
   counter only appears for short names — "37/2048" under a URL is noise. */
function modalSync(){
 const el=document.getElementById("modal");if(!el)return;
 const inp=document.getElementById("modal-input"),ok=document.getElementById("modal-ok");
 const cnt=document.getElementById("modal-count");
 if(!inp||!ok)return;
 const n=inp.value.length,max=inp.maxLength>0?inp.maxLength:0;
 if(cnt)cnt.textContent=el.dataset.input==="true"&&max&&max<=200?`${n}/${max}`:"";
 ok.disabled=el.dataset.required==="true"&&!inp.value.trim()}

/* Drop-in replacements. askText resolves to the string or null; askConfirm to
   true or null, so both are falsy when dismissed. The optional last argument
   takes the showModal options above (icon, sub, label, confirm, required…). */
const askText=(title,value="",o={})=>showModal({title,value,input:true,...o});
const askConfirm=(title,confirm,danger=true,o={})=>
 showModal({title,input:false,confirm,danger,...o});

document.addEventListener("click",e=>{
 if(e.target.closest("#modal-ok"))return closeModal(true);
 if(e.target.closest("#modal-clear")){
  const inp=document.getElementById("modal-input");
  if(inp){inp.value="";modalSync();inp.focus()}return}
 if(e.target.closest("#modal-cancel")||e.target.id==="modal")return closeModal(false)});
document.addEventListener("input",e=>{if(e.target.id==="modal-input")modalSync()});
document.addEventListener("keydown",e=>{
 const el=document.getElementById("modal");
 if(!el||el.dataset.open!=="true")return;
 if(e.key==="Escape"){e.preventDefault();closeModal(false)}
 if(e.key==="Enter"&&(e.target.id==="modal-input"||e.target.classList?.contains("modalbox"))&&!e.isComposing){e.preventDefault();
  if(!document.getElementById("modal-ok")?.disabled)closeModal(true)}});

let lastToastText = "";
let lastToastAt = 0;
/* MD3 snackbar. `opt.actions` ([{label,run}]) turns a notice into one the
   user can act on — "Playback failed" alone was a dead end. Actions keep the
   snackbar up while the pointer is over it, and it returns a handle so a
   caller can dismiss it early. */
function toast(msg,ms=3200,opt){
 const box=document.getElementById("toasts");if(!box||!msg)return null;
 const acts=Array.isArray(opt?.actions)?opt.actions.filter(a=>a&&a.label):[];
 const now=Date.now();
 if(!acts.length&&msg===lastToastText&&now-lastToastAt<3000)return null;
 while(box.children.length>=3){
  box.removeChild(box.firstChild);
 }
 lastToastText=msg;
 lastToastAt=now;
 const el=document.createElement("div");el.className="toast";
 el.setAttribute("role",acts.length?"alert":"status");
 const iconName=opt?.icon||(/ошибк|не удалось|fail|error|запрещ/i.test(msg)?"error":(/сохран|готов|успеш|done|copied|скопир/i.test(msg)?"check_circle":"info"));
 el.innerHTML=`<span class="material-symbols-rounded toast-icon" aria-hidden="true">${esc(iconName)}</span><span class="toast-msg">${esc(msg)}</span>`;
 if(iconName==="error")el.classList.add("err");
 let tm=0;
 const dismiss=()=>{clearTimeout(tm);if(el.classList.contains("out"))return;el.classList.add("out");setTimeout(()=>el.remove(),320)};
 const arm=()=>{clearTimeout(tm);tm=setTimeout(dismiss,ms)};
 if(acts.length){
  el.classList.add("has-acts");
  const row=document.createElement("span");row.className="toast-acts";
  for(const a of acts){
   const b=document.createElement("button");b.type="button";b.className="toast-act";b.textContent=a.label;
   b.addEventListener("click",()=>{dismiss();try{a.run?.()}catch(e){console.warn("snackbar action:",e)}});
   row.appendChild(b)}
  const x=document.createElement("button");x.type="button";x.className="toast-x";x.setAttribute("aria-label",t("snk.close"));
  x.innerHTML='<span class="material-symbols-rounded" aria-hidden="true">close</span>';x.addEventListener("click",dismiss);
  row.appendChild(x);el.appendChild(row);
  el.addEventListener("pointerenter",()=>clearTimeout(tm));
  el.addEventListener("pointerleave",arm)}
 box.appendChild(el);
 arm();
 return {el,dismiss}}
const icons=()=>(window.m3Icons?.createIcons?window.m3Icons.createIcons():(window.lucide&&lucide.createIcons()));
/* The font-picker families load from Google Fonts asynchronously: media=print
   keeps the CDN stylesheet out of the render-blocking set, and this flip to
   media=all applies it right after the DOM is parsed, past first paint. */
document.querySelectorAll('link[data-fonts-async]').forEach(l=>{l.media="all"});
const fp=document.getElementById("fp");

/* audio
   source -> 9×Biquad -> [HRTF Panner -> dry + Convolver wet] | bypass -> gain -> analyser -> out */
const A={ctx:null,src:null,audio:null,media:null,pre:null,bands:[],pan:null,air:null,conv:null,dry:null,wet:null,byp:null,gain:null,an:null,data:null,started:false,theta:0,
 /* gen bumps on every track change; events from the previous src are dropped */
 gen:0,onMeta:null,onTime:null,onEnd:null,onErr:null,lastPos:0,pendingSeek:null,seekingUntil:0,watchdog:null,transitioning:false,_resumingSameTrack:false};
/* Exactly one <audio> element for the whole app. */
function ensureAudioEl(){
 if(A.audio)return A.audio;
 const au=A.audio=document.createElement("audio");
 au.id="meowave-audio";au.style.display="none";
 if(!document.body.contains(au))document.body.appendChild(au);
 au.crossOrigin="anonymous";au.preload="auto";au.autoplay=true;
 au.addEventListener("loadedmetadata",()=>A.onMeta?.());
 au.addEventListener("durationchange",()=>A.onMeta?.());
 au.addEventListener("canplay",()=>{if(A.watchdog){clearTimeout(A.watchdog);A.watchdog=null}A.onMeta?.();applyRate()});
 au.addEventListener("timeupdate",()=>A.onTime?.());
 au.addEventListener("seeking",()=>{/* seek initiated */});
 au.addEventListener("seeked",()=>{A.pendingSeek=null;A.seekingUntil=0});
 au.addEventListener("ended",()=>A.onEnd?.());
 au.addEventListener("error",()=>A.onErr?.());
 /* The media load algorithm resets playbackRate to defaultPlaybackRate, and it
    runs again on every src swap. Re-asserting the rate once the new resource is
    actually ready is what stops slowed/nightcore reverting to 1x on skip. */
  au.addEventListener("loadedmetadata",()=>applyRate());
  /* WebKitGTK re-clamps the rate when playback actually starts, not only on
     load — the speed slider "did nothing" exactly there. Re-assert on both
     transport events. */
  au.addEventListener("play",()=>applyRate());
  au.addEventListener("playing",()=>{
    if(A.watchdog){clearTimeout(A.watchdog);A.watchdog=null}
    /* First sound of a new track: soft-transition fade-in; later "playing"
       events are resumes (from anywhere), which must undo a pause fade. */
    if(A.fadeGen!==A.gen){A.fadeGen=A.gen;transStart()}else fadeResume();
    applyRate();S.playing=true;sync();
  });
  au.addEventListener("stalled",()=>{
    if(S.playing&&!au.ended){
      if(au.paused)au.play().catch(()=>{});
    }
  });
  au.addEventListener("waiting",()=>{
    if(S.playing&&!au.ended){
      if(au.paused)au.play().catch(()=>{});
      /* A stream that keeps "waiting" for 12 s mid-track is dead (expired
         signed URL, dropped connection): reconnect at the same position
         instead of sitting in silence. */
      clearTimeout(A.stallTimer);
      const pos0=au.currentTime,src0=au.currentSrc;
      A.stallTimer=setTimeout(()=>{
       if(!S.playing||au.ended||au.currentSrc!==src0)return;
       if(au.readyState<3&&Math.abs(au.currentTime-pos0)<0.5&&S.current)tryResumeStream(S.current,au.currentTime,true);
      },12000);
    }
  });
  au.addEventListener("playing",()=>clearTimeout(A.stallTimer));
  au.addEventListener("timeupdate",()=>{if(A.stallTimer&&au.readyState>=3){clearTimeout(A.stallTimer);A.stallTimer=0}});
 au.addEventListener("pause",()=>{if(!au.ended&&!A.transitioning){S.playing=false;sync()}});
 if(A.ctx&&!A.media){
  try{
   A.media=A.ctx.createMediaElementSource(au);
   A.media.connect(A.pre||A.bands[0]);
  }catch(e){console.warn("[meowave] createMediaElementSource in ensureAudioEl:",e)}
 }
 return au}
function unlockAudio(){
 if(!A.ctx)initAudio();
 if(A.ctx&&A.ctx.state==="suspended"){
  A.ctx.resume().then(()=>{applyEQ();applySpatial();applyBoost();}).catch(()=>{});
 }
}
["pointerdown","keydown","click"].forEach(evt=>{
 window.addEventListener(evt,unlockAudio,{passive:true});
});
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
 /* Volume -> levelling -> fades -> boost/limiter. The levelling meter taps
    the equaliser output, before the volume, so it measures the track. */
 A.norm=ctx.createGain();A.fade=ctx.createGain();A.out=out;
 A.lvl=ctx.createAnalyser();A.lvl.fftSize=2048;out.connect(A.lvl);
 A.gain.connect(A.norm);A.norm.connect(A.fade);A.fade.connect(A.boost);
 /* The limiter is a DynamicsCompressor: even at threshold -1.5 dB it adds its
    own make-up gain and squashes every peak of a modern master, which is
    exactly where a lossless file differs from a lossy one — "lossless sounds
    worse" was this node. It now sits on a parallel path that is only faded in
    when something can actually push the signal past full scale. */
 A.limWet=ctx.createGain();A.limDry=ctx.createGain();A.limWet.gain.value=0;A.limDry.gain.value=1;
 A.boost.connect(A.lim);A.lim.connect(A.limWet);A.limWet.connect(A.an);
 A.boost.connect(A.limDry);A.limDry.connect(A.an);
 A.an.connect(ctx.destination);
 if(ctx.listener.positionZ){ctx.listener.positionX.value=0;ctx.listener.positionY.value=0;ctx.listener.positionZ.value=0}
 A.gain.gain.value=S.muted?0:(S.vol??0.8);
 const au=ensureAudioEl();
 if(!A.media){
  try{
   A.media=ctx.createMediaElementSource(au);
   A.media.connect(A.pre||A.bands[0]);
  }catch(e){console.warn("[meowave] createMediaElementSource in initAudio:",e)}
 }
 applySpatial();applyBoost();applyRate();applyEQ();applyReverb();applyNorm();}
function cleanMusicTitle(artist, title){
 let t=(title||"").trim();
 let a=(artist||"").trim();
 const origT=t;
 t=t.replace(/\s*[([{\/].*?(official|music\s*video|audio|lyric|video|remaster|hd|4k|hq|clip|visualizer|album|version|explicit|prod|directed|при\s*уч|feat|ft\.).*?[)\]}]/gi,"");
 t=t.replace(/\s*-\s*(official|music\s*video|audio|lyrics?|video).*/gi,"");
 t=t.replace(/\s*\|\s*.*$/gi,"");
 t=t.replace(/\s+/g," ").trim();
 if(!t)t=origT;
 const primaryArtist=a.split(/[,;&\/]|\s+(?:feat|ft|featuring|x)\s+/i)[0].trim()||a;
 return {a,t,primaryArtist,query:`${a} ${t}`.trim(),altQuery:`${primaryArtist} ${t}`.trim()};
}

function load(tr,auto,resumePos=0){
 if(!tr||tr.mode==="empty")return;
 /* Spotify is metadata only: find the sound elsewhere (see sprResolve). */
 if(tr.s==="sp"){sprPlay(tr,auto,resumePos);return}
 initAudio();
 if(A.ctx&&A.ctx.state==="suspended"){A.ctx.resume().catch(()=>{})}
 /* Stop a generated source (test tone); the <audio> element keeps living. */
 if(A.src&&A.src!==A.audio){try{A.src.stop()}catch(e){}try{A.src.disconnect()}catch(e){}A.src=null}
 if(tr?.mode!=="empty"&&tr?.s!=="mock"){
  const url=streamUrl(tr)||tr.url||"";
  if(!url){/* the proxy port is unknown yet; without it src is empty and <audio> is mute */
   ensureStreamPort().then(p=>{
    if(!sameTrack(tr,S.current))return;
    if(p)load(tr,auto,resumePos);
    else{/* the port never arrived: a fake "playing" state over silence is
            worse than admitting the failure */
     S.playing=false;sync();toast(t("load.err"))}});
   return}

  const au=ensureAudioEl();
  const gen=++A.gen;
  A.transitioning=true;
  au.pause();
  au.src=url;
  A.transitioning=false;
  applyRate();
  updateMediaSession(tr);
  A.src=au;A.lastPos=0;
  A.onMeta=()=>{
   if(gen!==A.gen)return;
   const metaDur=au.duration;
   const trDur=S.current?.d?(+S.current.d||0):0;
   if(Number.isFinite(metaDur)&&metaDur>0){
    if(!trDur||metaDur>=trDur*0.8||Math.abs(metaDur-trDur)<10){
     S.dur=metaDur;
    }else if(!S.dur||!Number.isFinite(S.dur)||S.dur<=0){
     S.dur=trDur||metaDur;
    }
   }else if(trDur>0){
    S.dur=trDur;
   }else if(au.seekable&&au.seekable.length>0){
    const sEnd=au.seekable.end(au.seekable.length-1);
    if(Number.isFinite(sEnd)&&sEnd>0)S.dur=sEnd;
   }
   /* YouTube refused and the proxy found the track elsewhere: say where it
      really plays from, once per track. */
   if(tr.s==="ytm"&&TAURI&&!tr._altAsked){tr._altAsked=true;
    inv("stream_alt",{id:String(tr.id)}).then(r=>{
     if(!r||!r.s||!sameTrack(tr,S.current))return;
     tr._alt=r.s;window.MW3?.altNote?.(tr,r)}).catch(()=>{})}
   if(tr.s==="dz"&&Number.isFinite(metaDur)&&metaDur>0&&metaDur<=31&&trDur>45&&!tr._pvWarned){
    tr._pvWarned=true;
    toast(LANG==="ru"?"Полной версии не нашлось ни на одном сервисе — Deezer отдал только 30-секундный фрагмент":"No full version was found on any service — Deezer only has a 30-second preview",6500)}
   renderNP();paint();
   lyricsDurCheck();
   if(fp.dataset.open==="true")renderFP();
   if(resumePos&&resumePos>0&&resumePos<(S.dur||au.duration||9999)){
    try{
     A.pendingSeek=resumePos;
     A.seekingUntil=Date.now()+800;
     au.currentTime=resumePos;
    }catch(_){}
   }
  };
  A.onTime=()=>{
   if(gen!==A.gen)return;
   const now=au.currentTime;
   prefetchNextSoon(now);
   if(A.watchdog&&now>0.2){
    clearTimeout(A.watchdog);
    A.watchdog=null;
   }
   if(!seeking){
    const dt=now-(A.lastPos??now);
    if(dt>0&&dt<2){S.listen+=dt;noteListening(dt)}
   }
   A.lastPos=now;
   if(seeking)return;
   if(A.pendingSeek!==null){
    if(Date.now()<A.seekingUntil&&Math.abs(now-A.pendingSeek)>2){
     return;
    }
    A.pendingSeek=null;
   }
   const metaDur=au.duration;
   const trDur=S.current?.d?(+S.current.d||0):0;
   if(Number.isFinite(metaDur)&&metaDur>0){
    if(!S.dur||!Number.isFinite(S.dur)||S.dur<=0){
     S.dur=(trDur>0&&metaDur<trDur*0.5)?trDur:metaDur;
    }else if(!trDur&&metaDur>S.dur){
     S.dur=metaDur;
    }else if(trDur&&Math.abs(metaDur-trDur)<5&&Math.abs(S.dur-metaDur)>1){
     S.dur=metaDur;
    }
   }else if(!S.dur||!Number.isFinite(S.dur)||S.dur<=0){
    if(trDur>0){
     S.dur=trDur;
    }else if(au.seekable&&au.seekable.length>0){
     const sEnd=au.seekable.end(au.seekable.length-1);
     if(Number.isFinite(sEnd)&&sEnd>0)S.dur=sEnd;
    }
   }
   if(S.dur>0&&now>S.dur){
    S.dur=Math.ceil(now);
   }else if((!S.dur||!Number.isFinite(S.dur)||S.dur<=0)&&now>0){
    S.dur=Math.ceil(now);
   }
   S.pos=now;paint();transTick(now,S.dur)};
  A.onEnd=()=>{
   if(gen!==A.gen)return;
   if(A.watchdog){clearTimeout(A.watchdog);A.watchdog=null}
   const curTime=au.currentTime;
   const effectiveDur=(Number.isFinite(S.dur)&&S.dur>0)?S.dur:(tr?.d?+tr.d:0);
   if(effectiveDur&&curTime>2&&curTime<(effectiveDur-4)){
    console.warn(`[meowave] premature stream end at ${curTime.toFixed(1)}s (dur ${effectiveDur}s); attempting seamless resume`);
    if(!A._resumingSameTrack){
     A._resumingSameTrack=true;
     load(tr,true,curTime);
     setTimeout(()=>{A._resumingSameTrack=false},4000);
     return;
    }
    fallbackResolveTrack(tr,true,curTime).then(rescued=>{
     if(!rescued)next();
    });
    return;
   }
   if(sleepAtTrackEnd())return;
   next();
  };
  A.onErr=()=>{
   if(gen!==A.gen)return;
   if(A.watchdog){clearTimeout(A.watchdog);A.watchdog=null}
   console.error("audio load failed",au.error?.code,au.error?.message||"",url);
   const wasPlaying = S.playing || auto || A.started;
   /* Mid-track network/decode drop: the proxy re-resolves a fresh URL on a
      new request, so reconnecting at the same second usually just works. */
   const pos=au.currentTime||0;
   if(au.error?.code!==4&&pos>1&&tryResumeStream(tr,pos,wasPlaying))return;
   explainFailure(url,tr,wasPlaying,pos)};
  au.load();
  applyRate();
  if(auto){
   if(A.ctx&&A.ctx.state==="suspended"){A.ctx.resume().then(()=>{applyEQ();applySpatial();applyBoost();}).catch(()=>{})}
   au.play().then(()=>{applyRate()}).catch(e=>{
    if(gen!==A.gen)return;
    console.warn("[meowave] play() rejected:",e);
    if(e.name==="NotAllowedError"){
     const unlockAndPlay=()=>{
      window.removeEventListener("pointerdown",unlockAndPlay);
      window.removeEventListener("keydown",unlockAndPlay);
      if(A.ctx)A.ctx.resume().then(()=>{applyEQ();applySpatial();applyBoost();}).catch(()=>{});
      if(S.playing&&au.paused)au.play().then(()=>{applyRate()}).catch(()=>{});
     };
     window.addEventListener("pointerdown",unlockAndPlay,{once:true});
     window.addEventListener("keydown",unlockAndPlay,{once:true});
     return;
    }
   });
   A.started=true;
   clearTimeout(A.watchdog);
   A.watchdog=setTimeout(async()=>{
    if(gen!==A.gen)return;
    const el=A.audio;
    if(!el||!S.playing)return;
    if(el.currentTime===0&&el.readyState<2){
     console.warn(`[meowave] playback watchdog fired for "${tr.t}" (svc: ${tr.s})`);
     if(tr.s==="ytm"&&!codecRetry){
      const alt=ytmFmt(tr)==="mp4"?"webm":"mp4";
      if(alt==="webm"?CAN.webm:CAN.mp4){
       codecRetry={key:trackKey(tr),fmt:alt};
       console.log(`[meowave] watchdog retrying with alternate format: ${alt}`);
       load(tr,true,resumePos);
       return;
      }
     }
     const rescued=await fallbackResolveTrack(tr,true,resumePos);
     if(!rescued&&el.readyState===0){
      try{el.load();el.play().catch(()=>{})}catch(_){}
     }
    }
   },4500);
  }
  return}
 const b=A.ctx.createBufferSource();b.buffer=loop(A.ctx,tr.root||1);b.loop=true;b.connect(A.bands[0]);A.src=b;
 if(auto){A.ctx.resume();b.start();A.started=true}}
/* EQ including preamp. When mode is "global" the preamp is fixed at 1 and only
   the bands move; when "track" the preamp belongs to the preset too. */
function applyEQ(){
 if(!A.ctx)return;
 limRoute();
 if(A.ctx.state==="suspended"&&S.playing){A.ctx.resume().catch(()=>{})}
 const preGain=S.eqMode==="track"?Math.pow(10,(S.preamp||0)/20):1;
 if(A.pre){
  try{
   A.pre.gain.cancelScheduledValues(A.ctx.currentTime);
   A.pre.gain.setTargetAtTime(preGain,A.ctx.currentTime,0.015);
  }catch(_){}
  A.pre.gain.value=preGain;
 }
 if(A.bands&&A.bands.length){
  A.bands.forEach((b,i)=>{
   if(!b)return;
   const g=Number.isFinite(S.eq[i])?S.eq[i]:0;
   try{
    b.gain.cancelScheduledValues(A.ctx.currentTime);
    b.gain.setTargetAtTime(g,A.ctx.currentTime,0.015);
   }catch(_){}
   b.gain.value=g;
  });
 }
}

/* Playback speed — the slowed / nightcore control.

   preservesPitch is deliberately turned OFF. Keeping the pitch is what a
   podcast app wants; "slowed + reverb" and nightcore are defined by the pitch
   moving with the speed. With it on, 0.8x just sounds like a dragging version
   of the same track.

   Only <audio> playback can be retimed: the generated test tone has no rate. */
function applyRate(){
 const r=Math.max(.5,Math.min(1.5,S.rate||1));
 if(A.audio){
  try{A.audio.preservesPitch=false}catch(_){}
  try{A.audio.mozPreservesPitch=false}catch(_){}
  try{A.audio.webkitPreservesPitch=false}catch(_){}
  /* defaultPlaybackRate is the value load() restores playbackRate from; setting
     only the latter meant the speed survived until the next track and no
     further. */
   A.audio.defaultPlaybackRate=r;
   try{if(A.audio.playbackRate!==r)A.audio.playbackRate=r}catch(_){}
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
/* Boost, a levelling gain above unity, the 3D mix and the reverb send can
   all clip; plain playback cannot, so it bypasses the limiter entirely. */
function limRoute(){
 if(!A.ctx||!A.limWet)return;
 const nb=!!S.x.norm&&NORM.db!=null&&(NORM_TARGET-NORM.db)>.1;
 const need=(S.boost||1)>1.001||nb||!!S.sp.on||(!!S.x.rvOn&&S.x.rvMix>0)||(S.eq||[]).some(g=>g>0.5)||(S.eqMode==="track"&&(S.preamp||0)>0);
 if(A.limOn===need)return;A.limOn=need;
 const n=A.ctx.currentTime;
 A.limWet.gain.setTargetAtTime(need?1:0,n,.04);
 A.limDry.gain.setTargetAtTime(need?0:1,n,.04)}
function applyBoost(){
 const b=Math.max(1,Math.min(3,S.boost||1));
 if(A.boost&&A.ctx)try{A.boost.gain.setValueAtTime(b,A.ctx.currentTime)}catch(_){A.boost.gain.value=b}
 limRoute();
 const el=document.getElementById("boost-v");
 if(el)el.textContent=b<=1?t("snd.boost.off"):"+"+Math.round(20*Math.log10(b))+" dB";
 const sl=document.getElementById("boost");
 if(sl&&+sl.value!==Math.round(b*100)){sl.value=Math.round(b*100);paintRange(sl)}}
function applySpatial(){
 if(!A.ctx)return;const on=S.sp.on,n=A.ctx.currentTime;limRoute();
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
 const [r,g,b]=particleTone(fieldAccent(),!dark);
 const qa=q/50;
 const c=document.createElement("canvas");c.width=c.height=32;const x=c.getContext("2d");
 /* цветное гало */
 const halo=x.createRadialGradient(16,16,0,16,16,16);
 halo.addColorStop(0,`rgba(${r},${g},${b},${qa*.85})`);
 halo.addColorStop(.3,`rgba(${r},${g},${b},${qa*.3})`);
 halo.addColorStop(1,`rgba(${r},${g},${b},0)`);
 x.fillStyle=halo;x.fillRect(0,0,32,32);
 /* a faint light centre on the dark theme — the old hot white core summed
    into neon under "lighter" */
 if(dark){
  const core=x.createRadialGradient(16,16,0,16,16,4.5);
  core.addColorStop(0,`rgba(255,255,255,${qa*.16})`);core.addColorStop(1,"rgba(255,255,255,0)");
  x.fillStyle=core;x.beginPath();x.arc(16,16,4.5,0,7);x.fill()}
 spriteCache[k]=c;return c}

const cv=document.getElementById("field"),gx=cv.getContext("2d",{alpha:true,desynchronized:true});

/* ── Wave v3: the field is drawn by WebGL ──
   Canvas 2D drew the field one drawImage per particle, so the particle count
   was capped at a few hundred on most machines (350 on every Linux box) and
   the glow had to stay faint to keep the frame rate — the "dim, sparse wave".
   WebGL draws the whole field as point sprites in one call: thousands of
   particles, an additive glow and audio-driven size and brightness cost the
   GPU almost nothing and the CPU only the physics loop it already ran. The
   2D path stays as the fallback for a webview without WebGL. */
const GLF={ok:false,c:null,gl:null,buf:null,data:null,cap:0,u:{},colT:0,ck:""};
function glFieldInit(){
 const c=document.getElementById("fieldgl");if(!c)return false;
 let gl=null;
 try{gl=c.getContext("webgl",{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:"high-performance"})}catch(_){}
 if(!gl)return false;
 const vs=`attribute vec2 aPos;attribute vec3 aSt;uniform vec2 uRes;uniform float uDpr;varying float vA;varying float vH;
void main(){vec2 p=aPos/uRes*2.0-1.0;gl_Position=vec4(p.x,-p.y,0.0,1.0);gl_PointSize=aSt.x*uDpr;vA=aSt.y;vH=aSt.z;}`;
 const fs=`precision mediump float;uniform vec3 uC1;uniform vec3 uC2;uniform float uCore;varying float vA;varying float vH;
void main(){vec2 d=gl_PointCoord-0.5;float r=dot(d,d)*4.0;if(r>1.0)discard;
float halo=exp(-r*4.2)*(1.0-r);float core=exp(-r*44.0)*uCore;
vec3 col=mix(uC1,uC2,vH)*halo*0.95+vec3(1.0)*core;float a=(halo*0.72+core)*vA;
gl_FragColor=vec4(col*vA,a);}`;
 const sh=(type,src)=>{const o=gl.createShader(type);gl.shaderSource(o,src);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o)||"shader");return o};
 try{
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);
  if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr)||"link");
  gl.useProgram(pr);
  GLF.buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,GLF.buf);
  const aPos=gl.getAttribLocation(pr,"aPos"),aSt=gl.getAttribLocation(pr,"aSt");
  gl.enableVertexAttribArray(aPos);gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,20,0);
  gl.enableVertexAttribArray(aSt);gl.vertexAttribPointer(aSt,3,gl.FLOAT,false,20,8);
  ["uRes","uDpr","uC1","uC2","uCore"].forEach(k=>GLF.u[k]=gl.getUniformLocation(pr,k));
  gl.enable(gl.BLEND);gl.disable(gl.DEPTH_TEST);
 }catch(e){console.warn("[meowave] WebGL field unavailable:",e);return false}
 GLF.gl=gl;GLF.c=c;GLF.ck="";
 c.addEventListener("webglcontextlost",e=>{e.preventDefault();GLF.ok=false;document.documentElement.classList.remove("glfield")});
 c.addEventListener("webglcontextrestored",()=>{GLF.ok=glFieldInit();if(GLF.ok){document.documentElement.classList.add("glfield");resize()}});
 return true}
/* Colours follow the accent (and the adaptive cover accent, which rewrites
   --pr/--pg/--pb on every track), so they are re-read a few times a second
   rather than once — getComputedStyle is too slow for every frame. */
/* The field's accent: the in-between colour while a fade runs (the root
   already holds the final one, see applyAccentRgb), else the root's. */
function fieldAccent(){
 /* a particle colour picked in the interface designer (custom.js) */
 if(window.CZ_FIELD)return window.CZ_FIELD;
 if(ACC_RAF&&ACC_NOW)return ACC_NOW;
 const cs=getComputedStyle(document.documentElement);
 return [+cs.getPropertyValue("--pr")||220,+cs.getPropertyValue("--pg")||220,+cs.getPropertyValue("--pb")||235]}
function glFieldColors(now){
 if(now-GLF.colT<(ACC_RAF?66:600)&&GLF.ck)return;
 GLF.colT=now;
 const de=document.documentElement,light=de.dataset.theme==="light";
 const [r,g,b]=fieldAccent();
 const key=r+","+g+","+b+(light?"l":"d");if(key===GLF.ck)return;GLF.ck=key;
 const gl=GLF.gl,c1=particleTone([r,g,b],light).map(v=>v/255);
 const c2=light?c1.map(v=>v*.55):c1.map(v=>v+(1-v)*.55);
 gl.uniform3f(GLF.u.uC1,c1[0],c1[1],c1[2]);gl.uniform3f(GLF.u.uC2,c2[0],c2[1],c2[2]);
 /* Round 7, "no neon anywhere": no hot white core, and ordinary "over"
    blending on both themes. Additive light summed dense parts of the wave
    into glowing blobs of the accent colour — the green neon cloud. Now a
    dense patch is as bright as one particle, never brighter. */
 gl.uniform1f(GLF.u.uCore,light?0:.16);
 gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA)}
/* The wave's own colour: the accent's hue, little chroma, a fixed light
   level per theme. */
function particleTone(rgb,light){return calmRgb(rgb,.065,light?[.42,.6]:[.76,.9])}
function glFieldDraw(lvl){
 const gl=GLF.gl;if(!gl)return;
 const n=F.n;
 if(GLF.cap<n){GLF.data=new Float32Array(Math.max(n,64)*5);GLF.cap=n}
 const D=GLF.data,light=document.documentElement.dataset.theme==="light";
 const gm=(light?.95:1.12)+S.glow*.22,beat=AB.beat,bass=AB.bass;
 const aMul=(light?.85:.72)*(.86+lvl*.6+beat*.36);
 /* Bigger, softer sprites with a small hot core: the field reads as glowing
    dust rather than pin-pricks, and where it is dense the additive blend
    builds up into light. One particle in seventy is a large dim bokeh orb. */
 for(let i=0,o=0;i<n;i++,o+=5){const p=F.p[i],big=p.r>.986;
  D[o]=p.x;D[o+1]=p.y;
  D[o+2]=(7.2+p.s*10.5+bass*7.5*p.s+beat*4.2)*gm*(big?2.6:1);
  D[o+3]=Math.min(1,p.a*aMul*(big?.4:1));
  D[o+4]=p.r}
 gl.viewport(0,0,GLF.c.width,GLF.c.height);
 gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 if(!n)return;
 glFieldColors(performance.now());
 gl.bindBuffer(gl.ARRAY_BUFFER,GLF.buf);
 gl.bufferData(gl.ARRAY_BUFFER,D.subarray(0,n*5),gl.DYNAMIC_DRAW);
 gl.uniform2f(GLF.u.uRes,F.w,F.h);gl.uniform1f(GLF.u.uDpr,F.dpr);
 gl.drawArrays(gl.POINTS,0,n)}

/* Bass / mid / treble and a beat pulse from the analyser. The wave breathes
   with the bass, sparkles with the treble and kicks on the beat, instead of
   following one averaged level that mostly measured the hi-hats. */
const AB={bass:0,mid:0,high:0,lvl:0,beat:0,avg:0,lastBeat:0,kick:0};
function audioBands(dt){
 if(!A.an||!S.playing||!A.data){
  AB.bass*=.92;AB.mid*=.92;AB.high*=.92;AB.lvl*=.92;AB.beat*=Math.exp(-dt*5);return AB}
 A.an.getByteFrequencyData(A.data);
 const d=A.data;let b=0,m=0,h=0;
 for(let i=1;i<5;i++)b+=d[i];for(let i=5;i<32;i++)m+=d[i];for(let i=32;i<110;i++)h+=d[i];
 b/=4*255;m/=27*255;h/=78*255;
 const k=1-Math.exp(-dt*16);
 AB.bass+=(b-AB.bass)*k;AB.mid+=(m-AB.mid)*k;AB.high+=(h-AB.high)*k;
 AB.lvl=Math.min(1,(AB.bass*.5+AB.mid*.35+AB.high*.3)*1.5);
 AB.avg+=(b-AB.avg)*(1-Math.exp(-dt*1.4));
 const now=performance.now();
 if(b>AB.avg*1.18+.035&&b>.28&&now-AB.lastBeat>230){AB.beat=1;AB.lastBeat=now;AB.kick=1}
 else AB.beat*=Math.exp(-dt*5.5);
 return AB}
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
/* The per-platform cap is a fact about the machine, not a preference, so every
   path that builds the field has to come through here. The value is an argument
   because the settings slider and lite mode set S.dens themselves and used to
   hand build() their raw number — which is how a Linux user dialled the density
   straight past the 350 cap this function exists to enforce. */
function safeParticleDensity(dens=S.dens){
 const mem=Number(navigator.deviceMemory)||4,cores=Number(navigator.hardwareConcurrency)||4;
 const weak=matchMedia("(pointer:coarse)").matches||mem<=2||cores<=2;
 const mid=(navigator.userAgent&&navigator.userAgent.includes("Linux"))||mem<=4||cores<=4;
 /* The caps are what the drawing path can afford. Point sprites on the GPU
    cost next to nothing per particle, so with WebGL the limit is the physics
    loop; the 2D fallback keeps its old, much lower ceiling. */
 if(GLF.ok){
  if(weak)return Math.min(dens,1400);
  if(mid)return Math.min(dens,3200);
  return Math.min(dens,6000)}
 if(weak)return Math.min(dens,150);
 if(mid)return Math.min(dens,350);
 return Math.min(dens,800)}
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
let staticFieldDrawn=false;
function resize(){
 /* At dpr 2 the field is four times the pixels for a glow that is deliberately
    soft — nothing in it has an edge sharp enough to benefit, and on WebKitGTK
    the canvas rasterises on the CPU: fill rate is the wall, not the sprite
    count. 1.0 is the ceiling, and lite mode drops to 0.75. The GPU path can
    afford a little more resolution, which keeps the sprites round. */
 F.dpr=Math.min(S.lite?0.75:(GLF.ok?1.25:1.0),window.devicePixelRatio||1);
 F.w=innerWidth;F.h=innerHeight;
 /* Round 8, "the wave eats a lot": the backing store is capped at about
    2.4 megapixels. A 1440p or a scaled 4K window asked the GPU for 4–6 MP of
    blended sprites every frame for a glow too soft to show the difference. */
 if(F.w*F.h*F.dpr*F.dpr>2.4e6)F.dpr=Math.max(.6,Math.sqrt(2.4e6/(F.w*F.h)));
 /* Аура or no background (aura.js): the field is off, so its canvases give
    their backing store back instead of holding a full-window texture. */
 if(!particlesEnabled){
  if(GLF.ok&&GLF.c&&GLF.c.width!==1){GLF.c.width=GLF.c.height=1}
  if(cv.width!==1){cv.width=cv.height=1}
  window.MWAura?.resize?.();staticFieldDrawn=false;return}
 if(GLF.ok){
  GLF.c.width=Math.round(F.w*F.dpr);GLF.c.height=Math.round(F.h*F.dpr);
  if(cv.width!==1){cv.width=cv.height=1}
 }else{cv.width=F.w*F.dpr;cv.height=F.h*F.dpr;gx.setTransform(F.dpr,0,0,F.dpr,0,0)}
 if(!F.p.length)build(innerWidth<900?Math.round(safeParticleDensity()*.45):safeParticleDensity());
 staticFieldDrawn=false;
}
GLF.ok=glFieldInit();
if(GLF.ok)document.documentElement.classList.add("glfield");
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
 const sp=S.pspeed;F.t+=dt*sp*(1+AB.mid*.7);
 const w=F.w,h=F.h,n=F.n,mode=F.mode;
 const amp=h*(.05+.13*lvl+.06*AB.bass+.05*AB.beat);
 /* A beat nudges the wave outward from its spine; the springs pull it back,
    so the kick reads as a pulse rather than a scatter. */
 const kick=AB.kick&&mode==="flow"?AB.kick*(60+120*AB.bass):0;AB.kick=0;
 const sparkle=AB.high*7;
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
   p.hy=h*.5+Math.sin(ph*Math.PI*4+F.t*1.1+p.lane*.7)*amp+(p.lane-4)*h*(.028+.012*AB.bass)+Math.sin(F.t*.5+p.ph)*6
    +(sparkle?Math.sin(F.t*9+p.ph*7)*sparkle*p.r:0);
   if(kick){const dy=p.y-h*.5;p.vy+=(dy>0?1:-1)*kick*(.35+p.r);}
  }
  const a = Math.sin(p.y * 0.006 + F.t * 0.5) + Math.cos(p.x * 0.004 - F.t * 0.3);
  p.vx += Math.cos(a) * 0.08 * (p.s || 1);
  p.vy += Math.sin(a) * 0.05 * (p.s || 1);
  const dx = p.x - F.mx, dy = p.y - F.my, dd = dx * dx + dy * dy;
  if (dd < 16000) {
    const f = (1 - dd / 16000) * 1.6;
    const l = Math.sqrt(dd) || 1;
    p.vx += dx / l * f;
    p.vy += dy / l * f;
  }
  p.vx *= 0.9;
  p.vy *= 0.9;
  const f = Math.min(1, base * (.55 + p.r * .9) * (mode === "gather" ? 2.4 : 1)) * hold;
  p.x += (p.hx - p.x) * f + p.vx * dt;
  p.y += (p.hy - p.y) * f + p.vy * dt;
  const W = F.w, H = F.h;
  if (p.x > W + 5) p.x = -5; if (p.x < -5) p.x = W + 5; if (p.y > H + 5) p.y = -5; if (p.y < -5) p.y = H + 5;
 }}
function draw(lvl){
 if(GLF.ok)return glFieldDraw(lvl);
 gx.clearRect(0,0,F.w,F.h);
 if(!F.n)return;
 gx.globalCompositeOperation="source-over";
 const gl=.85+S.glow*.4;
 for(let i=0;i<F.n;i++){const p=F.p[i],sz=(2.2+p.s*3+lvl*2.6+AB.beat*1.6)*gl;
  gx.drawImage(sprite(Math.min(1,p.a*(1+lvl*.4))),p.x-sz,p.y-sz,sz*2,sz*2)}
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
 /* the line goes with the background: Аура keeps it, Выкл stills it too */
 if(!particlesEnabled&&!window.MWAura?.on)return;
 if(!vis.c)return;const c=vis.c,g=vis.g,w=c.width,h=c.height;
 g.clearRect(0,0,w,h);
 const b=bins(48);
 g.strokeStyle=visColor();g.globalAlpha=.55;g.lineWidth=1.5*(devicePixelRatio||1);
 g.beginPath();
 for(let i=0;i<b.length;i++){const x=(i/(b.length-1))*w,y=h*.78-b[i]*h*.5;i?g.lineTo(x,y):g.moveTo(x,y)}
 g.stroke();g.globalAlpha=1}

/* ── M3 Expressive Living Systems: Particle waves, Wavy progress, Proximity, Parametric shapes ── */
const FINE = (typeof matchMedia === "function") && matchMedia("(pointer:fine)").matches;
const RM = (typeof matchMedia === "function") && matchMedia("(prefers-reduced-motion:reduce)").matches;

/* Material 3 Expressive wavy progress, compositor-driven.

   The played part is a travelling sine wave, the rest a flat track, split by a
   vertical pill handle with a gap on each side and ending in a stop dot.

   The old version rebuilt the whole SVG path in JavaScript on every frame,
   inside a loop capped at 60 fps, so on a 75/100/144 Hz screen it visibly ran
   at 35-50 fps and stuttered whenever the main thread was busy. Now:
   - the wave is ONE periodic path, drawn once per size (and per amplitude
     while it grows or settles on play/pause), slid sideways by a CSS
     animation — the compositor moves it at the display's own refresh rate;
   - the played length, the rest of the track and the handle are plain boxes
     touched only when the position moves by half a pixel;
   - when paused the wave flattens and the animation is paused, costing
     nothing at all. */
const M3W={amp:0,ampDrawn:-1,seekFrac:null,tracks:new Map()};
function m3WaveTrack(track){
 let st=M3W.tracks.get(track);
 if(st&&st.root.isConnected)return st;
 track.querySelectorAll(".m3w,.m3-wave-svg").forEach(n=>n.remove());
 track.classList.add("has-m3w");
 track.insertAdjacentHTML("afterbegin",`<div class="m3w" aria-hidden="true"><div class="m3w-played"><svg class="m3w-svg"><path class="m3w-path"/></svg></div><i class="m3w-rest"></i><i class="m3w-stop"></i><i class="m3w-thumbpos"><b class="m3w-thumb"></b></i></div>`);
 const root=track.querySelector(".m3w");
 const big=track.id==="fptrack";
 st={root,big,played:root.querySelector(".m3w-played"),svg:root.querySelector(".m3w-svg"),path:root.querySelector(".m3w-path"),
  rest:root.querySelector(".m3w-rest"),stop:root.querySelector(".m3w-stop"),thumb:root.querySelector(".m3w-thumbpos"),
  w:0,h:0,x:-1,amp:-1,wl:big?40:34,stroke:big?5:4};
 root.style.setProperty("--m3w-wl",(-st.wl)+"px");
 root.style.setProperty("--m3w-sw",st.stroke+"px");
 const measure=()=>{const r=track.getBoundingClientRect();
  if(Math.abs(r.width-st.w)<.5&&Math.abs(r.height-st.h)<.5)return;
  st.w=r.width;st.h=r.height;st.amp=-1;st.x=-1};
 measure();
 if(typeof ResizeObserver==="function"){st.ro=new ResizeObserver(measure);st.ro.observe(track)}
 M3W.tracks.set(track,st);
 return st}
/* One period-exact sine, long enough to slide by a wavelength. Drawn with
   quadratic curves (two per half wave) instead of hundreds of line segments. */
function m3WavePath(st,amp){
 const w=st.w+st.wl*2,h=st.h,cy=h/2,a=(st.big?3.6:3)*amp,q=st.wl/4;
 st.svg.setAttribute("width",w.toFixed(1));st.svg.setAttribute("height",h.toFixed(1));
 st.svg.setAttribute("viewBox",`0 0 ${w.toFixed(1)} ${h.toFixed(1)}`);
 let d=`M0 ${cy.toFixed(2)}`;
 if(a<.05)d+=`L${w.toFixed(1)} ${cy.toFixed(2)}`;
 else for(let x=0,s=1;x<w;x+=q*2,s=-s){
  /* A quadratic peaks at half its control offset, hence 2a. */
  d+=`Q${(x+q).toFixed(2)} ${(cy-s*a*2).toFixed(2)} ${(x+q*2).toFixed(2)} ${cy.toFixed(2)}`}
 st.path.setAttribute("d",d);
 st.amp=amp}
function m3WaveDraw(st,p,amp){
 const w=st.w,h=st.h;if(w<8||h<4)return;
 if(Math.abs(st.amp-amp)>.004||st.amp<0)m3WavePath(st,amp);
 const pad=st.stroke/2,gap=4+2;
 const x=pad+p*(w-2*pad);
 if(Math.abs(x-st.x)<.5)return;
 st.x=x;
 const waveEnd=Math.max(0,x-gap),restStart=x+gap;
 st.played.style.width=waveEnd.toFixed(1)+"px";
 st.rest.style.left=restStart.toFixed(1)+"px";
 st.rest.style.opacity=restStart<w-pad-st.stroke?"1":"0";
 st.stop.style.opacity=(w-pad)-restStart>st.stroke*2?"1":"0";
 st.thumb.style.transform=`translate3d(${x.toFixed(1)}px,0,0)`}
function updateWavyProgress(dt, curPos, dur) {
 /* CZ_FLAT: the designer's "wavy progress bar" switched off */
 const playing=!!S.playing&&!RM&&!window.CZ_FLAT;
 const target=playing?1:0;
 M3W.amp+=(target-M3W.amp)*Math.min(1,dt*6);
 if(Math.abs(M3W.amp-target)<.01)M3W.amp=target;
 const effectiveDur=dur>0?dur:0;
 let p=effectiveDur?Math.max(0,Math.min(1,curPos/effectiveDur)):0;
 /* While a drag is in progress the handle follows the pointer, not the
    media element, or it would snap back to the old time between moves. */
 if(seeking&&effectiveDur)p=Math.max(0,Math.min(1,S.pos/effectiveDur));
 const moving=playing||M3W.amp>0;
 for(const id of ["btrack","fptrack"]){
  const track=document.getElementById(id);
  if(!track||!track.offsetParent&&id==="fptrack")continue;
  const st=m3WaveTrack(track);
  if(st.root.dataset.run!==String(moving))st.root.dataset.run=String(moving);
  m3WaveDraw(st,p,M3W.amp)}
}

/* headline proximity weight */
function prox(chars, base, maxW, minW, rad) {
  if (!FINE || RM) return;
  if (!chars || !chars.length) return;
  const mx = (typeof F !== "undefined" && F.mx != null) ? F.mx : -1e4;
  const my = (typeof F !== "undefined" && F.my != null) ? F.my : -1e4;
  chars.forEach(c => {
    const r = c.getBoundingClientRect();
    const d = Math.hypot(mx - (r.left + r.width / 2), my - (r.top + r.height / 2));
    const t = Math.min(1, Math.max(0, 1 - d / (rad || 1)));
    const e = t * t * (3 - 2 * t);
    c.style.fontVariationSettings = `"wght" ${Math.round(base + (maxW - base) * e)},"wdth" ${Math.round(120 + (minW - 120) * e)},"opsz" 144`;
  });
}

/* parametric shapes */
const N = 180;
function pts(spec) {
  const [t, n, a] = (spec || 'flower,6,.2').split(',');
  const k = +n || 4, A = +a || 0.2, R = 46, o = [];
  for (let i = 0; i < N; i++) {
    const th = i / N * Math.PI * 2;
    const r = (t === 'flower') 
      ? R * (1 - A) + R * A * Math.pow(Math.abs(Math.cos(k * th / 2)), 0.8) 
      : (t === 'cookie') 
        ? R * (1 - A / 2 + A / 2 * Math.cos(k * th)) 
        : R;
    o.push([50 + r * Math.cos(th - Math.PI / 2), 50 + r * Math.sin(th - Math.PI / 2)]);
  }
  return o;
}
const toD = p => 'M' + p.map(q => q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('L') + 'Z';

/* Render gating.
   Rule: the canvas only stops when the window is genuinely invisible
   (minimised or hidden). Merely losing focus must NOT stop it — the window is
   still on screen and a frozen field looks broken. Losing focus only lowers
   the frame budget.

   The 3D orbit is deliberately NOT part of this: it moves audio, not pixels,
   so it keeps running on its own timer even while the window is hidden.
   Otherwise the sound parked wherever the panner happened to stop. */
/* The loop used to run at whatever rate rAF handed it ("budget 0"). On stacks
    where rAF is not vsynced — several Wayland/compositor combinations — that
    free-ran at 140+ fps and pinned a core at 100% for frames nobody can see.
    60fps is the ceiling now; CSS motion is unaffected and stays on the
    compositor's own refresh rate. Only the canvas field and the karaoke clock
    are capped. */
let last=performance.now(),raf=0,lastFrame=0,renderOn=true,budget=1000/60,fieldDt=0,vsMs=1000/60,vsLast=0,vsTick=0,vkCur=1,fieldTick=0;
function onReducedMotionChange(reduced){
 staticFieldDrawn=false;
 if(!reduced && renderOn && !raf) raf=requestAnimationFrame(frame);
}
/* Advances the clock for non-local playback: rAF drives it while the window
   is visible, the orbit interval takes over while it is hidden. */
function advanceClock(dt){
 S.pos+=dt;S.listen+=dt;noteListening(dt);
 if(S.pos>=S.dur){S.repeat?S.pos=0:next()}
 paint()}
function frame(now){
 if(!renderOn||document.hidden){raf=0;vsLast=0;return}
 const isReduce=BOOT.reduce;
 /* Even pacing (round 8, "the wave is still jerky"). A time cap of 60 on a
    75, 144 or 165 Hz screen drew on an irregular subset of vsyncs — 2, then 3,
    then 2 refreshes apart — and particles moving at a steady speed stuttered.
    Now the refresh interval is measured and the loop draws on every k-th
    vsync: 144 Hz runs at an even 72, 165 at 55, 120 and 240 at 60, 75 and 90
    at their own rate. The time floor stays for stacks whose rAF is not tied
    to vsync at all. */
 if(vsLast){const d=now-vsLast;if(d>2&&d<60)vsMs+=(d-vsMs)*(d<vsMs*1.5?.06:.01)}
 vsLast=now;
 /* with a little hysteresis, so a refresh rate on the boundary (100 Hz)
    does not flip between two divisors */
 {const want=budget*1.2/vsMs;if(want<vkCur-.1||want>=vkCur+1.1)vkCur=Math.max(1,Math.floor(want))}
 const vk=vkCur;
 if(++vsTick<vk||now-lastFrame<Math.min(budget,vk*vsMs)*.82){raf=requestAnimationFrame(frame);return}
 vsTick=0;lastFrame=now;
 const dt=Math.min(.25,(now-last)/1000);last=now;
 if(!isReduce){
  staticFieldDrawn=false;
  /* If fullscreen player is open, skip drawing hidden background particles */
  if(fp.dataset.open==="true"){
   fpBeat(dt);
  }else{
   /* Background (aura.js): the wave, the light Аура, or nothing at all —
      "off" skips even the analyser read, so nothing under the glass moves. */
   const bgm=window.MWAura?.bg||"wave";
   if(bgm!=="off"){
   const lvl=audioBands(dt).lvl;
   /* Glow dust does not need every frame the UI gets: 40 updates a second
      read the same, and every canvas repaint is CPU pixels under WebKitGTK.
      dt accumulates so the physics keeps its real speed. The WebGL field
      draws on the GPU, so it takes every frame and stays fluid. */
   /* Behind any other screen the field is dimmed to 30 % (#field.dim): 30
      updates a second look the same there, and each update also re-blurs
      every glass panel above it — the expensive part on WebKitGTK/WKWebView.
      «Частота фона: 30» and lite mode ask for the same on the home screen. */
   const aura=bgm==="aura";
   const hz=S.view!=="home"||S.lite||window.MWAura?.fps===30?30:(GLF.ok||aura)?0:40;
   /* a whole number of loop frames per update, so the updates are evenly
      spaced too */
   const every=hz?Math.max(1,Math.round(1000/(vk*vsMs)/hz)):1;
   fieldDt+=dt;
   if(++fieldTick>=every){fieldTick=0;
    if(aura)MWAura.frame(fieldDt,lvl);else{step(fieldDt,lvl);draw(lvl)}
    fieldDt=0}
   }
  }
 }else if(!staticFieldDrawn&&F.w&&F.h){
  if(window.MWAura?.on)MWAura.frame(0,0);
  else{gx.clearRect(0,0,F.w,F.h);draw(0)}
  staticFieldDrawn=true;
 }
 /* Non-local playback has no media element to read a clock from, so its
    position and listening time advance here instead. */
 if(S.playing&&S.current?.mode!=="local")advanceClock(dt)
 const isSeeking = A.pendingSeek !== null && Date.now() < A.seekingUntil;
 const curPos=(A.audio&&!A.audio.paused&&Number.isFinite(A.audio.currentTime))?A.audio.currentTime:S.pos;
 if(S.playing && !isSeeking)syncKaraokeFrame(curPos);
 {const ed=(Number.isFinite(S.dur)&&S.dur>0)?S.dur:(S.current?.d?+S.current.d:((A.audio?.duration>0&&Number.isFinite(A.audio.duration))?A.audio.duration:0));
  updateWavyProgress(dt, isSeeking?A.pendingSeek:curPos, ed)}

 raf=requestAnimationFrame(frame)
}
/* A line lights up this much before its timestamp: the media clock runs a
   little ahead of what reaches the speakers, and a line that appears exactly
   on the beat reads as late. */
const LY_LEAD=.18;
function syncKaraokeFrame(curPos){
 const L=lyricsFor(S.current);
 if(!L?.lines?.length||!L.synced)return;
 const offset=typeof getLyricOffset==="function"?getLyricOffset(S.current):0;
 const effPos=Math.max(0,curPos+offset+LY_LEAD);
 let idx=-1;
 for(let i=0;i<L.lines.length;i++){
  const at=L.lines[i].at;
  if(at==null)continue;
  if(effPos>=at)idx=i;else break;
 }
 /* Line changes are decided on the frame clock. timeupdate fires about four
    times a second, so a line used to switch up to a quarter-second late —
    the "lyrics are out of sync" report even with correct timestamps. */
 if(idx!==lyLast&&((fp.dataset.open==="true"&&S.fpMode==="lyric")||document.getElementById("lyr")))syncLyrics();
 if(S.lyKaraoke==="line"||S.lyKaraoke==="off")return;
 if(idx<0||idx>=L.lines.length)return;
 const curLine=L.lines[idx];
 const nextLine=L.lines[idx+1];
 const start=curLine.at||0;
 const dur=nextLine&&nextLine.at!=null?(nextLine.at-start):Math.min(6,Math.max(2,(S.dur||start+4)-start));
 const elapsed=Math.max(0,effPos-start);
 const pct=Math.min(100,Math.max(0,(elapsed/Math.max(0.2,dur))*100));
 const pctStr=`${pct.toFixed(1)}%`;
 const boxes=[document.getElementById("fplyr"),document.getElementById("lyr")].filter(Boolean);
 for(const box of boxes){
  const curEl=box.querySelector(`p[data-i="${idx}"]`);
  if(curEl)curEl.style.setProperty("--karaoke-pct",pctStr);
  if(box._lastKaraokeIdx!==undefined&&box._lastKaraokeIdx!==idx){
   const prevEl=box.querySelector(`p[data-i="${box._lastKaraokeIdx}"]`);
   if(prevEl)prevEl.style.setProperty("--karaoke-pct",box._lastKaraokeIdx<idx?"100%":"0%");
  }
  box._lastKaraokeIdx=idx;
 }
}
/* The orbit runs off the render loop: setInterval is not throttled in a hidden
   window the way rAF is, so the sound keeps circling the head. */
let orbitLast=performance.now();
setInterval(()=>{
 const now=performance.now(),dt=Math.min(.25,(now-orbitLast)/1000);orbitLast=now;
 if(S.sp.on&&S.playing)orbit(dt);
 /* A hidden window gets no rAF, so for non-local tracks the position clock,
    listening time and auto-advance froze until the window came back. This
    timer is not throttled, so it drives them instead. */
 if(document.hidden&&S.playing&&S.current?.mode!=="local")advanceClock(dt)
},1000/30);
function setRender(on){
 /* on comes from Rust meaning "the window is visible"; document.hidden concurs */
 on=!!on&&!document.hidden;
 if(on===renderOn)return;
 renderOn=on;
 if(on){
  last=performance.now();lastFrame=0;fieldDt=0;
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
  if(GLF.ok&&GLF.c){GLF.c.width=GLF.c.height=1}
  spriteCache={};
  vis.c=null;vis.g=null}
}
/* Visible window renders at full monitor refresh rate */
/* Focus used to set the budget to 0 (uncapped). The wave and the cover
   animations run on the compositor now, so the main loop stays at 60. */
function setFocused(f){}
document.addEventListener("visibilitychange",()=>setRender(!document.hidden));
window.addEventListener("blur",()=>{/* Visible windows in tiling WMs keep smooth refresh */});
window.addEventListener("focus",()=>{setFocused(true);setRender(true)});
["pointermove","pointerdown","keydown"].forEach(evt=>{
 window.addEventListener(evt,()=>{if(!renderOn&&!document.hidden)setRender(true)},{passive:true});
});
raf=requestAnimationFrame(frame)

/* render */
/* White service marks, inline and on currentColor (no CDN — the vendored-icon
   principle). Cutouts use --surf so the mark reads as a stamp on the chip in
   both themes. */
/* Round 6: YouTube Music, SoundCloud and Deezer use their official marks
   (Simple Icons, CC0) — Deezer's was the old equaliser, drawn as a
   signal-strength icon ("the Deezer icon is wrong"). */
const SVC_ICONS={
 ytm:`<svg class="sic" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/></svg>`,
 sc:`<svg class="sic" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z"/></svg>`,
 ym:`<svg class="sic" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.65 10.78 L22.52 12.90 L22.26 13.16 L18.87 12.27 L21.36 16.96 L21.06 17.10 L17.70 14.34 L18.43 19.74 L18.43 20.28 L18.11 20.48 L15.28 14.62 L12.25 21.94 L11.70 22.54 L11.42 22.45 L13.04 13.15 L4.30 17.99 L3.46 18.34 L3.22 17.89 L11.37 11.05 L1.47 9.90 L1.77 9.39 L10.36 8.72 L4.34 4.55 L4.59 4.33 L5.49 4.54 L10.99 6.47 L8.50 1.95 L8.91 1.85 L13.46 5.51 L13.49 1.56 L13.82 1.49 L15.79 6.01 L17.61 3.07 L17.91 3.42 L17.54 6.88 L20.10 5.71 L20.71 5.74 L18.78 8.48 L22.16 9.08 L22.23 9.47 L19.30 10.20 L19.16 10.39 L19.65 10.76 Z"/></svg>`,
 sp:`<svg class="sic" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.58 14.42c-.18.3-.56.4-.86.22-2.35-1.44-5.32-1.76-8.81-.97-.34.08-.68-.14-.76-.48-.08-.34.14-.68.48-.76 3.82-.87 7.1-.51 9.73 1.13.3.18.4.56.22.86zm1.22-2.73c-.23.37-.72.49-1.09.26-2.69-1.66-6.8-2.14-9.99-1.17-.42.13-.86-.11-.99-.53-.13-.42.11-.86.53-.99 3.65-1.11 8.2-.58 11.28 1.34.37.23.49.72.26 1.09zm.11-2.85C14.68 8.87 9.39 8.7 6.3 9.64c-.49.15-1.02-.13-1.17-.62-.15-.49.13-1.02.62-1.17 3.56-1.08 9.42-.88 13.15 1.33.45.27.6.85.33 1.3-.27.45-.85.6-1.33.33z"/></svg>`,
 dz:`<svg class="sic" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.693 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807C.312 4.41 0 5.666 0 7.217s.312 2.808.693 2.808ZM21.038 1.56c-.364 0-.684.805-.91 2.096C19.765 1.446 19.184 0 18.526 0c-.78 0-1.464 2.036-1.784 5-.312-2.158-.788-3.536-1.325-3.536-.745 0-1.386 2.704-1.62 6.472-.442-1.932-1.083-3.145-1.793-3.145s-1.35 1.213-1.793 3.145c-.242-3.76-.874-6.463-1.628-6.463-.537 0-1.013 1.378-1.325 3.535C6.938 2.036 6.262 0 5.474 0c-.658 0-1.247 1.447-1.602 3.665-.217-1.291-.546-2.105-.91-2.105-.675 0-1.221 2.807-1.221 6.272 0 3.466.546 6.273 1.221 6.273.277 0 .537-.476.736-1.273.32 2.928.996 4.938 1.776 4.938.606 0 1.143-1.204 1.507-3.11.251 3.622.875 6.195 1.602 6.195.46 0 .875-1.023 1.187-2.677C10.142 21.6 11 24 12.004 24c1.005 0 1.863-2.4 2.235-5.822.312 1.654.727 2.677 1.186 2.677.728 0 1.352-2.573 1.603-6.195.364 1.906.9 3.11 1.507 3.11.78 0 1.455-2.01 1.775-4.938.208.797.46 1.273.737 1.273.675 0 1.22-2.807 1.22-6.273-.008-3.457-.553-6.272-1.23-6.272ZM23.307 10.024c.381 0 .693-1.256.693-2.807 0-1.55-.312-2.807-.693-2.807-.381 0-.693 1.256-.693 2.807s.312 2.808.693 2.808Z"/></svg>`,
 local:`<svg class="sic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="11" cy="14" r="2"/><path d="M13 14V10"/></svg>`,
 genius:`<svg class="sic" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.5c-.8 2-2.8 3.5-5.5 3.5-3.6 0-6.5-2.9-6.5-6.5S8.4 5 12 5c2.4 0 4.4 1.3 5.4 3.2l-2.2 1.3c-.6-1.2-1.8-2-3.2-2-2.2 0-4 1.8-4 4s1.8 4 4 4c1.4 0 2.6-.7 3.3-1.8h-3.3v-2.4h5.8v3.2z"/></svg>`
};
function renderSrv(){
 /* Names go through svc() so the localised ones resolve. */
 const srvEl = document.getElementById("srv");
 if(srvEl){
  srvEl.innerHTML=SERVICES.map(s=>
   `<button class="s" data-svc="${s.id}" data-conn="${s.conn}" data-on="${!!(s.conn&&s.on)}" title="${esc(svc(s.id).name)}">${SVC_ICONS[s.id]||""}<span class="d"></span>${esc(svc(s.id).name)}</button>`).join("");
 }
 renderSrvDropdown();
}

function renderSrvDropdown(){
 const ddList = document.getElementById("srv-dd-list");
 const ddCount = document.getElementById("srv-dd-count");
 const activeCount = SERVICES.filter(s=>s.conn&&s.on).length;
 if(ddCount) ddCount.textContent = activeCount;
 if(!ddList) return;
 ddList.innerHTML = SERVICES.map(s=>{
  const isConn = !!s.conn;
  const isOn = !!(s.conn && s.on);
  const statusText = s.free ? t("ready") : (isConn ? t("connected") : t("noauth"));
  return `<div class="srv-dd-item ${isOn ? "on" : ""}" data-svc="${s.id}">
   <div class="srv-dd-meta">
    <span class="srv-dd-item-icon">${SVC_ICONS[s.id]||""}</span>
    <div class="srv-dd-info">
     <b>${esc(svc(s.id).name)}</b>
     <small>${statusText}</small>
    </div>
   </div>
   <button class="sw ${isOn ? "on" : ""}" data-svc-sw="${s.id}" aria-pressed="${isOn}" ${!isConn ? 'disabled' : ''}></button>
  </div>`;
 }).join("");
}
let tokOpen=null;
/* ═════════ Accounts: the user's own libraries on other services ═════════
   YouTube Music, SoundCloud and Deezer sign in through accounts.rs: a window
   on the service's own page, only the session key kept, in the keychain.
   Yandex keeps its token flow and Spotify its OAuth. Once connected, every
   card offers the same thing: liked tracks into favourites, playlists into
   the library; the personal shelf in the sheet comes from the same account. */
const ACC_ORDER=["ytm","sc","dz","ym","sp"];
const ACC_RUST=["ytm","sc","dz"];
const ACC_BRAND={ytm:"#ff2d55",sc:"#ff6a1a",dz:"#a238ff",ym:"#ffcc00",sp:"#1ed760"};
const ACC={};
const accSt=id=>ACC[id]||(ACC[id]={st:null,open:false,lists:null,busy:"",done:null,paste:""});
const accOn=id=>ACC_RUST.includes(id)?!!accSt(id).st?.connected:!!svc(id).conn;
const accErr=e=>String(e?.message||e||"");
function accUser(id){
 if(ACC_RUST.includes(id))return accSt(id).st?.user||"";
 /* SP is declared further down; a render during boot must not trip on it. */
 if(id==="sp")try{return SP.me?.display_name||SP.me?.id||""}catch(_){}
 return ""}
const accLikedRow=()=>({id:"me:liked",name:t("acc.liked"),liked:true,total:null,art:null});
const accRustIO=id=>({lists:()=>inv("acc_lists",{service:id,lang:LANG}),tracks:l=>inv("acc_tracks",{service:id,id:l.id})});
const ACC_IO={ytm:accRustIO("ytm"),sc:accRustIO("sc"),dz:accRustIO("dz"),
 ym:{lists:async()=>[accLikedRow(),...((await inv("ym_playlists"))||[]).map(p=>({id:String(p.id),name:p.name,total:p.total??null,art:p.art||null}))],
  tracks:l=>l.liked?inv("ym_liked_tracks"):inv("ym_playlist_tracks",{kind:l.id})},
 sp:{lists:async()=>[accLikedRow(),...((await inv("spotify_playlists"))||[]).map(p=>({id:String(p.id),name:p.name,total:p.total??null,art:p.art||p.image||null}))],
  tracks:l=>l.liked?inv("spotify_liked_tracks"):inv("spotify_playlist_tracks",{pid:l.id})}};
function accStatus(id){
 const a=accSt(id),on=accOn(id),u=accUser(id);
 if(!on&&a.busy==="login")return t(a.via==="window"?"acc.wait":"acc.wait.b");
 if(on&&a.st?.error)return t("acc.stale");
 if(on)return u?t("acc.as").replace("{u}",u):t("connected");
 return t("acc.off."+id)}
const accTokHTML=id=>`<div class="tokrow"><input id="tok-${id}" type="password" placeholder="${t("tok.ph")}" autocomplete="off">
 <button class="btn" data-toksave="${id}">${t("tok.save")}</button><small style="color:var(--mute);font-size:.72rem">${t("tok.hint")}</small></div>${id==="ym"?ymGuide():""}`;
function accLibHTML(id){
 const a=accSt(id),L=a.lists;
 if(!L)return `<div class="acc-lib is-load"><span class="material-symbols-rounded acc-spin" aria-hidden="true">progress_activity</span><span>${esc(t("hs.load"))}</span></div>`;
 if(L.error)return `<div class="acc-lib is-err"><span>${esc(L.error)}</span><button class="btn sm" data-accretry="${id}"><span class="material-symbols-rounded" style="font-size:16px">refresh</span><span>${esc(t("hs.retry"))}</span></button></div>`;
 const busy=a.busy;
 const rows=L.items.map((l,i)=>{
  const done=a.done?.[i],now=busy==="row"+i;
  const label=now?t("acc.importing"):done?t("acc.again"):l.liked?t("acc.tofav"):t("sp.import");
  const sub=l.liked?t("acc.liked.s"):l.total!=null?`${l.total} ${t("tracks")}`:t("acc.pl");
  return `<div class="acc-row${l.liked?" is-liked":""}">
   <span class="acc-row-art"><span class="material-symbols-rounded" aria-hidden="true">${l.liked?"favorite":"queue_music"}</span>${l.art?`<img src="${esc(l.art)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:""}</span>
   <span class="acc-row-meta"><b title="${esc(l.name)}">${esc(l.name)}</b><small>${esc(sub)}</small></span>
   <button class="btn sm${done?" on":""}" data-accrow="${id}" data-i="${i}"${busy?" disabled":""}>${now?`<span class="material-symbols-rounded acc-spin" style="font-size:16px">progress_activity</span>`:done?`<span class="material-symbols-rounded" style="font-size:16px">check</span>`:""}<span>${esc(label)}</span></button></div>`}).join("");
 return `<div class="acc-lib"><div class="acc-lib-head"><b>${esc(t("acc.lib"))}</b>
  ${L.items.length>1?`<button class="btn sm" data-accall="${id}"${busy?" disabled":""}><span class="material-symbols-rounded" style="font-size:16px">download</span><span>${esc(t("acc.all"))}</span></button>`:""}</div>
  <div class="acc-rows">${rows||`<p class="ph">${esc(t("sp.nolists"))}</p>`}</div><small class="acc-note">${esc(t("acc.note"))}</small></div>`}
/* Round 6: "elegant, black and white, like Spotify" — one quiet row per
   service in a single list: a monochrome mark, the name and the state, and
   outline buttons on the right. No brand-coloured tiles, no white pills. */
function accCard(id){
 const a=accSt(id),on=accOn(id);
 const logo=(SVC_ICONS[id]||"").replace('width="14" height="14"','width="20" height="20"');
 const ava=on&&a.st?.avatar?`<img class="acc-ava" src="${esc(a.st.avatar)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">`:"";
 const I=(n,spin)=>`<span class="material-symbols-rounded${spin?" acc-spin":""}" style="font-size:16px" aria-hidden="true">${n}</span>`;
 const wait=a.busy==="login";
 const act=on
  ?`<button class="btn sm acc-alt" data-accout="${id}">${esc(t("acc.out"))}</button>
   <button class="btn sm acc-go${a.open?" on":""}" data-accimp="${id}" aria-expanded="${a.open}">${I(a.open?"expand_less":"library_add")}<span>${esc(t("acc.import"))}</span></button>`
  :`${id==="sp"?`<button class="btn sm acc-alt" data-sp-cid-toggle="true">Client ID</button>`
    :`<button class="btn sm acc-alt" data-accpaste="${id}"${a.busy==="paste"?" disabled":""}>${esc(t(id==="ym"?"acc.token":"acc.paste"))}</button>`}
   <button class="btn sm acc-go" data-accin="${id}"${wait?' aria-busy="true"':""} title="${esc(t(ACC_RUST.includes(id)?"acc.in.s":"acc.in.s2"))}">${wait?I("progress_activity",true):""}<span>${esc(t("acc.in"))}</span></button>`;
 const hint=!on&&id==="ym"&&a.paste?`<p class="acc-hint">${esc(t("ym.acc.open"))} <a href="#" data-accopen="${esc(a.paste)}">${esc(a.paste)}</a></p>`:"";
 const extra=on&&a.open?accLibHTML(id):(!on&&tokOpen===id?(id==="sp"?spGuide():accTokHTML(id)):"");
 return `<section class="acc-card" data-acc-card="${id}" data-on="${on}"${on&&a.st?.error?' data-warn="true"':""}>
  <div class="acc-line"><span class="acc-logo">${logo}</span>
   <div class="acc-meta" title="${esc(t("acc.d."+id))}"><b>${esc(svc(id).name)}</b><small>${ava}<span>${esc(accStatus(id))}</span></small></div>
   <div class="acc-act">${act}</div></div>${hint||extra?`<div class="acc-sub">${hint}${extra}</div>`:""}</section>`}
function renderAccounts(){
 const host=document.getElementById("accounts");if(!host)return;
 host.innerHTML=ACC_ORDER.map(accCard).join("");
 icons()}
async function accLists(id,force){
 const a=accSt(id);
 if(a.lists&&!a.lists.error&&!force)return;
 a.lists=null;a.done=null;renderAccounts();
 try{a.lists={items:((await ACC_IO[id].lists())||[]).filter(x=>x&&x.name)}}
 catch(e){a.lists={error:accErr(e)}}
 renderAccounts()}
async function accImport(id,i){
 const a=accSt(id),l=a.lists?.items?.[i];if(!l||a.busy)return;
 a.busy="row"+i;renderAccounts();
 try{
  const rows=await ACC_IO[id].tracks(l);
  /* A playlist remembers where it came from: bringing it over again fills
     the same one instead of adding a twin. */
  await importRows(rows||[],id==="sp"?null:id,l.name,!!l.liked,l.liked?null:`${id}:${l.id}`);
  (a.done||(a.done={}))[i]=true;
 }catch(e){toast(accErr(e),5200)}
 a.busy="";renderAccounts()}
async function accImportAll(id){
 const a=accSt(id),items=a.lists?.items||[];if(!items.length||a.busy)return;
 const n=items.filter(x=>!x.liked).length;
 const ok=await askConfirm(t("acc.all.t").replace("{s}",svc(id).name),t("acc.all.ok"),false,{icon:"download",sub:t("acc.all.s").replace("{n}",n)});
 if(!ok)return;
 for(let i=0;i<items.length;i++)await accImport(id,i)}
async function ymLoginFlow(){
 if(!TAURI)return toast(t("acc.desk"));
 toast(t("ym.acc.browser"));
 try{
  const started=await inv("ym_login_start");
  toast(t("ym.acc.wait"),9000);
  if(started?.paste){accSt("ym").paste=started.paste;renderAccounts()}
  /* The paste page stores the token whenever the user finishes; polling
     flips the card to connected. */
  let tries=0;
  const poll=setInterval(async()=>{
   tries++;await initServices();
   if(svc("ym").conn||tries>20){clearInterval(poll);accSt("ym").paste="";renderAccounts()}},3000);
 }catch(e){toast(accErr(e),5200)}}
async function spClientId(){
 let cid=SP_CLIENT_ID||(await inv("spotify_get_client_id").catch(()=>""))||"";
 if(cid)return cid;
 const v=await askText(t("acc.sp.cid.t"),"",{icon:"key",label:"Client ID",sub:t("acc.sp.cid.s"),confirm:t("tok.save"),required:true,max:120});
 if(!v||!v.trim())return "";
 await inv("spotify_set_client_id",{clientId:v.trim()}).catch(()=>{});
 SP_CLIENT_ID=v.trim();return SP_CLIENT_ID}
async function spLoginFlow(){
 if(!TAURI)return toast(t("acc.desk"));
 if(!await spClientId())return;
 toast(t("sp.browser"));
 try{SP.me=await inv("spotify_login");await initServices()}
 catch(e){toast(accErr(e),5200)}
 renderAccounts();renderSrv();icons()}
/* Round 6: "make the sign-in happen in my browser". The page opens in the
   user's own Chromium-family browser (accounts.rs `acc_login_browser`); the
   app's sign-in window is only the fallback for a machine without one. */
async function accLogin(id){
 if(id==="ym")return ymLoginFlow();
 if(id==="sp")return spLoginFlow();
 if(!TAURI)return toast(t("acc.desk"));
 const a=accSt(id);a.busy="login";a.via="browser";renderAccounts();
 clearTimeout(a.loginT);a.loginT=setTimeout(()=>{if(a.busy==="login"){a.busy="";renderAccounts()}},11*60*1000);
 let why="";
 try{
  const b=await inv("acc_login_browser",{service:id});
  toast(b?t("acc.browser").replace("{b}",b):t("acc.browser.open"),7000,{icon:"open_in_browser"});
  return}
 catch(e){why=accErr(e);console.warn("[meowave] browser sign-in:",why)}
 a.via="window";renderAccounts();
 try{
  await inv("acc_login",{service:id});
  toast(t(/no-browser/.test(why)?"acc.nobrowser":"acc.window").replace("{s}",svc(id).name),6500,{icon:"open_in_new"})}
 catch(e){a.busy="";toast(accErr(e),5200);renderAccounts()}}
const accOkText=(id,u)=>u?t("acc.ok").replace("{s}",svc(id).name).replace("{u}",u):t("acc.ok0").replace("{s}",svc(id).name);
async function accPaste(id){
 if(id==="ym"){tokOpen=tokOpen==="ym"?null:"ym";renderAccounts();if(tokOpen)document.getElementById("tok-ym")?.focus();return}
 if(!TAURI)return toast(t("acc.desk"));
 const v=await askText(t("acc.paste.t").replace("{s}",svc(id).name),"",{icon:"content_paste",label:t("acc.paste.l."+id),sub:t("acc.paste.s."+id),confirm:t("acc.paste.ok"),required:true,max:16384,secret:true,hint:t("acc.paste.h")});
 if(!v)return;
 const a=accSt(id);a.busy="paste";renderAccounts();
 try{a.st=await inv("acc_paste",{service:id,value:v});a.lists=null;toast(accOkText(id,a.st?.user),4800,{icon:"check_circle"});window.hsForget?.(id)}
 catch(e){const m=accErr(e);toast(/^paste:/.test(m)?t("acc.paste.bad"):m,6500)}
 a.busy="";renderAccounts()}
async function accLogout(id){
 const ok=await askConfirm(t("acc.out.t").replace("{s}",svc(id).name),t("acc.out"),true,{icon:"logout",sub:t("acc.out.s")});
 if(!ok)return;
 const a=accSt(id);a.open=false;a.lists=null;a.done=null;
 if(ACC_RUST.includes(id)){await inv("acc_logout",{service:id}).catch(()=>{});a.st={service:id,connected:false}}
 else if(id==="sp"){await inv("spotify_logout").catch(()=>{});SP={me:null,lists:null};await initServices()}
 else{await deleteToken(id).catch(()=>{});const s=svc(id);s.conn=false;s.on=false}
 window.hsForget?.(id);
 renderAccounts();renderSrv();icons()}
async function accRefresh(id){
 if(!TAURI||!ACC_RUST.includes(id))return;
 try{accSt(id).st=await inv("acc_status",{service:id})}catch(_){}
 renderAccounts()}
function accRefreshAll(){
 ACC_RUST.forEach(accRefresh);
 if(TAURI&&svc("sp").conn&&!SP.me)inv("spotify_me").then(m=>{if(m){SP.me=m;renderAccounts()}}).catch(()=>{})}
/* TAURI itself is declared further down; read the bridge directly here. */
if(window.__TAURI__?.core&&window.__TAURI__?.event?.listen)window.__TAURI__.event.listen("acc-changed",e=>{
 const p=e?.payload||{},id=p.service;if(!id||!ACC_RUST.includes(id))return;
 const a=accSt(id);a.busy="";clearTimeout(a.loginT);
 if(p.ok){
  a.st={service:id,connected:true,user:p.user||"",avatar:null};a.lists=null;
  toast(accOkText(id,p.user),4800,{icon:"check_circle"});
  window.hsForget?.(id);accRefresh(id)}
 else if(p.closed&&a.via==="browser")toast(t("acc.err.closed"),5200);
 else if(p.error==="cookies")toast(t("acc.err.jar"),7000);
 else if(p.error==="timeout")toast(t("acc.err.time"),5200);
 else if(p.error)toast(String(p.error),5200);
 renderAccounts()});
document.addEventListener("click",e=>{
 const b=e.target.closest?.("[data-accin],[data-accout],[data-accimp],[data-accpaste],[data-accrow],[data-accall],[data-accretry],[data-accopen],#acc-link-imp");
 if(!b)return;
 e.preventDefault();
 const d=b.dataset;
 if(b.id==="acc-link-imp")openImportModal();
 else if(d.accin)accLogin(d.accin);
 else if(d.accout)accLogout(d.accout);
 else if(d.accimp){const a=accSt(d.accimp);a.open=!a.open;renderAccounts();if(a.open)accLists(d.accimp)}
 else if(d.accpaste)accPaste(d.accpaste);
 else if(d.accrow)accImport(d.accrow,+d.i);
 else if(d.accall)accImportAll(d.accall);
 else if(d.accretry)accLists(d.accretry,true);
 else if(d.accopen)openExternal(d.accopen)});
function spGuide(){
 return `<div class="guide" style="display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--surf);border:1px solid var(--line);border-radius:12px;margin:6px 0 12px">
  <div style="font-size:.82rem;color:var(--text)"><b>Spotify Client ID</b>: ${LANG==="ru"?"укажите Client ID из дашборда Spotify:":"set Spotify Client ID for OAuth:"}</div>
  <div class="tokrow" style="padding:0;margin:0">
   <input id="sp-cid-keychain" type="text" placeholder="Spotify Client ID" value="${esc(SP_CLIENT_ID||"")}" autocomplete="off">
   <button class="btn" id="sp-cid-keychain-save">${t("tok.save")||"Сохранить"}</button>
  </div>
  <small style="color:var(--mute);font-size:.72rem">${LANG==="ru"?"Redirect URI в настройках приложения Spotify:":"Redirect URI in Spotify app settings:"} <code>http://localhost:8080/callback</code></small>
  <div class="grow" style="margin-top:4px">
   <button class="btn sm" data-open-url="https://developer.spotify.com/dashboard">${LANG==="ru"?"Открыть Spotify Dashboard":"Open Spotify Dashboard"}</button>
  </div>
 </div>`}
/* Where to get the Yandex token. The one-click flow (ymAcc) usually replaces
   this; the manual path stays for when the loopback page is unreachable. */
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
 const meta={
  adaptive:{name:LANG==="ru"?"Адаптивная (Обложка)":"Adaptive (Artwork)",c:"#b3a6e8",grad:"conic-gradient(from 210deg,#e3a3ae,#b3a6e8,#8db7dd,#9cc7a4,#dcc196,#e3a3ae)"},
  none:{name:LANG==="ru"?"Монохром":"Monochrome",c:"#9ca3af",grad:"#9ca3af"},
  violet:{name:LANG==="ru"?"Лаванда":"Lavender",c:"#b3a6e8",grad:"#b3a6e8"},
  indigo:{name:LANG==="ru"?"Барвинок":"Periwinkle",c:"#9ca8ec",grad:"#9ca8ec"},
  blue:{name:LANG==="ru"?"Небо":"Sky",c:"#8db7dd",grad:"#8db7dd"},
  cyan:{name:LANG==="ru"?"Туман":"Mist",c:"#8ccbd0",grad:"#8ccbd0"},
  teal:{name:LANG==="ru"?"Море":"Sea",c:"#7fbfb2",grad:"#7fbfb2"},
  emerald:{name:LANG==="ru"?"Шалфей":"Sage",c:"#9cc7a4",grad:"#9cc7a4"},
  amber:{name:LANG==="ru"?"Песок":"Sand",c:"#dcc196",grad:"#dcc196"},
  coral:{name:LANG==="ru"?"Персик":"Peach",c:"#e7ad92",grad:"#e7ad92"},
  rose:{name:LANG==="ru"?"Пудра":"Blush",c:"#e3a3ae",grad:"#e3a3ae"},
  pink:{name:LANG==="ru"?"Орхидея":"Orchid",c:"#d9a5cf",grad:"#d9a5cf"},
  custom:{name:LANG==="ru"?"Свой цвет":"Custom Color",c:S.customAccent||"#b3a6e8",grad:S.customAccent||"#b3a6e8"}
 };

 const cardHtml=(id,color,title,isCustom=false,isAdaptive=false)=>{
  const active=S.accent===id;
  const bg=isAdaptive?meta.adaptive.grad:color;
  return `
  <div class="palette-card" data-sw="${id}" aria-pressed="${active}" style="--card-accent:${color}">
   <div class="palette-card-head">
    <span class="palette-title">${esc(title)}</span>
    <span class="palette-check"><span class="material-symbols-rounded" style="font-size:14px">check</span></span>
   </div>
   <div class="mini-player-window">
    <div class="mpw-header">
     <span class="mpw-dot"></span><span class="mpw-dot"></span><span class="mpw-dot"></span>
    </div>
    <div class="mpw-body">
     <div class="mpw-art" style="background:${bg}">
      <span class="material-symbols-rounded" style="font-size:16px">music_note</span>
     </div>
     <div class="mpw-info">
      <div class="mpw-line-1"></div>
      <div class="mpw-line-2"></div>
     </div>
     <div class="mpw-btn" style="background:${color}">
      <span class="material-symbols-rounded" style="font-size:14px;margin-left:1px">play_arrow</span>
     </div>
    </div>
    <div class="mpw-bar">
     <div class="mpw-fill" style="background:${color}"></div>
    </div>
   </div>
   <div class="palette-tones-strip">
    <span class="tone-chip" style="background:${color}" title="Primary"></span>
    <span class="tone-chip" style="background:${color};opacity:.45" title="Container"></span>
    <span class="tone-chip" style="background:${color};opacity:.2" title="Surface Tint"></span>
    <span class="tone-chip" style="background:${color};filter:brightness(1.2)" title="Accent"></span>
   </div>
   ${isCustom?`<input type="color" class="palette-custom-input" id="accpick" value="${S.customAccent||"#b3a6e8"}" title="${t("acc.custom")}">`:""}
  </div>`;
 };

 let cards = [];
 cards.push(cardHtml("adaptive", meta.adaptive.c, meta.adaptive.name, false, true));
 ACCENTS.forEach(([id, c]) => {
  const m = meta[id] || { name: id, c };
  cards.push(cardHtml(id, m.c, m.name, false, false));
 });
 cards.push(cardHtml("custom", meta.custom.c, meta.custom.name, true, false));

 const html = cards.join("");
 const el1 = document.getElementById("accent"); if(el1) el1.innerHTML = html;
 const el2 = document.getElementById("obaccent"); if(el2) el2.innerHTML = html;
 [el1, el2].forEach(el => {
  if (el && !el._hasWheel) {
   el._hasWheel = true;
   el.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
     el.scrollLeft += e.deltaY;
     e.preventDefault();
    }
   }, { passive: false });
  }
 });
 icons();

 document.querySelectorAll("#accpick, .palette-custom-input").forEach(el=>{
  el.onclick=e=>e.stopPropagation();
  el.oninput=e=>applyCustomAccent(e.target.value);
  el.onchange=e=>{applyCustomAccent(e.target.value);renderSwatches();save();pushPrefs()};
 });
}

/* Port *and* token for the local stream proxy. Declared this early because
   cssUrlRaw routes remote covers through the relay, and cover rendering runs
   long before ensureStreamPort() would otherwise initialise these. Binding to
   127.0.0.1 alone is not access control — every request carries the token. */
let STREAM_PORT=null,STREAM_KEY="";
/* No neon (round 7). Every colour the app derives by itself — the cover
   accent, the wave's particles, the cover glow — passes through OKLCH with
   its chroma capped, so a green or magenta cover gives a calm tone of the
   same hue instead of a highlighter. A colour picked by hand stays as picked
   in the interface; only the particle field softens it. */
function oklchOf([r,g,b]){
 const lin=v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)};
 const R=lin(r),G=lin(g),B=lin(b);
 const l=Math.cbrt(.4122214708*R+.5363325363*G+.0514459929*B),
       m=Math.cbrt(.2119034982*R+.6806995451*G+.1073969566*B),
       s=Math.cbrt(.0883024619*R+.2817188376*G+.6299787005*B);
 const L=.2104542553*l+.793617785*m-.0040720468*s,
       A=1.9779984951*l-2.428592205*m+.4505937099*s,
       Bb=.0259040371*l+.7827717662*m-.808675766*s;
 return [L,Math.hypot(A,Bb),Math.atan2(Bb,A)]}
function oklchLin(L,C,H){
 const A=C*Math.cos(H),Bb=C*Math.sin(H);
 const l=(L+.3963377774*A+.2158037573*Bb)**3,m=(L-.1055613458*A-.0638541728*Bb)**3,s=(L-.0894841775*A-1.291485548*Bb)**3;
 return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s]}
/* calmRgb(rgb, maxChroma, lightness | [min,max]) → [r,g,b]. Chroma is
   reduced further until the colour fits sRGB, so the hue never skews. */
function calmRgb(rgb,maxC=.1,L=null){
 let [l,c,h]=oklchOf(rgb);
 if(Array.isArray(L))l=Math.max(L[0],Math.min(L[1],l));else if(L!=null)l=L;
 c=Math.min(c,maxC);
 let lin=oklchLin(l,c,h);
 for(let i=0;i<12&&lin.some(v=>v<-1e-4||v>1+1e-4);i++){c*=.82;lin=oklchLin(l,c,h)}
 return lin.map(v=>{v=Math.max(0,Math.min(1,v));v=v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055;return Math.round(v*255)})}
/* Text on accent-filled controls: dark on a light accent, white on a deep
   one. A fixed dark label left the light theme's cover accents (a mid green)
   with grey-on-green buttons. */
function setOnAccent(rgb,el){
 const st=(el||document.documentElement).style;
 if(!rgb){st.removeProperty("--on-acc");return}
 st.setProperty("--on-acc",oklchOf(rgb)[0]<.68?"oklch(100% 0 0)":"oklch(14% 0.015 280)")}
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
 setOnAccent([+r,+g,+b]);
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
/* The pinned profile song as other people's clients read it (prefs is the
   only per-user blob they can see): small, and only a real http cover. */
function prefsTrack(tr){
 if(!tr||!tr.t)return null;
 return {id:String(tr.id??""),s:tr.s||"",t:String(tr.t).slice(0,160),a:String(tr.a||"").slice(0,160),
  art:/^https?:\/\//i.test(tr.art||"")?String(tr.art).slice(0,400):null}}
function pushPrefs(){
 if(!sb||!sbUser)return;
 clearTimeout(prefsTimer);
 prefsTimer=setTimeout(async()=>{
  /* set_prefs replaces the whole blob: keys this build does not write are
     carried over, and the dislike list gives way first if the result would
     cross the 8000-character cap (the RPC refuses it outright). */
  const base={...(sbProfile?.prefs||{}),accent:S.accent,customAccent:S.customAccent,
   theme:S.theme,glow:S.glow,blur:S.blur,dens:S.dens,profile_track:prefsTrack(S.profileTrack),
   ...(typeof customPrefs==="function"?customPrefs():{})};
  let dis=Object.keys(S.dislikes||{}).slice(-200),p;
  for(;;){p={...base,dislikes:dis};if(JSON.stringify(p).length<=7800||!dis.length)break;dis=dis.slice(Math.ceil(dis.length/4))}
  try{const {error}=await sb.rpc("set_prefs",{p});if(error)throw error;if(sbProfile)sbProfile.prefs=p}
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
  let u=String(s??"").trim();
  if(!u)return "";
  if(u.startsWith("//"))u="https:"+u;
  if(!/^(https?:\/\/|data:image\/|blob:)/i.test(u))return "";
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
  :`style="--l1:${l1||"54%"};--l2:${l2||"22%"};background-image:linear-gradient(150deg,oklch(var(--l1) 0 0),oklch(var(--l2) 0 0))" data-fallback="1"`;
};
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
  <span class="src">${SVC_ICONS[tr.s]||""}<span class="src-txt">${esc(svc(tr.s).name)}</span></span><span class="dur">${fmt(tr.d)}</span>
  <button class="heart" data-fav="${esc(tr.id)}" data-svc="${esc(tr.s)}" aria-pressed="${!!tr.fav}" aria-label="fav"><span class="material-symbols-rounded" style="font-size:16px">favorite</span></button>
  ${removable?`<button class="heart rm" data-rmlocal="${esc(tr.id)}" aria-label="remove"><span class="material-symbols-rounded" style="font-size:16px">close</span></button>`:""}
  ${rmPid?`<button class="heart rm" data-rmpl="${esc(rmPid)}" data-rmtrack="${esc(tr.id)}" data-rmsvc="${esc(tr.s)}" aria-label="remove from playlist" title="${esc(t("plctx.rmtrack"))}"><span class="material-symbols-rounded" style="font-size:16px">close</span></button>`:""}</div>`}

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
   <button class="btn" id="artback"><span class="material-symbols-rounded" style="font-size:16px">arrow_back</span> ${t("lib.art")}</button>
   <b>${esc(a.name)}</b><span>${a.list.length} ${t("tracks")}</span>
   <button class="btn ${a.fav?"on":""}" id="artfav"><span class="material-symbols-rounded" style="font-size:16px">favorite</span> ${a.fav?t("art.unfollow"):t("art.follow")}</button>
   <button class="btn" id="artplay"><span class="material-symbols-rounded" style="font-size:16px">play_arrow</span> ${t("pl.playall")}</button></div>
   <div class="rows" data-listctx="art:${esc(a.name)}">`+a.list.map(x=>row(x)).join("")+`</div>`;
 document.getElementById("artback").onclick=()=>{artOpen=null;renderLib()};
 document.getElementById("artfav").onclick=()=>{toggleFavArtist(a.name);renderArtist(a.name)};
 document.getElementById("artplay").onclick=()=>{
  /* buildQueue fills the rest from the artist context; assigning `queue` by hand
     here is what used to make the panel and the playback order disagree. */
  setTrack(a.list[0],true,true,"art:"+a.name)};
 icons()}

/* Artist page from anywhere (full player, context menu). Someone who is not in
   the library yet gets a search for their name instead of an empty page. */
function openArtist(name){
 if(!name)return;
 const first=String(name).split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b)\s*/i)[0].trim()||name;
 const list=artistList();
 const hit=list.find(x=>x.name===name)||list.find(x=>x.name.toLowerCase()===first.toLowerCase());
 if(!hit){
  const q=document.getElementById("q");if(q)q.value=first;
  go("search");return}
 go("library");S.tab="art";artOpen=hit.name;
 document.querySelectorAll("#libtabs [data-tab]").forEach(x=>x.setAttribute("aria-selected",x.dataset.tab==="art"));
 renderArtist(hit.name)}
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
 if(!await askConfirm(t("dlg.loc.t"),t("loc.clear"),true,{icon:"folder_off",sub:t("dlg.loc.s")}))return;
 TRACKS=TRACKS.filter(x=>x.s!=="local");
 LOCAL_PATHS=[];
 save();renderLib();renderLocalInfo();renderWaveHint();
 toast(t("loc.cleared"))}
const empty=(ic,h,p)=>{
 const sym=window.m3Icons?.toSymbolName?window.m3Icons.toSymbolName(ic):ic;
 return `<div class="empty"><div class="empty-art"><img src="./icons/icon.png" class="empty-brand-icon" width="44" height="44" alt=""><div class="empty-sub-icon"><span class="material-symbols-rounded" style="font-size:20px">${sym}</span></div></div><h3>${h}</h3><p>${p}</p></div>`;
};
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
      <button class="btn" id="plback"><span class="material-symbols-rounded" style="font-size:16px">arrow_back</span> ${t("pl.back")}</button>
      <b>${esc(pl.name)}</b><span>${pl.tracks.length} ${t("tracks")}</span>
      ${pl.tracks.length?`<button class="btn" id="plplay"><span class="material-symbols-rounded" style="font-size:16px">play_arrow</span> ${t("pl.playall")}</button>`:""}
      ${pl.tracks.length?`<button class="btn" id="pldl"><span class="material-symbols-rounded" style="font-size:16px">download</span> ${t("pl.dl")}</button>`:""}
      <button class="btn danger" id="pldel"><span class="material-symbols-rounded" style="font-size:16px">delete</span> ${t("pl.del")}</button></div>`
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

  const mkBtn=`<button class="plc plnew" id="plnew"><span class="sq"><span class="material-symbols-rounded">add</span></span><b>${t("pl.new")}</b><span>${t("pl.new.s")}</span></button>
  <button class="plc plimport" id="plimport"><span class="sq"><span class="material-symbols-rounded">download</span></span><b>${t("import.btn")||"Импорт"}</b><span>Spotify, YTM, SC</span></button>`;
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
   const n=await askText(t("pl.new"),"",{icon:"playlist_add",label:t("dlg.name"),sub:t("dlg.newpl.s"),confirm:t("dlg.create"),required:true});if(n)newPlaylist(n)};
  document.getElementById("plimport")?.addEventListener("click",openImportModal)}
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
      <b>${esc(a.name)}</b><span>${a.list.length} ${t("tracks")}${a.fav?` · <span class="material-symbols-rounded" style="font-size:13px">favorite</span>`:""}</span></button>`).join("")+`</div>`
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
   <button class="btn" id="plback"><span class="material-symbols-rounded" style="font-size:16px">arrow_back</span> ${esc(g.a)}</button>
   <b>${esc(g.a)}</b><span>${g.list.length} ${t("tracks")}</span>
   <button class="btn" id="grpplay">${t("pl.playall")}</button></div>
  <div class="rows" data-listctx="grp:${i}">`+g.list.map(x=>row(x)).join("")+`</div>`;
 document.getElementById("plback").onclick=()=>renderLib();
 document.getElementById("grpplay").onclick=()=>setTrack(g.list[0],true,true,"grp:"+i);
 icons()}
let tok=0;
async function search(v,silent){
 const box=document.getElementById("sres"),cnt=document.getElementById("scount"),q=(v||"").trim().toLowerCase(),my=++tok;
 if(!q){
  cnt.textContent="";
  box.classList.remove("searching");
  /* search2.js: trending charts and recent searches. */
  if(window.MWSearch)return MWSearch.idle(box);
  box.innerHTML=empty("search",t("s.idle.t"),t("s.idle.s"));
  icons();
  return;
 }

 /* Debounce typing without destroying the DOM on every letter */
 await new Promise(r=>setTimeout(r,260));
 if(my!==tok)return;
 /* Artists, playlists and albums are fetched alongside the tracks. */
 const linkQ=/^https?:|spotify\.com\/|youtube\.com\/|youtu\.be\/|soundcloud\.com\//i.test(q);
 if(!linkQ)window.MWSearch?.start(q);

 const act=SERVICES.filter(s=>s.conn&&s.on&&!s.local);
 cnt.innerHTML=act.length?`<span class="search-spinner"></span>${t("s.ing")}: ${esc(act.map(s=>svc(s.id).name).join(", "))}`:t("s.nosvc");
 box.classList.add("searching");

 /* Local files resolve instantly */
 const localHits=SERVICES.find(s=>s.id==="local")?.on
  ?TRACKS.filter(x=>x.s==="local"&&(x.t+" "+x.a+" "+x.al).toLowerCase().includes(q))
  :[];

  /* Check for direct public URL imports pasted into the search box */
  let remote=[];
  if(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i.test(q)){
   cnt.innerHTML=`<span class="search-spinner"></span>Spotify: ${t("ly.load")||"..."}`;
   remote=await inv("spotify_public_playlist_tracks",{urlOrId:q}).catch(()=>[]);
  }else if(/music\.youtube\.com|youtube\.com\/playlist/i.test(q)){
   cnt.innerHTML=`<span class="search-spinner"></span>YouTube Music: ${t("ly.load")||"..."}`;
   remote=await inv("ytm_playlist_tracks",{urlOrId:q}).catch(()=>[]);
  }else if(/soundcloud\.com/i.test(q)){
   cnt.innerHTML=`<span class="search-spinner"></span>SoundCloud: ${t("ly.load")||"..."}`;
   remote=await inv("sc_playlist_tracks",{urlOrId:q}).catch(()=>[]);
  }else{
   remote=await searchRemote(q);
  }
 if(my!==tok)return;
 if(!linkQ&&window.MWSearch){await MWSearch.settle(q,700);if(my!==tok)return}

 const fresh=[];
 remote.forEach(x=>{
  const known=TRACKS.find(y=>String(y.id)===String(x.id)&&y.s===x.s);
  if(known){Object.assign(known,{...x,fav:known.fav});fresh.push(known)}
  else{TRACKS.push(x);fresh.push(x)}
 });

 const allHits=[...localHits,...fresh];
 SEARCH_HITS=allHits;
 box.classList.remove("searching");
 const found=allHits.length;
 cnt.textContent=`${t("s.found")}: ${found}`;
 if(!found){
  box.innerHTML=empty("circle-slash",t("s.none.t"),t("s.none.s"));
 }else{
  box.innerHTML=`<div class="rows" id="hits" data-listctx="search">${allHits.map(x=>row(x)).join("")}</div>`;
 }
 icons();
 if(!linkQ)window.MWSearch?.more(q,box,()=>my===tok);
}
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
   <button class="heart" data-fav="" data-svc="" aria-pressed="false" aria-label="fav" style="opacity:1"><span class="material-symbols-rounded" style="font-size:16px">favorite</span></button>
   <button class="ic npic" id="npadd" aria-label="playlist" title=""><span class="material-symbols-rounded" style="font-size:18px">playlist_add</span></button>
   <button class="ic npic npdis" id="npdislike" aria-label="dislike" title=""><span class="material-symbols-rounded" style="font-size:18px">thumb_down</span></button>
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
  if(u){b.art.style.backgroundImage=`url('${u}'),linear-gradient(150deg,oklch(var(--l1,54%) 0 0),oklch(var(--l2,22%) 0 0))`;b.art.style.setProperty("--l1",tr?.l1||"54%");b.art.style.setProperty("--l2",tr?.l2||"22%")}
  else{b.art.style.removeProperty("background-image");b.art.style.setProperty("--l1",tr?.l1||"54%");b.art.style.setProperty("--l2",tr?.l2||"22%")}
  b.lastArt=artKey}

 if(!empty){
  b.heart.dataset.fav=String(tr.id);b.heart.dataset.svc=tr.s;
  b.heart.setAttribute("aria-pressed",String(!!tr.fav));
  b.dis.setAttribute("aria-pressed",String(isDisliked(tr)))}

 const effectiveDur=(Number.isFinite(S.dur)&&S.dur>0)?S.dur:(tr?.d?+tr.d:0);
 dur.textContent=empty?"0:00":(effectiveDur>0?fmt(effectiveDur):"0:00");
 if(S.view==="profile")paintProfileTrack()}
function isExplicit(tr){
 if(!tr)return false;
 if(tr.exp||tr.explicit||tr.contentWarning==="explicit")return true;
 if(/\b(explicit|explicito|parental)\b|18\+/i.test(tr.al||"")||/\b(explicit)\b|18\+/i.test(tr.t||""))return true;
 return false}


function paint(){
 const effectiveDur=(Number.isFinite(S.dur)&&S.dur>0)?S.dur:(S.current?.d?+S.current.d:((A.audio?.duration>0&&Number.isFinite(A.audio.duration))?A.audio.duration:0));
 const p=(effectiveDur>0)?Math.min(100,Math.max(0,(S.pos/effectiveDur)*100)):0;
 const pStr=p.toFixed(2)+"%";
 const f=document.querySelector("#btrack .f");if(f){f.style.width=pStr;const h=document.querySelector("#btrack .h");if(h)h.style.left=pStr}
 const ff=document.querySelector("#fptrack .f");
 if(ff){ff.style.width=pStr;const fh=document.querySelector("#fptrack .h");if(fh)fh.style.setProperty("left",pStr)}
 const curFormatted=fmt(S.pos);
 const durFormatted=effectiveDur>0?fmt(effectiveDur):"0:00";
 const tcur=document.getElementById("tcur");if(tcur)tcur.textContent=curFormatted;
 const cur=document.getElementById("cur");if(cur)cur.textContent=curFormatted;
 const tdur=document.getElementById("tdur");if(tdur)tdur.textContent=durFormatted;
 const dur=document.getElementById("dur");if(dur)dur.textContent=durFormatted;
 const fpcur=document.getElementById("fpcur");if(fpcur)fpcur.textContent=curFormatted;
 const fpdur=document.getElementById("fpdur");if(fpdur)fpdur.textContent=durFormatted;
 const lcur=document.getElementById("lyric-cur-time");if(lcur)lcur.textContent=curFormatted;
 if((fp.dataset.open==="true"&&S.fpMode==="lyric")||document.getElementById("lyr"))syncLyrics()}
let queue=[];
/* Track key the full player last drew, so a re-render caused by a seek, a
   favourite toggle or a language switch does not replay the cover animation —
   only an actual change of song does. */
let fpLastKey=null;
/* ───────────── Spotify without Premium: the audio resolver ─────────────
   A Spotify track is metadata only; its sound comes from a free service.
   - Every candidate is scored on title similarity, artist match and duration
     (within 2-3 s is a strong sign of the same recording), with penalties for
     versions the original is not: live, remix, sped up, cover, karaoke…
   - Two queries run in parallel; the rest only if nothing scores well.
   - A confident winner is remembered per Spotify id for 30 days, so the next
     play starts at once, and the next Spotify track in the queue is resolved
     ahead of time.
   - The player's top island shows "Spotify -> source" and lets the user pick
     another candidate; that choice is pinned. */
const SPR={key:"mw.spr",map:null,alts:new Map(),inflight:new Map()};
function sprMap(){
 if(SPR.map)return SPR.map;
 try{SPR.map=new Map(JSON.parse(localStorage.getItem(SPR.key)||"[]"))}catch(_){SPR.map=new Map()}
 return SPR.map}
function sprSave(){clearTimeout(sprSave.t);sprSave.t=setTimeout(()=>{
 const m=sprMap(),now=Date.now();
 for(const [k,v] of m)if(!v.pin&&now-(v.at||0)>30*864e5)m.delete(k);
 while(m.size>3000)m.delete(m.keys().next().value);
 try{localStorage.setItem(SPR.key,JSON.stringify([...m]))}catch(_){}},1500)}
const SPR_STOP=new Set(["topic","vevo","official","audio","video","music","lyrics","lyric","hd","hq","4k","mv","clip","visualizer","the"]);
const sprTokens=s=>String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .replace(/\((?![^)]*\b(remix|live|acoustic|slowed|sped)\b)[^)]*\)|\[[^\]]*\]/g," ")
 .replace(/\b(feat|ft|featuring|prod)\b.*$/,"").replace(/[^\p{L}\p{N}]+/gu," ").trim().split(" ")
 .filter(w=>w&&!SPR_STOP.has(w));
function sprSim(a,b){
 const A=new Set(sprTokens(a)),B=new Set(sprTokens(b));if(!A.size||!B.size)return 0;
 let n=0;for(const w of A)if(B.has(w))n++;return 2*n/(A.size+B.size)}
const sprPrimary=a=>String(a||"").split(/[,;&\/]|\s+(?:feat\.?|ft\.?|featuring|x|и)\s+/i)[0].trim();
const SPR_VER=/\b(live|remix|sped\s*up|speed\s*up|slowed|nightcore|reverb|8d|cover|karaoke|instrumental|acoustic|demo|mashup|bass\s*boost(?:ed)?|lo-?fi|phonk\s*remix)\b/i;
function sprScore(tr,h){
 const d0=+tr.d||0,d=+h.d||0;
 const tSim=sprSim(tr.t,h.t);
 /* "Artist - Title" uploads put the artist into the title. */
 const aSim=Math.max(sprSim(tr.a,h.a),sprSim(sprPrimary(tr.a),h.a),
  sprTokens(sprPrimary(tr.a)).every(w=>sprTokens(h.t).includes(w))?.75:0);
 let sc=tSim*60+aSim*35;
 const want=(SPR_VER.exec(tr.t||"")||[])[1],got=(SPR_VER.exec(h.t||"")||[])[1];
 if(got&&!want)sc-=45;else if(want&&got&&want.toLowerCase()===got.toLowerCase())sc+=10;else if(want&&!got)sc-=15;
 if(d0>30&&d>0){
  const diff=Math.abs(d-d0);
  sc+=diff<=2?40:diff<=5?30:diff<=10?14:diff<=25?0:diff<=60?-20:-45;
  if(d<=35)sc-=80}
 sc+=h.s==="ytm"?6:h.s==="ym"?5:h.s==="sc"?-2:h.s==="dz"?-12:0;
 return Math.round(sc)}
const sprKey=tr=>"sp:"+String(tr?._spOrig?.id||tr?.id||"");
async function sprResolve(tr,force){
 const k=sprKey(tr);
 if(!force){const c=sprMap().get(k);if(c&&c.id&&c.s)return c}
 if(SPR.inflight.has(k))return SPR.inflight.get(k);
 const job=(async()=>{
  const clean=cleanMusicTitle(tr.a,tr.t);
  const qs=[clean.query,clean.altQuery,`${clean.primaryArtist} ${clean.t} audio`,clean.t]
   .filter((q,i,a)=>q&&a.indexOf(q)===i);
  const seen=new Map();
  const run=async list=>{
   const res=await Promise.all(list.map(q=>searchRemote(q).catch(()=>[])));
   for(const hits of res)for(const h of hits||[]){
    if(!h||!h.id||h.s==="sp"||h.s==="local")continue;
    const kk=h.s+":"+h.id;
    /* The strict matcher (MWM) decides "same song"; the loose score only
       ranks among those. A candidate MWM rejects needs an otherwise
       near-perfect loose score to be considered at all. */
    if(!seen.has(kk)){const m=MWM.of(tr,h);seen.set(kk,{...h,m,score:sprScore(tr,h)+(m!=null?25:-40)})}}};
  const ranked=()=>[...seen.values()].sort((a,b)=>b.score-a.score);
  await run(qs.slice(0,2));
  let best=ranked();
  if(!best.length||best[0].score<75){await run(qs.slice(2));best=ranked()}
  SPR.alts.set(k,best.slice(0,8));
  const top=best[0];if(!top)return null;
  /* "Not found" beats playing somebody else's song. */
  if(top.m==null&&top.score<60)return null;
  const rec={s:top.s,id:String(top.id),t:top.t,a:top.a,d:+top.d||0,score:top.score,at:Date.now()};
  if((top.m!=null&&top.score>=60)||top.score>=90){sprMap().set(k,rec);sprSave()}
  return rec})();
 SPR.inflight.set(k,job);
 try{return await job}finally{SPR.inflight.delete(k)}}
/* Resolve what plays next while this one plays, so the skip is instant. */
let sprPrefetchTimer=0;
function sprPrefetchNext(){
 clearTimeout(sprPrefetchTimer);
 sprPrefetchTimer=setTimeout(()=>{
  const nx=queue.slice(0,2).filter(x=>x&&x.s==="sp"&&!sprMap().has(sprKey(x)));
  nx.reduce((p,x)=>p.then(()=>sprResolve(x).catch(()=>null)),Promise.resolve())},4000)}
function sprPlay(tr,auto,resumePos){
 sprResolve(tr).then(rec=>{
  if(!sameTrack(tr,S.current))return;
  if(!rec){S.playing=false;sync();
   toast(LANG==="ru"?"Не нашли, откуда играть этот трек Spotify":"Could not find a playable source for this Spotify track");return}
  tr._resolvedSvc=rec.s;tr._resolvedId=rec.id;
  const copy={...tr,id:rec.id,s:rec.s,mode:"local",_resolved:true,_resolvedId:rec.id,_resolvedSvc:rec.s,_spOrig:{id:String(tr.id)}};
  delete copy._spAlt;
  load(copy,auto,resumePos);
  if(fp.dataset.open==="true")fpxIsland();
  sprPrefetchNext()}).catch(e=>{console.warn("[meowave] spotify resolve:",e);
  if(sameTrack(tr,S.current)){S.playing=false;sync();toast(t("load.err"))}})}
/* The island's "choose another source" list. */
async function spSourcePicker(btn){
 document.getElementById("src-pop")?.remove();
 const tr=S.current;if(!tr)return;
 const ru=LANG==="ru",k=sprKey(tr);
 const pop=document.createElement("div");pop.id="src-pop";pop.className="mw-pop mw-pop-wide";pop.setAttribute("role","menu");
 document.body.appendChild(pop);
 const place=()=>{const r=btn.getBoundingClientRect(),pw=pop.offsetWidth;
  pop.style.left=Math.max(8,Math.min(innerWidth-pw-8,r.left+r.width/2-pw/2))+"px";pop.style.top=(r.bottom+8)+"px"};
 const svcName=id=>SERVICES.find(s=>s.id===id)?.name||id;
 const paint=list=>{
  const cur=sprMap().get(k);
  pop.innerHTML=`<div class="mw-pop-h">${fpxI("graphic_eq",18)}<b>${ru?"Источник звука":"Audio source"}</b><span>${ru?"Spotify без подписки":"Spotify, no Premium"}</span></div>`
   +(list===null?`<div class="mw-pop-empty"><i class="fpx-dot pulse"></i>${ru?"Ищем варианты…":"Searching…"}</div>`
    :!list.length?`<div class="mw-pop-empty">${ru?"Ничего не нашлось":"Nothing found"}</div>`
    :list.map(h=>{const dd=(+h.d||0)&&(+tr.d||0)?Math.round(h.d-tr.d):null;
      const on=cur&&String(cur.id)===String(h.id)&&cur.s===h.s;
      return `<button role="menuitemradio" aria-checked="${!!on}" data-src="${esc(h.s)}|${esc(String(h.id))}">
       <span class="src-main"><b>${esc(h.t||"")}</b><small>${esc(h.a||"")} · ${esc(svcName(h.s))}${dd!=null?` · ${dd===0?"±0":(dd>0?"+":"")+dd} ${ru?"с":"s"}`:""}</small></span>
       <span class="src-score" title="${ru?"Совпадение":"Match"}"><i style="width:${Math.max(6,Math.min(100,h.score))}%"></i></span></button>`}).join(""))
   +`<button role="menuitem" data-src="again" class="mw-pop-foot">${fpxI("refresh",16)}${ru?"Искать заново":"Search again"}</button>`;
  place()};
 paint(SPR.alts.get(k)||null);
 pop.addEventListener("click",async e=>{
  const b=e.target.closest("[data-src]");if(!b)return;
  if(b.dataset.src==="again"){sprMap().delete(k);SPR.alts.delete(k);paint(null);await sprResolve(tr,true);paint(SPR.alts.get(k)||[]);return}
  const [s,id]=b.dataset.src.split("|");
  const h=(SPR.alts.get(k)||[]).find(x=>x.s===s&&String(x.id)===id);if(!h)return;
  sprMap().set(k,{s,id,t:h.t,a:h.a,d:+h.d||0,score:h.score,at:Date.now(),pin:true});sprSave();
  pop.remove();
  const pos=A.audio&&Number.isFinite(A.audio.currentTime)?A.audio.currentTime:S.pos;
  toast(ru?`Источник: ${svcName(s)}`:`Source: ${svcName(s)}`);
  load(S.current,S.playing,pos)});
 setTimeout(()=>{const off=e=>{if(!pop.contains(e.target)&&e.target!==btn&&!btn.contains(e.target)){pop.remove();document.removeEventListener("pointerdown",off,true)}};
  document.addEventListener("pointerdown",off,true)},0);
 if(!SPR.alts.has(k)){await sprResolve(tr,true);if(pop.isConnected)paint(SPR.alts.get(k)||[])}}

/* ───────────────────── listening comfort ─────────────────────
   Small things that make long listening pleasant, all on the Web Audio graph:
   - pause / play fade (no click, no hard cut);
   - soft transitions: the end of a track fades out, the next one fades in;
   - volume levelling: a slow per-track gain from the measured loudness,
     remembered per track so a replay starts at the right level;
   - a reverb send for the equaliser dock;
   - a sleep timer that fades out instead of cutting off. */
const fadeOk=()=>!!(A.ctx&&A.fade&&A.media);
function fadeTo(v,sec){
 if(!fadeOk())return;
 const g=A.fade.gain,t=A.ctx.currentTime;
 g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);
 if(sec<=0)g.setValueAtTime(v,t);else g.linearRampToValueAtTime(v,t+sec)}
let fadePauseTimer=0;
/* Fade first, pause after. A play pressed during the fade cancels it. */
function fadePause(au){
 clearTimeout(fadePauseTimer);
 if(!S.x.fadePP||!fadeOk()||au.paused){au.pause();return}
 fadeTo(0,.2);
 fadePauseTimer=setTimeout(()=>{if(!S.playing)au.pause()},210)}
function fadeResume(sec){
 clearTimeout(fadePauseTimer);
 if(!fadeOk())return;
 if(!S.x.fadePP&&!(sec>0.3)){fadeTo(1,0);return}
 if(A.fade.gain.value>.98&&!(sec>0.3))return;
 fadeTo(1,sec||.28)}
/* Soft transitions: called from timeupdate. */
const TRANS={gen:-1,out:false,inNext:false};
function transTick(pos,dur){
 const s=+S.x.trans||0;
 if(!s||!fadeOk()||!S.playing||S.repeat||!(dur>s*2+5))return;
 if(TRANS.gen!==A.gen){TRANS.gen=A.gen;TRANS.out=false}
 const left=dur-pos;
 if(!TRANS.out&&left<=s&&left>.3){TRANS.out=true;TRANS.inNext=true;fadeTo(.0001,left)}
 else if(TRANS.out&&left>s+1){TRANS.out=false;fadeTo(1,.3)}}
/* A new track starts: from silence after a soft ending, otherwise a short
   ramp so a skip does not click. */
function transStart(){
 if(!fadeOk())return;
 const s=+S.x.trans||0;
 if(TRANS.inNext&&s){TRANS.inNext=false;fadeTo(.0001,0);fadeTo(1,Math.min(4,Math.max(.8,s/2)));return}
 TRANS.inNext=false;
 fadeTo(1,S.x.fadePP?.12:0)}

/* Volume levelling. */
const NORM={key:"",db:null,n:0,timer:0,buf:null,map:null};
function normMap(){
 if(NORM.map)return NORM.map;
 try{NORM.map=new Map(JSON.parse(localStorage.getItem("mw.norm")||"[]"))}catch(_){NORM.map=new Map()}
 return NORM.map}
function normSaveSoon(){clearTimeout(normSaveSoon.t);normSaveSoon.t=setTimeout(()=>{
 const m=normMap();while(m.size>500)m.delete(m.keys().next().value);
 try{localStorage.setItem("mw.norm",JSON.stringify([...m]))}catch(_){}},4000)}
const NORM_TARGET=-15;
function normApply(sec){
 if(!A.ctx||!A.norm)return;
 let gdb=0;
 if(S.x.norm&&NORM.db!=null)gdb=Math.max(-12,Math.min(6,NORM_TARGET-NORM.db));
 A.norm.gain.setTargetAtTime(Math.pow(10,gdb/20),A.ctx.currentTime,sec??1.2);limRoute()}
function normTrack(tr){
 const k=trackKey(tr);if(NORM.key===k)return;
 NORM.key=k;NORM.n=0;
 const hit=normMap().get(k);NORM.db=hit??null;
 normApply(hit!=null?.05:.4)}
function normTick(){
 if(!S.x.norm||!A.lvl||!S.playing)return;
 normTrack(S.current);
 const a=A.lvl;if(!NORM.buf||NORM.buf.length!==a.fftSize)NORM.buf=new Float32Array(a.fftSize);
 a.getFloatTimeDomainData(NORM.buf);
 let e=0;for(let i=0;i<NORM.buf.length;i++)e+=NORM.buf[i]*NORM.buf[i];
 const db=10*Math.log10(e/NORM.buf.length+1e-12);
 /* Silence and fades say nothing about a track's loudness. */
 if(db<-45)return;
 NORM.n++;
 const k=NORM.n<40?.12:.02;
 NORM.db=NORM.db==null?db:NORM.db+(db-NORM.db)*k;
 normApply(NORM.n<40?.8:2.5);
 if(NORM.n%20===0){normMap().set(NORM.key,Math.round(NORM.db*10)/10);normSaveSoon()}}
function applyNorm(){
 clearInterval(NORM.timer);
 if(S.x.norm){NORM.timer=setInterval(normTick,250);NORM.key="";normTrack(S.current)}
 else if(A.norm&&A.ctx)A.norm.gain.setTargetAtTime(1,A.ctx.currentTime,.3)}

/* Reverb send: EQ output -> pre-delay -> convolver -> tone -> wet -> volume. */
const RV_ROOMS={room:{size:.9,tone:62,pre:8},hall:{size:2.4,tone:52,pre:22},church:{size:4.8,tone:40,pre:34},plate:{size:1.6,tone:80,pre:0}};
function reverbIR(ctx,sec,tone){
 /* Exponential decay (-60 dB at `sec`) of decorrelated noise per channel. A
    one-pole low-pass that closes over time darkens the tail the way air does;
    the convolver normalises the energy, so the size does not change loudness. */
 const sr=ctx.sampleRate,len=Math.max(1,Math.floor(sr*sec)),b=ctx.createBuffer(2,len,sr);
 const k60=6.9/sec,a0=.25+.7*tone/100,a1=a0*.25,ramp=Math.floor(sr*.004);
 for(let c=0;c<2;c++){const d=b.getChannelData(c);let y=0;
  for(let i=0;i<len;i++){const t=i/sr,a=a0+(a1-a0)*(t/sec);
   y+=a*((Math.random()*2-1)*Math.exp(-k60*t)-y);
   d[i]=i<ramp?y*i/ramp:y}}
 return b}
function applyReverb(){
 if(!A.ctx||!A.out)return;
 const R=S.x,ctx=A.ctx;
 if(!A.rvIn){
  A.rvIn=ctx.createGain();A.rvPre=ctx.createDelay(.2);A.rvConv=ctx.createConvolver();
  A.rvTone=ctx.createBiquadFilter();A.rvTone.type="lowpass";A.rvOut=ctx.createGain();
  A.rvIn.connect(A.rvPre);A.rvPre.connect(A.rvConv);A.rvConv.connect(A.rvTone);A.rvTone.connect(A.rvOut);A.rvOut.connect(A.gain);
  A.rvLinked=false;A.rvSig=""}
 const on=!!R.rvOn&&R.rvMix>0;
 if(on&&!A.rvLinked){A.out.connect(A.rvIn);A.rvLinked=true}
 const sig=`${R.rvSize}|${R.rvTone}`;
 if(on&&A.rvSig!==sig){A.rvSig=sig;A.rvConv.buffer=reverbIR(ctx,Math.max(.3,R.rvSize),R.rvTone)}
 const t=ctx.currentTime,mix=Math.max(0,Math.min(1,R.rvMix/100));
 A.rvPre.delayTime.setTargetAtTime((R.rvPre||0)/1000,t,.05);
 A.rvTone.frequency.setTargetAtTime(1800+R.rvTone*140,t,.05);
 A.rvOut.gain.setTargetAtTime(on?mix*1.15:0,t,.08);limRoute();
 if(!on&&A.rvLinked){setTimeout(()=>{if(!(S.x.rvOn&&S.x.rvMix>0)&&A.rvLinked){try{A.out.disconnect(A.rvIn)}catch(_){}A.rvLinked=false}},400)}}
function paintReverb(){
 const R=S.x,on=id=>document.getElementById(id);
 const sw=on("rv-sw");if(sw){sw.setAttribute("aria-pressed",String(!!R.rvOn));sw.classList.toggle("on",!!R.rvOn)}
 const box=on("dock-rv");if(box)box.dataset.on=String(!!R.rvOn);
 const m=on("rv-mix");if(m){m.value=R.rvMix;on("rv-mix-v").textContent=R.rvMix+"%";paintRange(m)}
 const z=on("rv-size");if(z){z.value=Math.round(R.rvSize*10);on("rv-size-v").textContent=R.rvSize.toFixed(1)+(LANG==="ru"?" с":" s");paintRange(z)}
 const tn=on("rv-tone");if(tn){tn.value=R.rvTone;on("rv-tone-v").textContent=R.rvTone<35?(LANG==="ru"?"тёмный":"dark"):R.rvTone>70?(LANG==="ru"?"яркий":"bright"):(LANG==="ru"?"тёплый":"warm");paintRange(tn)}
 document.querySelectorAll("#rv-rooms [data-rv]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.rv===R.rvRoom)))}
function initReverbUI(){
 const on=id=>document.getElementById(id);
 const upd=()=>{initAudio();applyReverb();paintReverb();save()};
 on("rv-sw")?.addEventListener("click",()=>{S.x.rvOn=!S.x.rvOn;upd()});
 on("rv-mix")?.addEventListener("input",e=>{S.x.rvMix=+e.target.value;if(!S.x.rvOn&&S.x.rvMix>0)S.x.rvOn=true;upd()});
 on("rv-size")?.addEventListener("input",e=>{S.x.rvSize=+e.target.value/10;S.x.rvRoom="";upd()});
 on("rv-tone")?.addEventListener("input",e=>{S.x.rvTone=+e.target.value;S.x.rvRoom="";upd()});
 on("rv-rooms")?.addEventListener("click",e=>{const b=e.target.closest("[data-rv]");if(!b)return;
  const p=RV_ROOMS[b.dataset.rv];if(!p)return;
  Object.assign(S.x,{rvRoom:b.dataset.rv,rvSize:p.size,rvTone:p.tone,rvPre:p.pre,rvOn:true});upd()});
 paintReverb()}

/* Sleep timer. */
const SLEEP={at:0,eot:false,tick:0,fading:false};
function sleepLeftText(){
 if(SLEEP.eot)return LANG==="ru"?"после трека":"after this track";
 return fmt(Math.max(0,(SLEEP.at-Date.now())/1000))}
function sleepPaint(){
 const on=!!(SLEEP.at||SLEEP.eot);
 document.querySelectorAll("#fp-sleep-btn").forEach(b=>{b.setAttribute("aria-pressed",String(on));b.title=on?`${t("sleep.t")}: ${sleepLeftText()}`:t("sleep.t")});
 const left=document.getElementById("fpx-sleep-left");if(left)left.textContent=sleepLeftText();
 const v=document.getElementById("lc-sleep-v");if(v)v.textContent=on?`${t("sleep.left")}: ${sleepLeftText()}`:t("sleep.off");
 document.querySelectorAll("#lc-sleep [data-sleep]").forEach(b=>b.setAttribute("aria-pressed",String(
  b.dataset.sleep==="off"?!on:b.dataset.sleep==="track"?SLEEP.eot:(SLEEP.at&&+b.dataset.sleep===SLEEP.min))))}
function sleepFire(){
 const au=A.audio;
 SLEEP.at=0;SLEEP.eot=false;SLEEP.fading=false;clearInterval(SLEEP.tick);
 if(S.playing){S.playing=false;if(au)au.pause();sync()}
 setTimeout(()=>fadeTo(1,0),300);
 toast(LANG==="ru"?"Таймер сна: музыка остановлена. Спокойной ночи":"Sleep timer: playback stopped. Good night");
 sleepPaint();if(fp.dataset.open==="true")fpxIsland()}
function sleepSet(v){
 clearInterval(SLEEP.tick);SLEEP.at=0;SLEEP.eot=false;SLEEP.min=0;
 if(SLEEP.fading){SLEEP.fading=false;fadeTo(1,.4)}
 if(v==="track")SLEEP.eot=true;
 else if(+v>0){SLEEP.min=+v;SLEEP.at=Date.now()+v*60000}
 if(SLEEP.at||SLEEP.eot){
  SLEEP.tick=setInterval(()=>{
   if(SLEEP.at){const left=(SLEEP.at-Date.now())/1000;
    if(left<=12&&!SLEEP.fading&&S.playing){SLEEP.fading=true;fadeTo(.0001,Math.max(.5,left))}
    if(left<=0){sleepFire();return}}
   else if(SLEEP.eot&&S.playing){const dur=S.dur||0,pos=A.audio?.currentTime||S.pos;
    if(dur>20&&dur-pos<=8&&!SLEEP.fading){SLEEP.fading=true;fadeTo(.0001,Math.max(.5,dur-pos-.2))}}
   sleepPaint()},1000);
  toast(LANG==="ru"?(SLEEP.eot?"Остановлю после этого трека":`Таймер сна: ${v} мин`):(SLEEP.eot?"Stopping after this track":`Sleep timer: ${v} min`))}
 sleepPaint();if(fp.dataset.open==="true")fpxIsland()}
/* Called by the end-of-track handler; true means "stop here". */
function sleepAtTrackEnd(){if(!SLEEP.eot)return false;sleepFire();return true}
function sleepMenu(btn){
 document.getElementById("sleep-pop")?.remove();
 const ru=LANG==="ru",on=!!(SLEEP.at||SLEEP.eot);
 const opts=[["15",ru?"15 минут":"15 minutes"],["30",ru?"30 минут":"30 minutes"],["45",ru?"45 минут":"45 minutes"],["60",ru?"1 час":"1 hour"],["90",ru?"1,5 часа":"1.5 hours"],["track",ru?"После этого трека":"After this track"]];
 const pop=document.createElement("div");pop.id="sleep-pop";pop.className="mw-pop";pop.setAttribute("role","menu");
 pop.innerHTML=`<div class="mw-pop-h">${fpxI("bedtime",18)}<b>${esc(t("sleep.t"))}</b>${on?`<span>${esc(sleepLeftText())}</span>`:""}</div>`
  +opts.map(([v,l])=>`<button role="menuitemradio" data-sleep="${v}" aria-checked="${v==="track"?SLEEP.eot:(SLEEP.at&&+v===SLEEP.min)}">${esc(l)}</button>`).join("")
  +(on?`<button role="menuitem" data-sleep="off" class="danger">${esc(ru?"Выключить таймер":"Turn off")}</button>`:"");
 document.body.appendChild(pop);
 const r=btn.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight;
 pop.style.left=Math.max(8,Math.min(innerWidth-pw-8,r.left+r.width/2-pw/2))+"px";
 pop.style.top=(r.bottom+8+ph>innerHeight?Math.max(8,r.top-ph-8):r.bottom+8)+"px";
 pop.addEventListener("click",e=>{const b=e.target.closest("[data-sleep]");if(!b)return;
  sleepSet(b.dataset.sleep==="off"?0:b.dataset.sleep);pop.remove()});
 setTimeout(()=>{const off=e=>{if(!pop.contains(e.target)){pop.remove();document.removeEventListener("pointerdown",off,true)}};
  document.addEventListener("pointerdown",off,true)},0)}
function initComfortUI(){
 const on=id=>document.getElementById(id);
 const sw=(id,key,after)=>{const b=on(id);if(!b)return;
  const paint=()=>{b.setAttribute("aria-pressed",String(!!S.x[key]));b.classList.toggle("on",!!S.x[key])};
  b.addEventListener("click",()=>{S.x[key]=!S.x[key];paint();after?.();save()});paint()};
 sw("lc-fade","fadePP");
 sw("lc-norm","norm",()=>{initAudio();applyNorm()});
 sw("dock-norm","norm",()=>{initAudio();applyNorm();const o=on("lc-norm");if(o){o.setAttribute("aria-pressed",String(!!S.x.norm));o.classList.toggle("on",!!S.x.norm)}});
 const tr=on("lc-trans");
 const trTxt=()=>{const v=on("lc-trans-v");if(v)v.textContent=S.x.trans>0?`${S.x.trans} ${LANG==="ru"?"с":"s"}`:t("sleep.off")};
 if(tr){tr.value=S.x.trans||0;trTxt();tr.addEventListener("input",()=>{S.x.trans=+tr.value;trTxt();paintRange(tr);save()})}
 on("lc-sleep")?.addEventListener("click",e=>{const b=e.target.closest("[data-sleep]");if(!b)return;sleepSet(b.dataset.sleep==="off"?0:b.dataset.sleep)});
 sleepPaint()}

/* ═══════════════════════════ full player ═══════════════════════════

   One shell, built once and then updated in place.
   - A track change crossfades the cover between two layers and slides the
     title; nothing else is rebuilt, so there is no flash, the lyrics keep their
     scroll position until the new ones arrive, and focus is not lost.
   - A layout change (stage <-> side pane with lyrics or the queue) moves the
     cover on its spring (fx.js) and glides the controls from where they were,
     instead of tearing the DOM down and jumping.
   - The play button is an MD3 Expressive shape: a circle while paused that
     morphs into a rounded square while playing, and the glyph morphs between
     play and pause point by point.
   - Everything inside uses the player font (Settings -> font), not only the
     lyrics. */
const FPX={key:null,lySig:"",art:null,morphT:-1,morphRaf:0,titleKey:""};
const fpxI=(n,sz)=>`<span class="material-symbols-rounded" aria-hidden="true"${sz?` style="font-size:${sz}px"`:""}>${n}</span>`;
/* Both glyphs are two quads; the play triangle is split down the middle (the
   halves overlap a little so no seam shows while anti-aliased). */
const FPX_PLAY=[[8,5],[13.9,8.76],[13.9,15.24],[8,19],[13.4,8.44],[19,12],[19,12],[13.4,15.56]];
const FPX_PAUSE=[[6.5,5],[10.2,5],[10.2,19],[6.5,19],[13.8,5],[17.5,5],[17.5,19],[13.8,19]];
function fpxPP(t){
 const P=FPX_PLAY.map((p,i)=>[p[0]+(FPX_PAUSE[i][0]-p[0])*t,p[1]+(FPX_PAUSE[i][1]-p[1])*t]);
 const q=a=>"M"+a.map(p=>p[0].toFixed(2)+" "+p[1].toFixed(2)).join("L")+"Z";
 return q(P.slice(0,4))+q(P.slice(4))}
function fpxMorph(playing,instant){
 const path=document.getElementById("fpx-pp");if(!path)return;
 const to=playing?1:0;
 cancelAnimationFrame(FPX.morphRaf);
 if(instant||RM||FPX.morphT<0||!path.getAttribute("d")){FPX.morphT=to;path.setAttribute("d",fpxPP(to));return}
 if(FPX.morphT===to)return;
 const from=FPX.morphT,t0=performance.now(),dur=300;
 const ease=x=>1-Math.pow(1-x,3);
 const step=now=>{const k=Math.min(1,(now-t0)/dur);FPX.morphT=from+(to-from)*ease(k);
  path.setAttribute("d",fpxPP(FPX.morphT));if(k<1)FPX.morphRaf=requestAnimationFrame(step)};
 FPX.morphRaf=requestAnimationFrame(step)}

function fpxShell(fpc){
 const ru=LANG==="ru";
 fpc.innerHTML=`
 <div class="fpx" data-layout="stage" data-pane="lyrics">
  <div class="fpx-frame" aria-hidden="true"></div>
  <div class="fpx-top">
   <div class="fpx-notch">
    <button class="fpx-ib" id="fpclose" title="${esc(t("fpx.close"))}" aria-label="${esc(t("fpx.close"))}">${fpxI("keyboard_arrow_down",24)}</button>
   </div>
   <button class="fpx-notch fpx-island" id="fpx-island" type="button" aria-live="polite"></button>
   <div class="fpx-notch">
    <button class="fpx-ib" id="fp-sleep-btn" title="${esc(t("sleep.t"))}" aria-label="${esc(t("sleep.t"))}">${fpxI("bedtime",19)}</button>
    <button class="fpx-ib" id="fp-sp-btn" title="${ru?"3D-звук":"3D audio"}" aria-label="3D audio">${fpxI("spatial_audio",19)}</button>
    <button class="fpx-ib" id="fp-eq-btn" title="${ru?"Эквалайзер и эффекты":"Equalizer & effects"}" aria-label="Equalizer">${fpxI("equalizer",19)}</button>
    <button class="fpx-ib" id="fp-fullscreen-toggle" title="${ru?"На весь экран (F11)":"Fullscreen (F11)"}" aria-label="fullscreen">${fpxI("fullscreen",20)}</button>
    <button class="fpx-ib" id="fp-settings-btn" title="${esc(t("fp.set.t"))}" aria-label="settings">${fpxI("tune",19)}</button>
   </div>
  </div>
  <div class="fpx-body">
   <section class="fpx-player">
    <div class="fpx-art"><div class="fpx-cover" id="fpx-cover" role="button" tabindex="0" aria-label="${esc(t("lyrics"))}"></div></div>
    <div class="fpx-panel">
     <div class="fpx-meta">
      <div class="fpx-titles">
       <h2 class="fpx-title"><span class="fpx-tt"></span><span class="fpx-exp" hidden title="Explicit">E</span></h2>
       <button class="fpx-artist" id="fpx-artist" type="button"></button>
      </div>
      <button class="fpx-like" id="fpx-like" data-fav="" data-svc="" aria-pressed="false" title="${esc(t("act.fav"))}" aria-label="${esc(t("act.fav"))}">${fpxI("favorite",22)}</button>
      <button class="fpx-ib fpx-more" id="fpx-more" title="${ru?"Ещё":"More"}" aria-label="${ru?"Ещё":"More"}">${fpxI("more_horiz",22)}</button>
     </div>
     <div class="fpx-seek">
      <div class="track" id="fptrack"></div>
      <div class="fpx-times"><span class="t" id="fpcur">0:00</span><span class="t" id="fpdur">0:00</span></div>
     </div>
     <div class="fpx-transport">
      <button class="fpx-tb fpx-tb-sm" data-act="shuffle" aria-pressed="false" title="${esc(t("np.shuffle"))}">${fpxI("shuffle",22)}</button>
      <button class="fpx-tb" data-act="prev" title="${esc(t("np.prev"))}">${fpxI("skip_previous",32)}</button>
      <button class="fpx-play" data-act="play" title="${esc(t("np.play"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path id="fpx-pp"/></svg></button>
      <button class="fpx-tb" data-act="next" title="${esc(t("np.next"))}">${fpxI("skip_next",32)}</button>
      <button class="fpx-tb fpx-tb-sm" data-act="repeat" aria-pressed="false" title="${esc(t("np.repeat"))}">${fpxI("repeat",22)}</button>
     </div>
     <div class="fpx-extras">
      <div class="fpx-vol">
       <button class="fpx-ib" id="fpx-mute" aria-label="volume">${fpxI("volume_up",20)}</button>
       <input type="range" id="fpx-vol" min="0" max="100" value="80" aria-label="volume">
      </div>
      <div class="fpx-toggles">
       <button class="fpx-ib" id="fp-mode" aria-pressed="false" title="${esc(t("lyrics"))} (L)" aria-label="${esc(t("lyrics"))}">${fpxI("lyrics",20)}</button>
       <button class="fpx-ib" id="fpx-queue-btn" aria-pressed="false" title="${esc(t("queue"))}" aria-label="${esc(t("queue"))}">${fpxI("queue_music",20)}</button>
      </div>
     </div>
    </div>
   </section>
   <section class="fpx-side">
    <div class="lyr lyr-big" id="fplyr" data-synced="true"></div>
    <div class="fpx-queue" id="fpq"></div>
   </section>
  </div>
 </div>`;
 FPX.art=null;FPX.lySig="";FPX.titleKey="";FPX.morphT=-1;
 const on=(id,fn)=>document.getElementById(id)?.addEventListener("click",fn);
 const toggleLyrics=()=>{
  const want=!(S.fpMode==="lyric"&&S.x.fpPane!=="queue");
  S.fpMode=want?"lyric":"stage";S.x.fpPane="lyrics";save();renderFP();
  const tr=S.current,L=lyricsFor(tr);
  if(want&&tr&&L&&L.state==="done"&&!L.lines?.length)searchGeniusPrompt(tr)};
 on("fp-mode",toggleLyrics);
 on("fpx-cover",toggleLyrics);
 document.getElementById("fpx-cover")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();toggleLyrics()}});
 on("fpx-queue-btn",()=>{
  const want=!(S.fpMode==="lyric"&&S.x.fpPane==="queue");
  S.fpMode=want?"lyric":"stage";S.x.fpPane="queue";save();renderFP()});
 on("fp-fullscreen-toggle",toggleAppFullscreen);
 on("fp-sp-btn",()=>{
  initAudio();S.sp.on=!S.sp.on;applySpatial();save();updateSpButtons();
  toast(S.sp.on?(ru?"3D-звук включён":"3D audio on"):(ru?"3D-звук выключен":"3D audio off"))});
 on("fp-eq-btn",e=>{e.stopPropagation();openDockSheet(true)});
 on("fp-sleep-btn",e=>{e.stopPropagation();sleepMenu(e.currentTarget)});
 on("fpx-mute",()=>document.getElementById("mute")?.click());
 on("fpx-artist",()=>{
  const tr=S.current;if(!tr||tr.mode==="empty"||!tr.a)return;
  closeFP();openArtist(tr.a)});
 on("fpx-more",e=>{
  e.stopPropagation();const tr=S.current;if(!tr||tr.mode==="empty")return;
  const r=e.currentTarget.getBoundingClientRect();openCtx(r.left,r.bottom+6,tr)});
 on("fpx-island",e=>{
  e.stopPropagation();
  const tr=S.current;if(!tr)return;
  if(tr._spOrig||tr.s==="sp")spSourcePicker(e.currentTarget);
  else if(S.fpMode!=="lyric"){S.fpMode="lyric";S.x.fpPane="lyrics";save();renderFP()}});
 const vol=document.getElementById("fpx-vol");
 if(vol){vol.addEventListener("input",()=>{if(S.muted)S.muted=false;setVolume(+vol.value/100);save()});
  vol.addEventListener("wheel",e=>{e.preventDefault();if(S.muted)S.muted=false;setVolume(S.vol+(e.deltaY<0?.05:-.05));save()},{passive:false})}
 wireSeek("fptrack");
 fpxVolume();
 icons()}

function fpxVolume(){
 const v=document.getElementById("fpx-vol");
 if(v){v.value=Math.round((S.muted?0:S.vol)*100);paintRange(v)}
 const m=document.getElementById("fpx-mute");
 if(m){const n=(S.muted||S.vol===0)?"volume_off":(S.vol<0.5?"volume_down":"volume_up");
  const s=m.querySelector(".material-symbols-rounded");if(s&&s.textContent!==n)s.textContent=n;
  m.setAttribute("aria-pressed",String(!!S.muted))}}

/* The cover: the new sleeve is decoded first, then faded in over the old one,
   which leaves once the new one is fully opaque — no black frame between. */
function fpxArt(tr,animate){
 const box=document.getElementById("fpx-cover");if(!box)return;
 const u=cssUrlRaw(tr?.art)||"";
 const sig=u+"|"+(tr?.l1||"")+"|"+(tr?.l2||"");
 if(sig===FPX.art&&box.firstElementChild)return;
 FPX.art=sig;
 const lay=document.createElement("div");lay.className="fpx-img";
 lay.style.setProperty("--l1",tr?.l1||"54%");lay.style.setProperty("--l2",tr?.l2||"22%");
 const put=ok=>{
  if(FPX.art!==sig)return;
  if(ok&&u)lay.style.backgroundImage=`url("${u.replace(/"/g,"%22")}")`;
  else lay.dataset.fallback="1";
  const olds=[...box.children];
  if(animate&&olds.length&&!RM){lay.classList.add("in");
   setTimeout(()=>olds.forEach(o=>o.remove()),460)}
  else olds.forEach(o=>o.remove());
  box.appendChild(lay)};
 if(!u){put(false);return}
 const im=new Image();im.decoding="async";
 im.onload=()=>put(true);im.onerror=()=>put(false);im.src=u}

function fpxTitle(tr,animate){
 const x=document.querySelector("#fpc .fpx-titles");if(!x)return;
 const title=tr?.t||"",artist=tr?.a||"—";
 const k=title+"\u0001"+artist;
 const tt=x.querySelector(".fpx-tt"),ar=x.querySelector(".fpx-artist"),ex=x.querySelector(".fpx-exp");
 if(k!==FPX.titleKey){
  FPX.titleKey=k;
  tt.textContent=title;ar.textContent=artist;
  ar.title=artist;tt.parentElement.title=title;
  if(animate&&!RM&&x.animate){
   x.animate([{opacity:0,transform:"translateY(12px)",filter:"blur(6px)"},{opacity:1,transform:"none",filter:"blur(0)"}],
    {duration:460,easing:"cubic-bezier(.22,1,.36,1)"})}}
 if(ex)ex.hidden=!isExplicit(tr)}

/* Top centre island: where the sound comes from and what the lyrics are. */
function fpxIsland(){
 const el=document.getElementById("fpx-island");if(!el)return;
 const ru=LANG==="ru",tr=S.current;
 if(!tr||tr.mode==="empty"){el.hidden=true;return}
 const L=lyricsFor(tr);
 const svcName=id=>id==="local"?(ru?"Файл":"File"):(SERVICES.find(s=>s.id===id)?.name||id||"");
 let src="";
 if(tr._spOrig||(tr.s==="sp")){src=`<b class="fpx-is-sp">Spotify</b>${fpxI("arrow_right_alt",16)}<span>${esc(svcName(tr._spOrig?tr.s:(tr._resolvedSvc||"…")))}</span>`}
 else src=`<span>${esc(svcName(tr.s))}</span>`;
 let ly="";
 if(L){
  if(L.state==="loading"||L.state==="idle")ly=`<i class="fpx-dot pulse"></i><span>${ru?"Ищем текст…":"Finding lyrics…"}</span>`;
  else if(L.state==="transcribing")ly=`<i class="fpx-dot pulse"></i><span>${ru?"Распознаём текст…":"Transcribing…"}</span>`;
  else if(L.state==="error")ly=`<i class="fpx-dot bad"></i><span>${ru?"Текст недоступен":"Lyrics unavailable"}</span>`;
  else if(L.lines?.length){
   const prov={lrclib:"LRCLIB",genius:"Genius",ytm:"YouTube Music",ai:"Whisper",custom:ru?"свой":"custom"}[L.source]||"";
   ly=`<i class="fpx-dot ${L.synced?"ok":""}"></i><span>${L.synced?(ru?"Синхронный текст":"Synced lyrics"):(ru?"Текст без таймингов":"Unsynced lyrics")}${prov?` · ${esc(prov)}`:""}</span>`}
  else ly=`<i class="fpx-dot"></i><span>${ru?"Текст не найден":"No lyrics"}</span>`}
 const sl=SLEEP.at?`<span class="fpx-is-sep"></span>${fpxI("bedtime",15)}<span id="fpx-sleep-left">${sleepLeftText()}</span>`:"";
 document.getElementById("fp-sleep-btn")?.setAttribute("aria-pressed",String(!!(SLEEP.at||SLEEP.eot)));
 const html=`${src}${ly?`<span class="fpx-is-sep"></span>${ly}`:""}${sl}`;
 if(el.dataset.html!==html){el.dataset.html=html;el.innerHTML=html}
 el.hidden=false;
 el.dataset.click=(tr._spOrig||tr.s==="sp")?"source":"lyrics";
 el.title=(tr._spOrig||tr.s==="sp")?(ru?"Выбрать другой источник звука":"Choose another audio source"):""}

/* What the lyric sheet was last drawn from; it is redrawn only when this
   changes, so a pause, a seek or a favourite does not reset it. */
function fpxLySig(tr){
 const L=lyricsFor(tr);
 return trackKey(tr)+"|"+(L?`${L.state}|${L.source||""}|${L.synced?1:0}|${L.lines?.length||0}|${L.lines?.[0]?.text||""}`:"none")}

function fpxLayout(animate){
 const x=document.querySelector("#fpc .fpx");if(!x)return;
 const layout=S.fpMode==="lyric"?"lyrics":"stage";
 const pane=S.x.fpPane==="queue"?"queue":"lyrics";
 document.getElementById("fp-mode")?.setAttribute("aria-pressed",String(layout==="lyrics"&&pane==="lyrics"));
 document.getElementById("fpx-queue-btn")?.setAttribute("aria-pressed",String(layout==="lyrics"&&pane==="queue"));
 const changed=x.dataset.layout!==layout;
 if(!changed&&x.dataset.pane===pane)return false;
 const panel=x.querySelector(".fpx-panel");
 const before=animate&&changed&&!RM?{cover:window.MWFX?.cover.rect(),panel:panel?.getBoundingClientRect()}:null;
 x.dataset.layout=layout;x.dataset.pane=pane;
 if(before){
  if(before.cover)window.MWFX?.cover.flyFrom(before.cover,{k:200,c:21});
  const now=panel?.getBoundingClientRect();
  if(now&&before.panel&&panel.animate){
   const dx=before.panel.left-now.left,dy=before.panel.top-now.top;
   if(Math.abs(dx)+Math.abs(dy)>1)panel.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:"none"}],
    {duration:620,easing:"cubic-bezier(.22,1,.36,1)"})}}
 return true}

function fpxSide(force){
 const x=document.querySelector("#fpc .fpx");if(!x||x.dataset.layout!=="lyrics")return;
 if(x.dataset.pane==="queue"){renderFPBody();return}
 const sig=fpxLySig(S.current);
 if(force||sig!==FPX.lySig){FPX.lySig=sig;renderLyricSheet()}}

function renderFP(){
 const tr=S.current;
 const key=trackKey(tr);
 const swapped=FPX.key!==null&&FPX.key!==key;
 FPX.key=key;fpLastKey=key;
 const L=lyricsFor(tr);
 if(tr&&tr.mode!=="empty"&&(!L||L.state==="idle"))fetchLyrics(tr);
 const fpc=document.getElementById("fpc");if(!fpc)return;
 let built=false;
 if(!fpc.querySelector(":scope>.fpx")){fpxShell(fpc);built=true}
 const fpOpen=fp.dataset.open==="true";
 const u=cssUrlRaw(tr?.art);
 const fpbg=document.getElementById("fpbg");
 if(fpbg){
  const want=u?`url("${u.replace(/"/g,"%22")}")`:"";
  if(fpbg.dataset.u!==want){fpbg.dataset.u=want;fpbg.style.backgroundImage=want;fpbg.style.display=u?"":"none"}}
 window.MWFX?.flow.setCover(u||"");
 const layoutChanged=fpxLayout(!built&&fpOpen);
 fpxArt(tr,swapped&&fpOpen);
 fpxTitle(tr,swapped&&fpOpen);
 const like=document.getElementById("fpx-like");
 if(like){like.dataset.fav=String(tr?.id??"");like.dataset.svc=tr?.s||"";like.setAttribute("aria-pressed",String(!!tr?.fav))}
 document.querySelectorAll('#fpc [data-act="shuffle"]').forEach(b=>b.setAttribute("aria-pressed",String(!!S.shuffle)));
 document.querySelectorAll('#fpc [data-act="repeat"]').forEach(b=>b.setAttribute("aria-pressed",String(!!S.repeat)));
 const effectiveDur=(Number.isFinite(S.dur)&&S.dur>0)?S.dur:(tr?.d||0);
 const cur=document.getElementById("fpcur");if(cur)cur.textContent=fmt(S.pos);
 const du=document.getElementById("fpdur");if(du)du.textContent=fmt(effectiveDur);
 const play=fpc.querySelector(".fpx-play");
 if(play)play.title=S.playing?t("np.pause"):t("np.play");
 fpxMorph(S.playing,built||!fpOpen);
 fpc.dataset.playing=S.playing?"true":"false";
 fpc.dataset.zoom=S.fpZoom||"normal";
 if(swapped)FPX.lySig="";
 fpxSide(layoutChanged&&S.x.fpPane!=="queue"&&!FPX.lySig);
 fpxIsland();
 updateSpButtons();
 applyLyVars();
 if(fpOpen&&swapped&&!built)window.MWFX?.cover.land();
 fpWake()}

window.renderFP=renderFP;window.paint=paint;
/* The oversized lyric sheet (mockup 2): reuses the LYRICS cache and the sync
   engine, paints into #fplyr. syncLyrics() already targets any .lyr container
   through the #lyr id — so the sheet re-uses that id on purpose. */
function renderLyricSheet(){
 const el=document.getElementById("fplyr");if(!el)return;
 const tr=S.current,L=lyricsFor(tr);
 /* The tools row (source, timing offset, Genius, editor) lives outside the
    scrolling sheet, pinned to the bottom of the pane; drop the last one. */
 el.closest(".fpx-side")?.querySelectorAll(":scope>.lyr-header").forEach(n=>n.remove());
 if(!tr||tr.mode==="empty"){
  el.dataset.empty="true";
  el.innerHTML=`<div class="lyr-empty"><p class="hollow">${t("q.none")}</p></div>`;return}
 if(!L||L.state==="idle"){
  el.dataset.empty="true";
  el.innerHTML=`<div class="lyr-empty"><p class="hollow lypulse">${t("ly.load")}</p></div>`;fetchLyrics(tr);return}
 if(L.state==="loading"){
  el.dataset.empty="true";
  el.innerHTML=`<div class="lyr-empty"><p class="hollow lypulse">${t("ly.load")}</p></div>`;return}
 if(L.state==="transcribing"){
  el.dataset.empty="true";
  el.innerHTML=`<div class="lyr-empty"><p class="hollow">${t("ly.gen")}<br><small id="lyprog" class="lypulse" style="opacity:.7;font-size:.85rem">${L.progress||""}</small><br><small style="opacity:.5;font-size:.75rem">${t("ly.slow")}</small></p></div>`;return}
 if(L.state==="error"){
  el.dataset.empty="true";
  el.innerHTML=`<div class="lyr-empty"><p class="hollow">${t("ly.err")}</p><div style="display:flex;gap:8px;margin-top:14px;justify-content:center"><button class="btn sm" id="lyretry">${t("ly.retry")}</button><button class="btn sm" id="lygenius">${t("ly.search_genius")}</button><button class="btn sm" id="lycustom">${LANG==="ru"?"Свой текст":"Custom"}</button></div></div>`;
  document.getElementById("lyretry")?.addEventListener("click",()=>{LYRICS.delete(trackKey(tr));renderLyricSheet()});
  document.getElementById("lygenius")?.addEventListener("click",()=>searchGeniusPrompt(tr));
  document.getElementById("lycustom")?.addEventListener("click",()=>openLyricEditor(tr));
  return}
 if(!L.lines?.length){
  el.dataset.empty="true";
  el.innerHTML=`<div class="lyr-empty"><p class="hollow">${t("ly.none")}</p><div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center"><button class="btn sm" id="lygenius">${t("ly.search_genius")}</button><button class="btn sm" id="lygen">${t("ly.gen")}</button><button class="btn sm" id="lycustom">${LANG==="ru"?"Свой текст / Тайминги":"Custom / Timings"}</button></div></div>`;
  document.getElementById("lygenius")?.addEventListener("click",()=>searchGeniusPrompt(tr));
  document.getElementById("lygen")?.addEventListener("click",()=>transcribeLyrics(tr));
  document.getElementById("lycustom")?.addEventListener("click",()=>openLyricEditor(tr));
  return}
 el.dataset.empty="false";
 el.dataset.synced=String(!!L.synced);
 el.dataset.karaoke=S.lyKaraoke||"karaoke";
 const badge=L.source==="custom"?(LANG==="ru"?"Свой текст":"Custom"):L.source==="genius"?t("ly.src.genius"):L.source==="ytm"?t("ly.src.ytm"):L.source==="ai"?t("ly.src.ai"):"";
 const syncBtn=!L.synced?`<button class="btn sm text" id="lyr-sync-alt" title="${LANG==="ru"?"Автоматически распределить тайминги":"Auto-distribute timestamps across track"}"><span class="material-symbols-rounded" style="font-size:16px">auto_fix_high</span> ${LANG==="ru"?"Синхронизировать":"Auto-sync"}</button>`:"";
 const curOff=getLyricOffset(tr);
 const curOffStr=(curOff>0?"+":"")+curOff.toFixed(1)+"s";
 const offCtrl=L.synced?`<div class="lyr-offset-ctrl" title="${LANG==="ru"?"Подстройка тайминга текста [ / ]":"Lyrics timing offset [ / ]"}"><button class="btn sm text ly-off-btn" data-lyoff="-0.5" title="-0.5s">−0.5s</button><span class="ly-off-val${curOff!==0?" shifted":""}" title="${LANG==="ru"?"Текущее смещение":"Current offset"}">${curOffStr}</span><button class="btn sm text ly-off-btn" data-lyoff="0.5" title="+0.5s">+0.5s</button><button class="btn sm text ly-off-btn ly-off-reset-btn" data-lyreset="true" style="${curOff!==0?"":"display:none"}" title="${LANG==="ru"?"Сбросить смещение":"Reset offset"}"><span class="material-symbols-rounded" style="font-size:14px">restart_alt</span></button></div>`:"";
 el.innerHTML=`<div class="lyr-header">${badge?`<span class="lyr-badge">${esc(badge)}</span>`:""}${offCtrl}<div style="display:flex;gap:6px;margin-left:auto">${syncBtn}<button class="btn sm text" id="lygenius-alt" title="${t("ly.search_genius")}"><span class="material-symbols-rounded" style="font-size:16px">search</span> Genius</button><button class="btn sm text" id="lyr-edit-alt" title="${LANG==="ru"?"Редактировать текст и тайминги":"Edit lyrics & timings"}"><span class="material-symbols-rounded" style="font-size:16px">timer</span> ${LANG==="ru"?"Тайминги":"Timings"}</button></div></div>`
  +L.lines.map((l,i)=>`<p data-i="${i}"${L.synced&&l.at!=null?` data-at="${l.at}" tabindex="0" role="button"`:""}>${esc(l.text)||"&nbsp;"}</p>`).join("");
 document.getElementById("lyr-sync-alt")?.addEventListener("click",()=>autoSyncLyrics(tr,L));
 document.getElementById("lygenius-alt")?.addEventListener("click",()=>searchGeniusPrompt(tr));
 document.getElementById("lyr-edit-alt")?.addEventListener("click",()=>openLyricEditor(tr));
 el.querySelectorAll("[data-lyoff]").forEach(b=>b.addEventListener("click",(e)=>{e.stopPropagation();adjustLyricOffset(+b.dataset.lyoff)}));
 el.querySelectorAll("[data-lyreset]").forEach(b=>b.addEventListener("click",(e)=>{e.stopPropagation();resetLyricOffset()}));
 const hd=el.querySelector(":scope>.lyr-header"),side=el.closest(".fpx-side");
 if(hd&&side)side.appendChild(hd);
 el.scrollTop=0;
 lyLast=-1;syncLyrics(true);
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

/* The queue pane of the full player: what is playing, then what follows.
   Rows are the regular [data-track] rows inside a data-listctx="queue"
   holder, so clicking one jumps ahead exactly like the old queue tab did. */
function renderFPBody(){
 const el=document.getElementById("fpq");if(!el)return;
 const x=document.querySelector("#fpc .fpx");
 if(!x||x.dataset.layout!=="lyrics"||x.dataset.pane!=="queue")return;
 const cur=S.current,ru=LANG==="ru";
 const keep=el.querySelector(".fpq-list")?.scrollTop||0;
 const head=`<div class="fpq-head"><div><b>${esc(t("queue"))}</b><small>${esc(t("q.from"))}: ${esc(ctxName(PLAYCTX.key))}</small></div>${queue.length?`<button class="fpx-chip" id="qclr">${fpxI("clear_all",16)}${esc(t("q.clear"))}</button>`:""}</div>`;
 const now=cur&&cur.mode!=="empty"?`<div class="fpq-now"><div class="fpq-art" ${coverStyle(cur.art,cur.l1,cur.l2)}></div><span class="fpq-tx"><small>${esc(t("now"))}</small><b>${esc(cur.t||"")}</b><em>${esc(cur.a||"")}</em></span><span class="fpq-eq" aria-hidden="true"><i></i><i></i><i></i></span></div>`:"";
 const rows=queue.slice(0,300).map((q,i)=>`<div class="q fpq-row" data-track="${esc(q.id)}" data-svc="${esc(q.s)}" style="--i:${Math.min(i,14)}">
  <div class="fpq-art" ${coverStyle(q.art,q.l1,q.l2)}></div><span class="fpq-tx"><b>${esc(q.t||"")}</b><em>${esc(q.a||"")}</em></span>
  <i class="fpq-d">${q.d?fmt(q.d):""}</i>
  <button class="qrm" data-qrm="${esc(q.id)}" data-qsvc="${esc(q.s)}" aria-label="${esc(t("q.rm"))}" title="${esc(t("q.rm"))}">${fpxI("close",16)}</button></div>`).join("");
 el.innerHTML=head+now+(queue.length?`<div class="qlist fpq-list" data-listctx="queue">${rows}</div>`
  :`<div class="fpq-empty">${fpxI("queue_music",28)}<p>${esc(t("q.none"))}</p></div>`);
 const l=el.querySelector(".fpq-list");if(l&&keep)l.scrollTop=keep;
 document.getElementById("qclr")?.addEventListener("click",()=>{queue=[];renderFPBody();toast(ru?"Очередь очищена":"Queue cleared")})}

/* ─────────────────────────── lyrics ───────────────────────────

   Three sources, tried in order and cached per track for the session:
     1. LRCLIB — free, no key, and the only one of the three with per-line
        timings, so it is preferred even for YouTube tracks.
     2. Genius / YouTube Music's own lyrics tab — accurate lyrics.
     3. Whisper, in the browser, on the audio already being played — for
        SoundCloud rips and local files that neither database knows.

   The view is the same in all three cases; only the header line and whether
   lines highlight in time differ. */
const LYRICS=new Map();          /* trackKey -> {state,source,synced,lines} */
let lyReq=0;                     /* rejects results from a previous track */

function songOffsetKey(tr){
 if(!tr)return "";
 const a=(tr.a||"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"_");
 const t=(tr.t||"").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"_");
 return (a&&t)?`song:${a}::${t}`:"";
}

function getLyricOffset(tr){
 tr=tr||S.current;
 if(!tr||tr.mode==="empty")return 0;
 const key=trackKey(tr);
 const saved=key?localStorage.getItem("mw.lyoff."+key):null;
 if(saved!==null&&!isNaN(+saved))return +saved;
 const sKey=songOffsetKey(tr);
 const songSaved=sKey?localStorage.getItem("mw.lyoff."+sKey):null;
 if(songSaved!==null&&!isNaN(+songSaved))return +songSaved;
 const globalSaved=localStorage.getItem("mw.lyoff.global");
 if(globalSaved!==null&&!isNaN(+globalSaved))return +globalSaved;
 return 0;
}

function setLyricOffset(tr,val,isGlobal=false){
 tr=tr||S.current;
 if(!tr)return;
 const rounded=Math.round(val*10)/10;
 if(isGlobal){
  localStorage.setItem("mw.lyoff.global",String(rounded));
 }else{
  const key=trackKey(tr);
  if(key)localStorage.setItem("mw.lyoff."+key,String(rounded));
  const sKey=songOffsetKey(tr);
  if(sKey)localStorage.setItem("mw.lyoff."+sKey,String(rounded));
 }
 updateLyricOffsetUi();
 syncLyrics(true);
}

function adjustLyricOffset(delta,tr){
 tr=tr||S.current;
 if(!tr)return;
 const cur=getLyricOffset(tr);
 const next=Math.round((cur+delta)*10)/10;
 setLyricOffset(tr,next);
 const sign=next>0?"+":"";
 toast((LANG==="ru"?"Смещение текста: ":"Lyrics offset: ")+`${sign}${next.toFixed(1)}s`);
}

function resetLyricOffset(tr){
 tr=tr||S.current;
 if(!tr)return;
 const key=trackKey(tr);
 if(key)localStorage.removeItem("mw.lyoff."+key);
 const sKey=songOffsetKey(tr);
 if(sKey)localStorage.removeItem("mw.lyoff."+sKey);
 updateLyricOffsetUi();
 syncLyrics(true);
 toast(LANG==="ru"?"Смещение текста сброшено (0.0s)":"Lyrics offset reset (0.0s)");
}

function updateLyricOffsetUi(){
 const off=getLyricOffset(S.current);
 const sign=off>0?"+":"";
 const text=`${sign}${off.toFixed(1)}s`;
 document.querySelectorAll(".ly-off-val").forEach(el=>{
  el.textContent=text;
  el.classList.toggle("shifted",off!==0);
 });
 document.querySelectorAll(".ly-off-reset-btn").forEach(el=>{
  el.style.display=off!==0?"":"none";
 });
}

function lyricsFor(tr){
 if(!tr||tr.mode==="empty")return null;
 const key=trackKey(tr);
 const custom=localStorage.getItem("mw.custom_lyrics."+key);
 if(custom){
  try{
   const parsed=JSON.parse(custom);
   if(parsed&&parsed.lines)return {state:"done",source:parsed.source||"custom",synced:!!parsed.synced,lines:parsed.lines};
  }catch(e){}
 }
 return LYRICS.get(key);
}

function parseLrc(text){
 const lines=[];
 const rawLines=(text||"").split(/\r?\n/);
 const timeRegex=/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
 let hasTime=false;
 for(const line of rawLines){
  const trimmed=line.trim();
  if(!trimmed)continue;
  let match;
  let lastIdx=0;
  const times=[];
  timeRegex.lastIndex=0;
  while((match=timeRegex.exec(trimmed))!==null){
   const min=parseInt(match[1],10);
   const sec=parseInt(match[2],10);
   const ms=match[3]?parseFloat("0."+match[3]):0;
   times.push(min*60+sec+ms);
   lastIdx=timeRegex.lastIndex;
  }
  const textPart=trimmed.slice(lastIdx).trim();
  if(times.length>0){
   hasTime=true;
   for(const at of times){
    lines.push({at,text:textPart});
   }
  }else{
   lines.push({text:trimmed});
  }
 }
 if(hasTime){
  lines.sort((a,b)=>(a.at??0)-(b.at??0));
 }
 return {synced:hasTime,lines};
}

function formatLrc(L){
 if(!L||!L.lines||!L.lines.length)return "";
 return L.lines.map(l=>{
  if(l.at!=null){
   const m=Math.floor(l.at/60);
   const s=Math.floor(l.at%60);
   const ms=Math.floor((l.at%1)*100);
   return `[${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(ms).padStart(2,"0")}] ${l.text||""}`;
  }
  return l.text||"";
 }).join("\n");
}

let lyricEditorTrack=null;
function openLyricEditor(tr){
 tr=tr||S.current;
 if(!tr||tr.mode==="empty")return;
 lyricEditorTrack=tr;
 const modal=document.getElementById("lyric-edit-modal");
 if(!modal)return;
 const L=lyricsFor(tr);
 const txt=document.getElementById("lyric-edit-text");
 if(txt)txt.value=formatLrc(L);
 const title=document.getElementById("lyric-edit-title");
 if(title)title.textContent=(LANG==="ru"?"Редактор текста: ":"Lyric Editor: ")+`${tr.a||""} — ${tr.t||""}`;
 modal.hidden=false;
 modal.dataset.open="true";
 const curTime=document.getElementById("lyric-cur-time");
 if(curTime)curTime.textContent=fmt(S.pos||0);
 icons();
}

function closeLyricEditor(){
 const modal=document.getElementById("lyric-edit-modal");
 if(!modal)return;
 modal.hidden=true;
 modal.dataset.open="false";
 lyricEditorTrack=null;
}

function initLyricEditor(){
 document.getElementById("lyric-edit-close")?.addEventListener("click",closeLyricEditor);
 document.getElementById("lyric-edit-cancel")?.addEventListener("click",closeLyricEditor);
 document.getElementById("lyric-edit-modal")?.addEventListener("click",e=>{
  if(e.target===document.getElementById("lyric-edit-modal"))closeLyricEditor();
 });
 document.getElementById("lyric-clear-times")?.addEventListener("click",()=>{
  const txt=document.getElementById("lyric-edit-text");
  if(!txt)return;
  txt.value=txt.value.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*/g,"");
  toast(LANG==="ru"?"Метки времени очищены":"Timestamps cleared");
 });
 document.getElementById("lyric-auto-time")?.addEventListener("click",()=>{
  const txt=document.getElementById("lyric-edit-text");
  if(!txt)return;
  const raw=txt.value.replace(/\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]\s*/g,"");
  const rawLines=raw.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!rawLines.length)return toast(LANG==="ru"?"Нет строк текста для расстановки таймингов":"No lyrics lines to timestamp");
  const tr=lyricEditorTrack||S.current;
  const totalSec=S.dur>5?S.dur:(tr?.d>5?tr.d:180);
  const intro=Math.min(12,Math.max(4,totalSec*0.06));
  const available=Math.max(10,totalSec-intro-6);
  const step=available/rawLines.length;
  const timed=rawLines.map((l,i)=>{
   const at=intro+(i*step);
   const m=Math.floor(at/60);
   const s=Math.floor(at%60);
   const ms=Math.floor((at%1)*100);
   return `[${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(ms).padStart(2,"0")}] ${l}`;
  });
  txt.value=timed.join("\n");
  toast(LANG==="ru"?"Авто-тайминги распределены по треку":"Auto-timings distributed across track");
 });
 document.getElementById("lyric-stamp-btn")?.addEventListener("click",()=>{
  const txt=document.getElementById("lyric-edit-text");
  if(!txt)return;
  const cur=S.pos||0;
  const m=Math.floor(cur/60);
  const s=Math.floor(cur%60);
  const ms=Math.floor((cur%1)*100);
  const stamp=`[${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(ms).padStart(2,"0")}] `;
  const start=txt.selectionStart||0;
  const end=txt.selectionEnd||0;
  txt.value=txt.value.slice(0,start)+stamp+txt.value.slice(end);
  txt.selectionStart=txt.selectionEnd=start+stamp.length;
  txt.focus();
 });
 document.getElementById("lyric-reset-btn")?.addEventListener("click",()=>{
  const tr=lyricEditorTrack||S.current;
  if(tr){
   const key=trackKey(tr);
   localStorage.removeItem("mw.custom_lyrics."+key);
   LYRICS.delete(key);
   fetchLyrics(tr);
  }
  closeLyricEditor();
  toast(LANG==="ru"?"Сброшено на оригинальный текст":"Reset to original lyrics");
 });
 document.getElementById("lyric-edit-save")?.addEventListener("click",()=>{
  const tr=lyricEditorTrack||S.current;
  const txt=document.getElementById("lyric-edit-text");
  if(!tr||!txt)return;
  const key=trackKey(tr);
  const parsed=parseLrc(txt.value);
  const data={source:"custom",synced:parsed.synced,lines:parsed.lines};
  try{
   localStorage.setItem("mw.custom_lyrics."+key,JSON.stringify(data));
  }catch(e){}
  LYRICS.set(key,{state:"done",...data});
  closeLyricEditor();
  toast(parsed.synced?(LANG==="ru"?"Текст и тайминги сохранены":"Lyrics & timings saved"):(LANG==="ru"?"Текст сохранён":"Lyrics saved"));
  if(fp.dataset.open==="true")renderFP();
  else if(S.fpTab==="lyrics")renderLyrics();
 });
}

function autoSyncLyrics(tr,L){
 if(!tr||!L||!L.lines?.length)return;
 const key=trackKey(tr);
 const totalSec=S.dur>5?S.dur:(tr.d>5?tr.d:180);
 const intro=Math.min(12,Math.max(4,totalSec*0.06));
 const available=Math.max(10,totalSec-intro-6);
 const clean=L.lines.filter(l=>l.text&&l.text.trim());
 if(!clean.length)return;
 const step=available/clean.length;
 const timed=clean.map((l,i)=>{
  const at=Math.round((intro+(i*step))*100)/100;
  return {text:l.text.trim(),at};
 });
 const data={source:L.source||"genius",synced:true,lines:timed};
 try{localStorage.setItem("mw.custom_lyrics."+key,JSON.stringify(data))}catch(_){}
 LYRICS.set(key,{state:"done",...data});
 toast(LANG==="ru"?"Тайминги применены к треку!":"Timings synced with track!");
 if(fp.dataset.open==="true")renderFP();
 else if(S.fpTab==="lyrics")renderLyrics();
}

function renderLyrics(){
 const el=document.getElementById("fpbody");if(!el)return;
 const tr=S.current;
 const L=lyricsFor(tr);
 if(!tr||tr.mode==="empty"){el.innerHTML=`<p class="hollow">${t("q.none")}</p>`;return}

 if(!L||L.state==="idle"){el.innerHTML=`<p class="hollow">${t("ly.load")}</p>`;fetchLyrics(tr);return}
 if(L.state==="loading"){el.innerHTML=`<p class="hollow">${t("ly.load")}</p>`;return}
 if(L.state==="transcribing"){
  el.innerHTML=`<p class="hollow">${t("ly.gen")}<br><small id="lyprog" class="lypulse" style="opacity:.6">${L.progress||""}</small><br><small style="opacity:.45">${t("ly.slow")}</small></p>`;return}
 if(L.state==="error"){
  el.innerHTML=`<p class="hollow">${t("ly.err")}<br><div style="display:flex;gap:6px;justify-content:center;margin-top:10px"><button class="btn sm" id="lyretry">${t("ly.retry")}</button><button class="btn sm" id="lygenius-side">${t("ly.search_genius")}</button><button class="btn sm" id="lycustom-side">${LANG==="ru"?"Свой текст":"Custom"}</button></div></p>`;
  document.getElementById("lyretry").onclick=()=>{LYRICS.delete(trackKey(tr));renderLyrics()};
  document.getElementById("lygenius-side")?.addEventListener("click",()=>searchGeniusPrompt(tr));
  document.getElementById("lycustom-side")?.addEventListener("click",()=>openLyricEditor(tr));
  return}
 if(!L.lines?.length){
  el.innerHTML=`<p class="hollow">${t("ly.none")}<br><div style="display:flex;gap:6px;justify-content:center;margin-top:10px"><button class="btn sm" id="lygenius-side">${t("ly.search_genius")}</button><button class="btn sm" id="lygen">${t("ly.gen")}</button><button class="btn sm" id="lycustom-side">${LANG==="ru"?"Свой текст / Тайминги":"Custom / Timings"}</button></div></p>`;
  document.getElementById("lygenius-side")?.addEventListener("click",()=>searchGeniusPrompt(tr));
  document.getElementById("lygen")?.addEventListener("click",()=>transcribeLyrics(tr));
  document.getElementById("lycustom-side")?.addEventListener("click",()=>openLyricEditor(tr));
  return}

 const badge=L.source==="custom"?(LANG==="ru"?"Свой текст":"Custom"):L.source==="genius"?t("ly.src.genius"):L.source==="ytm"?t("ly.src.ytm"):L.source==="ai"?t("ly.src.ai"):"";
 const syncBtn=!L.synced?`<button class="btn sm text" id="lyr-sync-btn" style="padding:2px 8px;font-size:.72rem"><span class="material-symbols-rounded" style="font-size:14px">auto_fix_high</span> ${LANG==="ru"?"Синхронизировать":"Auto-sync"}</button>`:"";
 const curOff=getLyricOffset(tr);
 const curOffStr=(curOff>0?"+":"")+curOff.toFixed(1)+"s";
 const offCtrl=L.synced?`<div class="lyr-offset-ctrl" title="${LANG==="ru"?"Подстройка тайминга текста [ / ]":"Lyrics timing offset [ / ]"}"><button class="btn sm text ly-off-btn" data-lyoff="-0.5" title="-0.5s">−0.5s</button><span class="ly-off-val${curOff!==0?" shifted":""}" title="${LANG==="ru"?"Текущее смещение":"Current offset"}">${curOffStr}</span><button class="btn sm text ly-off-btn" data-lyoff="0.5" title="+0.5s">+0.5s</button><button class="btn sm text ly-off-btn ly-off-reset-btn" data-lyreset="true" style="${curOff!==0?"":"display:none"}" title="${LANG==="ru"?"Сбросить смещение":"Reset offset"}"><span class="material-symbols-rounded" style="font-size:14px">restart_alt</span></button></div>`:"";
 el.innerHTML=`<div class="lyr" id="lyr" data-synced="${!!L.synced}" data-karaoke="${esc(S.lyKaraoke||"karaoke")}">`
  +`<div class="lysrc" style="display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:8px"><span>${badge?esc(badge):""}</span>${offCtrl}</div><div style="display:flex;gap:6px">${syncBtn}<button class="btn sm text" id="lyr-genius-btn" style="padding:2px 8px;font-size:.72rem">Genius</button><button class="btn sm text" id="lyr-edit-btn" style="padding:2px 8px;font-size:.72rem">${LANG==="ru"?"Тайминги":"Timings"}</button></div></div>`
  +L.lines.map((l,i)=>`<p data-i="${i}"${L.synced&&l.at!=null?` data-at="${l.at}" tabindex="0" role="button"`:""}>${esc(l.text)||"&nbsp;"}</p>`).join("")
  +`</div>`;
 document.getElementById("lyr-sync-btn")?.addEventListener("click",()=>autoSyncLyrics(tr,L));
 document.getElementById("lyr-genius-btn")?.addEventListener("click",()=>searchGeniusPrompt(tr));
 document.getElementById("lyr-edit-btn")?.addEventListener("click",()=>openLyricEditor(tr));
 el.querySelectorAll("[data-lyoff]").forEach(b=>b.addEventListener("click",(e)=>{e.stopPropagation();adjustLyricOffset(+b.dataset.lyoff)}));
 el.querySelectorAll("[data-lyreset]").forEach(b=>b.addEventListener("click",(e)=>{e.stopPropagation();resetLyricOffset()}));
 lyLast=-1;
 syncLyrics(true);
 icons()}

/* Click or Enter on a timed line seeks to it. */
function lySeekFrom(el){
 const at=parseFloat(el?.dataset.at||"");
 if(!isFinite(at))return;
 /* Highlight math runs on pos+offset: seeking to the raw timestamp with a
    calibrated offset lit up a line below the one the user clicked. */
 const offset=typeof getLyricOffset==="function"?getLyricOffset(S.current):0;
 seekSeconds(Math.max(0,at-offset));
 lyUserScroll=0;syncLyrics(true)}
document.addEventListener("click",e=>{
 const p=e.target.closest?.("#lyr p[data-at],#fplyr p[data-at],.lyr-big p[data-at]");
 if(p)lySeekFrom(p)});
document.addEventListener("keydown",e=>{
 if(e.key!=="Enter"&&e.key!==" ")return;
 const p=e.target.closest?.("#lyr p[data-at],#fplyr p[data-at],.lyr-big p[data-at]");
 if(p){e.preventDefault();lySeekFrom(p)}});

/* A Spotify track plays through a resolved copy from another service; both
   are the same song to every "is this still the current track" check. */
const trackIdent=x=>x._spOrig?"sp:"+x._spOrig.id:x.s+":"+String(x.id);
function sameTrack(a,b){return !!a&&!!b&&trackIdent(a)===trackIdent(b)}

async function searchGeniusPrompt(tr){
 if(!tr||tr.mode==="empty")return;
 const defQ=`${tr.a||""} ${tr.t||""}`.trim();
 const q=await askText(t("dlg.genius.t"),defQ,{icon:"lyrics",label:t("dlg.genius.l"),confirm:t("dlg.find"),required:true});
 if(!q||!q.trim())return;
 toast(t("ly.load"));
 try{
  if(!TAURI){toast("Desktop only");return}
  const res=await inv("lyrics_search_genius",{query:q.trim()});
  if(res&&res.lines&&res.lines.length){
   const key=trackKey(tr);
   const lines=cleanLyricLines(res.lines,false);
   LYRICS.set(key,{state:"done",source:"genius",synced:false,lines});
   toast(LANG==="ru"?"Текст найден на Genius. Нажмите «Синхронизировать» для добавления таймингов":"Lyrics found on Genius. Click «Auto-sync» to add timings", 4500);
   S.fpMode="lyric";save();
   if(fp.dataset.open==="true")renderFP();
   else if(S.fpTab==="lyrics")renderLyrics();
  }else{
   toast(t("ly.none"));
  }
 }catch(e){
  console.warn("searchGeniusPrompt:",e);
  toast(t("ly.err"));
 }
}

/* Section headers ("[Chorus]", "[Припев: …]") and the like come with Genius
   and some plain-text sources. They are not sung, so they are not shown.
   Blank lines collapse to one; in synced lyrics a blank timed line marks an
   instrumental break and is kept. */
/* The Rust side already strips labels, credits and notices from every fetched
   source (lyrics_clean.rs); this is the last line for what it never sees —
   AI transcription and the Genius search box. Section labels in the common
   plain forms ("Припев:", "(Chorus x2)", "Куплет 2"). */
const LY_LABEL=/^[({<]?\s*(?:\d+-?[йя]?\s+)?(?:verse|chorus|pre-?chorus|post-?chorus|hook|refrain|bridge|intro|outro|interlude|instrumental|breakdown|coda|куплет|припев|пред-?припев|бридж|интро|вступление|аутро|концовка|проигрыш|кода|приспів|вступ)(?:\s*[-–—#№]?\s*\d+)?(?:\s*[(\[]?\s*(?:[xх×]\s*\d+|\d+\s*[xх×]|\d+\s*раза?)\s*[)\]]?)?\s*[)}>]?\s*[:：.]?\s*$/i;
/* Whisper was trained on subtitles, and on silence or a long instrumental it
   "hears" their credits and outros. These are the ones it actually produces. */
const LY_AI_JUNK=/(?:субтитр|dimatorzok|редактор\s|корректор\s|продолжение следует|спасибо за (?:просмотр|внимание)|подписывайтесь|ставьте лайк|thanks? (?:you )?for watching|please subscribe|subtitles? by|amara\.org|字幕|ご視聴|시청해)/i;
const LY_AI_TAG=/^[\s[(（【♪♫*-]*(?:music|музыка|музыкальная заставка|instrumental|аплодисменты|applause|смех|laughter|silence|тишина|singing|поёт|вздох|sigh|outro|intro)?[\s\])）】♪♫*.…-]*$/i;
function cleanAiLines(lines){
 return (lines||[]).filter(l=>{
  const tx=String(l?.text||"").trim();
  return tx&&!LY_AI_JUNK.test(tx)&&!LY_AI_TAG.test(tx)&&!LY_LABEL.test(tx)})}
function cleanLyricLines(lines,synced){
 const out=[];
 for(const l of lines||[]){
  if(!l||l.text===undefined)continue;
  let tx=String(l.text).replace(/[\u200b\ufeff]/g,"").trim();
  if(/^\[[^\]]{0,80}\]$/.test(tx)||LY_LABEL.test(tx))continue;
  tx=tx.replace(/^\[[^\]]{1,40}\]\s*/,"");
  const prev=out[out.length-1];
  if(!tx&&(!synced||l.at==null)&&(!prev||!prev.text))continue;
  if(!tx&&synced&&prev&&!prev.text)continue;
  out.push({...l,text:tx})}
 while(out.length&&!out[out.length-1].text&&(!synced||out[out.length-1].at==null))out.pop();
 return out}
async function fetchLyrics(tr){
 if(!tr||tr.mode==="empty")return;
 const key=trackKey(tr),my=++lyReq;
 LYRICS.set(key,{state:"loading"});
 if(fp.dataset.open==="true")renderFP();
 try{
  /* The length of what actually plays beats the catalogue's: LRCLIB picks the
     recording by duration, and a video with an intro is not the album cut. */
  const real=sameTrack(tr,S.current)&&Number.isFinite(S.dur)&&S.dur>0?S.dur:0;
  const dur=Math.round(real||tr.d||0);
  const res=TAURI?await inv("lyrics_get",{
   service:tr.s||"",id:String(tr.id||""),artist:tr.a||"",title:tr.t||"",
   album:tr.al||"",duration:dur}):null;
  if(my!==lyReq)return;
  const synced=!!res?.synced;
  const lines=cleanLyricLines(res?.lines||[],synced);
  LYRICS.set(key,{state:"done",source:res?.source||"none",synced:synced&&lines.some(l=>l.at!=null),lines,dur});
 }catch(e){
  console.warn("lyrics:",e);
  if(my!==lyReq)return;
  LYRICS.set(key,{state:"error"})}
 if(sameTrack(tr,S.current)){
  if(fp.dataset.open==="true")renderFP();
  else if(S.fpTab==="lyrics")renderLyrics()}}

/* Lyrics fetched before the real length was known were matched against the
   catalogue length. If what plays turns out several seconds longer or shorter
   (a video cut, a radio edit), ask again once with the real length. */
function lyricsDurCheck(){
 const tr=S.current;if(!tr||!(S.dur>0))return;
 const L=lyricsFor(tr);
 if(!L||L.state!=="done"||L.source==="custom"||L.redone||!L.dur)return;
 if(Math.abs(L.dur-S.dur)<4)return;
 const key=trackKey(tr);
 LYRICS.delete(key);
 fetchLyrics(tr).then(()=>{const n=LYRICS.get(key);if(n)n.redone=true})}
/* Highlight follows the clock. Only the changed lines are touched — rewriting
   every <p> on each tick restarted the CSS transitions, which is what made a
   scrolling lyric look like it was flickering rather than gliding. */
let lyLast=-1;
function syncLyrics(force){
 const L=lyricsFor(S.current);
 const isFpLyric=fp.dataset.open==="true"&&S.fpMode==="lyric";
 const box=isFpLyric?document.getElementById("fplyr"):(document.getElementById("lyr")||document.getElementById("fplyr"));
 if(!L?.lines?.length||!box)return;
 if(!L.synced){if(force)lyLast=-1;return}

 const audioPos=(A.audio&&!A.audio.paused&&Number.isFinite(A.audio.currentTime))
  ?A.audio.currentTime
  :S.pos;
 const offset=typeof getLyricOffset==="function"?getLyricOffset(S.current):0;
 const effPos=Math.max(0,audioPos+offset+LY_LEAD);

 let idx=-1;
 for(let i=0;i<L.lines.length;i++){
  const at=L.lines[i].at;
  if(at==null)continue;
  if(effPos>=at)idx=i;else break}

 const kids=box.querySelectorAll("p[data-i]");

 /* Smooth karaoke progressive text fill */
 if(S.lyKaraoke!=="off"&&S.lyKaraoke!=="line"&&idx>=0&&idx<L.lines.length){
  const curLine=L.lines[idx];
  const nextLine=L.lines[idx+1];
  const start=curLine.at||0;
  const dur=nextLine&&nextLine.at!=null?(nextLine.at-start):Math.min(6,Math.max(2,(S.dur||start+4)-start));
  const elapsed=Math.max(0,effPos-start);
  const pct=Math.min(100,Math.max(0,(elapsed/Math.max(0.2,dur))*100));
  const curEl=kids[idx];
  if(curEl)curEl.style.setProperty("--karaoke-pct",`${pct.toFixed(1)}%`);
 }

 if(idx===lyLast&&!force)return;
 lyLast=idx;

 kids.forEach((p,i)=>{
  const on=i===idx;
  if((p.dataset.on==="true")!==on){
   p.dataset.on=on;
  }
  if(S.lyKaraoke==="line")p.style.setProperty("--karaoke-pct",i<=idx?"100%":"0%");
  else if(S.lyKaraoke==="off")p.style.removeProperty("--karaoke-pct");
  else if(!on)p.style.setProperty("--karaoke-pct",i<idx?"100%":"0%");
  const near=idx===-1?(i+1):Math.abs(i-idx);
  const step=near===0?"0":near<=2?String(near):"far";
  if(p.dataset.near!==step)p.dataset.near=step});

 const isFpLyr=box.id==="fplyr";
 const sc=isFpLyr?box:box.parentElement;
 if(!sc)return;
 if(!force&&(lySelecting(box)||performance.now()-lyUserScroll<2500))return;

 if(idx===-1){
  if(sc.scrollTop>10&&force)sc.scrollTo({top:0,behavior:"auto"});
  return}

 const cur=kids[idx];
 if(cur){
  const delta=cur.getBoundingClientRect().top-sc.getBoundingClientRect().top;
  const want=sc.scrollTop+delta-(sc.clientHeight*0.42)+(cur.offsetHeight/2);
  const to=Math.max(0,Math.min(want,sc.scrollHeight-sc.clientHeight));
  if(Math.abs(sc.scrollTop-to)>2){
   sc.scrollTo({top:to,behavior:force?"auto":"smooth"});
  }
 }
}

/* True while a selection covers part of the lyrics. */
function lySelecting(box){
 const sel=getSelection?.();
 if(!sel||sel.isCollapsed||!sel.rangeCount)return false;
 return box.contains(sel.getRangeAt(0).commonAncestorContainer)}

/* Manual scrolling wins for a few seconds. `scrollTo` fires this too, so our
   own programmatic scrolls are ignored via a flag. */
let lyUserScroll=0;
document.addEventListener("pointerdown",e=>{
 if(e.target.closest?.("#lyr,#fplyr,.lyr-big"))lyUserScroll=performance.now()},true);
document.addEventListener("wheel",e=>{
 if(e.target.closest?.(".fpbody,#lyr,#fplyr,.lyr-big"))lyUserScroll=performance.now()},{passive:true,capture:true});
document.addEventListener("touchmove",e=>{
 if(e.target.closest?.("#lyr,#fplyr,.lyr-big"))lyUserScroll=performance.now()},{passive:true,capture:true});

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
 if(fp.dataset.open==="true"&&S.fpMode==="lyric")renderLyricSheet();
 else renderLyrics();
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
  const lines=cleanAiLines((res?.chunks||[])
   .map(c=>({at:Array.isArray(c.timestamp)?c.timestamp[0]:null,text:String(c.text||"").trim()})));
  LYRICS.set(key,lines.length
   ?{state:"done",source:"ai",synced:lines.every(l=>l.at!=null),lines:mergeAiLines(lines)}
   :{state:"done",source:"none",synced:false,lines:[]});
 }catch(e){
  console.warn("transcribe:",e);
  if(my!==lyReq)return;
  LYRICS.set(key,{state:"error"})}
 if(sameTrack(tr,S.current)){
  if(fp.dataset.open==="true"&&S.fpMode==="lyric")renderLyricSheet();
  else if(S.fpTab==="lyrics")renderLyrics()}}

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
 const H=vt.clientHeight||44,mid=H/2,y=Math.max(0,Math.min(H,mid-(S.eq[i]/12)*mid)),f=vt.querySelector(".f"),kn=vt.querySelector(".kn");
 if(f){f.style.top=Math.min(mid,y)+"px";f.style.height=Math.abs(mid-y)+"px"}
 if(kn){const r=(kn.offsetHeight||11)/2;kn.style.top=Math.max(-r,Math.min(H-r,y-r))+"px"}
 vt.setAttribute("aria-valuenow",S.eq[i].toFixed(1));
 const ev=document.getElementById("ev"+i);if(ev)ev.textContent=(S.eq[i]>0?"+":"")+S.eq[i].toFixed(1)}
const allP=()=>[...PRESETS,...S.custom];
function renderPresets(){
 document.getElementById("presets").innerHTML=allP().map(p=>
  `<button class="pchip" data-p="${esc(p.id)}" aria-pressed="${S.preset===p.id}">${esc(p.n[LANG]||p.n.ru||p.n)}</button>`).join("")}
function setBand(i,v){initAudio();S.eq[i]=Math.max(-12,Math.min(12,v));paintBand(i);applyEQ();
 const m=allP().find(p=>p.g.every((g,j)=>Math.abs(g-S.eq[j])<.05));S.preset=m?m.id:null;renderPresets();save()}

/* playback */
/* ctx: which list this play came from — see PLAYCTX. Passing it here rather
   than setting a global first keeps "what plays next" decided in one place. */
async function setTrack(tr,play=true,openFull=false,ctx,keepQueue,isBack=false){
 if(!tr)return;
 initAudio();
 if(play&&A.ctx&&A.ctx.state==="suspended"){A.ctx.resume().catch(()=>{})}
 if(!isBack&&S.current&&S.current.mode!=="empty"&&!sameTrack(S.current,tr)){
  PREV_STACK.push(S.current);
  if(PREV_STACK.length>50)PREV_STACK.shift();
 }
 if(ctx!==undefined)setContext(ctx);
 if(!STREAM_PORT&&tr.mode==="local")await ensureStreamPort();
 const trackDur = tr.d ? (+tr.d || 0) : 0;
 S.current=tr;S.dur=(Number.isFinite(trackDur)&&trackDur>0)?trackDur:0;S.pos=0;
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
 load(tr,play);S.playing=play;sync();renderNP();paint();updateLyricOffsetUi();
 /* The cover drives the accent colour when adaptive mode is on. */
 adaptAccent(tr);
 pushHistory(tr);noteTrackStart(tr);
 if(PLAYCTX.key==="wave"&&tr){
  if(typeof waveNoteStart==="function")waveNoteStart(tr);
  if(typeof WAVE_SESSION_PLAYED!=="undefined")WAVE_SESSION_PLAYED.add(String(tr.s)+":"+String(tr.id));
  if(queue.length<5&&typeof waveExtend==="function")waveExtend().catch(()=>{});
 }
 document.querySelectorAll(".row").forEach(r=>r.dataset.playing=
  (String(r.dataset.track)===String(tr.id)&&r.dataset.svc===tr.s));
 if(openFull)openFP();else if(fp.dataset.open==="true")renderFP()}
function toggle(){
 initAudio();
 if(A.ctx&&A.ctx.state==="suspended"){A.ctx.resume().catch(()=>{})}
 if(S.current?.mode==="empty")return go("search");
 const au=ensureAudioEl();
 if(S.playing){
  fadePause(au);
  S.playing=false;
 }else{
  clearTimeout(fadePauseTimer);
  if(!au.paused)fadeResume();
  A.ctx?.resume().catch(()=>{});
  if(!au.src||au.src==="about:blank"){
   load(S.current,true);
  }else{
   au.play().then(()=>{applyRate()}).catch(e=>{
    console.warn("[meowave] toggle play catch:",e);
    load(S.current,true);
   });
  }
  S.playing=true;
 }
 sync()}

/* The queue is now what actually plays next.

   Before, `queue` was a display-only slice of TRACKS while next() walked TRACKS
   in its own order with its own shuffle roll — so the list shown in the player
   and the track that followed were unrelated. That is the "queue does not match
   reality" report. One array is now built here and next() pops from it, so the
   panel is the schedule rather than a decoration. */
function playablePool(){
 const playable=TRACKS.filter(x=>x.mode!=="empty"&&!isDisliked(x));
 return playable.filter(x=>playOn(x.s));
}

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
 if(k==="wave")return WAVE.filter(x=>playOn(x.s));
 if(k.startsWith("pl:"))return (PLAYLISTS.find(p=>p.id===k.slice(3))?.tracks||[]).slice();
 if(k.startsWith("art:"))return (artistList().find(a=>a.name===k.slice(4))?.list||[]).slice();
 if(k.startsWith("grp:"))return (PL_GROUPS[+k.slice(4)]?.list||[]).slice();
 /* A room's line-up lives server-side, not in a local array like the rest. */
 if(k.startsWith("room:"))return (SOC.roomQueue||[]).map(r=>r.track).slice();
 /* Collections, charts and artist pages opened from the home sheet. */
 if(k.startsWith("x:"))return (XLISTS.get(k)?.tracks||[]).slice();
 return null}
const XLISTS=new Map();
function xlistSet(key,name,tracks){
 XLISTS.set(key,{name,tracks:tracks||[]});
 while(XLISTS.size>40)XLISTS.delete(XLISTS.keys().next().value);
 (tracks||[]).forEach(x=>{if(x&&!TRACKS.some(y=>sameTrack(y,x)))TRACKS.push(x)})}

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
 if(k.startsWith("x:"))return XLISTS.get(k)?.name||t("ctx.all");
 return t("ctx.all")}

/* The pool the queue is built from: the context when it still holds something
   playable, the whole library otherwise. */
function contextPool(){
 const list=listFor(PLAYCTX.key);
 const base=list||playablePool();
 const playable=base.filter(x=>x&&x.mode!=="empty"&&!isDisliked(x));
 return playable.filter(x=>playOn(x.s));
}

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
 if(fp.dataset.open==="true")renderFPBody()}

/* Puts a track next in line without changing what is playing. */
function queueNext(tr){
 if(!tr)return;
 queue=queue.filter(x=>!sameTrack(x,tr));
 queue.unshift(tr);
 toast(t("q.next.ok").replace("{n}",tr.t||""));
 if(fp.dataset.open==="true")renderFPBody()}

/* Appends to the end of the queue. */
function queueLast(tr){
 if(!tr)return;
 queue=queue.filter(x=>!sameTrack(x,tr));
 queue.push(tr);
 toast(t("q.last.ok").replace("{n}",tr.t||""));
 if(fp.dataset.open==="true")renderFPBody()}

function queueRemove(id,s){
 queue=queue.filter(x=>!(String(x.id)===String(id)&&x.s===s));
 if(fp.dataset.open==="true")renderFPBody()}

function next(userInitiated){
 /* Repeat-one restart lives here for a track's natural end, but a manual skip
    (button, media keys, Shift+Arrow) must always advance — an unconditional
    restart made "Next" replay the same song whenever repeat was on. */
 if(!userInitiated&&S.repeat&&A.audio&&S.current?.mode==="local"){A.audio.currentTime=0;A.audio.play().catch(console.warn);return}
 /* Take the head of the visible queue — that is the promise the panel made. */
 /* The wave learns from how a track ended: played out, or skipped. */
 if(PLAYCTX.key==="wave"&&typeof waveNoteEnd==="function")waveNoteEnd(S.current,!userInitiated);
 let nx=null;
 while(queue.length&&!nx){
  const c=queue.shift();
  if(c&&!isDisliked(c)&&c.mode!=="empty"&&playOn(c.s))nx=c}
 if(PLAYCTX.key==="wave"&&queue.length<5){
  if(typeof waveExtend==="function")waveExtend().catch(()=>{});
 }
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

/* Resolving a stream (YouTube Music especially) is the slow part of a skip.
   Twenty seconds before the end, the proxy resolves the next one and keeps
   the URL in its cache, so the change is instant. Once per track. */
let prefetchedFor="";
function prefetchNextSoon(pos){
 if(!TAURI||!S.current)return;
 const d=S.dur||+S.current.d||0;if(!(d>30)||d-pos>20)return;
 const k=trackKey(S.current);if(prefetchedFor===k)return;prefetchedFor=k;
 const nx=queue.find(x=>x&&x.mode!=="empty"&&!isDisliked(x)&&playOn(x.s));
 if(!nx||nx.s==="local"||nx.blob)return;
 const go=x=>inv("stream_prefetch",{service:x.s,id:String(x.id),hq:hqFlag(),fmt:x.s==="ytm"?ytmFmt(x):"best"}).catch(()=>{});
 if(nx.s==="sp")sprResolve(nx).then(rec=>{if(rec)go({s:rec.s,id:rec.id})}).catch(()=>{});
 else go(nx)}

function stopAtEnd(){
 S.playing=false;S.pos=S.dur;sync();renderNP();paint()}

/* ── Wave / Radio Session & Recommendations ─────────────────────── */
let WAVE=[];
const WAVE_SESSION_PLAYED=new Set();

async function fetchRadioTracks(seed){
 if(!seed)return [];
 let list=[];
 if(TAURI&&seed.s&&seed.id&&seed.s!=="local"){
  try{
   const r=await inv("api_radio",{service:seed.s,id:String(seed.id)});
   if(Array.isArray(r)&&r.length)list=r;
  }catch(e){console.warn("api_radio fallback:",e)}
 }
 if(!list.length&&seed.a){
  const queries=[`${seed.a} radio`,`${seed.a} mix`,seed.a];
  for(const q of queries){
   const r=await searchRemote(q).catch(()=>[]);
   if(r&&r.length){list=r;break}
  }
 }
 return (list||[]).filter(x=>x&&x.mode!=="empty"&&!isDisliked(x)&&svc(x.s)?.on);
}

/* Pulls more tracks for the wave using smart recommendations,
   skipping everything played in this session and history. */
let waveExtendPromise=null;
function waveExtend(){
 if(typeof wave2Extend==="function")return wave2Extend();
 if(waveExtendPromise)return waveExtendPromise;
 waveExtendPromise=(async()=>{
  try{
   const played=new Set([
    ...HISTORY.map(h=>h.tr&&String(h.tr.s)+":"+String(h.tr.id)),
    ...[...WAVE_SESSION_PLAYED].map(k=>String(k))
   ]);
   const seeds=[];
   if(S.current&&S.current.mode!=="empty")seeds.push(S.current);
   WAVE.slice(-6).reverse().forEach(x=>{if(!seeds.some(s=>sameTrack(s,x)))seeds.push(x)});
   favTracks().slice(0,3).forEach(x=>{if(!seeds.some(s=>sameTrack(s,x)))seeds.push(x)});

   const isFav = tr => favTracks().some(f=>sameTrack(f,tr));
   const fresh=[];
   for(const seed of seeds){
    if(fresh.length>=8)break;
    const rad=await fetchRadioTracks(seed);
    for(const x of rad){
     const key=String(x.s)+":"+String(x.id);
     if(x.mode!=="empty"&&!isDisliked(x)&&svc(x.s)?.on&&!isFav(x)&&!played.has(key)&&!WAVE.some(w=>sameTrack(w,x))&&!queue.some(q=>sameTrack(q,x))&&!fresh.some(f=>sameTrack(f,x))){
      fresh.push(x);
      if(fresh.length>=8)break;
     }
    }
   }

   // Fallback to related artist queries if radio was sparse
   if(fresh.length<4){
    const artists=[...new Set(WAVE.map(x=>x.a).concat(FAV_ARTISTS).filter(Boolean))].sort(()=>Math.random()-.5);
    for(const a of artists){
     if(fresh.length>=8)break;
     const r=await searchRemote(`${a} radio`).catch(()=>[]);
     const list=r.length?r:(await searchRemote(`${a} mix`).catch(()=>[]));
     for(const x of list){
      const key=String(x.s)+":"+String(x.id);
      if(x.mode!=="empty"&&!isDisliked(x)&&svc(x.s)?.on&&!isFav(x)&&!played.has(key)&&!WAVE.some(w=>sameTrack(w,x))&&!queue.some(q=>sameTrack(q,x))&&!fresh.some(f=>sameTrack(f,x))){
       fresh.push(x);
       if(fresh.length>=8)break;
      }
     }
    }
   }

   // Genre exploration if still sparse to prevent stopping or looping
   if(fresh.length<3){
    const genres=["synthwave chill","indie pop","future garage","ambient electronic","melodic house"];
    const g=genres[Math.floor(Math.random()*genres.length)];
    const hits=await searchRemote(g).catch(()=>[]);
    for(const x of hits){
     const key=String(x.s)+":"+String(x.id);
     if(x.mode!=="empty"&&!isDisliked(x)&&svc(x.s)?.on&&!isFav(x)&&!played.has(key)&&!WAVE.some(w=>sameTrack(w,x))&&!queue.some(q=>sameTrack(q,x))&&!fresh.some(f=>sameTrack(f,x))){
      fresh.push(x);
      if(fresh.length>=6)break;
     }
    }
   }

   if(!fresh.length)return false;
   // Deduplicate and append fresh discovery tracks
   fresh.forEach(x=>{
    WAVE.push(x);
    queue.push(x);
    if(!TRACKS.some(t=>sameTrack(t,x)))TRACKS.push(x);
   });
   if(fp.dataset.open==="true")renderFPBody();
   return true;
  }finally{
   waveExtendPromise=null;
  }
 })();
 return waveExtendPromise;
}

function prev(){
 if(S.pos>4){S.pos=0;if(A.audio&&S.current?.mode==="local")A.audio.currentTime=0;return paint()}
 while(PREV_STACK.length){
  const candidate=PREV_STACK.pop();
  if(candidate&&!sameTrack(candidate,S.current)&&!isDisliked(candidate)){
   return setTrack(candidate,S.playing,false,undefined,true,true);
  }
 }
 const back=HISTORY.map(h=>h.tr).filter(x=>x&&!sameTrack(x,S.current)&&!isDisliked(x));
 if(back.length){
  const target=back[0];
  for(let k=back.length-1;k>=1;k--){PREV_STACK.push(back[k])}
  return setTrack(target,S.playing,false,undefined,true,true);
 }
 const l=contextPool();if(!l.length)return;
 const i=l.findIndex(x=>sameTrack(x,S.current));
 setTrack(l[(i-1+l.length)%l.length],S.playing,false,undefined,true,true)}
/* Play/pause icon swap without rebuilding every icon on the page.

   sync() runs on play, pause, seek, error and track change. It used to assign
   innerHTML on the button and then call icons(), which walks the whole document
   and replaces every <i data-lucide> element it finds — including the ones in
   the bar that had not changed. That full sweep, several times a second around
   a track change, was the visible flicker. Swapping the one attribute on the
   existing svg costs nothing. */
function setPlayIcon(btn,name,size){
 if(!btn)return;
 const sym=(window.m3Icons?.toSymbolName?window.m3Icons.toSymbolName(name):(name==="pause"?"pause":"play_arrow"));
 const cur=btn.firstElementChild;
 if(cur&&(cur.dataset?.icon===sym||cur.textContent?.trim()===sym))return;
 btn.innerHTML=`<span class="material-symbols-rounded" data-icon="${sym}" style="font-size:${size}px">${sym}</span>`;
}
function initMediaSession(){
 ensureAudioEl();
 if(window.__TAURI__?.event?.listen){
  /* Media keys on Windows come from taskbar.rs, on Linux from mpris.rs; both
     speak this one action vocabulary, and neither decides anything itself. */
  window.__TAURI__.event.listen("meowave://media-action",(e)=>{
   const a=e.payload;
   if(a==="prev")prev();
   else if(a==="play_pause")toggle();
   else if(a==="next")next(true);
   else if(a==="play"){if(!S.playing)toggle()}
   else if(a==="pause"){if(S.playing)toggle()}
   /* MPRIS Stop keeps the track loaded and only rewinds it. */
   else if(a==="stop"){if(S.playing)toggle();seekSeconds(0)}
  });
  /* A seek arrives as an offset when the desktop's widget asked for one, and as
     an absolute position when it dragged the bar. Both are applied against the
     page's own clock, which is the only accurate one. */
  window.__TAURI__.event.listen("meowave://media-seek",(e)=>{
   const t=e.payload||{};
   if(typeof t.abs==="number")seekSeconds(t.abs);
   else if(typeof t.rel==="number")seekSeconds((S.pos||0)+t.rel);
  });
  window.__TAURI__.event.listen("meowave://media-volume",(e)=>{
   const v=Number(e.payload);
   if(!Number.isFinite(v))return;
   S.muted=v<=0;setVolume(v);save();
  });
  /* pushMpris() throttles, so this only has to be often enough to keep the
     extrapolated Position honest. */
  setInterval(pushMpris,5000);
 }
 /* Registered before the guard: anything on the page can call these, and the
    mediaSession check is about the platform controls below, not about us. */
 window.MeowaveNative = {
  play: () => { if (!S.playing) toggle(); },
  pause: () => { if (S.playing) toggle(); },
  toggle: () => toggle(),
  prev: () => prev(),
  next: () => next(true),
  seek: (sec) => seekSeconds(sec)
 };
 if(!('mediaSession' in navigator))return;
 try{
  navigator.mediaSession.setActionHandler('play',()=>{if(!S.playing)toggle()});
  navigator.mediaSession.setActionHandler('pause',()=>{if(S.playing)toggle()});
  navigator.mediaSession.setActionHandler('previoustrack',()=>prev());
  navigator.mediaSession.setActionHandler('nexttrack',()=>next(true));
  navigator.mediaSession.setActionHandler('seekto',details=>{if(details.seekTime!=null)seekSeconds(details.seekTime)});
  navigator.mediaSession.setActionHandler('seekforward',details=>{seekSeconds(Math.min(S.dur||0,S.pos+(details.seekOffset||10)))});
  navigator.mediaSession.setActionHandler('seekbackward',details=>{seekSeconds(Math.max(0,S.pos-(details.seekOffset||10)))});
 }catch(e){console.warn("mediaSession handlers:",e)}
}

function updateMediaSession(tr){
 if(!tr||tr.mode==="empty"){
  try{if(navigator.mediaSession)navigator.mediaSession.playbackState="none"}catch(_){}
  try{window.AndroidNativeMedia?.stop()}catch(_){}
  return;
 }
 try{
  const u=tr.art?cssUrlRaw(tr.art):"";
  /* The app icon goes in first and unconditionally. A data:/blob: cover — or a
     remote one inside Tauri, relayed through tauri.localhost — is not something
     the platform media control can load, and with no artwork entry at all it
     drew an empty tile where the icon used to be. */
  const artwork=[{src:location.origin+"/icons/icon.png",sizes:"512x512",type:"image/png"}];
  if(u&&/^https?:\/\//i.test(u)&&!u.includes("tauri.localhost")){
   artwork.push(
    {src:u,sizes:'96x96',type:'image/png'},
    {src:u,sizes:'128x128',type:'image/png'},
    {src:u,sizes:'256x256',type:'image/png'},
    {src:u,sizes:'512x512',type:'image/png'}
   );
  }
  if('mediaSession' in navigator){
   navigator.mediaSession.metadata=new MediaMetadata({
    title:tr.t||"Meowave",
    artist:tr.a||"—",
    album:tr.al||"Meowave",
    artwork
   });
   navigator.mediaSession.playbackState=S.playing?"playing":"paused";
   if(S.dur>0&&Number.isFinite(S.dur)&&navigator.mediaSession.setPositionState){
    try{
     navigator.mediaSession.setPositionState({
      duration:S.dur,
      playbackRate:Math.max(0.1,S.rate||1),
      position:Math.min(S.dur,Math.max(0,S.pos||0))
     });
    }catch(_){}
   }
  }
  if(window.AndroidNativeMedia?.update){
   const artUrl=(u&&/^https?:\/\//i.test(u)&&!u.includes("tauri.localhost"))?u:"";
   window.AndroidNativeMedia.update(
    tr.t||"Meowave",
    tr.a||"—",
    tr.al||"Meowave",
    artUrl,
    Math.round((S.dur||0)*1000),
    Math.round((S.pos||0)*1000),
    !!S.playing
   );
  }
 }catch(e){console.warn("updateMediaSession:",e)}
}

/* The Linux desktop's media controls (MPRIS) read the player's state from Rust,
   not from the page: WebKitGTK has no navigator.mediaSession, so nothing else
   on Linux would tell them anything. Every push carries the whole state and
   Rust signals only the fields that actually changed, so an idle player is
   silent on the bus. The clock is pushed on a slow timer as well as on state
   changes, because Rust extrapolates Position between pushes and re-anchors
   only on a jump it did not predict. */
let mprisAt=0;
function pushMpris(){
 const now=Date.now();
 if(now-mprisAt<1000)return;
 mprisAt=now;
 if(!window.__TAURI__)return;
 const tr=S.current;
 /* data:/blob: covers are private to the webview, and the relay URL carries
    the audio-proxy token — a bearer token on a bus every local process can
    read is not worth a thumbnail, so only a real remote URL goes out. */
 const art=String(tr?.art||"").trim();
 inv("mpris_update",{now:{
  playing:!!S.playing,
  id:tr&&tr.mode!=="empty"?`${tr.s||""}:${tr.id}`:"",
  title:String(tr?.t||""),
  artist:String(tr?.a||""),
  album:String(tr?.al||""),
  dur:Number.isFinite(S.dur)?Math.max(0,S.dur):0,
  pos:Number.isFinite(S.pos)?Math.max(0,S.pos):0,
  art:/^https?:\/\//i.test(art)?art:"",
  shuffle:!!S.shuffle,
  repeat:!!S.repeat,
  rate:Number.isFinite(S.rate)?S.rate:1,
  volume:S.muted?0:Math.max(0,Math.min(1,S.vol||0))
 }}).catch(()=>{});
}

/* The one place the volume is applied, so the slider, the mute button and the
   desktop's MPRIS volume slider cannot drift apart. */
function setVolume(v){
 S.vol=Math.max(0,Math.min(1,Number(v)||0));
 const sl=document.getElementById("vol");
 if(sl){sl.value=Math.round(S.vol*100);paintRange(sl)}
 const mb=document.getElementById("mute");
 if(mb){
  mb.setAttribute("aria-pressed",String(!!S.muted));
  mb.innerHTML=`<span class="material-symbols-rounded">${(S.muted||S.vol===0)?"volume_off":(S.vol<0.5?"volume_down":"volume_up")}</span>`;
 }
 if(A.gain)A.gain.gain.setTargetAtTime(S.muted?0:S.vol,A.ctx.currentTime,.02);
 fpxVolume();
}

function sync(){
  /* Friends see play / pause within seconds, not at the next minute tick. */
  clearTimeout(sync.pt);sync.pt=setTimeout(()=>{if(typeof presBeat==="function")presBeat(false)},2500);
  const name=S.playing?"pause":"play";
  setPlayIcon(document.getElementById("play"),name,18);
  if(typeof window.paintHero==="function")window.paintHero();
  F.mode=S.playing?"flow":"cloud";
  const fpc=document.getElementById("fpc");
  if(fpc)fpc.dataset.playing=S.playing?"true":"false";
  fpxMorph(S.playing);
  const fpPlay=document.querySelector("#fpc .fpx-play");if(fpPlay)fpPlay.title=S.playing?t("np.pause"):t("np.play");
  updateMediaSession(S.current);
  if(window.__TAURI__){
   inv("taskbar_set_playing",{playing:!!S.playing}).catch(()=>{});
  }
  pushMpris();
}

/* nav */
function go(v){
  if(!v)return;
  /* Settings are a window over the page now, not a page of their own. */
  if(v==="settings"){openSettings();return}
  if(settingsIsOpen())closeSettings(true);
  S.view=v;
  /* The screen name on <html> lets CSS place things per screen without
     body:has(#v-home[data-active]) — a :has() over the whole document that
     made every DOM change anywhere re-check hundreds of icons. */
  document.documentElement.dataset.view=v;
  const extraTabs = ["people", "chats", "rooms", "top", "profile", "settings"];
  const rail = document.getElementById("rail");
  if(rail){
    if(extraTabs.includes(v)) rail.dataset.stage = "extra";
    else if(["home", "search", "library"].includes(v)) rail.dataset.stage = "main";
  }
  document.querySelectorAll(".navbtn").forEach(b=>b.setAttribute("aria-current",b.dataset.nav===v));
  paintRail();
 /* Hidden views are skipped by the renderer (content-visibility). Chromium
    keeps their scroll offset; WebKit may not, so it is noted on the way out
    and put back on the way in if the engine dropped it. */
 const was=document.querySelector('.view[data-active="true"]');
 if(was)was.dataset.st=String(Math.round(was.scrollTop));
 document.querySelectorAll(".view").forEach(x=>x.dataset.active=(x.id==="v-"+v));
 const now=document.getElementById("v-"+v);
 if(now&&now!==was&&+now.dataset.st>0&&now.scrollTop===0)now.scrollTop=+now.dataset.st;
 cv.classList.toggle("dim",v!=="home");
 document.getElementById("fieldgl")?.classList.toggle("dim",v!=="home");
 if(v==="search")search(document.getElementById("q").value);
 /* Social screens rebuild on entry; leaving one stops its polling so a
    forgotten timer never keeps hitting the API from the background. */
  /* The conversation lives inside the People tab now: the old "chats" view id
     never matches, so this used to wipe SOC.chat on the way in from openChat
     and the chat opened into nothing. */
  if(v!=="people"&&SOC.chat){SOC.chat=null;socClear("chat")}
  if(v!=="chats")socClear("msgr");
  if(v==="people")renderPeople();
  if(v==="chats"&&typeof renderMessenger==="function")renderMessenger();
  if(v==="rooms")SOC.room?paintRoomShell():renderRooms();
  if(v==="top")renderTop();
  if(v==="quests")renderQuestsView();
  /* The profile is painted once per load; badges can be put on or taken off
     in Achievements meanwhile, so a stale header is rebuilt on the way in. */
  if(v==="profile"){const u=document.querySelector("#profbody .uname");
   if(u&&u.dataset.worn!==myBadges().join(","))renderProfile();else paintProfileTrack()}
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
      re-render. Messages have their own poll via socTimer("msgr",…). */
   if(v==="people"){
    if(isProfileCard())return;
    if(PEOPLE_TAB==="find")return;
    renderPeople();
    return}
   if(v==="top")renderTop();
   if(v==="quests")renderQuestsView()};
  if(v==="people")socTimer("live",tick,6000);
  else if(v==="top")socTimer("live",tick,20000);
  else if(v==="quests")socTimer("live",tick,15000)}
/* A window that comes back from the background should not show a stale screen
   for the rest of the interval. */
document.addEventListener("visibilitychange",()=>{
 if(!document.hidden&&sbUser)liveRefresh(S.view)});
document.getElementById("nav-more-btn")?.addEventListener("click",e=>{
 e.stopPropagation();
 const rail=document.getElementById("rail");
 if(rail){
  rail.dataset.stage="extra";
  paintRail();
 }
});
document.getElementById("nav-back-btn")?.addEventListener("click",e=>{
 e.stopPropagation();
 const rail=document.getElementById("rail");
 if(rail){
  rail.dataset.stage="main";
  paintRail();
 }
});
document.querySelectorAll(".navbtn[data-nav]").forEach(b=>b.onclick=()=>go(b.dataset.nav));
const qInp=document.getElementById("q");
const qClear=document.getElementById("search-clear");
if(qInp){
 qInp.addEventListener("input",e=>{
  if(qClear)qClear.classList.toggle("visible",!!e.target.value);
  go("search");
  search(e.target.value);
 });
 qInp.addEventListener("focus",()=>go("search"));
}
if(qClear){
 qClear.addEventListener("click",()=>{
  if(qInp){
   qInp.value="";
   qClear.classList.remove("visible");
   search("");
   qInp.focus();
  }
 });
}
function toggleService(sid){
 const target=SERVICES.find(x=>x.id===sid);
 if(!target)return;
 if(!target.conn)return go("settings");
 target.on=!target.on;
 if(!target.on){
  WAVE=WAVE.filter(x=>x.s!==sid);
  queue=queue.filter(x=>x.s!==sid);
  if(fp.dataset.open==="true")renderFPBody();
  if(S.current?.s===sid){
   if(queue.length)next(true);
   else stopAtEnd();
  }
 }
 renderSrv();save();pushPrefs?.();
 if(S.view==="search")search(document.getElementById("q").value);
}
document.getElementById("srv")?.addEventListener("click",e=>{
 const b=e.target.closest("[data-svc]");if(!b)return;
 toggleService(b.dataset.svc);
});
document.getElementById("srv-dd-list")?.addEventListener("click",e=>{
 const b=e.target.closest("[data-svc]");if(!b)return;
 toggleService(b.dataset.svc);
});
const srvDdBtn=document.getElementById("srv-dd-btn");
const srvDdSheet=document.getElementById("srv-dd-sheet");
const srvDdBackdrop=document.getElementById("srv-dd-backdrop");
const srvDdClose=document.getElementById("srv-dd-close");
function toggleSrvDropdown(open){
 if(!srvDdSheet)return;
 const isOpen=open!==undefined?open:srvDdSheet.hidden;
 srvDdSheet.hidden=!isOpen;
 if(srvDdBackdrop)srvDdBackdrop.hidden=!isOpen;
 if(srvDdBtn)srvDdBtn.setAttribute("aria-expanded",String(isOpen));
}
srvDdBtn?.addEventListener("click",()=>toggleSrvDropdown());
addEventListener("resize",()=>{if(srvDdSheet&&!srvDdSheet.hidden)toggleSrvDropdown(false)});
srvDdClose?.addEventListener("click",()=>toggleSrvDropdown(false));
srvDdBackdrop?.addEventListener("click",()=>toggleSrvDropdown(false));
/* The "by artist / similar" switch is gone: the wave is always seeded from
   favorite tracks now. */
document.getElementById("libtabs").addEventListener("click",e=>{
 const b=e.target.closest("[data-tab]");if(!b)return;S.tab=b.dataset.tab;
 [...b.parentElement.children].forEach(x=>x.setAttribute("aria-selected",x===b));renderLib()});
/* ═══════════════ settings window ═══════════════
   Settings open as a window over the page (Liner-like) instead of replacing
   it: a 240px side rail with search and sections, a header with the section
   name and a close button. The #v-settings node is moved into a body-level
   layer at boot — the views are transformed, and a transformed ancestor would
   trap a fixed overlay inside the page. */
const SETOV={t:0,focus:null,mo:null};
function setovInit(){
 if(document.getElementById("setov"))return;
 const v=document.getElementById("v-settings");if(!v)return;
 const ru=LANG==="ru";
 const ov=document.createElement("div");ov.className="setov";ov.id="setov";ov.hidden=true;ov.dataset.open="false";
 ov.innerHTML=`<div class="setov-scrim" data-setov-close></div>`;
 v.classList.remove("view");v.classList.add("setov-box");v.dataset.active="false";
 v.setAttribute("role","dialog");v.setAttribute("aria-modal","true");v.setAttribute("aria-labelledby","setov-title");
 const side=document.createElement("aside");side.className="setov-side";
 const vh=v.querySelector(":scope>.vh");if(vh)side.appendChild(vh);
 side.insertAdjacentHTML("beforeend",`<label class="setov-search"><span class="material-symbols-rounded" aria-hidden="true">search</span><input id="setov-q" type="search" autocomplete="off" spellcheck="false" data-i18n-ph="set.search" placeholder="${ru?"Поиск настроек":"Search settings"}"></label>`);
 const tabs=document.getElementById("settabs");if(tabs){side.appendChild(tabs);tabs.setAttribute("aria-orientation","vertical")}
 side.insertAdjacentHTML("beforeend",`<p class="setov-none" id="setov-none" hidden></p>`);
 const main=document.createElement("section");main.className="setov-main";
 main.innerHTML=`<header class="setov-head"><h3 id="setov-title"></h3><button class="ic sm setov-close" id="setov-close" data-i18n-title="close" title="${ru?"Закрыть":"Close"}" aria-label="close"><span class="material-symbols-rounded">close</span></button></header><div class="setov-body" id="setov-body"></div>`;
 const body=main.querySelector(".setov-body");
 v.querySelectorAll(":scope>.stab").forEach(p=>body.appendChild(p));
 v.replaceChildren(side,main);
 ov.appendChild(v);document.body.appendChild(ov);
 ov.addEventListener("click",e=>{if(e.target.closest("[data-setov-close],#setov-close"))closeSettings()});
 const q=document.getElementById("setov-q");
 q?.addEventListener("input",()=>setovSearch(q.value));
 q?.addEventListener("keydown",e=>{
  if(e.key==="Escape"){e.preventDefault();e.stopPropagation();if(q.value){q.value="";setovSearch("")}else closeSettings()}
  if(e.key==="Enter"){const hit=body.querySelector('.stab[data-active="true"] [data-hit="true"]');hit?.scrollIntoView({block:"center",behavior:"smooth"})}});
 /* Segmented controls repaint their pill from an observer that only watches
    #app; this layer lives outside it now. */
 SETOV.mo=new MutationObserver(ms=>{const seen=new Set();
  ms.forEach(m=>{const s=m.target.closest?.(".seg");if(s&&!seen.has(s)){seen.add(s);paintSeg(s)}})});
 SETOV.mo.observe(ov,{subtree:true,attributes:true,attributeFilter:["aria-pressed"]});
 /* Focus stays inside the window while it is open. */
 ov.addEventListener("keydown",e=>{
  if(e.key!=="Tab")return;
  const f=[...v.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
  if(!f.length)return;
  const a=f[0],z=f[f.length-1];
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}
  else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}});
 setovTitle()}
function setovTitle(){
 const h=document.getElementById("setov-title");if(!h)return;
 const b=document.querySelector(`#settabs [data-stab="${S.stab||"acc"}"]`);
 h.textContent=b?b.textContent.replace(/^\s*\S+\s+/,"").trim()||b.textContent.trim():t("set.t");
 const lab=b?.querySelector("[data-i18n]");if(lab)h.textContent=lab.textContent;
 /* The first card of a tab often repeats the tab's name; the header says it already. */
 document.querySelectorAll("#setov-body>.stab").forEach(st=>{
  const k=(document.querySelector(`#settabs [data-stab="${st.dataset.stab}"] [data-i18n]`)?.textContent||"").trim().toLowerCase();
  const x=st.querySelector(":scope>.panel:first-child>h3");if(!x)return;
  if(k&&x.textContent.trim().toLowerCase()===k)x.dataset.dup="true";else x.removeAttribute("data-dup")})}
function settingsIsOpen(){const ov=document.getElementById("setov");return !!ov&&!ov.hidden&&ov.dataset.open==="true"}
function openSettings(tab){
 setovInit();
 const ov=document.getElementById("setov"),v=document.getElementById("v-settings");if(!ov||!v)return;
 clearTimeout(SETOV.t);
 if(tab)S.stab=tab;
 if(!settingsIsOpen())SETOV.focus=document.activeElement;
 ov.hidden=false;void ov.offsetWidth;ov.dataset.open="true";v.dataset.active="true";
 document.documentElement.dataset.setov="open";
 showSettingsTab(S.stab||"acc");
 document.querySelectorAll(".navbtn").forEach(b=>b.setAttribute("aria-current",b.dataset.nav==="settings"));
 paintRail();
 if(FINE)setTimeout(()=>document.getElementById("setov-q")?.focus({preventScroll:true}),80)}
function closeSettings(instant){
 const ov=document.getElementById("setov"),v=document.getElementById("v-settings");
 if(!ov||ov.hidden)return;
 clearTimeout(SETOV.t);
 ov.dataset.open="false";if(v)v.dataset.active="false";
 delete document.documentElement.dataset.setov;
 document.querySelectorAll(".navbtn").forEach(b=>b.setAttribute("aria-current",b.dataset.nav===S.view));
 paintRail();
 const q=document.getElementById("setov-q");if(q&&q.value){q.value="";setovSearch("")}
 if(instant||RM)ov.hidden=true;
 else SETOV.t=setTimeout(()=>{if(ov.dataset.open!=="true")ov.hidden=true},280);
 const f=SETOV.focus;SETOV.focus=null;
 if(f&&f.isConnected&&!instant)try{f.focus({preventScroll:true})}catch(_){}}
/* Search: sections without a match leave the rail, the first matching one
   opens, and the matching rows are marked so the eye lands on them. */
function setovSearch(raw){
 const q=(raw||"").trim().toLowerCase();
 const body=document.getElementById("setov-body");if(!body)return;
 const none=document.getElementById("setov-none");
 const tabs=[...document.querySelectorAll("#settabs [data-stab]")];
 body.querySelectorAll("[data-hit]").forEach(x=>x.removeAttribute("data-hit"));
 body.dataset.search=q?"true":"false";
 if(!q){tabs.forEach(b=>b.hidden=false);if(none)none.hidden=true;return}
 const hitTabs=[];
 tabs.forEach(b=>{
  const pane=body.querySelector(`.stab[data-stab="${b.dataset.stab}"]`);
  let hit=b.textContent.toLowerCase().includes(q);
  pane?.querySelectorAll(".field,.panel>h3,.panel>.ph").forEach(f=>{
   if(f.textContent.toLowerCase().includes(q)){f.dataset.hit="true";hit=true}});
  b.hidden=!hit;if(hit)hitTabs.push(b.dataset.stab)});
 if(none){none.hidden=hitTabs.length>0;none.textContent=LANG==="ru"?"Ничего не найдено":"Nothing found"}
 if(hitTabs.length&&!hitTabs.includes(S.stab)){S.stab=hitTabs[0];showSettingsTab(S.stab)}
 const first=body.querySelector(`.stab[data-stab="${S.stab}"] [data-hit="true"]`);
 if(first)first.scrollIntoView({block:"nearest"})}
document.getElementById("settabs").addEventListener("click",e=>{
 const b=e.target.closest("[data-stab]");if(!b)return;
 S.stab=b.dataset.stab;showSettingsTab(S.stab);save()});
function showSettingsTab(id){
 document.querySelectorAll("#settabs [data-stab]").forEach(b=>b.setAttribute("aria-selected",b.dataset.stab===id));
 document.querySelectorAll(".stab").forEach(p=>p.dataset.active=(p.dataset.stab===id));
 setovTitle();
 const sc=document.getElementById("setov-body");if(sc&&!(sc.dataset.search==="true"))sc.scrollTop=0;
 if(id==="lib")refreshCacheSize();
 if(id==="acc")accRefreshAll();
 if(id==="net"){pxLoad();paintDiscord()}
 if(id==="look")paintLyPanel();
 if(id==="priv"&&typeof paintE2EDevices==="function")paintE2EDevices();
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
   if(fp.dataset.open==="true")renderFPBody();
   return}
  setTrack(tr,true,false,from);
  return}
 const ts=e.target.closest("[data-toksave]");
 if(ts){const id=ts.dataset.toksave,inp=document.getElementById("tok-"+id),v=(inp?.value||"").trim();
  if(!v){inp?.focus();return}
  saveToken(id,v).then(()=>{const s=svc(id);s.conn=true;s.on=true;tokOpen=null;renderAccounts();renderSrv();icons()})
   .catch(err=>console.error("token save failed",err));
  return}
 const spCidToggle=e.target.closest("[data-sp-cid-toggle]");
 if(spCidToggle){
  tokOpen=tokOpen==="sp"?null:"sp";
  renderAccounts();icons();return;
 }
 const spCidBtn=e.target.closest("#sp-cid-keychain-save");
 if(spCidBtn){
  const inp=document.getElementById("sp-cid-keychain");
  const v=(inp?.value||"").trim();
  inv("spotify_set_client_id",{clientId:v}).then(()=>{
   SP_CLIENT_ID=v;
   toast(LANG==="ru"?"Client ID сохранён":"Client ID saved");
   tokOpen=null;
   renderAccounts();renderSpotify();icons();
  }).catch(err=>toast(String(err.message||err)));
  return;
 }
 const a=e.target.closest("[data-acc]");
 if(a){const s=svc(a.dataset.acc);
  if(s.free)return;
  if(s.id==="sp"){
   (async()=>{
    if(s.conn){
     await inv("spotify_logout").catch(()=>{});
     SP={me:null,lists:null};
     await initServices();
     renderSpotify();
    }else{
     let cid=SP_CLIENT_ID||(await inv("spotify_get_client_id").catch(()=>""))||"";
     if(!cid){
      const entered=prompt(LANG==="ru"
       ?"Введите Client ID Spotify (из developer.spotify.com/dashboard, Redirect URI: http://localhost:8080/callback):"
       :"Enter Spotify Client ID (from developer.spotify.com/dashboard, Redirect URI: http://localhost:8080/callback):");
      if(entered&&entered.trim()){
       await inv("spotify_set_client_id",{clientId:entered.trim()}).catch(()=>{});
       SP_CLIENT_ID=entered.trim();
       cid=SP_CLIENT_ID;
      }else{
       tokOpen="sp";
       renderAccounts();icons();
       return;
      }
     }
     toast(t("sp.browser"));
     try{
      SP.me=await inv("spotify_login");
      await initServices();
      renderSpotify();
     }catch(err){toast(String(err.message||err),5200)}
    }
    renderAccounts();renderSrv();icons();
   })();
   return;
  }
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
 const sw=e.target.closest("[data-sw]");if(sw){if(e.target.closest("input"))return;setAccent(sw.dataset.sw);return}});
/* The wave is seeded from favorite tracks, history, or favorite artists,
   then extended indefinitely using radio recommendation streams. */
const WAVE_MIN=1;
const favTracks=()=>TRACKS.filter(x=>x.fav&&x.mode!=="empty");
function renderWaveHint(){
 const el=document.getElementById("wavehint");if(!el)return;
 const favCount=favTracks().filter(x=>svc(x.s)?.on).length;
 const totalSeeds=favCount + (FAV_ARTISTS.length?1:0) + (HISTORY.length?1:0);
 const ok=totalSeeds>=WAVE_MIN;
 el.dataset.ready=ok?"true":"false";
 el.innerHTML=ok
  ?t("wave.ready").replace("{n}",`<b>${Math.max(favCount,1)}</b>`)
  :t("wave.need").replace("{n}",`<b>${favCount}/${WAVE_MIN}</b>`)}

/* Starts the wave: picks seeds, retrieves radio recommendations, mixes 20% anchors
   with 80% discovery, and launches uninterrupted playback. */
async function startWave(){
 if(typeof wave2Start==="function")return wave2Start();
 return startWaveLegacy()}
async function startWaveLegacy(){
 const favs=favTracks().filter(x=>svc(x.s)?.on);
 const hist=HISTORY.map(h=>h.tr).filter(x=>x&&x.mode!=="empty"&&!isDisliked(x)&&svc(x.s)?.on);
 const library=TRACKS.filter(x=>x&&x.mode!=="empty"&&!isDisliked(x)&&svc(x.s)?.on);

 let seedCandidates=[...favs];
 if(!seedCandidates.length)seedCandidates=[...hist];
 if(!seedCandidates.length)seedCandidates=[...library];

 if(!seedCandidates.length&&!FAV_ARTISTS.length){
  go("search");
  toast(t("wave.need.toast").replace("{n}","1"));
  document.getElementById("q")?.focus();
  return;
 }

 await ensureStreamPort();
 const btn=document.getElementById("start");
 btn?.setAttribute("aria-busy","true");
 try{
  WAVE_SESSION_PLAYED.clear();
  const shuffledSeeds=seedCandidates.slice().sort(()=>Math.random()-.5);
  const pickedSeeds=shuffledSeeds.slice(0,3);

  const isFavorite = tr => favs.some(f=>sameTrack(f,tr));
  const discovered=[];
  for(const s of pickedSeeds){
   const rad=await fetchRadioTracks(s);
   rad.forEach(x=>{
    if(!isDisliked(x)&&svc(x.s)?.on&&!isFavorite(x)&&!discovered.some(y=>sameTrack(y,x))){
     discovered.push(x);
     if(!TRACKS.some(y=>sameTrack(y,x)))TRACKS.push(x);
    }
   });
   if(discovered.length>=12)break;
  }

  // Broaden discovery via favorite artists and seed artists
  const allArtists=[...new Set([...pickedSeeds.map(s=>s.a),...FAV_ARTISTS,...seedCandidates.map(s=>s.a)].filter(Boolean))].sort(()=>Math.random()-.5);
  for(const art of allArtists){
   if(discovered.length>=14)break;
   const r=await searchRemote(`${art} radio`).catch(()=>[]);
   const hits=r.length?r:(await searchRemote(`${art} mix`).catch(()=>[]));
   hits.forEach(x=>{
    if(!isDisliked(x)&&svc(x.s)?.on&&!isFavorite(x)&&!discovered.some(y=>sameTrack(y,x))){
     discovered.push(x);
     if(!TRACKS.some(y=>sameTrack(y,x)))TRACKS.push(x);
    }
   });
  }

  // Broaden with genres / mood queries if still needed
  if(discovered.length<8){
   const queries=["chill indie","electronic synthwave","cyberpunk phonk","lo-fi beats","alternative rock"];
   const q=queries[Math.floor(Math.random()*queries.length)];
   const fallbackHits=await searchRemote(q).catch(()=>[]);
   fallbackHits.forEach(x=>{
    if(!isDisliked(x)&&svc(x.s)?.on&&!isFavorite(x)&&!discovered.some(y=>sameTrack(y,x))){
     discovered.push(x);
     if(!TRACKS.some(y=>sameTrack(y,x)))TRACKS.push(x);
    }
   });
  }

  // 1 anchor (20%) to 4 discovery (80%)
  const anchors=pickedSeeds.length?pickedSeeds:seedCandidates.slice(0,2);
  const discPool=discovered.slice().sort(()=>Math.random()-.5);
  const pool=[];
  let aIdx=0,dIdx=0;
  while(dIdx<discPool.length||aIdx<anchors.length){
   if(aIdx<anchors.length&&(pool.length===0||pool.length%5===0)){
    pool.push(anchors[aIdx++]);
   }else if(dIdx<discPool.length){
    pool.push(discPool[dIdx++]);
   }else if(aIdx<anchors.length){
    pool.push(anchors[aIdx++]);
   }
  }

  const finalPool=pool.filter(x=>x&&svc(x.s)?.on&&!isDisliked(x));
  if(!finalPool.length){toast(t("wave.empty"));return}
  WAVE=finalPool;
  await setTrack(finalPool[0],true,true,"wave");
  if(fp.dataset.open==="true")renderFPBody();
 }catch(err){
  console.error("startWave error:",err);
  toast(err.message||String(err));
 }finally{
  btn?.removeAttribute("aria-busy");
 }
}
document.getElementById("start").onclick=startWave;
document.getElementById("play").onclick=toggle;
document.getElementById("next").onclick=()=>next(true);
document.getElementById("prev").onclick=prev;
document.getElementById("shuffle").onclick=()=>setShuffle(!S.shuffle);
document.getElementById("repeat").onclick=()=>setRepeat(!S.repeat);
document.getElementById("vol").oninput=e=>{S.muted=false;setVolume(e.target.value/100);save()};
document.getElementById("mute").onclick=()=>{S.muted=!S.muted;setVolume(S.vol)};
/* Speed and loudness. initAudio() is called first because the graph may not
   exist yet if the user reaches for these before pressing play. */
document.getElementById("rate").oninput=e=>{
 initAudio();S.rate=+e.target.value/100;applyRate();save()};
document.getElementById("ratechips").onclick=e=>{
 const b=e.target.closest("[data-rate]");if(!b)return;
 initAudio();S.rate=+b.dataset.rate;applyRate();save()};
document.getElementById("boost").oninput=e=>{
 initAudio();S.boost=+e.target.value/100;applyBoost();save()};
document.getElementById("sp3d").onclick=()=>{initAudio();S.sp.on=!S.sp.on;applySpatial();save();updateSpButtons()};
/* Progress bar. While the handle is dragged, timeupdate is ignored: it used to
   yank the handle back to the stale position on every frame. */
let seeking=false;
/* Seeks to an absolute position in seconds. Shared by the lyrics and by
   anything else that knows a timestamp rather than a pixel. */
function seekSeconds(pos){
 const effectiveDur = (Number.isFinite(S.dur) && S.dur > 0) ? S.dur : (S.current?.d ? +S.current.d : (A.audio?.duration > 0 && Number.isFinite(A.audio.duration) ? A.audio.duration : 0));
 const p = Math.max(0, Math.min(pos, effectiveDur || pos));
 S.pos = p;
 paint();
 if(A.audio){
  try{
   A.pendingSeek = p;
   A.seekingUntil = Date.now() + 800;
   A.audio.currentTime = p;
  }catch(e){
   console.warn("seek:", e);
  }
 }
}
function seekTo(trackEl, x, commit){
 const r = trackEl.getBoundingClientRect();
 if(!r.width) return;
 const effectiveDur = (Number.isFinite(S.dur) && S.dur > 0) ? S.dur : (S.current?.d ? +S.current.d : (A.audio?.duration > 0 && Number.isFinite(A.audio.duration) ? A.audio.duration : 0));
 const ratio = Math.max(0, Math.min(1, (x - r.left) / r.width));
 const pos = ratio * (effectiveDur || 0);
 S.pos = pos;
 paint();
 /* Without a known duration a committed drag always lands on 0:00; only the
    visual preview is meaningful while metadata is still loading. */
 if(commit && effectiveDur > 0 && A.audio){
  try{
   A.pendingSeek = pos;
   A.seekingUntil = Date.now() + 800;
   A.audio.currentTime = pos;
  }catch(e){
   console.warn("seek:", e);
  }
 }
}
function wireSeek(id){
 const el = document.getElementById(id);
 if(!el) return;
 const trackEl = el.classList.contains("track") ? el : (el.querySelector(".track") || el);
 el.addEventListener("pointerdown", e => {
  if(e.target.closest(".t")) return;
  e.stopPropagation();
  const activeDur = (Number.isFinite(S.dur) && S.dur > 0) ? S.dur : (S.current?.d ? +S.current.d : (A.audio?.duration > 0 && Number.isFinite(A.audio.duration) ? A.audio.duration : 0));
  if(!activeDur && (!A.audio || !A.audio.currentTime)) return;
  seeking = true;
  el.setPointerCapture?.(e.pointerId);
  seekTo(trackEl, e.clientX, false);
  const mv = ev => {
   if(seeking) seekTo(trackEl, ev.clientX, false);
  };
  const up = ev => {
   if(seeking){
    seeking = false;
    seekTo(trackEl, ev.clientX, true);
   }
   el.removeEventListener("pointermove", mv);
   el.removeEventListener("pointerup", up);
   el.removeEventListener("pointercancel", up);
  };
  el.addEventListener("pointermove", mv);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
 });
}
wireSeek("btrack");
wireSeek("seek");

/* EQ dock */
const dock=document.getElementById("dock"),eqbtn=document.getElementById("eqbtn");
const dockBackdrop=document.getElementById("dock-backdrop");
const dockClose=document.getElementById("dock-close");
const dockSpSw=document.getElementById("dock-sp-sw");

function updateSpButtons(){
 const on=!!S.sp.on;
 ["sp-on","sp3d"].forEach(id=>document.getElementById(id)?.setAttribute("aria-pressed",String(on)));
 if(dockSpSw)dockSpSw.setAttribute("aria-pressed",String(on));
 document.querySelectorAll("#fp-sp-btn").forEach(btn=>{
  btn.classList.toggle("active",on);btn.setAttribute("aria-pressed",String(on));
 });
}

function openDockSheet(open){
 if(!dock)return;
 const isCurrentlyOpen = dock.dataset.open === "true";
 const nextOpen = (typeof open === "boolean") ? open : !isCurrentlyOpen;
 dock.dataset.open = String(nextOpen);
 if(eqbtn)eqbtn.setAttribute("aria-expanded", String(nextOpen));
 document.getElementById("fp-eq-btn")?.setAttribute("aria-pressed",String(nextOpen));
 if(dockBackdrop)dockBackdrop.hidden = !nextOpen;
}
window.openDockSheet=openDockSheet;
/* The topmost dismissible layer, for Escape. */
function closeTopLayer(){
 if(typeof window.mwCloseLayer==="function"&&window.mwCloseLayer())return true;
 const pop=document.querySelector("#sleep-pop,#src-pop");
 if(pop){pop.remove();return true}
 if(srvDdSheet&&!srvDdSheet.hidden){toggleSrvDropdown(false);srvDdBtn?.focus();return true}
 if(fpSettingsOpen()){fpSettings(false);return true}
 if(dock?.dataset.open==="true"){openDockSheet(false);return true}
 if(settingsIsOpen()){closeSettings();return true}
 return false}
/* The equaliser closes on a press anywhere outside it (its own buttons
   excepted, which toggle it). Menus opened from inside it live in <body>, so
   a press inside one of those does not count as outside. */
document.addEventListener("pointerdown",e=>{
 if(dock?.dataset.open!=="true")return;
 const t=e.target;if(!(t instanceof Element))return;
 if(t.closest("#dock,#eqbtn,#fp-eq-btn,.ctx,.mw-pop,.modalwrap,.toasts"))return;
 openDockSheet(false)},true);

if(eqbtn)eqbtn.onclick=()=>openDockSheet();
if(dockClose)dockClose.onclick=()=>openDockSheet(false);
if(dockBackdrop)dockBackdrop.onclick=()=>openDockSheet(false);
if(dock){
 let startY=0, curY=0, startTime=0, isDragging=false;
 dock.addEventListener("touchstart",(e)=>{
  if(dock.scrollTop>6&&!e.target.closest(".dock-handle, .dock-header"))return;
  if(e.touches.length!==1)return;
  startY=e.touches[0].clientY;curY=startY;startTime=Date.now();isDragging=true;
  dock.style.transition="none";
 },{passive:true});
 dock.addEventListener("touchmove",(e)=>{
  if(!isDragging||e.touches.length!==1)return;
  const y=e.touches[0].clientY,dy=y-startY;
  if(dy>0){curY=y;dock.style.transform=`translateY(${dy}px)`}
  else{dock.style.transform=""}
 },{passive:true});
 const endDrag=()=>{
  if(!isDragging)return;
  isDragging=false;dock.style.transition="";
  const dy=curY-startY,elapsed=Date.now()-startTime,velocity=dy/Math.max(1,elapsed);
  if(dy>90||(dy>40&&velocity>0.35)){openDockSheet(false)}
  dock.style.transform="";
 };
 dock.addEventListener("touchend",endDrag,{passive:true});
 dock.addEventListener("touchcancel",endDrag,{passive:true});
}
if(dockSpSw)dockSpSw.onclick=()=>{
 initAudio();
 S.sp.on=!S.sp.on;
 applySpatial();
 save();
 updateSpButtons();
 toast(S.sp.on ? (LANG==="ru"?"3D звук: включён":"3D audio: on") : (LANG==="ru"?"3D звук: выключен":"3D audio: off"));
};
document.getElementById("bands").addEventListener("pointerdown",e=>{
 const vt=e.target.closest(".vt");if(!vt)return;const i=+vt.dataset.b;
 try{vt.setPointerCapture(e.pointerId)}catch(_){}
 const mv=ev=>{const r=vt.getBoundingClientRect();setBand(i,((r.height/2)-(ev.clientY-r.top))/(r.height/2)*12)};
 const up=()=>{
  vt.removeEventListener("pointermove",mv);
  vt.removeEventListener("pointerup",up);
  vt.removeEventListener("pointercancel",up);
  try{vt.releasePointerCapture(e.pointerId)}catch(_){}
 };
 mv(e);
 vt.addEventListener("pointermove",mv);
 vt.addEventListener("pointerup",up);
 vt.addEventListener("pointercancel",up);
});
/* The bands stretch with the dock on wide screens; knobs are placed in
   pixels, so they are re-placed when the strip changes height. */
if(typeof ResizeObserver==="function"){const bb=document.getElementById("bands");
 let bh=0;if(bb)new ResizeObserver(en=>{const h=Math.round(en[0]?.contentRect.height||0);if(h!==bh){bh=h;FREQ.forEach((_,i)=>paintBand(i))}}).observe(bb)}
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
let fpIdleTimer=null;
/* The controls fade out after a few seconds without the pointer moving (unless
   that is turned off). They stay while the pointer rests on them, while the
   settings sheet or a menu is open, and while paused. */
function fpWake(){
 const c=document.getElementById("fpc");
 if(!c)return;
 if(c.dataset.active!=="true")c.dataset.active="true";
 clearTimeout(fpIdleTimer);
 if(!S.playing||S.x.idle===false||fpSettingsOpen())return;
 fpIdleTimer=setTimeout(()=>{
  if(fp.dataset.open!=="true"||!S.playing||S.x.idle===false||fpSettingsOpen())return;
  if(document.querySelector("#sleep-pop,#src-pop")||c.querySelector(".fpx-panel:hover,.fpx-top:hover")){fpWake();return}
  c.dataset.active="false"},3500)}
/* Beat pulse: the cover breathes with the low end. A fast and a slow average
   of the bass; only the part of the fast one above the slow one (an onset)
   moves the cover, so a loud but steady track does not just sit inflated. */
const BEAT={fast:0,slow:0,v:0,el:null};
function fpBeatReset(){BEAT.v=BEAT.fast=BEAT.slow=0;if(BEAT.el){BEAT.el.style.scale="";BEAT.el=null}}
function fpBeat(dt){
 if(!S.x.beat||RM||!A.an||!A.data)return;
 if(!S.playing){if(BEAT.el)fpBeatReset();return}
 const el=BEAT.el?.isConnected?BEAT.el:(BEAT.el=document.querySelector("#fpc .fpx-art"));
 if(!el)return;
 A.an.getByteFrequencyData(A.data);
 const d=A.data,lv=(d[0]+d[1]*1.2+d[2]+d[3]*.6)/(3.8*255);
 BEAT.fast+=(lv-BEAT.fast)*Math.min(1,dt*20);
 BEAT.slow+=(lv-BEAT.slow)*Math.min(1,dt*1.6);
 const want=Math.min(.05,Math.max(0,BEAT.fast-BEAT.slow*1.04)*.55);
 BEAT.v+=(want-BEAT.v)*Math.min(1,dt*(want>BEAT.v?26:6));
 const s=(1+BEAT.v).toFixed(4);
 if(el.style.scale!==s)el.style.scale=s}
function applyFPSettings(){
 const fpEl=document.getElementById("fp");
 if(!fpEl)return;
 const X=S.x,d=fpEl.dataset;
 d.bgMode=S.fpBgMode||"dynamic";
 d.shrink=String(X.shrink!==false);
 d.beat=String(!!X.beat);
 d.lyAlign=["left","center","right"].includes(X.lyAlign)?X.lyAlign:"left";
 d.lyBlur=String(X.lyBlur!==false);
 d.idle=String(X.idle!==false);
 fpEl.style.setProperty("--fp-glow",((S.fpGlow??100)/100).toFixed(2));
 fpEl.style.setProperty("--fp-blur",`${S.fpBlur??75}px`);
 const M=window.MWFX;
 if(M){M.flow.speed?.((X.flowSpeed??100)/100);M.flow.kick();M.wall.render()}
 const fpc=document.getElementById("fpc");
 if(fpc)fpc.dataset.zoom=S.fpZoom||"normal";
 const fill=S.lyKaraoke||"karaoke";
 for(const id of ["fplyr","lyr"]){const el=document.getElementById(id);if(el)el.dataset.karaoke=fill}
 if(!X.beat)fpBeatReset();
 if(X.idle===false||!S.playing)fpWake()}
/* Settings sheet helpers: segmented groups, ranges with their readouts, switches. */
function fpSegPaint(id,attr,val){
 document.querySelectorAll(`#${id} .seg-btn`).forEach(b=>{const on=b.dataset[attr]===val;
  b.classList.toggle("active",on);b.setAttribute("aria-pressed",String(on))})}
function fpRangePaint(id,val,txt){
 const r=document.getElementById(id);if(r){r.value=val;paintRange(r)}
 const v=document.getElementById(id.replace(/-range$/,"-val"));if(v)v.textContent=txt}
function fpSwPaint(id,on){
 const b=document.getElementById(id);if(!b)return;
 b.classList.toggle("on",!!on);b.setAttribute("aria-pressed",String(!!on))}
function fpWallUI(){
 const W=window.MWFX?.wall;if(!W)return;const st=W.settings;
 const d=document.getElementById("fp-wall-dim"),b=document.getElementById("fp-wall-blur");
 if(d){d.value=st.wallDim;paintRange(d);document.getElementById("fp-wall-dim-val").textContent=st.wallDim+"%"}
 if(b){b.value=st.wallBlur;paintRange(b);document.getElementById("fp-wall-blur-val").textContent=st.wallBlur+"px"}}
function syncFPSettingsUI(){
 const X=S.x;
 fpSegPaint("fp-bg-mode-group","bg",S.fpBgMode||"dynamic");
 fpSegPaint("fp-fill-mode-group","fill",S.lyKaraoke||"karaoke");
 fpSegPaint("fp-zoom-mode-group","zoom",S.fpZoom||"normal");
 fpSegPaint("fp-align-group","align",["left","center","right"].includes(X.lyAlign)?X.lyAlign:"left");
 fpRangePaint("fp-speed-range",X.flowSpeed??100,`${X.flowSpeed??100}%`);
 fpRangePaint("fp-blur-range",S.fpBlur??75,`${S.fpBlur??75}px`);
 fpRangePaint("fp-glow-range",S.fpGlow??100,`${S.fpGlow??100}%`);
 fpRangePaint("fp-lysize-range",S.ly.size,`${S.ly.size}px`);
 fpSwPaint("fp-lyblur-sw",X.lyBlur!==false);
 fpSwPaint("fp-drift-sw",X.shrink!==false);
 fpSwPaint("fp-wobble-sw",!!X.beat);
 fpSwPaint("fp-idle-sw",X.idle!==false);
 for(const id of ["fp-font-select","ly-font-select"]){const s=document.getElementById(id);if(s)s.value=S.ly.font||""}
 fpWallUI()}
let saveT=0;
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(save,350)}
/* The settings sheet slides in from the right edge of the player. */
let fpSetTimer=0;
function fpSettingsOpen(){const p=document.getElementById("fp-settings-popover");return !!p&&!p.hidden&&p.dataset.open==="true"}
function fpSettings(open,instant){
 const p=document.getElementById("fp-settings-popover");if(!p)return;
 clearTimeout(fpSetTimer);
 const btn=document.getElementById("fp-settings-btn");
 if(btn){btn.setAttribute("aria-expanded",String(!!open));btn.setAttribute("aria-pressed",String(!!open))}
 if(open){
  syncFPSettingsUI();p.hidden=false;void p.offsetWidth;p.dataset.open="true";
  document.getElementById("fpc")?.setAttribute("data-active","true");clearTimeout(fpIdleTimer);
  requestAnimationFrame(()=>{p.querySelectorAll('input[type=range]').forEach(paintRange);paintAllSegs?.()});
  return}
 if(p.hidden)return;
 p.dataset.open="false";
 if(instant||RM)p.hidden=true;
 else fpSetTimer=setTimeout(()=>{if(p.dataset.open!=="true")p.hidden=true},340);
 fpWake()}
function initFPSettings(){
 const on=(id,ev,fn)=>document.getElementById(id)?.addEventListener(ev,fn);
 const after=(rerender)=>{applyFPSettings();syncFPSettingsUI();saveSoon();if(rerender&&fp.dataset.open==="true")renderFP()};
 const segw=(id,attr,fn,rerender)=>on(id,"click",e=>{const b=e.target.closest(".seg-btn");if(!b||b.disabled)return;fn(b.dataset[attr]);after(rerender)});
 const rangew=(id,fn)=>on(id,"input",e=>{fn(+e.target.value);after()});
 const sww=(id,fn)=>on(id,"click",()=>{fn();after()});
 on("fpset-close","click",()=>fpSettings(false));
 segw("fp-bg-mode-group","bg",v=>{S.fpBgMode=v;
  const W=window.MWFX?.wall;
  if(v==="wallpaper"&&W&&!W.has())W.pick().then(ok=>{if(ok){applyFPSettings();syncFPSettingsUI()}})});
 segw("fp-fill-mode-group","fill",v=>{S.lyKaraoke=v;lyLast=-1;setTimeout(()=>syncLyrics(true),0)});
 segw("fp-zoom-mode-group","zoom",v=>{S.fpZoom=v},true);
 segw("fp-align-group","align",v=>{S.x.lyAlign=v;lyLast=-1;setTimeout(()=>syncLyrics(true),60)});
 rangew("fp-speed-range",v=>{S.x.flowSpeed=v});
 rangew("fp-blur-range",v=>{S.fpBlur=v});
 rangew("fp-glow-range",v=>{S.fpGlow=v});
 rangew("fp-lysize-range",v=>{S.ly.size=v;applyLyVars();paintLyPanel?.()});
 sww("fp-lyblur-sw",()=>{S.x.lyBlur=!(S.x.lyBlur!==false)});
 sww("fp-drift-sw",()=>{S.x.shrink=!(S.x.shrink!==false)});
 sww("fp-wobble-sw",()=>{S.x.beat=!S.x.beat});
 sww("fp-idle-sw",()=>{S.x.idle=!(S.x.idle!==false)});
 const W=window.MWFX?.wall;
 if(W){
  on("fp-wall-pick","click",async()=>{if(await W.pick()){S.fpBgMode="wallpaper";after()}});
  on("fp-wall-clear","click",async()=>{await W.clear();if(S.fpBgMode==="wallpaper")S.fpBgMode="dynamic";after()});
  on("fp-wall-dim","input",e=>{W.settings.wallDim=+e.target.value;W.save();fpWallUI();W.render()});
  on("fp-wall-blur","input",e=>{W.settings.wallBlur=+e.target.value;W.save();fpWallUI();W.render()});
  fpWallUI();W.load()}
 const font=e=>{S.ly.font=e.target.value;applyLyVars();syncFPSettingsUI();save()};
 on("fp-font-select","change",font);
 on("ly-font-select","change",font);
 /* Outside the sheet, a click only closes it — it must not also press
    whatever it landed on (capture runs before the buttons' own handlers). */
 fp.addEventListener("click",e=>{
  if(!fpSettingsOpen())return;
  if(e.target.closest("#fp-settings-popover,#fp-settings-btn"))return;
  e.stopPropagation();e.preventDefault();fpSettings(false)},true);
 syncFPSettingsUI()}
function npArtRect(){const a=document.querySelector("#np .art");const r=a&&!a.hidden?a.getBoundingClientRect():null;return r&&r.width?r:null}
let fpCloseTimer=0;
function openFP(){
 if(S.current)adaptAccent(S.current);
 const from=fp.dataset.open==="true"?null:npArtRect();
 clearTimeout(fpCloseTimer);window.MWFX?.cover.reset();
 applyFPSettings();fp.dataset.open="true";renderFP();fpWake();
 window.MWFX?.flow.kick();window.MWFX?.wall.render();
 if(from)window.MWFX?.cover.flyFrom(from,{k:200,c:19})}
function closeFP(){
 const to=npArtRect();
 if(to&&fp.dataset.open==="true")window.MWFX?.cover.flyTo(to);
 clearTimeout(fpCloseTimer);fpCloseTimer=setTimeout(()=>window.MWFX?.cover.reset(),420);
 fp.dataset.open="false";
 window.MWFX?.wall.render();
 clearTimeout(fpIdleTimer);
 fpSettings(false,true);
 document.querySelectorAll("#sleep-pop,#src-pop").forEach(p=>p.remove());
 fpBeatReset();
 /* The blurred sleeve behind the ambient mode is a large layer; drop it while
    closed. renderFP() puts it back (the cache key goes with it). */
 const fpbg=document.getElementById("fpbg");
 if(fpbg){fpbg.style.backgroundImage="";delete fpbg.dataset.u}}
document.getElementById("expand").onclick=openFP;
document.getElementById("np")?.addEventListener("click",e=>{
 if(e.target.closest(".npacts"))return;
 if(!S.current||S.current.mode==="empty")return;
 openFP()});

/* Mobile touch gestures: bottom bar swipe to skip tracks */
let barTouchStartX=0,barTouchStartY=0,barTouchStartTime=0,barSwipeArmed=false;
const barEl=document.querySelector(".bar");
if(barEl){
 barEl.addEventListener("touchstart",e=>{
  if(e.touches.length!==1)return;
  /* #seek lives inside the bar, so every drag along the progress bar also
     crossed this handler and skipped the track instead of seeking. wireSeek
     only stopPropagation()s pointerdown, which a touch gesture never fires. */
  barSwipeArmed=!(e.target instanceof Element)||!e.target.closest("#seek,.track,#btrack,button,input,select,a,.dock,.sheet,[data-noswipe]");
  barTouchStartX=e.touches[0].clientX;
  barTouchStartY=e.touches[0].clientY;
  barTouchStartTime=Date.now()}, {passive:true});
 barEl.addEventListener("touchend",e=>{
  if(!barSwipeArmed){barSwipeArmed=true;return}
  if(e.changedTouches.length!==1)return;
  const dx=e.changedTouches[0].clientX-barTouchStartX;
  const dy=e.changedTouches[0].clientY-barTouchStartY;
  const dt=Date.now()-barTouchStartTime;
  if(dt<650&&Math.abs(dx)>44&&Math.abs(dx)>Math.abs(dy)*1.4){
   if(dx<0)next(true);
   else prev()}}, {passive:true});
}

/* Mobile touch gestures: pull down to close fullscreen player, horizontal swipe to skip */
let fpDragStartY=0,fpDragStartX=0,fpDragging=false,fpCurrentY=0,fpDragStartTime=0;
const fpcEl=document.getElementById("fpc");
if(fp&&fpcEl){
 fp.addEventListener("touchstart",e=>{
  if(fp.dataset.open!=="true")return;
  if(e.touches.length!==1)return;
  if(e.target.closest("#fptrack")||e.target.closest(".fpseek")||e.target.closest("#fp-settings-popover")||e.target.closest(".lyr")||e.target.closest("button")||e.target.closest("input")||e.target.closest("select"))return;
  fpDragStartY=e.touches[0].clientY;
  fpDragStartX=e.touches[0].clientX;
  fpDragStartTime=Date.now();
  fpDragging=true;
  fpCurrentY=0}, {passive:true});
 fp.addEventListener("touchmove",e=>{
  if(!fpDragging||e.touches.length!==1)return;
  const dy=e.touches[0].clientY-fpDragStartY;
  const dx=e.touches[0].clientX-fpDragStartX;
  if(dy>0&&dy>Math.abs(dx)){
   fpCurrentY=dy;
   fpcEl.style.transform=`translateY(${dy}px)`;
   fpcEl.style.transition="none"}}, {passive:true});
 const endFpTouch=e=>{
  if(!fpDragging)return;
  fpDragging=false;
  fpcEl.style.transition="";
  const dy=fpCurrentY;
  const dx=(e.changedTouches?.[0]?.clientX??fpDragStartX)-fpDragStartX;
  const dt=Date.now()-fpDragStartTime;
  fpcEl.style.transform="";
  if(dy>85){closeFP()}
  else if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs((e.changedTouches?.[0]?.clientY??fpDragStartY)-fpDragStartY)*1.5&&dt<500){
   if(dx<0)next(true);
   else prev()}
  fpCurrentY=0};
 fp.addEventListener("touchend",endFpTouch, {passive:true});
 fp.addEventListener("touchcancel",endFpTouch, {passive:true});
}
fp.addEventListener("pointermove",fpWake);
fp.addEventListener("pointerdown",fpWake);
fp.addEventListener("click",e=>{
 if(e.target.closest("#fp-settings-btn")){fpSettings(!fpSettingsOpen());return}
 if(e.target.closest("#fp-settings-popover"))return;
 /* Clicking empty space no longer closes the player itself: that was too
    easy to do by accident. (An open settings sheet is closed by the capture
    listener in initFPSettings before this runs.) */
 if(e.target.closest("#fpclose"))return closeFP();
 const a=e.target.closest("[data-act]");
 if(a){const k=a.dataset.act;
  if(k==="play")toggle();if(k==="next")next(true);if(k==="prev")prev();
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
/* Round 6, "remove all neon from the interface": the glow setting lights the
   background wave only (glFieldDraw / draw read S.glow); --glow, which gave
   buttons, avatars and lyrics their halos, stays 0. */
seg("glow",v=>{S.glow=+v});
seg("blur",v=>{S.blur=+v;document.documentElement.style.setProperty("--blur",v+"px")});
seg("dens",v=>{S.dens=+v;build(innerWidth<900?Math.round(safeParticleDensity(+v)*.45):safeParticleDensity(+v))});
seg("pspeed",v=>{S.pspeed=+v});
seg("theme",v=>setTheme(v));
seg("lang",v=>{LANG=v;applyI18n()});
function setTheme(v){S.theme=v;
 const d=matchMedia("(prefers-color-scheme: dark)").matches;
 const was=document.documentElement.dataset.theme;
 document.documentElement.dataset.theme=v==="system"?(d?"dark":"light"):v;
 spriteCache={};
 /* A cover accent is tuned per theme (light needs a deeper tone). */
 if(was&&was!==document.documentElement.dataset.theme&&S.accent==="adaptive"&&S.current?.art)adaptAccent(S.current)}
function setAccent(id){
 stopAccentTween();
 S.accent=id;document.documentElement.dataset.accent=id;
 const st=document.documentElement.style,a=ACCENTS.find(x=>x[0]===id);
 if(id==="adaptive"){
  /* Nothing to apply until a cover has been sampled; keep whatever is on screen
     until then rather than flashing grey. */
  spriteCache={};renderSwatches();save();pushPrefs();
  adaptAccent(S.current);
  return}
 if(id==="custom"){
  applyCustomAccent(S.customAccent||"#b3a6e8");
  renderSwatches();save();pushPrefs();
  return}
 if(id==="none"||!a||!a[2]){
  ["--accent","--accent-soft","--accent-rgb","--pr","--pg","--pb"].forEach(p=>st.removeProperty(p));setOnAccent(null)}
 else{const[r,g,b]=a[2].split(" ");
  st.setProperty("--accent",a[1]);st.setProperty("--accent-soft",`rgb(${a[2]} / .16)`);st.setProperty("--accent-rgb",a[2]);
  st.setProperty("--pr",r);st.setProperty("--pg",g);st.setProperty("--pb",b);setOnAccent([+r,+g,+b])}
 spriteCache={};renderSwatches();save();pushPrefs()}

/* Lite mode: one switch that applies the whole weak-PC profile at once and
   remembers what was there before, so switching back restores the user's own
   values rather than factory defaults. */
let litePrev=null;
let obDone=false;
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

 document.documentElement.style.setProperty("--blur",S.blur+"px");
 build(innerWidth<900?Math.round(safeParticleDensity()*.45):safeParticleDensity());
 setSeg("dens",S.dens);setSeg("glow",S.glow);setSeg("blur",S.blur);
 resize()}
document.getElementById("lite").onclick=()=>{S.lite=!S.lite;applyLite();save()};

/* persistence */
let diskSaveTimer=null;
function scheduleDiskSave(){
 if(!TAURI)return;
 clearTimeout(diskSaveTimer);
 diskSaveTimer=setTimeout(async ()=>{
  try{
   await store.write("playlists",PLAYLISTS.map(plSerialize));
   await store.write("favorites",TRACKS.filter(x=>x.fav).map(({id,s,t,a,al,d,art,mode,favAt})=>({id,s,t,a,al,d,art,mode,favAt,fav:true})));
   await store.write("history",HISTORY.slice(0,50).map(h=>({at:h.at,tr:(({id,s,t,a,al,d,art,mode})=>({id,s,t,a,al,d,art,mode}))(h.tr)})));
  }catch(e){console.warn("store disk write:",e)}
 },400);
}
function save(){
 const fullData={
  lang:LANG,theme:S.theme,accent:S.accent,glow:S.glow,blur:S.blur,dens:S.dens,dens2:1,pspeed:S.pspeed,
  svcOn:SERVICES.some(s=>!s.local&&s.on!==s.conn)
   ?Object.fromEntries(SERVICES.filter(s=>!s.local).map(s=>[s.id,s.on])):null,
  discord:{...S.discord,cid:S.discord.cid||""},fpMode:S.fpMode,ly:S.ly,fpBgMode:S.fpBgMode,fpGlow:S.fpGlow,fpBlur:S.fpBlur,lyKaraoke:S.lyKaraoke,fpWobble:S.fpWobble,fpZoom:S.fpZoom||"normal",fpDrift:S.fpDrift!==false,x:S.x,profileTrack:S.profileTrack||null,
  avatar:S.avatar||null,banner:S.banner||null,username:S.username||null,
  lite:S.lite,litePrev,quality:S.quality,vol:S.vol,eq:S.eq,preset:S.preset,custom:S.custom,
  sp:{on:S.sp.on,speed:S.sp.speed,rad:S.sp.rad,elev:S.sp.elev},ob:obDone,listen:Math.round(S.listen),
  favt:TRACKS.filter(x=>x.fav).map(({id,s,t,a,al,d,art,mode,favAt})=>({id,s,t,a,al,d,art,mode,favAt,fav:true})),
  hist:HISTORY.slice(0,50).map(h=>({at:h.at,tr:(({id,s,t,a,al,d,art,mode})=>({id,s,t,a,al,d,art,mode}))(h.tr)})),
  stab:S.stab,rate:S.rate,boost:S.boost,shuffle:S.shuffle,repeat:S.repeat,
  dlDir:S.dlDir,dlAsk:S.dlAsk,dlAutoFav:S.dlAutoFav,dlAutoPl:S.dlAutoPl,dlMode:S.dlMode,
  customAccent:S.customAccent,eqByTrack:S.eqByTrack,eqByPl:S.eqByPl,dislikes:S.dislikes,
  plCovers:TAURI?{}:Object.fromEntries(PLAYLISTS.filter(p=>p.cover).map(p=>[p.id,p.cover])),
  pls:TAURI?[]:PLAYLISTS.map(plSerialize),
  favArtists:FAV_ARTISTS,
  loct:TRACKS.filter(x=>x.s==="local").map(({id,s,t,a,al,d,art,mode,path,fav})=>({id,s,t,a,al,d,art,mode,path,fav:!!fav}))
 };
 /* The splash (boot.js) comes up in the accent the user had last time,
    the adaptive cover colour included; "" means «no accent». */
 try{localStorage.setItem("mw.boot.acc",S.accent==="none"?"":getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim())}catch(_){}
 try{
  localStorage.setItem("meowave",JSON.stringify(fullData));
 }catch(e){
  console.warn("save localStorage exceeded quota or failed, dropping playlist covers:",e);
  try{
   localStorage.setItem("meowave",JSON.stringify({...fullData,plCovers:{}}));
  }catch(e2){
   /* Out of quota with the covers gone too. The old fallback wrote empty
      pls/favt/hist under this same key, so the next launch read those empties
      and the user's playlists, favorites and history were gone for good. The
      heavy part is optional; the library is not — and the previously saved copy
      is the only version of it that fits, so fall back to that. */
   console.warn("save localStorage still exceeded quota without covers, keeping the previously saved library:",e2);
   let prev=null;
   try{prev=JSON.parse(localStorage.getItem("meowave")||"null")}catch(_){}
   const keep=k=>Array.isArray(prev?.[k])?prev[k]:(Array.isArray(fullData[k])?fullData[k]:[]);
   try{
    localStorage.setItem("meowave",JSON.stringify({...fullData,plCovers:{},pls:keep("pls"),favt:keep("favt"),hist:keep("hist")}));
   }catch(e3){console.warn("save localStorage failed entirely:",e3)}
  }
 }
 scheduleDiskSave();
}
/* A file chosen through the HTML input only ever existed as a File object and
   its blob: URL, and neither survives JSON — so a restored loc_blob_* entry has
   no way back to the bytes and can only be fixed by picking the file again. */
const unusableLocal=x=>String(x?.id||"").startsWith("loc_blob_")&&!x.path&&!x.blob;
function restore(){try{
 const d=JSON.parse(localStorage.getItem("meowave")||"null");if(!d)return;
 if(d.lang)LANG=d.lang;
 if(d.theme)S.theme=d.theme;
 if(d.accent)S.accent=d.accent;
 /* Glow used to default to "medium"; the redesign is flat. Saves from before
    it start with glow off once, later ones keep whatever the user picked. */
 if(d.glow!=null)S.glow=d.x&&d.x.glow2?d.glow:0;
 if(d.blur!=null)S.blur=d.blur;
 if(d.dens)S.dens=d.dens;
 /* The GPU field affords more: the old three steps map onto the new ones. */
 if(!d.dens2){if(S.dens===900)S.dens=1400;else if(S.dens===2200)S.dens=3200;else if(S.dens===4200)S.dens=6000}
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
  if(unusableLocal(x))return;
  const known=TRACKS.find(y=>String(y.id)===String(x.id)&&y.s===x.s);
  /* Favorites saved before favAt existed get a synthetic stamp that preserves
     their stored order, so old libraries do not all collapse to "now". */
  const at=x.favAt||i+1;
  if(known){known.fav=true;known.favAt=known.favAt||at}
  else TRACKS.push({...x,fav:true,favAt:at})});
 if(Array.isArray(d.loct)){
  const dead=d.loct.filter(unusableLocal);
  if(dead.length)console.warn("restore: dropped",dead.length,"picker-imported local track(s) — their files must be picked again");
  d.loct.forEach(x=>{
  if(unusableLocal(x))return;
  if(!TRACKS.some(y=>String(y.id)===String(x.id)&&y.s==="local"))TRACKS.push(x);
  if(x.path&&!LOCAL_PATHS.includes(x.path))LOCAL_PATHS.push(x.path)})}
 if(Array.isArray(d.hist))HISTORY=d.hist.filter(h=>h?.tr?.id&&!unusableLocal(h.tr)).map(h=>{
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
  if(d.dens===260||d.dens===500||d.dens===900||d.dens===1200)S.dens=3200}
 if(d.listen)S.listen=d.listen;
 if(d.avatar)S.avatar=d.avatar;
 if(d.banner)S.banner=d.banner;
 if(d.username)S.username=d.username;
 /* Service switches must land before initServices() runs (it reads SVC_ON); */
 if(d.svcOn&&typeof d.svcOn==="object")S.svcOn=d.svcOn;
 if(d.discord&&typeof d.discord==="object"){
  S.discord.on=!!d.discord.on;
  if(typeof d.discord.tmpl==="string"&&d.discord.tmpl)S.discord.tmpl=d.discord.tmpl;
  if(S.discord.tmpl==="{artist} — {title} · {service}")S.discord.tmpl="{title}";
  if(typeof d.discord.cid==="string")S.discord.cid=d.discord.cid;
  for(const k of ["art","time","btn"])if(typeof d.discord[k]==="boolean")S.discord[k]=d.discord[k];
  if(["title","artist-title","custom"].includes(d.discord.l1))S.discord.l1=d.discord.l1;
  else if(S.discord.tmpl&&S.discord.tmpl!=="{title}")S.discord.l1=S.discord.tmpl==="{artist} — {title}"?"artist-title":"custom";
  if(["artist","album","service","none"].includes(d.discord.l2))S.discord.l2=d.discord.l2;
  if([0,1,2].includes(d.discord.disp))S.discord.disp=d.discord.disp;
  if(d.discord.pause==="hide")S.discord.pause="hide"}
 if(d.fpMode)S.fpMode=d.fpMode==="lyric"?"lyric":"stage";
 /* Typo-proof: unknown values fall back to the centered stage. */
 if(d.ly&&typeof d.ly==="object")Object.assign(S.ly,d.ly);
 if(d.fpBgMode)S.fpBgMode=d.fpBgMode;
 if(d.fpGlow!=null)S.fpGlow=d.fpGlow;
 if(d.fpBlur!=null)S.fpBlur=d.fpBlur;
 if(d.lyKaraoke)S.lyKaraoke=d.lyKaraoke;
 if(d.fpWobble!==undefined)S.fpWobble=!!d.fpWobble;
 if(d.fpZoom)S.fpZoom=d.fpZoom;
 if(d.fpDrift!==undefined)S.fpDrift=!!d.fpDrift;
 if(d.x&&typeof d.x==="object")Object.assign(S.x,d.x);
 if(d.profileTrack&&typeof d.profileTrack==="object")S.profileTrack=d.profileTrack;
 obDone=!!d.ob;
}catch(e){}}
document.getElementById("sp-on").onclick=()=>{initAudio();S.sp.on=!S.sp.on;applySpatial();save();updateSpButtons()};
document.getElementById("sp-speed").oninput=e=>{S.sp.speed=e.target.value/100;document.getElementById("sp-speed-v").textContent=S.sp.speed.toFixed(2);save()};
document.getElementById("sp-rad").oninput=e=>{S.sp.rad=e.target.value/100;document.getElementById("sp-rad-v").textContent=e.target.value;applySpatial();save()};
document.getElementById("sp-elev").oninput=e=>{S.sp.elev=e.target.value/100;document.getElementById("sp-elev-v").textContent=e.target.value;save()};

addEventListener("keydown",e=>{
  if(e.target.matches("input, textarea")||e.target.isContentEditable)return;
  /* An open dialog owns Escape: the modal's own handler closes it, and the
     fullscreen player behind it must not close in the same keystroke. */
  if(document.getElementById("modal")?.dataset.open==="true")return;
  if(document.getElementById("cropper")?.dataset.open==="true")return;
  if(document.getElementById("lyric-edit-modal")?.dataset.open==="true"){
   if(e.key==="Escape"){e.preventDefault();closeLyricEditor()}
   return;
  }
  if(e.code==="Space"){e.preventDefault();toggle()}
  /* Escape peels one layer at a time: a menu, the player settings sheet, the
     equaliser, the settings window — and only then the full player. */
  if(e.key==="Escape"){
   if(closeTopLayer()){e.preventDefault();return}
   if(fp.dataset.open==="true"){
    if(document.documentElement.dataset.fullscreen==="true")toggleAppFullscreen();
    closeFP()}
   else if(document.documentElement.dataset.fullscreen==="true")toggleAppFullscreen();
   return}
  const plain=!(e.ctrlKey||e.metaKey||e.altKey);
  if(plain&&e.code==="KeyL"&&fp.dataset.open==="true"){
   const want=!(S.fpMode==="lyric"&&S.x.fpPane!=="queue");
   S.fpMode=want?"lyric":"stage";S.x.fpPane="lyrics";save();renderFP()}
  if(plain&&e.code==="KeyQ"&&fp.dataset.open==="true"){
   const want=!(S.fpMode==="lyric"&&S.x.fpPane==="queue");
   S.fpMode=want?"lyric":"stage";S.x.fpPane="queue";save();renderFP()}
  if(plain&&e.code==="KeyE")openDockSheet();
  /* Shift+[ produces both "BracketLeft" and "{": chained, the reset used to
     undo the adjust from the same keystroke. Reset goes first for that reason. */
  if(e.code==="BraceLeft"||e.key==="{"||(e.altKey&&e.key==="0")){e.preventDefault();resetLyricOffset()}
  else if(e.code==="BracketLeft"||e.key==="["||e.key==="х"||(e.altKey&&e.key==="ArrowLeft")){e.preventDefault();adjustLyricOffset(-0.5)}
  else if(e.code==="BracketRight"||e.key==="]"||e.key==="ъ"||(e.altKey&&e.key==="ArrowRight")){e.preventDefault();adjustLyricOffset(0.5)}
  if(e.shiftKey&&e.key==="ArrowRight")next(true);
  if(e.shiftKey&&e.key==="ArrowLeft")prev()});

/* onboarding */
const OB={step:0};
document.getElementById("oblang").innerHTML=`
 <button class="opt" role="radio" aria-checked="true" data-v="ru" style="--i:0"><b>Русский</b><small>Полный интерфейс</small><span class="tick"><span class="material-symbols-rounded" style="font-size:18px">check</span></span></button>
 <button class="opt" role="radio" aria-checked="false" data-v="en" style="--i:1"><b>English</b><small>Full interface</small><span class="tick"><span class="material-symbols-rounded" style="font-size:18px">check</span></span></button>`;
function obThemes(){
 const box=document.getElementById("obtheme");if(!box)return;
 box.innerHTML=[["dark",t("th.dark"),LANG==="ru"?"Почти чёрный фон, белые частицы":"Near-black canvas, white particles"],
  ["light",t("th.light"),LANG==="ru"?"Белая основа, тёмные частицы":"White base, dark particles"],
  ["system",t("th.sys"),LANG==="ru"?"Следовать за системой":"Follow the OS"]]
  .map(([v,n,d],i)=>`<button class="opt" role="radio" aria-checked="${S.theme===v}" data-v="${v}" style="--i:${i}"><b>${n}</b><small>${d}</small><span class="tick"><span class="material-symbols-rounded" style="font-size:18px">check</span></span></button>`).join("");
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
const MOBILE=window.MeowaveMobile||{
 androidBridge:false,
 ports:{},
 auth:{redirectTo:"meowave://auth/callback"},
 sanitizeCloudTrack:(tr)=>({local_path:tr?.path||null})
};
if(!MOBILE.auth)MOBILE.auth={redirectTo:"meowave://auth/callback"};
if(typeof MOBILE.sanitizeCloudTrack!=="function"){
 MOBILE.sanitizeCloudTrack=(tr)=>({local_path:tr?.path||null});
}
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
async function toggleAppFullscreen(){
 if(TAURI){
  try{
   const W=window.__TAURI__?.window||{};
   const win=(W.getCurrentWindow?.()||W.getCurrent?.()||null);
   if(win?.isFullscreen&&win?.setFullscreen){
    const isFs=await win.isFullscreen();
    await win.setFullscreen(!isFs);
    document.documentElement.dataset.fullscreen=(!isFs).toString();
    return;
   }
  }catch(e){console.warn("fullscreen:",e)}
 }
 if(!document.fullscreenElement){
  document.documentElement.requestFullscreen?.().catch(()=>{});
  document.documentElement.dataset.fullscreen="true";
 }else{
  document.exitFullscreen?.().catch(()=>{});
  document.documentElement.dataset.fullscreen="false";
 }
}

if(TAURI){
  /* Tauri v2 renamed the getter: the global bundle ships getCurrentWindow(),
     and the v1-era getCurrent() is gone from some builds — dereferencing it
     left win undefined and the throw killed the whole script, which is the
     "app stuck on the splash" report. Every access below is guarded, and the
     getter is tried by both names. */
  const W=window.__TAURI__.window||{};
  const win=(W.getCurrentWindow?.()||W.getCurrent?.()||null);
  document.getElementById("tb-min")?.addEventListener("click",()=>win?.minimize?.());
  document.getElementById("tb-fs")?.addEventListener("click",toggleAppFullscreen);
  document.getElementById("tb-max")?.addEventListener("click",()=>win?.toggleMaximize?.());
  document.getElementById("tb-close")?.addEventListener("click",async()=>{
   /* Wait for the pending listening/favorites flush (bounded) before closing,
      so the last minute of statistics is not cut off mid-request. The window
      events pagehide/beforeunload also fire, but a destroyed webview cannot
      finish an in-flight request — this is the one that actually waits. */
   try{await flushOnClose()}catch(_){}
   win?.close?.()});
  /* Keep a data-max attribute on <html> so CSS can style the titlebar when
     the window is maximised (no rounded corners needed). */
  const syncMax=async()=>{try{const m=await win?.isMaximized?.();document.documentElement.dataset.max=m?"true":"false"}catch(e){}};
  syncMax();
  win?.onMaximizedChange?.(e=>{document.documentElement.dataset.max=e.payload?"true":"false"});
}
window.addEventListener("keydown",e=>{
 if(e.key==="F11"){
  e.preventDefault();
  toggleAppFullscreen();
 }
});

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
async function restoreDiskStore(){
 if(!TAURI)return;
 try{
  const [pls,favs,hist]=await Promise.all([
   store.read("playlists"),
   store.read("favorites"),
   store.read("history")
  ]);
  let changed=false;
  if(Array.isArray(pls)&&pls.length>0){
   PLAYLISTS=pls.filter(p=>p&&p.id&&p.name)
    .map(p=>({...p,cover:p.cover||null,tracks:Array.isArray(p.tracks)?p.tracks:[]}));
   changed=true;
  }
  if(Array.isArray(favs)&&favs.length>0){
   favs.forEach((x,i)=>{
    const known=TRACKS.find(y=>String(y.id)===String(x.id)&&y.s===x.s);
    const at=x.favAt||i+1;
    if(known){known.fav=true;known.favAt=known.favAt||at}
    else TRACKS.push({...x,fav:true,favAt:at});
   });
   changed=true;
  }
  if(Array.isArray(hist)&&hist.length>0&&HISTORY.length===0){
   HISTORY=hist.filter(h=>h?.tr?.id).map(h=>{
    const known=TRACKS.find(y=>String(y.id)===String(h.tr.id)&&y.s===h.tr.s);
    return {at:h.at,tr:known||h.tr};
   });
   changed=true;
  }
  if(changed){
   /* renderLib() is the playlist renderer: it draws both the grid and the
      opened playlist (the plOpen branch at its top), so there is nothing else
      to call. Unguarded on purpose — the library body is filled in eagerly
      (applyI18n does the same) and go("library") never re-renders it, so the
      S.view guard left the restored playlists, favorites and history in memory
      with nothing on screen. */
   renderLib();
   paint();
  }
 }catch(e){console.warn("restoreDiskStore:",e)}
}
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
/* Three levels now: 0 smallest, 1 best lossy, 2 lossless. "lossless" only asks
   for 2 when this webview decodes FLAC — otherwise the proxy would fetch a
   file the player cannot open and the track would fall back anyway. */
const hqFlag=()=>S.quality==="lossless"?(CAN.flac?2:1):(S.quality==="high"?1:0);
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
 return {webm:can('audio/webm;codecs="opus"'),mp4:can('audio/mp4;codecs="mp4a.40.2"'),
  flac:can("audio/flac")||can("audio/x-flac")||can('audio/mp4;codecs="flac"')};
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
 /* HTML-picker files live in the page as a blob: the Rust proxy only knows
    disk paths, so handing it a loc_blob_* id answered "resolve failed" and the
    track never played. No blob means no proxy: callers fall back to tr.url. */
 if(tr?.blob)return null;
 if(!STREAM_PORT||!tr?.id)return null;
 const fmt=tr.s==="ytm"?`&fmt=${encodeURIComponent(ytmFmt(tr))}`:"";
 /* Title, artist and length ride along for YouTube: when YouTube refuses the
    track (its bot check behind VPNs), the proxy plays the same recording from
    Yandex Music or SoundCloud instead of failing. */
 const hint=tr.s==="ytm"?`&t=${encodeURIComponent(String(tr.t||"").slice(0,200))}&a=${encodeURIComponent(String(tr.a||"").slice(0,200))}&d=${Math.round(+tr.d||0)}${S.x?.ytmAlt===false?"&alt=0":""}`:"";
 return `http://127.0.0.1:${STREAM_PORT}/stream/${encodeURIComponent(tr.s)}/${encodeURIComponent(tr.id)}?k=${encodeURIComponent(STREAM_KEY)}&hq=${hqFlag()}${fmt}${hint}`;
}
/* The media element only reports a numeric code, so every failure used to look
   identical: "Не удалось воспроизвести". The proxy knows the real reason —
   it answers "resolve failed: <why>" — and when it answers with bytes instead,
   the network path is fine and the problem is the codec. One probe tells the
   two apart, and it is only ever spent after something has already failed. */
async function probeStream(url){
 try{
  const r=await fetch(url,{headers:{Range:"bytes=0-64"},signal:AbortSignal.timeout(3000)});
  if(r.status>=400){
   const txt=(await r.text().catch(()=>"")).trim().replace(/\s+/g," ");
   return {ok:false,why:txt.slice(0,200)||`HTTP ${r.status}`};
  }
  return {ok:true,ct:(r.headers.get("content-type")||"").toLowerCase()};
 }catch(e){return {ok:false,why:e?.name==="TimeoutError"?"timeout":String(e.message||e)}}
}
let fallbackResolving = null;
const fallbackAttempted = new Set();

/* The same rules as src-tauri/src/matching.rs, so a fallback picked here and
   one picked by the stream proxy agree on what "the same song" is: both
   alphabets folded together (Кино = Kino), decorations ignored ("Official
   Video", "[Remastered 2011]"), a version the original is not (remix, live,
   sped up…) rejected, and the length within 12 % / 20 s. null = a different
   song. The old picker took the best of whatever came back — with a +100 for
   "another service" that outweighed everything else, which is how a fallback
   could swap a song for a different one. */
const MWM=(()=>{
 const VER=new Set("remix live cover karaoke instrumental nightcore sped slowed reverb acoustic mashup tribute 8d bassboosted minus acapella demo orchestral piano lofi edit version rmx vip bootleg flip remake parody remiks kaver lajv akustika".split(" "));
 const NOISE=new Set("official video audio lyrics lyric music hd hq 4k mv clip visualizer visualiser the a feat ft featuring prod topic full original mix explicit clean single remastered remaster premiere with x and i klip oficialnyj premera tekst pesni ofitsialnyy".split(" "));
 const DECOR=/\b(remaster(ed)?|version|edit|mix|mono|stereo|deluxe|bonus|live|radio|single|from|soundtrack|anniversary|acoustic|demo|instrumental|remix|\d{4})\b/i;
 const TR={"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","э":"e","ж":"zh","з":"z","и":"i","й":"i","ы":"i","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"c","ч":"ch","ш":"sh","щ":"sch","ъ":"","ь":"","ю":"yu","я":"ya","і":"i","ї":"i","є":"e","ґ":"g"};
 const fold=s=>{let o="";for(const ch of String(s||"").toLowerCase()){
   const tr=TR[ch];if(tr!==undefined){o+=tr;continue}
   if(/[\p{L}\p{N}]/u.test(ch)){o+=ch.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")||ch;continue}
   if(ch==="'"||ch==="’"||ch==="\u0060")continue;o+=" "}
  return o.replace(/ and /g," ")};
 const words=s=>{const all=fold(s).split(/\s+/).filter(Boolean),kept=all.filter(w=>!NOISE.has(w));return kept.length?kept:all};
 /* What platforms bolt onto a title: "(feat. X)", "[Remastered 2011]",
    " - Radio Edit". Only used for word coverage; versions are still checked
    against the full title. A dash is cut only when what follows looks like
    decoration, so "Кино - Группа крови" keeps its song name. */
 const core=s=>{let o=String(s||"").replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g," ");
  const m=/\s[-–—]\s(.*)$/.exec(o);if(m&&DECOR.test(m[1]))o=o.slice(0,m.index);
  o=o.replace(/\s(feat\.?|ft\.?|featuring)\s.*$/i,"");
  return words(o).length?o:String(s||"")};
 const ver=s=>{const f=fold(s),o=f.split(/\s+/).filter(w=>VER.has(w));if(f.replace(/\s+/g,"").includes("bassboosted")&&!o.includes("bassboosted"))o.push("bassboosted");return o};
 const cov=(want,got)=>{if(!want.length)return 1;let n=0;for(const w of want)if(got.some(g=>g===w||(w.length>=5&&g.startsWith(w))))n++;return n/want.length};
 function score(wt0,wa0,wd,gt0,ga0,gd){
  const full=words(wt0);if(!full.length)return null;
  const known=!!String(wa0||"").trim()&&String(wa0).trim()!=="—";
  const wa=known?words(wa0):[],gt=words(gt0),ga=words(ga0),gall=gt.concat(ga);
  const cw=words(core(wt0));
  const fc=cov(full,gall),cc=cov(cw,gall);
  const useCore=cc>fc,wt=useCore?cw:full,tc=Math.max(fc,cc);
  if(tc<(wt.length<=2?.99:.6))return null;
  const wv=ver(`${wt0} ${wa0||""}`);for(const v of ver(gt0))if(!wv.includes(v))return null;
  wd=+wd||0;gd=+gd||0;
  const gap=wd>30&&gd>0?Math.abs(wd-gd):null;
  if(gap!=null&&gap>Math.max(20,wd*.12))return null;
  const ac=wa.length?cov(wa,gall):.7;
  if(known&&ac<.5&&!(tc>=.99&&gap!=null&&gap<=3&&wt.length>=2))return null;
  const kn=full.concat(wa),extra=gt.filter(g=>!kn.includes(g)).length;
  const sc=.55*tc+.35*ac+(gap==null?.03:gap<=3?.15:gap<=8?.08:0)-Math.min(.25,extra*.04);
  return sc<.6?null:sc}
 const of=(want,h)=>want&&h?score(want.t,want.a,want.d,h.t,h.a,h.d):null;
 /* Identity of a song across services, for de-duplicating a wave. */
 const key=tr=>fold(String(tr?.a||"").split(/[,&]|\sfeat\.?\s/i)[0]).trim()+"|"+words(core(tr?.t)).join(" ");
 return {fold,words,core,score,of,key}})();
window.MWM=MWM;
/* Service preference when several copies match equally well: the ones that
   stream a whole track anonymously first. Deezer last — on its own it only
   has a 30-second preview. */
const SVC_PREF={ytm:.06,ym:.05,sc:.01,dz:-.08};
function pickFallbackCandidate(hits, tr, attempted = new Set()) {
 if(!hits||!hits.length)return null;
 let best=null,bs=-1;
 for(const h of hits){
  if(!h||!h.id||h.s==="sp"||h.s==="local")continue;
  if(attempted.has(trackKey(h))||(h.s===tr.s&&String(h.id)===String(tr.id)))continue;
  const m=MWM.of(tr,h);if(m==null)continue;
  const sc=m+(h.s!==tr.s?.2:0)+(SVC_PREF[h.s]||0);
  if(sc>bs){bs=sc;best=h}}
 return best}

async function fallbackResolveTrack(tr, auto, resumePos=0){
 if(!tr || tr.mode === "empty") return false;
 const key = trackKey(tr);
 if(fallbackResolving === key) return false;
 fallbackResolving = key;
 fallbackAttempted.add(key);

 const clean = typeof cleanMusicTitle === "function" ? cleanMusicTitle(tr.a, tr.t) : { query: `${tr.a||""} ${tr.t||""}`.trim() };
 const queries = [clean.query, `${tr.a||""} ${clean.t||""}`.trim(), clean.t, `${tr.a||""} ${tr.t||""}`.trim()].filter(Boolean);
 console.log(`[meowave] attempting silent audio fallback for "${clean.query}" (service: ${tr.s})`);
 try {
  for(const query of queries){
   const hits = await searchRemote(query);
   /* Same stale-resolution guard as load(): the user may have moved on. */
   if(!sameTrack(tr,S.current)){fallbackResolving=null;return false}
   if(!hits || !hits.length) continue;

   const candidate = pickFallbackCandidate(hits, tr, fallbackAttempted);
   if(candidate && (String(candidate.id) !== String(tr.id) || candidate.s !== tr.s)){
    fallbackAttempted.add(trackKey(candidate));
    const resolved = {
     ...tr,
     id: candidate.id,
     s: candidate.s,
     mode: "local",
     _resolved: true,
     _resolvedId: candidate.id,
     _resolvedSvc: candidate.s
    };
    /* A Spotify copy keeps its Spotify identity; the cache learns the
       working source instead. */
    if(tr._spOrig){
     sprMap().set(sprKey(tr),{s:candidate.s,id:String(candidate.id),t:candidate.t,a:candidate.a,d:+candidate.d||0,score:0,at:Date.now()});sprSave();
     if(S.current&&sameTrack(tr,S.current))S.current._resolvedSvc=candidate.s;
    }
    if(sameTrack(tr, S.current)&&!tr._spOrig){
     S.current = resolved;
     if(auto) S.playing = true;
     renderNP();
     paint();
     sync();
    }
    fallbackResolving = null;
    load(resolved, auto, resumePos);
    return true;
   }
  }
 } catch(e){ console.warn("fallbackResolveTrack failed:", e); }
 fallbackResolving = null;
 return false;
}

/* At most two reconnects per track per minute, so a genuinely broken stream
   still falls through to explainFailure and the fallback resolver. */
let streamResume={key:"",n:0,at:0};
function tryResumeStream(tr,pos,wasPlaying){
 if(!tr||tr.mode==="empty"||tr.s==="mock")return false;
 const key=trackKey(tr),now=Date.now();
 if(streamResume.key!==key||now-streamResume.at>60000)streamResume={key,n:0,at:now};
 if(streamResume.n>=2)return false;
 streamResume.n++;streamResume.at=now;
 console.warn(`[meowave] stream dropped at ${pos.toFixed(1)}s; reconnecting (${streamResume.n}/2)`);
 load(tr,wasPlaying,pos);
 return true;
}
async function explainFailure(url,tr,wasPlaying=true,resumePos=0){
 if(!url){S.playing=false;sync();toast(t("load.err"));return}
 const key=trackKey(tr);
 if(codecRetry&&codecRetry.key!==key)codecRetry=null;

 /* Bytes arrived but this webview will not decode that container, and YouTube
    Music ships the other one too: swap and try exactly once before believing
    the track itself is broken. */
 if(tr?.s==="ytm"&&!codecRetry){
  const cur=ytmFmt(tr);
  const alt=cur==="mp4"?"webm":"mp4";
  const playable=alt==="webm"?CAN.webm:CAN.mp4;
  if(playable){
   codecRetry={key,fmt:alt};
   console.warn(`[meowave] stream error; retrying as ${alt}`);
   load(tr,wasPlaying,resumePos);
   return;
  }
 }

 // Try fallback rescue immediately before slow network probe
 const rescued = await fallbackResolveTrack(tr, wasPlaying, resumePos);
 if(rescued) return;

 if(!sameTrack(tr,S.current))return;
 const why=await probeStream(url);
 S.playing=false;sync();
 /* m3.js turns this into a snackbar with "Details" and "Other source". */
 if(typeof window.mwFailSnack==="function"){try{window.mwFailSnack(tr,url,why);return}catch(e){console.warn(e)}}
 toast(why.ok?t("load.err"):`${t("load.err")} — ${humanStreamError(why.why)}`,6500);
}
/* The proxy answers with the upstream's own words; these are the ones a user
   can act on. YouTube's bot check is nearly always a VPN / shared IP. */
function humanStreamError(why){
 const w=String(why||""),ru=LANG==="ru";
 if(/not a bot|LOGIN_REQUIRED|confirm you|bot check|Sign in to confirm/i.test(w))
  return ru?"YouTube просит подтвердить, что вы не бот. Обычно так бывает с VPN или общим IP — смените сервер VPN или выключите его":"YouTube wants to confirm you are not a bot. This usually happens behind a VPN or a shared IP — switch the VPN server or turn it off";
 if(/\b429\b|Too Many Requests|rate.?limit/i.test(w))return ru?"Сервис временно ограничил запросы — попробуйте через минуту":"The service is rate-limiting requests — try again in a minute";
 if(/UNPLAYABLE|not available|unavailable|region|country|geo/i.test(w))return ru?"Трек недоступен в вашем регионе":"This track is not available in your region";
 if(/timeout|timed out/i.test(w))return ru?"Сервис не ответил вовремя":"The service did not answer in time";
 if(/no token|token/i.test(w))return ru?"Нужен вход в сервис (Настройки → Аккаунты)":"Sign-in to the service is required (Settings → Accounts)";
 if(/HTTP 40[13]|refused the stream/i.test(w))return ru?"Сервер отказался отдавать файл":"The media server refused the file";
 if(/Failed to fetch|NetworkError|Load failed|did not answer/i.test(w))return ru?"Нет связи с сервисом":"Could not reach the service";
 return w}
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
   Paths are persisted and re-registered on boot. */
let LOCAL_PATHS=[];
const dlgApi=()=>window.__TAURI__?.dialog;
async function pickLocal(){
 const fileInp=document.getElementById("loc-file-input");
 const useHtmlPicker=()=>{
  if(!fileInp)return;
  fileInp.value="";
  fileInp.onchange=()=>{
   const files=Array.from(fileInp.files||[]);
   if(!files.length)return;
   const added=files.map(f=>{
    const base=f.name.replace(/\.[^/.]+$/,"");
    let artist="—",title=base;
    if(base.includes(" - ")){
     const p=base.split(" - ");
     artist=p[0].trim();
     title=p.slice(1).join(" - ").trim();
    }
    return {
     id:"loc_blob_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
     t:title||"Unknown",
     a:artist||"—",
     al:"Local Files",
     s:"local",
     mode:"local",
     url:URL.createObjectURL(f),
     blob:f
    };
   });
   mergeLocal(added);
  };
  fileInp.click();
 };

 if(!TAURI){
  useHtmlPicker();
  return;
 }
 const dlg=dlgApi();
 if(!dlg?.open){
  useHtmlPicker();
  return;
 }
 try{
  const sel=await dlg.open({multiple:true,directory:false,
   filters:[{name:"Audio",extensions:["mp3","flac","wav","ogg","oga","m4a","aac","opus"]}]});
  if(!sel)return;
  mergeLocal(await inv("local_add",{paths:Array.isArray(sel)?sel:[sel]}));
 }catch(e){
  console.warn("Tauri file dialog error, falling back to HTML5 file picker:",e);
  useHtmlPicker();
 }
}
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
  let ids=TAURI?await inv("list_connected_services")
   :SERVICES.map(s=>s.id).filter(id=>localStorage.getItem("mw.tok."+id));
  if(TAURI){
   try{
    const spMe=await inv("spotify_me").catch(()=>null);
    if(spMe&&!ids.includes("sp"))ids.push("sp");
   }catch(_){}
  }
  /* "local" is not a keychain service and Rust never reports it, so the blanket
     assignment below switched it off on every start — local files then vanished
     from search, from the queue and from next(). A local provider is connected
     by definition. */
  /* The user's on/off choices win over the default "connected = on": restore()
     fills SVC_ON from storage, and a service that was deliberately switched
     off stays off across restarts (a first run has no stored map yet). */
  SERVICES.forEach(s=>{
   if(s.local)return;
   s.conn=ids.includes(s.id);
   s.on=S.svcOn&&s.id in S.svcOn?!!S.svcOn[s.id]&&s.conn:s.conn});
  renderSrv();renderAccounts();icons();
 }catch(e){console.warn("keychain unavailable:",e)}}

/* supabase: аккаунты */
let sb=null,sbUser=null,sbProfile=null,sbStats=null,delArmed=false;
async function initSupabase(){
  try{
   if(!STREAM_PORT)await ensureStreamPort();
   const cfg=TAURI?await inv("get_supabase_config")
    :{url:localStorage.getItem("mw.sb.url"),anon_key:localStorage.getItem("mw.sb.key")};
   if(!cfg?.url||!cfg?.anon_key)throw new Error("no supabase config");
   /* createClient comes from the locally bundled UMD build (window.supabase).
      The old dynamic import from jsdelivr died on networks where the CDN is
      blocked — which took account sign-in down with it — and it kept
      `cdn.jsdelivr.net` in the CSP script-src, where any npm path is
      scriptable. A missing vendor file is a broken build: fail loudly. */
   const createClient=window.supabase?.createClient;
   if(!createClient)throw new Error("supabase vendor script missing");
   /* Route every Supabase call through our own relay: the webview's network
      stack dies on machines with an IPv6 address but no v6 route ("Load
      failed" on sign-in), while the Rust side falls back to v4 properly. */
   const supaFetch=async (url,opts={})=>{
    if(!STREAM_PORT)await ensureStreamPort();
    const rawUrl=typeof url==="string"?url:(url?.url||url?.href||url?.toString?.()||"");
    if(STREAM_PORT&&rawUrl.startsWith("https://")){
     try{
      const proxied=`http://127.0.0.1:${STREAM_PORT}/relay/${encodeURIComponent(rawUrl)}?k=${encodeURIComponent(STREAM_KEY)}`;
      let res;
      if(typeof url==="object"&&url instanceof Request){
       res=await fetch(new Request(proxied, url), opts);
      }else{
       res=await fetch(proxied,opts);
      }
      if(res&&res.status<500)return res;
     }catch(e){
      console.warn("Relay fetch error, trying direct fetch:", e);
     }
    }
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
 loadEquipped().then(()=>{if(S.view==="profile"||S.view==="quests")repaintBadgeViews()}).catch(()=>{});
 /* Dislikes are a union, not an overwrite: hidden on any machine means hidden
    everywhere, and un-hiding stays a local act (there is no timestamp to tell
    which side is newer). */
 /* The pinned song follows the account: the last explicit pin or unpin on
    any device is on the server; an account that never synced one takes this
    machine's. */
 const rp=sbProfile?.prefs||{};
 /* the designer's look (custom.js) comes along to a machine without one */
 if(typeof czAdopt==="function")czAdopt(rp.cz);
 if(rp&&"profile_track" in rp){
  const remote=rp.profile_track&&rp.profile_track.t?rp.profile_track:null;
  if(JSON.stringify(prefsTrack(S.profileTrack))!==JSON.stringify(remote)){S.profileTrack=remote;save()}}
 else if(S.profileTrack)pushPrefs();
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
 presBeat(true);
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
 dcPush();
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
   REPORT.secs-=secs;REPORT.spatial=0;REPORT.tracks=0;REPORT.ids.clear();REPORT.genres.clear();
  /* Keep the card in step with what the server now holds. */
  if(sbStats)sbStats.listen_seconds=(Number(sbStats.listen_seconds)||0)+secs;
  if(S.view==="profile")renderProfile();
  syncAchievements();
 }catch(e){console.warn("report_listening:",e.message||e);
  /* A failing RPC used to be a console line only, so listening hours just
     silently stayed at zero. Say it once per session. */
  if(!REPORT.errShown){REPORT.errShown=true;
   toast((LANG==="ru"?"Время прослушивания не сохранилось: ":"Listening time was not saved: ")+String(e.message||e).slice(0,140)
    +(LANG==="ru"?". Выполните новый SQL из supabase/migrations (15_presence_listening.sql)":". Run the new SQL from supabase/migrations (15_presence_listening.sql)"),9000)}}}
setInterval(()=>flushListening(false),60000);
/* Presence refresh: the elapsed timestamp has to move even mid-track. */
setInterval(()=>{if(S.playing)dcPush()},60000);
/* Listening time only reached localStorage when something else happened to call
   save(). A long session that ended with a crash, a kill or an update lost every
   minute of it — which is exactly the "hours are not saved" report. A minute is
   cheap: this is one small JSON write. */
setInterval(()=>save(),60000);
/* A closing window must not lose the current batch. The flushes are awaited
   because a fire-and-forget POST dies mid-flight once the webview is torn
   down; the Rust side closes on CloseRequested, so ending the request first
   is what actually gets the batch to the server. Wrapped in a rejectable
   promise: without the catch an aborted keepalive fetch would surface as an
   unhandled rejection here and the close would still proceed. */
let closing=false;
async function flushOnClose(){
 if(closing)return;closing=true;
 try{await Promise.race([
  Promise.allSettled([
   flushListening(true),
   flushFavorites(),
   TAURI?Promise.allSettled([
    store.write("playlists",PLAYLISTS.map(plSerialize)),
    store.write("favorites",TRACKS.filter(x=>x.fav).map(({id,s,t,a,al,d,art,mode,favAt})=>({id,s,t,a,al,d,art,mode,favAt,fav:true}))),
    store.write("history",HISTORY.slice(0,50).map(h=>({at:h.at,tr:(({id,s,t,a,al,d,art,mode})=>({id,s,t,a,al,d,art,mode}))(h.tr)})))
   ]):Promise.resolve()
  ]),
  new Promise(r=>setTimeout(r,2500))])}catch(_){}
 save()}
window.addEventListener("beforeunload",()=>{save();flushOnClose()});
/* beforeunload does not fire reliably when a window is destroyed by the OS or
   the updater; pagehide and the hidden transition do. */
window.addEventListener("pagehide",()=>{save();flushListening(true)});
document.addEventListener("visibilitychange",()=>{if(document.hidden){save();flushListening(true)}});
function authMsg(msg,cls){const el=document.getElementById("authmsg");if(el){el.textContent=msg||"";el.className="authmsg "+(cls||"")}}
async function doAuth(kind){
 const email=(document.getElementById("au-email")?.value||"").trim();
 const pass=document.getElementById("au-pass")?.value||"";
 const user=(document.getElementById("au-user")?.value||"").trim();
 if(!email)return authMsg(t("pr.email")+"?","err");
 try{
  if(kind==="magic"){
   const {error}=await sb.auth.signInWithOtp({email,...(ANDROID?{options:{emailRedirectTo:MOBILE.auth.redirectTo}}:{})});
   if(error)throw error;
   return authMsg(t("pr.magic.sent"),"ok")}
  if(!pass)return authMsg(t("pr.pass")+"?","err");
  const {data,error}=kind==="in"
   ?await sb.auth.signInWithPassword({email,password:pass})
   :await sb.auth.signUp({email,password:pass,options:{data:{username:user||null,is_public:false},...(ANDROID?{emailRedirectTo:MOBILE.auth.redirectTo}:{})}});
  if(error)throw error;
  if(kind==="up"&&data?.user&&!data.session){
   authMsg(t("pr.magic.sent"),"ok");
  }
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
 const out=CROP.shape==="banner"?{w:1200,h:400}:{w:256,h:256};
 const c=document.createElement("canvas");
 c.width=out.w;c.height=out.h;
 const x=c.getContext("2d");
 x.imageSmoothingQuality="high";
 /* One transform maps frame space to output space, so the exported pixels are
    the previewed pixels — no second, subtly different crop calculation. */
 const k=out.w/f.w;
 x.drawImage(CROP.img,CROP.x*k,CROP.y*k,
  CROP.img.width*CROP.scale*k,CROP.img.height*CROP.scale*k);

 /* An avatar is exported square and every surface masks it into a circle.
    Cutting the circle into the file (a feathered transparent rim) was the
    "white line around the avatar": the CSS mask anti-aliases that see-through
    rim against whatever sits under the picture — a light placeholder
    gradient and a pale border. A full-bleed square leaves the mask nothing
    but the picture's own pixels at the edge. */
 const round=CROP.shape==="square";
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
 if(!file)return;
 const cropped=await openCropper(file,kind==="avatar"?"square":"banner");
 if(!cropped)return;
 const {blob,ext,type,dataUrl}=cropped;
 if(blob.size>IMG_MAX[kind]){toast(t(kind==="avatar"?"img.big":"img.big.gif"));return}
 const col=kind==="avatar"?"avatar_url":"banner_url";
 const sProp=kind==="avatar"?"avatar":"banner";

 // 1. Always save locally immediately so the user's avatar is instantly updated and persisted
 /* profile2.js: a picture replaces a banner colour or gradient at once. */
 if(kind==="banner")window.MWProf?.imageChosen?.();
 S[sProp]=dataUrl;
 if(sbProfile)sbProfile={...sbProfile,[col]:dataUrl};
 else sbProfile={[col]:dataUrl,username:S.username||t("pr.auth.guest")};
 save();
 renderProfile();
 fillProfileSettings();
 toast(t("img.ok"));

 if(!sb||!sbUser){if(kind==="banner")window.MWProf?.added?.(dataUrl);return}

 // 2. Graceful background sync with Supabase Storage and database
 try{
  const bucket=kind==="avatar"?"avatars":"banners";
  /* Banners get a file each, so the ones kept in «Мои баннеры» (profile2.js)
     still exist when you swap back; the avatar keeps its one file. */
  const base=kind==="banner"?`${sbUser.id}/banner-${Date.now().toString(36)}`:`${sbUser.id}/${kind}`;
  const path=`${base}.${ext}`;
  const stale=kind==="banner"?[]:["gif","webp","jpg"].filter(e=>e!==ext).map(e=>`${base}.${e}`);
  const {error}=await sb.storage.from(bucket).upload(path,blob,{upsert:true,contentType:type});
  if(!error){
   if(stale.length)sb.storage.from(bucket).remove(stale).catch(()=>{});
   const pubUrl=sb.storage.from(bucket).getPublicUrl(path).data.publicUrl+"?v="+Date.now();
   if(kind==="banner")window.MWProf?.added?.(pubUrl);
   S[sProp]=pubUrl;
   sbProfile={...sbProfile,[col]:pubUrl};
   save();
   renderProfile();
   fillProfileSettings();
   await sb.from("profiles").upsert({id:sbUser.id,[col]:pubUrl}).catch(console.warn);
  }
 }catch(e){
  console.warn("Storage upload failed (local image is preserved):",e);
 }}
const uploadAvatar=f=>uploadImage(f,"avatar");
const uploadBanner=f=>uploadImage(f,"banner");
/* Favorites sync.
   Favorites used to live only in localStorage, so they were tied to one
   machine. Now localStorage is the offline cache and the account is the truth.

   Merge rule on sign-in: union, never overwrite. Whoever signs in on a second
   machine expects to end up with both sets, and a "server wins" rule would
   silently delete everything they hearted while signed out. Deletions are
   therefore explicit — they travel as removals, not as an absence. */
const FAVQ={adds:new Map(),removes:new Map(),timer:0,retries:0};
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
  FAVQ.retries=0;
 }catch(e){
  console.warn("sync_favorites:",e.message||e);
  /* Put it back so nothing is lost when the network returns, and come back to
     it with a growing delay — otherwise the batch sat until the next manual
     heart click or app close. */
  adds.forEach(r=>FAVQ.adds.set(r.source+"\u0000"+r.source_track_id,r));
  removes.forEach(r=>FAVQ.removes.set(r[0]+"\u0000"+r[1],r));
  FAVQ.retries+=1;
  clearTimeout(FAVQ.timer);
  FAVQ.timer=setTimeout(()=>flushFavorites(),Math.min(30000,1000*2**FAVQ.retries))}}

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
function plSerialize(p){return {id:p.id,name:p.name,cover:p.cover||null,
 tracks:(p.tracks||[]).map(({id,s,t,a,al,d,art,mode})=>({id,s,t,a,al,d,art,mode}))}}

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
function trackKey(tr){return tr?`${tr.s}:${tr.id}`:""}

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
 if(!was&&sameTrack(tr,S.current))next(true);
 else{renderNP();renderWaveHint();if(S.view==="library")renderLib()}
 if(fp.dataset.open==="true")renderFPBody();
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
   return `<button data-undis="${esc(k)}" title="${esc(t("dis.off"))}">${esc(label)} <span class="material-symbols-rounded" style="font-size:14px">close</span></button>`
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
 if(!tr||!tr.art){coverTint(null);return}
 const hit=accentAdaptCache[trackKey(tr)];
 if(hit){
  document.documentElement.style.setProperty("--fp-tint",hit.raw.join(" "));
  if(hit.raw2)document.documentElement.style.setProperty("--fp-tint-2",hit.raw2.join(" "));
  coverTint(hit.raw,hit.raw2);
  /* The UI tone depends on the theme, so it is derived on use, not cached. */
  if(S.accent==="adaptive")applyAccentRgb(liftForUi(hit.raw));
  return}
 const img=new Image();
 img.crossOrigin="anonymous";
 img.onload=()=>{
  try{
   const c=document.createElement("canvas");c.width=c.height=16;
   const g=c.getContext("2d",{willReadFrequently:true});
   g.drawImage(img,0,0,16,16);
   const d=g.getImageData(0,0,16,16).data;
   let best=null,bestScore=-1;
   let secondBest=null,secondScore=-1;
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
    if(score>bestScore){
     if(best&&Math.hypot(best[0]-r,best[1]-gg,best[2]-b)>45){
      secondBest=best;secondScore=bestScore;
     }
     bestScore=score;best=[r,gg,b];
    }else if(score>secondScore&&best&&Math.hypot(best[0]-r,best[1]-gg,best[2]-b)>45){
     secondScore=score;secondBest=[r,gg,b];
    }}
   if(!best)return;
   const second=secondBest||[Math.min(255,best[0]+35),Math.max(0,best[1]-25),Math.min(255,best[2]+55)];
   const rgb=liftForUi(best);
   accentAdaptCache[trackKey(tr)]={raw:best,raw2:second,ui:rgb};
   /* The cache is per session and bounded: covers change constantly. */
   const keys=Object.keys(accentAdaptCache);
   if(keys.length>200)delete accentAdaptCache[keys[0]];
   document.documentElement.style.setProperty("--fp-tint",best.join(" "));
   document.documentElement.style.setProperty("--fp-tint-2",second.join(" "));
   if(sameTrack(tr,S.current))coverTint(best,second);
   if(S.accent==="adaptive"&&sameTrack(tr,S.current))applyAccentRgb(rgb);
  }catch(e){/* a cover served without CORS taints the canvas; keep the accent */}};
  img.onerror=()=>{};
  /* Through the relay when available: same-origin bytes keep the canvas
     untainted, and blocked cover hosts are bypassed. */
  img.src=cssUrlRaw(tr.art)||tr.art}

/* Pushes a colour towards a lightness that works as an accent on either theme,
   keeping its hue. A muted album cover otherwise produces an accent too dim to
   read against the panel background. */
function liftForUi(rgb){
 /* One lightness for every cover (readable on its theme) and a chroma cap:
    the old lift only scaled brightness, so a saturated cover produced a
    neon accent — the green "Start the wave" button. */
 const light=document.documentElement.dataset.theme==="light";
 return calmRgb(rgb,light?.11:.1,light?.56:.79)}

/* Round 5: a new cover no longer cuts the accent over in one frame. The
   colour is tweened (ease-in-out, 0.7 s by default — "Смена цвета" in Вид)
   from whatever is on screen now; the particle sprites are re-tinted a few
   times during the tween instead of on every frame, and once at the end. */
let ACC_NOW=null,ACC_RAF=0,ACC_TW=[];
function colorFadeMs(){const v=+(S.x?.cfade??1);return v<=0?0:v>=2?1600:700}
function setAccentVars([r,g,b],el){
 const st=(el||document.documentElement).style;
 st.setProperty("--accent",`rgb(${r} ${g} ${b})`);
 st.setProperty("--accent-soft",`rgb(${r} ${g} ${b} / .16)`);
 st.setProperty("--accent-rgb",`${r} ${g} ${b}`);
 st.setProperty("--pr",r);st.setProperty("--pg",g);st.setProperty("--pb",b);
 setOnAccent([r,g,b],el)}
/* Round 8, "FPS drops on a track change": the fade no longer runs on the root.
   Every write to <html> restyles the whole document — with a long library on
   screen that was ~9 000 elements, a dozen times per change. Now the page
   takes the new colour once, and only the places where the accent is large
   (rail, player bar, hero, mini player) fade into it — the full-screen
   player is white on its backdrop whatever the accent —
   each restyling just its own subtree per step. */
const ACC_TW_SEL="#rail,footer.bar,#hero,#mini";
const ACC_TW_VARS=["--accent","--accent-soft","--accent-rgb","--pr","--pg","--pb","--on-acc"];
function accTweenEnd(){
 for(const el of ACC_TW){ACC_TW_VARS.forEach(p=>el.style.removeProperty(p));delete el.dataset.acctw}
 ACC_TW=[]}
function applyAccentRgb(rgb){
 const de=document.documentElement;
 de.dataset.accent="adaptive";
 cancelAnimationFrame(ACC_RAF);ACC_RAF=0;
 const ms=colorFadeMs();
 let from=ACC_NOW;
 if(!from){
  const cur=getComputedStyle(de).getPropertyValue("--accent-rgb").trim().split(/\s+/).map(Number);
  from=cur.length===3&&cur.every(Number.isFinite)?cur:null}
 const still=matchMedia("(prefers-reduced-motion: reduce)").matches||document.hidden;
 if(!from||ms<=0||still||from.every((v,i)=>Math.abs(v-rgb[i])<3)){
  accTweenEnd();setAccentVars(rgb);ACC_NOW=rgb.slice();spriteCache={};return}
 const t0=performance.now();let lastSprite=t0,lastStep=0;
 accTweenEnd();
 setAccentVars(rgb);
 ACC_TW=[...document.querySelectorAll(ACC_TW_SEL)];
 for(const el of ACC_TW){el.dataset.acctw="";setAccentVars(from,el)}
 ACC_NOW=from.slice();
 const step=now=>{
  const k=Math.min(1,(now-t0)/ms),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
  /* ~30 steps a second: each one restyles only the small faded subtrees. */
  if(k<1&&now-lastStep<33){ACC_RAF=requestAnimationFrame(step);return}
  lastStep=now;
  const cur=from.map((v,i)=>Math.round(v+(rgb[i]-v)*e));
  if(k<1){for(const el of ACC_TW)setAccentVars(cur,el)}
  ACC_NOW=cur;
  /* The 2D field caches pre-tinted sprites; re-tint ~5×/s, not 60×. */
  if(now-lastSprite>200){spriteCache={};lastSprite=now}
  if(k<1)ACC_RAF=requestAnimationFrame(step);else{ACC_RAF=0;accTweenEnd();spriteCache={}}};
 ACC_RAF=requestAnimationFrame(step)}
function stopAccentTween(){cancelAnimationFrame(ACC_RAF);ACC_RAF=0;ACC_NOW=null;accTweenEnd()}

/* "Фон по обложке": two glows behind the whole interface take the cover's
   colours. They sit on two stacked layers that cross-fade by opacity
   (coverTint), so the compositor does the fade — no restyle per frame.
   The sampled pixel is normalised to a mid lightness first: a near-black
   cover would otherwise tint nothing and a neon one would shout. Greys stay
   neutral instead of turning into an arbitrary hue. */
function bgTone([r,g,b]){
 r/=255;g/=255;b/=255;
 const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;
 if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
  h=(mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4)/6}
 if(s<.12)return [150,148,168];
 return calmRgb([r*255,g*255,b*255],.085,.52)}
let CV_LAST=null;
/* Round 6: "make the background glow softer, not so bright" — a lower
   default strength and a calmer tone (bgTone caps the saturation). */
const CBG_K=35;
function coverBgPrefs(){
 const de=document.documentElement,on=S.x?.cbg!==false;
 de.dataset.coverbg=on?"on":"off";
 const k=Math.max(0,Math.min(100,+(S.x?.cbgK??CBG_K)))/100;
 de.style.setProperty("--cv-k",String(on?k:0));
 de.style.setProperty("--cv-fade",Math.round(colorFadeMs()*1.6)+"ms")}
/* Two stacked glow layers (.cvbg i): the new colours go on the hidden one,
   which then fades in over the other — an opacity transition the compositor
   runs alone. */
let CV_FRONT=0,CV_KEY="";
function cvLayers(){
 let box=document.getElementById("cvbg");
 if(!box){box=document.createElement("div");box.id="cvbg";box.className="cvbg";box.setAttribute("aria-hidden","true");
  box.innerHTML="<i></i><i></i>";document.body.prepend(box)}
 return box.children}
function coverTint(a,b){
 CV_LAST=a?[a,b||a]:null;
 const st=document.documentElement.style;
 const ca=a?`rgb(${bgTone(a).join(" ")})`:"rgb(0 0 0 / 0)",cb=a?`rgb(${bgTone(b||a).join(" ")})`:"rgb(0 0 0 / 0)";
 const key=ca+cb;if(key===CV_KEY)return;CV_KEY=key;
 /* The glass tint is a few percent of these: switched in one step. */
 st.setProperty("--cv-a",ca);st.setProperty("--cv-b",cb);
 const L=cvLayers();if(L.length<2)return;
 const next=L[CV_FRONT^1],cur=L[CV_FRONT];
 next.style.setProperty("--c1",ca);next.style.setProperty("--c2",cb);
 next.dataset.on="true";cur.dataset.on="false";CV_FRONT^=1}
function coverBgUI(){
 const sw=document.getElementById("cbg"),box=document.getElementById("cbg-box");
 const on=S.x?.cbg!==false,k=Math.round(+(S.x?.cbgK??CBG_K));
 if(sw){sw.setAttribute("aria-pressed",String(on));sw.classList.toggle("on",on)}
 if(box)box.hidden=!on;
 const r=document.getElementById("cbg-k"),v=document.getElementById("cbg-k-v");
 if(r&&+r.value!==k)r.value=k;if(v)v.textContent=k+"%";
 setSeg("cfade",+(S.x?.cfade??1))}
(function coverBgWire(){
 const sw=document.getElementById("cbg");
 sw?.addEventListener("click",()=>{S.x.cbg=!(S.x.cbg!==false);coverBgPrefs();coverBgUI();save()});
 const r=document.getElementById("cbg-k");
 r?.addEventListener("input",()=>{S.x.cbgK=+r.value;coverBgPrefs();coverBgUI()});
 r?.addEventListener("change",()=>save());
 seg("cfade",v=>{S.x.cfade=+v;coverBgPrefs()})})();

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
 if(!await askConfirm(t("pl.del.ask").replace("{n}",pl.name),t("pl.del"),true,{icon:"delete",sub:t("dlg.pldel.s")}))return;
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

/* Update check: update.js — the "Beta 3.2" label from the real version,
   signed releases for installed builds, git pull for a source checkout. */
function checkUpdate(manual){return window.mwUpdate?.check(manual)}
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
   folder:dir,hq:hqFlag()>=1,fmt:tr.s==="ytm"?ytmFmt(tr):"best"});
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
   folder:dir,hq:hqFlag()>=1,
   fmt:tr.s==="ytm"?ytmFmt(tr):"best",
   gains:S.eq.map(Number),rate,preserve_pitch:false,suffix:tag});
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
const DL_QUEUE=[];
let dlActive=0;
const MAX_CONCURRENT_DL=2;

function pumpAutoDownload(){
 while(dlActive<MAX_CONCURRENT_DL&&DL_QUEUE.length){
  const item=DL_QUEUE.shift();
  dlActive++;
  const fn=(S.dlMode==="fx"&&HAS_FFMPEG?downloadProcessed:downloadTrack);
  Promise.resolve(fn(item.tr,item.playlistName||null))
   .catch(e=>console.warn("autoDownload error:",e))
   .finally(()=>{
    dlActive--;
    pumpAutoDownload();
   });
 }
}

function autoDownload(tr,playlistName){
 if(!TAURI||!tr||tr.s==="local")return;
 const want=playlistName?S.dlAutoPl:S.dlAutoFav;
 if(!want||!S.dlDir)return;
 /* Honours the raw/processed choice, so an automatic copy is the same file the
    user would have got by hand. Throttled via concurrent DL_QUEUE. */
 DL_QUEUE.push({tr,playlistName});
 pumpAutoDownload();
}

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
  <button data-ctx="play"><span class="material-symbols-rounded" style="font-size:16px">play_arrow</span>${t("ctx.play")}</button>
  <button data-ctx="qnext"><span class="material-symbols-rounded" style="font-size:16px">subdirectory_arrow_right</span>${t("ctx.qnext")}</button>
  <button data-ctx="qlast"><span class="material-symbols-rounded" style="font-size:16px">queue_music</span>${t("ctx.qlast")}</button>
  <button data-ctx="fav"><span class="material-symbols-rounded" style="font-size:16px">favorite</span>${tr.fav?t("ctx.unfav"):t("ctx.fav")}</button>
  <button data-ctx="artist"><span class="material-symbols-rounded" style="font-size:16px">person</span>${t("ctx.artist")}</button>
  ${remote&&window.MWChat&&typeof sbUser!=="undefined"&&sbUser?`<button data-ctx="share"><span class="material-symbols-rounded" style="font-size:16px">send</span>${t("ctx.share")}</button>`:""}
  ${tr.s==="local"?`<button data-ctx="rmlocal"><span class="material-symbols-rounded" style="font-size:16px">delete</span>${t("ctx.rmlocal")}</button>`:""}
  ${remote?`<div class="sep"></div>
  <span class="lbl">${t("dl.preset.t")}</span>
  <button data-ctx="dl"><span class="material-symbols-rounded" style="font-size:16px">download</span>${t("dl.raw")}</button>
  <button data-ctx="dlfx"${HAS_FFMPEG?"":" disabled title=\""+esc(t("dl.fx.need"))+"\""}><span class="material-symbols-rounded" style="font-size:16px">tune</span>${t("dl.withfx")}</button>`:""}
  <div class="sep"></div>
  <span class="lbl">${t("ctx.addto")}</span>
  ${pls||`<span class="lbl dim">${t("ctx.nopl")}</span>`}
  <button data-ctx="newpl"><span class="material-symbols-rounded" style="font-size:16px">add</span>${t("ctx.newpl")}</button>
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
  <button data-ctx="newpl"><span class="material-symbols-rounded" style="font-size:16px">add</span>${t("ctx.newpl")}</button>
  <div class="sep"></div>
  <button data-ctx="fav"><span class="material-symbols-rounded" style="font-size:16px">favorite</span>${tr.fav?t("ctx.unfav"):t("ctx.fav")}</button>
  <button data-ctx="qnext"><span class="material-symbols-rounded" style="font-size:16px">subdirectory_arrow_right</span>${t("ctx.qnext")}</button>
  ${remote?`<div class="sep"></div>
  <span class="lbl">${t("dl.preset.t")}</span>
  <button data-ctx="dl"><span class="material-symbols-rounded" style="font-size:16px">download</span>${t("dl.raw")}</button>
  <button data-ctx="dlfx"${HAS_FFMPEG?"":" disabled title=\""+esc(t("dl.fx.need"))+"\""}><span class="material-symbols-rounded" style="font-size:16px">tune</span>${t("dl.withfx")}</button>`
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
  <button data-plctx="play"><span class="material-symbols-rounded" style="font-size:16px">play_arrow</span>${t("pl.playall")}</button>
  <button data-plctx="cover"><span class="material-symbols-rounded" style="font-size:16px">image</span>${t("plctx.cover")}</button>
  ${pl.cover?`<button data-plctx="coveroff"><span class="material-symbols-rounded" style="font-size:16px">hide_image</span>${t("plctx.coveroff")}</button>`:""}
  <button data-plctx="dl"><span class="material-symbols-rounded" style="font-size:16px">download</span>${t("pl.dl")}</button>
  <button data-plctx="rename"><span class="material-symbols-rounded" style="font-size:16px">edit</span>${t("plctx.rename")}</button>
  <div class="sep"></div>
  <span class="lbl">${t("plctx.eq")}</span>
  <div class="ctxchips">
   ${allP().map(p=>`<button data-plctx="eq" data-eq="${esc(p.id)}"
    aria-pressed="${cur===p.id}">${esc(p.n?.[LANG]||p.n?.ru||p.id)}</button>`).join("")}
   ${cur?`<button data-plctx="eqoff" class="off">${t("ctx.eq.off")}</button>`:""}
  </div>
  <div class="sep"></div>
  <button data-plctx="del" class="danger"><span class="material-symbols-rounded" style="font-size:16px">delete</span>${t("pl.del")}</button>`;
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
 const n=await askText(t("dlg.rename.t"),pl.name,{icon:"edit",label:t("dlg.name"),confirm:t("dlg.save"),required:true});
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
 else if(act==="artist")openArtist(tr.a);
 else if(act==="share")window.MWChat?.shareTrack(tr);
 else if(act==="eq")pinPresetToTrack(tr,b.dataset.eq);
 else if(act==="eqoff")pinPresetToTrack(tr,null);
 else if(act==="pl")addToPlaylist(b.dataset.pid,tr);
 else if(act==="newpl"){
  askText(t("pl.new"),"",{icon:"playlist_add",label:t("dlg.name"),sub:t("dlg.newpl.s"),confirm:t("dlg.create"),required:true}).then(n=>{
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

/* Worn badges of any profile row: the new list, else the old single column. */
function badgeIds(p){
 const a=Array.isArray(p?.equipped_badges)&&p.equipped_badges.length?p.equipped_badges:(p?.equipped_badge?[p.equipped_badge]:[]);
 return [...new Set(a.filter(Boolean))].slice(0,3)}
function myBadges(){return (S.equippedBadges||[]).slice(0,3)}
const isWorn=id=>myBadges().includes(id);
/* One badge: icon and name, as before. Two or three: the first keeps its
   name, the rest are icons with the name in the tooltip — three full chips
   next to a name would crowd every list row. {full:true} names all of them
   (the profile header has the room). */
function userBadgeTag(ids,opts={}){
 const list=(Array.isArray(ids)?ids:[ids]).filter(Boolean).map(badgeById).filter(Boolean).slice(0,3);
 if(!list.length)return "";
 const tag=(b,named)=>{const name=badgeName(b);
  return `<span class="user-badge-tag${named?"":" icon"}" title="${esc(name)}"><img src="assets/badges/${esc(b.file)}" alt="">${named?` ${esc(name)}`:""}</span>`};
 if(list.length===1)return tag(list[0],true);
 return `<span class="user-badges">${list.map((b,i)=>tag(b,!!opts.full||i===0)).join("")}</span>`}

/* badgeDirty: a local change the server has not confirmed yet. A profile
   read that lands in that window (the sign-in fetch, typically) would put
   the old set back, so loadEquipped() leaves local state alone until then. */
let badgeSaveT=0,badgeRev=0,badgeDirty=false;
function saveEquipped(){
 badgeRev++;
 const ids=myBadges();
 S.equippedBadge=ids[0]||null;
 localStorage.setItem("meowave_equipped_badges",JSON.stringify(ids));
 localStorage.setItem("meowave_equipped_badge",ids[0]||"");
 if(!sb||!sbUser)return;
 badgeDirty=true;
 /* Debounced: three quick taps are one write. The RPC checks ownership and
    keeps equipped_badge in step; a server without migration 16 only has the
    single column, so it gets the first badge. */
 clearTimeout(badgeSaveT);
 badgeSaveT=setTimeout(async()=>{
  const sent=badgeRev;
  try{
   const {data,error}=await sb.rpc("set_equipped_badges",{ids});
   if(error){
    if(/set_equipped_badges|function|PGRST20[02]|42883/i.test(error.message||""))
     await sb.from("profiles").update({equipped_badge:ids[0]||null}).eq("id",sbUser.id).then(()=>{},()=>{});
    else console.warn("equip:",error.message)}
   else if(sent===badgeRev&&Array.isArray(data)&&data.join()!==ids.join()){S.equippedBadges=data.slice(0,3);S.equippedBadge=data[0]||null;
    localStorage.setItem("meowave_equipped_badges",JSON.stringify(S.equippedBadges));repaintBadgeViews()}
  }catch(e){console.warn("equip:",e?.message||e)}
  finally{if(sent===badgeRev)badgeDirty=false}},350)}
function repaintBadgeViews(){
 if(S.view==="quests")renderQuestsView();
 if(S.view==="profile")renderProfile();
 if(S.view==="top")renderTop()}
/* Toggle: wear it, or take it off. null takes everything off. */
function equipBadge(id){
 if(id===null){S.equippedBadges=[];saveEquipped();toast(LANG==="ru"?"Значки сняты":"Badges removed");return repaintBadgeViews()}
 if(isWorn(id)){
  S.equippedBadges=myBadges().filter(x=>x!==id);saveEquipped();
  toast(LANG==="ru"?"Значок снят":"Badge removed");return repaintBadgeViews()}
 if(!OWNED.has(id)){toast(LANG==="ru"?"Вы еще не открыли этот значок":"Badge not unlocked yet");return}
 if(myBadges().length>=3){toast(LANG==="ru"?"Надеть можно три значка — сначала снимите один":"You can wear three badges — take one off first");return}
 S.equippedBadges=[...myBadges(),id];saveEquipped();
 toast((LANG==="ru"?"Значок надет":"Badge equipped")+` · ${myBadges().length}/3`);
 repaintBadgeViews()}
/* Server copy wins on sign-in, so every device shows the same three. */
async function loadEquipped(){
 if(!sb||!sbUser)return;
 /* A read that started before a local change must not undo it: the sign-in
    fetch resolving after a quick tap used to take the badge back off. */
 const rev=badgeRev;
 let {data,error}=await sb.from("profiles").select("equipped_badge,equipped_badges").eq("id",sbUser.id).maybeSingle();
 if(error)({data,error}=await sb.from("profiles").select("equipped_badge").eq("id",sbUser.id).maybeSingle());
 if(error||!data||rev!==badgeRev||badgeDirty)return;
 const ids=badgeIds(data);
 if(ids.length||data.equipped_badges){S.equippedBadges=ids;S.equippedBadge=ids[0]||null;
  localStorage.setItem("meowave_equipped_badges",JSON.stringify(ids));localStorage.setItem("meowave_equipped_badge",ids[0]||"")}}

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
 const isEquipped=isWorn(b.id);
 return `<div class="bdg" data-owned="${owned}" data-pin="${pinned}" data-badge="${esc(b.id)}"
  title="${esc(name)}${shown?" — "+esc(shown):""}"${owned?` role="button" tabindex="0"`:""}>
  <span class="bdgart" style="--ring:${c}"><img src="assets/badges/${esc(b.file)}" alt="" loading="lazy"></span>
  <b>${esc(name)}</b><span>${esc(shown)}</span>
  ${owned?`<button class="btn sm badge-tile-action ${isEquipped?"primary":""}" data-badge-equip="${esc(b.id)}">${isEquipped?(LANG==="ru"?"Надето":"Equipped"):(LANG==="ru"?"Надеть":"Equip")}</button>`:""}</div>`}

function renderBadges(){
 const box=document.getElementById("bdgbox");if(!box)return;
 const cat=BADGES||[];
 if(!cat.length){box.innerHTML=`<p class="ph" style="margin:0">${t("bd.none")}</p>`;return}
 const owned=b=>OWNED.has(b.id);
 /* Staff badges are not obtainable: Owner, Admin, Developer and Moderator are
    handed out by hand, so listing them greyed-out to everyone else is a row of
    permanent locks that only advertises a club nobody can join. They stay
    visible to whoever actually holds one.
    Promo code badges are also hidden until redeemed so codes are not leaked. */
 const STAFF=new Set(["owner","admin","developer","moderator"]);
 const visible=cat.filter(b=>(!STAFF.has(b.id)||owned(b))&&(b.source!=="code"||owned(b)));
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
     <div class="bdgrid">${sorted.map(b=>badgeTile(b,owned(b))).join("")}</div>`}).join("");
 box.querySelectorAll("[data-badge-equip]").forEach(btn=>{
  btn.onclick=e=>{
   e.stopPropagation();
   equipBadge(btn.dataset.badgeEquip);
   renderBadges();
  };
 });
}

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
  if(row.error){
   /* Validation failures come back through the row instead of raising: a
      raised error aborts the transaction and rolls back the attempt ledger
      that throttles code brute-forcing. */
   const m=String(row.error);
   const key={"invalid code":"bd.code.bad","code expired":"bd.code.exp",
    "code exhausted":"bd.code.used","too many attempts":"bd.code.throttle"};
   const hit=Object.keys(key).find(k=>m.includes(k));
   say(hit?t(key[hit]):m,"err");return}
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

let authTab="in", authMethod="standard";
/* "Profile music": what can be pinned depends on what is playing right now,
   so this block repaints on its own — on entering the profile and on every
   track change. It used to be painted once with the profile, which kept
   saying "nothing is playing" while music played. */
let PROF_TR_SIG="";
function profTrackHtml(){
 const pt=S.profileTrack,cur=S.current&&S.current.mode!=="empty"?S.current:null;
 if(pt)return `
      <div class="pinned-track">
        <span class="cover sm" ${coverStyle(pt.art,pt.l1,pt.l2)}></span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pt.t)}</div>
          <div style="color:var(--mute);font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pt.a||"—")}</div>
        </div>
        ${cur&&!sameTrack(cur,pt)?`<button class="btn sm ghost" id="prof-track-pin-curr" title="${esc(cur.a)} — ${esc(cur.t)}"><span class="material-symbols-rounded" style="font-size:16px">swap_horiz</span>${LANG==="ru"?"Заменить на текущий":"Use current"}</button>`:""}
        <button class="btn sm primary" id="prof-track-play" title="${t("np.play")}"><span class="material-symbols-rounded" style="font-size:16px">play_arrow</span></button>
      </div>`;
 return `
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button class="btn" id="prof-track-pin-curr"${cur?"":" disabled"}>
          <span class="material-symbols-rounded" style="font-size:16px">push_pin</span> ${LANG==="ru"?"Закрепить текущий трек":"Pin Current Track"}
        </button>
        ${cur?`<small style="color:var(--mute)">${esc(cur.a)} — ${esc(cur.t)}</small>`:`<small style="color:var(--mute)">(${LANG==="ru"?"сейчас ничего не играет":"nothing playing right now"})</small>`}
      </div>`}
function paintProfileTrack(force){
 const box=document.getElementById("prof-track-box");if(!box)return;
 const cur=S.current&&S.current.mode!=="empty"?S.current:null;
 const sig=[LANG,S.profileTrack?trackKey(S.profileTrack):"",cur?trackKey(cur):""].join("|");
 if(!force&&sig===PROF_TR_SIG)return;
 PROF_TR_SIG=sig;
 box.innerHTML=profTrackHtml();
 const act=document.getElementById("prof-track-act");
 if(act)act.innerHTML=S.profileTrack?`<button class="btn sm ghost" id="prof-track-clear">${LANG==="ru"?"Открепить":"Unpin"}</button>`:"";
 icons()}
function renderProfile(savedVals={}){
 const box=document.getElementById("profbody");if(!box)return;
 if(!sb){box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${t("pr.nosupa")}</p></div>`;return}
 if(!sbUser){
  if(S.guest){
   const favs=TRACKS.filter(x=>x.fav).length;
   const ava=S.avatar||sbProfile?.avatar_url||"./icons/app/classic.png";
   const ban=S.banner||sbProfile?.banner_url||"";
   /* profile2.js: a colour / gradient banner, or the picture. */
   const bs=window.MWProf?MWProf.attrs(MWProf.myStyle()):{cls:"",style:""};
   const useImg=!!ban&&!bs.cls;
   box.innerHTML=`<div class="panel pane pf2" style="overflow:hidden;padding:0">
     <label class="banner${useImg?"":bs.cls||" noimg"}" title="${t("pr.ban.hint")}"${useImg?"":bs.style||` style="background:linear-gradient(135deg,rgba(167,139,250,0.35),rgba(20,20,30,0.9))"`}>
      ${useImg?`<img src="${esc(ban)}" alt="" id="prof-ban-img">`:""}
      <span class="cam"><span class="material-symbols-rounded" style="font-size:16px">photo_camera</span> <span>${t("pr.ban.cta")}</span></span>
      <input type="file" id="prof-ban-input" accept="image/*">
     </label>
     <div class="pf-main">
     <div class="profhead">
      <label class="avatar has-img" title="${t("pr.ava.hint")}">
       <img src="${esc(ava)}" alt="" id="prof-ava-img">
       <span class="cam"><span class="material-symbols-rounded" style="font-size:24px">photo_camera</span></span>
       <input type="file" id="prof-ava-input" accept="image/*">
      </label>
      <div class="pf-id">
       <div class="uname" data-worn="${esc(myBadges().join(","))}"><b class="unview">${esc(S.username||sbProfile?.username||t("pf.guest"))}</b> ${userBadgeTag(myBadges())} <span class="svc-badge" style="font-size:0.75rem;padding:2px 8px;border-radius:99px;background:var(--bg-card);color:var(--mute)">Offline</span></div>
       <p class="pbio" style="margin-top:4px;color:var(--mute);font-size:0.85rem">${t("pr.auth.guest.desc")||"Локальный профиль Meowave"}</p>
      </div>
      <div class="pf-acts"><button class="btn sm" data-pfbanner><span class="material-symbols-rounded" style="font-size:16px">palette</span> ${t("pf.banner")}</button></div>
     </div>
     <div class="stats">
      <div class="stat"><b>${fmtListen(S.listen||0)}</b><span>${t("pr.hours")}</span></div>
      <div class="stat"><b>${favs}</b><span>${t("pr.favs")}</span></div>
      <div class="stat"><b>${OWNED.size}</b><span>${t("pr.badges")}</span></div>
     </div>
     </div>
    </div>
    <div class="panel pane" style="text-align:center">
     <h3 style="margin:0 0 8px">${t("pr.auth.t")}</h3>
     <p class="ph" style="margin:0 0 14px">${t("pr.auth.s")}</p>
     <button class="primary" id="guest-to-auth">${t("pr.signin")} / ${t("pr.signup")}</button>
    </div>`;
   box.querySelectorAll("label.avatar").forEach(lbl=>{
    lbl.onclick=e=>{if(e.target.id!=="prof-ava-input"){e.preventDefault();document.getElementById("prof-ava-input")?.click()}};
   });
   box.querySelectorAll("label.banner").forEach(lbl=>{
    lbl.onclick=e=>{if(e.target.id!=="prof-ban-input"){e.preventDefault();if(window.MWProf)MWProf.pick();else document.getElementById("prof-ban-input")?.click()}};
   });
   document.getElementById("prof-ava-input")?.addEventListener("change",async e=>{
    const f=e.target.files?.[0];e.target.value="";
    if(f){await uploadAvatar(f);fillProfileSettings()}});
   document.getElementById("prof-ban-input")?.addEventListener("change",async e=>{
    const f=e.target.files?.[0];e.target.value="";
    if(f){await uploadBanner(f);fillProfileSettings()}});
   document.getElementById("guest-to-auth")?.addEventListener("click",()=>{
    S.guest=false;save();renderProfile();
   });
   icons();
   return}

  box.innerHTML=`<div class="panel pane quasar-auth-card" style="position:relative;overflow:hidden">
   <div class="auth-orb-1"></div>
   <div class="auth-orb-2"></div>

   <div class="auth-header" style="position:relative;z-index:2;text-align:center;margin-bottom:16px">
    <div style="position:relative;width:52px;height:52px;margin:0 auto 12px">
     <div style="position:absolute;inset:-3px;background:rgb(var(--accent-rgb) / .16);border-radius:16px;filter:blur(10px);opacity:.5"></div>
     <img src="./icons/app/classic.png" style="position:relative;width:52px;height:52px;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,0.4)" alt="Meowave">
    </div>
    <h3 style="margin:0 0 4px;font-size:1.22rem;font-weight:700">${authTab==="in"?(LANG==="ru"?"Вход в Meowave":"Sign In to Meowave"):(LANG==="ru"?"Создать аккаунт Meowave":"Create Meowave Account")}</h3>
    <p class="ph" style="margin:0;font-size:0.82rem">${LANG==="ru"?"Синхронизируйте любимые треки, историю прослушивания и достижения":"Sync your favorite tracks, listening history and badges"}</p>
   </div>

   <div class="auth-tabs" style="position:relative;z-index:2;margin-bottom:16px">
    <button class="auth-tab-btn ${authTab==='in'?'active':''}" id="au-tab-in">${LANG==="ru"?"Вход":"Sign In"}</button>
    <button class="auth-tab-btn ${authTab==='up'?'active':''}" id="au-tab-up">${LANG==="ru"?"Регистрация":"Register"}</button>
   </div>

   <div class="authform" style="position:relative;z-index:2">
    ${authTab==="up"?`
    <div class="auth-field">
     <input id="au-user" type="text" placeholder="${t("pr.name.ph")||(LANG==="ru"?"Имя пользователя":"Username")}" autocomplete="username" value="${esc(savedVals?.user||"")}">
    </div>`:""}
    <div class="auth-field">
     <input id="au-email" type="email" placeholder="${t("pr.email")||"Email"}" autocomplete="email" value="${esc(savedVals?.email||"")}">
    </div>
    <div class="auth-field">
     <input id="au-pass" type="password" placeholder="${t("pr.pass")||"Пароль"}" autocomplete="${authTab==='in'?'current-password':'new-password'}" value="${esc(savedVals?.pass||"")}">
    </div>
    <div class="auth-actions" style="margin-top:14px">
     <button class="primary auth-submit-btn" id="au-submit">${authTab==="in"?(t("pr.signin")||"Войти"):(t("pr.signup")||"Зарегистрироваться")}</button>
     <button class="btn ghost sm" id="au-magic">${t("pr.magic")||"Magic link"}</button>
    </div>
    <div style="margin-top:14px;display:flex;align-items:center;justify-content:space-between">
     <button class="btn text sm" id="au-guest" style="color:var(--mute);text-decoration:underline;font-size:0.78rem">${t("pr.auth.guest")||"Продолжить без аккаунта (Гость)"}</button>
     <span style="font-size:0.72rem;color:#34d399;display:flex;align-items:center;gap:4px;font-family:monospace">
      <span style="width:6px;height:6px;border-radius:50%;background:#34d399"></span>
      Supabase RLS
     </span>
    </div>
    <p class="authmsg" id="authmsg" style="margin-top:8px"></p>

    <!-- Quasar ID SSO Button at the Bottom with Perks -->
    <div class="quasar-sso-container">
     <button class="quasar-sso-btn" id="au-quasar-btn" type="button">
      <span class="material-symbols-rounded" style="font-size:20px;color:var(--accent)">auto_awesome</span>
      <span>${LANG==="ru"?"Вход по Quasar ID":"Sign in with Quasar ID"}</span>
     </button>
     <div class="quasar-sso-perks">
      <div class="quasar-sso-perk">
       <span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);flex-shrink:0;margin-top:2px">chat_bubble</span>
       <span><b>${LANG==="ru"?"Интеграция с Messenger:":"Messenger Integration:"}</b> ${LANG==="ru"?"сохранение истории переписок и чатов":"saved conversation and message history"}</span>
      </div>
      <div class="quasar-sso-perk">
       <span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);flex-shrink:0;margin-top:2px">music_note</span>
       <span><b>${LANG==="ru"?"Музыка в профиле:":"Profile Music:"}</b> ${LANG==="ru"?"трансляция трека в статус и закрепление":"broadcast playing track to status and pin favorite music"}</span>
      </div>
      <div class="quasar-sso-perk">
       <span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);flex-shrink:0;margin-top:2px">bolt</span>
       <span><b>${LANG==="ru"?"Единый Quasar ID:":"Single Quasar ID:"}</b> ${LANG==="ru"?"комнаты, личные чаты, друзья и облако":"rooms, direct chats, friends and cloud library"}</span>
      </div>
     </div>
    </div>
   </div>
  </div>`;
  icons();
  const rePaintProf=()=>{
   const email=document.getElementById("au-email")?.value||"";
   const user=document.getElementById("au-user")?.value||"";
   const pass=document.getElementById("au-pass")?.value||"";
   renderProfile({email,user,pass});
  };
  document.getElementById("au-tab-in")?.addEventListener("click",()=>{authTab="in";rePaintProf()});
  document.getElementById("au-tab-up")?.addEventListener("click",()=>{authTab="up";rePaintProf()});
  document.getElementById("au-submit")?.addEventListener("click",()=>doAuth(authTab));
  document.getElementById("au-magic")?.addEventListener("click",()=>doAuth("magic"));
  const onEnter=(e)=>{if(e.key==="Enter"){e.preventDefault();doAuth(authTab)}};
  document.getElementById("au-email")?.addEventListener("keydown",onEnter);
  document.getElementById("au-pass")?.addEventListener("keydown",onEnter);
  document.getElementById("au-user")?.addEventListener("keydown",onEnter);
  document.getElementById("au-guest")?.addEventListener("click",()=>{
   S.guest=true;save();toast(t("pr.auth.guest.ok")||"Гостевой профиль активен");renderProfile();
  });
  document.getElementById("au-quasar-btn")?.addEventListener("click",async()=>{
   const qId=await askText(t("dlg.quasar.t"),"",{icon:"badge",label:t("dlg.quasar.l"),confirm:t("dlg.next"),required:true});
   if(!qId||!qId.trim())return;
   const em=document.getElementById("au-email");
   if(em){
    em.value=qId.trim().includes("@")?qId.trim():`${qId.trim().toLowerCase()}@quasar.id`;
   }
   const pass=document.getElementById("au-pass");
   if(pass){
    pass.focus();
    authMsg(LANG==="ru"?"Quasar ID указан. Введите пароль для входа.":"Quasar ID specified. Enter password.", "ok");
   }
  });
  return}
 const p=sbProfile||{},favs=TRACKS.filter(x=>x.fav).length;
 /* Whichever is larger: the account total the server has confirmed, or this
    machine's tally including seconds not yet flushed. Printing S.listen alone
    made the figure look like it reset on a new device. */
 const secs=Math.max(Number(sbStats?.listen_seconds)||0,S.listen||0);
 /* Badges count what the catalog can actually show, not raw rows: a legacy id
    with no tile would otherwise read as "owned but dark". */
 const ownedShown=(BADGES||[]).filter(b=>OWNED.has(b.id)).length;
 const ava=p.avatar_url||S.avatar||"";
 const ban=p.banner_url||S.banner||"";
 const bs=window.MWProf?MWProf.attrs(MWProf.myStyle()):{cls:"",style:""};
 const useImg=!!ban&&!bs.cls;
 box.innerHTML=`<div class="panel pane pf2" style="overflow:hidden;padding:0">
   <label class="banner${useImg?"":bs.cls||" noimg"}" title="${t("pr.ban.hint")}"${useImg?"":bs.style}>
    ${useImg?`<img src="${esc(ban)}" alt="" id="prof-ban-img">`:""}
    <span class="cam"><span class="material-symbols-rounded" style="font-size:16px">photo_camera</span> <span>${t("pr.ban.cta")}</span></span>
    <input type="file" id="prof-ban-input" accept="image/*">
   </label>
   <div class="pf-main">
   <div class="profhead">
    <label class="avatar${ava?" has-img":""}" title="${t("pr.ava.hint")}">
     ${ava?`<img src="${esc(ava)}" alt="" id="prof-ava-img">`:`<span class="avatar-ph">${esc(((p.username||sbUser.email||"M")[0]||"M").toUpperCase())}</span>`}
     <span class="cam"><span class="material-symbols-rounded" style="font-size:24px">photo_camera</span></span>
     <input type="file" id="prof-ava-input" accept="image/*">
    </label>
    <div class="pf-id">
     <div class="uname" data-worn="${esc(myBadges().join(","))}"><b class="unview">${esc(p.username||t("pr.name.ph"))}</b> ${userBadgeTag(myBadges(),{full:true})}</div>
     <div class="pinrow" id="pinrow"></div>
     ${sbProfile?.bio?`<p class="pbio">${esc(sbProfile.bio)}</p>`:""}
     <p class="pmail">${esc(sbUser.email||"")}</p>
     <p class="authmsg" id="authmsg"></p>
    </div>
    <div class="pf-acts">
     <button class="btn sm" data-pfbanner><span class="material-symbols-rounded" style="font-size:16px">palette</span> ${t("pf.banner")}</button>
     <button class="btn sm" data-pfedit><span class="material-symbols-rounded" style="font-size:16px">edit</span> ${t("pf.edit")}</button>
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
   <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <h3 style="margin:0;display:flex;align-items:center;gap:8px"><span class="material-symbols-rounded" style="font-size:20px;color:var(--accent)">music_note</span><span>${LANG==="ru"?"Музыка в профиле":"Profile Music"}</span></h3>
    <span id="prof-track-act">${S.profileTrack?`<button class="btn sm ghost" id="prof-track-clear">${LANG==="ru"?"Открепить":"Unpin"}</button>`:""}</span>
   </div>
   <p class="ph" style="margin:0 0 12px">${LANG==="ru"?"Закрепите трек, который будет отображаться в вашем профиле Quasar ID":"Pin a featured song displayed on your Quasar ID profile"}</p>
   <div id="prof-track-box">${profTrackHtml()}</div>
  </div>
  <div class="panel pane">
   <div class="quests-profile-card">
    <div class="quests-profile-info">
     <div class="quests-profile-icon"><span class="material-symbols-rounded" style="font-size:24px">military_tech</span></div>
     <div class="quests-profile-details">
      <h3>${LANG==="ru"?"Квесты и Значки":"Quests & Badges"}</h3>
      <p>${LANG==="ru"?"Выполняйте задания, открывайте уникальные значки и надевайте их":"Complete quests, unlock unique badges and equip them"}</p>
     </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
     ${userBadgeTag(myBadges())}
     <button class="quests-profile-btn" id="prof-to-quests"><span class="material-symbols-rounded" style="font-size:18px">auto_awesome</span> ${LANG==="ru"?"Перейти к квестам":"Open Quests"}</button>
    </div>
   </div>
  <div class="panel pane">
   <div class="authrow">
    <button class="btn" id="au-out">${t("pr.logout")}</button>
    <button class="btn danger" id="au-del">${delArmed?t("pr.del.confirm"):t("pr.del")}</button>
   </div>
  </div>`;
 document.getElementById("prof-to-quests")?.addEventListener("click",()=>go("quests"));
 document.getElementById("prof-track-box")?.closest(".panel")?.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.id==="prof-track-pin-curr"){
   if(!S.current||S.current.mode==="empty")return;
   S.profileTrack={id:S.current.id,s:S.current.s,t:S.current.t,a:S.current.a,art:S.current.art,l1:S.current.l1,l2:S.current.l2};
   save();pushPrefs();paintProfileTrack(true);toast(LANG==="ru"?"Трек закреплён в профиле":"Track pinned to profile")}
  else if(b.id==="prof-track-clear"){
   S.profileTrack=null;save();pushPrefs();paintProfileTrack(true);toast(LANG==="ru"?"Закреплённый трек откреплён":"Pinned track removed")}
  else if(b.id==="prof-track-play"){if(S.profileTrack)setTrack(S.profileTrack,true,false,"prof")}});
 PROF_TR_SIG="";paintProfileTrack();
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
 box.querySelectorAll("label.avatar").forEach(lbl=>{
  lbl.onclick=e=>{if(e.target.id!=="prof-ava-input"){e.preventDefault();document.getElementById("prof-ava-input")?.click()}};
 });
 box.querySelectorAll("label.banner").forEach(lbl=>{
  lbl.onclick=e=>{if(e.target.id!=="prof-ban-input"){e.preventDefault();if(window.MWProf)MWProf.pick();else document.getElementById("prof-ban-input")?.click()}};
 });
 document.getElementById("prof-ava-input")?.addEventListener("change",async e=>{
  const f=e.target.files?.[0];e.target.value="";
  if(f){await uploadAvatar(f);fillProfileSettings()}});
 document.getElementById("prof-ban-input")?.addEventListener("change",async e=>{
  const f=e.target.files?.[0];e.target.value="";
  if(f){await uploadBanner(f);fillProfileSettings()}});
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

const needAuth=(box,saved={})=>{
 if(!box)return;
 box.innerHTML=`
 <div class="panel pane quasar-auth-card" style="position:relative;overflow:hidden">
  <div class="auth-orb-1"></div>
  <div class="auth-orb-2"></div>

  <div class="auth-header" style="position:relative;z-index:2;text-align:center;margin-bottom:16px">
   <div style="position:relative;width:52px;height:52px;margin:0 auto 12px">
    <div style="position:absolute;inset:-3px;background:rgb(var(--accent-rgb) / .16);border-radius:16px;filter:blur(10px);opacity:.5"></div>
    <img src="./icons/app/classic.png" style="position:relative;width:52px;height:52px;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,0.4)" alt="Meowave">
   </div>
   <h3 style="margin:0 0 4px;font-size:1.22rem;font-weight:700">${authTab==="in"?(LANG==="ru"?"Вход в Meowave":"Sign In to Meowave"):(LANG==="ru"?"Создать аккаунт Meowave":"Create Meowave Account")}</h3>
   <p class="ph" style="margin:0;font-size:0.82rem">${LANG==="ru"?"Синхронизация медиатеки, комнат, чатов и профиля":"Sync library, rooms, chats and profile"}</p>
  </div>

  <div class="auth-tabs" style="position:relative;z-index:2;margin-bottom:16px">
   <button class="auth-tab-btn ${authTab==='in'?'active':''}" id="qau-tab-in">${LANG==="ru"?"Вход":"Sign In"}</button>
   <button class="auth-tab-btn ${authTab==='up'?'active':''}" id="qau-tab-up">${LANG==="ru"?"Регистрация":"Register"}</button>
  </div>

  <div class="authform" style="position:relative;z-index:2">
   ${authTab==="up"?`
   <div class="auth-field">
    <input id="qau-user" type="text" placeholder="${t("pr.name.ph")||(LANG==="ru"?"Имя пользователя":"Username")}" autocomplete="username" value="${esc(saved?.user||"")}">
   </div>`:""}
   <div class="auth-field">
    <input id="qau-email" type="email" placeholder="${t("pr.email")||"Email"}" autocomplete="email" value="${esc(saved?.email||"")}">
   </div>
   <div class="auth-field">
    <input id="qau-pass" type="password" placeholder="${t("pr.pass")||"Пароль"}" autocomplete="${authTab==='in'?'current-password':'new-password'}" value="${esc(saved?.pass||"")}">
   </div>
   <div class="auth-actions" style="margin-top:14px">
    <button class="primary auth-submit-btn" id="qau-submit">${authTab==="in"?(t("pr.signin")||"Войти"):(t("pr.signup")||"Зарегистрироваться")}</button>
    <button class="btn ghost sm" id="qau-magic">${t("pr.magic")||"Magic link"}</button>
   </div>
   <p class="authmsg" id="qauthmsg" style="margin-top:8px"></p>

   <!-- Quasar ID SSO Button at the Bottom with Perks -->
   <div class="quasar-sso-container">
    <button class="quasar-sso-btn" id="qau-quasar-btn" type="button">
     <span class="material-symbols-rounded" style="font-size:20px;color:var(--accent)">auto_awesome</span>
     <span>${LANG==="ru"?"Вход по Quasar ID":"Sign in with Quasar ID"}</span>
    </button>
    <div class="quasar-sso-perks">
     <div class="quasar-sso-perk">
      <span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);flex-shrink:0;margin-top:2px">chat_bubble</span>
      <span><b>${LANG==="ru"?"Интеграция с Messenger:":"Messenger Integration:"}</b> ${LANG==="ru"?"сохранение истории переписок и чатов":"saved conversation and message history"}</span>
     </div>
     <div class="quasar-sso-perk">
      <span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);flex-shrink:0;margin-top:2px">music_note</span>
      <span><b>${LANG==="ru"?"Музыка в профиле:":"Profile Music:"}</b> ${LANG==="ru"?"трансляция трека в статус и закрепление":"broadcast playing track to status and pin favorite music"}</span>
     </div>
     <div class="quasar-sso-perk">
      <span class="material-symbols-rounded" style="font-size:16px;color:var(--accent);flex-shrink:0;margin-top:2px">bolt</span>
      <span><b>${LANG==="ru"?"Единый Quasar ID:":"Single Quasar ID:"}</b> ${LANG==="ru"?"комнаты, личные чаты, друзья и облако":"rooms, direct chats, friends and cloud library"}</span>
     </div>
    </div>
   </div>
  </div>
 </div>`;
 icons();
 const rePaint=()=>{
  const email=box.querySelector("#qau-email")?.value||"";
  const user=box.querySelector("#qau-user")?.value||"";
  const pass=box.querySelector("#qau-pass")?.value||"";
  needAuth(box,{email,user,pass});
 };
 box.querySelector("#qau-tab-in")?.addEventListener("click",()=>{authTab="in";rePaint()});
 box.querySelector("#qau-tab-up")?.addEventListener("click",()=>{authTab="up";rePaint()});
 const submitAuth=async(kind)=>{
  const email=box.querySelector("#qau-email")?.value?.trim();
  const pass=box.querySelector("#qau-pass")?.value||"";
  const user=box.querySelector("#qau-user")?.value?.trim();
  const msg=box.querySelector("#qauthmsg");
  if(!email){if(msg)msg.textContent=t("pr.err.email");return}
  if(kind!=="magic"&&!pass){if(msg)msg.textContent=t("pr.err.pass");return}
  const btn=box.querySelector("#qau-submit");
  if(btn)btn.disabled=true;
  if(msg)msg.textContent="...";
  try{
   if(kind==="magic"){
    const {error}=await sb.auth.signInWithOtp({email});
    if(error)throw error;
    if(msg)msg.textContent=t("pr.magic.sent");
   }else if(kind==="up"){
    const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{username:user||email.split("@")[0]}}});
    if(error)throw error;
    if(data?.user){
     sbUser=data.user;save();toast(t("pr.welcome")||"Добро пожаловать!");
     renderProfile();
     if(S.view==="people")renderPeople();
     if(S.view==="rooms")renderRooms();
    }
   }else{
    const {data,error}=await sb.auth.signInWithPassword({email,password:pass});
    if(error)throw error;
    if(data?.user){
     sbUser=data.user;save();toast(t("pr.welcome")||"С возвращением!");
     renderProfile();
     if(S.view==="people")renderPeople();
     if(S.view==="rooms")renderRooms();
    }
   }
  }catch(e){if(msg)msg.textContent=String(e.message||e)}
  finally{if(btn)btn.disabled=false}
 };
 box.querySelector("#qau-submit")?.addEventListener("click",()=>submitAuth(authTab));
 box.querySelector("#qau-magic")?.addEventListener("click",()=>submitAuth("magic"));
 box.querySelector("#qau-quasar-btn")?.addEventListener("click",async()=>{
  const qId=await askText(t("dlg.quasar.t"),"",{icon:"badge",label:t("dlg.quasar.l"),confirm:t("dlg.next"),required:true});
  if(!qId||!qId.trim())return;
  const em=box.querySelector("#qau-email");
  if(em){
   em.value=qId.trim().includes("@")?qId.trim():`${qId.trim().toLowerCase()}@quasar.id`;
  }
  const pass=box.querySelector("#qau-pass");
  if(pass){
   pass.focus();
   const msg=box.querySelector("#qauthmsg");
   if(msg)msg.textContent=LANG==="ru"?"Quasar ID указан. Введите пароль для входа.":"Quasar ID specified. Enter password.";
  }
 });
 const onEnter=(e)=>{if(e.key==="Enter"){e.preventDefault();submitAuth(authTab)}};
 box.querySelector("#qau-email")?.addEventListener("keydown",onEnter);
 box.querySelector("#qau-pass")?.addEventListener("keydown",onEnter);
 box.querySelector("#qau-user")?.addEventListener("keydown",onEnter);
};

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

/* Profile bubble: the picture when there is one, the first letter or person icon when not, with optional status badge. */
/* Avatar: the initial is always there underneath and the picture is an <img>
   on top of it. A background-image that failed to load used to leave an empty
   circle (only the status dot was visible). Relayed URLs that the proxy
   refuses (hosts outside its allow-list) retry the direct URL once, then give
   up and leave the initial. See the capture-phase "error" listener below. */
/* ── Presence ───────────────────────────────────────────────────────
   Every status dot used to be hardcoded "online". Now each signed-in client
   writes its own row in public.presence about once a minute (and on play /
   pause / track change), and a dot is green only when that row is fresh.
   Friends' rows are readable through RLS; anyone else has no dot at all. */
const PRES={rows:new Map(),t:0,last:"",loaded:0};
const PRES_FRESH=150*1000;
function presStatus(id){
 id=String(id||"");if(!id)return null;
 if(sbUser&&id===sbUser.id)return S.playing?"listening":"online";
 const r=PRES.rows.get(id);if(!r)return null;
 const age=Date.now()-Date.parse(r.updated_at||0);
 if(!(age<PRES_FRESH))return "offline";
 return r.playing&&r.track?"listening":"online"}
function presTrack(id){
 const r=PRES.rows.get(String(id||""));
 if(!r||!r.playing||!r.track||!(Date.now()-Date.parse(r.updated_at||0)<PRES_FRESH))return null;
 return r.track}
async function presLoad(ids){
 ids=[...new Set((ids||[]).map(String).filter(x=>x&&!/^usr_|^g:|^grp/.test(x)))];
 if(!sb||!sbUser||!ids.length)return;
 try{
  const {data,error}=await sb.from("presence").select("user_id,track,playing,updated_at").in("user_id",ids.slice(0,200));
  if(error)throw error;
  ids.forEach(id=>PRES.rows.delete(id));
  (data||[]).forEach(r=>PRES.rows.set(String(r.user_id),r));
  PRES.loaded=Date.now();presPaint();
 }catch(e){console.warn("presence read:",e.message||e)}}
/* Re-colours the dots already on screen instead of re-rendering lists. */
function presPaint(){
 document.querySelectorAll(".avat-wrap[data-profile] .status-indicator").forEach(dot=>{
  const st=presStatus(dot.parentElement.dataset.profile);
  dot.classList.toggle("listening",st==="listening");
  dot.classList.toggle("online",st==="online");
  dot.classList.toggle("offline",st!=="listening"&&st!=="online");
  dot.hidden=!st})}
async function presBeat(force){
 if(!sb||!sbUser)return;
 const tr=S.current&&S.current.mode!=="empty"?S.current:null;
 const sig=(tr?trackKey(tr):"")+"|"+S.playing;
 if(!force&&sig===PRES.last&&Date.now()-PRES.t<55000)return;
 PRES.last=sig;PRES.t=Date.now();
 const row={user_id:sbUser.id,playing:!!(S.playing&&tr),position:Math.floor(S.pos||0),
  track:tr?{id:String(tr.id),s:tr.s,t:tr.t||"",a:tr.a||"",art:/^https?:/.test(tr.art||"")?tr.art:null,d:+tr.d||0}:null,
  updated_at:new Date().toISOString()};
 try{const {error}=await sb.from("presence").upsert(row,{onConflict:"user_id"});if(error)throw error}
 catch(e){console.warn("presence write:",e.message||e)}}
/* Leaving marks the row stale at once, so friends do not see a green dot
   for the next two and a half minutes. */
function presBye(){
 if(!sb||!sbUser)return;
 try{sb.from("presence").upsert({user_id:sbUser.id,playing:false,updated_at:new Date(Date.now()-10*60*1000).toISOString()},{onConflict:"user_id"}).then(()=>{},()=>{})}catch(_){}}
setInterval(()=>{if(!document.hidden||S.playing)presBeat(false)},20000);
setInterval(()=>{if(S.view==="people"&&!document.hidden&&PRES.rows.size)presLoad([...PRES.rows.keys()])},45000);
window.addEventListener("pagehide",presBye);
const avat=(p,size=34,status=null)=>{
 const pid=String(p?.id||p?.user_id||"");
 const link=pid&&!/^(g:|grp)/.test(pid)?` data-profile="${esc(pid)}"`:"";
 const raw=String(p?.avatar_url||"").trim();
 const u=raw?cssUrlRaw(raw):"";
 const direct=/^https?:\/\//i.test(raw)?raw:"";
 const un=(p?.username||"").trim();
 const letter=(un&&un!=="…"&&un!=="..."&&!/^\.+$/.test(un))?[...un][0].toUpperCase():"";
 const ghostInner=letter?`<span class="avat-l">${esc(letter)}</span>`:`<span class="material-symbols-rounded" style="font-size:${Math.round(size*0.58)}px">person</span>`;
 const img=u?`<img class="avat-img" src="${esc(u)}"${direct&&direct!==u?` data-direct="${esc(direct)}"`:""} alt="" loading="lazy" decoding="async" draggable="false">`:"";
 const base=`<span class="avat ghost${u?" has-img":""}"${status?"":link} style="width:${size}px;height:${size}px;font-size:${Math.max(11,Math.round(size*.42))}px">${ghostInner}${img}</span>`;
 if(!status)return base;
 const dotCls=status==="listening"?"listening":(status==="online"?"online":"offline");
 const dotTitle=status==="listening"?(LANG==="ru"?"Слушает музыку":"Listening to music"):(status==="online"?(LANG==="ru"?"В сети":"Online"):(LANG==="ru"?"Не в сети":"Offline"));
 return `<div class="avat-wrap"${link} style="width:${size}px;height:${size}px;--dot:${Math.max(9,Math.round(size*.26))}px">${base}<span class="status-indicator ${dotCls}" title="${dotTitle}"></span></div>`;
};
/* A person is a link to their profile wherever they show up: avatars carry
   data-profile, names data-person. Chat-list rows keep opening the chat —
   there the whole row is the target. Captured, so the per-list handlers
   that used to do the same thing do not run twice. */
let PEOPLE_PENDING=null;
const isMe=id=>typeof sbUser!=="undefined"&&!!sbUser&&String(id)===String(sbUser.id);
function openProfile(id){
 id=String(id||"");if(!id||isMe(id))return;
 if(fp?.dataset.open==="true")closeFP();
 if(settingsIsOpen())closeSettings(true);
 if(S.view!=="people"){PEOPLE_PENDING=id;go("people");return}
 renderPeopleProfile(id)}
document.addEventListener("click",e=>{
 const tg=e.target instanceof Element?e.target:null;
 const el=tg?.closest("[data-profile],[data-person]");
 if(!el)return;
 const id=el.dataset.profile||el.dataset.person;
 if(!id||isMe(id))return;
 /* The chat list: the row opens the conversation. The profile header: it is
    already the profile. A control inside the block does its own thing. */
 if(!el.hasAttribute("data-person")&&el.closest("[data-openchat],.chat-dm-user,.mli,.profhead,.avatar-holder"))return;
 const ctl=tg.closest("button,a,input,select,textarea");
 if(ctl&&ctl!==el&&el.contains(ctl))return;
 e.preventDefault();e.stopPropagation();
 openProfile(id)},true);
document.addEventListener("error",e=>{
 const im=e.target;
 if(!(im instanceof HTMLImageElement)||!im.classList.contains("avat-img"))return;
 const d=im.dataset.direct;
 if(d&&im.src!==d){im.removeAttribute("data-direct");im.src=d;return}
 im.parentElement?.classList.remove("has-img");im.remove()},true);

/* ── Social Mock Store & Community Directory ─────────────────────────
   Allows guest and offline users to explore profiles, interact with friends,
   and test chats, while Supabase users get full cloud sync. */
const MOCK_STORAGE_KEY_FRIENDS = "mw.social.mock_friends.v3";
const MOCK_STORAGE_KEY_CHATS = "mw.social.mock_chats.v3";

/* The demo community (twelve invented people, all permanently "online") is
   gone: it was the "fake online" report. Guests see an honest empty state,
   and every status dot comes from the presence table (see PRES below). The
   names stay as empty stubs because older code paths still look them up. */
const MOCK_COMMUNITY_USERS = [];
try{localStorage.removeItem(MOCK_STORAGE_KEY_FRIENDS);localStorage.removeItem(MOCK_STORAGE_KEY_CHATS)}catch(_){}

function getMockFriends(){return []}

function saveMockFriends(list){}

function getMockChats(){return []}

function saveMockChats(list){}

function updatePeopleSummary(friendsCount=0, listeningCount=0){
  const sum=document.getElementById("peoplesum");
  if(!sum)return;
  const f=Number(friendsCount)||0, l=Number(listeningCount)||0;
  if(LANG==="ru"){
    const fStr = f===1?"1 друг":(f>=2&&f<=4?`${f} друга`:`${f} друзей`);
    const lStr = l ? ` · ${l} ${l===1?"слушает":"слушают"} музыку` : "";
    sum.textContent = `${fStr}${lStr}`;
  }else{
    sum.textContent = `${f} ${f===1?"friend":"friends"}${l?` · ${l} listening`:""}`;
  }
}

/* A room invite inside a message body: any "MEOW-XXXX" code becomes a join
   button, so an invite is one tap regardless of who sent it. */
const JOIN_RE=/MEOW-[2-9A-HJ-NP-Z]{4}/;
function chatBodyHtml(m){
 const img=m.image?`<img class="chatimg" src="${esc(m.image)}" alt="" loading="lazy">`:"";
 if(!m.body)return img;
 /* Track chips are cut out of the RAW body and put back after escaping: the
    old order escaped first and then escaped the chip pieces again, so "AT&T"
    rendered as "AT&amp;T" and the chip searched for the literal "&amp;". */
 const chips=[];
 let body=m.body.replace(/🎵\s*([^\n—–-]+)\s*[—–-]\s*([^\n]+)/g,(match,art,tit)=>{
  const cleanArt=art.trim(), cleanTit=tit.trim();
  const fullQ=`${cleanArt} ${cleanTit}`;
  chips.push(`<div class="chat-track-chip" data-chat-play="${esc(fullQ)}" title="${LANG==="ru"?"Включить трек":"Play track"}"><button type="button" aria-label="Play"><span class="material-symbols-rounded" style="font-size:14px">play_arrow</span></button><span>${esc(cleanArt)} — <b>${esc(cleanTit)}</b></span></div>`);
  return `\u0000CHIP${chips.length-1}\u0000`;
 });
 body=esc(body);
 body=body.replace(/MEOW-[2-9A-HJ-NP-Z]{4}/gi,code=>`<button class="btn sm joinchip" data-join="${code}"><span class="material-symbols-rounded" style="font-size:16px">podcasts</span>${code}</button>`);
 body=body.replace(/(https?:\/\/[^\s<]+)/g,url=>`<a href="${url}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:underline;word-break:break-all">${url}</a>`);
 body=body.replace(/\u0000CHIP(\d+)\u0000/g,(_,i)=>chips[+i]||"");
 return img+body;
}

let PEOPLE_QUERY="";
let PEOPLE_FILTER="all"; // "all" | "listening" | "online" | "requests"
let PEOPLE_RESULTS=[];
let PEOPLE_TAB="friends";
let FRIEND_PENDING=0;

/* Animated in-app notification. */
function notify(title,body,opts={}){
  const box=document.getElementById("notes");
  if(!box)return;
  const el=document.createElement("div");
  el.className="note";
  el.innerHTML=`<span class="noteic"><span class="material-symbols-rounded" style="font-size:18px" bell")}">${esc(window.toMaterialSymbol?window.toMaterialSymbol(opts.icon||"bell"):"notifications")}</span></span>
   <span class="notetxt"><b>${esc(title)}</b>${body?`<span>${esc(body)}</span>`:""}</span>
   <button class="notex" aria-label="close"><span class="material-symbols-rounded" style="font-size:16px">close</span></button>`;
  box.appendChild(el);
  icons();
  const kill=()=>{if(el.dataset.gone)return;el.dataset.gone="1";el.classList.add("out");setTimeout(()=>el.remove(),320)};
  el.querySelector(".notex").onclick=kill;
  if(opts.onClick)el.querySelector(".notetxt").onclick=()=>{kill();opts.onClick()};
  setTimeout(kill,opts.ms||6000);
  try{if(typeof Notification!=="undefined"&&Notification.permission==="granted")new Notification(title,{body})}catch(e){}
}

/* Incoming friend requests drive both the rail badge and the notification. */
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

/* Profile view: shows banner, avatar with status, equipped badge, listening activity,
   pinned track with play button, listening stats, and direct social actions. */
async function renderPeopleProfile(id){
  const box=document.getElementById("peoplebody");if(!box)return;
  hideChatPane();
  box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${t("people.loading")}</p></div>`;

  let p=null;
  let isMock=false;
  if(sb&&sbUser){
    try{
      let {data,error}=await sb.from("profiles")
        .select("id,username,avatar_url,banner_url,bio,privacy,pinned_badges,prefs,equipped_badge,equipped_badges")
        .eq("id",id).maybeSingle();
      if(error)({data,error}=await sb.from("profiles")
        .select("id,username,avatar_url,banner_url,bio,privacy,pinned_badges,prefs")
        .eq("id",id).maybeSingle());
      if(!error&&data)p=data;
    }catch(e){}
  }

  if(!p){
    const mockList=getMockFriends();
    const found=mockList.find(m=>m.id===id)||MOCK_COMMUNITY_USERS.find(m=>m.id===id);
    if(found){
      isMock=true;
      p={
        id:found.id,
        username:found.username,
        avatar_url:found.avatar_url,
        banner_url:found.banner_url,
        bio:found.bio,
        privacy:{},
        pinned_badges:found.equipped_badge?[found.equipped_badge]:[],
        equipped_badge:found.equipped_badge||null,
        status:found.status,
        listen_seconds:found.listen_seconds||140000,
        listening:found.listening,
        isFriend:found.isFriend
      };
    }
  }

  if(!p){
    box.innerHTML=`<div class="panel pane"><p class="ph" style="margin:0">${t("soc.nouser")}</p></div>`;
    return;
  }

  const mine=sbUser?p.id===sbUser.id:false;
  let friend=isMock?!!p.isFriend:false;
  let rel=null;

  if(!isMock&&sb&&sbUser&&!mine){
    try{
      const res=await sb.from("friendships").select("requester,addressee,status")
        .or(`and(requester.eq.${sbUser.id},addressee.eq.${p.id}),and(requester.eq.${p.id},addressee.eq.${sbUser.id})`)
        .maybeSingle();
      rel=res.data;
      friend=rel?.status==="accepted";
    }catch(e){}
  }

  const view=mine?p:(typeof maskProf==="function"?maskProf(p):p);
  const showHours=true;
  let secs=p.listen_seconds||0;
  if(!isMock&&sb&&sbUser){
    try{
      const {data:st}=await sb.from("user_stats").select("listen_seconds").eq("user_id",p.id).maybeSingle();
      if(st?.listen_seconds)secs=Number(st.listen_seconds);
    }catch(e){}
  }

  await loadBadgeCatalog();
  const pins=Array.isArray(p.pinned_badges)?p.pinned_badges:[];
  /* The stat used to print the pinned count, so a friend wearing three
     badges read "0 badges". user_badges is readable wherever the profile is. */
  let nBadges=Math.max(pins.length,badgeIds(p).length);
  if(!isMock&&sb&&sbUser){
    try{const {count,error}=await sb.from("user_badges").select("badge_id",{count:"exact",head:true}).eq("user_id",p.id);
     if(!error&&Number.isFinite(count))nBadges=Math.max(nBadges,count)}catch(e){}
  }
  const pinHtml=pins.map(bid=>{
    const b=(BADGES||[]).find(x=>x.id===bid);if(!b)return "";
    const c=RARITY_COLOR[b.rarity]||RARITY_COLOR.common;
    return `<span class="pinb" style="--ring:${c}" title="${esc(badgeName(b))}"><img src="assets/badges/${esc(b.file)}" alt=""></span>`;
  }).join("");

  const profTr=mine?S.profileTrack:(p.prefs?.profile_track||p.profile_track||(p.listening?{t:p.listening.t,a:p.listening.a,art:p.listening.art}:null));

  const pbs=window.MWProf?MWProf.attrs(MWProf.specOf(p)):{cls:"",style:""};
  const pImg=!!view.banner_url&&!pbs.cls;
  box.innerHTML=`<div class="panel pane public-profile pf2" style="padding:0;overflow:hidden">
    <div class="banner${pImg?"":pbs.cls||" noimg"}"${pImg?"":pbs.style}>${pImg?`<img src="${esc(view.banner_url)}" alt="">`:""}</div>
    <div class="pf-main">
      <div class="profhead">
        <span class="avatar-holder"><span class="avatar${view.avatar_url?" has-img":""}">${avat(view, 104)}</span>${(()=>{const st=presStatus(p.id)||(friend?"offline":null);if(!st)return "";const c=st==="listening"?"listening":st==="online"?"online":"offline";return `<span class="status-indicator ${c}"></span>`})()}</span>
        <div class="pf-id">
          <div class="uname"><b class="unview">${esc(view.username||t("chat.anon"))}</b> ${userBadgeTag(mine?myBadges():badgeIds(p),{full:true})}</div>
          <div class="pinrow" style="margin-top:4px">${pinHtml}</div>
          ${p.bio?`<p class="pbio" style="margin-top:6px">${esc(p.bio)}</p>`:""}
          ${profTr?`
          <div style="margin-top:12px;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:12px;display:flex;align-items:center;gap:12px;border:1px solid rgba(255,255,255,0.08)">
            <span class="cover sm" ${coverStyle(profTr.art,profTr.l1,profTr.l2)}></span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:0.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(profTr.t)}</div>
              <div style="color:var(--mute);font-size:0.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(profTr.a||"—")}</div>
            </div>
            <button class="btn sm primary" id="people-prof-play" title="${t("np.play")}"><span class="material-symbols-rounded" style="font-size:16px">play_arrow</span></button>
          </div>`:""}
        </div>
      </div>
      <div class="stats" style="margin-top:16px">
        <div class="stat"><b>${showHours?fmtListen(secs):"—"}</b><span>${t("pr.hours")}</span></div>
        <div class="stat"><b>${nBadges}</b><span>${t("pr.badges")}</span></div>
        <div class="stat"><b>${friend?t("people.friend"):t("people.notfriend")}</b><span>${t("fr.t")}</span></div>
      </div>
      <div class="public-actions" id="people-actions" style="margin-top:16px"></div>
      <div style="margin-top:16px"><button class="btn" id="people-back"><span class="material-symbols-rounded" style="font-size:16px">arrow_back</span> ${t("nav.people")}</button></div>
    </div>
  </div>`;

  document.getElementById("people-prof-play")?.addEventListener("click",async ()=>{
    if(!profTr)return;
    const q=`${profTr.a} ${profTr.t}`.trim();
    toast((LANG==="ru"?"Поиск и запуск: ":"Playing: ")+q);
    try{
      const hits=await searchRemote(q);
      if(hits&&hits.length>0){
        await setTrack(hits[0],true,false,"people");
        return;
      }
    }catch(_){}
    go("search");
    const inp=document.getElementById("q");
    if(inp){inp.value=q;search(q)}
  });

  document.getElementById("people-back").onclick=()=>setPeopleTab(PEOPLE_TAB);
  const a=document.getElementById("people-actions");
  if(mine){
    a.innerHTML=`<span class="mut">${t("people.you")}</span>`;
    icons();
    return;
  }

  if(friend){
    a.innerHTML=`<button class="primary" id="people-dm"><span class="material-symbols-rounded" style="font-size:18px">chat_bubble</span> ${t("people.message")}</button>
      <button class="btn danger" id="people-unfr">${t("fr.rm")}</button>`;
    document.getElementById("people-dm").onclick=()=>openChat("d:"+p.id);
    document.getElementById("people-unfr").onclick=async()=>{
      if(isMock||!sbUser){
        const list=getMockFriends();
        const f=list.find(x=>x.id===p.id);
        if(f){f.isFriend=false;saveMockFriends(list)}
        toast(LANG==="ru"?"Удален из друзей":"Removed from friends");
        renderPeopleProfile(p.id);
      }else{
        await sb.from("friendships").delete().eq("requester",rel.requester).eq("addressee",rel.addressee);
        renderPeopleProfile(p.id);
      }
    };
  }else if(rel?.status==="pending"&&rel.requester===sbUser?.id){
    a.innerHTML=`<span class="mut">${t("people.pending")}</span>`;
  }else if(rel?.status==="pending"){
    a.innerHTML=`<button class="primary" id="people-accept">${t("people.accept")}</button>`;
    document.getElementById("people-accept").onclick=async()=>{
      const {error}=await sb.from("friendships").update({status:"accepted"})
        .eq("requester",rel.requester).eq("addressee",rel.addressee);
      if(error)return toast(error.message);
      refreshFriendNotice();renderPeopleProfile(p.id)};
  }else{
    a.innerHTML=`<button class="primary" id="people-add"><span class="material-symbols-rounded" style="font-size:18px">person_add</span> ${t("people.add")}</button>`;
    document.getElementById("people-add").onclick=async()=>{
      if(isMock||!sbUser){
        const list=getMockFriends();
        const f=list.find(x=>x.id===p.id);
        if(f){f.isFriend=true;saveMockFriends(list)}
        toast(LANG==="ru"?"Добавлен в друзья!":"Added to friends!");
        renderPeopleProfile(p.id);
      }else{
        const {error}=await sb.rpc("add_friend_by_username",{name:p.username});
        if(error)return toast(error.message);
        notify(t("people.pending"),view.username||"",{icon:"user-plus"});
        renderPeopleProfile(p.id);
      }
    };
  }
  icons();
}

/* Re-triggering a CSS animation */
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
  if(PEOPLE_PENDING){const id=PEOPLE_PENDING;PEOPLE_PENDING=null;return renderPeopleProfile(id)}
  if(PEOPLE_TAB!=="find")PEOPLE_TAB="friends";
  hideChatPane();
  if(PEOPLE_TAB==="find")await renderPeopleFind(box);
  else await renderPeopleFriends(box);
  animIn(box,"peo-enter");
}

function peopleRow(p,sub){
  return `<button class="people-row" data-person="${esc(p.id)}">${avat(p,42,presStatus(p.id)||p.status||null)}
    <span class="meta"><b>${esc(p.username||t("chat.anon"))}</b><span>${esc(sub||p.bio||t("people.open"))}</span></span>
    <span class="material-symbols-rounded" style="font-size:18px">chevron_right</span></button>`;
}

/* ── Find / Discover People ─────────────────────────────────────────── */
async function renderPeopleFind(box){
  const isGuest=!sb||!sbUser;
  const guestBanner=isGuest?`
    <div class="people-guest-banner">
      <div class="people-guest-info">
        <span class="material-symbols-rounded" style="font-size:24px;color:var(--accent)">auto_awesome</span>
        <div>
          <b>${LANG==="ru"?"Исследуйте сообщество Meowave":"Explore Meowave Community"}</b>
          <span>${LANG==="ru"?"Знакомьтесь с меломанами, слушайте их треки и делитесь вкусом.":"Discover music lovers, listen to their favorite tracks, and share music taste."}</span>
        </div>
      </div>
      <button class="btn primary sm" id="people-guest-auth-btn">${LANG==="ru"?"Войти":"Sign In"}</button>
    </div>`:"" ;

  box.innerHTML=`<div class="panel pane people-search">
    ${guestBanner}
    <div class="people-toolbar">
      <div class="people-search-box">
        <span class="material-symbols-rounded" style="font-size:18px">search</span>
        <input id="people-q" placeholder="${t("people.search.ph")}" value="${esc(PEOPLE_QUERY)}" maxlength="32" autocomplete="off">
      </div>
    </div>
    <div id="people-results"></div>
  </div>`;

  const input=document.getElementById("people-q");
  const results=document.getElementById("people-results");

  const run=async(queryText=null)=>{
    const q=(queryText!==null?queryText:input.value).trim();
    PEOPLE_QUERY=q;
    let foundList=[];

    if(sb&&sbUser){
      try{
        if(q){
          /* The surrounding % are ours and stay wildcards; anything the user
             typed is escaped, so searching `a_b` finds `a_b` and not `axb`. */
          const needle=q.trim().replace(/([\\%_])/g,"\\$1");
          const {data,error}=await sb.from("profiles").select("id,username,avatar_url,bio,privacy")
            .ilike("username",`%${needle}%`).neq("id",sbUser.id).limit(16);
          if(!error&&data)foundList=data.map(maskProf);
        }else{
          const {data,error}=await sb.from("profiles").select("id,username,avatar_url,bio,privacy,updated_at")
            .neq("id",sbUser.id).order("updated_at",{ascending:false}).limit(16);
          if(!error&&data)foundList=data.map(maskProf);
        }
      }catch(e){console.warn("fetch community profiles:",e)}
    }

    const mockAll=getMockFriends();
    const matchedMock=mockAll.filter(m=>{
      if(!q)return true;
      const lq=q.toLowerCase();
      return m.username.toLowerCase().includes(lq) ||
             (m.bio&&m.bio.toLowerCase().includes(lq));
    });

    // Merge: if real community profiles found, use them; supplement with mock only if offline or empty
    const combined=[...foundList];
    if(!combined.length||isGuest||!sbUser){
      matchedMock.forEach(m=>{
        if(!combined.some(x=>x.id===m.id||x.username===m.username)) combined.push(m);
      });
    }

    if(!combined.length){
      results.innerHTML=`<div style="text-align:center;padding:36px 16px;color:var(--mute)">
        <span class="material-symbols-rounded" style="font-size:32px;opacity:0.4;margin-bottom:8px">group</span>
        <p class="ph" style="margin:0">${t("people.none")}</p>
      </div>`;
      icons();
      return;
    }

    const sectionTitle=q
      ? (LANG==="ru"?"Результаты поиска:":"Search results:")
      : (isGuest||!sbUser
          ? (LANG==="ru"?"Рекомендации сообщества (Демо):":"Community Recommendations (Demo):")
          : (LANG==="ru"?"Участники сообщества:":"Community Members:"));
    const sectionSubtitle=(isGuest||!sbUser)&&!q
      ? `<span style="font-size:0.75rem;font-weight:normal;opacity:0.8">${LANG==="ru"?"Демонстрация функций":"Feature preview"}</span>`
      : "";

    let findLimit = 8;
    const renderCards = () => {
      const visible = combined.slice(0, findLimit);
      const remaining = combined.length - findLimit;
      const loadMoreHtml = remaining > 0 ? `
        <div class="people-load-more-wrap">
          <button class="people-load-more-btn" id="people-load-more">
            <span class="material-symbols-rounded">expand_more</span>
            <span>${LANG==="ru" ? `Показать ещё (${remaining})` : `Show more (${remaining})`}</span>
          </button>
        </div>` : "";

      results.innerHTML=`
        <div style="font-size:0.82rem;font-weight:600;color:var(--mute);margin:8px 0 10px;display:flex;align-items:center;justify-content:space-between">
          <span>${sectionTitle} (${combined.length})</span>
          ${sectionSubtitle}
        </div>
        <div class="people-find-grid">
          ${visible.map(p=>{
            const isFr=!!p.isFriend;
            const banner=p.banner_url||"";
            const listeningChip=p.listening?`
              <div class="friend-listening-chip" style="margin-top:6px">
                <div class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div>
                <span>${esc(p.listening.a)} — <b>${esc(p.listening.t)}</b></span>
                <button class="friend-listening-play" data-play-track="${esc(p.listening.a)} — ${esc(p.listening.t)}" title="${LANG==='ru'?'Включить':'Play'}"><span class="material-symbols-rounded" style="font-size:14px">play_arrow</span></button>
              </div>`:"" ;
            return `
            <div class="people-find-card">
              <div class="people-find-banner" data-person="${esc(p.id)}" style="${banner?`background-image:url('${cssUrl(banner)}')`:(window.MWProf?.cardBg?.(p)||"")}"></div>
              <div class="people-find-body">
                <div class="people-find-top">
                  ${avat(p, 46, presStatus(p.id)||p.status||null)}
                  <button class="btn sm ${isFr?"":"primary"}" data-find-action="${esc(p.id)}" style="font-size:0.75rem">
                    <span class="material-symbols-rounded" style="font-size:16px">${isFr?"check":"person_add"}</span> ${isFr?(LANG==="ru"?"В друзьях":"Friends"):(LANG==="ru"?"Добавить":"Add")}
                  </button>
                </div>
                <div style="font-weight:600;font-size:0.92rem;cursor:pointer" data-person="${esc(p.id)}">${esc(p.username)}</div>
                ${p.bio?`<div style="font-size:0.78rem;color:var(--mute);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.bio)}</div>`:""}
                ${listeningChip}
              </div>
            </div>`;
          }).join("")}
        </div>
        ${loadMoreHtml}`;

      results.querySelector("#people-load-more")?.addEventListener("click",()=>{
        findLimit += 8;
        renderCards();
      });

      results.querySelectorAll("[data-person]").forEach(b=>b.onclick=()=>renderPeopleProfile(b.dataset.person));
      results.querySelectorAll("[data-find-action]").forEach(btn=>{
        btn.onclick=async e=>{
          e.stopPropagation();
          const pid=btn.dataset.findAction;
          const target=combined.find(x=>x.id===pid);
          if(!target)return;
          if(isGuest||!sbUser){
            const mList=getMockFriends();
            const item=mList.find(x=>x.id===pid);
            if(item){
              item.isFriend=!item.isFriend;
              saveMockFriends(mList);
              target.isFriend=item.isFriend;
              toast(item.isFriend?(LANG==="ru"?"Добавлен в друзья!":"Added to friends!"):(LANG==="ru"?"Удален из друзей":"Removed from friends"));
              renderCards();
            }
          }else{
            const {error}=await sb.rpc("add_friend_by_username",{name:target.username});
            if(error)return toast(error.message);
            notify(t("people.pending"),target.username||"",{icon:"user-plus"});
            btn.innerHTML=`<span class="material-symbols-rounded" style="font-size:16px">schedule</span> ${t("people.pending")}`;
            btn.disabled=true;
            icons();
          }
        };
      });

      results.querySelectorAll("[data-play-track]").forEach(btn=>{
        btn.onclick=async e=>{
          e.stopPropagation();
          const trQ=btn.dataset.playTrack;
          if(trQ){
            toast((LANG==="ru"?"Поиск и запуск: ":"Playing: ")+trQ);
            try{
              const hits=await searchRemote(trQ);
              if(hits&&hits.length>0){
                await setTrack(hits[0],true,false,"find");
                return;
              }
            }catch(_){}
            go("search");
            const qInp=document.getElementById("q");
            if(qInp){qInp.value=trQ;search(trQ)}
          }
        };
      });

      icons();
    };

    renderCards();
    return;
  };


  document.getElementById("people-guest-auth-btn")?.addEventListener("click",()=>{
    needAuth(box);
  });

  let debounceTimer=null;
  input.oninput=()=>{
    clearTimeout(debounceTimer);
    debounceTimer=setTimeout(()=>run(),250);
  };
  input.onkeydown=e=>{if(e.key==="Enter")run()};

  run(PEOPLE_QUERY);
}

/* ── Friends List with Live Status & Track Playback ───────────────── */
async function renderPeopleFriends(box){
  const isGuest=!sb||!sbUser;
  let accepted=[], pendingIn=[], pendingOut=[];

  if(!isGuest){
    try{
      const me=sbUser.id;
      const {data,error}=await sb.from("friendships").select("*").or(`requester.eq.${me},addressee.eq.${me}`);
      if(!error&&data){
        const rows=data;
        const otherId=r=>r.requester===me?r.addressee:r.requester;
        const accRows=rows.filter(r=>r.status==="accepted");
        const inRows=rows.filter(r=>r.status==="pending"&&r.addressee===me);
        const outRows=rows.filter(r=>r.status==="pending"&&r.requester===me);
        const allIds=[...accRows,...inRows,...outRows].map(otherId);

        let profs=[];
        if(allIds.length){
          let pRes=await sb.from("profiles").select("id,username,avatar_url,bio,privacy").in("id",allIds);
          if(pRes.error){
            pRes=await sb.from("profiles").select("id,username,avatar_url,bio").in("id",allIds);
          }
          if(!pRes.error&&pRes.data) profs=pRes.data.map(maskProf);
        }
        const mockListAll=getMockFriends();
        const prof=id=>{
          const found=profs.find(p=>p&&p.id===id);
          if(found&&found.username)return found;
          const mock=mockListAll.find(m=>m.id===id);
          if(mock)return mock;
          return {id, username:found?.username||(LANG==="ru"?"Пользователь":"User"), bio:found?.bio||""};
        };

        accepted=accRows.map(r=>{
          const p=prof(otherId(r));
          return {...p, reqData:r};
        });
        await presLoad(accepted.map(x=>x.id));
        accepted=accepted.map(x=>({...x,status:presStatus(x.id)||"offline",listening:presTrack(x.id)}));
        pendingIn=inRows.map(r=>({r, p:prof(otherId(r))}));
        pendingOut=outRows.map(r=>({r, p:prof(otherId(r))}));
      }
    }catch(e){console.warn("friends query:",e)}
  }

  // If in guest mode, load rich mock friends
  if(isGuest){
    const mockList=getMockFriends();
    const mockFriends=mockList.filter(m=>m.isFriend);
    accepted=mockFriends.map(m=>({
      id:m.id,
      username:m.username,
      avatar_url:m.avatar_url,
      bio:m.bio,
      status:m.status,
      listening:m.listening,
      listen_seconds:m.listen_seconds,
      isMock:true
    }));
  }

  const listeningFriends=accepted.filter(f=>f.status==="listening");
  const onlineFriends=accepted.filter(f=>f.status==="online"||f.status==="listening");

  updatePeopleSummary(accepted.length, listeningFriends.length);

  const guestBanner=isGuest?`
    <div class="people-guest-banner">
      <div class="people-guest-info">
        <span class="material-symbols-rounded" style="font-size:24px;color:var(--accent)">group</span>
        <div>
          <b>${LANG==="ru"?"Локальный список друзей":"Local Friends & Community"}</b>
          <span>${LANG==="ru"?"Войдите в аккаунт для добавления друзей по всему миру и синхронизации.":"Sign in to add friends across devices and sync in the cloud."}</span>
        </div>
      </div>
      <button class="btn primary sm" id="fr-guest-login">${LANG==="ru"?"Войти":"Sign In"}</button>
    </div>`:"" ;

  box.innerHTML=`<div class="panel pane people-search">
    ${guestBanner}
    <div class="people-toolbar">
      <div class="tokrow" style="margin:0 0 10px">
        <input id="fr-add" placeholder="${t("fr.addph")}" autocomplete="off" maxlength="24">
        <button class="btn primary" id="fr-addbtn"><span class="material-symbols-rounded" style="font-size:16px">person_add</span> ${t("fr.add")}</button>
      </div>

      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div class="people-search-box" style="flex:1;min-width:200px">
          <span class="material-symbols-rounded" style="font-size:18px">search</span>
          <input id="fr-filter" placeholder="${LANG==="ru"?"Фильтр по имени или треку...":"Filter by name or track..."}" autocomplete="off">
        </div>
        <div class="people-filters-row">
          <button class="people-filter-chip ${PEOPLE_FILTER==="all"?"active":""}" data-frtab="all">${LANG==="ru"?"Все":"All"} (${accepted.length})</button>
          <button class="people-filter-chip ${PEOPLE_FILTER==="listening"?"active":""}" data-frtab="listening"><span class="material-symbols-rounded" style="font-size:15px">graphic_eq</span> ${LANG==="ru"?"Слушают":"Listening"} (${listeningFriends.length})</button>
          <button class="people-filter-chip ${PEOPLE_FILTER==="online"?"active":""}" data-frtab="online">${LANG==="ru"?"В сети":"Online"} (${onlineFriends.length})</button>
          ${pendingIn.length?`<button class="people-filter-chip ${PEOPLE_FILTER==="requests"?"active":""}" data-frtab="requests">${t("fr.reqs")} (${pendingIn.length})</button>`:""}
        </div>
      </div>
    </div>

    <div id="fr-content"></div>
  </div>`;

  document.getElementById("fr-guest-login")?.addEventListener("click",()=>needAuth(box));

  const contentBox=document.getElementById("fr-content");
  const filterInput=document.getElementById("fr-filter");

  const renderFilteredFriends=()=>{
    const q=filterInput?.value.trim().toLowerCase()||"";
    let list=[...accepted];

    if(PEOPLE_FILTER==="listening") list=list.filter(f=>f.status==="listening");
    else if(PEOPLE_FILTER==="online") list=list.filter(f=>f.status==="online"||f.status==="listening");

    if(q){
      list=list.filter(f=>
        f.username.toLowerCase().includes(q) ||
        (f.bio&&f.bio.toLowerCase().includes(q)) ||
        (f.listening&&(`${f.listening.a} ${f.listening.t}`.toLowerCase().includes(q)))
      );
    }

    let html="";

    // Requests section
    if((PEOPLE_FILTER==="all"||PEOPLE_FILTER==="requests")&&pendingIn.length){
      html+=`<div style="margin-bottom:18px">
        <p class="eyebrow" style="margin:0 0 8px">${t("fr.reqs")} · ${pendingIn.length}</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${pendingIn.map(({r,p})=>`
            <div class="friend-card">
              ${avat(p, 42)}
              <div class="friend-info">
                <span class="friend-name" data-person="${esc(p.id)}">${esc(p.username)}</span>
                <span class="friend-bio">${t("people.incoming")}</span>
              </div>
              <div class="friend-actions">
                <button class="btn primary sm" data-acc="${r.requester}|${r.addressee}">${t("people.accept")}</button>
                <button class="btn sm danger" data-dec="${r.requester}|${r.addressee}">${t("people.reject")}</button>
              </div>
            </div>`).join("")}
        </div>
      </div>`;
    }

    if(PEOPLE_FILTER==="requests"&&!pendingIn.length){
      contentBox.innerHTML=`<div style="text-align:center;padding:48px 16px;color:var(--mute)">
        <p class="ph" style="margin:0">${LANG==="ru"?"Нет новых заявок в друзья":"No pending friend requests"}</p>
      </div>`;
      icons();
      return;
    }

    if(!list.length){
      if(!isGuest){
        html+=`<div style="text-align:center;padding:48px 16px;color:var(--mute)">
          <span class="material-symbols-rounded" style="font-size:36px;opacity:0.4;margin-bottom:10px">group</span>
          <p class="ph" style="margin:0 0 12px">${LANG==="ru"?"У вас пока нет друзей в аккаунте. Найдите единомышленников во вкладке «Найти людей»!":"You don't have friends yet. Discover music lovers in the 'Find People' tab!"}</p>
          <button class="btn primary sm" id="fr-go-find" style="display:inline-flex;align-items:center;gap:6px"><span class="material-symbols-rounded" style="font-size:16px">explore</span> ${LANG==="ru"?"Найти людей":"Discover People"}</button>
        </div>`;
      }else{
        html+=`<div style="text-align:center;padding:48px 16px;color:var(--mute)">
          <span class="material-symbols-rounded" style="font-size:32px;opacity:0.4;margin-bottom:8px">person_off</span>
          <p class="ph" style="margin:0 0 12px">${LANG==="ru"?"Друзья не найдены. Попробуйте изменить фильтр или найти новых людей.":"No friends found. Try adjusting filter or discover new people."}</p>
          <button class="btn primary sm" id="fr-go-find" style="display:inline-flex;align-items:center;gap:6px"><span class="material-symbols-rounded" style="font-size:16px">explore</span> ${LANG==="ru"?"Найти людей":"Discover People"}</button>
        </div>`;
      }
    }else{
      html+=`<div class="friends-grid">
        ${list.map(p=>{
          const listeningChip=p.listening?`
            <div class="friend-listening-chip">
              <div class="eq-bars"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div>
              <span>${esc(p.listening.a)} — <b>${esc(p.listening.t)}</b></span>
              <button class="friend-listening-play" data-play-track="${esc(p.listening.a)} — ${esc(p.listening.t)}" title="${LANG==='ru'?'Включить':'Play'}"><span class="material-symbols-rounded" style="font-size:14px">play_arrow</span></button>
            </div>`:"" ;

          return `
          <div class="friend-card">
            ${avat(p, 46, presStatus(p.id)||p.status||null)}
            <div class="friend-info">
              <div class="friend-name-row">
                <span class="friend-name" data-person="${esc(p.id)}">${esc(p.username)}</span>
              </div>
              <span class="friend-bio">${esc(p.bio||t("people.open"))}</span>
              ${listeningChip}
            </div>
            <div class="friend-actions">
              <button class="btn sm" data-dm="${esc(p.id)}" title="${t("people.message")}"><span class="material-symbols-rounded" style="font-size:18px">chat_bubble</span></button>
              <button class="btn sm" data-person="${esc(p.id)}" title="Профиль"><span class="material-symbols-rounded" style="font-size:18px">person</span></button>
              <button class="ic" data-unfr="${esc(p.id)}" title="${t("fr.rm")}"><span class="material-symbols-rounded" style="font-size:18px">person_remove</span></button>
            </div>
          </div>`;
        }).join("")}
      </div>`;
    }

    contentBox.innerHTML=html;

    contentBox.querySelector("#fr-go-find")?.addEventListener("click",()=>setPeopleTab("find"));
    contentBox.querySelectorAll("[data-person]").forEach(b=>b.onclick=()=>renderPeopleProfile(b.dataset.person));
    contentBox.querySelectorAll("[data-dm]").forEach(b=>b.onclick=e=>{e.stopPropagation();openChat("d:"+b.dataset.dm)});

    contentBox.querySelectorAll("[data-play-track]").forEach(btn=>{
      btn.onclick=async e=>{
        e.stopPropagation();
        const trQ=btn.dataset.playTrack;
        if(trQ){
          toast((LANG==="ru"?"Поиск и запуск: ":"Playing: ")+trQ);
          try{
            const hits=await searchRemote(trQ);
            if(hits&&hits.length>0){
              await setTrack(hits[0],true,false,"friends");
              return;
            }
          }catch(_){}
          go("search");
          const qInp=document.getElementById("q");
          if(qInp){qInp.value=trQ;search(trQ)}
        }
      };
    });

    contentBox.querySelectorAll("[data-unfr]").forEach(b=>b.onclick=async e=>{
      e.stopPropagation();
      const pid=b.dataset.unfr;
      const ok=confirm(LANG==="ru"?"Удалить из списка друзей?":"Remove from friends list?");
      if(!ok)return;
      if(isGuest||!sbUser){
        const mList=getMockFriends();
        const f=mList.find(x=>x.id===pid);
        if(f){f.isFriend=false;saveMockFriends(mList)}
        toast(LANG==="ru"?"Удален из друзей":"Removed from friends");
        renderPeopleFriends(box);
      }else{
        const frItem=accepted.find(x=>x.id===pid);
        if(frItem?.reqData){
          await sb.from("friendships").delete().eq("requester",frItem.reqData.requester).eq("addressee",frItem.reqData.addressee);
          renderPeopleFriends(box);
        }
      }
    });

    contentBox.querySelectorAll("[data-acc]").forEach(b=>b.onclick=async()=>{
      const [requester,addressee]=b.dataset.acc.split("|");
      const {error}=await sb.from("friendships").update({status:"accepted"}).eq("requester",requester).eq("addressee",addressee);
      if(error)return toast(error.message);
      refreshFriendNotice();renderPeopleFriends(box)});

    contentBox.querySelectorAll("[data-dec]").forEach(b=>b.onclick=async()=>{
      const [requester,addressee]=b.dataset.dec.split("|");
      await sb.from("friendships").delete().eq("requester",requester).eq("addressee",addressee);
      refreshFriendNotice();renderPeopleFriends(box)});

    icons();
  };

  box.querySelectorAll("[data-frtab]").forEach(tabBtn=>{
    tabBtn.onclick=()=>{
      PEOPLE_FILTER=tabBtn.dataset.frtab;
      box.querySelectorAll("[data-frtab]").forEach(b=>b.classList.toggle("active",b.dataset.frtab===PEOPLE_FILTER));
      renderFilteredFriends();
    };
  });

  filterInput.oninput=()=>renderFilteredFriends();

  const addFriendAction=async()=>{
    const inp=document.getElementById("fr-add");
    const n=inp?.value.trim();if(!n)return;
    if(isGuest||!sbUser){
      toast(LANG==="ru"?"Войдите в аккаунт, чтобы добавлять друзей":"Sign in to add friends");
      return;
    }else{
      const {error}=await sb.rpc("add_friend_by_username",{name:n});
      if(error)return toast(error.message);
      notify(t("fr.sent.ok"),n,{icon:"user-plus"});
      if(inp)inp.value="";
      renderPeopleFriends(box);
    }
  };

  document.getElementById("fr-addbtn").onclick=addFriendAction;
  document.getElementById("fr-add").addEventListener("keydown",e=>{if(e.key==="Enter")addFriendAction()});

  renderFilteredFriends();
  icons();
}

/* The old "Чаты" tab (DM list + groups) is gone: direct messages live in
   their own Messages screen now (messenger.js). These two stay because the
   profile card, friend rows and room member lists still call them. */
function hideChatPane(){
  const c=document.getElementById("chatbody");
  if(c){c.innerHTML=""; c.classList.remove("chat-open");}
}
function openChat(key){
 const k=String(key||"");
 if(!k.startsWith("d:"))return;
 if(typeof msgrOpen==="function")msgrOpen(k.slice(2));
 else go("chats")}

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
   <button class="primary sm" id="mkroom"><span class="material-symbols-rounded" style="font-size:16px">add</span>${t("room.new")}</button>
   <input id="joincode" placeholder="MEOW-XXXX" maxlength="9" style="text-transform:uppercase">
   <button class="btn" id="joinbtn">${t("room.join")}</button>
  </div>
  ${list.map(r=>`<button class="chatrow" data-roomid="${r.id}">
    <span class="avat ghost"><span class="material-symbols-rounded" style="font-size:18px">headphones</span></span>
    <span class="meta"><b>${esc(r.name)}</b><span>${r.playing?esc(r.track?.t||""):t("room.silent")} · ${(r.room_members||[]).length}</span></span>
    <span class="material-symbols-rounded" style="font-size:18px">chevron_right</span></button>`).join("")
   ||`<p class="ph">${t("room.none")}</p>`}
 </div>`;
 document.getElementById("mkroom").onclick=async()=>{
  const n=await askText(t("dlg.room.t"),"",{icon:"meeting_room",label:t("room.newname"),confirm:t("dlg.next"),required:true});
  if(!n)return;
  /* One decision, two buttons: "Private" is OK, "Public" is cancel — there is
     no third "abort" state worth a dialog of its own. */
  const priv=await showModal({title:t("room.privq"),input:false,icon:"lock",
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

/* Server-clock anchor for room sync, measured once per room. A tiny RPC
   returns the database's now(): one round trip gives server-now, half the
   round trip estimates the one-way delay. A Date header can't be used — the
   relay forwards a fixed header set and Date is not CORS-exposed. Without
   the anchor, a skewed client clock plays every room track early or late. */
async function measureRoomSkew(){
 try{
  const t0=Date.now();
  const {data,error}=await sb.rpc("server_time");
  if(error||!data)return 0;
  const serverMs=Date.parse(String(data).replace(/(\.\d{3})\d+/,"$1"));
  if(!isFinite(serverMs))return 0;
  return serverMs+(Date.now()-t0)/2-Date.now();
 }catch(e){return 0}}
async function enterRoom(row){
 if(!row)return;
 SOC.room=row;
 if(sb&&sbUser){
  try{
   if(row.join_code){
    await sb.rpc("join_room",{code:row.join_code});
   }else if(row.id){
    const res=await sb.rpc("join_room_by_id",{r:row.id});
    if(res.error)await sb.from("room_members").upsert({room_id:row.id,user_id:sbUser.id,role:"listener"},{onConflict:"room_id,user_id",ignoreDuplicates:true});
   }
  }catch(e){console.warn("join room membership:",e)}
 }
 measureRoomSkew().then(v=>SOC.roomSkew=v);
 await refreshRoomState();
 go("rooms");
 paintRoomShell();
 const isDj=SOC.roomRole==="owner"||SOC.roomRole==="dj"||row.owner_id===(sbUser?.id);
 if(isDj&&S.current&&S.current.mode!=="empty"&&S.playing){
  try{
   const patch={track:stripTrack(S.current),position:S.pos||0,playing:true,updated_at:new Date().toISOString()};
   const {data}=await sb.from("rooms").update(patch).eq("id",row.id).select().single();
   if(data)SOC.room=data;
  }catch(e){}
 }
 paintRoomPlayback();
 roomLoop()}

/* The room loop: one interval that both publishes (DJ) and follows (listener).
   The DJ's client is the clock: it writes track/position every few seconds and
   on every change. Listeners read the same row and correct their drift only
   when it exceeds a second and a half — constantly re-seeking sounds worse
   than being a little off. */
function roomLoop(){
 socTimer("room",roomTick,3000)}
let roomTickBusy=false;
async function roomTick(){
 if(!SOC.room||roomTickBusy)return;
 /* A slow network can stretch one tick past the 3 s interval; overlapping
    ticks both saw "not following yet" and the second load() restarted the
    track from zero. */
 roomTickBusy=true;
 try{
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
    if(!error&&data)SOC.room=data}
  }
  await refreshRoomState();
  paintRoomPlayback();
 }finally{roomTickBusy=false}}

function stripTrack(tr){return tr&&tr.mode!=="empty"
 ?{s:tr.s,id:tr.id,t:tr.t,a:tr.a,al:tr.al,art:tr.art,d:tr.d}:null}

async function refreshRoomState(){
  if(!SOC.room)return;
  /* The room poll runs every three seconds; one failed round trip must not
     throw through roomTick and kill the interval chain. */
  try{
  const {data}=await sb.from("rooms").select("*").eq("id",SOC.room.id).maybeSingle();
  if(!data){SOC.room=null;socClear("room");return renderRooms()}
  SOC.room=data;
  const mem=(await sb.from("room_members").select("user_id,role").eq("room_id",data.id)).data||[];
  SOC.roomRole=mem.find(m=>m.user_id===sbUser?.id)?.role||(data.owner_id===sbUser?.id?"owner":null);
  const ids=mem.map(m=>m.user_id);
  let ps=[];
  if(ids.length){
   let pRes=await sb.from("profiles").select("id,username,avatar_url,privacy").in("id",ids);
   if(pRes.error){
    pRes=await sb.from("profiles").select("id,username,avatar_url").in("id",ids);
   }
   ps=(pRes.data||[]).map(maskProf);
  }
  SOC.roomMembers=mem.map(m=>{
   let prof=ps.find(p=>p?.id===m.user_id);
   if(!prof&&m.user_id===sbUser?.id){
    prof={id:sbUser.id,username:S.username||sbUser.email?.split("@")[0]||"Я",avatar_url:S.avatarUrl||null};
   }else if(!prof){
    prof={id:m.user_id,username:m.role==="owner"?(LANG==="ru"?"Владелец":"Owner"):(LANG==="ru"?"Слушатель":"Listener"),avatar_url:null};
   }
   return {...m,profile:prof};
  });
  SOC.roomQueue=(await sb.from("room_queue").select("*").eq("room_id",data.id).order("position")).data||[];
  SOC.requests=(await sb.from("room_requests").select("*").eq("room_id",data.id).eq("status","pending").order("id",{ascending:false}).limit(20)).data||[];
  /* The room chat is not fetched here any more: msRoomMount (messenger.js)
     polls only the rows it has not seen, decrypts them and patches the log. */
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
 /* ahead is anchored to the server clock (measureRoomSkew): comparing raw
    Date.now() with the row's timestamp turned any client clock skew into a
    permanent playback offset. */
 const ahead=(Date.now()+(SOC.roomSkew||0)-new Date(r.updated_at).getTime())/1000;
 const want=r.playing?Math.max(0,(r.position||0)+ahead):Math.max(0,r.position||0);
 if(!localIsIt){
  const tr=roomTrackOf(r.track);
  /* openFull stays off: the fullscreen player popping open over chat or
     settings whenever the DJ started a track read as the app hijacking the
     screen. */
  if(tr){
   setTrack(tr,r.playing,false,"room:"+r.id);
   if(r.playing&&want>1){
    setTimeout(()=>{if(sameTrack(tr,S.current)&&A.audio)seekSeconds(want)},600);
   }
  }
  return}
 if(r.playing){
  if(!S.playing){
   if(A.audio&&A.audio.src){
    A.ctx?.resume();
    A.audio.play().then(()=>{S.playing=true;sync();if(want>1)seekSeconds(want)}).catch(e=>{
     console.warn("listener play catch:",e);
    });
   }else{
    const tr=roomTrackOf(r.track);
    if(tr)setTrack(tr,true,false,"room:"+r.id);
   }
  }else if(Math.abs(S.pos-want)>1.5&&S.current?.mode==="local"){
   seekSeconds(Math.max(0,want));
  }
 }else if(!r.playing&&S.playing){
  toggle();
 }
}

function paintRoomShell(){
 const box=document.getElementById("roombody");if(!box)return;
 const r=SOC.room;if(!r)return renderRooms();
 const isOwner=SOC.roomRole==="owner";
 const isDj=isOwner||SOC.roomRole==="dj";
 const me=sbUser?.id;
 const members=SOC.roomMembers||[];
 const memberHtml=members.map(m=>{
  const name=m.profile?.username||(m.user_id===me?(S.username||"Я"):(m.role==="owner"?(LANG==="ru"?"Владелец":"Owner"):(LANG==="ru"?"Слушатель":"Listener")));
  const profForAvat=m.profile||{username:name,id:m.user_id};
  return `
  <span class="memchip" data-uid="${m.user_id}" title="${esc(name)}">
   ${avat(profForAvat,22)}
   <i>${esc(name.slice(0,12))}${m.role==="owner"?` <span class="material-symbols-rounded" style="font-size:12px">crown</span>`:""}</i>
   ${isOwner&&m.user_id!==me?`<button class="qrm" data-kick="${m.user_id}" title="${t("room.kick")}"><span class="material-symbols-rounded" style="font-size:14px">close</span></button>`:""}
  </span>`}).join("");

 const existing=box.querySelector(".roompane");
 if(existing){
  const mem=existing.querySelector(".memstrip");if(mem)mem.innerHTML=memberHtml;
  paintRoomNow();
  paintRoomLists();
  if(typeof msRoomMount==="function")msRoomMount(existing.querySelector("#roomchat"),r);
  return;
 }

 box.innerHTML=`<div class="panel pane roompane">
  <div class="chathdr">
   <button class="ic" id="leaveroom" title="${t("room.leave")}"><span class="material-symbols-rounded" style="font-size:18px">logout</span></button>
   <b>${esc(r.name)}</b>
   <button class="codechip" id="copycode" title="${t("room.copycode")}">${esc(r.join_code)}${r.is_private?` · <span class="material-symbols-rounded" style="font-size:13px">lock</span>`:""}</button>
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
   <div class="roomchatcol">
    <p class="eyebrow">${t("room.chat")}</p>
    <div class="roomchat" id="roomchat"></div>
   </div>
  </div></div>`;
 document.getElementById("leaveroom").onclick=async()=>{
  /* The RPC also sweeps the room away when the last member leaves; the plain
     delete is the pre-11 fallback so leaving never gets stuck. */
  const {error}=await sb.rpc("leave_room",{r:r.id});
  if(error)await sb.from("room_members").delete().eq("room_id",r.id).eq("user_id",me);
  SOC.room=null;socClearAll();renderRooms()};
  document.getElementById("delroom")?.addEventListener("click",async()=>{
  if(!await askConfirm(t("room.delq"),t("room.del"),true,{icon:"delete"}))return;
  await sb.from("rooms").delete().eq("id",r.id);
   SOC.room=null;socClearAll();renderRooms();toast(t("room.deleted"))});
 document.getElementById("copycode").onclick=()=>{
  navigator.clipboard?.writeText(r.join_code).then(()=>toast(t("room.copied"))).catch(()=>{})};
 box.querySelectorAll("[data-kick]").forEach(b=>b.onclick=async()=>{
  await sb.from("room_members").delete().eq("room_id",r.id).eq("user_id",b.dataset.kick);
  toast(t("room.kicked"));
  refreshRoomState().then(paintRoomShell)});
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
 if(typeof msRoomMount==="function")msRoomMount(document.getElementById("roomchat"),r);
 icons()}

function paintRoomNow(){
 const el=document.getElementById("roomnow");if(!el)return;
 const r=SOC.room;const isDj=SOC.roomRole==="owner"||SOC.roomRole==="dj";
 const tr=r.track;
 el.innerHTML=tr?`
  <span class="art" ${coverStyle(tr.art)}></span>
  <span class="meta"><b>${esc(tr.t)}</b><span>${esc(tr.a)}</span></span>
  ${isDj?`<button class="ic" id="roomplay"><span class="material-symbols-rounded" style="font-size:18px">${S.playing?"pause":"play_arrow"}</span></button>`:
    `<button class="btn sm ghost" id="roomlisten" style="display:inline-flex;align-items:center;gap:6px">
      <span class="material-symbols-rounded" style="font-size:16px">${S.playing?"volume_up":"play_arrow"}</span>
      <span>${r.playing?(S.playing?t("room.live"):(LANG==="ru"?"Слушать эфир":"Listen live")):t("room.paused")}</span>
    </button>`}`
  :`<p class="ph" style="margin:0">${t("room.silent")}</p>`;
 document.getElementById("roomplay")?.addEventListener("click",()=>{
  if(PLAYCTX.key!=="room:"+r.id&&r.track)setTrack(roomTrackOf(r.track),true,true,"room:"+r.id);
  else toggle();
  roomTick()});
 document.getElementById("roomlisten")?.addEventListener("click",()=>{
  if(r.track){
   setTrack(roomTrackOf(r.track),true,false,"room:"+r.id);
   paintRoomPlayback();
  }
 });
}

function paintRoomLists(){
 const ql=document.getElementById("roomql");if(!ql)return;
 const isDj=SOC.roomRole==="owner"||SOC.roomRole==="dj";
 ql.innerHTML=(SOC.roomQueue||[]).map((q,i)=>`
  <div class="q" style="--i:${Math.min(i,12)}">
   <i class="n">${String(i+1).padStart(2,"0")}</i>
   <b>${esc(q.track?.t||"")}</b><em>${esc(q.track?.a||"")}</em>
   ${isDj?`<button class="qrm" data-delm="${q.id}"><span class="material-symbols-rounded" style="font-size:16px">close</span></button>`:""}
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
    <button class="primary sm" data-ok="${q.id}"><span class="material-symbols-rounded" style="font-size:18px">check</span></button>
    <button class="btn sm danger" data-no="${q.id}"><span class="material-symbols-rounded" style="font-size:18px">close</span></button></div>`}).join("")
   ||`<p class="ph">${t("room.noreqs")}</p>`;
  rq.querySelectorAll("[data-ok]").forEach(b=>b.onclick=async()=>{
   const {error}=await sb.rpc("approve_request",{req:+b.dataset.ok});
   if(error)toast(error.message);
   refreshRoomState().then(()=>{paintRoomLists();paintRoomNow()})});
  rq.querySelectorAll("[data-no]").forEach(b=>b.onclick=async()=>{
   const {error}=await sb.rpc("decline_request",{req:+b.dataset.no});
   if(error)toast(error.message);
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
 box.innerHTML=`<div class="panel pane"><p class="ph">${LANG==="ru"?"Загрузка топа…":"Loading leaderboard…"}</p></div>`;
 try{
  let rows=[];
  if(sb){
   try{
    const {data,error}=await sb.rpc("leaderboard",{limit_:50});
    if(!error&&Array.isArray(data)&&data.length){
     const uids=data.map(d=>d.user_id).filter(Boolean);
     let bmap={};
     if(uids.length){
      try{
       let pr=await sb.from("profiles").select("id,equipped_badge,equipped_badges").in("id",uids);
       if(pr.error)pr=await sb.from("profiles").select("id,equipped_badge").in("id",uids);
       (pr.data||[]).forEach(p=>{bmap[p.id]=p});
      }catch(e){}
     }
     rows=data.map(d=>({
      ...d,
      seconds:Number(d.seconds||d.listen_seconds||0),
      equipped_badge:d.equipped_badge||bmap[d.user_id]?.equipped_badge||null,
      equipped_badges:bmap[d.user_id]?.equipped_badges||null
     }));
    }
   }catch(e){console.warn("RPC leaderboard fallback:",e)}

   if(!rows.length){
    try{
     const q=cols=>sb.from("user_stats")
      .select(`user_id, listen_seconds, profiles(${cols})`)
      .order("listen_seconds",{ascending:false})
      .limit(50);
     let {data,error}=await q("id, username, avatar_url, privacy, equipped_badge, equipped_badges");
     if(error)({data,error}=await q("id, username, avatar_url, privacy, equipped_badge"));
     if(!error&&data){
      rows=data.map(d=>({
       user_id:d.user_id,
       seconds:d.listen_seconds||0,
       username:d.profiles?.username||t("chat.anon"),
       avatar_url:d.profiles?.avatar_url,
       equipped_badge:d.profiles?.equipped_badge,
       equipped_badges:d.profiles?.equipped_badges||null,
       privacy:d.profiles?.privacy
      }));
     }
    }catch(e){console.warn("direct user_stats fallback:",e)}
   }
  }

  const me=sbUser?sbUser.id:"me";
  const mySecs=Math.max(S.listen||0, Number(sbStats?.listen_seconds)||0);

  if(!rows.some(r=>r.user_id===me)){
   rows.push({
    user_id:me,
    seconds:mySecs,
    username:(sbProfile?.username)||(sbUser?.email?.split("@")[0])||(LANG==="ru"?"Вы":"You"),
    avatar_url:sbProfile?.avatar_url||null,
    equipped_badge:myBadges()[0]||null,
    equipped_badges:myBadges()
   });
  }

  rows.sort((a,b)=>(b.seconds||0)-(a.seconds||0));
  const myRank=rows.findIndex(r=>r.user_id===me)+1;
  const processedRows=rows.map(r=>r.user_id===me?r:maskProf(r));

  const top3=processedRows.slice(0,3);
  const podiumOrder=[
    top3[1]?{...top3[1],rank:2,medal:"2",cls:"second"}:null,
    top3[0]?{...top3[0],rank:1,medal:"1",cls:"first"}:null,
    top3[2]?{...top3[2],rank:3,medal:"3",cls:"third"}:null
  ].filter(Boolean);

  box.innerHTML=`<div class="panel pane">
   <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div>
     <h3 style="margin:0 0 2px">${t("nav.top")}</h3>
     <p class="ph" style="margin:0">${t("top.s")}</p>
    </div>
    <div style="text-align:right">
     <span class="user-badge-tag" style="font-size:0.8rem">${LANG==="ru"?"Ваше место:":"Your rank:"} #${myRank||"—"}</span>
    </div>
   </div>

   ${top3.length?`
   <div class="top-podium">
    ${podiumOrder.map(p=>`
     <div class="podium-card ${p.cls}">
      <span class="podium-rank">${p.medal}</span>
      ${avat(p, 48)}
      <b style="margin-top:8px;font-size:0.95rem">${esc(p.username||t("chat.anon"))}</b>
      ${userBadgeTag(p.user_id===me?myBadges():badgeIds(p))}
      <span class="mut" style="margin-top:4px;font-size:0.8rem;font-weight:600">${fmtListen(p.seconds)}</span>
     </div>`).join("")}
   </div>`:""}

   <div class="panel pane" style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
    <div>
     <span>${LANG==="ru"?"Ваше время прослушивания":"Your listening time"}</span>
     <b>${fmtListen(mySecs)}</b>
    </div>
    <div>${userBadgeTag(myBadges())}</div>
   </div>

   <p class="eyebrow" style="margin:16px 0 8px">${LANG==="ru"?"Общий зачёт":"General Ranking"}</p>
   <div class="top-list">
    ${processedRows.map((r,i)=>`
     <div class="chatrow asrow ${r.user_id===me?"me":""}" >
      <b class="rank">#${i+1}</b>
      ${avat(r,34)}
      <span class="meta" style="display:flex;align-items:center;gap:6px">
       <b>${esc(r.username||t("chat.anon"))}</b>
       ${userBadgeTag(r.user_id===me?myBadges():badgeIds(r))}
      </span>
      <span class="mut" style="font-weight:600">${fmtListen(r.seconds)}</span>
     </div>`).join("")||`<p class="ph">${t("top.empty")}</p>`}
   </div>
  </div>`;
  icons();
 }catch(e){
  box.innerHTML=socErrBox(socialFail(e));
 }
}

/* ── friends, on the profile ────────────────────────────── */
async function renderFriendsBox(){
 const host=document.getElementById("profbody");if(!host||!sbUser)return;
 let box=document.getElementById("frbox");
 if(!box){box=document.createElement("div");box.id="frbox";host.appendChild(box)}
 const me=sbUser.id;
 let rows=[];
 try{
  const {data}=await sb.from("friendships").select("*").or(`requester.eq.${me},addressee.eq.${me}`);
  rows=data||[];
 }catch(e){console.warn("friendships error:",e)}
 const accepted=rows.filter(r=>r.status==="accepted");
 const pendingIn=rows.filter(r=>r.status==="pending"&&r.addressee===me);
 const pendingOut=rows.filter(r=>r.status==="pending"&&r.requester===me);
 const otherId=r=>r.requester===me?r.addressee:r.requester;
 const ids=[...accepted,...pendingIn,...pendingOut].map(otherId);
 let profs=[];
 if(ids.length){
  try{
   let pRes=await sb.from("profiles").select("id,username,avatar_url,bio,privacy").in("id",ids);
   if(pRes?.error) pRes=await sb.from("profiles").select("id,username,avatar_url,bio").in("id",ids);
   if(pRes?.data) profs=pRes.data.map(maskProf);
  }catch(e){console.warn("profiles error:",e)}
 }
 const mockListAll=typeof getMockFriends==="function"?getMockFriends():[];
 const prof=id=>{
  const found=profs.find(p=>p&&p.id===id);
  if(found&&found.username&&found.username!=="…")return found;
  const mock=mockListAll.find(m=>m.id===id);
  if(mock)return mock;
  return {id, username:found?.username||(LANG==="ru"?"Пользователь":"User"), avatar_url:found?.avatar_url||null};
 };
 box.innerHTML=`<div class="panel pane">
  <h3>${t("fr.t")}</h3>
  <div class="tokrow" style="margin:0 0 12px">
   <input id="fr-add" placeholder="${t("fr.addph")}" autocomplete="off">
   <button class="btn" id="fr-addbtn">${t("fr.add")}</button>
  </div>
  ${pendingIn.length?`<p class="eyebrow">${t("fr.reqs")}</p>`+pendingIn.map(r=>`
   <div class="reqrow">${avat(prof(otherId(r)),28)}
    <span class="meta"><b>${esc(prof(otherId(r)).username)}</b></span>
     <button class="primary sm" data-acc="${r.requester}|${r.addressee}"><span class="material-symbols-rounded" style="font-size:18px">check</span></button>
     <button class="btn sm danger" data-dec="${r.requester}|${r.addressee}"><span class="material-symbols-rounded" style="font-size:18px">close</span></button></div>`).join(""):""}
  ${pendingOut.length?`<p class="eyebrow">${t("fr.sent")}</p>`+pendingOut.map(r=>`
   <div class="chatrow asrow" style="grid-template-columns:auto 1fr auto">${avat(prof(otherId(r)),28)}
    <span class="meta"><b>${esc(prof(otherId(r)).username)}</b></span><span class="mut">${t("fr.wait")}</span></div>`).join(""):""}
  <p class="eyebrow">${t("fr.mine")} · ${accepted.length}</p>
  ${accepted.map(r=>{const p=prof(otherId(r));
   return `<div class="chatrow asrow" style="grid-template-columns:auto 1fr auto auto">
    ${avat(p,34)}<span class="meta"><b>${esc(p.username)}</b></span>
    <button class="btn sm" data-dm="${p.id}"><span class="material-symbols-rounded" style="font-size:16px">chat_bubble</span></button>
     <button class="ic" data-unfr="${r.requester}|${r.addressee}" title="${t("fr.rm")}"><span class="material-symbols-rounded" style="font-size:16px">person_remove</span></button></div>`}).join("")
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

/* ── Quests & Badges View ──────────────────────────────── */
async function renderQuestsView(){
 const box=document.getElementById("questbody");if(!box)return;
 await loadBadgeCatalog();
 await loadOwnedBadges();

 const sumEl=document.getElementById("questsum");
 const cat=BADGES||[];
 const owned=b=>OWNED.has(b.id);
 const ownedCount=[...OWNED].length;
 if(sumEl)sumEl.textContent=`${ownedCount} / ${cat.length} ${LANG==="ru"?"открыто":"unlocked"}`;

 const secs=Math.max(S.listen||0,Number(sbStats?.listen_seconds)||0);
 const favCount=TRACKS.filter(t=>t.fav).length;
 const plCount=(typeof PLAYLISTS!=="undefined"?PLAYLISTS:[]).length;
 const srvCount=SERVICES.filter(s=>s.conn).length;

 const quests=[
  {
   id:"first_listen",
   badge:"first_listen",
   title:LANG==="ru"?"Первый шаг":"First Step",
   desc:LANG==="ru"?"Прослушать хотя бы один трек в Meowave":"Listen to at least one track in Meowave",
   cur:secs>10?1:0,
   max:1,
   unit:""
  },
  {
   id:"listener_i",
   badge:"listener_i",
   title:LANG==="ru"?"Слушатель I":"Listener I",
   desc:LANG==="ru"?"Провести 1 час за прослушиванием музыки":"Spend 1 hour listening to music",
   cur:Math.min(3600,secs),
   max:3600,
   unit:LANG==="ru"?"сек":"sec",
   fmtVal:(v)=>fmtListen(v)
  },
  {
   id:"listener_ii",
   badge:"listener_ii",
   title:LANG==="ru"?"Слушатель II":"Listener II",
   desc:LANG==="ru"?"Провести 10 часов за музыкой":"Spend 10 hours listening to music",
   cur:Math.min(36000,secs),
   max:36000,
   unit:LANG==="ru"?"сек":"sec",
   fmtVal:(v)=>fmtListen(v)
  },
  {
   id:"listener_iii",
   badge:"listener_iii",
   title:LANG==="ru"?"Слушатель III":"Listener III",
   desc:LANG==="ru"?"Набрать 50 часов прослушивания музыки":"Reach 50 hours of music listening",
   cur:Math.min(180000,secs),
   max:180000,
   unit:LANG==="ru"?"сек":"sec",
   fmtVal:(v)=>fmtListen(v)
  },
  {
   id:"marathon_listener",
   badge:"marathon_listener",
   title:LANG==="ru"?"Марафонец":"Marathon Listener",
   desc:LANG==="ru"?"Достичь 100 часов в Meowave":"Reach 100 hours in Meowave",
   cur:Math.min(360000,secs),
   max:360000,
   unit:LANG==="ru"?"сек":"sec",
   fmtVal:(v)=>fmtListen(v)
  },
  {
   id:"collector",
   badge:"collector",
   title:LANG==="ru"?"Коллекционер":"Collector",
   desc:LANG==="ru"?"Добавить 50 треков в избранное":"Add 50 tracks to favorites",
   cur:Math.min(50,favCount),
   max:50,
   unit:LANG==="ru"?"треков":"tracks"
  },
  {
   id:"playlist_creator",
   badge:"playlist_creator",
   title:LANG==="ru"?"Создатель плейлистов":"Playlist Creator",
   desc:LANG==="ru"?"Создать 3 собственных плейлиста":"Create 3 custom playlists",
   cur:Math.min(3,plCount),
   max:3,
   unit:LANG==="ru"?"плейлиста":"playlists"
  },
  {
   id:"genre_explorer",
   badge:"genre_explorer",
   title:LANG==="ru"?"Аудиофил":"Audiophile",
   desc:LANG==="ru"?"Подключить 2 или более музыкальных сервиса":"Connect 2 or more music services",
   cur:Math.min(2,srvCount),
   max:2,
   unit:LANG==="ru"?"сервиса":"services"
  }
 ];

 const worn=myBadges().map(badgeById).filter(Boolean);
 const STAFF=new Set(["owner","admin","developer","moderator"]);

 box.innerHTML=`<div class="quests-wrap">
  <div class="equipped-badge-banner">
   <div class="b-slots">${[0,1,2].map(i=>worn[i]
     ?`<button class="b-slot on" data-quest-equip="${esc(worn[i].id)}" title="${esc(badgeName(worn[i]))} — ${LANG==="ru"?"снять":"take off"}"><img src="assets/badges/${esc(worn[i].file)}" alt=""></button>`
     :`<span class="b-slot"><span class="material-symbols-rounded">add</span></span>`).join("")}</div>
   <div class="b-info">
    <b>${worn.length?worn.map(b=>esc(badgeName(b))).join(" · "):(LANG==="ru"?"Значки не надеты":"No badges worn")}</b>
    <span>${LANG==="ru"?`Надето ${worn.length} из 3 — их видно рядом с вашим именем в профиле, чатах и топе`:`${worn.length} of 3 worn — shown next to your name on your profile, in chats and in the top`}</span>
   </div>
   ${worn.length?`<button class="btn sm" id="unequip-btn">${LANG==="ru"?"Снять все":"Take all off"}</button>`:""}
  </div>

  <div class="panel pane">
   <h3 style="margin:0 0 4px">${LANG==="ru"?"Активные квесты":"Active Quests"}</h3>
   <p class="ph" style="margin:0 0 16px">${LANG==="ru"?"Выполняйте задания, чтобы открывать уникальные значки и повышать свой статус":"Complete quests to unlock unique badges and raise your rank"}</p>

   <div class="quests-list">
    ${quests.map(q=>{
      const b=badgeById(q.badge);
      const isDone=owned(b||{id:q.badge})||q.cur>=q.max;
      const pct=Math.min(100,Math.round((q.cur/q.max)*100));
      const valStr=q.fmtVal?`${q.fmtVal(q.cur)} / ${q.fmtVal(q.max)}`:`${q.cur} / ${q.max} ${q.unit}`;
      const isEquipped=isWorn(q.badge);

      return `<div class="quest-card ${isDone?"completed":""}">
        <div class="quest-icon">
          ${b?`<img src="assets/badges/${esc(b.file)}" width="32" height="32" alt="">`:`<span class="material-symbols-rounded" style="font-size:24px">check_circle</span>`}
        </div>
        <div class="quest-details">
          <div class="quest-title-row">
            <b>${esc(q.title)}</b>
            <span class="quest-reward">${b?esc(badgeName(b)):"Значок"}</span>
          </div>
          <p class="quest-desc">${esc(q.desc)}</p>
          <div class="quest-prog-wrap">
            <div class="quest-prog-bar" style="width:${pct}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <span style="font-size:0.74rem;color:var(--mute)">${valStr} (${pct}%)</span>
            ${isDone?`
              <button class="btn sm ${isEquipped?"primary":""}" data-quest-equip="${esc(q.badge)}">
                ${isEquipped?(LANG==="ru"?"Надето":"Equipped"):(LANG==="ru"?"Надеть":"Equip")}
              </button>
            `:`<span style="font-size:0.72rem;color:var(--mute)">${LANG==="ru"?"В процессе":"In progress"}</span>`}
          </div>
        </div>
      </div>`;
    }).join("")}
   </div>
  </div>

  <div class="panel pane">
   <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div>
     <h3 style="margin:0 0 2px">${LANG==="ru"?"Все значки":"All Badges"}</h3>
     <p class="ph" style="margin:0">${LANG==="ru"?"Промокод-значки открываются вводом секретного кода в Настройках":"Code badges unlock with secret codes in Settings"}</p>
    </div>
   </div>
   <div id="quest-badges-grid" class="bdgrid">
    ${cat.filter(b=>(!STAFF.has(b.id)||owned(b))&&(b.source!=="code"||owned(b))).map(b=>{
      const isOwned=owned(b);
      const isEquipped=isWorn(b.id);
      const c=RARITY_COLOR[b.rarity]||RARITY_COLOR.common;
      return `<div class="bdg" data-owned="${isOwned}">
        <span class="bdgart" style="--ring:${c}"><img src="assets/badges/${esc(b.file)}" alt="" loading="lazy"></span>
        <b>${esc(badgeName(b))}</b>
        <span>${esc(badgeDesc(b))}</span>
        ${isOwned?`
          <button class="btn sm badge-tile-action ${isEquipped?"primary":""}" data-quest-equip="${esc(b.id)}">
            ${isEquipped?(LANG==="ru"?"Надето":"Equipped"):(LANG==="ru"?"Надеть":"Equip")}
          </button>
        `:`<span style="font-size:0.7rem;color:var(--mute);margin-top:6px">${LANG==="ru"?"Заблокировано":"Locked"}</span>`}
      </div>`;
    }).join("")}
   </div>
  </div>
  <div class="panel pane" style="margin-top:16px">
   <h3 style="margin:0 0 4px">${LANG==="ru"?"Активация промокода":"Redeem Promo Code"}</h3>
   <p class="ph" style="margin:0 0 12px">${LANG==="ru"?"Введите секретный код для получения особого значка":"Enter a secret code to unlock an exclusive badge"}</p>
   <div class="tokrow">
    <input id="bd-code" placeholder="${t("bd.code.ph")}" autocomplete="off" maxlength="40">
    <button class="btn primary" id="bd-redeem">${t("bd.code.go")}</button>
    <small style="color:var(--mute);font-size:.72rem" id="bd-msg">${t("bd.code.hint")}</small>
   </div>
  </div>
 </div>`;

 document.getElementById("bd-redeem")?.addEventListener("click",redeemCode);
 document.getElementById("bd-code")?.addEventListener("keydown",e=>{if(e.key==="Enter")redeemCode()});
 document.getElementById("unequip-btn")?.addEventListener("click",()=>equipBadge(null));
 box.querySelectorAll("[data-quest-equip]").forEach(btn=>{
   btn.onclick=()=>{
     equipBadge(btn.dataset.questEquip);
   };
 });
 icons();
}



/* ── Search UI Fluid Progressive Text Fill ("Заливка текста") ── */
function initSearchReveal(){
 const flow=document.getElementById("search-flow");
 const q=document.getElementById("q");
 const clearBtn=document.getElementById("search-clear");
 if(!flow||!q)return;

 /* Read per use, not once at boot: switching the language left the search
    box cycling Russian hints until the app restarted. */
 const PHRASES_EN=[
  "Search across all services, tracks, artists…",
  "Daft Punk — Get Lucky",
  "The Weeknd — Blinding Lights",
  "Linkin Park — Numb",
  "Arctic Monkeys — Do I Wanna Know?",
  "Queen — Bohemian Rhapsody",
  "Radiohead — Creep",
  "Nirvana — Smells Like Teen Spirit",
  "Coldplay — Viva La Vida"
 ];
 const PHRASES_RU=[
  "Поиск по всем сервисам, трекам, артистам…",
  "Кино — Звезда по имени Солнце",
  "Daft Punk — Get Lucky",
  "Oxxxymiron — Город под подошвой",
  "The Weeknd — Blinding Lights",
  "PHARAOH — Дико, например",
  "Linkin Park — Numb",
  "Король и Шут — Лесник",
  "Arctic Monkeys — Do I Wanna Know?",
  "Нервы — Батареи",
  "Miyagi & Эндшпиль — I Got Love"
 ];
 const phrasesNow=()=>LANG==="en"?PHRASES_EN:PHRASES_RU;

 let phraseIdx=0;
 let progress=0; // 0.0 to 1.0
 let state="filling"; // "filling" -> "holding" -> "fading"
 let stateStart=performance.now();
 let lastTime=performance.now();
 let rafId=0;

 /* Both spans are made once; a frame only moves the wipe's clip-path, and
    the text changes only with the phrase. This used to rebuild the spans with
    innerHTML on every frame — sixty DOM insertions a second for as long as the
    app was open, each one sending the style engine over the whole page. */
 flow.innerHTML='<span class="search-fill-base"></span><span class="search-fill-wipe" style="width:100%"></span>';
 const fBase=flow.firstElementChild, fWipe=flow.lastElementChild;
 let shownPhrase=null, shownPct=-1, vis=null;
 function setFlowContent(phrase, pct){
  if(phrase!==shownPhrase){shownPhrase=phrase;fBase.textContent=phrase;fWipe.textContent=phrase}
  const p=Math.round(pct*4)/4;
  if(p!==shownPct){shownPct=p;fWipe.style.clipPath=`inset(0 ${(100-p).toFixed(2)}% 0 0)`}
 }
 function setVis(on){
  if(vis===on)return;
  vis=on;flow.style.opacity=on?"1":"0";flow.style.visibility=on?"visible":"hidden";
 }

 function stopFlowAnimation(){
  if(rafId){
   cancelAnimationFrame(rafId);
   rafId=0;
  }
  setFlowContent(phrasesNow()[0], 100);
  vis=null;setVis(!(document.activeElement===q||q.value.length>0));
 }

 function startFlowAnimation(){
  if(rafId || BOOT.reduce) return;
  lastTime=performance.now();
  rafId=requestAnimationFrame(frame);
 }

 function frame(now){
  if(BOOT.reduce){
   stopFlowAnimation();
   return;
  }
  const dt=Math.min(100, Math.max(1, now-lastTime));
  lastTime=now;

  if(document.activeElement===q || q.value.length>0){
   setVis(false);
   rafId=requestAnimationFrame(frame);
   return;
  }
  setVis(true);

  const phrases=phrasesNow();const phrase=phrases[phraseIdx%phrases.length];

  if(state==="filling"){
   // Continuous fluid velocity without stepped timeouts:
   // accelerates and decelerates organically like surface fluid wave
   const organicWave=0.00034 + 0.00024 * Math.sin(progress * Math.PI * 2.2);
   progress += organicWave * dt;
   if(progress>=1){
    progress=1;
    state="holding";
    stateStart=now;
   }
   setFlowContent(phrase, progress*100);
  }else if(state==="holding"){
   setFlowContent(phrase, 100);
   if(now-stateStart>1900){
    state="fading";
    stateStart=now;
    flow.style.transition="opacity .28s var(--md-sys-motion-easing-standard)";
    flow.style.opacity="0";
   }
  }else if(state==="fading"){
   if(now-stateStart>300){
    phraseIdx=(phraseIdx+1)%phrasesNow().length;
    progress=0;
    state="filling";
    setFlowContent(phrasesNow()[phraseIdx%phrasesNow().length], 0);
    flow.style.opacity=vis===false?"0":"1";
   }
  }

  rafId=requestAnimationFrame(frame);
 }

 q.addEventListener("focus",()=>setVis(false));
 q.addEventListener("blur",()=>{if(!q.value)setVis(true)});
 q.addEventListener("input",()=>{
  if(clearBtn)clearBtn.classList.toggle("visible",q.value.length>0);
 });
 if(clearBtn){
  clearBtn.addEventListener("click",()=>{
   q.value="";
   clearBtn.classList.remove("visible");
   search("");
   q.focus();
  });
 }

 motionMedia.addEventListener("change", e => {
  if(e.matches) stopFlowAnimation();
  else startFlowAnimation();
 });

 if(BOOT.reduce){
  stopFlowAnimation();
 } else {
  setFlowContent(phrasesNow()[0], 0);
  rafId=requestAnimationFrame(frame);
 }
}

/* ── privacy settings ───────────────────────────────────── */
/* ── Large-lyrics customization ────────────────────────────
   Writes the CSS variables the lyric sheet reads; the panel sliders update
   live, save() persists. An empty font falls back to the Inter Tight stack. */
function applyLyVars(){
 const r=document.documentElement.style;
 r.setProperty("--ly-size",S.ly.size);
 r.setProperty("--ly-weight",S.ly.weight);
 r.setProperty("--ly-glow",S.ly.glow);
 r.setProperty("--ly-cov",S.ly.cov);
 r.setProperty("--ly-gap",S.ly.gap);
 /* The whole stack, so a family that is missing a glyph (or still loading
    from the CDN) falls back to the bundled Golos Text rather than to serif. */
 r.setProperty("--ly-font",(S.ly.font?`'${S.ly.font.replace(/'/g,"")}', `:"")+`"Golos Text", Inter, system-ui, sans-serif`)}
function paintLyPanel(){
 const on=id=>document.getElementById(id);
 const size=on("ly-size"),weight=on("ly-weight"),glow=on("ly-glow"),cov=on("ly-cov"),gap=on("ly-gap");
 if(!size)return;
 size.value=S.ly.size;on("ly-size-v").textContent=S.ly.size+"px";
 weight.value=S.ly.weight;on("ly-weight-v").textContent=S.ly.weight;
 glow.value=S.ly.glow*100;on("ly-glow-v").textContent=Math.round(S.ly.glow*100)+"%";
 cov.value=S.ly.cov;on("ly-cov-v").textContent=S.ly.cov+"px";
 gap.value=S.ly.gap;on("ly-gap-v").textContent=S.ly.gap+"px";
 const fsel=on("ly-font-select");
 if(fsel)fsel.value=S.ly.font||"";
}
["ly-size","ly-weight","ly-glow","ly-cov","ly-gap"].forEach(id=>{
 const el=document.getElementById(id);if(!el)return;
 el.oninput=()=>{
  const v=+el.value;
  if(id==="ly-size")S.ly.size=v;
  if(id==="ly-weight")S.ly.weight=v;
  if(id==="ly-glow")S.ly.glow=v/100;
  if(id==="ly-cov")S.ly.cov=v;
  if(id==="ly-gap")S.ly.gap=v;
  applyLyVars();
  const map={"ly-size":"ly-size-v","ly-weight":"ly-weight-v","ly-glow":"ly-glow-v","ly-cov":"ly-cov-v","ly-gap":"ly-gap-v"};
  const lab=document.getElementById(map[id]);
  if(lab)lab.textContent=id==="ly-glow"?Math.round(S.ly.glow*100)+"%":id==="ly-size"?S.ly.size+"px":id==="ly-cov"?S.ly.cov+"px":id==="ly-gap"?S.ly.gap+"px":S.ly.weight;
  save()}});
/* ── Discord Rich Presence ─────────────────────────────────
   Rust owns the IPC connection and the 15 s throttle; here only the settings
   and the "what is playing right now" snapshot live. dcPush is intentionally
   chatty: Rust de-duplicates and rate-limits, so extra calls are free.
   Nothing here asks for an application id: the app ships with its own, and
   the field under "For developers" is only an override. */
const DC_L1={title:"{title}","artist-title":"{artist} — {title}"};
function dcTemplate(){return S.discord.l1==="custom"?(S.discord.tmpl||"{title}"):(DC_L1[S.discord.l1]||"{title}")}
function dcVars(tr){
 const now=Math.floor(S.pos),rem=Math.max(0,Math.floor(S.dur-S.pos));
 const mm=x=>Math.floor(x/60)+":"+String(x%60).padStart(2,"0");
 return {title:tr?.t||"",artist:tr?.a||"",album:tr?.al||"",
  service:tr?svc(tr.s).name:"",status:S.playing?t("np.playing"):t("np.paused"),
  elapsed:mm(now),remaining:mm(rem),
  /* Raw unix times for Discord's timestamps block. */
  _start:Math.floor(Date.now()/1000-now),_end:Math.floor(Date.now()/1000+rem)};
}
/* A public page for the "Listen" button: Discord only accepts https links,
   and a local file or a stream URL would be useless to a friend anyway. */
function dcTrackUrl(tr){
 if(!tr)return null;
 const id=String(tr._spOrig?.id||tr.id||"");
 if(tr._spOrig&&id)return "https://open.spotify.com/track/"+encodeURIComponent(id);
 if(tr.s==="ytm"&&/^[\w-]{11}$/.test(id))return "https://music.youtube.com/watch?v="+id;
 if(tr.s==="ym"&&/^\d+/.test(id))return "https://music.yandex.ru/track/"+id.split(":")[0];
 if(tr.s==="dz"&&/^\d+$/.test(id))return "https://www.deezer.com/track/"+id;
 if(tr.s==="sp"&&id)return "https://open.spotify.com/track/"+encodeURIComponent(id);
 const u=String(tr.permalink||tr.url||"");
 if(tr.s==="sc"&&/^https:\/\/soundcloud\.com\//.test(u))return u;
 return null}
function dcLine2(v){
 const k=S.discord.l2;
 return k==="album"?v.album:k==="service"?v.service:k==="none"?"":v.artist}
function dcData(){
 const v=dcVars(S.current);
 return {...v,
  start:S.playing?v._start:undefined,
  end:S.playing&&S.dur>0?v._end:undefined,
  /* On pause the second line says so — the timer is gone, the reason should not be. */
  state:S.playing?dcLine2(v):[dcLine2(v),t("np.paused")].filter(Boolean).join(" · "),
  art:S.current?.art||null,
  url:dcTrackUrl(S.current),url_label:t("dc.btn"),
  opts:{art:S.discord.art,time:S.discord.time,button:S.discord.btn,display:S.discord.disp}};
}
function dcCfg(on){return {enabled:on??S.discord.on,template:dcTemplate(),clientId:S.discord.cid||""}}
function dcPush(){
 if(!TAURI||!S.discord.on||!S.current||S.current.mode==="empty")return;
 if(!S.playing&&S.discord.pause==="hide"){inv("discord_clear").catch(()=>{});return}
 inv("discord_update",{data:dcData()}).catch(()=>{})}
/* Play/pause and seeks change the timer Discord shows — push on those too,
   not only on track start (Rust de-duplicates and rate-limits). */
let dcLastPlaying=null;
setInterval(()=>{if(S.playing!==dcLastPlaying){dcLastPlaying=S.playing;if(S.discord.on)dcPush()}},1200);
document.addEventListener("seeked",e=>{if(e.target===A?.audio&&S.discord.on)dcPush()},true);
function dcSeg(id,val){document.querySelectorAll(`#${id} button`).forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.v===String(val))))}
function paintDiscordPreview(){
 const prev=document.getElementById("dc-prev");if(!prev)return;
 const cur=S.current&&S.current.mode!=="empty"&&S.current.t?S.current:{t:"Haiiro no sora",a:"DJ UNIVXRSEL",al:"Haiiro",s:"ytm"};
 const v=dcVars(cur);
 const l1=dcTemplate().replace(/\{(\w+)\}/g,(m,k)=>v[k]!=null?String(v[k]):m).replace(/\s{2,}/g," ").replace(/^[\s—·-]+|[\s—·-]+$/g,"").trim()||cur.t;
 const l2=dcLine2(v);
 prev.querySelector(".dc-prev-l1").textContent=l1;
 const l2el=prev.querySelector(".dc-prev-l2");l2el.textContent=l2;l2el.hidden=!l2;
 const img=prev.querySelector(".dc-prev-art");
 img.hidden=!S.discord.art;
 const artUrl=cur.art&&/^https:/.test(cur.art)?`url("${String(cur.art).replace(/"/g,"%22")}")`:"";
 img.style.backgroundImage=artUrl;img.classList.toggle("has-art",!!artUrl);
 prev.querySelector(".dc-prev-time").hidden=!S.discord.time;
 prev.querySelector(".dc-prev-btn").hidden=!S.discord.btn;
 const list=document.getElementById("dc-prev-list");
 if(list)list.textContent=t("dc.listen")+" "+(S.discord.disp===2?l1:S.discord.disp===1?(v.artist||l1):"Meowave")}
async function paintDiscord(){
 const sw=document.getElementById("dc-on"),inp=document.getElementById("dc-template"),
  st=document.getElementById("dc-state"),cid=document.getElementById("dc-client"),dot=document.getElementById("dc-dot");
 if(!sw)return;
 if(document.activeElement!==inp)inp.value=S.discord.tmpl;
 if(cid&&document.activeElement!==cid)cid.value=S.discord.cid||"";
 sw.setAttribute("aria-pressed",S.discord.on);
 dcSeg("dc-l1",S.discord.l1);dcSeg("dc-l2",S.discord.l2);dcSeg("dc-disp",S.discord.disp);dcSeg("dc-pause",S.discord.pause);
 for(const [id,k] of [["dc-o-art","art"],["dc-o-time","time"],["dc-o-btn","btn"]])document.getElementById(id)?.setAttribute("aria-pressed",String(!!S.discord[k]));
 document.getElementById("dc-tmpl-row").hidden=S.discord.l1!=="custom";
 document.getElementById("dc-opts")?.classList.toggle("off",!S.discord.on);
 paintDiscordPreview();
 let state="off",text=t("dc.st.off");
 if(TAURI){
  const r=await inv("discord_status").catch(()=>null);
  if(!S.discord.on){state="off";text=t("dc.st.off")}
  else if(r){
   const e=String(r.error||"");
   if(!r.hasId){state="warn";text=t("dc.st.noapp")}
   else if(!r.running){state="warn";text=t("dc.on.no")}
   else if(e==="bad_id"){state="err";text=t("dc.st.badid")}
   else if(e&&e!=="not_running"){state="err";text=e.replace(/^closed:\s*/,t("dc.st.closed")+" ")}
   else{state="ok";text=r.connected?(r.user?t("dc.st.as").replace("{u}",r.user):t("dc.live")):t("dc.on.ok")}
  }
 }else text=t("dc.desktop");
 st.textContent=text;if(dot)dot.dataset.s=state}
async function dcApply(){
 save();
 try{await inv("discord_configure",dcCfg())}catch(e){}
 if(S.discord.on)dcPush();
 paintDiscord()}
document.getElementById("dc-on")?.addEventListener("click",async()=>{
 S.discord.on=!S.discord.on;save();
 const sw=document.getElementById("dc-on");sw.setAttribute("aria-pressed",S.discord.on);
 try{await inv("discord_configure",dcCfg())}catch(e){}
 if(S.discord.on)dcPush();else inv("discord_clear").catch(()=>{});
 paintDiscord();setTimeout(paintDiscord,1500)});
for(const [id,key,num] of [["dc-l1","l1"],["dc-l2","l2"],["dc-disp","disp",true],["dc-pause","pause"]])
 document.getElementById(id)?.addEventListener("click",e=>{
  const b=e.target.closest("button[data-v]");if(!b)return;
  S.discord[key]=num?+b.dataset.v:b.dataset.v;
  if(key==="pause"&&S.discord.on&&S.playing===false&&S.discord.pause==="hide")inv("discord_clear").catch(()=>{});
  dcApply();
  if(key==="l1"&&S.discord.l1==="custom")setTimeout(()=>document.getElementById("dc-template")?.focus(),0)});
for(const [id,key] of [["dc-o-art","art"],["dc-o-time","time"],["dc-o-btn","btn"]])
 document.getElementById(id)?.addEventListener("click",()=>{S.discord[key]=!S.discord[key];dcApply()});
let dcTmplTimer=0;
document.getElementById("dc-template")?.addEventListener("input",e=>{
 S.discord.tmpl=e.target.value.trim()||"{title}";paintDiscordPreview();
 clearTimeout(dcTmplTimer);dcTmplTimer=setTimeout(dcApply,700)});
document.getElementById("dc-client")?.addEventListener("change",e=>{
 S.discord.cid=e.target.value.replace(/\D/g,"");e.target.value=S.discord.cid;dcApply()});
document.getElementById("dc-test")?.addEventListener("click",async()=>{
 if(!TAURI)return toast(t("dc.desktop"));
 try{
  S.discord.on=true;save();
  await inv("discord_configure",dcCfg(true));
  await inv("discord_test",{data:S.current&&S.current.mode!=="empty"?dcData():{title:"Meowave",artist:"Meowave",status:t("np.paused")}});
  toast(t("dc.sent"))}
 catch(e){
  const m=String(e?.message||e||"");
  toast(m==="no_id"?t("dc.st.noapp"):m==="not_running"?t("dc.on.no"):m==="bad_id"?t("dc.st.badid"):(m||t("dc.fail")),6000)}
 paintDiscord()});
if(TAURI)setTimeout(()=>{
 inv("discord_configure",dcCfg()).catch(()=>{});
 paintDiscord()},2500);
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
 if(hint)hint.textContent=(sbProfile?.avatar_url||S.avatar)?t("sprof.set"):"";
 un.onchange=async()=>{
  if(!un.value.trim())return;
  if(!sbUser){
   S.username=un.value.trim();
   if(sbProfile)sbProfile.username=un.value.trim();
   save();renderProfile();toast(t("pr.name.saved"));
   return;
  }
  const {error}=await sb.from("profiles").upsert({id:sbUser.id,username:un.value.trim()});
  toast(error?error.message:t("pr.name.saved"));
  if(!error){sbProfile={...sbProfile,username:un.value.trim()};renderProfile()}}}
/* ── Yandex Music account: one-click sign-in + library sync ──
   Defined here (past every helper it calls) but logically part of Accounts.
   The one-click flow opens a Yandex page and a local helper page; the token
   lands in the keychain and initServices() picks it up on the next poll. */
let YM={panel:false};
async function renderYmAcc(){
 const host=document.getElementById("ymacc");if(!host||!TAURI)return;
 const conn=svc("ym").conn;
 if(!conn){
  host.innerHTML=`<h3 style="margin:0 0 6px">Yandex Music</h3>
   <p class="ph" style="margin:0 0 10px">${t("ym.acc.desc")}</p>
   <button class="btn" id="ym-login">${t("ym.acc.login")}</button>
   <p class="ph" id="ymhint" style="margin:10px 0 0"></p>`;
  document.getElementById("ym-login").onclick=async()=>{
   toast(t("ym.acc.browser"));
   try{
    const started=await inv("ym_login_start");
    toast(t("ym.acc.wait"),9000);
    /* The paste page is where the token is actually entered, so the user has
       to be able to reach it. The browser is asked to open it as well; this
       link is for when it did not. The port used to be thrown away, which left
       the flow with no route to the page at all. */
    const hint=document.getElementById("ymhint");
    if(hint&&started?.paste){
     hint.innerHTML=`${t("ym.acc.open")} <a href="#">${esc(started.paste)}</a>`;
     hint.querySelector("a").onclick=e=>{e.preventDefault();openExternal(started.paste)};
    }
    /* Poll rather than assume: the paste page stores the token whenever the
       user finishes, then initServices() flips the row to connected. */
    let tries=0;
    const poll=setInterval(async()=>{
     tries++;
     await initServices();
     if(svc("ym").conn||tries>20){
      clearInterval(poll);
      renderAccounts();icons();renderYmAcc()}
    },3000);
   }catch(e){toast(String(e.message||e),5200)}};
  return}
 host.innerHTML=`<h3 style="margin:0 0 6px">Yandex Music</h3>
  <p class="ph" style="margin:0 0 10px">${t("connected")} · keychain: meowave/ym</p>
  <button class="btn" id="ym-lib">${t("ym.acc.library")}</button>
  <div id="ymlists" style="margin-top:10px"></div>`;
 document.getElementById("ym-lib").onclick=async()=>{
  const btn=document.getElementById("ym-lib");btn.disabled=true;
  try{
   const liked=await inv("ym_liked_tracks").catch(e=>{toast(String(e.message||e));return []});
   await importRows(liked,"ym",t("lib.fav"),true);
   const pls=await inv("ym_playlists").catch(()=>[]);
   const box=document.getElementById("ymlists");
   if(box)box.innerHTML=(pls||[]).map(p=>
    `<div class="chatrow asrow" style="grid-template-columns:auto 1fr auto">
     <span class="avat ghost"><span class="material-symbols-rounded" style="font-size:18px">music_note</span></span>
     <span class="meta"><b>${esc(p.name)}</b><span>${p.total} ${t("tracks")}</span></span>
     <button class="btn sm" data-ymimp="${esc(p.id)}" data-ymname="${esc(p.name)}">${t("sp.import")}</button></div>`).join("")
    ||`<p class="ph">${t("sp.nolists")}</p>`;
   box?.querySelectorAll("[data-ymimp]").forEach(b=>b.onclick=async()=>{
    const rows=await inv("ym_playlist_tracks",{kind:b.dataset.ymimp}).catch(()=>[]);
    await importRows(rows,"ym",b.dataset.ymname,false)});
  }finally{btn.disabled=false}}}

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
 if(f){await uploadAvatar(f);fillProfileSettings()}});
document.getElementById("set-ban")?.addEventListener("change",async e=>{
 const f=e.target.files?.[0];e.target.value="";
 if(f){await uploadBanner(f);fillProfileSettings()}});

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
if(TAURI)restoreDiskStore();
setTheme(S.theme);setAccent(S.accent);
/* Lite has to be on the document before the first sprite is drawn, or the
   field warms up at full dpr and only drops down a frame later. */
applyLite();
/* Boot exactly as the beta did: the user's own glow, blur and density are
   applied directly — nothing second-guesses them. */
document.documentElement.style.setProperty("--blur",S.blur+"px");
build(innerWidth<900?Math.round(safeParticleDensity()*.45):safeParticleDensity());
setSeg("theme",S.theme);setSeg("lang",LANG);setSeg("quality",S.quality);
setSeg("dens",S.dens);setSeg("pspeed",S.pspeed);setSeg("glow",S.glow);setSeg("blur",S.blur);
coverBgPrefs();coverBgUI();
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
updateSpButtons();
setovInit();
applyI18n();
applyLyVars();paintLyPanel();
applyFPSettings();initFPSettings();initReverbUI();initComfortUI();initImportModal();initLyricEditor();initMediaSession();
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
 /* .ready (the entrance) is added by bootFinish, as the splash leaves. */
 document.getElementById("app").setAttribute("aria-hidden","false");
}else obGo(0);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{if(S.theme==="system")setTheme("system")});

/* The splash leaves once the backend has answered, but not before 0.9 s (so
   the mark has settled — a flicker of a splash reads as a glitch) and not
   after 4.5 s, or a slow network would hold it forever. */
const bootMin=new Promise(r=>setTimeout(r,BOOT.reduce?0:900));
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
let SP_CLIENT_ID="";
async function renderSpotify(){
 const panel=document.getElementById("sppanel"),body=document.getElementById("spbody");
 if(!panel)return;
 panel.hidden=false;
 if(TAURI&&!SP_CLIENT_ID){
  SP_CLIENT_ID=(await inv("spotify_get_client_id").catch(()=>""))||"";
 }
 const available=TAURI?await inv("spotify_available").catch(()=>false):false;
 if(!SP.me&&available)SP.me=await inv("spotify_me").catch(()=>null);
 if(SP.me){
  body.innerHTML=`<p class="ph" style="margin:0 0 10px">${esc(SP.me.display_name||SP.me.id)} · ${SP.me.product||"free"} <button class="btn sm" id="sp-out" style="margin-left:8px">${t("sp.logout")}</button> <button class="btn sm" id="sp-modal-imp" style="margin-left:6px">${t("import.btn")||"Импорт по ссылке"}</button></p>
   <div id="splists"><p class="ph">${t("sp.loading")}</p></div>`;
  document.getElementById("sp-out").onclick=async()=>{
   await inv("spotify_logout").catch(()=>{});SP={me:null,lists:null};renderSpotify();renderAccounts()};
  document.getElementById("sp-modal-imp").onclick=openImportModal;
  if(!SP.lists){
   SP.lists=await inv("spotify_playlists").catch(e=>{toast(String(e.message||e));return null})}
  const list=document.getElementById("splists");
  if(!SP.lists){list.innerHTML=`<p class="ph">${t("sp.nolists")}</p>`;return}
  list.innerHTML=(SP.lists||[]).map(p=>
   `<div class="chatrow asrow" style="grid-template-columns:auto 1fr auto">
    <span class="avat ghost"><span class="material-symbols-rounded" style="font-size:18px">music_note</span></span>
    <span class="meta"><b>${esc(p.name)}</b><span>${p.total} ${t("tracks")}</span></span>
    <button class="btn sm" data-spimp="${esc(p.id)}" data-spname="${esc(p.name)}">${t("sp.import")}</button></div>`).join("")
   ||`<p class="ph">${t("sp.nolists")}</p>`;
  list.querySelectorAll("[data-spimp]").forEach(b=>b.onclick=()=>importSpotifyPlaylist(b.dataset.spimp,b.dataset.spname));
  icons();
  return;
 }
 body.innerHTML=`<p class="ph" style="margin:0 0 10px">${t("sp.desc")}</p>
  <div class="field fcol" style="margin:10px 0;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:flex;flex-direction:column;align-items:flex-start;gap:8px">
   <div>
    <label style="font-size:.85rem;font-weight:600">Spotify Client ID</label>
    <small style="display:block;color:var(--mute);font-size:.72rem">${LANG==="ru"?"Получите в developer.spotify.com/dashboard (Redirect URI: http://localhost:8080/callback)":"Get from developer.spotify.com/dashboard (Redirect URI: http://localhost:8080/callback)"}</small>
   </div>
   <div style="display:flex;gap:8px;width:100%;max-width:440px">
    <input id="sp-cid-inp" type="text" placeholder="SPOTIFY_CLIENT_ID" value="${esc(SP_CLIENT_ID||"")}" style="flex:1;padding:7px 12px;border-radius:8px;background:var(--surf);border:1px solid var(--line);font-size:.82rem" autocomplete="off">
    <button class="btn sm" id="sp-cid-save">${t("tok.save")||"Сохранить"}</button>
   </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
   <button class="btn" id="sp-modal-open"><span class="material-symbols-rounded" style="font-size:16px">download</span> ${t("import.btn")||"Импорт плейлиста Spotify"}</button>
   <button class="btn primary" id="sp-login"><span class="material-symbols-rounded" style="font-size:16px">login</span> ${t("sp.login")}</button>
  </div>`;
 document.getElementById("sp-cid-save")?.addEventListener("click",async()=>{
  const val=(document.getElementById("sp-cid-inp")?.value||"").trim();
  await inv("spotify_set_client_id",{clientId:val}).catch(()=>{});
  SP_CLIENT_ID=val;
  toast(LANG==="ru"?"Client ID сохранён":"Client ID saved");
  renderSpotify();renderAccounts();
 });
 document.getElementById("sp-modal-open")?.addEventListener("click",openImportModal);
 document.getElementById("sp-login")?.addEventListener("click",async()=>{
  let cur=(document.getElementById("sp-cid-inp")?.value||"").trim() || SP_CLIENT_ID;
  if(!cur){
   const entered=prompt(LANG==="ru"
    ?"Введите Client ID Spotify (из developer.spotify.com/dashboard, Redirect URI: http://localhost:8080/callback):"
    :"Enter Spotify Client ID (from developer.spotify.com/dashboard, Redirect URI: http://localhost:8080/callback):");
   if(entered&&entered.trim()){
    await inv("spotify_set_client_id",{clientId:entered.trim()}).catch(()=>{});
    SP_CLIENT_ID=entered.trim();
    cur=SP_CLIENT_ID;
   }else{
    return;
   }
  }else if(cur!==SP_CLIENT_ID){
   await inv("spotify_set_client_id",{clientId:cur}).catch(()=>{});
   SP_CLIENT_ID=cur;
  }
  toast(t("sp.browser"));
  try{SP.me=await inv("spotify_login");renderSpotify();renderAccounts();await initServices()}
  catch(e){toast(String(e.message||e),5200)}});
 icons();
}

/* Matching is sequential on purpose: a burst of searches trips YouTube's
   guest quota and half the playlist arrives unmatched. */
/* Cross-service import core: rows of {t,a,al,d[,i]} in, favorites/playlists
   out. Rows that carry a native playable id (Yandex) are imported directly;
   the rest are matched to YouTube Music by name, like the Spotify importer.
   Sequential matching stays: parallel searches trip YouTube's guest quota. */
const SP_IMPORT_MAX=200;
async function importRows(rows,svcId,name,asFavorites,src){
 if(!rows||!rows.length)return toast(t("sp.empty"));
 /* Rows that already carry a playable id need no search, so the cap that
    keeps YouTube's guest quota safe does not apply to them. */
 const direct=r=>!!(r&&((r.id&&(r.s==="ytm"||r.s==="sc"||r.s==="ym"||r.s==="dz"))||(r.i&&svcId&&svcId!=="sp")));
 const take=rows.slice(0,rows.every(direct)?5000:SP_IMPORT_MAX);
 if(rows.length>take.length)toast(t("sp.capped").replace("{n}",take.length),6500);
 toast(t("sp.importing").replace("{n}",take.length),6000);
 let plId=null,pl=null;
 if(!asFavorites){
  pl=src?PLAYLISTS.find(p=>p.src===src)||null:null;
  if(pl)plId=pl.id;
  else{
   plId=await newPlaylist(name||"Import");
   if(!plId)return;
   pl=PLAYLISTS.find(p=>p.id===plId);
   if(pl&&src)pl.src=src}}
 let ok=0;
 for(const r of take){
  let hit=null;
  if(r.id&&(r.s==="ytm"||r.s==="sc"||r.s==="ym"||r.s==="dz")){
   hit={id:String(r.id),s:r.s,t:r.t,a:r.a||"—",al:r.al||"",d:r.d||0,art:r.art||null,mode:(r.s==="ym"||r.s==="local")?"local":"local"};
   const known=TRACKS.find(y=>String(y.id)===String(hit.id)&&y.s===hit.s);
   if(known){if(!known.art&&hit.art)known.art=hit.art;hit=known}else TRACKS.push(hit);
  }else if(r.i&&svcId){
   /* Native id: the track is directly playable on its home service. */
   hit={id:String(r.i),s:svcId,t:r.t,a:r.a||"—",al:r.al||"",d:r.d||0,art:r.art||null,mode:"local"};
   const known=TRACKS.find(y=>String(y.id)===String(hit.id)&&y.s===hit.s);
   if(known){if(!known.art&&hit.art)known.art=hit.art;hit=known}else TRACKS.push(hit);
  }else if(r.s==="sp"||svcId==="sp"){
   /* Spotify tracks retain full metadata and resolve on play */
   hit={id:String(r.id||uid()),s:"sp",t:r.t,a:r.a||"—",al:r.al||"",d:r.d||0,art:r.art||null,mode:"web"};
   const known=TRACKS.find(y=>String(y.id)===String(hit.id)&&y.s===hit.s);
   if(known){if(!known.art&&hit.art)known.art=hit.art;hit=known}else TRACKS.push(hit);
  }else{
   const q=`${r.a||""} ${r.t||""}`.trim();
   if(q){
    const hits=await searchRemote(q).catch(()=>[]);
    /* The first hit of a search is often a cover or a different song with
       the same name: only a strict match is taken. */
    const want={t:r.t,a:r.a,d:r.d};
    hit=(hits||[]).filter(x=>x&&x.s!=="sp"&&svc(x.s).on)
     .map(x=>({x,m:MWM.of(want,x)})).filter(o=>o.m!=null)
     .sort((p,q)=>(q.m+(SVC_PREF[q.x.s]||0))-(p.m+(SVC_PREF[p.x.s]||0)))[0]?.x||null;
   }
   if(!hit){
    hit={id:String(r.id||uid()),s:svcId||"ytm",t:r.t||"—",a:r.a||"—",al:r.al||"",d:r.d||0,art:r.art||null,mode:"local"};
    TRACKS.push(hit);
   }
  }
  if(!hit)continue;
  if(asFavorites){
   if(!hit.fav){hit.fav=true;hit.favAt=Date.now();queueFav(hit,true);
    if(!TRACKS.some(x=>x.id===hit.id&&x.s===hit.s))TRACKS.push(hit);autoDownload(hit,null);ok++}}
  else if(pl&&!pl.tracks.some(x=>String(x.id)===String(hit.id)&&x.s===hit.s)){
   pl.tracks.push(hit);autoDownload(hit,pl.name);ok++}
  if(!direct(r))await new Promise(res=>setTimeout(res,60));
  else if(ok%50===49)await new Promise(res=>setTimeout(res,0))}
 if(!asFavorites&&pl&&ok>0&&sb&&sbUser&&!isLocalPl(pl)){
  try{
   const {error}=await sb.rpc("playlist_sync",{pid:plId,tracks:pl.tracks.map(plPayload),replace_all:true});
   if(error)console.warn("playlist_sync:",error.message||error);
  }catch(e){console.warn("playlist_sync:",e.message||e)}
 }
 save();renderLib();renderWaveHint();
 /* Rows that came without a cover get one now (covers.js). */
 window.mwCovers?.repair?.();
 toast(t("sp.imported").replace("{ok}",ok).replace("{n}",take.length),5200)}

/* The Spotify importer now rides on the same core as the Yandex one. */
async function importSpotifyPlaylist(pid,name){
 const rows=await inv("spotify_playlist_tracks",{pid}).catch(e=>{toast(String(e.message||e));return null});
 if(!rows||!rows.length)return toast(t("sp.empty"));
 await importRows(rows,null,name,false)}

let importedStagingTracks=[];
let detectedImportSvc=null;

const IMPORT_SVC=[
 {id:"sp",name:"Spotify",re:/spotify\.com|^spotify:/i,cmd:"spotify_public_playlist_tracks"},
 {id:"ym",name:"Yandex Music",re:/music\.yandex\.|yandex\.[a-z]+\/music/i,cmd:"ym_public_playlist_tracks"},
 {id:"ytm",name:"YouTube Music",re:/music\.youtube\.com|youtube\.com|youtu\.be|^(PL|OLAK5uy_|RD|VL)[A-Za-z0-9_-]{10,}$/i,cmd:"ytm_playlist_tracks"},
 {id:"sc",name:"SoundCloud",re:/soundcloud\.com|on\.soundcloud\.com/i,cmd:"sc_playlist_tracks"},
 {id:"dz",name:"Deezer",re:/deezer\.com|deezer\.page\.link|link\.deezer\.com/i,cmd:"link_resolve"}];
function importDetect(url){return IMPORT_SVC.find(s=>s.re.test(url))||null}
function importEl(id){return document.getElementById(id)}
function importSetState(st,err){
 const box=document.querySelector("#import-modal .importbox");if(box)box.dataset.state=st;
 const e=importEl("import-err");if(e){e.hidden=!err;e.textContent=err||""}
 const fb=importEl("import-fetch-btn");if(fb)fb.disabled=st==="loading";
}
function importMarkSvc(){
 const svc=importDetect(importEl("import-url")?.value?.trim()||"");
 document.querySelectorAll("#import-svcs [data-svc]").forEach(x=>x.dataset.on=String(!!svc&&x.dataset.svc===svc.id));
 return svc;
}
function openImportModal(){
 const modal=importEl("import-modal");
 if(!modal)return;
 modal.hidden=false;
 modal.dataset.open="true";
 importedStagingTracks=[];
 detectedImportSvc=null;
 const inp=importEl("import-url");
 if(inp){inp.value="";setTimeout(()=>inp.focus(),30)}
 const det=importEl("import-detected");
 if(det)det.hidden=true;
 const runBtn=importEl("import-run-btn");
 if(runBtn)runBtn.disabled=true;
 importSetState("idle");importMarkSvc();
 icons();
}

function closeImportModal(){
 const modal=importEl("import-modal");
 if(!modal)return;
 modal.hidden=true;
 modal.dataset.open="false";
}

let importReq=0;
async function fetchImportTracks(){
 const inp=importEl("import-url");
 const url=inp?.value?.trim()||"";
 const det=importEl("import-detected"),badge=importEl("import-svc-badge"),meta=importEl("import-preview-meta"),runBtn=importEl("import-run-btn");
 if(!url){importSetState("error",t("import.enter_url")||"Введите ссылку");inp?.focus();return}
 const svc=importMarkSvc();
 if(!svc){importSetState("error",LANG==="ru"?"Ссылка не распознана. Поддерживаются Spotify, YouTube Music, Яндекс Музыка, SoundCloud и Deezer.":"Link not recognised. Supported: Spotify, YouTube Music, Yandex Music, SoundCloud and Deezer.");return}
 const req=++importReq;
 importSetState("loading");
 if(runBtn)runBtn.disabled=true;
 try{
  const tracks=svc.cmd==="link_resolve"?((await inv("link_resolve",{url}))?.tracks||[]):await inv(svc.cmd,{urlOrId:url});
  if(req!==importReq)return;
  if(!tracks||!tracks.length)throw new Error(LANG==="ru"?"В плейлисте не найдено треков (возможно, он приватный)":"No tracks found (the playlist may be private)");
  importedStagingTracks=tracks;
  detectedImportSvc=svc.id;
  if(det){
   det.hidden=false;
   if(badge)badge.innerHTML=`${SVC_ICONS[svc.id]||""}<span>${esc(svc.name)}</span>`;
   if(meta)meta.textContent=`${LANG==="ru"?"Найдено треков":"Tracks found"}: ${tracks.length}`;
   const pv=importEl("import-preview");
   if(pv)pv.innerHTML=tracks.slice(0,4).map(r=>`<li>${r.art?`<img src="${esc(r.art)}" alt="" loading="lazy" onerror="this.remove()">`:`<span class="material-symbols-rounded">music_note</span>`}<div><b>${esc(r.t||"—")}</b><small>${esc(r.a||"")}</small></div></li>`).join("")+(tracks.length>4?`<li class="more">+${tracks.length-4}</li>`:"");
   const nm=importEl("import-name");
   if(nm&&!nm.dataset.touched)nm.value=`${svc.name} Import`;
  }
  importSetState("ready");
  if(runBtn)runBtn.disabled=false;
  icons();
 }catch(e){
  if(req!==importReq)return;
  console.warn("fetchImportTracks error:",e);
  importSetState("error",String(e?.message||e));
  if(det)det.hidden=true;
  if(runBtn)runBtn.disabled=true;
 }
}

function initImportModal(){
 importEl("import-close")?.addEventListener("click",closeImportModal);
 importEl("import-cancel")?.addEventListener("click",closeImportModal);
 importEl("import-fetch-btn")?.addEventListener("click",fetchImportTracks);
 importEl("import-modal")?.addEventListener("click",e=>{if(e.target.id==="import-modal")closeImportModal()});
 importEl("import-modal")?.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();closeImportModal()}});
 const inp=importEl("import-url");
 let deb=0;
 inp?.addEventListener("input",()=>{
  importMarkSvc();
  const det=importEl("import-detected");if(det)det.hidden=true;
  importedStagingTracks=[];const rb=importEl("import-run-btn");if(rb)rb.disabled=true;
  importSetState("idle");
  clearTimeout(deb);
  /* A pasted, recognised link is checked straight away — no extra click. */
  deb=setTimeout(()=>{const v=inp.value.trim();if(/^https?:\/\//i.test(v)&&importDetect(v))fetchImportTracks()},650);
 });
 inp?.addEventListener("keydown",e=>{
  if(e.key==="Enter"){e.preventDefault();clearTimeout(deb);fetchImportTracks()}
 });
 importEl("import-paste")?.addEventListener("click",async()=>{
  try{const v=(await navigator.clipboard.readText()).trim();if(v&&inp){inp.value=v;inp.dispatchEvent(new Event("input"))}}catch{inp?.focus()}
 });
 importEl("import-name")?.addEventListener("input",e=>{e.target.dataset.touched="1"});
 importEl("import-run-btn")?.addEventListener("click",()=>{
  if(!importedStagingTracks.length)return;
  const dest=document.querySelector('input[name="import-dest"]:checked')?.value||"pl";
  const asFav=dest==="fav";
  closeImportModal();
  const names = {sp: "Spotify Import", ytm: "YouTube Music Import", ym: "Yandex Music Import", sc: "SoundCloud Import"};
  const nm=importEl("import-name");
  const plTitle = (nm?.value||"").trim() || names[detectedImportSvc] || "Playlist Import";
  if(nm)delete nm.dataset.touched;
  importRows(importedStagingTracks,detectedImportSvc,plTitle,asFav);
 });
}

function initUIFont(){
 const sel=document.getElementById("ui-font-select");
 const stored=localStorage.getItem("meowave_ui_font")||"";
 if(stored){
  document.documentElement.style.setProperty("--app-font", stored);
  if(sel)sel.value=stored.replace(/^'([^']+)',.*$/, "$1");
 }
 if(sel){
  sel.addEventListener("change",()=>{
   const val=sel.value;
   if(val){
    const fontStr=`'${val}', -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
    document.documentElement.style.setProperty("--app-font", fontStr);
    localStorage.setItem("meowave_ui_font", fontStr);
   }else{
    document.documentElement.style.removeProperty("--app-font");
    localStorage.removeItem("meowave_ui_font");
   }
   toast(LANG==="ru"?"Шрифт интерфейса обновлен":"UI font updated");
  });
 }
}

if(TAURI){setTimeout(renderSpotify,800);setTimeout(renderYmAcc,900);setTimeout(accRefreshAll,1600)}
initSearchReveal();
initUIFont();
document.getElementById("quests-back-btn")?.addEventListener("click",()=>go("profile"));
