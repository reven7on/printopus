import { OrderStatus } from "../../../../app/generated/prisma/client";
import { database } from "../../../../lib/db";
import { answerCallbackQuery, updateTelegramMessageStatus } from "../../../../lib/telegram";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (webhookSecret) {
    const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (receivedSecret !== webhookSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const update = (await request.json()) as {
      callback_query?: {
        id: string;
        data?: string;
        message?: {
          message_id: number;
          chat: { id: number | string };
        };
        from: { first_name: string; username?: string };
      };
    };

    if (update.callback_query && update.callback_query.data) {
      const { id: callbackId, data, message, from } = update.callback_query;
      if (data.startsWith("st:") && message) {
        const parts = data.split(":");
        const targetStatus = parts[1] as OrderStatus;
        const orderId = parts[2];

        if (Object.values(OrderStatus).includes(targetStatus) && orderId) {
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
            if (!current || current.status === targetStatus) return current;

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
                fromStatus: current.status,
                toStatus: targetStatus,
                note: `Изменено из Telegram пользователем @${from.username ?? from.first_name}`,
                changedBy: `Telegram (@${from.username ?? from.first_name})`,
              },
            });

            return updated;
          });

          if (updatedOrder) {
            await answerCallbackQuery(callbackId, `Статус заказа #${updatedOrder.orderNumber} изменен`);
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
          }
        }
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Webhook Error]", error);
    return Response.json({ ok: true }); // Always return 200 to Telegram
  }
}
