import "dotenv/config";
import { database } from "../lib/db.ts";
import { deliverNextTelegramNotification } from "../lib/telegram-delivery.ts";

const IDLE_DELAY_MS = 5_000;
let stopping = false;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { stopping = true; });
}

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_ADMIN_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID are required");
  }

  console.info("Telegram delivery worker started.");
  while (!stopping) {
    try {
      const processed = await deliverNextTelegramNotification();
      if (!processed) await wait(IDLE_DELAY_MS);
    } catch (error) {
      // A temporary database/network failure must not kill the daemon and turn
      // recovery into a dependency on Docker's restart policy.
      console.error("Telegram delivery loop failed; retrying:", error);
      await wait(IDLE_DELAY_MS);
    }
  }
}

run()
  .catch((error) => {
    console.error("Telegram delivery worker stopped:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.$disconnect();
  });
