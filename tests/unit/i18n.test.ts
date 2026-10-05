import { describe, expect, it } from "vitest";
import { createCheckoutI18n, resolveLocale } from "../../src/i18n";
import { paymentErrorKey } from "../../src/i18n/paymentErrors";

describe("checkout message resolution", () => {
  it.each([undefined, null, "", "en", "EN_gb", "de-DE", "not-a-language"])(
    "uses the supported English catalog for %s",
    (requested) => {
      expect(resolveLocale(requested)).toBe("en");
      const i18n = createCheckoutI18n(requested);
      expect(
        i18n.global.t("selector.continue", {
          currency: "USDT",
          network: "Tron (TRC-20)",
        }),
      ).toBe("Continue with USDT on Tron (TRC-20)");
      i18n.dispose();
    },
  );

  it("isolates registered catalogs and English overrides between app instances", () => {
    const first = createCheckoutI18n();
    first.global.mergeLocaleMessage("en", { common: { copy: "Fixture copy" } });
    first.global.setLocaleMessage("ko", first.global.getLocaleMessage("en"));
    expect(first.global.t("common.copy")).toBe("Fixture copy");
    expect(first.global.availableLocales).toEqual(["en", "ko"]);

    const second = createCheckoutI18n();
    expect(second.global.t("common.copy")).toBe("Copy");
    expect(second.global.availableLocales).toEqual(["en"]);
    first.dispose();
    second.dispose();
  });

  it("interpolates exact decimal strings without numeric conversion", () => {
    const i18n = createCheckoutI18n();
    expect(
      i18n.global.t("quote.short", {
        amount: "1.123456789012345678",
        currency: "ETH",
      }),
    ).toBe("△ Your transfer was 1.123456789012345678 ETH short");
    expect(i18n.global.t("selector.confirmationCount", { count: 1 }, 1)).toBe(
      "1 confirmation",
    );
    expect(i18n.global.t("selector.confirmationCount", { count: 3 }, 3)).toBe(
      "3 confirmations",
    );
    i18n.dispose();
  });

  it("maps only known diagnostic messages and never treats server text as keys", () => {
    expect(
      paymentErrorKey(
        "The payment server returned invalid data. Transfer controls are paused.",
      ),
    ).toBe("errors.invalidData");
    expect(paymentErrorKey("errors.invalidData")).toBeNull();
    expect(paymentErrorKey("Provider unavailable: case <42>")).toBeNull();
  });
});
