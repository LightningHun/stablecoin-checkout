# Behavior contract (must stay identical)

This is the definition of "maintaining functionality" for the refactor. Everything listed here was verified at gates G3A, G4 and G5. Line numbers refer to the starting commit `7a44f8a`; re-locate them with `grep` after edits.

Sources: `git show HEAD:docs/ARCHITECTURE.md`, `HEAD:docs/API_CONTRACT.md`, `HEAD:docs/DESIGN_SPEC.md`, `HEAD:docs/VERIFICATION.md`, and the existing tests.

## 1. Safety invariants

| ID | Invariant | Where it lives today | Guarded by |
| --- | --- | --- | --- |
| INV-01 | **Three state dimensions stay separate.** `payment` holds financial facts from validated responses only. `health` is `loading`, `fresh`, `stale` or `unavailable`. `availability` comes from `quoteAvailability`. Transport or protocol failures change `health`, `error`, `protocolBlocked`, `failures` and `uncertain`, never `payment`. | `usePaymentController.ts` `markError` (L93-99), `accept` (L119-157) | controller T15 and T11 tests; `checkout.spec` T15; **M11** |
| INV-02 | **Observed funds beat local expiry.** `detected`, `confirming` and `underpaid` never become `local-deadline-reached` or `server-expired` because of the clock. `underpaid` stays `usable` with the outstanding amount. Funded states cannot transition to `expired` or `awaiting_payment`. | `quotePolicy.ts` L15-20; `paymentModel.ts` `allowed` table L82-113 | `policy.test` T08; `audit-policy.test`; controller T08; `checkout.spec` T08; **M01, M10, A04, A07** |
| INV-03 | **Local zero without funds** hides every transfer control, shows the "Checking payment status…" notice and triggers exactly one reconciling poll through the single owner (`localExpired` latch). | controller ticker L318-336; `CheckoutPage.vue` L215-218 | `transport.spec` T07; `demo.spec` T14 (real 15 s TTL) |
| INV-04 | **Exact money.** Decimal strings go through `parseUnits`/`formatUnits` with scale 6 (USDT, USDC) or 18 (ETH), and excess precision is rejected. `Number` and `parseFloat` are never used on money. `total_due` is authoritative and is never recomputed from the rate. `underpaid` transfers only `amount_outstanding`. Fiat formatting keeps exact cents in any locale. | `domain/money.ts`; `quotePolicy.ts` `transferAmount` | `money.test`; `schema.test`; `policy.test`; **M06, M08, A01, A02** |
| INV-05 | **One coherent quote snapshot.** Token, network, amount, address, QR and clipboard value all come from the same accepted `Payment`. While a replacement is in flight (`busy`), only the loading skeleton shows, never the old address. A create or requote response for a different pair is a protocol error. | `CheckoutPage.vue` L177-208; `QuoteDetails.vue`; controller L238-246 | `transport.spec` T03; `audit-transfer.spec`; `checkout.spec` T04; **M07, A09** |
| INV-06 | **Single owner, single flight.** Only `CheckoutPage.vue` creates the controller. At most one request (GET or POST) is in flight: `active` is shared by `initialize`, `poll` and `mutate`. A poll is scheduled only after the previous one settles. Focus, visibility, retry and timer triggers coalesce. | controller `poll` L158-183, `schedule` L79-92 | controller T09 tests; `rendering.test` T09; **M03** |
| INV-07 | **Terminal states stop automatic polling**: `paid`, `overpaid`, `expired`, `failed`. A manual retry may force one GET (`poll(true)`). | controller `schedule`, `poll` | controller and `transport.spec` T10; **M04** |
| INV-08 | **Generations and references.** Every mutation and every disposal increments `generation`. Responses from an old generation or another reference are ignored. Requote keeps the same `payment_reference`. Only a replacement (create) may change it. | `paymentModel.ts` `acceptSnapshot` L114-125; controller `accept` | `policy.test` T10; controller T03/T10; `http.test` T14; **M05, M12, A03, A08** |
| INV-09 | **Monotonic facts.** Status changes follow the transition table. `confirmations` and `amount_received` never decrease. A status poll must not change the quote: if it does, that is a protocol error. Repeated snapshots are idempotent; amounts are never accumulated. | `acceptSnapshot` L126-152; controller L139-148 | `policy.test`; `audit-policy.test`; controller T11; **A04, A05** |
| INV-10 | **Serialized mutations.** `busy` coalesces double submissions. A selection made while busy is queued (`pendingPair`, last one wins) and applied afterwards. The controller aborts and awaits the in-flight GET before posting. A POST that may have executed (network error, timeout, non-4xx failure) sets `uncertain`: no automatic retry, no further create, retry hidden. A 409 refetches status. Other 4xx responses only mark an error. | controller `mutate` L204-281, `select` L285-293 | controller T14/T15; `transport.spec` T14/T15 |
| INV-11 | **Requote only after server-confirmed expiry.** The controller first reconciles with a GET. If the result is not `expired`, or funds exist, it does not POST. | controller L222-231 | controller "M10 reconciliation" test; **M10** |
| INV-12 | **Protocol errors pause transfer.** These all count: invalid JSON on 2xx, schema failure, missing or invalid `x-server-time`, identity or regression rejection, a changed quote, a pair mismatch. Each sets `protocolBlocked`, which makes availability `reconciling` until a validated response arrives. The block survives later transport errors (`||=`). | `paymentClient.ts` L43-76; controller `markError`, `accept` | `client.test`; controller T11; `checkout.spec` T11 (malformed status, invalid JSON) |
| INV-13 | **Server-aware clock.** `remaining = max(0, expiresAt − (serverAnchor + monotonic elapsed) − rtt/2)`. Timers only trigger recalculation. If wall-clock and monotonic deltas differ by more than 2000 ms, or on any `focus` or `visibilitychange` event (hiding as well as showing), `clockUncertain` is set while the payment is `awaiting_payment`. That blocks transfer until a fresh server sample arrives. | `ClockService.ts`; controller ticker, `resume` | `clock.test` T06/T07; controller T06/T07; **M02** |
| INV-14 | **Lifecycle cleanup.** `onScopeDispose(dispose)` is registered synchronously during setup. `dispose` increments the generation, clears the poll timer and the ticker, drops `pendingPair`, aborts the in-flight request and removes the `focus` and `visibilitychange` listeners. A late `finally` never reschedules. | controller L337-350 | controller T09 (scope stop, listener removal); `rendering.test` T09 (`vi.getTimerCount() === 0`) |
| INV-15 | **Truthful shopper copy.** No refund or custody promises, no invented links, no provider name. Network warning: "… sent on another network may be lost." Expired: "Automatic monitoring has stopped." Failed: "Do not send again." The QR holds the address only. | `PaymentProgress.vue`, `RecoveryPanel.vue`, `QuoteDetails.vue` | `rendering.test` T13/T11; `checkout.spec` T13; **M09** |
| INV-16 | **Draft before quote.** Changing the selection before the first quote posts nothing; Continue creates the quote. A payment reference is shown only after the API issues one. Once a quote exists, Change reopens the selector, and a changed pair triggers exactly one replacement. Detection closes the selector and removes Change and Continue. | `CheckoutPage.vue` `start`, `select`, `selectionVisible`; controller `select`, `canChange` | `checkout.spec` T01, T08 (VM02 ×2); `demo.spec` reset; **VM02** |
| INV-17 | **Mock semantics** (see §5). The funds latch atomically refuses replacement and requote. Expiry is applied lazily on read. Every response is a full coherent snapshot with no carried-over status fields. | `mock/server.ts`, `mock/fixtures.ts` | `http.test` (21 cases); `demo.spec` |

## 2. Constants that are contract (name them; never change them)

| Value | Meaning | Location |
| --- | --- | --- |
| `2000` ms | Poll interval (`pollMs` default) | controller L22 |
| `10000` ms | Request timeout (`timeoutMs` default) | controller L23 |
| `min(30000, pollMs × 2^min(max(0, failures−1), 4))` | GET backoff: 2, 4, 8, 16, 30, 30 s | controller L90 |
| `250` ms | Ticker interval (countdown, resync, local-expiry checks) | controller L336 |
| `2000` ms | Wall-versus-monotonic drift that forces a resync | `ClockService.ts` L30 |
| `(end − start) / 2` | Round-trip uncertainty added to the server time and subtracted from the remaining time | `ClockService.ts` L14-15, L25 |
| `900000` ms | Mock quote TTL (15 min) | `mock/scenarios.ts`; `fixtures.ts` `makePayment` |
| `5000` ms, max `30000` | Mock "slow" delay default and cap | `mock/scenarios.ts`; `server.ts` L109 |
| `10000` chars | Mock request-body limit (string length, not bytes) | `server.ts` L54 |
| `100306` | First mock reference sequence: `AQH-100306-PMT` | `server.ts` L17, L79 |
| `2026-08-14T08:37:10.842Z` | Default frozen "now" for `/api/demo/reset` with `freeze: true` | `server.ts` L82 |
| `ORD-88213`, `149.90` EUR, "Payment Project" | The demo order and merchant | client L87, schemas L128, page L35/L96/L116/L269, mock |
| `USDC → polygon`; otherwise first network | Default network when the currency changes (design D02) | `AssetNetworkSelector.vue` L22 |
| `200` px, margin 2, ECC "M" | QR generation options | `QuoteDetails.vue` L25-29 |
| `0.005` | Playwright screenshot tolerance (`maxDiffPixelRatio`) | `playwright.config.ts` |
| Ports 5173, 4173, 8787 (`MOCK_PORT`) | Dev, preview and mock servers | `vite.config.ts`, `scripts/serve.ts` |

## 3. Module API to keep (frozen)

Tests import most of these. The rest (`catalogueSchema`, `paymentSchema`, `statuses`, several types, `ClockService.sampled`) are the modules' public surface, used by production code or kept for stability. Keep each export name, signature, parameter order, defaults and return shape. You may add exports and change internals.

| Module | Frozen exports |
| --- | --- |
| `domain/money.ts` | `parseUnits(value, scale): bigint`, `formatUnits(value, scale, minFraction = 2): string`, `addMoney(a, b, scale)`, `subtractMoney(a, b, scale)`, `formatFiat(value, locale = "en-IE")` |
| `domain/paymentModel.ts` | `statuses` (ordered tuple), types `PaymentStatus`, `CurrencyCode`, `Pair`, `Network`, `Currency`, `Quote`, `Payment`, `RequestHealth`; `isTerminal(status)`, `hasFunds(status)`; `acceptSnapshot(previous, incoming, expectedReference = incoming.payment_reference, generation = 0, currentGeneration = 0): Payment \| null` |
| `domain/quotePolicy.ts` | type `QuoteAvailability`; `quoteAvailability(payment, now, blocked = false)`; `transferAmount(payment)` |
| `infrastructure/ClockService.ts` | `class ClockService(monotonic?, wall?)` with `sample(iso, start, end)`, `now()`, `remaining(expiresAt)`, `needsResync()`, getter `sampled` |
| `infrastructure/paymentClient.ts` | `ApiResult<T>`, `PaymentClient` (`currencies`, `create`, `status`, `requote`, all taking an `AbortSignal`), `class ApiError(message, status = 0, protocol = false)`, `createPaymentClient(base = "/api")` |
| `infrastructure/responseSchemas.ts` | `parsePayment(input)`, `catalogueSchema`, `paymentSchema` |
| `application/usePaymentController.ts` | `usePaymentController({ client?, clock?, pollMs?, timeoutMs? })` returning at least `payment`, `currencies`, `health`, `error`, `busy`, `draft`, `remaining`, `availability`, `canChange`, `lastChecked`, `uncertain`, `initialize`, `create(pair = draft)`, `select(pair)`, `requote()`, `retry()`, `dispose`. `generation` is returned but nothing consumes it; removing it is allowed (RF-14). |
| `components/QuoteDetails.vue` | props `{ payment: Payment; remaining: number }` |
| `components/PaymentProgress.vue` | props `{ payment: Payment \| null; health: RequestHealth; lastChecked: number \| null }` |
| `mock/server.ts` | `createMockServer({ now? }): http.Server` |
| `tests/audit/mutations.ts` | `mutations: Mutation[]` with the existing fields. Only `patches[].before` and `patches[].after` may change, plus `file` when the guarded code moved to another file. |

## 4. HTTP contract of the mock

| Request | Success | Errors |
| --- | --- | --- |
| `GET /api/currencies` | 200 `{ currencies }`, exactly the 6 catalogue pairs in this order: USDT tron, USDT ethereum, USDC ethereum, USDC polygon, USDC solana, ETH ethereum | None. Faults do **not** apply. |
| `POST /api/payments` `{ order_id, currency, network }` | 201 full `awaiting_payment` Payment. The new reference is `AQH-<seq++>-PMT`, and the previous current payment is removed. | 400 `{title:"Unknown order"}`; 400 `{title:"Unsupported pair"}`, which **still consumes a sequence number** because `sequence++` is evaluated as an argument before `makePayment` throws; 409 problem+json with title "Funds already observed" after any funds |
| `GET /api/payments/:ref` | 200 full Payment. An `awaiting_payment` past its deadline is lazily saved as `expired`. | 404 `{title:"Unknown payment"}` |
| `POST /api/payments/:ref/requote` `{ currency, network }` | 201 fresh `awaiting_payment` quote with the **same** reference | 409 problem+json with title "Quote has not expired" and detail `The current quote is valid until <expires_at>. Current status: <status>.` when not expired or after funds |
| Other method or path under `/api` | | 405 `{title:"Method not allowed"}`; 404 `{title:"Not found"}`; 400 `{title:<error message>}` for bad JSON or an oversized body |

- **Every response** carries `Content-Type: application/json` (or `application/problem+json` for 409), `Cache-Control: no-store` and `x-server-time: <ISO>`. The problem `type` is `https://developers.triple-a.io/errors/quote-not-expired`.
- **Routing order.** Demo routes, then `GET /api/currencies`, then the generic 404 for any path outside `/api/payments`. All three are answered **before** metrics and faults.
- **Payments-route order of operations:**
  1. Count metrics (GET active and max).
  2. Read the body.
  3. Apply the `slow` delay.
  4. Apply `disconnect` (destroy the socket).
  5. Return a `500` fault `{title:"Temporary payment server error"}`.
  6. Route the request.
- **Demo controls** (faults never apply):
  - `POST /api/demo/reset {now?, freeze?, ttlMs?}` returns `{reset:true, now}`. It resets the scenario, payments, funds latch, current payment, sequence, clock and metrics.
  - `POST /api/demo/scenario {advanceMs?, fault?: "none"|"500"|"disconnect"|"slow", delayMs?, status?}` returns `{scenario, payment}`.
  - `GET /api/demo` returns `{scenario, payment, metrics, now}`.
- **Fixtures:**
  - USDT/Tron is the source quote: 162.69 + 1.00 = 163.69 at rate 0.9214, address `TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e`.
  - The other five pairs use the synthetic seeds in `mock/fixtures.ts`, which `tests/fixtures/oracles.ts` checks independently.
  - Status fixtures:
    - `detected`: 0 confirmations.
    - `confirming`: required − 1 confirmations.
    - `paid`: all confirmations plus `settled_at`.
    - `underpaid`: 120.00 received, or half the total for ETH.
    - `overpaid`: excess 16.31, or 0.01 for ETH.
    - `expired`: `expired_at`.
    - `failed`: `reason: "settlement_rejected"`.
  - `tx_hash` is `9d1f4c8a2be7...`.

## 5. UI contract

### Selectors and names to keep

Some are used by tests; the rest are stable hooks used by the DOM harness and the recorded G3A/G4 evidence. Keep them all.

- **`data-testid`:** `checkout`, `fiat-total`, `continue`, `change`, `selected-network`, `quote-loading`, `transfer-amount`, `transfer-address`, `transfer-qr`, `address-panel`, `copy-amount`, `copy-address`, `countdown`, `payment-status` (plus the attribute `data-status` = the payment status, or `selection` while the selector is open), `requote`, `retry`, `demo-controls`, `demo-state`, `demo-apply-state`, `demo-fault`, `demo-apply-fault`, `demo-reset`.
- **Roles and accessible names:**
  - Radios named exactly `USDT`, `USDC`, `ETH`; network radios named by `aria-label` = network name.
  - Buttons: `Continue with <TOKEN> on <Network>`, `Change`, `Copy address`, `Copy`, `Copy reference`, `Copy details`, `Get a new quote`, `Retry now`.
  - The textbox labelled `Copy manually`.
  - One `role="alert"` connection banner, outside `<main>`.
  - Exactly one `<main>`.
- **Text the tests match:**
  - `Payment Project`, `ORD-88213`, `€149.90` (en-IE), `149,90 €` (de-DE)
  - `Your money arrived`, `0 of 1 confirmations`, `This quote expired`, `Getting your quote for …`
  - `Demo controls · no real funds`, `<Network> network only`
  - `Amount received`, `Transaction`, `settlement rejected`, `Do not send again`
  - `HTTP 500` in the alert
  - The alert for malformed data contains "invalid"
  - The absence of "refund … automatically", "will be refunded", "went to Payment Project" and "Payment failed" for transport errors
- **Countdown and focus:**
  - The countdown is `mm:ss` from `Math.ceil(remaining / 1000)` and has no `aria-live` ancestor.
  - After Continue, and after a pair change once a quote exists, focus moves to the send-step `<section tabindex="-1">`.
- **Responsive layout:**
  - At 390 px and narrower, the address sits below the QR.
  - At 768 px and wider, it sits to the right of the QR.
  - There is no horizontal overflow at 320, 390, 768, 1280 or 1440 px, or at 200 % zoom.
  - The breakpoint is `@media (max-width: 600px)`.

### Exact error strings (shown in the banner)

| Source | String |
| --- | --- |
| client, 2xx with bad JSON | `The payment server returned invalid JSON. Transfer controls are paused.` |
| client, non-2xx | `problem.detail` ‖ `problem.title` ‖ `HTTP <status>` (`HTTP <status>` also when the body is not JSON) |
| client, schema or server-time failure | `The payment server returned invalid data. Transfer controls are paused.` |
| controller, identity or regression | `Unrecognized payment identity or state regression. Transfer controls are paused.` (shown when it comes from a GET. After a POST it is immediately replaced by the uncertain message below.) |
| controller, quote changed on poll | `Quote changed unexpectedly. Transfer controls are paused.` |
| controller, pair mismatch | `Quote does not match the requested network.` (thrown after `posted = true`, so the banner then shows the uncertain message; keep both the throw and that replacement) |
| controller, uncertain POST | `The quote request outcome is uncertain. Do not send or create another payment. Ask the merchant to check your order.` |
| controller, non-`Error` cause | `Connection unavailable` (for an `Error`, its `message` is shown as-is) |
| CopyButton | `Copied` / `Copy unavailable. Select and copy the value below.` |
| DemoControls | `Demo updated` / `Demo controls unavailable` |

Most other template copy is locked by the DOM equivalence harness (exact `innerText` and ARIA snapshot for 18 scenarios at 2 widths) and by the visual baselines. That includes the local-deadline notice (X05) and the uncertain-POST banner with the "quote is unavailable" text (X06).

Not covered by any scenario:

- `RecoveryPanel`'s busy label `Checking payment…`. It is unreachable today, because the page shows the loading skeleton whenever `busy` is true (see F-36).
- Error strings that need a real failure to appear.

Treat these strings as frozen and have the reviewer check them by hand.

## 6. Visual and rendered-output equivalence

- `npm run test:visual`: 24 approved baselines `tests/acceptance/design.spec.ts-snapshots/D01…D12-{1280,390}-chromium-darwin.png` at 0.5 % tolerance. They were approved at G3A against the design PDF. **Never update them.**
- `tests/refactor/dom-equivalence.spec.ts` covers D01-D12, plus the demo panel, the clipboard fallback, de-DE, an ETH quote, the local-deadline notice and the uncertain POST, each at 1280 and 390 px (36 captures). It compares the ARIA snapshot, `innerText`, focused element, element identity and attributes, layout boxes and about 70 computed style properties against a baseline captured before the first edit. Its tolerance is zero.

## 7. Mutation-audit anchors

`tests/audit/run.ts` requires each `before` string to occur **exactly once** in its file. If you touch any of these lines, run `npx tsx scripts/refactor/check-mutation-anchors.ts` and re-point the anchor ([VERIFICATION.md §5](VERIFICATION.md#5-re-pointing-a-mutation-anchor)).

The exact text lives in `tests/audit/mutations.ts`. The table cells below escape `|` as `\|`, so copy anchors from that file, not from here.

| ID | File (line at start) | Anchor text (first line) | Detecting test |
| --- | --- | --- | --- |
| M01 | `domain/quotePolicy.ts` (16) | `if (payment.status === "underpaid") return "usable";` | controller "T08 funds in detected survive deadline and HTTP 500" |
| M02 | `infrastructure/ClockService.ts` (4, 25) | `private uncertainty = 0;` and `return Math.max(0, Date.parse(expiresAt) - this.now() - this.uncertainty);` | `clock.test` "uses elapsed time after a coalesced two-minute suspension" |
| M03 | `application/usePaymentController.ts` (166) | `if (active) return active;` | controller T09 slow GET |
| M04 | controller (85, 163) | `      isTerminal(payment.value.status)\n` (in `schedule`) and `(!force && isTerminal(payment.value.status))` | controller "T10 terminal paid…" |
| M05 | `domain/paymentModel.ts` (122) | `generation !== currentGeneration \|\|` | `policy.test` T10 |
| M06 | `domain/money.ts` (12-15) | the `return ( BigInt(whole!) * … )` block | `money.test` ETH |
| M07 | `components/QuoteDetails.vue` (109) | `:value="address"` | `transport.spec` T03 replacement |
| M08 | `components/QuoteDetails.vue` (77) | `{{ amount }}` | `checkout.spec` T12 |
| M09 | `components/PaymentProgress.vue` (128) | `        payment reference.` (8 spaces) | `checkout.spec` T13 |
| M10 | controller (224-230) | the `const reconciled = …` reconciliation block | controller "M10 reconciliation…" |
| M11 | controller (93) | `function markError(cause: unknown) {` | `checkout.spec` T15 |
| M12 | `mock/server.ts` (186) | `              p.payment_reference,` (14 spaces, requote argument) | `http.test` "T14 M12…" |
| VM01 | `src/styles/main.css` (669-670) | `  .address-panel {\n    flex-direction: column;` (inside the 600 px media block) | `checkout.spec` "T18 responsive 390px…" |
| VM02 | `components/PaymentProgress.vue` (54) | `    <div class="progress-heading">` | `checkout.spec` "T08 VM02 detected…" |
| A01, A02 | `domain/money.ts` (34, 36) | `parseUnits(a, scale) + parseUnits(b, scale)` and the `-` variant | `money.test` |
| A03 | `domain/paymentModel.ts` (123) | `incoming.payment_reference !== expectedReference` | `audit-policy.test` |
| A04 | `domain/paymentModel.ts` (129) | `!allowed[previous.status].includes(incoming.status))` | `policy.test` regression |
| A05 | `domain/paymentModel.ts` (136) | `incoming.confirmations < previous.confirmations` | `audit-policy.test` |
| A06 | `domain/quotePolicy.ts` (13) | `if (blocked) return "reconciling";` | `policy.test` |
| A07 | `domain/quotePolicy.ts` (16) | same line as M01 | `policy.test` T08 underpaid |
| A08 | controller (125) | `if (disposed \|\| gen !== generation.value) return false;` | controller T09 disposal (**known equivalent survivor**) |
| A09 | `components/QuoteDetails.vue` (25) | `QRCode.toDataURL(value, {` | `audit-transfer.spec` |

Most anchors include their leading indentation. The exceptions are M07, M08, A01, A02 and A09. Indentation is especially fragile for M04, M09, M12, VM01 and VM02. Prettier reflow or a moved block breaks an anchor even when the code is unchanged.

## 8. Decisions that are not bugs

- The merchant is "Payment Project", not the brief's "Nordwind Audio". Tests, oracles and approved baselines all use it.
- Expired stops automatic polling. The UI says monitoring has stopped and advises against sending again.
- There are no refund guarantees, custody claims, help, explorer or merchant links, and no provider name. The footer reads "Demo checkout · no real funds".
- Status fixtures use confirmation counts normalized to the selected network, unlike the mixed source snippets.
- A08 survives the mutation audit as reviewed redundancy. The runner exits 1 because of it, by design.
