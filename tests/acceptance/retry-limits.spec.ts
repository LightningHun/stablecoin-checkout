import { expect, test, type Page } from "@playwright/test";
import { fixedNow, paymentSnapshot } from "../fixtures/oracles";
import {
  noHorizontalOverflow,
  noTransferAction,
  startQuote,
  stubApi,
} from "./fixtures";

async function outage(
  page: Page,
  state: "awaiting_payment" | "underpaid" = "awaiting_payment",
) {
  const api = await stubApi(page, state);
  await page.clock.pauseAt(new Date(fixedNow));
  await startQuote(page);
  api.setFault("500");
  await page.clock.runFor(2000);
  await expect(page.getByTestId("retry-countdown")).toHaveText(
    "Retrying in 2 s.",
  );
  expect(api.requests.get).toBe(1);
  return api;
}
async function exhaustAutomatic(
  page: Page,
  api: Awaited<ReturnType<typeof stubApi>>,
) {
  for (const [wait, count, next] of [
    [2000, 2, 4],
    [4000, 3, 8],
    [8000, 4, 16],
    [16000, 5, 30],
    [30000, 6, null],
  ] as const) {
    await page.clock.runFor(wait);
    await expect.poll(() => api.requests.get).toBe(count);
    if (next !== null)
      await expect(page.getByTestId("retry-countdown")).toHaveText(
        `Retrying in ${next} s.`,
      );
    else
      await expect(page.getByTestId("automatic-retries-paused")).toHaveText(
        "Automatic retries paused.",
      );
  }
}

test("five automatic retries stop; focus and local expiry cannot bypass the limit", async ({
  page,
}) => {
  const api = await outage(page);
  await exhaustAutomatic(page, api);
  await expect(page.getByTestId("retry-countdown")).toHaveCount(0);
  await expect(
    page.getByText("Connection lost", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("retry")).toBeEnabled();
  await expect(page.getByTestId("copy-order-id")).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(900000);
  expect(api.requests.get).toBe(6);
  await noTransferAction(page);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  expect(api.requests.create).toBe(2);
  expect(api.requests.requote).toBe(0);
});

test("manual retries have a ten-second cooldown and stop after three without restarting automatic retries", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const api = await outage(page);
  await exhaustAutomatic(page, api);
  const retry = page.getByTestId("retry");
  await retry.click();
  await expect(page.getByTestId("manual-retry-cooldown")).toHaveText(
    "You can retry again in 10 s.",
  );
  expect(api.requests.get).toBe(7);
  await expect(retry).toBeDisabled();
  await expect(
    page
      .getByTestId("manual-retry-cooldown")
      .locator(
        'xpath=ancestor-or-self::*[@role="alert" or @role="status" or @aria-live="polite" or @aria-live="assertive"]',
      ),
  ).toHaveCount(0);
  await page.clock.runFor(9999);
  await expect(retry).toBeDisabled();
  expect(api.requests.get).toBe(7);
  await page.clock.runFor(1);
  await expect(retry).toBeEnabled();
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("manual-retry-cooldown")).toHaveText(
    "You can retry again in 10 s.",
  );
  expect(api.requests.get).toBe(8);
  await page.clock.runFor(10000);
  await retry.click();
  await expect(page.getByTestId("manual-retry-limit")).toHaveText(
    "Manual retry limit reached.",
  );
  await expect(retry).toBeDisabled();
  await expect(page.getByTestId("manual-retry-cooldown")).toHaveCount(0);
  expect(api.requests.get).toBe(9);
  await page.getByTestId("copy-order-id").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "ORD-88213",
  );
  await page.clock.runFor(60000);
  expect(api.requests.get).toBe(9);
  await expect(page.getByTestId("retry-countdown")).toHaveCount(0);
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({
    "stablecoin-checkout:payment-reference:ORD-88213": "AQH-100306-PMT",
  });
});

test("manual failure keeps the next automatic attempt and successful validation starts a fresh outage budget", async ({
  page,
}) => {
  const api = await outage(page);
  const retry = page.getByTestId("retry");
  await retry.click();
  await expect(page.getByTestId("manual-retry-cooldown")).toBeVisible();
  await expect(page.getByTestId("retry-countdown")).toHaveText(
    "Retrying in 2 s.",
  );
  expect(api.requests.get).toBe(2);
  await page.clock.runFor(2000);
  await expect(page.getByTestId("retry-countdown")).toHaveText(
    "Retrying in 4 s.",
  );
  expect(api.requests.get).toBe(3);
  api.setFault("ok");
  await page.clock.runFor(4000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByTestId("manual-retry-cooldown")).toHaveCount(0);
  await expect(page.getByTestId("copy-order-id")).toHaveCount(0);
  api.setFault("500");
  await page.clock.runFor(2000);
  await expect(page.getByTestId("retry-countdown")).toHaveText(
    "Retrying in 2 s.",
  );
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.getByTestId("manual-retry-cooldown")).toHaveText(
    "You can retry again in 10 s.",
  );
  expect(api.requests.get).toBe(6);
});

test("queued double clicks do not start another GET after an in-flight retry recovers", async ({
  page,
}) => {
  await outage(page);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/payments/AQH-100306-PMT", async (route) => {
    calls++;
    await gate;
    await route.fulfill({
      json: paymentSnapshot(),
      headers: { "x-server-time": "2026-08-14T08:37:12.842Z" },
    });
  });
  await page.getByTestId("retry").evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(page.getByTestId("request-checking")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(2000);
  expect(calls).toBe(1);
  release();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(calls).toBe(1);
  await page.clock.runFor(1999);
  expect(calls).toBe(1);
  await page.clock.runFor(1);
  await expect.poll(() => calls).toBe(2);
});

for (const width of [320, 390, 1280]) {
  test(`retry limits preserve support and responsive layout at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const api = await outage(page);
    await exhaustAutomatic(page, api);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.getByTestId("retry").click();
      if (attempt < 3) {
        await expect(page.getByTestId("manual-retry-cooldown")).toHaveText(
          "You can retry again in 10 s.",
        );
        await noHorizontalOverflow(page);
        await page.clock.runFor(10000);
      }
    }
    await expect(page.getByTestId("manual-retry-limit")).toBeVisible();
    await expect(page.getByTestId("copy-order-id")).toBeVisible();
    await expect(page.locator(".connection-contact")).toHaveText(
      "If this keeps up, contact Payment Project and quote your order ID.",
    );
    await noHorizontalOverflow(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`retry-limits-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}
