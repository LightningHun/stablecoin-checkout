# ADR 001: One controller owns the payment lifecycle

Status: Accepted. This records the implemented design, not a claim that every test passes.

## Context

Several components display the same payment. Creation, status requests, retries and expiry can happen close together. If each component owns a poller or timer, they can send duplicate requests or display different payment versions.

The page also needs to distinguish the last payment result, the health of its connection and whether its transfer instructions are usable.

## Options

| Option | Trade-off |
| --- | --- |
| Requests and timers in each component | Easy to start, but ownership and cleanup become spread across the page. |
| A global store or state-machine library | Useful across multiple screens, but adds another abstraction for this single checkout. |
| One page-owned composable | Keeps requests and lifecycle coordination together while leaving rules in plain TypeScript. |

## Decision

`CheckoutPage.vue` owns one `usePaymentController`. Components receive typed props and emit actions. The controller holds the accepted payment in a `shallowRef` and exposes payment status, request health and quote availability separately.

The page manages visible sections and edits the controller's selection draft. Change hides transfer instructions and the footer reference while retaining the accepted payment for tracking. Only Continue submits a different pair.

One active request slot serializes payment work. Response validation checks order, reference, quote and request generation. The next poll is scheduled after the previous request completes. Disposal clears timers/listeners and aborts pending work. Demo scenario controls write to the backend; the existing poller observes them.

## Consequences

- There is one place to inspect polling, retries, cancellation and deadline handling.
- Presentational components do not need to understand HTTP request scheduling.
- The controller contains substantial coordination logic and needs lifecycle tests.
- Requests wait for active work to settle. Aborting a POST does not undo backend work.
- Clock continuity requires its own request/resume checks; see [ADR 002](002-time-money.md) for the mechanism and the remaining pageshow-only limitation. A single owner does not establish physical sleep or cross-browser coverage.

## Code and related decisions

- [CheckoutPage](../../src/features/checkout/CheckoutPage.vue)
- [Payment controller](../../src/features/checkout/application/usePaymentController.ts)
- [Transition rules](../../src/features/checkout/domain/paymentModel.ts) and [quote policy](../../src/features/checkout/domain/quotePolicy.ts)
- [ADR 002: amounts and deadlines](002-time-money.md)
- [ADR 003: uncertain requests](003-mock-recovery.md)
