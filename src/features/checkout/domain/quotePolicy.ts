import { compareDecimal } from "./money";
import type { Payment, Quote } from "./paymentModel";
export type QuoteAvailability =
  | "usable"
  | "local-deadline-reached"
  | "reconciling"
  | "server-expired"
  | "unavailable";
export function quoteAvailability(
  payment: Payment | null,
  now: number,
  blocked = false,
): QuoteAvailability {
  if (blocked) return "reconciling";
  if (!payment) return "unavailable";
  if (payment.status === "expired") return "server-expired";
  if (payment.status !== "awaiting_payment" && payment.status !== "underpaid")
    return "unavailable";
  return Date.parse(payment.quote.expires_at) > now
    ? "usable"
    : "local-deadline-reached";
}
export const transferAmount = (p: Payment): string =>
  p.status === "underpaid" ? p.amount_outstanding : p.quote.total_due;
/**
 * Same-reference polling must not change the accepted quote. Only a numerically
 * equal network-fee spelling is tolerated; every other field must match exactly.
 */
export function isSameQuote(incoming: Quote, accepted: Quote): boolean {
  return (
    compareDecimal(incoming.network_fee, accepted.network_fee) === 0 &&
    JSON.stringify({ ...incoming, network_fee: accepted.network_fee }) ===
      JSON.stringify(accepted)
  );
}
