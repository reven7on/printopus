import { getSiteUrl } from "../app/site-config.ts";
import type { OrderSizeBreakdownEntry } from "./order-size-breakdown.ts";

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
    sizeBreakdown?: OrderSizeBreakdownEntry[] | null;
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
    shapeElements?: Array<{
      content: string;
      color?: string;
      x?: number;
      y?: number;
      width?: number;
    }>;
    assets?: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  }>;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

export interface TelegramSentMessage {
  chatId: string;
  messageId: number;
}

export class TelegramApiError extends Error {
  readonly status: number;
  readonly errorCode?: number;

  constructor(message: string, status: number, errorCode?: number) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "🔴 Новый заказ",
  CONFIRMED: "🟡 Подтвержден",
  IN_PRODUCTION: "🔵 В производстве",
  READY: "🟢 Готов к выдаче",
  COMPLETED: "✅ Выполнен",
  CANCELLED: "❌ Отменен",
};

const MAX_TELEGRAM_TEXT_LENGTH = 4096;
const TELEGRAM_TEXT_TARGET_LENGTH = 3900;
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_ATTEMPTS = 3;

export function escapeTgHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function limitText(value: string, maximum: number): string {
  const characters = Array.from(value.trim());
  return characters.length <= maximum ? characters.join("") : `${characters.slice(0, maximum - 1).join("")}…`;
}

function formatCompactOrderHtml(order: TelegramOrderPayload): string {
  const statusBadge = STATUS_LABELS[order.status] ?? escapeTgHtml(order.status);
  const lines = [
    `<b>👕 ЗАКАЗ #${escapeTgHtml(limitText(order.orderNumber, 80))}</b>`,
    `<b>Статус:</b> ${statusBadge}`,
    "",
    `<b>👤 Клиент:</b> ${escapeTgHtml(limitText(order.customerName, 160))}`,
    `<b>📱 Телефон:</b> <code>${escapeTgHtml(limitText(order.customerPhone, 40))}</code>`,
    `<b>📋 Позиций:</b> ${order.items.length}`,
    `<b>💰 ИТОГО: ${order.total.toFixed(2)} BYN</b>`,
    "",
    "Полные данные и макеты доступны в админке.",
  ];
  return lines.join("\n");
}

export function formatOrderNotificationHtml(order: TelegramOrderPayload): string {
  const statusBadge = STATUS_LABELS[order.status] ?? escapeTgHtml(order.status);
  const contactIcon = order.contactMethod.toUpperCase() === "TELEGRAM" ? "✈️ Telegram" : "📞 Телефон";
  const fulfillmentIcon = order.fulfillmentMethod.toUpperCase() === "DELIVERY" ? "🚚 Доставка" : "🏪 Самовывоз";

  let html = `<b>👕 ЗАКАЗ #${escapeTgHtml(limitText(order.orderNumber, 80))}</b>\n`;
  html += `<b>Статус:</b> ${statusBadge}\n\n`;
  html += `<b>👤 Клиент:</b> ${escapeTgHtml(limitText(order.customerName, 160))}\n`;
  html += `<b>📱 Связь:</b> <code>${escapeTgHtml(limitText(order.customerPhone, 40))}</code> (${contactIcon})\n`;
  html += `<b>📦 Способ получения:</b> ${fulfillmentIcon}\n`;

  if (order.deliveryAddress) {
    html += `<b>📍 Адрес:</b> ${escapeTgHtml(limitText(order.deliveryAddress, 300))}\n`;
  }
  if (order.comment) {
    html += `<b>💬 Комментарий:</b> <i>"${escapeTgHtml(limitText(order.comment, 500))}"</i>\n`;
  }

  html += `\n<b>📋 Состав заказа:</b>\n`;
  order.items.slice(0, 20).forEach((item, index) => {
    html += `\n<b>${index + 1}. ${escapeTgHtml(limitText(item.productName, 160))}</b>\n`;
    if (item.colorLabel) html += `   • Цвет: ${escapeTgHtml(limitText(item.colorLabel, 80))}\n`;
    if (item.sizeBreakdown?.length) {
      const breakdown = item.sizeBreakdown
        .map((entry) => `${escapeTgHtml(limitText(entry.label, 24))} — ${entry.quantity}`)
        .join(", ");
      html += `   • Размеры: ${breakdown}\n`;
    } else if (item.sizeLabel) {
      html += `   • Размер: ${escapeTgHtml(limitText(item.sizeLabel, 40))}\n`;
    }
    if (item.placement) html += `   • Нанесение: ${escapeTgHtml(limitText(item.placement, 100))}\n`;
    html += `   • Тираж: <b>${item.quantity} шт.</b> (${item.unitPrice.toFixed(2)} BYN/шт)\n`;

    if (item.textElements && item.textElements.length > 0) {
      html += `   • ✍️ <b>Текст надписей:</b>\n`;
      item.textElements.slice(0, 12).forEach((txt) => {
        const fontInfo = txt.fontFamily
          ? ` (Шрифт: ${escapeTgHtml(limitText(txt.fontFamily, 80))}, цвет: ${escapeTgHtml(limitText(txt.color ?? "стандартный", 40))})`
          : "";
        html += `     - <i>"${escapeTgHtml(limitText(txt.content, 160))}"</i>${fontInfo}\n`;
      });
    }

    if (
      (item.assets && item.assets.length > 0)
      || (item.textElements && item.textElements.length > 0)
      || (item.shapeElements && item.shapeElements.length > 0)
    ) {
      html += `   • 📁 <b>Макеты и исходники:</b> доступны в админке; превью могут быть приложены ниже.\n`;
    }
  });

  html += `\n<b>💰 Финансы:</b>\n`;
  html += `   • Сумма без скидки: ${order.subtotal.toFixed(2)} BYN\n`;
  if (order.discountPercent > 0) html += `   • Оптовая скидка: <b>-${order.discountPercent}%</b>\n`;
  html += `   • <b>ИТОГО К ОПЛАТЕ: ${order.total.toFixed(2)} BYN</b>\n`;

  return html.length <= TELEGRAM_TEXT_TARGET_LENGTH ? html : formatCompactOrderHtml(order);
}

export function buildOrderInlineKeyboard(orderId: string, currentStatus: string) {
  const buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];

  if (currentStatus === "NEW") {
    buttons.push([
      { text: "✅ Подтвердить заказ", callback_data: `st:CONFIRMED:${orderId}` },
      { text: "❌ Отклонить", callback_data: `st:CANCELLED:${orderId}` },
    ]);
  } else if (currentStatus === "CONFIRMED") {
    buttons.push([{ text: "✅ Принять в работу", callback_data: `st:IN_PRODUCTION:${orderId}` }]);
  } else if (currentStatus === "IN_PRODUCTION") {
    buttons.push([{ text: "📦 Готов к выдаче", callback_data: `st:READY:${orderId}` }]);
  } else if (currentStatus === "READY") {
    buttons.push([{ text: "🎉 Завершен", callback_data: `st:COMPLETED:${orderId}` }]);
  }

  buttons.push([{ text: "🔗 Открыть в админке", url: `${getSiteUrl()}/admin/orders/${encodeURIComponent(orderId)}` }]);
  return { inline_keyboard: buttons };
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getTelegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
}

async function telegramApi<T>(
  method: string,
  body: Record<string, unknown> | FormData,
  options: { attempts?: number; timeoutMs?: number } = {},
): Promise<T> {
  const token = getTelegramToken();
  if (!token) throw new TelegramApiError("TELEGRAM_BOT_TOKEN is not configured", 503);

  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const isFormData = body instanceof FormData;
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: isFormData ? undefined : { "Content-Type": "application/json" },
        body: isFormData ? body : JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null) as TelegramApiResponse<T> | null;
      if (response.ok && data?.ok && data.result !== undefined) return data.result;

      const error = new TelegramApiError(
        data?.description || `Telegram API ${method} returned HTTP ${response.status}`,
        response.status,
        data?.error_code,
      );
      const retryAfterMs = Math.max(0, data?.parameters?.retry_after ?? 0) * 1_000;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === attempts) throw error;
      await delay(retryAfterMs || 250 * 2 ** (attempt - 1));
    } catch (error) {
      lastError = error;
      if (error instanceof TelegramApiError) throw error;
      if (attempt === attempts) {
        const message = error instanceof Error ? error.message : "Unknown network error";
        throw new TelegramApiError(`Telegram API ${method} network error: ${message}`, 503);
      }
      await delay(250 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error ? lastError : new TelegramApiError("Telegram API request failed", 503);
}

export async function sendOrderNotificationToTelegram(order: TelegramOrderPayload): Promise<TelegramSentMessage | null> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!getTelegramToken() || !chatId) {
    console.info("[Telegram Bot] Notification is disabled: bot token or admin chat ID is missing.");
    return null;
  }

  const result = await telegramApi<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: formatOrderNotificationHtml(order),
    parse_mode: "HTML",
    reply_markup: buildOrderInlineKeyboard(order.id, order.status),
    link_preview_options: { is_disabled: true },
  });
  return { chatId, messageId: result.message_id };
}

export async function sendOrderPreviewPhotosToTelegram(order: TelegramOrderPayload): Promise<void> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!getTelegramToken() || !chatId) return;
  const photos = order.previewBuffers?.length
    ? order.previewBuffers
    : order.previewBuffer?.length
      ? [{ name: "Спереди", buffer: order.previewBuffer }]
      : [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("photo", new Blob([new Uint8Array(photo.buffer)], { type: "image/png" }), `mockup_${order.orderNumber}_${index}.png`);
    formData.append("caption", `🖼️ <b>Макет (${escapeTgHtml(limitText(photo.name ?? `Вид ${index + 1}`, 100))})</b> к заказу #${escapeTgHtml(order.orderNumber)}`);
    formData.append("parse_mode", "HTML");
    try {
      await telegramApi("sendPhoto", formData);
    } catch (error) {
      console.error(`[Telegram Bot] Failed to send preview ${index + 1}:`, error);
    }
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text: string,
  showAlert = false,
): Promise<void> {
  await telegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: limitText(text, 180),
    show_alert: showAlert,
  }, { attempts: 2, timeoutMs: 3_000 });
}

export async function sendTelegramStatusNotice(chatId: number | string, messageId: number, text: string): Promise<void> {
  await telegramApi("sendMessage", {
    chat_id: chatId,
    text: limitText(text, 500),
    reply_parameters: { message_id: messageId, allow_sending_without_reply: true },
  });
}

export async function updateTelegramMessageStatus(
  chatId: number | string,
  messageId: number,
  order: TelegramOrderPayload,
): Promise<void> {
  if (!getTelegramToken()) throw new TelegramApiError("TELEGRAM_BOT_TOKEN is not configured", 503);
  const text = formatOrderNotificationHtml(order);
  const replyMarkup = buildOrderInlineKeyboard(order.id, order.status);

  try {
    await telegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      link_preview_options: { is_disabled: true },
    });
    return;
  } catch (error) {
    if (error instanceof TelegramApiError && error.message.toLowerCase().includes("message is not modified")) return;
    const canBeCaption = error instanceof TelegramApiError
      && error.status === 400
      && /no text|caption|message to edit/i.test(error.message);
    if (!canBeCaption) throw error;
  }

  try {
    const caption = text.length <= 1000 ? text : formatCompactOrderHtml(order);
    await telegramApi("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
    });
  } catch (error) {
    if (error instanceof TelegramApiError && error.message.toLowerCase().includes("message is not modified")) return;
    throw error;
  }
}

export async function sendTelegramDocument(
  documentBuffer: Buffer | Uint8Array,
  fileName: string,
  caption?: string,
): Promise<boolean> {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!getTelegramToken() || !chatId) return false;

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("disable_content_type_detection", "true");
  formData.append("document", new Blob([new Uint8Array(documentBuffer)], { type: "application/octet-stream" }), fileName);
  if (caption) formData.append("caption", limitText(caption, 1000));

  try {
    await telegramApi("sendDocument", formData);
    return true;
  } catch (error) {
    console.error("[Telegram Bot] Failed to send document:", error);
    return false;
  }
}

export const TELEGRAM_MESSAGE_LIMIT = MAX_TELEGRAM_TEXT_LENGTH;
