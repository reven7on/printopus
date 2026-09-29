# Printopus

Сайт центра печати на одежде «Принтопус»: лендинг с товарами, ценами, примерами работ и интерактивный конфигуратор заказа.

## Структура

- `app/page.tsx` — главная страница.
- `app/configurator/page.tsx` — конструктор заказа.
- `app/globals.css` — общие стили сайта и конфигуратора.
- `public/` — изображения, логотипы и мокапы изделий.

## Команды

- `npm run dev` — локальный запуск.
- `npm run build` — production-сборка Next.js.
- `npm run start` — запуск production-сборки.
- `npm run typecheck` — проверка TypeScript.
- `npm test` — сборка и тесты страниц, API, расчётов, админки и загрузки файлов.
- `npm run lint` — проверка ESLint.
- `npm run release:images -- 0.1.0` — локальная сборка проверенных release-образов.

## Локальный запуск в Docker

Для сайта, PostgreSQL, миграций и начального каталога достаточно одной команды:

```sh
docker compose up -d --build
```

После успешного healthcheck:

- сайт: <http://localhost:3000>;
- админка: <http://localhost:3000/admin>;
- локальные данные находятся в Docker volumes `printopus_postgres_data` и `printopus_uploads`.

По умолчанию локальный логин — `admin`, пароль — `change-me-locally`. Их можно переопределить в `.env` значениями `ADMIN_USERNAME`, `ADMIN_PASSWORD` и `ADMIN_SESSION_SECRET`.

Логи приложения: `docker compose logs -f app`. Если нужны логи прямо в
текущем терминале, запускайте без `-d`: `docker compose up --build`.

Для остановки контейнеров без удаления данных:

```sh
docker compose down
```

### Локальная проверка Telegram

Используйте отдельного тестового бота, не production-бота. Если обычные
`TELEGRAM_BOT_TOKEN` и `TELEGRAM_ADMIN_CHAT_ID` уже заполнены в `.env`, Compose
использует их. Необязательные `LOCAL_*` позволяют переопределить их только для
локального Docker:

```dotenv
LOCAL_TELEGRAM_BOT_TOKEN=...
LOCAL_TELEGRAM_ADMIN_CHAT_ID=...
LOCAL_TELEGRAM_MANAGER_USER_IDS=...
```

Затем запустите:

```sh
docker compose --profile telegram up --build
```

Профиль сам отключает webhook у тестового бота, запускает доставку новых заказов и polling кнопок статуса. Для private-чата `LOCAL_TELEGRAM_ADMIN_CHAT_ID` совпадает с ID пользователя; для группы `LOCAL_TELEGRAM_MANAGER_USER_IDS` обязателен.

## Развёртывание

Проект рассчитан только на обычный VPS с постоянным диском. Production-контур
состоит из Caddy, постоянного Node.js-процесса, PostgreSQL и приватного каталога
макетов. Serverless-, edge- и платформенных конфигураций в проекте нет.

Полная инструкция первого запуска, обновления и резервного копирования находится
в `docs/vps.md`. VPS не собирает исходники: образы публикуются в Docker Hub
локальным release-скриптом, а staging и production разворачиваются из bundle
в `deploy/`. `compose.production.yaml` оставлен совместимым входом в канонический
image-only стек; `compose.yaml` поднимает полный локальный стек из исходников.

Для временной демонстрации на Render используйте отдельный Blueprint
`render.yaml` и инструкцию `docs/render.md`. Бесплатная конфигурация имеет
временную файловую систему и не заменяет production-развёртывание на VPS.
