<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { MerchantInfo } from "../infrastructure/responseSchemas";
const { t } = useI18n({ useScope: "global" });
const props = defineProps<{ merchant?: MerchantInfo | null }>();
const name = computed(
  () => props.merchant?.name.trim() || t("merchant.fallbackName"),
);
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

<style lang="scss">
@use "../../../styles/checkout-shared" as shared;

@include shared.merchant-brand;

.merchant-icon {
  object-fit: contain;
}
</style>
