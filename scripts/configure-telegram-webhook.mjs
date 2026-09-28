const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
const siteUrl = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL)?.trim().replace(/\/$/, "");

if (!token || !secret || !siteUrl) {
  console.error("TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and SITE_URL are required.");
  process.exit(1);
}
if (!/^https:\/\//i.test(siteUrl)) {
  console.error("SITE_URL must use HTTPS for a Telegram webhook.");
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) {
  console.error("TELEGRAM_WEBHOOK_SECRET must contain 16-256 letters, digits, underscores or hyphens.");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${siteUrl}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["callback_query"],
    drop_pending_updates: false,
  }),
});
const result = await response.json().catch(() => null);
if (!response.ok || !result?.ok) {
  console.error("Telegram rejected webhook configuration:", result?.description ?? `HTTP ${response.status}`);
  process.exit(1);
}

const verificationResponse = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
const verification = await verificationResponse.json().catch(() => null);
const expectedUrl = `${siteUrl}/api/telegram/webhook`;
if (!verificationResponse.ok || !verification?.ok || verification.result?.url !== expectedUrl) {
  console.error("Telegram webhook verification failed:", verification?.description ?? `expected ${expectedUrl}`);
  process.exit(1);
}
if (verification.result?.last_error_message) {
  console.warn("Telegram reports a previous webhook delivery error:", verification.result.last_error_message);
}
console.info(`Telegram webhook configured at ${siteUrl}/api/telegram/webhook`);
