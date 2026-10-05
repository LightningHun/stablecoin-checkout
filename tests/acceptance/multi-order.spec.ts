import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

async function registerSecondOrder(request: APIRequestContext) {
  const response = await request.post("/api/demo/orders", { data: {} });
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({ order_id: "ORD-88214" });
}

// Use the real HTTP mock: the shared stub fixture deliberately models one payment.
test.beforeEach(async ({ request }) => {
  expect(
    (
      await request.post("/api/demo/reset", {
        data: { now: "2026-08-14T08:37:10.842Z", freeze: true },
      })
    ).status(),
  ).toBe(200);
  await registerSecondOrder(request);
});

async function start(page: Page, order: string) {
  await page.goto(`/?order=${order}&demo=1`);
  await expect(page.locator(".order-summary .order-reference")).toContainText(`Order ${order}`);
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
    .getByText("Demo controls", { exact: true })
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
    "Reference AQH-100307-PMT",
  );
  await expect(second.locator(".checkout-footer")).toContainText(
    "Reference AQH-100309-PMT",
  );
  expect(await stored(page, "ORD-88213")).toBe("AQH-100307-PMT");
  expect(await stored(second, "ORD-88214")).toBe("AQH-100309-PMT");

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
      payment_reference: "AQH-100309-PMT",
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
    "Reference AQH-100309-PMT",
  );

  await page.close();
  await second.close();
  const reopenedFirst = await context.newPage();
  const reopenedSecond = await context.newPage();
  await reopenedFirst.goto("/?order=ORD-88213&demo=1");
  await reopenedSecond.goto("/?order=ORD-88214&demo=1");
  await expect(reopenedFirst.locator(".order-summary .order-reference")).toContainText(
    "Order ORD-88213",
  );
  await expect(reopenedFirst.getByTestId("transfer-amount")).toHaveText(
    /43\.69\s*USDT/,
  );
  await expect(reopenedSecond.locator(".order-summary .order-reference")).toContainText(
    "Order ORD-88214",
  );
  await expect(reopenedSecond.getByTestId("payment-status")).toHaveAttribute(
    "data-status",
    "awaiting_payment",
  );
  await expect(reopenedSecond.locator(".checkout-footer")).toContainText(
    "Reference AQH-100309-PMT",
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
    "Reference AQH-100307-PMT",
  );
  expect(creates).toEqual([]);
});

for (const [order, reason] of [
  ["bad", "unknown_order"],
  ["", "malformed_order"],
  ["ORD-1", "unknown_order"],
  ["XYZ-88213", "unknown_order"],
  ["ORD-99999", "unknown_order"],
] as const) {
  test(`invalid order ${JSON.stringify(order)} renders no transfer controls and only validates the link`, async ({
    page,
  }) => {
    const apiRequests: Array<{
      method: string;
      path: string;
      order: string | null;
      signature: string | null;
    }> = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api/"))
        apiRequests.push({
          method: request.method(),
          path: url.pathname,
          order: url.searchParams.get("order_id"),
          signature: url.searchParams.get("sig"),
        });
    });
    await page.clock.install();
    await page.goto(`/?order=${order}&demo=1`);
    await expect(page.locator("header")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "This payment link isn’t valid",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".receipt dd .mono")).toHaveText(reason);
    await expect(page.getByTestId("checkout")).toHaveCount(0);
    await expect(page.getByTestId("continue")).toHaveCount(0);
    await expect(page.getByTestId("copy-address")).toHaveCount(0);
    await expect(page.getByTestId("transfer-qr")).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByTestId("demo-controls")).toHaveCount(0);
    await page.clock.runFor(5000);
    expect(apiRequests).toEqual([
      { method: "GET", path: "/api/checkout/link", order, signature: null },
    ]);
  });
}

test("initial information and demo amount controls target the page's order before a fresh Continue payment", async ({ page, context }) => {
  const posts: unknown[] = [];
  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/payments") posts.push(request.postDataJSON());
    if (request.method() === "GET" && new URL(request.url()).pathname.startsWith("/api/payments/")) reads.push(new URL(request.url()).pathname);
  });
  await page.goto("/?order=ORD-88214&demo=1");
  await expect(page.getByTestId("continue")).toBeEnabled();
  expect(posts).toEqual([{ order_id: "ORD-88214", currency: "USDT", network: "tron" }]);
  await expect(page.locator(".order-summary .order-reference")).toContainText("Order ORD-88214");
  await expect(page.locator(".checkout-footer")).not.toContainText("Reference AQH");
  expect(await stored(page, "ORD-88214")).toBeNull();
  await page.getByText("Demo controls", { exact: true }).click();
  await page.getByTestId("demo-order-amount").fill("250");
  const updated = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/demo/scenario" && response.request().postDataJSON().order_id === "ORD-88214",
  );
  await page.getByTestId("demo-apply-amount").click();
  expect((await updated).status()).toBe(200);
  expect(reads).toEqual([]);
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  expect(posts).toHaveLength(1);
  const first = await context.newPage();
  await first.goto("/?order=ORD-88213");
  await expect(first.getByTestId("continue")).toBeEnabled();
  await expect(first.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await page.getByRole("radio", { name: "Ethereum (ERC-20)", exact: true }).check();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toHaveText(/275\.830887\s*USDT/);
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 EUR");
  expect(posts).toEqual([
    { order_id: "ORD-88214", currency: "USDT", network: "tron" },
    { order_id: "ORD-88214", currency: "USDT", network: "ethereum" },
  ]);
  expect(await stored(page, "ORD-88214")).toBe("AQH-100308-PMT");
  expect(await stored(first, "ORD-88213")).toBeNull();
  await first.getByTestId("continue").click();
  await expect(first.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  await expect(first.getByTestId("transfer-amount")).toHaveText(/163\.69\s*USDT/);
  expect(await stored(first, "ORD-88213")).toBe("AQH-100309-PMT");
});

test("Reset demo clears server orders and opens its own selector without persisting the information payment", async ({
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
  expect(await stored(page, "ORD-88214")).toBe("AQH-100309-PMT");
  expect((await request.get("/api/demo?order_id=ORD-88214")).status()).toBe(
    400,
  );
  expect(await (await request.get("/api/demo")).json()).toMatchObject({
    payment: { payment_reference: "AQH-100306-PMT", status: "awaiting_payment" },
    orders: [{ order_id: "ORD-88213", payment_reference: "AQH-100306-PMT" }],
  });
  await second.reload();
  await expect(second.getByTestId("invalid-link")).toBeVisible();
  expect(await stored(second, "ORD-88214")).toBe("AQH-100309-PMT");
  await registerSecondOrder(request);
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
  expect(await stored(second, "ORD-88213")).toBe("AQH-100307-PMT");
});

test("a restored reference belonging to another order blocks transfer controls", async ({
  page,
  context,
}) => {
  await start(page, "ORD-88213");
  await page.evaluate(() =>
    localStorage.setItem(
      "stablecoin-checkout:payment-reference:ORD-88214",
      "AQH-100307-PMT",
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
  await expect(second.locator(".order-summary .order-reference")).toContainText("Order ORD-88214");
  expect(await stored(second, "ORD-88214")).toBe("AQH-100307-PMT");
});
