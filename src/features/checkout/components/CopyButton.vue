<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from "vue";
const props = defineProps<{ value: string; label: string; testid?: string }>();
const feedback = ref(""),
  fallback = ref(false);
const copied = computed(() => feedback.value === "Copied");
const button = ref<HTMLButtonElement | null>(null);
const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
let widthGeneration = 0;

function clearWidth(element: HTMLButtonElement) {
  element.style.removeProperty("width");
  if (!element.getAttribute("style")) element.removeAttribute("style");
}
function widthMotionAllowed(element: HTMLButtonElement) {
  if (reducedMotion?.matches) return false;
  const style = getComputedStyle(element);
  const durations = style.transitionDuration.split(",");
  return style.transitionProperty
    .split(",")
    .some(
      (property, index) =>
        ["width", "all"].includes(property.trim()) &&
        Number.parseFloat(durations[index % durations.length]!) > 0,
    );
}
watch(
  copied,
  async () => {
    const element = button.value;
    const current = ++widthGeneration;
    if (!element) return;
    const before = element.offsetWidth;
    clearWidth(element);
    if (!before || !widthMotionAllowed(element)) return;

    await nextTick();
    if (current !== widthGeneration || button.value !== element) return;
    const after = element.offsetWidth;
    if (!after || before === after || !widthMotionAllowed(element)) return;

    element.style.width = `${before}px`;
    void element.offsetWidth; // Commit the old width before the CSS transition.
    element.style.width = `${after}px`;
  },
  { flush: "pre" },
);
function finishWidth(event: TransitionEvent) {
  if (
    button.value &&
    event.target === button.value &&
    event.propertyName === "width"
  )
    clearWidth(button.value);
}
function cancelWidth() {
  ++widthGeneration;
  if (button.value) clearWidth(button.value);
}
function reduceMotion() {
  if (reducedMotion?.matches) cancelWidth();
}
onMounted(() => reducedMotion?.addEventListener?.("change", reduceMotion));
onScopeDispose(() => {
  cancelWidth();
  reducedMotion?.removeEventListener?.("change", reduceMotion);
});

let resetTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
function cancelFeedback() {
  generation += 1;
  if (resetTimer !== undefined) {
    clearTimeout(resetTimer);
    resetTimer = undefined;
  }
}
function resetFeedback() {
  cancelFeedback();
  feedback.value = "";
  fallback.value = false;
}
watch(() => props.value, resetFeedback, { flush: "sync" });
onScopeDispose(cancelFeedback);

async function copy() {
  resetFeedback();
  const request = generation;
  try {
    await navigator.clipboard.writeText(props.value);
    if (request !== generation) return;
    feedback.value = "Copied";
    resetTimer = setTimeout(() => {
      feedback.value = "";
      resetTimer = undefined;
    }, 3000);
  } catch {
    if (request !== generation) return;
    fallback.value = true;
    feedback.value = "Copy unavailable. Select and copy the value below.";
  }
}
</script>
<template>
  <div class="copy-control">
    <button
      ref="button"
      class="secondary"
      :class="{ 'is-copied': copied }"
      :data-testid="testid"
      @click="copy"
      @transitionend="finishWidth"
    >
      <svg
        v-if="copied"
        class="copy-icon copy-check"
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="m5 12 4 4L19 6" />
      </svg>
      <svg
        v-else
        class="copy-icon"
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </svg>
      <span :key="copied ? 'copied' : 'label'" class="copy-label">{{
        copied ? "Copied" : label
      }}</span>
    </button>
    <span class="sr-only" role="status">{{ feedback }}</span>
    <div v-if="fallback" class="copy-fallback">
      <label
        >Copy manually<input
          :value="value"
          readonly
          @focus="($event.target as HTMLInputElement).select()"
      /></label>
    </div>
  </div>
</template>
