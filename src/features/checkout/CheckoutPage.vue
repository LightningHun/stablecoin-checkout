<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { usePaymentController } from "./application/usePaymentController";
import type { RestoreResult } from "./application/usePaymentController";
import {
  loadReference,
  saveReference,
  clearReference,
} from "./infrastructure/paymentStorage";
import type { Pair } from "./domain/paymentModel";
import OrderSummary from "./components/OrderSummary.vue";
import AssetNetworkSelector from "./components/AssetNetworkSelector.vue";
import QuoteDetails from "./components/QuoteDetails.vue";
import PaymentProgress from "./components/PaymentProgress.vue";
import RecoveryPanel from "./components/RecoveryPanel.vue";
import NetworkBadge from "./components/NetworkBadge.vue";
import DemoControls from "./components/DemoControls.vue";
import TransactionLink from "./components/TransactionLink.vue";
const storedReference = loadReference();
const restorePending = ref(storedReference !== null);
const controller = usePaymentController();
const restoringPayment = computed(
  () => restorePending.value || controller.restoring.value,
);
let resetting = false;
const {
  payment,
  currencies,
  health,
  error,
  busy,
  draft,
  remaining,
  availability,
  canChange,
  lastChecked,
  uncertain,
} = controller;
const selecting = ref(true),
  focusTarget = ref<HTMLElement | null>(null);
const showDemo = new URLSearchParams(location.search).has("demo");
function resetDemo() {
  resetting = true;
  controller.dispose();
  clearReference();
  window.location.reload();
}
const locale =
  new URLSearchParams(location.search).get("locale") ||
  navigator.language ||
  "en-IE";
const merchant = computed(
  () => payment.value?.merchant.name ?? "Payment Project",
);
const selectionVisible = computed(
  () => !restoringPayment.value && selecting.value && canChange.value,
);
const selectedNetwork = computed(() =>
  currencies.value
    .find((c) => c.code === draft.value.currency)
    ?.networks.find((n) => n.id === draft.value.network),
);
const displayedPair = computed(() =>
  busy.value
    ? draft.value
    : {
        currency: payment.value?.quote.crypto_currency ?? draft.value.currency,
        network: payment.value?.quote.network ?? draft.value.network,
      },
);
const displayedNetwork = computed(() =>
  busy.value
    ? selectedNetwork.value?.name
    : (payment.value?.quote.network_name ?? selectedNetwork.value?.name),
);
const funds = computed(
  () => payment.value && "amount_received" in payment.value,
);
const result = computed(
  () =>
    payment.value &&
    ["paid", "overpaid", "failed"].includes(payment.value.status),
);
const activeSend = computed(
  () =>
    busy.value ||
    availability.value === "usable" ||
    availability.value === "local-deadline-reached" ||
    payment.value?.status === "expired",
);
async function start() {
  selecting.value = false;
  await controller.create();
  persistReference();
  await nextTick();
  focusTarget.value?.focus();
}
function select(pair: Pair) {
  if (!canChange.value) return;
  draft.value = pair;
}
function persistReference() {
  if (!resetting && payment.value && !controller.referenceMissing.value)
    saveReference(payment.value.payment_reference);
}
function finishRestore(outcome: RestoreResult | void) {
  if (resetting) return;
  if (outcome === "restored") {
    selecting.value = false;
    restorePending.value = false;
    persistReference();
  } else if (outcome === "not-found") {
    clearReference();
    selecting.value = true;
    restorePending.value = false;
  }
}
async function retry() {
  finishRestore(await controller.retry());
}
async function requote() {
  await controller.requote();
  persistReference();
}
watch(controller.referenceMissing, (missing) => {
  if (missing) clearReference();
});
onMounted(async () => {
  const initialized = controller.initialize();
  if (storedReference) finishRestore(await controller.restore(storedReference));
  else await initialized;
});
</script>
<template>
  <header class="merchant-header">
    <div class="merchant">
      <span class="merchant-mark" aria-hidden="true">{{
        merchant.slice(0, 1)
      }}</span
      ><span>{{ merchant }}</span>
    </div>
    <span class="order-reference mono"
      >Order {{ payment?.order_id ?? "ORD-88213" }}</span
    >
  </header>
  <div v-if="error" class="connection-banner" role="alert">
    <span
      ><strong>Can't reach a verified payment update.</strong> {{ error }}
      <span v-if="payment"
        >Last known state: {{ payment.status.replaceAll("_", " ") }}.</span
      ></span
    ><button
      v-if="!uncertain"
      data-testid="retry"
      :disabled="busy"
      @click="retry"
    >
      Retry now
    </button>
  </div>
  <main class="checkout" data-testid="checkout">
    <OrderSummary
      :amount="payment?.order.amount ?? '149.90'"
      :locale="locale"
    />
    <section
      class="step"
      :class="{
        done: !selectionVisible && !restoringPayment,
        active: selectionVisible || restoringPayment,
      }"
    >
      <span class="step-marker" aria-hidden="true">{{
        selectionVisible || restoringPayment ? "1" : "✓"
      }}</span>
      <div class="step-heading">
        <h2>Pay with</h2>
        <button
          v-if="!selectionVisible && payment && canChange"
          class="text-button"
          data-testid="change"
          @click="selecting = true"
        >
          Change
        </button>
      </div>
      <p v-if="restoringPayment" class="muted">
        Checking for an existing payment…
      </p>
      <AssetNetworkSelector
        v-else-if="selectionVisible"
        :currencies="currencies"
        :pair="draft"
        :disabled="busy || health === 'loading'"
        @select="select"
        @continue="start"
      />
      <div v-else class="selected-pair" data-testid="selected-network">
        <NetworkBadge :network="displayedPair.network" /><span
          >{{ displayedPair.currency }} on {{ displayedNetwork }}</span
        >
      </div>
    </section>
    <section
      ref="focusTarget"
      tabindex="-1"
      class="step send-step"
      :class="{
        active: !selectionVisible && activeSend,
        done: funds && !activeSend,
        inactive: selectionVisible,
      }"
    >
      <span class="step-marker" aria-hidden="true">{{
        funds && !activeSend ? "✓" : "2"
      }}</span>
      <div class="step-heading">
        <h2>Send the exact amount</h2>
        <span
          v-if="
            payment?.status === 'underpaid' || payment?.status === 'expired'
          "
          class="action-label"
          >Action needed</span
        >
      </div>
      <p v-if="restoringPayment" class="muted">
        Checking for an existing payment…
      </p>
      <p v-else-if="selectionVisible" class="muted">
        Amount, address and QR code appear after you choose a network.
      </p>
      <div v-else-if="busy" class="loading-quote" data-testid="quote-loading">
        <div class="network-warning" :class="draft.network">
          <NetworkBadge :network="draft.network" />
          <div>
            <strong>{{ selectedNetwork?.name }} network only</strong>
            <div>{{ draft.currency }} sent on another network may be lost.</div>
          </div>
        </div>
        <p role="status">
          Getting your quote for {{ draft.currency }} on
          {{ selectedNetwork?.name }}…
        </p>
        <div class="skeleton amount-skeleton"></div>
        <div class="skeleton line-skeleton"></div>
        <div class="address-panel skeleton-panel">
          <div class="skeleton qr-skeleton"></div>
          <div class="skeleton-details">
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton"></div>
            <div class="skeleton button-skeleton"></div>
          </div>
        </div>
        <p class="muted loading-note">
          Do not send anything until the amount and address appear.
        </p>
      </div>
      <QuoteDetails
        v-else-if="payment && availability === 'usable'"
        :payment="payment"
        :remaining="remaining"
      />
      <RecoveryPanel
        v-else-if="payment?.status === 'expired'"
        :payment="payment"
        :busy="busy"
        @requote="requote"
      />
      <p v-else-if="payment?.status === 'awaiting_payment'" role="status">
        Quote time ended or transfer details are unavailable. Checking payment
        status before you can continue. If already sent, do not send again.
      </p>
      <div
        v-else-if="payment && 'amount_received' in payment"
        class="received-summary"
      >
        <span
          ><span class="mono"
            >{{ payment.amount_received }}
            {{ payment.quote.crypto_currency }}</span
          >
          received</span
        ><TransactionLink
          class="transaction"
          :hash="payment.tx_hash"
          :network="payment.quote.network"
        />
      </div>
      <p v-else-if="payment?.status === 'failed'" class="muted">
        Transfer details were not supplied. Keep your payment reference.
      </p>
      <p v-else class="muted">
        The quote is unavailable. No transfer instructions can be shown.
      </p>
    </section>
    <section
      class="step confirmation-step"
      :class="{
        active: funds || result,
        inactive: !funds && !result,
        done: result,
      }"
    >
      <span class="step-marker" aria-hidden="true">{{
        result
          ? payment?.status === "failed"
            ? "×"
            : "✓"
          : payment?.status === "underpaid"
            ? "!"
            : "3"
      }}</span>
      <div class="step-heading">
        <h2>Confirmation</h2>
        <span v-if="payment?.status === 'failed'" class="action-label outline"
          >Can't be fixed here</span
        >
      </div>
      <PaymentProgress
        :payment="selectionVisible ? null : payment"
        :health="health"
        :last-checked="lastChecked"
      />
    </section>
    <footer class="checkout-footer">
      <span>{{
        payment ? "Reference " + payment.payment_reference : "Order ORD-88213"
      }}</span
      ><span>Demo checkout · no real funds</span>
    </footer>
    <DemoControls v-if="showDemo" @refresh="retry" @reset="resetDemo" />
  </main>
</template>
