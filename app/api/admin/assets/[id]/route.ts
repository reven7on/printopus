import { adminError, authorizeAdminRequest } from "../../../../../lib/admin-api";
import { database } from "../../../../../lib/db";
import { readStoredAsset } from "../../../../../lib/local-file-storage";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function downloadName(name: string) {
  const ascii = name.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 100) || "design-image";
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorizeAdminRequest(request);
  if ("response" in auth) return auth.response;
  const { id } = await context.params;

  try {
    const asset = await database.designAsset.findUnique({ where: { id } });
    if (!asset) return adminError("NOT_FOUND", "Файл не найден.", 404);
    const bytes = await readStoredAsset(asset.storageKey);
    const isPreview = new URL(request.url).searchParams.get("preview") === "1" && asset.mimeType.startsWith("image/");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": isPreview ? "inline" : downloadName(asset.originalName),
        "Content-Length": String(bytes.byteLength),
        "Content-Type": asset.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return adminError("FILE_MISSING", "Запись о файле есть, но файл отсутствует на диске.", 410);
    }
    console.error("Failed to download design asset", error);
    return adminError("INTERNAL_ERROR", "Не удалось скачать файл.", 500);
  }
}
