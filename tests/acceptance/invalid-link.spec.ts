import { expect, test } from "@playwright/test";
import { stubApi } from "./fixtures";

test.beforeEach(async ({ request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  expect(
    (
      await request.post("/api/demo/reset", {
        data: { freeze: true, now: "2026-10-03T10:41:00.000Z" },
      })
    ).ok(),
  ).toBe(true);
});

test("unknown order validates once, copies support details and returns with Go back", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto("/?order=ORD-99999");
  await expect(
    page.getByRole("heading", { name: "This payment link isn’t valid" }),
  ).toBeFocused();
  await expect(page.locator(".receipt dd").nth(0)).toHaveText(
    "We can’t find an order for this link · unknown_order",
  );
  await expect(page.locator(".receipt dd").nth(1)).toHaveText("ORD-99999");
  await expect(page.locator(".receipt dd").nth(2)).toHaveText(
    "3 Oct 2026, 10:41",
  );
  await expect(
    page.getByRole("button", { name: "Go back", exact: true }),
  ).toBeVisible();
  await page.getByTestId("copy-link-details").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    [
      "Reason: We can’t find an order for this link · unknown_order",
      "Order in the link: ORD-99999",
      "Opened: 3 Oct 2026, 10:41",
      `Link: ${page.url()}`,
    ].join("\n"),
  );
  await page.clock.install();
  await page.clock.runFor(10000);
  expect(requests).toEqual(["/api/checkout/link"]);
  await expect(page.getByTestId("checkout")).toHaveCount(0);
  await page.getByRole("button", { name: "Go back", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "selection");
  await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("stablecoin-checkout:payment-reference:ORD-88213"))).toBeNull();
});

for (const [url, reason] of [
  ["/?order=abc", "unknown_order"],
  ["/?order=ORD-88213&sig=0000000000000000", "invalid_signature"],
  ["/?sig=0000000000000000", "malformed_order"],
] as const) {
  test(`${reason}: ${url} never starts a payment session`, async ({ page }) => {
    const requests: string[] = [];
    await page.addInitScript(() =>
      localStorage.setItem(
        "stablecoin-checkout:payment-reference:ORD-88213",
        "AQH-100306-PMT",
      ),
    );
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/"))
        requests.push(new URL(request.url()).pathname);
    });
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "This payment link isn’t valid" }),
    ).toBeVisible();
    await expect(page.locator(".receipt dd .mono")).toHaveText(reason);
    await page.clock.install();
    await page.clock.runFor(10000);
    expect(requests).toEqual(["/api/checkout/link"]);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("stablecoin-checkout:payment-reference:ORD-88213"),
      ),
    ).toBe("AQH-100306-PMT");
  });
}

test("demo-issued signed link opens its registered checkout", async ({
  page,
  request,
}) => {
  const issued = await (
    await request.post("/api/demo/orders", { data: { amount: "250" } })
  ).json();
  await request.post("/api/demo/scenario", {
    data: { requireSignature: true },
  });
  await page.goto(issued.checkout_url);
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("250.00 EUR");
  await expect(page.locator(".order-summary .order-reference")).toContainText("Order ORD-88214");
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("272.33");
  await expect(page.getByTestId("fiat-total")).toHaveText("250.00 EUR");
});

test("an unparseable stub verdict stays uncertain and Retry repeats validation only", async ({
  page,
}) => {
  await stubApi(page);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto("/?order=ORD-88213");
  await expect(page.getByRole("alert")).toContainText(
    "Can't reach a verified payment update.",
  );
  await expect(page.getByTestId("invalid-link")).toHaveCount(0);
  await expect(page.getByTestId("checkout")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry now" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(requests).toEqual(["/api/checkout/link", "/api/checkout/link"]);
});

test("HTTP 500 stays uncertain until Retry receives the invalid verdict", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/scenario", { data: { fault: "500" } });
  await page.goto("/?order=abc");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("invalid-link")).toHaveCount(0);
  await request.post("/api/demo/scenario", { data: { fault: "none" } });
  await page.getByRole("button", { name: "Retry now" }).click();
  await expect(page.getByTestId("invalid-link")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("demo panel creates a signed link and requires signatures without changing the default entry", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await page
    .getByText("Demo controls", { exact: true })
    .click();
  await page.getByRole("checkbox", { name: "Require signed links" }).check();
  await expect(
    page.getByRole("status").filter({ hasText: "Demo updated" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create signed order link" }).click();
  await expect(page.getByTestId("demo-order-link")).toHaveAttribute(
    "href",
    /^\/\?order=ORD-88214&sig=[0-9a-f]{16}$/,
  );
  await page.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await page.getByTestId("demo-order-link").getAttribute("href"),
  );
  await page.getByTestId("demo-order-link").click();
  await expect(page.getByTestId("continue")).toBeEnabled();
  await page.goto("/?order=ORD-88213");
  await expect(page.locator(".receipt dd .mono")).toHaveText(
    "missing_signature",
  );
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "selection");
  await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("stablecoin-checkout:payment-reference:ORD-88213"))).toBeNull();
});

test("invalid screen at 390px stacks full-width actions without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.goto("/?order=ORD-88213&sig=0000000000000000");
  await expect(page.getByTestId("invalid-link")).toBeVisible();
  const back = await page
    .getByRole("button", { name: "Go back", exact: true })
    .boundingBox();
  const copy = await page.getByTestId("copy-link-details").boundingBox();
  expect(back!.width).toBe(358);
  expect(copy!.width).toBe(358);
  expect(copy!.y).toBeGreaterThan(back!.y + back!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const [name, verdict] of [
  [
    "unsafe Help URL",
    {
      valid: false,
      reason: "unknown_order",
      order_id: "ORD-99999",
      checked_at: "2026-10-03T10:41:00.000Z",
      help_url: "javascript:alert(1)",
    },
  ],
  [
    "malformed Help URL",
    {
      valid: false,
      reason: "unknown_order",
      order_id: "ORD-99999",
      checked_at: "2026-10-03T10:41:00.000Z",
      help_url: "not a URL",
    },
  ],
  [
    "unknown verdict reason",
    {
      valid: false,
      reason: "unrecognized_reason",
      order_id: "ORD-99999",
      checked_at: "2026-10-03T10:41:00.000Z",
    },
  ],
  [
    "verdict for a different order",
    {
      valid: true,
      order_id: "ORD-88213",
      checked_at: "2026-10-03T10:41:00.000Z",
    },
  ],
] as const) {
  test(`${name} stays uncertain without starting checkout`, async ({
    page,
  }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/"))
        requests.push(new URL(request.url()).pathname);
    });
    await page.route("**/api/checkout/link?**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "x-server-time": "2026-10-03T10:41:00.000Z" },
        body: JSON.stringify(verdict),
      }),
    );
    await page.goto("/?order=ORD-99999");
    await expect(page.getByRole("alert")).toContainText(
      "Can't reach a verified payment update.",
    );
    await expect(page.getByTestId("invalid-link")).toHaveCount(0);
    await expect(page.getByTestId("checkout")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry now" })).toBeEnabled();
    expect(requests).toEqual(["/api/checkout/link"]);
  });
}

test("disconnected validation stays uncertain without payment or persistence writes", async ({
  page,
  request,
}) => {
  await request.post("/api/demo/scenario", { data: { fault: "disconnect" } });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto("/?order=abc");
  await expect(page.getByRole("alert")).toContainText(
    "Can't reach a verified payment update.",
  );
  await expect(page.getByTestId("invalid-link")).toHaveCount(0);
  await expect(page.getByTestId("checkout")).toHaveCount(0);
  expect(requests).toEqual(["/api/checkout/link"]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("opening demo controls cannot overwrite a newer signature checkbox choice", async ({
  page,
  request,
}) => {
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested: (() => void) | undefined;
  const requestedDemo = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route("**/api/demo", async (route) => {
    requested?.();
    await released;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"requireSignature":false}',
    });
  });
  await page.goto("/?demo=1");
  await page
    .getByText("Demo controls", { exact: true })
    .click();
  await requestedDemo;
  const applied = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/demo/scenario",
  );
  await page.getByRole("checkbox", { name: "Require signed links" }).check();
  expect((await applied).ok()).toBe(true);
  const initialRead = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/demo",
  );
  release?.();
  await (await initialRead).finished();
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(
    page.getByRole("checkbox", { name: "Require signed links" }),
  ).toBeChecked();
  expect((await (await request.get("/api/demo")).json()).requireSignature).toBe(
    true,
  );
});
