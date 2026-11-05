# Apple Music

Запрос раунда 9: «добавь Apple Music, и если тут такая же история, как со Spotify, то делай как Spotify».

История та же: звук Apple Music защищён DRM. Поэтому Apple Music — каталог, как Spotify и Deezer без входа:
- Поиск, чарты и альбомы — открытые iTunes Search / Lookup и RSS (`src-tauri/src/am.rs`: `search`, `info`, `search_cards`, `home`, `open`).
- Звук подбирается на других сервисах строгим сравнением (`matching.rs`); 30-секундное превью — только крайний случай, и плеер об этом говорит.
- Ключи и вход не нужны.
