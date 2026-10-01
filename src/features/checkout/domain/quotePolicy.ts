import type { Payment } from "./paymentModel";
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
  if (payment.status === "underpaid") return "usable";
  if (payment.status !== "awaiting_payment") return "unavailable";
  return Date.parse(payment.quote.expires_at) > now
    ? "usable"
    : "local-deadline-reached";
}
export const transferAmount = (p: Payment): string =>
  p.status === "underpaid" ? p.amount_outstanding : p.quote.total_due;
