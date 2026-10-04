import { z } from "zod";
/** Wire-level primitives shared by every API response schema. */
export const decimal = z
  .string()
  .max(512)
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/);
export const date = z.string().datetime();
export const count = z.number().int().nonnegative().safe();
export const code = z.string().trim().min(1).max(64);
// Order IDs are opaque server values, not an ORD-specific frontend convention.
export const orderIdSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value),
    "Invalid order identity",
  );
