# Meowave Project Guidelines & Skill Routing Matrix

> **Сначала прочитай [`HANDOFF.md`](HANDOFF.md)** — состояние проекта, что сейчас в работе, что не доделано и что нужно от владельца. Правило для всех агентов: в начале сессии добавь туда запись, по ходу и в конце допиши, что сделал и что осталось.

Welcome to **Meowave**. This file defines project standards, architecture invariants, and dynamic skill routing for the agent.

---

## 🧭 Dynamic Skill Dispatch Matrix (Автоматический Выбор Скиллов)

Whenever the user gives a command or request, dynamically select and apply the corresponding skill(s) based on the task domain:

| Domain / User Request | Activated Skills | Location & Workflow |
|:---|:---|:---|
| **Поиск и решение багов, сбои, падения, анализ ошибок** | `diagnosing-bugs`, `diagnose-crash`, `tdd` | `~/.agents/skills/diagnosing-bugs`, `~/.agents/skills/tdd`<br>• Изолировать точную причину (Root Cause).<br>• Проверить краевые случаи перед правкой.<br>• Написать воспроизводящий тест (RED -> GREEN -> REFACTOR). |
| **UI/UX дизайн, адаптив, отступы, Material You, стили** | `better-ui`, `brandkit`, `writing-beats` | `~/.agents/skills/better-ui`, `~/.agents/skills/brandkit`<br>• Применять дизайн-токены Material You M3.<br>• Следить за типографикой, контрастностью и микроанимациями. |
| **Мобильная разработка, адаптация под смартфон, тач, жесты** | `mobile-app-optimization`, `better-ui` | `~/.agents/skills/mobile-app-optimization`<br>• Использовать `100dvh` вместо `100vh`.<br>• Поддерживать `env(safe-area-inset-*)`.<br>• Минимальный размер touch target: 44×44px.<br>• Свайпы для сворачивания и переключения треков. |
| **Linux, D-Bus, MPRIS, системные утилиты, WebKitGTK** | `linux-desktop-integration`, `omarchy` | `~/.agents/skills/linux-desktop-integration`<br>• Интеграция с D-Bus MPRIS (`playerctl`, медиаклавиши).<br>• Проверка GPU (`DRI_PRIME`, PCI адреса с 3 двоеточиями).<br>• Учет различий Wayland и X11. |
| **Рефакторинг, архитектура, модульность, разделение монолита** | `codebase-design`, `to-spec` | `~/.agents/skills/codebase-design`, `~/.agents/skills/to-spec`<br>• Четкое разделение ответственности.<br>• Декомпозиция монолита `src/app.js` (9.9k строк) на ES-модули.<br>• Использование `paths::store_write` вместо перегрузки `localStorage`. |
| **Безопасность, токены, RLS базы данных, сетевой прокси** | `security-and-hardening`, `firebase-crashlytics` | `~/.agents/skills/security-and-hardening`<br>• Защита от timing attacks и DNS Rebinding на `127.0.0.1`.<br>• Аудит RLS политик Supabase (миграция 13).<br>• Безопасное хранение секретов в системном Keychain. |
| **E2E Тестирование, браузерная автоматизация** | `playwright-cli`, `playwright-stealth-verify`, `agent-browser` | `~/.agents/skills/playwright-cli`, `~/.agents/skills/agent-browser`<br>• Запуск и расширение 4-уровневого комплекса `tests/run-e2e.mjs`. |
| **Параллельная работа агентов, мультиагентные подзадачи** | `dispatching-parallel-agents` | `~/.agents/skills/dispatching-parallel-agents`<br>• Делегирование независимых подзадач подконтрольным воркерам. |
| **Маркетинг, тексты для пользователей, воронки, лендинги** | `copywriting`, `marketing-mindset`, `post-purchase-upsell-flow` | `~/.agents/skills/copywriting`, `~/.agents/skills/marketing-mindset` |
| **Документация, ТЗ, обучение, структурирование заметок** | `teach`, `writing-for-agents`, `writing-fragments`, `to-spec` | `~/.agents/skills/teach`, `~/.agents/skills/to-spec`<br>• Вести Obsidian Second Brain в репозитории: `brain/` (см. `brain/Home.md`). |

---

## 🏗️ Архитектурные Принципы Meowave

1. **Frontend No-build:** `src/app.js` и `src/app.css` исполняются напрямую без сборщиков Webpack/Vite.
2. **Звук:** на десктопе по умолчанию играет встроенный движок на Rust (`src-tauri/src/audio`; обёртка `src/naudio.js` повторяет `<audio>`): чтение наперёд через локальный прокси, декодер symphonia, эквалайзер и эффекты, вывод через cpal. WebView + Web Audio граф (`src/app.js`, `initAudio`) — запасной путь: Opus, HE-AAC, файлы-blob, мобильные и «Настройки → Качество → Звуковой движок: WebView». Внешние потоки в обоих случаях идут только через локальный прокси `127.0.0.1:port/stream/?k=...`.
3. **Хранилище:** `STORE_FILES` в `src-tauri/src/paths.rs` определяет белый список файлов для сохранения на диск. Не превышать лимит 5 МБ в `localStorage`.
4. **Второй Мозг (Obsidian):** Все архитектурные изменения, реестры багов и гайды разработчика ведутся в Obsidian-вольте `brain/` в корне репозитория: каждый запрос — в `brain/Log/Requests.md`, каждое действие — в `brain/Log/Worklog.md`, решения — в `brain/Decisions.md`. Секреты туда не пишем.
