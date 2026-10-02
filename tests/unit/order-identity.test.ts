import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  createPaymentClient,
} from "../../src/features/checkout/infrastructure/paymentClient";
import { parsePayment } from "../../src/features/checkout/infrastructure/responseSchemas";
import {
  clearReference,
  loadReference,
  saveReference,
} from "../../src/features/checkout/infrastructure/paymentStorage";

// Literal wire data; no production fixture or helper supplies expected values.
const payment = {
  payment_reference: "AQH-100306-PMT",
  order_id: "ORD-88213",
  status: "awaiting_payment",
  merchant: { name: "Payment Project", logo_url: null },
  order: { currency: "EUR", amount: "149.90" },
  quote: {
    crypto_currency: "USDT",
    network: "tron",
    network_name: "Tron (TRC-20)",
    exchange_rate: "0.9214",
    crypto_amount: "162.69",
    network_fee: "1.00",
    total_due: "163.69",
    crypto_address: "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
    required_confirmations: 1,
    expires_at: "2026-08-14T08:52:10.842Z",
  },
};
function respond(order_id: string) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ ...payment, order_id }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-server-time": "2026-08-14T08:37:10.842Z",
        },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

describe("payment order identity at the client boundary", () => {
  it.each(["create", "status", "requote"] as const)(
    "rejects a different order on %s through the invalid-data path",
    async (method) => {
      respond("ORD-99999");
      const client = createPaymentClient("/api", "ORD-88213");
      const signal = new AbortController().signal;
      const result =
        method === "create"
          ? client.create({ currency: "USDT", network: "tron" }, signal)
          : method === "status"
            ? client.status("AQH-100306-PMT", signal)
            : client.requote(
                "AQH-100306-PMT",
                { currency: "USDT", network: "tron" },
                signal,
              );
      await expect(result).rejects.toBeInstanceOf(ApiError);
      await expect(result).rejects.toMatchObject({
        protocol: true,
        status: 0,
        message:
          "The payment server returned invalid data. Transfer controls are paused.",
      });
    },
  );

  it.each(["ORD-88213", "ORD-88214"])(
    "accepts a matching %s create and sends the bound identity",
    async (orderId) => {
      const fetch = respond(orderId);
      const client = createPaymentClient("/api", orderId);
      const result = await client.create(
        { currency: "USDT", network: "tron" },
        new AbortController().signal,
      );
      expect(result.data).toEqual({ ...payment, order_id: orderId });
      expect(fetch).toHaveBeenCalledWith(
        "/api/payments",
        expect.objectContaining({
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({
            order_id: orderId,
            currency: "USDT",
            network: "tron",
          }),
        }),
      );
    },
  );

  it("retains the default order for existing callers", async () => {
    const fetch = respond("ORD-88213");
    await createPaymentClient().create(
      { currency: "USDT", network: "tron" },
      new AbortController().signal,
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/payments",
      expect.objectContaining({
        body: '{"order_id":"ORD-88213","currency":"USDT","network":"tron"}',
      }),
    );
  });

  it("accepts other pattern-valid order ids in payment schemas", () => {
    expect(parsePayment({ ...payment, order_id: "ORD-88214" }).order_id).toBe(
      "ORD-88214",
    );
  });

  it.each(["SOME-OTHER-ORDER", "ORD-1", "XYZ-88213", "ORD-882140", ""])(
    "rejects invalid schema order %s",
    (order_id) => {
      expect(() => parsePayment({ ...payment, order_id })).toThrow();
    },
  );
});

it("stores and clears only the requested order's reference", () => {
  saveReference("AQH-100306-PMT", "ORD-88213");
  saveReference("AQH-100307-PMT", "ORD-88214");
  expect(
    localStorage.getItem("stablecoin-checkout:payment-reference:ORD-88213"),
  ).toBe("AQH-100306-PMT");
  expect(
    localStorage.getItem("stablecoin-checkout:payment-reference:ORD-88214"),
  ).toBe("AQH-100307-PMT");
  clearReference("ORD-88214");
  expect(loadReference("ORD-88214")).toBeNull();
  expect(loadReference("ORD-88213")).toBe("AQH-100306-PMT");
});
