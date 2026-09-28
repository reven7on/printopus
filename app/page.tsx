import Home from "./home-client";
import { loadPublicCatalogOrNull } from "../lib/public-catalog";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialCatalog = await loadPublicCatalogOrNull();
  return <Home initialCatalog={initialCatalog} />;
}
