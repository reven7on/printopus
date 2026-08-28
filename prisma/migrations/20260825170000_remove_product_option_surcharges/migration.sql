UPDATE "product_options"
SET "priceDelta" = 0
WHERE "type" IN ('COLOR', 'SIZE')
  AND "priceDelta" <> 0;
