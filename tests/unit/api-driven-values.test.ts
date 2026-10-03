import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogueSchema,
  parsePayment,
} from "../../src/features/checkout/infrastructure/responseSchemas";
import {
  ApiError,
  createPaymentClient,
} from "../../src/features/checkout/infrastructure/paymentClient";
import {
  formatFiat,
  parseUnits,
} from "../../src/features/checkout/domain/money";

// Independent API examples: no production fixtures, catalogue, or money helper
// supplies an expected value in these tests.
function catalogue() {
  return {
    currencies: [
      {
        code: "TOK",
        name: "Example Token",
        decimals: 8,
        networks: [
          {
            id: "custom-chain",
            name: "Custom Chain",
            network_fee: "0.12500000",
            required_confirmations: 4,
            avg_confirmation_seconds: 45,
          },
        ],
      },
    ],
  };
}

function payment() {
  return {
    payment_reference: "payment_custom_42",
    order_id: "invoice_2026-0042",
    status: "awaiting_payment",
    merchant: { name: "Configured merchant", logo_url: null },
    order: { currency: "USD", amount: "149.90" },
    quote: {
      crypto_currency: "TOK",
      network: "custom-chain",
      network_name: "Custom Chain",
      exchange_rate: "149.89999850100001499",
      crypto_amount: "0.87500001",
      network_fee: "0.12500000",
      total_due: "1.00000001",
      crypto_address: "custom1qqqqqqqqqqqqqqqqqqqqqqqqqqqq",
      required_confirmations: 4,
      expires_at: "2026-10-03T12:15:00.000Z",
    },
  };
}

function currencies() {
  return catalogueSchema.parse(catalogue()).currencies;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("API-owned catalogue and payment metadata", () => {
  it("accepts an independently specified token, network and eight-decimal scale", () => {
    expect(catalogueSchema.parse(catalogue())).toEqual(catalogue());
    expect(parsePayment(payment(), currencies())).toEqual(payment());
  });

  it("does not expose legacy order or merchant metadata from the catalogue", () => {
    expect(
      catalogueSchema.parse({
        ...catalogue(),
        order: { order_id: "old-order", currency: "EUR", amount: "999.00" },
        merchant: { name: "Old catalogue merchant", logo_url: null },
      }),
    ).toEqual(catalogue());
  });

  it("accepts backend changes to name, fee and confirmation metadata together", () => {
    const body = catalogue();
    body.currencies[0]!.networks[0] = {
      id: "custom-chain",
      name: "Custom Chain Revised",
      network_fee: "0.25",
      required_confirmations: 7,
      avg_confirmation_seconds: 90,
    };
    const snapshot = payment();
    snapshot.quote.network_name = "Custom Chain Revised";
    snapshot.quote.network_fee = "0.25";
    snapshot.quote.required_confirmations = 7;
    expect(
      parsePayment(snapshot, catalogueSchema.parse(body).currencies),
    ).toEqual(snapshot);
  });

  it.each([
    { network: "unlisted-chain" },
    { crypto_currency: "UNLISTED" },
    { network_name: "Not the API network name" },
    { required_confirmations: 5 },
    { network_fee: "0.12500001" },
  ])("rejects quote metadata inconsistent with its catalogue: %j", (change) => {
    const snapshot = payment();
    expect(() =>
      parsePayment(
        { ...snapshot, quote: { ...snapshot.quote, ...change } },
        currencies(),
      ),
    ).toThrow();
  });

  it.each(["1", "1.0", "1.00", "1.0000000000"])(
    "accepts numerically equal fee representation %s",
    (fee) => {
      const body = catalogue();
      body.currencies[0]!.networks[0]!.network_fee = "1.00";
      const snapshot = payment();
      snapshot.quote.network_fee = fee;
      expect(
        parsePayment(snapshot, catalogueSchema.parse(body).currencies).quote
          .network_fee,
      ).toBe(fee);
    },
  );

  it("compares large fees exactly rather than rounding through Number", () => {
    const body = catalogue();
    body.currencies[0]!.networks[0]!.network_fee = "9007199254740993.12500000";
    const snapshot = payment();
    snapshot.quote.network_fee = "9007199254740993.125";
    const apiCurrencies = catalogueSchema.parse(body).currencies;
    expect(parsePayment(snapshot, apiCurrencies).quote.network_fee).toBe(
      "9007199254740993.125",
    );
    snapshot.quote.network_fee = "9007199254740992.125";
    expect(() => parsePayment(snapshot, apiCurrencies)).toThrow();
  });

  it.each(["-1", "1e2", "NaN", "Infinity", "", "1.2.3", 1])(
    "rejects a malformed API fee %j",
    (fee) => {
      const body = catalogue();
      const network = body.currencies[0]!.networks[0]!;
      expect(
        catalogueSchema.safeParse({
          currencies: [
            {
              ...body.currencies[0],
              networks: [{ ...network, network_fee: fee }],
            },
          ],
        }).success,
      ).toBe(false);
    },
  );

  it.each([-1, 1.5, 256])("rejects invalid decimals %s", (decimals) => {
    const body = catalogue();
    body.currencies[0]!.decimals = decimals;
    expect(catalogueSchema.safeParse(body).success).toBe(false);
  });

  it("rejects a duplicate currency code or network id", () => {
    const duplicateCurrency = catalogue();
    duplicateCurrency.currencies.push(duplicateCurrency.currencies[0]!);
    expect(catalogueSchema.safeParse(duplicateCurrency).success).toBe(false);
    const duplicateNetwork = catalogue();
    duplicateNetwork.currencies[0]!.networks.push(
      duplicateNetwork.currencies[0]!.networks[0]!,
    );
    expect(catalogueSchema.safeParse(duplicateNetwork).success).toBe(false);
  });

  it.each(["invoice_2026-0042", "a", "ORD-1", "shop/order:42"])(
    "preserves the nonempty API order identity %s",
    (order_id) => {
      expect(
        parsePayment({ ...payment(), order_id }, currencies()).order_id,
      ).toBe(order_id);
    },
  );

  it.each(["", null, 42])("rejects an invalid order identity %j", (order_id) => {
    expect(() =>
      parsePayment({ ...payment(), order_id }, currencies()),
    ).toThrow();
  });

  it("accepts an order currency and exact amount outside the former EUR restriction", () => {
    expect(
      parsePayment(
        { ...payment(), order: { currency: "KWD", amount: "1.234" } },
        currencies(),
      ).order,
    ).toEqual({ currency: "KWD", amount: "1.234" });
  });

  it("keeps total_due authoritative without recomputing from rate or fee", () => {
    const snapshot = payment();
    snapshot.quote.total_due = "1.00000002";
    expect(parsePayment(snapshot, currencies()).quote.total_due).toBe(
      "1.00000002",
    );
  });
});

describe("API-owned precision and exact presentation", () => {
  it("validates outstanding units at the catalogue's eight-decimal scale", () => {
    const base = payment();
    const underpaid = {
      ...base,
      status: "underpaid",
      amount_received: "0.99999999",
      amount_outstanding: "0.00000002",
      crypto_address: base.quote.crypto_address,
      tx_hash: "custom-chain-transaction-42",
    };
    expect(parsePayment(underpaid, currencies())).toEqual(underpaid);
    expect(() =>
      parsePayment(
        { ...underpaid, amount_outstanding: "0.00000001" },
        currencies(),
      ),
    ).toThrow();
  });

  it("rejects a genuine ninth fractional digit for an eight-decimal token", () => {
    const snapshot = payment();
    snapshot.quote.total_due = "1.000000001";
    expect(() => parsePayment(snapshot, currencies())).toThrow();
  });

  it("supports integer tokens and zero network fees", () => {
    const body = catalogue();
    body.currencies[0]!.decimals = 0;
    body.currencies[0]!.networks[0]!.network_fee = "0";
    const snapshot = payment();
    snapshot.quote.crypto_amount = "2";
    snapshot.quote.network_fee = "0";
    snapshot.quote.total_due = "2";
    expect(
      parsePayment(snapshot, catalogueSchema.parse(body).currencies),
    ).toEqual(snapshot);
    expect(parseUnits("2", 0)).toBe(2n);
  });

  it("preserves a twenty-four-decimal token's smallest unit", () => {
    const body = catalogue();
    body.currencies[0]!.decimals = 24;
    body.currencies[0]!.networks[0]!.network_fee = "0";
    const snapshot = payment();
    snapshot.quote.crypto_amount = "0.000000000000000000000001";
    snapshot.quote.network_fee = "0";
    snapshot.quote.total_due = "0.000000000000000000000001";
    expect(
      parsePayment(snapshot, catalogueSchema.parse(body).currencies).quote
        .total_due,
    ).toBe("0.000000000000000000000001");
    expect(parseUnits("0.000000000000000000000001", 24)).toBe(1n);
  });

  it("uses the API scale even when the currency code is ETH", () => {
    const body = catalogue();
    body.currencies[0]!.code = "ETH";
    body.currencies[0]!.decimals = 3;
    body.currencies[0]!.networks[0]!.network_fee = "0.125";
    const snapshot = payment();
    snapshot.quote.crypto_currency = "ETH";
    snapshot.quote.crypto_amount = "0.875";
    snapshot.quote.network_fee = "0.125";
    snapshot.quote.total_due = "1";
    const apiCurrencies = catalogueSchema.parse(body).currencies;
    expect(parsePayment(snapshot, apiCurrencies).quote.total_due).toBe("1");
    snapshot.quote.total_due = "1.0001";
    expect(() => parsePayment(snapshot, apiCurrencies)).toThrow();
  });

  it.each([
    ["149.90", "en-IE", "USD", "149.90 USD"],
    ["149.90", "de-DE", "USD", "149,90 USD"],
    ["1.234", "en-IE", "KWD", "1.234 KWD"],
    ["9007199254740993.123", "en-IE", "KWD", "9,007,199,254,740,993.123 KWD"],
    ["0", "en-IE", "", "0"],
  ])("formats %s with locale %s and API currency %s", (value, locale, code, expected) => {
    expect(formatFiat(value, locale, code).replace(/\u00a0/g, " ")).toBe(
      expected,
    );
  });
});

const browserNow = Date.parse("2026-10-03T12:00:00.000Z");
const signal = () => new AbortController().signal;
function respond(headers: Record<string, string> = {}, snapshot = payment()) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "https://checkout.example");
    const body = url.pathname.endsWith("/currencies") ? catalogue() : snapshot;
    return new Response(JSON.stringify(body), {
      status: url.pathname.endsWith("/payments") && init?.method === "POST" ? 201 : 200,
      headers: { "content-type": "application/json", ...headers },
    });
  });
  vi.stubGlobal("fetch", fetch);
  vi.spyOn(Date, "now").mockReturnValue(browserNow);
  return fetch;
}

describe("production client catalogue validation and optional clock headers", () => {
  it("loads API rules before creating a payment and caches them for status reads", async () => {
    const fetch = respond();
    const client = createPaymentClient("/api", "invoice_2026-0042");
    const result = await client.create(
      { currency: "TOK", network: "custom-chain" },
      signal(),
    );
    expect(result.data).toEqual(payment());
    expect(fetch.mock.calls).toHaveLength(2);
    expect(new URL(String(fetch.mock.calls[0]![0]), "https://checkout.example").pathname).toBe("/api/currencies");
    expect(fetch.mock.calls[0]![1]?.method).toBe("GET");
    expect(fetch.mock.calls[1]![0]).toBe("/api/payments");
    expect(JSON.parse(String(fetch.mock.calls[1]![1]?.body))).toEqual({
      order_id: "invoice_2026-0042",
      currency: "TOK",
      network: "custom-chain",
    });
    await client.status("payment_custom_42", signal());
    expect(fetch.mock.calls).toHaveLength(3);
    expect(fetch.mock.calls[2]![0]).toBe("/api/payments/payment_custom_42");
  });

  it.each(["create", "status", "requote"] as const)(
    "keeps cross-order response rejection on %s with arbitrary order formats",
    async (method) => {
      respond({}, { ...payment(), order_id: "another-invoice" });
      const client = createPaymentClient("/api", "invoice_2026-0042");
      const pair = { currency: "TOK", network: "custom-chain" };
      const result = method === "create"
        ? client.create(pair, signal())
        : method === "status"
          ? client.status("payment_custom_42", signal())
          : client.requote("payment_custom_42", pair, signal());
      await expect(result).rejects.toBeInstanceOf(ApiError);
      await expect(result).rejects.toMatchObject({ protocol: true });
    },
  );

  it("rejects a payment fee that differs from its fetched catalogue", async () => {
    const snapshot = payment();
    snapshot.quote.network_fee = "0.12500001";
    respond({}, snapshot);
    await expect(
      createPaymentClient("/api", "invoice_2026-0042").status("payment_custom_42", signal()),
    ).rejects.toMatchObject({ protocol: true });
  });

  const clockCases: Array<[Record<string, string>, string]> = [
    [
      { "x-server-time": "2026-10-03T11:58:01.123Z", date: "Sat, 03 Oct 2026 11:59:00 GMT" },
      "2026-10-03T11:58:01.123Z",
    ],
    [{ date: "Sat, 03 Oct 2026 11:59:00 GMT" }, "2026-10-03T11:59:00.000Z"],
    [
      { "x-server-time": "invalid", date: "Sat, 03 Oct 2026 11:59:00 GMT" },
      "2026-10-03T11:59:00.000Z",
    ],
    [{}, "2026-10-03T12:00:00.000Z"],
    [{ "x-server-time": "invalid", date: "invalid" }, "2026-10-03T12:00:00.000Z"],
  ];
  it.each(clockCases)("uses the best available clock sample from headers %j", async (headers, expected) => {
    respond(headers);
    const result = await createPaymentClient("/api", "invoice_2026-0042").status(
      "payment_custom_42",
      signal(),
    );
    expect(result.data.order_id).toBe("invoice_2026-0042");
    expect(Date.parse(result.serverTime)).toBe(Date.parse(expected));
  });
});
