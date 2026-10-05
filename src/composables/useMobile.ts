import { onScopeDispose, readonly, ref } from "vue";
import { MOBILE_MAX_WIDTH } from "../config/layout";

/** App owns the viewport listener; children receive the resulting mobile prop. */
export function useMobile() {
  const media =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`)
      : undefined;
  // Read before the first render so mobile does not start with a desktop layout.
  const mobile = ref(media?.matches ?? false);
  const update = (event: MediaQueryListEvent) => {
    mobile.value = event.matches;
  };
  media?.addEventListener("change", update);
  onScopeDispose(() => media?.removeEventListener("change", update));
  return readonly(mobile);
}
