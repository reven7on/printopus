import { loadPublicCatalog } from "../../../lib/public-catalog";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await loadPublicCatalog(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Failed to load catalog", error);
    return Response.json(
      { error: { code: "INTERNAL_ERROR", message: "Не удалось загрузить каталог." } },
      { status: 500 },
    );
  }
}
