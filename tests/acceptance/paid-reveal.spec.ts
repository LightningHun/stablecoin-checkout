import { expect, test, type Page } from "@playwright/test";
import { noTransferAction, startQuote, stubApi } from "./fixtures";

const section = (page: Page) => page.locator(".confirmation-step");
const ghost = (page: Page) => page.locator(".paid-confirmation-ghost");
async function expectSettled(page: Page) {
  const values = await page
    .locator(
      '.payment-progress .confirmation-icon.large, .payment-progress strong[role="status"], .payment-progress .receipt, .payment-progress .copy-control > button',
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return { opacity: style.opacity, transform: style.transform };
      }),
    );
  expect(values).toEqual(
    Array.from({ length: 4 }, () => ({ opacity: "1", transform: "none" })),
  );
}

test("paid reveal completes in real time while the polling clock is frozen", async ({
  page,
}) => {
  const api = await stubApi(page);
  await startQuote(page);
  api.setState("confirming");
  await page.clock.runFor(2200);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "confirming",
  );
  api.setState("paid");
  await page.clock.runFor(2200);
  const paidAt = Date.now();
  await expect(section(page)).toHaveClass(/paid-reveal/);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "paid",
  );
  await expect(ghost(page)).toHaveCount(1);
  await expect(ghost(page)).toHaveAttribute("aria-hidden", "true");
  await expect(
    page.locator('.payment-progress strong[role="status"]'),
  ).toHaveText("Paid");
  await expect(page.locator(".payment-progress .receipt")).toBeAttached();
  await noTransferAction(page);
  await expect(ghost(page)).toHaveCount(0, { timeout: 2000 });
  // Test-runner real time, deliberately independent of page.clock's fake timers.
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, 2000 - (Date.now() - paidAt))),
  );
  await expectSettled(page);
  const ring = await page
    .locator(".payment-progress .confirmation-icon.large")
    .evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return { opacity: style.opacity, transform: style.transform };
    });
  expect(ring).toEqual({ opacity: "0", transform: "none" });
  await page.clock.runFor(10000);
  await expect(ghost(page)).toHaveCount(0);
  await expectSettled(page);
});

test("an already paid create response has no reveal", async ({ page }) => {
  await stubApi(page, "paid");
  await page.goto("/");
  await page.getByRole("button", { name: /Continue with/ }).click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "paid",
  );
  await expect(section(page)).not.toHaveClass(/paid-reveal/);
  await expect(ghost(page)).toHaveCount(0);
  await expectSettled(page);
});

test("reduced motion renders paid immediately with no reveal or ghost", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const api = await stubApi(page);
  await startQuote(page);
  api.setState("confirming");
  await page.clock.runFor(2200);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "confirming",
  );
  api.setState("paid");
  await page.clock.runFor(2200);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "paid",
  );
  await expect(section(page)).not.toHaveClass(/paid-reveal/);
  await expect(ghost(page)).toHaveCount(0);
  await expectSettled(page);
});

for (const status of ["awaiting_payment", "underpaid"] as const) {
  test(`${status} to paid reveals without a bar or ghost`, async ({ page }) => {
    const api = await stubApi(page);
    await startQuote(page);
    if (status === "underpaid") {
      api.setState(status);
      await page.clock.runFor(2200);
      await expect(page.getByTestId("payment-status")).toHaveAttribute(
        "data-status",
        status,
      );
    }
    api.setState("paid");
    await page.clock.runFor(status === "underpaid" ? 5200 : 2200);
    await expect(page.getByTestId("payment-status")).toHaveAttribute(
      "data-status",
      "paid",
    );
    await expect(section(page)).toHaveClass(/paid-reveal/);
    await expect(ghost(page)).toHaveCount(0);
  });
}

for (const status of ["overpaid", "failed"] as const) {
  test(`${status} never starts the paid reveal`, async ({ page }) => {
    const api = await stubApi(page);
    await startQuote(page);
    api.setState(status);
    await page.clock.runFor(2200);
    await expect(page.getByTestId("payment-status")).toHaveAttribute(
      "data-status",
      status,
    );
    await expect(section(page)).not.toHaveClass(/paid-reveal/);
    await expect(ghost(page)).toHaveCount(0);
  });
}
