<script setup lang="ts">
import { onScopeDispose, ref, watch } from "vue";
const props = defineProps<{ value: string; label: string; testid?: string }>();
const feedback = ref(""),
  fallback = ref(false);
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
    <button class="secondary" :data-testid="testid" @click="copy">
      <svg
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
      {{ feedback === "Copied" ? "Copied" : label }}
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
