import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
const scopes: EffectScope[] = [];
function sample<T>(data: T): ApiResult<T> {
  return {
    data,
    serverTime: new Date(Date.now()).toISOString(),
    start: Date.now() - fixed,
    end: Date.now() - fixed,
  };
}
function setup() {
  const client = {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      sample(currencies),
    ),
    create: vi.fn<PaymentClient["create"]>(async () =>
      sample(paymentSnapshot() as Payment),
    ),
    status: vi.fn<PaymentClient["status"]>(async () =>
      sample(paymentSnapshot() as Payment),
    ),
    requote: vi.fn<PaymentClient["requote"]>(async () =>
      sample(paymentSnapshot() as Payment),
    ),
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
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("keeps merchant and order only, with no accepted payment, deadline or polling", async () => {
  const { client, controller } = setup();
  await controller.initialize();
  await controller.loadCheckoutInformation();
  expect(controller.merchant.value).toEqual({ name: "Payment Project", logo_url: null });
  expect(controller.order.value).toEqual({
    order_id: "ORD-88213",
    amount: "149.90",
    currency: "EUR",
  });
  expect(controller.payment.value).toBeNull();
  expect(controller.lastChecked.value).toBeNull();
  expect(controller.remaining.value).toBe(0);
  expect(controller.availability.value).toBe("unavailable");
  expect(controller.canChange.value).toBe(true);
  await vi.advanceTimersByTimeAsync(900001);
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
  await controller.retry();
  await controller.loadCheckoutInformation();
  expect(client.status).not.toHaveBeenCalled();
  expect(client.create).toHaveBeenCalledTimes(1);
  expect(controller.canChange.value).toBe(true);
  expect(controller.payment.value).toBeNull();
});

it("same-pair Continue accepts only the second response and starts its polling", async () => {
  const { client, controller } = setup();
  await controller.initialize();
  await controller.loadCheckoutInformation();
  await vi.advanceTimersByTimeAsync(300000);
  const actual = {
    ...paymentSnapshot(),
    payment_reference: "ACTUAL-200-PMT",
    quote: {
      ...paymentSnapshot().quote,
      crypto_address: "TActualFreshTransferAddress",
      total_due: "200.00",
      expires_at: "2026-08-14T08:57:10.842Z",
    },
  } as Payment;
  client.create.mockResolvedValueOnce(sample(actual));
  client.status.mockResolvedValue(sample(actual));
  await controller.create();
  expect(client.create).toHaveBeenCalledTimes(2);
  expect(client.create.mock.calls.map(([pair]) => pair)).toEqual([
    { currency: "USDT", network: "tron" },
    { currency: "USDT", network: "tron" },
  ]);
  expect(controller.payment.value?.payment_reference).toBe("ACTUAL-200-PMT");
  expect(controller.payment.value?.quote.crypto_address).toBe(
    "TActualFreshTransferAddress",
  );
  expect(controller.payment.value?.quote.total_due).toBe("200.00");
  expect(controller.remaining.value).toBe(900000);
  expect(controller.availability.value).toBe("usable");
  await vi.advanceTimersByTimeAsync(2000);
  expect(client.status).toHaveBeenCalledExactlyOnceWith(
    "ACTUAL-200-PMT",
    expect.any(AbortSignal),
  );
});

it.each([
  new ApiError("Server error", 500),
  new TypeError("Disconnected"),
  new ApiError("Malformed response", 0, true),
])("locks an uncertain information POST: %s", async (error) => {
  const { client, controller } = setup();
  await controller.initialize();
  client.create.mockRejectedValueOnce(error);
  await controller.loadCheckoutInformation();
  expect(controller.uncertain.value).toBe(true);
  expect(controller.merchant.value).toBeNull();
  expect(controller.order.value).toBeNull();
  await controller.loadCheckoutInformation();
  await controller.create();
  await controller.retry();
  expect(client.create).toHaveBeenCalledTimes(1);
});

it("keeps verified display information when the real Continue POST fails", async () => {
  const { client, controller } = setup();
  await controller.initialize();
  await controller.loadCheckoutInformation();
  client.create.mockRejectedValueOnce(new ApiError("Server error", 500));
  await controller.create();
  expect(controller.order.value?.amount).toBe("149.90");
  expect(controller.merchant.value?.name).toBe("Payment Project");
  expect(controller.payment.value).toBeNull();
  expect(controller.uncertain.value).toBe(true);
  await controller.create();
  expect(client.create).toHaveBeenCalledTimes(2);
});

it("does not retain a late information response after disposal", async () => {
  const { client, controller, scope } = setup();
  await controller.initialize();
  let resolve!: (value: ApiResult<Payment>) => void;
  client.create.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = controller.loadCheckoutInformation();
  scope.stop();
  resolve(sample(paymentSnapshot() as Payment));
  await pending;
  expect(controller.order.value).toBeNull();
  expect(controller.merchant.value).toBeNull();
  expect(controller.payment.value).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
