import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ request, page }) => {
  expect(
    (
      await request.post("/api/demo/reset", {
        data: { now: "2026-08-14T08:37:10.842Z", freeze: true },
      })
    ).ok(),
  ).toBe(true);
  await page.clock.install({ time: new Date("2026-08-14T08:37:10.842Z") });
});

async function holdCatalogueResponse(page: Page, requestNumber: number, payment = false) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let capture!: (body: unknown) => void;
  const captured = new Promise<unknown>((resolve) => {
    capture = resolve;
  });
  const requests = { count: 0, active: 0, maxActive: 0 };
  await page.route(payment ? "**/api/payments/*" : "**/api/currencies", async (route) => {
    const index = ++requests.count;
    requests.active++;
    requests.maxActive = Math.max(requests.maxActive, requests.active);
    let completed = false;
    try {
      const response = await route.fetch();
      if (index === requestNumber) {
        capture(await response.json());
        await gate;
      }
      requests.active--;
      completed = true;
      await route.fulfill({ response });
    } finally {
      if (!completed) requests.active--;
    }
  });
  return { captured, release, requests };
}

async function applyAmount(page: Page, amount: string) {
  await page.getByLabel("Order amount (EUR)", { exact: true }).fill(amount);
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/demo/scenario" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Apply amount", exact: true }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
}

test("applying an amount during initial catalogue loading refreshes after the stale response", async ({
  page,
}) => {
  const held = await holdCatalogueResponse(page, 1);
  try {
    await page.goto("/?demo=1");
    expect(Object.keys((await held.captured) as object)).toEqual(["currencies"]);
    await page
      .getByText("Demo controls", { exact: true })
      .click();
    await applyAmount(page, "250");
    await expect(
      page.getByTestId("demo-controls").getByRole("status"),
    ).toContainText("Demo updated");
    held.release();

    await expect(page.getByTestId("fiat-total")).toHaveText("250.00 EUR");
    await expect(
      page.getByRole("button", { name: /Continue with/ }),
    ).toBeEnabled();
    await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
    expect(held.requests.maxActive).toBe(1);
    await page.getByTestId("continue").click();
    await expect(page.getByTestId("fiat-total")).toHaveText("250.00 EUR");
  } finally {
    held.release();
  }
});

test("successive amount applies share one pending live-payment read and retain that quote until replacement", async ({
  page,
}) => {
  await page.clock.pauseAt(new Date("2026-08-14T08:37:10.842Z"));
  const held = await holdCatalogueResponse(page, 1, true);
  try {
    await page.goto("/?demo=1");
    await expect(
      page.getByRole("button", { name: /Continue with/ }),
    ).toBeEnabled();
    await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
    await page.getByTestId("continue").click();
    await expect(page.getByTestId("transfer-amount")).toHaveText(/163\.69\s*USDT/);
    await page
      .getByText("Demo controls", { exact: true })
      .click();
    await applyAmount(page, "250");
    await page.clock.runFor(2000);
    expect(await held.captured).toMatchObject({ status: "awaiting_payment", order: { amount: "149.90" } });
    await applyAmount(page, "80");
    held.release();

    await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
    await expect(page.getByTestId("transfer-amount")).toHaveText(/163\.69\s*USDT/);
    expect(held.requests.count).toBe(1);
    expect(held.requests.maxActive).toBe(1);
    await page.getByRole("button", { name: "Change", exact: true }).click();
    await page.getByRole("radio", { name: "Ethereum (ERC-20)", exact: true }).check();
    await page.getByTestId("continue").click();
    await expect(page.getByTestId("fiat-total")).toHaveText("80.00 EUR");
  } finally {
    held.release();
  }
});
