import {
  test,
  expect,
  chromium,
  type Browser,
  type Page,
  type Request,
  type TestInfo,
  type APIRequestContext,
} from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { noTransferAction } from "./fixtures";

test.use({ trace: "on" });

type AuditWindow = Window & {
  auditEvents: unknown[];
  unsafeRenders: unknown[];
};
type Entry = {
  method: string;
  url: string;
  start: number;
  end?: number;
  status?: number;
  error?: string;
};
async function native(
  info: TestInfo,
  run: (
    page: Page,
    evidence: Record<string, unknown>,
    entries: Entry[],
    maxGets: () => number,
  ) => Promise<void>,
) {
  await mkdir(info.outputDir, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), "checkout-lifecycle-audit-"));
  const args = [
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ];
  const process = spawn(chromium.executablePath(), args, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let browser: Browser | undefined;
  let stderr = "";
  process.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-10000);
  });
  const evidence: Record<string, unknown> = {
    harness:
      "native headed Chromium + CDP noDefaults; no fake clock or visibility override",
    args: args.map((arg) =>
      arg.startsWith("--user-data-dir=")
        ? "--user-data-dir=<isolated temporary profile>"
        : arg,
    ),
  };
  const entries: Entry[] = [];
  const tracked = new Map<Request, Entry>();
  const live = new Set<Request>();
  let maxGets = 0;
  let page: Page | undefined;
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Native Chromium startup timed out")),
        15000,
      );
      let buffer = "";
      process.stderr.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer);
        if (match) {
          clearTimeout(timeout);
          resolve(match[1]!);
        }
      });
      process.once("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      process.once("exit", (code) => {
        clearTimeout(timeout);
        reject(Error(`Native Chromium exited before connection: ${code}`));
      });
    });
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    evidence.browserVersion = browser.version();
    const context = browser.contexts()[0]!;
    await context.addInitScript(() => {
      const state = window as unknown as AuditWindow;
      state.auditEvents = [];
      state.unsafeRenders = [];
      for (const type of [
        "focus",
        "blur",
        "visibilitychange",
        "pageshow",
        "pagehide",
      ])
        (type === "visibilitychange" ? document : window).addEventListener(
          type,
          (event) =>
            state.auditEvents.push({
              type,
              at: Date.now(),
              mono: performance.now(),
              visibility: document.visibilityState,
              persisted: "persisted" in event ? event.persisted : undefined,
              transferControls: document.querySelectorAll(
                '[data-testid="transfer-qr"], [data-testid="copy-address"]',
              ).length,
            }),
        );
    });
    page = context.pages()[0]!;
    page.on("request", (request) => {
      if (!new URL(request.url()).pathname.startsWith("/api/")) return;
      const entry = {
        method: request.method(),
        url: request.url(),
        start: Date.now(),
      };
      entries.push(entry);
      tracked.set(request, entry);
      if (
        request.method() === "GET" &&
        /\/api\/payments\/[^/]+$/.test(new URL(request.url()).pathname)
      ) {
        live.add(request);
        maxGets = Math.max(maxGets, live.size);
      }
    });
    page.on("response", (response) => {
      const entry = tracked.get(response.request());
      if (entry) entry.status = response.status();
    });
    const finished = (request: Request) => {
      const entry = tracked.get(request);
      if (entry) {
        entry.end = Date.now();
        entry.error = request.failure()?.errorText;
      }
      live.delete(request);
    };
    page.on("requestfinished", finished);
    page.on("requestfailed", finished);
    await run(page, evidence, entries, () => maxGets);
  } finally {
    if (page && !page.isClosed()) {
      evidence.final = await Promise.race([
        observe(page).catch(() => ({ unavailable: true })),
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ unavailable: true, reason: "observation timeout" }),
            2000,
          ),
        ),
      ]);
      await page
        .screenshot({
          path: info.outputPath("final.png"),
          fullPage: true,
          animations: "disabled",
          timeout: 5000,
        })
        .catch((error: Error) => {
          evidence.screenshotError = error.message;
        });
    }
    evidence.requests = entries;
    evidence.maxConcurrentStatusGets = maxGets;
    evidence.stderr = stderr;
    await writeFile(
      info.outputPath("evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
    await info.attach("lifecycle-audit", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json",
    });
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (process.exitCode === null && process.signalCode === null) {
      const exited = new Promise<void>((resolve) => process.once("exit", () => resolve()));
      process.kill("SIGTERM");
      await exited;
    }
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}
async function observe(page: Page) {
  return page.evaluate(() => ({
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    at: Date.now(),
    countdown: document.querySelector('[data-testid="countdown"]')?.textContent,
    retry: document.querySelector('[data-testid="retry-countdown"]')
      ?.textContent,
    checking: !!document.querySelector('[data-testid="request-checking"]'),
    state: document
      .querySelector('[data-testid="payment-status"]')
      ?.getAttribute("data-status"),
    transferControls: document.querySelectorAll(
      '[data-testid="transfer-qr"], [data-testid="transfer-address"], [data-testid="copy-address"], [data-testid="copy-amount"]',
    ).length,
    events: (window as unknown as AuditWindow).auditEvents,
    unsafeRenders: (window as unknown as AuditWindow).unsafeRenders,
  }));
}
async function scenario(
  request: APIRequestContext,
  data: Record<string, unknown>,
) {
  expect((await request.post("/api/demo/scenario", { data })).status()).toBe(
    200,
  );
}
const creationPosts = (entries: Entry[]) =>
  entries.filter(
    (entry) =>
      entry.method === "POST" &&
      new URL(entry.url).pathname === "/api/payments",
  );
async function start(
  page: Page,
  request: APIRequestContext,
  entries: Entry[],
  ttlMs = 900000,
) {
  expect(
    (await request.post("/api/demo/reset", { data: { ttlMs } })).status(),
  ).toBe(200);
  const baseURL = test.info().project.use.baseURL;
  if (!baseURL) throw new Error("Native lifecycle tests require a configured baseURL");
  const checkoutURL = new URL("/?demo=1", baseURL);
  if (!["http:", "https:"].includes(checkoutURL.protocol))
    throw new Error("Native lifecycle baseURL must use HTTP or HTTPS");
  await page.goto(checkoutURL.href);
  await expect(page.getByTestId("continue")).toBeEnabled();
  // An ordinary creation supplies display metadata before the shopper continues.
  expect(creationPosts(entries)).toHaveLength(1);
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/payments\/[^/]+$/.test(new URL(response.url()).pathname),
  );
  await page.getByTestId("continue").click();
  const payment = await (await response).json();
  await expect(page.getByTestId("transfer-qr")).toBeVisible();
  // Continue creates the accepted payment; lifecycle events must add no more POSTs.
  expect(creationPosts(entries)).toHaveLength(2);
  await page.evaluate((expires) => {
    new MutationObserver((records) => {
      if (Date.now() < Date.parse(expires)) return;
      const selector =
        '[data-testid="transfer-amount"], [data-testid="transfer-qr"], [data-testid="transfer-address"], [data-testid="copy-amount"], [data-testid="copy-address"]';
      for (const record of records)
        for (const node of record.addedNodes)
          if (
            node instanceof Element &&
            (node.matches(selector) || node.querySelector(selector))
          )
            (window as unknown as AuditWindow).unsafeRenders.push({
              at: Date.now(),
              html: node.outerHTML.slice(0, 180),
            });
    }).observe(document, { childList: true, subtree: true });
  }, payment.quote.expires_at);
  return payment;
}
async function hide(page: Page) {
  const other = await page.context().newPage();
  await other.goto("about:blank");
  await other.bringToFront();
  await expect
    .poll(() => page.evaluate(() => document.visibilityState))
    .toBe("hidden");
  return other;
}
async function back(page: Page, evidence: Record<string, unknown>) {
  await page.bringToFront();
  await expect
    .poll(() => page.evaluate(() => document.visibilityState))
    .toBe("visible");
  evidence.returned = await observe(page);
}
const statusGets = (entries: Entry[]) =>
  entries.filter(
    (entry) =>
      entry.method === "GET" &&
      /\/api\/payments\/[^/]+$/.test(new URL(entry.url).pathname),
  );

test("native hidden 15s: 500 backoff before expiry, visible recovery respects scheduled retry", async ({
  request,
}, info) => {
  test.setTimeout(60000);
  await native(info, async (page, evidence, entries, maxGets) => {
    evidence.initial = await start(page, request, entries);
    await scenario(request, { fault: "500" });
    await expect(page.getByTestId("retry-countdown")).toBeVisible();
    evidence.before = await observe(page);
    const other = await hide(page);
    await new Promise((resolve) => setTimeout(resolve, 15000));
    evidence.hidden = await observe(page);
    expect((evidence.hidden as { visibility: string }).visibility).toBe(
      "hidden",
    );
    await back(page, evidence);
    evidence.returned = await observe(page);
    const failures = statusGets(entries).filter(
      (entry) => entry.status === 500,
    );
    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(failures.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < failures.length; i++)
      expect(failures[i]!.start - failures[i - 1]!.end!).toBeGreaterThanOrEqual(
        [2000, 4000, 8000, 16000, 30000][i - 1]! - 150,
      );
    expect(maxGets()).toBe(1);
    await scenario(request, { fault: "none" });
    // No manual request: keep the scheduled deadline, even if focus has returned.
    await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 32000 });
    await expect(page.getByTestId("countdown")).toBeVisible();
    await expect(page.getByTestId("retry-countdown")).toHaveCount(0);
    await other.close();
  });
});

for (const mode of ["disconnect", "offline", "slow", "timeout"] as const) {
  test(`native hidden 15s: ${mode} request recovery is single-flight`, async ({
    request,
  }, info) => {
    test.setTimeout(50000);
    await native(info, async (page, evidence, entries, maxGets) => {
      evidence.initial = await start(page, request, entries, 12000);
      if (mode === "offline") await page.context().setOffline(true);
      else
        await scenario(request, {
          fault: mode === "timeout" ? "slow" : mode,
          delayMs: mode === "timeout" ? 15000 : 5000,
        });
      evidence.before = await observe(page);
      const other = await hide(page);
      await new Promise((resolve) => setTimeout(resolve, 15000));
      evidence.hidden = await observe(page);
      expect((evidence.hidden as { visibility: string }).visibility).toBe(
        "hidden",
      );
      if (mode === "offline") await page.context().setOffline(false);
      await scenario(request, { fault: "none" });
      await back(page, evidence);
      await noTransferAction(page);
      // A pending slow response or an existing backoff owns reconciliation.
      await expect(page.getByTestId("payment-status")).toHaveAttribute(
        "data-status",
        "expired",
        { timeout: 20000 },
      );
      expect(maxGets()).toBe(1);
      expect(
        await page.evaluate(
          () => (window as unknown as AuditWindow).unsafeRenders,
        ),
      ).toEqual([]);
      if (mode === "timeout")
        expect(
          statusGets(entries).some((entry) => entry.error?.includes("ABORTED")),
        ).toBe(true);
      await other.close();
    });
  });
}

for (const state of ["detected", "confirming"] as const) {
  test(`native hidden 15s: ${state} advances on mock clock to Paid and stays terminal`, async ({
    request,
  }, info) => {
    test.setTimeout(45000);
    await native(info, async (page, evidence, entries, maxGets) => {
      const initial = await start(page, request, entries, 6000);
      evidence.initial = initial;
      await scenario(request, { status: state });
      await expect(page.getByTestId("payment-status")).toHaveAttribute(
        "data-status",
        state,
      );
      evidence.before = await observe(page);
      const other = await hide(page);
      // Backend clock only; browser wall/monotonic/timers remain real.
      await scenario(request, { advanceMs: 60000 });
      evidence.clockAdvance = {
        backendAdvanceMs: 60000,
        browserFakeClock: false,
      };
      await new Promise((resolve) => setTimeout(resolve, 15000));
      evidence.hidden = await observe(page);
      expect((evidence.hidden as { visibility: string }).visibility).toBe(
        "hidden",
      );
      await back(page, evidence);
      await expect(page.getByTestId("payment-status")).toHaveAttribute(
        "data-status",
        "paid",
      );
      await noTransferAction(page);
      const count = statusGets(entries).length;
      await other.bringToFront();
      await back(page, evidence);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      expect(statusGets(entries)).toHaveLength(count);
      expect(maxGets()).toBe(1);
      const paid = await (
        await request.get("/api/payments/" + initial.payment_reference)
      ).json();
      expect(paid).toMatchObject({
        status: "paid",
        amount_received: "163.69",
        confirmations: 1,
        required_confirmations: 1,
      });
      await other.close();
    });
  });
}
