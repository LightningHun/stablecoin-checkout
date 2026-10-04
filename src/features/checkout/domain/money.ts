/** Decimal strings enter once; every monetary operation stays in integer units. */
function validateScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 255)
    throw new Error("Invalid decimal scale");
}
export function parseUnits(value: string, scale: number): bigint {
  validateScale(scale);
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error("Invalid decimal");
  const [whole, rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > scale) throw new Error("Excess precision");
  return (
    BigInt(whole!) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0") || "0")
  );
}
export function formatUnits(
  value: bigint,
  scale: number,
  minFraction = 2,
): string {
  validateScale(scale);
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  if (!scale) return sign + digits;
  const fraction = digits
    .slice(-scale)
    .replace(/0+$/, "")
    .padEnd(Math.min(minFraction, scale), "0");
  return sign + digits.slice(0, -scale) + (fraction ? "." + fraction : "");
}
export const addMoney = (a: string, b: string, scale: number) =>
  formatUnits(parseUnits(a, scale) + parseUnits(b, scale), scale);
export const subtractMoney = (a: string, b: string, scale: number) =>
  formatUnits(parseUnits(a, scale) - parseUnits(b, scale), scale);
export function decimalScale(value: string): number {
  return (value.split(".")[1] ?? "").replace(/0+$/, "").length;
}
/** Compare decimal strings exactly, independently of display padding. */
export function compareDecimal(a: string, b: string): number {
  const scale = Math.max(decimalScale(a), decimalScale(b));
  const left = parseUnits(a, scale),
    right = parseUnits(b, scale);
  return left < right ? -1 : left > right ? 1 : 0;
}
export function formatFiat(
  value: string,
  locale = "en-IE",
  currency = "",
): string {
  // Localize without converting monetary values to Number or assuming two decimals.
  parseUnits(value, decimalScale(value));
  const [whole, fraction = ""] = value.split(".");
  const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const separator =
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === "decimal")?.value ?? ".";
  const digits = new Intl.NumberFormat(locale, { useGrouping: false });
  const localizedFraction = [...fraction]
    .map((digit) => digits.format(BigInt(digit)))
    .join("");
  return (
    formatter.format(BigInt(whole!)) +
    (fraction ? separator + localizedFraction : "") +
    (currency ? " " + currency : "")
  );
}
