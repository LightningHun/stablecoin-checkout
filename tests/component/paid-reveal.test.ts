import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PaymentProgress from "../../src/features/checkout/components/PaymentProgress.vue";
import type { Payment } from "../../src/features/checkout/domain/paymentModel";
import { fixedNow, paymentSnapshot } from "../fixtures/oracles";

const previous = {
  ...paymentSnapshot("confirming"),
  quote: {
    ...paymentSnapshot().quote,
    network: "ethereum",
    network_name: "Ethereum (ERC-20)",
    required_confirmations: 3,
  },
  confirmations: 2,
  required_confirmations: 3,
} as Payment;
const paid = {
  ...paymentSnapshot("paid"),
  quote: previous.quote,
  confirmations: 3,
  required_confirmations: 3,
} as Payment;
const props = {
  payment: paid,
  health: "fresh" as const,
  lastChecked: fixedNow,
};
afterEach(() => vi.unstubAllGlobals());

describe("paid reveal presentation", () => {
  it("renders an initially paid snapshot without reveal classes or a ghost", () => {
    const wrapper = mount(PaymentProgress, { props });
    expect(wrapper.find('[class*="paid-reveal"]').exists()).toBe(false);
    expect(wrapper.find(".paid-confirmation-ghost").exists()).toBe(false);
    expect(wrapper.get('strong[role="status"]').text()).toBe("Paid");
    wrapper.unmount();
  });

  it("overlays the previous confirmation snapshot while all real paid facts exist", () => {
    const wrapper = mount(PaymentProgress, {
      props: { ...props, reveal: { active: true, previous } },
    });
    const ghost = wrapper.get(".paid-confirmation-ghost");
    expect(ghost.attributes("aria-hidden")).toBe("true");
    expect(ghost.get(".paid-ghost-count").text()).toBe("3 of 3 confirmations");
    expect(ghost.text()).toContain("Confirming your transfer");
    expect(ghost.findAll(".paid-ghost-bars > span")).toHaveLength(3);
    expect(ghost.findAll(".paid-ghost-complete")).toHaveLength(2);
    expect(
      ghost.find('button, img, [data-testid="transfer-address"]').exists(),
    ).toBe(false);
    expect(wrapper.attributes("data-status")).toBe("paid");
    expect(wrapper.get('strong[role="status"]').text()).toBe("Paid");
    expect(wrapper.get(".receipt").text()).toContain("Amount received");
    expect(wrapper.get("button").text()).toContain("Copy reference");
    wrapper.unmount();
  });

  it("removes the ghost only for its own fade end, and never recreates it on a refresh", async () => {
    const wrapper = mount(PaymentProgress, {
      props: { ...props, reveal: { active: true, previous } },
    });
    await wrapper
      .get(".paid-ghost-bars > span")
      .trigger("animationend", { animationName: "paid-ghost-out" });
    expect(wrapper.find(".paid-confirmation-ghost").exists()).toBe(true);
    await wrapper
      .get(".paid-confirmation-ghost")
      .trigger("animationend", { animationName: "paid-bar-fill" });
    expect(wrapper.find(".paid-confirmation-ghost").exists()).toBe(true);
    await wrapper
      .get(".paid-confirmation-ghost")
      .trigger("animationend", { animationName: "paid-ghost-out" });
    expect(wrapper.find(".paid-confirmation-ghost").exists()).toBe(false);
    await wrapper.setProps({ payment: { ...paid } });
    expect(wrapper.find(".paid-confirmation-ghost").exists()).toBe(false);
    expect(wrapper.classes()).toContain("paid-reveal-content");
    wrapper.unmount();
  });

  it.each(["awaiting_payment", "underpaid"] as const)(
    "reveals paid from %s without a confirmation ghost",
    (status) => {
      const wrapper = mount(PaymentProgress, {
        props: {
          ...props,
          reveal: {
            active: true,
            previous: paymentSnapshot(status) as Payment,
          },
        },
      });
      expect(wrapper.classes()).toContain("paid-reveal-content");
      expect(wrapper.find(".paid-confirmation-ghost").exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it("suppresses reveal and ghost for reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const wrapper = mount(PaymentProgress, {
      props: { ...props, reveal: { active: true, previous } },
    });
    expect(wrapper.classes()).not.toContain("paid-reveal-content");
    expect(wrapper.find(".paid-confirmation-ghost").exists()).toBe(false);
    wrapper.unmount();
  });
});
