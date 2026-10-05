<script setup lang="ts">
import { computed, ref } from "vue";
import { parseUnits, formatUnits } from "../domain/money";
import { isResult, isTerminal } from "../domain/paymentModel";
import type { Payment, RequestHealth } from "../domain/paymentModel";
import CopyButton from "./CopyButton.vue";
import TransactionLink from "./TransactionLink.vue";
import { formatClockTime, formatHourMinute } from "./formatTime";
const props = defineProps<{
  mobile?: boolean;
  payment: Payment | null;
  health: RequestHealth;
  decimals?: number;
  canSendRemaining?: boolean;
  quoteExpired?: boolean;
  lastChecked: number | null;
  connectionIssue?: boolean;
  retryScheduled?: boolean;
  reveal?: { active: boolean; previous: Payment } | null;
}>();
const expiredUnderpayment = computed(() =>
  props.quoteExpired && props.payment?.status === "underpaid"
    ? props.payment
    : null,
);
const ghostRemoved = ref(false);
const revealActive = computed(
  () =>
    props.reveal?.active &&
    props.payment?.status === "paid" &&
    props.reveal.previous.payment_reference ===
      props.payment.payment_reference &&
    !isTerminal(props.reveal.previous.status) &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
);
const ghost = computed(() => {
  const previous = props.reveal?.previous;
  return revealActive.value &&
    !ghostRemoved.value &&
    previous &&
    (previous.status === "detected" || previous.status === "confirming")
    ? previous
    : null;
});
function finishGhost(event: AnimationEvent) {
  // Segment animations bubble too; only the overlay's fade removes it.
  if (
    event.target === event.currentTarget &&
    event.animationName === "paid-ghost-out"
  )
    ghostRemoved.value = true;
}
const partialPercent = computed(() => {
  const p = props.payment;
  if (!p || p.status !== "underpaid" || props.decimals === undefined)
    return "0%";
  const scale = props.decimals;
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
        ? props.connectionIssue && props.retryScheduled
          ? "Connection lost — reconnecting"
          : "Connection lost"
        : "Waiting for your transfer";
    case "detected":
      return "Your money arrived";
    case "confirming":
      return "Confirming your transfer";
    case "paid":
      return "Paid";
    case "underpaid":
      return expiredUnderpayment.value
        ? "Payment incomplete"
        : `Received ${p.amount_received} of ${p.quote.total_due} ${p.quote.crypto_currency}`;
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
    :class="{
      mobile,
      'paid-reveal-content': revealActive,
      'underpaid-incomplete': expiredUnderpayment,
    }"
    data-testid="payment-status"
    :data-status="payment?.status ?? 'selection'"
  >
    <div
      v-if="ghost"
      class="paid-confirmation-ghost"
      aria-hidden="true"
      @animationend="finishGhost"
    >
      <div class="paid-ghost-heading">
        <span class="paid-ghost-icon">✓</span>
        <strong>{{
          ghost.status === "detected"
            ? "Your money arrived"
            : "Confirming your transfer"
        }}</strong>
        <span class="mono paid-ghost-count"
          >{{ ghost.required_confirmations }} of
          {{ ghost.required_confirmations }} confirmations</span
        >
      </div>
      <div class="paid-ghost-bars">
        <span
          v-for="n in ghost.required_confirmations"
          :key="n"
          :class="{ 'paid-ghost-complete': n <= ghost.confirmations }"
        ></span>
      </div>
      <p>
        {{ ghost.quote.network_name }} is confirming the transfer. Nothing to do
        on your side.
      </p>
      <p>♙ Your rate is locked in — this quote no longer expires.</p>
    </div>
    <div class="progress-heading">
      <span
        v-if="expiredUnderpayment"
        class="confirmation-icon large failed incomplete-warning"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3.5l9.5 17H2.5L12 3.5z" />
          <path d="M12 10v5" />
          <circle cx="12" cy="18" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span
        v-if="connectionIssue && payment?.status === 'awaiting_payment'"
        class="connection-dot"
        aria-hidden="true"
      ></span>
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
          large: isResult(payment.status),
        }"
        aria-hidden="true"
        >{{ payment.status === "failed" ? "×" : "✓" }}</span
      >
      <strong
        role="status"
        :class="{
          result: expiredUnderpayment || (payment && isResult(payment.status)),
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
    <p
      v-if="expiredUnderpayment"
      class="incomplete-subtitle"
      data-testid="incomplete-subtitle"
    >
      <span class="mono">{{ expiredUnderpayment.amount_received }}</span> of
      <span class="mono"
        >{{ expiredUnderpayment.quote.total_due }}
        {{ expiredUnderpayment.quote.crypto_currency }}</span
      >
      received · the rate for the rest expired at
      <time :datetime="expiredUnderpayment.quote.expires_at">{{
        formatHourMinute(expiredUnderpayment.quote.expires_at)
      }}</time>
    </p>
    <div
      v-if="payment?.status === 'underpaid' && !expiredUnderpayment"
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
      <p
        v-if="payment.status === 'awaiting_payment' && !connectionIssue"
        class="muted"
      >
        {{
          health === "stale"
            ? "Current server status is unknown. If you already sent funds, do not send again."
            : "This page updates by itself — no need to refresh. Wait here after sending the transfer."
        }}
      </p>
      <p
        v-if="expiredUnderpayment"
        class="muted"
        data-testid="incomplete-description"
      >
        The remaining {{ expiredUnderpayment.amount_outstanding }}
        {{ expiredUnderpayment.quote.crypto_currency }} was not received before
        the rate expired. Do not send anything more to this address. Your
        previous payment is still recorded. Contact
        {{ expiredUnderpayment.merchant.name }} with the details below for next
        steps.
      </p>
      <p v-else-if="payment.status === 'underpaid'" class="muted">
        <template v-if="canSendRemaining">
          Send only the outstanding {{ payment.amount_outstanding }}
          {{ payment.quote.crypto_currency }}. Your previous payment is counted
          once; completion needs server confirmation.
        </template>
        <template v-else>
          Outstanding balance: {{ payment.amount_outstanding }}
          {{ payment.quote.crypto_currency }}. Your previous payment is still
          recorded; completion needs server confirmation.
        </template>
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
            (payment.status === 'underpaid' && !expiredUnderpayment),
        }"
      >
        <div v-if="'amount_received' in payment">
          <dt>
            {{
              expiredUnderpayment
                ? "Received"
                : payment.status === "underpaid"
                  ? "First transfer"
                  : "Amount received"
            }}
          </dt>
          <dd class="mono">
            {{ payment.amount_received }} {{ payment.quote.crypto_currency }}
          </dd>
        </div>
        <div v-if="expiredUnderpayment">
          <dt>Still owed</dt>
          <dd class="mono">
            {{ expiredUnderpayment.amount_outstanding }}
            {{ expiredUnderpayment.quote.crypto_currency }}
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
        <div v-if="expiredUnderpayment">
          <dt>Payment reference</dt>
          <dd class="mono">{{ expiredUnderpayment.payment_reference }}</dd>
        </div>
        <div v-if="payment.status === 'detected'">
          <dt>Detected</dt>
          <dd>{{ formatClockTime(payment.detected_at) }}</dd>
        </div>
        <div v-if="'settled_at' in payment">
          <dt>Settled</dt>
          <dd>{{ new Date(payment.settled_at).toLocaleString("en-GB") }}</dd>
        </div>
        <template v-if="isResult(payment.status)">
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
        v-if="expiredUnderpayment || isResult(payment.status)"
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
      <div v-if="connectionIssue" class="connection-support">
        <p class="muted">
          <template v-if="lastChecked !== null">
            Last checked {{ formatClockTime(lastChecked) }}.
          </template>
          Current server status is unknown. If you already sent funds, do not
          send again.
        </p>
        <p class="connection-contact">
          If this keeps up, contact {{ payment.merchant.name }} and quote your
          order ID.
        </p>
        <CopyButton
          :value="payment.order_id"
          label="Copy order ID"
          testid="copy-order-id"
        />
      </div>
      <p
        v-else-if="health === 'stale' && lastChecked !== null"
        class="small muted"
      >
        Last checked {{ formatClockTime(lastChecked) }}. Showing the last
        verified payment facts.
      </p>
    </template>
  </div>
</template>

<style lang="scss">
/* Keep keyframe names stable for finishGhost's animationend handler. */
@use "../../../styles/checkout-shared" as shared;

:where(.payment-progress) {
  @include shared.receipt;
}

.progress-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}
.confirmations {
  font-size: 13px;
  color: #444;
}
.confirmation-bars {
  display: flex;
  gap: 4px;
  margin: 16px 0;
}
.confirmation-bars span {
  height: 4px;
  border-radius: 4px;
  flex: 1;
  background: var(--line);
}
.confirmation-bars .complete {
  background: var(--ink);
}
.payment-progress p {
  font-size: 13px;
}
.result {
  font-size: 20px;
  letter-spacing: -0.4px;
}
.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  flex: none;
}
.progress-heading:has(.connection-dot) {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
}
.payment-progress .connection-support > p:first-child {
  margin-top: 8px;
}
.payment-progress[data-status="awaiting_payment"]
  .connection-support
  > p:first-child {
  margin-left: 20px;
}
.connection-support .connection-contact {
  margin-top: 24px;
}
.connection-support .copy-control {
  margin-top: 12px;
}
:where(.payment-progress.mobile) .progress-heading {
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.underpaid-incomplete .incomplete-subtitle {
  margin: 2px 0 16px 42px;
  color: #444;
}
.underpaid-incomplete .receipt {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.underpaid-incomplete .receipt > div {
  min-width: 0;
}
.underpaid-incomplete .confirmation-icon.incomplete-warning {
  border: 0;
  border-radius: 0;
  background: transparent;
}
.incomplete-warning svg {
  display: block;
}
.underpaid-incomplete:where(.mobile) .receipt {
  grid-template-columns: minmax(0, 1fr);
}
.checkout.motion-ready .payment-progress > p,
.checkout.motion-ready .confirmation-icon,
.checkout.motion-ready .confirmations,
.checkout.motion-ready .confirmation-bars,
.checkout.motion-ready .receipt {
  animation: checkout-enter var(--motion-medium) var(--ease-out);
}
.payment-progress[data-status="selection"] .progress-heading strong {
  color: var(--muted);
  font-weight: 400;
  font-size: 13px;
}

.confirmation-icon {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  flex: none;
}
.confirmation-icon.large {
  width: 32px;
  height: 32px;
  font-size: 18px;
}
.confirmation-icon.failed {
  background: white;
  border: 2px solid var(--ink);
  color: var(--ink);
}
.progress-heading:has(.confirmation-icon) {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
}
.partial-progress {
  height: 4px;
  background: var(--line);
  margin: 16px 0;
}
.partial-progress span {
  display: block;
  height: 100%;
  background: var(--ink);
}
:where(.payment-progress.mobile) .progress-heading:has(.confirmation-icon) {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
}
:where(.payment-progress.mobile) .progress-heading .confirmations {
  grid-column: 1/-1;
}

/* One-shot paid reveal. The only outgoing content is an inert confirmation ghost. */
.payment-progress {
  position: relative;
}
/* An initially paid snapshot remains static, including earlier generic entrances. */
.checkout .payment-progress[data-status="paid"] .confirmation-icon,
.checkout .payment-progress[data-status="paid"] .receipt,
.checkout .payment-progress[data-status="paid"] > p {
  animation: none;
}
.paid-confirmation-ghost {
  position: absolute;
  inset: 0 0 auto;
  pointer-events: none;
  animation: paid-ghost-out var(--paid-ghost-duration) var(--paid-ease-out)
    var(--paid-ghost-delay) both;
}
.paid-ghost-heading {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}
.paid-ghost-icon {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
}
.paid-ghost-count {
  font-size: 13px;
  color: #444;
}
.paid-ghost-bars {
  display: flex;
  gap: 4px;
  margin: 16px 0;
}
.paid-ghost-bars > span {
  position: relative;
  height: 4px;
  border-radius: 4px;
  flex: 1;
  background: var(--line);
}
.paid-ghost-bars > .paid-ghost-complete {
  background: var(--ink);
}
.paid-ghost-bars > span:not(.paid-ghost-complete)::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--ink);
  transform-origin: left;
  animation: paid-bar-fill var(--paid-bar-duration) var(--paid-ease-out) both;
}
.checkout
  .payment-progress.paid-reveal-content
  > .progress-heading
  > .confirmation-icon.large {
  position: relative;
  animation: paid-mark-in var(--paid-mark-duration) var(--paid-ease-mark)
    var(--paid-mark-delay) both;
}
.paid-reveal-content .confirmation-icon.large::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid var(--ink);
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  animation: paid-ring-out var(--paid-ring-duration) var(--paid-ease-out)
    var(--paid-ring-delay) both;
}
.checkout .payment-progress.paid-reveal-content > .progress-heading > strong {
  animation: paid-rise-in var(--paid-rise-duration) var(--paid-ease-out)
    var(--paid-title-delay) both;
}
.checkout .payment-progress.paid-reveal-content > .receipt,
.checkout .payment-progress.paid-reveal-content > p.small.muted {
  animation: paid-rise-in var(--paid-rise-duration) var(--paid-ease-out)
    var(--paid-details-delay) both;
}
.checkout .payment-progress.paid-reveal-content > .copy-control > button {
  animation: paid-rise-in var(--paid-rise-duration) var(--paid-ease-out)
    var(--paid-button-delay) both;
}
@keyframes paid-bar-fill {
  from {
    transform: scaleX(0);
  }
  99.99%,
  to {
    transform: none;
  }
}
@keyframes paid-ghost-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@keyframes paid-mark-in {
  from {
    opacity: 0;
    transform: scale(0.6);
  }
  99.99%,
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes paid-ring-out {
  from {
    opacity: 0;
    transform: scale(1);
  }
  0.01% {
    opacity: 0.6;
    transform: scale(1);
  }
  99.98% {
    opacity: 0;
    transform: scale(2.6);
  }
  99.99%,
  to {
    opacity: 0;
    transform: none;
  }
}
@keyframes paid-rise-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  99.99%,
  to {
    opacity: 1;
    transform: none;
  }
}
:where(.payment-progress.mobile) .paid-ghost-heading {
  grid-template-columns: auto minmax(0, 1fr);
}
:where(.payment-progress.mobile) .paid-ghost-count {
  grid-column: 1 / -1;
}
@media (prefers-reduced-motion: reduce) {
  .paid-confirmation-ghost,
  .paid-reveal-content .confirmation-icon.large::after {
    display: none;
  }
}
</style>
