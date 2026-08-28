import "dotenv/config";
import { handleTelegramCallbackQuery, type TelegramCallbackQuery } from "../lib/telegram-callback-handler.ts";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN is not set in environment.");
  process.exit(1);
}

let offset = 0;

console.log("🤖 Telegram Bot Polling Daemon started...");

async function pollUpdates() {
  while (true) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=30`);
      const data = (await response.json()) as {
        ok: boolean;
        result?: Array<{
          update_id: number;
          callback_query?: TelegramCallbackQuery;
        }>;
      };

      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.callback_query) {
            console.log(`📩 Received button click from @${update.callback_query.from.username ?? update.callback_query.from.first_name}`);
            await handleTelegramCallbackQuery(update.callback_query);
          }
        }
      }
    } catch (err) {
      console.warn("[Telegram Daemon] Error polling updates:", err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

pollUpdates().catch(console.error);
