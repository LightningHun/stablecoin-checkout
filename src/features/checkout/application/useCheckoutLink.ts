import { onScopeDispose, ref, shallowRef } from "vue";
import type { PaymentClient } from "../infrastructure/paymentClient";
import type { CheckoutLinkVerdict } from "../infrastructure/checkoutLinkSchema";
export type LinkState = "checking" | "ready" | "invalid" | "unavailable";
export type InvalidLink = Extract<CheckoutLinkVerdict, { valid: false }>;
/**
 * Verifies an explicit order/signature link before the page reads storage,
 * loads a payment or creates its controller. The bare demo URL is ready at once.
 * The page still owns the session start; this only produces the verdict.
 */
export function useCheckoutLink(
  client: PaymentClient,
  params: URLSearchParams,
  timeoutMs = 10000,
) {
  const requiresValidation = params.has("order") || params.has("sig");
  const state = ref<LinkState>(requiresValidation ? "checking" : "ready");
  const invalid = shallowRef<InvalidLink | null>(null);
  const error = ref("");
  const validating = ref(false);
  let disposed = false;
  let abort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Resolves true only when the link is ready and the scope is still alive. */
  async function validate(): Promise<boolean> {
    if (disposed || validating.value) return false;
    if (!requiresValidation || state.value === "ready") return true;
    validating.value = true;
    error.value = "";
    state.value = "checking";
    const controller = new AbortController();
    abort = controller;
    timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (!client.validateLink)
        throw Error("Link verification is unavailable.");
      const { data } = await client.validateLink(
        params.get("order"),
        params.get("sig"),
        controller.signal,
      );
      if (disposed) return false;
      if (!data.valid) {
        invalid.value = data;
        state.value = "invalid";
        return false;
      }
      state.value = "ready";
      return true;
    } catch (cause) {
      if (disposed) return false;
      state.value = "unavailable";
      error.value =
        cause instanceof Error
          ? cause.message
          : "Link verification is unavailable.";
      return false;
    } finally {
      clearTimeout(timer);
      abort = null;
      validating.value = false;
    }
  }
  onScopeDispose(() => {
    disposed = true;
    clearTimeout(timer);
    abort?.abort();
  });
  return { requiresValidation, state, invalid, error, validating, validate };
}
