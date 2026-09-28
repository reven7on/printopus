import { randomBytes, randomUUID } from "node:crypto";
import { after } from "next/server";
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
  ORDER_DESIGN_VIEWS,
  OrderInputError,
  parseCreateOrderInput,
  type OrderDesignElement,
} from "../../../lib/order-domain";
import {
  MAX_UPLOAD_TOTAL_BYTES,
  prepareDesignImage,
  prepareDesignImages,
  UploadValidationError,
} from "../../../lib/upload-policy";

import { getClientIp, RateLimiter } from "../../../lib/rate-limiter";
import { normalizeOrderSizeBreakdown } from "../../../lib/order-size-breakdown";
import {
  sendTelegramDocument,
  type TelegramOrderPayload,
} from "../../../lib/telegram";
import { deliverTelegramNotificationForOrder } from "../../../lib/telegram-delivery";
import { generateServerMockupBuffer } from "../../../lib/server-mockup-generator";
import {
  generateCombinedPrintPngBuffer,
  type ShapePrintSpec,
  type TextPrintSpec,
} from "../../../lib/text-asset-generator";

export const runtime = "nodejs";

const orderRateLimiter = new RateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
const MAX_REQUEST_BYTES = 256_000;
const MAX_PREVIEW_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_TOTAL_BYTES = 12 * 1024 * 1024;
const MAX_STORED_PREVIEW_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_REQUEST_BYTES = MAX_UPLOAD_TOTAL_BYTES + MAX_PREVIEW_TOTAL_BYTES + MAX_REQUEST_BYTES + 1_000_000;
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

const existingOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  currency: true,
  subtotal: true,
  discountPercent: true,
  total: true,
  createdAt: true,
  items: { select: { assets: { select: { id: true } } } },
} satisfies Prisma.OrderSelect;

function orderResponse(
  order: Prisma.OrderGetPayload<{ select: typeof existingOrderSelect }>,
  status: 200 | 201,
  duplicate = false,
) {
  return Response.json({
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      discountPercent: Number(order.discountPercent),
      total: Number(order.total),
      createdAt: order.createdAt,
      assetCount: order.items.reduce((total, item) => total + item.assets.length, 0),
    },
    duplicate,
  }, { status, headers: { "Cache-Control": "no-store" } });
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
    const encodedUploadIds = formData.get("fileUploadIds");
    let fileUploadIds: string[] = [];
    if (encodedUploadIds !== null) {
      if (typeof encodedUploadIds !== "string" || encodedUploadIds.length > 2_000) {
        throw new UploadValidationError("Связь файлов с макетом передана в неверном формате.");
      }
      try {
        const parsedUploadIds = JSON.parse(encodedUploadIds) as unknown;
        if (
          !Array.isArray(parsedUploadIds)
          || parsedUploadIds.length !== files.length
          || parsedUploadIds.some((id) => typeof id !== "string" || !/^[a-z0-9_-]{1,100}$/i.test(id))
          || new Set(parsedUploadIds).size !== parsedUploadIds.length
        ) {
          throw new Error("INVALID_UPLOAD_IDS");
        }
        fileUploadIds = parsedUploadIds;
      } catch {
        throw new UploadValidationError("Связь файлов с макетом передана в неверном формате.");
      }
    }

    const previewMeta: Record<string, { view: string; label: string }> = {
      mockup_front: { view: "front", label: "Спереди по центру" },
      mockup_back: { view: "back", label: "На спине" },
      mockup_sleeve_left: { view: "sleeve_left", label: "На левом рукаве" },
      mockup_sleeve_right: { view: "sleeve_right", label: "На правом рукаве" },
    };

    const previewEntries = [...formData.getAll("previews"), ...formData.getAll("preview")];
    if (previewEntries.length > ORDER_DESIGN_VIEWS.length) {
      throw new UploadValidationError("Передано слишком много ракурсов макета.", { status: 413, code: "TOO_MANY_PREVIEWS" });
    }
    if (previewEntries.some((entry) => typeof entry !== "string" && entry.size > MAX_PREVIEW_FILE_BYTES)) {
      throw new UploadValidationError("Одно из превью макета превышает 5 МБ.", { status: 413, code: "PREVIEW_TOO_LARGE" });
    }
    const previewTotalBytes = previewEntries.reduce((total, entry) => total + (typeof entry === "string" ? 0 : entry.size), 0);
    if (previewTotalBytes > MAX_PREVIEW_TOTAL_BYTES) {
      throw new UploadValidationError("Общий размер превью макета превышает 12 МБ.", { status: 413, code: "PREVIEWS_TOO_LARGE" });
    }
    const previewBuffers: Array<{ view: string; name: string; buffer: Buffer; width: number; height: number }> = [];
    let storedPreviewBytes = 0;

    for (const entry of previewEntries) {
      if (!entry || typeof entry === "string") {
        throw new UploadValidationError("Превью макета передано в неверном формате.");
      }
      const baseName = entry.name?.replace(/\.[^/.]+$/, "") ?? "";
      const meta = previewMeta[baseName];
      if (!meta || previewBuffers.some((preview) => preview.view === meta.view)) {
        throw new UploadValidationError("Ракурс превью макета передан в неверном формате.");
      }
      const prepared = await prepareDesignImage(entry);
      storedPreviewBytes += prepared.bytes.byteLength;
      if (storedPreviewBytes > MAX_STORED_PREVIEW_TOTAL_BYTES) {
        throw new UploadValidationError("Общий размер превью после безопасной обработки превышает 20 МБ.", {
          status: 413,
          code: "PREVIEWS_TOO_LARGE",
        });
      }
      previewBuffers.push({
        view: meta.view,
        name: meta.label,
        buffer: prepared.bytes,
        width: prepared.width,
        height: prepared.height,
      });
    }

    return { value, files: files as File[], fileUploadIds, previewBuffers };
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
    return { value: JSON.parse(body) as unknown, files: [] as File[], fileUploadIds: [] as string[] };
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
  let submissionIdForRetry: string | null = null;
  try {
    const parsedRequest = await readOrderRequest(request);
    const input = parseCreateOrderInput(parsedRequest.value);
    submissionIdForRetry = input.submissionId;
    if (input.submissionId) {
      const existingOrder = await database.order.findUnique({
        where: { submissionId: input.submissionId },
        select: existingOrderSelect,
      });
      if (existingOrder) return orderResponse(existingOrder, 200, true);
    }
    const orderedDesignUploadIds = ORDER_DESIGN_VIEWS.flatMap((view) => (
      input.design?.[view]?.flatMap((element) => element.type === "image" && element.uploadId ? [element.uploadId] : []) ?? []
    ));
    const designUploadIds = new Set(orderedDesignUploadIds);
    const uniqueDesignUploadIds = Array.from(designUploadIds);
    if (parsedRequest.fileUploadIds.some((uploadId) => !designUploadIds.has(uploadId))) {
      throw new UploadValidationError("Загруженный файл не связан с элементом макета.");
    }
    const effectiveFileUploadIds = parsedRequest.fileUploadIds.length > 0
      ? parsedRequest.fileUploadIds
      : parsedRequest.files.length === uniqueDesignUploadIds.length
        ? uniqueDesignUploadIds
        : [];
    if (
      effectiveFileUploadIds.length !== parsedRequest.files.length
      || effectiveFileUploadIds.length !== designUploadIds.size
      || effectiveFileUploadIds.some((uploadId) => !designUploadIds.has(uploadId))
    ) {
      throw new UploadValidationError("Не удалось однозначно связать файлы с ракурсами макета.");
    }
    const preparedFiles = await prepareDesignImages(parsedRequest.files);
    const orderId = randomUUID();
    const orderItemId = randomUUID();
    const preparedAssets = preparedFiles.map((file, index) => {
      const id = randomUUID();
      return {
        ...file,
        id,
        designElementId: effectiveFileUploadIds[index] ?? null,
        storageKey: createStorageKey(orderId, id, file.extension),
      };
    });
    const preparedPreviews = (parsedRequest.previewBuffers ?? []).map((preview) => {
      const id = randomUUID();
      return {
        ...preview,
        id,
        storageKey: createStorageKey(orderId, id, "png"),
      };
    });
    if (preparedAssets.length || preparedPreviews.length) {
      await ensureUploadCapacity(
        preparedAssets.reduce((total, asset) => total + asset.bytes.byteLength, 0)
          + preparedPreviews.reduce((total, preview) => total + preview.buffer.byteLength, 0),
      );
    }

    for (const asset of preparedAssets) {
      await writeStoredAsset(asset.storageKey, asset.bytes);
      storedKeys.push(asset.storageKey);
    }
    for (const preview of preparedPreviews) {
      await writeStoredAsset(preview.storageKey, preview.buffer);
      storedKeys.push(preview.storageKey);
    }

    const order = await database.$transaction(async (transaction) => {
      const requestedSizeValues = Array.from(new Set([
        input.size,
        ...(input.sizeDistribution?.map((entry) => entry.size) ?? []),
      ]));
      const [product, printConfiguration, discount] = await Promise.all([
        transaction.product.findFirst({
          where: { slug: input.productSlug, active: true },
          include: {
            options: {
              where: {
                active: true,
                OR: [
                  { type: ProductOptionType.COLOR, value: input.color },
                  { type: ProductOptionType.SIZE, value: { in: requestedSizeValues } },
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
      const sizeOptions = product.options.filter((option) => option.type === ProductOptionType.SIZE);
      const size = sizeOptions.find((option) => option.value === input.size);
      if (!color) throw new OrderInputError("Цвет недоступен для этого изделия.", "color");
      if (!size) throw new OrderInputError("Размер недоступен для этого изделия.", "size");
      const sizesByValue = new Map(sizeOptions.map((option) => [option.value, option]));
      const missingSize = input.sizeDistribution?.find((entry) => !sizesByValue.has(entry.size));
      if (missingSize) {
        throw new OrderInputError("Один из размеров недоступен для выбранного изделия.", "sizeDistribution");
      }
      const sizeBreakdown = input.sizeDistribution?.map((entry) => {
        const option = sizesByValue.get(entry.size)!;
        return { value: option.value, label: option.label, quantity: entry.quantity };
      }) ?? null;

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
          submissionId: input.submissionId,
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
              sizeLabel: sizeBreakdown && sizeBreakdown.length > 1 ? "Разные размеры" : sizeBreakdown?.[0]?.label ?? size.label,
              ...(sizeBreakdown ? { sizeBreakdown: sizeBreakdown as Prisma.InputJsonValue } : {}),
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
                    designElementId: asset.designElementId,
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
          statusHistory: {
            create: {
              toStatus: "NEW",
              note: "Заказ оформлен на сайте",
              changedBy: "Сайт",
            },
          },
          ...(preparedPreviews.length ? {
            previews: {
              create: preparedPreviews.map((preview) => ({
                id: preview.id,
                view: preview.view,
                label: preview.name,
                storageKey: preview.storageKey,
                sizeBytes: preview.buffer.byteLength,
                width: preview.width,
                height: preview.height,
              })),
            },
          } : {}),
          telegramDelivery: { create: {} },
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
              sizeBreakdown: true,
              baseUnitPrice: true,
              unitPrice: true,
              total: true,
              printFormat: { select: { code: true, widthCm: true, heightCm: true } },
              assets: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
            },
          },
        },
      });
    });

    // From this point the database owns the uploaded files. Later notification or
    // preview failures must never delete assets referenced by a committed order.
    storedKeys.length = 0;

    const viewMeta: Record<string, { label: string; filePrefix: string }> = {
      front: { label: "Спереди", filePrefix: "1_Спереди" },
      back: { label: "На спине", filePrefix: "2_Спина" },
      sleeve_left: { label: "Левый рукав", filePrefix: "3_Левый_рукав" },
      sleeve_right: { label: "Правый рукав", filePrefix: "4_Правый_рукав" },
    };

    interface ViewDesignGroup {
      viewKey: "front" | "back" | "sleeve_left" | "sleeve_right";
      label: string;
      filePrefix: string;
      textElements: TextPrintSpec[];
      shapeElements: ShapePrintSpec[];
      imageAssets: typeof preparedAssets;
      designElements: OrderDesignElement[];
    }

    const viewGroupsMap = new Map<string, ViewDesignGroup>();
    const assetsByElementId = new Map(
      preparedAssets
        .filter((asset): asset is typeof asset & { designElementId: string } => Boolean(asset.designElementId))
        .map((asset) => [asset.designElementId, asset]),
    );
    const assignedAssetIds = new Set<string>();

    if (input.design && typeof input.design === "object") {
      ORDER_DESIGN_VIEWS.forEach((viewKey) => {
        const viewElements = input.design?.[viewKey];
        if (Array.isArray(viewElements) && viewElements.length > 0) {
          const meta = viewMeta[viewKey];
          const group: ViewDesignGroup = {
            viewKey,
            label: meta.label,
            filePrefix: meta.filePrefix,
            textElements: [],
            shapeElements: [],
            imageAssets: [],
            designElements: [...viewElements],
          };

          viewElements.forEach((el) => {
            if (!el || typeof el !== "object") return;
            if (el.type === "image" && el.uploadId) {
              const asset = assetsByElementId.get(el.uploadId);
              if (asset) {
                group.imageAssets.push(asset);
                assignedAssetIds.add(asset.id);
              }
            } else if (el.type === "text" && typeof el.content === "string") {
                group.textElements.push({
                  content: el.content,
                  fontFamily: typeof el.fontFamily === "string" ? el.fontFamily : undefined,
                  color: typeof el.color === "string" ? el.color : undefined,
                });
            } else if (el.type === "shape" && typeof el.content === "string") {
              group.shapeElements.push({
                content: el.content,
                color: typeof el.color === "string" ? el.color : undefined,
                x: typeof el.x === "number" ? el.x : 50,
                y: typeof el.y === "number" ? el.y : 50,
                width: typeof el.width === "number" ? el.width : 35,
              });
            }
          });

          viewGroupsMap.set(viewKey, group);
        }
      });
    }

    if (viewGroupsMap.size === 0) {
      const defaultView: typeof ORDER_DESIGN_VIEWS[number] = input.placement === "back" ? "back" : input.placement === "sleeve_left" ? "sleeve_left" : input.placement === "sleeve_right" ? "sleeve_right" : "front";
      const meta = viewMeta[defaultView];
      viewGroupsMap.set(defaultView, {
        viewKey: defaultView,
        label: meta.label,
        filePrefix: meta.filePrefix,
        textElements: [],
        shapeElements: [],
        imageAssets: preparedAssets,
        designElements: [],
      });
    } else {
      const firstGroup = Array.from(viewGroupsMap.values())[0];
      firstGroup.imageAssets.push(...preparedAssets.filter((asset) => !assignedAssetIds.has(asset.id)));
    }

    const allTextElements: TextPrintSpec[] = [];
    const allShapeElements: ShapePrintSpec[] = [];
    viewGroupsMap.forEach((g) => {
      allTextElements.push(...g.textElements);
      allShapeElements.push(...g.shapeElements);
    });

    let previewBuffers = preparedPreviews.map((preview) => ({ name: preview.name, buffer: preview.buffer }));
    if (!previewBuffers || previewBuffers.length === 0) {
      previewBuffers = [];
      for (const group of viewGroupsMap.values()) {
        const firstArtworkBuffer = group.imageAssets.length > 0
          ? await readStoredAsset(group.imageAssets[0].storageKey).catch(() => null)
          : null;

        const serverMockup = await generateServerMockupBuffer({
          productSlug: input.productSlug,
          colorLabelOrKey: order.items[0]?.colorLabel ?? input.color,
          view: group.viewKey,
          artworkBuffer: firstArtworkBuffer,
          textElements: group.textElements,
          shapeElements: group.shapeElements,
        }).catch(() => null);

        if (serverMockup) {
          previewBuffers.push({ name: group.label, buffer: serverMockup });
        }
      }
    }

    const telegramPayload: TelegramOrderPayload = {
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
        sizeBreakdown: normalizeOrderSizeBreakdown(item.sizeBreakdown),
        placement: input.placement,
        quantity: input.quantity,
        baseUnitPrice: Number(item.baseUnitPrice),
        unitPrice: Number(item.unitPrice),
        total: Number(item.total),
        textElements: allTextElements,
        shapeElements: allShapeElements,
        assets: item.assets,
      })),
    };

    after(async () => {
      try {
        const sentMessage = await deliverTelegramNotificationForOrder(order.id, telegramPayload);
        if (!sentMessage) return;
        const printFormat = order.items[0]?.printFormat;
        const printWidthCm = Number(printFormat?.widthCm ?? 21);
        const printHeightCm = Number(printFormat?.heightCm ?? 29.7);

        // One combined, transparent, print-ready source file per active view (maximum four files).
        let combinedFilesSent = 0;
        for (const group of viewGroupsMap.values()) {
          try {
            const combinedBuffer = await generateCombinedPrintPngBuffer({
              elements: group.designElements,
              assets: group.imageAssets.flatMap((asset) => asset.designElementId ? [{
                uploadId: asset.designElementId,
                mimeType: asset.mimeType,
                buffer: asset.bytes,
              }] : []),
              widthCm: printWidthCm,
              heightCm: printHeightCm,
            });
            if (!combinedBuffer) continue;
            const sent = await sendTelegramDocument(
              combinedBuffer,
              `${group.filePrefix}_готовый_макет_${printFormat?.code ?? input.printFormatCode}_300dpi.png`,
              `📁 [${group.label}] Единый готовый макет: картинки, текст и графика · ${printWidthCm}×${printHeightCm} см · 300 DPI · заказ #${order.orderNumber}`,
            );
            if (sent) combinedFilesSent += 1;
          } catch (error) {
            console.error(`[Telegram] Failed to build combined print file for ${group.viewKey}:`, error);
          }
        }
        console.info(`[Telegram] Order #${order.orderNumber}: sent ${combinedFilesSent} combined print file(s).`);
      } catch (error) {
        console.error("[Telegram] Failed to deliver order notification:", error);
      }
    });

    return orderResponse(order, 201);
  } catch (error) {
    await Promise.allSettled(storedKeys.map(removeStoredAsset));
    if (
      submissionIdForRetry
      && error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      const existingOrder = await database.order.findUnique({
        where: { submissionId: submissionIdForRetry },
        select: existingOrderSelect,
      });
      if (existingOrder) return orderResponse(existingOrder, 200, true);
    }
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
