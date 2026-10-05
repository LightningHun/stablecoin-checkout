import { expect, test } from "@playwright/test";
import { startQuote, stubApi } from "./fixtures";

for (const width of [600, 601]) {
  test(`mobile layout starts correctly at the ${width}px boundary`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubApi(page); // Width changes must also work with the browser clock frozen.
    await page.goto("/");
    await expect(page.getByTestId("continue")).toBeEnabled();
    for (const selector of [
      ".merchant-header",
      ".checkout",
      ".selector",
      ".order-summary",
      ".payment-progress",
    ]) {
      await expect(page.locator(selector)).toHaveClass(
        width === 600 ? /\bmobile\b/ : /^(?!.*\bmobile\b)/,
      );
    }
    await expect(page.locator(".network-option").first()).toHaveCSS(
      "min-height",
      width === 600 ? "80px" : "66px",
    );
  });
}

test("resizing an active quote preserves the snapshot, focused section and requests", async ({
  page,
}) => {
  await page.setViewportSize({ width: 601, height: 900 });
  const api = await stubApi(page);
  await startQuote(page);
  const qr = page.getByTestId("transfer-qr");
  await expect(qr).toBeVisible();
  const image = await qr.elementHandle();
  const src = await qr.getAttribute("src");
  const address = await page.getByTestId("transfer-address").textContent();
  const requests = { ...api.requests };
  for (const width of [600, 390, 601, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(".address-panel")).toHaveCSS(
      "flex-direction",
      width <= 600 ? "column" : "row",
    );
    await expect(qr).toHaveCSS("width", width <= 600 ? "180px" : "160px");
    await expect(page.locator(".send-step")).toBeFocused();
    expect(await image!.evaluate((element) => element.isConnected)).toBe(true);
    expect(await qr.getAttribute("src")).toBe(src);
    expect(await page.getByTestId("transfer-address").textContent()).toBe(
      address,
    );
    expect(api.requests).toEqual(requests);
  }
});

test("loading placeholders respond to mobile props before the quote arrives", async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await stubApi(page);
  await page.goto("/");
  await expect(page.getByTestId("continue")).toBeEnabled();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/payments", async (route) => {
    await pending;
    await route.fallback();
  });
  try {
    await page.getByTestId("continue").click();
    await expect(page.locator(".loading-quote")).toHaveClass(/\bmobile\b/);
    await expect(page.locator(".skeleton-panel")).toHaveCSS(
      "flex-direction",
      "column",
    );
    await page.setViewportSize({ width: 601, height: 900 });
    await expect(page.locator(".skeleton-panel")).toHaveCSS(
      "flex-direction",
      "row",
    );
    await expect(page.getByTestId("transfer-qr")).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByTestId("transfer-qr")).toBeVisible();
  await expect(page.locator(".quote-details")).not.toHaveClass(/\bmobile\b/);
});

test("the quote class controls layout independently from the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await stubApi(page);
  await startQuote(page);
  await expect(page.locator(".address-panel")).toHaveCSS(
    "flex-direction",
    "row",
  );
  await page
    .locator(".quote-details")
    .evaluate((element) => element.classList.add("mobile"));
  await expect(page.locator(".address-panel")).toHaveCSS(
    "flex-direction",
    "column",
  );
  await expect(page.getByTestId("transfer-qr")).toHaveCSS("width", "180px");
  await page
    .locator(".quote-details")
    .evaluate((element) => element.classList.remove("mobile"));
  await expect(page.locator(".address-panel")).toHaveCSS(
    "flex-direction",
    "row",
  );
});
