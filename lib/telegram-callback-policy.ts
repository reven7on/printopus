import { OrderStatus } from "../app/generated/prisma/enums.ts";

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: {
    message_id: number;
    chat: { id: number | string };
  };
  from: { id: number; first_name: string; username?: string };
}

export interface ParsedStatusCallback {
  orderId: string;
  targetStatus: OrderStatus;
}

const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, readonly OrderStatus[]>> = {
  NEW: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
};

export function parseStatusCallbackData(data: string | undefined): ParsedStatusCallback | null {
  if (!data) return null;
  const match = /^st:([A-Z_]+):([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(data);
  if (!match) return null;
  const targetStatus = match[1].toUpperCase() as OrderStatus;
  if (!Object.values(OrderStatus).includes(targetStatus)) return null;
  return { targetStatus, orderId: match[2] };
}

export function isAllowedTelegramTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isAuthorizedTelegramCallback(
  query: TelegramCallbackQuery,
  adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID,
  managerUserIds = process.env.TELEGRAM_MANAGER_USER_IDS,
): boolean {
  if (!query.from || !Number.isSafeInteger(query.from.id)) return false;
  if (!query.message || !adminChatId || String(query.message.chat.id) !== adminChatId.trim()) return false;
  const allowedManagers = managerUserIds
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  if (allowedManagers.length > 0) return allowedManagers.includes(String(query.from.id));

  // In a private chat, the chat ID and sender ID are the same. Group chats use
  // a negative chat ID, so an explicit allowlist is required there.
  return String(query.from.id) === adminChatId.trim();
}
