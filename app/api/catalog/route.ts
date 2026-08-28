import { database } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
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
                select: { slug: true, name: true, description: true },
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

    return Response.json(
      {
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
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to load catalog", error);
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить каталог." } }, { status: 500 });
  }
}
