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
function payment(): Payment {
  return {
    ...paymentSnapshot(),
    merchant: { name: "Nordwind Audio" },
    order: { amount: "250.00", currency: "USD" },
  } as Payment;
}
const sample = <T>(data: T): ApiResult<T> => ({
  data,
  serverTime: new Date(Date.now()).toISOString(),
  start: Date.now() - fixed,
  end: Date.now() - fixed,
});
const scopes: EffectScope[] = [];
function setup() {
  const client = {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      sample(currencies),
    ),
    create: vi.fn<PaymentClient["create"]>(async () => sample(payment())),
    status: vi.fn<PaymentClient["status"]>(async () => sample(payment())),
    requote: vi.fn<PaymentClient["requote"]>(async () => sample(payment())),
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
describe("initial information comes from an ordinary live payment", () => {
  it("loads the catalogue without inventing merchant metadata or a payment", async () => {
    const { client, controller } = setup();
    const store = vi.spyOn(Storage.prototype, "setItem");
    await controller.initialize();
    expect(controller.draft.value).toEqual({
      currency: "USDT",
      network: "tron",
    });
    expect(controller.merchant.value).toBeNull();
    expect(controller.order.value).toBeNull();
    expect(controller.payment.value).toBeNull();
    expect(controller.remaining.value).toBe(0);
    expect(controller.canChange.value).toBe(true);
    expect(controller.availability.value).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(30000);
    expect(client.status).not.toHaveBeenCalled();
    expect(client.create).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
  it("accepts normal creation as a live payment, reads its metadata, and polls it", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    await controller.create();
    expect(client.currencies.mock.invocationCallOrder[0]).toBeLessThan(
      client.create.mock.invocationCallOrder[0]!,
    );
    expect(client.create).toHaveBeenCalledWith(
      { currency: "USDT", network: "tron" },
      expect.any(AbortSignal),
    );
    expect(controller.payment.value?.payment_reference).toBe("AQH-100306-PMT");
    expect(controller.payment.value?.status).toBe("awaiting_payment");
    expect(controller.merchant.value).toEqual({ name: "Nordwind Audio" });
    expect(controller.order.value).toEqual({
      order_id: "ORD-88213",
      amount: "250.00",
      currency: "USD",
    });
    expect(controller.remaining.value).toBe(900000);
    expect(controller.availability.value).toBe("usable");
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.status).toHaveBeenCalledTimes(1);
    expect(client.status).toHaveBeenCalledWith(
      "AQH-100306-PMT",
      expect.any(AbortSignal),
    );
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it("uses the first currency and network when the API catalogue is reordered", async () => {
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
    const reordered = payment();
    reordered.quote = {
      ...reordered.quote,
      crypto_currency: "USDC",
      network: "polygon",
      network_name: "Polygon",
      network_fee: "0.10",
      total_due: "162.79",
      required_confirmations: 6,
      crypto_address: "0x3333333333333333333333333333333333333333",
    };
    client.create.mockResolvedValue(sample(reordered));
    await controller.initialize();
    expect(controller.draft.value).toEqual({
      currency: "USDC",
      network: "polygon",
    });
    await controller.create();
    expect(client.create).toHaveBeenCalledWith(
      { currency: "USDC", network: "polygon" },
      expect.any(AbortSignal),
    );
    expect(controller.payment.value?.quote.network).toBe("polygon");
  });
  it.each([
    new TypeError("Disconnected"),
    new ApiError("HTTP 500", 500),
    new ApiError("Invalid data", 0, true),
  ])(
    "locks an uncertain initial POST after $message instead of retrying it",
    async (error) => {
      const { client, controller } = setup();
      await controller.initialize();
      client.create.mockRejectedValueOnce(error);
      await controller.create();
      expect(controller.health.value).toBe("unavailable");
      expect(controller.uncertain.value).toBe(true);
      expect(controller.canChange.value).toBe(false);
      expect(controller.payment.value).toBeNull();
      await controller.retry();
      await controller.create();
      await vi.advanceTimersByTimeAsync(30000);
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(client.status).not.toHaveBeenCalled();
    },
  );
  it("aborts a timed-out creation and prevents an unsafe retry", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    client.create.mockImplementationOnce(
      (_pair, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    const pending = controller.create();
    await vi.advanceTimersByTimeAsync(10000);
    await pending;
    expect(client.create.mock.calls[0]![1].aborted).toBe(true);
    expect(controller.uncertain.value).toBe(true);
    expect(controller.canChange.value).toBe(false);
    await controller.retry();
    await controller.create();
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it("rejects a response on the wrong requested pair and locks further creation", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    client.create.mockResolvedValue(
      sample({
        ...payment(),
        quote: { ...payment().quote, network: "ethereum" },
      }),
    );
    await controller.create();
    expect(controller.payment.value).toBeNull();
    expect(controller.canChange.value).toBe(false);
    expect(controller.uncertain.value).toBe(true);
    await controller.create();
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it("allows a later explicit create after a definitive rejected request", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    client.create.mockRejectedValueOnce(new ApiError("Unsupported pair", 400));
    await controller.create();
    expect(controller.uncertain.value).toBe(false);
    expect(controller.payment.value).toBeNull();
    await controller.create();
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(controller.payment.value?.status).toBe("awaiting_payment");
  });
  it("restores a saved payment without creating another payment, even after a GET failure", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    client.status.mockRejectedValueOnce(new ApiError("HTTP 500", 500));
    expect(await controller.restore("AQH-100306-PMT")).toBe("unavailable");
    expect(controller.canChange.value).toBe(false);
    expect(client.create).not.toHaveBeenCalled();
    await controller.create();
    expect(client.create).not.toHaveBeenCalled();
    expect(await controller.retry()).toBe("restored");
    expect(client.create).not.toHaveBeenCalled();
    expect(controller.merchant.value?.name).toBe("Nordwind Audio");
  });
  it("reports a missing saved reference without creating implicitly", async () => {
    const { client, controller } = setup();
    await controller.initialize();
    client.status.mockRejectedValueOnce(new ApiError("Unknown payment", 404));
    expect(await controller.restore("missing")).toBe("not-found");
    expect(controller.referenceMissing.value).toBe(true);
    expect(controller.payment.value).toBeNull();
    expect(controller.order.value).toBeNull();
    expect(client.create).not.toHaveBeenCalled();
    await controller.create();
    expect(controller.referenceMissing.value).toBe(false);
    expect(controller.payment.value?.payment_reference).toBe("AQH-100306-PMT");
  });
  it("serializes catalogue initialization with restoration", async () => {
    const { client, controller } = setup();
    let resolve!: (value: ApiResult<Currency[]>) => void;
    client.currencies.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const initializing = controller.initialize();
    const restoring = controller.restore("AQH-100306-PMT");
    expect(client.status).not.toHaveBeenCalled();
    resolve(sample(currencies));
    await initializing;
    expect(await restoring).toBe("restored");
    expect(client.currencies).toHaveBeenCalledTimes(1);
    expect(client.create).not.toHaveBeenCalled();
    expect(controller.order.value?.amount).toBe("250.00");
  });
  it("disposal aborts and ignores a late creation reply", async () => {
    const { client, controller, scope } = setup();
    await controller.initialize();
    let resolve!: (value: ApiResult<Payment>) => void;
    client.create.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = controller.create();
    expect(client.create).toHaveBeenCalledTimes(1);
    scope.stop();
    expect(client.create.mock.calls[0]![1].aborted).toBe(true);
    resolve(sample(payment()));
    await pending;
    expect(controller.payment.value).toBeNull();
    expect(controller.order.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retries a failed catalogue GET without implicitly posting a payment", async () => {
    const { client, controller } = setup();
    client.currencies.mockRejectedValueOnce(new ApiError("HTTP 500", 500));
    await controller.initialize();
    expect(controller.health.value).toBe("unavailable");
    expect(controller.uncertain.value).toBe(false);
    await controller.retry();
    expect(client.currencies).toHaveBeenCalledTimes(2);
    expect(client.create).not.toHaveBeenCalled();
    await controller.create();
    expect(client.create).toHaveBeenCalledTimes(1);
  });
  it("rejects an empty catalogue without posting a fallback pair", async () => {
    const { client, controller } = setup();
    client.currencies.mockResolvedValue(sample([]));
    await controller.initialize();
    expect(controller.canChange.value).toBe(false);
    await controller.create();
    expect(client.create).not.toHaveBeenCalled();
  });
});
