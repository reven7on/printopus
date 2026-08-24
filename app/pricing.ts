export const PRODUCT_BASE_PRICES = {
  shirt: 15,
  hoodie: 45,
  polo: 25,
  cap: 12,
  bag: 10,
} as const;

export const DEFAULT_PRINT_METHOD_PRICE = 4;

export const GARMENT_COLOR_PRICES = {
  white: 0,
  natural: 0,
  black: 2,
  khaki: 2,
  grey: 2,
  darkgrey: 2,
  navy: 2,
  blue: 2,
  red: 2,
  burgundy: 2,
  green: 2,
  sand: 2,
} as const;

export const PRINT_FORMATS = [
  { id: "A7", label: "A7", dimensions: "7,4 × 10,5 см", landingLabel: "маленький логотип", scale: "xs", width: 7.4, height: 10.5, add: 0 },
  { id: "A6", label: "A6", dimensions: "10,5 × 14,8 см", landingLabel: "небольшой принт", scale: "sm", width: 10.5, height: 14.8, add: 2 },
  { id: "A5", label: "A5", dimensions: "14,8 × 21,0 см", landingLabel: "компактный принт", scale: "md", width: 14.8, height: 21, add: 4 },
  { id: "A4", label: "A4", dimensions: "21,0 × 29,7 см", landingLabel: "стандартный принт", scale: "lg", width: 21, height: 29.7, add: 7 },
  { id: "A3", label: "A3", dimensions: "29,7 × 42,0 см", landingLabel: "крупный принт", scale: "xl", width: 29.7, height: 42, add: 11 },
] as const;

export const FIRST_VOLUME_DISCOUNT_QUANTITY = 20;
export const MAX_VOLUME_DISCOUNT_PERCENT = 24;

export function getQuantityDiscount(qty: number) {
  if (qty >= 200) return { percent: 24, multiplier: 0.76, nextAt: null };
  if (qty >= 100) return { percent: 18, multiplier: 0.82, nextAt: 200 };
  if (qty >= 50) return { percent: 11, multiplier: 0.89, nextAt: 100 };
  if (qty >= 20) return { percent: 5, multiplier: 0.95, nextAt: 50 };
  return { percent: 0, multiplier: 1, nextAt: 20 };
}
