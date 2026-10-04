import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { independentCatalogue } from "./fixtures";
import { paymentSnapshot } from "../fixtures/oracles";

const now = "2026-08-14T08:37:10.842Z";
const key = "stablecoin-checkout:payment-reference:ORD-88213";
const firstRequest = { order_id: "ORD-88213", currency: "USDT", network: "tron" };
async function api(page: Page, options: {
  hold?: boolean;
  fault?: "500" | "disconnect" | "invalid";
  reordered?: boolean;
  missing?: boolean;
  freshQuote?: boolean;
  faultAfterInitial?: boolean;
  rejectContinueOnce?: 400 | 429;
} = {}) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let current: Record<string, unknown> = paymentSnapshot();
  let creates = 0;
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now));
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : undefined;
    calls.push({ method: req.method(), path, body });
    const headers = { "content-type": "application/json", "x-server-time": now };
    if (path === "/api/currencies") {
      const catalogue = structuredClone(independentCatalogue);
      if (options.reordered) {
        const usdc = catalogue.currencies[1]!;
        usdc.networks.reverse();
        catalogue.currencies = [usdc, catalogue.currencies[0]!, catalogue.currencies[2]!];
      }
      return route.fulfill({ headers, json: catalogue });
    }
    if (path === "/api/payments" && body) {
      expect(Object.keys(body).sort()).toEqual(["currency", "network", "order_id"]);
      creates++;
      if (options.hold) await gate;
      if (options.rejectContinueOnce && creates === 2) return route.fulfill({ status: options.rejectContinueOnce, headers, json: { title: "Payment request declined" } });
      const fault = !options.faultAfterInitial || creates > 1 ? options.fault : undefined;
      if (fault === "disconnect") return route.abort("connectionfailed");
      if (fault === "500") return route.fulfill({ status: 500, headers, json: { title: "Temporary server error" } });
      if (fault === "invalid") return route.fulfill({ status: 201, headers, json: { status: "awaiting_payment" } });
      let quote = body.network === "solana" ? {
        crypto_currency: "USDC", network: "solana", network_name: "Solana",
        exchange_rate: "0.9211", crypto_amount: "162.72", network_fee: "0.01", total_due: "162.73",
        crypto_address: "7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF", required_confirmations: 1,
        expires_at: "2026-08-14T08:52:10.842Z",
      } : body.network === "ethereum" ? {
        ...paymentSnapshot().quote, network: "ethereum", network_name: "Ethereum (ERC-20)",
        network_fee: "4.50", total_due: "167.19", required_confirmations: 3,
        crypto_address: "0x1111111111111111111111111111111111111111",
      } : paymentSnapshot().quote;
      if (options.freshQuote && creates > 1) quote = {
        ...quote, crypto_amount: "180.00", total_due: "181.00",
        crypto_address: "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1f",
        expires_at: "2026-08-14T08:57:10.842Z",
      };
      current = {
        ...paymentSnapshot(), payment_reference: creates === 1 ? "AQH-100306-PMT" : "AQH-100307-PMT",
        merchant: { name: "Nordwind Audio", logo_url: null }, order: { amount: "250.00", currency: "USD" }, quote,
      };
      return route.fulfill({ status: 201, headers, json: current });
    }
    if (options.missing && path === "/api/payments/old-ref") return route.fulfill({ status: 404, headers, json: { title: "Unknown payment" } });
    return route.fulfill({ headers, json: current });
  });
  return { calls, release, setPayment: (value: Record<string, unknown>) => { current = value; } };
}
async function noInitialTransfer(page: Page) {
  for (const id of ["transfer-qr", "transfer-amount", "transfer-address", "copy-amount", "copy-address", "countdown"])
    await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Get a new quote" })).toHaveCount(0);
  await expect(page.getByText("This quote expired", { exact: true })).toHaveCount(0);
}

test("initial information request uses the original three fields and retains only merchant and order without persistence or polling", async ({ page }) => {
  const stub = await api(page, { hold: true });
  try {
    await page.goto("/");
    await expect.poll(() => stub.calls.filter((c) => c.method === "POST").length).toBe(1);
    await expect(page.getByTestId("continue")).toHaveCount(0);
    await expect(page.getByTestId("fiat-total")).toHaveCount(0);
    await expect(page).toHaveTitle("Checkout");
    await noInitialTransfer(page);
    expect(stub.calls.map((c) => c.path)).toEqual(["/api/currencies", "/api/payments"]);
    expect(stub.calls[1]!.body).toEqual(firstRequest);
    stub.release();
    await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
    await expect(page).toHaveTitle("Nordwind Audio");
    await expect(page.getByTestId("continue")).toBeEnabled();
    await noInitialTransfer(page);
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("stablecoin-checkout:creation-pending:ORD-88213"))).toBeNull();
    await page.clock.runFor(4000);
    expect(stub.calls.filter((c) => c.method === "GET" && c.path.startsWith("/api/payments/"))).toEqual([]);
    await page.getByRole("radio", { name: "USDC", exact: true }).check();
    expect(stub.calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([firstRequest]);
  } finally { stub.release(); }
});

test("initial creation follows the first currency and network in the API catalogue", async ({ page }) => {
  const stub = await api(page, { reordered: true });
  await page.goto("/");
  await expect(page.getByTestId("continue")).toHaveText("Continue with USDC on Solana");
  expect(stub.calls[1]!.body).toEqual({ order_id: "ORD-88213", currency: "USDC", network: "solana" });
});

for (const fault of ["500", "disconnect", "invalid", "timeout"] as const) {
  test(`uncertain initial creation (${fault}) never automatically or manually repeats POST`, async ({ page }) => {
    const stub = await api(page, fault === "timeout" ? { hold: true } : { fault });
    try {
      await page.goto("/");
      await expect.poll(() => stub.calls.filter((c) => c.method === "POST").length).toBe(1);
      if (fault === "timeout") await page.clock.runFor(10001);
      await expect(page.getByRole("alert")).toContainText("The quote request outcome is uncertain.");
      await expect(page.getByTestId("retry")).toHaveCount(0);
      await expect(page.getByTestId("continue")).toHaveCount(0);
      await noInitialTransfer(page);
      await page.clock.runFor(120000);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      expect(stub.calls.map((c) => c.path)).toEqual(["/api/currencies", "/api/payments"]);
      expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    } finally { stub.release(); }
  });
}

test("reload after an unknown initial creation outcome never sends a second POST", async ({ page }) => {
  const pendingKey = "stablecoin-checkout:creation-pending:ORD-88213";
  const stub = await api(page, { fault: "500" });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("The quote request outcome is uncertain.");
  expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBe("1");
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("The quote request outcome is uncertain.");
  await expect(page.getByTestId("retry")).toHaveCount(0);
  await expect(page.getByTestId("continue")).toHaveCount(0);
  await noInitialTransfer(page);
  await page.clock.runFor(120000);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(stub.calls.map((call) => call.path)).toEqual(["/api/currencies", "/api/payments"]);
  expect(stub.calls[1]!.body).toEqual(firstRequest);
  expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBe("1");
});

test("reload while the initial creation response is pending cannot send another POST", async ({ page }) => {
  const pendingKey = "stablecoin-checkout:creation-pending:ORD-88213";
  const stub = await api(page, { hold: true, fault: "disconnect" });
  try {
    await page.goto("/");
    await expect.poll(() => stub.calls.filter((call) => call.method === "POST").length).toBe(1);
    expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBe("1");
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("The quote request outcome is uncertain.");
    await expect(page.getByTestId("retry")).toHaveCount(0);
    await expect(page.getByTestId("continue")).toHaveCount(0);
    await noInitialTransfer(page);
    stub.release();
    await page.clock.runFor(120000);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(stub.calls.map((call) => call.path)).toEqual(["/api/currencies", "/api/payments"]);
    expect(stub.calls[1]!.body).toEqual(firstRequest);
    expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBe("1");
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  } finally {
    stub.release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("reload after an unknown Continue outcome does not reuse initial information or repeat creation", async ({ page }) => {
  const pendingKey = "stablecoin-checkout:creation-pending:ORD-88213";
  const stub = await api(page, { fault: "500", faultAfterInitial: true });
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBeNull();
  await page.getByTestId("continue").click();
  await expect(page.getByRole("alert")).toContainText("The quote request outcome is uncertain.");
  await expect(page.getByTestId("demo-recover")).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBe("1");
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("The quote request outcome is uncertain.");
  await expect(page.getByTestId("continue")).toHaveCount(0);
  await noInitialTransfer(page);
  await page.clock.runFor(120000);
  expect(stub.calls.map((call) => call.path)).toEqual(["/api/currencies", "/api/payments", "/api/payments"]);
  expect(stub.calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([firstRequest, firstRequest]);
});

for (const status of [400, 429] as const) {
  test(`a definitive ${status} on first Continue preserves the selector and allows a new explicit attempt`, async ({ page }) => {
    const pendingKey = "stablecoin-checkout:creation-pending:ORD-88213";
    const stub = await api(page, { rejectContinueOnce: status, freshQuote: true });
    await page.goto("/");
    await expect(page.getByTestId("continue")).toBeEnabled();
    await page.getByTestId("continue").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("continue")).toBeEnabled();
    await expect(page.getByRole("radio", { name: "USDT", exact: true })).toBeChecked();
    await expect(page).toHaveTitle("Nordwind Audio");
    await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
    await noInitialTransfer(page);
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
    expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBeNull();
    await page.clock.runFor(4000);
    expect(stub.calls.map((call) => call.path)).toEqual(["/api/currencies", "/api/payments", "/api/payments"]);
    await page.getByTestId("continue").click();
    await expect(page.getByTestId("transfer-amount")).toHaveText(/181\.00\s*USDT/);
    await expect(page.getByTestId("transfer-address")).toHaveText("TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1f");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(stub.calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([firstRequest, firstRequest, firstRequest]);
    expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe("AQH-100307-PMT");
    expect(await page.evaluate((k) => localStorage.getItem(k), pendingKey)).toBeNull();
  });
}

test("an unresolved replacement marker takes precedence over an older saved payment reference", async ({ page }) => {
  const stub = await api(page);
  await page.addInitScript(() => {
    localStorage.setItem("stablecoin-checkout:payment-reference:ORD-88213", "AQH-100306-PMT");
    localStorage.setItem("stablecoin-checkout:creation-pending:ORD-88213", "1");
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("The quote request outcome is uncertain.");
  await expect(page.getByTestId("continue")).toHaveCount(0);
  await noInitialTransfer(page);
  await page.clock.runFor(120000);
  expect(stub.calls).toEqual([]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe("AQH-100306-PMT");
});

test("Continue on the initial pair creates a fresh payment and uses its amount, address, expiry and reference", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const stub = await api(page, { freshQuote: true });
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toHaveText(/181\.00\s*USDT/);
  await expect(page.getByTestId("transfer-address")).toHaveText("TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1f");
  await expect(page.getByTestId("countdown")).toHaveText("20:00");
  expect(stub.calls.map((c) => c.path)).toEqual(["/api/currencies", "/api/payments", "/api/payments"]);
  expect(stub.calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([firstRequest, firstRequest]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe("AQH-100307-PMT");
  await expect(page.locator(".send-step")).toBeFocused();
  await page.getByTestId("copy-address").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1f");
  await page.getByTestId("copy-amount").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("181.00");
  const png = PNG.sync.read(await page.getByTestId("transfer-qr").screenshot());
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(decoded?.data).toBe("TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1f");
  await page.clock.runFor(4000);
  expect(stub.calls.filter((c) => c.path === "/api/payments/AQH-100306-PMT")).toEqual([]);
  await expect.poll(() => stub.calls.filter((c) => c.path === "/api/payments/AQH-100307-PMT").length).toBe(2);
});

test("reload before Continue stays on the selector and never restores an informational payment", async ({ page }) => {
  const stub = await api(page);
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await page.getByRole("radio", { name: "USDC", exact: true }).check();
  await noInitialTransfer(page);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await page.reload();
  await expect(page.getByTestId("continue")).toHaveText("Continue with USDT on Tron (TRC-20)");
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
  await expect(page).toHaveTitle("Nordwind Audio");
  await noInitialTransfer(page);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  expect(stub.calls.map((c) => c.path)).toEqual(["/api/currencies", "/api/payments", "/api/currencies", "/api/payments"]);
  expect(stub.calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([firstRequest, firstRequest]);
});

test("the discarded initial quote cannot expire or poll while the user is choosing", async ({ page }) => {
  const stub = await api(page);
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await page.clock.runFor(900001);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 USD");
  await noInitialTransfer(page);
  expect(stub.calls.map((c) => c.path)).toEqual(["/api/currencies", "/api/payments"]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
});

test("changing draft selection creates no payment until Continue creates the real payment", async ({ page }) => {
  const stub = await api(page);
  await page.goto("/");
  await page.getByRole("radio", { name: "Ethereum (ERC-20)", exact: true }).check();
  expect(stub.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("167.19");
  expect(stub.calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([firstRequest, { order_id: "ORD-88213", currency: "USDT", network: "ethereum" }]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe("AQH-100307-PMT");
});

test("saved payment restores through GET without a creation POST", async ({ page }) => {
  const stub = await api(page);
  stub.setPayment(paymentSnapshot("underpaid"));
  await page.addInitScript((k) => localStorage.setItem(k, "AQH-100306-PMT"), key);
  await page.goto("/");
  await expect(page.getByTestId("transfer-amount")).toContainText("43.69");
  expect(stub.calls.filter((c) => c.method === "POST")).toEqual([]);
});

test("a missing saved reference loads only new checkout information and keeps the selector open", async ({ page }) => {
  const stub = await api(page, { missing: true });
  await page.addInitScript((k) => localStorage.setItem(k, "old-ref"), key);
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  expect(stub.calls.map((c) => c.path)).toEqual(["/api/currencies", "/api/payments/old-ref", "/api/payments"]);
  expect(stub.calls[2]!.body).toEqual(firstRequest);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await noInitialTransfer(page);
});

test("real backend gives Continue a fresh reference and expiry then restores only that payment after reload", async ({ page, request }) => {
  await request.post("/api/demo/reset", { data: { now, freeze: true } });
  const posts: Record<string, unknown>[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/payments") posts.push(r.postDataJSON()); });
  await page.goto("/?demo=1");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await noInitialTransfer(page);
  expect(posts).toEqual([firstRequest]);
  const initial = (await (await request.get("/api/demo")).json()).payment;
  expect(initial).toMatchObject({ payment_reference: "AQH-100306-PMT", status: "awaiting_payment", quote: { expires_at: "2026-08-14T08:52:10.842Z" } });
  await request.post("/api/demo/scenario", { data: { advanceMs: 300000 } });
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
  const continued = (await (await request.get("/api/demo")).json()).payment;
  expect(continued.payment_reference).toBe("AQH-100307-PMT");
  expect(continued.quote.expires_at).toBe("2026-08-14T08:57:10.842Z");
  expect(posts).toEqual([firstRequest, firstRequest]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe("AQH-100307-PMT");
  await page.reload();
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
  expect(posts).toEqual([firstRequest, firstRequest]);
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe("AQH-100307-PMT");
  await expect(page.getByTestId("continue")).toHaveCount(0);
});
