import { isValidBelarusianPhone, normalizePhone } from "../app/order-validation.ts";

const MAX_DESIGN_JSON_LENGTH = 200_000;

export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  contactMethod: "phone" | "telegram";
  fulfillmentMethod: "pickup" | "delivery";
  deliveryAddress: string | null;
  comment: string | null;
  productSlug: string;
  color: string;
  size: string;
  printMethodSlug: string;
  printFormatCode: string;
  placement: string;
  quantity: number;
  design: unknown;
};

export type OrderQuote = {
  baseUnitPrice: number;
  unitPrice: number;
  subtotal: number;
  discountPercent: number;
  total: number;
};

export class OrderInputError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "OrderInputError";
    this.field = field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  source: Record<string, unknown>,
  field: string,
  options: { min?: number; max: number; pattern?: RegExp },
) {
  const value = source[field];
  if (typeof value !== "string") {
    throw new OrderInputError("Поле заполнено неверно.", field);
  }

  const normalized = value.trim();
  if (normalized.length < (options.min ?? 1) || normalized.length > options.max) {
    throw new OrderInputError("Поле заполнено неверно.", field);
  }
  if (options.pattern && !options.pattern.test(normalized)) {
    throw new OrderInputError("Поле содержит недопустимые символы.", field);
  }
  return normalized;
}

function readOptionalString(source: Record<string, unknown>, field: string, max: number) {
  const value = source[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new OrderInputError("Поле заполнено неверно.", field);
  const normalized = value.trim();
  if (normalized.length > max) throw new OrderInputError("Поле слишком длинное.", field);
  return normalized || null;
}

function readChoice<const T extends readonly string[]>(
  source: Record<string, unknown>,
  field: string,
  values: T,
): T[number] {
  const value = source[field];
  if (typeof value !== "string" || !values.includes(value)) {
    throw new OrderInputError("Выбрано недопустимое значение.", field);
  }
  return value as T[number];
}

function normalizeBelarusianPhone(value: string) {
  const normalized = normalizePhone(value);
  return normalized.startsWith("80") ? `375${normalized.slice(2)}` : normalized;
}

export function parseCreateOrderInput(value: unknown): CreateOrderInput {
  if (!isRecord(value)) throw new OrderInputError("Неверный формат запроса.");

  const customerName = readString(value, "customerName", { min: 2, max: 100 });
  const rawPhone = readString(value, "customerPhone", { min: 7, max: 30 });
  if (!isValidBelarusianPhone(rawPhone)) {
    throw new OrderInputError("Введите белорусский номер телефона.", "customerPhone");
  }

  const contactMethod = readChoice(value, "contactMethod", ["phone", "telegram"] as const);
  const fulfillmentMethod = readChoice(value, "fulfillmentMethod", ["pickup", "delivery"] as const);
  const deliveryAddress = readOptionalString(value, "deliveryAddress", 300);
  if (fulfillmentMethod === "delivery" && (!deliveryAddress || deliveryAddress.length < 5)) {
    throw new OrderInputError("Укажите адрес доставки.", "deliveryAddress");
  }

  const quantity = value.quantity;
  if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 1000) {
    throw new OrderInputError("Количество должно быть от 1 до 1000.", "quantity");
  }

  const design = value.design ?? null;
  let designLength = 0;
  try {
    designLength = JSON.stringify(design).length;
  } catch {
    throw new OrderInputError("Макет имеет неверный формат.", "design");
  }
  if (designLength > MAX_DESIGN_JSON_LENGTH) {
    throw new OrderInputError("Макет слишком большой для отправки.", "design");
  }

  return {
    customerName,
    customerPhone: normalizeBelarusianPhone(rawPhone),
    contactMethod,
    fulfillmentMethod,
    deliveryAddress,
    comment: readOptionalString(value, "comment", 1000),
    productSlug: readString(value, "productSlug", { max: 64, pattern: /^[a-z0-9-]+$/ }),
    color: readString(value, "color", { max: 64, pattern: /^[a-z0-9-]+$/ }),
    size: readString(value, "size", { max: 32, pattern: /^[a-z0-9-]+$/i }).toLowerCase(),
    printMethodSlug: readString(value, "printMethodSlug", { max: 64, pattern: /^[a-z0-9-]+$/ }),
    printFormatCode: readString(value, "printFormatCode", { max: 16, pattern: /^[a-z0-9-]+$/i }).toUpperCase(),
    placement: readString(value, "placement", { max: 64, pattern: /^[a-z0-9_]+$/ }),
    quantity: quantity as number,
    design,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateOrderQuote(args: {
  productPrice: number;
  colorPrice: number;
  printMethodPrice: number;
  printFormatPrice: number;
  quantity: number;
  discountPercent: number;
}): OrderQuote {
  const baseUnitPrice = roundMoney(
    args.productPrice + args.colorPrice + args.printMethodPrice + args.printFormatPrice,
  );
  const unitPrice = roundMoney(baseUnitPrice * (1 - args.discountPercent / 100));

  return {
    baseUnitPrice,
    unitPrice,
    subtotal: roundMoney(baseUnitPrice * args.quantity),
    discountPercent: args.discountPercent,
    total: roundMoney(unitPrice * args.quantity),
  };
}
