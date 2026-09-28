import { OrderStatus, Prisma, ProductOptionType } from "../../../../../app/generated/prisma/client";
import {
  adminError,
  authorizeAdminRequest,
  readAdminJson,
  writeAuditLog,
} from "../../../../../lib/admin-api";
import { database } from "../../../../../lib/db";
import { normalizeOrderSizeBreakdown } from "../../../../../lib/order-size-breakdown";
import {
  isAllowedAdminOrderTransition,
  orderTransitionRequiresReason,
} from "../../../../../lib/order-status-policy";
import { updateTelegramMessageStatus, type TelegramOrderPayload } from "../../../../../lib/telegram";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const telegramOrderInclude = {
  items: {
    include: {
      assets: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
    },
  },
} satisfies Prisma.OrderInclude;

function toTelegramPayload(order: Prisma.OrderGetPayload<{ include: typeof telegramOrderInclude }>): TelegramOrderPayload {
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

function serializeOrder<T extends {
  subtotal: unknown;
  discountPercent: unknown;
  total: unknown;
  items: Array<{ baseUnitPrice: unknown; unitPrice: unknown; total: unknown }>;
}>(order: T) {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    discountPercent: Number(order.discountPercent),
    total: Number(order.total),
    items: order.items.map((item) => ({
      ...item,
      baseUnitPrice: Number(item.baseUnitPrice),
      unitPrice: Number(item.unitPrice),
      total: Number(item.total),
    })),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorizeAdminRequest(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;

  try {
    const order = await database.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            printMethod: { select: { name: true } },
            printFormat: { select: { code: true, widthCm: true, heightCm: true } },
            product: {
              select: {
                slug: true,
                options: {
                  where: { type: ProductOptionType.COLOR },
                  select: { value: true, label: true, colorHex: true },
                },
              },
            },
            assets: {
              select: {
                id: true,
                designElementId: true,
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                width: true,
                height: true,
                createdAt: true,
              },
            },
          },
        },
        statusHistory: { orderBy: { createdAt: "desc" } },
        telegramDelivery: {
          select: { status: true, attempts: true, lastError: true, sentAt: true },
        },
      },
    });
    if (!order) return adminError("NOT_FOUND", "Заказ не найден.", 404);
    const serialized = serializeOrder(order);
    return Response.json({
      order: {
        ...serialized,
        items: serialized.items.map((item) => {
          const color = item.product?.options.find((option) => option.label === item.colorLabel);
          return {
            ...item,
            sizeBreakdown: normalizeOrderSizeBreakdown(item.sizeBreakdown),
            colorValue: color?.value ?? null,
            colorHex: color?.colorHex ?? null,
          };
        }),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load admin order", error);
    return adminError("INTERNAL_ERROR", "Не удалось загрузить заказ.", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorizeAdminRequest(request, true);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;

  try {
    const body = await readAdminJson(request);
    if (typeof body !== "object" || body === null) return adminError("INVALID_INPUT", "Неверные данные.", 400);
    if ("action" in body && body.action === "retryTelegram") {
      const reset = await database.$transaction(async (transaction) => {
        const result = await transaction.telegramDelivery.updateMany({
          // Do not reset PENDING/PROCESSING work: that can race the worker and
          // send the same notification twice. Manual retry is for terminal jobs.
          where: { orderId: id, status: "FAILED" },
          data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lockedAt: null, lastError: null },
        });
        if (result.count === 1) {
          await writeAuditLog({
            actor: auth.identity.username,
            action: "telegram_delivery_retried",
            entity: "order",
            entityId: id,
          }, transaction);
        }
        return result;
      });
      if (reset.count !== 1) {
        return adminError("NOT_RETRYABLE", "Повтор доступен только для уведомления со статусом ошибки.", 409);
      }
      return Response.json({ queued: true });
    }
    const status = "status" in body ? String(body.status) : "";
    const note = "note" in body ? String(body.note).trim().slice(0, 500) : "";
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      return adminError("INVALID_STATUS", "Неизвестный статус заказа.", 400);
    }

    const order = await database.$transaction(async (transaction) => {
      const current = await transaction.order.findUnique({ where: { id } });
      if (!current) return null;
      const nextStatus = status as OrderStatus;
      if (current.status === nextStatus) {
        return transaction.order.findUniqueOrThrow({ where: { id }, include: telegramOrderInclude });
      }
      if (!isAllowedAdminOrderTransition(current.status, nextStatus)) {
        throw new Error("INVALID_STATUS_TRANSITION");
      }
      const requiresReason = orderTransitionRequiresReason(current.status, nextStatus);
      if (requiresReason && !note) {
        throw new Error("STATUS_REASON_REQUIRED");
      }

      const changed = await transaction.order.updateMany({
        where: { id, status: current.status },
        data: { status: nextStatus },
      });
      if (changed.count !== 1) throw new Error("STATUS_CONFLICT");
      const updated = await transaction.order.findUniqueOrThrow({ where: { id }, include: telegramOrderInclude });
      await transaction.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: current.status,
          toStatus: nextStatus,
          note: note || null,
          changedBy: auth.identity.username,
        },
      });
      await writeAuditLog({
        actor: auth.identity.username,
        action: "status_changed",
        entity: "order",
        entityId: id,
        details: { orderNumber: current.orderNumber, from: current.status, to: nextStatus, note: note || null },
      }, transaction);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!order) return adminError("NOT_FOUND", "Заказ не найден.", 404);
    let telegramSync: "not_linked" | "synced" | "failed" = "not_linked";
    if (order.telegramChatId && order.telegramMessageId) {
      try {
        await updateTelegramMessageStatus(order.telegramChatId, order.telegramMessageId, toTelegramPayload(order));
        telegramSync = "synced";
      } catch (error) {
        telegramSync = "failed";
        console.error(`[Admin Orders] Order #${order.orderNumber} changed, but Telegram sync failed:`, error);
      }
    }
    return Response.json({
      order: { ...order, subtotal: Number(order.subtotal), discountPercent: Number(order.discountPercent), total: Number(order.total) },
      telegramSync,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STATUS_REASON_REQUIRED") {
      return adminError("STATUS_REASON_REQUIRED", "Укажите причину отмены или возврата на предыдущий этап.", 400);
    }
    if (error instanceof Error && error.message === "INVALID_STATUS_TRANSITION") {
      return adminError("INVALID_STATUS_TRANSITION", "Перейдите только на соседний этап рабочего процесса.", 400);
    }
    if (
      (error instanceof Error && error.message === "STATUS_CONFLICT")
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return adminError("STATUS_CONFLICT", "Статус уже изменился в другом окне или Telegram. Обновите заказ и повторите действие.", 409);
    }
    if (error instanceof Error && ["INVALID_JSON", "REQUEST_TOO_LARGE"].includes(error.message)) {
      return adminError("INVALID_INPUT", "Неверные данные.", 400);
    }
    console.error("Failed to update admin order", error);
    return adminError("INTERNAL_ERROR", "Не удалось обновить заказ.", 500);
  }
}
