import { expect, test, type Page } from "@playwright/test";

const fixed = new Date("2026-08-14T08:37:10.842Z");
const isPaymentRead = (url: string, method: string) =>
  method === "GET" && /^\/api\/payments\/[^/]+$/.test(new URL(url).pathname);

async function applyCommand(page: Page, click: () => Promise<void>) {
  const applied = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/demo/scenario" &&
    response.request().method() === "POST",
  );
  await click();
  expect((await applied).status()).toBe(200);
  await expect(page.getByTestId("demo-controls").getByRole("status")).toHaveText("Demo updated");
}

async function applyState(page: Page, state: string) {
  await page.getByTestId("demo-state").selectOption(state);
  await applyCommand(page, () => page.getByTestId("demo-apply-state").click());
}

async function nextPoll(page: Page, milliseconds = 2000) {
  const polled = page.waitForResponse((response) =>
    isPaymentRead(response.url(), response.request().method()),
  );
  await page.clock.runFor(milliseconds);
  return polled;
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.post("/api/demo/reset", { data: { freeze: true, now: fixed.toISOString() } })).status()).toBe(200);
  await page.clock.install({ time: fixed });
  await page.clock.pauseAt(fixed);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?demo=1");
  await page.getByRole("radio", { name: "Ethereum (ERC-20)", exact: true }).check();
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("transfer-amount")).toContainText("167.19");
  await page.getByTestId("demo-controls").locator("summary").click();
});

test("Demo state and clock commands wait for existing polling instead of forcing a refresh", async ({ page, request }) => {
  let reads = 0;
  page.on("request", (req) => { if (isPaymentRead(req.url(), req.method())) reads++; });
  await applyState(page, "confirming");
  const backend = await (await request.get("/api/demo")).json();
  expect(backend.payment).toMatchObject({ status: "confirming", confirmations: 2, required_confirmations: 3 });
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "awaiting_payment");
  expect(reads).toBe(0);
  await page.clock.runFor(1999);
  expect(reads).toBe(0);
  await nextPoll(page, 1);
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "confirming");
  expect(reads).toBe(1);

  await applyCommand(page, () => page.getByRole("button", { name: "Advance 15 minutes", exact: true }).click());
  await page.clock.runFor(1999);
  expect(reads).toBe(1);
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "confirming");
  await nextPoll(page, 1);
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "paid");
  expect(reads).toBe(2);
});

test("Demo connection recovery respects the automatic retry timer", async ({ page }) => {
  let reads = 0;
  page.on("request", (req) => { if (isPaymentRead(req.url(), req.method())) reads++; });
  await page.getByTestId("demo-fault").selectOption("500");
  await applyCommand(page, () => page.getByTestId("demo-apply-fault").click());
  expect(reads).toBe(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await nextPoll(page)).status()).toBe(500);
  await expect(page.getByRole("alert")).toBeVisible();
  expect(reads).toBe(1);
  // A second failure moves the existing automatic retry delay to four seconds.
  expect((await nextPoll(page)).status()).toBe(500);
  await expect(page.getByTestId("retry-countdown")).toHaveText("Retrying in 4 s.");
  expect(reads).toBe(2);
  await page.getByTestId("demo-fault").selectOption("none");
  await applyCommand(page, () => page.getByTestId("demo-apply-fault").click());
  await page.clock.runFor(3999);
  expect(reads).toBe(2);
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await nextPoll(page, 1)).status()).toBe(200);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(reads).toBe(3);
});

test("Demo edits do not restart terminal polling and Reset still starts a fresh checkout", async ({ page, request }) => {
  await applyState(page, "paid");
  await nextPoll(page);
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "paid");
  let reads = 0;
  page.on("request", (req) => { if (isPaymentRead(req.url(), req.method())) reads++; });
  await applyState(page, "failed");
  expect((await (await request.get("/api/demo")).json()).payment.status).toBe("failed");
  await page.clock.runFor(10000);
  expect(reads).toBe(0);
  await expect(page.getByTestId("payment-status")).toHaveAttribute("data-status", "paid");
  await page.getByTestId("demo-reset").click();
  await expect(page.getByTestId("continue")).toBeEnabled();
  await expect(page.getByTestId("transfer-amount")).toHaveCount(0);
  expect((await (await request.get("/api/demo")).json()).payment.status).toBe("awaiting_payment");
});
