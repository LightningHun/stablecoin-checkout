import { expect, test, type Page } from "@playwright/test";
import { stubApi } from "./fixtures";

type MotionObservation = {
  sawHeight: boolean;
  sawResizing: boolean;
  sawBoth: boolean;
};
type ObservedWindow = Window & {
  networkMotionObservation?: MotionObservation;
};

async function observeHeightChanges(page: Page) {
  await page.locator(".network-options").evaluate((element) => {
    const list = element as HTMLElement;
    const observation = {
      sawHeight: false,
      sawResizing: false,
      sawBoth: false,
    };
    (window as ObservedWindow).networkMotionObservation = observation;
    const observer = new MutationObserver((records) => {
      const hasHeight = list.style.height !== "";
      const isResizing = list.classList.contains("is-resizing");
      observation.sawHeight ||=
        hasHeight ||
        records.some(
          (record) =>
            record.attributeName === "style" &&
            /(?:^|;)\s*height\s*:/.test(record.oldValue ?? ""),
        );
      observation.sawResizing ||=
        isResizing ||
        records.some(
          (record) =>
            record.attributeName === "class" &&
            (record.oldValue ?? "").split(/\s+/).includes("is-resizing"),
        );
      observation.sawBoth ||= hasHeight && isResizing;
    });
    observer.observe(list, {
      attributes: true,
      attributeFilter: ["style", "class"],
      attributeOldValue: true,
    });
  });
}

async function clearObservation(page: Page) {
  await page.evaluate(() => {
    const observation = (window as ObservedWindow).networkMotionObservation;
    if (!observation) throw new Error("Height observer was not installed");
    observation.sawHeight = false;
    observation.sawResizing = false;
    observation.sawBoth = false;
  });
}

async function expectNaturalList(
  page: Page,
  cards: number,
  minCardHeight: "66px" | "80px",
) {
  const list = page.locator(".network-options");
  await expect(list.locator(".network-option")).toHaveCount(cards);
  await expect
    .poll(() =>
      list.evaluate((element) => {
        const list = element as HTMLElement;
        return {
          inlineStyle: list.getAttribute("style") ?? "",
          resizing: list.classList.contains("is-resizing"),
          atNaturalHeight:
            Math.abs(list.getBoundingClientRect().height - list.scrollHeight) <
            1,
          overflow: getComputedStyle(list).overflow,
        };
      }),
    )
    .toEqual({
      inlineStyle: "",
      resizing: false,
      atNaturalHeight: true,
      overflow: "visible",
    });
  await expect(list.locator(".network-option").first()).toHaveCSS(
    "min-height",
    minCardHeight,
  );
}

async function expectObservedTransition(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => (window as ObservedWindow).networkMotionObservation),
    )
    .toEqual({ sawHeight: true, sawResizing: true, sawBoth: true });
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900, cardHeight: "66px" as const },
  { name: "mobile", width: 390, height: 900, cardHeight: "80px" as const },
]) {
  test.describe(`network list height motion: ${viewport.name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "no-preference",
    });

    test.beforeEach(async ({ page }) => {
      await stubApi(page); // Deliberately installs the fake clock; never advance it for CSS motion.
      await page.goto("/");
      await expectNaturalList(page, 2, viewport.cardHeight);
      await observeHeightChanges(page);
    });

    test("grows and shrinks, then restores natural height with the fake clock installed", async ({
      page,
    }) => {
      for (const step of [
        { currency: "USDC", cards: 3 },
        { currency: "ETH", cards: 1 },
        { currency: "USDT", cards: 2 },
      ]) {
        await clearObservation(page);
        await page
          .getByRole("radio", { name: step.currency, exact: true })
          .check();
        await expectObservedTransition(page);
        await expectNaturalList(page, step.cards, viewport.cardHeight);
      }
    });

    test("rapid USDT to USDC to ETH switching finishes at the ETH natural height", async ({
      page,
    }) => {
      // Force avoids waiting for CSS-driven actionability stability between these inputs.
      await page
        .getByRole("radio", { name: "USDC", exact: true })
        .check({ force: true });
      await page
        .getByRole("radio", { name: "ETH", exact: true })
        .check({ force: true });
      await expectObservedTransition(page);
      await expect(
        page.getByRole("radio", { name: "ETH", exact: true }),
      ).toBeChecked();
      await expectNaturalList(page, 1, viewport.cardHeight);
      await expect(
        page.getByRole("radio", { name: "Ethereum", exact: true }),
      ).toBeChecked();
    });

    test("reduced motion never fixes the height while changing currencies", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const step of [
        { currency: "USDC", cards: 3 },
        { currency: "ETH", cards: 1 },
        { currency: "USDT", cards: 2 },
      ]) {
        await page
          .getByRole("radio", { name: step.currency, exact: true })
          .check();
        await expectNaturalList(page, step.cards, viewport.cardHeight);
        expect(
          await page.evaluate(
            () => (window as ObservedWindow).networkMotionObservation,
          ),
        ).toEqual({ sawHeight: false, sawResizing: false, sawBoth: false });
      }
    });
  });
}

test("zero transition duration keeps the list at its natural height without inline styles", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await stubApi(page);
  await page.goto("/");
  await expectNaturalList(page, 2, "66px");
  await page.addStyleTag({
    content: ".network-options { transition-duration: 0s !important; }",
  });
  await observeHeightChanges(page);
  await page.getByRole("radio", { name: "USDC", exact: true }).check();
  await expectNaturalList(page, 3, "66px");
  expect(
    await page.evaluate(
      () => (window as ObservedWindow).networkMotionObservation,
    ),
  ).toEqual({ sawHeight: false, sawResizing: false, sawBoth: false });
});

test("currency arrow keys keep radio selection working during list resizing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await stubApi(page);
  await page.goto("/");
  await expectNaturalList(page, 2, "66px");
  await observeHeightChanges(page);
  await page.getByRole("radio", { name: "USDT", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "ETH", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("radio", { name: "ETH", exact: true }),
  ).toBeFocused();
  await expectObservedTransition(page);
  await expectNaturalList(page, 1, "66px");
});
