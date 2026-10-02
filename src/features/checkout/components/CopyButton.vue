<script setup lang="ts">
import { ref } from "vue";
const props = defineProps<{ value: string; label: string; testid?: string }>();
const feedback = ref(""),
  fallback = ref(false);
async function copy() {
  try {
    await navigator.clipboard.writeText(props.value);
    feedback.value = "Copied";
    fallback.value = false;
  } catch {
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
