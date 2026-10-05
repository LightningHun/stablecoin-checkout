import { expect, test } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { stubApi } from "./fixtures";

test("English checkout messages preserve the exact displayed, copied and QR payment data", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const api = await stubApi(page);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByText("Total to pay", { exact: true })).toBeVisible();
  await expect(page.getByText("Pay with", { exact: true })).toBeVisible();
  await expect(page.getByTestId("continue")).toHaveText(
    "Continue with USDT on Tron (TRC-20)",
  );
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /163\.69\s*USDT/,
  );
  await expect(page.getByTestId("transfer-address")).toHaveText(
    "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
  );
  await page.getByTestId("copy-amount").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "163.69",
  );
  await page.getByTestId("copy-address").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
  );
  const png = PNG.sync.read(await page.getByTestId("transfer-qr").screenshot());
  expect(
    jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data,
  ).toBe("TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e");
  expect(api.requests.create).toBe(2);
});

test("unsupported UI language falls back to English independently of the fiat locale", async ({
  page,
}) => {
  const api = await stubApi(page);
  await page.goto("/?lang=unsupported&locale=de-DE");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByTestId("fiat-total")).toHaveText("149,90 EUR");
  await expect(page.getByTestId("continue")).toHaveText(
    "Continue with USDT on Tron (TRC-20)",
  );
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("fiat-total")).toHaveText("149,90 EUR");
  await expect(page.getByTestId("transfer-amount")).toHaveText(
    /163\.69\s*USDT/,
  );
  expect(api.requests.create).toBe(2);
});
