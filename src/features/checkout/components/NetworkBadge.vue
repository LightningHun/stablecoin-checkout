<script setup lang="ts">
defineProps<{ network: string }>();
</script>
<template>
  <span class="network-badge" :class="network" aria-hidden="true">{{
    network.slice(0, 1).toUpperCase()
  }}</span>
</template>

<style lang="scss">
.network-badge {
  display: inline-grid;
  place-items: center;
  flex: none;
  background: var(--accent);
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 3px;
  font: 600 13px var(--mono);
}
</style>
