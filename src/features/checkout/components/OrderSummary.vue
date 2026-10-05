<script setup lang="ts">
import { formatFiat } from "../domain/money";
defineProps<{
  amount?: string;
  locale: string;
  currency?: string;
  unavailable?: boolean;
}>();
</script>
<template>
  <section class="order-summary" aria-label="Order total">
    <div class="eyebrow">Total to pay</div>
    <h1 v-if="amount !== undefined && currency" data-testid="fiat-total">
      {{ formatFiat(amount, locale, currency) }}
    </h1>
    <p v-else-if="unavailable" class="muted" role="status">
      Order total unavailable.
    </p>
    <div
      v-else
      class="skeleton amount-skeleton"
      role="status"
      aria-label="Loading order total"
    ></div>
  </section>
</template>

<style lang="scss">
@use "../../../styles/checkout-shared" as shared;

:where(.order-summary) {
  @include shared.amount-skeleton;
}

.order-summary {
  border-bottom: 1px solid var(--line);
  padding-bottom: 32px;
  margin-bottom: 36px;
}
.order-summary h1 {
  overflow-wrap: anywhere;
  font-size: 40px;
  letter-spacing: -1.8px;
  line-height: 1.3;
  font-weight: 600;
  margin-top: 2px;
}
@media (max-width: 600px) {
  .order-summary {
    padding-bottom: 26px;
    margin-bottom: 28px;
  }
  .order-summary h1 {
    font-size: 36px;
  }
}
</style>
