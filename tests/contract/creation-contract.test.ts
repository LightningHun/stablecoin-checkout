// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createMockServer } from "../../backend/server";

let server: ReturnType<typeof createMockServer>;
let base: string;
const pair = { order_id: "ORD-88213", currency: "USDT", network: "tron" };
async function request(path: string, body?: unknown) {
  return fetch(
    base + path,
    body !== undefined
      ? {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
}
async function post(path: string, body: object) {
  const response = await request(path, body);
  expect(response.ok).toBe(true);
  return response.json();
}
beforeEach(async () => {
  server = createMockServer({
    now: () => Date.parse("2026-08-14T08:37:10.842Z"),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  await post("/demo/reset", { freeze: true });
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("payment creation follows the original request contract", () => {
  it("creates a normal payment with metadata and a full quote lifetime", async () => {
    const response = await request("/payments", pair);
    expect(response.status).toBe(201);
    expect(response.headers.get("x-server-time")).toBe(
      "2026-08-14T08:37:10.842Z",
    );
    const snapshot = await response.json();
    expect(snapshot).toEqual({
      payment_reference: "AQH-100306-PMT",
      status: "awaiting_payment",
      order_id: "ORD-88213",
      merchant: { name: "Nordwind Audio", logo_url: null },
      order: { amount: "149.90", currency: "EUR" },
      quote: {
        expires_at: "2026-08-14T08:52:10.842Z",
        crypto_currency: "USDT",
        network: "tron",
        network_name: "Tron (TRC-20)",
        exchange_rate: "0.9214",
        crypto_amount: "162.69",
        network_fee: "1.00",
        total_due: "163.69",
        crypto_address: "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
        required_confirmations: 1,
      },
    });
    expect(await (await request("/payments/AQH-100306-PMT")).json()).toEqual(
      snapshot,
    );
    const demo = await (await request("/demo")).json();
    expect(demo.payment).toEqual(snapshot);
    expect(demo.orders).toEqual([
      {
        order_id: "ORD-88213",
        payment_reference: "AQH-100306-PMT",
        status: "awaiting_payment",
        fundsObserved: false,
      },
    ]);
  });

  it("uses registered order metadata without changing another order", async () => {
    const first = await post("/payments", pair);
    await post("/demo/orders", { order_id: "second-order", amount: "250.00" });
    const second = await post("/payments", {
      ...pair,
      order_id: "second-order",
    });
    expect(second).toMatchObject({
      payment_reference: "AQH-100307-PMT",
      status: "awaiting_payment",
      order_id: "second-order",
      merchant: { name: "Nordwind Audio" },
      order: { amount: "250.00", currency: "EUR" },
      quote: { expires_at: "2026-08-14T08:52:10.842Z" },
    });
    expect(await (await request("/payments/AQH-100306-PMT")).json()).toEqual(
      first,
    );
    expect((await (await request("/demo")).json()).now).toBe(
      "2026-08-14T08:37:10.842Z",
    );
  });

  it.each(["detected", "confirming", "underpaid", "overpaid", "paid"])(
    "cannot bypass an existing %s payment's observed-funds latch",
    async (status) => {
      const payment = await post("/payments", pair);
      await post("/demo/scenario", { status });
      const before = await (
        await request("/payments/" + payment.payment_reference)
      ).json();
      const orderBefore = (await (await request("/demo")).json()).orders;
      expect((await request("/payments", pair)).status).toBe(409);
      expect(
        (await request("/payments", { ...pair, purpose: "bootstrap" })).status,
      ).toBe(400);
      expect(
        await (await request("/payments/" + payment.payment_reference)).json(),
      ).toEqual(before);
      expect((await (await request("/demo")).json()).orders).toEqual(orderBefore);
    },
  );

  const invalidRequests = [
    { ...pair, purpose: "bootstrap" },
    { ...pair, purpose: "preview" },
    { ...pair, purpose: null },
    { ...pair, preview: true },
    { currency: "USDT", network: "tron" },
    { order_id: "ORD-88213", network: "tron" },
    { order_id: "ORD-88213", currency: "USDT" },
    { ...pair, order_id: "missing" },
    { ...pair, order_id: "" },
    { ...pair, order_id: 88213 },
    { ...pair, currency: "" },
    { ...pair, currency: "BAD" },
    { ...pair, network: "" },
    { ...pair, network: "bad" },
    { ...pair, currency: "ETH", network: "tron" },
    null,
    [],
  ];
  it.each(invalidRequests)(
    "rejects unsupported input %j without creating or replacing a payment",
    async (input) => {
      expect((await request("/payments", input)).status).toBe(400);
      expect((await (await request("/demo")).json()).payment).toBeNull();
      const current = await post("/payments", pair);
      expect(current.payment_reference).toBe("AQH-100306-PMT");
      expect((await request("/payments", input)).status).toBe(400);
      expect((await (await request("/demo")).json()).payment).toEqual(current);
      expect(await (await request("/payments/AQH-100306-PMT")).json()).toEqual(
        current,
      );
      expect(await post("/payments", pair)).toMatchObject({
        payment_reference: "AQH-100307-PMT",
        status: "awaiting_payment",
      });
    },
  );

  it("expires normally and requotes with the same payment reference", async () => {
    await post("/payments", pair);
    await post("/demo/scenario", { advanceMs: 900000 });
    expect(await (await request("/payments/AQH-100306-PMT")).json()).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      status: "expired",
      expired_at: "2026-08-14T08:52:10.842Z",
      quote: { expires_at: "2026-08-14T08:52:10.842Z" },
    });
    expect(
      await post("/payments/AQH-100306-PMT/requote", {
        currency: "USDT",
        network: "tron",
      }),
    ).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      status: "awaiting_payment",
      quote: { expires_at: "2026-08-14T09:07:10.842Z" },
    });
  });

  it("reset removes payment records and restarts the normal reference sequence", async () => {
    await post("/payments", pair);
    await post("/payments", pair);
    await post("/demo/reset", { freeze: true });
    expect((await request("/payments/AQH-100307-PMT")).status).toBe(404);
    expect((await request("/payments/BOOT-1-PMT")).status).toBe(404);
    expect((await (await request("/demo")).json()).payment).toBeNull();
    expect(await post("/payments", pair)).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      status: "awaiting_payment",
      quote: { expires_at: "2026-08-14T08:52:10.842Z" },
    });
  });
});
