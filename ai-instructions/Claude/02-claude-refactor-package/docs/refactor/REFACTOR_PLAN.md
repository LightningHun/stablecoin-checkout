# Refactor plan

Execute the steps in order. Check levels L1-L4 are defined in [VERIFICATION.md](VERIFICATION.md).

**Git mode: NO-COMMIT** ([REFACTOR_GUIDE §8](REFACTOR_GUIDE.md#8-git-mode-no-commit-the-users-current-choice)).

- Each step backs up its files with `scripts/refactor/step-backup.sh` and edits in place. Nothing is staged or committed.
- After each phase's L3 gate, stop and report to the user, then wait for "continue".
- Wherever this plan says "mutation preflight" after RF-00, read it as: run the anchor checker now, and leave the preflight for after the user commits.

Risk classes:

- **A**: cosmetic or local to one file. No template or CSS edits. Verify at L1.
- **B**: structural, or a mechanical substitution with identical values. This includes constants applied across modules, template expressions swapped for helpers, and CSS values swapped for tokens. Verify at L2, where the DOM harness proves rendered output is unchanged.
- **C**: control flow and async ordering, validation logic, template structure (extraction, moved elements, reformatted inline content), CSS cascade order, and mock routing. Verify at L2, plus a mandatory `refactor-reviewer` pass.

Every phase ends with an L3 gate. Steps marked *optional* need the user's approval first.

Progress checklist (update as you go):

- [ ] RF-00 Baseline and setup
- [ ] Phase 1, domain: RF-01 to RF-06, then L3
- [ ] Phase 2, infrastructure: RF-07 to RF-09, then L3
- [ ] Phase 3, controller: RF-10 to RF-14, then L3
- [ ] Phase 4, components: RF-15 to RF-18, then L3
- [ ] Phase 5, styles: RF-19 and RF-20, then L3
- [ ] Phase 6, mock and scripts: RF-21 to RF-23, then L3
- [ ] RF-99 Final verification and report

---

## RF-00 Baseline and setup

Risk: none (no source edits).

1. Check that `.claude/agents/refactor-reviewer.md` and `.claude/settings.json` exist (the one-time install in CLAUDE.md). If they don't, ask the user to install them and restart the session.
2. Check that `node -v` reports at least 22.12, then run `git status --short`. Expected:
   - Deletions (` D`) of `AGENTS.md`, `START_PROMPT.txt`, `docs/*.md`, `docs/adr/*` and `docs/reference/*`.
   - Untracked refactor-package paths.
   - **Nothing else.** If `src/`, `mock/`, `tests/`, `scripts/` or config files differ from `HEAD`, stop and ask the user.
3. Don't create a branch and don't commit (no-commit mode). The refactor package stays as untracked files.
4. Run `npm ci`.
5. Capture the baseline exactly as in [VERIFICATION §2](VERIFICATION.md#2-baseline-capture-rf-00): `npm run verify`, the test inventories, bundle sizes, DOM baseline, anchor check and the full mutation preflight.
6. Create `reports/refactor/REFACTOR_LOG.md` from the template in [VERIFICATION §6](VERIFICATION.md#6-evidence) and record the baseline. Don't commit it. Then **stop and report the baseline to the user.**

Done when the baseline shows 73/27/21/41/24 passing (or the visual suite is recorded as "not run: platform" off macOS), DOM captures 36/36, anchors OK, and the mutation preflight shows 22 detected plus A08 survived.

---

## Phase 1: domain and shared knowledge

### RF-01 Single source for currency scale

Risk B. Findings F-01, F-06.

- In `domain/paymentModel.ts`, add:

  ```ts
  export const CURRENCY_SCALE: Readonly<Record<CurrencyCode, number>> = { USDT: 6, USDC: 6, ETH: 18 };
  export const currencyScale = (code: CurrencyCode): number => CURRENCY_SCALE[code];
  ```

- Replace all six ternaries (paymentModel L145 and L149, responseSchemas L44 and L183, PaymentProgress L14, mock/fixtures L87).
- Equivalence: every `CurrencyCode` maps to the same number. Zod's `code` enum guarantees inputs are one of the three codes.
- Covered by `money.test`, `schema.test`, `policy.test`, `http.test` and `checkout.spec` T12.
- Anchors: none.

### RF-02 Named status groups

Risk B. Finding F-02.

- In `paymentModel.ts`, define module-level `ReadonlySet<PaymentStatus>` constants and predicates:

  | Constant | Statuses |
  | --- | --- |
  | `TERMINAL_STATUSES` | paid, overpaid, expired, failed |
  | `FUNDED_STATUSES` | detected, confirming, underpaid, paid, overpaid |
  | `OUTCOME_STATUSES` | paid, overpaid, failed |
  | `CONFIRMING_STATUSES` | detected, confirming |

  Keep `isTerminal` and `hasFunds` with the same signatures. Add `isOutcome` and `isConfirming`.
- Don't touch templates yet; RF-15 and RF-17 use the predicates.
- Anchors: M04 in the controller still calls `isTerminal(payment.value.status)`. Leave those lines alone.

### RF-03 Demo order constants

Risk B. Finding F-03.

- Add `domain/demoOrder.ts`:

  ```ts
  /** The single order this demo checkout sells. Merchant name is a recorded project decision. */
  export const DEMO_ORDER = { id: "ORD-88213", merchantName: "Payment Project", currency: "EUR", amount: "149.90" } as const;
  ```

- Use it in: the client create body, `z.literal(DEMO_ORDER.id)` and `z.literal(DEMO_ORDER.currency)` in schemas, the `CheckoutPage` fallbacks (merchant, order reference, footer, amount), `mock/fixtures.ts` (`order_id`, merchant, order) and the `mock/server.ts` order check.
- **Do not** import it into `tests/`.
- Equivalence: identical literals. TypeScript literal types are preserved by `as const`.
- Anchors: none. The DOM harness proves the page text is unchanged.

### RF-04 Shared decimal pattern

Risk A. Finding F-04.

- Export `DECIMAL_PATTERN` from `money.ts`. Use it in `parseUnits` and in `responseSchemas` (`z.string().regex(DECIMAL_PATTERN)`).
- The regex has no `g` or `y` flag, so sharing it is stateless.
- Anchors: M06's block (`money.ts` L12-15) is below the regex line. Keep it byte-identical.

### RF-05 Presentation formatters

Risk B. Finding F-05.

- Add `components/format.ts` with pure helpers that copy the existing expressions exactly:
  - `formatCountdown(ms)`: `Math.ceil(ms / 1000)`, then `mm:ss` with `padStart(2, "0")`.
  - `formatClockTime(iso)`: `toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })`.
  - `formatTime(value)`: `new Date(value).toLocaleTimeString("en-GB")`.
  - `formatDateTime(iso)`: `toLocaleString("en-GB")`.
  - `formatAverageTime(seconds)`: `seconds >= 60 ? seconds / 60 + " min" : seconds + " s"`. Keep the fractional-minute behavior.
  - `confirmationsLabel(n)`: `` `${n} ${n === 1 ? "confirmation" : "confirmations"}` ``.
  - `humanize(code)`: `code.replaceAll("_", " ")`.
- Optionally add `tests/unit/format.test.ts` with **literal** expectations, for example `formatCountdown(900000) === "15:00"`, `formatCountdown(1) === "00:01"` and `formatAverageTime(90) === "1.5 min"`. Record the new test count.
- Components switch to these helpers in Phase 4, not now.

### RF-06 `acceptSnapshot` readability

Risk C, reviewer required. Finding F-06.

- Keep the signature. Add a one-line comment above each guard: identity and generation, transition table, confirmations monotonic, received amount monotonic.
- Use `currencyScale` (already done in RF-01).
- Optionally rename `allowed` to `ALLOWED_TRANSITIONS`. This breaks the **A04** anchor, so re-point it ([VERIFICATION §5](VERIFICATION.md#5-re-pointing-a-mutation-anchor)).
- **Keep the condition lines for M05, A03 and A05 byte-identical**, including indentation.
- Phase 1 gate: L3. Phase 1 touches files holding M05, A03-A05, M06, A01, A02, M09, VM02 and M12 anchors, so the anchor checker must stay green. The mutation preflight is deferred until the user commits.

---

## Phase 2: infrastructure

### RF-07 `responseSchemas.ts` structure

Risk C, reviewer required. Findings F-07, F-08, F-09.

1. Move the pair rules above `catalogueSchema` and rename them to `SUPPORTED_PAIRS`. Type the key as `` `${CurrencyCode}/${string}` `` and add `pairKey(currency, network)`. Add named address patterns `TRON_ADDRESS`, `EVM_ADDRESS` and `SOLANA_ADDRESS`, keeping the exact regexes.
2. Extract the bodies of both `superRefine` callbacks into named functions that return issue messages: `catalogueIssues(currencies): string[]` and `paymentIssues(p): string[]`. Inside `paymentIssues`, parse each amount **once** into a local.
3. **Equivalence requirement: the accept or reject decision must be identical for every input.**
   - Keep the outer `try { … } catch { reject("Invalid monetary precision") }` semantics. Any parse failure anywhere in the payment checks must still reject.
   - Keep the catalogue check's **string** comparison `n.network_fee !== rule.fee`, which differs from the payment check's `parseUnits` comparison.
   - Keep `currencies.length !== 3`, the 6-unique-pairs rule and `decimals` as a union of the literals 6 and 18.
   - Issue message text is not user-visible, because the client maps every failure to its generic string. Still keep the messages.
4. Covered by `schema.test` (15 malformed payloads plus 8 full states), `http.test`, `client.test` and `checkout.spec` T11. If you add rejection cases, add them as **new** tests with literal payloads.

### RF-08 `paymentClient.ts` clarity

Risk B. Finding F-10.

- Make the method explicit: `request<T>(method: "GET" | "POST", path, signal, parse, body?)`.
- Add `ApiError.protocol(message)` or an exported `protocolError(message)` factory that returns `new ApiError(message, 0, true)`. The controller sites follow in RF-12 and RF-13. **The `ApiError` constructor is unchanged.**
- In the client, use the factory only where the error is unconditionally a protocol error (L71-75). The invalid-JSON branch (L47-53) is a protocol error **only when `response.ok`**. For non-2xx it is `ApiError("HTTP n", status, false)`, which must not pause transfer. No current test covers that branch, so add a new test file (e.g. `tests/unit/client-errors.test.ts`) asserting that a 502 with a non-JSON body rejects with `{ status: 502, protocol: false }` and message `HTTP 502`. Write it **before** touching the client.
- Collect user-visible error strings as named constants (for example `INVALID_JSON_MESSAGE`) next to where they are thrown. Strings must be byte-identical ([BEHAVIOR_CONTRACT §5](BEHAVIOR_CONTRACT.md#exact-error-strings-shown-in-the-banner)).
- Keep the order:
  1. `fetch`.
  2. JSON parse; on failure, the error depends on `response.ok`.
  3. For a non-ok response, the problem detail, then the title, then `HTTP n`.
  4. Server time plus `parse`, both inside one `try`. Any failure there is the protocol "invalid data" error.
- `end: performance.now()` is taken **after** `parse(value)` and feeds the clock's round-trip uncertainty. Keep it there.

### RF-09 `ClockService.ts` naming and documentation

Risk B. Finding F-11.

- Add a class doc comment describing the model:
  - The server anchor plus monotonic elapsed time gives "now".
  - Round-trip time / 2 is the uncertainty.
  - A drift between the wall clock and the monotonic clock of more than 2 s means a resync is needed.
- Rename the private fields `anchor`, `at` and `wallAt` to `serverAnchorMs`, `monotonicAtSample` and `wallAtSample`.
- Add `RESYNC_DRIFT_MS = 2000`.
- **Keep the two M02 anchor lines byte-identical:** `  private uncertainty = 0;` and the `remaining` return line. Both reference `uncertainty` and `this.now()`.
- Phase 2 gate: L3. Verify that `client.test` and `clock.test` still pass unchanged.

---

## Phase 3: controller (`usePaymentController.ts`)

This is the highest-value and highest-risk phase. Re-read INV-01 to INV-14 first. Within a step:

- Never reorder `await`s or state writes.
- Never change *when* timers or listeners are created.
- Never move `onScopeDispose(dispose)` after the listener registration, and never into async code.

Run `npm run test:component` repeatedly while you work.

### RF-10 Declarations, constants, ticker

Risk B. Findings F-12, F-14, F-15, F-20.

1. Split the comma-chained declarations into one per line, grouped as:

   ```ts
   // Reactive state exposed to CheckoutPage
   // Reactive internal state (drives computed availability)
   // Non-reactive flight control: never read from templates
   ```

2. Add the constants `DEFAULT_POLL_MS = 2000`, `DEFAULT_TIMEOUT_MS = 10000`, `TICK_MS = 250`, `MAX_BACKOFF_MS = 30000` and `MAX_BACKOFF_DOUBLINGS = 4`. Add `backoffDelay(failures)` returning `Math.min(MAX_BACKOFF_MS, pollMs * 2 ** Math.min(Math.max(0, failures - 1), MAX_BACKOFF_DOUBLINGS))`.
3. Rename `tick` to `clockTick` and add `function trackClock() { void clockTick.value; }`, with a comment explaining that the clock is not reactive and the ticker invalidates time-derived computeds.
4. Split the ticker body into `checkClockDrift()` and `checkLocalDeadline()`, called in the same order from one `setInterval(onTick, TICK_MS)`. The interval must still be created at the same point in setup.
5. Anchors: M03, M04, M11 and A08 must remain byte-identical. Run the checker.

### RF-11 Make `availability` readable (strict equivalence)

Risk C, reviewer required. Finding F-13.

**What the current expression means.** Let *E* be `expires_at` and *n* be `clock.now()` (read live). Let *r* be `remaining.value`, a **cached** computed refreshed on each 250 ms tick, so it can be up to one tick old when `availability` re-runs because `busy` or another flag changed.

The old time argument is `n + max(0, E − n − r)`. Write *d* = *E* − *n*:

- `E > n + max(0, d − r)` ⇔ `d > max(0, d − r)` ⇔ `d > 0 and r > 0`.
- So, for `awaiting_payment` with nothing blocking, the quote is **usable exactly while the server-aware deadline is ahead *and* the displayed countdown is above zero.**

Strictly equivalent target:

```ts
const transferBlocked = computed(() =>
  busy.value || protocolBlocked.value || uncertain.value ||
  (clockUncertain.value && payment.value?.status === "awaiting_payment"));
const availability = computed(() => {
  trackClock();
  // Usable only while BOTH the deadline is ahead and the displayed countdown (cached
  // `remaining`) is above zero. Passing +Infinity makes quoteAvailability() report
  // "local-deadline-reached" once the countdown shows 00:00.
  const now = remaining.value > 0 ? clock.now() : Number.POSITIVE_INFINITY;
  return quoteAvailability(payment.value, now, transferBlocked.value);
});
```

Proof: `E > (r > 0 ? n : +∞)` ⇔ `r > 0 and E > n`. A randomized check over 2 million (E, n, uncertainty, staleness) combinations found 0 mismatches for this target. The naive `n + uncertainty` form had thousands. A trial application kept unit 73/73, component 27/27 and the DOM harness 36/36 green. Same reactive dependencies (tick, payment, the flags). `clock.now()` has no side effects. The `now` argument is ignored unless the status is `awaiting_payment`.

**Do not use `clock.now() + uncertainty`.** It looks equivalent but is not. Near the deadline it can hide transfer instructions up to min(uncertainty, 250 ms) earlier when `remaining` is stale.

No test would catch that difference: the controller tests sample the clock with zero round-trip time, and `policy.test` calls `quoteAvailability` directly. The equivalence proof is the only guard, so the reviewer must check it.

Covered (partially) by controller T06/T07, the `policy.test` 1 ms boundary tests, `transport.spec` T07 and DOM harness X05.

### RF-12 Split `accept`

Risk C, reviewer required. Findings F-16, F-18.

Target:

```ts
/** Same payment, same quote: status polls, reconciliation and 409 refetch. */
function acceptStatus(result: ApiResult<Payment>, gen: number): boolean {
  return commitSnapshot(result, gen, payment.value, payment.value?.payment_reference);
}
/** New or renewed quote: no previous snapshot; a requote must keep its reference. */
function acceptNewQuote(result: ApiResult<Payment>, gen: number, expectedReference?: string): boolean {
  return commitSnapshot(result, gen, null, expectedReference);
}
function commitSnapshot(result, gen, previous, expectedReference): boolean {
  if (disposed || gen !== generation.value) return false;   // A08 anchor: keep this exact line, once
  // acceptSnapshot(previous, result.data, expectedReference ?? result.data.payment_reference, gen, generation.value)
  // if previous && !isSameQuote(next.quote, previous.quote) -> protocolError("Quote changed unexpectedly. …")
  // sample(result); payment.value = Object.freeze(next); markFresh(); failures = 0; if terminal clearPoll()
}
```

- `isSameQuote(a, b)` keeps the `JSON.stringify` comparison, with a comment saying Zod emits keys in schema order.
- `markFresh()` sets `health = "fresh"`, `error = ""` and `protocolBlocked = false`. It is shared with `initialize`.
- **`failures = 0` stays in `commitSnapshot` only**, because `initialize` never reset failures.
- Call-site mapping:
  - `poll` uses `acceptStatus`.
  - Reconciliation uses `acceptStatus`.
  - The 409 refetch uses `acceptStatus`.
  - The POST result uses `acceptNewQuote(result, gen, kind === "requote" ? reference : undefined)`.
- A08: the stale-guard line must exist exactly once, literally, in `commitSnapshot`. Leave the other stale checks (in `poll`, `initialize` and the mutation catch) as they are. Do **not** replace them all with one shared `isStale()` helper ([GUIDE §9](REFACTOR_GUIDE.md#9-judgment-calls-already-made)).

### RF-13 Decompose `mutate`

Risk C, reviewer required. Findings F-17, F-19.

Replace the boolean with `type MutationKind = "replace" | "requote"`, or split the public entry points, and extract named helpers. **The order below is the contract.** Keep it exactly:

```ts
async function mutate(pair: Pair, kind: MutationKind) {
  if (disposed || busy.value || uncertain.value) return;           // 1 guards
  if (kind === "replace" && !canChange.value) return;
  busy.value = true;                                                // 2 enter busy
  draft.value = pair;
  clearPoll();
  const gen = ++generation.value;                                   // 3 new generation BEFORE abort
  abort?.abort();                                                   // 4 settle the in-flight GET. Keep INLINE:
  if (active) await active;                                         //   no extra await when nothing is in flight
  if (disposed) { busy.value = false; return; }
  const reference = payment.value?.payment_reference;               // 5 read AFTER the GET settled
  const work = runMutation(pair, kind, reference, gen);             // 6 reconcile? -> POST -> validate -> accept / handle failure
  active = work;                                                    // 7 single-flight slot
  await work;
  if (active === work) active = null;
  if (disposed) return;
  finishMutation();                                                 // 8 busy=false; drain pendingPair if canChange, else schedule()
}
```

Inside `runMutation`:

- For `requote`, call `reconcileBeforeRequote(reference, gen)`. It returns early unless the reconciled status is still `expired` with no funds. This is the **M10** block, so re-point M10 so that the "after" patch skips the reconciliation GET and proceeds straight to the POST.
- Set `posted = true` **immediately before** the POST request.
- Validate the requested pair, using `protocolError("Quote does not match the requested network.")`.
- After `acceptNewQuote(...)` returns without throwing, set `localExpired = false`. Do this unconditionally, as today, even if it returned `false` because the generation went stale.
- Pass `catch` to `handleMutationFailure(cause, { gen, reference, posted })`, which keeps the exact branch order:
  1. Stale or disposed: return.
  2. `markError(cause)`.
  3. A 409 with a reference: refetch through `acceptStatus`, and on error `markError` again.
  4. `posted` and not an `ApiError` with status 400-499: set `uncertain = true` and the uncertain message.

**Microtask timing is behavior here.** The tests run under fake timers and assert intermediate state. Calling a plain function costs nothing; adding `await someHelper()` at an entry point adds a microtask hop.

- In `mutate`, `select`, `requote` and `poll`, do not add awaits before the request is issued. In the original, the POST starts synchronously when nothing is in flight.
- Extra hops *inside* `runMutation`, after a request has resolved, are acceptable only if every test stays green and the reviewer confirms no new interleaving point.

The single-flight bookkeeping (`active = work … if (active === work) active = null`) may get a short comment or a tiny helper. **`poll()` must keep returning the in-flight promise object itself** (`if (active) return active;`, the M03 anchor), and must keep scheduling in `work.finally(...)`.

Keep the public `create(pair = draft.value)`, `select(pair)` and `requote()` behavior identical, including the `pendingPair` queue in `select` while busy and the early returns in `requote`.

Covered by every controller test, `transport.spec`, `demo.spec` T14 and the M10 preflight. Run `npm run test:component` at least three times. After the user commits, these mutations must still be detected: `--preflight --ids M03,M04,M10,M11,A08` (A08 is expected to survive). Until then, the anchor checker must pass, and the reviewer must confirm that any re-pointed anchor injects the same defect.

### RF-14 Trim the returned surface

Risk A. Finding F-21.

- Stop returning `generation` (a writable ref leak). Prove there are no consumers: `grep -rnw generation src tests` must show only internal uses inside `usePaymentController.ts` and `paymentModel.ts` (the `generation` parameter of `acceptSnapshot`).
- Keep `dispose`.
- Phase 3 gate: L3. Anchors M03, M04, M10, M11 and A08 matter most here.

---

## Phase 4: components

Every step in this phase changes templates, so every step runs L2, which includes the DOM harness.

### RF-15 `PaymentProgress.vue`

Risk C, reviewer required. Finding F-25.

- Turn `title()` into a `computed` called `heading`, with the same strings in the same switch.
- Add computed flags `confirming` (`isConfirming`), `outcome` (`isOutcome`), `showIcon`, `receiptColumns3` and `copyValue`/`copyLabel`.
- Use `currencyScale` and the formatters from `format.ts`.
- Keep the narrowing that the template's field reads depend on. That is the `'amount_received' in payment`, `'tx_hash' in payment` and `'settled_at' in payment` checks, **and** the status-equality checks before `payment.confirmations` (L78-84, L96-104), `amount_outstanding`, `amount_excess`, `reason` (L118-136) and `detected_at` (L165). Computed flags can decide visibility, but the field reads must stay inside a narrowing `v-if` or `template v-if`, or `vue-tsc` fails.
- Anchors:
  - **VM02**: keep `    <div class="progress-heading">` exactly once at the same indentation.
  - **M09**: keep the overpaid paragraph text so that `        payment reference.` stays a line on its own. If Prettier reflows it, re-point M09.

### RF-16 `QuoteDetails.vue` and `AssetNetworkSelector.vue`

Risk B. Findings F-26, F-27.

- **QuoteDetails:** use `formatCountdown` and `formatClockTime`. Keep `:value="address"` (M07) exactly once, keep `{{ amount }}` (M08), and keep `QRCode.toDataURL(value, {` (A09).
- **Selector:**
  - `const DEFAULT_NETWORK: Partial<Record<CurrencyCode, string>> = { USDC: "polygon" }` with a comment pointing to design D02. Then `network: DEFAULT_NETWORK[code] ?? c.networks[0]!.id`, keeping the assertion with a comment that the catalogue schema guarantees at least one network.
  - Use `confirmationsLabel` and `formatAverageTime`.

### RF-17 `CheckoutPage.vue`

Risk C, reviewer required. Findings F-22, F-23, F-24.

1. Parse the query once: `const query = new URLSearchParams(location.search)`, used for `showDemo` and `locale`.
2. `funds` becomes `payment.value !== null && hasFunds(payment.value.status)`, and `result` becomes `isOutcome`. **Equivalence:** the schema guarantees `amount_received` exists exactly for the five funded statuses.
3. Add computed `selectionStepClass`, `sendStepClass` and `confirmationStepClass`, plus `sendMarker` and `confirmationMarker`. These replace the inline ternaries, including the nested one at L246-254, and return the same glyphs: `1`/`✓`, `2`/`✓`, `3`/`!`/`✓`/`×`.
4. Extract presentational components:
   - `CheckoutHeader.vue`: props `merchant` and `orderId`.
   - `ConnectionBanner.vue`: props `error`, `lastKnownStatus`, `canRetry` and `busy`; emits `retry`.
   - `QuoteLoading.vue`: props `currency`, `networkId` and `networkName`.

   Each must render **byte-identical DOM**: same root element, classes, attributes, `role="alert"`, text and whitespace. Keep `ref="focusTarget"` and `tabindex="-1"` on the send-step `<section>` in `CheckoutPage`. Don't wrap sections in components.
5. Use the `DEMO_ORDER` fallbacks from RF-03 if they are not already in place.
6. CheckoutPage remains the only controller owner. Children never call the controller.
7. Optional (F-36): drop `RecoveryPanel`'s `busy` prop, its `:disabled` binding and the `Checking payment…` label. **Equivalence:** the panel renders only in the `v-else-if` chain *after* `v-else-if="busy"`, so `busy` is always `false` there. The button is always enabled and labelled `Get a new quote`. Keep the button markup otherwise identical, because the DOM harness D07 compares its attributes. Removing `:disabled="false"` leaves no `disabled` attribute either way.

### RF-18 `CopyButton.vue` and `DemoControls.vue`

Risk C, reviewer required (template reformatting). Finding F-28.

- Run Prettier on both. In `CopyButton`, use `const status = ref<"idle" | "copied" | "failed">("idle")` with computed `buttonText` and `announcement`. The strings are `Copied`, `Copy unavailable. Select and copy the value below.` and the label.
- **Whitespace inside `<button>` is rendered text** ("▢ Copy address"). Copy buttons appear in DOM harness D03, D06, D08-D10 and X02. `DemoControls` appears only in X01.
- In `DemoControls`, rename `command` to `sendDemoCommand`. Leave the option values and test IDs unchanged.
- Phase 4 gate: L3. Anchors M07, M08, M09, VM02 and A09 matter most here.

---

## Phase 5: styles

The DOM harness is the primary oracle here: computed styles and boxes must be unchanged. The visual suite runs at the phase gate.

### RF-19 Tokens

Risk B. Finding F-30.

- Add semantic tokens to `tokens.css` with the exact current values, for example `--focus-ring: #355bea`, `--text-secondary: #444`, `--text-tertiary: #555`, `--label: #666`, `--step-done: #909090`, `--skeleton: #ededee`, `--badge-overlay: #ffffff33` and `--white: #fff`.
- Replace the raw colors in `main.css`. `white` and `#fff` compute identically.

### RF-20 Consolidate `main.css`

Risk C, reviewer required. Finding F-29.

Do this in sub-steps, running the DOM harness after each:

1. Fold the late override block (L766-825) into the matching base rules where no rule for the same element and property with equal or higher specificity sits between them. Example: `.address { font-size: 15px; }` merges into the base `.address` rule at L378.
2. Move the base `.confirmation-icon*`, `.partial-progress*` and `.progress-heading:has(.confirmation-icon)` rules up next to `.progress-heading`. They must stay **before** the 600 px media block, because the media block overrides `:has(...)` with equal specificity (0,2,0).
3. Merge the second `@media (max-width: 600px)` block (L817) into the first. Its rules must stay after the base rules they override.
4. Drop declarations in the media block that only repeat the base value, such as `.selector p { margin: 8px 0 16px; }`, but only when the computed style stays identical.
5. Group the file into commented sections in page order. **Watch the cascade:** moving a rule past another equal-specificity rule for the same element flips the winner. For example, `.network-label` (L364) must stay after `.eyebrow` (L64), because both apply to `<div class="eyebrow network-label">`. The sections are: base, header, layout and steps, selector, quote, address, progress, receipt, recovery, banner, skeleton, demo, utilities, responsive, reduced motion.

Keep the **VM01** anchor (`  .address-panel {\n    flex-direction: column;`) exactly once inside the media block. No class renames, no new `!important`.

Phase 5 gate: L3 including `npm run test:visual` (all 24 green, no updates). The VM01 anchor matters most here. Record the CSS bundle size; it must not grow.

---

## Phase 6: mock and scripts

### RF-21 `mock/server.ts` structure

Risk C, reviewer required. Findings F-31, F-32.

- Extract `createMockState(nowSource)` holding `scenario`, `sequence`, `payments`, `current`, `fundsObserved`, `frozen`, `offset` and `metrics`, with a `reset(input)` method.
- Extract `handleDemo(req, res, path): Promise<boolean>` and `handlePayments(req, res, path)`.
- Add the constants `FIRST_REFERENCE_SEQUENCE = 100306`, `DEFAULT_FROZEN_NOW`, `MAX_BODY_CHARS = 10000`, `MAX_FAULT_DELAY_MS = 30000` and `QUOTE_NOT_EXPIRED_TYPE`.
- **Keep the order of operations** from [BEHAVIOR_CONTRACT §4](BEHAVIOR_CONTRACT.md#4-http-contract-of-the-mock):
  - Demo routes, `/api/currencies` and the generic 404 for non-payments `/api` paths are all answered before metrics and faults.
  - A rejected "Unsupported pair" create still consumes a sequence number.
  - Metrics are counted before the body is read.
  - The body is read before the slow delay, then disconnect, then the 500 fault.
  - Lazy expiry happens on every `/api/payments/:ref` access.
- Keep the `activeGets` decrement on `res` `close`.
- Re-point **M12**: the anchor is the requote call's reference argument. The new `before` must select only the requote's `p.payment_reference` argument, and `after` must generate a new `AQH-${sequence++}-PMT`, or the state equivalent such as `state.sequence++`.
- **Before any browser run, stop any running `npm run dev`** (stale mock).
- Covered by `http.test` (21 cases) and `demo.spec`.

### RF-22 `mock/fixtures.ts`

Risk A. Finding F-33.

- Replace the runtime `.replace(...)` chain with the literal `"7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF"`. Contract test T02 checks it against the oracle.
- Confirm `DEMO_ORDER` (RF-03) and `currencyScale` (RF-01) are already used here.
- Keep the provenance comment: "USDT/Tron is the supplied fixture. Other entries are original synthetic demo data."

### RF-23 Scripts and formatting tooling

Risk A. Findings F-34, F-35.

- Rewrite `scripts/fingerprint.ts` in readable style with **identical output**: the same keys in the same order (`candidate`, `suite`, `fixtures`, `design`, `application`, `files`), the same prefixes and the same file path. To verify, run the old version (`git show <base>:scripts/fingerprint.ts > tmp/refactor/fingerprint.old.ts`) and the new one in a `git worktree` of the same commit, where the docs exist, and compare the JSON byte for byte. Do not "fix" its ENOENT behavior.
- In no-commit mode, **skip the `fingerprint.ts` rewrite**. It can only be verified in a separate `git worktree`, which is a Git write. Record it as deferred.
- Phase 6 gate: L3. The M12 anchor matters most here.

---

## RF-99 Final verification and report

Run L4 from [VERIFICATION §3](VERIFICATION.md#l4-final-rf-99). In no-commit mode, everything runs in the working tree:

- `npm ci`, then the full `npm run verify`.
- The DOM harness against the RF-00 baseline, and the anchor checker.
- A preview smoke test.
- A final `refactor-reviewer` pass over the complete uncommitted change: `git diff -- src mock scripts` plus the new untracked files listed by `git status --short`.

The formal mutation audit needs a commit, so it is **not** run yet. Tell the user it is the last remaining check. Once the user has reviewed and committed, run `npm run test:mutation -- --candidate HEAD --preflight` and expect 22 detected plus A08 survived.

Then write `reports/refactor/SUMMARY.md` ([VERIFICATION §6](VERIFICATION.md#6-evidence)) and report to the user:

- What changed, per file.
- Before and after metrics.
- Every command with its exit code.
- That the mutation audit is pending the user's commit.
- Skipped or optional steps.
- Anything that needs the user's decision.

Do not stage, commit, merge or push anything.

---

## Optional steps (need the user's explicit approval)

| ID | Change | Why it is not default |
| --- | --- | --- |
| O-1 | Run Prettier on `tests/` with no logic edits | Rewrites the oracle files. It needs proof of identical inventories, counts and mutation results. |
| O-2 | Lazy-load `qrcode` (`await import("qrcode")`) | Changes QR render timing and the A09 anchor. Saves bundle size only. |
| O-3 | Switch `zod` to `zod/mini` | Rewrites every schema. The equivalence surface is large. |
| O-4 | Move CSS into `<style scoped>` per component | Specificity and cascade changes. Hard to keep pixel-identical. |
| O-5 | Make `scripts/fingerprint.ts` tolerate missing tracked files | Changes the evidence semantics of a gate tool. |
| O-6 | Add `"format": "prettier --write src mock scripts"` and `"format:check"` scripts to `package.json` | Harmless, but it changes the project's tooling surface. The user decides. |
