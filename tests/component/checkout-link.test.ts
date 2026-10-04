import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import { useCheckoutLink } from "../../src/features/checkout/application/useCheckoutLink";
import {
  ApiError,
  type ApiResult,
  type PaymentClient,
} from "../../src/features/checkout/infrastructure/paymentClient";
import type { CheckoutLinkVerdict } from "../../src/features/checkout/infrastructure/responseSchemas";

// Literal verdicts transcribed from the link contract; no production helper builds them.
const checked_at = "2026-10-03T10:41:00.000Z";
const valid: CheckoutLinkVerdict = { valid: true, order_id: "ORD-88214", checked_at };
const invalid: CheckoutLinkVerdict = {
  valid: false,
  reason: "invalid_signature",
  order_id: "ORD-88214",
  checked_at,
  help_url: "mailto:help@payment-project.example",
};
const result = (data: CheckoutLinkVerdict): ApiResult<CheckoutLinkVerdict> => ({
  data,
  serverTime: checked_at,
  start: 0,
  end: 0,
});
const scopes: EffectScope[] = [];
function setup(search: string, verdict: NonNullable<PaymentClient["validateLink"]>) {
  const client = {
    validateLink: vi.fn<NonNullable<PaymentClient["validateLink"]>>(verdict),
    currencies: vi.fn(),
    create: vi.fn(),
    status: vi.fn(),
    requote: vi.fn(),
  } as unknown as PaymentClient & {
    validateLink: ReturnType<typeof vi.fn<NonNullable<PaymentClient["validateLink"]>>>;
  };
  const scope = effectScope();
  scopes.push(scope);
  const link = scope.run(() => useCheckoutLink(client, new URLSearchParams(search)))!;
  return { link, client, scope };
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});

describe("checkout link verification before any session work", () => {
  it("treats the bare URL as ready without calling the server", async () => {
    const { link, client } = setup("", async () => result(valid));
    expect(link.requiresValidation).toBe(false);
    expect(link.state.value).toBe("ready");
    expect(await link.validate()).toBe(true);
    expect(client.validateLink).not.toHaveBeenCalled();
  });
  it("sends the raw order and signature and becomes ready on a valid verdict", async () => {
    const { link, client } = setup("?order=ORD-88214&sig=0123456789abcdef", async () =>
      result(valid),
    );
    expect(link.state.value).toBe("checking");
    expect(await link.validate()).toBe(true);
    expect(link.state.value).toBe("ready");
    expect(link.error.value).toBe("");
    expect(client.validateLink).toHaveBeenCalledWith(
      "ORD-88214",
      "0123456789abcdef",
      expect.any(AbortSignal),
    );
    expect(await link.validate()).toBe(true);
    expect(client.validateLink).toHaveBeenCalledTimes(1);
  });
  it("passes a missing signature as null and exposes an invalid verdict", async () => {
    const { link, client } = setup("?order=ORD-88214", async () => result(invalid));
    expect(await link.validate()).toBe(false);
    expect(link.state.value).toBe("invalid");
    expect(link.invalid.value).toEqual(invalid);
    expect(client.validateLink.mock.calls[0]![1]).toBeNull();
  });
  it("reports an unavailable verification with the failure message and allows a retry", async () => {
    const { link, client } = setup("?sig=0123456789abcdef", async () => {
      throw new ApiError("HTTP 500", 500);
    });
    expect(await link.validate()).toBe(false);
    expect(link.state.value).toBe("unavailable");
    expect(link.error.value).toBe("HTTP 500");
    expect(link.validating.value).toBe(false);
    client.validateLink.mockResolvedValueOnce(result(valid));
    expect(await link.validate()).toBe(true);
    expect(link.state.value).toBe("ready");
    expect(link.error.value).toBe("");
    expect(client.validateLink).toHaveBeenCalledTimes(2);
  });
  it("uses the generic message for a non-Error failure or a client without link support", async () => {
    const { link } = setup("?order=ORD-88214", () => Promise.reject("offline"));
    expect(await link.validate()).toBe(false);
    expect(link.error.value).toBe("Link verification is unavailable.");
    const scope = effectScope();
    scopes.push(scope);
    const unsupported = scope.run(() =>
      useCheckoutLink(
        { currencies: vi.fn(), create: vi.fn(), status: vi.fn(), requote: vi.fn() },
        new URLSearchParams("?order=ORD-88214"),
      ),
    )!;
    expect(await unsupported.validate()).toBe(false);
    expect(unsupported.state.value).toBe("unavailable");
    expect(unsupported.error.value).toBe("Link verification is unavailable.");
  });
  it("coalesces a second call while one verification is in flight", async () => {
    let resolve!: (value: ApiResult<CheckoutLinkVerdict>) => void;
    const { link, client } = setup(
      "?order=ORD-88214",
      () => new Promise((done) => (resolve = done)),
    );
    const first = link.validate();
    expect(link.validating.value).toBe(true);
    expect(await link.validate()).toBe(false);
    expect(client.validateLink).toHaveBeenCalledTimes(1);
    resolve(result(valid));
    expect(await first).toBe(true);
  });
  it("aborts the request after ten seconds and reports it as unavailable", async () => {
    vi.useFakeTimers();
    const { link, client } = setup(
      "?order=ORD-88214",
      (_order, _sig, signal) =>
        new Promise((_done, fail) =>
          signal.addEventListener("abort", () => fail(new Error("Timed out"))),
        ),
    );
    const pending = link.validate();
    await vi.advanceTimersByTimeAsync(9999);
    expect(client.validateLink.mock.calls[0]![2].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(false);
    expect(client.validateLink.mock.calls[0]![2].aborted).toBe(true);
    expect(link.state.value).toBe("unavailable");
    expect(link.error.value).toBe("Timed out");
  });
  it("aborts on scope disposal and ignores a late verdict", async () => {
    vi.useFakeTimers();
    let resolve!: (value: ApiResult<CheckoutLinkVerdict>) => void;
    const { link, client, scope } = setup(
      "?order=ORD-88214",
      () => new Promise((done) => (resolve = done)),
    );
    const pending = link.validate();
    scope.stop();
    expect(client.validateLink.mock.calls[0]![2].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    resolve(result(valid));
    expect(await pending).toBe(false);
    expect(link.state.value).toBe("checking");
    expect(link.validating.value).toBe(false);
    expect(await link.validate()).toBe(false);
    expect(client.validateLink).toHaveBeenCalledTimes(1);
  });
});
