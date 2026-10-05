import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, effectScope, nextTick, type EffectScope } from "vue";
import App from "../../src/App.vue";
import { useMobile } from "../../src/composables/useMobile";
import QuoteDetails from "../../src/features/checkout/components/QuoteDetails.vue";
import type { Payment } from "../../src/features/checkout/domain/paymentModel";
import { paymentSnapshot } from "../fixtures/oracles";

const scopes: EffectScope[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.unstubAllGlobals();
});

function viewport(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: initial,
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.add(listener),
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    ),
  };
  const matchMedia = vi.fn(() => media);
  vi.stubGlobal("matchMedia", matchMedia);
  return {
    media,
    matchMedia,
    listeners,
    change(matches: boolean) {
      media.matches = matches;
      listeners.forEach((listener) =>
        listener({ matches } as MediaQueryListEvent),
      );
    },
  };
}

describe("mobile layout ownership", () => {
  it.each([true, false])(
    "reads the initial mobile=%s state before mount",
    (initial) => {
      const screen = viewport(initial);
      const scope = effectScope();
      scopes.push(scope);
      const mobile = scope.run(useMobile)!;
      expect(mobile.value).toBe(initial);
      expect(screen.matchMedia).toHaveBeenCalledExactlyOnceWith(
        "(max-width: 600px)",
      );
    },
  );

  it("App passes viewport changes as a prop and removes its single listener on unmount", async () => {
    const screen = viewport(true);
    const wrapper = mount(App, {
      global: {
        stubs: {
          CheckoutPage: defineComponent({
            props: { mobile: Boolean },
            template: '<output>{{ mobile ? "mobile" : "desktop" }}</output>',
          }),
        },
      },
    });
    try {
      expect(wrapper.text()).toBe("mobile");
      screen.change(false);
      await nextTick();
      expect(wrapper.text()).toBe("desktop");
      screen.change(true);
      await nextTick();
      expect(wrapper.text()).toBe("mobile");
      expect(screen.matchMedia).toHaveBeenCalledTimes(1);
      expect(screen.listeners.size).toBe(1);
    } finally {
      wrapper.unmount();
    }
    expect(screen.listeners.size).toBe(0);
    expect(screen.media.removeEventListener).toHaveBeenCalledExactlyOnceWith(
      "change",
      screen.media.addEventListener.mock.calls[0]![1],
    );
  });

  it("can be disposed when matchMedia is unavailable", () => {
    vi.stubGlobal("matchMedia", undefined);
    const scope = effectScope();
    scopes.push(scope);
    expect(scope.run(useMobile)!.value).toBe(false);
    expect(() => scope.stop()).not.toThrow();
  });

  it.each([390, 1280])(
    "QuoteDetails follows its mobile prop independently of a %ipx viewport",
    async (width) => {
      vi.stubGlobal("innerWidth", width);
      const screen = viewport(width <= 600);
      const wrapper = mount(QuoteDetails, {
        props: {
          mobile: false,
          payment: paymentSnapshot() as Payment,
          remaining: 600000,
        },
      });
      try {
        const root = wrapper.element;
        expect(wrapper.classes()).not.toContain("mobile");
        await wrapper.setProps({ mobile: true });
        expect(wrapper.classes()).toContain("mobile");
        await wrapper.setProps({ mobile: false });
        expect(wrapper.classes()).not.toContain("mobile");
        expect(wrapper.element).toBe(root);
        expect(screen.matchMedia).not.toHaveBeenCalledWith("(max-width: 600px)");
        expect(wrapper.get('[data-testid="transfer-amount"]').text()).toContain(
          "163.69",
        );
      } finally {
        wrapper.unmount();
      }
    },
  );
});
