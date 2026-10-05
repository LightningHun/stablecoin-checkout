# G2 follow-up — Independent regression and browser-harness corrections

- **gate_id:** G2 follow-up
- **verdict:** pass for independent test readiness. This record does not approve the implementation, visual fidelity, formal G4 suite, or G5 audit.
- **reviewer:** `/root/test_designer`, independent test designer; did not edit production source or mock. Additional safety expectations came from the separate G3 reviewer and were checked against the supplied contract.
- **final candidate:** git-commit `3b7a43ad4f4bd74a4dce8387876db8e977e6a2b6`; tracked application/test inputs clean when checked. Suite `23825e5551be3a3f334bb9a1eaab3dd9c3d0ee3ed7e3f62968a9bb7f994cefa3`; fixtures `fe6dc02a603632cf754c453c24bd865735d9cf01c879e2e14118e0595d426dbb`; design `2f57558eb340aeafd948dfc1ff5043085ff03f5dbb1519aadc5aed72c562624b`; application `2af8c975a57298f7f9165c9dc6b52c6eb836b67ac1937e7fb08272176481513e`. See the tracked-file framing in `scripts/fingerprint.ts`.
- **requirements:** R03–R07, R10–R14, R23–R24, R28; T03, T06–T11, T14–T17; D01–D12 and VM02. Original G2 coverage and deferred documentation requirements remain as recorded in `G2.md`.

## Safety regressions and meaningful red evidence

The source contract requires validated coherent snapshots, preservation of observed funds, conservative handling of uncertain mutations, and server-aware expiry. New tests independently assert:

1. Successful HTTP with invalid JSON is a protocol failure; known awaiting facts remain, but transfer controls are removed.
2. A creation POST returning HTTP 500 may have mutated server state. It is uncertain, blocks further creation/sending, and is never automatically retried.
3. Received funds cannot regress from 120.00 to 100.00 even when the new outstanding arithmetic is internally coherent.
4. The mock remembers previously observed funds after settlement failure and refuses replacement/requote while retaining the existing reference.
5. A Tron quote cannot present an Ethereum label/address or unsupported ETH/Tron pair.
6. A later HTTP 500 cannot clear a previous protocol block; only a validated response can restore transfer availability.
7. Offline resume after a halted monotonic clock withholds sending until a fresh server-time sample, while preserving awaiting financial facts.
8. Funds arriving while Change is open close the selector and remove Continue/send actions.

An isolated `git archive` of `1e8a976367e38931be57747a069e12e10f98260f` received only the new test files. Production source in the main checkout was never mutated by the designer. Command `npx vitest run --root tmp/g3-regression-red --config vitest.config.ts tests/unit tests/component tests/contract` exited **1**, with **9 intended assertion failures and 110 passes**. Failures included wrong 201-versus-409 response, lower received money being accepted, invalid JSON escaping as SyntaxError, false uncertainty after POST 500, transfer becoming usable after a protocol block, and acceptance of inconsistent network facts. See `reports/logs/g3-regressions-red.log` (SHA-256 `dd7b307f9a7367e1194215705124c6e5929b99abdc54a7b7b2aa0c0f6a3c221e`). An initial incorrect config path produced a startup failure; it was corrected and is not counted as red evidence.

The halted-clock test was separately overlaid on the same isolated source. `npx vitest run --root tmp/g3-regression-red --config vitest.config.ts tests/component/controller.test.ts -t 'halted monotonic'` exited **1** at the intended assertion: transfer availability incorrectly remained usable. See `reports/logs/g3-clock-resync-red.log` (SHA-256 `9e48caa6ce06fe23fc4f6f9c633b3873fb0c0cfa9225beae1bed82c0b502e9bc`). Other cases were explicitly filtered for this targeted reproduction, not silently skipped in the ordinary suite.

After implementer repairs, `npx vitest run tests/unit tests/component tests/contract` exited **0**, **121/121 passed**, in `reports/logs/g3-regressions-green.log` (SHA-256 `51e678f1429b54a055ca0b733338482a683a6653ee398dc9ff57db269d1e5cb9`). The Change-open detection and invalid-JSON browser cases both passed.

## Backoff expectation correction

The designer's earlier test incorrectly encoded the implementation's first-error delays of 4 then 8 seconds. `ARCHITECTURE.md` separately states the normal 2-second poll period and the GET backoff sequence **2/4/8/16/30 seconds**. Independent review concluded the first retry after failure should be 2 seconds, then 4. This was a real test-design error; expectations were corrected from the source, not weakened to obtain a pass.

An isolated archive of `848c8845fe975d171b0e781b850d1dbe13701c6b` plus the corrected test ran with `npx vitest run --root tmp/g3-backoff-red --config vitest.config.ts tests/component/controller.test.ts -t 'repeated GET failures'`. Exit **1**: at 2 seconds it expected 2 GET calls but observed 1. `reports/logs/g3-backoff-red.log`, SHA-256 `fb6dfa8cb03e6d118216b67617553721544c98ab4b5a7191d431d835bdb6d3d9`.

The implementer corrected the formula. On final candidate `3b7a43a`, `npx vitest run tests/component/controller.test.ts -t 'repeated GET failures'` exited **0** at the intended timing assertions; `reports/logs/g3-backoff-green.log`. The coordinator also reports the full 27-case component suite green. Final all-suite execution remains G4.

## User-requested real 15-second expiry check

The live expiry check resets the mock with `ttlMs: 15000`; it does not wait 15 minutes and does not change the normal demo's 15-minute default. `npm run test:e2e -- --grep 'T14 real HTTP 15-second'` exited **0**, test duration 16.0 seconds. Actual observed expiry interval was **15,579 ms**. The test captured awaiting and expired screenshots, verified transfer controls disappeared, then requoted successfully with the same `AQH-100306-PMT` reference and a later expiry.

- Log: `reports/logs/browser-15-second-expiry.log`, SHA-256 `6559872662d5c0935017865b53ee20bfc3f33da4cb6718d42f84b6cab60d3669`.
- Actual extracted observation: `reports/logs/browser-15-second-observation.json`, SHA-256 `8c66885c36257d122a509f93074f850d4cb1380ab155dd3cc6f091cf45093c5b`.
- Preserved complete local report and images: `reports/screenshots/expiry-15s/index.html` and its `data/` directory.

## Visual readiness correction and remaining stages

The independent G3A reviewer found that waiting for a visible payment-status region could match the initial selection view before creation was accepted. The visual suite now waits for an enabled initial Continue action, the exact accepted `data-status`, and a loaded QR for awaiting/underpaid before changing time, injecting transport faults, or capturing screenshots. It also records the correct frozen time `08:37:15.842Z`. This changes synchronization only; state/action, viewport and source-fidelity expectations are unchanged. G3A was notified directly to recapture and independently compare all 24 views.

`npm run typecheck` and `npx eslint tests vitest.config.ts playwright.config.ts` passed after the new safety and 15-second tests. The separate final G3 delta review, G3A visual/implementation signoff, G4 all-suite execution and G5 test-effectiveness audit remain their respective reviewers' responsibilities. Developer checks at earlier revisions do not substitute for those fixed-candidate gates.
