# ADR 003: Preserve payment identity when a request is uncertain

Status: Accepted for the current API and local mock.

## Context

A creation POST can reach the backend even if the response times out. Automatically repeating it could create another payment. The shopper API has no idempotency key, payment lookup by order, cancellation route or separate merchant/order metadata endpoint.

## Options

| Option | Trade-off |
| --- | --- |
| Retry every failed creation | Convenient, but an unknown result can lead to duplicate creation. |
| Invent additional recovery endpoints | Could simplify the frontend, but changes the supplied payment contract. |
| Preserve the known identity and block uncertain creation | Keeps the contract and avoids blind retries, but sometimes requires explicit recovery. |

## Decision

Use the third option. Before a creation POST, store an order-specific pending marker. Save the accepted payment reference after a verified response. If the outcome is uncertain, do not automatically repeat the POST, including after reload. Storage contains identity and recovery markers, not transfer instructions.

A fresh checkout needs two ordinary creation requests: the first supplies merchant/order display metadata; the first Continue supplies the accepted payment. The initial response's reference and quote are discarded by the frontend, while its unfunded backend record remains until replaced or reset. Both requests use the same uncertainty protection.

| Action | Payment identity |
| --- | --- |
| Change | Retain it internally; hide the footer reference during selection. |
| Continue with the same accepted pair | Read the existing payment and retain its original quote/deadline. |
| Continue with a different pair | Accept a new payment and reference after a successful creation response. |
| Requote an expired, unfunded payment | Keep the reference and replace the quote. |
| Failed replacement | Retain the old payment for reconciliation; its reference may reappear with the error. |

The mock rejects replacement/requote once funds have ever been observed for that order. It rechecks eligibility after injected delays and retains that funds-observed record until reset. A 409 with an existing reference triggers a status read rather than a fabricated replacement.

Demo commands change backend state without forcing a frontend refresh. Reset clears backend demo state globally and reloads the current page. Timed confirmation progression happens on payment reads, using the mock clock.

## Consequences

- An uncertain creation blocks another attempt and may require merchant assistance. Local demo recovery can explicitly reset the mock.
- Cross-reload protection depends on available browser storage; storage errors are caught.
- Metadata loading creates an extra unfunded payment and request. A future real integration needs an explicit metadata/recovery contract to remove this compromise.
- The mock uses memory storage, fixed fixture addresses/rates and a public signing key. It does not provide production payment recovery, chain monitoring or refunds.
- Expired payments stop automatic polling. Underpaid top-up expiry keeps checking the existing reference within retry limits.

## Code and evidence

- [Mock HTTP server](../../backend/server.ts)
- [Browser storage](../../src/features/checkout/infrastructure/paymentStorage.ts)
- [HTTP client](../../src/features/checkout/infrastructure/paymentClient.ts)
- [API contract](../API_CONTRACT.md)
- [Reference and data reuse](../DESIGN_DOC.md#what-change-and-continue-reuse)
