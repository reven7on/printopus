-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SHIRT', 'HOODIE', 'POLO', 'CAP', 'BAG');

-- CreateEnum
CREATE TYPE "ProductOptionType" AS ENUM ('COLOR', 'SIZE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('PHONE', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "FulfillmentMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "description" TEXT,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "type" "ProductOptionType" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "colorHex" TEXT,
    "priceDelta" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_methods" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceDelta" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "print_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_formats" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "widthCm" DECIMAL(6,2) NOT NULL,
    "heightCm" DECIMAL(6,2) NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "print_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volume_discounts" (
    "id" UUID NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "percent" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "volume_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "contactMethod" "ContactMethod" NOT NULL DEFAULT 'PHONE',
    "fulfillmentMethod" "FulfillmentMethod" NOT NULL DEFAULT 'PICKUP',
    "deliveryAddress" TEXT,
    "comment" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'BYN',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID,
    "printMethodId" UUID,
    "printFormatId" UUID,
    "productName" TEXT NOT NULL,
    "colorLabel" TEXT,
    "sizeLabel" TEXT,
    "placement" TEXT,
    "quantity" INTEGER NOT NULL,
    "baseUnitPrice" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "design" JSONB,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_assets" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_active_sortOrder_idx" ON "products"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "product_options_productId_type_active_sortOrder_idx" ON "product_options"("productId", "type", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_productId_type_value_key" ON "product_options"("productId", "type", "value");

-- CreateIndex
CREATE UNIQUE INDEX "print_methods_slug_key" ON "print_methods"("slug");

-- CreateIndex
CREATE INDEX "print_methods_active_sortOrder_idx" ON "print_methods"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "print_formats_code_key" ON "print_formats"("code");

-- CreateIndex
CREATE INDEX "print_formats_active_sortOrder_idx" ON "print_formats"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "volume_discounts_minQuantity_key" ON "volume_discounts"("minQuantity");

-- CreateIndex
CREATE INDEX "volume_discounts_active_minQuantity_idx" ON "volume_discounts"("active", "minQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_customerPhone_idx" ON "orders"("customerPhone");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "design_assets_storageKey_key" ON "design_assets"("storageKey");

-- CreateIndex
CREATE INDEX "design_assets_orderItemId_idx" ON "design_assets"("orderItemId");

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_printMethodId_fkey" FOREIGN KEY ("printMethodId") REFERENCES "print_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_printFormatId_fkey" FOREIGN KEY ("printFormatId") REFERENCES "print_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data integrity checks
ALTER TABLE "volume_discounts" ADD CONSTRAINT "volume_discounts_quantity_check" CHECK ("minQuantity" > 0);
ALTER TABLE "volume_discounts" ADD CONSTRAINT "volume_discounts_percent_check" CHECK ("percent" >= 0 AND "percent" <= 100);
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check" CHECK ("subtotal" >= 0 AND "total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_check" CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_amounts_check" CHECK ("baseUnitPrice" >= 0 AND "unitPrice" >= 0 AND "total" >= 0);
ALTER TABLE "design_assets" ADD CONSTRAINT "design_assets_size_check" CHECK ("sizeBytes" >= 0);
