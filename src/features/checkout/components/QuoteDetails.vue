<script setup lang="ts">
import { computed, ref, watch } from "vue";
import QRCode from "qrcode";
import type { Payment } from "../domain/paymentModel";
import { transferAmount } from "../domain/quotePolicy";
import NetworkBadge from "./NetworkBadge.vue";
import CopyButton from "./CopyButton.vue";
const props = defineProps<{ payment: Payment; remaining: number }>();
const qr = ref("");
const quote = computed(() => props.payment.quote);
const amount = computed(() => transferAmount(props.payment));
const address = computed(() =>
  props.payment.status === "underpaid"
    ? props.payment.crypto_address
    : quote.value.crypto_address,
);
watch(
  address,
  async (value, _, cleanup) => {
    let valid = true;
    cleanup(() => {
      valid = false;
    });
    qr.value = "";
    const image = await QRCode.toDataURL(value, {
      width: 200,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    if (valid) qr.value = image;
  },
  { immediate: true },
);
const countdown = computed(() => {
  const seconds = Math.ceil(props.remaining / 1000);
  return (
    Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0") +
    ":" +
    (seconds % 60).toString().padStart(2, "0")
  );
});
</script>
<template>
  <div class="quote-details">
    <div v-if="payment.status === 'underpaid'" class="notice">
      <strong
        >△ Your transfer was {{ payment.amount_outstanding }}
        {{ quote.crypto_currency }} short</strong
      >
      <p>
        {{ payment.amount_received }} of {{ quote.total_due }}
        {{ quote.crypto_currency }} arrived. Send only the rest to the same
        address on the same network. Wait for server confirmation.
      </p>
    </div>
    <div class="network-warning" :class="quote.network">
      <NetworkBadge :network="quote.network" />
      <div>
        <strong>{{ quote.network_name }} network only</strong>
        <div>
          {{ quote.crypto_currency }} sent on another network may be lost.
        </div>
      </div>
    </div>
    <div class="amount-row">
      <div>
        <div class="eyebrow">
          {{
            payment.status === "underpaid"
              ? "Send the remaining"
              : "Send exactly"
          }}
        </div>
        <div class="transfer-value" data-testid="transfer-amount">
          <strong class="mono">{{ amount }}</strong>
          <span class="mono">{{ quote.crypto_currency }}</span>
        </div>
      </div>
      <CopyButton :value="amount" label="Copy" testid="copy-amount" />
    </div>
    <p v-if="payment.status !== 'underpaid'" class="muted quote-fee">
      Amount {{ quote.crypto_amount }} + {{ quote.network_fee }}
      {{ quote.crypto_currency }} network fee · 1 {{ quote.crypto_currency }} =
      €{{ quote.exchange_rate }}
    </p>
    <div class="address-panel" data-testid="address-panel">
      <img
        v-if="qr"
        :src="qr"
        data-testid="transfer-qr"
        class="qr"
        alt="Payment address QR code"
        width="160"
        height="160"
      />
      <div class="address-info">
        <div class="eyebrow network-label" :class="quote.network">
          <NetworkBadge :network="quote.network" />
          {{ quote.network_name }} address
        </div>
        <p data-testid="transfer-address" class="address mono">{{ address }}</p>
        <p class="small muted">
          Compare every character with your wallet, not just the ends. QR
          contains the address only; check amount and network.
        </p>
        <CopyButton
          :value="address"
          label="Copy address"
          testid="copy-address"
        />
      </div>
    </div>
    <div v-if="payment.status === 'awaiting_payment'" class="deadline">
      <span
        >Rate locked ·
        <strong class="mono" data-testid="countdown">{{ countdown }}</strong>
        left</span
      ><span class="muted"
        >Expires
        {{
          new Date(quote.expires_at).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })
        }}</span
      >
      <div class="time-rule"></div>
    </div>
    <p v-else class="muted">
      No countdown: your first transfer already arrived, so the original quote
      no longer expires.
    </p>
  </div>
</template>
