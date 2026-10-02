import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import InvalidLinkView from "../../src/features/checkout/components/InvalidLinkView.vue";
import CopyButton from "../../src/features/checkout/components/CopyButton.vue";

const props = {
  reason: "invalid_signature",
  orderInLink: "ORD-88213",
  checkedAt: "2026-10-03T10:41:00",
  helpUrl: "mailto:help@payment-project.example",
  canGoBack: true,
};
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
describe("invalid checkout link view", () => {
  it("renders the exact title/body and focuses the heading", () => {
    const wrapper = mount(InvalidLinkView, { props, attachTo: document.body });
    expect(wrapper.get("h1").text()).toBe("This payment link isn’t valid");
    expect(wrapper.get(".invalid-link-explanation").text()).toBe(
      "We can’t find an order for it, so there is nothing to pay here. Nothing has been charged. If a shop sent you this link, go back and start the payment again — you’ll get a fresh one.",
    );
    expect(document.activeElement).toBe(wrapper.get("h1").element);
    expect(wrapper.get("svg").attributes("aria-hidden")).toBe("true");
    expect(wrapper.get("svg").attributes("width")).toBe("40");
    expect(wrapper.text()).not.toContain("[PAYMENT PROVIDER]");
    wrapper.unmount();
  });
  it.each([
    ["malformed_order", "The order code in the link isn’t valid"],
    ["unknown_order", "We can’t find an order for this link"],
    ["invalid_signature", "The link’s signature doesn’t match"],
    ["missing_signature", "The link isn’t signed"],
    ["future_reason", "The link could not be verified"],
    ["constructor", "The link could not be verified"],
  ])("renders reason text and verbatim code for %s", (reason, text) => {
    const wrapper = mount(InvalidLinkView, { props: { ...props, reason } });
    expect(wrapper.get("dd").text()).toBe(`${text} · ${reason}`);
    expect(wrapper.get("dd .mono").text()).toBe(reason);
    wrapper.unmount();
  });
  it.each([null, ""])(
    "uses fallback text for order %s and omits Go back without history",
    (orderInLink) => {
      const wrapper = mount(InvalidLinkView, {
        props: { ...props, orderInLink, canGoBack: false },
      });
      expect(wrapper.findAll("dd")[1]!.text()).toBe("—");
      expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
        "Copy details",
      ]);
      expect(wrapper.getComponent(CopyButton).props("value")).toContain(
        "Order in the link: none",
      );
      wrapper.unmount();
    },
  );
  it("copies the four requested lines and uses existing CopyButton", () => {
    const wrapper = mount(InvalidLinkView, { props });
    expect(wrapper.getComponent(CopyButton).props("value").split("\n")).toEqual(
      [
        "Reason: The link’s signature doesn’t match · invalid_signature",
        "Order in the link: ORD-88213",
        "Opened: 3 Oct 2026, 10:41",
        `Link: ${window.location.href}`,
      ],
    );
    expect(wrapper.get("[data-testid=copy-link-details]").text()).toBe(
      "Copy details",
    );
    wrapper.unmount();
  });
  it("uses browser history for Go back", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const wrapper = mount(InvalidLinkView, { props });
    await wrapper.get("button.primary").trigger("click");
    expect(back).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it.each([
    null,
    "mailto:help@payment-project.example",
    "https://payment-project.example/help",
  ])("omits Help and sharing guidance regardless of helpUrl %s", (helpUrl) => {
    const wrapper = mount(InvalidLinkView, { props: { ...props, helpUrl } });
    expect(wrapper.find(".invalid-link-footer a").exists()).toBe(false);
    expect(wrapper.find(".invalid-link-support > p").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Share these details");
    wrapper.unmount();
  });
});
