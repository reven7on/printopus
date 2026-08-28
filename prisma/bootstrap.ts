import "dotenv/config";
import { createSeedDatabaseClient, seedCatalog } from "./seed";

const CATALOG_BOOTSTRAP_LOCK_ID = 2_026_082_501;

async function bootstrapCatalog() {
  const database = createSeedDatabaseClient();
  let created = false;

  try {
    await database.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        WITH catalog_lock AS (
          SELECT pg_advisory_xact_lock(${CATALOG_BOOTSTRAP_LOCK_ID})
        )
        SELECT true AS acquired FROM catalog_lock
      `;
      const productCount = await transaction.product.count();
      if (productCount > 0) return;

      await seedCatalog(transaction);
      created = true;
    }, { timeout: 60_000 });

    console.log(created
      ? "Initial catalog created."
      : "Catalog already exists; bootstrap skipped.");
  } finally {
    await database.$disconnect();
  }
}

bootstrapCatalog().catch((error) => {
  console.error("Catalog bootstrap failed", error);
  process.exitCode = 1;
});
