# Verification contract

Application gates are unexecuted at bootstrap. Preserve the distinction between code review, independent implementation verification, formal testing and verification of the tests.

## Gate order

| ID | Stage | Pass criterion |
| --- | --- | --- |
| G0 | Requirements locked | Every R ID has a source, acceptance criterion and owner; ambiguities have explicit mock assumptions. |
| G1 | Architecture ready | All eight states, send actions, expiry precedence, money rules and contract gaps reviewed. |
| G2 | Tests ready | Independent acceptance cases exist; tests fail against missing or deliberately broken behavior for the expected reason. |
| G3 | Implementation reviewed | vue-tsc --noEmit, vite build and lint pass; code verifier resolves contract and safety findings. |
| G3A | Integrated implementation verified | An independent verifier builds the candidate and traces every implementation requirement to code plus observed application/API evidence. Includes R28 and D01-D12 desktop/mobile comparison evidence. No missing required behavior or unresolved critical/major finding. |
| G4 | Behavior tested | Required unit, integration, contract, browser and visual cases pass on the same fixed candidate; no hidden skips. |
| G5 | Tests verified | Every mandatory M01-M12 and VM01-VM02 defect is detected by its intended assertion; critical survivors resolved; baseline is restored and green. |
| G6 | Explanation and delivery verified | Clean-copy reproduction and explanation match evidence; source-required documents/history are assessed explicitly. Deferred deliverables prevent a claim of full submission compliance. |

Developer tests run throughout implementation. G4 is the formal final suite signoff after G3A, not a ban on early tests. G2 can be established incrementally with runnable red acceptance cases for upcoming slices; a broken harness is not meaningful red evidence.

## G3A implementation verification

Use a fresh reviewer who neither implemented nor code-reviewed the candidate. Scope: R01-R15, R23, implementation aspects of R25, R26, R27 and R28; documentation/history R16-R22 conclude at G6. Build and run the fixed candidate with the mock and inspect all six pairs/eight states. Every scoped requirement needs code references and observed UI/API evidence. Verify actual network/address/clipboard/QR coherence, stale-response rejection and detected funds across expiry.

No missing required behavior, unsupported safety claims or critical/major findings may remain. Cosmetic notes cannot waive a requirement. Missing evidence is blocked. Return defects to the implementer; re-review repairs on the new candidate. The full procedure and role prompt are in [CODEX_ROLES.md](CODEX_ROLES.md).

## Design verification extension

[DESIGN_SPEC.md](../../docs/DESIGN_SPEC.md) defines R28 acceptance, D01-D12 (24 desktop/mobile reference views), approved conflict corrections and visual evidence. G3A independently compares actual browser output to rendered PDF pages; G4 runs deterministic visual regression checks after independent baseline review. G5 additionally verifies VM01-VM02. Functional behavior remains covered by T01-T18; visual similarity cannot replace those tests. Include design PDF/spec hashes and visual baseline hashes in the candidate evidence.

## Behavioral scenarios

| ID | Scenario | Independent expected observation |
| --- | --- | --- |
| T01 | Summary and locale | Render merchant and ORD-88213. Check EUR 149.90 in en-IE and de-DE; decimals remain exact. |
| T02 | Catalogue and six quotes | Exercise every supported pair; check allowed networks and fixture metadata. Compare complete quote snapshots with independently specified expectations. |
| T03 | Network and races | Switch A to B rapidly; deliver A last. Only B details, copy value and QR appear. Block switching after funds are observed. |
| T04 | Transfer integrity | Decode rendered QR with a separate decoder and compare its address to the expected fixture. Read clipboard after copy. Clipboard failure gives a usable fallback. |
| T05 | Exact money | Check 162.69 + 1.00 = 163.69; 120.00 leaves 43.69; 180.00 yields 16.31. ETH 0.000000000000000001 and 1.123456789012345678 survive round trips. Reject excess precision. |
| T06 | Suspended timers | Jump 120 seconds with callbacks coalesced; on return, remaining time equals the absolute deadline difference. |
| T07 | Clock and boundary | Skew client by +/-5 minutes, jump wall clock mid-session and delay server time samples. Test 1 ms before/at/after deadline and the resync fallback. |
| T08 | Funds beat local expiry | Accept detected at 0 confirmations, then cross deadline and simulate 500. Never show payment expired. Repeat for confirming and underpaid; race detection with local zero. |
| T09 | One poll owner | Delay responses beyond the poll period; active GET count never exceeds one. Coalesce focus/retry triggers. Repeatedly mount/unmount the Vue owner and dispose its composable scope; no timers, listeners or requests remain. |
| T10 | Terminal and generation | For paid, overpaid, failed and server-expired, advance several poll periods and see zero new GETs. Reject responses from old references and old same-reference quote generations. |
| T11 | Eight states and malformed data | Drive each status; check copy, permitted actions and polling policy. Unknown status, impossible amounts or inconsistent identity produce a protocol error, not success. |
| T12 | Short payment | Show only 43.69 outstanding on the same network/address. Repeated underpaid payloads do not add money twice. Do not allow original quote expiry to erase partial payment. |
| T13 | Excess and duplicate delivery | Show 180.00 received and 16.31 excess with no automatic-refund promise. Repeated settled payloads are idempotent; no further-send instruction. |
| T14 | Expiry and requote | At local zero hide send details and reconcile. Server-expired enables same-reference requote. Handle 409 by refetching, never fabricating a new expiry. Rapid double clicks issue one POST. |
| T15 | Transport failures | Inject disconnect, timeout, HTTP 500 and recovery. Retain last verified status, mark it stale and back off GETs. Never automatically retry an uncertain creation POST. |
| T16 | API contract | Check all routes, methods, 200/201/409 status codes, decimal strings and problem+json. Read tests from the PDF contract, not solely from mock implementation types. |
| T17 | Evaluator controls | From a clean browser, drive all states and both transport faults through documented controls; reset reproduces a known scenario and deterministic time. |
| T18 | Usability | Keyboard-only use, clear labels, focus after changes, status announcements without per-second noise, mobile layout and 200% zoom. Color is never the only status cue. |

Use Vitest for pure TypeScript, Vue Test Utils for SFCs/composable hosts, real HTTP contract tests and Playwright for browser acceptance. Await Vue updates explicitly, isolate browser contexts and inject independent client/server clocks. Record unavailable browser coverage instead of silently omitting it. Capture traces and network counts for concurrency failures.

## G5 mandatory deliberate defects

Green baseline -> one defect in an isolated copy -> intended assertion failure -> restore -> green. Do not alter the normal checkout or combine multiple defects in one run. A compile error, harness crash or unrelated failure does not qualify as detection. No broad percentage substitutes for detecting all 12 required behavioral defects. VM01-VM02 are additionally required by DESIGN_SPEC.md.

| ID | Injected defect | Expected detecting tests |
| --- | --- | --- |
| M01 | Allow local expiry after detected | T08 |
| M02 | Count down by tick count rather than deadline | T06 |
| M03 | Remove single-flight polling guard | T09 |
| M04 | Keep scheduling after terminal status | T10 |
| M05 | Accept stale quote-generation response | T03, T10 |
| M06 | Convert an 18-decimal money value through Number | T05 |
| M07 | Copy or encode the previous network address | T03, T04 |
| M08 | Render full total instead of outstanding amount | T12 |
| M09 | Promise an automatic excess refund | T13 |
| M10 | Allow requote before reconciling detected funds | T08, T14 |
| M11 | Turn an HTTP 500 into payment failed | T15 |
| M12 | Change requote to a new payment reference | T14, T16 |

Run targeted automated mutation analysis on the money, reducer, quote policy and controller modules. Independently review critical survivors. Explain equivalent changes in writing; improve tests for non-equivalent survivors. Use browser-level seeded variants for shopper copy/QR defects. Audit test source for tautological assertions, skips, swallowed failures, over-mocking and order dependencies.

## Delivery checks

| ID | Review |
| --- | --- |
| V01 | Scope and shopper-safety review of built artifact. |
| V02 | Available documentation/instructions match actual implementation; required missing deliverables are deferred, not approved. |
| V03 | A clean copy reproduces recorded commands/scenario controls; assess the source-required README separately while deferred. |
| V04 | Compare actual work records and any authorized Git history with claimed rejections/human changes; flag missing or deferred evidence honestly. |
| V05 | Review dependency licenses, attributed sources and code provenance; do not claim an absolute plagiarism guarantee. |

## Evidence record format

Create evidence only after work actually runs, under reports/. No pre-existing report schema or generator is required. Each gate record must include:

- gate_id and verdict: pass, fail or blocked; unexecuted gates remain pending in the plan.
- candidate: fingerprint kind (source-manifest-sha256 or git-commit), value and relevant suite/fixture hashes.
- reviewer: role, session identity and independence from implementation; G3A must also be independent of G3.
- requirements: covered R IDs and remaining/deferred items.
- commands: exact command, exit code (or unavailable), environment and log path.
- evidence: paths/hashes of screenshots, traces, API observations and relevant code locations.
- findings: severity, violated requirement, reproduction, resolution and limitations.

G3A additionally includes one row per scoped requirement: source, expected behavior, observed behavior, code references, evidence and verdict. G5 additionally records the green baseline, each M ID, mutation patch hash, detecting tests, expected/actual failure, whether the intended assertion failed, restoration and final green result. All 12 mandatory behavioral defects and both VM defects must be accounted for. Include D IDs, viewport/reference pairs and approved deviations in visual evidence.

Use the reviewed local Git commit SHA plus suite, fixture and artifact hashes. The checkout must match that candidate for tracked application inputs; record any differences. For a Git blocker only, use an isolated SHA-256 source manifest covering source, configuration, lockfile, tests and fixtures, excluding dependencies and generated reports. Never invent a commit. Later report commits must identify the application commit they verified; re-check relevant changes before reusing evidence.

Any relevant implementation, fixture, test or acceptance change invalidates affected signoffs. Reviewers do not approve their own implementation or repairs. After three failed repair attempts on the same issue, report the disagreement to the human. Missing evidence or unavailable review is blocked, never pass.

Reproduce startup and scenarios from recorded commands while README creation remains deferred. Assess original submission requirements separately: technical checks may proceed while README is deferred or Git is explicitly blocked, but missing mandatory deliverables prevent full submission compliance. No application gate has been executed in this input package.
