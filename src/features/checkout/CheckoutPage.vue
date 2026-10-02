<script setup lang="ts">
import {
  computed,
  effectScope,
  nextTick,
  onMounted,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
} from "vue";
import { usePaymentController } from "./application/usePaymentController";
import { createPaymentClient } from "./infrastructure/paymentClient";
import type { CheckoutLinkVerdict } from "./infrastructure/responseSchemas";
import InvalidLinkView from "./components/InvalidLinkView.vue";
import type { RestoreResult } from "./application/usePaymentController";
import {
  loadReference,
  saveReference,
  clearReference,
} from "./infrastructure/paymentStorage";
import type { Pair, Payment } from "./domain/paymentModel";
import OrderSummary from "./components/OrderSummary.vue";
import AssetNetworkSelector from "./components/AssetNetworkSelector.vue";
import QuoteDetails from "./components/QuoteDetails.vue";
import PaymentProgress from "./components/PaymentProgress.vue";
import RecoveryPanel from "./components/RecoveryPanel.vue";
import NetworkBadge from "./components/NetworkBadge.vue";
import DemoControls from "./components/DemoControls.vue";
import TransactionLink from "./components/TransactionLink.vue";
const params = new URLSearchParams(location.search);
const orderId = params.get("order") ?? "ORD-88213";
const requiresValidation = params.has("order") || params.has("sig");
const client = createPaymentClient("/api", orderId);
const linkState = ref<"checking" | "ready" | "invalid" | "unavailable">(
  requiresValidation ? "checking" : "ready",
);
const invalidLink = shallowRef<Extract<
  CheckoutLinkVerdict,
  { valid: false }
> | null>(null);
const linkError = ref("");
const validating = ref(false);
const canGoBack = window.history.length > 1;
const controller = shallowRef<ReturnType<typeof usePaymentController> | null>(
  null,
);
// The scope lets the sole controller owner start synchronously *after* validation,
// while preserving its normal onScopeDispose cleanup without changing its logic.
const controllerScope = effectScope();
const restorePending = ref(false);
let disposed = false;
let validationAbort: AbortController | null = null;
let validationTimer: ReturnType<typeof setTimeout> | undefined;
let resetting = false;
let pageRefresh = Promise.resolve();
const payment = computed(() => controller.value?.payment.value ?? null);
const currencies = computed(() => controller.value?.currencies.value ?? []);
const order = computed(() => controller.value?.order.value ?? null);
const catalogueMerchant = computed(
  () => controller.value?.merchant.value ?? null,
);
const health = computed(() => controller.value?.health.value ?? "loading");
const error = computed(
  () => linkError.value || controller.value?.error.value || "",
);
const busy = computed(
  () => validating.value || controller.value?.busy.value || false,
);
const draft = computed<Pair>({
  get: () =>
    controller.value?.draft.value ?? { currency: "USDT", network: "tron" },
  set: (pair) => {
    if (controller.value) controller.value.draft.value = pair;
  },
});
const remaining = computed(() => controller.value?.remaining.value ?? 0);
const availability = computed(
  () => controller.value?.availability.value ?? "unavailable",
);
const canChange = computed(() => controller.value?.canChange.value ?? false);
const lastChecked = computed(() => controller.value?.lastChecked.value ?? null);
const uncertain = computed(() => controller.value?.uncertain.value ?? false);
const restoringPayment = computed(
  () => restorePending.value || controller.value?.restoring.value || false,
);
const selecting = ref(true),
  motionReady = ref(false),
  focusTarget = ref<HTMLElement | null>(null);
const showDemo = params.has("demo");
function resetDemo() {
  resetting = true;
  controller.value?.dispose();
  clearReference(orderId);
  window.location.reload();
}
const locale = params.get("locale") || navigator.language || "en-IE";
const merchant = computed(
  () =>
    payment.value?.merchant.name ??
    catalogueMerchant.value?.name ??
    "Payment Project",
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
// Track snapshots actually rendered by PaymentProgress, excluding create/restore work.
// A post-render watcher retains the previous displayed snapshot for the CSS ghost.
const paidReveal = shallowRef<{ active: boolean; previous: Payment } | null>(
  null,
);
watch(
  [() => (selectionVisible.value ? null : payment.value), busy],
  ([current, isBusy], [previous, wasBusy]) => {
    if (
      paidReveal.value ||
      isBusy ||
      wasBusy ||
      !previous ||
      current?.status !== "paid" ||
      !["awaiting_payment", "detected", "confirming", "underpaid"].includes(
        previous.status,
      ) ||
      previous.payment_reference !== current.payment_reference ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    paidReveal.value = { active: true, previous };
  },
  { flush: "post" },
);
async function start() {
  motionReady.value = true;
  selecting.value = false;
  await controller.value?.create();
  persistReference();
  await nextTick();
  focusTarget.value?.focus();
}
function select(pair: Pair) {
  if (!canChange.value) return;
  motionReady.value = true;
  draft.value = pair;
}
function persistReference() {
  if (!resetting && payment.value && !controller.value?.referenceMissing.value)
    saveReference(payment.value.payment_reference, orderId);
}
function finishRestore(outcome: RestoreResult | void) {
  if (resetting) return;
  if (outcome === "restored") {
    selecting.value = false;
    restorePending.value = false;
    persistReference();
  } else if (outcome === "not-found") {
    clearReference(orderId);
    selecting.value = true;
    restorePending.value = false;
  }
}
function retry() {
  if (linkState.value === "unavailable") return bootstrap();
  // Keep demo catalogue refreshes behind startup and earlier refreshes.
  pageRefresh = pageRefresh.then(async () => {
    if (!resetting) finishRestore(await controller.value?.retry());
  });
  return pageRefresh;
}
async function requote() {
  await controller.value?.requote();
  persistReference();
}
watch(
  () => controller.value?.referenceMissing.value,
  (missing) => {
    if (missing) clearReference(orderId);
  },
);
async function startSession() {
  if (disposed || controller.value) return;
  const session = controllerScope.run(() => usePaymentController({ client }));
  if (!session) return;
  controller.value = session;
  // Even reading persistence waits for a definitive valid link verdict.
  const storedReference = loadReference(orderId);
  restorePending.value = storedReference !== null;
  const initialized = session.initialize();
  if (storedReference) finishRestore(await session.restore(storedReference));
  else await initialized;
}
async function bootstrap() {
  if (disposed || validating.value) return;
  if (requiresValidation && linkState.value !== "ready") {
    validating.value = true;
    linkError.value = "";
    linkState.value = "checking";
    const abort = new AbortController();
    validationAbort = abort;
    validationTimer = setTimeout(() => abort.abort(), 10000);
    try {
      if (!client.validateLink)
        throw Error("Link verification is unavailable.");
      const { data } = await client.validateLink(
        params.get("order"),
        params.get("sig"),
        abort.signal,
      );
      if (disposed) return;
      if (!data.valid) {
        invalidLink.value = data;
        linkState.value = "invalid";
        return;
      }
      linkState.value = "ready";
    } catch (cause) {
      if (disposed) return;
      linkState.value = "unavailable";
      linkError.value =
        cause instanceof Error
          ? cause.message
          : "Link verification is unavailable.";
      return;
    } finally {
      clearTimeout(validationTimer);
      validationAbort = null;
      validating.value = false;
    }
  }
  await startSession();
}
onMounted(() => {
  pageRefresh = bootstrap();
});
onScopeDispose(() => {
  disposed = true;
  clearTimeout(validationTimer);
  validationAbort?.abort();
  controllerScope.stop();
});
</script>
<template>
  <InvalidLinkView
    v-if="invalidLink"
    :reason="invalidLink.reason"
    :order-in-link="invalidLink.order_id"
    :checked-at="invalidLink.checked_at"
    :help-url="invalidLink.help_url ?? null"
    :can-go-back="canGoBack"
  />
  <template v-else>
    <header v-if="linkState === 'ready'" class="merchant-header">
      <div class="merchant">
        <span class="merchant-mark" aria-hidden="true">{{
          merchant.slice(0, 1)
        }}</span
        ><span>{{ merchant }}</span>
      </div>
      <span class="order-reference mono">Order {{ orderId }}</span>
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
    <main
      v-if="linkState === 'ready'"
      class="checkout"
      :class="{ 'motion-ready': motionReady }"
      data-testid="checkout"
    >
      <OrderSummary
        :amount="payment?.order.amount ?? order?.amount ?? '149.90'"
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
          :class="{ 'motion-enter': payment }"
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
        <p
          v-else-if="selectionVisible"
          class="muted"
          :class="{ 'motion-enter': payment }"
        >
          Amount, address and QR code appear after you choose a network.
        </p>
        <div v-else-if="busy" class="loading-quote" data-testid="quote-loading">
          <div class="network-warning" :class="draft.network">
            <NetworkBadge :network="draft.network" />
            <div>
              <strong>{{ selectedNetwork?.name }} network only</strong>
              <div>
                {{ draft.currency }} sent on another network may be lost.
              </div>
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
          'paid-reveal': paidReveal?.active,
        }"
      >
        <span class="step-marker" aria-hidden="true">
          <span class="paid-step-glyph">{{
            result
              ? payment?.status === "failed"
                ? "×"
                : "✓"
              : payment?.status === "underpaid"
                ? "!"
                : "3"
          }}</span>
        </span>
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
          :reveal="paidReveal"
        />
      </section>
      <footer class="checkout-footer">
        <span>{{
          payment
            ? "Reference " + payment.payment_reference
            : "Order " + orderId
        }}</span
        ><span>Demo checkout · no real funds</span>
      </footer>
      <DemoControls
        v-if="showDemo"
        :order-id="orderId"
        @refresh="retry"
        @reset="resetDemo"
      />
    </main>
  </template>
</template>
