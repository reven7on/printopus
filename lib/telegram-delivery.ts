import { TelegramDeliveryStatus } from "../app/generated/prisma/client";
import { database } from "./db.ts";
import { readStoredAsset } from "./local-file-storage.ts";
import { normalizeOrderSizeBreakdown } from "./order-size-breakdown.ts";
import {
  sendOrderNotificationToTelegram,
  sendOrderPreviewPhotosToTelegram,
  TelegramApiError,
  type TelegramOrderPayload,
  type TelegramSentMessage,
} from "./telegram.ts";

const MAX_ATTEMPTS = 12;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

const orderInclude = {
  previews: { select: { label: true, storageKey: true } },
  items: {
    include: {
      assets: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
  },
} as const;

function retryDelayMs(attempt: number) {
  const schedule = [30, 60, 2 * 60, 5 * 60, 15 * 60, 30 * 60, 60 * 60];
  return schedule[Math.min(Math.max(0, attempt - 1), schedule.length - 1)] * 1000;
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

async function claimDelivery(orderId?: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

  return database.$transaction(async (transaction) => {
    const candidate = await transaction.telegramDelivery.findFirst({
      where: {
        ...(orderId ? { orderId } : {}),
        OR: [
          { status: TelegramDeliveryStatus.PENDING, nextAttemptAt: { lte: now } },
          {
            status: TelegramDeliveryStatus.PROCESSING,
            OR: [{ lockedAt: null }, { lockedAt: { lte: staleBefore } }],
          },
        ],
      },
      orderBy: { nextAttemptAt: "asc" },
    });
    if (!candidate) return null;

    const claimed = await transaction.telegramDelivery.updateMany({
      where: { id: candidate.id, status: candidate.status, updatedAt: candidate.updatedAt },
      data: {
        status: TelegramDeliveryStatus.PROCESSING,
        lockedAt: now,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (claimed.count !== 1) return null;
    return transaction.telegramDelivery.findUniqueOrThrow({ where: { id: candidate.id } });
  });
}

async function loadPayload(orderId: string): Promise<TelegramOrderPayload> {
  const order = await database.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  const previewBuffers = (await Promise.all(order.previews.map(async (preview) => ({
    name: preview.label,
    buffer: await readStoredAsset(preview.storageKey).catch(() => null),
  })))).flatMap((preview) => preview.buffer ? [{ name: preview.name, buffer: preview.buffer }] : []);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    contactMethod: order.contactMethod,
    fulfillmentMethod: order.fulfillmentMethod,
    deliveryAddress: order.deliveryAddress,
    comment: order.comment,
    subtotal: Number(order.subtotal),
    discountPercent: Number(order.discountPercent),
    total: Number(order.total),
    status: order.status,
    previewBuffers,
    items: order.items.map((item) => ({
      productName: item.productName,
      colorLabel: item.colorLabel,
      sizeLabel: item.sizeLabel,
      sizeBreakdown: normalizeOrderSizeBreakdown(item.sizeBreakdown),
      placement: item.placement,
      quantity: item.quantity,
      baseUnitPrice: Number(item.baseUnitPrice),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
      assets: item.assets,
    })),
  };
}

async function markFailed(delivery: { id: string; attempts: number }, error: unknown) {
  // Retrying a deterministic Telegram 4xx (bad chat, blocked bot, malformed
  // request) only creates noise. 429 and 5xx/network errors remain retryable.
  const permanentTelegramError = error instanceof TelegramApiError
    && error.status >= 400
    && error.status < 500
    && error.status !== 429;
  const terminal = permanentTelegramError || delivery.attempts >= MAX_ATTEMPTS;
  await database.telegramDelivery.updateMany({
    where: { id: delivery.id, status: TelegramDeliveryStatus.PROCESSING },
    data: {
      status: terminal ? TelegramDeliveryStatus.FAILED : TelegramDeliveryStatus.PENDING,
      lockedAt: null,
      lastError: errorMessage(error),
      nextAttemptAt: new Date(Date.now() + retryDelayMs(delivery.attempts)),
    },
  });
}

async function deliverClaimed(
  delivery: { id: string; orderId: string; attempts: number },
  suppliedPayload?: TelegramOrderPayload,
): Promise<TelegramSentMessage> {
  try {
    const payload = suppliedPayload ?? await loadPayload(delivery.orderId);
    const sent = await sendOrderNotificationToTelegram(payload);
    if (!sent) throw new Error("Telegram notification is not configured");
    await sendOrderPreviewPhotosToTelegram(payload);

    await database.$transaction([
      database.order.update({
        where: { id: delivery.orderId },
        data: { telegramChatId: sent.chatId, telegramMessageId: sent.messageId },
      }),
      database.telegramDelivery.update({
        where: { id: delivery.id },
        data: {
          status: TelegramDeliveryStatus.SENT,
          lockedAt: null,
          lastError: null,
          sentAt: new Date(),
        },
      }),
    ]);
    return sent;
  } catch (error) {
    await markFailed(delivery, error);
    throw error;
  }
}

export async function deliverTelegramNotificationForOrder(
  orderId: string,
  payload?: TelegramOrderPayload,
): Promise<TelegramSentMessage | null> {
  const delivery = await claimDelivery(orderId);
  return delivery ? deliverClaimed(delivery, payload) : null;
}

export async function deliverNextTelegramNotification(): Promise<boolean> {
  const delivery = await claimDelivery();
  if (!delivery) return false;
  try {
    await deliverClaimed(delivery);
  } catch (error) {
    console.error(`[Telegram Delivery] Order ${delivery.orderId} attempt ${delivery.attempts} failed:`, error);
  }
  return true;
}
