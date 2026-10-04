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
const currencies: Currency[] = [
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
const sample = <T>(data: T): ApiResult<T> => ({
  data,
  serverTime: new Date(fixed + performance.now()).toISOString(),
  start: performance.now(),
  end: performance.now(),
});
const snapshot = (
  state: Parameters<typeof paymentSnapshot>[0] = "awaiting_payment",
) => paymentSnapshot(state) as Payment;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(current = snapshot()) {
  const client = {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      sample(currencies),
    ),
    create: vi.fn<PaymentClient["create"]>(async () => sample(current)),
    status: vi.fn<PaymentClient["status"]>(async () => sample(current)),
    requote: vi.fn<PaymentClient["requote"]>(async () => sample(current)),
  };
  const clock = new ClockService(
    () => performance.now(),
    () => fixed + performance.now(),
  );
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() =>
    usePaymentController({
      client,
      clock,
    }),
  )!;
  return { client, controller, clock, scope };
}
async function live(current = snapshot()) {
  const result = setup(current);
  await result.controller.initialize();
  await result.controller.create({ currency: "USDT", network: "tron" });
  return result;
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

describe("connection-error controller projections use actual request scheduling", () => {
  it("only an accepted real Payment establishes lastChecked, never catalogue loading", async () => {
    const { controller } = setup(snapshot());
    expect(controller.lastChecked.value).toBeNull();
    await controller.initialize();
    expect(controller.payment.value).toBeNull();
    expect(controller.lastChecked.value).toBeNull();
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    await vi.advanceTimersByTimeAsync(750);
    await controller.create();
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:11.592Z"),
    );
    expect(controller.requestPending.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
  });

  it("a structured HTTP 500 retains the verified snapshot and schedules a two-second retry", async () => {
    const { controller, client } = await live();
    const accepted = controller.payment.value;
    client.status.mockRejectedValue(
      new ApiError("Upstream temporarily unavailable", 500),
    );
    await controller.retry();
    expect(controller.connectionIssue.value).toBe(true);
    expect(controller.requestPending.value).toBe(false);
    expect(controller.retryInSeconds.value).toBe(2);
    expect(controller.health.value).toBe("stale");
    expect(controller.payment.value).toBe(accepted);
    expect(controller.payment.value).toMatchObject({
      status: "awaiting_payment",
      payment_reference: "AQH-100306-PMT",
      order_id: "ORD-88213",
      quote: {
        total_due: "163.69",
        crypto_address: "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
        expires_at: "2026-08-14T08:52:10.842Z",
      },
    });
    expect(controller.availability.value).toBe("usable");
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:10.842Z"),
    );
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.requote).not.toHaveBeenCalled();
  });

  it("matches literal 2/4/8/16/30 second backoff deadlines and stops after five retries", async () => {
    const { controller, client } = await live();
    const calledAt: number[] = [];
    client.status.mockImplementation(async () => {
      calledAt.push(performance.now());
      throw new ApiError("Unavailable", 500);
    });
    await controller.retry();
    expect(controller.retryInSeconds.value).toBe(2);
    for (const [wait, next, count] of [
      [2000, 4, 2],
      [4000, 8, 3],
      [8000, 16, 4],
      [16000, 30, 5],
      [30000, null, 6],
    ] as const) {
      await vi.advanceTimersByTimeAsync(wait! - 1);
      expect(client.status).toHaveBeenCalledTimes(count! - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(client.status).toHaveBeenCalledTimes(count!);
      expect(controller.retryInSeconds.value).toBe(next);
    }
    await vi.advanceTimersByTimeAsync(60000);
    expect(client.status).toHaveBeenCalledTimes(6);
    expect(controller.retryInSeconds.value).toBeNull();
    expect(calledAt).toEqual([0, 2000, 6000, 14000, 30000, 60000]);
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:10.842Z"),
    );
  });

  it("counts down with the existing ticker independently of a shifted mock server clock or wall clock", async () => {
    const { controller, client, clock } = await live();
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    await controller.retry();
    expect(controller.retryInSeconds.value).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.retryInSeconds.value).toBe(1);
    clock.sample("2026-08-13T08:37:10.842Z", 1000, 1000);
    vi.setSystemTime(Date.parse("2030-01-01T00:00:00.000Z"));
    await vi.advanceTimersByTimeAsync(250);
    expect(controller.remaining.value).toBe(87299750);
    expect(controller.retryInSeconds.value).toBe(1);
    expect(client.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(750);
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(controller.retryInSeconds.value).toBe(4);
  });

  it.each(["manual first", "automatic first"] as const)(
    "coalesces retry clicks with the scheduled request (%s) and hides the countdown while checking",
    async (order) => {
      const { controller, client } = await live();
      client.status.mockRejectedValueOnce(new ApiError("Unavailable", 500));
      await controller.retry();
      const pending = deferred<ApiResult<Payment>>();
      client.status.mockReturnValue(pending.promise);
      if (order === "manual first") {
        await vi.advanceTimersByTimeAsync(1750);
        void controller.retry();
        await vi.advanceTimersByTimeAsync(250);
      } else {
        await vi.advanceTimersByTimeAsync(2000);
      }
      const click = controller.retry();
      void controller.retry();
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      expect(controller.requestPending.value).toBe(true);
      expect(controller.retryInSeconds.value).toBeNull();
      expect(client.status).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(client.status).toHaveBeenCalledTimes(2);
      pending.resolve(sample(snapshot()));
      await click;
      expect(controller.requestPending.value).toBe(false);
      expect(controller.connectionIssue.value).toBe(false);
      expect(controller.retryInSeconds.value).toBeNull();
      expect(controller.health.value).toBe("fresh");
      expect(client.create).toHaveBeenCalledTimes(1);
    },
  );

  it("a successful accepted GET clears error projections, advances lastChecked and resets the backoff", async () => {
    const { controller, client } = await live();
    client.status.mockRejectedValueOnce(new ApiError("Unavailable", 500));
    await controller.retry();
    await vi.advanceTimersByTimeAsync(750);
    await controller.retry();
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    expect(controller.error.value).toBe("");
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:11.592Z"),
    );
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    await vi.advanceTimersByTimeAsync(1999);
    expect(client.status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.status).toHaveBeenCalledTimes(3);
    expect(controller.retryInSeconds.value).toBe(2);
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:11.592Z"),
    );
  });

  it.each([
    new ApiError("HTTP 500 appears in this missing-reference explanation", 404),
    new ApiError("HTTP 500 appears in this invalid-data explanation", 0, true),
  ])(
    "does not classify $message as a recoverable connection failure",
    async (failure) => {
      const { controller, client } = await live();
      client.status.mockRejectedValue(failure);
      await controller.retry();
      expect(controller.connectionIssue.value).toBe(false);
      expect(controller.retryInSeconds.value).toBeNull();
      expect(controller.lastChecked.value).toBe(
        Date.parse("2026-08-14T08:37:10.842Z"),
      );
      expect(controller.payment.value?.status).toBe("awaiting_payment");
    },
  );

  it("does not advance lastChecked or hide a protocol block when an invalid snapshot or later HTTP 500 arrives", async () => {
    const { controller, client } = await live();
    await vi.advanceTimersByTimeAsync(500);
    client.status.mockResolvedValueOnce(
      sample({ ...snapshot(), payment_reference: "WRONG-REFERENCE" }),
    );
    await controller.retry();
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.availability.value).toBe("reconciling");
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:10.842Z"),
    );
    client.status.mockRejectedValueOnce(new ApiError("Unavailable", 500));
    await controller.retry();
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    expect(controller.availability.value).toBe("reconciling");
    expect(controller.payment.value?.payment_reference).toBe("AQH-100306-PMT");
  });

  it("a timed-out GET exposes checking until abort, then schedules the ordinary two-second retry", async () => {
    const { controller, client } = await live();
    let signal: AbortSignal | undefined;
    client.status.mockImplementation((_reference, requestSignal) => {
      signal = requestSignal;
      return new Promise((_resolve, reject) => {
        requestSignal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const pending = controller.retry();
    expect(controller.requestPending.value).toBe(true);
    expect(controller.retryInSeconds.value).toBeNull();
    await vi.advanceTimersByTimeAsync(9999);
    expect(signal?.aborted).toBe(false);
    expect(client.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(controller.requestPending.value).toBe(false);
    expect(controller.connectionIssue.value).toBe(true);
    expect(controller.retryInSeconds.value).toBe(2);
    expect(controller.payment.value?.status).toBe("awaiting_payment");
  });
});

describe("connection-error projections preserve payment safety and lifecycle boundaries", () => {
  it("local quote expiry hides transfer eligibility and reconciles without manufacturing payment expiry or a new quote", async () => {
    const original = {
      ...snapshot(),
      quote: { ...snapshot().quote, expires_at: "2026-08-14T08:37:11.842Z" },
    } as Payment;
    const { controller, client } = await live(original);
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    await controller.retry();
    expect(controller.availability.value).toBe("usable");
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.availability.value).toBe("local-deadline-reached");
    expect(controller.remaining.value).toBe(0);
    expect(controller.payment.value?.status).toBe("awaiting_payment");
    expect(controller.payment.value?.quote.expires_at).toBe(
      "2026-08-14T08:37:11.842Z",
    );
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(controller.retryInSeconds.value).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(controller.retryInSeconds.value).toBe(4);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.requote).not.toHaveBeenCalled();
  });

  it.each([
    ["detected", "unavailable", "163.69"],
    ["confirming", "unavailable", "163.69"],
    ["underpaid", "local-deadline-reached", "120.00"],
  ] as const)(
    "retains observed %s funds through the original quote deadline and HTTP 500",
    async (state, availability, received) => {
      const original = {
        ...snapshot(state),
        quote: { ...snapshot().quote, expires_at: "2026-08-14T08:37:11.842Z" },
      } as Payment;
      const { controller, client } = await live(original);
      client.status.mockRejectedValue(new ApiError("Unavailable", 500));
      await controller.retry();
      await vi.advanceTimersByTimeAsync(1000);
      expect(controller.payment.value).toMatchObject({
        status: state,
        amount_received: received,
        payment_reference: "AQH-100306-PMT",
        quote: { expires_at: "2026-08-14T08:37:11.842Z" },
      });
      expect(controller.availability.value).toBe(availability);
      expect(controller.canChange.value).toBe(false);
      if (state === "underpaid")
        expect(controller.payment.value).toMatchObject({
          amount_outstanding: "43.69",
        });
      else
        expect(controller.payment.value).toMatchObject({
          confirmations: 0,
          required_confirmations: 1,
        });
      expect(controller.connectionIssue.value).toBe(true);
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.requote).not.toHaveBeenCalled();
    },
  );

  it.each(["paid", "overpaid", "failed", "expired"] as const)(
    "never advertises or schedules an automatic retry for terminal %s even after a failed manual GET",
    async (state) => {
      const { controller, client } = await live(snapshot(state));
      expect(controller.retryInSeconds.value).toBeNull();
      client.status.mockRejectedValue(new ApiError("Unavailable", 500));
      await controller.retry();
      expect(controller.payment.value?.status).toBe(state);
      expect(controller.retryInSeconds.value).toBeNull();
      await vi.advanceTimersByTimeAsync(60000);
      expect(client.status).toHaveBeenCalledTimes(1);
      expect(controller.retryInSeconds.value).toBeNull();
    },
  );

  it.each(["catalogue", "creation"] as const)(
    "a %s failure has neither a real-payment connection issue nor a fabricated last check",
    async (phase) => {
      const { controller, client } = setup(snapshot());
      if (phase === "catalogue")
        client.currencies.mockRejectedValue(new ApiError("Unavailable", 500));
      else client.create.mockRejectedValue(new ApiError("Unavailable", 500));
      await controller.initialize();
      if (phase === "creation") await controller.create();
      expect(controller.payment.value).toBeNull();
      expect(controller.lastChecked.value).toBeNull();
      expect(controller.connectionIssue.value).toBe(false);
      expect(controller.retryInSeconds.value).toBeNull();
      expect(controller.requestPending.value).toBe(false);
      expect(controller.health.value).toBe("unavailable");
      expect(controller.uncertain.value).toBe(phase === "creation");
      await vi.advanceTimersByTimeAsync(30000);
      expect(client.status).not.toHaveBeenCalled();
      expect(client.create).toHaveBeenCalledTimes(phase === "creation" ? 1 : 0);
    },
  );

  it("an unavailable saved-reference restoration remains separate and never invents payment facts", async () => {
    const { controller, client } = setup(snapshot());
    await controller.initialize();
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    expect(await controller.restore("AQH-100306-PMT")).toBe("unavailable");
    expect(controller.payment.value).toBeNull();
    expect(controller.lastChecked.value).toBeNull();
    expect(controller.restoring.value).toBe(true);
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    await controller.create();
    await vi.advanceTimersByTimeAsync(30000);
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.create).not.toHaveBeenCalled();
  });

  it.each(["first creation", "replacement"] as const)(
    "an uncertain %s POST keeps the warning and mutation lock without advertising automatic retries",
    async (phase) => {
      const { controller, client } =
        phase === "replacement" ? await live() : setup();
      if (phase === "first creation") await controller.initialize();
      client.create.mockRejectedValue(new ApiError("Unavailable", 500));
      await controller.create({ currency: "USDT", network: "tron" });
      expect(controller.uncertain.value).toBe(true);
      expect(controller.error.value).toBe(
        "The quote request outcome is uncertain. Do not send or create another payment. Ask the merchant to check your order.",
      );
      expect(controller.connectionIssue.value).toBe(false);
      expect(controller.retryInSeconds.value).toBeNull();
      expect(controller.canChange.value).toBe(false);
      expect(controller.availability.value).toBe("reconciling");
      await controller.retry();
      await controller.create();
      await vi.advanceTimersByTimeAsync(60000);
      expect(controller.uncertain.value).toBe(true);
      expect(controller.connectionIssue.value).toBe(false);
      expect(controller.retryInSeconds.value).toBeNull();
      expect(client.create).toHaveBeenCalledTimes(
        phase === "replacement" ? 2 : 1,
      );
      if (phase === "first creation") {
        expect(controller.payment.value).toBeNull();
        expect(controller.lastChecked.value).toBeNull();
      }
    },
  );

  it("starting a replacement cancels the old retry deadline and keeps requests serialized", async () => {
    const { controller, client } = await live();
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    await controller.retry();
    expect(controller.retryInSeconds.value).toBe(2);
    const response = deferred<ApiResult<Payment>>();
    client.create.mockReturnValueOnce(response.promise);
    const pending = controller.create({ currency: "USDT", network: "tron" });
    expect(controller.requestPending.value).toBe(true);
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    await controller.retry();
    await vi.advanceTimersByTimeAsync(3000);
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledTimes(2);
    response.resolve(
      sample({ ...snapshot(), payment_reference: "AQH-200000-PMT" }),
    );
    await pending;
    expect(controller.requestPending.value).toBe(false);
    expect(controller.connectionIssue.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    expect(controller.payment.value?.payment_reference).toBe("AQH-200000-PMT");
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:13.842Z"),
    );
  });

  it("scope disposal clears an advertised countdown and prevents timer or focus retries", async () => {
    const { controller, client, scope } = await live();
    client.status.mockRejectedValue(new ApiError("Unavailable", 500));
    await controller.retry();
    expect(controller.retryInSeconds.value).toBe(2);
    scope.stop();
    expect(controller.retryInSeconds.value).toBeNull();
    expect(controller.requestPending.value).toBe(false);
    window.dispatchEvent(new Event("focus"));
    await controller.retry();
    await vi.advanceTimersByTimeAsync(60000);
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a pending retry on disposal and ignores the late successful Payment and lastChecked", async () => {
    const { controller, client, scope } = await live();
    client.status.mockRejectedValueOnce(new ApiError("Unavailable", 500));
    await controller.retry();
    const response = deferred<ApiResult<Payment>>();
    client.status.mockReturnValueOnce(response.promise);
    const pending = controller.retry();
    const signal = client.status.mock.calls[1]![1];
    expect(controller.requestPending.value).toBe(true);
    expect(controller.retryInSeconds.value).toBeNull();
    scope.stop();
    expect(signal.aborted).toBe(true);
    expect(controller.requestPending.value).toBe(false);
    await vi.advanceTimersByTimeAsync(30000);
    response.resolve(sample(snapshot("paid")));
    await pending;
    expect(controller.payment.value?.status).toBe("awaiting_payment");
    expect(controller.lastChecked.value).toBe(
      Date.parse("2026-08-14T08:37:10.842Z"),
    );
    expect(controller.requestPending.value).toBe(false);
    expect(controller.retryInSeconds.value).toBeNull();
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
