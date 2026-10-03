import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { effectScope, type EffectScope } from "vue";
import { usePaymentController } from "../../src/features/checkout/application/usePaymentController";
import { ClockService } from "../../src/features/checkout/infrastructure/ClockService";
import type {
  ApiResult,
  PaymentClient,
} from "../../src/features/checkout/infrastructure/paymentClient";
import type {
  Currency,
  CurrencyCode,
  Payment,
} from "../../src/features/checkout/domain/paymentModel";
import { catalogueRows, paymentSnapshot } from "../fixtures/oracles";

const now = Date.parse("2026-08-14T08:37:10.842Z");
const scopes: EffectScope[] = [];
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
const sample = <T>(data: T): ApiResult<T> => ({
  data,
  serverTime: "2026-08-14T08:37:10.842Z",
  start: 0,
  end: 0,
});

function legacyClient() {
  const payment = paymentSnapshot() as unknown as Payment;
  return {
    currencies: vi.fn<PaymentClient["currencies"]>(async () =>
      sample(currencies),
    ),
    create: vi.fn<PaymentClient["create"]>(async () => sample(payment)),
    status: vi.fn<PaymentClient["status"]>(async () => sample(payment)),
    requote: vi.fn<PaymentClient["requote"]>(async () => sample(payment)),
  };
}

function setup(client: PaymentClient) {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() =>
    usePaymentController({
      client,
      clock: new ClockService(
        () => 0,
        () => now,
      ),
    }),
  )!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});

it("ignores legacy catalogue order and merchant metadata until a payment arrives", async () => {
  const client = {
    ...legacyClient(),
    catalogue: vi.fn<NonNullable<PaymentClient["catalogue"]>>(async () =>
      sample({
        currencies,
        order: { order_id: "ORD-88213", currency: "EUR", amount: "250.00" },
        merchant: { name: "Configured merchant", logo_url: null },
      }),
    ),
  };
  const controller = setup(client);
  await controller.initialize();

  expect(client.catalogue).toHaveBeenCalledTimes(1);
  expect(client.currencies).not.toHaveBeenCalled();
  expect(controller.currencies.value).toEqual(currencies);
  expect(controller.order.value).toBeNull();
  expect(controller.merchant.value).toBeNull();
  expect(controller.payment.value).toBeNull();
  expect(controller.health.value).toBe("fresh");
  expect(client.create).not.toHaveBeenCalled();
  expect(client.status).not.toHaveBeenCalled();
});

it("continues to initialize and create with a four-method injected payment client", async () => {
  const client = legacyClient();
  const controller = setup(client);
  await controller.initialize();

  expect(client.currencies).toHaveBeenCalledTimes(1);
  expect(controller.currencies.value).toEqual(currencies);
  expect(controller.health.value).toBe("fresh");
  expect(controller.error.value).toBe("");
  expect(controller.order.value).toBeNull();
  expect(controller.merchant.value).toBeNull();
  await controller.create({ currency: "USDT", network: "tron" });
  expect(client.create).toHaveBeenCalledTimes(1);
  expect(controller.payment.value?.order.amount).toBe("149.90");
  expect(controller.payment.value?.quote.total_due).toBe("163.69");
});
