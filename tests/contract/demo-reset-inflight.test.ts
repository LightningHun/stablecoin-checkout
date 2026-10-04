// @vitest-environment node
import { expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createMockServer } from "../../backend/server";

it("a demo reset invalidates an older delayed creation without replacing the new payment", async () => {
  const server = createMockServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post = (path: string, body: object) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    await post("/demo/scenario", { fault: "slow", delayMs: 300 });
    const oldCreation = post("/payments", {
      order_id: "ORD-88213",
      currency: "USDT",
      network: "tron",
    });
    await expect
      .poll(
        async () => (await (await fetch(base + "/demo")).json()).metrics.posts,
      )
      .toBe(1);
    expect(await (await post("/demo/reset", {})).json()).toMatchObject({
      reset: true,
    });
    const created = await post("/payments", {
      order_id: "ORD-88213",
      currency: "USDC",
      network: "ethereum",
    });
    expect(created.status).toBe(201);
    const snapshot = await created.json();
    expect(snapshot).toMatchObject({
      payment_reference: "AQH-100306-PMT",
      quote: { crypto_currency: "USDC", network: "ethereum" },
    });
    const stale = await oldCreation;
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      title: "Demo reset invalidated this request",
    });
    expect((await (await fetch(base + "/demo")).json()).payment).toEqual(
      snapshot,
    );
    expect(
      await (await fetch(base + "/payments/AQH-100306-PMT")).json(),
    ).toEqual(snapshot);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
