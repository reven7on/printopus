-- Make browser retries return the same order instead of creating duplicates.
ALTER TABLE "orders" ADD COLUMN "submissionId" UUID;
CREATE UNIQUE INDEX "orders_submissionId_key" ON "orders"("submissionId");

-- Durable Telegram delivery queue. The order and its notification are inserted
-- in one transaction; a dedicated worker retries transient failures.
CREATE TYPE "TelegramDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "telegram_deliveries" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "TelegramDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telegram_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_deliveries_orderId_key" ON "telegram_deliveries"("orderId");
CREATE INDEX "telegram_deliveries_status_nextAttemptAt_idx" ON "telegram_deliveries"("status", "nextAttemptAt");

ALTER TABLE "telegram_deliveries"
ADD CONSTRAINT "telegram_deliveries_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Persist the exact customer-visible constructor previews for audit and resend.
CREATE TABLE "order_previews" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "view" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_previews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_previews_storageKey_key" ON "order_previews"("storageKey");
CREATE UNIQUE INDEX "order_previews_orderId_view_key" ON "order_previews"("orderId", "view");
CREATE INDEX "order_previews_orderId_idx" ON "order_previews"("orderId");

ALTER TABLE "order_previews"
ADD CONSTRAINT "order_previews_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
