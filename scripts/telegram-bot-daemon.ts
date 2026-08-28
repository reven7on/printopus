import "dotenv/config";
import { handleTelegramCallbackQuery, type TelegramCallbackQuery } from "../lib/telegram-callback-handler.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN is not set in environment.");
  process.exit(1);
}

let offset = 0;

console.log("🤖 Telegram Bot Polling Daemon started (robust mode with socket timeouts)...");

async function pollUpdates() {
  while (true) {
    try {
      // 35s timeout prevents fetch from hanging indefinitely on stalled network sockets
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);

      const response = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=25`,
        { signal: controller.signal },
      ).finally(() => clearTimeout(timer));

      const data = (await response.json()) as {
        ok: boolean;
        result?: Array<{
          update_id: number;
          callback_query?: TelegramCallbackQuery;
        }>;
      };

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = Math.max(offset, update.update_id + 1);
          if (update.callback_query) {
            console.log(`📩 Received button click from @${update.callback_query.from.username ?? update.callback_query.from.first_name}`);
            // Run handler asynchronously so it never blocks the polling loop!
            handleTelegramCallbackQuery(update.callback_query).catch((err) => {
              console.error("[Telegram Daemon] Error handling callback query:", err);
            });
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.warn("[Telegram Daemon] Polling reconnecting after network delay...", err?.message ?? err);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

pollUpdates().catch((err) => {
  console.error("[Telegram Daemon Fatal Error]", err);
});
