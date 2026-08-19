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
- `npm test` — сборка и smoke-тест главной страницы и конфигуратора.
- `npm run lint` — проверка ESLint.

## Развёртывание

Проект использует стандартный Next.js и рассчитан на Node.js-хостинг или VPS.
После `npm run build` можно запускать сайт командой `npm run start` за
обратным прокси Nginx/Caddy. Для компактного деплоя также создаётся
`.next/standalone`; вместе с ним на сервер нужно перенести `public` и
`.next/static`.
