import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { paymentSnapshot, sourceAddress } from "../fixtures/oracles";
import { independentCatalogue, noTransferAction } from "./fixtures";

const now = "2026-08-14T08:37:10.842Z";
const storageKey = "stablecoin-checkout:payment-reference:ORD-88213";
const uncertainMutation =
  "The quote request outcome is uncertain. Do not send or create another payment.";

interface WirePayment {
  payment_reference: string;
  status: string;
  order: { currency: string; amount?: string };
  quote: Record<string, unknown>;
  [key: string]: unknown;
}

interface WireCatalogue {
  currencies: Array<{
    code: string;
    name: string;
    decimals: number;
    networks: Array<{
      id: string;
      name: string;
      network_fee: string;
      required_confirmations: number;
      avg_confirmation_seconds: number;
    }>;
  }>;
}

// Keep response fixtures and expected values independent of production helpers.
async function precisionApi(
  page: Page,
  initial: WirePayment = paymentSnapshot(),
  catalogue: WireCatalogue = independentCatalogue,
) {
  let current = initial;
  let requoteResponse: WirePayment | undefined;
  const requests = { create: 0, read: 0, requote: 0 };
  await page.clock.install({ time: new Date(now) });
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      "content-type": "application/json",
      "x-server-time": now,
    };
    let body: unknown = current;
    let status = 200;
    if (path === "/api/currencies") body = catalogue;
    else if (path === "/api/payments" && request.method() === "POST") {
      expect(Object.keys(request.postDataJSON()).sort()).toEqual(["currency", "network", "order_id"]);
      requests.create += 1;
      status = 201;
    } else if (path.endsWith("/requote") && request.method() === "POST") {
      requests.requote += 1;
      if (requoteResponse) current = requoteResponse;
      body = current;
      status = 201;
    } else requests.read += 1;
    return route.fulfill({ status, headers, body: JSON.stringify(body) });
  });
  return {
    requests,
    setPayment(payment: WirePayment) {
      current = payment;
    },
    setRequotePayment(payment: WirePayment) {
      requoteResponse = payment;
    },
  };
}

const missingOrderAmount = (): WirePayment => ({
  ...paymentSnapshot(),
  order: { currency: "EUR" },
});

async function expectInvalidResponse(page: Page, warning = "invalid data") {
  await expect(page.getByRole("alert")).toContainText(warning);
  await noTransferAction(page);
  await expect(page.getByTestId("transfer-address")).toHaveCount(0);
  await expect(page.getByText("0 EUR", { exact: true })).toHaveCount(0);
}

test("missing order amount on initial create blocks transfer without inventing metadata", async ({ page }) => {
  const api = await precisionApi(page, missingOrderAmount());
  await page.goto("/");
  await expectInvalidResponse(page, uncertainMutation);
  await expect(page.getByTestId("fiat-total")).toHaveCount(0);
  expect(api.requests.create).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
});

test("missing order amount on polling preserves accepted facts and hides transfer controls", async ({
  page,
}) => {
  const api = await precisionApi(page);
  await page.goto("/");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
  await expect(page.getByTestId("transfer-qr")).toBeVisible();
  api.setPayment(missingOrderAmount());
  await page.clock.runFor(2200);
  await expectInvalidResponse(page);
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  expect(api.requests.read).toBeGreaterThan(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("AQH-100306-PMT");
});

test("missing order amount on restoration never invents zero or enables Continue", async ({
  page,
}) => {
  const api = await precisionApi(page, missingOrderAmount());
  await page.addInitScript(
    (key) => localStorage.setItem(key, "AQH-100306-PMT"),
    storageKey,
  );
  await page.goto("/");
  await expectInvalidResponse(page);
  await expect(page.getByTestId("fiat-total")).toHaveCount(0);
  expect(api.requests.create).toBe(0);
  expect(api.requests.read).toBe(1);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
  ).toBe("AQH-100306-PMT");
});

test("missing order amount on requote keeps verified metadata and blocks transfer", async ({
  page,
}) => {
  const api = await precisionApi(page);
  await page.goto("/");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
  api.setPayment(paymentSnapshot("expired"));
  await page.clock.runFor(2200);
  const requote = page.getByRole("button", { name: "Get a new quote" });
  await expect(requote).toBeEnabled();
  api.setRequotePayment({
    ...missingOrderAmount(),
    quote: {
      ...paymentSnapshot().quote,
      expires_at: "2026-08-14T09:07:10.842Z",
    },
  });
  await requote.click();
  await expectInvalidResponse(page, uncertainMutation);
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  expect(api.requests.requote).toBe(1);
  expect(api.requests.read).toBe(2);
});

const fiatCases = [
  {
    name: "amount beyond Number.MAX_SAFE_INTEGER",
    amount: "9007199254740993.123456",
    expected: "9,007,199,254,740,993.123456 EUR",
  },
  {
    name: "512-digit API amount",
    amount: "1".repeat(512),
    expected: `11${",111".repeat(170)} EUR`,
  },
];

for (const width of [320, 390]) {
  for (const example of fiatCases) {
    test(`${example.name} remains complete and inside a ${width}px viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await precisionApi(page, {
        ...paymentSnapshot(),
        order: { currency: "EUR", amount: example.amount },
      });
      await page.goto("/");
      const amount = page.getByTestId("fiat-total");
      await expect(amount).toHaveText(example.expected);
      const geometry = await amount.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          left: bounds.left,
          right: bounds.right,
          textOverflow: style.textOverflow,
          overflowX: style.overflowX,
          lineClamp: style.webkitLineClamp,
          fragments: [...range.getClientRects()].map((rect) => ({
            left: rect.left,
            right: rect.right,
          })),
        };
      });
      expect(geometry.documentWidth).toBeLessThanOrEqual(width + 1);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(
        geometry.clientWidth + 1,
      );
      expect(geometry.left).toBeGreaterThanOrEqual(0);
      expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
      expect(geometry.textOverflow).not.toBe("ellipsis");
      expect(geometry.overflowX).not.toBe("hidden");
      expect(geometry.lineClamp).toBe("none");
      expect(geometry.fragments.length).toBeGreaterThan(0);
      for (const fragment of geometry.fragments) {
        expect(fragment.left).toBeGreaterThanOrEqual(geometry.left - 1);
        expect(fragment.right).toBeLessThanOrEqual(geometry.right + 1);
      }
      await expect(page.getByTestId("continue")).toBeEnabled();
    });
  }
}

test("large crypto amounts retain all 24 fractional digits in display and clipboard without changing the QR", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await precisionApi(
    page,
    {
      ...paymentSnapshot(),
      quote: {
        ...paymentSnapshot().quote,
        crypto_currency: "TOK",
        network: "custom-chain",
        network_name: "Precision chain",
        exchange_rate: "1.00",
        crypto_amount: "9007199254740993.123456789012345678901234",
        network_fee: "0",
        total_due: "9007199254740993.123456789012345678901234",
      },
    },
    {
      currencies: [
        {
          code: "TOK",
          name: "Precision token",
          decimals: 24,
          networks: [
            {
              id: "custom-chain",
              name: "Precision chain",
              network_fee: "0",
              required_confirmations: 1,
              avg_confirmation_seconds: 60,
            },
          ],
        },
      ],
    },
  );
  await page.goto("/");
  await page.getByTestId("continue").click();
  await expect(
    page.getByTestId("transfer-amount").locator("strong"),
  ).toHaveText("9007199254740993.123456789012345678901234");
  await page.getByTestId("copy-amount").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "9007199254740993.123456789012345678901234",
  );
  await page.getByTestId("copy-address").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    sourceAddress,
  );
  const qr = PNG.sync.read(await page.getByTestId("transfer-qr").screenshot());
  expect(jsQR(new Uint8ClampedArray(qr.data), qr.width, qr.height)?.data).toBe(
    sourceAddress,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
