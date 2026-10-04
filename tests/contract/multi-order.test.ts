// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createMockServer } from "../../backend/server";

let server: Server;
let base: string;
const time = "2026-08-14T08:37:10.842Z";

async function request(path: string, input?: unknown) {
  return fetch(
    base + path,
    input === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
  );
}
async function create(order_id = "ORD-88213") {
  const response = await request("/api/payments", {
    order_id,
    currency: "USDT",
    network: "tron",
  });
  expect(response.status).toBe(201);
  return response.json();
}
async function scenario(input: Record<string, unknown>) {
  const response = await request("/api/demo/scenario", input);
  expect(response.status).toBe(200);
  return response.json();
}
async function read(reference: string) {
  const response = await request("/api/payments/" + reference);
  expect(response.status).toBe(200);
  return response.json();
}

beforeAll(async () => {
  server = createMockServer({ now: () => Date.parse(time) });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Mock failed to bind");
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  expect(
    (await request("/api/demo/reset", { now: time, freeze: true })).status,
  ).toBe(200);
  // Payment creation and demo controls must use a registered order fixture.
  const registered = await request("/api/demo/orders", {});
  expect(registered.status).toBe(201);
  expect(await registered.json()).toMatchObject({ order_id: "ORD-88214" });
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("independent order HTTP state", () => {
  it("creates globally unique references and reads each payment's own order", async () => {
    expect(await create()).toMatchObject({
      order_id: "ORD-88213",
      payment_reference: "AQH-100306-PMT",
    });
    expect(await create("ORD-88214")).toMatchObject({
      order_id: "ORD-88214",
      payment_reference: "AQH-100307-PMT",
    });
    expect(await read("AQH-100306-PMT")).toMatchObject({
      order_id: "ORD-88213",
      status: "awaiting_payment",
    });
    expect(await read("AQH-100307-PMT")).toMatchObject({
      order_id: "ORD-88214",
      status: "awaiting_payment",
    });
    const response = await request("/api/payments/AQH-100307-PMT");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-server-time")).toBe(
      "2026-08-14T08:37:10.842Z",
    );
  });

  it("targets status and replacement to one order and locks only the funded order", async () => {
    await create();
    await create("ORD-88214");
    await scenario({ status: "detected", order_id: "ORD-88213" });
    expect(await read("AQH-100306-PMT")).toMatchObject({
      status: "detected",
      confirmations: 0,
    });
    expect(await read("AQH-100307-PMT")).toMatchObject({
      status: "awaiting_payment",
      order_id: "ORD-88214",
    });
    expect(await create("ORD-88214")).toMatchObject({
      order_id: "ORD-88214",
      payment_reference: "AQH-100308-PMT",
    });
    expect((await request("/api/payments/AQH-100307-PMT")).status).toBe(404);
    const blocked = await request("/api/payments", {
      order_id: "ORD-88213",
      currency: "USDT",
      network: "tron",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.headers.get("content-type")).toBe(
      "application/problem+json",
    );
    expect(await blocked.json()).toMatchObject({
      title: "Funds already observed",
      status: 409,
    });
    expect(await read("AQH-100306-PMT")).toMatchObject({
      status: "detected",
      order_id: "ORD-88213",
    });
  });

  it("requotes an expired second order with the same reference despite the first order's latch", async () => {
    await create();
    await create("ORD-88214");
    await scenario({ status: "detected", order_id: "ORD-88213" });
    await scenario({ advanceMs: 900000 });
    expect(await read("AQH-100307-PMT")).toMatchObject({
      status: "expired",
      order_id: "ORD-88214",
    });
    const response = await request("/api/payments/AQH-100307-PMT/requote", {
      currency: "USDT",
      network: "tron",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      order_id: "ORD-88214",
      payment_reference: "AQH-100307-PMT",
      status: "awaiting_payment",
      quote: { expires_at: "2026-08-14T09:07:10.842Z", total_due: "163.69" },
    });
    expect(
      (
        await request("/api/payments", {
          order_id: "ORD-88213",
          currency: "USDT",
          network: "tron",
        })
      ).status,
    ).toBe(409);
  });

  it("returns the requested demo payment and a summary of both orders", async () => {
    await create();
    await create("ORD-88214");
    await scenario({ order_id: "ORD-88213", status: "underpaid" });
    const response = await request("/api/demo?order_id=ORD-88214");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      payment: {
        order_id: "ORD-88214",
        payment_reference: "AQH-100307-PMT",
        status: "awaiting_payment",
      },
      scenario: {
        fault: "none",
        delayMs: 5000,
        ttlMs: 900000,
        orderAmount: "149.90",
      },
      now: "2026-08-14T08:37:10.842Z",
      orders: [
        {
          order_id: "ORD-88213",
          payment_reference: "AQH-100306-PMT",
          status: "underpaid",
          fundsObserved: true,
        },
        {
          order_id: "ORD-88214",
          payment_reference: "AQH-100307-PMT",
          status: "awaiting_payment",
          fundsObserved: false,
        },
      ],
    });
  });

  it.each(["ORD-1", "XYZ-88213", "ORD-99999", "", null, 88213])(
    "rejects invalid or unregistered order %j without creating a payment",
    async (order_id) => {
      const response = await request("/api/payments", {
        order_id,
        currency: "USDT",
        network: "tron",
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ title: "Unknown order" });
      expect(await (await request("/api/demo")).json()).toMatchObject({
        orders: [
          {
            order_id: "ORD-88213",
            payment_reference: null,
            status: null,
            fundsObserved: false,
          },
          {
            order_id: "ORD-88214",
            payment_reference: null,
            status: null,
            fundsObserved: false,
          },
        ],
      });
    },
  );

  it("requires the create order id while keeping the demo status target default", async () => {
    const before = await (await request("/api/demo")).json();
    const response = await request("/api/payments", {
      currency: "USDT",
      network: "tron",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ title: "Unknown order" });
    expect(await (await request("/api/demo")).json()).toEqual(before);
    expect(await create("ORD-88213")).toMatchObject({
      order_id: "ORD-88213",
      payment_reference: "AQH-100306-PMT",
      quote: { total_due: "163.69" },
    });
    expect(await scenario({ status: "underpaid" })).toMatchObject({
      payment: { order_id: "ORD-88213", amount_outstanding: "43.69" },
    });
  });

  it.each(["failed", "expired"])(
    "retains only the funded order's latch after %s",
    async (status) => {
      await create();
      await scenario({ status: "detected" });
      await scenario({ status });
      expect(
        (
          await request("/api/payments", {
            order_id: "ORD-88213",
            currency: "USDT",
            network: "tron",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await request("/api/payments/AQH-100306-PMT/requote", {
            currency: "USDT",
            network: "tron",
          })
        ).status,
      ).toBe(409);
      expect(await create("ORD-88214")).toMatchObject({
        payment_reference: "AQH-100307-PMT",
        order_id: "ORD-88214",
      });
    },
  );

  it("configures amounts per order without creating orders or changing existing snapshots", async () => {
    await scenario({ order_id: "ORD-88214", orderAmount: "250" });
    expect(await (await request("/api/demo")).json()).toMatchObject({
      orders: [
        {
          order_id: "ORD-88213",
          payment_reference: null,
          status: null,
          fundsObserved: false,
        },
        {
          order_id: "ORD-88214",
          payment_reference: null,
          status: null,
          fundsObserved: false,
        },
      ],
      scenario: { orderAmount: "149.90" },
    });
    const catalogueResponse = await request(
      "/api/currencies?order_id=ORD-88214",
    );
    expect(catalogueResponse.status).toBe(200);
    const catalogue = await catalogueResponse.json();
    expect(Object.keys(catalogue)).toEqual(["currencies"]);
    expect(catalogue.currencies).toHaveLength(3);
    expect(await create()).toMatchObject({
      order: { amount: "149.90" },
      quote: { total_due: "163.69" },
    });
    expect(await create("ORD-88214")).toMatchObject({
      order: { amount: "250.00" },
      quote: { total_due: "272.330887" },
    });
    await scenario({
      order_id: "ORD-88214",
      orderAmount: "80",
      status: "expired",
    });
    expect(await read("AQH-100307-PMT")).toMatchObject({
      order: { amount: "250.00" },
      quote: { total_due: "272.330887" },
    });
    const response = await request("/api/payments/AQH-100307-PMT/requote", {
      currency: "USDT",
      network: "tron",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      order_id: "ORD-88214",
      payment_reference: "AQH-100307-PMT",
      order: { amount: "80.00" },
    });
    expect(await read("AQH-100306-PMT")).toMatchObject({
      order: { amount: "149.90" },
      quote: { total_due: "163.69" },
    });
  });

  it("keeps fault injection global while rejecting unknown payment orders before faults", async () => {
    await create();
    await create("ORD-88214");
    await scenario({ order_id: "ORD-88214", fault: "500" });
    expect((await request("/api/payments/AQH-100306-PMT")).status).toBe(500);
    expect((await request("/api/payments/AQH-100307-PMT")).status).toBe(500);
    expect((await request("/api/payments", { order_id: "bad" })).status).toBe(
      400,
    );
    await scenario({ fault: "none" });
    expect(await read("AQH-100307-PMT")).toMatchObject({
      status: "awaiting_payment",
    });
  });

  it("globally resets all payments, amounts, latches, metrics and reference sequence", async () => {
    await create();
    await create("ORD-88214");
    await scenario({ status: "underpaid", orderAmount: "250" });
    await scenario({
      order_id: "ORD-88214",
      status: "paid",
      orderAmount: "80",
      advanceMs: 900000,
    });
    expect((await request("/api/demo/reset", { freeze: true })).status).toBe(
      200,
    );
    expect(await (await request("/api/demo")).json()).toEqual({
      payment: null,
      orders: [
        {
          order_id: "ORD-88213",
          payment_reference: null,
          status: null,
          fundsObserved: false,
        },
      ],
      requireSignature: false,
      now: "2026-08-14T08:37:10.842Z",
      scenario: {
        fault: "none",
        delayMs: 5000,
        ttlMs: 900000,
        orderAmount: "149.90",
        requireSignature: false,
      },
      metrics: { gets: 0, posts: 0, activeGets: 0, maxActiveGets: 0 },
    });
    expect((await request("/api/payments/AQH-100306-PMT")).status).toBe(404);
    expect((await request("/api/payments/AQH-100307-PMT")).status).toBe(404);
    expect((await request("/api/demo?order_id=ORD-88214")).status).toBe(400);
    const registered = await request("/api/demo/orders", {});
    expect(registered.status).toBe(201);
    expect(await registered.json()).toMatchObject({ order_id: "ORD-88214" });
    expect(await create("ORD-88214")).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      order: { amount: "149.90" },
    });
    expect(await create()).toMatchObject({
      payment_reference: "AQH-100307-PMT",
      order: { amount: "149.90" },
    });
  });
});
