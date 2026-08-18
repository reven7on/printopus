# Printopus

Сайт центра печати на одежде «Принтопус»: лендинг с товарами, ценами, примерами работ и интерактивный конфигуратор заказа.

## Структура

- `app/page.tsx` — главная страница.
- `app/configurator/page.tsx` — конструктор заказа.
- `app/globals.css` — общие стили сайта и конфигуратора.
- `worker/index.ts` — Cloudflare Worker entry point для Vinext.
- `public/` — изображения, логотипы и мокапы изделий.

## Команды

- `npm run dev` — локальный запуск.
- `npm run build` — production-сборка и проверка артефакта.
- `npm test` — сборка и smoke-тест HTML.
- `npm run lint` — проверка ESLint.

## Примечания

Проект оставлен совместимым с текущей Vinext/Cloudflare Sites сборкой. Заготовки базы данных, тестовые D1-примеры и helper для ChatGPT sign-in удалены, потому что сайт сейчас ими не пользуется.
