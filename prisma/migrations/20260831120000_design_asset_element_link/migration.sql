ALTER TABLE "design_assets"
ADD COLUMN "designElementId" TEXT;

CREATE INDEX "design_assets_orderItemId_designElementId_idx"
ON "design_assets"("orderItemId", "designElementId");
