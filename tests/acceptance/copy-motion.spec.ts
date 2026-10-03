import { expect, test, type Locator, type Page } from "@playwright/test";
import { startQuote, stubApi } from "./fixtures";

const address = "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e";
type Observation = { sawWidth: boolean; clearedWidth: boolean };
type ObservedWindow = Window & { copyWidth?: Record<string, Observation> };

async function observeWidth(button: Locator, key: string) {
  await button.evaluate((element, id) => {
    const button = element as HTMLButtonElement;
    const observation: Observation = { sawWidth: false, clearedWidth: false };
    const windowState = window as ObservedWindow;
    windowState.copyWidth ??= {};
    windowState.copyWidth[id] = observation;
    new MutationObserver((records) => {
      observation.sawWidth ||=
        button.style.width !== "" ||
        records.some((record) =>
          /(?:^|;)\s*width\s*:/.test(record.oldValue ?? ""),
        );
      observation.clearedWidth ||=
        observation.sawWidth && button.style.width === "";
    }).observe(button, {
      attributes: true,
      attributeFilter: ["style"],
      attributeOldValue: true,
    });
  }, key);
}
async function observed(page: Page, key: string) {
  return page.evaluate((id) => (window as ObservedWindow).copyWidth?.[id], key);
}
async function expectCopied(button: Locator) {
  await expect(button).toHaveClass(/is-copied/);
  await expect(button).toHaveAccessibleName("Copied");
  await expect(button).toHaveText("Copied");
  await expect
    .poll(() =>
      button.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          border: style.borderColor,
          color: style.color,
          width: (element as HTMLElement).style.width,
        };
      }),
    )
    .toEqual({
      background: "rgb(10, 10, 10)",
      border: "rgb(10, 10, 10)",
      color: "rgb(255, 255, 255)",
      width: "",
    });
  await expect(button.locator(".copy-check")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  await expect(button.locator("svg rect")).toHaveCount(0);
  await expect
    .poll(() =>
      button.locator(".copy-label").evaluate((element) => ({
        transform: getComputedStyle(element).transform,
        opacity: getComputedStyle(element).opacity,
      })),
    )
    .toEqual({ transform: "none", opacity: "1" });
}

test.describe("copy feedback motion", () => {
  test.use({
    permissions: ["clipboard-read", "clipboard-write"],
    reducedMotion: "no-preference",
  });
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
    await page.clock.pauseAt(new Date("2026-08-14T08:37:11.842Z"));
    await startQuote(page);
  });

  test("address copy fills, checks and resizes with the JavaScript clock paused", async ({
    page,
  }) => {
    const button = page.getByTestId("copy-address");
    await expect(button).toHaveAccessibleName("Copy address");
    const originalWidth = await button.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    await observeWidth(button, "address");
    await button.click();
    await expectCopied(button);
    await expect
      .poll(() => observed(page, "address"))
      .toEqual({ sawWidth: true, clearedWidth: true });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      address,
    );
    await expect(page.getByTestId("copy-amount")).not.toHaveClass(/is-copied/);
    await expect(button.locator("..").getByRole("status")).toHaveText("Copied");

    await page.clock.runFor(3000);
    await expect(button).toHaveAccessibleName("Copy address");
    await expect(button).not.toHaveClass(/is-copied/);
    await expect
      .poll(() =>
        button.evaluate((element) => ({
          width: (element as HTMLElement).style.width,
          natural: element.getBoundingClientRect().width,
        })),
      )
      .toEqual({ width: "", natural: originalWidth });
    await expect(button).toHaveCSS("background-color", "rgb(255, 255, 255)");
  });

  test("amount copy has the same motion and copies only the canonical amount", async ({
    page,
  }) => {
    const button = page.getByTestId("copy-amount");
    await observeWidth(button, "amount");
    await button.click();
    await expectCopied(button);
    await expect
      .poll(() => observed(page, "amount"))
      .toEqual({ sawWidth: true, clearedWidth: true });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "163.69",
    );
    await expect(page.getByTestId("copy-address")).toHaveAccessibleName(
      "Copy address",
    );
  });

  test("reduced motion switches both controls without setting a width or running an animation", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [id, value] of [
      ["copy-address", address],
      ["copy-amount", "163.69"],
    ]) {
      const button = page.getByTestId(id!);
      await observeWidth(button, id!);
      await button.click();
      await expectCopied(button);
      expect(await observed(page, id!)).toEqual({
        sawWidth: false,
        clearedWidth: false,
      });
      await expect(button).toHaveCSS("transition-duration", "0s");
      await expect(button.locator(".copy-check")).toHaveCSS(
        "animation-name",
        "none",
      );
      await expect(button.locator(".copy-label")).toHaveCSS(
        "animation-name",
        "none",
      );
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        value,
      );
    }
  });

  test("zero transition duration does not assign an inline width", async ({
    page,
  }) => {
    await page.addStyleTag({
      content: ".copy-control > button { transition-duration: 0s !important; }",
    });
    const button = page.getByTestId("copy-address");
    await observeWidth(button, "zero");
    await button.click();
    await expectCopied(button);
    expect(await observed(page, "zero")).toEqual({
      sawWidth: false,
      clearedWidth: false,
    });
  });

  test("Enter and Space activate copying without replacing the focused button", async ({
    page,
  }) => {
    const button = page.getByTestId("copy-address");
    await button.focus();
    await page.keyboard.press("Enter");
    await expectCopied(button);
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("outline-style", "solid");
    await page.clock.runFor(3000);
    await expect(button).toHaveAccessibleName("Copy address");
    await page.keyboard.press("Space");
    await expectCopied(button);
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      address,
    );
  });

  test("clipboard rejection keeps the resting button and reveals the manual-copy input", async ({
    page,
  }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () => Promise.reject(new Error("Permission denied")),
      });
    });
    const button = page.getByTestId("copy-address");
    await observeWidth(button, "failure");
    await button.click();
    await expect(button).not.toHaveClass(/is-copied/);
    await expect(button).toHaveAccessibleName("Copy address");
    await expect(page.getByLabel("Copy manually")).toHaveValue(address);
    await expect
      .poll(() =>
        page.locator(".copy-fallback").evaluate((element) => ({
          opacity: getComputedStyle(element).opacity,
          transform: getComputedStyle(element).transform,
        })),
      )
      .toEqual({ opacity: "1", transform: "none" });
    expect(await observed(page, "failure")).toEqual({
      sawWidth: false,
      clearedWidth: false,
    });
  });

  test("enabling reduced motion during resizing clears the temporary width", async ({
    page,
  }) => {
    await page.addStyleTag({ content: ":root { --copy-width-duration: 4s; }" });
    const button = page.getByTestId("copy-address");
    await button.click();
    await expect
      .poll(() =>
        button.evaluate((element) => (element as HTMLElement).style.width),
      )
      .not.toBe("");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectCopied(button);
  });
});

test("paid receipt keeps copy press feedback after its entrance finishes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const api = await stubApi(page);
  await page.clock.pauseAt(new Date("2026-08-14T08:37:11.842Z"));
  await startQuote(page);
  api.setState("paid");
  await page.clock.runFor(2000);
  const button = page.getByRole("button", {
    name: "Copy reference",
    exact: true,
  });
  await expect(button).toBeVisible();
  await expect
    .poll(() =>
      button.evaluate((element) =>
        element
          .getAnimations()
          .every((animation) => animation.playState === "finished"),
      ),
    )
    .toBe(true);
  await button.hover();
  await page.mouse.down();
  try {
    await expect(button).toHaveCSS(
      "transform",
      "matrix(0.97, 0, 0, 0.97, 0, 0)",
    );
  } finally {
    await page.mouse.up();
  }
});
