import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

// Literal API fixtures: these expectations deliberately use no production helpers.
const now = "2026-08-14T08:37:10.842Z";
const orderId = "invoice_2026:customer-42";
const address = "custom-checkout-wallet-8-decimals";
const catalogue = {
  currencies: [
    {
      code: "TOK",
      name: "Custom token",
      decimals: 8,
      networks: [
        {
          id: "custom-chain",
          name: "Aurora Testchain",
          network_fee: "0.01000000",
          required_confirmations: 7,
          avg_confirmation_seconds: 45,
        },
        {
          id: "backup-chain",
          name: "Backup chain",
          network_fee: "0.02000000",
          required_confirmations: 9,
          avg_confirmation_seconds: 90,
        },
      ],
    },
    {
      code: "ALT",
      name: "Another token",
      decimals: 2,
      networks: [
        {
          id: "alternate-chain",
          name: "Alternate chain",
          network_fee: "0.05",
          required_confirmations: 2,
          avg_confirmation_seconds: 12,
        },
      ],
    },
  ],
};
const payment = {
  payment_reference: "custom-payment-42",
  order_id: orderId,
  status: "awaiting_payment",
  merchant: {
    name: "Aurora Audio",
    icon_url: "/test-merchant.svg",
    logo_url: null,
  },
  order: { currency: "USD", amount: "42.75" },
  quote: {
    crypto_currency: "TOK",
    network: "custom-chain",
    network_name: "Aurora Testchain",
    exchange_rate: "34.348",
    crypto_amount: "1.23456789",
    network_fee: "0.01",
    total_due: "1.24456789",
    crypto_address: address,
    required_confirmations: 7,
    expires_at: "2026-08-14T08:52:10.842Z",
  },
};

async function customApi(
  page: Page,
  initial: Record<string, unknown> = payment,
) {
  let current = initial;
  const creates: unknown[] = [];
  await page.clock.install({ time: new Date(now) });
  await page.route("**/test-merchant.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="black"/></svg>',
    }),
  );
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let body: unknown = current;
    let status = 200;
    if (path === "/api/checkout/link")
      body = { valid: true, order_id: orderId, checked_at: now };
    if (path === "/api/currencies") body = catalogue;
    if (path === "/api/payments" && request.method() === "POST") {
      if (request.postDataJSON().purpose === "bootstrap") {
        body = { ...current, payment_reference: "BOOT-custom-42", status: "expired", expired_at: now, quote: { ...payment.quote, expires_at: now } };
      } else creates.push(request.postDataJSON());
      status = 201;
    }
    // Neither x-server-time nor Date is supplied: the app must accept the API.
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return {
    creates,
    setPayment(value: Record<string, unknown>) {
      current = value;
    },
  };
}

test("API catalogue owns first selection, metadata, precision, branding and USD quote without a time header", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const api = await customApi(page);
  await page.goto(`/?order=${encodeURIComponent(orderId)}`);
  await expect(page.locator("header .merchant")).toContainText("Aurora Audio");
  await expect(page).toHaveTitle("Aurora Audio");
  await expect(page.getByTestId("fiat-total")).toHaveText("42.75 USD");
  await expect(
    page.getByRole("radio", { name: "TOK", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "Aurora Testchain", exact: true }),
  ).toBeChecked();
  await expect(page.getByTestId("continue")).toHaveText(
    "Continue with TOK on Aurora Testchain",
  );
  await expect(page.locator(".network-option").first()).toContainText(
    "7 confirmations",
  );
  await expect(page.locator(".network-option").first()).toContainText("45 s");
  await expect(page.locator(".network-option").first()).toContainText(
    "0.01000000 TOK",
  );
  await expect(
    page.getByText("Fees are set by the network.", { exact: true }),
  ).toHaveCount(0);
  await page.getByTestId("continue").click();
  expect(api.creates).toEqual([
    { order_id: orderId, currency: "TOK", network: "custom-chain" },
  ]);
  await expect(page).toHaveTitle("Aurora Audio");
  await expect(page.locator("header .merchant")).toContainText("Aurora Audio");
  await expect(page.locator("header .merchant img")).toHaveAttribute(
    "src",
    /\/test-merchant\.svg$/,
  );
  await expect(page.getByTestId("fiat-total")).toHaveText("42.75 USD");
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /1\.24456789\s*TOK/,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("countdown")).toBeVisible();
  await page.getByTestId("copy-amount").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "1.24456789",
  );
  await page.getByTestId("copy-address").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    address,
  );
  const png = PNG.sync.read(await page.getByTestId("transfer-qr").screenshot());
  expect(
    jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data,
  ).toBe(address);

  api.setPayment({
    ...payment,
    status: "underpaid",
    amount_received: "0.20000000",
    amount_outstanding: "1.04456789",
    crypto_address: address,
    tx_hash: "custom-transaction-42",
  });
  await page.clock.runFor(2200);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "underpaid",
  );
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /1\.04456789\s*TOK/,
  );
  await page.getByTestId("copy-amount").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "1.04456789",
  );
  await expect(page.locator(".partial-progress > span")).toHaveAttribute(
    "style",
    "width: 16.06%;",
  );
  await expect(page.getByTestId("countdown")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const icon of [
  null,
  "/missing-merchant-icon.png",
  "javascript:alert(1)",
]) {
  test(`merchant initial replaces an absent, broken or unsafe icon: ${String(icon)}`, async ({
    page,
  }) => {
    await customApi(page, {
      ...payment,
      merchant: { name: "Nordwind Audio", icon_url: icon },
    });
    await page.route("**/missing-merchant-icon.png", (route) =>
      route.fulfill({ status: 404, body: "missing" }),
    );
    await page.goto(`/?order=${encodeURIComponent(orderId)}`);
    await page.getByTestId("continue").click();
    await expect(page).toHaveTitle("Nordwind Audio");
    await expect(page.locator("header .merchant-mark")).toHaveText("N");
    await expect(page.locator("header .merchant img")).toHaveCount(0);
    await expect(page.getByTestId("transfer-amount")).toHaveText(
      /1\.24456789\s*TOK/,
    );
  });
}

test("missing initial merchant and order amount block Continue without inventing values", async ({
  page,
}) => {
  await customApi(page, {
    ...payment,
    merchant: undefined,
    order: { currency: "USD" },
  });
  await page.goto(`/?order=${encodeURIComponent(orderId)}`);
  await expect(page.getByRole("alert")).toContainText("invalid data");
  await expect(page).toHaveTitle("Checkout");
  await expect(page.getByTestId("continue")).toHaveCount(0);
  await expect(page.getByTestId("fiat-total")).toHaveCount(0);
  await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
});
