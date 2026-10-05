import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, nextTick, type EffectScope } from "vue";
import { usePaymentController } from "../../src/features/checkout/application/usePaymentController";
import { ClockService } from "../../src/features/checkout/infrastructure/ClockService";
import {
  ApiError,
  type ApiResult,
  type PaymentClient,
} from "../../src/features/checkout/infrastructure/paymentClient";
import type {
  Currency,
  CurrencyCode,
  Pair,
  Payment,
} from "../../src/features/checkout/domain/paymentModel";
import { catalogueRows, fixedNow, paymentSnapshot } from "../fixtures/oracles";

const pair: Pair = { currency: "USDT", network: "tron" };
const scopes: EffectScope[] = [];
const sample = <T>(data: T): ApiResult<T> => ({
  data,
  serverTime: new Date(Date.now()).toISOString(),
  start: Date.now() - fixedNow,
  end: Date.now() - fixedNow,
});
const payment = (
  status: Parameters<typeof paymentSnapshot>[0] = "awaiting_payment",
) => paymentSnapshot(status) as unknown as Payment;
const currencies: Currency[] = (["USDT", "USDC", "ETH"] as CurrencyCode[]).map(
  (code) => ({
    code,
    name: code,
    decimals: code === "ETH" ? 18 : 6,
    networks: catalogueRows
      .filter((row) => row[0] === code)
      .map((row) => ({
        id: row[2],
        name: row[3],
        network_fee: row[4],
        required_confirmations: row[5],
        avg_confirmation_seconds: row[6],
      })),
  }),
);

async function setup(
  initial = payment(),
  clock = new ClockService(
    () => Date.now() - fixedNow,
    () => Date.now(),
  ),
) {
  let current = initial;
  const client = {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      sample(currencies),
    ),
    create: vi.fn<PaymentClient["create"]>(async () => sample(current)),
    status: vi.fn<PaymentClient["status"]>(async () => sample(current)),
    requote: vi.fn<PaymentClient["requote"]>(async () => sample(current)),
  };
  const scope = effectScope();
  scopes.push(scope);
  const controller = scope.run(() =>
    usePaymentController({ client, clock, pollMs: 2000, timeoutMs: 10000 }),
  )!;
  await controller.initialize();
  await controller.create(pair);
  await nextTick();
  return {
    controller,
    client,
    scope,
    setCurrent(value: Payment) {
      current = value;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(fixedNow);
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});

it("T09 disposed 409 reconciliation cannot publish a late successful response", async () => {
  const { controller, client, scope } = await setup();
  let finish: ((value: ApiResult<Payment>) => void) | undefined;
  let pendingSignal: AbortSignal | undefined;
  client.create.mockRejectedValueOnce(
    new ApiError("Quote conflict before disposal", 409),
  );
  client.status.mockImplementation((_reference, signal) => {
    pendingSignal = signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = controller.create({ currency: "USDT", network: "ethereum" });
  // Wait for the genuine 409 recovery GET rather than relying on a fixed sleep.
  await vi.waitFor(() => expect(client.status).toHaveBeenCalledTimes(1));
  expect(controller.error.value).toBe("Quote conflict before disposal");
  scope.stop();
  expect(pendingSignal?.aborted).toBe(true);
  const atDisposal = {
    error: controller.error.value,
    health: controller.health.value,
    payment: controller.payment.value,
    availability: controller.availability.value,
  };
  finish!(sample(payment()));
  await pending;
  expect(controller.error.value).toBe(atDisposal.error);
  expect({
    error: controller.error.value,
    health: controller.health.value,
    payment: controller.payment.value,
    availability: controller.availability.value,
  }).toEqual(atDisposal);
  expect(vi.getTimerCount()).toBe(0);
});

it("T09 disposed 409 reconciliation cannot publish a late transport rejection", async () => {
  const { controller, client, scope } = await setup();
  let rejectStatus: ((error: unknown) => void) | undefined;
  let pendingSignal: AbortSignal | undefined;
  client.create.mockRejectedValueOnce(
    new ApiError("Quote conflict before disposal", 409),
  );
  client.status.mockImplementation((_reference, signal) => {
    pendingSignal = signal;
    return new Promise((_resolve, reject) => {
      rejectStatus = reject;
    });
  });
  const pending = controller.create({ currency: "USDT", network: "ethereum" });
  await vi.waitFor(() => expect(client.status).toHaveBeenCalledTimes(1));
  expect(controller.error.value).toBe("Quote conflict before disposal");
  scope.stop();
  expect(pendingSignal?.aborted).toBe(true);
  const atDisposal = {
    error: controller.error.value,
    health: controller.health.value,
    payment: controller.payment.value,
  };
  rejectStatus!(new TypeError("Late reconciliation network failure"));
  await pending;
  expect(controller.error.value).toBe(atDisposal.error);
  expect(controller.health.value).toBe(atDisposal.health);
  expect(controller.payment.value).toBe(atDisposal.payment);
  expect(vi.getTimerCount()).toBe(0);
});

it("T09 disposed pre-requote reconciliation cannot issue a later POST", async () => {
  const { controller, client, scope, setCurrent } = await setup();
  setCurrent(payment("expired"));
  await controller.retry();
  expect(controller.payment.value?.status).toBe("expired");
  let finish: ((value: ApiResult<Payment>) => void) | undefined;
  let pendingSignal: AbortSignal | undefined;
  client.status.mockImplementation((_reference, signal) => {
    pendingSignal = signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = controller.requote();
  await vi.waitFor(() => expect(client.status).toHaveBeenCalledTimes(2));
  scope.stop();
  expect(pendingSignal?.aborted).toBe(true);
  finish!(sample(payment("expired")));
  await pending;
  expect(client.requote).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
