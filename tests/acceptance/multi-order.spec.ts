import { test, expect, type Page } from "@playwright/test";

// Use the real HTTP mock: the shared stub fixture deliberately models one payment.
test.beforeEach(async ({ request }) => {
  expect(
    (
      await request.post("/api/demo/reset", {
        data: { now: "2026-08-14T08:37:10.842Z", freeze: true },
      })
    ).status(),
  ).toBe(200);
});

async function start(page: Page, order: string) {
  await page.goto(`/?order=${order}&demo=1`);
  await expect(page.locator("header")).toContainText(`Order ${order}`);
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /163\.69\s*USDT/,
  );
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
}
async function applyState(page: Page, state: string) {
  await page
    .getByText("Demo controls · no real funds", { exact: true })
    .click();
  await page.getByTestId("demo-state").selectOption(state);
  await page.getByTestId("demo-apply-state").click();
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    state,
  );
}
async function stored(page: Page, order: string) {
  return page.evaluate(
    (id) => localStorage.getItem(`stablecoin-checkout:payment-reference:${id}`),
    order,
  );
}

test("two orders keep independent states and references through reload, close and reopen", async ({
  page,
  context,
  request,
}) => {
  const second = await context.newPage();
  await start(page, "ORD-88213");
  await start(second, "ORD-88214");
  await expect(page.locator(".checkout-footer")).toContainText(
    "Reference AQH-100306-PMT",
  );
  await expect(second.locator(".checkout-footer")).toContainText(
    "Reference AQH-100307-PMT",
  );
  expect(await stored(page, "ORD-88213")).toBe("AQH-100306-PMT");
  expect(await stored(second, "ORD-88214")).toBe("AQH-100307-PMT");

  await applyState(page, "underpaid");
  await expect(page.getByTestId("transfer-amount")).toHaveText(/43\.69\s*USDT/);
  await expect(second.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  await expect(second.getByTestId("countdown")).toBeVisible();
  expect(
    await (await request.get("/api/demo?order_id=ORD-88214")).json(),
  ).toMatchObject({
    payment: {
      order_id: "ORD-88214",
      status: "awaiting_payment",
      payment_reference: "AQH-100307-PMT",
    },
  });

  await page.reload();
  await second.reload();
  await expect(page.getByTestId("transfer-amount")).toHaveText(/43\.69\s*USDT/);
  await expect(page.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "underpaid",
  );
  await expect(second.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  await expect(second.getByTestId("countdown")).toBeVisible();
  await expect(second.locator(".checkout-footer")).toContainText(
    "Reference AQH-100307-PMT",
  );

  await page.close();
  await second.close();
  const reopenedFirst = await context.newPage();
  const reopenedSecond = await context.newPage();
  await reopenedFirst.goto("/?order=ORD-88213&demo=1");
  await reopenedSecond.goto("/?order=ORD-88214&demo=1");
  await expect(reopenedFirst.locator("header")).toContainText(
    "Order ORD-88213",
  );
  await expect(reopenedFirst.getByTestId("transfer-amount")).toHaveText(
    /43\.69\s*USDT/,
  );
  await expect(reopenedSecond.locator("header")).toContainText(
    "Order ORD-88214",
  );
  await expect(reopenedSecond.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  await expect(reopenedSecond.locator(".checkout-footer")).toContainText(
    "Reference AQH-100307-PMT",
  );
  await expect(reopenedSecond.getByTestId("continue")).toHaveCount(0);
});

test("another tab for the same order restores the same payment without creating one", async ({
  page,
  context,
}) => {
  await start(page, "ORD-88214");
  const second = await context.newPage();
  const creates: string[] = [];
  second.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/payments"
    )
      creates.push(request.url());
  });
  await second.goto("/?order=ORD-88214");
  await expect(second.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  await expect(second.locator(".checkout-footer")).toContainText(
    "Reference AQH-100306-PMT",
  );
  expect(creates).toEqual([]);
});

for (const order of ["bad", "", "ORD-1", "XYZ-88213"]) {
  test(`invalid order ${JSON.stringify(order)} renders no controls and sends no API requests`, async ({
    page,
  }) => {
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/"))
        apiRequests.push(request.url());
    });
    await page.clock.install();
    await page.goto(`/?order=${order}&demo=1`);
    await expect(page.locator("header")).toBeVisible();
    await expect(
      page.getByText("This checkout link is not valid.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("checkout")).toHaveCount(0);
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByTestId("demo-controls")).toHaveCount(0);
    await page.clock.runFor(5000);
    expect(apiRequests).toEqual([]);
  });
}

test("catalogue bootstrap and demo amount controls target the page's order", async ({
  page,
  context,
}) => {
  await page.goto("/?order=ORD-88214&demo=1");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.locator(".checkout-footer")).toContainText(
    "Order ORD-88214",
  );
  await page
    .getByText("Demo controls · no real funds", { exact: true })
    .click();
  await page.getByTestId("demo-order-amount").fill("250");
  const updated = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/currencies" &&
      url.searchParams.get("order_id") === "ORD-88214"
    );
  });
  await page.getByTestId("demo-apply-amount").click();
  expect((await updated).status()).toBe(200);
  await expect(page.getByTestId("fiat-total")).toHaveText("€250.00");
  const first = await context.newPage();
  await first.goto("/?order=ORD-88213");
  await expect(first.getByTestId("continue")).toBeEnabled();
  await expect(first.getByTestId("fiat-total")).toHaveText("€149.90");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /272\.330887\s*USDT/,
  );
});

test("Reset demo clears all server orders and each tab clears only its own saved reference", async ({
  page,
  context,
  request,
}) => {
  const second = await context.newPage();
  await start(page, "ORD-88213");
  await start(second, "ORD-88214");
  await applyState(page, "underpaid");
  await applyState(second, "paid");
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("continue")).toBeVisible();
  expect(await stored(page, "ORD-88213")).toBeNull();
  expect(await stored(page, "ORD-88214")).toBe("AQH-100307-PMT");
  expect(
    await (await request.get("/api/demo?order_id=ORD-88214")).json(),
  ).toMatchObject({ payment: null, orders: [] });
  await second.reload();
  await expect(second.getByTestId("continue")).toBeVisible();
  expect(await stored(second, "ORD-88214")).toBeNull();
  await expect(second.getByTestId("transfer-address")).toHaveCount(0);
});

test("a missing reference clears only that order's storage key", async ({
  page,
  context,
}) => {
  await start(page, "ORD-88213");
  await page.evaluate(() =>
    localStorage.setItem(
      "stablecoin-checkout:payment-reference:ORD-88214",
      "AQH-999999-PMT",
    ),
  );
  const second = await context.newPage();
  await second.goto("/?order=ORD-88214");
  await expect(second.getByTestId("continue")).toBeVisible();
  expect(await stored(second, "ORD-88214")).toBeNull();
  expect(await stored(second, "ORD-88213")).toBe("AQH-100306-PMT");
});

test("a restored reference belonging to another order blocks transfer controls", async ({
  page,
  context,
}) => {
  await start(page, "ORD-88213");
  await page.evaluate(() =>
    localStorage.setItem(
      "stablecoin-checkout:payment-reference:ORD-88214",
      "AQH-100306-PMT",
    ),
  );
  const second = await context.newPage();
  await second.goto("/?order=ORD-88214");
  await expect(second.getByRole("alert")).toContainText(
    "The payment server returned invalid data. Transfer controls are paused.",
  );
  await expect(second.getByTestId("transfer-address")).toHaveCount(0);
  await expect(second.getByTestId("transfer-qr")).toHaveCount(0);
  await expect(second.getByTestId("continue")).toHaveCount(0);
  await expect(second.locator("header")).toContainText("Order ORD-88214");
  expect(await stored(second, "ORD-88214")).toBe("AQH-100306-PMT");
});
