import { OrderStatus } from "../../../../app/generated/prisma/client";
import { adminError, authorizeAdminRequest } from "../../../../lib/admin-api";
import { database } from "../../../../lib/db";

export const runtime = "nodejs";

const activeOrderStatuses = [
  OrderStatus.NEW,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY,
];

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if ("response" in auth) return auth.response;

  try {
    const [statusGroups, revenue, recentOrders, auditLog, products] = await Promise.all([
      database.order.groupBy({ by: ["status"], _count: { _all: true } }),
      database.order.aggregate({
        where: { status: { in: activeOrderStatuses } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      database.order.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          customerName: true,
          total: true,
          currency: true,
          createdAt: true,
        },
      }),
      database.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      database.product.count({ where: { active: true } }),
    ]);

    const counts = Object.fromEntries(Object.values(OrderStatus).map((status) => [status, 0]));
    for (const group of statusGroups) counts[group.status] = group._count._all;

    return Response.json({
      counts,
      totalOrders: statusGroups.reduce((sum, group) => sum + group._count._all, 0),
      activeRevenue: Number(revenue._sum.total ?? 0),
      activeOrderCount: revenue._count._all,
      activeProducts: products,
      recentOrders: recentOrders.map((order) => ({ ...order, total: Number(order.total) })),
      auditLog,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load admin overview", error);
    return adminError("INTERNAL_ERROR", "Не удалось загрузить сводку.", 500);
  }
}
