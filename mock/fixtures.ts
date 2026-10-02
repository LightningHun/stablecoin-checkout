import { catalogue } from "./catalogue";
import type {
  Pair,
  Payment,
  PaymentStatus,
} from "../src/features/checkout/domain/paymentModel";
import { parseUnits, formatUnits } from "../src/features/checkout/domain/money";
// USDT/Tron is the supplied fixture. Other entries are original synthetic demo data.
export const quoteSeeds: Record<
  string,
  { amount: string; rate: string; address: string }
> = {
  "USDT/tron": {
    amount: "162.69",
    rate: "0.9214",
    address: "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
  },
  "USDT/ethereum": {
    amount: "162.69",
    rate: "0.9214",
    address: "0x1111111111111111111111111111111111111111",
  },
  "USDC/ethereum": {
    amount: "162.70",
    rate: "0.9213",
    address: "0x2222222222222222222222222222222222222222",
  },
  "USDC/polygon": {
    amount: "162.71",
    rate: "0.9212",
    address: "0x3333333333333333333333333333333333333333",
  },
  "USDC/solana": {
    amount: "162.72",
    rate: "0.9211",
    address: "7YWHMfk9JZe0LM0g1ZauHuiSxhIqp0HwBwwxVwA7F4GF"
      .replace(/0/g, "1")
      .replace(/I/g, "i"),
  },
  "ETH/ethereum": {
    amount: "0.061234567890123456",
    rate: "2448.0123",
    address: "0x4444444444444444444444444444444444444444",
  },
};
export function makePayment(
  pair: Pair,
  reference: string,
  now: number,
  ttlMs = 900000,
): Payment {
  const currency = catalogue.find((c) => c.code === pair.currency);
  const network = currency?.networks.find((n) => n.id === pair.network);
  const seed = quoteSeeds[pair.currency + "/" + pair.network];
  if (!currency || !network || !seed) throw new Error("Unsupported pair");
  return {
    payment_reference: reference,
    order_id: "ORD-88213",
    status: "awaiting_payment",
    merchant: { name: "Payment Project", logo_url: null },
    order: { currency: "EUR", amount: "149.90" },
    quote: {
      crypto_currency: pair.currency,
      network: network.id,
      network_name: network.name,
      exchange_rate: seed.rate,
      crypto_amount: seed.amount,
      network_fee: network.network_fee,
      total_due: formatUnits(
        parseUnits(seed.amount, currency.decimals) +
          parseUnits(network.network_fee, currency.decimals),
        currency.decimals,
      ),
      crypto_address: seed.address,
      required_confirmations: network.required_confirmations,
      expires_at: new Date(now + ttlMs).toISOString(),
    },
  };
}
export function withStatus(
  payment: Payment,
  status: PaymentStatus,
  now: number,
): Payment {
  const { payment_reference, order_id, merchant, order, quote } = payment;
  const base = { payment_reference, order_id, merchant, order, quote };
  const decimals = quote.crypto_currency === "ETH" ? 18 : 6;
  const total = parseUnits(quote.total_due, decimals);
  const received =
    quote.crypto_currency === "ETH"
      ? formatUnits(total / 2n, decimals)
      : "120.00";
  const excess = quote.crypto_currency === "ETH" ? "0.01" : "16.31";
  // Synthetic full identifiers for hover/explorer demos; these are not on-chain payments.
  const hexHash =
    "9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20";
  const tx_hash =
    quote.network === "solana"
      ? "cB5S93YMJGZggvjc58ioc7My7pHt387wECNfFGZExpXCEN9xND2ACbZDKu88a16dEX9v1t1E5PAdGJTiR1fntGB"
      : quote.network === "tron"
        ? hexHash
        : "0x" + hexHash;
  const full = {
    amount_received: quote.total_due,
    tx_hash,
    required_confirmations: quote.required_confirmations,
  };
  switch (status) {
    case "awaiting_payment":
      return { ...base, status };
    case "detected":
      return {
        ...base,
        status,
        ...full,
        confirmations: 0,
        detected_at: new Date(now).toISOString(),
      };
    case "confirming":
      return {
        ...base,
        status,
        ...full,
        confirmations: Math.max(0, quote.required_confirmations - 1),
      };
    case "paid":
      return {
        ...base,
        status,
        ...full,
        confirmations: quote.required_confirmations,
        settled_at: new Date(now).toISOString(),
      };
    case "underpaid":
      return {
        ...base,
        status,
        amount_received: received,
        amount_outstanding: formatUnits(
          total - parseUnits(received, decimals),
          decimals,
        ),
        crypto_address: quote.crypto_address,
        tx_hash,
      };
    case "overpaid":
      return {
        ...base,
        status,
        amount_received: formatUnits(
          total + parseUnits(excess, decimals),
          decimals,
        ),
        amount_excess: excess,
        tx_hash,
        settled_at: new Date(now).toISOString(),
      };
    case "expired":
      return { ...base, status, expired_at: new Date(now).toISOString() };
    case "failed":
      return { ...base, status, reason: "settlement_rejected" };
  }
}
