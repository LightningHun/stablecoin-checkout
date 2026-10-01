<script setup lang="ts">
import type { Payment } from "../domain/paymentModel";
defineProps<{ payment: Payment; busy: boolean }>();
const emit = defineEmits<{ requote: [] }>();
</script>
<template>
  <div class="recovery">
    <strong>△ This quote expired</strong>
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
