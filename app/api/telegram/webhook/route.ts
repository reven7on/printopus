import { handleTelegramCallbackQuery, type TelegramCallbackQuery } from "../../../../lib/telegram-callback-handler";

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
      callback_query?: TelegramCallbackQuery;
    };

    if (update.callback_query) {
      await handleTelegramCallbackQuery(update.callback_query);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Webhook Error]", error);
    return Response.json({ ok: true });
  }
}
