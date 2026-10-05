<script setup lang="ts">
import { useI18n } from "vue-i18n";
const { t } = useI18n({ useScope: "global" });
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
defineProps<{ mobile?: boolean }>();
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
const manualRetryInSeconds = fromSession(
  (s) => s.manualRetryInSeconds.value,
  0,
);
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
const recoveryFailed = ref(false);
const recoveryError = computed(() =>
  recoveryFailed.value ? t("checkout.resetFailed") : "",
);
async function recoverDemo() {
  if (
    !localDemoRecovery ||
    !uncertain.value ||
    payment.value ||
    recoveringDemo.value
  )
    return;
  recoveringDemo.value = true;
  recoveryFailed.value = false;
  try {
    await resetDemoServer();
    if (!disposed) resetDemo();
  } catch {
    recoveryFailed.value = true;
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
  () => merchant.value?.name || t("common.checkout"),
  (title) => {
    document.title = title;
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
const result = computed(() => payment.value && isResult(payment.value.status));
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
  if (storedReference)
    await finishRestore(await session.restore(storedReference));
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
    :mobile="mobile"
    v-if="invalidLink"
    :reason="invalidLink.reason"
    :order-in-link="invalidLink.order_id"
    :checked-at="invalidLink.checked_at"
    :help-url="invalidLink.help_url ?? null"
    :can-go-back="canGoBack"
  />
  <template v-else>
    <header
      v-if="linkState === 'ready'"
      class="merchant-header"
      :class="{ mobile }"
    >
      <MerchantBrand v-if="merchant" :merchant="merchant" />
      <div
        v-else
        class="merchant"
        :aria-busy="!initialLoadFailed"
        :aria-label="
          initialLoadFailed
            ? t('checkout.merchantUnavailable')
            : t('checkout.loadingMerchant')
        "
      >
        <span
          v-if="!initialLoadFailed"
          class="merchant-mark skeleton"
          aria-hidden="true"
        ></span>
        <span>{{
          initialLoadFailed
            ? t("checkout.detailsUnavailable")
            : t("checkout.loadingDetails")
        }}</span>
      </div>
    </header>
    <ConnectionBanner
      :mobile="mobile"
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
      :class="{ mobile, 'motion-ready': motionReady }"
      data-testid="checkout"
    >
      <OrderSummary
        :mobile="mobile"
        :order-id="orderId"
        :amount="order?.amount"
        :unavailable="initialLoadFailed"
        :currency="order?.currency"
        :locale="locale"
      />
      <section
        class="step"
        :class="{
          done:
            !selectionVisible && !restoringPayment && !initialPaymentPending,
          active: selectionVisible || restoringPayment || initialPaymentPending,
        }"
      >
        <span class="step-marker" aria-hidden="true">{{
          selectionVisible || restoringPayment || initialPaymentPending
            ? "1"
            : "✓"
        }}</span>
        <div class="step-heading">
          <h2>{{ t("checkout.payWith") }}</h2>
          <button
            v-if="!selectionVisible && payment && canChange"
            class="text-button"
            data-testid="change"
            @click="selecting = true"
          >
            {{ t("checkout.change") }}
          </button>
        </div>
        <p v-if="restoringPayment" class="muted">
          {{ t("checkout.restoring") }}
        </p>
        <div v-else-if="initialPaymentPending || (!payment && uncertain)">
          <p class="muted">
            {{
              error
                ? order
                  ? t("checkout.unverifiedRequest")
                  : t("checkout.unavailableDetails")
                : t("checkout.loadingDetails")
            }}
          </p>
          <template v-if="localDemoRecovery && uncertain">
            <p class="muted">
              {{ t("checkout.lockedDemo") }}
            </p>
            <button
              class="secondary"
              data-testid="demo-recover"
              :disabled="recoveringDemo"
              @click="recoverDemo"
            >
              {{
                recoveringDemo
                  ? t("checkout.resettingDemo")
                  : t("checkout.resetDemo")
              }}
            </button>
            <p v-if="recoveryError" role="status">{{ recoveryError }}</p>
          </template>
        </div>
        <AssetNetworkSelector
          :mobile="mobile"
          v-else-if="selectionVisible"
          :class="{ 'motion-enter': payment }"
          :currencies="currencies"
          :pair="draft"
          :disabled="busy || health === 'loading'"
          @select="select"
          @continue="start"
        />
        <div v-else class="selected-pair" data-testid="selected-network">
          <NetworkBadge :network="displayedPair.network" /><span>{{
            t("common.pair", {
              currency: displayedPair.currency,
              network: displayedNetwork ?? "",
            })
          }}</span>
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
          <h2>{{ t("checkout.sendExact") }}</h2>
          <span
            v-if="
              (payment?.status === 'underpaid' && !isUnderpaidQuoteExpired) ||
              payment?.status === 'expired'
            "
            class="action-label"
            >{{ t("checkout.actionNeeded") }}</span
          >
        </div>
        <p v-if="restoringPayment" class="muted">
          {{ t("checkout.restoring") }}
        </p>
        <p v-else-if="initialPaymentPending" class="muted">
          {{ t("checkout.placeholder") }}
        </p>
        <p
          v-else-if="selectionVisible"
          class="muted"
          :class="{ 'motion-enter': payment }"
        >
          {{ t("checkout.placeholder") }}
        </p>
        <div
          v-else-if="busy"
          class="loading-quote"
          :class="{ mobile }"
          data-testid="quote-loading"
        >
          <div class="network-warning" :class="draft.network">
            <NetworkBadge :network="draft.network" />
            <div>
              <strong>{{
                t("quote.networkOnly", { network: selectedNetwork?.name ?? "" })
              }}</strong>
              <div>
                {{ t("quote.wrongNetwork", { currency: draft.currency }) }}
              </div>
            </div>
          </div>
          <p role="status">
            {{
              t("checkout.loadingQuote", {
                currency: draft.currency,
                network: selectedNetwork?.name ?? "",
              })
            }}
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
            {{ t("checkout.waitForQuote") }}
          </p>
        </div>
        <QuoteDetails
          :mobile="mobile"
          v-else-if="payment && availability === 'usable'"
          :payment="payment"
          :remaining="remaining"
        />
        <RecoveryPanel
          :mobile="mobile"
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
          {{ t("checkout.checkingUnderpaid") }}
        </p>
        <p v-else-if="payment?.status === 'awaiting_payment'" role="status">
          {{ t("checkout.checkingExpired") }}
        </p>
        <div
          v-else-if="payment && 'amount_received' in payment"
          class="received-summary"
        >
          <i18n-t keypath="checkout.received" tag="span" scope="global">
            <template #amount
              >
<span class="mono"
                >{{ payment.amount_received }}
                {{ payment.quote.crypto_currency }}</span
              >
</template
            >
</i18n-t
          ><TransactionLink
            class="transaction"
            :hash="payment.tx_hash"
            :network="payment.quote.network"
          />
        </div>
        <p v-else-if="payment?.status === 'failed'" class="muted">
          {{ t("checkout.failedTransfer") }}
        </p>
        <p v-else class="muted">
          {{ t("checkout.quoteUnavailable") }}
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
          <h2>{{ t("checkout.confirmation") }}</h2>
          <span
            v-if="payment?.status === 'failed' || isUnderpaidQuoteExpired"
            class="action-label outline"
            >{{ t("checkout.cannotFix") }}</span
          >
        </div>
        <PaymentProgress
          :mobile="mobile"
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
        <span v-if="payment && !selectionVisible && !busy">{{
          t("common.reference", { reference: payment.payment_reference })
        }}</span>
      </footer>
      <DemoControls v-if="showDemo" :order-id="orderId" @reset="resetDemo" />
    </main>
  </template>
</template>
<style lang="scss">
@use "../../styles/checkout-shared" as shared;

@include shared.merchant-header;

@include shared.merchant-brand;

:where(.checkout) {
  @include shared.checkout-footer;
}

:where(.loading-quote) {
  @include shared.network-warning;

  @include shared.address-panel;

  @include shared.amount-skeleton;
}

.checkout {
  width: var(--column);
  max-width: calc(100% - 32px);
  margin: 46px auto 0;
}

.step {
  position: relative;
  margin-left: 14px;
  padding-left: 34px;
  padding-bottom: 36px;
  border-left: 1px solid var(--line);
  min-width: 0;

  &:last-of-type {
    border-left-color: transparent;
  }
}

.step-marker {
  position: absolute;
  left: -15px;
  top: 0;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: #fff;
  color: var(--muted);
  display: grid;
  place-items: center;
  font-size: 12px;
  z-index: 1;
  box-shadow: 0 7px 0 #fff;
}

.step.active {
  > .step-marker {
    background: var(--ink);
    border-color: var(--ink);
    color: #fff;
  }
}

.step.done {
  > .step-marker {
    background: #909090;
    border-color: #909090;
    color: #fff;
  }
}

.step.done {
  border-left-color: var(--ink);
}

.confirmation-step.done {
  > .step-marker {
    background: var(--ink);
  }
}

.step-heading {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}

.inactive {
  h2 {
    color: var(--muted);
  }
}

.step.inactive {
  p {
    margin-top: 22px;
  }
}

.text-button {
  border: 0;
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 3px;
  padding: 0;
}

.selected-pair {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 28px;
}

.received-summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.transaction {
  font-size: 13px;
  overflow-wrap: anywhere;
}

.action-label {
  font: 10px var(--mono);
  letter-spacing: 0.5px;
  background: var(--ink);
  color: #fff;
  padding: 6px 9px;
  border-radius: 3px;
  white-space: nowrap;

  &.outline {
    background: white;
    color: var(--ink);
    border: 1px solid var(--border);
  }
}

.loading-quote {
  > p {
    font-size: 13px;
    color: #555;
  }
}

.line-skeleton {
  width: 65%;
  height: 14px;
  margin-bottom: 16px;
}

.qr-skeleton {
  width: 144px;
  height: 144px;
  flex: none;
}

.skeleton-details {
  width: 100%;
  display: grid;
  gap: 12px;

  > .skeleton {
    height: 16px;
  }

  > .skeleton:first-child {
    width: 40%;
  }

  > .button-skeleton {
    height: 44px;
    width: 45%;
    margin-top: 8px;
  }
}

.loading-note {
  border-top: 1px solid var(--line);
  padding-top: 16px;
}

.checkout:where(.mobile) {
  margin-top: 26px;
}

:where(.checkout.mobile) {
  .step {
    padding-left: 29px;
    padding-bottom: 36px;
  }

  .received-summary {
    flex-direction: column;
    gap: 8px;
  }

  .qr-skeleton {
    align-self: center;
    width: 168px;
    height: 168px;
  }

  .skeleton-panel {
    gap: 20px;
  }

  .line-skeleton {
    width: 100%;
  }

  .skeleton-details {
    gap: 10px;

    > .skeleton {
      height: 20px;
    }

    > .button-skeleton {
      height: 44px;
    }
  }

  .action-label {
    font-size: 9px;
    padding: 6px;
  }

  .step-heading {
    h2 {
      font-size: 14px;
    }
  }
}
/* An expired partial-payment quote keeps its receipt, without transfer actions. */

.confirmation-step.incomplete {
  > .step-marker {
    background: #fff;
    border: 2px solid var(--ink);
    color: var(--ink);
  }
}

.checkout:has(.underpaid-incomplete) {
  .checkout-footer {
    > span {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  }
}

:where(.checkout.mobile) {
  .confirmation-step.incomplete {
    .step-heading {
      height: auto;
      min-height: 28px;
      flex-wrap: wrap;
    }
  }
}
/* Motion starts with checkout interaction; removals remain immediate. */

.checkout.motion-ready {
  .step-marker {
    transition:
      background-color var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out),
      border-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out);
  }

  .step {
    transition: border-left-color var(--motion-fast) var(--ease-out);
  }

  .motion-enter,
  .received-summary {
    animation: checkout-enter var(--motion-medium) var(--ease-out);
  }
}
/* Address panels and QR images stay opaque, including their ancestors. */

.checkout.motion-ready {
  .loading-quote {
    animation: checkout-settle var(--motion-medium) var(--ease-out);
  }
}
/* Pulse the placeholders only while the send step is fetching its quote. */

.checkout.motion-ready {
  .loading-quote {
    .skeleton {
      animation: quote-skeleton-pulse var(--motion-skeleton) var(--ease-in-out)
        infinite;
    }
  }
}

@keyframes quote-skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

.paid-reveal {
  > .step-marker::before {
    content: "3";
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    opacity: 0;
    animation: paid-digit-hide var(--paid-check-delay) steps(1, end) both;
  }

  > .step-marker > .paid-step-glyph {
    animation: paid-check-in var(--paid-check-duration) var(--paid-ease-out)
      var(--paid-check-delay) both;
  }
}

@keyframes paid-digit-hide {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

@keyframes paid-check-in {
  from {
    clip-path: inset(0 100% 0 0);
  }

  to {
    clip-path: inset(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .paid-reveal {
    *,
    *::before,
    *::after {
      animation: none !important;
      transition: none !important;
    }

    > .step-marker::before {
      display: none;
    }
  }
}
</style>
