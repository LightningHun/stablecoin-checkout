import { computed, onScopeDispose, ref, shallowRef } from "vue";
import { acceptSnapshot, hasFunds, isTerminal } from "../domain/paymentModel";
import type {
  Currency,
  Pair,
  Payment,
  RequestHealth,
} from "../domain/paymentModel";
import { quoteAvailability } from "../domain/quotePolicy";
import { ApiError, createPaymentClient } from "../infrastructure/paymentClient";
import type { ApiResult, PaymentClient } from "../infrastructure/paymentClient";
import { ClockService } from "../infrastructure/ClockService";
export interface ControllerOptions {
  client?: PaymentClient;
  clock?: ClockService;
  pollMs?: number;
  timeoutMs?: number;
}
export function usePaymentController(options: ControllerOptions = {}) {
  const client = options.client ?? createPaymentClient(),
    clock = options.clock ?? new ClockService();
  const pollMs = options.pollMs ?? 2000,
    timeoutMs = options.timeoutMs ?? 10000;
  const payment = shallowRef<Payment | null>(null),
    currencies = shallowRef<Currency[]>([]);
  const health = ref<RequestHealth>("loading"),
    error = ref(""),
    busy = ref(false),
    protocolBlocked = ref(false),
    uncertain = ref(false);
  const draft = shallowRef<Pair>({ currency: "USDT", network: "tron" });
  const clockUncertain = ref(false);
  const tick = ref(0),
    lastChecked = ref<number | null>(null),
    generation = ref(0);
  let disposed = false,
    active: Promise<void> | null = null,
    abort: AbortController | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    failures = 0,
    pendingPair: Pair | null = null,
    localExpired = false;
  const remaining = computed(() => {
    void tick.value;
    return payment.value ? clock.remaining(payment.value.quote.expires_at) : 0;
  });
  const availability = computed(() => {
    void tick.value;
    return quoteAvailability(
      payment.value,
      clock.now() +
        (payment.value
          ? Math.max(
              0,
              Date.parse(payment.value.quote.expires_at) -
                clock.now() -
                remaining.value,
            )
          : 0),
      busy.value ||
        protocolBlocked.value ||
        uncertain.value ||
        (clockUncertain.value && payment.value?.status === "awaiting_payment"),
    );
  });
  const canChange = computed(
    () =>
      !busy.value &&
      !uncertain.value &&
      !protocolBlocked.value &&
      (!payment.value ||
        (payment.value.status === "awaiting_payment" &&
          availability.value === "usable")),
  );
  function clearPoll() {
    clearTimeout(timer);
    timer = undefined;
  }
  function schedule() {
    clearPoll();
    if (
      disposed ||
      busy.value ||
      !payment.value ||
      isTerminal(payment.value.status)
    )
      return;
    timer = setTimeout(
      () => void poll(),
      Math.min(30000, pollMs * 2 ** Math.min(Math.max(0, failures - 1), 4)),
    );
  }
  function markError(cause: unknown) {
    health.value = payment.value ? "stale" : "unavailable";
    error.value =
      cause instanceof Error ? cause.message : "Connection unavailable";
    protocolBlocked.value ||= cause instanceof ApiError && cause.protocol;
    failures++;
  }
  function sample<T>(result: ApiResult<T>) {
    clock.sample(result.serverTime, result.start, result.end);
    tick.value++;
    clockUncertain.value = false;
    lastChecked.value = clock.now();
  }
  async function request<T>(
    operation: (signal: AbortSignal) => Promise<ApiResult<T>>,
  ): Promise<ApiResult<T>> {
    const controller = new AbortController();
    abort = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timeout);
      if (abort === controller) abort = null;
    }
  }
  function accept(
    result: ApiResult<Payment>,
    gen: number,
    replace = false,
    expected = replace ? undefined : payment.value?.payment_reference,
  ): boolean {
    if (disposed || gen !== generation.value) return false;
    const next = acceptSnapshot(
      replace ? null : payment.value,
      result.data,
      expected ?? result.data.payment_reference,
      gen,
      generation.value,
    );
    if (!next)
      throw new ApiError(
        "Unrecognized payment identity or state regression. Transfer controls are paused.",
        0,
        true,
      );
    if (
      !replace &&
      payment.value &&
      JSON.stringify(next.quote) !== JSON.stringify(payment.value.quote)
    )
      throw new ApiError(
        "Quote changed unexpectedly. Transfer controls are paused.",
        0,
        true,
      );
    sample(result);
    payment.value = Object.freeze(next);
    health.value = "fresh";
    error.value = "";
    protocolBlocked.value = false;
    failures = 0;
    if (isTerminal(next.status)) clearPoll();
    return true;
  }
  function poll(force = false): Promise<void> {
    if (
      disposed ||
      busy.value ||
      !payment.value ||
      (!force && isTerminal(payment.value.status))
    )
      return Promise.resolve();
    if (active) return active;
    clearPoll();
    const gen = generation.value,
      reference = payment.value.payment_reference;
    const work = (async () => {
      try {
        accept(await request((s) => client.status(reference, s)), gen);
      } catch (cause) {
        if (!disposed && gen === generation.value) markError(cause);
      }
    })();
    active = work;
    void work.finally(() => {
      if (active === work) active = null;
      if (!disposed && gen === generation.value) schedule();
    });
    return work;
  }
  async function initialize() {
    if (disposed || active) return;
    const gen = generation.value;
    const work = (async () => {
      try {
        const result = await request((s) => client.currencies(s));
        if (disposed || gen !== generation.value) return;
        sample(result);
        currencies.value = result.data;
        protocolBlocked.value = false;
        health.value = "fresh";
        error.value = "";
      } catch (cause) {
        if (!disposed) markError(cause);
      }
    })();
    active = work;
    await work;
    if (active === work) active = null;
  }
  async function mutate(pair: Pair, requote = false) {
    if (disposed || busy.value || uncertain.value) return;
    if (!requote && !canChange.value) return;
    busy.value = true;
    draft.value = pair;
    clearPoll();
    const gen = ++generation.value;
    // Wait for the GET to settle before POST; invalidated GET callbacks cannot update state.
    abort?.abort();
    if (active) await active;
    if (disposed) {
      busy.value = false;
      return;
    }
    const reference = payment.value?.payment_reference;
    let posted = false;
    const work = (async () => {
      try {
        if (requote) {
          if (!reference) return;
          const reconciled = await request((s) => client.status(reference, s));
          accept(reconciled, gen);
          if (
            reconciled.data.status !== "expired" ||
            hasFunds(reconciled.data.status)
          )
            return;
        }
        posted = true;
        const result = await request((s) =>
          requote && reference
            ? client.requote(reference, pair, s)
            : client.create(pair, s),
        );
        if (
          result.data.quote.crypto_currency !== pair.currency ||
          result.data.quote.network !== pair.network
        )
          throw new ApiError(
            "Quote does not match the requested network.",
            0,
            true,
          );
        accept(result, gen, true, requote ? reference : undefined);
        localExpired = false;
      } catch (cause) {
        if (disposed || gen !== generation.value) return;
        markError(cause);
        if (cause instanceof ApiError && cause.status === 409 && reference) {
          try {
            accept(await request((s) => client.status(reference, s)), gen);
          } catch (err) {
            markError(err);
          }
        } else if (
          posted &&
          !(
            cause instanceof ApiError &&
            cause.status >= 400 &&
            cause.status < 500
          )
        ) {
          uncertain.value = true;
          error.value =
            "The quote request outcome is uncertain. Do not send or create another payment. Ask the merchant to check your order.";
        }
      }
    })();
    active = work;
    await work;
    if (active === work) active = null;
    if (disposed) return;
    busy.value = false;
    const queued = pendingPair;
    pendingPair = null;
    if (queued && canChange.value) void mutate(queued);
    else schedule();
  }
  function create(pair: Pair = draft.value) {
    return mutate(pair);
  }
  function select(pair: Pair) {
    draft.value = pair;
    if (!payment.value && !busy.value) return Promise.resolve();
    if (busy.value) {
      pendingPair = pair;
      return Promise.resolve();
    }
    return mutate(pair);
  }
  function requote() {
    const p = payment.value;
    if (!p || p.status !== "expired" || busy.value) return Promise.resolve();
    return mutate(
      { currency: p.quote.crypto_currency, network: p.quote.network },
      true,
    );
  }
  function retry() {
    if (uncertain.value) return Promise.resolve();
    return payment.value ? poll(true) : initialize();
  }
  function resume() {
    tick.value++;
    if (payment.value?.status === "awaiting_payment")
      clockUncertain.value = true;
    if (
      !disposed &&
      !busy.value &&
      payment.value &&
      !isTerminal(payment.value.status)
    )
      void poll();
  }
  const ticker = setInterval(() => {
    tick.value++;
    if (
      clock.needsResync() &&
      payment.value?.status === "awaiting_payment" &&
      !clockUncertain.value
    ) {
      clockUncertain.value = true;
      void poll();
    }
    if (
      payment.value?.status === "awaiting_payment" &&
      remaining.value === 0 &&
      !localExpired
    ) {
      localExpired = true;
      void poll();
    }
  }, 250);
  function dispose() {
    if (disposed) return;
    disposed = true;
    ++generation.value;
    clearPoll();
    clearInterval(ticker);
    pendingPair = null;
    abort?.abort();
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
  }
  onScopeDispose(dispose);
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
  return {
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
    generation,
    uncertain,
    initialize,
    create,
    select,
    requote,
    retry,
    dispose,
  };
}
