<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n({ useScope: "global" });
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
  if (!p) return t("progress.automatic");
  switch (p.status) {
    case "awaiting_payment":
      return props.health === "stale"
        ? props.connectionIssue && props.retryScheduled
          ? t("progress.reconnecting")
          : t("progress.lost")
        : t("progress.waiting");
    case "detected":
      return t("progress.detected");
    case "confirming":
      return t("progress.confirming");
    case "paid":
      return t("progress.paid");
    case "underpaid":
      return expiredUnderpayment.value
        ? t("progress.incomplete")
        : t("progress.partial", {
            received: p.amount_received,
            total: p.quote.total_due,
            currency: p.quote.crypto_currency,
          });
    case "overpaid":
      return t("progress.overpaid", {
        amount: p.amount_excess,
        currency: p.quote.crypto_currency,
      });
    case "expired":
      return t("progress.expired");
    case "failed":
      return t("progress.failed");
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
            ? t("progress.detected")
            : t("progress.confirming")
        }}</strong>
        <span class="mono paid-ghost-count">{{
          t("progress.confirmations", {
            count: ghost.required_confirmations,
            required: ghost.required_confirmations,
          })
        }}</span>
      </div>
      <div class="paid-ghost-bars">
        <span
          v-for="n in ghost.required_confirmations"
          :key="n"
          :class="{ 'paid-ghost-complete': n <= ghost.confirmations }"
        ></span>
      </div>
      <p>
        {{
          t("progress.confirmingNetwork", { network: ghost.quote.network_name })
        }}
      </p>
      <p>{{ t("progress.locked") }}</p>
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
        >{{
          t("progress.confirmations", {
            count: payment.confirmations,
            required: payment.required_confirmations,
          })
        }}</span
      >
    </div>
    <i18n-t
      v-if="expiredUnderpayment"
      keypath="progress.incompleteSubtitle"
      tag="p"
      scope="global"
      class="incomplete-subtitle"
      data-testid="incomplete-subtitle"
    >
      <template #received
        >
<span class="mono">{{
          expiredUnderpayment.amount_received
        }}</span>
</template
      >
      <template #total
        >
<span class="mono"
          >{{ expiredUnderpayment.quote.total_due }}
          {{ expiredUnderpayment.quote.crypto_currency }}</span
        >
</template
      >
      <template #time
        >
<time :datetime="expiredUnderpayment.quote.expires_at">{{
          formatHourMinute(expiredUnderpayment.quote.expires_at)
        }}</time>
</template
      >
    </i18n-t>
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
          {{
            t("progress.confirmingNetwork", {
              network: payment.quote.network_name,
            })
          }}
        </p>
        <p>{{ t("progress.locked") }}</p>
      </template>
      <p
        v-if="payment.status === 'awaiting_payment' && !connectionIssue"
        class="muted"
      >
        {{ health === "stale" ? t("progress.unknown") : t("progress.wait") }}
      </p>
      <p
        v-if="expiredUnderpayment"
        class="muted"
        data-testid="incomplete-description"
      >
        {{
          t("progress.incompleteDescription", {
            amount: expiredUnderpayment.amount_outstanding,
            currency: expiredUnderpayment.quote.crypto_currency,
            merchant: expiredUnderpayment.merchant.name,
          })
        }}
      </p>
      <p v-else-if="payment.status === 'underpaid'" class="muted">
        <template v-if="canSendRemaining">
          {{
            t("progress.sendOutstanding", {
              amount: payment.amount_outstanding,
              currency: payment.quote.crypto_currency,
            })
          }}
        </template>
        <template v-else>
          {{
            t("progress.outstanding", {
              amount: payment.amount_outstanding,
              currency: payment.quote.crypto_currency,
            })
          }}
        </template>
      </p>
      <p v-if="payment.status === 'overpaid'">
        {{
          t("progress.excessDescription", {
            total: payment.quote.total_due,
            currency: payment.quote.crypto_currency,
            excess: payment.amount_excess,
            merchant: payment.merchant.name,
          })
        }}
      </p>
      <template v-if="payment.status === 'failed'">
        <p>
          {{
            t("progress.reason", {
              reason: payment.reason.replaceAll("_", " "),
            })
          }}
        </p>
        <p>
          {{
            t("progress.failedDescription", { merchant: payment.merchant.name })
          }}
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
                ? t("receipt.received")
                : payment.status === "underpaid"
                  ? t("receipt.firstTransfer")
                  : t("receipt.amountReceived")
            }}
          </dt>
          <dd class="mono">
            {{ payment.amount_received }} {{ payment.quote.crypto_currency }}
          </dd>
        </div>
        <div v-if="expiredUnderpayment">
          <dt>{{ t("receipt.owed") }}</dt>
          <dd class="mono">
            {{ expiredUnderpayment.amount_outstanding }}
            {{ expiredUnderpayment.quote.crypto_currency }}
          </dd>
        </div>
        <div v-if="'tx_hash' in payment">
          <dt>{{ t("receipt.transaction") }}</dt>
          <dd class="mono">
            <TransactionLink
              :hash="payment.tx_hash"
              :network="payment.quote.network"
            />
          </dd>
        </div>
        <div v-if="expiredUnderpayment">
          <dt>{{ t("receipt.reference") }}</dt>
          <dd class="mono">{{ expiredUnderpayment.payment_reference }}</dd>
        </div>
        <div v-if="payment.status === 'detected'">
          <dt>{{ t("receipt.detected") }}</dt>
          <dd>{{ formatClockTime(payment.detected_at) }}</dd>
        </div>
        <div v-if="'settled_at' in payment">
          <dt>{{ t("receipt.settled") }}</dt>
          <dd>{{ new Date(payment.settled_at).toLocaleString("en-GB") }}</dd>
        </div>
        <template v-if="isResult(payment.status)">
          <div>
            <dt>{{ t("receipt.order") }}</dt>
            <dd class="mono">{{ payment.order_id }}</dd>
          </div>
          <div>
            <dt>{{ t("common.network") }}</dt>
            <dd>{{ payment.quote.network_name }}</dd>
          </div>
          <div>
            <dt>{{ t("receipt.reference") }}</dt>
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
        :label="
          payment.status === 'failed'
            ? t('common.copyDetails')
            : t('common.copyReference')
        "
      />
      <div v-if="connectionIssue" class="connection-support">
        <p class="muted">
          {{
            t("connection.support", {
              lastChecked:
                lastChecked !== null
                  ? t("connection.lastChecked", {
                      time: formatClockTime(lastChecked),
                    })
                  : "",
            })
          }}
        </p>
        <p class="connection-contact">
          {{ t("connection.contact", { merchant: payment.merchant.name }) }}
        </p>
        <CopyButton
          :value="payment.order_id"
          :label="t('common.copyOrderId')"
          testid="copy-order-id"
        />
      </div>
      <p
        v-else-if="health === 'stale' && lastChecked !== null"
        class="small muted"
      >
        {{ t("connection.stale", { time: formatClockTime(lastChecked) }) }}
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

  span {
    height: 4px;
    border-radius: 4px;
    flex: 1;
    background: var(--line);
  }

  .complete {
    background: var(--ink);
  }
}

.payment-progress {
  p {
    font-size: 13px;
  }
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

.payment-progress {
  .connection-support {
    > p:first-child {
      margin-top: 8px;
    }
  }
}

.payment-progress[data-status="awaiting_payment"] {
  .connection-support {
    > p:first-child {
      margin-left: 20px;
    }
  }
}

.connection-support {
  .connection-contact {
    margin-top: 24px;
  }

  .copy-control {
    margin-top: 12px;
  }
}

:where(.payment-progress.mobile) {
  .progress-heading {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
}

.underpaid-incomplete {
  .incomplete-subtitle {
    margin: 2px 0 16px 42px;
    color: #444;
  }

  .receipt {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > div {
      min-width: 0;
    }
  }

  .confirmation-icon.incomplete-warning {
    border: 0;
    border-radius: 0;
    background: transparent;
  }
}

.incomplete-warning {
  svg {
    display: block;
  }
}

.underpaid-incomplete:where(.mobile) {
  .receipt {
    grid-template-columns: minmax(0, 1fr);
  }
}

.checkout.motion-ready {
  .payment-progress > p,
  .confirmation-icon,
  .confirmations,
  .confirmation-bars,
  .receipt {
    animation: checkout-enter var(--motion-medium) var(--ease-out);
  }
}

.payment-progress[data-status="selection"] {
  .progress-heading {
    strong {
      color: var(--muted);
      font-weight: 400;
      font-size: 13px;
    }
  }
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

  &.large {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }

  &.failed {
    background: white;
    border: 2px solid var(--ink);
    color: var(--ink);
  }
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

  span {
    display: block;
    height: 100%;
    background: var(--ink);
  }
}

:where(.payment-progress.mobile) {
  .progress-heading {
    &:has(.confirmation-icon) {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
    }

    .confirmations {
      grid-column: 1/-1;
    }
  }
}

/* One-shot paid reveal. The only outgoing content is an inert confirmation ghost. */

.payment-progress {
  position: relative;
}
/* An initially paid snapshot remains static, including earlier generic entrances. */

.checkout {
  .payment-progress[data-status="paid"] {
    .confirmation-icon,
    .receipt,
    > p {
      animation: none;
    }
  }
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

  > span {
    position: relative;
    height: 4px;
    border-radius: 4px;
    flex: 1;
    background: var(--line);
  }

  > .paid-ghost-complete {
    background: var(--ink);
  }

  > span:not(.paid-ghost-complete)::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--ink);
    transform-origin: left;
    animation: paid-bar-fill var(--paid-bar-duration) var(--paid-ease-out) both;
  }
}

.checkout {
  .payment-progress.paid-reveal-content {
    > .progress-heading > .confirmation-icon.large {
      position: relative;
      animation: paid-mark-in var(--paid-mark-duration) var(--paid-ease-mark)
        var(--paid-mark-delay) both;
    }
  }
}

.paid-reveal-content {
  .confirmation-icon.large::after {
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
}

.checkout {
  .payment-progress.paid-reveal-content {
    > .progress-heading > strong {
      animation: paid-rise-in var(--paid-rise-duration) var(--paid-ease-out)
        var(--paid-title-delay) both;
    }

    > .receipt,
    > p.small.muted {
      animation: paid-rise-in var(--paid-rise-duration) var(--paid-ease-out)
        var(--paid-details-delay) both;
    }

    > .copy-control > button {
      animation: paid-rise-in var(--paid-rise-duration) var(--paid-ease-out)
        var(--paid-button-delay) both;
    }
  }
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

:where(.payment-progress.mobile) {
  .paid-ghost-heading {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .paid-ghost-count {
    grid-column: 1 / -1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .paid-confirmation-ghost,
  .paid-reveal-content .confirmation-icon.large::after {
    display: none;
  }
}
</style>
