# Mock API contract

Source: [selected reformatted brief](reference/stablecoin-checkout-requirement-reformatted.pdf), pages 3-6. The design PDF is a visual reference and does not add API endpoints or provider capabilities; see DESIGN_SPEC.md for recorded conflicts. This is the implementation target for the exercise, not a live payment-provider contract. All money fields are decimal strings. Preserve explicit fixture values even where general prose is inconsistent.

## Endpoints

| Method and route | Input | Success |
| --- | --- | --- |
| GET /api/currencies | none | 200 `{ currencies: Currency[] }` |
| POST /api/payments | `{ order_id, currency, network }` | 201 full Payment |
| GET /api/payments/:reference | reference in URL | 200 Payment with updated status-specific fields |
| POST /api/payments/:reference/requote | `{ currency, network }` | 201 Payment; same reference, new quote, awaiting_payment |

Currency entries have `code`, `name`, `decimals`, `networks`. Each network has `id`, `name`, `network_fee`, `required_confirmations`, `avg_confirmation_seconds`.

| Currency | Decimals | Network ID | Network label | Fee | Confirmations | Avg seconds |
| --- | --- | --- | --- | --- | --- | --- |
| USDT | 6 | tron | Tron (TRC-20) | 1.00 | 1 | 60 |
| USDT | 6 | ethereum | Ethereum (ERC-20) | 4.50 | 3 | 180 |
| USDC | 6 | ethereum | Ethereum (ERC-20) | 4.50 | 3 | 180 |
| USDC | 6 | polygon | Polygon | 0.10 | 6 | 30 |
| USDC | 6 | solana | Solana | 0.01 | 1 | 15 |
| ETH | 18 | ethereum | Ethereum | 3.20 | 3 | 180 |

## Creation example from the source

Request: `{ "order_id": "ORD-88213", "currency": "USDT", "network": "tron" }`.

```json
{
  "payment_reference": "AQH-100306-PMT",
  "order_id": "ORD-88213",
  "status": "awaiting_payment",
  "merchant": { "name": "Nordwind Audio", "logo_url": null },
  "order": { "currency": "EUR", "amount": "149.90" },
  "quote": {
    "crypto_currency": "USDT",
    "network": "tron",
    "network_name": "Tron (TRC-20)",
    "exchange_rate": "0.9214",
    "crypto_amount": "162.69",
    "network_fee": "1.00",
    "total_due": "163.69",
    "crypto_address": "TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e",
    "required_confirmations": 1,
    "expires_at": "2026-08-14T08:52:10.842Z"
  }
}
```

Only this complete quote is supplied. Author and label synthetic quotes for the other pairs with appropriate address formats and exact precision. The source timestamps are examples, not a clock that should make every demo start expired. Keep source examples intact and derive runtime deadlines from an injected clock.

## Status payload fields

The GET description says it returns the payment plus updated fields. Return a coherent full base Payment in the runnable mock. Source snippets below describe status-specific additions, not an instruction to discard merchant/order/quote. Do not spread status-specific fields from a previous status onto a new one.

| Status | Required additional fields in the supplied examples |
| --- | --- |
| awaiting_payment | none |
| detected | confirmations: 0, required_confirmations: 1, amount_received: "163.69", tx_hash, detected_at |
| confirming | confirmations: 2, required_confirmations: 3, amount_received: "163.69", tx_hash |
| paid | confirmations: 3, required_confirmations: 3, amount_received: "163.69", tx_hash, settled_at |
| underpaid | amount_received: "120.00", amount_outstanding: "43.69", crypto_address, tx_hash |
| overpaid | amount_received: "180.00", amount_excess: "16.31", tx_hash, settled_at |
| expired | expired_at |
| failed | reason: "settlement_rejected" |

Source examples use tx_hash `9d1f4c8a2be7...`, detected_at `2026-08-14T08:44:02.120Z`, settled_at `2026-08-14T08:47:31.004Z`, expired_at `2026-08-14T08:52:10.842Z`. Underpaid uses the quoted Tron address. Source snippets mix one- and three-confirmation examples; make runtime scenarios coherent with the selected network and record that normalization. Do not change the source document or infer settlement from amount alone.

## Requote and errors

Unexpired quote: HTTP 409, Content-Type application/problem+json:

```json
{
  "type": "https://developers.triple-a.io/errors/quote-not-expired",
  "title": "Quote has not expired",
  "status": 409,
  "detail": "The current quote is valid until 2026-08-14T08:52:10.842Z."
}
```

Successful requote preserves `payment_reference`, returns 201 and awaiting_payment with a fresh quote. A client quote-generation token must still change. Refetch on 409; do not make up a fresh expiry. Validate payload shape and reference, and keep transport errors separate from payment state.

## Explicit mock decisions

These are implementation assumptions, not hidden additions to the brief. Record changes with their rationale in the implementation evidence; see the decision rationale in ARCHITECTURE.md.

1. Implement the eight explicit statuses. Do not invent two to match the introductory count.
2. Treat paid, overpaid, expired and failed as terminal for automatic polling. Overpaid is interpreted as settled because its fixture contains settled_at. Never promise automatic refunds.
3. Underpaid remains actionable using amount_outstanding and the supplied address; the original quote cannot expire partial funds. No top-up deadline is supplied.
4. Selection changes before observed funds use POST /api/payments for a new attempt. The in-memory mock atomically supersedes an unfunded attempt for the order and rejects replacement if funds were detected. Serialize changes client-side and never show old transfer instructions with a new selection. This mock policy does not solve late transfers to superseded addresses in a real service.
5. Requote is expiry-only and atomically checks that funds have not arrived. The client reconciles current state first; that check alone does not replace server atomicity.
6. Add a documented server-time header, injectable clock and no-store responses for the mock. Normal demo deadlines are relative; deterministic tests use fixed seeds. If cross-origin access is introduced, expose the header explicitly.
7. Status responses are snapshots, not amounts to accumulate. Duplicate delivery is idempotent. Overpaid can represent excess funds, including a second transfer, but does not prove transfer count.
8. Late funds after terminal expiry are not observable once required polling stops. Report the missing real-service contract rather than claim a guarantee the API cannot support.

## Scenario controls

Implement a clearly labelled demo panel or query controls that can force every state, network disconnection, HTTP 500 and a slow response, and can reset to a known seed. Keep controls outside the shopper's ordinary flow. Record exact controls in implementation evidence and verify them through T17; include them in a README only when its creation is requested. Use coherent network-confirmation fixtures and exact monetary values for each selected pair.

The mock should bind locally by default. All payment routes must work via the app's /api path using Vite proxying during development and a documented arrangement for preview. A standalone production-style build must be exercised in G3A, not only the Vite hot-reload view.

