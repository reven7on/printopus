import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ContactMethod, FulfillmentMethod, OrderStatus, ProductOptionType } from "../app/generated/prisma/client.js";
import { generateServerMockupBuffer } from "../lib/server-mockup-generator.ts";
import { sendOrderNotificationToTelegram, sendTelegramDocument } from "../lib/telegram.ts";
import { writeStoredAsset, createStorageKey } from "../lib/local-file-storage.ts";
import { generateTransparentGraphicsPngBuffer, generateVectorGraphicsSvg } from "../lib/text-asset-generator.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function runScenario4_MultiViewOrder() {
  console.log("\n=======================================================");
  console.log("📌 СЦЕНАРИЙ 4: МНОГОСТОРОННИЙ ЗАКАЗ (Спереди + Спина + Рукав)");
  console.log("=======================================================");

  const logoPath = path.join(process.cwd(), "public", "test-octopus-logo.png");
  const logoBuffer = await readFile(logoPath);

  const product = await db.product.findFirst({
    where: { slug: "shirt", active: true },
    include: { options: true, printMethods: true },
  });
  if (!product) throw new Error("Product shirt not found.");

  const printMethod = await db.printMethod.findFirst({ where: { slug: "dtf", active: true } });
  const printFormat = await db.printFormat.findFirst({ where: { code: "A4", active: true } });
  if (!printMethod || !printFormat) throw new Error("Print method/format missing.");

  const colorOption = product.options.find((o) => o.type === ProductOptionType.COLOR && o.value === "black") ?? product.options[0];
  const sizeOption = product.options.find((o) => o.type === ProductOptionType.SIZE && o.value === "xl") ?? product.options[1];

  const orderNumber = `BY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-MULTI-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const assetId = randomUUID();
  const storageKey = createStorageKey(orderId, assetId, "png");

  await writeStoredAsset(storageKey, logoBuffer);

  const frontText = [{ content: "OCTOPUS CREW", fontFamily: "Montserrat", fontWeight: 800, color: "#ffffff" }];
  const backText = [{ content: "KING OF PRINT 2026", fontFamily: "Montserrat", fontWeight: 800, color: "#eab308" }];
  const backShapes = [{ content: "crown", color: "#eab308", x: 50, y: 35, width: 40 }];
  const sleeveShapes = [{ content: "flame", color: "#ef4444", x: 50, y: 50, width: 45 }];

  // Generate multi-view mockups
  const frontMockup = await generateServerMockupBuffer({
    productSlug: "shirt",
    colorLabelOrKey: colorOption.label,
    view: "front",
    artworkBuffer: logoBuffer,
    textElements: frontText,
  });

  const backMockup = await generateServerMockupBuffer({
    productSlug: "shirt",
    colorLabelOrKey: colorOption.label,
    view: "back",
    artworkBuffer: null,
    textElements: backText,
    shapeElements: backShapes,
  });

  const sleeveMockup = await generateServerMockupBuffer({
    productSlug: "shirt",
    colorLabelOrKey: colorOption.label,
    view: "sleeve_right",
    artworkBuffer: null,
    shapeElements: sleeveShapes,
  });

  const previewBuffers = [
    { name: "Спереди", buffer: frontMockup! },
    { name: "На спине", buffer: backMockup! },
    { name: "Правый рукав", buffer: sleeveMockup! },
  ];

  const order = await db.order.create({
    data: {
      id: orderId,
      orderNumber,
      customerName: "Дмитрий (Заказ с 3 сторон: Спереди, Спина, Рукав)",
      customerPhone: "+375 (29) 999-00-11",
      contactMethod: ContactMethod.TELEGRAM,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      deliveryAddress: "г. Минск, пр. Независимости 100",
      comment: "Многостороннее нанесение: спереди осьминог, на спине корона, на рукаве огонь!",
      subtotal: 75.0,
      discountPercent: 10.0,
      total: 67.5,
      status: OrderStatus.NEW,
      items: {
        create: {
          id: orderItemId,
          productId: product.id,
          printMethodId: printMethod.id,
          printFormatId: printFormat.id,
          productName: product.name,
          colorLabel: colorOption.label,
          sizeLabel: sizeOption.label,
          placement: "multi",
          quantity: 1,
          baseUnitPrice: 75.0,
          unitPrice: 67.5,
          total: 67.5,
          design: {
            front: [
              { type: "image", name: "octopus_logo.png", x: 50, y: 40, scale: 1, rotation: 0, width: 60 },
              { type: "text", content: "OCTOPUS CREW", fontFamily: "Montserrat", fontWeight: 800, color: "#ffffff", x: 50, y: 75, scale: 1, rotation: 0, width: 50 },
            ],
            back: [
              { type: "shape", content: "crown", color: "#eab308", x: 50, y: 35, scale: 1, rotation: 0, width: 40 },
              { type: "text", content: "KING OF PRINT 2026", fontFamily: "Montserrat", fontWeight: 800, color: "#eab308", x: 50, y: 70, scale: 1, rotation: 0, width: 55 },
            ],
            sleeve_right: [
              { type: "shape", content: "flame", color: "#ef4444", x: 50, y: 50, scale: 1, rotation: 0, width: 45 },
            ],
          },
          assets: {
            create: {
              id: assetId,
              originalName: "octopus_logo.png",
              storageKey,
              mimeType: "image/png",
              sizeBytes: logoBuffer.length,
            },
          },
        },
      },
    },
    select: { id: true, orderNumber: true, status: true, subtotal: true, discountPercent: true, total: true, items: { select: { assets: true } } },
  });

  console.log(`✅ [4/4] Сохранен многосторонний заказ в БД: ${order.orderNumber}`);

  await sendOrderNotificationToTelegram({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: "Дмитрий (Заказ с 3 сторон: Спереди, Спина, Рукав)",
    customerPhone: "+375 (29) 999-00-11",
    contactMethod: "telegram",
    fulfillmentMethod: "delivery",
    deliveryAddress: "г. Минск, пр. Независимости 100",
    comment: "Многостороннее нанесение: спереди осьминог, на спине корона, на рукаве огонь!",
    subtotal: 75.0,
    discountPercent: 10.0,
    total: 67.5,
    status: order.status,
    previewBuffers,
    items: [
      {
        productName: "Футболка Oversize",
        colorLabel: colorOption.label,
        sizeLabel: sizeOption.label,
        placement: "multi",
        quantity: 1,
        baseUnitPrice: 75.0,
        unitPrice: 67.5,
        total: 67.5,
        textElements: [...frontText, ...backText],
        shapeElements: [...backShapes, ...sleeveShapes],
        assets: order.items[0].assets,
      },
    ],
  });

  // Dispatch view-structured document attachments
  // 1_Спереди
  await sendTelegramDocument(logoBuffer, "1_Спереди_octopus_logo.png", `📁 [Спереди] Исходник картинки (octopus_logo.png) к заказу #${order.orderNumber}`);
  const frontPng = await generateTransparentGraphicsPngBuffer(frontText, []);
  if (frontPng) await sendTelegramDocument(frontPng, "1_Спереди_nadpis_300dpi.png", `📁 [Спереди] Исходник надписи (PNG 300 DPI) к заказу #${order.orderNumber}`);

  // 2_Спина
  const backPng = await generateTransparentGraphicsPngBuffer(backText, backShapes);
  if (backPng) await sendTelegramDocument(backPng, "2_Спина_graphics_300dpi.png", `📁 [На спине] Исходник надписи/короны (PNG 300 DPI) к заказу #${order.orderNumber}`);
  const backSvg = generateVectorGraphicsSvg(backText, backShapes);
  await sendTelegramDocument(Buffer.from(backSvg), "2_Спина_graphics_vector.svg", `📁 [На спине] Векторный файл надписи/короны (SVG) к заказу #${order.orderNumber}`);

  // 4_Правый_рукав
  const sleevePng = await generateTransparentGraphicsPngBuffer([], sleeveShapes);
  if (sleevePng) await sendTelegramDocument(sleevePng, "4_Правый_рукав_graphics_300dpi.png", `📁 [Правый рукав] Исходник огня (PNG 300 DPI) к заказу #${order.orderNumber}`);

  console.log(`✅ [4/4] Успешно отправлены превью со всех 3 сторон (Спереди, Спина, Рукав) и структурированные исходники!`);
}

async function main() {
  await runScenario4_MultiViewOrder();
  console.log("\n🎉 МНОГОСТОРОННИЙ ТЕСТОВЫЙ СЦЕНАРИЙ УСПЕШНО ВЫПОЛНЕН!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
