import { z } from "zod";
import { compareDecimal, decimalScale, parseUnits } from "../domain/money";
import type { Currency, Pair, Payment } from "../domain/paymentModel";
const decimal = z
  .string()
  .max(512)
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/);
const date = z.string().datetime();
const count = z.number().int().nonnegative().safe();
const code = z.string().trim().min(1).max(64);
// Order IDs are opaque server values, not an ORD-specific frontend convention.
export const orderIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
    "Invalid order identity",
  );
const merchantInfoSchema = z.object({
  name: z
    .string()
    .transform((name) => name.trim() || "Merchant")
    .default("Merchant"),
  logo_url: z.string().nullable().optional(),
  icon_url: z.string().nullable().optional(),
});
export type MerchantInfo = z.infer<typeof merchantInfoSchema>;
const network = z.object({
  id: code,
  name: z.string().trim().min(1),
  network_fee: decimal,
  required_confirmations: count.positive(),
  avg_confirmation_seconds: count.positive(),
});
export const catalogueSchema = z
  .object({
    currencies: z
      .array(
        z.object({
          code,
          name: z.string().trim().min(1),
          decimals: count.max(255),
          networks: z.array(network).min(1),
        }),
      )
      .min(1),
  })
  .superRefine(({ currencies }, ctx) => {
    if (
      new Set(currencies.map((currency) => currency.code)).size !==
      currencies.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate currency" });
    for (const currency of currencies) {
      if (
        new Set(currency.networks.map((entry) => entry.id)).size !==
        currency.networks.length
      )
        ctx.addIssue({ code: "custom", message: "Duplicate network" });
      for (const entry of currency.networks) {
        try {
          parseUnits(entry.network_fee, currency.decimals);
        } catch {
          ctx.addIssue({
            code: "custom",
            message: "Invalid network fee precision",
          });
        }
      }
    }
  });
export interface CatalogueInfo {
  currencies: Currency[];
}
// Known-chain address checks remain; an unfamiliar server-listed chain has no
// invented client address format beyond the nonempty/no-whitespace wire rule.
const addressFormats: Record<string, RegExp> = {
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  polygon: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};
function monetaryValues(p: Payment): string[] {
  return [
    p.quote.total_due,
    p.quote.crypto_amount,
    p.quote.network_fee,
    ...("amount_received" in p ? [p.amount_received] : []),
    ...(p.status === "underpaid" ? [p.amount_outstanding] : []),
    ...(p.status === "overpaid" ? [p.amount_excess] : []),
  ];
}
const quote = z.object({
  crypto_currency: code,
  network: z.string().min(1),
  network_name: z.string().min(1),
  exchange_rate: decimal,
  crypto_amount: decimal,
  network_fee: decimal,
  total_due: decimal,
  crypto_address: z.string().min(1).max(1024).regex(/^\S+$/),
  required_confirmations: count.positive(),
  expires_at: date,
});
const base = {
  payment_reference: z.string().min(1),
  order_id: orderIdSchema,
  merchant: merchantInfoSchema.default({ name: "Merchant" }),
  order: z.object({ currency: code, amount: decimal.default("0") }),
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
      // Validate semantic money relationships without assuming a token's scale.
      // The production client also supplies catalogue metadata to parsePayment.
      const scale = Math.max(...monetaryValues(p).map(decimalScale));
      const total = parseUnits(p.quote.total_due, scale);
      monetaryValues(p).forEach((value) => parseUnits(value, scale));
      parseUnits(p.order.amount, decimalScale(p.order.amount));
      if (total <= 0n || compareDecimal(p.quote.exchange_rate, "0") <= 0)
        reject("Nonpositive quote");
      if (
        addressFormats[p.quote.network] &&
        !addressFormats[p.quote.network]!.test(p.quote.crypto_address)
      )
        reject("Invalid network address");
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
export function parsePayment(
  input: unknown,
  currencies?: readonly Currency[],
): Payment {
  const payment = paymentSchema.parse(input);
  if (currencies) {
    const currency = currencies.find(
      (entry) => entry.code === payment.quote.crypto_currency,
    );
    const network = currency?.networks.find(
      (entry) => entry.id === payment.quote.network,
    );
    if (
      !currency ||
      !network ||
      network.name !== payment.quote.network_name ||
      network.required_confirmations !== payment.quote.required_confirmations ||
      compareDecimal(network.network_fee, payment.quote.network_fee) !== 0
    )
      throw Error("Unsupported or inconsistent quote network");
    monetaryValues(payment).forEach((value) =>
      parseUnits(value, currency.decimals),
    );
  }
  return payment;
}

// A bootstrap must contain real metadata, even when legacy Payment consumers
// allow display fallbacks. Parse raw values before defaults can fill them in.
const bootstrapMetadataSchema = z.object({
  merchant: merchantInfoSchema.extend({ name: z.string().trim().min(1) }),
  order: z.object({ currency: code, amount: decimal }),
});
export function parseBootstrapPayment(
  input: unknown,
  currencies: readonly Currency[],
  orderId: string,
  pair: Pair,
): Payment {
  bootstrapMetadataSchema.parse(input);
  const payment = parsePayment(input, currencies);
  if (
    payment.order_id !== orderId ||
    payment.quote.crypto_currency !== pair.currency ||
    payment.quote.network !== pair.network ||
    payment.status !== "expired" ||
    Date.parse(payment.quote.expires_at) > Date.parse(payment.expired_at)
  )
    throw Error("Invalid initial payment information");
  return payment;
}

export const checkoutLinkSchema = z.discriminatedUnion("valid", [
  z.object({
    valid: z.literal(true),
    order_id: orderIdSchema,
    checked_at: date,
  }),
  z.object({
    valid: z.literal(false),
    reason: z.enum([
      "malformed_order",
      "unknown_order",
      "invalid_signature",
      "missing_signature",
    ]),
    order_id: z.string().max(64).nullable(),
    checked_at: date,
    help_url: z
      .string()
      .url()
      .refine((value) => {
        try {
          return ["https:", "mailto:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }, "Unsafe help URL")
      .optional(),
  }),
]);
export type CheckoutLinkVerdict = z.infer<typeof checkoutLinkSchema>;
