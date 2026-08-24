import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ProductKind, ProductOptionType } from "../app/generated/prisma/client";
import { PRINT_FORMATS, PRODUCT_BASE_PRICES } from "../app/pricing";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for seeding.");

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const products = [
  { slug: "shirt", name: "Футболка", kind: ProductKind.SHIRT, description: "100% хлопковый трикотаж", basePrice: PRODUCT_BASE_PRICES.shirt, sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], colors: ["white", "black", "khaki", "grey", "navy", "red", "burgundy"] },
  { slug: "hoodie", name: "Толстовка", kind: ProductKind.HOODIE, description: "Утеплённый футер 320 г/м²", basePrice: PRODUCT_BASE_PRICES.hoodie, sizes: ["XS", "S", "M", "L", "XL", "2XL", "3XL"], colors: ["white", "black", "grey", "navy", "red", "burgundy"] },
  { slug: "polo", name: "Поло", kind: ProductKind.POLO, description: "Классическое пике 220 г/м²", basePrice: PRODUCT_BASE_PRICES.polo, sizes: ["S", "M", "L", "XL", "2XL", "3XL"], colors: ["white", "black", "grey", "navy", "blue", "sand"] },
  { slug: "cap", name: "Кепка", kind: ProductKind.CAP, description: "Шестипанельная классическая модель", basePrice: PRODUCT_BASE_PRICES.cap, sizes: ["universal"], colors: ["white", "black", "grey", "darkgrey", "navy", "red", "blue"] },
  { slug: "bag", name: "Шопер", kind: ProductKind.BAG, description: "Плотный натуральный канвас", basePrice: PRODUCT_BASE_PRICES.bag, sizes: ["one-size"], colors: ["white", "natural", "black", "navy", "red", "blue", "green", "khaki", "burgundy"] },
] as const;

const colorDetails: Record<string, { label: string; colorHex: string; priceDelta: number }> = {
  white: { label: "Белый", colorHex: "#ffffff", priceDelta: 0 },
  natural: { label: "Натуральный", colorHex: "#e8dcc7", priceDelta: 0 },
  black: { label: "Чёрный", colorHex: "#111111", priceDelta: 2 },
  khaki: { label: "Хаки / Олива", colorHex: "#77735b", priceDelta: 2 },
  grey: { label: "Меланж", colorHex: "#b6b6b6", priceDelta: 1 },
  darkgrey: { label: "Тёмно-серый", colorHex: "#55585d", priceDelta: 1 },
  navy: { label: "Тёмно-синий", colorHex: "#1f2a44", priceDelta: 2 },
  blue: { label: "Синий", colorHex: "#2b49b3", priceDelta: 2 },
  red: { label: "Красный", colorHex: "#d71920", priceDelta: 2 },
  burgundy: { label: "Бордовый", colorHex: "#750033", priceDelta: 2 },
  green: { label: "Зелёный", colorHex: "#07462c", priceDelta: 2 },
  sand: { label: "Песочный", colorHex: "#ebe4dc", priceDelta: 2 },
};

async function seed() {
  for (const [sortOrder, item] of products.entries()) {
    const product = await database.product.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        kind: item.kind,
        description: item.description,
        basePrice: item.basePrice,
        sortOrder,
        active: true,
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
        update: { ...details, sortOrder: optionOrder, active: true },
        create: { productId: product.id, type: ProductOptionType.COLOR, value: color, ...details, sortOrder: optionOrder },
      });
    }

    for (const [optionOrder, size] of item.sizes.entries()) {
      await database.productOption.upsert({
        where: { productId_type_value: { productId: product.id, type: ProductOptionType.SIZE, value: size.toLowerCase() } },
        update: { label: size, sortOrder: optionOrder, active: true },
        create: { productId: product.id, type: ProductOptionType.SIZE, value: size.toLowerCase(), label: size, sortOrder: optionOrder },
      });
    }
  }

  const printMethods = [
    { slug: "dtf", name: "DTF-печать", description: "Полноцветные изображения и градиенты", priceDelta: 4, sortOrder: 0 },
    { slug: "silk", name: "Шелкография", description: "Стойкая печать для средних и крупных тиражей", priceDelta: 3, sortOrder: 1 },
    { slug: "embroidery", name: "Вышивка", description: "Фактурное нанесение для логотипов и надписей", priceDelta: 6, sortOrder: 2 },
  ];

  for (const method of printMethods) {
    await database.printMethod.upsert({ where: { slug: method.slug }, update: method, create: method });
  }

  for (const [sortOrder, format] of PRINT_FORMATS.entries()) {
    await database.printFormat.upsert({
      where: { code: format.id },
      update: { widthCm: format.width, heightCm: format.height, priceDelta: format.add, sortOrder, active: true },
      create: { code: format.id, widthCm: format.width, heightCm: format.height, priceDelta: format.add, sortOrder },
    });
  }

  for (const discount of [
    { minQuantity: 20, percent: 5 },
    { minQuantity: 50, percent: 11 },
    { minQuantity: 100, percent: 18 },
    { minQuantity: 200, percent: 24 },
  ]) {
    await database.volumeDiscount.upsert({
      where: { minQuantity: discount.minQuantity },
      update: { percent: discount.percent, active: true },
      create: discount,
    });
  }
}

seed()
  .then(() => database.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await database.$disconnect();
    process.exitCode = 1;
  });
