/** Decimal strings enter once; every monetary operation stays in integer units. */
export function parseUnits(value: string, scale: number): bigint {
  if (
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > 18 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    throw new Error("Invalid decimal");
  const [whole, fraction = ""] = value.split(".");
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
export function formatFiat(value: string, locale = "en-IE"): string {
  const units = parseUnits(value, 2);
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).formatToParts(units / 100n);
  return parts
    .map((part) =>
      part.type === "fraction"
        ? (units % 100n).toString().padStart(2, "0")
        : part.value,
    )
    .join("");
}
