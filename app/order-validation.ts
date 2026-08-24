export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidBelarusianPhone(value: string) {
  const normalized = normalizePhone(value);
  return /^375\d{9}$/.test(normalized) || /^80\d{9}$/.test(normalized);
}
