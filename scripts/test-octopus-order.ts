import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ContactMethod, FulfillmentMethod, OrderStatus, ProductOptionType } from "../app/generated/prisma/client.js";
import { generateServerMockupBuffer } from "../lib/server-mockup-generator.ts";
import { sendOrderNotificationToTelegram, sendTelegramDocument } from "../lib/telegram.ts";
import { writeStoredAsset, createStorageKey } from "../lib/local-file-storage.ts";
import { generateTransparentTextPngBuffer, generateTextSvg } from "../lib/text-asset-generator.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function runScenario1_OnlyOctopusImage() {
  console.log("\n=======================================================");
  console.log("📌 СЦЕНАРИЙ 1: Заказ ТОЛЬКО с картинкой осьминога (Без текста)");
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
  const sizeOption = product.options.find((o) => o.type === ProductOptionType.SIZE && o.value === "l") ?? product.options[1];

  const orderNumber = `BY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-IMGONLY`;
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const assetId = randomUUID();
  const storageKey = createStorageKey(orderId, assetId, "png");

  await writeStoredAsset(storageKey, logoBuffer);

  const mockupBuffer = await generateServerMockupBuffer({
    productSlug: "shirt",
    colorLabelOrKey: colorOption.label,
    view: "front",
    artworkBuffer: logoBuffer,
  });

  const order = await db.order.create({
    data: {
      id: orderId,
      orderNumber,
      customerName: "Мария (Только картинка)",
      customerPhone: "+375 (29) 111-22-33",
      contactMethod: ContactMethod.TELEGRAM,
      fulfillmentMethod: FulfillmentMethod.PICKUP,
      comment: "Печать ТОЛЬКО логотипа с осьминогом!",
      subtotal: 35.0,
      discountPercent: 0.0,
      total: 35.0,
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
          placement: "center",
          quantity: 1,
          baseUnitPrice: 35.0,
          unitPrice: 35.0,
          total: 35.0,
          design: {
            front: [{ type: "image", name: "octopus_logo.png", x: 50, y: 50, scale: 1, rotation: 0, width: 70 }],
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

  console.log(`✅ [1/2] Сохранен заказ в БД: ${order.orderNumber}`);

  await sendOrderNotificationToTelegram({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: "Мария (Только картинка)",
    customerPhone: "+375 (29) 111-22-33",
    contactMethod: "telegram",
    fulfillmentMethod: "pickup",
    comment: "Печать ТОЛЬКО логотипа с осьминогом!",
    subtotal: 35.0,
    discountPercent: 0,
    total: 35.0,
    status: order.status,
    previewBuffers: [{ name: "Спереди по центру", buffer: mockupBuffer! }],
    items: [{ productName: "Футболка", colorLabel: colorOption.label, sizeLabel: sizeOption.label, placement: "center", quantity: 1, baseUnitPrice: 35.0, unitPrice: 35.0, total: 35.0, assets: order.items[0].assets }],
  });

  await sendTelegramDocument(logoBuffer, "Спереди_по_центру_octopus_logo.png", `📁 Исходник принта (Спереди по центру) к заказу #${order.orderNumber}`);
  console.log(`✅ [1/2] Успешно отправлены превью футболки и исходник картинки осьминога!`);
}

async function runScenario2_OnlyText() {
  console.log("\n=======================================================");
  console.log("📌 СЦЕНАРИЙ 2: Заказ ТОЛЬКО с текстом (Без загруженных фото)");
  console.log("=======================================================");

  const product = await db.product.findFirst({
    where: { slug: "shirt", active: true },
    include: { options: true, printMethods: true },
  });
  if (!product) throw new Error("Product shirt not found.");

  const printMethod = await db.printMethod.findFirst({ where: { slug: "dtf", active: true } });
  const printFormat = await db.printFormat.findFirst({ where: { code: "A4", active: true } });
  if (!printMethod || !printFormat) throw new Error("Print method/format missing.");

  const colorOption = product.options.find((o) => o.type === ProductOptionType.COLOR && o.value === "white") ?? product.options[0];
  const sizeOption = product.options.find((o) => o.type === ProductOptionType.SIZE && o.value === "m") ?? product.options[1];

  const orderNumber = `BY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-TEXTONLY`;
  const orderId = randomUUID();
  const orderItemId = randomUUID();

  const textSpecs = [{ content: "СДЕЛАНО В МИНСКЕ 2026", fontFamily: "Montserrat", fontWeight: 800, color: "#d71920" }];

  const mockupBuffer = await generateServerMockupBuffer({
    productSlug: "shirt",
    colorLabelOrKey: colorOption.label,
    view: "front",
    artworkBuffer: null,
  });

  const order = await db.order.create({
    data: {
      id: orderId,
      orderNumber,
      customerName: "Алексей (Только надпись)",
      customerPhone: "+375 (29) 444-55-66",
      contactMethod: ContactMethod.PHONE,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      deliveryAddress: "г. Минск, ул. Сурганова 12",
      comment: "Клиент заказал только надпись 'СДЕЛАНО В МИНСКЕ 2026'",
      subtotal: 30.0,
      discountPercent: 0.0,
      total: 30.0,
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
          placement: "center",
          quantity: 1,
          baseUnitPrice: 30.0,
          unitPrice: 30.0,
          total: 30.0,
          design: {
            front: [
              {
                type: "text",
                content: "СДЕЛАНО В МИНСКЕ 2026",
                fontFamily: "Montserrat",
                fontWeight: 800,
                color: "#d71920",
                x: 50,
                y: 50,
                scale: 1,
                rotation: 0,
                width: 60,
              },
            ],
          },
        },
      },
    },
    select: { id: true, orderNumber: true, status: true, subtotal: true, discountPercent: true, total: true },
  });

  console.log(`✅ [2/2] Сохранен заказ в БД: ${order.orderNumber}`);

  await sendOrderNotificationToTelegram({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: "Алексей (Только надпись)",
    customerPhone: "+375 (29) 444-55-66",
    contactMethod: "phone",
    fulfillmentMethod: "delivery",
    deliveryAddress: "г. Минск, ул. Сурганова 12",
    comment: "Клиент заказал только надпись 'СДЕЛАНО В МИНСКЕ 2026'",
    subtotal: 30.0,
    discountPercent: 0,
    total: 30.0,
    status: order.status,
    previewBuffers: [{ name: "Спереди по центру", buffer: mockupBuffer! }],
    items: [{ productName: "Футболка", colorLabel: colorOption.label, sizeLabel: sizeOption.label, placement: "center", quantity: 1, baseUnitPrice: 30.0, unitPrice: 30.0, total: 30.0, textElements: textSpecs, assets: [] }],
  });

  // Render transparent high-res PNG (300 DPI) for text
  const textPngBuffer = await generateTransparentTextPngBuffer(textSpecs);
  if (textPngBuffer) {
    await sendTelegramDocument(textPngBuffer, "text_print_transparent_300dpi.png", `📁 Исходник надписи на плёнку (PNG 300 DPI с прозрачным фоном) к заказу #${order.orderNumber}`);
  }

  // Render vector SVG for text plotter cutting
  const textSvg = generateTextSvg(textSpecs);
  await sendTelegramDocument(Buffer.from(textSvg), "text_print_vector.svg", `📁 Векторный файл надписи (SVG) к заказу #${order.orderNumber}`);

  console.log(`✅ [2/2] Успешно отправлены превью футболки и файлы надписи (прозрачный PNG 300 DPI + векторный SVG)!`);
}

async function main() {
  await runScenario1_OnlyOctopusImage();
  await runScenario2_OnlyText();
  console.log("\n🎉 ОБА ТЕСТОВЫХ СЦЕНАРИЯ (ТОЛЬКО КАРТИНКА И ТОЛЬКО ТЕКСТ) УСПЕШНО ВЫПОЛНЕНЫ!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
