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
import { useCheckoutLink } from "./application/useCheckoutLink";
import { createPaymentClient } from "./infrastructure/paymentClient";
import { resetDemoServer } from "./infrastructure/demoReset";
import InvalidLinkView from "./components/InvalidLinkView.vue";
import ConnectionBanner from "./components/ConnectionBanner.vue";
import type { RestoreResult } from "./application/usePaymentController";
import {
  loadReference,
  saveReference,
  clearReference,
  hasPendingCreation,
  markCreationPending,
  clearPendingCreation,
} from "./infrastructure/paymentStorage";
import { isResult, isTerminal } from "./domain/paymentModel";
import type { Pair, Payment } from "./domain/paymentModel";
import { findCurrency, findNetwork } from "./domain/catalogue";
import OrderSummary from "./components/OrderSummary.vue";
import MerchantBrand from "./components/MerchantBrand.vue";
import AssetNetworkSelector from "./components/AssetNetworkSelector.vue";
import QuoteDetails from "./components/QuoteDetails.vue";
import PaymentProgress from "./components/PaymentProgress.vue";
import RecoveryPanel from "./components/RecoveryPanel.vue";
import NetworkBadge from "./components/NetworkBadge.vue";
import DemoControls from "./components/DemoControls.vue";
import TransactionLink from "./components/TransactionLink.vue";
const params = new URLSearchParams(location.search);
const orderId = params.get("order") ?? "ORD-88213";
const client = createPaymentClient("/api", orderId);
// Explicit order/signature links need a valid verdict before any session work.
const {
  requiresValidation,
  state: linkState,
  invalid: invalidLink,
  error: linkError,
  validating,
  validate: validateLink,
} = useCheckoutLink(client, params);
const canGoBack = window.history.length > 1;
type Session = ReturnType<typeof usePaymentController>;
const controller = shallowRef<Session | null>(null);
/** Project one controller value, with a neutral fallback until the session exists. */
function fromSession<T>(read: (session: Session) => T, fallback: T) {
  return computed(() => (controller.value ? read(controller.value) : fallback));
}
// The scope lets the sole controller owner start synchronously *after* validation,
// while preserving its normal onScopeDispose cleanup without changing its logic.
const controllerScope = effectScope();
const restorePending = ref(false);
let disposed = false;
let resetting = false;
let pageRefresh = Promise.resolve();
const payment = fromSession<Payment | null>((s) => s.payment.value, null);
const currencies = fromSession((s) => s.currencies.value, []);
const order = fromSession((s) => s.order.value, null);
const health = fromSession((s) => s.health.value, "loading");
const error = computed(
  () => linkError.value || controller.value?.error.value || "",
);
const busy = computed(
  () => validating.value || controller.value?.busy.value || false,
);
const draft = computed<Pair>({
  get: () => controller.value?.draft.value ?? { currency: "", network: "" },
  set: (pair) => {
    if (controller.value) controller.value.draft.value = pair;
  },
});
const remaining = fromSession((s) => s.remaining.value, 0);
const availability = fromSession((s) => s.availability.value, "unavailable");
const canChange = fromSession((s) => s.canChange.value, false);
const lastChecked = fromSession((s) => s.lastChecked.value, null);
const uncertain = fromSession((s) => s.uncertain.value, false);
const connectionIssue = fromSession((s) => s.connectionIssue.value, false);
const requestPending = fromSession((s) => s.requestPending.value, false);
const retryInSeconds = fromSession((s) => s.retryInSeconds.value, null);
const automaticRetriesPaused = fromSession(
  (s) => s.automaticRetriesPaused.value,
  false,
);
const manualRetryLimitReached = fromSession(
  (s) => s.manualRetryLimitReached.value,
  false,
);
const manualRetryInSeconds = fromSession((s) => s.manualRetryInSeconds.value, 0);
const restoringPayment = computed(
  () => restorePending.value || controller.value?.restoring.value || false,
);
const selecting = ref(true),
  motionReady = ref(false),
  focusTarget = ref<HTMLElement | null>(null);
const showDemo = params.has("demo");
const localDemoRecovery =
  import.meta.env.DEV &&
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) &&
  !requiresValidation;
const recoveringDemo = ref(false);
const recoveryError = ref("");
async function recoverDemo() {
  if (
    !localDemoRecovery ||
    !uncertain.value ||
    payment.value ||
    recoveringDemo.value
  )
    return;
  recoveringDemo.value = true;
  recoveryError.value = "";
  try {
    await resetDemoServer();
    if (!disposed) resetDemo();
  } catch {
    recoveryError.value =
      "Demo reset could not be confirmed. The checkout remains locked. Check the local server and try again.";
  } finally {
    recoveringDemo.value = false;
  }
}
function resetDemo() {
  if (disposed || resetting) return;
  resetting = true;
  controller.value?.dispose();
  clearReference(orderId);
  clearPendingCreation(orderId);
  window.location.reload();
}
const locale = params.get("locale") || navigator.language || "en-IE";
const merchant = fromSession((s) => s.merchant.value, null);
const initialPaymentPending = computed(() => !payment.value && !order.value);
const initialLoadFailed = computed(
  () => initialPaymentPending.value && !!error.value && !busy.value,
);
watch(
  merchant,
  (value) => {
    document.title = value?.name || "Checkout";
  },
  { immediate: true },
);
const paymentDecimals = computed(() =>
  payment.value
    ? findCurrency(currencies.value, payment.value.quote.crypto_currency)
        ?.decimals
    : undefined,
);
const selectionVisible = computed(
  () => !restoringPayment.value && selecting.value && canChange.value,
);
const selectedNetwork = computed(() =>
  findNetwork(currencies.value, draft.value),
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
  () => payment.value && isResult(payment.value.status),
);
const isUnderpaidQuoteExpired = computed(
  () => payment.value?.status === "underpaid" && remaining.value === 0,
);
const activeSend = computed(
  () =>
    !isUnderpaidQuoteExpired.value &&
    (busy.value ||
      availability.value === "usable" ||
      availability.value === "local-deadline-reached" ||
      payment.value?.status === "expired"),
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
      isTerminal(previous.status) ||
      previous.payment_reference !== current.payment_reference ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    paidReveal.value = { active: true, previous };
  },
  { flush: "post" },
);
async function start() {
  if (disposed || resetting || !controller.value?.canChange.value) return;
  motionReady.value = true;
  selecting.value = false;
  const current = payment.value;
  if (
    current?.status === "awaiting_payment" &&
    current.quote.crypto_currency === draft.value.currency &&
    current.quote.network === draft.value.network
  ) {
    // Reopening an already started payment keeps its accepted quote deadline.
    await controller.value?.retry();
  } else {
    markCreationPending(orderId);
    await controller.value?.create();
    if (disposed || resetting) return;
    if (!controller.value?.uncertain.value && !payment.value) {
      clearPendingCreation(orderId);
      selecting.value = true;
    }
    // A definite rejection cannot leave a false unresolved-creation marker.
    if (controller.value?.error.value && !controller.value.uncertain.value)
      clearPendingCreation(orderId);
  }
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
  if (
    !resetting &&
    payment.value &&
    !controller.value?.uncertain.value &&
    !controller.value?.referenceMissing.value
  )
    if (saveReference(payment.value.payment_reference, orderId))
      clearPendingCreation(orderId);
}
async function finishRestore(outcome: RestoreResult | void) {
  if (resetting) return;
  if (outcome === "restored") {
    selecting.value = false;
    restorePending.value = false;
    persistReference();
  } else if (outcome === "not-found") {
    clearReference(orderId);
    clearPendingCreation(orderId);
    selecting.value = true;
    restorePending.value = false;
    await loadCheckoutInformation();
  }
}
function retry() {
  if (linkState.value === "unavailable") return initializePage();
  if (resetting) return Promise.resolve();
  // Real-payment clicks share the controller's active request instead of
  // queuing another GET that could run after the first one has recovered.
  if (payment.value) return controller.value?.retry();
  // Serialize startup retries; a real POST with an unknown outcome stays locked.
  pageRefresh = pageRefresh.then(async () => {
    if (resetting) return;
    await finishRestore(await controller.value?.retry());
    await loadCheckoutInformation();
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
async function loadCheckoutInformation() {
  const session = controller.value;
  if (
    disposed ||
    resetting ||
    !session ||
    session.payment.value ||
    session.order.value ||
    restorePending.value ||
    session.restoring.value ||
    session.uncertain.value ||
    !session.canChange.value ||
    session.health.value !== "fresh"
  )
    return;
  // Persist the intent before POST: reload must not retry a lost creation reply.
  markCreationPending(orderId);
  await session.loadCheckoutInformation();
  if (disposed || resetting) return;
  // A verified information response is intentionally not saved as a payment.
  if (!session.uncertain.value) clearPendingCreation(orderId);
}
async function startSession() {
  if (disposed || controller.value) return;
  // Even reading persistence waits for a definitive valid link verdict.
  const storedReference = loadReference(orderId);
  const creationPending = hasPendingCreation(orderId);
  const session = controllerScope.run(() =>
    usePaymentController({
      client,
      creationPending,
    }),
  );
  if (!session) return;
  controller.value = session;
  restorePending.value = storedReference !== null && !creationPending;
  await session.initialize();
  if (creationPending) return;
  if (storedReference) await finishRestore(await session.restore(storedReference));
  else await loadCheckoutInformation();
}
async function initializePage() {
  if (disposed || validating.value) return;
  if (await validateLink()) await startSession();
}
onMounted(() => {
  pageRefresh = initializePage();
});
onScopeDispose(() => {
  disposed = true;
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
      <MerchantBrand v-if="merchant" :merchant="merchant" />
      <div
        v-else
        class="merchant"
        :aria-busy="!initialLoadFailed"
        :aria-label="
          initialLoadFailed ? 'Merchant unavailable' : 'Loading merchant'
        "
      >
        <span
          v-if="!initialLoadFailed"
          class="merchant-mark skeleton"
          aria-hidden="true"
        ></span>
        <span>{{
          initialLoadFailed
            ? "Checkout details unavailable"
            : "Loading checkout details…"
        }}</span>
      </div>
      <span class="order-reference mono">Order {{ orderId }}</span>
    </header>
    <ConnectionBanner
      v-if="error"
      :error="error"
      :connection-issue="connectionIssue"
      :retry-in-seconds="retryInSeconds"
      :request-pending="requestPending"
      :automatic-retries-paused="automaticRetriesPaused"
      :uncertain="uncertain"
      :busy="busy"
      :manual-retry-limit-reached="manualRetryLimitReached"
      :manual-retry-in-seconds="manualRetryInSeconds"
      :last-known-status="payment?.status ?? null"
      @retry="retry"
    />
    <main
      v-if="linkState === 'ready'"
      class="checkout"
      :class="{ 'motion-ready': motionReady }"
      data-testid="checkout"
    >
      <OrderSummary
        :amount="order?.amount"
        :unavailable="initialLoadFailed"
        :currency="order?.currency"
        :locale="locale"
      />
      <section
        class="step"
        :class="{
          done: !selectionVisible && !restoringPayment && !initialPaymentPending,
          active: selectionVisible || restoringPayment || initialPaymentPending,
        }"
      >
        <span class="step-marker" aria-hidden="true">{{
          selectionVisible || restoringPayment || initialPaymentPending ? "1" : "✓"
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
        <div v-else-if="initialPaymentPending || (!payment && uncertain)">
          <p class="muted">
            {{
              error
                ? order
                  ? "The payment request could not be verified."
                  : "Checkout details are unavailable."
                : "Loading checkout details…"
            }}
          </p>
          <template v-if="localDemoRecovery && uncertain">
            <p class="muted">
              This local demo is locked by an unfinished request. Reset all demo
              orders and payment states to start again. No real funds are involved.
            </p>
            <button
              class="secondary"
              data-testid="demo-recover"
              :disabled="recoveringDemo"
              @click="recoverDemo"
            >
              {{ recoveringDemo ? "Resetting demo…" : "Reset demo checkout" }}
            </button>
            <p v-if="recoveryError" role="status">{{ recoveryError }}</p>
          </template>
        </div>
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
              (payment?.status === 'underpaid' && !isUnderpaidQuoteExpired) ||
              payment?.status === 'expired'
            "
            class="action-label"
            >Action needed</span
          >
        </div>
        <p v-if="restoringPayment" class="muted">
          Checking for an existing payment…
        </p>
        <p v-else-if="initialPaymentPending" class="muted">
          Amount, address and QR code appear after you choose a network.
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
        <p
          v-else-if="
            payment?.status === 'underpaid' && !isUnderpaidQuoteExpired
          "
          role="status"
          data-testid="underpaid-quote-notice"
        >
          Transfer details are unavailable while we check your payment. Your
          previous payment is still recorded. Do not send more until the quote
          is verified.
        </p>
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
          incomplete: isUnderpaidQuoteExpired,
        }"
      >
        <span class="step-marker" aria-hidden="true">
          <span class="paid-step-glyph">{{
            isUnderpaidQuoteExpired
              ? "×"
              : result
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
          <span
            v-if="payment?.status === 'failed' || isUnderpaidQuoteExpired"
            class="action-label outline"
            >Can't be fixed here</span
          >
        </div>
        <PaymentProgress
          :decimals="paymentDecimals"
          :payment="selectionVisible ? null : payment"
          :health="health"
          :last-checked="lastChecked"
          :connection-issue="connectionIssue"
          :retry-scheduled="retryInSeconds !== null"
          :can-send-remaining="availability === 'usable'"
          :quote-expired="isUnderpaidQuoteExpired"
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
        @reset="resetDemo"
      />
    </main>
  </template>
</template>
