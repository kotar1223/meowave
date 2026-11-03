# Как запустить

## Что нужно (Windows)
- **Node.js** LTS (20 или 22): https://nodejs.org
- **Rust** stable (MSVC) через https://rustup.rs
- **Visual Studio Build Tools** с компонентом «Разработка классических приложений на C++»: без него Rust не слинкует приложение
- **WebView2**: в Windows 11 уже установлен
- **Git**

## Забрать бету и запустить
```powershell
cd C:\meowave-beta
git fetch origin
git checkout beta-redesign
git pull
npm install
npm run dev
```
- Перед запуском закрой установленный Meowave, чтобы не перепутать окна.
- Если интерфейс выглядит по-старому, нажми в окне `Ctrl+F5` (перезагрузка без кэша).
- Первая сборка Rust идёт несколько минут, следующие быстрее.

## Сборка установщика
```powershell
npm run build
```
Скрипт скачивает ffmpeg (`scripts/fetch-ffmpeg.mjs`) и вызывает `tauri build`. Установщик появится в `src-tauri\target\release\bundle\`.
Новая иконка на рабочем столе и в «Пуске» появится только после установки новой сборки (см. [[Features/App icon]]).

## Проверки
| Команда | Что делает |
|---|---|
| `npm run check:js` | проверка синтаксиса `src/app.js` |
| `npm run test:e2e` | e2e-тесты `tests/run-e2e.mjs`: инварианты HTML/CSS/JS, анимации, reduced motion, граничные случаи |
| `npm run check` | `cargo clippy -D warnings` и `cargo test` для Rust |

Ожидаемый результат e2e: 285 тестов прошли, 5 пропущены. Пропуски не ошибки: это проверки, которые статикой не сделать (например, движение волны во время игры).

## Частые ошибки
- **`'tauri' is not recognized`**: не выполнен `npm install`. CLI Tauri ставится из пакета `@tauri-apps/cli`.
- **`could not find Cargo.toml`**: `cargo run` в корне не нужен. Rust-проект лежит в `src-tauri`, его собирает `npm run dev`.
- **`cargo` не найден**: поставь Rust через rustup и открой новый терминал.
- **Ошибка компиляции Rust**: пришли полный текст ошибки. В песочнице агента Rust не собирается (см. [[Known issues]]).
- **Discord не показывает статус**: нужен Application ID, см. [[Features/Discord RPC]].

## Git-процесс
- `origin` — `kotar1223/meowave-beta` (приватный), `upstream` — `kotar1223/meowave` (публичный).
- Работа идёт в ветке `beta-redesign`, изменения попадают в `main` бета-репозитория через PR #1.
- Когда бета проверена: слить PR в `main`, затем перенести в публичный репозиторий (`git push upstream main` или отдельный PR).
