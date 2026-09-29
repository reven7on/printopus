import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Render Blueprint wires the web service to PostgreSQL without committed secrets", async () => {
  const blueprint = await readFile(new URL("../render.yaml", import.meta.url), "utf8");

  assert.match(blueprint, /runtime: docker/);
  assert.match(blueprint, /dockerfilePath: \.\/Dockerfile\.render/);
  assert.match(blueprint, /healthCheckPath: \/api\/health/);
  assert.match(blueprint, /fromDatabase:[\s\S]*name: printopus-test-database/);
  assert.match(blueprint, /envVarKey: RENDER_EXTERNAL_URL/);
  assert.match(blueprint, /TELEGRAM_BOT_TOKEN[\s\S]*sync: false/);
  assert.match(blueprint, /TELEGRAM_WEBHOOK_SECRET[\s\S]*sync: false/);
  assert.doesNotMatch(blueprint, /replace-with|change-me-locally|bot\d+:/i);
});

test("Render runtime starts migrations, the app and the Telegram delivery worker", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile.render", import.meta.url), "utf8");
  const startScriptPath = new URL("../scripts/render-start.sh", import.meta.url);
  const startScript = await readFile(startScriptPath, "utf8");

  assert.match(dockerfile, /CMD \["sh", "scripts\/render-start\.sh"\]/);
  assert.match(dockerfile, /app\/pricing\.ts app\/site-config\.ts/);
  assert.match(startScript, /prisma migrate deploy/);
  assert.match(startScript, /tsx prisma\/bootstrap\.ts/);
  assert.match(startScript, /configure-telegram-webhook\.mjs/);
  assert.match(startScript, /node server\.js/);
  assert.match(startScript, /telegram-delivery-worker\.ts/);
});
