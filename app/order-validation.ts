export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeBelarusianPhone(value: string) {
  const digits = normalizePhone(value);
  const canonical = digits.startsWith("80") ? `375${digits.slice(2)}` : digits;
  return /^375\d{9}$/.test(canonical) ? canonical : null;
}

export function formatBelarusianPhoneInput(value: string) {
  const digits = normalizePhone(value);
  if (!digits) return "";

  const localNumber = (
    digits.startsWith("375")
      ? digits.slice(3)
      : digits.startsWith("80")
        ? digits.slice(2)
        : digits
  ).slice(0, 9);

  if (!localNumber) return "+375";

  const operatorCode = localNumber.slice(0, 2);
  const firstPart = localNumber.slice(2, 5);
  const secondPart = localNumber.slice(5, 7);
  const thirdPart = localNumber.slice(7, 9);

  let formatted = `+375 (${operatorCode}`;
  if (operatorCode.length === 2) formatted += ")";
  if (firstPart) formatted += ` ${firstPart}`;
  if (secondPart) formatted += `-${secondPart}`;
  if (thirdPart) formatted += `-${thirdPart}`;
  return formatted;
}

export function formatBelarusianPhone(value: string) {
  const canonical = normalizeBelarusianPhone(value);
  if (!canonical) return value.replace(/^\++/, "+");
  return `+375 (${canonical.slice(3, 5)}) ${canonical.slice(5, 8)}-${canonical.slice(8, 10)}-${canonical.slice(10, 12)}`;
}

export function getPhoneHref(value: string) {
  const canonical = normalizeBelarusianPhone(value);
  return canonical ? `tel:+${canonical}` : `tel:+${normalizePhone(value)}`;
}

export function isValidBelarusianPhone(value: string) {
  return normalizeBelarusianPhone(value) !== null;
}
