import { OrderStatus, ProductOptionType } from "../../../../../app/generated/prisma/client";
import {
  adminError,
  authorizeAdminRequest,
  readAdminJson,
  writeAuditLog,
} from "../../../../../lib/admin-api";
import { database } from "../../../../../lib/db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const workflow: OrderStatus[] = ["NEW", "CONFIRMED", "IN_PRODUCTION", "READY", "COMPLETED"];

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
      },
    });
    if (!order) return adminError("NOT_FOUND", "Заказ не найден.", 404);
    const serialized = serializeOrder(order);
    return Response.json({
      order: {
        ...serialized,
        items: serialized.items.map((item) => {
          const color = item.product?.options.find((option) => option.label === item.colorLabel);
          return { ...item, colorValue: color?.value ?? null, colorHex: color?.colorHex ?? null };
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
    const status = "status" in body ? String(body.status) : "";
    const note = "note" in body ? String(body.note).trim().slice(0, 500) : "";
    if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
      return adminError("INVALID_STATUS", "Неизвестный статус заказа.", 400);
    }

    const order = await database.$transaction(async (transaction) => {
      const current = await transaction.order.findUnique({ where: { id } });
      if (!current) return null;
      const nextStatus = status as OrderStatus;
      if (current.status === nextStatus) return current;
      const currentIndex = workflow.indexOf(current.status);
      const nextIndex = workflow.indexOf(nextStatus);
      const requiresReason = nextStatus === OrderStatus.CANCELLED || current.status === OrderStatus.CANCELLED || (currentIndex >= 0 && nextIndex >= 0 && nextIndex < currentIndex);
      if (requiresReason && !note) {
        throw new Error("STATUS_REASON_REQUIRED");
      }

      const updated = await transaction.order.update({ where: { id }, data: { status: nextStatus } });
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
    });

    if (!order) return adminError("NOT_FOUND", "Заказ не найден.", 404);
    return Response.json({ order: { ...order, subtotal: Number(order.subtotal), discountPercent: Number(order.discountPercent), total: Number(order.total) } });
  } catch (error) {
    if (error instanceof Error && error.message === "STATUS_REASON_REQUIRED") {
      return adminError("STATUS_REASON_REQUIRED", "Укажите причину отмены или возврата на предыдущий этап.", 400);
    }
    if (error instanceof Error && ["INVALID_JSON", "REQUEST_TOO_LARGE"].includes(error.message)) {
      return adminError("INVALID_INPUT", "Неверные данные.", 400);
    }
    console.error("Failed to update admin order", error);
    return adminError("INTERNAL_ERROR", "Не удалось обновить заказ.", 500);
  }
}
