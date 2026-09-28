import { isValidBelarusianPhone, normalizeBelarusianPhone } from "../app/order-validation.ts";

const MAX_DESIGN_JSON_LENGTH = 200_000;
const MAX_DESIGN_ELEMENTS_PER_VIEW = 40;
const MAX_DESIGN_ELEMENTS_TOTAL = 100;
const DESIGN_ELEMENT_ID_PATTERN = /^[a-z0-9_-]{1,100}$/i;
const DESIGN_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const ORDER_DESIGN_VIEWS = ["front", "back", "sleeve_left", "sleeve_right"] as const;
export type OrderDesignView = typeof ORDER_DESIGN_VIEWS[number];

type OrderDesignElementBase = {
  id: string;
  type: "image" | "text" | "shape";
  name: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
};

export type OrderDesignElement = OrderDesignElementBase & {
  uploadId?: string;
  content?: string;
  aspectRatio?: number;
  quality?: "good" | "medium" | "low" | "vector";
  color?: string;
  fontFamily?: string;
  fontWeight?: 500 | 800;
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right";
  outlined?: boolean;
  curve?: number;
};

export type OrderDesign = Partial<Record<OrderDesignView, OrderDesignElement[]>>;

export type OrderSizeDistributionEntry = {
  size: string;
  quantity: number;
};

export type CreateOrderInput = {
  submissionId: string | null;
  customerName: string;
  customerPhone: string;
  contactMethod: "phone" | "telegram";
  fulfillmentMethod: "pickup" | "delivery";
  deliveryAddress: string | null;
  comment: string | null;
  productSlug: string;
  color: string;
  size: string;
  sizeDistribution: OrderSizeDistributionEntry[] | null;
  printMethodSlug: string;
  printFormatCode: string;
  placement: string;
  quantity: number;
  design: OrderDesign | null;
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

const DESIGN_SHAPES = new Set([
  "star", "heart", "line", "triangle", "circle", "square", "burst", "sparkle",
  "semicircle", "arch", "badge", "diamond", "lightning", "flame", "crown", "sun",
  "moon", "flower", "leaf", "mountain", "rocket", "coffee", "headphones", "camera",
  "music", "gift", "snowflake", "planet", "trophy", "smile",
]);

function designError() {
  return new OrderInputError("Макет содержит недопустимые данные.", "design");
}

function designString(value: unknown, max: number, pattern?: RegExp) {
  if (typeof value !== "string") throw designError();
  const result = value.trim();
  if (!result || result.length > max || (pattern && !pattern.test(result))) throw designError();
  return result;
}

function designNumber(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw designError();
  }
  return Math.round(value * 100) / 100;
}

function designRotation(value: unknown) {
  const rotation = designNumber(value, -100_000, 100_000);
  return Math.round((((rotation % 360) + 360) % 360) * 100) / 100;
}

function optionalDesignNumber(source: Record<string, unknown>, field: string, min: number, max: number) {
  return source[field] === undefined ? undefined : designNumber(source[field], min, max);
}

function parseDesignElement(value: unknown): OrderDesignElement {
  if (!isRecord(value)) throw designError();

  const id = designString(value.id, 100, DESIGN_ELEMENT_ID_PATTERN);
  const type = value.type;
  if (type !== "image" && type !== "text" && type !== "shape") throw designError();

  const common: OrderDesignElementBase = {
    id,
    type,
    name: typeof value.name === "string" && value.name.trim()
      ? designString(value.name, 180)
      : type === "image" ? "Изображение" : type === "text" ? "Текст" : "Фигура",
    x: designNumber(value.x, 0, 100),
    y: designNumber(value.y, 0, 100),
    scale: designNumber(value.scale, 0.1, 5),
    rotation: designRotation(value.rotation),
    width: designNumber(value.width, 1, 100),
  };

  const aspectRatio = optionalDesignNumber(value, "aspectRatio", 0.01, 100);
  if (type === "image") {
    const uploadId = designString(value.uploadId, 100, DESIGN_ELEMENT_ID_PATTERN);
    const quality = value.quality;
    if (quality !== undefined && !["good", "medium", "low", "vector"].includes(String(quality))) {
      throw designError();
    }
    return {
      ...common,
      uploadId,
      ...(aspectRatio === undefined ? {} : { aspectRatio }),
      ...(quality === undefined ? {} : { quality: quality as OrderDesignElement["quality"] }),
    };
  }

  const content = designString(value.content, type === "text" ? 60 : 32);
  const color = designString(value.color ?? "#111111", 7, DESIGN_COLOR_PATTERN).toLowerCase();
  if (type === "shape") {
    if (!DESIGN_SHAPES.has(content)) throw designError();
    return { ...common, content, color, ...(aspectRatio === undefined ? {} : { aspectRatio }) };
  }

  const fontFamily = typeof value.fontFamily === "string"
    ? designString(value.fontFamily, 160)
    : "Inter";
  const fontWeight = value.fontWeight === 500 ? 500 : value.fontWeight === 800 ? 800 : undefined;
  if (value.fontWeight !== undefined && fontWeight === undefined) throw designError();
  const fontStyle = value.fontStyle;
  if (fontStyle !== undefined && fontStyle !== "normal" && fontStyle !== "italic") throw designError();
  const textAlign = value.textAlign;
  if (textAlign !== undefined && textAlign !== "left" && textAlign !== "center" && textAlign !== "right") {
    throw designError();
  }
  if (value.outlined !== undefined && typeof value.outlined !== "boolean") throw designError();

  return {
    ...common,
    content,
    color,
    fontFamily,
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(fontStyle === undefined ? {} : { fontStyle }),
    ...(textAlign === undefined ? {} : { textAlign }),
    ...(value.outlined === undefined ? {} : { outlined: value.outlined }),
    ...(value.letterSpacing === undefined ? {} : { letterSpacing: designNumber(value.letterSpacing, -10, 50) }),
    ...(value.curve === undefined ? {} : { curve: designNumber(value.curve, -100, 100) }),
  };
}

function parseOrderDesign(value: unknown): OrderDesign | null {
  if (value === null) return null;
  if (!isRecord(value)) throw designError();

  const unknownView = Object.keys(value).find((view) => !ORDER_DESIGN_VIEWS.includes(view as OrderDesignView));
  if (unknownView) throw designError();

  const design: OrderDesign = {};
  let totalElements = 0;
  const elementIds = new Set<string>();
  for (const view of ORDER_DESIGN_VIEWS) {
    const rawElements = value[view];
    if (rawElements === undefined) continue;
    if (!Array.isArray(rawElements) || rawElements.length > MAX_DESIGN_ELEMENTS_PER_VIEW) throw designError();
    totalElements += rawElements.length;
    if (totalElements > MAX_DESIGN_ELEMENTS_TOTAL) throw designError();
    design[view] = rawElements.map((rawElement) => {
      const element = parseDesignElement(rawElement);
      if (elementIds.has(element.id)) throw designError();
      elementIds.add(element.id);
      return element;
    });
  }
  return design;
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

function readOptionalUuid(source: Record<string, unknown>, field: string) {
  const value = source[field];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new OrderInputError("Идентификатор отправки имеет неверный формат.", field);
  }
  return value.toLowerCase();
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

function parseSizeDistribution(value: unknown, totalQuantity: number): OrderSizeDistributionEntry[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > 30) {
    throw new OrderInputError("Распределение по размерам заполнено неверно.", "sizeDistribution");
  }

  const seenSizes = new Set<string>();
  let distributedQuantity = 0;
  const distribution = value.map((entry) => {
    if (!isRecord(entry)) {
      throw new OrderInputError("Распределение по размерам заполнено неверно.", "sizeDistribution");
    }
    const size = readString(entry, "size", { max: 32, pattern: /^[a-z0-9-]+$/i }).toLowerCase();
    if (seenSizes.has(size)) {
      throw new OrderInputError("Размеры в распределении не должны повторяться.", "sizeDistribution");
    }
    const quantity = entry.quantity;
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 1000) {
      throw new OrderInputError("Количество для каждого размера должно быть больше нуля.", "sizeDistribution");
    }
    seenSizes.add(size);
    distributedQuantity += quantity as number;
    return { size, quantity: quantity as number };
  });

  if (distributedQuantity !== totalQuantity) {
    throw new OrderInputError("Сумма по размерам должна совпадать с общим тиражом.", "sizeDistribution");
  }
  return distribution;
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

  const rawDesign = value.design ?? null;
  let designLength = 0;
  try {
    designLength = JSON.stringify(rawDesign).length;
  } catch {
    throw new OrderInputError("Макет имеет неверный формат.", "design");
  }
  if (designLength > MAX_DESIGN_JSON_LENGTH) {
    throw new OrderInputError("Макет слишком большой для отправки.", "design");
  }
  const design = parseOrderDesign(rawDesign);
  const sizeDistribution = parseSizeDistribution(value.sizeDistribution, quantity as number);

  return {
    submissionId: readOptionalUuid(value, "submissionId"),
    customerName,
    customerPhone: normalizeBelarusianPhone(rawPhone)!,
    contactMethod,
    fulfillmentMethod,
    deliveryAddress,
    comment: readOptionalString(value, "comment", 1000),
    productSlug: readString(value, "productSlug", { max: 64, pattern: /^[a-z0-9-]+$/ }),
    color: readString(value, "color", { max: 64, pattern: /^[a-z0-9-]+$/ }),
    size: readString(value, "size", { max: 32, pattern: /^[a-z0-9-]+$/i }).toLowerCase(),
    sizeDistribution,
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
