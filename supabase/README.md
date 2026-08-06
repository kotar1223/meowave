# Meowave — база данных, по шагам

Всё делается **один раз, тобой**. Пользователям ничего из этого делать не нужно —
они просто ставят плеер.

`psql` не нужен. Всё через SQL Editor в дашборде Supabase.

---

## 1. Схема

Открой `supabase/FULL_SCHEMA.sql`, выдели всё, скопируй.

Supabase → **SQL Editor** → **New query** → вставь → **Run**.

Должно закончиться без ошибок. Если ругается — пришли текст ошибки, там
опережающая ссылка или отсутствующее расширение, и то и другое лечится в файле.

Что это создаёт: профили, аватары и баннеры (Storage), значки, избранное,
плейлисты, отслеживаемые артисты и настройки аккаунта.

После правок в `supabase/migrations/` пересобрать одной командой:

```
node supabase/build_sql.mjs
```

## 2. Каталог значков — обязательно до кодов

Картинки значков лежат в репозитории, но база должна знать их список. Пока
списка нет, вставка кодов падает с ошибкой `23503 ... badge_id=(early_user) is
not present in table "badges"` — код ссылается на значок, которого в базе нет.

```
node supabase/make_badges_sql.mjs
```

Открой `supabase/BADGES.sql`, скопируй целиком → SQL Editor → **Run**.
В конце он сам покажет, сколько значков легло: должно быть 36
(5 статусных, 17 по коду, 14 достижений).

Альтернатива, если у тебя есть service-ключ (Settings → API → `service_role`) —
тот же результат через API. Ключ обходит все правила доступа, поэтому он **не**
лежит в `.env` и **никогда** не попадает в приложение:

```
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_badges.mjs
```

Пересобирать `BADGES.sql` после правок `badges.json`.

## 3. Промокоды

```
node supabase/make_codes.mjs
```

Создаёт два файла:

- `supabase/CODES.sql` — вставить в SQL Editor и нажать Run
- `supabase/CODES.txt` — сами коды, для раздачи

В базе хранится **только хеш** кода, поэтому `CODES.txt` — единственное место,
где есть открытый текст. Оба файла в `.gitignore`.

Полезные варианты:

```
node supabase/make_codes.mjs --uses 100              # не больше 100 активаций
node supabase/make_codes.mjs --only boykisser        # только один значок
node supabase/make_codes.mjs --expires 2026-12-31    # срок годности
node supabase/make_codes.mjs --prefix TECHUP         # свой префикс
```

Активация в приложении: Профиль → поле для кода.

## 4. Статусные значки (Owner, Admin, Developer, Moderator, Tester)

Коды для них **не выпускаются намеренно**: утёкший код на Owner означал бы, что
любой может выдать себе владельца проекта. Только вручную.

Узнать свой id: Supabase → Authentication → Users → скопировать `UID`.

SQL Editor:

```sql
select public.grant_badge('ВСТАВЬ-СВОЙ-UID', 'owner');
```

Так же выдаются `admin`, `developer`, `moderator`, `tester` кому угодно по их UID.
