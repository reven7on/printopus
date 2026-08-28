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

/**
 * Handles incoming Telegram inline button callback queries
 */
export async function handleTelegramCallbackQuery(query: TelegramCallbackQuery): Promise<boolean> {
  const { id: callbackId, data, message, from } = query;
  if (!data || !data.startsWith("st:") || !message) {
    return false;
  }

  const parts = data.split(":");
  const targetStatus = parts[1] as OrderStatus;
  const orderId = parts[2];

  if (!Object.values(OrderStatus).includes(targetStatus) || !orderId) {
    return false;
  }

  try {
    const updatedOrder = await database.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: orderId },
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
      if (!current) return null;

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

      const senderName = from.username ? `@${from.username}` : from.first_name;
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: current.status,
          toStatus: targetStatus,
          note: `Изменено из Telegram пользователем ${senderName}`,
          changedBy: `Telegram (${senderName})`,
        },
      });

      return updated;
    });

    if (updatedOrder) {
      const statusText =
        targetStatus === OrderStatus.IN_PRODUCTION ? "В производстве"
        : targetStatus === OrderStatus.READY ? "Готов к выдаче"
        : targetStatus === OrderStatus.COMPLETED ? "Завершен"
        : targetStatus === OrderStatus.CANCELLED ? "Отменен"
        : targetStatus;

      await answerCallbackQuery(callbackId, `✅ Статус заказа #${updatedOrder.orderNumber} изменен: ${statusText}`);
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

      console.log(`[Telegram Handler] Order #${updatedOrder.orderNumber} status changed to ${targetStatus} by ${from.username ?? from.first_name}`);
      return true;
    }
  } catch (err) {
    console.error("[Telegram Handler] Error updating order status:", err);
  }

  return false;
}
