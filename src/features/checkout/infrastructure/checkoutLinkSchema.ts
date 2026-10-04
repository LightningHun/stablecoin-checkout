import { z } from "zod";
import { date, orderIdSchema } from "./schemaPrimitives";
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
