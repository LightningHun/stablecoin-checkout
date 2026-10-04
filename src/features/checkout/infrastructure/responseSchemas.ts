/**
 * Compatibility entry point for API response validation. The schemas live in
 * cohesive modules (wire primitives, catalogue, payment, checkout link); this
 * module keeps the existing import path and public parser API unchanged.
 */
export { orderIdSchema } from "./schemaPrimitives";
export { catalogueSchema } from "./catalogueSchema";
export type { CatalogueInfo } from "./catalogueSchema";
export { paymentSchema, parsePayment } from "./paymentSchema";
export type { MerchantInfo } from "./paymentSchema";
export { checkoutLinkSchema } from "./checkoutLinkSchema";
export type { CheckoutLinkVerdict } from "./checkoutLinkSchema";
