# Vue checkout architecture

Status: implemented; independent verification results are recorded under reports/gates. The user selected Vue 3, TypeScript and Vite. The domain and verification rules come from the reviewed architecture, with mock-specific assumptions made explicit in `API_CONTRACT.md`.

## Outcome and boundaries

A shopper sees the merchant, order, exact amount and an unmistakable network; they can obtain a quote, copy/scan its address, and follow payment progress or recovery. The running website uses a real HTTP mock with in-memory state and controllable scenarios. No actual funds move. No runtime AI is required.

## Target layout

Implemented module layout (additional presentational copy, badge and demo controls are included):

```text
src/
  main.ts
  App.vue
  features/checkout/
    CheckoutPage.vue
    components/
      OrderSummary.vue
      AssetNetworkSelector.vue
      QuoteDetails.vue
      PaymentProgress.vue
      RecoveryPanel.vue
    application/usePaymentController.ts
    domain/paymentModel.ts
    domain/money.ts
    domain/quotePolicy.ts
    infrastructure/paymentClient.ts
    infrastructure/responseSchemas.ts
    infrastructure/ClockService.ts
mock/
  server.ts
  catalogue.ts
  fixtures.ts
  scenarios.ts
tests/
  unit/
  component/
  contract/
  acceptance/
  audit/
```

Use `.vue` SFCs with `<script setup lang="ts">`, typed props/emits, `@vitejs/plugin-vue`, strict TypeScript and a pinned npm lockfile. Choose supported compatible tool versions during P01 and record the Node prerequisite. Keep money and transitions in plain TypeScript, independently testable without Vue.

## Ownership and data flow

`CheckoutPage.vue` creates exactly one `usePaymentController`. Display components consume readonly data and emit user intents. They do not create polling loops or fetch payment state themselves.

User intent -> controller -> API -> validated immutable snapshot -> pure transition function -> shallowRef -> computed display model -> Vue components.

Use a single explicit controller action for selection changes. Do not start the same request from both a watcher and an event handler. Local composable state is adequate; introduce Pinia or routing only if a concrete need justifies it. Register `onScopeDispose` synchronously in the composable; dispose timers/listeners and abort requests. Test both mount/unmount and explicit scope disposal.

## Three state dimensions

| Dimension | Values and purpose |
| --- | --- |
| Payment | `awaiting_payment`, `detected`, `confirming`, `underpaid`, `paid`, `overpaid`, `expired`, `failed`; financial facts from validated server responses |
| Request health | loading, fresh, stale, unavailable; whether the latest financial facts can be refreshed |
| Quote availability | usable, local deadline reached, reconciling, server-expired; whether transfer instructions can be offered |

Keep all three distinct. A timeout cannot turn a detected payment into failed. A local clock reaching zero cannot erase received funds. Track reference and a client quote-generation token separately because requote preserves the reference.

## Transition and action policy

| Payment state | Shopper action | Polling and deadline |
| --- | --- | --- |
| awaiting_payment | Send exact total on shown network; selection changes allowed before funds | Poll; quote deadline controls send details |
| detected | Wait; show zero confirmations; no second transfer | Poll; ignore original quote expiry |
| confirming | Wait; show n of m confirmations | Poll; ignore original expiry |
| underpaid | Send only outstanding amount to stated address/network | Poll; no invented top-up deadline |
| paid | Read completion and reference | Stop polling |
| overpaid | Read received/excess values; merchant handles excess | Stop polling; never promise a refund |
| expired | Ask for a new quote after server confirmation | Stop automatic polling; explicit requote starts a new generation |
| failed | Read failure and reference; merchant assistance | Stop polling; no blind resend |

Polls may skip intermediate states. `awaiting_payment -> paid` is valid. Repeated snapshots are idempotent; do not add `amount_received` again. Ignore old-generation responses and reject unexplained regressions within a generation. A successful requote explicitly resets the lifecycle. Document mock transitions and malformed-response handling rather than inventing extra API states.

## Time and polling

Compute `max(0, expiresAt - estimatedServerNow)`; timer callbacks merely trigger recalculation. Use an injectable server clock in the mock. Add an explicitly documented server-time header, estimate with monotonic elapsed time, and account for round-trip uncertainty. Re-anchor on visibility/focus after suspension or clock discontinuity. Server confirmation controls recovery when time is uncertain.

At local zero without known funds: hide copy/QR/send instructions, show that quote time ended and payment is being checked, then reconcile through the same polling owner. A detected/confirming/underpaid result takes precedence. A server-expired result enables normal requote. If unreachable, keep the last known facts with a stale indicator and do not encourage another transfer.

Schedule each GET only after the previous one settles. Coalesce visibility, retry and timer triggers into one single-flight mechanism. Defaults for the demo: 2-second poll interval, 10-second request timeout, capped 2/4/8/16/30-second GET backoff. Inject timing for tests. Abort and invalidate pending callbacks on terminal state, replacement and disposal. Do not let a late `finally` schedule another poll for a disposed generation.

Serialize creation and requote. Disable double-click submissions. An aborted POST may still have executed on the server; do not automatically retry an uncertain creation. Selection replacement and detection are checked atomically by the mock, not only by the UI.

## Exact money and transfer coherence

Parse validated decimal strings into integer minor units using the currency scale (USDT/USDC 6, ETH 18). Reject excessive fractional precision; operate only on matching units/scales. Never convert monetary values through `Number` or `parseFloat`. Format values exactly. Milliseconds and confirmation counts can use ordinary numbers.

Use quoted `total_due` for transfer instructions. Show amount, fee, total and rate with units; do not recalculate the quote from the rate. Fiat formatting must preserve EUR 149.90 in different locales. Independently check the chosen formatter in target browsers.

Token, network, amount, address, QR and copy value come from one accepted quote. While replacement is loading, never mix the new selection with the old address. Prominently repeat the network. QR contains only the address under the current contract and explains that amount/network still need checking. Decode QR and inspect clipboard contents in tests. Provide fallback when clipboard access fails.

## Errors and usability

Validate all response identities, discriminated state fields, amounts and confirmation counts at the boundary. Unknown/malformed payloads produce a protocol error and disable unsafe actions, not invented success. Preserve the last verified facts on HTTP errors and expose retry/status age. Parse problem+json 409 errors; refetch instead of fabricating a new deadline.

Use keyboard-accessible controls, explicit labels, visible focus and status announcements without announcing every countdown second. Check mobile layouts and 200% zoom. Status meaning must not depend on color alone. Do not fabricate support URLs, refund guarantees, blockchain links from truncated hashes, or merchant-return URLs absent from the contract.

## Design integration

[DESIGN_SPEC.md](DESIGN_SPEC.md) defines the 24-page visual reference and D01-D12 state mapping. Implement these as projections of the same controller state, not separate routes or copied pages. Small presentational header/footer/step components and shared CSS tokens may be added without changing data ownership. Before the first quote, selection is a draft and Continue creates it; after a quote exists, a changed pair triggers the single replacement action. Financial facts, timers, QR and available actions remain derived from the accepted API snapshot. Independent visual comparison joins G3A; repeatable visual regressions join G4, with VM01-VM02 auditing at G5.

## Implementation details confirmed during review

Successful malformed responses keep transfer controls blocked until a validated snapshot arrives. HTTP 5xx after a mutation is an uncertain outcome, so the controller does not offer another creation. The reducer rejects decreases in received amounts. The mock retains an observed-funds latch through failed states and only an explicit demo reset clears it. Supported network metadata and address shapes are validated without imposing an unsupported real-chain checksum or recalculating total_due.

On focus/visibility or a wall/monotonic discontinuity, awaiting transfer instructions wait for a fresh accepted time sample. Received-funds states stay independent of the old expiry. Selection visibility derives from controller permission so detected funds immediately close a previously open Change selector. Evaluator controls are available only with ?demo=1. Preview starts the same mock and serves the built bundle via the /api proxy.

## Decision rationale

These decisions are preserved here so separate ADR input files are unnecessary. Record any changed decision with its context, alternatives, outcome and consequences in implementation evidence.

1. **State and Vue ownership.** Ad hoc component booleans spread lifecycle rules; a global state-machine library adds machinery for a small page. A pure TypeScript transition model owned by one Vue composable keeps rules explicit and independently testable. Separate payment, transport and quote state; introduce a global store only if a real need appears.
2. **Time and polling.** A decremented counter drifts when callbacks are delayed, and fixed-interval requests can overlap. A deadline-derived clock and completion-scheduled controller make cancellation, reconciliation and backoff explicit. We own those edge cases and must test them; estimated server time still has uncertainty.
3. **Exact money.** Number arithmetic cannot serve the required decimal precision. A decimal library is an option for future complex rate math. Scaled BigInt fits the required exact addition/subtraction/comparison, with parsing and formatting tests. Server total_due remains authoritative.
4. **Mock semantics.** Inventing statuses or silently changing requote semantics would hide contract gaps. Preserve explicit endpoints and states, document atomic replacement for unfunded attempts, and acknowledge unsupported real-service late-payment behavior. These are mock assumptions, not production guarantees.

## One thing I would defend

I would defend withholding a retry button after an uncertain creation POST. A timeout or HTTP 500 does not establish whether the server created a payment, and this contract supplies neither an idempotency key nor an order-to-attempt lookup. Retrying could create a second payment target while the first remains valid. The page therefore stops new creation and unsafe sending while preserving any verified facts. This sacrifices immediate recovery for a clear boundary on what the client knows. With a real provider, the first improvement would be idempotent creation and an explicit reconciliation endpoint, so the shopper could recover without guessing. The same principle keeps local quote expiry separate from observed funds: an expired clock can hide instructions, but it cannot erase a detected payment.
