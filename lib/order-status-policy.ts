import { OrderStatus } from "../app/generated/prisma/enums.ts";

export const ORDER_WORKFLOW: readonly OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY,
  OrderStatus.COMPLETED,
];

export function isAllowedAdminOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  if (from === OrderStatus.CANCELLED) return to === OrderStatus.NEW;
  if (to === OrderStatus.CANCELLED) return true;

  const fromIndex = ORDER_WORKFLOW.indexOf(from);
  const toIndex = ORDER_WORKFLOW.indexOf(to);
  return fromIndex >= 0 && toIndex >= 0 && Math.abs(toIndex - fromIndex) === 1;
}

export function orderTransitionRequiresReason(from: OrderStatus, to: OrderStatus): boolean {
  if (to === OrderStatus.CANCELLED || from === OrderStatus.CANCELLED) return true;
  return ORDER_WORKFLOW.indexOf(to) < ORDER_WORKFLOW.indexOf(from);
}
