# Codebase map and refactor findings

A snapshot of the starting commit `7a44f8a`. Line numbers ("L") refer to that commit. Findings (F-xx) link to plan steps (RF-xx) in [REFACTOR_PLAN.md](REFACTOR_PLAN.md).

## 1. Runtime topology

```text
npm run dev / npm run preview  ->  scripts/serve.ts
    |- mock/server.ts      createMockServer()   127.0.0.1:8787   (in-memory, controllable)
    '- Vite dev or preview server               127.0.0.1:5173 / 4173
           '- proxy /api -> 127.0.0.1:${MOCK_PORT:-8787}
Browser: index.html -> src/main.ts -> App.vue -> features/checkout/CheckoutPage.vue
```

`serve.ts` imports the mock once, so a running dev server keeps the old mock code. Restart it after editing `mock/`.

## 2. Data flow (from ARCHITECTURE.md)

```text
user intent (Continue / pair change / requote / retry / focus)
  -> CheckoutPage.vue (sole owner) -> usePaymentController()
       -> paymentClient (fetch, AbortSignal, x-server-time)
            -> responseSchemas (zod shape + cross-field money checks) -> Payment
       -> acceptSnapshot (reference, generation, transition and monotonic guards)
       -> shallowRef payment (frozen) + ClockService.sample()
  -> computed projections (remaining, availability, canChange)
  -> presentational components (props in, emits out)
```

The three separate state dimensions are: `payment` (financial facts), `health` (request freshness) and `availability` (whether transfer instructions may be shown).

## 3. File inventory

| File | Lines | Responsibility | Hotspot |
| --- | ---: | --- | --- |
| `src/features/checkout/application/usePaymentController.ts` | 371 | The single controller: state, polling, single-flight, mutations, clock ticker, lifecycle | **High**: one 350-line closure, `mutate` is 77 lines |
| `src/features/checkout/CheckoutPage.vue` | 275 | Owns the controller; three-step layout; transport banner; skeleton; focus | **High**: 190-line template with inline logic |
| `src/features/checkout/infrastructure/responseSchemas.ts` | 237 | Zod wire schemas, supported-pair rules, cross-field money validation | **Medium**: 55-line `superRefine` monolith |
| `src/features/checkout/components/PaymentProgress.vue` | 211 | Confirmation step: heading, confirmations, receipt, copy reference | **Medium**: 5 inline status arrays, `title()` method |
| `mock/server.ts` | 201 | HTTP mock: catalogue, payments, requote, demo controls, faults, metrics | **Medium**: one 130-line handler |
| `mock/fixtures.ts` | 155 | Quote seeds, `makePayment`, `withStatus` | Low |
| `src/features/checkout/domain/paymentModel.ts` | 154 | Types, statuses, transition table, `acceptSnapshot` | Low |
| `src/features/checkout/components/QuoteDetails.vue` | 136 | Amount, network warning, QR, address, countdown | Low |
| `src/features/checkout/infrastructure/paymentClient.ts` | 100 | Fetch wrapper, `ApiError`, endpoints | Low |
| `src/features/checkout/components/AssetNetworkSelector.vue` | 95 | Currency segments, network cards, Continue | Low |
| `src/features/checkout/components/DemoControls.vue` | 67 | Evaluator panel (`?demo=1`) | Low (formatting) |
| `mock/catalogue.ts` | 66 | Six catalogue pairs | None |
| `src/features/checkout/domain/money.ts` | 51 | Exact decimal and `BigInt` money, fiat formatting | None |
| `src/features/checkout/components/RecoveryPanel.vue` | 37 | Expired-quote recovery | None |
| `src/features/checkout/infrastructure/ClockService.ts` | 36 | Server-anchored monotonic clock | Low (naming) |
| `src/features/checkout/components/CopyButton.vue` | 33 | Clipboard with manual fallback | Low (formatting) |
| `src/features/checkout/domain/quotePolicy.ts` | 23 | `quoteAvailability`, `transferAmount` | None |
| `scripts/serve.ts`, `scripts/fingerprint.ts` | 16, 10 | Dev and preview launcher; evidence manifest | Low (fingerprint is minified style) |
| `src/styles/main.css`, `tokens.css` | 825, 15 | Global styles and tokens | **Medium**: duplicates and late overrides |
| `tests/**` | 1584 | Oracle: unit, component, contract, Playwright, audit | **Frozen** |

The build produces `dist/assets/index-*.js` at 213.63 kB (gzip 71.93 kB) and `index-*.css` at 11.24 kB (gzip 3.09 kB), with Vite 7.3.6.

### Dependency directions

- `mock/*` imports production types and helpers (`paymentModel`, `money`). Moving or renaming those exports breaks the mock, so `npm run typecheck` covers `mock/` too.
- `tests/fixtures/oracles.ts` imports nothing from production, on purpose. Keep it that way.
- `tests/audit/mutations.ts` depends on exact **source text**, not on exports. See [BEHAVIOR_CONTRACT §7](BEHAVIOR_CONTRACT.md#7-mutation-audit-anchors).

## 4. Controller anatomy (`usePaymentController.ts`)

| Lines | Element | Notes |
| --- | --- | --- |
| 13-18 | `ControllerOptions` | `client`, `clock`, `pollMs`, `timeoutMs` (test injection) |
| 20-42 | State | Comma-chained `const` and `let` lists. Reactive: `payment`, `currencies` (shallowRef); `health`, `error`, `busy`, `protocolBlocked`, `uncertain`, `clockUncertain`, `tick`, `lastChecked`, `generation` (ref); `draft` (shallowRef). Non-reactive: `disposed`, `active`, `abort`, `timer`, `failures`, `pendingPair`, `localExpired`. |
| 43-46 | `remaining` | Reads `tick` to re-evaluate a non-reactive clock |
| 47-65 | `availability` | `quoteAvailability(payment, <contrived now>, <blocked expression>)` |
| 66-74 | `canChange` | Selection allowed only before funds and while the quote is usable |
| 75-92 | `clearPoll`, `schedule` | Backoff formula inline at L90 |
| 93-99 | `markError` | Transport and protocol bookkeeping, never touches `payment` (M11 anchor) |
| 100-105 | `sample` | Clock sample, tick, `lastChecked` |
| 106-118 | `request` | Per-request `AbortController` plus timeout |
| 119-157 | `accept` | Stale guard (A08), `acceptSnapshot`, quote-unchanged check, commit |
| 158-183 | `poll` | Single flight (M03), terminal guard (M04), schedules in `finally` |
| 184-203 | `initialize` | Catalogue fetch, using the same `active` slot |
| 204-281 | `mutate` | Create or requote: serialize, abort and await the GET, reconcile (M10), POST, validate the pair, classify errors (409 refetch or uncertain lock), drain the queue |
| 282-317 | `create`, `select`, `requote`, `retry`, `resume` | Public intents |
| 318-336 | ticker (250 ms) | Clock drift becomes `clockUncertain` plus a poll; local zero triggers a one-time reconciling poll |
| 337-350 | `dispose`, listeners | Registered synchronously |
| 351-370 | return | Includes `generation` (unused by consumers) and `dispose` |

## 5. Findings

Categories: **R** = readability, **S** = simplicity, **E** = efficiency.

### Domain and shared knowledge

| ID | Cat | Finding | Step |
| --- | --- | --- | --- |
| F-01 | S | The currency-scale ternary `crypto_currency === "ETH" ? 18 : 6` (or `code === …`) appears 6 times: `paymentModel.ts` L145, L149; `responseSchemas.ts` L44, L183; `PaymentProgress.vue` L14; `mock/fixtures.ts` L87. | RF-01 |
| F-02 | R, E | Status groups are written as inline arrays. `isTerminal` and `hasFunds` (`paymentModel.ts` L78-81) allocate an array per call. Templates repeat `["paid","overpaid","failed"]` and `["detected","confirming",…]`: `CheckoutPage.vue` L62; `PaymentProgress.vue` L58, L65, L74, L176, L193. | RF-02 |
| F-03 | S | Demo order data is repeated as literals. `ORD-88213` appears 6 times (client L87, schemas L128, page L96 and L269, fixtures L58, server L151). `"Payment Project"` appears at page L35 and fixtures L60, and `"149.90"` at page L116 and fixtures L61. | RF-03 |
| F-04 | S | The decimal regex `/^(0\|[1-9]\d*)(\.\d+)?$/` is duplicated in `money.ts` L7 and `responseSchemas.ts` L4. | RF-04 |
| F-05 | R | Display formatting is inline: countdown (`QuoteDetails.vue` L34-43), expiry clock (L121-127), dates (`PaymentProgress.vue` L168, L173, L206), confirmation plural and average time (`AssetNetworkSelector.vue` L63-74), and snake_case to words (`CheckoutPage.vue` L103, `PaymentProgress.vue` L131). | RF-05 |
| F-06 | R | `acceptSnapshot` (L114-154) has a frozen positional API. Its four guards are unnamed, and its amount check repeats the scale ternary. The table name `allowed` hides that it is a transition table. | RF-06 |

### Infrastructure

| ID | Cat | Finding | Step |
| --- | --- | --- | --- |
| F-07 | R | `responseSchemas.ts`: `catalogueSchema` (L15-59) uses `pairRules`, which is declared later (L61-113). It works only because `superRefine` runs later. | RF-07 |
| F-08 | R, S, E | The payment `superRefine` (L179-234) is a 55-line monolith. Its catch-all "Invalid monetary precision" hides which check failed. `amount_received`, `amount_outstanding`, `amount_excess` and `network_fee` are each parsed up to twice for a given status (`total_due` once). | RF-07 |
| F-09 | R | The EVM address regex is repeated 4 times (L83, L90, L97, L111). | RF-07 |
| F-10 | R | `paymentClient.request` infers the HTTP method from whether a body exists (L37-41). Protocol `ApiError`s are built by hand in 5 places: client L47-53 (protocol **only when `response.ok`**; a non-2xx response with a non-JSON body becomes `ApiError("HTTP n", status, false)`) and L71-75; controller L134-138, L144-148 and L242-246. | RF-08 |
| F-11 | R | `ClockService` has terse private names (`anchor`, `at`, `wallAt`), a magic `2000` (L30) and no description of its model. | RF-09 |

### Controller

| ID | Cat | Finding | Step |
| --- | --- | --- | --- |
| F-12 | R | Comma-chained declarations (L20-42), including seven `let`s in one statement (L36-42), so reactive and non-reactive state are hard to tell apart. | RF-10 |
| F-13 | R, S | `availability` (L47-65) passes the hard-to-read time argument `clock.now() + max(0, expires − clock.now() − remaining)`. It combines a live `clock.now()` with the cached, up to 250 ms old `remaining`. It means "usable ⇔ `expires > now` **and** `remaining > 0`" ([RF-11](REFACTOR_PLAN.md#rf-11-make-availability-readable-strict-equivalence)). It is **not** equal to `clock.now() + uncertainty`. | RF-11 |
| F-14 | R | `void tick.value` (L44, L48) is an invisible reactivity dependency. | RF-10 |
| F-15 | R | The backoff formula is inline (L90). Poll, timeout and ticker numbers are unnamed. | RF-10 |
| F-16 | S | `accept(result, gen, replace = false, expected = replace ? undefined : …)` (L119-157) combines a boolean flag with a default that depends on another parameter, and compares quotes with inline `JSON.stringify`. | RF-12 |
| F-17 | S | `mutate(pair, requote = false)` (L204-281) is 77 lines that mix eight concerns. | RF-13 |
| F-18 | S | Success bookkeeping is duplicated: `initialize` L191-195 and `accept` L149-154 both reset `health`, `error` and `protocolBlocked`. | RF-12 |
| F-19 | R | Single-flight bookkeeping (`active = work … if (active === work) active = null`) appears in three places (L166-182, L185-202, L212-274) without a name or comment. | RF-13 |
| F-20 | R | The ticker callback (L318-336) mixes clock-drift detection and local-deadline detection. | RF-10 |
| F-21 | S | `generation` (a writable ref) is returned but no consumer reads it (L362). | RF-14 |

### Components

| ID | Cat | Finding | Step |
| --- | --- | --- | --- |
| F-22 | R | `CheckoutPage.vue`'s template (L87-275) holds step-state classes (L121, L155-159, L240-244), marker glyph ternaries (L123-125, L161-163, a nested one at L246-254) and a 27-line skeleton (L177-203). | RF-17 |
| F-23 | E, R | `URLSearchParams(location.search)` is parsed twice (L28, L30-33). | RF-17 |
| F-24 | S | `funds` (L56-58) re-derives `hasFunds` through `'amount_received' in`, and `result` (L59-63) is an inline array. | RF-17 |
| F-25 | R, E | `PaymentProgress.vue`: the `title()` method is called from the template (L23-46, L76), the copy value and label use inline ternaries (L192-204), and the receipt `columns3` logic is inline (L142-147). | RF-15 |
| F-26 | R | `QuoteDetails.vue` formats the countdown and expiry inline. | RF-16 |
| F-27 | R | `AssetNetworkSelector.vue` has the magic `code === "USDC" ? "polygon"` with `c.networks[0]!` (L17-24), plus inline pluralization and duration (L63-74). | RF-16 |
| F-28 | R | `CopyButton.vue` and `DemoControls.vue` are not Prettier-formatted (dangling `</button\n    >`), and `CopyButton` encodes its state as a string comparison (`feedback === "Copied"`, L21). | RF-18 |
| F-36 | S | `RecoveryPanel`'s `busy` prop is always `false` when the panel renders. In `CheckoutPage.vue` it sits after `v-else-if="busy"` in the same chain (L177 before L209), so the disabled state and the `Checking payment…` label are unreachable. | RF-17 (optional) |

### Styles

| ID | Cat | Finding | Step |
| --- | --- | --- | --- |
| F-29 | R, S | `main.css`: `.address` is declared twice (L378 at 14 px, L770 at 15 px; the later one wins). Late "override" blocks are appended after the reduced-motion block (L766-825). A second `@media (max-width: 600px)` (L817) is separate from the first (L612). | RF-20 |
| F-30 | R | Raw colors repeat outside the tokens: `#355bea` ×2, `#555` ×4, `#444` ×2, `#909090` ×2 (one rule), `#666`, `#ededee`, `#ffffff33`. `#fff` and `white` are mixed. | RF-19 |

### Mock and scripts

| ID | Cat | Finding | Step |
| --- | --- | --- | --- |
| F-31 | R, S | `mock/server.ts`: one 130-line request handler (L70-200) mixes demo routes, metrics, fault injection and payment routes. Its state lives in eight closure variables (L16-24). | RF-21 |
| F-32 | R | Magic values in the mock: `100306` ×2, the default frozen time, the body limit `10000`, the delay cap `30000`, the problem type URL. | RF-21 |
| F-33 | R | `mock/fixtures.ts` L36-38 builds the Solana address at runtime with `.replace(/0/g,"1").replace(/I/g,"i")`. The result equals the literal `7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF`. | RF-22 |
| F-34 | R | `scripts/fingerprint.ts` is written in minified style. It crashes with ENOENT while tracked docs are missing from the working tree; that is expected and not to be "fixed" in the refactor. | RF-23 |
| F-35 | R | Prettier is a devDependency, but no `format` script exists. | RF-23 (optional) |

## 6. Code that is already in good shape (leave alone)

- `domain/money.ts` (apart from the shared regex), `domain/quotePolicy.ts`, `mock/catalogue.ts`, `mock/scenarios.ts`, `NetworkBadge.vue`, `OrderSummary.vue`, `RecoveryPanel.vue`, `App.vue`, `main.ts`. Small, clear and fully covered. Edit them only to apply shared constants.
- The QR `watch` with cleanup in `QuoteDetails.vue` (L17-33) correctly cancels stale async QR generation.
- The controller's ordering of `abort?.abort(); if (active) await active;` before any POST. That ordering *is* INV-06/INV-10.
