<script setup lang="ts">
import { formatFiat } from "../domain/money";
defineProps<{ amount?: string; locale: string; currency?: string }>();
</script>
<template>
  <section class="order-summary" aria-label="Order total">
    <div class="eyebrow">Total to pay</div>
    <h1 v-if="amount !== undefined && currency" data-testid="fiat-total">
      {{ formatFiat(amount, locale, currency) }}
    </h1>
    <div
      v-else
      class="skeleton amount-skeleton"
      role="status"
      aria-label="Loading order total"
    ></div>
  </section>
</template>
