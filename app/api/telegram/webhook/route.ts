import { createHash, timingSafeEqual } from "node:crypto";
import { handleTelegramCallbackQuery, type TelegramCallbackQuery } from "../../../../lib/telegram-callback-handler";

export const runtime = "nodejs";

const MAX_UPDATE_BYTES = 64 * 1024;

function secretsMatch(received: string | null, expected: string): boolean {
  if (!received) return false;
  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[Telegram Webhook] TELEGRAM_WEBHOOK_SECRET is not configured.");
    return new Response("Webhook is not configured", { status: 503 });
  }
  if (!secretsMatch(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPDATE_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_UPDATE_BYTES) {
      return new Response("Payload too large", { status: 413 });
    }
    const update = JSON.parse(body) as { update_id?: number; callback_query?: TelegramCallbackQuery };

    if (update.callback_query) await handleTelegramCallbackQuery(update.callback_query);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Webhook] Update processing failed; requesting retry:", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
