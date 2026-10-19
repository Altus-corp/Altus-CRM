export function formatWhatsAppPhone(value: string | null | undefined, defaultCountryCode = "91") {
  let digits = String(value || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}
