import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const globalForDatabase = globalThis as unknown as { database?: PrismaClient };

function createDatabaseClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const database = globalForDatabase.database ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.database = database;
}
