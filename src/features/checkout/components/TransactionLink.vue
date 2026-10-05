<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { explorers } from "../../../config/explorers";
const { t } = useI18n({ useScope: "global" });
const props = defineProps<{ hash: string; network: string }>();
const explorer = computed(() => {
  const config = explorers.get(props.network);
  if (!config || !config.pattern.test(props.hash)) return null;
  return {
    name: config.name,
    url: config.base + encodeURIComponent(props.hash) + config.suffix,
  };
});
const shortened = computed(() => `${props.hash.slice(0, 12)}…`);
</script>
<template>
  <a
    v-if="explorer"
    class="transaction-link mono"
    :href="explorer.url"
    :title="hash"
    :aria-label="
      t('transaction.explorerLabel', { hash, explorer: explorer.name })
    "
    target="_blank"
    rel="noopener noreferrer"
  >
    <span>{{ shortened }}</span>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  </a>
  <span v-else class="mono" :title="hash">{{ hash }}</span>
</template>

<style lang="scss">
.transaction-link {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  max-width: 100%;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--border);
  padding-bottom: 1px;
  white-space: nowrap;

  svg {
    flex: none;
  }

  &:hover {
    border-bottom-color: currentColor;
  }

  &:focus-visible {
    outline: 3px solid #355bea;
    outline-offset: 4px;
  }
}
</style>
