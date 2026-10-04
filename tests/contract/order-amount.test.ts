// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createMockServer } from "../../backend/server";

// Independent HTTP expectations: the quote amounts below were calculated offline
// with Python Decimal at precision 70 and ROUND_HALF_UP, from the declared seeds.
// No production money helper, fixture, or shared test oracle supplies expectations.
const initialTime = "2026-08-14T08:37:10.842Z";
const originalExpiry = "2026-08-14T08:52:10.842Z";
let injectedTime = Date.parse(initialTime);
let server: Server;
let base: string;

interface PaymentSnapshot {
  payment_reference: string;
  order_id: string;
  status: string;
  order: { currency: string; amount: string };
  quote: {
    crypto_currency: string;
    network: string;
    crypto_amount: string;
    network_fee: string;
    total_due: string;
    exchange_rate: string;
    expires_at: string;
  };
  [key: string]: unknown;
}

async function request(path: string, body?: unknown) {
  return fetch(
    `${base}${path}`,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}
async function control(path: string, body: Record<string, unknown>) {
  const response = await request(path, body);
  expect(response.status).toBe(200);
  return response.json();
}
async function create(currency = "USDT", network = "tron") {
  const response = await request("/api/payments", {
    order_id: "ORD-88213",
    currency,
    network,
  });
  expect(response.status).toBe(201);
  return (await response.json()) as PaymentSnapshot;
}
async function read(reference: string) {
  const response = await request(`/api/payments/${reference}`);
  expect(response.status).toBe(200);
  return (await response.json()) as PaymentSnapshot;
}
async function demo() {
  const response = await request("/api/demo");
  expect(response.status).toBe(200);
  return response.json();
}
async function currencies() {
  const response = await request("/api/currencies");
  expect(response.status).toBe(200);
  return response.json();
}

beforeAll(async () => {
  server = createMockServer({ now: () => injectedTime });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Mock failed to bind an HTTP port");
  base = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  injectedTime = Date.parse(initialTime);
  await control("/api/demo/reset", { now: initialTime, freeze: true });
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const expectedCurrencies = [
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
      {
        id: "ethereum",
        name: "Ethereum (ERC-20)",
        network_fee: "4.50",
        required_confirmations: 3,
        avg_confirmation_seconds: 180,
      },
    ],
  },
  {
    code: "USDC",
    name: "USD Coin",
    decimals: 6,
    networks: [
      {
        id: "ethereum",
        name: "Ethereum (ERC-20)",
        network_fee: "4.50",
        required_confirmations: 3,
        avg_confirmation_seconds: 180,
      },
      {
        id: "polygon",
        name: "Polygon",
        network_fee: "0.10",
        required_confirmations: 6,
        avg_confirmation_seconds: 30,
      },
      {
        id: "solana",
        name: "Solana",
        network_fee: "0.01",
        required_confirmations: 1,
        avg_confirmation_seconds: 15,
      },
    ],
  },
  {
    code: "ETH",
    name: "Ethereum",
    decimals: 18,
    networks: [
      {
        id: "ethereum",
        name: "Ethereum",
        network_fee: "3.20",
        required_confirmations: 3,
        avg_confirmation_seconds: 180,
      },
    ],
  },
];
const endpoints = ["/api/demo/reset", "/api/demo/scenario"] as const;

// Each row is currency, network, seed amount, fixed rate, fixed fee, seed total.
const defaultQuotes = [
  ["USDT", "tron", "162.69", "0.9214", "1.00", "163.69"],
  ["USDT", "ethereum", "162.69", "0.9214", "4.50", "167.19"],
  ["USDC", "ethereum", "162.70", "0.9213", "4.50", "167.20"],
  ["USDC", "polygon", "162.71", "0.9212", "0.10", "162.81"],
  ["USDC", "solana", "162.72", "0.9211", "0.01", "162.73"],
  [
    "ETH",
    "ethereum",
    "0.061234567890123456",
    "2448.0123",
    "3.20",
    "3.261234567890123456",
  ],
] as const;

// Scaled smallest units = round_half_up(seed units * 25000 / 14990).
const quotesAt250 = [
  ["USDT", "tron", "271.330887", "0.9214", "1.00", "272.330887"],
  ["USDT", "ethereum", "271.330887", "0.9214", "4.50", "275.830887"],
  ["USDC", "ethereum", "271.347565", "0.9213", "4.50", "275.847565"],
  ["USDC", "polygon", "271.364243", "0.9212", "0.10", "271.464243"],
  ["USDC", "solana", "271.380921", "0.9211", "0.01", "271.390921"],
  [
    "ETH",
    "ethereum",
    "0.102125696948171207",
    "2448.0123",
    "3.20",
    "3.302125696948171207",
  ],
] as const;

describe("configurable mock order amount HTTP contract", () => {
  it("exposes currencies only while keeping order amounts on payment responses", async () => {
    expect(await currencies()).toEqual({
      currencies: expectedCurrencies,
    });
    expect(await demo()).toMatchObject({ scenario: { orderAmount: "149.90" } });
  });

  it.each(defaultQuotes)(
    "preserves the exact default %s/%s monetary strings",
    async (currency, network, amount, rate, fee, total) => {
      expect(await create(currency, network)).toMatchObject({
        order_id: "ORD-88213",
        status: "awaiting_payment",
        merchant: { name: "nordwind audio", logo_url: null },
        order: { currency: "EUR", amount: "149.90" },
        quote: {
          crypto_currency: currency,
          network,
          crypto_amount: amount,
          exchange_rate: rate,
          network_fee: fee,
          total_due: total,
          expires_at: originalExpiry,
        },
      });
    },
  );

  it.each(quotesAt250)(
    "scales %s/%s at 250.00 using exact units and fixed fees/rates",
    async (currency, network, amount, rate, fee, total) => {
      await control("/api/demo/reset", {
        orderAmount: "250.00",
        now: initialTime,
        freeze: true,
      });
      expect(await create(currency, network)).toMatchObject({
        order: { currency: "EUR", amount: "250.00" },
        quote: {
          crypto_currency: currency,
          network,
          crypto_amount: amount,
          exchange_rate: rate,
          network_fee: fee,
          total_due: total,
        },
      });
      expect(await currencies()).toEqual({
        currencies: expectedCurrencies,
      });
    },
  );

  describe.each(endpoints)("%s amount validation", (endpoint) => {
    it.each([
      ["250", "250.00"],
      ["250.0", "250.00"],
      ["149.9", "149.90"],
      ["0.1", "0.10"],
    ])("normalizes %s to %s", async (input, expected) => {
      await control(endpoint, {
        orderAmount: input,
        now: initialTime,
        freeze: true,
      });
      expect(await demo()).toMatchObject({
        scenario: { orderAmount: expected },
      });
      expect(await currencies()).toEqual({ currencies: expectedCurrencies });
      expect(await create()).toMatchObject({ order: { amount: expected } });
    });

    it.each([
      ["0.01", "0.010853", "1.010853"],
      ["999999.99", "1085323.538179", "1085324.538179"],
    ])(
      "accepts the inclusive boundary %s",
      async (orderAmount, amount, total) => {
        await control(endpoint, {
          orderAmount,
          now: initialTime,
          freeze: true,
        });
        expect(await create()).toMatchObject({
          order: { amount: orderAmount },
          quote: {
            crypto_amount: amount,
            network_fee: "1.00",
            total_due: total,
            exchange_rate: "0.9214",
          },
        });
      },
    );

    it.each([
      "0",
      "0.00",
      "-5",
      "1.234",
      "abc",
      "1000000",
      "1000000.00",
      "01",
      "00.01",
      "250.",
      ".50",
      "+1",
      "1e2",
      " 250",
      "250 ",
      "",
      250,
      null,
      true,
    ])(
      "rejects invalid orderAmount %j with no observable state change",
      async (orderAmount) => {
        await control("/api/demo/scenario", { orderAmount: "250.00" });
        await create();
        const before = await demo();
        const beforeCatalogue = await currencies();
        const response = await request(endpoint, { orderAmount });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          title: "Invalid order amount",
        });
        expect(await demo()).toEqual(before);
        expect(await currencies()).toEqual(beforeCatalogue);
      },
    );
  });

  it("invalid reset atomically preserves payment, clock, scenario, metrics, and next reference", async () => {
    await control("/api/demo/reset", {
      orderAmount: "250.00",
      freeze: true,
      now: initialTime,
      ttlMs: 120000,
    });
    const original = await create();
    const before = await demo();
    const response = await request("/api/demo/reset", {
      orderAmount: "1.234",
      now: "2030-01-01T00:00:00.000Z",
      freeze: false,
      ttlMs: 1,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ title: "Invalid order amount" });
    expect(await demo()).toEqual(before);
    injectedTime += 60000;
    expect((await demo()).now).toBe(initialTime);
    expect(await read(original.payment_reference)).toEqual(original);
    const next = await create("USDC", "polygon");
    expect(next.payment_reference).toBe("AQH-100307-PMT");
    expect(next.quote.expires_at).toBe("2026-08-14T08:39:10.842Z");
    expect(next.order.amount).toBe("250.00");
  });

  it("invalid scenario atomically preserves time, fault, delay, status, and amount", async () => {
    await control("/api/demo/scenario", { orderAmount: "250.00" });
    const original = await create();
    const before = await demo();
    const response = await request("/api/demo/scenario", {
      orderAmount: "0",
      advanceMs: 900000,
      fault: "500",
      delayMs: 1,
      status: "paid",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ title: "Invalid order amount" });
    expect(await demo()).toEqual(before);
    expect(await read(original.payment_reference)).toEqual(original);
    expect((await create("USDC", "polygon")).payment_reference).toBe(
      "AQH-100307-PMT",
    );
  });

  it("invalid reset preserves observed funds and the confirmation schedule", async () => {
    const original = await create("USDT", "ethereum");
    await control("/api/demo/scenario", {
      status: "confirming",
      advanceMs: 1000,
    });
    const before = await demo();
    const response = await request("/api/demo/reset", {
      orderAmount: "-5",
      freeze: true,
      now: initialTime,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ title: "Invalid order amount" });
    expect(await demo()).toEqual(before);
    expect(
      (
        await request("/api/payments", {
          order_id: "ORD-88213",
          currency: "USDC",
          network: "polygon",
        })
      ).status,
    ).toBe(409);
    await control("/api/demo/scenario", { advanceMs: 179000 });
    expect(await read(original.payment_reference)).toMatchObject({
      status: "confirming",
      confirmations: 2,
    });
    await control("/api/demo/scenario", { advanceMs: 1000 });
    expect(await read(original.payment_reference)).toMatchObject({
      status: "paid",
      confirmations: 3,
    });
  });

  it("scenario updates affect new quotes while the existing payment snapshot stays fixed", async () => {
    const original = await create();
    await control("/api/demo/scenario", { orderAmount: "250" });
    expect(await read(original.payment_reference)).toEqual(original);
    expect(await currencies()).toEqual({ currencies: expectedCurrencies });
    const replacement = await create("USDC", "polygon");
    expect(replacement).toMatchObject({
      order: { amount: "250.00" },
      quote: { crypto_amount: "271.364243", total_due: "271.464243" },
    });
    expect(replacement.payment_reference).not.toBe(original.payment_reference);
  });

  it("amount changes never rewrite an existing quote when a status is applied", async () => {
    const original = await create();
    await control("/api/demo/scenario", {
      orderAmount: "250",
      status: "underpaid",
    });
    expect(await read(original.payment_reference)).toMatchObject({
      order: { amount: "149.90" },
      quote: original.quote,
      status: "underpaid",
      amount_received: "120.00",
      amount_outstanding: "43.69",
    });
  });

  it("reset without an amount restores 149.90 after a configured amount", async () => {
    await control("/api/demo/scenario", { orderAmount: "250.00" });
    const original = await create();
    await control("/api/demo/reset", { freeze: true, now: initialTime });
    expect(await demo()).toMatchObject({
      scenario: { orderAmount: "149.90" },
      payment: null,
    });
    expect(
      (await request(`/api/payments/${original.payment_reference}`)).status,
    ).toBe(404);
    expect(await currencies()).toEqual({ currencies: expectedCurrencies });
    expect(await create()).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      order: { amount: "149.90" },
      quote: { crypto_amount: "162.69", total_due: "163.69" },
    });
  });

  it("uses floor(total units / 2) for a 100.00 Tron underpayment and retains the odd unit outstanding", async () => {
    await control("/api/demo/scenario", { orderAmount: "100.00" });
    const original = await create();
    await control("/api/demo/scenario", { status: "underpaid" });
    expect(await read(original.payment_reference)).toMatchObject({
      status: "underpaid",
      order: { amount: "100.00" },
      quote: { crypto_amount: "108.532355", total_due: "109.532355" },
      amount_received: "54.766177",
      amount_outstanding: "54.766178",
    });
  });

  it("retains 120.00 received for a non-ETH total greater than 120", async () => {
    await control("/api/demo/scenario", { orderAmount: "250.00" });
    const original = await create();
    await control("/api/demo/scenario", { status: "underpaid" });
    expect(await read(original.payment_reference)).toMatchObject({
      status: "underpaid",
      amount_received: "120.00",
      amount_outstanding: "152.330887",
      quote: { total_due: "272.330887" },
    });
  });

  it.each([
    ["USDT", "tron", "288.640887", "16.31"],
    ["USDC", "polygon", "287.774243", "16.31"],
    ["ETH", "ethereum", "3.312125696948171207", "0.01"],
  ])(
    "preserves the fixed overpayment excess for %s/%s at 250.00",
    async (currency, network, received, excess) => {
      await control("/api/demo/scenario", { orderAmount: "250.00" });
      const original = await create(currency, network);
      await control("/api/demo/scenario", { status: "overpaid" });
      expect(await read(original.payment_reference)).toMatchObject({
        status: "overpaid",
        order: { amount: "250.00" },
        amount_received: received,
        amount_excess: excess,
      });
    },
  );

  it.each([
    [
      "0.01",
      "0.000004085027877927",
      "3.200004085027877927",
      "1.600002042513938963",
      "1.600002042513938964",
    ],
    [
      "250.00",
      "0.102125696948171207",
      "3.302125696948171207",
      "1.651062848474085603",
      "1.651062848474085604",
    ],
    [
      "999999.99",
      "408.50278370765695196",
      "411.70278370765695196",
      "205.85139185382847598",
      "205.85139185382847598",
    ],
  ])(
    "rounds ETH exactly at 18 decimals for %s and keeps the half-total underpayment",
    async (orderAmount, amount, total, received, outstanding) => {
      await control("/api/demo/scenario", { orderAmount });
      const original = await create("ETH", "ethereum");
      expect(original).toMatchObject({
        order: { amount: orderAmount },
        quote: {
          crypto_amount: amount,
          network_fee: "3.20",
          total_due: total,
          exchange_rate: "2448.0123",
        },
      });
      await control("/api/demo/scenario", { status: "underpaid" });
      expect(await read(original.payment_reference)).toMatchObject({
        status: "underpaid",
        amount_received: received,
        amount_outstanding: outstanding,
      });
    },
  );

  it("requotes an expired payment using the current order amount and the same reference", async () => {
    const original = await create();
    await control("/api/demo/scenario", {
      orderAmount: "250.00",
      advanceMs: 900001,
    });
    expect(await read(original.payment_reference)).toMatchObject({
      status: "expired",
      order: { amount: "149.90" },
      quote: original.quote,
    });
    const response = await request(
      `/api/payments/${original.payment_reference}/requote`,
      { currency: "USDT", network: "tron" },
    );
    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result).toMatchObject({
      payment_reference: original.payment_reference,
      status: "awaiting_payment",
      order: { currency: "EUR", amount: "250.00" },
      quote: {
        crypto_amount: "271.330887",
        network_fee: "1.00",
        total_due: "272.330887",
        exchange_rate: "0.9214",
        expires_at: "2026-08-14T09:07:10.843Z",
      },
    });
    expect(result).not.toHaveProperty("expired_at");
    expect(await read(original.payment_reference)).toEqual(result);
  });
});
