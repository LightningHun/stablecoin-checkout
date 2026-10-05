import en from "./locales/en";
// Preserve controller/client diagnostics; translate known messages only at the
// presentation boundary. Backend problem text is data, never a translation key.
export const paymentErrors = en.errors;
export function paymentErrorKey(message: string) {
  const entry = Object.entries(paymentErrors).find(([, value]) => value === message);
  return entry ? `errors.${entry[0]}` : null;
}
