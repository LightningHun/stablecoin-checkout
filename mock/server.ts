import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { catalogue } from "./catalogue";
import { makePayment, withStatus } from "./fixtures";
import { defaultScenario } from "./scenarios";
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
    current: Payment | null = null;
  const payments = new Map<string, Payment>();
  const confirmationReachedAt = new Map<string, number>();
  let fundsObserved = false;
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
  function save(p: Payment, reachedAt = now()) {
    fundsObserved ||= hasFunds(p.status);
    if (p.status === "detected" || p.status === "confirming")
      confirmationReachedAt.set(p.payment_reference, reachedAt);
    else confirmationReachedAt.delete(p.payment_reference);
    payments.set(p.payment_reference, p);
    current = p;
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

    const gained = Math.min(elapsed, p.required_confirmations - p.confirmations);
    const confirmations = p.confirmations + gained;
    // Retain partial intervals and settle at the due time, even on a late read.
    const advancedAt = reachedAt + gained * intervalMs;
    const advanced = withStatus(
      p,
      confirmations === p.required_confirmations ? "paid" : "confirming",
      advancedAt,
    );
    if (advanced.status === "confirming" || advanced.status === "paid")
      return save({ ...advanced, confirmations, tx_hash: p.tx_hash }, advancedAt);
    return p;
  }
  return createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    try {
      if (path === "/api/demo/reset" && req.method === "POST") {
        const input = await body(req);
        scenario = defaultScenario();
        payments.clear();
        confirmationReachedAt.clear();
        fundsObserved = false;
        current = null;
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
      if (path === "/api/demo/scenario" && req.method === "POST") {
        const input = await body(req);
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
        return json(res, 200, { scenario, payment: current });
      }
      if (path === "/api/demo" && req.method === "GET")
        return json(res, 200, {
          scenario,
          payment: current,
          metrics,
          now: new Date(now()).toISOString(),
        });
      if (path === "/api/currencies" && req.method === "GET")
        return json(res, 200, { currencies: catalogue });
      if (!path.startsWith("/api/payments"))
        return json(res, 404, { title: "Not found" });
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
      const input = req.method === "POST" ? await body(req) : {};
      if (scenario.fault === "slow")
        await new Promise((resolve) => setTimeout(resolve, scenario.delayMs));
      if (scenario.fault === "disconnect") {
        req.socket.destroy();
        return;
      }
      if (scenario.fault === "500")
        return json(res, 500, { title: "Temporary payment server error" });
      if (path === "/api/payments" && req.method === "POST") {
        if (input.order_id !== "ORD-88213")
          return json(res, 400, { title: "Unknown order" });
        if (fundsObserved)
          return conflict(
            res,
            "Funds already observed",
            "Refresh the existing payment. Do not send again.",
          );
        const p = makePayment(
          input as unknown as Pair,
          `AQH-${sequence++}-PMT`,
          now(),
          scenario.ttlMs,
        );
        if (current) payments.delete(current.payment_reference);
        return json(res, 201, save(p));
      }
      const match = /^\/api\/payments\/([^/]+)(\/requote)?$/.exec(path);
      if (!match) return json(res, 404, { title: "Not found" });
      const original = payments.get(match[1]!);
      if (!original) return json(res, 404, { title: "Unknown payment" });
      const p = refresh(original);
      if (match[2] && req.method === "POST") {
        if (p.status !== "expired" || fundsObserved)
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
