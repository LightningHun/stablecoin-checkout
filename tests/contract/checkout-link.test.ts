// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMockServer } from "../../mock/server";
import type { Server } from "node:http";

let server: Server;
let base: string;
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
beforeAll(async () => {
  server = createMockServer({
    now: () => Date.parse("2026-10-03T10:41:00.000Z"),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  expect(
    (
      await request("/api/demo/reset", {
        freeze: true,
        now: "2026-10-03T10:41:00.000Z",
      })
    ).status,
  ).toBe(200);
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("checkout link HTTP verdicts and order registry", () => {
  it("validates the default unsigned order with no-store server-time headers", async () => {
    const response = await request("/api/checkout/link?order_id=ORD-88213");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-server-time")).toBe(
      "2026-10-03T10:41:00.000Z",
    );
    expect(await response.json()).toEqual({
      valid: true,
      order_id: "ORD-88213",
      checked_at: "2026-10-03T10:41:00.000Z",
    });
  });
  it.each([
    ["?order_id=abc", "unknown_order", "abc"],
    ["?order_id=ORD-99999", "unknown_order", "ORD-99999"],
    [
      "?order_id=ORD-88213&sig=0000000000000000",
      "invalid_signature",
      "ORD-88213",
    ],
    ["?order_id=ORD-88213&sig=", "invalid_signature", "ORD-88213"],
    ["?order_id=ORD-99999&sig=bad", "unknown_order", "ORD-99999"],
    ["?order_id=abc&sig=bad", "unknown_order", "abc"],
    ["?sig=0000000000000000", "malformed_order", null],
    ["?order_id=", "malformed_order", ""],
  ])(
    "returns a definitive 200 verdict for %s",
    async (query, reason, order_id) => {
      const response = await request("/api/checkout/link" + query);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        valid: false,
        reason,
        order_id,
        checked_at: "2026-10-03T10:41:00.000Z",
        help_url: "mailto:help@payment-project.example",
      });
    },
  );
  it("caps raw invalid order text to 64 characters", async () => {
    const response = await request(
      "/api/checkout/link?order_id=" + "a".repeat(300),
    );
    expect(await response.json()).toEqual({
      valid: false,
      reason: "malformed_order",
      order_id: "a".repeat(64),
      checked_at: "2026-10-03T10:41:00.000Z",
      help_url: "mailto:help@payment-project.example",
    });
  });
  it("registers an order and returns an actual verifiable 16-hex signed URL", async () => {
    const response = await request("/api/demo/orders", { amount: "250" });
    expect(response.status).toBe(201);
    const issued = await response.json();
    expect(issued.order_id).toBe("ORD-88214");
    expect(issued.sig).toMatch(/^[0-9a-f]{16}$/);
    expect(issued.sig).toBe("a1416bfa2bb82843");
    expect(issued.checkout_url).toBe(`/?order=ORD-88214&sig=${issued.sig}`);
    const query = new URL(issued.checkout_url, base).searchParams;
    expect(
      await (
        await request(
          `/api/checkout/link?order_id=${query.get("order")}&sig=${query.get("sig")}`,
        )
      ).json(),
    ).toEqual({
      valid: true,
      order_id: "ORD-88214",
      checked_at: "2026-10-03T10:41:00.000Z",
    });
    const catalogue = await request("/api/currencies?order_id=ORD-88214");
    expect(catalogue.status).toBe(200);
    expect(Object.keys(await catalogue.json())).toEqual(["currencies"]);
    const payment = await request("/api/payments", {
      order_id: "ORD-88214", currency: "USDT", network: "tron",
    });
    expect(payment.status).toBe(201);
    expect(await payment.json()).toMatchObject({
      order_id: "ORD-88214", order: { amount: "250.00" },
    });
    expect(await (await request("/api/demo/orders", {})).json()).toMatchObject({
      order_id: "ORD-88215",
    });
  });
  it("requires signatures only when configured and resets the registry and flag", async () => {
    const issued = await (await request("/api/demo/orders", {})).json();
    await request("/api/demo/scenario", { requireSignature: true });
    expect(
      await (await request("/api/checkout/link?order_id=ORD-88213")).json(),
    ).toEqual({
      valid: false,
      reason: "missing_signature",
      order_id: "ORD-88213",
      checked_at: "2026-10-03T10:41:00.000Z",
      help_url: "mailto:help@payment-project.example",
    });
    expect(
      await (
        await request(`/api/checkout/link?order_id=ORD-88214&sig=${issued.sig}`)
      ).json(),
    ).toMatchObject({ valid: true });
    expect(await (await request("/api/demo")).json()).toMatchObject({
      requireSignature: true,
      orders: [{ order_id: "ORD-88213" }, { order_id: "ORD-88214" }],
    });
    await request("/api/demo/reset", {
      freeze: true,
      now: "2026-10-03T10:41:00.000Z",
    });
    expect(
      await (
        await request(`/api/checkout/link?order_id=ORD-88214&sig=${issued.sig}`)
      ).json(),
    ).toMatchObject({ valid: false, reason: "unknown_order" });
    expect(await (await request("/api/demo")).json()).toMatchObject({
      requireSignature: false,
      orders: [
        {
          order_id: "ORD-88213",
          payment_reference: null,
          status: null,
          fundsObserved: false,
        },
      ],
    });
    expect(
      await (await request("/api/checkout/link?order_id=ORD-88213")).json(),
    ).toMatchObject({ valid: true });
  });
  it("does not register orders through catalogue, scenario or payment requests", async () => {
    const catalogue = await request("/api/currencies?order_id=ORD-99999");
    expect(catalogue.status).toBe(200);
    expect(Object.keys(await catalogue.json())).toEqual(["currencies"]);
    expect(await (await request("/api/checkout/link?order_id=ORD-99999")).json())
      .toMatchObject({ valid: false, reason: "unknown_order" });
    for (const [path, input] of [
      ["/api/demo/scenario", { order_id: "ORD-99999", orderAmount: "250" }],
      [
        "/api/payments",
        { order_id: "ORD-99999", currency: "USDT", network: "tron" },
      ],
    ] as const) {
      const response = await request(path, input);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ title: "Unknown order" });
    }
  });
  it("keeps faults uncertain rather than returning an invalid verdict", async () => {
    await request("/api/demo/scenario", { fault: "500" });
    const response = await request("/api/checkout/link?order_id=abc");
    expect(response.status).toBe(500);
    expect(response.headers.get("x-server-time")).toBe(
      "2026-10-03T10:41:00.000Z",
    );
    expect(await response.json()).toEqual({
      title: "Temporary payment server error",
    });
    expect((await request("/api/demo/orders", {})).status).toBe(201);
    await request("/api/demo/scenario", { fault: "disconnect" });
    await expect(request("/api/checkout/link?order_id=abc")).rejects.toThrow();
    await request("/api/demo/scenario", { fault: "slow", delayMs: 20 });
    const started = Date.now();
    expect(
      (await request("/api/checkout/link?order_id=ORD-88213")).status,
    ).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });
});
