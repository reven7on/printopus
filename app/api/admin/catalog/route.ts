import { randomUUID } from "node:crypto";
import { Prisma, ProductOptionType } from "../../../../app/generated/prisma/client";
import {
  adminError,
  authorizeAdminRequest,
  readAdminJson,
  writeAuditLog,
} from "../../../../lib/admin-api";
import { database } from "../../../../lib/db";

export const runtime = "nodejs";

type CatalogResource = "product" | "option" | "printMethod" | "printFormat" | "productPrintMethod" | "productPrintFormat" | "discount";

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("INVALID_INPUT");
  return value as Record<string, unknown>;
}

function text(value: unknown, min: number, max: number) {
  if (typeof value !== "string") throw new Error("INVALID_INPUT");
  const result = value.trim();
  if (result.length < min || result.length > max) throw new Error("INVALID_INPUT");
  return result;
}

function optionalText(value: unknown, max: number) {
  if (value === null || value === "") return null;
  return text(value, 1, max);
}

function identifier(value: unknown, max: number, uppercase = false) {
  const result = text(value, 1, max);
  if (!/^[a-z0-9-]+$/i.test(result)) throw new Error("INVALID_INPUT");
  return uppercase ? result.toUpperCase() : result.toLowerCase();
}

function optionIdentifier(label: string) {
  const normalized = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  return normalized || `option-${randomUUID().slice(0, 8)}`;
}

function colorHex(value: unknown) {
  if (value === null || value === "") return null;
  const result = text(value, 4, 9);
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(result)) throw new Error("INVALID_INPUT");
  return result.toLowerCase();
}

function number(value: unknown, min: number, max: number) {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error("INVALID_INPUT");
  return Math.round(result * 100) / 100;
}

function integer(value: unknown, min: number, max: number) {
  const result = number(value, min, max);
  if (!Number.isInteger(result)) throw new Error("INVALID_INPUT");
  return result;
}

function boolean(value: unknown) {
  if (typeof value !== "boolean") throw new Error("INVALID_INPUT");
  return value;
}

function serializeCatalog(data: Awaited<ReturnType<typeof loadCatalog>>) {
  return {
    products: data.products.map((product) => ({
      ...product,
      basePrice: Number(product.basePrice),
      options: product.options.map((option) => ({ ...option, priceDelta: 0 })),
      printMethods: product.printMethods.map((productMethod) => ({
        id: productMethod.id,
        printMethodId: productMethod.printMethodId,
        slug: productMethod.printMethod.slug,
        name: productMethod.printMethod.name,
        description: productMethod.printMethod.description,
        priceDelta: Number(productMethod.priceDelta),
        active: productMethod.active,
        sortOrder: productMethod.sortOrder,
        formats: productMethod.formats.map((productFormat) => ({
          id: productFormat.id,
          printFormatId: productFormat.printFormatId,
          code: productFormat.printFormat.code,
          widthCm: Number(productFormat.printFormat.widthCm),
          heightCm: Number(productFormat.printFormat.heightCm),
          priceDelta: Number(productFormat.priceDelta),
          active: productFormat.active,
          sortOrder: productFormat.sortOrder,
        })),
      })),
    })),
    printMethods: data.printMethods.map((item) => ({ ...item, priceDelta: Number(item.priceDelta) })),
    printFormats: data.printFormats.map((item) => ({
      ...item,
      widthCm: Number(item.widthCm),
      heightCm: Number(item.heightCm),
      priceDelta: Number(item.priceDelta),
    })),
    discounts: data.discounts.map((item) => ({ ...item, percent: Number(item.percent) })),
  };
}

async function loadCatalog() {
  const [products, printMethods, printFormats, discounts] = await Promise.all([
    database.product.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        options: { orderBy: [{ type: "asc" }, { sortOrder: "asc" }] },
        printMethods: {
          orderBy: { sortOrder: "asc" },
          include: {
            printMethod: true,
            formats: { orderBy: { sortOrder: "asc" }, include: { printFormat: true } },
          },
        },
      },
    }),
    database.printMethod.findMany({ orderBy: { sortOrder: "asc" } }),
    database.printFormat.findMany({ orderBy: { sortOrder: "asc" } }),
    database.volumeDiscount.findMany({ orderBy: { minQuantity: "asc" } }),
  ]);
  return { products, printMethods, printFormats, discounts };
}

export async function GET(request: Request) {
  const auth = await authorizeAdminRequest(request);
  if ("response" in auth) return auth.response;
  try {
    return Response.json(serializeCatalog(await loadCatalog()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load admin catalog", error);
    return adminError("INTERNAL_ERROR", "Не удалось загрузить каталог.", 500);
  }
}

function getUpdate(resource: CatalogResource, raw: Record<string, unknown>) {
  if (resource === "product") return {
    ...(raw.name !== undefined ? { name: text(raw.name, 2, 100) } : {}),
    ...(raw.description !== undefined ? { description: optionalText(raw.description, 500) } : {}),
    ...(raw.basePrice !== undefined ? { basePrice: number(raw.basePrice, 0, 100_000) } : {}),
    ...(raw.active !== undefined ? { active: boolean(raw.active) } : {}),
    ...(raw.sortOrder !== undefined ? { sortOrder: integer(raw.sortOrder, 0, 10_000) } : {}),
  };
  if (resource === "option") return {
    ...(raw.label !== undefined ? { label: text(raw.label, 1, 100) } : {}),
    ...(raw.colorHex !== undefined ? { colorHex: colorHex(raw.colorHex) } : {}),
    ...(raw.active !== undefined ? { active: boolean(raw.active) } : {}),
    ...(raw.sortOrder !== undefined ? { sortOrder: integer(raw.sortOrder, 0, 10_000) } : {}),
  };
  if (resource === "printMethod") return {
    ...(raw.name !== undefined ? { name: text(raw.name, 2, 100) } : {}),
    ...(raw.description !== undefined ? { description: optionalText(raw.description, 500) } : {}),
    ...(raw.priceDelta !== undefined ? { priceDelta: number(raw.priceDelta, 0, 100_000) } : {}),
    ...(raw.active !== undefined ? { active: boolean(raw.active) } : {}),
    ...(raw.sortOrder !== undefined ? { sortOrder: integer(raw.sortOrder, 0, 10_000) } : {}),
  };
  if (resource === "printFormat") return {
    ...(raw.widthCm !== undefined ? { widthCm: number(raw.widthCm, 1, 500) } : {}),
    ...(raw.heightCm !== undefined ? { heightCm: number(raw.heightCm, 1, 500) } : {}),
    ...(raw.priceDelta !== undefined ? { priceDelta: number(raw.priceDelta, 0, 100_000) } : {}),
    ...(raw.active !== undefined ? { active: boolean(raw.active) } : {}),
    ...(raw.sortOrder !== undefined ? { sortOrder: integer(raw.sortOrder, 0, 10_000) } : {}),
  };
  if (resource === "productPrintMethod" || resource === "productPrintFormat") return {
    ...(raw.priceDelta !== undefined ? { priceDelta: number(raw.priceDelta, 0, 100_000) } : {}),
    ...(raw.active !== undefined ? { active: boolean(raw.active) } : {}),
    ...(raw.sortOrder !== undefined ? { sortOrder: integer(raw.sortOrder, 0, 10_000) } : {}),
  };
  return {
    ...(raw.minQuantity !== undefined ? { minQuantity: integer(raw.minQuantity, 1, 1_000_000) } : {}),
    ...(raw.percent !== undefined ? { percent: number(raw.percent, 0, 100) } : {}),
    ...(raw.active !== undefined ? { active: boolean(raw.active) } : {}),
  };
}

export async function PATCH(request: Request) {
  const auth = await authorizeAdminRequest(request, true);
  if ("response" in auth) return auth.response;

  try {
    const body = asRecord(await readAdminJson(request));
    const resource = text(body.resource, 1, 32) as CatalogResource;
    if (!["product", "option", "printMethod", "printFormat", "productPrintMethod", "productPrintFormat", "discount"].includes(resource)) throw new Error("INVALID_INPUT");
    const id = text(body.id, 1, 100);
    const changes = getUpdate(resource, asRecord(body.changes));
    if (!Object.keys(changes).length) throw new Error("INVALID_INPUT");

    const result = await database.$transaction(async (transaction) => {
      const updated = resource === "product"
        ? await transaction.product.update({ where: { id }, data: changes })
        : resource === "option"
          ? await transaction.productOption.update({ where: { id }, data: changes })
          : resource === "printMethod"
            ? await transaction.printMethod.update({ where: { id }, data: changes })
            : resource === "printFormat"
              ? await transaction.printFormat.update({ where: { id }, data: changes })
              : resource === "productPrintMethod"
                ? await transaction.productPrintMethod.update({ where: { id }, data: changes })
                : resource === "productPrintFormat"
                  ? await transaction.productPrintFormat.update({ where: { id }, data: changes })
              : await transaction.volumeDiscount.update({ where: { id }, data: changes });
      await writeAuditLog({ actor: auth.identity.username, action: "updated", entity: resource, entityId: id, details: changes }, transaction);
      return updated;
    });

    return Response.json({ item: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return adminError("NOT_FOUND", "Запись не найдена.", 404);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return adminError("DUPLICATE", "Такое значение уже существует.", 409);
    }
    if (error instanceof Error && ["INVALID_INPUT", "INVALID_JSON", "REQUEST_TOO_LARGE"].includes(error.message)) {
      return adminError("INVALID_INPUT", "Проверьте заполненные поля.", 400);
    }
    console.error("Failed to update admin catalog", error);
    return adminError("INTERNAL_ERROR", "Не удалось сохранить изменения.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeAdminRequest(request, true);
  if ("response" in auth) return auth.response;

  try {
    const body = asRecord(await readAdminJson(request));
    const resource = text(body.resource, 1, 32) as CatalogResource;
    const data = asRecord(body.data);
    if (!["option", "printMethod", "printFormat", "productPrintMethod", "productPrintFormat", "discount"].includes(resource)) throw new Error("INVALID_INPUT");

    const created = await database.$transaction(async (transaction) => {
      const requestedOptionType = resource === "option" ? text(data.type, 1, 20) : null;
      if (requestedOptionType && !Object.values(ProductOptionType).includes(requestedOptionType as ProductOptionType)) {
        throw new Error("INVALID_INPUT");
      }
      const requestedOptionLabel = resource === "option" ? text(data.label, 1, 100) : null;
      const requestedColorHex = resource === "option" ? colorHex(data.colorHex ?? null) : null;
      if (requestedOptionType === ProductOptionType.COLOR && !requestedColorHex) throw new Error("INVALID_INPUT");
      const requestedOptionValue = resource === "option"
        ? data.value !== undefined
          ? identifier(data.value, 64)
          : requestedOptionType === ProductOptionType.COLOR
            ? `color-${requestedColorHex?.slice(1)}`
            : optionIdentifier(requestedOptionLabel ?? "")
        : null;
      const item = resource === "option"
        ? await transaction.productOption.create({ data: {
          productId: text(data.productId, 1, 100),
          type: requestedOptionType as ProductOptionType,
          value: requestedOptionValue as string,
          label: requestedOptionLabel as string,
          colorHex: requestedColorHex,
          priceDelta: 0,
        } })
        : resource === "printMethod"
          ? await transaction.printMethod.create({ data: {
            slug: identifier(data.slug, 64),
            name: text(data.name, 2, 100),
            description: optionalText(data.description ?? null, 500),
            priceDelta: number(data.priceDelta, 0, 100_000),
          } })
          : resource === "printFormat"
            ? await transaction.printFormat.create({ data: {
              code: identifier(data.code, 16, true),
              widthCm: number(data.widthCm, 1, 500),
              heightCm: number(data.heightCm, 1, 500),
              priceDelta: number(data.priceDelta, 0, 100_000),
            } })
            : resource === "productPrintMethod"
              ? await transaction.productPrintMethod.create({ data: {
                productId: text(data.productId, 1, 100),
                printMethodId: text(data.printMethodId, 1, 100),
                priceDelta: number(data.priceDelta, 0, 100_000),
              } })
              : resource === "productPrintFormat"
                ? await transaction.productPrintFormat.create({ data: {
                  productPrintMethodId: text(data.productPrintMethodId, 1, 100),
                  printFormatId: text(data.printFormatId, 1, 100),
                  priceDelta: number(data.priceDelta, 0, 100_000),
                } })
            : await transaction.volumeDiscount.create({ data: {
              minQuantity: integer(data.minQuantity, 1, 1_000_000),
              percent: number(data.percent, 0, 100),
            } });
      await writeAuditLog({ actor: auth.identity.username, action: "created", entity: resource, entityId: item.id }, transaction);
      return item;
    });
    return Response.json({ item: created }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return adminError("DUPLICATE", "Такая запись уже существует.", 409);
    }
    if (error instanceof Error && ["INVALID_INPUT", "INVALID_JSON", "REQUEST_TOO_LARGE"].includes(error.message)) {
      return adminError("INVALID_INPUT", "Проверьте заполненные поля.", 400);
    }
    console.error("Failed to create admin catalog item", error);
    return adminError("INTERNAL_ERROR", "Не удалось создать запись.", 500);
  }
}

export async function DELETE(request: Request) {
  const auth = await authorizeAdminRequest(request, true);
  if ("response" in auth) return auth.response;

  try {
    const body = asRecord(await readAdminJson(request));
    const resource = text(body.resource, 1, 32) as Exclude<CatalogResource, "product">;
    if (!["option", "printMethod", "printFormat", "productPrintMethod", "productPrintFormat", "discount"].includes(resource)) throw new Error("INVALID_INPUT");
    const id = text(body.id, 1, 100);

    await database.$transaction(async (transaction) => {
      if (resource === "option") await transaction.productOption.delete({ where: { id } });
      else if (resource === "printMethod") await transaction.printMethod.delete({ where: { id } });
      else if (resource === "printFormat") await transaction.printFormat.delete({ where: { id } });
      else if (resource === "productPrintMethod") await transaction.productPrintMethod.delete({ where: { id } });
      else if (resource === "productPrintFormat") await transaction.productPrintFormat.delete({ where: { id } });
      else await transaction.volumeDiscount.delete({ where: { id } });
      await writeAuditLog({ actor: auth.identity.username, action: "deleted", entity: resource, entityId: id }, transaction);
    });

    return Response.json({ deleted: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return adminError("NOT_FOUND", "Запись уже удалена.", 404);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return adminError("IN_USE", "Эта запись используется в заказах. Спрячьте её переключателем доступности.", 409);
    }
    if (error instanceof Error && ["INVALID_INPUT", "INVALID_JSON", "REQUEST_TOO_LARGE"].includes(error.message)) {
      return adminError("INVALID_INPUT", "Не удалось определить запись для удаления.", 400);
    }
    console.error("Failed to delete admin catalog item", error);
    return adminError("INTERNAL_ERROR", "Не удалось удалить запись.", 500);
  }
}
