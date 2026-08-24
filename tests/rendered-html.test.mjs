import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
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
  } catch (error) {
    error.message += `\nNext.js output:\n${output}`;
    throw error;
  } finally {
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await processExited;
    }
  }
});
