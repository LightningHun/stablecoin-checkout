import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { MOCK_LINK_SECRET } from "./config";
import { orderIdSchema } from "../src/features/checkout/infrastructure/responseSchemas";
import type { IncomingMessage, ServerResponse } from "node:http";
import { catalogue } from "./catalogue";
import { makePayment, withStatus } from "./fixtures";
import { defaultScenario, normalizeOrderAmount } from "./scenarios";
import {
  hasFunds,
  statuses,
} from "../src/features/checkout/domain/paymentModel";
import type {
  Pair,
  Payment,
  PaymentStatus,
} from "../src/features/checkout/domain/paymentModel";
export function createMockServer(options: { now?: () => number } = {}) {
  let scenario = defaultScenario(),
    sequence = 100306,
    orderSequence = 88214;
  const orders = new Map<
    string,
    { current: Payment | null; fundsObserved: boolean }
  >([["ORD-88213", { current: null, fundsObserved: false }]]);
  // Only registered orders can receive amount configuration or payment attempts.
  const orderAmounts = new Map<string, string>();
  const orderAmount = (orderId: string) =>
    orderAmounts.get(orderId) ?? "149.90";
  const scenarioFor = (orderId: string) => ({
    ...scenario,
    orderAmount: orderAmount(orderId),
  });
  const payments = new Map<string, Payment>();
  const confirmationReachedAt = new Map<string, number>();
  let frozen: number | null = null,
    offset = 0;
  const now = () => frozen ?? (options.now?.() ?? Date.now()) + offset;
  const metrics = { gets: 0, posts: 0, activeGets: 0, maxActiveGets: 0 };
  const json = (
    res: ServerResponse,
    status: number,
    body: unknown,
    problem = false,
  ) => {
    res.writeHead(status, {
      "Content-Type": problem ? "application/problem+json" : "application/json",
      "Cache-Control": "no-store",
      "x-server-time": new Date(now()).toISOString(),
    });
    res.end(JSON.stringify(body));
  };
  const conflict = (res: ServerResponse, title: string, detail: string) =>
    json(
      res,
      409,
      {
        type: "https://developers.triple-a.io/errors/quote-not-expired",
        title,
        status: 409,
        detail,
      },
      true,
    );
  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    let data = "";
    for await (const chunk of req) {
      data += chunk;
      if (data.length > 10000) throw Error("Body too large");
    }
    return data ? (JSON.parse(data) as Record<string, unknown>) : {};
  }
  function readOrderId(value: unknown = "ORD-88213"): string {
    if (
      typeof value !== "string" ||
      !orderIdSchema.safeParse(value).success ||
      !orders.has(value)
    )
      throw Error("Unknown order");
    return value;
  }
  function signature(orderId: string) {
    return createHmac("sha256", MOCK_LINK_SECRET)
      .update(orderId)
      .digest("hex")
      .slice(0, 16);
  }
  async function injectFault(req: IncomingMessage, res: ServerResponse) {
    if (scenario.fault === "slow")
      await new Promise((resolve) => setTimeout(resolve, scenario.delayMs));
    if (scenario.fault === "disconnect") {
      req.socket.destroy();
      return true;
    }
    if (scenario.fault === "500") {
      json(res, 500, { title: "Temporary payment server error" });
      return true;
    }
    return false;
  }
  function save(p: Payment, reachedAt = now()) {
    const order = orders.get(p.order_id) ?? {
      current: null,
      fundsObserved: false,
    };
    order.fundsObserved ||= hasFunds(p.status);
    if (p.status === "detected" || p.status === "confirming")
      confirmationReachedAt.set(p.payment_reference, reachedAt);
    else confirmationReachedAt.delete(p.payment_reference);
    payments.set(p.payment_reference, p);
    order.current = p;
    orders.set(p.order_id, order);
    return p;
  }
  function refresh(p: Payment) {
    if (
      p.status === "awaiting_payment" &&
      Date.parse(p.quote.expires_at) <= now()
    )
      return save(withStatus(p, "expired", now()));
    if (p.status !== "detected" && p.status !== "confirming") return p;

    const reachedAt = confirmationReachedAt.get(p.payment_reference);
    const network = catalogue
      .find((currency) => currency.code === p.quote.crypto_currency)
      ?.networks.find((entry) => entry.id === p.quote.network);
    if (reachedAt === undefined || !network) return p;
    const intervalMs = network.avg_confirmation_seconds * 1000;
    const elapsed = Math.floor((now() - reachedAt) / intervalMs);
    if (elapsed <= 0) return p;

    const gained = Math.min(
      elapsed,
      p.required_confirmations - p.confirmations,
    );
    const confirmations = p.confirmations + gained;
    // Retain partial intervals and settle at the due time, even on a late read.
    const advancedAt = reachedAt + gained * intervalMs;
    const advanced = withStatus(
      p,
      confirmations === p.required_confirmations ? "paid" : "confirming",
      advancedAt,
    );
    if (advanced.status === "confirming" || advanced.status === "paid")
      return save(
        { ...advanced, confirmations, tx_hash: p.tx_hash },
        advancedAt,
      );
    return p;
  }
  let resetRevision = 0;
  return createServer(async (req, res) => {
    const requestRevision = resetRevision;
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    try {
      if (path === "/api/demo/reset" && req.method === "POST") {
        const input = await body(req);
        const nextScenario = defaultScenario();
        if ("orderAmount" in input)
          nextScenario.orderAmount = normalizeOrderAmount(input.orderAmount);
        resetRevision++;
        scenario = nextScenario;
        payments.clear();
        confirmationReachedAt.clear();
        orders.clear();
        orders.set("ORD-88213", { current: null, fundsObserved: false });
        orderSequence = 88214;
        orderAmounts.clear();
        orderAmounts.set("ORD-88213", scenario.orderAmount);
        sequence = 100306;
        frozen =
          input.freeze === true
            ? Date.parse(String(input.now ?? "2026-08-14T08:37:10.842Z"))
            : null;
        offset =
          input.now && frozen === null
            ? Date.parse(String(input.now)) - (options.now?.() ?? Date.now())
            : 0;
        if (typeof input.ttlMs === "number") scenario.ttlMs = input.ttlMs;
        Object.assign(metrics, {
          gets: 0,
          posts: 0,
          activeGets: 0,
          maxActiveGets: 0,
        });
        return json(res, 200, {
          reset: true,
          now: new Date(now()).toISOString(),
        });
      }
      if (path === "/api/demo/orders" && req.method === "POST") {
        const input = await body(req);
        const amount =
          "amount" in input ? normalizeOrderAmount(input.amount) : "149.90";
        let order_id: string;
        if ("order_id" in input) order_id = orderIdSchema.parse(input.order_id);
        else {
          while (orderSequence <= 99999 && orders.has(`ORD-${orderSequence}`))
            orderSequence++;
          if (orderSequence > 99999) throw Error("Demo order registry is full");
          order_id = `ORD-${orderSequence++}`;
        }
        if (orders.has(order_id)) throw Error("Order already exists");
        orders.set(order_id, { current: null, fundsObserved: false });
        orderAmounts.set(order_id, amount);
        const sig = signature(order_id);
        return json(res, 201, {
          order_id,
          sig,
          checkout_url: `/?order=${encodeURIComponent(order_id)}&sig=${sig}`,
        });
      }
      if (path === "/api/demo/scenario" && req.method === "POST") {
        const input = await body(req);
        // Validate before changing clocks, payment state, or any scenario fields.
        const orderId = readOrderId(input.order_id);
        if (
          "requireSignature" in input &&
          typeof input.requireSignature !== "boolean"
        )
          throw Error("Invalid signature requirement");
        if ("orderAmount" in input)
          orderAmounts.set(orderId, normalizeOrderAmount(input.orderAmount));
        if (typeof input.requireSignature === "boolean")
          scenario.requireSignature = input.requireSignature;
        const current = orders.get(orderId)?.current ?? null;
        if (typeof input.advanceMs === "number") {
          if (frozen !== null) frozen += input.advanceMs;
          else offset += input.advanceMs;
        }
        if (["none", "500", "disconnect", "slow"].includes(String(input.fault)))
          scenario.fault = input.fault as typeof scenario.fault;
        if (typeof input.delayMs === "number")
          scenario.delayMs = Math.min(30000, Math.max(0, input.delayMs));
        if (
          input.status &&
          current &&
          statuses.includes(input.status as PaymentStatus)
        ) {
          const appliedAt = now();
          save(
            withStatus(current, input.status as PaymentStatus, appliedAt),
            appliedAt,
          );
        }
        return json(res, 200, {
          scenario: scenarioFor(orderId),
          payment: orders.get(orderId)?.current ?? null,
        });
      }
      if (path === "/api/demo" && req.method === "GET") {
        const orderId = readOrderId(
          url.searchParams.get("order_id") ?? undefined,
        );
        return json(res, 200, {
          scenario: scenarioFor(orderId),
          payment: orders.get(orderId)?.current ?? null,
          metrics,
          requireSignature: scenario.requireSignature,
          now: new Date(now()).toISOString(),
          orders: [...orders].map(([order_id, order]) => ({
            order_id,
            payment_reference: order.current?.payment_reference ?? null,
            status: order.current?.status ?? null,
            fundsObserved: order.fundsObserved,
          })),
        });
      }
      if (path === "/api/checkout/link" && req.method === "GET") {
        if (await injectFault(req, res)) return;
        const orderId = url.searchParams.get("order_id");
        const sig = url.searchParams.get("sig");
        let reason: string | null = null;
        if (!orderIdSchema.safeParse(orderId).success)
          reason = "malformed_order";
        else if (!orders.has(orderId!)) reason = "unknown_order";
        else if (sig !== null) {
          if (
            !/^[0-9a-f]{16}$/.test(sig) ||
            !timingSafeEqual(Buffer.from(sig), Buffer.from(signature(orderId!)))
          )
            reason = "invalid_signature";
        } else if (scenario.requireSignature) reason = "missing_signature";
        const checked_at = new Date(now()).toISOString();
        return json(
          res,
          200,
          reason === null
            ? { valid: true, order_id: orderId, checked_at }
            : {
                valid: false,
                reason,
                order_id: orderId?.slice(0, 64) ?? null,
                checked_at,
                help_url: "mailto:help@payment-project.example",
              },
        );
      }
      if (path === "/api/currencies" && req.method === "GET") {
        return json(res, 200, { currencies: catalogue });
      }
      if (!path.startsWith("/api/payments"))
        return json(res, 404, { title: "Not found" });
      const input = req.method === "POST" ? await body(req) : {};
      if (path === "/api/payments" && req.method === "POST") {
        // Creation accepts only the documented fields, before any side effects.
        if (input === null || typeof input !== "object" || Array.isArray(input))
          throw Error("Invalid payment request");
        if (
          Object.keys(input).some(
            (key) => !["order_id", "currency", "network"].includes(key),
          )
        )
          throw Error("Unsupported payment field");
        if (typeof input.order_id !== "string") throw Error("Unknown order");
        readOrderId(input.order_id);
        const currency = catalogue.find(
          (entry) => entry.code === input.currency,
        );
        if (!currency?.networks.some((network) => network.id === input.network))
          throw Error("Unsupported pair");
      }
      const isGet = req.method === "GET";
      if (isGet) {
        metrics.gets++;
        metrics.activeGets++;
        metrics.maxActiveGets = Math.max(
          metrics.maxActiveGets,
          metrics.activeGets,
        );
        res.once("close", () => {
          metrics.activeGets = Math.max(0, metrics.activeGets - 1);
        });
      } else metrics.posts++;
      if (await injectFault(req, res)) return;
      // A slow request from before a demo reset must never recreate old state.
      if (requestRevision !== resetRevision)
        return json(res, 409, { title: "Demo reset invalidated this request" });
      if (path === "/api/payments" && req.method === "POST") {
        const orderId = readOrderId(input.order_id);
        const order = orders.get(orderId);
        if (order?.fundsObserved)
          return conflict(
            res,
            "Funds already observed",
            "Refresh the existing payment. Do not send again.",
          );
        const p = makePayment(
          input as unknown as Pair,
          `AQH-${sequence}-PMT`,
          now(),
          scenario.ttlMs,
          orderAmount(orderId),
          orderId,
        );
        sequence++;
        if (order?.current) {
          payments.delete(order.current.payment_reference);
          confirmationReachedAt.delete(order.current.payment_reference);
        }
        return json(res, 201, save(p));
      }
      const match = /^\/api\/payments\/([^/]+)(\/requote)?$/.exec(path);
      if (!match) return json(res, 404, { title: "Not found" });
      const original = payments.get(match[1]!);
      if (!original) return json(res, 404, { title: "Unknown payment" });
      const p = refresh(original);
      if (match[2] && req.method === "POST") {
        if (p.status !== "expired" || orders.get(p.order_id)?.fundsObserved)
          return conflict(
            res,
            "Quote has not expired",
            `The current quote is valid until ${p.quote.expires_at}. Current status: ${p.status}.`,
          );
        return json(
          res,
          201,
          save(
            makePayment(
              input as unknown as Pair,
              p.payment_reference,
              now(),
              scenario.ttlMs,
              orderAmount(p.order_id),
              p.order_id,
            ),
          ),
        );
      }
      if (!match[2] && req.method === "GET") return json(res, 200, p);
      return json(res, 405, { title: "Method not allowed" });
    } catch (error) {
      json(res, 400, {
        title: error instanceof Error ? error.message : "Invalid request",
      });
    }
  });
}
