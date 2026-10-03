import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import { usePaymentController } from "../../src/features/checkout/application/usePaymentController";
import { ClockService } from "../../src/features/checkout/infrastructure/ClockService";
import {
  ApiError,
  type ApiResult,
} from "../../src/features/checkout/infrastructure/paymentClient";
import type {
  Currency,
  Payment,
} from "../../src/features/checkout/domain/paymentModel";
import { paymentSnapshot } from "../fixtures/oracles";
const fixed = Date.parse("2026-08-14T08:37:10.842Z");
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
function initial(): Payment {
  return {
    ...paymentSnapshot("expired"),
    merchant: { name: "Nordwind Audio" },
    order: { amount: "250.00", currency: "USD" },
    quote: {
      ...paymentSnapshot().quote,
      expires_at: "2026-08-14T08:37:10.842Z",
    },
    expired_at: "2026-08-14T08:37:10.842Z",
    payment_reference: "BOOT-1-PMT",
  } as Payment;
}
const sample = <T>(data: T): ApiResult<T> => ({
  data,
  serverTime: new Date(Date.now()).toISOString(),
  start: 0,
  end: 0,
});
const scopes: EffectScope[] = [];
function setup() {
  const client = {
    currencies: vi.fn(async () => sample(currencies)),
    bootstrap: vi.fn<
      (
        pair: { currency: string; network: string },
        signal: AbortSignal,
      ) => Promise<ApiResult<Payment>>
    >(async () => sample(initial())),
    create: vi.fn(async () => sample(paymentSnapshot() as Payment)),
    status: vi.fn<
      (reference: string, signal: AbortSignal) => Promise<ApiResult<Payment>>
    >(async () => sample(paymentSnapshot() as Payment)),
    requote: vi.fn(async () => sample(paymentSnapshot() as Payment)),
  };
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() =>
    usePaymentController({
      client,
      clock: new ClockService(
        () => Date.now() - fixed,
        () => Date.now(),
      ),
    }),
  )!;
  return { client, controller, scope };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(fixed);
});
afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop());
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("initial payment information is not a live quote", () => {
  it("loads currencies before the first pair, retaining metadata only and scheduling no polls", async () => {
    const { client, controller } = setup();
    const store = vi.spyOn(Storage.prototype, "setItem");
    expect(controller.canChange.value).toBe(false);
    await controller.initialize();
    expect(client.currencies.mock.invocationCallOrder[0]).toBeLessThan(
      client.bootstrap.mock.invocationCallOrder[0]!,
    );
    expect(client.bootstrap).toHaveBeenCalledWith(
      { currency: "USDT", network: "tron" },
      expect.any(AbortSignal),
    );
    expect(controller.merchant.value).toEqual({ name: "Nordwind Audio" });
    expect(controller.order.value).toEqual({
      amount: "250.00",
      currency: "USD",
    });
    expect(controller.payment.value).toBeNull();
    expect(controller.remaining.value).toBe(0);
    expect(controller.canChange.value).toBe(true);
    expect(controller.availability.value).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(30000);
    expect(client.status).not.toHaveBeenCalled();
    expect(client.create).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
  it("uses the catalogue first currency/network even when reordered", async () => {
    const { client, controller } = setup();
    client.currencies.mockResolvedValue(
      sample([
        {
          code: "USDC",
          name: "USD Coin",
          decimals: 6,
          networks: [
            {
              id: "polygon",
              name: "Polygon",
              network_fee: "0.10",
              required_confirmations: 6,
              avg_confirmation_seconds: 30,
            },
          ],
        },
        ...currencies,
      ]),
    );
    const payment = initial();
    payment.quote = {
      ...payment.quote,
      crypto_currency: "USDC",
      network: "polygon",
    };
    client.bootstrap.mockResolvedValue(sample(payment));
    await controller.initialize();
    expect(client.bootstrap.mock.calls[0]![0]).toEqual({
      currency: "USDC",
      network: "polygon",
    });
    expect(controller.draft.value).toEqual({
      currency: "USDC",
      network: "polygon",
    });
  });
  it.each([
    new TypeError("Disconnected"),
    new ApiError("HTTP 500", 500),
    new ApiError("Invalid data", 0, true),
  ])(
    "retries only bootstrap after $message, without an uncertain mutation lock",
    async (error) => {
      const { client, controller } = setup();
      client.bootstrap.mockRejectedValueOnce(error);
      await controller.initialize();
      expect(controller.health.value).toBe("unavailable");
      expect(controller.canChange.value).toBe(false);
      expect(controller.uncertain.value).toBe(false);
      await controller.create();
      expect(client.create).not.toHaveBeenCalled();
      await controller.retry();
      expect(client.bootstrap).toHaveBeenCalledTimes(2);
      expect(client.currencies).toHaveBeenCalledTimes(1);
      expect(controller.canChange.value).toBe(true);
    },
  );
  it("aborts a timed-out bootstrap and can retry", async () => {
    const { client, controller } = setup();
    client.bootstrap.mockImplementationOnce(
      (_pair, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    const pending = controller.initialize();
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(client.bootstrap.mock.calls[0]![1].aborted).toBe(true);
    expect(controller.canChange.value).toBe(false);
    await controller.retry();
    expect(controller.canChange.value).toBe(true);
  });
  it("does not fetch initial information when restoring, including unavailable restoration", async () => {
    const { client, controller } = setup();
    await controller.initialize({ restore: true });
    client.status.mockRejectedValueOnce(new ApiError("HTTP 500", 500));
    expect(await controller.restore("AQH-100306-PMT")).toBe("unavailable");
    expect(controller.canChange.value).toBe(false);
    expect(client.bootstrap).not.toHaveBeenCalled();
    expect(await controller.retry()).toBe("restored");
    expect(client.bootstrap).not.toHaveBeenCalled();
    expect(controller.merchant.value?.name).toBe("Payment Project");
  });
  it("loads initial information after a restored reference returns 404", async () => {
    const { client, controller } = setup();
    await controller.initialize({ restore: true });
    client.status.mockRejectedValueOnce(new ApiError("Unknown payment", 404));
    expect(await controller.restore("missing")).toBe("not-found");
    expect(controller.referenceMissing.value).toBe(true);
    expect(client.bootstrap).toHaveBeenCalledTimes(1);
    expect(controller.payment.value).toBeNull();
    expect(controller.order.value?.amount).toBe("250.00");
  });
  it("continues with a new payment and gives its metadata priority", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    await vi.advanceTimersByTimeAsync(300000);
    client.create.mockResolvedValue(
      sample({
        ...paymentSnapshot(),
        quote: {
          ...paymentSnapshot().quote,
          expires_at: "2026-08-14T08:57:10.842Z",
        },
      } as Payment),
    );
    await controller.create();
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(controller.payment.value?.payment_reference).toBe("AQH-100306-PMT");
    expect(controller.order.value?.amount).toBe("149.90");
    expect(controller.remaining.value).toBe(900000);
  });
  it("refreshes initial order information on retry before any real payment", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    client.bootstrap.mockResolvedValue(
      sample({ ...initial(), order: { currency: "USD", amount: "80.00" } }),
    );
    await controller.retry();
    expect(controller.order.value?.amount).toBe("80.00");
    expect(client.create).not.toHaveBeenCalled();
  });
  it("serializes an in-flight bootstrap with restore and ignores its late metadata", async () => {
    const { client, controller } = setup();
    let resolve!: (value: ApiResult<Payment>) => void;
    client.bootstrap.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const initializing = controller.initialize();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(client.bootstrap).toHaveBeenCalledTimes(1);
    const restoring = controller.restore("AQH-100306-PMT");
    expect(client.status).not.toHaveBeenCalled();
    resolve(sample(initial()));
    await initializing;
    expect(await restoring).toBe("restored");
    expect(controller.order.value?.amount).toBe("149.90");
    expect(controller.merchant.value?.name).toBe("Payment Project");
  });
  it("disposal aborts and ignores a late bootstrap reply", async () => {
    const { client, controller, scope } = setup();
    let resolve!: (value: ApiResult<Payment>) => void;
    client.bootstrap.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = controller.initialize();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    scope.stop();
    expect(client.bootstrap.mock.calls[0]![1].aborted).toBe(true);
    resolve(sample(initial()));
    await pending;
    expect(controller.order.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects an empty catalogue without posting any fallback pair", async () => {
    const { client, controller } = setup();
    client.currencies.mockResolvedValue(sample([]));
    await controller.initialize();
    expect(controller.canChange.value).toBe(false);
    expect(client.bootstrap).not.toHaveBeenCalled();
  });
});
