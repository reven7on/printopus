import { SITE_URL } from "../app/site-config.ts";

export interface TelegramOrderPayload {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  contactMethod: string;
  fulfillmentMethod: string;
  deliveryAddress?: string | null;
  comment?: string | null;
  subtotal: number;
  discountPercent: number;
  total: number;
  status: string;
  previewBuffer?: Buffer | Uint8Array | null;
  previewBuffers?: Array<{ name?: string; buffer: Buffer | Uint8Array }>;
  items: Array<{
    productName: string;
    colorLabel?: string | null;
    sizeLabel?: string | null;
    placement?: string | null;
    quantity: number;
    baseUnitPrice: number;
    unitPrice: number;
    total: number;
    textElements?: Array<{
      content: string;
      fontFamily?: string;
      fontWeight?: string | number;
      color?: string;
      outlined?: boolean;
    }>;
    assets?: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "🔴 Новый заказ",
  CONFIRMED: "🟡 Подтвержден",
  IN_PRODUCTION: "🔵 В производстве",
  READY: "🟢 Готов к выдаче",
  COMPLETED: "✅ Выполнен",
  CANCELLED: "❌ Отменен",
};

/**
 * Escapes special HTML characters for Telegram HTML parse mode
 */
export function escapeTgHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Format order into clean, professional HTML message for Telegram
 */
export function formatOrderNotificationHtml(order: TelegramOrderPayload): string {
  const statusBadge = STATUS_LABELS[order.status] ?? order.status;
  const contactIcon = order.contactMethod.toUpperCase() === "TELEGRAM" ? "✈️ Telegram" : "📞 Телефон";
  const fulfillmentIcon = order.fulfillmentMethod.toUpperCase() === "DELIVERY" ? "🚚 Доставка" : "🏪 Самовывоз";

  let html = `<b>👕 ЗАКАЗ #${escapeTgHtml(order.orderNumber)}</b>\n`;
  html += `<b>Статус:</b> ${statusBadge}\n\n`;

  html += `<b>👤 Клиент:</b> ${escapeTgHtml(order.customerName)}\n`;
  html += `<b>📱 Связь:</b> <code>${escapeTgHtml(order.customerPhone)}</code> (${contactIcon})\n`;
  html += `<b>📦 Способ получения:</b> ${fulfillmentIcon}\n`;

  if (order.deliveryAddress) {
    html += `<b>📍 Адрес:</b> ${escapeTgHtml(order.deliveryAddress)}\n`;
  }
  if (order.comment) {
    html += `<b>💬 Комментарий:</b> <i>"${escapeTgHtml(order.comment)}"</i>\n`;
  }

  html += `\n<b>📋 Состав заказа:</b>\n`;
  order.items.forEach((item, index) => {
    html += `\n<b>${index + 1}. ${escapeTgHtml(item.productName)}</b>\n`;
    if (item.colorLabel) html += `   • Цвет: ${escapeTgHtml(item.colorLabel)}\n`;
    if (item.sizeLabel) html += `   • Размер: ${escapeTgHtml(item.sizeLabel)}\n`;
    if (item.placement) html += `   • Нанесение: ${escapeTgHtml(item.placement)}\n`;
    html += `   • Тираж: <b>${item.quantity} шт.</b> (${item.unitPrice.toFixed(2)} BYN/шт)\n`;

    if (item.textElements && item.textElements.length > 0) {
      html += `   • ✍️ <b>Текст надписей:</b>\n`;
      item.textElements.forEach((txt) => {
        const fontInfo = txt.fontFamily ? ` (Шрифт: ${escapeTgHtml(txt.fontFamily)}, цвет: ${escapeTgHtml(txt.color ?? "стандартный")})` : "";
        html += `     - <i>"${escapeTgHtml(txt.content)}"</i>${fontInfo}\n`;
      });
    }

    if (item.assets && item.assets.length > 0) {
      html += `   • 📁 <b>Исходники принта (${item.assets.length} ф.):</b> прикреплены отдельными файлами ниже ⬇️\n`;
    }
  });

  html += `\n<b>💰 Финансы:</b>\n`;
  html += `   • Сумма без скидки: ${order.subtotal.toFixed(2)} BYN\n`;
  if (order.discountPercent > 0) {
    html += `   • Оптовая скидка: <b>-${order.discountPercent}%</b>\n`;
  }
  html += `   • <b>ИТОГО К ОПЛАТЕ: ${order.total.toFixed(2)} BYN</b>\n`;

  return html;
}

/**
 * Build inline keyboard buttons for manager order management
 */
export function buildOrderInlineKeyboard(orderId: string, currentStatus: string) {
  const buttons = [];

  if (currentStatus === "NEW") {
    buttons.push([
      { text: "✅ Принять в работу", callback_data: `st:IN_PRODUCTION:${orderId}` },
      { text: "❌ Отклонить", callback_data: `st:CANCELLED:${orderId}` },
    ]);
  } else if (currentStatus === "IN_PRODUCTION" || currentStatus === "CONFIRMED") {
    buttons.push([
      { text: "📦 Готов к выдаче", callback_data: `st:READY:${orderId}` },
    ]);
  } else if (currentStatus === "READY") {
    buttons.push([
      { text: "🎉 Завершен", callback_data: `st:COMPLETED:${orderId}` },
    ]);
  }

  // Admin link button
  buttons.push([
    { text: "🔗 Открыть в админке", url: `${SITE_URL}/admin` },
  ]);

  return { inline_keyboard: buttons };
}

/**
 * Send order notification to Telegram admin chat (with photo preview if available)
 */
export async function sendOrderNotificationToTelegram(order: TelegramOrderPayload): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !chatId) {
    console.log("[Telegram Bot] TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is missing. Skipping notification.");
    return false;
  }

  const text = formatOrderNotificationHtml(order);
  const reply_markup = buildOrderInlineKeyboard(order.id, order.status);

  const photos = order.previewBuffers && order.previewBuffers.length > 0
    ? order.previewBuffers
    : order.previewBuffer && order.previewBuffer.length > 0
      ? [{ name: "Макет нанесения", buffer: order.previewBuffer }]
      : [];

  if (photos.length > 0) {
    try {
      const firstPhoto = photos[0];
      const formData = new FormData();
      formData.append("chat_id", chatId);
      formData.append(
        "photo",
        new Blob([new Uint8Array(firstPhoto.buffer)], { type: "image/png" }),
        `mockup_${order.orderNumber}_0.png`,
      );
      formData.append("caption", text);
      formData.append("parse_mode", "HTML");
      formData.append("reply_markup", JSON.stringify(reply_markup));

      const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as { ok: boolean; description?: string };
      if (data.ok) {
        for (let i = 1; i < photos.length; i++) {
          const photo = photos[i];
          try {
            const extraFormData = new FormData();
            extraFormData.append("chat_id", chatId);
            extraFormData.append(
              "photo",
              new Blob([new Uint8Array(photo.buffer)], { type: "image/png" }),
              `mockup_${order.orderNumber}_${i}.png`,
            );
            extraFormData.append("caption", `👕 <b>Макет (${escapeTgHtml(photo.name ?? `Вид ${i + 1}`)})</b> к заказу #${escapeTgHtml(order.orderNumber)}`);
            extraFormData.append("parse_mode", "HTML");
            await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
              method: "POST",
              body: extraFormData,
            });
          } catch (extraErr) {
            console.warn("[Telegram Bot] Exception sending extra mockup photo:", extraErr);
          }
        }
        return true;
      }
      console.warn("[Telegram Bot] sendPhoto returned false, fallback to sendMessage:", data.description);
    } catch (err) {
      console.warn("[Telegram Bot] Exception sending photo preview, fallback to sendMessage:", err);
    }
  }

  // Fallback to text sendMessage
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup,
        disable_web_page_preview: true,
      }),
    });

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error("[Telegram Bot] Failed to send notification:", data.description);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Telegram Bot] Exception sending notification:", error);
    return false;
  }
}

/**
 * Answer callback query from Telegram inline button click
 */
export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: false,
      }),
    });
  } catch (err) {
    console.error("[Telegram Bot] Failed to answer callback query:", err);
  }
}

/**
 * Edit message text / caption & markup when order status changes via Telegram button
 */
export async function updateTelegramMessageStatus(
  chatId: number | string,
  messageId: number,
  order: TelegramOrderPayload,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const text = formatOrderNotificationHtml(order);
  const reply_markup = buildOrderInlineKeyboard(order.id, order.status);

  // Try editMessageCaption first in case original was a photo message
  try {
    const captionResponse = await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        caption: text,
        parse_mode: "HTML",
        reply_markup,
      }),
    });
    const captionData = (await captionResponse.json()) as { ok: boolean };
    if (captionData.ok) return;
  } catch {
    // Ignore and fallback to text edit
  }

  // Fallback to editMessageText
  try {
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        reply_markup,
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("[Telegram Bot] Failed to edit Telegram message:", err);
  }
}

/**
 * Send an attached document file (original print asset) to Telegram admin chat
 */
export async function sendTelegramDocument(
  documentBuffer: Buffer | Uint8Array,
  fileName: string,
  caption?: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

  if (!token || !chatId) return false;

  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("disable_content_type_detection", "true");
    formData.append(
      "document",
      new Blob([new Uint8Array(documentBuffer)], { type: "application/octet-stream" }),
      fileName,
    );
    if (caption) {
      formData.append("caption", caption);
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: formData,
    });

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      console.error("[Telegram Bot] Failed to send document:", data.description);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Telegram Bot] Exception sending document:", error);
    return false;
  }
}
