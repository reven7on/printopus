import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  buildOrderInlineKeyboard,
  escapeTgHtml,
  formatOrderNotificationHtml,
  TELEGRAM_MESSAGE_LIMIT,
} from "../lib/telegram.ts";
import {
  isAllowedTelegramTransition,
  isAuthorizedTelegramCallback,
  parseStatusCallbackData,
} from "../lib/telegram-callback-policy.ts";
import {
  isAllowedAdminOrderTransition,
  orderTransitionRequiresReason,
} from "../lib/order-status-policy.ts";
import { OrderStatus } from "../app/generated/prisma/enums.ts";
import { generateCombinedPrintPngBuffer } from "../lib/text-asset-generator.ts";

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
        sizeBreakdown: [
          { value: "s", label: "S", quantity: 2 },
          { value: "m", label: "M", quantity: 3 },
        ],
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
  assert(html.includes("Размеры: S — 2, M — 3"));
  assert(html.includes("PRINTOPUS TEAM"));
  assert(html.includes("Montserrat"));
  assert(html.includes("Макеты и исходники:"));
  assert(html.includes("90.00 BYN"));
});

test("buildOrderInlineKeyboard creates correct action buttons", () => {
  const newKeyboard = buildOrderInlineKeyboard("order-123", "NEW");
  assert.equal(newKeyboard.inline_keyboard.length, 2);
  assert.equal(newKeyboard.inline_keyboard[0][0].text, "✅ Подтвердить заказ");
  assert.equal(newKeyboard.inline_keyboard[0][0].callback_data, "st:CONFIRMED:order-123");
  assert.equal(newKeyboard.inline_keyboard[0][1].text, "❌ Отклонить");

  const prodKeyboard = buildOrderInlineKeyboard("order-123", "IN_PRODUCTION");
  assert.equal(prodKeyboard.inline_keyboard[0][0].text, "📦 Готов к выдаче");
  assert.equal(newKeyboard.inline_keyboard.at(-1)[0].url, "https://printservice.by/admin/orders/order-123");
});

test("formatOrderNotificationHtml stays within Telegram message limit", () => {
  const html = formatOrderNotificationHtml({
    id: "8af62936-47ee-45ca-aa62-c80005930251",
    orderNumber: "BY-LONG",
    customerName: "Клиент ".repeat(1000),
    customerPhone: "+375291234567",
    contactMethod: "telegram",
    fulfillmentMethod: "delivery",
    deliveryAddress: "Очень длинный адрес ".repeat(1000),
    comment: "Комментарий ".repeat(1000),
    subtotal: 100,
    discountPercent: 0,
    total: 100,
    status: "NEW",
    items: Array.from({ length: 30 }, (_, index) => ({
      productName: `Изделие ${index} `.repeat(100),
      quantity: 1,
      baseUnitPrice: 100,
      unitPrice: 100,
      total: 100,
      textElements: [{ content: "Текст ".repeat(1000), fontFamily: "Montserrat" }],
    })),
  });
  assert(html.length <= TELEGRAM_MESSAGE_LIMIT);
  assert(html.includes("Полные данные и макеты доступны в админке."));
});

test("Telegram callback parser, authorization and workflow reject forged actions", () => {
  const orderId = "8af62936-47ee-45ca-aa62-c80005930251";
  assert.deepEqual(parseStatusCallbackData(`st:READY:${orderId}`), {
    orderId,
    targetStatus: OrderStatus.READY,
  });
  assert.equal(parseStatusCallbackData("st:READY:not-a-uuid"), null);
  assert.equal(parseStatusCallbackData(`st:NEW:${orderId}`)?.targetStatus, OrderStatus.NEW);

  assert.equal(isAllowedTelegramTransition(OrderStatus.NEW, OrderStatus.CONFIRMED), true);
  assert.equal(isAllowedTelegramTransition(OrderStatus.NEW, OrderStatus.IN_PRODUCTION), false);
  assert.equal(isAllowedTelegramTransition(OrderStatus.NEW, OrderStatus.COMPLETED), false);
  assert.equal(isAllowedTelegramTransition(OrderStatus.COMPLETED, OrderStatus.NEW), false);

  const query = {
    id: "callback-1",
    data: `st:READY:${orderId}`,
    message: { message_id: 10, chat: { id: -100123 } },
    from: { id: 42, first_name: "Manager" },
  };
  assert.equal(isAuthorizedTelegramCallback(query, "-100123", "42,43"), true);
  assert.equal(isAuthorizedTelegramCallback(query, "-100999", "42,43"), false);
  assert.equal(isAuthorizedTelegramCallback(query, "-100123", "43"), false);
  assert.equal(isAuthorizedTelegramCallback(query, "-100123", ""), false);
  assert.equal(isAuthorizedTelegramCallback({ ...query, message: { message_id: 10, chat: { id: 42 } } }, "42", ""), true);
});

test("admin workflow rejects status jumps and requires reasons for rollback", () => {
  assert.equal(isAllowedAdminOrderTransition(OrderStatus.NEW, OrderStatus.CONFIRMED), true);
  assert.equal(isAllowedAdminOrderTransition(OrderStatus.NEW, OrderStatus.COMPLETED), false);
  assert.equal(isAllowedAdminOrderTransition(OrderStatus.READY, OrderStatus.IN_PRODUCTION), true);
  assert.equal(orderTransitionRequiresReason(OrderStatus.READY, OrderStatus.IN_PRODUCTION), true);
  assert.equal(orderTransitionRequiresReason(OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION), false);
});

test("combined print source flattens image, text and graphics into one 300 DPI PNG", async () => {
  const image = await sharp({
    create: { width: 120, height: 80, channels: 4, background: "#ff0000ff" },
  }).png().toBuffer();
  const result = await generateCombinedPrintPngBuffer({
    widthCm: 21,
    heightCm: 29.7,
    assets: [{ uploadId: "back-logo", mimeType: "image/png", buffer: image }],
    elements: [
      { id: "image-1", uploadId: "back-logo", type: "image", x: 50, y: 30, width: 45, scale: 1, rotation: 12, aspectRatio: 1.5 },
      { id: "text-1", type: "text", content: "СПИНА", x: 50, y: 65, width: 60, scale: 1, rotation: 0, color: "#ffffff", fontFamily: "Montserrat", fontWeight: 800, outlined: true },
      { id: "shape-1", type: "shape", content: "crown", x: 50, y: 82, width: 25, scale: 1, rotation: -8, color: "#eab308" },
    ],
  });
  assert(result);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2480);
  assert.equal(metadata.height, 3508);
  assert.equal(metadata.hasAlpha, true);
  assert(Math.abs((metadata.density ?? 0) - 300) <= 1);

  const curvedText = await generateCombinedPrintPngBuffer({
    widthCm: 10,
    heightCm: 10,
    assets: [],
    elements: [
      { id: "curve-1", type: "text", content: "СДЕЛАНО С ЛЮБОВЬЮ", x: 50, y: 50, width: 82, scale: 1, rotation: 0, color: "#8b0038", fontFamily: "Noto Serif", fontWeight: 800, letterSpacing: 1, curve: 55 },
    ],
  });
  assert(curvedText);
  const curvedStats = await sharp(curvedText).stats();
  assert(curvedStats.channels[3].max > 0, "curved text must contain visible pixels");
  assert(curvedStats.channels[3].mean > 0, "curved text must not be an empty transparent PNG");
});
