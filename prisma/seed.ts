import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { pathToFileURL } from "node:url";
import { Prisma, PrismaClient, ProductKind, ProductOptionType } from "../app/generated/prisma/client";
import { GARMENT_COLOR_PRICES, PRINT_FORMATS, PRODUCT_BASE_PRICES } from "../app/pricing";

type SeedDatabase = Pick<
  Prisma.TransactionClient,
  "product" | "productOption" | "printMethod" | "printFormat" | "productPrintMethod" | "productPrintFormat" | "volumeDiscount"
>;

export function createSeedDatabaseClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for seeding.");
  const schema = new URL(connectionString).searchParams.get("schema")?.trim() || undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }, { schema }) });
}

const products = [
  { slug: "shirt", name: "Футболка", kind: ProductKind.SHIRT, description: "100% хлопковый трикотаж", basePrice: PRODUCT_BASE_PRICES.shirt, sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], colors: ["white", "black", "khaki", "grey", "navy", "red", "burgundy"] },
  { slug: "hoodie", name: "Толстовка", kind: ProductKind.HOODIE, description: "Утеплённый футер 320 г/м²", basePrice: PRODUCT_BASE_PRICES.hoodie, sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], colors: ["white", "black", "grey", "navy", "red", "burgundy"] },
  { slug: "polo", name: "Поло", kind: ProductKind.POLO, description: "Классическое пике 220 г/м²", basePrice: PRODUCT_BASE_PRICES.polo, sizes: ["S", "M", "L", "XL", "2XL", "3XL"], colors: ["white", "black", "grey", "navy", "blue", "sand"] },
  { slug: "cap", name: "Кепка", kind: ProductKind.CAP, description: "Шестипанельная классическая модель", basePrice: PRODUCT_BASE_PRICES.cap, sizes: ["universal"], colors: ["white", "black", "grey", "darkgrey", "navy", "red", "blue"] },
  { slug: "bag", name: "Шопер", kind: ProductKind.BAG, description: "Плотный натуральный канвас", basePrice: PRODUCT_BASE_PRICES.bag, sizes: ["one-size"], colors: ["white", "natural", "black", "navy", "red", "blue", "green", "khaki", "burgundy"] },
] as const;

const colorDetails: Record<string, { label: string; colorHex: string; priceDelta: number }> = {
  white: { label: "Белый", colorHex: "#ffffff", priceDelta: GARMENT_COLOR_PRICES.white },
  natural: { label: "Натуральный", colorHex: "#e8dcc7", priceDelta: GARMENT_COLOR_PRICES.natural },
  black: { label: "Чёрный", colorHex: "#111111", priceDelta: GARMENT_COLOR_PRICES.black },
  khaki: { label: "Хаки / Олива", colorHex: "#77735b", priceDelta: GARMENT_COLOR_PRICES.khaki },
  grey: { label: "Меланж", colorHex: "#b6b6b6", priceDelta: GARMENT_COLOR_PRICES.grey },
  darkgrey: { label: "Тёмно-серый", colorHex: "#55585d", priceDelta: GARMENT_COLOR_PRICES.darkgrey },
  navy: { label: "Тёмно-синий", colorHex: "#1f2a44", priceDelta: GARMENT_COLOR_PRICES.navy },
  blue: { label: "Синий", colorHex: "#2b49b3", priceDelta: GARMENT_COLOR_PRICES.blue },
  red: { label: "Красный", colorHex: "#d71920", priceDelta: GARMENT_COLOR_PRICES.red },
  burgundy: { label: "Бордовый", colorHex: "#750033", priceDelta: GARMENT_COLOR_PRICES.burgundy },
  green: { label: "Зелёный", colorHex: "#07462c", priceDelta: GARMENT_COLOR_PRICES.green },
  sand: { label: "Песочный", colorHex: "#ebe4dc", priceDelta: GARMENT_COLOR_PRICES.sand },
};

export async function seedCatalog(database: SeedDatabase) {
  for (const [sortOrder, item] of products.entries()) {
    const product = await database.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        kind: item.kind,
        description: item.description,
        basePrice: item.basePrice,
        sortOrder,
      },
      create: {
        slug: item.slug,
        name: item.name,
        kind: item.kind,
        description: item.description,
        basePrice: item.basePrice,
        sortOrder,
      },
    });

    for (const [optionOrder, color] of item.colors.entries()) {
      const details = colorDetails[color];
      await database.productOption.upsert({
        where: { productId_type_value: { productId: product.id, type: ProductOptionType.COLOR, value: color } },
        update: { ...details, sortOrder: optionOrder },
        create: { productId: product.id, type: ProductOptionType.COLOR, value: color, ...details, sortOrder: optionOrder },
      });
    }

    for (const [optionOrder, size] of item.sizes.entries()) {
      await database.productOption.upsert({
        where: { productId_type_value: { productId: product.id, type: ProductOptionType.SIZE, value: size.toLowerCase() } },
        update: { label: size, sortOrder: optionOrder },
        create: { productId: product.id, type: ProductOptionType.SIZE, value: size.toLowerCase(), label: size, sortOrder: optionOrder },
      });
    }
  }

  const printMethods = [
    { slug: "dtf", name: "DTF-печать", description: "Полноцветные изображения и градиенты", priceDelta: 4, recommendedFromQuantity: null, sortOrder: 0 },
    { slug: "silk", name: "Шелкография", description: "Стойкая печать для средних и крупных тиражей", priceDelta: 3, recommendedFromQuantity: 30, sortOrder: 1 },
    { slug: "embroidery", name: "Вышивка", description: "Фактурное нанесение для логотипов и надписей", priceDelta: 6, recommendedFromQuantity: null, sortOrder: 2 },
  ];

  for (const method of printMethods) {
    await database.printMethod.upsert({ where: { slug: method.slug }, update: method, create: method });
  }

  for (const [sortOrder, format] of PRINT_FORMATS.entries()) {
    await database.printFormat.upsert({
      where: { code: format.id },
      update: { widthCm: format.width, heightCm: format.height, priceDelta: format.add, sortOrder },
      create: { code: format.id, widthCm: format.width, heightCm: format.height, priceDelta: format.add, sortOrder },
    });
  }

  const [seedProducts, seedMethods, seedFormats] = await Promise.all([
    database.product.findMany({ select: { id: true, slug: true } }),
    database.printMethod.findMany({ select: { id: true, slug: true, priceDelta: true, sortOrder: true } }),
    database.printFormat.findMany({ select: { id: true, code: true, priceDelta: true, sortOrder: true } }),
  ]);

  for (const product of seedProducts) {
    for (const method of seedMethods) {
      if (product.slug === "cap" && !["dtf", "embroidery"].includes(method.slug)) continue;
      const productMethod = await database.productPrintMethod.upsert({
        where: { productId_printMethodId: { productId: product.id, printMethodId: method.id } },
        update: { priceDelta: method.priceDelta, sortOrder: method.sortOrder },
        create: {
          productId: product.id,
          printMethodId: method.id,
          priceDelta: method.priceDelta,
          sortOrder: method.sortOrder,
        },
      });

      for (const format of seedFormats) {
        const allowed = product.slug === "cap"
          ? ["A7", "A6"].includes(format.code)
          : method.slug === "embroidery"
            ? ["A7", "A6", "A5"].includes(format.code)
            : true;
        if (!allowed) continue;
        await database.productPrintFormat.upsert({
          where: {
            productPrintMethodId_printFormatId: {
              productPrintMethodId: productMethod.id,
              printFormatId: format.id,
            },
          },
          update: { priceDelta: format.priceDelta, sortOrder: format.sortOrder },
          create: {
            productPrintMethodId: productMethod.id,
            printFormatId: format.id,
            priceDelta: format.priceDelta,
            sortOrder: format.sortOrder,
          },
        });
      }
    }
  }

  for (const discount of [
    { minQuantity: 20, percent: 5 },
    { minQuantity: 50, percent: 11 },
    { minQuantity: 100, percent: 18 },
    { minQuantity: 200, percent: 24 },
  ]) {
    await database.volumeDiscount.upsert({
      where: { minQuantity: discount.minQuantity },
      update: { percent: discount.percent },
      create: discount,
    });
  }
}

async function runSeed() {
  const database = createSeedDatabaseClient();
  try {
    await seedCatalog(database);
  } finally {
    await database.$disconnect();
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryPoint === import.meta.url) {
  runSeed().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
