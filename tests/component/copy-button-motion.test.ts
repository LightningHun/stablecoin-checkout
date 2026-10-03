import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import CopyButton from "../../src/features/checkout/components/CopyButton.vue";

const address = "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e";
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const writeText = vi.fn<(value: string) => Promise<void>>();
const wrappers: VueWrapper[] = [];
function render(label = "Copy address", value = address) {
  const wrapper = mount(CopyButton, {
    props: { label, value, testid: "copy-test" },
  });
  wrappers.push(wrapper);
  return wrapper;
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("copy control motion states", () => {
  it.each(["Copy", "Copy address", "Copy reference", "Copy details"])(
    "keeps the resting SVG, text and test ID for %s",
    (label) => {
      const wrapper = render(label);
      const button = wrapper.get("button");
      expect(button.attributes("data-testid")).toBe("copy-test");
      expect(button.classes()).not.toContain("is-copied");
      expect(button.text()).toBe(label);
      expect(button.get(".copy-label").text()).toBe(label);
      expect(button.get("svg").attributes("aria-hidden")).toBe("true");
      expect(button.get("svg rect").attributes()).toMatchObject({
        x: "9",
        y: "9",
        width: "11",
        height: "11",
        rx: "2",
      });
      expect(button.get("svg path").attributes("d")).toBe(
        "M5 15V6a2 2 0 0 1 2-2h9",
      );
      expect(button.find(".copy-check").exists()).toBe(false);
      expect(wrapper.get('[role="status"]').text()).toBe("");
    },
  );

  it("changes the icon and remounts the label only after the write succeeds", async () => {
    let complete!: () => void;
    writeText.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const wrapper = render();
    const label = wrapper.get(".copy-label").element;
    await wrapper.get("button").trigger("click");
    expect(wrapper.get("button").classes()).not.toContain("is-copied");
    expect(wrapper.get(".copy-label").element).toBe(label);
    complete();
    await flushPromises();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(address);
    expect(wrapper.get("button").classes()).toContain("is-copied");
    expect(wrapper.get("button").text()).toBe("Copied");
    expect(wrapper.get(".copy-label").element).not.toBe(label);
    expect(wrapper.get(".copy-check").attributes("aria-hidden")).toBe("true");
    expect(wrapper.get(".copy-check path").attributes("d")).toBe(
      "m5 12 4 4L19 6",
    );
    expect(wrapper.find("svg rect").exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe("Copied");
    expect(wrapper.get("button").element.style.width).toBe(""); // jsdom has no layout.
  });

  it("keeps copied styling independent and restores the SVG after the existing 3 seconds", async () => {
    const first = render();
    const second = render("Copy", "43.69");
    await first.get("button").trigger("click");
    await flushPromises();
    expect(first.get("button").classes()).toContain("is-copied");
    expect(second.get("button").classes()).not.toContain("is-copied");
    await vi.advanceTimersByTimeAsync(2999);
    expect(first.get("button").classes()).toContain("is-copied");
    await vi.advanceTimersByTimeAsync(1);
    expect(first.get("button").classes()).not.toContain("is-copied");
    expect(first.get("button").text()).toBe("Copy address");
    expect(first.find("svg rect").exists()).toBe(true);
    expect(first.find(".copy-check").exists()).toBe(false);
    expect(first.get('[role="status"]').text()).toBe("");
  });

  it("shows the canonical manual fallback without copied styling on rejection", async () => {
    writeText.mockRejectedValueOnce(new Error("Denied"));
    const wrapper = render();
    await wrapper.get("button").trigger("click");
    await flushPromises();
    expect(wrapper.get("button").classes()).not.toContain("is-copied");
    expect(wrapper.find(".copy-check").exists()).toBe(false);
    expect(wrapper.get("button").text()).toBe("Copy address");
    expect(wrapper.get(".copy-fallback label").text()).toBe("Copy manually");
    expect(wrapper.get("input").element.value).toBe(address);
    expect(wrapper.get('[role="status"]').text()).toBe(
      "Copy unavailable. Select and copy the value below.",
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
