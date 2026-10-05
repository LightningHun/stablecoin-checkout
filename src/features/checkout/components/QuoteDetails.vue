<script setup lang="ts">
import { computed, ref, watch } from "vue";
import * as QRCode from "./paymentQr";
import type { Payment } from "../domain/paymentModel";
import { transferAmount } from "../domain/quotePolicy";
import NetworkBadge from "./NetworkBadge.vue";
import CopyButton from "./CopyButton.vue";
import { formatHourMinute } from "./formatTime";
const props = defineProps<{ payment: Payment; remaining: number }>();
const qr = ref("");
const quote = computed(() => props.payment.quote);
const amount = computed(() => transferAmount(props.payment));
const address = computed(() =>
  props.payment.status === "underpaid"
    ? props.payment.crypto_address
    : quote.value.crypto_address,
);
const addressGroups = computed(() => address.value.match(/.{1,4}/g) ?? []);
watch(
  [address, () => quote.value.crypto_currency],
  async ([value, currency], _, cleanup) => {
    let valid = true;
    cleanup(() => {
      valid = false;
    });
    qr.value = "";
    const image = await QRCode.toDataURL(value, {
      width: 400,
      currency,
    });
    if (valid) qr.value = image;
  },
  { immediate: true },
);
const countdown = computed(() => {
  const seconds = Math.max(0, Math.ceil(props.remaining / 1000));
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
      {{ quote.exchange_rate }} {{ payment.order.currency }}
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
        <p data-testid="transfer-address" class="address mono">
          <span
            v-for="(group, index) in addressGroups"
            :key="index"
            class="address-group"
            >{{ group }}</span
          >
        </p>
        <p class="small muted">
          Compare every character with your wallet, not just the ends.
        </p>
        <CopyButton
          :value="address"
          label="Copy address"
          testid="copy-address"
        />
      </div>
    </div>
    <div
      v-if="payment.status === 'awaiting_payment' || payment.status === 'underpaid'"
      class="deadline"
    >
      <span
        >Rate locked ·
        <strong class="mono" data-testid="countdown">{{ countdown }}</strong>
        left</span
      ><span class="muted"
        >Expires
        {{ formatHourMinute(quote.expires_at) }}</span
      >
      <div class="time-rule"></div>
    </div>
  </div>
</template>

<style lang="scss">
@use "../../../styles/checkout-shared" as shared;

:where(.quote-details) {
  @include shared.network-warning;
  @include shared.address-panel;
  @include shared.recovery-heading;
}

.amount-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.transfer-value {
  font-size: 14px;
}
.transfer-value strong {
  font-size: 34px;
  line-height: 1.4;
  font-weight: 500;
  letter-spacing: -1px;
  overflow-wrap: anywhere;
}
.quote-fee {
  font-size: 12px;
  margin: 14px 0 16px;
}
.qr {
  width: 160px;
  height: 160px;
  flex: none;
  image-rendering: auto;
}
.address-info {
  min-width: 0;
  flex: 1;
}
.network-label.eyebrow {
  color: var(--accent);
  font-weight: 600;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.6px;
}
.network-label .network-badge {
  width: 20px;
  height: 20px;
  font-size: 11px;
}
.address {
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.8;
  margin: 8px 0;
}
/* Visual grouping only: copied and encoded addresses contain no spaces. */
.address-group {
  display: inline-block;
  white-space: nowrap;
}
.address-group:not(:last-child) {
  margin-right: 1ch;
}
.address-info p.small {
  margin: 8px 0;
}
.deadline {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px;
  margin-top: 16px;
  font-size: 13px;
}
.time-rule {
  width: 100%;
  height: 2px;
  background: linear-gradient(to right, var(--ink) 96%, var(--line) 96%);
}
.quote-details > p:last-child {
  margin-bottom: 0;
}
.notice {
  font-size: 14px;
  margin-bottom: 16px;
}
.notice p {
  margin: 2px 0 0 30px;
  color: #555;
  font-size: 13px;
}
@media (max-width: 600px) {
  .qr {
    width: 180px;
    height: 180px;
    align-self: center;
  }
  .transfer-value strong {
    font-size: 30px;
  }
  .quote-fee {
    line-height: 1.6;
  }
  .deadline {
    flex-direction: column;
    gap: 3px;
  }
  .time-rule {
    margin-top: 6px;
  }
  .notice p {
    margin-left: 0;
  }
}
/* Address panels and QR images stay opaque, including their ancestors. */
.checkout.motion-ready .quote-details {
  animation: checkout-settle var(--motion-medium) var(--ease-out);
}

/* Keep display spacing while preserving the canonical amount and address strings. */
.transfer-value > span {
  margin-left: 7px;
}
.address {
  font-size: 15px;
}
</style>
