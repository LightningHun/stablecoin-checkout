<script setup lang="ts">
import { computed } from "vue";
import { parseUnits, formatUnits } from "../domain/money";
import type { Payment, RequestHealth } from "../domain/paymentModel";
import CopyButton from "./CopyButton.vue";
import TransactionLink from "./TransactionLink.vue";
const props = defineProps<{
  payment: Payment | null;
  health: RequestHealth;
  lastChecked: number | null;
}>();
const partialPercent = computed(() => {
  const p = props.payment;
  if (!p || p.status !== "underpaid") return "0%";
  const scale = p.quote.crypto_currency === "ETH" ? 18 : 6;
  return (
    formatUnits(
      (parseUnits(p.amount_received, scale) * 10000n) /
        parseUnits(p.quote.total_due, scale),
      2,
    ) + "%"
  );
});
function title() {
  const p = props.payment;
  if (!p) return "Updates by itself once your transfer is seen.";
  switch (p.status) {
    case "awaiting_payment":
      return props.health === "stale"
        ? "Connection lost — reconnecting"
        : "Waiting for your transfer";
    case "detected":
      return "Your money arrived";
    case "confirming":
      return "Confirming your transfer";
    case "paid":
      return "Paid";
    case "underpaid":
      return `Received ${p.amount_received} of ${p.quote.total_due} ${p.quote.crypto_currency}`;
    case "overpaid":
      return `Paid — with ${p.amount_excess} ${p.quote.crypto_currency} extra`;
    case "expired":
      return "Nothing received in the last verified update.";
    case "failed":
      return "Payment failed";
  }
}
</script>
<template>
  <div
    class="payment-progress"
    data-testid="payment-status"
    :data-status="payment?.status ?? 'selection'"
  >
    <div class="progress-heading">
      <span
        v-if="
          payment &&
          ['detected', 'confirming', 'paid', 'overpaid', 'failed'].includes(
            payment.status,
          )
        "
        class="confirmation-icon"
        :class="{
          failed: payment.status === 'failed',
          large: ['paid', 'overpaid', 'failed'].includes(payment.status),
        }"
        aria-hidden="true"
        >{{ payment.status === "failed" ? "×" : "✓" }}</span
      >
      <strong
        role="status"
        :class="{
          result:
            payment && ['paid', 'overpaid', 'failed'].includes(payment.status),
        }"
        >{{ title() }}</strong
      ><span
        v-if="
          payment &&
          (payment.status === 'detected' || payment.status === 'confirming')
        "
        class="mono confirmations"
        >{{ payment.confirmations }} of
        {{ payment.required_confirmations }} confirmations</span
      >
    </div>
    <div
      v-if="payment?.status === 'underpaid'"
      class="partial-progress"
      aria-hidden="true"
    >
      <span :style="{ width: partialPercent }"></span>
    </div>
    <template v-if="payment">
      <template
        v-if="payment.status === 'detected' || payment.status === 'confirming'"
      >
        <div class="confirmation-bars" aria-hidden="true">
          <span
            v-for="n in payment.required_confirmations"
            :key="n"
            :class="{ complete: n <= payment.confirmations }"
          ></span>
        </div>
        <p>
          {{ payment.quote.network_name }} is confirming the transfer. Nothing
          to do on your side.
        </p>
        <p>♙ Your rate is locked in — this quote no longer expires.</p>
      </template>
      <p v-if="payment.status === 'awaiting_payment'" class="muted">
        {{
          health === "stale"
            ? "Current server status is unknown. If you already sent funds, do not send again."
            : "This page updates by itself — no need to refresh. Wait here after sending the transfer."
        }}
      </p>
      <p v-if="payment.status === 'underpaid'" class="muted">
        Send only the outstanding {{ payment.amount_outstanding }}
        {{ payment.quote.crypto_currency }}. Your previous payment is counted
        once; completion needs server confirmation.
      </p>
      <p v-if="payment.status === 'overpaid'">
        The order needed {{ payment.quote.total_due }}
        {{ payment.quote.crypto_currency }}. An extra
        {{ payment.amount_excess }} {{ payment.quote.crypto_currency }} was
        received. Ask {{ payment.merchant.name }} about next steps with your
        payment reference.
      </p>
      <template v-if="payment.status === 'failed'">
        <p>Reason: {{ payment.reason.replaceAll("_", " ") }}.</p>
        <p>
          Do not send again. Ask {{ payment.merchant.name }} for assistance with
          the details below. This cannot be fixed here.
        </p>
      </template>
      <dl
        v-if="
          payment.status !== 'awaiting_payment' && payment.status !== 'expired'
        "
        class="receipt"
        :class="{
          columns3:
            payment.status === 'detected' ||
            payment.status === 'confirming' ||
            payment.status === 'underpaid',
        }"
      >
        <div v-if="'amount_received' in payment">
          <dt>
            {{
              payment.status === "underpaid"
                ? "First transfer"
                : "Amount received"
            }}
          </dt>
          <dd class="mono">
            {{ payment.amount_received }} {{ payment.quote.crypto_currency }}
          </dd>
        </div>
        <div v-if="'tx_hash' in payment">
          <dt>Transaction</dt>
          <dd class="mono">
            <TransactionLink
              :hash="payment.tx_hash"
              :network="payment.quote.network"
            />
          </dd>
        </div>
        <div v-if="payment.status === 'detected'">
          <dt>Detected</dt>
          <dd>
            {{ new Date(payment.detected_at).toLocaleTimeString("en-GB") }}
          </dd>
        </div>
        <div v-if="'settled_at' in payment">
          <dt>Settled</dt>
          <dd>{{ new Date(payment.settled_at).toLocaleString("en-GB") }}</dd>
        </div>
        <template
          v-if="['paid', 'overpaid', 'failed'].includes(payment.status)"
        >
          <div>
            <dt>Order</dt>
            <dd class="mono">{{ payment.order_id }}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{{ payment.quote.network_name }}</dd>
          </div>
          <div>
            <dt>Payment reference</dt>
            <dd class="mono">{{ payment.payment_reference }}</dd>
          </div>
        </template>
      </dl>
      <CopyButton
        v-if="['paid', 'overpaid', 'failed'].includes(payment.status)"
        :value="
          payment.status === 'failed'
            ? payment.payment_reference +
              ' · ' +
              payment.quote.network_name +
              ' · ' +
              payment.reason
            : payment.payment_reference
        "
        :label="payment.status === 'failed' ? 'Copy details' : 'Copy reference'"
      />
      <p v-if="health === 'stale' && lastChecked" class="small muted">
        Last checked {{ new Date(lastChecked).toLocaleTimeString("en-GB") }}.
        Showing the last verified payment facts.
      </p>
    </template>
  </div>
</template>
