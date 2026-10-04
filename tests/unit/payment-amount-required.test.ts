import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePayment } from "../../src/features/checkout/infrastructure/responseSchemas";
import { createPaymentClient } from "../../src/features/checkout/infrastructure/paymentClient";
import { paymentSnapshot, statuses } from "../fixtures/oracles";

const catalogue = {
  currencies: [
    {
      code: "USDT",
      name: "Tether",
      decimals: 6,
      networks: [
        {
          id: "tron",
          name: "Tron (TRC-20)",
          network_fee: "1.00",
          required_confirmations: 1,
          avg_confirmation_seconds: 60,
        },
      ],
    },
  ],
};
afterEach(() => vi.unstubAllGlobals());
describe("explicit order amounts in every payment response", () => {
  it.each(statuses)("rejects missing order.amount in %s", (status) => {
    const wire = { ...paymentSnapshot(status), order: { currency: "EUR" } };
    expect(() => parsePayment(wire, catalogue.currencies)).toThrow();
  });
  it("preserves an explicitly supplied zero without inventing one", () => {
    expect(
      parsePayment(
        { ...paymentSnapshot(), order: { currency: "EUR", amount: "0" } },
        catalogue.currencies,
      ).order.amount,
    ).toBe("0");
  });
  it.each(["create", "status", "requote"] as const)(
    "reports a protocol error when %s receives an omitted order amount",
    async (operation) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async (url: RequestInfo | URL) =>
            new Response(
              JSON.stringify(
                String(url).endsWith("/currencies")
                  ? catalogue
                  : { ...paymentSnapshot(), order: { currency: "EUR" } },
              ),
              {
                status: 200,
                headers: {
                  "content-type": "application/json",
                  "x-server-time": "2026-08-14T08:37:10.842Z",
                },
              },
            ),
        ),
      );
      const client = createPaymentClient();
      const signal = new AbortController().signal;
      const pair = { currency: "USDT", network: "tron" };
      const response =
        operation === "create"
          ? client.create(pair, signal)
          : operation === "status"
            ? client.status("AQH-100306-PMT", signal)
            : client.requote("AQH-100306-PMT", pair, signal);
      await expect(response).rejects.toMatchObject({
        protocol: true,
        status: 0,
      });
    },
  );
});
