# Implementation plan

Build a running Vue 3 / TypeScript / Vite checkout with the controllable HTTP mock. Use the instructions and specifications bundled with this file; no previous conversation, README, task ledger, report schema, generator or Git repository is required to start.

Status: authorized implementation and verification work complete. G0-G5 passed; G6 verified technical delivery and records incomplete full submission compliance because README and unavailable human work-history evidence remain deferred. See reports/gates for actual candidate-specific evidence. Local Git initialization and commits are authorized as stated in AGENTS.md.

## Ordered work

- [x] P00: Confirm requirements, assumptions and architecture; obtain G0/G1 evidence.
- [x] P01: Bootstrap tooling and independent acceptance-test design; establish G2 readiness.
- [x] P02: Implement exact money and the pure state model.
- [x] P03: Implement the HTTP mock, fixtures, client and boundary validation.
- [x] P04: Build quote selection and transfer UI.
- [x] P05: Complete controller, polling, clock and recovery.
- [x] P06: Complete all scenarios, evaluator controls and usability.
- [x] P07: Obtain independent G3 and G3A reviews.
- [x] P08: Run G4 tests and G5 test-effectiveness audit.
- [x] P09: Explain results and assess G6 deliverables, identifying deferred items.

Tasks depend on the preceding task. Developer tests run throughout; formal acceptance follows the gate sequence. Make small factual local commits for completed slices under the Git policy in AGENTS.md.

## P00 Requirements and architecture

Read [REQUIREMENTS.md](../../docs/REQUIREMENTS.md), the source, [API_CONTRACT.md](../../docs/API_CONTRACT.md) and [DESIGN_DOC.md](../../docs/DESIGN_DOC.md). Read [DESIGN_SPEC.md](../../docs/DESIGN_SPEC.md) and visually inspect the design PDF. Confirm all 28 requirements, eight explicit states, six pairs and documented mock assumptions. Review the four decision rationales embedded in [DESIGN_DOC.md](../../docs/DESIGN_DOC.md). Assign requirement ownership by role and record G0/G1 outcomes; document existence alone is not approval.

## P01 Tooling and independent expectations

Inspect the repository boundary and configured identity. Initialize Git at the project root if absent, add an appropriate .gitignore and commit the supplied instruction/reference baseline. Preserve any existing history and unrelated work. Then scaffold Vue 3 + TypeScript + Vite into the existing project without overwriting its instruction files. Configure Composition API SFCs, the Vue plugin, strict TypeScript, npm lockfile, Vitest, Vue Test Utils and Playwright. Select compatible versions and record runtime prerequisites. Add a runnable shell and the app/mock start-stop arrangement.

A fresh test designer derives D01-D12 responsive visual expectations and VM01-VM02 detection criteria from [DESIGN_SPEC.md](../../docs/DESIGN_SPEC.md). They also derive T01-T18 expectations from the requirements before seeing production helper implementations. Independently check money/address/network examples. Show meaningful red behavior for missing or deliberately wrong features, not module resolution or harness failures. Establish cases incrementally for later slices; G2 is readiness, G4 is final suite execution.

Create and verify these scripts. They do not exist in the handoff yet:

| Command | Required behavior |
| --- | --- |
| npm ci | Reproduce dependencies from package-lock.json |
| npm run dev | Start Vite and HTTP mock with working /api routing |
| npm run typecheck | Check app/SFC/test/mock TypeScript projects with vue-tsc/tsc; not only an empty root references config |
| npm run lint | Vue and TypeScript checks |
| npm run build | Produce the Vite application bundle |
| npm run preview | Serve the built bundle with the mock API |
| npm run test:unit | Vitest domain/controller tests in one-shot mode |
| npm run test:component | Vue Test Utils component/composable-host tests |
| npm run test:contract | Real HTTP mock contract checks with independent expectations |
| npm run test:e2e | Playwright against the app and mock |
| npm run test:mutation | Targeted automated mutations on critical TypeScript |
| npm run verify | Aggregate ordinary checks; does not substitute for independent G3A/G5 |

Install browser dependencies appropriate to the environment. Record unavailable coverage. Do not use pass-with-no-tests settings as feature evidence. Record verified commands in implementation evidence while README is deferred.

## P02 Exact money and domain state

Implement money.ts, paymentModel.ts and quotePolicy.ts. Use discriminated unions, pure transitions, three independent state dimensions and reference/generation guards. Never infer paid from amount alone. Verify T05 and domain portions of T08/T10-T14, including ETH precision, skipped transitions, idempotent snapshots and stale generations.

## P03 HTTP mock and adapter

Implement four endpoint families with exact catalogue values, coherent full Payment snapshots, problem+json errors, synthetic missing-pair fixtures and injected time. Add deterministic states, delay/error control and atomic replacement/requote checks from [API_CONTRACT.md](../../docs/API_CONTRACT.md). Build response validation and client interfaces without connecting a real provider. Exercise T16 and early T02/T17 over HTTP; expected values must not come from mock implementation helpers.

## P04 Quote and transfer screen

Build CheckoutPage, OrderSummary, AssetNetworkSelector and QuoteDetails with typed props/emits. Display exact values, prominent network, address-only QR and clipboard fallback. Ensure one accepted snapshot supplies all transfer details. Exercise T01-T04/T05, decode the QR independently, inspect the clipboard and deliver an old selection response last. Apply [DESIGN_SPEC.md](../../docs/DESIGN_SPEC.md) composition, tokens and page mappings. Check responsive layout and keyboard interaction; begin reference-to-browser comparisons.

## P05 Controller and recovery

Complete usePaymentController, ClockService, PaymentProgress and RecoveryPanel. Implement single-flight completion-scheduled polling, GET timeout/backoff, quote generations and synchronous scope-disposal registration. Reconcile local expiry before requote. Serialize POSTs and never auto-retry uncertain creation. Run T06-T10/T12-T15, including detection plus expiry plus 500, repeated unmount/remount, 409 and same-reference generations.

## P06 Complete and freeze a candidate

Finish all states, pairs, error/slow controls, reset and accessibility checks T11/T17/T18. Capture D01-D12 at desktop/mobile widths; record declared deviations, fix visual issues and check intermediate widths and zoom. Remove placeholders and unsupported URLs/refund promises. Run preliminary checks and exercise the built preview with the mock. Commit the completed candidate and create a clean isolated checkout at that SHA. Record suite/fixture hashes; use a source-manifest fallback only for an explicitly reported Git blocker.

## P07 Independent review

Use separate fresh G3 and G3A sessions from CODEX_ROLES.md. G3 reviews code and type/lint/build results. G3A independently builds and operates the fixed candidate, tracing implementation requirements to code and UI/API evidence, including R28 and the 24 reference-view comparisons. Reviewers report findings without editing the candidate. Return fixes to the implementer, freeze the new candidate and repeat affected checks. Missing independent execution capability is blocked, not self-approval.

## P08 Formal tests and test verification

After G3A, run G4 behavioral and visual suites on the same candidate. In a disposable copy, a fresh auditor proves green baseline, injects M01-M12 and VM01-VM02 individually, observes intended assertion failures, restores and proves green again. Run targeted automated mutation analysis and triage critical survivors. Never mutate the main working copy. Changes to code, fixtures or expectations invalidate affected evidence.

## P09 Explanation and delivery status

Reproduce verified commands and required scenarios in a clean copy. Explain implemented behavior, decisions, evidence and limitations. Check the original documentation/history requirements separately from technical checks. Keep README creation deferred, but verify actual incremental local Git history and report final commit SHA/status. Report missing or deferred deliverables and do not claim full source-submission compliance. Preserve genuine work notes for later authorized final documentation; never invent rejected drafts or human code improvements.

## Recovery and progress

Inspect the workspace and this checklist on resume. Preserve unrelated changes. Record actual results under reports/ using VERIFICATION.md; no fabricated passing records. After three failed repairs of the same issue, describe the disagreement and attempts to the user and continue unrelated authorized work where possible. Do not reset files or weaken acceptance criteria to obtain a clean result.
