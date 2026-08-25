import { database } from "../../../lib/db";
import { ensureUploadCapacity } from "../../../lib/local-file-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await Promise.all([
      database.$queryRaw`SELECT 1`,
      ensureUploadCapacity(),
    ]);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
