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

async function applyAmount(page: Page, amount: string) {
  await page.getByLabel("Order amount (EUR)", { exact: true }).fill(amount);
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/demo/scenario" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Apply amount", exact: true }).click();
  return response;
}

test("demo amount applies to the next selected pair and reset creates the default amount", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await page
    .getByText("Demo controls · no real funds", { exact: true })
    .click();
  await expect(
    page.getByLabel("Order amount (EUR)", { exact: true }),
  ).toHaveAttribute("data-testid", "demo-order-amount");
  await expect(
    page.getByRole("button", { name: "Apply amount", exact: true }),
  ).toHaveAttribute("data-testid", "demo-apply-amount");
  await expect(
    page.getByText(
      "Applies to the next quote. Use Change or Reset demo to re-quote.",
      { exact: true },
    ),
  ).toBeVisible();

  expect((await applyAmount(page, "250")).status()).toBe(200);
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
  await page.getByRole("radio", { name: "Ethereum (ERC-20)", exact: true }).check();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toHaveText(/275\.830887\s*USDT/);
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 EUR");

  await page.getByTestId("demo-state").selectOption("underpaid");
  await page.getByTestId("demo-apply-state").click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "underpaid",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByTestId("demo-reset").click();
  await expect(
    page.getByRole("button", { name: /Continue with/ }),
  ).toBeVisible();
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
});

test("an active quote keeps its amount until Change selection is submitted with Continue", async ({
  page,
  request,
}) => {
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: /Continue with/ }).click();
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /163\.69\s*USDT/,
  );
  await page
    .getByText("Demo controls · no real funds", { exact: true })
    .click();
  expect((await applyAmount(page, "80")).status()).toBe(200);
  await expect(
    page.getByTestId("demo-controls").getByRole("status"),
  ).toContainText("Demo updated");
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /163\.69\s*USDT/,
  );

  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page
    .getByRole("radio", { name: "Ethereum (ERC-20)", exact: true })
    .check();
  await expect(
    page.getByRole("button", {
      name: "Continue with USDT on Ethereum (ERC-20)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  const beforeContinue = await (await request.get("/api/demo")).json();
  expect(beforeContinue.metrics.posts).toBe(2);
  expect(beforeContinue.payment.order.amount).toBe("149.90");
  expect(beforeContinue.payment.quote.network).toBe("tron");

  await page
    .getByRole("button", {
      name: "Continue with USDT on Ethereum (ERC-20)",
      exact: true,
    })
    .click();
  await expect(page.getByTestId("fiat-total")).toHaveText("80.00 EUR");
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /91\.325884\s*USDT/,
  );
  await expect(page.getByTestId("selected-network")).toContainText(
    "USDT on Ethereum (ERC-20)",
  );
  const afterContinue = await (await request.get("/api/demo")).json();
  expect(afterContinue.metrics.posts).toBe(3);
  expect(afterContinue.payment.order.amount).toBe("80.00");
});

test("configured EUR amount retains German locale formatting on initial creation and Continue", async ({ page, request }) => {
  expect((await request.post("/api/demo/scenario", { data: { orderAmount: "250" } })).status()).toBe(200);
  await page.goto("/?demo=1&locale=de-DE");
  await expect(page.getByTestId("fiat-total")).toHaveText("250,00 EUR");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("fiat-total")).toHaveText("250,00 EUR");
  await expect(page.getByTestId("transfer-amount")).toHaveText(/272\.330887\s*USDT/);
});

for (const amount of ["100.123", "0"]) {
  test(`invalid demo amount ${amount} exposes the server title and preserves the initial total`, async ({
    page,
  }) => {
    await page.goto("/?demo=1");
    await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
    await page
      .getByText("Demo controls · no real funds", { exact: true })
      .click();
    const response = await applyAmount(page, amount);
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject({
      title: "Invalid order amount",
    });
    await expect(
      page.getByTestId("demo-controls").getByRole("status"),
    ).toContainText("Invalid order amount");
    await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
    await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
  });
}
