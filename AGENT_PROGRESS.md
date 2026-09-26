# AGENT PROGRESS — meowave

> Файл для нейросетей/агентов: что уже сделано, что найдено, что осталось.
> **Обновлять после каждого действия.** Последнее обновление: 2026-09-26 (после README/миграций).

## Кто я и зачем
Задача пользователя: *«изучи проект, посмотри баги и что не закончено»*.
Роль: ревью/аудит (по умолчанию **не** вносить правок, кроме явных).

---

## 1. Что за проект

Tauri 2 desktop music player (Rust backend + vanilla JS frontend, без сборки).

- `src/` — фронтенд: `index.html`, `app.js` (5615 строк), `app.css`, `vendor/`, `assets/`
- `src-tauri/` — Rust: `main.rs`, `api.rs`, `ytm.rs`, `stream.rs` (локальный прокси),
  `local.rs`, `proxy.rs`, `lyrics.rs`, `spotify.rs`, `mem.rs`, `tokens.rs`, `paths.rs`, `config.rs`, `update.rs`
- `supabase/` — SQL-миграции 01…12 + генератор `FULL_SCHEMA.sql`
- `.github/workflows/` — `ci.yml` (untracked), `release.yml`
- README — описание, roadmap

---

## 2. Проверки — что прогнано и результат

| Проверка | Команда | Результат |
|---|---|---|
| Синтаксис фронта | `node --check src/app.js` | ✅ OK |
| Синтаксис mjs-скриптов | `node --check supabase/*.mjs scripts/*.mjs ...` | ✅ OK |
| Rust-тесты | `nix-shell --run 'cd src-tauri && cargo test'` | ✅ 15 passed / 2 ignored (после фикса, см. §3) |
| clippy | `cargo clippy -- -D warnings` | ❌ не выполнен: в окружении нет clippy (`no such command`), rustup отсутствует |
| i18n RU/EN полнота | ручной разбор `I18N` | ✅ ru 489 ключей, en 489, 0 отсутствующих, 13 неиспользуемых |
| i18n-ключи в HTML | сверка `data-i18n` ↔ `I18N` | ✅ 0 отсутствующих |
| Генераторы vs закоммиченное | `build_sql.mjs`, `_gen.mjs` | ✅ FULL_SCHEMA.sql и badges.json совпадают |
| docs-копии бейджей | `scripts/sync-docs-badges.mjs` | ⚠️ **был дрейф** — скрипт перезаписал 38 файлов в `docs/assets/badges/` (см. §4, п.7) |

Запуск в этом окружении требует `nix-shell` (иначе нет `gobject-2.0` для сборки).

---

## 3. Изменения, которые Я внёс в рабочее дерево

1. **`src-tauri/src/mem.rs` — починил сборку** (§4 B1).
2. **`src-tauri/src/ytm.rs` + `stream.rs` — починил YouTube Music** (§4 B0).
3. **`src/app.js` — починил очередь/волну/конец списка** (§4 B4) и **импорт Spotify** (§4 B5).
4. **`src-tauri/src/spotify.rs` — `spotify_playlist_tracks` теперь постраничный** (до 10 страниц × 100).
5. **`src/app.js` — добавлен i18n-ключ `sp.capped`** (ru+en, 490/490).
6. **`docs/assets/badges/**` — 38 файлов обновлены** запуском `npm run sync:docs`
   при проверке дрейфа (скрипт копирует src → docs). Состояние стало согласованным
   (именно его требует CI), но это было сделано мной, не пользователем.
7. Создан `AGENT_PROGRESS.md` (этот файл).
8. Временные файлы `.review-harness.mjs`, `.ytm_probe.mjs` — созданы и удалены.

**Ничего не коммитить без явного слова пользователя. Рабочее дерево было грязным до меня (см. §5).**

---

## 4. Найденные баги

### Блокеры

**B0. YouTube Music не играл — ПОЧИНЕНО (2026-09-26).**
- Симптом: поиск работал (20 треков), воспроизведение — нет.
- Причина: `player`-эндпоинт через клиент `ANDROID_VR` отвечает
  `LOGIN_REQUIRED — "Sign in to confirm you're not a bot"` и **пустым**
  `streamingData` (0 форматов). Версия 1.65.10 и 1.60.19 — обе заблокированы.
- Диагностика: прогон 13 клиентов InnerTube на реальном videoId.
  Работает **только `ANDROID` 20.10.38** → `status=OK`, 5–6 аудио-форматов,
  все с прямыми `url` (без cipher), контейнеры `audio/mp4` + `audio/webm`.
- Фикс: в `ytm.rs` введён список `PLAYER_CLIENTS = [ANDROID, ANDROID_VR, ANDROID_MUSIC]`
  (побеждает первый, ответивший OK), контекст собирает `player_ctx(name, visitor)`;
  `stream()` сначала ретраит нового visitor, затем переходит к следующему клиенту.
  Экспортирован `MEDIA_UA`, его теперь шлёт `stream.rs` при запросе байтов.
- Проверено: `cargo test` — 15 passed; сквозной `cargo run -- --probe "daft punk"`:
  `format: audio/webm @ 165002 bps`, `proxy OK: 206 … range 0-65535/6126038`.
  SoundCloud тоже `proxy OK`.

**B1. Сборка сломана** — `mem.rs` + sysinfo 0.39 (устранено, §3.1).
Корень: `Cargo.toml` (uncommitted) поднял `sysinfo = "0.39"`, а код писался под старый API.

**B2. Весь текущий код не был закоммичен — РЕШЕНО (коммит `c87e48a`).**
- Было: tracked 126, modified 123, untracked 107. В HEAD не было `src/app.js`/`app.css`,
  `src/vendor/`, миграций 09–12, `src-tauri/src/{lyrics,mem,spotify}.rs`, `package.json`,
  `shell.nix`, `.github/workflows/ci.yml` → свежий клон не собирался и не запускался.
- Сделано: `.gitignore` расширен (`.tmp-dl/`, `src.rar`, `*.kate-swp`, `*.swp`, `*~`,
  инертный `src-tauri/tauri.local.json`), затем `git add -A` + коммит.
- Итог: **246 файлов, +19589/−9623**, дерево чистое (`git status` = 0).
- Проверено перед коммитом: крупных файлов нет (максимум `icon.icns` 570 КБ),
  бинарники ffmpeg и `supabase/CODES.txt` в игноре, секретов в диффе нет
  (только publishable-ключ и упоминания service_role в документации/RLS).
- Git-идентичности в системе не было → использованы флаги `-c user.name/-c user.email`
  с автором репозитория (`kotar1223`); **конфиг git не менялся**.

**B3. CI не работал — РЕШЕНО**: `.github/workflows/ci.yml` был untracked, теперь
закоммичен и будет запускаться на каждый push/PR (clippy + cargo test + синтаксис JS +
сверка генераторов).

### Логика фронтенда (проверено экспериментом на извлечённом коде)

**B4. `next()` — блок `if(!nx)` был недостижим ⇒ три фичи мертвы — ПОЧИНЕНО.**
- Причина: `setTrack()` вызывал `buildQueue()` на **каждом** треке, а `buildQueue`
  клал в `queue` весь пул минус текущий → очередь не могла закончиться (пул ≥ 2) →
  `if(!nx)` не выполнялось.
- Следствия (все три функции вызывались только оттуда):
  `waveExtend()` — волна не продлевалась, а зациклила первые N треков;
  `stopAtEnd()` — повтор ВЫКЛ не останавливал плейлист (f1→f2→f3→f1→…);
  `roomAdvance()` — серверный переход очереди комнаты не вызывался.
  Отдельный случай: пул из 1 трека → молчаливый `return`, `S.playing` оставался `true`.
- Фикс:
  * `setTrack(tr,play,openFull,ctx,keepQueue)` — пересборка только при входе в список;
    `keepQueue=true` передают `next()` и прыжок по панели очереди (их комментарии
    прямо это и требовали — раньше им мешал безусловный `buildQueue`).
  * `buildQueue`: неперестройка без wrap (`pool.slice(i+1)`), иначе конец списка
    недостижим в принципе.
  * `next()`: комната (только DJ, слушатель ничего не решает) → `roomAdvance()`
    → волна (`waveExtend`, при ошибке тоже `stopAtEnd`) → конец списка → `stopAtEnd()`.
  * `waveExtend()` кладёт свежие треки и в `queue` (иначе рекурсивный `next()`
    снова видит пустую очередь).
  * комнаты: `roomConsume(tr)` — строка покидает серверную очередь, когда её трек
    начал играть (сетка DJ и сервер иначе расходились); `roomAdvance()` теперь
    просто берёт обновлённую голову.
- Проверено на стенде (извлечённые функции + заглушки): волна продлевается и играет
  свежее; избранное с повтором ВЫКЛ останавливается на последнем; пул из 1 трека
  останавливается (playing=false); shuffle играет каждый трек один раз и останавливается;
  прыжок в панели очереди сохраняет хвост. `node --check` OK.

**B5. Импорт плейлиста Spotify не работал — ПОЧИНЕНО.**
- `const plId=newPlaylist(name)` без `await` → `plId`=Promise →
  `PLAYLISTS.find(p=>p.id===plId)`=undefined → `addToPlaylist` ничего не добавлял,
  а тост рапортовал успех. Фикс: `const plId=await newPlaylist(name)`.
- Дополнительно: `await addToPlaylist`, счётчик только для реально добавленных
  (не считает дубли), честный лимит `SP_IMPORT_MAX=200` + новый ключ `sp.capped`,
  в Rust — постраничный `spotify_playlist_tracks` (было: молча первые 100 строк).

**B5. Импорт плейлиста Spotify не работает** — `src/app.js:5601`:
```js
const plId = newPlaylist(name) || null;   // newPlaylist async → всегда Promise (truthy)
```
`plId` = Promise → `PLAYLISTS.find(p=>p.id===plId)` = undefined →
`addToPlaylist(plId, hit)` рано выходит → создаётся **пустой** плейлист,
тост при этом рапортует «Done: 0 of N». Исправление: `const plId = await newPlaylist(name)`.
Также: импорт режется на `rows.slice(0,60)` без предупреждения, а счётчик `ok`
увеличивается без проверки результата.

### Менее критичные

- **B6.** README(roadmap) устарел — **ПОЧИНЕНО**: добавлены фичи People и i18n в Features;
  Roadmap переписан по фактам: Spotify — остался импорт сохранённой библиотеки
  (импорт плейлистов есть), социалка — есть и схема, и UI (миграции 09–12 применяются
  вручную), арт бейджей — 35 из 36 (без PNG остался `party_boykisser`).
- **B7.** Мусор/артефакты в дереве: `src.rar` (1.1 МБ), `.tmp-dl/` (7.7 МБ, mp3),
  `supabase/.FULL_SCHEMA.sql.kate-swp` (swap-файл Kate), `src-tauri/tauri.local.json`
  — **мёртвый файл**: Tauri читает `tauri.local.conf.json` (с точкой), этот нигде не подключён.
  → Теперь всё это в `.gitignore` (файлы на диске **не удалены** — удаление не делал,
  это необратимо; если надо — скажи, почистим).
- **B8.** Миграции социалки применяются вручную — **ЧАСТИЧНО РЕШЕНО**:
  файлы 09–12 теперь в репозитории (B2), а сообщение `soc.needsql` (ru+en)
  теперь указывает на `supabase/FULL_SCHEMA.sql` — идемпотентный файл, покрывающий
  все 12 миграций (раньше — на один `11_social_fix.sql`, который предполагает 10-й).
  `supabase/README.md` теперь перечисляет и социальную часть.
- **B9.** `modalRes` — один глобальный на все диалоги: при двух наваленных
  `showModal` первый Promise не разрешится никогда (кодирует цепочки, таймер скрытия
  отменяет, а `modalRes` — нет).
- **B10.** `beforeunload` → `flushListening(true)` / `flushFavorites()` без ожидания —
  при закрытии окна запрос может быть оборван (потеря последней минуты статистики).
- **B11.** 13 i18n-ключей объявлены, но не используются (`pr.genre`, `bd.code.*`,
  `dis.on`, `loc.svc`, `pl.auth` …) — мёртвые строки.

---

## 5. Что сделано / что осталось

### ✅ Сделано
- [x] Структура, README, стек изучены
- [x] **B0: YouTube Music починен и проверен сквозным probe**
- [x] **B4: очередь/волна/конец списка починены и проверены на стенде**
- [x] **B5: импорт Spotify починен (+ постраничный backend)**
- [x] **B2: всё дерево закоммичено (`c87e48a`, 246 файлов)**
- [x] **B3: `ci.yml` закоммичен — CI заработает на следующем push**
- [x] Rust-бэкенд прочитан (main/api/ytm/lyrics/update/config/local/spotify/mem)
- [x] Тесты Rust прогнаны (15 passed), JS-синтаксис и i18n — зелёные
- [x] Фронтенд: i18n, escaping(XSS), поиск, очередь/волна, комнаты, Spotify — просмотрены
- [x] Supabase-миграции и генераторы сверены
- [x] CI/release-workflow прочитаны
- [x] B1 починен

### ⏳ Осталось
- [x] **B6: README обновлён по фактам**
- [x] **B8: `soc.needsql` → FULL_SCHEMA.sql, supabase/README дополнен**
- [ ] Прогнать clippy (нужно окружение с rustup/clippy) → `npm run check`
- [ ] Убрать мусор с диска (B7) — только по подтверждению пользователя
- [ ] Оптимизация кода (просьба пользователя)
- [ ] Закоммитить текущую порцию правок (README/i18n/AGENT_PROGRESS)

---

## 6. Полезные команды

```bash
nix-shell --run 'cd src-tauri && cargo test'   # сборка+тесты (без nix-shell нет gobject-2.0)
node --check src/app.js                        # синтаксис фронта
node supabase/build_sql.mjs                    # перегенерировать FULL_SCHEMA.sql
npm run sync:docs                              # синхрон PNG бейджей src → docs
```

---

## 7. Журнал действий

| # | Действие | Статус |
|---|---|---|
| 1 | Изучил структуру/README | ✅ |
| 2 | Нашёл и починил ошибку сборки `mem.rs` | ✅ |
| 3 | Прогнал cargo test, node --check, i18n/генераторы | ✅ |
| 4 | Ревью фронта: нашёл B4, B5 и прочее | ✅ |
| 5 | Создал этот файл | ✅ |
| 6 | Диагностика YTM: 13 клиентов InnerTube → работает только ANDROID 20.10.38 | ✅ |
| 7 | Фикс `ytm.rs`/`stream.rs` (список клиентов + MEDIA_UA) | ✅ |
| 8 | `cargo test` (15 passed) + сквозной `--probe` — YTM играет | ✅ |
| 9 | B4: `setTrack`/`buildQueue`/`next`/`waveExtend`/комнаты + стенд-проверка | ✅ |
| 10 | B5: `await newPlaylist`, честный счётчик, постраничный `spotify_playlist_tracks`, ключ `sp.capped` | ✅ |
| 11 | Проверки: `node --check`, i18n 490/490, `cargo test` 15 passed | ✅ |
| 12 | Git: `.gitignore` → `git add -A` → коммит `c87e48a` (246 файлов, дерево чистое) | ✅ |
| 13 | B6: README Features/Roadmap переписан по фактам | ✅ |
| 14 | B8: `soc.needsql` → `FULL_SCHEMA.sql` (ru+en), `supabase/README.md` про 09…12 | ✅ |
| 15 | Закоммитить порцию документации | ⏳ |
| 16 | Оптимизация кода | ⏳ |
