# G3 final delta review

- gate_id: G3
- verdict: **pass**
- candidate kind: git-commit
- candidate: `3b7a43ad4f4bd74a4dce8387876db8e977e6a2b6`
- reviewer: independent `/root/g3_code_review`; did not author application changes or acceptance tests.
- fresh checkout: `/Users/joshua/Documents/Stablecoin-payment/codex-execution-package/tmp/review-g3-final`, created with `git worktree add --detach tmp/review-g3-final 3b7a43ad4f4bd74a4dce8387876db8e977e6a2b6` (exit 0).
- tracked-input status: clean before and after review; independently verified HEAD and fingerprints.
- suite SHA-256: `23825e5551be3a3f334bb9a1eaab3dd9c3d0ee3ed7e3f62968a9bb7f994cefa3`
- fixture SHA-256: `fe6dc02a603632cf754c453c24bd865735d9cf01c879e2e14118e0595d426dbb`
- application SHA-256: `2af8c975a57298f7f9165c9dc6b52c6eb836b67ac1937e7fb08272176481513e`
- design SHA-256: `2f57558eb340aeafd948dfc1ff5043085ff03f5dbb1519aadc5aed72c562624b`
- runtime: Node `v22.19.0`, macOS arm64.
- requirements: R07/R11/R23 and T09/T15 for the application delta; test-code review touches T06/T14/R28. Prior reviewed scope and original finding resolutions remain documented in `G3-recheck.md`.

This addendum reviews the full diff from `848c8845fe975d171b0e781b850d1dbe13701c6b`. The only application change is the controller's retry-delay formula. No blocking findings remain in this delta or the previously resolved findings. G3A should use this exact candidate; the earlier application fingerprint is superseded.

## Contract correction and independent observation

`docs/ARCHITECTURE.md:86` already specified a 2/4/8/16/30-second GET backoff. The earlier implementation and its test oracle began at 4 seconds after the first failure. The independent designer supplied a corrected red test against the earlier implementation; `reports/logs/g3-backoff-red.log` records the intended assertion failure at 2000 ms: expected two status calls, observed one. This is a correction to the earlier G3 pass, not a changed contract or waived requirement.

The new formula uses `max(0, failures - 1)` before the capped exponent. The normal interval is still 2000 ms. The first failed GET now schedules another GET at 2000 ms, followed by 4000, 8000, 16000 and capped 30000 ms. It does not change status precedence, mutation handling, quote validation, generation checks or disposal.

An independent external probe exercised the actual final controller with captured scheduling callbacks and a failing client. It observed exactly `[2000, 4000, 8000, 16000, 30000, 30000]`, one pending poll after every settled GET, coalesced retry while a timer-triggered request was active, a return to 2000 ms after a successful GET, and zero pending timers after scope disposal. This verifies the complete sequence, including cap and recovery, beyond the committed test's first two failure intervals. It uses controlled timers; it is not a real-time duration claim.

## Commands and results

All checks ran from the fresh final worktree. Logs are in the root reports directory, outside the candidate. Required checks used the explicit Node 22 path.

| Exact command | Exit / observation | Root evidence |
| --- | --- | --- |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm ci` | 0 | `reports/logs/g3-final-ci.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm run typecheck` | 0 | `reports/logs/g3-final-typecheck.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm run lint` | 0 | `reports/logs/g3-final-lint.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH npm run build` | 0 | `reports/logs/g3-final-build.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH node_modules/.bin/tsx ../../reports/logs/g3-final-backoff-probe.mts` | 0; all timing, recovery, serialization and cleanup assertions pass | `reports/logs/g3-final-backoff-probe.log` |
| `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH node node_modules/vitest/vitest.mjs run tests/unit tests/component tests/contract` | 0; 9 files / 121 tests pass | `reports/logs/g3-final-regressions.log` |

Local test listener/tsx commands used authorized escalation. No shared live app/mock was reset or used. No source/test changes were made by this reviewer. Existing original-finding regressions were included in the 121-test run and remain green.

## Test and documentation delta review

- The visual suite now waits for the selected API state and fully loaded QR before capture. This strengthens determinism and avoids accepting a visible but wrong-state confirmation region. It does not approve baseline fidelity, which remains G3A/G5 work.
- The new real HTTP 15-second expiry test checks awaiting state, server expiry, absence of send controls, a 12–20 second real elapsed window, a fresh quote and preserved reference. It does not use fake time or weaken expired-state assertions. It was code-reviewed here; actual browser execution is recorded elsewhere and remains part of G3A/G4 validation.
- Architecture additions accurately describe the previously independently verified protocol, funds-observed, clock-resync and selection fixes. No API capabilities or unsupported custody/refund claims were added.

The original seven findings remain resolved: the relevant implementation is unchanged except retry scheduling, and the affected domain/controller/HTTP regressions were rerun. This addendum does not substitute for G3A integrated/visual review, G4 complete suite execution, G5 mutation/visual auditing or G6 deferred-deliverable assessment.

## Evidence fingerprints

Complete recomputed inputs and artifacts: `reports/logs/g3-final-fingerprint.json`.

- independent backoff probe source: `a25342e7e9113048f0b612365fd48d710313c46048cc1f110a27555bd5e615ad`
- independent backoff observations: `d69dadc4abcc2f89ee2ef05d5834dd038526ac25782aaeb1926ad5af835406c2`
- regression log: `b200992905766263d1cc06bd716430ecad2cb789bde0e00f2ab615cd9245ea6e`
- reviewed designer red log: `fb6dfa8cb03e6d118216b67617553721544c98ab4b5a7191d431d835bdb6d3d9`
- built JavaScript (`dist/assets/index-EIre3BXl.js`): `f0159ea512ba569b6e74d928e1388b50155357389aaa3016d899423829429050`
- built CSS (`dist/assets/index-BEqS4xZz.css`): `9361711391f7d46432956582a61d75af23576bc36544cdce7079b6bff169936c`
- built HTML: `4cd458f37eef7088a96013c2ab7a6d41857b82cc207c8053482bf37b24e557b1`

Reviewer-owned writes are this addendum and `reports/logs/g3-final-*`. The final reviewed worktree remains clean.

## Evidence-only carryforward to 4901886

Independent reviewer `/root/g3_code_review` confirms **G3 pass applies to `49018863d317cce6adf837c832d8823419002b71`**. Inspected `git diff --name-status` and `--numstat` from `3b7a43ad4f4bd74a4dce8387876db8e977e6a2b6` (exit 0) and independently recomputed hashes directly from the new commit's Git blobs. The delta contains 24 D01–D12 desktop/mobile PNG baselines plus reports, plan documentation and a generated-manifest ignore rule. There are no application, configuration, lockfile, fixture or test-source changes.

- unchanged application SHA-256: `2af8c975a57298f7f9165c9dc6b52c6eb836b67ac1937e7fb08272176481513e`
- new suite SHA-256, including the 24 PNGs: `6e253a4b3827245675fe0db4132648e30d338482da13de8c91a85585247bddd5`
- independent comparison evidence: `reports/logs/g3-carryforward-4901886.json`

The G3 command results above carry forward because every reviewed executable input is unchanged; no redundant command rerun was performed. Baseline fidelity remains the G3A reviewer's responsibility, and G4/G5 must use the new candidate and suite fingerprint. No new G3 finding. Signed by reviewer session `/root/g3_code_review`.
