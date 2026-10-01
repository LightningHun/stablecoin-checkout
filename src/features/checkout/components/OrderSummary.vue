<script setup lang="ts">
import { formatFiat } from "../domain/money";
defineProps<{ amount: string; locale: string }>();
</script>
<template>
  <section class="order-summary" aria-label="Order total">
    <div class="eyebrow">Total to pay</div>
    <h1 data-testid="fiat-total">{{ formatFiat(amount, locale) }}</h1>
  </section>
</template>
