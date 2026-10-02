# Quasar Messenger & Meowave Integration Specification

Данная спецификация описывает интеграцию системы обмена сообщениями **Quasar Messenger** с музыкальным клиентом **Meowave**.

---

## 1. Концепция интеграции

1. **Единый профиль и контакты**:
   - Авторизованный через Quasar ID пользователь автоматически видит свои контакты и группы из мессенджера внутри Meowave.
2. **Синхронизация комнат прослушивания**:
   - Любая комната совместного прослушивания (Listening Room) в Meowave автоматически транслируется как групповой чат в Quasar Messenger с тегом `#meowave-room`.
3. **Статус активности («Now Playing»)**:
   - При воспроизведении музыки в Meowave статус пользователя в мессенджере автоматически обновляется:
     `Слушает: {artist} - {title} 🎵 [Слушать вместе]`.
   - Нажатие на статус в мессенджере открывает трек или подключает к совместной сессии в Meowave.

---

## 2. Форматы сообщений

### 2.1 Обычное текстовое сообщение
```json
{
  "type": "text",
  "room_id": "quasar_room_99",
  "sender_id": "usr_quasar_001",
  "sender_name": "kotyar",
  "content": "Зацени этот дроп!",
  "timestamp": 1727768400000
}
```

### 2.2 Сообщение с треком (Track Share)
Пользователь может отправить трек прямо в чат мессенджера или комнаты:
```json
{
  "type": "music_card",
  "room_id": "quasar_room_99",
  "sender_id": "usr_quasar_001",
  "track": {
    "service": "ytm",
    "id": "dQw4w9WgXcQ",
    "title": "Never Gonna Give You Up",
    "artist": "Rick Astley",
    "artwork_url": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    "duration": 213
  },
  "timestamp": 1727768410000
}
```

### 2.3 Приглашение в совместную волну (Listen Party Invite)
```json
{
  "type": "listen_party_invite",
  "room_id": "room_meowave_party_42",
  "host_name": "kotyar",
  "current_track": {
    "service": "sc",
    "title": "Cyber Chill Wave",
    "artist": "SynthCat"
  },
  "action_url": "meowave://party/join?id=room_meowave_party_42"
}
```

---

## 3. WebSocket Realtime Protocol

Для комнат с минимальной задержкой используется WebSocket соединение:
- **Endpoint**: `wss://messenger.quasar.id/ws/v1/chat`
- **Аутентификация**: При подключении клиент отправляет JWT токен:
  ```json
  { "action": "auth", "token": "Bearer <jwt_token>" }
  ```
- **События трансляции**:
  - `track_seek`: Синхронизация таймкода трека между слушателями.
  - `track_change`: Смена трека хостом комнаты.
  - `chat_message`: Новое сообщение в чате комнаты.

---

## 4. REST API для синхронизации истории

- `GET /api/v1/messenger/rooms/:room_id/history?limit=50&before=<timestamp>`
  Возвращает последние сообщения комнаты для локального кэша Meowave.

- `POST /api/v1/messenger/sync`
  Синхронизирует сообщения, отправленные в оффлайн-буфере Meowave при восстановлении связи.

---

## 5. Безопасность и приватность

- Все запросы должны содержать валидный заголовок `Authorization: Bearer <token>`.
- Пользователь в настройках Meowave может отключить статус «Now Playing», сняв галочку «Транслировать статус в Quasar Messenger».
- Приватные чаты 1-на-1 поддерживают сквозное шифрование (E2EE) по стандарту Quasar Protocol.
