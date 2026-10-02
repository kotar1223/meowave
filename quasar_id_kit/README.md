# Quasar ID Integration Kit for Meowave

Этот архив содержит всё необходимое для интеграции **Quasar ID** в музыкальное приложение **Meowave** и экосистему **Quasar Messenger**.

---

## 🎯 Что даёт интеграция Quasar ID

1. **Единый аккаунт (SSO / Unified Identity)**:
   - Пользователь регистрируется один раз в Quasar ID и получает сквозной доступ к Meowave, комнатам совместного прослушивания и облачной синхронизации.
2. **Интеграция с Messenger**:
   - Все личные переписки, групповые чаты и чаты комнат Meowave синхронизируются с Quasar Messenger.
   - История сообщений не теряется при смене устройства.
3. **Музыка в профиле («Profile Music»)**:
   - Возможность транслировать текущий трек в статус мессенджера (Now Playing).
   - Возможность закрепить любимый трек в профиле с обложкой, ссылкой и превью.

---

## 📦 Содержимое пакета

| Файл | Описание |
|---|---|
| `README.md` | Данная инструкция по интеграции |
| `QUASAR_OPENAPI_SPEC.json` | OpenAPI 3.1 спецификация всех эндпоинтов |
| `schema.sql` | SQL-миграция для базы данных PostgreSQL / Supabase |
| `quasar_client_sdk.js` | Готовый клиентский SDK (JavaScript ES6) для вызова API |
| `mock_server.py` | Автономный локальный mock-сервер для тестирования |
| `QUASAR_MESSENGER_SPEC.md` | Спецификация синхронизации чатов с мессенджером |

---

## 🚀 Быстрый старт (тестирование на Mock-сервере)

Для локального тестирования без развертывания боевого бэкенда запустите встроенный mock-сервер:

```bash
python mock_server.py
```
Сервер запустится на `http://localhost:8088`. Он поддерживает регистрацию, авторизацию, выдачу токенов и сохранение трека в профиль.

---

## 🔌 Архитектура API

### 1. Авторизация и регистрация
- `POST /api/v1/auth/register` — регистрация нового Quasar ID.
  - Body: `{ "email": "...", "username": "...", "password": "..." }`
  - Response: `{ "token": "jwt...", "refreshToken": "...", "user": { "id": "...", "username": "...", "email": "..." } }`
- `POST /api/v1/auth/login` — вход по email/username и паролю.
  - Body: `{ "identifier": "...", "password": "..." }`
  - Response: `{ "token": "jwt...", "user": { ... } }`
- `POST /api/v1/auth/refresh` — обновление токена доступа.

### 2. Профиль и музыка в профиле
- `GET /api/v1/user/profile` — получение профиля с закрепленным треком.
- `PUT /api/v1/user/profile/music` — закрепление или обновление музыки в профиле:
  ```json
  {
    "track": {
      "id": "track_123",
      "service": "ytm",
      "title": "Соль личностей",
      "artist": "ВШБ feat. cosmoboy",
      "artwork_url": "https://...",
      "duration": 162
    },
    "broadcast_status": true
  }
  ```

### 3. Мессенджер
- `GET /api/v1/messenger/chats` — получение списка бесед.
- `POST /api/v1/messenger/sync` — синхронизация сообщений из комнат прослушивания Meowave.

---

## 🛠️ Настройка переменных окружения в Meowave

В корне Meowave в файле `.env` (или системных переменных):
```env
QUASAR_API_URL=https://api.quasar.id/v1
QUASAR_CLIENT_ID=meowave-desktop-client
QUASAR_CLIENT_SECRET=your_client_secret
```

По любым вопросам интеграции обращаться к команде разработки Meowave.
