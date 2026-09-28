const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is required to enable local polling.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ drop_pending_updates: false }),
});
const result = await response.json().catch(() => null);
if (!response.ok || !result?.ok) {
  console.error("Telegram rejected webhook removal:", result?.description ?? `HTTP ${response.status}`);
  process.exit(1);
}

console.info("Telegram webhook disabled; local polling can start.");
