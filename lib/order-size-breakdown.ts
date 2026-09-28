export type OrderSizeBreakdownEntry = {
  value: string;
  label: string;
  quantity: number;
};

export function normalizeOrderSizeBreakdown(value: unknown): OrderSizeBreakdownEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.value !== "string"
      || typeof candidate.label !== "string"
      || !Number.isInteger(candidate.quantity)
      || (candidate.quantity as number) < 1
    ) return [];
    return [{
      value: candidate.value,
      label: candidate.label,
      quantity: candidate.quantity as number,
    }];
  });
  return entries.length > 0 ? entries : null;
}
