import type { Currency, Pair, Payment } from "../domain/paymentModel";
import { catalogueSchema, parsePayment } from "./responseSchemas";
import type { CatalogueInfo } from "./responseSchemas";
export interface ApiResult<T> {
  data: T;
  serverTime: string;
  start: number;
  end: number;
}
export interface PaymentClient {
  catalogue?(signal: AbortSignal): Promise<ApiResult<CatalogueInfo>>;
  currencies(signal: AbortSignal): Promise<ApiResult<Currency[]>>;
  create(pair: Pair, signal: AbortSignal): Promise<ApiResult<Payment>>;
  status(reference: string, signal: AbortSignal): Promise<ApiResult<Payment>>;
  requote(
    reference: string,
    pair: Pair,
    signal: AbortSignal,
  ): Promise<ApiResult<Payment>>;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
    public protocol = false,
  ) {
    super(message);
  }
}
export function createPaymentClient(
  base = "/api",
  orderId = "ORD-88213",
): PaymentClient {
  // Keep the legacy default URL for consumers that stub the plain catalogue.
  const cataloguePath =
    orderId === "ORD-88213"
      ? "/currencies"
      : "/currencies?order_id=" + encodeURIComponent(orderId);
  function parseOrderPayment(value: unknown): Payment {
    const payment = parsePayment(value);
    if (payment.order_id !== orderId) throw Error("Unexpected payment order");
    return payment;
  }
  function parseCatalogue(value: unknown): CatalogueInfo {
    const catalogue = catalogueSchema.parse(value);
    if (catalogue.order && catalogue.order.order_id !== orderId)
      throw Error("Unexpected catalogue order");
    return catalogue;
  }
  async function request<T>(
    path: string,
    signal: AbortSignal,
    parse: (v: unknown) => T,
    input?: unknown,
  ): Promise<ApiResult<T>> {
    const start = performance.now();
    const response = await fetch(base + path, {
      method: input ? "POST" : "GET",
      signal,
      cache: "no-store",
      headers: input ? { "Content-Type": "application/json" } : {},
      body: input ? JSON.stringify(input) : undefined,
    });
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ApiError(
        response.ok
          ? "The payment server returned invalid JSON. Transfer controls are paused."
          : `HTTP ${response.status}`,
        response.ok ? 0 : response.status,
        response.ok,
      );
    }
    if (!response.ok) {
      const problem = (value && typeof value === "object" ? value : {}) as {
        detail?: string;
        title?: string;
      };
      throw new ApiError(
        problem.detail || problem.title || `HTTP ${response.status}`,
        response.status,
      );
    }
    try {
      const serverTime = response.headers.get("x-server-time");
      if (!serverTime || !Number.isFinite(Date.parse(serverTime)))
        throw Error("Missing server time");
      return { data: parse(value), serverTime, start, end: performance.now() };
    } catch {
      throw new ApiError(
        "The payment server returned invalid data. Transfer controls are paused.",
        0,
        true,
      );
    }
  }
  return {
    catalogue: (signal) => request(cataloguePath, signal, parseCatalogue),
    currencies: (signal) =>
      request(cataloguePath, signal, (v) => parseCatalogue(v).currencies),
    create: (pair, signal) =>
      request("/payments", signal, parseOrderPayment, {
        order_id: orderId,
        ...pair,
      }),
    status: (ref, signal) =>
      request(
        "/payments/" + encodeURIComponent(ref),
        signal,
        parseOrderPayment,
      ),
    requote: (ref, pair, signal) =>
      request(
        "/payments/" + encodeURIComponent(ref) + "/requote",
        signal,
        parseOrderPayment,
        pair,
      ),
  };
}
