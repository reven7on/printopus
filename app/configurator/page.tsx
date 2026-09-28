import Configurator from "./configurator-client";
import { loadPublicCatalogOrNull } from "../../lib/public-catalog";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialCatalog = await loadPublicCatalogOrNull();
  return <Configurator initialCatalog={initialCatalog} />;
}
