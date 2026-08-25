# Backend Printopus

Первый backend-этап реализован через Next.js Route Handlers, Prisma и PostgreSQL.

## Доступные маршруты

### `GET /api/catalog`

Возвращает активные товары, цвета, размеры, методы печати, форматы и скидки. Денежные значения передаются числами в BYN.

### `POST /api/orders`

Создаёт заказ и одну позицию заказа. Клиент передаёт только выбранные параметры и контактные данные:

```json
{
  "customerName": "Анна",
  "customerPhone": "+375 (29) 555-20-30",
  "contactMethod": "phone",
  "fulfillmentMethod": "pickup",
  "deliveryAddress": null,
  "comment": "Позвонить после 18:00",
  "productSlug": "shirt",
  "color": "white",
  "size": "M",
  "printMethodSlug": "dtf",
  "printFormatCode": "A4",
  "placement": "center",
  "quantity": 20,
  "design": { "front": [] }
}
```

Цена из браузера намеренно не принимается. Сервер заново получает цены и скидку из PostgreSQL, проверяет доступность выбранных параметров и сохраняет рассчитанные значения в заказе.

Ошибки имеют единый формат:

```json
{
  "error": {
    "code": "INVALID_ORDER",
    "message": "Укажите адрес доставки.",
    "field": "deliveryAddress"
  }
}
```

## Следующие этапы

1. Объектное хранилище для загружаемых макетов; в PostgreSQL остаются только метаданные файлов.
2. Защита публичной формы от спама на уровне reverse proxy.
3. Уведомления менеджерам о новых заказах.
4. При необходимости — несколько учётных записей и роли сотрудников.
