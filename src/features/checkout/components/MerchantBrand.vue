<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { MerchantInfo } from "../infrastructure/responseSchemas";
const props = defineProps<{ merchant?: MerchantInfo | null }>();
const name = computed(() => props.merchant?.name.trim() || "Merchant");
const initial = computed(() => [...name.value][0]);
const failed = ref(false);
const icon = computed(() => {
  const value = props.merchant?.icon_url || props.merchant?.logo_url;
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
});
watch(icon, () => {
  failed.value = false;
});
</script>
<template>
  <div class="merchant">
    <img
      v-if="icon && !failed"
      :src="icon"
      class="merchant-mark merchant-icon"
      alt=""
      @error="failed = true"
    />
    <span v-else class="merchant-mark" aria-hidden="true">{{ initial }}</span>
    <span>{{ name }}</span>
  </div>
</template>
<style scoped>
.merchant-icon {
  object-fit: contain;
}
</style>
