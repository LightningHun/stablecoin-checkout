// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createMockServer } from "../../mock/server";

// Independently specified wire expectations; no production fixture or money
// helper supplies expected names, amounts, identities, or timestamps.
let server: Server;
let base: string;
async function request(path: string, input?: unknown) {
  return fetch(base + path, input === undefined ? {} : {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
async function create(order_id = "ORD-88213") {
  const response = await request("/api/payments", {
    order_id, currency: "USDT", network: "tron",
  });
  expect(response.status).toBe(201);
  return response.json();
}
async function read(reference: string) {
  const response = await request("/api/payments/" + reference);
  expect(response.status).toBe(200);
  return response.json();
}

beforeAll(async () => {
  server = createMockServer({ now: () => Date.parse("2026-08-14T08:37:10.842Z") });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing mock port");
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  const response = await request("/api/demo/reset", {
    now: "2026-08-14T08:37:10.842Z", freeze: true,
  });
  expect(response.status).toBe(200);
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("API-owned values in the mock HTTP contract", () => {
  it("skips an explicitly registered identifier when generating the next demo link", async () => {
    expect((await request("/api/demo/orders", { order_id: "ORD-88214" })).status).toBe(201);
    const generated = await request("/api/demo/orders", {});
    expect(generated.status).toBe(201);
    expect(await generated.json()).toMatchObject({ order_id: "ORD-88215" });
  });
  it("records the quote deadline after a first status read sixteen minutes later", async () => {
    const payment = await create();
    expect(payment).toMatchObject({
      status: "awaiting_payment",
      merchant: { name: "nordwind audio", logo_url: null },
      quote: { expires_at: "2026-08-14T08:52:10.842Z" },
    });
    expect((await request("/api/demo/scenario", { advanceMs: 960000 })).status).toBe(200);
    const response = await request("/api/payments/" + payment.payment_reference);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-server-time")).toBe("2026-08-14T08:53:10.842Z");
    const expired = await response.json();
    expect(expired).toMatchObject({
      status: "expired",
      expired_at: "2026-08-14T08:52:10.842Z",
      quote: { expires_at: "2026-08-14T08:52:10.842Z" },
    });
    expect((await request("/api/demo/scenario", { advanceMs: 60000 })).status).toBe(200);
    expect(await read(payment.payment_reference)).toEqual(expired);
  });

  it("uses the same quote deadline when expiry is applied explicitly", async () => {
    const payment = await create();
    expect((await request("/api/demo/scenario", { status: "expired" })).status).toBe(200);
    expect(await read(payment.payment_reference)).toMatchObject({
      status: "expired",
      expired_at: "2026-08-14T08:52:10.842Z",
      quote: { expires_at: "2026-08-14T08:52:10.842Z" },
    });
  });

  it("keeps catalogue responses independent of order and merchant configuration", async () => {
    const initial = await request("/api/currencies");
    expect(initial.status).toBe(200);
    const catalogue = await initial.json();
    expect(Object.keys(catalogue)).toEqual(["currencies"]);
    expect(catalogue.currencies.map((entry: { code: string }) => entry.code)).toEqual(["USDT", "USDC", "ETH"]);
    expect((await request("/api/demo/scenario", { orderAmount: "250" })).status).toBe(200);
    const after = await request("/api/currencies?order_id=not-a-registered-order");
    expect(after.status).toBe(200);
    expect(await after.json()).toEqual(catalogue);
    expect(await create()).toMatchObject({
      merchant: { name: "nordwind audio", logo_url: null },
      order: { currency: "EUR", amount: "250.00" },
    });
  });

  it.each(["invoice_2026-0042", "shop/order:42", "주문-42"])(
    "registers, signs and pays the opaque order identity %s",
    async (order_id) => {
      const rejected = await request("/api/payments", { order_id, currency: "USDT", network: "tron" });
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toEqual({ title: "Unknown order" });
      const registration = await request("/api/demo/orders", { order_id, amount: "250" });
      expect(registration.status).toBe(201);
      const issued = await registration.json();
      expect(issued.order_id).toBe(order_id);
      expect(issued.sig).toMatch(/^[0-9a-f]{16}$/);
      const url = new URL(issued.checkout_url, base);
      expect(url.searchParams.get("order")).toBe(order_id);
      expect(url.searchParams.get("sig")).toBe(issued.sig);
      const link = await request("/api/checkout/link?" + new URLSearchParams({ order_id, sig: issued.sig }));
      expect(link.status).toBe(200);
      expect(await link.json()).toEqual({
        valid: true, order_id, checked_at: "2026-08-14T08:37:10.842Z",
      });
      const payment = await create(order_id);
      expect(payment).toMatchObject({
        payment_reference: "AQH-100306-PMT", order_id,
        merchant: { name: "nordwind audio", logo_url: null },
        order: { currency: "EUR", amount: "250.00" },
        quote: { crypto_amount: "271.330887", network_fee: "1.00", total_due: "272.330887" },
      });
      expect(await read(payment.payment_reference)).toEqual(payment);
      const defaultPayment = await create();
      expect(defaultPayment).toMatchObject({
        payment_reference: "AQH-100307-PMT", order_id: "ORD-88213",
        order: { currency: "EUR", amount: "149.90" },
      });
      expect((await request("/api/demo/reset", { freeze: true })).status).toBe(200);
      expect(await (await request("/api/checkout/link?" + new URLSearchParams({ order_id }))).json()).toMatchObject({
        valid: false, reason: "unknown_order", order_id,
      });
    },
  );

  it("rejects duplicate registration without changing an existing order's amount", async () => {
    expect((await request("/api/demo/orders", { order_id: "invoice-42", amount: "250" })).status).toBe(201);
    const duplicate = await request("/api/demo/orders", { order_id: "invoice-42", amount: "80" });
    expect(duplicate.status).toBe(400);
    expect(await duplicate.json()).toEqual({ title: "Order already exists" });
    expect(await create("invoice-42")).toMatchObject({ order: { amount: "250.00" } });
  });
});
