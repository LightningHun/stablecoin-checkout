import { z } from "zod";
import { parseUnits } from "../domain/money";
import type { Payment } from "../domain/paymentModel";
const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const date = z.string().datetime();
const count = z.number().int().nonnegative();
const code = z.enum(["USDT", "USDC", "ETH"]);
const network = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  network_fee: decimal,
  required_confirmations: count.positive(),
  avg_confirmation_seconds: count.positive(),
});
export const catalogueSchema = z.object({
  currencies: z
    .array(
      z.object({
        code,
        name: z.string().min(1),
        decimals: z.union([z.literal(6), z.literal(18)]),
        networks: z.array(network).min(1),
      }),
    )
    .min(1),
});
const quote = z.object({
  crypto_currency: code,
  network: z.string().min(1),
  network_name: z.string().min(1),
  exchange_rate: decimal,
  crypto_amount: decimal,
  network_fee: decimal,
  total_due: decimal,
  crypto_address: z.string().min(20).regex(/^\S+$/),
  required_confirmations: count.positive(),
  expires_at: date,
});
const base = {
  payment_reference: z.string().min(1),
  order_id: z.literal("ORD-88213"),
  merchant: z.object({
    name: z.string().min(1),
    logo_url: z.string().nullable(),
  }),
  order: z.object({ currency: z.literal("EUR"), amount: decimal }),
  quote,
};
const received = { amount_received: decimal, tx_hash: z.string().min(1) };
const confirmations = {
  ...received,
  confirmations: count,
  required_confirmations: count.positive(),
};
export const paymentSchema = z
  .discriminatedUnion("status", [
    z.object({ ...base, status: z.literal("awaiting_payment") }),
    z.object({
      ...base,
      status: z.literal("detected"),
      ...confirmations,
      detected_at: date,
    }),
    z.object({ ...base, status: z.literal("confirming"), ...confirmations }),
    z.object({
      ...base,
      status: z.literal("paid"),
      ...confirmations,
      settled_at: date,
    }),
    z.object({
      ...base,
      status: z.literal("underpaid"),
      ...received,
      amount_outstanding: decimal,
      crypto_address: z.string(),
    }),
    z.object({
      ...base,
      status: z.literal("overpaid"),
      ...received,
      amount_excess: decimal,
      settled_at: date,
    }),
    z.object({ ...base, status: z.literal("expired"), expired_at: date }),
    z.object({
      ...base,
      status: z.literal("failed"),
      reason: z.string().min(1),
    }),
  ])
  .superRefine((p, ctx) => {
    const reject = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    try {
      const scale = p.quote.crypto_currency === "ETH" ? 18 : 6;
      const total = parseUnits(p.quote.total_due, scale);
      for (const v of [p.quote.crypto_amount, p.quote.network_fee])
        parseUnits(v, scale);
      parseUnits(p.order.amount, 2);
      if (total <= 0n || parseUnits(p.quote.exchange_rate, 18) <= 0n)
        reject("Nonpositive quote");
      if ("amount_received" in p && parseUnits(p.amount_received, scale) <= 0n)
        reject("Nonpositive received");
      if (
        p.status === "underpaid" &&
        (parseUnits(p.amount_received, scale) +
          parseUnits(p.amount_outstanding, scale) !==
          total ||
          parseUnits(p.amount_outstanding, scale) <= 0n ||
          p.crypto_address !== p.quote.crypto_address)
      )
        reject("Inconsistent outstanding amount or address");
      if (
        p.status === "overpaid" &&
        (parseUnits(p.amount_received, scale) - total !==
          parseUnits(p.amount_excess, scale) ||
          parseUnits(p.amount_excess, scale) <= 0n)
      )
        reject("Inconsistent excess");
      if (
        "confirmations" in p &&
        (p.required_confirmations !== p.quote.required_confirmations ||
          p.confirmations > p.required_confirmations)
      )
        reject("Inconsistent confirmations");
      if (p.status === "detected" && p.confirmations !== 0)
        reject("Detected must have zero confirmations");
      if (
        p.status === "paid" &&
        (p.confirmations !== p.required_confirmations ||
          parseUnits(p.amount_received, scale) < total)
      )
        reject("Invalid paid snapshot");
    } catch {
      reject("Invalid monetary precision");
    }
  });
export function parsePayment(input: unknown): Payment {
  return paymentSchema.parse(input);
}
