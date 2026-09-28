# База данных Printopus

Проект использует PostgreSQL и Prisma ORM. Локальная база запускается через `compose.yaml`. В production база работает в закрытой Docker-сети VPS и не публикует порт 5432 наружу.

## Первый запуск

1. Скопировать `.env.example` в `.env`.
2. Либо запустить полный локальный стек: `docker compose up -d --build`, либо только PostgreSQL: `docker compose up -d database`.
3. Применить миграции: `npm run db:deploy`.
4. Добавить начальный каталог и цены: `npm run db:seed`.

Для просмотра и ручного редактирования данных можно запустить `npm run db:studio`.

## Изменение схемы

После редактирования `prisma/schema.prisma`:

1. Создать миграцию командой `npm run db:migrate -- --name short_description`.
2. Обновить клиент командой `npm run db:generate`.
3. Проверить схему командой `npm run db:validate`.

В production применяется только `npm run db:deploy`; команда `db:migrate` предназначена для разработки.

## Надёжность заказов

- `orders.submissionId` — уникальный ключ повторной отправки формы;
- `order_items.sizeBreakdown` — необязательный JSON-снимок распределения тиража по размерам; старые позиции продолжают использовать `sizeLabel`;
- `order_previews` — сохранённые ракурсы, которые видел клиент;
- `telegram_deliveries` — транзакционная очередь уведомлений со статусом, попытками и последней ошибкой;
- `order_status_history` — полная история, начиная с события создания `NEW`.

PostgreSQL и каталог uploads резервируются и восстанавливаются вместе: записи превью и исходников ссылаются на файлы в этом каталоге.
