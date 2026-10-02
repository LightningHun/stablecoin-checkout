import { z } from "zod";
import { parseUnits } from "../domain/money";
import type { Currency, Payment } from "../domain/paymentModel";
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
const orderInfoSchema = z.object({
  order_id: z.string().regex(/^ORD-[0-9]{5}$/),
  currency: z.literal("EUR"),
  amount: decimal.refine((value) => {
    try {
      return parseUnits(value, 2) > 0n;
    } catch {
      return false;
    }
  }, "Invalid order amount"),
});
const merchantInfoSchema = z.object({
  name: z.string().min(1),
  logo_url: z.string().nullable(),
});
export type OrderInfo = z.infer<typeof orderInfoSchema>;
export type MerchantInfo = z.infer<typeof merchantInfoSchema>;
export const catalogueSchema = z
  .object({
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
    order: orderInfoSchema.optional(),
    merchant: merchantInfoSchema.optional(),
  })
  .superRefine(({ currencies }, ctx) => {
    const keys = currencies.flatMap((c) =>
      c.networks.map((n) => c.code + "/" + n.id),
    );
    const unique = new Set(keys);
    if (
      currencies.length !== 3 ||
      new Set(currencies.map((c) => c.code)).size !== 3 ||
      keys.length !== 6 ||
      unique.size !== 6
    )
      ctx.addIssue({
        code: "custom",
        message: "Incomplete or duplicated catalogue",
      });
    for (const c of currencies) {
      const scale = c.code === "ETH" ? 18 : 6;
      if (c.decimals !== scale)
        ctx.addIssue({ code: "custom", message: "Invalid currency scale" });
      for (const n of c.networks) {
        const rule = pairRules[c.code + "/" + n.id];
        if (
          !rule ||
          n.name !== rule.name ||
          n.required_confirmations !== rule.confirmations ||
          n.avg_confirmation_seconds !== rule.seconds ||
          n.network_fee !== rule.fee
        )
          ctx.addIssue({ code: "custom", message: "Invalid network metadata" });
      }
    }
  });
export interface CatalogueInfo {
  currencies: Currency[];
  order?: OrderInfo;
  merchant?: MerchantInfo;
}
// Fixed supported pairs are part of this mock contract, not provider discovery.
const pairRules: Record<
  string,
  {
    name: string;
    confirmations: number;
    fee: string;
    seconds: number;
    address: RegExp;
  }
> = {
  "USDT/tron": {
    name: "Tron (TRC-20)",
    confirmations: 1,
    fee: "1.00",
    seconds: 60,
    address: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  },
  "USDT/ethereum": {
    name: "Ethereum (ERC-20)",
    confirmations: 3,
    fee: "4.50",
    seconds: 180,
    address: /^0x[0-9a-fA-F]{40}$/,
  },
  "USDC/ethereum": {
    name: "Ethereum (ERC-20)",
    confirmations: 3,
    fee: "4.50",
    seconds: 180,
    address: /^0x[0-9a-fA-F]{40}$/,
  },
  "USDC/polygon": {
    name: "Polygon",
    confirmations: 6,
    fee: "0.10",
    seconds: 30,
    address: /^0x[0-9a-fA-F]{40}$/,
  },
  "USDC/solana": {
    name: "Solana",
    confirmations: 1,
    fee: "0.01",
    seconds: 15,
    address: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  },
  "ETH/ethereum": {
    name: "Ethereum",
    confirmations: 3,
    fee: "3.20",
    seconds: 180,
    address: /^0x[0-9a-fA-F]{40}$/,
  },
};
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
  order_id: z.string().regex(/^ORD-[0-9]{5}$/),
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
      const rule = pairRules[p.quote.crypto_currency + "/" + p.quote.network];
      if (
        !rule ||
        p.quote.network_name !== rule.name ||
        p.quote.required_confirmations !== rule.confirmations ||
        !rule.address.test(p.quote.crypto_address) ||
        parseUnits(p.quote.network_fee, scale) !== parseUnits(rule.fee, scale)
      )
        reject("Unsupported or inconsistent quote network");
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
