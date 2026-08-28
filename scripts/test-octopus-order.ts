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

async function main() {
  console.log("🚀 Starting test order creation with user octopus logo and text printing assets...");

  const logoPath = path.join(process.cwd(), "public", "test-octopus-logo.png");
  const logoBuffer = await readFile(logoPath);
  console.log(`✅ Loaded octopus logo (${(logoBuffer.length / 1024).toFixed(1)} KB)`);

  // 1. Find product shirt & options in DB
  const product = await db.product.findFirst({
    where: { slug: "shirt", active: true },
    include: { options: true, printMethods: true },
  });

  if (!product) {
    throw new Error("Product shirt not found in DB.");
  }

  const printMethod = await db.printMethod.findFirst({ where: { slug: "dtf", active: true } });
  const printFormat = await db.printFormat.findFirst({ where: { code: "A4", active: true } });

  if (!printMethod || !printFormat) {
    throw new Error("DTF print method or A4 format not found.");
  }

  const colorOption = product.options.find((o) => o.type === ProductOptionType.COLOR && o.value === "white") ?? product.options[0];
  const sizeOption = product.options.find((o) => o.type === ProductOptionType.SIZE && o.value === "m") ?? product.options[1];

  const orderNumber = `BY-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const orderId = randomUUID();
  const orderItemId = randomUUID();
  const assetId = randomUUID();
  const storageKey = createStorageKey(orderId, assetId, "png");

  // Save asset file to local file storage disk
  await writeStoredAsset(storageKey, logoBuffer);
  console.log(`✅ Saved original asset file to disk: ${storageKey}`);

  // 2. Generate server mockup preview buffer with Sharp (Garment + Red Dashed Zone + Octopus Logo)
  const mockupBuffer = await generateServerMockupBuffer({
    productSlug: "shirt",
    colorLabelOrKey: colorOption?.label ?? "Белый",
    view: "front",
    artworkBuffer: logoBuffer,
  });

  if (!mockupBuffer) {
    throw new Error("Failed to generate server mockup preview buffer.");
  }
  console.log(`✅ Rendered server mockup preview with Sharp (${(mockupBuffer.length / 1024).toFixed(1)} KB)`);

  const textSpecs = [
    { content: "ПРИНТОПУС 2026", fontFamily: "Montserrat", fontWeight: 800, color: "#750033" },
  ];

  // 3. Save order to Postgres Database
  const order = await db.order.create({
    data: {
      id: orderId,
      orderNumber,
      customerName: "Иван (Тест Логотип + Текст на плёнку)",
      customerPhone: "+375 (29) 777-88-99",
      contactMethod: ContactMethod.TELEGRAM,
      fulfillmentMethod: FulfillmentMethod.DELIVERY,
      deliveryAddress: "г. Минск, пр. Независимости 45, кв. 12",
      comment: "Печать логотипа осьминога и надписи 'ПРИНТОПУС 2026'!",
      subtotal: 45.0,
      discountPercent: 0.0,
      total: 45.0,
      status: OrderStatus.NEW,
      items: {
        create: {
          id: orderItemId,
          productId: product.id,
          printMethodId: printMethod.id,
          printFormatId: printFormat.id,
          productName: product.name,
          colorLabel: colorOption?.label ?? "Белый",
          sizeLabel: sizeOption?.label ?? "M",
          placement: "center",
          quantity: 1,
          baseUnitPrice: 45.0,
          unitPrice: 45.0,
          total: 45.0,
          design: {
            front: [
              {
                type: "image",
                name: "octopus_logo.png",
                x: 50,
                y: 40,
                scale: 1,
                rotation: 0,
                width: 65,
              },
              {
                type: "text",
                content: "ПРИНТОПУС 2026",
                fontFamily: "Montserrat",
                fontWeight: 800,
                color: "#750033",
                x: 50,
                y: 75,
                scale: 1,
                rotation: 0,
                width: 50,
              },
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
    select: {
      id: true,
      orderNumber: true,
      status: true,
      subtotal: true,
      discountPercent: true,
      total: true,
      items: {
        select: {
          productName: true,
          colorLabel: true,
          sizeLabel: true,
          placement: true,
          quantity: true,
          baseUnitPrice: true,
          unitPrice: true,
          total: true,
          assets: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
        },
      },
    },
  });

  console.log(`✅ Saved order to Postgres DB: ${order.orderNumber} (ID: ${order.id})`);

  // 4. Send Telegram Photo Preview (T-Shirt with Octopus Logo + Red Zone)
  const tgResult = await sendOrderNotificationToTelegram({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: "Иван (Тест Логотип + Текст на плёнку)",
    customerPhone: "+375 (29) 777-88-99",
    contactMethod: "telegram",
    fulfillmentMethod: "delivery",
    deliveryAddress: "г. Минск, пр. Независимости 45, кв. 12",
    comment: "Печать логотипа осьминога и надписи 'ПРИНТОПУС 2026'!",
    subtotal: Number(order.subtotal),
    discountPercent: Number(order.discountPercent),
    total: Number(order.total),
    status: order.status,
    previewBuffers: [
      {
        name: "Спереди по центру",
        buffer: mockupBuffer,
      },
    ],
    items: [
      {
        productName: "Футболка",
        colorLabel: colorOption?.label ?? "Белый",
        sizeLabel: sizeOption?.label ?? "M",
        placement: "center",
        quantity: 1,
        baseUnitPrice: 45.0,
        unitPrice: 45.0,
        total: 45.0,
        textElements: textSpecs,
        assets: order.items[0].assets,
      },
    ],
  });

  console.log(`✅ Telegram Notification Sent: ${tgResult}`);

  // 5. Send Attached Original Image File (octopus_logo.png) to Telegram
  const docResult = await sendTelegramDocument(
    logoBuffer,
    "Спереди_по_центру_octopus_logo.png",
    `📁 Исходник принта (Спереди по центру) к заказу #${order.orderNumber}`,
  );
  console.log(`✅ Telegram Image Document Sent: ${docResult}`);

  // 6. Send Rendered Transparent PNG (300 DPI) for text printing on film
  const textPngBuffer = await generateTransparentTextPngBuffer(textSpecs);
  if (textPngBuffer) {
    const textPngResult = await sendTelegramDocument(
      textPngBuffer,
      `text_print_transparent_300dpi.png`,
      `📁 Исходник надписи на плёнку (PNG с прозрачным фоном 300 DPI) к заказу #${order.orderNumber}`,
    );
    console.log(`✅ Telegram Transparent Text PNG Sent: ${textPngResult}`);
  }

  // 7. Send Vector SVG for text plotter cutting
  const textSvg = generateTextSvg(textSpecs);
  const textSvgResult = await sendTelegramDocument(
    Buffer.from(textSvg),
    `text_print_vector.svg`,
    `📁 Векторный файл надписи (SVG) к заказу #${order.orderNumber}`,
  );
  console.log(`✅ Telegram Vector Text SVG Sent: ${textSvgResult}`);

  console.log("\n🎉 ALL PRINT ASSETS (MOCKUP + ORIGINAL LOGO + TRANSPARENT TEXT PNG + VECTOR SVG) SUCCESSFULLY SENT!");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
