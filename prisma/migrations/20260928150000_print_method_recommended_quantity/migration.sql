ALTER TABLE "print_methods"
ADD COLUMN "recommendedFromQuantity" INTEGER;

UPDATE "print_methods"
SET "recommendedFromQuantity" = 30
WHERE "slug" = 'silk';
