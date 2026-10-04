import { z } from "zod";
import { parseUnits } from "../domain/money";
import type { Currency } from "../domain/paymentModel";
import { code, count, decimal } from "./schemaPrimitives";
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
