import { randomBytes, randomUUID } from "node:crypto";
import { ContactMethod, FulfillmentMethod, Prisma, ProductOptionType } from "../../../app/generated/prisma/client";
import { database } from "../../../lib/db";
import {
  createStorageKey,
  ensureUploadCapacity,
  readStoredAsset,
  removeStoredAsset,
  UploadStorageFullError,
  writeStoredAsset,
} from "../../../lib/local-file-storage";
import {
  calculateOrderQuote,
  OrderInputError,
  parseCreateOrderInput,
} from "../../../lib/order-domain";
import {
  MAX_UPLOAD_TOTAL_BYTES,
  prepareDesignImages,
  UploadValidationError,
} from "../../../lib/upload-policy";

import { getClientIp, RateLimiter } from "../../../lib/rate-limiter";
import { sendOrderNotificationToTelegram, sendTelegramDocument } from "../../../lib/telegram";
import { generateServerMockupBuffer } from "../../../lib/server-mockup-generator";
import { generateTransparentTextPngBuffer, generateTextSvg } from "../../../lib/text-asset-generator";

export const runtime = "nodejs";

const orderRateLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const MAX_REQUEST_BYTES = 256_000;
const MAX_MULTIPART_REQUEST_BYTES = MAX_UPLOAD_TOTAL_BYTES + MAX_REQUEST_BYTES + 1_000_000;
const placementsByProduct: Record<string, readonly string[]> = {
  shirt: ["center", "chest_left", "back", "sleeve_left", "sleeve_right"],
  hoodie: ["center", "chest_left", "back", "sleeve_left", "sleeve_right"],
  polo: ["center", "chest_left", "back", "sleeve_left", "sleeve_right"],
  cap: ["center", "sleeve_left", "sleeve_right"],
  bag: ["center", "back"],
};

function createOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `BY-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

function errorResponse(code: string, message: string, status: number, field?: string) {
  return Response.json({ error: { code, message, ...(field ? { field } : {}) } }, { status });
}

function rejectOversizedRequest(request: Request, maximum: number) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new UploadValidationError("Запрос слишком большой.", { status: 413, code: "REQUEST_TOO_LARGE" });
  }
}

async function readOrderRequest(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.startsWith("multipart/form-data")) {
    rejectOversizedRequest(request, MAX_MULTIPART_REQUEST_BYTES);
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new OrderInputError("Не удалось прочитать данные заказа.");
    }
    const encodedOrder = formData.get("order");
    if (typeof encodedOrder !== "string" || new TextEncoder().encode(encodedOrder).byteLength > MAX_REQUEST_BYTES) {
      throw new OrderInputError("Данные заказа имеют неверный формат.");
    }
    let value: unknown;
    try {
      value = JSON.parse(encodedOrder);
    } catch {
      throw new OrderInputError("Не удалось прочитать данные заказа.");
    }
    const files = formData.getAll("files");
    if (files.some((entry) => typeof entry === "string")) {
      throw new UploadValidationError("Файлы переданы в неверном формате.");
    }

    const viewLabels: Record<string, string> = {
      mockup_front: "Спереди по центру",
      mockup_back: "На спине",
      mockup_sleeve_left: "На левом рукаве",
      mockup_sleeve_right: "На правом рукаве",
    };

    const previewEntries = [...formData.getAll("previews"), ...formData.getAll("preview")];
    const previewBuffers: Array<{ name: string; buffer: Buffer }> = [];

    for (const entry of previewEntries) {
      if (entry && typeof entry !== "string" && entry.size > 0 && entry.size < 5 * 1024 * 1024) {
        try {
          const buf = Buffer.from(await entry.arrayBuffer());
          const baseName = entry.name?.replace(/\.[^/.]+$/, "") ?? "";
          const name = viewLabels[baseName] ?? "Макет нанесения";
          previewBuffers.push({ name, buffer: buf });
        } catch {
          // Ignore preview read error
        }
      }
    }

    return { value, files: files as File[], previewBuffers };
  }

  if (!contentType.startsWith("application/json")) {
    throw new OrderInputError("Отправьте данные в формате JSON или multipart/form-data.");
  }
  rejectOversizedRequest(request, MAX_REQUEST_BYTES);

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new OrderInputError("Запрос слишком большой.");
  }

  try {
    return { value: JSON.parse(body) as unknown, files: [] as File[] };
  } catch {
    throw new OrderInputError("Не удалось прочитать данные заказа.");
  }
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimit = orderRateLimiter.check(ip);
  if (!rateLimit.allowed) {
    return errorResponse(
      "TOO_MANY_REQUESTS",
      "Слишком много заказов. Пожалуйста, подождите несколько минут перед отправкой следующего заказа.",
      429,
    );
  }

  const storedKeys: string[] = [];
  try {
    const parsedRequest = await readOrderRequest(request);
    const input = parseCreateOrderInput(parsedRequest.value);
    const preparedFiles = await prepareDesignImages(parsedRequest.files);
    const orderId = randomUUID();
    const orderItemId = randomUUID();
    const preparedAssets = preparedFiles.map((file) => {
      const id = randomUUID();
      return { ...file, id, storageKey: createStorageKey(orderId, id, file.extension) };
    });
    if (preparedAssets.length) {
      await ensureUploadCapacity(preparedAssets.reduce((total, asset) => total + asset.bytes.byteLength, 0));
    }

    for (const asset of preparedAssets) {
      await writeStoredAsset(asset.storageKey, asset.bytes);
      storedKeys.push(asset.storageKey);
    }

    const order = await database.$transaction(async (transaction) => {
      const [product, printConfiguration, discount] = await Promise.all([
        transaction.product.findFirst({
          where: { slug: input.productSlug, active: true },
          include: {
            options: {
              where: {
                active: true,
                OR: [
                  { type: ProductOptionType.COLOR, value: input.color },
                  { type: ProductOptionType.SIZE, value: input.size },
                ],
              },
            },
          },
        }),
        transaction.productPrintFormat.findFirst({
          where: {
            active: true,
            printFormat: { code: input.printFormatCode, active: true },
            productPrintMethod: {
              active: true,
              product: { slug: input.productSlug, active: true },
              printMethod: { slug: input.printMethodSlug, active: true },
            },
          },
          include: {
            printFormat: true,
            productPrintMethod: { include: { printMethod: true } },
          },
        }),
        transaction.volumeDiscount.findFirst({
          where: { active: true, minQuantity: { lte: input.quantity } },
          orderBy: { minQuantity: "desc" },
        }),
      ]);

      if (!product) throw new OrderInputError("Выбранное изделие недоступно.", "productSlug");
      if (!printConfiguration) {
        throw new OrderInputError("Этот способ и формат печати недоступны для выбранного изделия.", "printFormatCode");
      }
      const printMethod = printConfiguration.productPrintMethod.printMethod;
      const printFormat = printConfiguration.printFormat;
      if (!placementsByProduct[product.slug]?.includes(input.placement)) {
        throw new OrderInputError("Зона нанесения недоступна для этого изделия.", "placement");
      }

      const color = product.options.find((option) => option.type === ProductOptionType.COLOR);
      const size = product.options.find((option) => option.type === ProductOptionType.SIZE);
      if (!color) throw new OrderInputError("Цвет недоступен для этого изделия.", "color");
      if (!size) throw new OrderInputError("Размер недоступен для этого изделия.", "size");

      const quote = calculateOrderQuote({
        productPrice: Number(product.basePrice),
        colorPrice: 0,
        printMethodPrice: Number(printConfiguration.productPrintMethod.priceDelta),
        printFormatPrice: Number(printConfiguration.priceDelta),
        quantity: input.quantity,
        discountPercent: Number(discount?.percent ?? 0),
      });

      return transaction.order.create({
        data: {
          id: orderId,
          orderNumber: createOrderNumber(),
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          contactMethod: input.contactMethod === "telegram" ? ContactMethod.TELEGRAM : ContactMethod.PHONE,
          fulfillmentMethod: input.fulfillmentMethod === "delivery" ? FulfillmentMethod.DELIVERY : FulfillmentMethod.PICKUP,
          deliveryAddress: input.deliveryAddress,
          comment: input.comment,
          subtotal: quote.subtotal,
          discountPercent: quote.discountPercent,
          total: quote.total,
          items: {
            create: {
              id: orderItemId,
              productId: product.id,
              printMethodId: printMethod.id,
              printFormatId: printFormat.id,
              productName: product.name,
              colorLabel: color.label,
              sizeLabel: size.label,
              placement: input.placement,
              quantity: input.quantity,
              baseUnitPrice: quote.baseUnitPrice,
              unitPrice: quote.unitPrice,
              total: quote.total,
              ...(input.design === null ? {} : { design: input.design as Prisma.InputJsonValue }),
              ...(preparedAssets.length ? {
                assets: {
                  create: preparedAssets.map((asset) => ({
                    id: asset.id,
                    originalName: asset.originalName,
                    storageKey: asset.storageKey,
                    mimeType: asset.mimeType,
                    sizeBytes: asset.bytes.byteLength,
                    width: asset.width,
                    height: asset.height,
                  })),
                },
              } : {}),
            },
          },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          currency: true,
          subtotal: true,
          discountPercent: true,
          total: true,
          createdAt: true,
          items: {
            select: {
              productName: true,
              colorLabel: true,
              sizeLabel: true,
              baseUnitPrice: true,
              unitPrice: true,
              total: true,
              assets: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
            },
          },
        },
      });
    });

    const textElements: Array<{ content: string; fontFamily?: string; color?: string }> = [];
    if (input.design && typeof input.design === "object") {
      Object.values(input.design).forEach((viewElements) => {
        if (Array.isArray(viewElements)) {
          viewElements.forEach((el) => {
            if (el && typeof el === "object" && el.type === "text" && typeof el.content === "string") {
              textElements.push({
                content: el.content,
                fontFamily: typeof el.fontFamily === "string" ? el.fontFamily : undefined,
                color: typeof el.color === "string" ? el.color : undefined,
              });
            }
          });
        }
      });
    }

    const placementLabels: Record<string, string> = {
      center: "Спереди по центру",
      chest_left: "Спереди слева",
      back: "На спине",
      sleeve_left: "На левом рукаве",
      sleeve_right: "На правом рукаве",
    };

    let previewBuffers = parsedRequest.previewBuffers;
    if (!previewBuffers || previewBuffers.length === 0) {
      const view = input.placement === "back" ? "back" : input.placement === "sleeve_left" ? "sleeve_left" : input.placement === "sleeve_right" ? "sleeve_right" : "front";
      const viewName = placementLabels[input.placement] ?? "Спереди по центру";
      const firstArtworkBuffer = preparedAssets.length > 0 ? await readStoredAsset(preparedAssets[0].storageKey).catch(() => null) : null;
      const serverMockup = await generateServerMockupBuffer({
        productSlug: input.productSlug,
        colorLabelOrKey: order.items[0]?.colorLabel ?? input.color,
        view,
        artworkBuffer: firstArtworkBuffer,
      }).catch(() => null);

      if (serverMockup) {
        previewBuffers = [{ name: viewName, buffer: serverMockup }];
      }
    }

    sendOrderNotificationToTelegram({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      contactMethod: input.contactMethod,
      fulfillmentMethod: input.fulfillmentMethod,
      deliveryAddress: input.deliveryAddress,
      comment: input.comment,
      subtotal: Number(order.subtotal),
      discountPercent: Number(order.discountPercent),
      total: Number(order.total),
      status: order.status,
      previewBuffers,
      items: order.items.map((item) => ({
        productName: item.productName,
        colorLabel: item.colorLabel,
        sizeLabel: item.sizeLabel,
        placement: input.placement,
        quantity: input.quantity,
        baseUnitPrice: Number(item.baseUnitPrice),
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        textElements,
        assets: item.assets,
      })),
    })
      .then(async () => {
        const placementName = placementLabels[input.placement] ?? input.placement;

        // 1. Send uploaded original image assets as documents
        for (const asset of preparedAssets) {
          try {
            const fileBuffer = await readStoredAsset(asset.storageKey);
            const sanitizedPlacement = placementName.replace(/\s+/g, "_");
            const prefixedName = `${sanitizedPlacement}_${asset.originalName}`;
            await sendTelegramDocument(
              fileBuffer,
              prefixedName,
              `📁 Исходник принта (${placementName}) к заказу #${order.orderNumber}`,
            );
          } catch (err) {
            console.error("[Telegram] Failed to send asset document:", err);
          }
        }

        // 2. Send rendered transparent PNG (300 DPI) and vector SVG for text elements
        if (textElements.length > 0) {
          try {
            const textPngBuffer = await generateTransparentTextPngBuffer(textElements);
            if (textPngBuffer) {
              await sendTelegramDocument(
                textPngBuffer,
                `text_print_transparent_300dpi.png`,
                `📁 Исходник надписи на плёнку (PNG с прозрачным фоном 300 DPI) к заказу #${order.orderNumber}`,
              );
            }

            const textSvg = generateTextSvg(textElements);
            await sendTelegramDocument(
              Buffer.from(textSvg),
              `text_print_vector.svg`,
              `📁 Векторный файл надписи (SVG) к заказу #${order.orderNumber}`,
            );
          } catch (textErr) {
            console.error("[Telegram] Failed to send text print document:", textErr);
          }
        }
      })
      .catch((err) => console.error("Async Telegram notification error:", err));

    const assetCount = order.items.reduce((total, item) => total + item.assets.length, 0);
    storedKeys.length = 0;

    const { items: _items, ...createdOrder } = order;

    return Response.json(
      {
        order: {
          ...createdOrder,
          assetCount,
          subtotal: Number(order.subtotal),
          discountPercent: Number(order.discountPercent),
          total: Number(order.total),
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await Promise.allSettled(storedKeys.map(removeStoredAsset));
    if (error instanceof UploadValidationError) {
      return errorResponse(error.code, error.message, error.status);
    }
    if (error instanceof UploadStorageFullError) {
      return errorResponse("STORAGE_FULL", error.message, 507);
    }
    if (error instanceof OrderInputError) {
      return errorResponse("INVALID_ORDER", error.message, 400, error.field);
    }
    console.error("Failed to create order", error);
    return errorResponse("INTERNAL_ERROR", "Не удалось создать заказ. Попробуйте ещё раз.", 500);
  }
}
