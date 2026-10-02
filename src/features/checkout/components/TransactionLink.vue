<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ hash: string; network: string }>();
const explorers = new Map([
  [
    "ethereum",
    {
      name: "Etherscan",
      base: "https://etherscan.io/tx/",
      suffix: "",
      pattern: /^0x[0-9a-f]{64}$/i,
    },
  ],
  [
    "polygon",
    {
      name: "PolygonScan",
      base: "https://polygonscan.com/tx/",
      suffix: "",
      pattern: /^0x[0-9a-f]{64}$/i,
    },
  ],
  [
    "tron",
    {
      name: "TRONSCAN",
      base: "https://tronscan.org/transaction/",
      suffix: "/overview",
      pattern: /^[0-9a-f]{64}$/i,
    },
  ],
  [
    "solana",
    {
      name: "Solscan",
      base: "https://solscan.io/tx/",
      suffix: "",
      pattern: /^[1-9A-HJ-NP-Za-km-z]{64,88}$/,
    },
  ],
]);
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
    :aria-label="`Transaction ${hash} on ${explorer.name} (opens in a new tab)`"
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
