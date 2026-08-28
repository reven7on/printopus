-- CreateTable
CREATE TABLE "product_print_methods" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "printMethodId" UUID NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_print_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_print_formats" (
    "id" UUID NOT NULL,
    "productPrintMethodId" UUID NOT NULL,
    "printFormatId" UUID NOT NULL,
    "priceDelta" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_print_formats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_print_methods_productId_printMethodId_key"
ON "product_print_methods"("productId", "printMethodId");

-- CreateIndex
CREATE INDEX "product_print_methods_productId_active_sortOrder_idx"
ON "product_print_methods"("productId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_print_formats_productPrintMethodId_printFormatId_key"
ON "product_print_formats"("productPrintMethodId", "printFormatId");

-- CreateIndex
CREATE INDEX "product_print_formats_productPrintMethodId_active_sortOrder_idx"
ON "product_print_formats"("productPrintMethodId", "active", "sortOrder");

-- AddForeignKey
ALTER TABLE "product_print_methods"
ADD CONSTRAINT "product_print_methods_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_print_methods"
ADD CONSTRAINT "product_print_methods_printMethodId_fkey"
FOREIGN KEY ("printMethodId") REFERENCES "print_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_print_formats"
ADD CONSTRAINT "product_print_formats_productPrintMethodId_fkey"
FOREIGN KEY ("productPrintMethodId") REFERENCES "product_print_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_print_formats"
ADD CONSTRAINT "product_print_formats_printFormatId_fkey"
FOREIGN KEY ("printFormatId") REFERENCES "print_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the existing method prices while making availability product-specific.
INSERT INTO "product_print_methods" (
    "id", "productId", "printMethodId", "priceDelta", "active", "sortOrder"
)
SELECT
    gen_random_uuid(), product."id", method."id", method."priceDelta", true, method."sortOrder"
FROM "products" product
CROSS JOIN "print_methods" method
WHERE product."slug" <> 'cap' OR method."slug" IN ('dtf', 'embroidery');

-- Preserve existing format surcharges and start with realistic compatibility.
INSERT INTO "product_print_formats" (
    "id", "productPrintMethodId", "printFormatId", "priceDelta", "active", "sortOrder"
)
SELECT
    gen_random_uuid(), product_method."id", format."id", format."priceDelta", true, format."sortOrder"
FROM "product_print_methods" product_method
JOIN "products" product ON product."id" = product_method."productId"
JOIN "print_methods" method ON method."id" = product_method."printMethodId"
CROSS JOIN "print_formats" format
WHERE
    (product."slug" = 'cap' AND format."code" IN ('A7', 'A6'))
    OR (product."slug" <> 'cap' AND method."slug" = 'embroidery' AND format."code" IN ('A7', 'A6', 'A5'))
    OR (product."slug" <> 'cap' AND method."slug" <> 'embroidery');

-- Data integrity checks
ALTER TABLE "product_print_methods"
ADD CONSTRAINT "product_print_methods_price_check" CHECK ("priceDelta" >= 0);

ALTER TABLE "product_print_formats"
ADD CONSTRAINT "product_print_formats_price_check" CHECK ("priceDelta" >= 0);
