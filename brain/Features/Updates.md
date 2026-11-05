# Версия и обновления

Запрос (раунд 8): «сделай при запуске Meowave проверку на обновление и сделай нормально версии — это должна быть уже beta 3.2».

- Номер один — в `src-tauri/tauri.conf.json`; `node scripts/version.mjs` показывает его и проверяет копии (`Cargo.toml`, `Cargo.lock`, `package.json`, `package-lock.json`), `node scripts/version.mjs 3.3.0` ставит новый везде. Только цифры: установщик Windows не принимает буквы. В интерфейсе 3.2.0 читается как «Beta 3.2» (`update.rs::version_label`).
- `update.rs`: `app_version` (номер, канал, рабочая копия или установка), `update_check`, `update_pull` (`git pull` в рабочей копии), `update_install` (релизы).
- `src/update.js`: номер в «О приложении» (`#appver`), проверка через несколько секунд после запуска, диалог «Есть обновление» с кнопкой. В рабочей копии кнопка делает `git pull`, `tauri dev` сам пересобирает и перезапускает окно.
- Ограничение: релизы приватного `meowave-beta` без входа не скачать → [[Known issues]].
