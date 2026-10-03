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
        network_fee: String(row[4]),
        required_confirmations: row[5],
        avg_confirmation_seconds: row[6],
      })),
  })),
};
const order = { order_id: "ORD-88213", currency: "EUR", amount: "250.00" };
const merchant = { name: "Configured merchant", logo_url: null };

describe("API catalogue without order and merchant metadata", () => {
  it("accepts the currencies-only catalogue", () => {
    expect(catalogueSchema.parse(catalogue)).toEqual(catalogue);
  });
  it.each([{ order }, { merchant }, { order, merchant }])(
    "does not expose unrelated legacy metadata %#",
    (metadata) => {
      expect(catalogueSchema.parse({ ...catalogue, ...metadata })).toEqual(
        catalogue,
      );
    },
  );
  it.each(["-1", "1e2", "NaN", "1.0000001"])(
    "rejects malformed or overprecision network fee %s",
    (fee) => {
      const input = structuredClone(catalogue);
      input.currencies[0]!.networks[0]!.network_fee = fee;
      expect(catalogueSchema.safeParse(input).success).toBe(false);
    },
  );
  it.each([-1, 1.5, 256])("rejects unusable decimals %s", (decimals) => {
    const input = structuredClone(catalogue);
    input.currencies[0]!.decimals = decimals;
    expect(catalogueSchema.safeParse(input).success).toBe(false);
  });
  it("accepts a server catalogue with fewer currencies", () => {
    const input = { currencies: catalogue.currencies.slice(0, 2) };
    expect(catalogueSchema.parse(input)).toEqual(input);
  });
  it("rejects an empty catalogue", () => {
    expect(catalogueSchema.safeParse({ currencies: [] }).success).toBe(false);
  });
  it("rejects duplicate currencies", () => {
    expect(
      catalogueSchema.safeParse({
        currencies: [catalogue.currencies[0], catalogue.currencies[0]],
      }).success,
    ).toBe(false);
  });
});
