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
      <span aria-hidden="true">▢</span>
      {{ feedback === "Copied" ? "Copied" : label }}
</button
    ><span class="sr-only" role="status">{{ feedback }}</span>
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
