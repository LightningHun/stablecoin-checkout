import { expect, test, type Page } from "@playwright/test";
import { independentCatalogue } from "./fixtures";
import { paymentSnapshot } from "../fixtures/oracles";
const now = "2026-08-14T08:37:10.842Z";
const key = "stablecoin-checkout:payment-reference:ORD-88213";
async function api(
  page: Page,
  options: {
    hold?: boolean;
    fail?: boolean;
    reordered?: boolean;
    missing?: boolean;
  } = {},
) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = options.fail ?? false;
  let amount = "250.00";
  let current: Record<string, unknown> = paymentSnapshot();
  const calls: Array<{
    method: string;
    path: string;
    body?: Record<string, unknown>;
  }> = [];
  await page.clock.install({ time: new Date(now) });
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : undefined;
    calls.push({ method: req.method(), path, body });
    const headers = {
      "content-type": "application/json",
      "x-server-time": now,
    };
    if (path === "/api/currencies") {
      const catalogue = structuredClone(independentCatalogue);
      if (options.reordered) {
        const usdc = catalogue.currencies[1]!;
        usdc.networks.reverse();
        catalogue.currencies = [
          usdc,
          catalogue.currencies[0]!,
          catalogue.currencies[2]!,
        ];
      }
      return route.fulfill({ headers, json: catalogue });
    }
    if (body?.purpose === "bootstrap") {
      if (options.hold) await gate;
      if (fail)
        return route.fulfill({
          status: 500,
          headers,
          json: { title: "Temporary payment server error" },
        });
      const quote = options.reordered
        ? {
            crypto_currency: "USDC",
            network: "solana",
            network_name: "Solana",
            exchange_rate: "0.9211",
            crypto_amount: "162.72",
            network_fee: "0.01",
            total_due: "162.73",
            crypto_address: "7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF",
            required_confirmations: 1,
            expires_at: now,
          }
        : { ...paymentSnapshot().quote, expires_at: now };
      return route.fulfill({
        status: 201,
        headers,
        json: {
          ...paymentSnapshot("expired"),
          payment_reference: "BOOT-1-PMT",
          merchant: { name: "Nordwind Audio", logo_url: null },
          order: { amount, currency: "USD" },
          quote,
          expired_at: now,
        },
      });
    }
    if (path === "/api/payments" && body) {
      current = {
        ...paymentSnapshot(),
        merchant: { name: "Actual merchant" },
        order: { amount: "80.00", currency: "GBP" },
      };
      return route.fulfill({ status: 201, headers, json: current });
    }
    if (options.missing)
      return route.fulfill({
        status: 404,
        headers,
        json: { title: "Unknown payment" },
      });
    return route.fulfill({ headers, json: current });
  });
  return {
    calls,
    release,
    recover: () => {
      fail = false;
    },
    setAmount: (value: string) => {
      amount = value;
    },
    setPayment: (value: Record<string, unknown>) => {
      current = value;
    },
  };
}
async function noInitialTransfer(page: Page) {
  for (const id of [
    "transfer-qr",
    "transfer-amount",
    "transfer-address",
    "copy-amount",
    "copy-address",
    "countdown",
  ])
    await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Get a new quote" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("This quote expired", { exact: true }),
  ).toHaveCount(0);
}
test("initial POST is gated, then displays API metadata without a live payment or stored reference", async ({
  page,
}) => {
  const stub = await api(page, { hold: true });
  await page.goto("/");
  await expect
    .poll(
      () => stub.calls.filter((c) => c.body?.purpose === "bootstrap").length,
    )
    .toBe(1);
  await expect(page.getByTestId("continue")).toHaveCount(0);
  await expect(page.getByTestId("fiat-total")).toHaveCount(0);
  await expect(page).toHaveTitle("Checkout");
  await expect(page.getByText("Merchant", { exact: true })).toHaveCount(0);
  await noInitialTransfer(page);
  stub.release();
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
  await expect(page.locator("header .merchant")).toContainText(
    "Nordwind Audio",
  );
  await expect(page).toHaveTitle("Nordwind Audio");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await noInitialTransfer(page);
  await page.clock.runFor(30000);
  expect(stub.calls.map((c) => c.path)).toEqual([
    "/api/currencies",
    "/api/payments",
  ]);
  expect(stub.calls[1]!.body).toEqual({
    order_id: "ORD-88213",
    currency: "USDT",
    network: "tron",
    purpose: "bootstrap",
  });
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole("radio", { name: "USDC", exact: true }).check();
  expect(stub.calls).toHaveLength(2);
});
test("initial request follows a reordered API catalogue", async ({ page }) => {
  const stub = await api(page, { reordered: true });
  await page.goto("/");
  await expect(page.getByTestId("continue")).toHaveText(
    "Continue with USDC on Solana",
  );
  expect(stub.calls[1]!.body).toEqual({
    order_id: "ORD-88213",
    currency: "USDC",
    network: "solana",
    purpose: "bootstrap",
  });
});
test("failed initial POST retries initial information only, without an uncertain lock", async ({
  page,
}) => {
  const stub = await api(page, { fail: true });
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await noInitialTransfer(page);
  await expect(page.getByTestId("continue")).toHaveCount(0);
  stub.recover();
  await page.getByTestId("retry").click();
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
  expect(stub.calls.map((c) => c.path)).toEqual([
    "/api/currencies",
    "/api/payments",
    "/api/payments",
  ]);
  expect(
    stub.calls.slice(1).every((c) => c.body?.purpose === "bootstrap"),
  ).toBe(true);
});
test("Continue creates a new real payment and its information replaces initial metadata", async ({
  page,
}) => {
  const stub = await api(page);
  await page.goto("/");
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
  await expect(page.getByTestId("fiat-total")).toHaveText("80.00 GBP");
  await expect(page).toHaveTitle("Actual merchant");
  expect(stub.calls[2]!.body).toEqual({
    order_id: "ORD-88213",
    currency: "USDT",
    network: "tron",
  });
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "AQH-100306-PMT",
  );
  await expect(page.locator(".send-step")).toBeFocused();
});
test("saved payment restores without any bootstrap POST", async ({ page }) => {
  const stub = await api(page);
  stub.setPayment(paymentSnapshot("underpaid"));
  await page.addInitScript(
    (k) => localStorage.setItem(k, "AQH-100306-PMT"),
    key,
  );
  await page.goto("/");
  await expect(page.getByTestId("transfer-amount")).toContainText("43.69");
  expect(stub.calls.filter((c) => c.method === "POST")).toEqual([]);
});
test("a saved reference returning 404 is cleared before returning to the initial selector", async ({
  page,
}) => {
  const stub = await api(page, { missing: true });
  await page.addInitScript((k) => localStorage.setItem(k, "old-ref"), key);
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
  expect(stub.calls.map((c) => c.path)).toEqual([
    "/api/currencies",
    "/api/payments/old-ref",
    "/api/payments",
  ]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});
test("real mock expires bootstrap immediately, refreshes demo amount, preserves other payments and starts a fresh TTL on Continue", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/reset", { data: { freeze: true } });
  const initialRequests: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/payments")
      initialRequests.push(r.postDataJSON());
  });
  await page.goto("/?demo=1");
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await noInitialTransfer(page);
  expect(initialRequests).toEqual([
    {
      order_id: "ORD-88213",
      currency: "USDT",
      network: "tron",
      purpose: "bootstrap",
    },
  ]);
  expect((await (await request.get("/api/demo")).json()).payment).toBeNull();
  await page.getByTestId("demo-controls").locator("summary").click();
  await page.getByTestId("demo-order-amount").fill("250.00");
  await page.getByTestId("demo-apply-amount").click();
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 EUR");
  await request.post("/api/demo/scenario", { data: { advanceMs: 300000 } });
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("272.330887");
  const actual = (await (await request.get("/api/demo")).json()).payment;
  expect(actual).toMatchObject({
    status: "awaiting_payment",
    payment_reference: "AQH-100306-PMT",
    quote: { expires_at: "2026-08-14T08:57:10.842Z" },
  });
  await page.getByTestId("demo-state").selectOption("underpaid");
  await page.getByTestId("demo-apply-state").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("152.330887");
  const count = initialRequests.length;
  await page.reload();
  await expect(page.getByTestId("transfer-amount")).toContainText("152.330887");
  expect(initialRequests).toHaveLength(count);
  await page.getByTestId("demo-controls").locator("summary").click();
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await noInitialTransfer(page);
  expect((await (await request.get("/api/demo")).json()).payment).toBeNull();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});
