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
  Payment,
  Currency,
} from "../../src/features/checkout/domain/paymentModel";
import { fixedNow, paymentSnapshot } from "../fixtures/oracles";

// These are simulated lifecycle events, not evidence of a native hidden tab.
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
const snapshot = (
  state: Parameters<typeof paymentSnapshot>[0] = "awaiting_payment",
) => paymentSnapshot(state) as Payment;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
async function setup(
  state: Parameters<typeof paymentSnapshot>[0] = "awaiting_payment",
) {
  let wall = fixedNow,
    mono = 0;
  const result = <T>(data: T): ApiResult<T> => ({
    data,
    serverTime: new Date(wall).toISOString(),
    start: mono,
    end: mono,
  });
  const client = {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      result(catalogue),
    ),
    create: vi.fn<PaymentClient["create"]>(async () => result(snapshot(state))),
    status: vi.fn<PaymentClient["status"]>(async () => result(snapshot(state))),
    requote: vi.fn<PaymentClient["requote"]>(async () => result(snapshot())),
  };
  const clock = new ClockService(
    () => mono,
    () => wall,
  );
  const scope = effectScope();
  scopes.push(scope);
  const c = scope.run(() => usePaymentController({ client, clock }))!;
  await c.initialize();
  await c.create();
  return {
    c,
    client,
    scope,
    result,
    clock,
    move(w: number, m: number) {
      wall = fixedNow + w;
      mono = m;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "Date",
      "performance",
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
    ],
  });
  vi.setSystemTime(fixedNow);
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});

describe("background lifecycle audit — independent wall/monotonic time", () => {
  it.each(["awaiting_payment", "underpaid"] as const)(
    "%s respects 1ms/0ms expiry after callbacks were suspended",
    async (state) => {
      const { c, client, move } = await setup(state);
      client.status.mockRejectedValue(new ApiError("Unavailable", 500));
      move(899999, 899999);
      await vi.advanceTimersByTimeAsync(250);
      expect(c.remaining.value).toBe(1);
      expect(c.availability.value).toBe("usable");
      move(900000, 900000);
      await vi.advanceTimersByTimeAsync(250);
      expect(c.remaining.value).toBe(0);
      expect(c.availability.value).not.toBe("usable");
      expect(c.payment.value?.status).toBe(state);
      expect(client.status).toHaveBeenCalledTimes(1);
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.requote).not.toHaveBeenCalled();
    },
  );

  it.each(["awaiting_payment", "underpaid"] as const)(
    "%s blocks immediately on focus after a stopped monotonic clock and accepts later server recovery",
    async (state) => {
      const { c, client, move, result } = await setup(state);
      const pending = deferred<ApiResult<Payment>>();
      client.status.mockReturnValueOnce(pending.promise);
      move(901000, 0);
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      expect(c.availability.value).toBe("reconciling");
      expect(client.status).toHaveBeenCalledTimes(1);
      pending.resolve(result(snapshot(state)));
      await c.retry();
      expect(c.remaining.value).toBe(0);
      expect(c.availability.value).not.toBe("usable");
      client.status.mockResolvedValue(result(snapshot("paid")));
      await c.retry();
      expect(c.payment.value?.status).toBe("paid");
    },
  );

  it("does not replay missed retries after one delayed callback; the next backoff starts at completion", async () => {
    const { c, client } = await setup();
    const calls: number[] = [];
    client.status.mockImplementation(async () => {
      calls.push(performance.now());
      throw new ApiError("Unavailable", 500);
    });
    await c.retry();
    // Advance monotonic time without running the scheduled callback; then deliver it.
    const monotonic = vi.spyOn(performance, "now").mockReturnValue(120000);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(client.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toEqual([0, 120000]);
    expect(c.retryInSeconds.value).toBe(4);
    monotonic.mockReturnValue(123999);
    await vi.advanceTimersByTimeAsync(3999);
    expect(client.status).toHaveBeenCalledTimes(2);
    monotonic.mockReturnValue(124000);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([0, 120000, 124000]);
  });

  it("server recovery after exhausted automatic budget stays manual, preserving limits across focus", async () => {
    const { c, client, result } = await setup();
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    await c.retry();
    await vi.advanceTimersByTimeAsync(60000);
    expect(client.status).toHaveBeenCalledTimes(6);
    client.status.mockResolvedValue(result(snapshot()));
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(client.status).toHaveBeenCalledTimes(6);
    expect(c.automaticRetriesPaused.value).toBe(true);
    expect(c.manualRetryLimitReached.value).toBe(false);
    await c.retry();
    expect(client.status).toHaveBeenCalledTimes(7);
    expect(c.automaticRetriesPaused.value).toBe(false);
    expect(c.health.value).toBe("fresh");
  });

  it.each(["paid", "overpaid", "failed", "expired"] as const)(
    "%s ignores repeated lifecycle events",
    async (state) => {
      const { c, client } = await setup(state);
      for (let i = 0; i < 5; i++) {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      }
      await vi.advanceTimersByTimeAsync(60000);
      expect(client.status).not.toHaveBeenCalled();
      expect(c.payment.value?.status).toBe(state);
    },
  );

  it("teardown after a suspended request removes timers and listeners and ignores its late success", async () => {
    const { c, client, scope, result } = await setup("underpaid");
    const pending = deferred<ApiResult<Payment>>();
    let signal: AbortSignal | undefined;
    client.status.mockImplementation((_ref, s) => {
      signal = s;
      return pending.promise;
    });
    const request = c.retry();
    scope.stop();
    expect(signal?.aborted).toBe(true);
    // This deliberately abort-ignoring client still owns its bounded request timeout
    // until its promise settles; the polling timer and ticker are already cleared.
    expect(vi.getTimerCount()).toBe(1);
    pending.resolve(result(snapshot("paid")));
    await request;
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60000);
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(c.payment.value?.status).toBe("underpaid");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["awaiting_payment", "underpaid"] as const)(
    "AUDIT: %s blocks stale transfer instructions within 15 seconds of resume despite a pre-suspension response",
    async (state) => {
      const { c, client, move, result } = await setup(state);
      const oldResponse = result(snapshot(state));
      const pending = deferred<ApiResult<Payment>>();
      client.status.mockReturnValueOnce(pending.promise);
      const inFlight = c.retry();
      // Response timestamp was produced before suspension; browser callbacks and
      // performance.now() stop while wall time advances past the quote deadline.
      move(901000, 0);
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      expect(client.status).toHaveBeenCalledTimes(1);
      pending.resolve(oldResponse);
      await inFlight;
      client.status.mockRejectedValue(new ApiError("Unavailable", 500));
      // Allow the requested 15-second grace period from resume, keeping both
      // injected clocks and scheduled callbacks advancing together after return.
      for (let elapsed = 250; elapsed <= 15000; elapsed += 250) {
        move(901000 + elapsed, elapsed);
        await vi.advanceTimersByTimeAsync(250);
      }
      expect(client.status.mock.calls.length).toBeGreaterThan(1);
      expect(c.health.value).toBe("stale");
      expect(c.payment.value).toEqual(snapshot(state));
      expect(
        c.availability.value,
        `15 seconds after resume with HTTP 500: remaining=${c.remaining.value}`,
      ).not.toBe("usable");
    },
  );

  it("AUDIT: a persisted pageshow blocks stale transfer instructions within 5 seconds of restore", async () => {
    const { c, client, move } = await setup("underpaid");
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    move(901000, 0);
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    // BFCache restoration may keep instructions visible during the requested
    // grace period, but they must be blocked by five seconds after return.
    for (let elapsed = 250; elapsed <= 5000; elapsed += 250) {
      move(901000 + elapsed, elapsed);
      await vi.advanceTimersByTimeAsync(250);
    }
    expect(client.status).toHaveBeenCalled();
    expect(c.health.value).toBe("stale");
    expect(c.payment.value).toEqual(snapshot("underpaid"));
    expect(
      c.availability.value,
      `5 seconds after persisted pageshow: remaining=${c.remaining.value}`,
    ).not.toBe("usable");
  });
});
