import assert from "node:assert/strict";
import "dotenv/config";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitForServer(url, processExited) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const winner = await Promise.race([
      fetch(url).then(() => "ready").catch(() => "retry"),
      processExited,
      new Promise((resolve) => setTimeout(() => resolve("retry"), 100)),
    ]);
    if (winner === "ready") return;
    if (winner === "exited") throw new Error("Next.js server exited before becoming ready");
  }
  throw new Error("Next.js server did not become ready within 20 seconds");
}

test("renders the Printopus pages with the production Next.js server", { timeout: 30_000 }, async () => {
  const port = await reservePort();
  const nextBin = path.join(projectRoot, "node_modules/next/dist/bin/next");
  let output = "";
  const server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  const processExited = new Promise((resolve) => server.once("exit", () => resolve("exited")));
  let createdOrderId = null;

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl, processExited);

    for (const [route, expectedText] of [
      ["/", /Принтопус|ПРИНТОПУС/i],
      ["/configurator", /Выберите изделие/i],
    ]) {
      const response = await fetch(`${baseUrl}${route}`, { headers: { accept: "text/html" } });
      assert.equal(response.status, 200, `${route} should return 200`);
      assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
      const html = await response.text();
      const visibleText = html.replace(/<[^>]*>/g, "");
      assert.match(html, expectedText);
      assert.doesNotMatch(html, /codex-preview/i);
      assert.match(html, /rel="canonical"/i);
      assert.match(html, /property="og:image"/i);
      assert.match(html, /name="twitter:card" content="summary_large_image"/i);

      if (route === "/") {
        assert.match(html, /href="https:\/\/printservice\.by\/?"/i);
        assert.match(visibleText, /от 20 штук/i);
        assert.match(visibleText, /до -24%/i);
        assert.match(visibleText, /Instagram \(@printservice_by\)/i);
        assert.doesNotMatch(visibleText, /Instagram \(@printservice\.by\)/i);
      } else {
        assert.match(html, /href="https:\/\/printservice\.by\/configurator"/i);
        assert.match(visibleText, /Далее: Выбор цвета/i);
        assert.match(visibleText, /от 15 BYN/i);
      }
    }

    const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
    assert.equal(robotsResponse.status, 200);
    const robots = await robotsResponse.text();
    assert.match(robots, /Allow: \//);
    assert.match(robots, /Sitemap: https:\/\/printservice\.by\/sitemap\.xml/);

    const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200);
    const sitemap = await sitemapResponse.text();
    assert.match(sitemap, /https:\/\/printservice\.by<\/loc>/);
    assert.match(sitemap, /https:\/\/printservice\.by\/configurator<\/loc>/);

    const socialImageResponse = await fetch(`${baseUrl}/og.png`);
    assert.equal(socialImageResponse.status, 200);
    assert.match(socialImageResponse.headers.get("content-type") ?? "", /^image\/png\b/i);
    assert(Number(socialImageResponse.headers.get("content-length")) > 100_000);

    const catalogResponse = await fetch(`${baseUrl}/api/catalog`);
    assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json();
    assert.equal(catalog.currency, "BYN");
    assert.equal(catalog.products.find((product) => product.slug === "shirt")?.basePrice, 15);
    assert.deepEqual(catalog.volumeDiscounts.map((discount) => discount.minQuantity), [20, 50, 100, 200]);

    const invalidOrderResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "А", customerPhone: "123" }),
    });
    assert.equal(invalidOrderResponse.status, 400);

    const orderResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Проверка API",
        customerPhone: "+375 (29) 555-20-30",
        contactMethod: "phone",
        fulfillmentMethod: "pickup",
        comment: "Автоматический тест",
        productSlug: "shirt",
        color: "white",
        size: "M",
        printMethodSlug: "dtf",
        printFormatCode: "A4",
        placement: "center",
        quantity: 20,
        design: { front: [] },
        total: 1,
      }),
    });
    assert.equal(orderResponse.status, 201);
    const createdOrder = await orderResponse.json();
    createdOrderId = createdOrder.order.id;
    assert.match(createdOrder.order.orderNumber, /^BY-\d{8}-[A-F0-9]{6}$/);
    assert.equal(createdOrder.order.discountPercent, 5);
    assert.equal(createdOrder.order.total, 494);

    const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await database.connect();
    try {
      const persisted = await database.query(
        'SELECT o.total, i.quantity, i."unitPrice" FROM orders o JOIN order_items i ON i."orderId" = o.id WHERE o.id = $1',
        [createdOrderId],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(Number(persisted.rows[0].total), 494);
      assert.equal(persisted.rows[0].quantity, 20);
      assert.equal(Number(persisted.rows[0].unitPrice), 24.7);
    } finally {
      await database.end();
    }
  } catch (error) {
    error.message += `\nNext.js output:\n${output}`;
    throw error;
  } finally {
    if (createdOrderId && process.env.DATABASE_URL) {
      const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await database.connect();
      try {
        await database.query("DELETE FROM orders WHERE id = $1", [createdOrderId]);
      } finally {
        await database.end();
      }
    }
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await processExited;
    }
  }
});
