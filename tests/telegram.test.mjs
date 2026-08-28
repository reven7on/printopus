import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderInlineKeyboard,
  escapeTgHtml,
  formatOrderNotificationHtml,
} from "../lib/telegram.ts";

test("escapeTgHtml escapes special HTML characters", () => {
  assert.equal(escapeTgHtml("T-Shirt & <Logo>"), "T-Shirt &amp; &lt;Logo&gt;");
});

test("formatOrderNotificationHtml formats complete order details", () => {
  const sampleOrder = {
    id: "test-order-123",
    orderNumber: "PO-2026-0828-001",
    customerName: "Алексей Иванов",
    customerPhone: "+375291234567",
    contactMethod: "telegram",
    fulfillmentMethod: "delivery",
    deliveryAddress: "г. Минск, ул. Немига 5, кв. 12",
    comment: "Очень срочный принт!",
    subtotal: 100,
    discountPercent: 10,
    total: 90,
    status: "NEW",
    items: [
      {
        productName: "Футболка Oversize",
        colorLabel: "Черный",
        sizeLabel: "XL",
        placement: "Спереди (Грудь)",
        quantity: 5,
        baseUnitPrice: 20,
        unitPrice: 18,
        total: 90,
        textElements: [
          { content: "PRINTOPUS TEAM", fontFamily: "Montserrat", color: "#FF0000" },
        ],
        assets: [
          {
            id: "asset-1",
            originalName: "my_cool_print.png",
            mimeType: "image/png",
            sizeBytes: 2 * 1024 * 1024,
          },
        ],
      },
    ],
  };

  const html = formatOrderNotificationHtml(sampleOrder);
  assert(html.includes("PO-2026-0828-001"));
  assert(html.includes("Алексей Иванов"));
  assert(html.includes("+375291234567"));
  assert(html.includes("г. Минск, ул. Немига 5, кв. 12"));
  assert(html.includes("Очень срочный принт!"));
  assert(html.includes("Футболка Oversize"));
  assert(html.includes("Черный"));
  assert(html.includes("PRINTOPUS TEAM"));
  assert(html.includes("Montserrat"));
  assert(html.includes("Исходники принта (1 ф.):"));
  assert(html.includes("90.00 BYN"));
});

test("buildOrderInlineKeyboard creates correct action buttons", () => {
  const newKeyboard = buildOrderInlineKeyboard("order-123", "NEW");
  assert.equal(newKeyboard.inline_keyboard.length, 2);
  assert.equal(newKeyboard.inline_keyboard[0][0].text, "✅ Принять в работу");
  assert.equal(newKeyboard.inline_keyboard[0][0].callback_data, "st:IN_PRODUCTION:order-123");
  assert.equal(newKeyboard.inline_keyboard[0][1].text, "❌ Отклонить");

  const prodKeyboard = buildOrderInlineKeyboard("order-123", "IN_PRODUCTION");
  assert.equal(prodKeyboard.inline_keyboard[0][0].text, "📦 Готов к выдаче");
});
