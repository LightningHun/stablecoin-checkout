// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createMockServer } from "../../mock/server";

let server: ReturnType<typeof createMockServer>;
let base: string;
const pair = { order_id: "ORD-88213", currency: "USDT", network: "tron" };
async function request(path: string, body?: object) {
  return fetch(
    base + path,
    body
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

describe("expired bootstrap records are separate from real payments", () => {
  it("creates a readable expired snapshot without starting an order payment or consuming its reference", async () => {
    const response = await request("/payments", {
      ...pair,
      purpose: "bootstrap",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("x-server-time")).toBe(
      "2026-08-14T08:37:10.842Z",
    );
    const snapshot = await response.json();
    expect(snapshot).toMatchObject({
      payment_reference: "BOOT-1-PMT",
      status: "expired",
      order_id: "ORD-88213",
      merchant: { name: "nordwind audio" },
      order: { amount: "149.90", currency: "EUR" },
      expired_at: "2026-08-14T08:37:10.842Z",
      quote: {
        expires_at: "2026-08-14T08:37:10.842Z",
        crypto_currency: "USDT",
        network: "tron",
        total_due: "163.69",
      },
    });
    expect(await (await request("/payments/BOOT-1-PMT")).json()).toEqual(
      snapshot,
    );
    const demo = await (await request("/demo")).json();
    expect(demo.payment).toBeNull();
    expect(demo.orders).toEqual([
      {
        order_id: "ORD-88213",
        payment_reference: null,
        status: null,
        fundsObserved: false,
      },
    ]);
    expect(demo.now).toBe("2026-08-14T08:37:10.842Z");
    const second = await post("/payments", { ...pair, purpose: "bootstrap" });
    expect(second.payment_reference).toBe("BOOT-2-PMT");
    await post("/demo/scenario", { advanceMs: 300000 });
    expect(await post("/payments", pair)).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      status: "awaiting_payment",
      quote: { expires_at: "2026-08-14T08:57:10.842Z" },
    });
  });
  it.each(["awaiting_payment", "underpaid", "paid"] as const)(
    "preserves an existing %s payment and the funds latch",
    async (status) => {
      const payment = await post("/payments", pair);
      await post("/demo/scenario", { status });
      const before = await (
        await request("/payments/" + payment.payment_reference)
      ).json();
      const orderBefore = (await (await request("/demo")).json()).orders;
      await post("/payments", {
        ...pair,
        currency: "USDC",
        network: "polygon",
        purpose: "bootstrap",
      });
      expect(
        await (await request("/payments/" + payment.payment_reference)).json(),
      ).toEqual(before);
      expect((await (await request("/demo")).json()).orders).toEqual(
        orderBefore,
      );
      expect((await request("/payments", pair)).status).toBe(
        status === "awaiting_payment" ? 201 : 409,
      );
    },
  );
  it("cannot requote an initial record or interfere with a real expired requote", async () => {
    const initial = await post("/payments", { ...pair, purpose: "bootstrap" });
    expect(
      (await request(`/payments/${initial.payment_reference}/requote`, pair))
        .status,
    ).toBe(409);
    expect((await (await request("/demo")).json()).payment).toBeNull();
    const real = await post("/payments", pair);
    await post("/demo/scenario", { advanceMs: 900000 });
    const fresh = await post(`/payments/${real.payment_reference}/requote`, {
      currency: "USDT",
      network: "tron",
    });
    expect(fresh).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      status: "awaiting_payment",
      quote: { expires_at: "2026-08-14T09:07:10.842Z" },
    });
    expect(
      await (await request(`/payments/${initial.payment_reference}`)).json(),
    ).toEqual(initial);
  });
  it("reads the configured order amount without touching another order or its clock", async () => {
    await post("/demo/orders", { order_id: "second-order", amount: "250.00" });
    const other = await post("/payments", {
      ...pair,
      order_id: "second-order",
    });
    await post("/demo/scenario", { orderAmount: "80.00" });
    expect(
      await post("/payments", { ...pair, purpose: "bootstrap" }),
    ).toMatchObject({ order: { amount: "80.00", currency: "EUR" } });
    expect(
      await (await request(`/payments/${other.payment_reference}`)).json(),
    ).toEqual(other);
    expect((await (await request("/demo")).json()).now).toBe(
      "2026-08-14T08:37:10.842Z",
    );
  });
  it.each([
    { order_id: "missing" },
    { currency: "BAD" },
    { network: "bad" },
    { currency: "ETH", network: "tron" },
    { purpose: "preview" },
  ])(
    "rejects invalid input %j without creating an active payment",
    async (invalid) => {
      expect(
        (
          await request("/payments", {
            ...pair,
            purpose: "bootstrap",
            ...invalid,
          })
        ).status,
      ).toBe(400);
      expect((await (await request("/demo")).json()).payment).toBeNull();
    },
  );
  it("reset removes initial records and restarts their independent sequence", async () => {
    await post("/payments", { ...pair, purpose: "bootstrap" });
    await post("/demo/reset", { freeze: true });
    expect((await request("/payments/BOOT-1-PMT")).status).toBe(404);
    expect(
      await post("/payments", { ...pair, purpose: "bootstrap" }),
    ).toMatchObject({ payment_reference: "BOOT-1-PMT" });
  });
});
