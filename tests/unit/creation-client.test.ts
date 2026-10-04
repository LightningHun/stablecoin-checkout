import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentClient } from "../../src/features/checkout/infrastructure/paymentClient";
import { catalogueRows, paymentSnapshot } from "../fixtures/oracles";
const pair = { currency: "USDT", network: "tron" };
const signal = () => new AbortController().signal;
const now = "2026-08-14T08:37:10.842Z";
const catalogue = {
  currencies: [
    {
      code: "USDT",
      name: "Tether",
      decimals: 6,
      networks: catalogueRows
        .filter((r) => r[0] === "USDT")
        .map((r) => ({
          id: r[2],
          name: r[3],
          network_fee: r[4],
          required_confirmations: r[5],
          avg_confirmation_seconds: r[6],
        })),
    },
  ],
};
function setup(body: unknown = paymentSnapshot()) {
  const fetch = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) =>
      new Response(
        JSON.stringify(String(url).endsWith("/currencies") ? catalogue : body),
        {
          status: init?.method === "POST" ? 201 : 200,
          headers: { "content-type": "application/json", "x-server-time": now },
        },
      ),
  );
  vi.stubGlobal("fetch", fetch);
  return { fetch, client: createPaymentClient() };
}
afterEach(() => vi.unstubAllGlobals());
describe("payment creation follows the original API contract", () => {
  it("posts exactly order_id, currency and network and accepts the live quote", async () => {
    const { fetch, client } = setup();
    const result = await client.create(pair, signal());
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/currencies",
      "/api/payments",
    ]);
    expect(fetch.mock.calls[1]![1]?.method).toBe("POST");
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toEqual({
      order_id: "ORD-88213",
      currency: "USDT",
      network: "tron",
    });
    expect(result.data).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      order_id: "ORD-88213",
      status: "awaiting_payment",
      merchant: { name: "Payment Project", logo_url: null },
      order: { currency: "EUR", amount: "149.90" },
      quote: { total_due: "163.69", expires_at: "2026-08-14T08:52:10.842Z" },
    });
    expect(result.data).not.toHaveProperty("expired_at");
    expect(client).not.toHaveProperty("bootstrap");
  });
  it("reuses validated currency metadata without adding an initial-request discriminator", async () => {
    const { fetch, client } = setup();
    await client.currencies(signal());
    await client.create(pair, signal());
    await client.create(pair, signal());
    expect(
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/currencies")),
    ).toHaveLength(1);
    const posts = fetch.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      { order_id: "ORD-88213", currency: "USDT", network: "tron" },
      { order_id: "ORD-88213", currency: "USDT", network: "tron" },
    ]);
  });
  it.each([
    { order_id: "another-order" },
    { payment_reference: "" },
    { status: "confirmed" },
    { order: { currency: "USD" } },
    { order: { amount: "250.00" } },
    { quote: { ...paymentSnapshot().quote, total_due: "163.6900001" } },
    { quote: { ...paymentSnapshot().quote, network: "unsupported-chain" } },
    { quote: { ...paymentSnapshot().quote, expires_at: "invalid date" } },
  ])("rejects mismatched or invalid creation responses %j", async (patch) => {
    const { client } = setup({ ...paymentSnapshot(), ...patch });
    await expect(client.create(pair, signal())).rejects.toMatchObject({
      protocol: true,
    });
  });
});
