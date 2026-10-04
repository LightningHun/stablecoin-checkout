import { describe, expect, it } from "vitest";
import { isSameQuote } from "../../src/features/checkout/domain/quotePolicy";
import { sourceQuote } from "../fixtures/oracles";

// Independent literal quotes; no production fixture builds the expectations.
const accepted = { ...sourceQuote };
describe("accepted quote identity across same-reference polls", () => {
  it("accepts an identical quote", () => {
    expect(isSameQuote({ ...sourceQuote }, accepted)).toBe(true);
  });
  it.each(["1", "1.0", "1.000000"])(
    "tolerates the numerically equal network fee spelling %s",
    (network_fee) => {
      expect(isSameQuote({ ...sourceQuote, network_fee }, accepted)).toBe(true);
    },
  );
  it.each([
    { network_fee: "1.01" },
    { total_due: "163.690001" },
    { crypto_amount: "162.690" },
    { exchange_rate: "0.9215" },
    { crypto_address: "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1f" },
    { network: "ethereum" },
    { network_name: "Ethereum (ERC-20)" },
    { crypto_currency: "USDC" },
    { required_confirmations: 2 },
    { expires_at: "2026-08-14T09:07:10.842Z" },
  ])("rejects any other changed field %j", (change) => {
    expect(isSameQuote({ ...sourceQuote, ...change }, accepted)).toBe(false);
  });
  it("rejects a quote with an extra or missing field", () => {
    expect(
      isSameQuote(
        { ...sourceQuote, memo: "x" } as unknown as typeof sourceQuote,
        accepted,
      ),
    ).toBe(false);
    const { expires_at: _omitted, ...partial } = sourceQuote;
    void _omitted;
    expect(
      isSameQuote(partial as unknown as typeof sourceQuote, accepted),
    ).toBe(false);
  });
});
