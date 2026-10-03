import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { effectScope, type EffectScope } from "vue";
import MerchantBrand from "../../src/features/checkout/components/MerchantBrand.vue";
import OrderSummary from "../../src/features/checkout/components/OrderSummary.vue";
import PaymentProgress from "../../src/features/checkout/components/PaymentProgress.vue";
import { usePaymentController } from "../../src/features/checkout/application/usePaymentController";
import type {
  Payment,
  Currency,
} from "../../src/features/checkout/domain/paymentModel";
import type { PaymentClient } from "../../src/features/checkout/infrastructure/paymentClient";
const scopes: EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
});
const currencies: Currency[] = [
  {
    code: "TOK",
    name: "Token",
    decimals: 8,
    networks: [
      {
        id: "custom",
        name: "Custom Chain",
        network_fee: "0.00000002",
        required_confirmations: 4,
        avg_confirmation_seconds: 45,
      },
      {
        id: "other",
        name: "Another Chain",
        network_fee: "0",
        required_confirmations: 2,
        avg_confirmation_seconds: 60,
      },
    ],
  },
];
const payment: Payment = {
  order_id: "invoice/2026-42",
  payment_reference: "pay-42",
  merchant: { name: "Acme Shop" },
  order: { currency: "USD", amount: "0.01" },
  status: "underpaid",
  amount_received: "0.00000001",
  amount_outstanding: "0.00000003",
  tx_hash: "demo-hash",
  crypto_address: "custom-address",
  quote: {
    crypto_currency: "TOK",
    network: "custom",
    network_name: "Custom Chain",
    crypto_amount: "0.00000002",
    network_fee: "0.00000002",
    total_due: "0.00000004",
    exchange_rate: "250000",
    crypto_address: "custom-address",
    required_confirmations: 4,
    expires_at: "2099-01-01T00:00:00.000Z",
  },
};
const sample = <T>(data: T) => ({
  data,
  serverTime: "2026-10-03T00:00:00.000Z",
  start: 0,
  end: 0,
});
function setup() {
  const scope = effectScope();
  scopes.push(scope);
  const client: PaymentClient = {
    currencies: vi.fn(async () => sample(currencies)),
    create: vi.fn(async () => sample(payment)),
    status: vi.fn(async () => sample(payment)),
    requote: vi.fn(async () => sample(payment)),
  };
  return {
    client,
    controller: scope.run(() => usePaymentController({ client }))!,
  };
}
describe("API-driven presentation", () => {
  it("uses Merchant and its first letter before any merchant response", () => {
    const wrapper = mount(MerchantBrand);
    expect(wrapper.text()).toBe("MMerchant");
    expect(wrapper.find("img").exists()).toBe(false);
    wrapper.unmount();
  });
  it.each(["Acme Shop", "nordwind audio", "한글 상점", "🛍 Shop"])(
    "uses the first character of %s",
    (name) => {
      const wrapper = mount(MerchantBrand, { props: { merchant: { name } } });
      expect(wrapper.get(".merchant-mark").text()).toBe([...name][0]);
      wrapper.unmount();
    },
  );
  it("uses icon_url, falls back on image error, and retries a changed URL", async () => {
    const wrapper = mount(MerchantBrand, {
      props: {
        merchant: {
          name: "Acme",
          icon_url: "https://shop.example/icon.png",
          logo_url: "https://shop.example/old.png",
        },
      },
    });
    expect(wrapper.get("img").attributes("src")).toBe(
      "https://shop.example/icon.png",
    );
    await wrapper.get("img").trigger("error");
    expect(wrapper.get(".merchant-mark").text()).toBe("A");
    await wrapper.setProps({
      merchant: { name: "Beta", logo_url: "https://shop.example/new.png" },
    });
    expect(wrapper.get("img").attributes("src")).toBe(
      "https://shop.example/new.png",
    );
    wrapper.unmount();
  });
  it.each(["javascript:alert(1)", "data:text/html,bad", "file:///tmp/icon"])(
    "does not render unsafe icon %s",
    (icon_url) => {
      const wrapper = mount(MerchantBrand, {
        props: { merchant: { name: "Safe", icon_url } },
      });
      expect(wrapper.find("img").exists()).toBe(false);
      expect(wrapper.get(".merchant-mark").text()).toBe("S");
      wrapper.unmount();
    },
  );
  it("shows a loading placeholder until API order information is available", async () => {
    const wrapper = mount(OrderSummary, {
      props: { locale: "en-IE" },
    });
    expect(wrapper.find("h1").exists()).toBe(false);
    expect(wrapper.find('[aria-label="Loading order total"]').exists()).toBe(true);
    await wrapper.setProps({
      amount: "1.234",
      currency: "KWD",
      locale: "de-DE",
    });
    expect(wrapper.get("h1").text()).toBe("1,234 KWD");
    wrapper.unmount();
  });
  it("calculates partial progress using API precision 8, not a token-code heuristic", () => {
    const wrapper = mount(PaymentProgress, {
      props: { payment, decimals: 8, health: "fresh", lastChecked: null },
    });
    expect(
      (wrapper.get(".partial-progress span").element as HTMLElement).style
        .width,
    ).toBe("25%");
    wrapper.unmount();
  });
  it("selects the first API currency/network, creates no quote on initialization, and restores the saved pair", async () => {
    const { controller, client } = setup();
    expect(controller.draft.value).toEqual({ currency: "", network: "" });
    await controller.initialize();
    expect(controller.draft.value).toEqual({
      currency: "TOK",
      network: "custom",
    });
    expect(controller.order.value).toBeNull();
    expect(controller.merchant.value).toBeNull();
    expect(client.create).not.toHaveBeenCalled();
    vi.mocked(client.status).mockResolvedValue(
      sample({
        ...payment,
        quote: {
          ...payment.quote,
          network: "other",
          network_name: "Another Chain",
        },
      }),
    );
    expect(await controller.restore("pay-42")).toBe("restored");
    expect(controller.draft.value).toEqual({
      currency: "TOK",
      network: "other",
    });
  });
  it("reloads and publishes metadata before restoring after a failed catalogue bootstrap", async () => {
    const { controller, client } = setup();
    vi.mocked(client.currencies).mockRejectedValueOnce(
      new Error("Temporary catalogue failure"),
    );
    await controller.initialize();
    expect(controller.currencies.value).toEqual([]);
    expect(await controller.restore("pay-42")).toBe("restored");
    expect(controller.currencies.value[0]?.decimals).toBe(8);
    expect(controller.health.value).toBe("fresh");
    expect(client.currencies).toHaveBeenCalledTimes(2);
  });
  it("keeps restoration blocked while currency metadata remains unavailable", async () => {
    const { controller, client } = setup();
    vi.mocked(client.currencies).mockRejectedValue(
      new Error("Unavailable catalogue"),
    );
    await controller.initialize();
    expect(await controller.restore("pay-42")).toBe("unavailable");
    expect(controller.payment.value).toBeNull();
    expect(controller.canChange.value).toBe(false);
    expect(client.status).not.toHaveBeenCalled();
  });
  it("accepts numeric-equal fee spelling on reads but rejects a changed fee value", async () => {
    const { controller, client } = setup();
    await controller.initialize();
    await controller.create();
    vi.mocked(client.status).mockResolvedValue(
      sample({
        ...payment,
        quote: { ...payment.quote, network_fee: "0.0000000200" },
      }),
    );
    await controller.retry();
    expect(controller.health.value).toBe("fresh");
    expect(controller.error.value).toBe("");
    expect(controller.payment.value?.quote.network_fee).toBe("0.00000002");
    vi.mocked(client.status).mockResolvedValue(
      sample({
        ...payment,
        quote: { ...payment.quote, network_fee: "0.00000003" },
      }),
    );
    await controller.retry();
    expect(controller.health.value).toBe("stale");
    expect(controller.availability.value).toBe("reconciling");
    expect(controller.payment.value?.quote.network_fee).toBe("0.00000002");
  });
});
