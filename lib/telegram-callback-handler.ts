import { OrderStatus } from "../app/generated/prisma/client";
import { database } from "./db.ts";
import { answerCallbackQuery, updateTelegramMessageStatus } from "./telegram.ts";

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: {
    message_id: number;
    chat: { id: number | string };
  };
  from: { first_name: string; username?: string };
}

const STATUS_NAMES: Record<string, string> = {
  NEW: "Новый",
  IN_PRODUCTION: "В производстве",
  READY: "Готов к выдаче",
  COMPLETED: "Завершен",
  CANCELLED: "Отменен",
};

/**
 * Handles incoming Telegram inline button callback queries safely and instantly
 */
export async function handleTelegramCallbackQuery(query: TelegramCallbackQuery): Promise<boolean> {
  const { id: callbackId, data, message, from } = query;
  if (!data || !data.startsWith("st:") || !message) {
    if (callbackId) await answerCallbackQuery(callbackId, "Неверный запрос").catch(() => {});
    return false;
  }

  const parts = data.split(":");
  const targetStatus = parts[1] as OrderStatus;
  const orderId = parts[2];

  if (!Object.values(OrderStatus).includes(targetStatus) || !orderId) {
    await answerCallbackQuery(callbackId, "Неизвестный статус").catch(() => {});
    return false;
  }

  const readableStatus = STATUS_NAMES[targetStatus] ?? targetStatus;

  // 1. Immediately acknowledge Telegram button click in <100ms so button never spins/freezes
  await answerCallbackQuery(callbackId, `⏳ Обновляем статус: ${readableStatus}...`).catch(() => {});

  try {
    const existing = await database.order.findUnique({
      where: { id: orderId },
      select: { id: true, orderNumber: true, status: true },
    });

    if (!existing) {
      await answerCallbackQuery(callbackId, "❌ Заказ не найден в базе данных").catch(() => {});
      return false;
    }

    if (existing.status === targetStatus) {
      await answerCallbackQuery(callbackId, `ℹ️ Заказ #${existing.orderNumber} уже в статусе "${readableStatus}"`).catch(() => {});
      return true;
    }

    const senderName = from.username ? `@${from.username}` : from.first_name;

    const updatedOrder = await database.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: targetStatus },
        include: {
          items: {
            include: {
              assets: {
                select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
              },
            },
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: existing.status,
          toStatus: targetStatus,
          note: `Изменено из Telegram пользователем ${senderName}`,
          changedBy: `Telegram (${senderName})`,
        },
      });

      return updated;
    });

    if (updatedOrder) {
      // 2. Notify manager of successful status change toast
      await answerCallbackQuery(callbackId, `✅ Заказ #${updatedOrder.orderNumber}: ${readableStatus}`).catch(() => {});

      // 3. Update message text and buttons in live Telegram chat
      await updateTelegramMessageStatus(message.chat.id, message.message_id, {
        id: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        customerName: updatedOrder.customerName,
        customerPhone: updatedOrder.customerPhone,
        contactMethod: updatedOrder.contactMethod,
        fulfillmentMethod: updatedOrder.fulfillmentMethod,
        deliveryAddress: updatedOrder.deliveryAddress,
        comment: updatedOrder.comment,
        subtotal: Number(updatedOrder.subtotal),
        discountPercent: Number(updatedOrder.discountPercent),
        total: Number(updatedOrder.total),
        status: updatedOrder.status,
        items: updatedOrder.items.map((item) => ({
          productName: item.productName,
          colorLabel: item.colorLabel,
          sizeLabel: item.sizeLabel,
          placement: item.placement,
          quantity: item.quantity,
          baseUnitPrice: Number(item.baseUnitPrice),
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
          assets: item.assets,
        })),
      });

      console.log(`[Telegram Handler] Order #${updatedOrder.orderNumber} status changed: ${existing.status} -> ${targetStatus} by ${senderName}`);
      return true;
    }
  } catch (err) {
    console.error("[Telegram Handler] Error updating order status:", err);
    await answerCallbackQuery(callbackId, "❌ Ошибка при обновлении статуса").catch(() => {});
  }

  return false;
}
