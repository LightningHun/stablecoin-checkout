import { afterEach, describe, expect, it, vi } from "vitest";
import { config, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick, type Ref } from "vue";
import { createCheckoutI18n, messages } from "../../src/i18n";
import QuoteDetails from "../../src/features/checkout/components/QuoteDetails.vue";
import PaymentProgress from "../../src/features/checkout/components/PaymentProgress.vue";
import ConnectionBanner from "../../src/features/checkout/components/ConnectionBanner.vue";
import type { Payment } from "../../src/features/checkout/domain/paymentModel";
import { paymentSnapshot } from "../fixtures/oracles";

const wrappers: VueWrapper[] = [];
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

function translatedInstance() {
  const i18n = createCheckoutI18n();
  // English supplies unrelated fixture fields; every tested translation and
  // expected output below is independently specified as a literal.
  i18n.global.setLocaleMessage("ko", {
    ...messages.en,
    common: {
      ...messages.en.common,
      copy: "복사",
      copied: "복사됨",
      copyAddress: "주소 복사",
    },
    quote: {
      ...messages.en.quote,
      sendRemaining: "남은 금액 보내기",
      networkOnly: "전용 네트워크: {network}",
      locked: "남은 시간 {countdown} · 환율 고정",
    },
    progress: {
      ...messages.en.progress,
      incompleteSubtitle: "{total} 중 {received} 받음 · 만료 {time}",
    },
    errors: {
      ...messages.en.errors,
      invalidData: "결제 응답을 확인할 수 없습니다.",
    },
  });
  config.global.plugins = [i18n];
  return i18n;
}

// The app ships English only; broaden this test fixture's reactive locale after
// registering its extra catalog without claiming Korean is a shipped locale.
function selectFixtureLocale(
  i18n: ReturnType<typeof createCheckoutI18n>,
  value: "en" | "ko",
) {
  const locale: Ref<string> = i18n.global.locale;
  locale.value = value;
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("reactive checkout translations", () => {
  it("changes labels and rich countdown order without changing exact payment or clipboard values", async () => {
    const i18n = translatedInstance();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const payment = paymentSnapshot("underpaid") as Payment;
    const wrapper = mount(QuoteDetails, {
      props: { payment, remaining: 600000 },
    });
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.get(".amount-row .eyebrow").text()).toBe(
      "Send the remaining",
    );
    const originalQr = wrapper
      .get('[data-testid="transfer-qr"]')
      .attributes("src");

    const originalPayment = wrapper.props("payment");
    selectFixtureLocale(i18n, "ko");
    await nextTick();
    expect(wrapper.get(".amount-row .eyebrow").text()).toBe("남은 금액 보내기");
    expect(wrapper.get(".deadline > span").text()).toBe(
      "남은 시간 10:00 · 환율 고정",
    );
    expect(wrapper.get('[data-testid="transfer-amount"]').text()).toMatch(
      /^43\.69\s*USDT$/,
    );
    expect(wrapper.get('[data-testid="transfer-address"]').text()).toBe(
      "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
    );
    expect(wrapper.get('[data-testid="transfer-qr"]').attributes("src")).toBe(
      originalQr,
    );
    expect(wrapper.props("payment")).toBe(originalPayment);

    await wrapper.get('[data-testid="copy-amount"]').trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenLastCalledWith("43.69");
    expect(wrapper.get('[data-testid="copy-amount"]').text()).toBe("복사됨");
    await wrapper.get('[data-testid="copy-address"]').trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenLastCalledWith(
      "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
    );

    selectFixtureLocale(i18n, "en");
    await nextTick();
    expect(wrapper.get(".amount-row .eyebrow").text()).toBe(
      "Send the remaining",
    );
    expect(wrapper.get('[data-testid="copy-amount"]').text()).toBe("Copied");
  });

  it("lets translated complete sentences reorder styled receipt slots", () => {
    const i18n = translatedInstance();
    selectFixtureLocale(i18n, "ko");
    const wrapper = mount(PaymentProgress, {
      props: {
        payment: paymentSnapshot("underpaid") as Payment,
        quoteExpired: true,
        health: "fresh",
        lastChecked: null,
      },
    });
    wrappers.push(wrapper);
    const subtitle = wrapper.get('[data-testid="incomplete-subtitle"]');
    expect(subtitle.text()).toMatch(
      /^163\.69 USDT 중 120\.00 받음 · 만료 \d{2}:\d{2}$/,
    );
    expect(subtitle.findAll(".mono").map((node) => node.text())).toEqual([
      "163.69 USDT",
      "120.00",
    ]);
    expect(subtitle.get("time").attributes("datetime")).toBe(
      "2026-08-14T08:52:10.842Z",
    );
    expect(wrapper.attributes("data-status")).toBe("underpaid");
  });

  it("translates known errors reactively but preserves and escapes unknown backend diagnostics", async () => {
    const i18n = translatedInstance();
    const wrapper = mount(ConnectionBanner, {
      props: {
        error:
          "The payment server returned invalid data. Transfer controls are paused.",
        connectionIssue: false,
        retryInSeconds: null,
        requestPending: false,
        automaticRetriesPaused: false,
        uncertain: false,
        busy: false,
        manualRetryLimitReached: false,
        manualRetryInSeconds: 0,
        lastKnownStatus: null,
      },
    });
    wrappers.push(wrapper);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "The payment server returned invalid data.",
    );
    selectFixtureLocale(i18n, "ko");
    await nextTick();
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "결제 응답을 확인할 수 없습니다.",
    );
    await wrapper.setProps({
      error: "errors.invalidData <b>Provider case 42</b>",
    });
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "errors.invalidData <b>Provider case 42</b>",
    );
    expect(wrapper.find("b").exists()).toBe(false);
  });
});
