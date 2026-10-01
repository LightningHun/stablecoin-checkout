import { parseUnits } from "./money";
export const statuses = [
  "awaiting_payment",
  "detected",
  "confirming",
  "paid",
  "underpaid",
  "overpaid",
  "expired",
  "failed",
] as const;
export type PaymentStatus = (typeof statuses)[number];
export type CurrencyCode = "USDT" | "USDC" | "ETH";
export interface Pair {
  currency: CurrencyCode;
  network: string;
}
export interface Network {
  id: string;
  name: string;
  network_fee: string;
  required_confirmations: number;
  avg_confirmation_seconds: number;
}
export interface Currency {
  code: CurrencyCode;
  name: string;
  decimals: number;
  networks: Network[];
}
export interface Quote {
  crypto_currency: CurrencyCode;
  network: string;
  network_name: string;
  exchange_rate: string;
  crypto_amount: string;
  network_fee: string;
  total_due: string;
  crypto_address: string;
  required_confirmations: number;
  expires_at: string;
}
interface BasePayment {
  payment_reference: string;
  order_id: string;
  merchant: { name: string; logo_url: string | null };
  order: { currency: "EUR"; amount: string };
  quote: Quote;
}
interface Received {
  amount_received: string;
  tx_hash: string;
}
interface Confirmations extends Received {
  confirmations: number;
  required_confirmations: number;
}
export type Payment = BasePayment &
  (
    | { status: "awaiting_payment" }
    | ({ status: "detected"; detected_at: string } & Confirmations)
    | ({ status: "confirming" } & Confirmations)
    | ({ status: "paid"; settled_at: string } & Confirmations)
    | ({
        status: "underpaid";
        amount_outstanding: string;
        crypto_address: string;
      } & Received)
    | ({
        status: "overpaid";
        amount_excess: string;
        settled_at: string;
      } & Received)
    | { status: "expired"; expired_at: string }
    | { status: "failed"; reason: string }
  );
export type RequestHealth = "loading" | "fresh" | "stale" | "unavailable";
export const isTerminal = (status: PaymentStatus): boolean =>
  ["paid", "overpaid", "expired", "failed"].includes(status);
export const hasFunds = (status: PaymentStatus): boolean =>
  ["detected", "confirming", "underpaid", "paid", "overpaid"].includes(status);
const allowed: Record<PaymentStatus, readonly PaymentStatus[]> = {
  awaiting_payment: statuses,
  detected: [
    "detected",
    "confirming",
    "paid",
    "underpaid",
    "overpaid",
    "failed",
  ],
  confirming: ["confirming", "paid", "underpaid", "overpaid", "failed"],
  underpaid: [
    "underpaid",
    "detected",
    "confirming",
    "paid",
    "overpaid",
    "failed",
  ],
  paid: ["paid"],
  overpaid: ["overpaid"],
  expired: [
    "expired",
    "detected",
    "confirming",
    "underpaid",
    "paid",
    "overpaid",
    "failed",
  ],
  failed: ["failed"],
};
export function acceptSnapshot(
  previous: Payment | null,
  incoming: Payment,
  expectedReference = incoming.payment_reference,
  generation = 0,
  currentGeneration = 0,
): Payment | null {
  if (
    generation !== currentGeneration ||
    incoming.payment_reference !== expectedReference
  )
    return null;
  if (
    previous &&
    (previous.payment_reference !== incoming.payment_reference ||
      !allowed[previous.status].includes(incoming.status))
  )
    return null;
  if (
    previous &&
    "confirmations" in previous &&
    "confirmations" in incoming &&
    incoming.confirmations < previous.confirmations
  )
    return null;
  if (
    previous &&
    "amount_received" in previous &&
    "amount_received" in incoming &&
    parseUnits(
      incoming.amount_received,
      incoming.quote.crypto_currency === "ETH" ? 18 : 6,
    ) <
      parseUnits(
        previous.amount_received,
        previous.quote.crypto_currency === "ETH" ? 18 : 6,
      )
  )
    return null;
  return incoming;
}
