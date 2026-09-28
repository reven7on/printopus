import "dotenv/config";
import { handleTelegramCallbackQuery, type TelegramCallbackQuery } from "../lib/telegram-callback-handler.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set.");
  process.exit(1);
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  parameters?: { retry_after?: number };
}

let offset = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function telegramGet<T>(method: string, query = ""): Promise<TelegramResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}${query}`, { signal: controller.signal });
    return await response.json() as TelegramResponse<T>;
  } finally {
    clearTimeout(timer);
  }
}

async function assertWebhookDisabled() {
  const info = await telegramGet<{ url: string }>("getWebhookInfo");
  if (!info.ok) throw new Error(info.description ?? "Could not read webhook status");
  if (info.result?.url) {
    throw new Error(`Webhook is active at ${info.result.url}. Polling and webhooks cannot run together.`);
  }
}

async function pollUpdates() {
  await assertWebhookDisabled();
  console.info("Telegram polling daemon started. Use it only for local development without a webhook.");

  while (true) {
    try {
      const query = `?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent('["callback_query"]')}`;
      const data = await telegramGet<Array<{ update_id: number; callback_query?: TelegramCallbackQuery }>>("getUpdates", query);
      if (!data.ok) {
        console.warn("[Telegram Daemon] getUpdates failed:", data.description ?? "unknown error");
        await wait(Math.max(2, data.parameters?.retry_after ?? 0) * 1_000);
        continue;
      }

      for (const update of data.result ?? []) {
        if (update.callback_query) await handleTelegramCallbackQuery(update.callback_query);
        // An update is confirmed only after its handler completed successfully.
        offset = Math.max(offset, update.update_id + 1);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Webhook is active")) throw error;
      console.warn("[Telegram Daemon] Polling will retry:", errorMessage(error));
      await wait(2_000);
    }
  }
}

pollUpdates().catch((error: unknown) => {
  console.error("[Telegram Daemon] Fatal error:", errorMessage(error));
  process.exitCode = 1;
});
