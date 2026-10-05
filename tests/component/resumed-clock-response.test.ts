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
import { fixedNow, paymentSnapshot } from "../fixtures/oracles";

// These cases simulate callback ordering and independent clock readings; they
// do not constitute evidence of native browser suspension or BFCache behavior.
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
const snapshot = (
  status: Parameters<typeof paymentSnapshot>[0] = "awaiting_payment",
) => paymentSnapshot(status) as Payment;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function setup(
  status: "awaiting_payment" | "underpaid" = "awaiting_payment",
) {
  let wall = fixedNow;
  let monotonic = 0;
  const result = <T>(data: T): ApiResult<T> => ({
    data,
    serverTime: new Date(wall).toISOString(),
    start: monotonic,
    end: monotonic,
  });
  const client = {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      result(currencies),
    ),
    create: vi.fn<PaymentClient["create"]>(async () =>
      result(snapshot(status)),
    ),
    status: vi.fn<PaymentClient["status"]>(async () =>
      result(snapshot(status)),
    ),
    requote: vi.fn<PaymentClient["requote"]>(async () => result(snapshot())),
  };
  const clock = new ClockService(
    () => monotonic,
    () => wall,
  );
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() => usePaymentController({ client, clock }))!;
  await controller.initialize();
  await controller.create();
  return {
    controller,
    client,
    result,
    move(wallElapsed: number, monotonicElapsed: number) {
      wall = fixedNow + wallElapsed;
      monotonic = monotonicElapsed;
    },
  };
}

function lifecycleEvents() {
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
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

describe("T07/T08/T09 responses that straddle a stopped monotonic clock", () => {
  it.each([
    ["awaiting_payment", 120000, 780000, "usable"],
    ["underpaid", 120000, 780000, "usable"],
    ["awaiting_payment", 901000, 0, "local-deadline-reached"],
    ["underpaid", 901000, 0, "local-deadline-reached"],
  ] as const)(
    "%s: an old response stays blocked after a %ims pause; a new response gives %ims remaining",
    async (status, pause, remaining, availability) => {
      const { controller, client, result, move } = await setup(status);
      expect(controller.remaining.value).toBe(900000);
      expect(controller.availability.value).toBe("usable");
      const oldResponse = result(snapshot(status));
      const old = deferred<ApiResult<Payment>>();
      const fresh = deferred<ApiResult<Payment>>();
      client.status
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(fresh.promise);
      const oldRequest = controller.retry();

      move(pause, 0);
      lifecycleEvents();
      expect(controller.availability.value).toBe("reconciling");
      expect(client.status).toHaveBeenCalledTimes(1);
      old.resolve(oldResponse);
      await oldRequest;

      // A valid payment payload does not make its pre-suspension time sample
      // evidence that the original transfer deadline is still in the future.
      expect(controller.availability.value).not.toBe("usable");
      expect(controller.payment.value).toEqual(snapshot(status));
      expect(controller.payment.value?.quote.total_due).toBe("163.69");
      if (status === "underpaid") {
        expect(controller.payment.value).toMatchObject({
          amount_received: "120.00",
          amount_outstanding: "43.69",
        });
      }

      // This joins an automatic reconciliation if one has already started, or
      // starts the next GET. Repeated return notifications cannot overlap it or
      // invalidate a sample from a request genuinely started after the pause.
      const freshRequest = controller.retry();
      for (let i = 0; i < 5; i++) lifecycleEvents();
      expect(client.status).toHaveBeenCalledTimes(2);
      expect(controller.requestPending.value).toBe(true);
      fresh.resolve(result(snapshot(status)));
      await freshRequest;

      expect(controller.remaining.value).toBe(remaining);
      expect(controller.availability.value).toBe(availability);
      expect(controller.health.value).toBe("fresh");
      expect(controller.payment.value).toEqual(snapshot(status));
      expect(client.status).toHaveBeenCalledTimes(2);
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.requote).not.toHaveBeenCalled();
    },
  );

  it.each(["awaiting_payment", "underpaid"] as const)(
    "%s cannot erase suspension evidence when its response callback runs before focus or the ticker",
    async (status) => {
      const { controller, client, result, move } = await setup(status);
      const oldResponse = result(snapshot(status));
      const old = deferred<ApiResult<Payment>>();
      client.status
        .mockReturnValueOnce(old.promise)
        .mockRejectedValue(new ApiError("Unavailable", 500));
      const oldRequest = controller.retry();

      move(120000, 0);
      // No lifecycle event and no timer callback has yet observed this pause.
      old.resolve(oldResponse);
      await oldRequest;
      move(120250, 250);
      await vi.advanceTimersByTimeAsync(250);

      // The first delivered ticker must still be able to observe that server
      // time is uncertain, even if response completion happened first.
      expect(controller.availability.value).not.toBe("usable");
      expect(controller.canChange.value).toBe(false);
      expect(controller.payment.value).toEqual(snapshot(status));
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.requote).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["detected", 0],
    ["paid", 1],
  ] as const)(
    "accepts a valid %s payment carried by a response whose time sample predates suspension",
    async (status, confirmations) => {
      const { controller, client, result, move } = await setup();
      // Both fixture event timestamps precede this response. The quote has
      // 200 seconds left when the response is captured, then expires in sleep.
      move(700000, 700000);
      const oldResponse = result(snapshot(status));
      const old = deferred<ApiResult<Payment>>();
      client.status.mockReturnValueOnce(old.promise);
      const oldRequest = controller.retry();
      move(901000, 700000);
      lifecycleEvents();
      expect(client.status).toHaveBeenCalledTimes(1);
      old.resolve(oldResponse);
      await oldRequest;

      expect(controller.payment.value).toEqual(snapshot(status));
      expect(controller.payment.value).toMatchObject({
        payment_reference: "AQH-100306-PMT",
        status,
        amount_received: "163.69",
        confirmations,
        tx_hash: "9d1f4c8a2be7...",
      });
      expect(controller.availability.value).toBe("unavailable");
      expect(controller.canChange.value).toBe(false);
      expect(controller.health.value).toBe("fresh");
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.requote).not.toHaveBeenCalled();
    },
  );

  it("coalesces repeated focus and ticker resync behind one valid post-return request", async () => {
    const { controller, client, result, move } = await setup();
    const fresh = deferred<ApiResult<Payment>>();
    client.status.mockReturnValueOnce(fresh.promise);
    move(120000, 0);
    lifecycleEvents();
    const request = controller.retry();
    for (let i = 0; i < 5; i++) lifecycleEvents();
    // Deliver the timer while the injected time readings still describe the
    // same return instant. This adds resync pressure without another pause.
    await vi.advanceTimersByTimeAsync(250);
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(controller.requestPending.value).toBe(true);
    fresh.resolve(result(snapshot()));
    await request;

    expect(controller.remaining.value).toBe(780000);
    expect(controller.availability.value).toBe("usable");
    expect(controller.canChange.value).toBe(true);
    expect(controller.health.value).toBe("fresh");
    expect(controller.error.value).toBe("");
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(client.requote).not.toHaveBeenCalled();
  });

  it("recovers an underpaid deadline when initial time samples were rejected and the device clock is fast", async () => {
    // The server is ten minutes into the quote; the device clock is five minutes fast.
    let wall = fixedNow + 900000;
    let server = fixedNow + 600000;
    const monotonic = 0;
    const clock = new ClockService(
      () => monotonic,
      () => wall,
    );
    const result = <T>(data: T): ApiResult<T> => ({
      data,
      serverTime: new Date(server).toISOString(),
      start: monotonic,
      end: monotonic,
    });
    const initial = deferred<ApiResult<Currency[]>>();
    const restoring = deferred<ApiResult<Payment>>();
    const client = {
      currencies: vi.fn<PaymentClient["currencies"]>(() => initial.promise),
      status: vi
        .fn<PaymentClient["status"]>(async () => result(snapshot("underpaid")))
        .mockReturnValueOnce(restoring.promise),
      create: vi.fn<PaymentClient["create"]>(async () => result(snapshot())),
      requote: vi.fn<PaymentClient["requote"]>(async () => result(snapshot())),
    };
    const scope = effectScope();
    scopes.push(scope);
    const controller = scope.run(() =>
      usePaymentController({ client, clock }),
    )!;
    const oldCatalogue = result(currencies);
    const initialize = controller.initialize();
    wall += 120000;
    server += 120000;
    initial.resolve(oldCatalogue);
    await initialize;
    expect(clock.sampled).toBe(false);

    const oldRestore = result(snapshot("underpaid"));
    const restore = controller.restore("AQH-100306-PMT");
    wall += 30000;
    server += 30000;
    restoring.resolve(oldRestore);
    expect(await restore).toBe("restored");
    expect(clock.sampled).toBe(false);
    expect(controller.availability.value).not.toBe("usable");
    // Neither acceptance nor the ticker may latch expiry from the wall fallback.
    await vi.advanceTimersByTimeAsync(250);
    expect(controller.availability.value).not.toBe("usable");

    await controller.retry();
    expect(clock.sampled).toBe(true);
    expect(controller.payment.value).toEqual(snapshot("underpaid"));
    expect(controller.health.value).toBe("fresh");
    expect(controller.remaining.value).toBe(150000);
    expect(controller.availability.value).toBe("usable");
    expect(client.status).toHaveBeenCalledTimes(2);
    expect(client.create).not.toHaveBeenCalled();
    expect(client.requote).not.toHaveBeenCalled();
  });
});
