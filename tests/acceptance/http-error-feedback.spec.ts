import { expect, test, type Page } from "@playwright/test";
import { fixedNow, paymentSnapshot } from "../fixtures/oracles";
import {
  noHorizontalOverflow,
  noTransferAction,
  startQuote,
  stubApi,
} from "./fixtures";

async function failedStatus(page: Page) {
  const api = await stubApi(page);
  await page.clock.pauseAt(new Date(fixedNow));
  await startQuote(page);
  api.setFault("500");
  await page.clock.runFor(2000);
  await expect(page.getByRole("alert")).toContainText(
    "Can't reach the payment server.",
  );
  await expect(page.getByTestId("retry-countdown")).toHaveText(
    "Retrying in 2 s.",
  );
  return api;
}

test("HTTP 500 retains the quote, copies only the order ID, and removes support after recovery", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const api = await failedStatus(page);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  await expect(
    page.getByText("Connection lost — reconnecting", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".connection-support")).toContainText(
    "Last checked 08:37:10. Current server status is unknown. If you already sent funds, do not send again.",
  );
  await expect(page.locator(".connection-support")).toContainText(
    "If this keeps up, contact Payment Project and quote your order ID.",
  );
  await expect(page.getByText(/Last checked/)).toHaveCount(1);
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
  await expect(page.getByTestId("transfer-address")).toHaveText(
    "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
  );
  expect(api.current().payment_reference).toBe("AQH-100306-PMT");
  expect(api.current().quote.expires_at).toBe("2026-08-14T08:52:10.842Z");
  const requests = { ...api.requests };
  const copy = page.getByTestId("copy-order-id");
  await copy.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "ORD-88213",
  );
  await expect(copy).toHaveText("Copied");
  await expect(copy.locator("svg.copy-check")).toHaveCount(1);
  expect(api.requests).toEqual(requests);
  await page.clock.runFor(2999);
  await expect(copy).toHaveText("Copied");
  await page.clock.runFor(1);
  await expect(copy).toHaveText("Copy order ID");
  expect(api.requests.create).toBe(2);
  expect(api.requests.requote).toBe(0);
  api.setFault("ok");
  api.setState("paid");
  await page.getByTestId("retry").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("retry-countdown")).toHaveCount(0);
  await expect(page.getByTestId("copy-order-id")).toHaveCount(0);
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy reference", exact: true }),
  ).toBeVisible();
  const settled = api.requests.get;
  await page.clock.runFor(30000);
  expect(api.requests.get).toBe(settled);
});

test("failed clipboard access offers the canonical order ID for manual copying", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("Denied");
        },
      },
    });
  });
  const api = await failedStatus(page);
  const before = { ...api.requests };
  await page.getByTestId("copy-order-id").focus();
  await page.keyboard.press("Space");
  const fallback = page
    .locator(".connection-support")
    .getByLabel("Copy manually");
  await expect(fallback).toHaveValue("ORD-88213");
  await expect(fallback).toHaveAttribute("readonly", "");
  await expect(page.getByTestId("copy-order-id")).toHaveText("Copy order ID");
  expect(api.requests).toEqual(before);
});

test("retry countdown follows 2/4/8 seconds and stays outside live announcements", async ({
  page,
}) => {
  const api = await failedStatus(page);
  const countdown = page.getByTestId("retry-countdown");
  await expect(
    countdown.locator(
      'xpath=ancestor-or-self::*[@role="alert" or @role="status" or @aria-live="polite" or @aria-live="assertive"]',
    ),
  ).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(countdown).toHaveText("Retrying in 1 s.");
  expect(api.requests.get).toBe(1);
  await page.clock.runFor(1000);
  await expect(countdown).toHaveText("Retrying in 4 s.");
  expect(api.requests.get).toBe(2);
  await page.clock.runFor(4000);
  await expect(countdown).toHaveText("Retrying in 8 s.");
  expect(api.requests.get).toBe(3);
});

test("manual retry coalesces with focus and the previous timer while displaying Checking", async ({
  page,
}) => {
  await failedStatus(page);
  let release!: () => void;
  let calls = 0;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/api/payments/AQH-100306-PMT", async (route) => {
    calls++;
    await gate;
    await route.fulfill({
      json: paymentSnapshot(),
      headers: { "x-server-time": "2026-08-14T08:37:12.842Z" },
    });
  });
  await page.getByTestId("retry").click();
  await expect(page.getByTestId("request-checking")).toHaveText("Checking…");
  await expect(page.getByTestId("retry")).toBeDisabled();
  await expect(page.getByTestId("retry-countdown")).toHaveCount(0);
  await expect(
    page.getByText("Connection lost", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(5000);
  expect(calls).toBe(1);
  release();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("request-checking")).toHaveCount(0);
  await expect(page.getByTestId("copy-order-id")).toHaveCount(0);
});

for (const phase of ["initial creation", "restore"] as const) {
  test(`${phase} HTTP 500 does not invent payment facts or an automatic retry`, async ({
    page,
  }) => {
    const api = await stubApi(page);
    await page.clock.pauseAt(new Date(fixedNow));
    if (phase === "restore") {
      await page.addInitScript(() =>
        localStorage.setItem(
          "stablecoin-checkout:payment-reference:ORD-88213",
          "saved-reference",
        ),
      );
      api.setFault("500");
    } else {
      await page.route("**/api/payments", (route) =>
        route.fulfill({
          status: 500,
          json: { title: "Temporary server error" },
        }),
      );
    }
    await page.goto("/");
    await expect(page.getByRole("alert")).toBeVisible();
    if (phase === "restore") await expect(page.getByTestId("retry")).toBeEnabled();
    else await expect(page.getByTestId("retry")).toHaveCount(0);
    await expect(page.getByTestId("copy-order-id")).toHaveCount(0);
    await expect(page.getByTestId("retry-countdown")).toHaveCount(0);
    await expect(
      page.getByText(
        /Last checked|Connection lost|Showing the last verified payment details/,
      ),
    ).toHaveCount(0);
    await noTransferAction(page);
    await page.clock.runFor(30000);
    expect(api.requests.create).toBe(0);
    if (phase === "restore") expect(api.requests.get).toBe(1);
  });
}

test("an uncertain real creation keeps the existing warning and cannot retry or copy an invented order payment", async ({
  page,
}) => {
  const api = await stubApi(page);
  await page.clock.pauseAt(new Date(fixedNow));
  let posts = 0;
  await page.route("**/api/payments", (route) => {
    posts++;
    return route.fulfill({ status: 500, json: { title: "Unavailable" } });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "The quote request outcome is uncertain.",
  );
  await expect(page.getByTestId("retry")).toHaveCount(0);
  await expect(page.getByTestId("copy-order-id")).toHaveCount(0);
  await expect(page.getByTestId("retry-countdown")).toHaveCount(0);
  await noTransferAction(page);
  await page.clock.runFor(120000);
  expect(posts).toBe(1);
  expect(api.requests.get).toBe(0);
});

test("local expiry during HTTP 500 still removes transfer controls without changing the known payment state", async ({
  page,
}) => {
  const api = await stubApi(page);
  api.setPayment({
    ...paymentSnapshot(),
    quote: {
      ...paymentSnapshot().quote,
      expires_at: "2026-08-14T08:37:11.842Z",
    },
  });
  await page.clock.pauseAt(new Date(fixedNow));
  await startQuote(page);
  api.setFault("500");
  await page.clock.runFor(1200);
  await expect(page.getByTestId("copy-order-id")).toBeVisible();
  await noTransferAction(page);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  await expect(
    page.getByRole("button", { name: "Get a new quote" }),
  ).toHaveCount(0);
});

for (const width of [320, 390, 1280]) {
  test(`HTTP 500 support and keyboard copy fit ${width}px without overflow`, async ({
    page,
    context,
  }, info) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await failedStatus(page);
    await noHorizontalOverflow(page);
    const button = page.getByTestId("copy-order-id");
    await button.focus();
    await page.keyboard.press("Space");
    await expect(button).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "ORD-88213",
    );
    expect(
      await button.evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    const bounds = await button.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.clock.runFor(3000);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`http-error-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("real mock Demo HTTP 500 adds support and clears it after recovery", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/reset", { data: { freeze: true } });
  await page.goto("/?demo=1");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
  await page.getByTestId("demo-controls").locator("summary").click();
  await page.getByTestId("demo-fault").selectOption("500");
  await page.getByTestId("demo-apply-fault").click();
  await expect(page.getByRole("alert")).toContainText(
    "Can't reach the payment server.",
  );
  await expect(page.getByTestId("copy-order-id")).toBeVisible();
  await expect(page.locator(".connection-contact")).toHaveText(
    "If this keeps up, contact Nordwind Audio and quote your order ID.",
  );
  await page.getByTestId("demo-fault").selectOption("none");
  await page.getByTestId("demo-apply-fault").click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("copy-order-id")).toHaveCount(0);
  await expect(page.getByTestId("transfer-amount")).toContainText("163.69");
});
