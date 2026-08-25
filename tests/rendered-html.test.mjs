import assert from "node:assert/strict";
import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
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
  const uploadRoot = await mkdtemp(path.join(tmpdir(), "printopus-uploads-"));
  const nextBin = path.join(projectRoot, "node_modules/next/dist/bin/next");
  let output = "";
  const server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "production", UPLOAD_DIR: uploadRoot },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  const processExited = new Promise((resolve) => server.once("exit", () => resolve("exited")));
  let createdOrderId = null;
  let catalogProductId = null;
  let createdDiscountId = null;

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(baseUrl, processExited);

    const healthResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { status: "ok" });

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
    assert.match(robots, /Disallow: \/admin\//);
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

    const protectedPageResponse = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
    assert.equal(protectedPageResponse.status, 307);
    assert.equal(protectedPageResponse.headers.get("location"), "/admin/login");

    const unauthorizedOverview = await fetch(`${baseUrl}/api/admin/overview`);
    assert.equal(unauthorizedOverview.status, 401);

    const rejectedLogin = await fetch(`${baseUrl}/api/admin/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }),
    });
    assert.equal(rejectedLogin.status, 403);

    const invalidOrderResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "А", customerPhone: "123" }),
    });
    assert.equal(invalidOrderResponse.status, 400);

    const validOrderPayload = {
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
    };

    const disguisedVideo = new FormData();
    disguisedVideo.append("order", JSON.stringify({ ...validOrderPayload, customerName: "Опасный файл" }));
    disguisedVideo.append("files", new File([Buffer.from("000000186674797069736f6d00000200", "hex")], "logo.png", { type: "image/png" }));
    const rejectedVideoResponse = await fetch(`${baseUrl}/api/orders`, { method: "POST", body: disguisedVideo });
    assert.equal(rejectedVideoResponse.status, 415);
    assert.match((await rejectedVideoResponse.json()).error.message, /PNG, JPEG и WebP|отклонены/i);

    const svgUpload = new FormData();
    svgUpload.append("order", JSON.stringify({ ...validOrderPayload, customerName: "SVG файл" }));
    svgUpload.append("files", new File(["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"], "logo.svg", { type: "image/svg+xml" }));
    const rejectedSvgResponse = await fetch(`${baseUrl}/api/orders`, { method: "POST", body: svgUpload });
    assert.equal(rejectedSvgResponse.status, 415);

    const validImage = await readFile(path.join(projectRoot, "public/product-shirt.webp"));
    const multipartOrder = new FormData();
    multipartOrder.append("order", JSON.stringify(validOrderPayload));
    multipartOrder.append("files", new File([validImage], "shirt-design.webp", { type: "image/webp" }));
    const orderResponse = await fetch(`${baseUrl}/api/orders`, {
      method: "POST",
      body: multipartOrder,
    });
    assert.equal(orderResponse.status, 201);
    const createdOrder = await orderResponse.json();
    createdOrderId = createdOrder.order.id;
    assert.match(createdOrder.order.orderNumber, /^BY-\d{8}-[A-F0-9]{6}$/);
    assert.equal(createdOrder.order.discountPercent, 5);
    assert.equal(createdOrder.order.total, 494);
    assert.equal(createdOrder.order.assetCount, 1);

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

    const loginResponse = await fetch(`${baseUrl}/api/admin/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD }),
    });
    assert.equal(loginResponse.status, 200);
    const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
    assert(sessionCookie?.startsWith("printopus_admin_session="));

    const adminPageResponse = await fetch(`${baseUrl}/admin`, { headers: { cookie: sessionCookie } });
    assert.equal(adminPageResponse.status, 200);
    assert.match(await adminPageResponse.text(), /Панель управления|Загружаем рабочее пространство/i);

    const adminOverviewResponse = await fetch(`${baseUrl}/api/admin/overview`, { headers: { cookie: sessionCookie } });
    assert.equal(adminOverviewResponse.status, 200);

    const adminCatalogResponse = await fetch(`${baseUrl}/api/admin/catalog`, { headers: { cookie: sessionCookie } });
    assert.equal(adminCatalogResponse.status, 200);
    const adminCatalog = await adminCatalogResponse.json();
    const adminShirt = adminCatalog.products.find((product) => product.slug === "shirt");
    assert(adminShirt);
    catalogProductId = adminShirt.id;

    const rejectedCatalogUpdate = await fetch(`${baseUrl}/api/admin/catalog`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({ resource: "product", id: adminShirt.id, changes: { basePrice: adminShirt.basePrice } }),
    });
    assert.equal(rejectedCatalogUpdate.status, 403);

    const catalogUpdate = await fetch(`${baseUrl}/api/admin/catalog`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: sessionCookie, origin: baseUrl },
      body: JSON.stringify({ resource: "product", id: adminShirt.id, changes: { basePrice: adminShirt.basePrice } }),
    });
    assert.equal(catalogUpdate.status, 200);

    const discountResponse = await fetch(`${baseUrl}/api/admin/catalog`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie, origin: baseUrl },
      body: JSON.stringify({ resource: "discount", data: { minQuantity: 777, percent: 3 } }),
    });
    assert.equal(discountResponse.status, 201);
    createdDiscountId = (await discountResponse.json()).item.id;

    const statusResponse = await fetch(`${baseUrl}/api/admin/orders/${createdOrderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: sessionCookie, origin: baseUrl },
      body: JSON.stringify({ status: "CONFIRMED", note: "Проверка истории статусов" }),
    });
    assert.equal(statusResponse.status, 200);

    const orderDetailsResponse = await fetch(`${baseUrl}/api/admin/orders/${createdOrderId}`, { headers: { cookie: sessionCookie } });
    assert.equal(orderDetailsResponse.status, 200);
    const orderDetails = await orderDetailsResponse.json();
    assert.equal(orderDetails.order.status, "CONFIRMED");
    assert.equal(orderDetails.order.statusHistory[0].note, "Проверка истории статусов");
    const storedAsset = orderDetails.order.items[0].assets[0];
    assert(storedAsset);
    assert.equal(storedAsset.mimeType, "image/webp");
    assert(storedAsset.width > 0 && storedAsset.height > 0);

    const unauthorizedAssetResponse = await fetch(`${baseUrl}/api/admin/assets/${storedAsset.id}`);
    assert.equal(unauthorizedAssetResponse.status, 401);
    const assetResponse = await fetch(`${baseUrl}/api/admin/assets/${storedAsset.id}`, { headers: { cookie: sessionCookie } });
    assert.equal(assetResponse.status, 200);
    assert.equal(assetResponse.headers.get("content-type"), "image/webp");
    assert.equal(assetResponse.headers.get("x-content-type-options"), "nosniff");
    assert.match(assetResponse.headers.get("content-disposition") ?? "", /^attachment;/);
    assert((await assetResponse.arrayBuffer()).byteLength > 1_000);
  } catch (error) {
    error.message += `\nNext.js output:\n${output}`;
    throw error;
  } finally {
    if (createdOrderId && process.env.DATABASE_URL) {
      const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await database.connect();
      try {
        await database.query('DELETE FROM admin_audit_log WHERE "entityId" = $1', [createdOrderId]);
        if (catalogProductId) await database.query('DELETE FROM admin_audit_log WHERE "entityId" = $1', [catalogProductId]);
        if (createdDiscountId) {
          await database.query('DELETE FROM admin_audit_log WHERE "entityId" = $1', [createdDiscountId]);
          await database.query("DELETE FROM volume_discounts WHERE id = $1", [createdDiscountId]);
        }
        await database.query("DELETE FROM orders WHERE id = $1", [createdOrderId]);
      } finally {
        await database.end();
      }
    }
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await processExited;
    }
    await rm(uploadRoot, { recursive: true, force: true });
  }
});
