import { randomBytes, randomUUID } from "node:crypto";
import { ContactMethod, FulfillmentMethod, Prisma, ProductOptionType } from "../../../app/generated/prisma/client";
import { database } from "../../../lib/db";
import {
  createStorageKey,
  ensureUploadCapacity,
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

export const runtime = "nodejs";

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
    return { value, files: files as File[] };
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
      const [product, printMethod, printFormat, discount] = await Promise.all([
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
        transaction.printMethod.findFirst({
          where: { slug: input.printMethodSlug, active: true },
        }),
        transaction.printFormat.findFirst({
          where: { code: input.printFormatCode, active: true },
        }),
        transaction.volumeDiscount.findFirst({
          where: { active: true, minQuantity: { lte: input.quantity } },
          orderBy: { minQuantity: "desc" },
        }),
      ]);

      if (!product) throw new OrderInputError("Выбранное изделие недоступно.", "productSlug");
      if (!printMethod) throw new OrderInputError("Способ печати недоступен.", "printMethodSlug");
      if (!printFormat) throw new OrderInputError("Формат печати недоступен.", "printFormatCode");
      if (!placementsByProduct[product.slug]?.includes(input.placement)) {
        throw new OrderInputError("Зона нанесения недоступна для этого изделия.", "placement");
      }

      const color = product.options.find((option) => option.type === ProductOptionType.COLOR);
      const size = product.options.find((option) => option.type === ProductOptionType.SIZE);
      if (!color) throw new OrderInputError("Цвет недоступен для этого изделия.", "color");
      if (!size) throw new OrderInputError("Размер недоступен для этого изделия.", "size");

      const quote = calculateOrderQuote({
        productPrice: Number(product.basePrice),
        colorPrice: Number(color.priceDelta),
        printMethodPrice: Number(printMethod.priceDelta),
        printFormatPrice: Number(printFormat.priceDelta),
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
          items: { select: { assets: { select: { id: true } } } },
        },
      });
    });
    const { items: storedItems, ...createdOrder } = order;
    const assetCount = storedItems.reduce((total, item) => total + item.assets.length, 0);
    storedKeys.length = 0;

    return Response.json(
      {
        order: {
          ...createdOrder,
          assetCount,
          subtotal: Number(createdOrder.subtotal),
          discountPercent: Number(createdOrder.discountPercent),
          total: Number(createdOrder.total),
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
