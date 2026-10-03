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
const bootstrap = () => ({
  ...paymentSnapshot("expired"),
  payment_reference: "BOOT-1-PMT",
  expired_at: now,
  quote: { ...paymentSnapshot().quote, expires_at: now },
});
function setup(body: unknown = bootstrap()) {
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
describe("validated bootstrap POST", () => {
  it("posts purpose only for bootstrap, with the same validated full Payment shape", async () => {
    const { fetch, client } = setup();
    expect((await client.bootstrap!(pair, signal())).data).toEqual(bootstrap());
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toEqual({
      order_id: "ORD-88213",
      currency: "USDT",
      network: "tron",
      purpose: "bootstrap",
    });
    await client.create(pair, signal());
    expect(JSON.parse(String(fetch.mock.calls[2]![1]?.body))).toEqual({
      order_id: "ORD-88213",
      currency: "USDT",
      network: "tron",
    });
  });
  it.each([
    { order_id: "another-order" },
    { status: "awaiting_payment" },
    { merchant: undefined },
    { merchant: { name: "  " } },
    { order: { currency: "USD" } },
    { order: { amount: "250.00" } },
    { expired_at: "2026-08-14T08:38:10.842Z" },
    { quote: { ...bootstrap().quote, expires_at: "2026-08-14T08:38:10.842Z" } },
  ])(
    "rejects mismatched, unexpired or incomplete bootstrap metadata %j",
    async (patch) => {
      const { client } = setup({ ...bootstrap(), ...patch });
      await expect(client.bootstrap!(pair, signal())).rejects.toMatchObject({
        protocol: true,
      });
    },
  );
  it("rejects a valid payment on a different requested pair", async () => {
    const { client } = setup();
    await expect(
      client.bootstrap!({ currency: "USDT", network: "ethereum" }, signal()),
    ).rejects.toMatchObject({ protocol: true });
  });
});
