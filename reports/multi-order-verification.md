# Multi-order checkout verification

Implemented 2026-10-03. Only this feature's source, three new test files, run instructions and this report belong to the change. Existing tests, snapshots, dependencies and `usePaymentController.ts` are unchanged.

## Behavior and files

- `src/features/checkout/CheckoutPage.vue`: reads `order`, defaults to `ORD-88213`, validates `^ORD-[0-9]{5}$`, displays the bound order in the header/footer, and skips initialization/restoration for invalid links. Invalid links render the header and “This checkout link is not valid.” without checkout controls or API calls.
- `src/features/checkout/infrastructure/paymentClient.ts`: `createPaymentClient(base, orderId)` binds creates, status reads (including restoration) and requotes. `parseOrderPayment()` checks identity after schema parsing; mismatches enter the existing invalid-data `ApiError` path with `protocol: true`. Optional catalogue order metadata is checked too. Method signatures on `PaymentClient` are unchanged. Non-default catalogue requests use `?order_id=…`; the default order retains `/api/currencies` for compatibility with existing exact-URL stubs.
- `src/features/checkout/infrastructure/responseSchemas.ts`: both payment and catalogue order identities accept the requested order pattern instead of one literal. Other validation is unchanged.
- `src/features/checkout/infrastructure/paymentStorage.ts`: keys are `stablecoin-checkout:payment-reference:<ORDER_ID>`. Load/clear accept an order; save accepts `(reference, orderId)`. Optional default arguments retain existing callers. Only references are persisted, and a missing reference clears only its order's key.
- `src/features/checkout/components/DemoControls.vue`: every scenario request includes the page's `order_id`; reset remains global.
- `mock/server.ts`: an `orders` map holds each order's current attempt and sticky funds-observed latch. Payments and confirmation timestamps remain indexed globally by reference. Amounts use a separate per-order map so configuration before the first quote does not create a known order. Replacement removes only that order's unfunded attempt; funds block creates/requotes only for their own order, including after later failure. References share the existing sequence. Faults, delays and clock advances stay global. Demo reads target one order and include a summary of all known orders. Reset clears all maps, latches, clock, metrics and sequence.
- `mock/fixtures.ts`: accepts an optional order identity while preserving all default fixture values.
- `tests/unit/order-identity.test.ts`: new literal-data client/schema/storage coverage (13 cases).
- `tests/contract/multi-order.test.ts`: new frozen-clock real HTTP coverage for identities, references, latches, requotes, amounts, defaults, invalid IDs, faults and reset (15 cases).
- `tests/acceptance/multi-order.spec.ts`: 10 new real-mock browser cases covering isolation, same-order restoration, reload/reopening, invalid links without requests, per-order amounts, global reset, order-specific 404 cleanup and cross-order restore rejection.
- `reports/run-instructions.md`: documents order URLs, targeting, summary data and global reset.
- `reports/multi-order-verification.md`: this verification record.

## Commands and results

Executed with Node 22.19.0. Exit codes below are actual process results; no snapshots were updated.

| Command | Exit | Result |
| --- | ---: | --- |
| `npx prettier --write` on the 10 changed source/test files | 0 | Formatting completed; template-only formatting that introduced warnings was subsequently removed. |
| `npm run typecheck` | 0 | Passed. |
| `npm run lint` (first run) | 0 | No errors; 3 template-formatting warnings. |
| `npm run lint` (after removing that formatting) | 0 | Passed without warnings. |
| `npm run build` | 0 | Passed; existing dependency annotation warnings from Zod/Rollup. |
| `npm run test:unit` | 0 | 100 passed, 8 files. |
| `npm run test:component` | 0 | 102 passed, 9 files. |
| `npm run test:contract` | 0 | 135 passed, 5 files. |
| `npx tsx scripts/refactor/check-mutation-anchors.ts` | 0 | Printed `OK`; M12's 14-space reference anchor still occurs exactly once. |
| `npx playwright test --grep-invert "@visual\|background tab"` | 1 | 80 passed, 1 existing failure. All 10 new multi-order cases passed. |
| `npm run test:visual` | 1 | 18 passed, 6 existing screenshot mismatches. |
| `npx playwright test tests/acceptance/transport.spec.ts --grep "T03 accepted replacement"` in the prior-commit archive | 1 | Reproduced the same existing failure (1 failed). |
| `npm run test:visual` in the prior-commit archive | 1 | Reproduced the same 6 failures; 18 passed. |
| `npm run dev` for manual verification | 0 | Started successfully and shut down after the check. |
| `git diff --check` | 0 | Passed. |

The grep-invert argument in the command above is the literal regex `@visual|background tab` (the table escapes its pipe for Markdown).

The existing development server was stopped before Playwright, as requested. Playwright managed fresh servers. Read-only source/status inspections and test-evidence collection completed successfully; one unprivileged process inspection was denied by the sandbox (exit 127), then succeeded with permission. Automatic approval review rejected an optional broad formatting-only cleanup before execution; it was abandoned, and no source was overwritten by it. The separately authorized verification server cleanup succeeded.

## Existing verification blockers

The failing acceptance case is `tests/acceptance/transport.spec.ts:48`, “T03 accepted replacement never mixes token network amount QR or clipboard.” After Change and network selection, it expects Continue to be visible, then its `noTransferAction()` helper expects **zero enabled Continue buttons**, then the test attempts to click Continue. The current draft-selection behavior leaves Continue enabled as intended. This exact failure occurs without the multi-order change.

Visual failures are D03, D08 and D11 at both 1280px and 390px. All six actual PNGs are byte-for-byte identical between this change and an isolated archive of prior commit `9c27bc18f9bed365eae6ac9481237c62aed20dab`. The existing screenshot baselines therefore already disagree with the current payment presentation. Neither the baselines nor the presentation were altered to make these tests pass.

Logs, failure screenshots, traces, the prior-commit archive metadata and PNG SHA-256 comparisons are saved locally under `/tmp/stablecoin-multi-order-verification/`. The prior archive is `/tmp/stablecoin-order-baseline-vu0ttlb7/`. The full requested suite is **not all green** because of the seven reproduced pre-existing failures.

## Manual check

Used two in-app browser tabs against a fresh real mock at `http://127.0.0.1:5173` (the Chrome automation provider was unavailable, so separate OS windows were not exercised manually):

1. Opened `/?order=ORD-88213&demo=1`, continued on USDT/Tron: reference `AQH-100306-PMT`.
2. Opened `/?order=ORD-88214&demo=1`, continued on USDT/Tron: reference `AQH-100307-PMT`.
3. Applied underpaid only to ORD-88213: displayed 43.69 USDT outstanding while ORD-88214 retained its awaiting-payment countdown.
4. Applied paid only to ORD-88214: displayed Paid while ORD-88213 still restored as underpaid.
5. Closed both tabs and reopened their URLs: each restored its own reference and state.
6. Reset demo from ORD-88213, then reloaded ORD-88214: both showed fresh selectors with no transfer instructions.

Temporary tabs and the verification server were closed afterward.

## Limits

Orders are created lazily on their first quote; there is no order-creation API or shopper payment-list page. Mock state remains in memory, so server restart/reset removes payments. Shared persistence requires the same browser profile/origin with localStorage available. Reopening the same order reads its shared stored reference; there is no new live cross-tab replacement synchronization. Reset is global; terminal receipts in another tab need a reload to discover the reset. This is an unauthenticated local demo, not a multi-shopper authorization system.
