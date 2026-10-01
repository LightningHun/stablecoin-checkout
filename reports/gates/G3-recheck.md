# G3 independent code review — corrected candidate

- gate_id: G3
- verdict: **pass**
- candidate kind: git-commit
- candidate: `848c8845fe975d171b0e781b850d1dbe13701c6b`
- reviewer: `/root/g3_code_review`, the independent reviewer of the initial candidate; did not implement any original code or repairs and did not edit candidate source/tests.
- clean checkout: `/Users/joshua/Documents/Stablecoin-payment/codex-execution-package/tmp/review-g3-fixed`
- tracked inputs: clean before installation/review and after all checks; exact HEAD and hashes independently verified.
- suite SHA-256: `032fc50fa58dc4cd30d7ff52b49102aca60b01ef440dc1d0ba47e3c5f494413c`
- fixtures SHA-256: `fe6dc02a603632cf754c453c24bd865735d9cf01c879e2e14118e0595d426dbb`
- application SHA-256: `ed3b5a86bd16d912bf5d27e0ebe19b3b08d25a3cb5258496b7eb4501db9f9924`
- design SHA-256: `2f57558eb340aeafd948dfc1ff5043085ff03f5dbb1519aadc5aed72c562624b`
- environment: Node `v22.19.0`, macOS arm64; browser probe Chromium `153.0.8010.12`.
- scope: R02–R14, R23, R27, and the specific R28/VM02 action-presentation defect. Full R28 visual conformance remains with the separate G3A reviewer.

The initial failed review remains in `reports/gates/G3.md`, tied to `1e8a976367e38931be57747a069e12e10f98260f`. This report independently rechecks the corrected commit, its complete source diff and surrounding lifecycle code, the original failure probes, and the newly committed regressions. No unresolved blocking G3 finding remains.

## Commands

All commands ran from the clean checkout above with the explicit Node 22 path. Redirection wrote evidence into the root `reports/logs` directory, outside the candidate.

| Exact command | Exit | Root log |
| --- | --- | --- |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm ci` | 0 | `reports/logs/g3-recheck-ci.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm run typecheck` | 0 | `reports/logs/g3-recheck-typecheck.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm run lint` | 0 | `reports/logs/g3-recheck-lint.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm run build` | 0 | `reports/logs/g3-recheck-build.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/tsx ../../reports/logs/g3-recheck-probe.mts` | 0 | `reports/logs/g3-recheck-probe.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH node node_modules/vitest/vitest.mjs run tests/unit tests/component tests/contract` | 0; 9 files / 121 tests pass | `reports/logs/g3-recheck-regressions.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/tsx ../../reports/logs/g3-recheck-browser.mts` | 0 after reviewer harness correction | `reports/logs/g3-recheck-browser.log` |

Typechecking includes Vue SFCs, app, mock, scripts and tests through the configured strict project. The Vite build has only third-party pure-annotation warnings. Local listener/browser checks used authorized escalation; the HTTP probe used a random port and did not use the coordinator's live mock. The first browser probe failed before app startup because Vite treats port 0 as its default 5173. The external reviewer harness was corrected to reserve an ephemeral port explicitly and rerun successfully on 65198. No candidate code or acceptance criteria changed, and the live 5173/8787 services were not reset or used.

## Findings resolved against the original reproductions

| Finding | Corrected code | Independently observed result | Verdict |
| --- | --- | --- | --- |
| G3-01, malformed JSON and protocol-block retention; R04/R08/R11/R23 | `paymentClient.ts` guards JSON decoding; `usePaymentController.ts` retains protocolBlocked until an accepted response | Invalid JSON keeps known awaiting state and reports `availability=reconciling`, `canChange=false`. Following invalid schema with HTTP 500 stays reconciling. A valid response restores availability. | Resolved |
| G3-02, uncertain creation 5xx; R07/R11/R23 | Mutation uncertainty excludes only definite 4xx rejection, retaining special 409 reconciliation | Replacement HTTP 500 yields `uncertain=true`, reconciling availability and `canChange=false`; the follow-up selection leaves total create calls at 2, with no second replacement. | Resolved |
| G3-03, decreasing received amount; R06/R09/R13/R23 | `paymentModel.ts` compares received decimal strings through scaled BigInt before acceptance | Same-quote underpaid regression from received 120.00/outstanding 43.69 to received 100.00/outstanding 63.69 is rejected. Committed controller regression preserves the first facts and pauses transfer. | Resolved |
| G3-04, network metadata/address coherence; R02/R03/R04/R08/R23 | `responseSchemas.ts` explicitly validates the fixed six supported pairs, catalogue precision/metadata and quote network name/count/fee/address shape | The original contradictory Tron ID + Ethereum name/address payload is rejected; all six real HTTP fixture cases and supplied fixtures remain green. Authoritative total_due is still preserved. | Resolved |
| G3-05, funds-observed history; R07/R12/R23 | `mock/server.ts` records fundsObserved independently of status, clears only on reset, and checks it atomically for replacement/requote | Real HTTP detected→failed→replacement returns 409. Committed HTTP test also confirms that the original reference remains readable and requote is rejected. | Resolved |
| G3-06, uncertain clock resume; R05/R10/R11/R23 | ClockService detects wall/monotonic discontinuity; controller sets an awaiting-only resync guard on focus/visibility/discontinuity and clears it on accepted sampling | With wall advanced 1000000 ms and monotonic paused, failed focus reconciliation leaves known state stale and availability reconciling. The old 900000 ms estimate is not offered as a sendable quote. Independent regression proves fresh sampling restores correct time; funds remain independent of original expiry. | Resolved |
| G3-07, detection while Change open; R06/R08/R28 | `CheckoutPage.vue` derives selectionVisible from selecting and canChange, including confirmation projection | Browser opened Change, then accepted detected. Detected facts became visible; radios, Continue/Send/Change, transfer address and QR all had zero count. Screenshot and browser log retained. | Resolved |

Relevant evidence source files are in `src/features/checkout/{application,domain,infrastructure}` and `mock/server.ts`; the updated independent regressions are in `tests/unit/{client,clock,policy,schema}.test.ts`, `tests/component/controller.test.ts`, `tests/contract/http.test.ts` and `tests/acceptance/checkout.spec.ts`.

## Surrounding changes and limits

Reviewed the new clock-uncertainty/canChange dependency and selection projection for cycles, stale generation behavior, disposal and recovered availability. Single-flight polling, mutation serialization and invalidation before abort remain intact. Sticky protocol uncertainty clears only through validated accepted state; mutation outcome uncertainty is not silently cleared by later polling. The historical funds latch protects the mock independently of UI controls.

PaymentProgress adds a percentage bar using scaled BigInt and presentation icons; it does not introduce monetary Number arithmetic or new payment capabilities. Quote transfer values continue to use total_due/outstanding. Styling changes require the pending full visual review.

Reviewed bounded audit tooling changes for isolation: the runner archives the selected commit, checks the lockfile, mutates only its disposable copy, restores source in finally, requires a green baseline/restoration, records patch hashes and does not update visual snapshots. This is a code review of the tooling, not execution or approval of G5, its mutant effectiveness, or visual baseline provenance. The broader browser, visual, physical background and integrated requirement checks remain G3A/G4/G5 work. README and source-required final deliverables remain for G6 assessment.

## Evidence hashes

Full independently recomputed candidate and artifact hashes: `reports/logs/g3-recheck-fingerprint.json`.

- probe source: `52504ad7a93a683e856df2d868532ec872240943927a9ab0ed9047fdee7b3941`
- original-case observations: `9bc4bbff8cb44dcb7ca2683f7001f2423da4b224aaacbd2d00941f0ea8ff0ddf`
- browser probe source: `31105c284d597f4ccf7a60d42143ad433d22a78aa22bbe83fd7c7fbec48a991b`
- browser observation: `04fce3f6dea793c2c2a942125dbcd9c30287129a60ccbc7a36d83250871461fe`
- selector screenshot (`reports/logs/g3-recheck-selector.png`): `37e1871b977e974f57e60f2827e2d706ab3a10a25512d366eb562f812e18137f`
- 121-test regression log: `43b4590b078da7a3257273ab2ee88e509f85969da0c737e946365557754531e7`
- built JS (`dist/assets/index-Cf2pHlz_.js`): `94e9db19dff1e38f4e020de8b43ba8881375ecb0892505e66e60c1a6496c0d15`
- built CSS (`dist/assets/index-BEqS4xZz.css`): `9361711391f7d46432956582a61d75af23576bc36544cdce7079b6bff169936c`
- built HTML: `2c464fe7739accc8a5973c7af266bb41851be9a26d6496ada3a76d306713b9c3`

Reviewer-owned writes: this report and `reports/logs/g3-recheck-*` only. The reviewed checkout is clean. This pass applies only to the named candidate and fingerprints; later application/test/fixture changes require affected checks to be reassessed.
