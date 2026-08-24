import { database } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const [products, printMethods, printFormats, volumeDiscounts] = await Promise.all([
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
        },
      }),
      database.printMethod.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { slug: true, name: true, description: true, priceDelta: true },
      }),
      database.printFormat.findMany({
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { code: true, widthCm: true, heightCm: true, priceDelta: true },
      }),
      database.volumeDiscount.findMany({
        where: { active: true },
        orderBy: { minQuantity: "asc" },
        select: { minQuantity: true, percent: true },
      }),
    ]);

    return Response.json(
      {
        currency: "BYN",
        products: products.map((product) => ({
          ...product,
          basePrice: Number(product.basePrice),
          options: product.options.map((option) => ({
            ...option,
            priceDelta: Number(option.priceDelta),
          })),
        })),
        printMethods: printMethods.map((method) => ({
          ...method,
          priceDelta: Number(method.priceDelta),
        })),
        printFormats: printFormats.map((format) => ({
          ...format,
          widthCm: Number(format.widthCm),
          heightCm: Number(format.heightCm),
          priceDelta: Number(format.priceDelta),
        })),
        volumeDiscounts: volumeDiscounts.map((discount) => ({
          ...discount,
          percent: Number(discount.percent),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load catalog", error);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить каталог." } }, { status: 500 });
  }
}
