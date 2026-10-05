// @vitest-environment node
import { createServer } from "node:http";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createLogger, createServer as createViteServer } from "vite";
import type { Logger, ViteDevServer } from "vite";
import { createMockServer } from "../../backend/server";
import { createMockProxyLogging } from "../../scripts/mockProxyLogging";

let upstream: Server;
let vite: ViteDevServer;
let base: string;
const logger = createLogger("silent");
const logError = vi.fn<Logger["error"]>();
logger.error = logError;
const logging = createMockProxyLogging(logger);

beforeAll(async () => {
  const mock = createMockServer({ onDisconnect: logging.onDisconnect });
  upstream = createServer((req, res) => {
    if (req.url === "/api/unexpected-disconnect") req.socket.destroy();
    else mock.emit("request", req, res);
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  if (!address || typeof address === "string") throw Error("Missing mock port");
  vite = await createViteServer({
    configFile: false,
    customLogger: logging.logger,
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      watch: null,
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${address.port}`,
          configure: logging.configure,
        },
      },
    },
  });
  await vite.listen();
  const viteAddress = vite.httpServer?.address();
  if (!viteAddress || typeof viteAddress === "string") throw Error("Missing Vite port");
  base = `http://127.0.0.1:${viteAddress.port}`;
});

afterAll(async () => {
  await vite?.close();
  if (upstream?.listening) {
    upstream.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      upstream.close((error) => error ? reject(error) : resolve()),
    );
  }
});

async function post(path: string, body: unknown) {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await response.text();
  expect(response.status).toBe(200);
}

beforeEach(async () => {
  await post("/api/demo/reset", {});
  logError.mockClear();
});

it("silences injected disconnects while retaining the proxy error response", async () => {
  await post("/api/demo/scenario", { fault: "disconnect" });
  for (const path of ["/api/checkout/link?order_id=abc", "/api/payments/unknown"]) {
    const response = await fetch(base + path);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
  }
  expect(logError).not.toHaveBeenCalled();
});

it("still logs an unexpected socket hang up alongside an injected disconnect", async () => {
  await post("/api/demo/scenario", { fault: "disconnect" });
  const responses = await Promise.all([
    fetch(base + "/api/checkout/link?order_id=abc"),
    fetch(base + "/api/unexpected-disconnect"),
  ]);
  for (const response of responses) {
    expect(response.status).toBe(500);
    await response.text();
  }
  expect(logError).toHaveBeenCalledExactlyOnceWith(
    expect.stringContaining("http proxy error: /api/unexpected-disconnect"),
    expect.objectContaining({ error: expect.objectContaining({ code: "ECONNRESET" }) }),
  );
});

it("reset restores normal link validation without leftover suppression", async () => {
  await post("/api/demo/scenario", { fault: "disconnect" });
  await (await fetch(base + "/api/checkout/link?order_id=abc")).text();
  await post("/api/demo/reset", {});
  const response = await fetch(base + "/api/checkout/link?order_id=ORD-88213");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ valid: true, order_id: "ORD-88213" });
  await (await fetch(base + "/api/unexpected-disconnect")).text();
  expect(logError).toHaveBeenCalledTimes(1);
});

it("preserves unrelated Vite errors", () => {
  const error = new Error("Cannot compile source");
  logging.logger.error("Transform failed", { error });
  expect(logError).toHaveBeenCalledExactlyOnceWith("Transform failed", { error });
});
