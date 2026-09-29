import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getAutomaticPrintEstimate } from "../app/configurator/editor-math.ts";
import { formatBelarusianPhone, formatBelarusianPhoneInput, getPhoneHref, isValidBelarusianPhone, normalizeBelarusianPhone, normalizePhone } from "../app/order-validation.ts";
import {
  calculateOrderQuote,
  OrderInputError,
  parseCreateOrderInput,
} from "../lib/order-domain.ts";
import { createAdminSessionToken, readAdminSessionToken } from "../lib/admin-session.ts";
import { RateLimiter } from "../lib/rate-limiter.ts";
import { GARMENT_COLOR_PRICES, getQuantityDiscount, PRINT_FORMATS, PRODUCT_BASE_PRICES } from "../app/pricing.ts";

test("rate limiter enforces maximum requests per window", () => {
  const limiter = new RateLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(limiter.check("ip-123", 1000).allowed, true);
  assert.equal(limiter.check("ip-123", 2000).allowed, true);
  assert.equal(limiter.check("ip-123", 3000).allowed, true);
  assert.equal(limiter.check("ip-123", 4000).allowed, false);

  assert.equal(limiter.check("ip-456", 4000).allowed, true);
  assert.equal(limiter.check("ip-123", 62000).allowed, true);
});

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

test("color and size choices never add a surcharge", () => {
  assert.deepEqual(new Set(Object.values(GARMENT_COLOR_PRICES)), new Set([0]));
});

test("Belarusian phone validation accepts supported formats and rejects incomplete numbers", () => {
  assert.equal(normalizePhone("+375 (29) 555-20-30"), "375295552030");
  assert.equal(isValidBelarusianPhone("+375 (29) 555-20-30"), true);
  assert.equal(isValidBelarusianPhone("8 029 555-20-30"), true);
  assert.equal(isValidBelarusianPhone("+375 29 555"), false);
  assert.equal(isValidBelarusianPhone("+7 999 555-20-30"), false);
});

test("legacy Belarusian phone formats share one display and dialing value", () => {
  for (const phone of ["375295552030", "+375295552030", "80 29 555-20-30", "++375 (29) 555-20-30"]) {
    assert.equal(normalizeBelarusianPhone(phone), "375295552030");
    assert.equal(formatBelarusianPhone(phone), "+375 (29) 555-20-30");
    assert.equal(getPhoneHref(phone), "tel:+375295552030");
  }
});

test("phone input formats partial typing and pasted Belarusian numbers", () => {
  assert.equal(formatBelarusianPhoneInput("2"), "+375 (2");
  assert.equal(formatBelarusianPhoneInput("29"), "+375 (29)");
  assert.equal(formatBelarusianPhoneInput("296548290"), "+375 (29) 654-82-90");
  assert.equal(formatBelarusianPhoneInput("+3753365289"), "+375 (33) 652-89");
  assert.equal(formatBelarusianPhoneInput("80 29 654-82-90"), "+375 (29) 654-82-90");
  assert.equal(formatBelarusianPhoneInput("+375 (29) 654-82-90 123"), "+375 (29) 654-82-90");
  assert.equal(formatBelarusianPhoneInput(""), "");
});

test("editor estimates print format from the actual artwork dimensions", () => {
  const zones = { shirt: { front: { width: 33, height: 40 } } };
  const empty = getAutomaticPrintEstimate({ front: [] }, "shirt", zones, PRINT_FORMATS);
  assert.equal(empty.isFallback, true);
  assert.equal(empty.size.id, "A4");

  const compactFallback = getAutomaticPrintEstimate({ front: [] }, "cap", zones, PRINT_FORMATS.slice(0, 2));
  assert.equal(compactFallback.isFallback, true);
  assert.equal(compactFallback.size.id, "A6");

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

test("configurator distinguishes a ready empty catalog from loading fallback data", async () => {
  const configurator = await readFile(new URL("../app/configurator/configurator-client.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/configurator/page.tsx", import.meta.url), "utf8");
  const catalogHook = await readFile(new URL("../app/use-public-catalog.ts", import.meta.url), "utf8");

  assert.match(catalogHook, /status:\s*"ready"/);
  assert.match(catalogHook, /status:\s*"error"/);
  assert.match(configurator, /selectedCatalogItem\?\.printMethods/);
  assert.match(configurator, /const availablePrintSizes = selectedMethod\?\.formats/);
  assert.match(configurator, /const discount = catalogReady/);
  assert.match(configurator, /usePublicCatalog\(initialCatalog\)/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.doesNotMatch(configurator, /printFormats\.length\s*>=\s*4/);
});

test("landing does not restore inactive catalog items or a fallback DTF price", async () => {
  const landing = await readFile(new URL("../app/home-client.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(landing, /useState<number \| null>\(null\)/);
  assert.match(landing, /const catalogReady = publicCatalogStatus === "ready"/);
  assert.match(landing, /const visibleProducts = catalogReady/);
  assert.match(landing, /fallbackBasePrices\.flatMap/);
  assert.match(landing, /selectedCatalogPriceProduct\?\.printMethods\.find\(\(method\) => method\.slug === "dtf"\)/);
  assert.match(landing, /catalogLoading \? fallbackPrintPrices : \[\]/);
  assert.match(landing, /usePublicCatalog\(initialCatalog\)/);
  assert.match(page, /loadPublicCatalogOrNull/);
  assert.doesNotMatch(landing, /priceDelta \?\? DEFAULT_PRINT_METHOD_PRICE/);
});

test("draft images are reconstructed and missing files cannot be submitted", async () => {
  const configurator = await readFile(new URL("../app/configurator/configurator-client.tsx", import.meta.url), "utf8");
  const orderRoute = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");

  assert.match(configurator, /function restoreDraftImageFile/);
  assert.match(configurator, /pendingUploadsRef\.current\.set\(element\.uploadId, restoredFile\)/);
  assert.match(configurator, /fileEntries\.length !== activeUploadIds\.length/);
  assert.match(orderRoute, /effectiveFileUploadIds\.length !== designUploadIds\.size/);
});

test("production image installs fonts used by server-side print rendering", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /fontconfig/);
  assert.match(dockerfile, /font-noto/);
  assert.match(dockerfile, /font-liberation-sans-narrow/);
  assert.match(dockerfile, /font-urw-base35/);
});

test("admin catalog uses immediate switches and one contextual save action", async () => {
  const admin = await readFile(new URL("../app/admin/(protected)/admin-app.tsx", import.meta.url), "utf8");

  assert.match(admin, /function ProductOptionsEditor/);
  assert.match(admin, /function ProductPrintEditor/);
  assert.match(admin, /productPrintMethod/);
  assert.match(admin, /productPrintFormat/);
  assert.match(admin, /renderGroup\("COLOR", "Цвета"/);
  assert.match(admin, /renderGroup\("SIZE", "Размеры"/);
  assert.match(admin, /Переключатели применяются сразу/);
  assert.match(admin, /admin-context-savebar/);
  assert.match(admin, /saveCatalogChanges/);
  assert.match(admin, /saveCatalogStatus/);
  assert.match(admin, /body: JSON\.stringify\(\{ updates \}\)/);
  assert.match(admin, /offerCatalogUndo/);
  assert.match(admin, /recommendedFromQuantity/);
  assert.match(admin, /function CatalogDeleteButton/);
  assert.match(admin, /method: "DELETE"/);
  assert.doesNotMatch(admin, /Сохранить поля/);
  assert.doesNotMatch(admin, /Название для клиента/);
  assert.doesNotMatch(admin, /saveCatalogItem/);
  assert.doesNotMatch(admin, /className="admin-options-grid"/);
});

test("catalog recommendations and landing promises come from the public catalog", async () => {
  const landing = await readFile(new URL("../app/home-client.tsx", import.meta.url), "utf8");
  const configurator = await readFile(new URL("../app/configurator/configurator-client.tsx", import.meta.url), "utf8");
  const catalogRoute = await readFile(new URL("../app/api/admin/catalog/route.ts", import.meta.url), "utf8");

  assert.match(landing, /slug: "polo"/);
  assert.match(landing, /availableSizeLabels/);
  assert.match(landing, /recommendedFromQuantity/);
  assert.match(landing, /useState\(""\)/);
  assert.match(configurator, /entry\.recommendedFromQuantity/);
  assert.match(configurator, /dtfIsAvailable/);
  assert.match(catalogRoute, /body\.updates\.length > 100/);
  assert.match(catalogRoute, /uniqueTargets\.size !== updates\.length/);
  assert.match(catalogRoute, /database\.\$transaction/);
});

test("responsive contracts cover landing navigation and configurator controls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const configurator = await readFile(new URL("../app/configurator/configurator-client.tsx", import.meta.url), "utf8");

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

test("order size distribution is normalized and must exactly match the print run", () => {
  const baseOrder = {
    customerName: "Анна",
    customerPhone: "+375 (29) 555-20-30",
    contactMethod: "phone",
    fulfillmentMethod: "pickup",
    productSlug: "shirt",
    color: "white",
    size: "m",
    printMethodSlug: "dtf",
    printFormatCode: "A4",
    placement: "center",
    quantity: 20,
    design: { front: [] },
  };

  const parsed = parseCreateOrderInput({
    ...baseOrder,
    sizeDistribution: [{ size: "S", quantity: 5 }, { size: "M", quantity: 15 }],
  });
  assert.deepEqual(parsed.sizeDistribution, [{ size: "s", quantity: 5 }, { size: "m", quantity: 15 }]);

  for (const sizeDistribution of [
    [{ size: "M", quantity: 10 }, { size: "m", quantity: 10 }],
    [{ size: "M", quantity: 0 }, { size: "L", quantity: 20 }],
    [{ size: "M", quantity: 19 }],
  ]) {
    assert.throws(
      () => parseCreateOrderInput({ ...baseOrder, sizeDistribution }),
      (error) => error instanceof OrderInputError && error.field === "sizeDistribution",
    );
  }
});

test("order design is normalized and rejects markup injection", () => {
  const baseOrder = {
    customerName: "Анна",
    customerPhone: "+375 (29) 555-20-30",
    contactMethod: "phone",
    fulfillmentMethod: "pickup",
    productSlug: "shirt",
    color: "white",
    size: "m",
    printMethodSlug: "dtf",
    printFormatCode: "A4",
    placement: "center",
    quantity: 20,
  };
  const element = {
    id: "shape-1",
    type: "shape",
    name: "Звезда",
    content: "star",
    color: "#AABBCC",
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0,
    width: 35,
  };

  const parsed = parseCreateOrderInput({ ...baseOrder, design: { front: [element] } });
  assert.equal(parsed.design.front[0].color, "#aabbcc");
  assert.equal(parsed.design.front[0].content, "star");

  assert.throws(
    () => parseCreateOrderInput({
      ...baseOrder,
      design: { front: [{ ...element, color: '\"><image href="x" onerror="alert(1)' }] },
    }),
    (error) => error instanceof OrderInputError && error.field === "design",
  );
  assert.throws(
    () => parseCreateOrderInput({ ...baseOrder, design: { profile: [element] } }),
    (error) => error instanceof OrderInputError && error.field === "design",
  );
});

test("admin order preview does not inject saved design markup into HTML", async () => {
  const orderDetail = await readFile(new URL("../app/admin/(protected)/orders/[id]/order-detail.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(orderDetail, /dangerouslySetInnerHTML/);
  assert.match(orderDetail, /safeDesignColor/);
  assert.match(orderDetail, /designElementId/);
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
