# Invalid checkout-link verification

Date: 2026-10-03. Base commit: `fcd2f95eeadccc46fa10978d44632ff7a4977b6f`.

The requested feature is implemented. The full regression gate is **not green**: the new registry requirement contradicts existing multi-order tests, and unrelated pre-existing transport/visual failures were reproduced before this change. Existing tests and snapshots were neither edited nor deleted. Permission to adapt the conflicting tests was requested but was not received during this implementation.

## Scope and implementation

- `mock/config.ts`: fixed public demo-only HMAC key.
- `mock/scenarios.ts`, `mock/server.ts`: registered orders, signed demo links, signature requirement, validation verdict endpoint and fault handling.
- `src/features/checkout/infrastructure/paymentClient.ts`, `responseSchemas.ts`: optional validation method, response/order binding, enum and safe Help URL validation.
- `src/features/checkout/CheckoutPage.vue`: validation before controller creation or persistence access; uncertain/retry gating and scope cleanup.
- `src/features/checkout/components/InvalidLinkView.vue`: specified copy, support fields, focus, history action, existing CopyButton and optional Help link.
- `src/features/checkout/components/DemoControls.vue`: signed-link creation and signature checkbox; late initial reads cannot overwrite a newer checkbox edit.
- `src/styles/main.css`: only the appended invalid-link/responsive/demo-link styles are included in the commit.
- New tests: `tests/contract/checkout-link.test.ts`, `tests/component/invalid-link-view.test.ts`, `tests/acceptance/invalid-link.spec.ts`.
- Documentation: `reports/run-instructions.md` and this report.

The payment controller, its polling/mutations, payment fixtures, domain rules, dependencies and approved snapshots are unchanged. Existing CopyButton, copy-motion CSS/tokens/tests and unrelated reports remain outside this commit. The design is implemented using the existing merchant/demo footer; the screenshot's placeholder provider identity is intentionally omitted as instructed. The programmatically focused heading retains the site's existing focus indication.

## HTTP behavior

`GET /api/checkout/link?order_id=<raw>&sig=<raw>` returns HTTP 200 for both definitive verdicts, with JSON, `Cache-Control: no-store` and ISO `x-server-time`:

```json
{"valid":true,"order_id":"ORD-88214","checked_at":"2026-10-03T10:41:00.000Z"}
```

```json
{"valid":false,"reason":"unknown_order","order_id":"ORD-99999","checked_at":"2026-10-03T10:41:00.000Z","help_url":"mailto:help@payment-project.example"}
```

Malformed input is checked before registry membership, then signatures. Invalid order text is capped at 64 characters; an absent order is null. A URL with neither `order` nor `sig` skips validation and retains the default ORD-88213 entry.

| Code | UI reason |
| --- | --- |
| `malformed_order` | The order code in the link isn’t valid |
| `unknown_order` | We can’t find an order for this link |
| `invalid_signature` | The link’s signature doesn’t match |
| `missing_signature` | The link isn’t signed |

`POST /api/demo/orders {amount?}` registers the next order and returns HTTP 201 with `{order_id, sig, checkout_url}`. The signature is the first 16 lowercase hex characters of HMAC-SHA256; it is a demo fixture, not production authorization. `POST /api/demo/scenario {requireSignature:true}` requires signatures on explicit order links. GET `/api/demo` exposes the flag and registry, including orders with no payment. Reset retains only ORD-88213 and disables the requirement.

Only a validated `valid:false` response renders the invalid screen. HTTP failures, disconnects, bad JSON/schema, unsafe Help URLs, unknown reason codes and mismatched response orders stay uncertain, with the existing connection banner and Retry now. Invalid/uncertain entry never starts the payment controller or restoration. New browser tests verify one validation request and no catalogue/payment calls or persistence writes. The view itself has a defensive text fallback for unexpected codes; the API boundary does not accept such codes.

## Commands and results

Node 22.19.0, supplied npm dependencies. All commands used the Node 22 PATH. Browser runs set `PLAYWRIGHT_HTML_OUTPUT_DIR` and `--output` to separate `/tmp/invalid-link-*` locations; no `-u` or snapshot update flag was used. Test counts below are actual reported results.

| Command / invocation | Exit | Result |
| --- | ---: | --- |
| `npm run typecheck` — initial, final working tree, clean staged candidate | 0 each | No type errors |
| `npm run lint` — initial | 0 | 3 formatting warnings in DemoControls |
| `npm run lint` — final | 0 | No warnings/errors |
| `npm run build` — initial and final | 0 each | Production build succeeds; pre-existing Zod annotation warnings |
| `npm run test:unit` | 0 | 100 passed, 8 files |
| `npm run test:component` — initial full run | 0 | 122 passed, 11 files |
| `npm run test:component` — final full run | 0 | 123 passed, 11 files |
| `npm run test:contract` | 1 | 135 passed, 14 failed, 6 files |
| `npx vitest run tests/contract/checkout-link.test.ts tests/component/invalid-link-view.test.ts` — initial | 0 | 27 passed, 2 files |
| `npx vitest run tests/contract/checkout-link.test.ts` — final | 0 | 14 passed, 1 file |
| `npx vitest run tests/contract/checkout-link.test.ts tests/component/invalid-link-view.test.ts` — clean staged candidate | 0 | 28 passed, 2 files |
| `npx tsx scripts/refactor/check-mutation-anchors.ts` — initial and final | 0 each | `OK` |
| `npx playwright test tests/acceptance/invalid-link.spec.ts` — initial | 0 | 9 passed |
| Same focused command after expanded coverage | 1 | 14 passed, 1 failed: new race test's network-idle wait timed out; test wait corrected |
| Same focused command on clean staged candidate | 0 | 15 passed, including response-order race |
| `npx playwright test --grep-invert "@visual\|background tab"` | 1 | 92 passed, 11 failed; run preceded addition of the last race case |
| `npm run test:visual` — pre-change source snapshot | 1 | 18 passed, 6 failed |
| `npm run test:visual` — changed working tree | 1 | 18 passed, same 6 failed |
| `npx playwright test tests/acceptance/transport.spec.ts -g 'T03 accepted replacement'` — pre-change snapshot | 1 | 1 failed at the identical assertion |
| `npm run dev` — manual checks | 0 | Started at 5173/8787, deliberately stopped afterward |
| `npx vite --host 127.0.0.1` — frontend-only outage check | 1 | Started at 5173 with mock stopped; deliberately interrupted afterward |
| `git diff --check`, `git diff --cached --check` | 0 | No whitespace errors |
| Initial-snapshot/test preservation and staged-path audit (Python) | 0 | No existing test/snapshot changes; unrelated copy files preserved |
| `lsof -nP -iTCP:5173 -iTCP:8787 -sTCP:LISTEN` after manual work | 1 | No listeners remain |

Formatting used `npx prettier --write` only on the new test files (exit 0); feature CSS was formatted independently so unrelated CSS was preserved. Temporary editing/staging/export scripts exited 0. One initial server-edit script stopped on an ambiguous anchor (exit 1) before applying that server edit; the corrected script completed successfully. The independent review reproduction and fix verification exited 0. File reads/searches are inspection, not test evidence.

## Unresolved verification conflicts

All 14 contract failures are in existing `tests/contract/multi-order.test.ts`: they assume arbitrary pattern-valid orders can be created/configured without registration, an empty post-reset registry, or fault precedence incompatible with the required unknown-order response.

Ten browser failures are in existing `tests/acceptance/multi-order.spec.ts`: they use unregistered ORD-88214 or require the superseded minimal error copy and zero validation requests. The new specification explicitly requires registration and one server validation request. These cannot remain unchanged and pass against the new behavior.

The eleventh browser failure is the pre-existing transport T03 case at `transport.spec.ts:67`: its helper forbids an enabled Continue while the test is still displaying the selector and expects to click Continue next. The exact same assertion failed in the untouched pre-change snapshot.

The six visual failures are D03, D08 and D11 at 1280px and 390px. Every failing actual image is byte-identical before and after this feature:

| Image | SHA-256 of actual PNG |
| --- | --- |
| D03 / 1280 | `4a40039ddaea5a94b5c2c295cc9cc4bb968cd15e3cfab8037af39269246ca542` |
| D03 / 390 | `9d1c73ed9aff8d6ac017ddcf64bbedf40d8f90be1d20d0a4860955257bc8ac2d` |
| D08 / 1280 | `fe1ec533264b8219ac73d1bbaefe7237f79b3787f8a836ae26b7c853b1525d46` |
| D08 / 390 | `0473008f33a81673b967cc1ed964d3c36c7212129b5ad41a8d42c069740adfa5` |
| D11 / 1280 | `72d2130a606d6728941af01799b967fa1211fa20b903d6e6e303fbdaf7343672` |
| D11 / 390 | `2657b9006ce3fdd364fde2ef2828089d096da164c57281f11d23a6c1062a3964` |

## Manual checks and independent review

With `npm run dev`, used a temporary in-app browser tab to open `/?order=ORD-99999`, `/?order=abc`, and `/?order=ORD-88213&sig=0000000000000000`. Each displayed its correct API reason and focused heading. At a 390×844 viewport, the column measured 358px, with stacked full-width actions and no horizontal overflow (also asserted by Playwright). Created a signed ORD-88214 link in Demo controls and opened the normal checkout from that link.

Stopped the combined server, started only Vite, and opened the unknown-order link with nothing listening on 8787. The page displayed only “Can't reach a verified payment update. HTTP 500” and Retry now. It did not show an invalid verdict. Closed the temporary tab, reset the viewport override and stopped the temporary frontend server.

A separate read-only reviewer found a stale initial demo read overwriting a newer checkbox edit and missing empty-string order fallbacks. Both were fixed and independently rechecked; no further blocking implementation findings were reported. This bounded feature review is not a claim that the repository's full historical formal gates passed.

The feature-only staged source was exported to `/tmp/checkout-invalid-link-candidate`, excluding unrelated working changes. Its new tests all passed: 14 contract + 14 component + 15 browser = 43. The pre-report staged tree was `ff193a579df4623adf1acf990d545619e87378e6`; its 13-file SHA-256 manifest is `/tmp/invalid-link-candidate-manifest.json` (manifest hash `7ed5574b01e6f8131637f087421bfc3e7923b83da8c0f50de88c7eab621f4c81`). This report is added as the fourteenth commit file. Large logs/traces/screenshots remain under `/tmp/invalid-link-*`, not in Git.
