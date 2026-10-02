import { describe, expect, it } from "vitest";
import { catalogueSchema } from "../../src/features/checkout/infrastructure/responseSchemas";
import { catalogueRows } from "../fixtures/oracles";

const catalogue = {
  currencies: ["USDT", "USDC", "ETH"].map((code) => ({
    code,
    name: code === "USDT" ? "Tether" : code === "USDC" ? "USD Coin" : "Ether",
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
  })),
};
const order = { order_id: "ORD-88213", currency: "EUR", amount: "250.00" };
const merchant = { name: "Configured merchant", logo_url: null };

describe("optional catalogue order and merchant metadata", () => {
  it("retains compatibility with a currencies-only catalogue", () => {
    expect(catalogueSchema.parse(catalogue)).toEqual(catalogue);
  });

  it.each([
    { order },
    { merchant },
    { order, merchant },
    {
      order: { ...order, amount: "0.01" },
      merchant: { ...merchant, logo_url: "https://merchant.example/logo.png" },
    },
  ])("preserves independently optional valid metadata %#", (metadata) => {
    const body = { ...catalogue, ...metadata };
    expect(catalogueSchema.parse(body)).toEqual(body);
  });

  it.each(["100.123", "0", "0.00", "-1", "1e2"])(
    "rejects invalid EUR amount %s",
    (amount) => {
      expect(
        catalogueSchema.safeParse({ ...catalogue, order: { ...order, amount } })
          .success,
      ).toBe(false);
    },
  );

  it.each([
    { order: { ...order, order_id: "ORD-OTHER" } },
    { order: { ...order, currency: "USD" } },
    { merchant: { ...merchant, name: "" } },
  ])("rejects malformed optional identity metadata %#", (metadata) => {
    expect(
      catalogueSchema.safeParse({ ...catalogue, ...metadata }).success,
    ).toBe(false);
  });

  it("still rejects an incomplete two-currency catalogue with valid metadata", () => {
    expect(
      catalogueSchema.safeParse({
        ...catalogue,
        currencies: catalogue.currencies.slice(0, 2),
        order,
        merchant,
      }).success,
    ).toBe(false);
  });
});
