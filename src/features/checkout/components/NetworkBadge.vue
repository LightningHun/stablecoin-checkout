<script setup lang="ts">
defineProps<{ network: string }>();
</script>
<template>
  <span class="network-badge" :class="network" aria-hidden="true">{{
    network.slice(0, 1).toUpperCase()
  }}</span>
</template>
