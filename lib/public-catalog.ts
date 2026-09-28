import "server-only";
import { database } from "./db";
import type { PublicCatalog } from "../app/use-public-catalog";

export async function loadPublicCatalog(): Promise<PublicCatalog> {
  const [products, volumeDiscounts] = await Promise.all([
    database.product.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: {
        slug: true,
        name: true,
        kind: true,
        description: true,
        basePrice: true,
        options: {
          where: { active: true },
          orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
          select: {
            type: true,
            value: true,
            label: true,
            colorHex: true,
            priceDelta: true,
          },
        },
        printMethods: {
          where: {
            active: true,
            printMethod: { active: true },
            formats: { some: { active: true, printFormat: { active: true } } },
          },
          orderBy: { sortOrder: "asc" },
          select: {
            priceDelta: true,
            printMethod: {
              select: { slug: true, name: true, description: true, recommendedFromQuantity: true },
            },
            formats: {
              where: { active: true, printFormat: { active: true } },
              orderBy: { sortOrder: "asc" },
              select: {
                priceDelta: true,
                printFormat: {
                  select: { code: true, widthCm: true, heightCm: true },
                },
              },
            },
          },
        },
      },
    }),
    database.volumeDiscount.findMany({
      where: { active: true },
      orderBy: { minQuantity: "asc" },
      select: { minQuantity: true, percent: true },
    }),
  ]);

  return {
    currency: "BYN",
    products: products.map((product) => ({
      ...product,
      basePrice: Number(product.basePrice),
      options: product.options.map((option) => ({
        ...option,
        priceDelta: 0,
      })),
      printMethods: product.printMethods.map((productMethod) => ({
        ...productMethod.printMethod,
        priceDelta: Number(productMethod.priceDelta),
        formats: productMethod.formats.map((productFormat) => ({
          ...productFormat.printFormat,
          widthCm: Number(productFormat.printFormat.widthCm),
          heightCm: Number(productFormat.printFormat.heightCm),
          priceDelta: Number(productFormat.priceDelta),
        })),
      })),
    })),
    volumeDiscounts: volumeDiscounts.map((discount) => ({
      ...discount,
      percent: Number(discount.percent),
    })),
  };
}

export async function loadPublicCatalogOrNull(): Promise<PublicCatalog | null> {
  try {
    return await loadPublicCatalog();
  } catch (error) {
    console.error("Failed to load initial public catalog", error);
    return null;
  }
}
