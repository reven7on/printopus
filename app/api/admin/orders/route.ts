import { OrderStatus, Prisma } from "../../../../app/generated/prisma/client";
import { adminError, authorizeAdminRequest } from "../../../../lib/admin-api";
import { database } from "../../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25));
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  const phoneSearch = search.replace(/\D/g, "");
  const requestedStatus = url.searchParams.get("status");
  const requestedSort = url.searchParams.get("sort");
  const status = requestedStatus && Object.values(OrderStatus).includes(requestedStatus as OrderStatus)
    ? requestedStatus as OrderStatus
    : null;
  const isWorkFilter = requestedStatus === "WORK";
  const orderBy = requestedSort === "total-asc"
    ? { total: "asc" as const }
    : requestedSort === "total-desc"
      ? { total: "desc" as const }
      : requestedSort === "date-asc"
        ? { createdAt: "asc" as const }
        : { createdAt: "desc" as const };

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : isWorkFilter ? { status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION] } } : {}),
    ...(search ? {
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        ...(phoneSearch ? [{ customerPhone: { contains: phoneSearch } }] : []),
      ],
    } : {}),
  };

  try {
    const [orders, total] = await Promise.all([
      database.order.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          customerName: true,
          customerPhone: true,
          contactMethod: true,
          fulfillmentMethod: true,
          total: true,
          currency: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
        },
      }),
      database.order.count({ where }),
    ]);

    return Response.json({
      orders: orders.map((order) => ({
        ...order,
        total: Number(order.total),
        itemCount: order._count.items,
        _count: undefined,
      })),
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load admin orders", error);
    return adminError("INTERNAL_ERROR", "Не удалось загрузить заказы.", 500);
  }
}
