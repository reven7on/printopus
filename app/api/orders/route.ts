import { randomBytes } from "node:crypto";
import { ContactMethod, FulfillmentMethod, Prisma, ProductOptionType } from "../../../app/generated/prisma/client";
import { database } from "../../../lib/db";
import {
  calculateOrderQuote,
  OrderInputError,
  parseCreateOrderInput,
} from "../../../lib/order-domain";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 256_000;
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

async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new OrderInputError("Отправьте данные в формате JSON.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    throw new OrderInputError("Запрос слишком большой.");
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    throw new OrderInputError("Запрос слишком большой.");
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new OrderInputError("Не удалось прочитать данные заказа.");
  }
}

export async function POST(request: Request) {
  try {
    const input = parseCreateOrderInput(await readJson(request));

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
        },
      });
    });

    return Response.json(
      {
        order: {
          ...order,
          subtotal: Number(order.subtotal),
          discountPercent: Number(order.discountPercent),
          total: Number(order.total),
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof OrderInputError) {
      return errorResponse("INVALID_ORDER", error.message, 400, error.field);
    }
    console.error("Failed to create order", error);
    return errorResponse("INTERNAL_ERROR", "Не удалось создать заказ. Попробуйте ещё раз.", 500);
  }
}
