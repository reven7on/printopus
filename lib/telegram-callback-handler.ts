import { OrderStatus, Prisma } from "../app/generated/prisma/client";
import { database } from "./db.ts";
import { normalizeOrderSizeBreakdown } from "./order-size-breakdown.ts";
import {
  answerCallbackQuery,
  sendTelegramStatusNotice,
  updateTelegramMessageStatus,
  type TelegramOrderPayload,
} from "./telegram.ts";
import {
  isAllowedTelegramTransition,
  isAuthorizedTelegramCallback,
  parseStatusCallbackData,
  type TelegramCallbackQuery,
} from "./telegram-callback-policy.ts";

export type { TelegramCallbackQuery } from "./telegram-callback-policy.ts";

const STATUS_NAMES: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "Подтвержден",
  IN_PRODUCTION: "В производстве",
  READY: "Готов к выдаче",
  COMPLETED: "Завершен",
  CANCELLED: "Отменен",
};

class ConcurrentOrderUpdateError extends Error {}

function toTelegramPayload(order: {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  contactMethod: string;
  fulfillmentMethod: string;
  deliveryAddress: string | null;
  comment: string | null;
  subtotal: unknown;
  discountPercent: unknown;
  total: unknown;
  status: string;
  items: Array<{
    productName: string;
    colorLabel: string | null;
    sizeLabel: string | null;
    sizeBreakdown: unknown;
    placement: string | null;
    quantity: number;
    baseUnitPrice: unknown;
    unitPrice: unknown;
    total: unknown;
    assets: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>;
  }>;
}): TelegramOrderPayload {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    discountPercent: Number(order.discountPercent),
    total: Number(order.total),
    items: order.items.map((item) => ({
      ...item,
      sizeBreakdown: normalizeOrderSizeBreakdown(item.sizeBreakdown),
      baseUnitPrice: Number(item.baseUnitPrice),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
  };
}

const orderWithAssets = {
  items: {
    include: {
      assets: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
  },
} satisfies Prisma.OrderInclude;

async function acknowledge(queryId: string, text: string, showAlert = false): Promise<void> {
  try {
    await answerCallbackQuery(queryId, text, showAlert);
  } catch (error) {
    console.warn("[Telegram Handler] Could not acknowledge callback:", error);
  }
}

async function notifyFailure(query: TelegramCallbackQuery, text: string): Promise<void> {
  if (!query.message) return;
  try {
    await sendTelegramStatusNotice(query.message.chat.id, query.message.message_id, text);
  } catch (error) {
    console.warn("[Telegram Handler] Could not send status notice:", error);
  }
}

async function changeOrderStatusAtomically(
  orderId: string,
  targetStatus: OrderStatus,
  query: TelegramCallbackQuery,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await database.$transaction(async (tx) => {
        const current = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, orderNumber: true } });
        if (!current) return { kind: "not_found" as const };

        if (current.status === targetStatus) {
          const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderWithAssets });
          await tx.order.update({
            where: { id: orderId },
            data: { telegramChatId: String(query.message?.chat.id), telegramMessageId: query.message?.message_id },
          });
          return { kind: "unchanged" as const, order };
        }
        if (!isAllowedTelegramTransition(current.status, targetStatus)) {
          const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderWithAssets });
          await tx.order.update({
            where: { id: orderId },
            data: { telegramChatId: String(query.message?.chat.id), telegramMessageId: query.message?.message_id },
          });
          return { kind: "invalid_transition" as const, order };
        }

        const changed = await tx.order.updateMany({
          where: { id: orderId, status: current.status },
          data: {
            status: targetStatus,
            telegramChatId: String(query.message?.chat.id),
            telegramMessageId: query.message?.message_id,
          },
        });
        if (changed.count !== 1) throw new ConcurrentOrderUpdateError();

        const senderName = query.from.username ? `@${query.from.username}` : query.from.first_name;
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: current.status,
            toStatus: targetStatus,
            note: `Изменено из Telegram пользователем ${senderName}`,
            changedBy: `Telegram (${senderName}, id ${query.from.id})`,
          },
        });
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderWithAssets });
        return { kind: "changed" as const, order, previousStatus: current.status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const isConflict = error instanceof ConcurrentOrderUpdateError
        || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
      if (!isConflict || attempt === 3) throw error;
    }
  }
  throw new ConcurrentOrderUpdateError();
}

export async function handleTelegramCallbackQuery(query: TelegramCallbackQuery): Promise<boolean> {
  const parsed = parseStatusCallbackData(query.data);
  if (!query.id || !query.message || !parsed) {
    if (query.id) await acknowledge(query.id, "Неверный запрос", true);
    return false;
  }
  if (!isAuthorizedTelegramCallback(query)) {
    await acknowledge(query.id, "У вас нет доступа к управлению заказами", true);
    return false;
  }

  const readableStatus = STATUS_NAMES[parsed.targetStatus] ?? parsed.targetStatus;
  await acknowledge(query.id, `Обновляем статус: ${readableStatus}…`);

  try {
    const result = await changeOrderStatusAtomically(parsed.orderId, parsed.targetStatus, query);
    if (result.kind === "not_found") {
      await notifyFailure(query, "❌ Заказ не найден в базе данных.");
      return false;
    }
    if (result.kind === "invalid_transition") {
      await updateTelegramMessageStatus(query.message.chat.id, query.message.message_id, toTelegramPayload(result.order));
      await notifyFailure(query, `⚠️ Для заказа #${result.order.orderNumber} этот переход уже недоступен. Сообщение обновлено до актуального статуса.`);
      return false;
    }

    await updateTelegramMessageStatus(query.message.chat.id, query.message.message_id, toTelegramPayload(result.order));
    if (result.kind === "changed") {
      console.info(`[Telegram Handler] Order #${result.order.orderNumber}: ${result.previousStatus} -> ${parsed.targetStatus} by user ${query.from.id}`);
    }
    return true;
  } catch (error) {
    console.error("[Telegram Handler] Failed to process callback:", error);
    throw error;
  }
}
