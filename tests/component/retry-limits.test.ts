import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import { usePaymentController } from "../../src/features/checkout/application/usePaymentController";
import { ClockService } from "../../src/features/checkout/infrastructure/ClockService";
import {
  ApiError,
  type ApiResult,
  type PaymentClient,
} from "../../src/features/checkout/infrastructure/paymentClient";
import type {
  Currency,
  Payment,
} from "../../src/features/checkout/domain/paymentModel";
import { paymentSnapshot } from "../fixtures/oracles";

const fixed = Date.parse("2026-08-14T08:37:10.842Z");
const scopes: EffectScope[] = [];
const catalogue: Currency[] = [
  {
    code: "USDT",
    name: "Tether",
    decimals: 6,
    networks: [
      {
        id: "tron",
        name: "Tron (TRC-20)",
        network_fee: "1.00",
        required_confirmations: 1,
        avg_confirmation_seconds: 60,
      },
    ],
  },
];
function snapshot(
  state: Parameters<typeof paymentSnapshot>[0] = "awaiting_payment",
) {
  return paymentSnapshot(state) as Payment;
}
function sample<T>(data: T): ApiResult<T> {
  return {
    data,
    serverTime: new Date(fixed + performance.now()).toISOString(),
    start: performance.now(),
    end: performance.now(),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup(initial = snapshot()) {
  const client = {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      sample(catalogue),
    ),
    create: vi.fn<PaymentClient["create"]>(async () => sample(initial)),
    status: vi.fn<PaymentClient["status"]>(async () => sample(initial)),
    requote: vi.fn<PaymentClient["requote"]>(async () => sample(initial)),
  };
  const clock = new ClockService(
    () => performance.now(),
    () => Date.now(),
  );
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() => usePaymentController({ client, clock }))!;
  return { controller, client, clock, scope };
}
async function live(initial = snapshot()) {
  const context = setup(initial);
  await context.controller.initialize();
  await context.controller.create({ currency: "USDT", network: "tron" });
  return context;
}
async function unavailable(initial = snapshot()) {
  const context = await live(initial);
  const calls: number[] = [];
  context.client.status.mockImplementation(async () => {
    calls.push(performance.now());
    throw new ApiError("Unavailable", 500);
  });
  // This is the first failed GET, not a retry within an existing outage.
  await context.controller.retry();
  return { ...context, calls };
}
async function exhausted(initial = snapshot()) {
  const context = await unavailable(initial);
  await vi.advanceTimersByTimeAsync(60000);
  expect(context.client.status).toHaveBeenCalledTimes(6);
  return context;
}
function automaticEvents() {
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  vi.setSystemTime(fixed);
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});

describe("bounded automatic retries for a verified payment", () => {
  it("starts exactly five retries at literal 2/4/8/16/30 second deadlines and stops", async () => {
    const { controller, client, calls } = await unavailable();
    expect(controller.automaticRetriesPaused.value).toBe(false);
    expect(controller.retryInSeconds.value).toBe(2);
    for (const [wait, count, next] of [
      [2000, 2, 4],
      [4000, 3, 8],
      [8000, 4, 16],
      [16000, 5, 30],
      [30000, 6, null],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(client.status).toHaveBeenCalledTimes(count - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(client.status).toHaveBeenCalledTimes(count);
      expect(controller.retryInSeconds.value).toBe(next);
    }
    expect(calls).toEqual([0, 2000, 6000, 14000, 30000, 60000]);
    expect(controller.automaticRetriesPaused.value).toBe(true);
    expect(controller.manualRetryLimitReached.value).toBe(false);
    await vi.advanceTimersByTimeAsync(120000);
    expect(client.status).toHaveBeenCalledTimes(6);
    expect(controller.payment.value?.status).toBe("awaiting_payment");
  });

  it("starts each next automatic delay after the preceding request completes", async () => {
    const { controller, client, calls } = await unavailable();
    const pending = deferred<ApiResult<Payment>>();
    client.status.mockImplementationOnce(() => {
      calls.push(performance.now());
      return pending.promise;
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(controller.requestPending.value).toBe(true);
    expect(controller.retryInSeconds.value).toBeNull();
    await vi.advanceTimersByTimeAsync(3000);
    pending.reject(new ApiError("Unavailable", 503));
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.retryInSeconds.value).toBe(4);
    await vi.advanceTimersByTimeAsync(3999);
    expect(client.status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([0, 2000, 9000]);
  });

  it("does not let focus, visibility, clock resync or local expiry bypass a pending deadline", async () => {
    const initial = {
      ...snapshot(),
      quote: { ...snapshot().quote, expires_at: "2026-08-14T08:37:11.842Z" },
    } as Payment;
    const { controller, client } = await unavailable(initial);
    automaticEvents();
    vi.setSystemTime(Date.parse("2030-01-01T00:00:00.000Z"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.remaining.value).toBe(0);
    expect(controller.availability.value).not.toBe("usable");
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(controller.retryInSeconds.value).toBe(1);
    automaticEvents();
    await vi.advanceTimersByTimeAsync(999);
    expect(client.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(controller.retryInSeconds.value).toBe(4);
  });

  it("keeps automatic polling stopped through focus, visibility, resync and eventual local expiry", async () => {
    const { controller, client } = await exhausted();
    automaticEvents();
    vi.setSystemTime(Date.parse("2030-01-01T00:00:00.000Z"));
    await vi.advanceTimersByTimeAsync(840000);
    automaticEvents();
    await vi.advanceTimersByTimeAsync(30000);
    expect(client.status).toHaveBeenCalledTimes(6);
    expect(controller.remaining.value).toBe(0);
    expect(controller.availability.value).not.toBe("usable");
    expect(controller.payment.value).toMatchObject({
      status: "awaiting_payment",
      payment_reference: "AQH-100306-PMT",
      quote: { expires_at: "2026-08-14T08:52:10.842Z" },
    });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.requote).not.toHaveBeenCalled();
  });

  it.each(["detected", "confirming", "underpaid"] as const)(
    "retains %s payment facts when budgets expire and the quote deadline passes",
    async (state) => {
      const { controller, client } = await exhausted(snapshot(state));
      await vi.advanceTimersByTimeAsync(900000);
      expect(client.status).toHaveBeenCalledTimes(6);
      expect(controller.payment.value).toMatchObject({
        status: state,
        payment_reference: "AQH-100306-PMT",
        amount_received: state === "underpaid" ? "120.00" : "163.69",
      });
      expect(controller.canChange.value).toBe(false);
      if (state === "underpaid") {
        expect(controller.payment.value).toMatchObject({
          amount_outstanding: "43.69",
        });
        expect(controller.availability.value).toBe("local-deadline-reached");
      }
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.requote).not.toHaveBeenCalled();
    },
  );

  it.each([
    new TypeError("Network request failed"),
    new ApiError("Gateway timeout", 504),
    new ApiError("Transport unavailable", 0),
  ])(
    "caps recoverable $message failures independently of error text",
    async (failure) => {
      const { controller, client } = await live();
      client.status.mockRejectedValue(failure);
      await controller.retry();
      await vi.advanceTimersByTimeAsync(180000);
      expect(client.status).toHaveBeenCalledTimes(6);
      expect(controller.automaticRetriesPaused.value).toBe(true);
      expect(controller.connectionIssue.value).toBe(true);
    },
  );

  it("does not cap successful confirming polls at five or eight requests", async () => {
    const { controller, client } = await live(snapshot("confirming"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(client.status).toHaveBeenCalledTimes(15);
    expect(controller.payment.value?.status).toBe("confirming");
    expect(controller.health.value).toBe("fresh");
    expect(controller.automaticRetriesPaused.value).toBe(false);
    expect(controller.manualRetryLimitReached.value).toBe(false);
    expect(controller.manualRetryInSeconds.value).toBe(0);
  });
});

describe("three manual retries with an independent monotonic ten-second cooldown", () => {
  it("blocks at 9,999 ms, permits at 10,000 ms and stops after the third actual manual GET", async () => {
    const { controller, client, calls } = await exhausted();
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(7);
    expect(controller.manualRetryInSeconds.value).toBe(10);
    expect(controller.manualRetryLimitReached.value).toBe(false);
    await controller.retry();
    await vi.advanceTimersByTimeAsync(9999);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1);
    expect(controller.manualRetryInSeconds.value).toBe(0);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(10000);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(9);
    expect(controller.manualRetryLimitReached.value).toBe(true);
    expect(controller.retryInSeconds.value).toBeNull();
    await vi.advanceTimersByTimeAsync(120000);
    automaticEvents();
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(9);
    expect(calls).toEqual([
      0, 2000, 6000, 14000, 30000, 60000, 60000, 70000, 80000,
    ]);
    expect(controller.automaticRetriesPaused.value).toBe(true);
  });

  it("counts from manual request start, not completion", async () => {
    const { controller, client } = await exhausted();
    const pending = deferred<ApiResult<Payment>>();
    client.status.mockReturnValueOnce(pending.promise);
    const request = controller.retry();
    await vi.advanceTimersByTimeAsync(7000);
    expect(controller.manualRetryInSeconds.value).toBe(3);
    pending.reject(new ApiError("Unavailable", 500));
    await request;
    expect(controller.manualRetryInSeconds.value).toBe(3);
    await vi.advanceTimersByTimeAsync(3000);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(8);
  });

  it("does not let wall-clock or server-clock changes clear a manual cooldown", async () => {
    const { controller, client, clock } = await exhausted();
    await controller.retry();
    vi.setSystemTime(Date.parse("2040-01-01T00:00:00.000Z"));
    clock.sample("2026-08-01T00:00:00.000Z", 60000, 60000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.manualRetryInSeconds.value).toBe(9);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(7);
    vi.setSystemTime(Date.parse("2020-01-01T00:00:00.000Z"));
    await vi.advanceTimersByTimeAsync(8999);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(8);
  });

  it("keeps both budgets separate and finishes all five automatic retries after three manual failures", async () => {
    const { controller, client, calls } = await unavailable();
    await controller.retry();
    await vi.advanceTimersByTimeAsync(10000);
    await controller.retry();
    await vi.advanceTimersByTimeAsync(10000);
    await controller.retry();
    expect(controller.manualRetryLimitReached.value).toBe(true);
    expect(controller.automaticRetriesPaused.value).toBe(false);
    expect(controller.retryInSeconds.value).toBe(16);
    await controller.retry();
    await vi.advanceTimersByTimeAsync(46000);
    expect(calls).toEqual([
      0, 0, 2000, 6000, 10000, 18000, 20000, 36000, 66000,
    ]);
    expect(client.status).toHaveBeenCalledTimes(9);
    expect(controller.automaticRetriesPaused.value).toBe(true);
    expect(controller.manualRetryLimitReached.value).toBe(true);
    await vi.advanceTimersByTimeAsync(120000);
    expect(client.status).toHaveBeenCalledTimes(9);
  });

  it("cancelled automatic reservations do not consume an automatic attempt", async () => {
    const { controller, client, calls } = await unavailable();
    await vi.advanceTimersByTimeAsync(1999);
    await controller.retry();
    expect(controller.retryInSeconds.value).toBe(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(client.status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([0, 1999, 3999]);
    await vi.advanceTimersByTimeAsync(58000);
    expect(calls).toEqual([0, 1999, 3999, 7999, 15999, 31999, 61999]);
    expect(controller.automaticRetriesPaused.value).toBe(true);
    expect(controller.manualRetryLimitReached.value).toBe(false);
  });

  it.each(["manual first", "automatic first"] as const)(
    "single-flight (%s) rejects duplicate clicks without consuming extra manual attempts",
    async (order) => {
      const { controller, client } = await unavailable();
      const pending = deferred<ApiResult<Payment>>();
      client.status.mockReturnValueOnce(pending.promise);
      if (order === "manual first") {
        await vi.advanceTimersByTimeAsync(1999);
        void controller.retry();
        await vi.advanceTimersByTimeAsync(1);
      } else {
        await vi.advanceTimersByTimeAsync(2000);
      }
      void controller.retry();
      void controller.retry();
      automaticEvents();
      await vi.advanceTimersByTimeAsync(0);
      expect(client.status).toHaveBeenCalledTimes(2);
      expect(controller.requestPending.value).toBe(true);
      expect(controller.retryInSeconds.value).toBeNull();
      expect(controller.manualRetryInSeconds.value).toBe(
        order === "manual first" ? 10 : 0,
      );
      pending.reject(new ApiError("Unavailable", 500));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(100000);
      expect(client.status).toHaveBeenCalledTimes(
        order === "manual first" ? 7 : 6,
      );
      await controller.retry();
      await vi.advanceTimersByTimeAsync(10000);
      await controller.retry();
      if (order === "automatic first") {
        expect(controller.manualRetryLimitReached.value).toBe(false);
        await vi.advanceTimersByTimeAsync(10000);
        await controller.retry();
      }
      expect(controller.manualRetryLimitReached.value).toBe(true);
      expect(client.status).toHaveBeenCalledTimes(9);
    },
  );

  it("counts an aborted timeout as one manual request without reviving exhausted automatic retries", async () => {
    const { controller, client } = await exhausted();
    const signals: AbortSignal[] = [];
    client.status.mockImplementation((_reference, signal) => {
      signals.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    for (const count of [7, 8, 9]) {
      const request = controller.retry();
      expect(client.status).toHaveBeenCalledTimes(count);
      expect(controller.requestPending.value).toBe(true);
      await vi.advanceTimersByTimeAsync(9999);
      void controller.retry();
      expect(client.status).toHaveBeenCalledTimes(count);
      await vi.advanceTimersByTimeAsync(1);
      await request;
      expect(signals[count - 7]?.aborted).toBe(true);
      expect(controller.requestPending.value).toBe(false);
      expect(controller.retryInSeconds.value).toBeNull();
    }
    await vi.advanceTimersByTimeAsync(30000);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(9);
    expect(controller.manualRetryLimitReached.value).toBe(true);
  });
});

describe("retry-budget success, invalid-response and lifecycle boundaries", () => {
  it("only a valid accepted Payment resets both budgets and permits a new full outage", async () => {
    const { controller, client } = await exhausted();
    await controller.retry();
    await vi.advanceTimersByTimeAsync(10000);
    client.status.mockResolvedValueOnce(sample(snapshot()));
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(8);
    expect(controller.health.value).toBe("fresh");
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.automaticRetriesPaused.value).toBe(false);
    expect(controller.manualRetryLimitReached.value).toBe(false);
    expect(controller.manualRetryInSeconds.value).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.status).toHaveBeenCalledTimes(9);
    expect(controller.retryInSeconds.value).toBe(2);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(10);
    await vi.advanceTimersByTimeAsync(60000);
    expect(client.status).toHaveBeenCalledTimes(15);
    expect(controller.automaticRetriesPaused.value).toBe(true);
    expect(controller.payment.value?.status).toBe("awaiting_payment");
  });

  it("accepting a terminal Payment resets the limits and leaves no automatic request", async () => {
    const { controller, client } = await exhausted();
    client.status.mockResolvedValueOnce(sample(snapshot("paid")));
    await controller.retry();
    expect(controller.payment.value?.status).toBe("paid");
    expect(controller.health.value).toBe("fresh");
    expect(controller.manualRetryInSeconds.value).toBe(0);
    expect(controller.manualRetryLimitReached.value).toBe(false);
    expect(controller.automaticRetriesPaused.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    await vi.advanceTimersByTimeAsync(120000);
    automaticEvents();
    expect(client.status).toHaveBeenCalledTimes(7);
  });

  it.each([
    { ...snapshot(), payment_reference: "WRONG-REFERENCE" },
    { ...snapshot(), quote: { ...snapshot().quote, total_due: "999.99" } },
  ])(
    "does not replenish limits after an invalid identity or quote response",
    async (invalid) => {
      const { controller, client } = await exhausted();
      const accepted = controller.payment.value;
      client.status.mockResolvedValueOnce(sample(invalid as Payment));
      await controller.retry();
      expect(controller.payment.value).toBe(accepted);
      expect(controller.health.value).toBe("stale");
      expect(controller.lastChecked.value).toBe(
        Date.parse("2026-08-14T08:37:10.842Z"),
      );
      await vi.advanceTimersByTimeAsync(9999);
      await controller.retry();
      expect(client.status).toHaveBeenCalledTimes(7);
      await vi.advanceTimersByTimeAsync(1);
      await controller.retry();
      await vi.advanceTimersByTimeAsync(10000);
      await controller.retry();
      await vi.advanceTimersByTimeAsync(60000);
      await controller.retry();
      expect(client.status).toHaveBeenCalledTimes(9);
      expect(controller.manualRetryLimitReached.value).toBe(true);
      expect(client.create).toHaveBeenCalledTimes(1);
    },
  );

  it("does not replenish limits when the HTTP client rejects schema or order validation", async () => {
    const { controller, client } = await exhausted();
    const accepted = controller.payment.value;
    // PaymentClient owns schema and order validation before it returns Payment.
    client.status.mockRejectedValueOnce(
      new ApiError("Invalid payment response", 0, true),
    );
    await controller.retry();
    expect(controller.payment.value).toBe(accepted);
    expect(controller.health.value).toBe("stale");
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:10.842Z"),
    );
    await vi.advanceTimersByTimeAsync(9999);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(7);
    await vi.advanceTimersByTimeAsync(1);
    await controller.retry();
    await vi.advanceTimersByTimeAsync(10000);
    await controller.retry();
    expect(controller.manualRetryLimitReached.value).toBe(true);
    await vi.advanceTimersByTimeAsync(120000);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(9);
  });

  it("a valid automatic recovery resets manual usage and cooldown as well as the automatic budget", async () => {
    const { controller, client } = await unavailable();
    await controller.retry();
    expect(controller.manualRetryInSeconds.value).toBe(10);
    client.status.mockResolvedValueOnce(sample(snapshot()));
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.status).toHaveBeenCalledTimes(3);
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.manualRetryInSeconds.value).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.status).toHaveBeenCalledTimes(4);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(5);
    expect(controller.manualRetryInSeconds.value).toBe(10);
    expect(controller.manualRetryLimitReached.value).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(client.status).toHaveBeenCalledTimes(10);
    expect(controller.automaticRetriesPaused.value).toBe(true);
  });

  it("ignores a late old-generation success while a replacement POST remains uncertain", async () => {
    const { controller, client } = await exhausted();
    const pending = deferred<ApiResult<Payment>>();
    let signal: AbortSignal | undefined;
    client.status.mockImplementationOnce((_reference, requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    });
    const request = controller.retry();
    client.create.mockRejectedValueOnce(
      new ApiError("Lost POST response", 500),
    );
    const replacement = controller.create({
      currency: "USDT",
      network: "tron",
    });
    expect(signal?.aborted).toBe(true);
    pending.resolve(sample(snapshot("paid")));
    await request;
    await replacement;
    expect(controller.payment.value?.status).toBe("awaiting_payment");
    expect(controller.uncertain.value).toBe(true);
    expect(controller.health.value).toBe("stale");
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:10.842Z"),
    );
    await vi.advanceTimersByTimeAsync(120000);
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(7);
    expect(client.create).toHaveBeenCalledTimes(2);
  });

  it("dispose aborts a pending retry and a late success cannot mutate facts or schedule work", async () => {
    const { controller, client, scope } = await exhausted();
    const accepted = controller.payment.value;
    const pending = deferred<ApiResult<Payment>>();
    let signal: AbortSignal | undefined;
    client.status.mockImplementationOnce((_reference, requestSignal) => {
      signal = requestSignal;
      return pending.promise;
    });
    const request = controller.retry();
    scope.stop();
    expect(signal?.aborted).toBe(true);
    const atDispose = {
      payment: controller.payment.value,
      health: controller.health.value,
      lastChecked: controller.lastChecked.value,
      paused: controller.automaticRetriesPaused.value,
      limited: controller.manualRetryLimitReached.value,
      cooldown: controller.manualRetryInSeconds.value,
    };
    pending.resolve(sample(snapshot("paid")));
    await request;
    await vi.advanceTimersByTimeAsync(120000);
    automaticEvents();
    await controller.retry();
    expect(controller.payment.value).toBe(accepted);
    expect({
      payment: controller.payment.value,
      health: controller.health.value,
      lastChecked: controller.lastChecked.value,
      paused: controller.automaticRetriesPaused.value,
      limited: controller.manualRetryLimitReached.value,
      cooldown: controller.manualRetryInSeconds.value,
    }).toEqual(atDispose);
    expect(client.status).toHaveBeenCalledTimes(7);
    expect(controller.requestPending.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("initial metadata and unresolved restoration retain their separate manual retry behavior", async () => {
    const { controller, client } = setup();
    client.currencies.mockRejectedValueOnce(
      new ApiError("Catalogue unavailable", 500),
    );
    await controller.initialize();
    expect(controller.automaticRetriesPaused.value).toBe(false);
    expect(controller.manualRetryLimitReached.value).toBe(false);
    await controller.retry();
    client.status.mockRejectedValue(new ApiError("Restore unavailable", 500));
    expect(await controller.restore("AQH-100306-PMT")).toBe("unavailable");
    await controller.retry();
    await controller.retry();
    await controller.retry();
    await controller.retry();
    expect(client.status).toHaveBeenCalledTimes(5);
    expect(controller.restoring.value).toBe(true);
    expect(controller.payment.value).toBeNull();
    expect(controller.manualRetryLimitReached.value).toBe(false);
    expect(controller.manualRetryInSeconds.value).toBe(0);
    expect(controller.canChange.value).toBe(false);
    expect(client.create).not.toHaveBeenCalled();
  });
});
