<script setup lang="ts">
import type { Payment } from "../domain/paymentModel";
defineProps<{ mobile?: boolean; payment: Payment; busy: boolean }>();
const emit = defineEmits<{ requote: [] }>();
</script>
<template>
  <div class="recovery" :class="{ mobile }">
    <strong class="recovery-heading">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3.5l9.5 17H2.5L12 3.5z" />
        <path d="M12 10v5" />
        <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
      </svg>
      This quote expired
    </strong>
    <p class="muted">
      The fixed rate ended. Do not use the previous transfer instructions.
    </p>
    <div class="recovery-grid">
      <section class="recovery-card">
        <strong>Haven't sent anything yet?</strong>
        <p>
          The amount may differ from {{ payment.quote.total_due }}
          {{ payment.quote.crypto_currency }}.
        </p>
        <button
          data-testid="requote"
          class="primary"
          :disabled="busy"
          @click="emit('requote')"
        >
          {{ busy ? "Checking payment…" : "Get a new quote" }}
        </button>
      </section>
      <section class="recovery-card">
        <strong>Already sent it?</strong>
        <p>
          Don't send again. Keep your payment reference and ask the merchant for
          assistance. Automatic monitoring has stopped.
        </p>
      </section>
    </div>
  </div>
</template>

<style lang="scss">
@use "../../../styles/checkout-shared" as shared;

:where(.recovery) {
  @include shared.recovery-heading;
}

.recovery-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.recovery-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 13px;

  p {
    margin: 8px 0 12px;
    color: #555;
  }

  .primary {
    padding: 11px 16px;
  }
}

:where(.recovery.mobile) {
  .recovery-grid {
    grid-template-columns: 1fr;
  }
}
</style>
