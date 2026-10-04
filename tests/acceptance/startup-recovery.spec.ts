import { expect, test, type Page } from "@playwright/test";

const pendingKey = "stablecoin-checkout:creation-pending:ORD-88213";
const referenceKey = "stablecoin-checkout:payment-reference:ORD-88213";
async function seedUnresolvedCreation(page: Page, orderId = "ORD-88213") {
  await page.addInitScript((order) => {
    if (sessionStorage.getItem("recovery-test-seeded")) return;
    sessionStorage.setItem("recovery-test-seeded", "1");
    localStorage.setItem(`stablecoin-checkout:creation-pending:${order}`, "1");
  }, orderId);
}

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/demo/reset", { data: {} })).ok()).toBe(true);
});

test("a persisted startup lock stops loading and can explicitly reset the local demo", async ({
  page,
}) => {
  await seedUnresolvedCreation(page);
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "The quote request outcome is uncertain.",
  );
  await expect(
    page.getByText("Checkout details unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Order total unavailable.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Loading merchant")).toHaveCount(0);
  await expect(page.getByLabel("Loading order total")).toHaveCount(0);
  await expect(page.getByTestId("continue")).toHaveCount(0);
  await expect(page.getByTestId("transfer-qr")).toHaveCount(0);
  expect(posts).toEqual([]);
  await page
    .getByRole("button", { name: "Reset demo checkout", exact: true })
    .click();
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page).toHaveTitle("nordwind audio");
  await expect(page.getByTestId("fiat-total")).toHaveText("149.90 EUR");
  expect(posts).toEqual(["/api/demo/reset", "/api/payments"]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), pendingKey),
  ).toBeNull();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), referenceKey),
  ).toBeNull();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-address")).toBeVisible();
  await expect(page.getByTestId("transfer-qr")).toBeVisible();
  expect(posts).toEqual(["/api/demo/reset", "/api/payments", "/api/payments"]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), referenceKey),
  ).toBe("AQH-100307-PMT");
});

for (const fault of [
  "500",
  "invalid-json",
  "unconfirmed",
  "disconnect",
  "timeout",
] as const) {
  test(`reset ${fault} retains the startup lock without creating another payment`, async ({
    page,
  }) => {
    await seedUnresolvedCreation(page);
    if (fault === "timeout") await page.clock.install();
    let resetCalls = 0;
    let creationCalls = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/payments"
      )
        creationCalls++;
    });
    await page.route("**/api/demo/reset", async (route) => {
      resetCalls++;
      if (fault === "disconnect") return route.abort();
      if (fault === "timeout") return;
      return route.fulfill({
        status: fault === "500" ? 500 : 200,
        contentType: "application/json",
        body:
          fault === "invalid-json"
            ? "not json"
            : JSON.stringify({ reset: false }),
      });
    });
    await page.goto("/");
    await page.getByTestId("demo-recover").click();
    if (fault === "timeout") {
      await expect(page.getByTestId("demo-recover")).toBeDisabled();
      await page
        .getByTestId("demo-recover")
        .evaluate((button: HTMLButtonElement) => button.click());
      await page.clock.runFor(10001);
    }
    await expect(
      page.getByText("Demo reset could not be confirmed.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByTestId("demo-recover")).toBeEnabled();
    expect(resetCalls).toBe(1);
    expect(creationCalls).toBe(0);
    expect(
      await page.evaluate((key) => localStorage.getItem(key), pendingKey),
    ).toBe("1");
    await expect(page.getByTestId("continue")).toHaveCount(0);
    await expect(page.getByTestId("transfer-qr")).toHaveCount(0);
  });
}

test("the existing Demo controls reset also preserves the lock when reset fails", async ({
  page,
}) => {
  await seedUnresolvedCreation(page);
  await page.route("**/api/demo/reset", (route) =>
    route.fulfill({ status: 500, json: { title: "Unavailable" } }),
  );
  await page.goto("/?demo=1");
  await page.getByText("Demo controls · no real funds").click();
  await page.getByTestId("demo-reset").click();
  await expect(
    page.getByText(
      "Demo reset could not be confirmed. Your checkout has not been restarted.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate((key) => localStorage.getItem(key), pendingKey),
  ).toBe("1");
  await expect(page.getByTestId("continue")).toHaveCount(0);
});

test("startup recovery is not offered on a signed order link", async ({
  page,
  request,
}) => {
  const response = await request.post("/api/demo/orders", {
    data: { amount: "25.00" },
  });
  const order = await response.json();
  await seedUnresolvedCreation(page, order.order_id);
  await page.goto(order.checkout_url);
  await expect(page.getByRole("alert")).toContainText(
    "The quote request outcome is uncertain.",
  );
  await expect(page.getByTestId("demo-recover")).toHaveCount(0);
  await expect(page.getByTestId("continue")).toHaveCount(0);
});

test("both reset buttons share one pending reset and restart only once", async ({
  page,
}) => {
  await seedUnresolvedCreation(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let resets = 0;
  let creations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/payments"
    )
      creations++;
  });
  await page.route("**/api/demo/reset", async (route) => {
    resets++;
    await gate;
    await route.fulfill({ json: { reset: true } });
  });
  try {
    await page.goto("/?demo=1");
    await page.getByTestId("demo-recover").click();
    await expect(page.getByTestId("demo-recover")).toBeDisabled();
    await page.getByText("Demo controls · no real funds").click();
    await page.getByTestId("demo-reset").click();
    await expect(page.getByTestId("demo-reset")).toBeDisabled();
    expect(resets).toBe(1);
    release();
    await expect(page.getByTestId("continue")).toBeEnabled();
    expect(resets).toBe(1);
    expect(creations).toBe(1);
  } finally {
    release();
  }
});
