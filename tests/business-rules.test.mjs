import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAutomaticPrintEstimate } from "../app/configurator/editor-math.ts";
import { isValidBelarusianPhone, normalizePhone } from "../app/order-validation.ts";
import {
  calculateOrderQuote,
  OrderInputError,
  parseCreateOrderInput,
} from "../lib/order-domain.ts";
import { createAdminSessionToken, readAdminSessionToken } from "../lib/admin-session.ts";
import { getQuantityDiscount, PRINT_FORMATS, PRODUCT_BASE_PRICES } from "../app/pricing.ts";

test("volume discount boundaries match the public offer", () => {
  const cases = [
    [1, 0],
    [19, 0],
    [20, 5],
    [49, 5],
    [50, 11],
    [99, 11],
    [100, 18],
    [199, 18],
    [200, 24],
    [1000, 24],
  ];

  for (const [quantity, expectedPercent] of cases) {
    assert.equal(getQuantityDiscount(quantity).percent, expectedPercent, `quantity ${quantity}`);
  }
});

test("the landing and configurator share the same A4 shirt price inputs", () => {
  const a4 = PRINT_FORMATS.find((format) => format.id === "A4");
  assert(a4);
  assert.equal(PRODUCT_BASE_PRICES.shirt, 15);
  assert.equal(PRODUCT_BASE_PRICES.shirt + 4 + a4.add, 26);
});

test("Belarusian phone validation accepts supported formats and rejects incomplete numbers", () => {
  assert.equal(normalizePhone("+375 (29) 555-20-30"), "375295552030");
  assert.equal(isValidBelarusianPhone("+375 (29) 555-20-30"), true);
  assert.equal(isValidBelarusianPhone("8 029 555-20-30"), true);
  assert.equal(isValidBelarusianPhone("+375 29 555"), false);
  assert.equal(isValidBelarusianPhone("+7 999 555-20-30"), false);
});

test("editor estimates print format from the actual artwork dimensions", () => {
  const zones = { shirt: { front: { width: 33, height: 40 } } };
  const empty = getAutomaticPrintEstimate({ front: [] }, "shirt", zones, PRINT_FORMATS);
  assert.equal(empty.isFallback, true);
  assert.equal(empty.size.id, "A4");

  const smallLogo = getAutomaticPrintEstimate({
    front: [{ type: "image", content: "logo", x: 50, y: 50, scale: 1, rotation: 0, width: 20, aspectRatio: 1 }],
  }, "shirt", zones, PRINT_FORMATS);
  assert.equal(smallLogo.isFallback, false);
  assert.equal(smallLogo.size.id, "A7");

  const largeArtwork = getAutomaticPrintEstimate({
    front: [{ type: "shape", content: "square", x: 50, y: 50, scale: 1, rotation: 0, width: 90 }],
  }, "shirt", zones, PRINT_FORMATS);
  assert.equal(largeArtwork.size.id, "A3");
});

test("responsive contracts cover landing navigation and configurator controls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const configurator = await readFile(new URL("../app/configurator/page.tsx", import.meta.url), "utf8");

  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /\.mobile-drawer\.open/);
  assert.match(css, /\.designer-mobile-navigation/);
  assert.match(configurator, /aria-label="Вернуться на предыдущий шаг"/);
  assert.match(configurator, /inputMode="tel"/);
});

test("order input is normalized and rejects incomplete delivery data", () => {
  const input = parseCreateOrderInput({
    customerName: "  Анна  ",
    customerPhone: "8 (029) 555-20-30",
    contactMethod: "telegram",
    fulfillmentMethod: "pickup",
    productSlug: "shirt",
    color: "white",
    size: "M",
    printMethodSlug: "dtf",
    printFormatCode: "a4",
    placement: "center",
    quantity: 20,
    design: { front: [] },
  });

  assert.equal(input.customerName, "Анна");
  assert.equal(input.customerPhone, "375295552030");
  assert.equal(input.size, "m");
  assert.equal(input.printFormatCode, "A4");

  assert.throws(
    () => parseCreateOrderInput({ ...input, fulfillmentMethod: "delivery", deliveryAddress: "" }),
    (error) => error instanceof OrderInputError && error.field === "deliveryAddress",
  );
});

test("server quote calculation uses authoritative prices and quantity discount", () => {
  assert.deepEqual(calculateOrderQuote({
    productPrice: 15,
    colorPrice: 0,
    printMethodPrice: 4,
    printFormatPrice: 7,
    quantity: 20,
    discountPercent: 5,
  }), {
    baseUnitPrice: 26,
    unitPrice: 24.7,
    subtotal: 520,
    discountPercent: 5,
    total: 494,
  });
});

test("admin session tokens are signed and expire", () => {
  const secret = "a-secure-test-secret-with-more-than-32-characters";
  const now = Date.UTC(2026, 7, 25, 10, 0, 0);
  const token = createAdminSessionToken("manager", secret, now);

  assert.equal(readAdminSessionToken(token, secret, now + 60_000)?.username, "manager");
  assert.equal(readAdminSessionToken(`${token}changed`, secret, now), null);
  assert.equal(readAdminSessionToken(token, secret, now + 9 * 60 * 60_000), null);
});
