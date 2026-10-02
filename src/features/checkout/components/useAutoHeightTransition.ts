import { nextTick, onMounted, onScopeDispose, ref, watch } from "vue";

export function useAutoHeightTransition(source: () => string) {
  const element = ref<HTMLElement | null>(null);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let generation = 0;
  let observed: HTMLElement | null = null;

  function restore(list: HTMLElement) {
    list.style.removeProperty("height");
    if (!list.getAttribute("style")) list.removeAttribute("style");
    list.classList.remove("is-resizing");
  }
  function motionAllowed(list: HTMLElement) {
    if (reducedMotion?.matches) return false;
    const style = getComputedStyle(list);
    const durations = style.transitionDuration.split(",");
    return style.transitionProperty
      .split(",")
      .some(
        (property, index) =>
          ["height", "all"].includes(property.trim()) &&
          Number.parseFloat(durations[index % durations.length]!) > 0,
      );
  }

  watch(
    source,
    async () => {
      const list = element.value;
      const current = ++generation;
      if (!list) return;
      // Read before clearing a previous transition to retain its visible height.
      const before = list.offsetHeight;
      restore(list);
      if (!before || !motionAllowed(list)) return;

      await nextTick();
      if (current !== generation || element.value !== list) return;
      const after = list.offsetHeight;
      if (!after || before === after || !motionAllowed(list)) return;

      list.classList.add("is-resizing");
      list.style.height = `${before}px`;
      void list.offsetHeight; // Commit the start height before setting the target.
      list.style.height = `${after}px`;
    },
    { flush: "pre" },
  );

  function finish(event: TransitionEvent) {
    if (
      observed &&
      event.target === observed &&
      event.propertyName === "height"
    )
      restore(observed);
  }
  function reduceMotion() {
    if (!reducedMotion?.matches) return;
    ++generation;
    if (observed) restore(observed);
  }
  onMounted(() => {
    observed = element.value;
    observed?.addEventListener("transitionend", finish);
    reducedMotion?.addEventListener?.("change", reduceMotion);
  });
  onScopeDispose(() => {
    ++generation;
    observed?.removeEventListener("transitionend", finish);
    reducedMotion?.removeEventListener?.("change", reduceMotion);
    if (observed) restore(observed);
    observed = null;
  });
  return element;
}
