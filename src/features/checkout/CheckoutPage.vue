<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { usePaymentController } from "./application/usePaymentController";
import type { Pair } from "./domain/paymentModel";
import OrderSummary from "./components/OrderSummary.vue";
import AssetNetworkSelector from "./components/AssetNetworkSelector.vue";
import QuoteDetails from "./components/QuoteDetails.vue";
import PaymentProgress from "./components/PaymentProgress.vue";
import RecoveryPanel from "./components/RecoveryPanel.vue";
import NetworkBadge from "./components/NetworkBadge.vue";
import DemoControls from "./components/DemoControls.vue";
const controller = usePaymentController();
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
const reload = () => window.location.reload();
const locale =
  new URLSearchParams(location.search).get("locale") ||
  navigator.language ||
  "en-IE";
const merchant = computed(
  () => payment.value?.merchant.name ?? "Payment Project",
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
  await nextTick();
  focusTarget.value?.focus();
}
async function select(pair: Pair) {
  if (payment.value) {
    selecting.value = false;
    await controller.select(pair);
    await nextTick();
    focusTarget.value?.focus();
  } else await controller.select(pair);
}
onMounted(() => void controller.initialize());
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
      @click="controller.retry"
    >
      Retry now
    </button>
  </div>
  <main class="checkout" data-testid="checkout">
    <OrderSummary
      :amount="payment?.order.amount ?? '149.90'"
      :locale="locale"
    />
    <section class="step" :class="{ done: !selecting, active: selecting }">
      <span class="step-marker" aria-hidden="true">{{
        selecting ? "1" : "✓"
      }}</span>
      <div class="step-heading">
        <h2>Pay with</h2>
        <button
          v-if="!selecting && payment && canChange"
          class="text-button"
          data-testid="change"
          @click="selecting = true"
        >
          Change
        </button>
      </div>
      <AssetNetworkSelector
        v-if="selecting"
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
        active: !selecting && activeSend,
        done: funds && !activeSend,
        inactive: selecting,
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
      <p v-if="selecting" class="muted">
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
        @requote="controller.requote"
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
        ><span class="mono transaction">{{ payment.tx_hash }}</span>
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
        :payment="selecting ? null : payment"
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
    <DemoControls v-if="showDemo" @refresh="controller.retry" @reset="reload" />
  </main>
</template>
