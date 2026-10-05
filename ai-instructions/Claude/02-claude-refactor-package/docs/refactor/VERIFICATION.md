# Refactor verification protocol

"Maintains functionality" is proven, not assumed. Three independent oracles agree:

- **The existing suites** (186 cases) check the behavior and the safety invariants.
- **The DOM equivalence harness** checks that rendered output is identical, with zero tolerance.
- **The mutation audit** checks that the tests still catch the deliberate defects after the code moved.

A refactor step is done only when all three are green at the step's level.

## 1. Tooling added for the refactor

| Tool | Purpose | Notes |
| --- | --- | --- |
| `scripts/refactor/check-mutation-anchors.ts` | Confirms every `tests/audit/mutations.ts` patch matches exactly once, applying patches in sequence exactly like `run.ts`. | About 1 s. Exit 1 lists the broken IDs. It checks applicability only, not that the defect is semantically the same. |
| `scripts/refactor/step-backup.sh` | No-commit mode: per-step backups in `tmp/refactor/backup/RF-xx/`. `save` runs before editing; `diff` shows only this step's changes (for review); `restore` undoes the most recent step. | POSIX `sh`. Files absent at `save` are recorded as new, and `restore` deletes them. Never use `git restore` to undo a step. |
| `tests/refactor/dom-equivalence.spec.ts` with `tests/refactor/playwright.config.ts` | Captures the ARIA snapshot, `innerText`, focus, element identity and attributes (QR `src` hashed), layout boxes and about 70 computed styles. It covers 18 scenarios: D01-D12, X01 demo panel, X02 clipboard fallback, X03 de-DE, X04 ETH quote, X05 local-deadline notice, X06 uncertain POST. Each runs at 1280 and 390 px, for 36 captures. | About 40 s. Uses the stubbed API from `tests/acceptance/fixtures.ts` and a paused clock. Waits for two identical consecutive captures. The baseline lives in `tmp/refactor/dom-baseline/` (git-ignored) and is **machine-specific**: capture and compare on the same machine. |
| `.claude/agents/refactor-reviewer.md` (installed from `docs/refactor/claude-config/agents/`) | Independent read-only reviewer subagent | See §7. Claude Code loads subagents at session start: install it before launching. |

Neither tool is part of `npm run verify` or any gate from the original build. Both lint and typecheck clean.

## 2. Baseline capture (RF-00)

Run on the untouched source. Nothing is committed (no-commit mode), and `HEAD` is still the original `7a44f8a`, so the baseline mutation preflight below archives exactly the original code. Stop if any step is not green; on macOS, everything must pass.

```bash
mkdir -p reports/refactor/baseline
git rev-parse HEAD                                    # record as BASE
git diff --quiet 7a44f8a -- src mock tests scripts/serve.ts scripts/fingerprint.ts package.json package-lock.json \
  tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts eslint.config.js index.html \
  ':(exclude)tests/refactor' && echo "source == 7a44f8a"            # must print; otherwise stop and ask
npm ci
npm run verify 2>&1 | tee reports/refactor/baseline/verify.log      # expect 73 + 27 + 21 + 41 + 24 passed (~6-8 min)
npx vitest list | sort > reports/refactor/baseline/vitest-inventory.txt              # 121 lines
npx playwright test --list > reports/refactor/baseline/playwright-inventory.txt       # "Total: 65 tests in 6 files"
npm run build 2>&1 | grep -E "dist/assets" | tee reports/refactor/baseline/bundle.txt # JS 213.63 kB / gzip 71.93 kB; CSS 11.24 kB / gzip 3.09 kB
REFACTOR_DOM=baseline npx playwright test -c tests/refactor/playwright.config.ts      # 36 passed (writes baseline)
shasum -a 256 tmp/refactor/dom-baseline/*.json > reports/refactor/baseline/dom-baseline.sha256
npx tsx scripts/refactor/check-mutation-anchors.ts                                   # OK: 23 mutations, 25 patch anchors
npm run test:mutation -- --candidate HEAD --preflight 2>&1 | tee reports/refactor/baseline/mutation-preflight.log
```

- The mutation preflight takes 10-20 minutes. It should print `detected` for M01-M12, VM01, VM02 and A01-A07, A09, and `survived-requires-triage` for **A08**. Exit code 1 is expected because of A08.
- If the visual suite fails on this machine **before any edit**, record it, rely on the DOM harness, and tell the user. Never update snapshots.
- Long commands need a timeout of at least 10 minutes, or run them in the background and poll the log.

## 3. Check levels

### L1: fast (risk A steps, and during any edit loop; about 30 s)

```bash
npm run typecheck && npm run lint && npm run test:unit && npm run test:component \
  && npx tsx scripts/refactor/check-mutation-anchors.ts
```

### L2: step gate (risk B and C steps, before logging the step as done; about 4 minutes)

```bash
# L1, then:
npm run test:contract
npx playwright test --grep-invert "@visual"         # behavior cases
npx playwright test -c tests/refactor/playwright.config.ts          # 36 DOM captures, zero tolerance
npm run build 2>&1 | grep -E "dist/assets"                          # within budget
```

If the step touched `mock/`, `scripts/` or `vite.config.ts`, stop any running `npm run dev` before the Playwright commands. Playwright would otherwise reuse a server with stale mock code.

### L3: phase gate (end of each phase)

```bash
npm run verify                                                       # 186 cases incl. visual + 2-min background (macOS only, see §8)
npx playwright test -c tests/refactor/playwright.config.ts
npx tsx scripts/refactor/check-mutation-anchors.ts
# commit mode only: npm run test:mutation -- --candidate HEAD --preflight   # ALL mutations, 10-20 min
npx vitest list | sort | diff - reports/refactor/baseline/vitest-inventory.txt         # no removed or renamed tests
npx playwright test --list | diff - reports/refactor/baseline/playwright-inventory.txt  # identical (tests are frozen)
```

If you added new tests, the inventory diff shows only those additions.

**No-commit mode (current).** The mutation runner archives a commit, so it cannot test uncommitted edits. Skip it at phase gates. The anchor checker plus the reviewer's semantic check of every re-pointed anchor are the interim guard. Then **stop and report the phase to the user.** List the changed and new files (`git status --short`), give one line per step, and include the check results. Wait for "continue".

**Commit mode (only if the user enables it).** Commit the phase, then run the full preflight. It is deliberate: phases touch more anchor-bearing files than they seem to. Use `--ids` only for quick checks right after re-pointing a single anchor.

### L4: final (RF-99)

**No-commit mode (current).** Run everything in the working tree. Stop any running `npm run dev` first.

```bash
npm ci
npm run verify 2>&1 | tee reports/refactor/verify-final.log           # 186 or more cases
npx playwright test -c tests/refactor/playwright.config.ts            # 36/36 against the RF-00 baseline
npx tsx scripts/refactor/check-mutation-anchors.ts
npx vitest list | sort | diff - reports/refactor/baseline/vitest-inventory.txt
npx playwright test --list | diff - reports/refactor/baseline/playwright-inventory.txt
npm run build && MOCK_PORT=8790 npm run preview &   # then, from another shell:
#   curl -s http://127.0.0.1:4173/api/currencies | head -c 120
#   curl -s -X POST -H 'content-type: application/json' \
#     -d '{"order_id":"ORD-88213","currency":"USDT","network":"tron"}' http://127.0.0.1:4173/api/payments
#   stop the preview afterwards
```

1. Run the final `refactor-reviewer` pass over `git diff -- src mock scripts` plus the new files shown by `git status --short`.
2. Write `reports/refactor/SUMMARY.md`.
3. Tell the user the **mutation audit is the one remaining check**, and that it needs their commit. After the user commits, run `npm run test:mutation -- --candidate HEAD --preflight`. Expect 22 detected, A08 survived and exit 1. Append the result to `SUMMARY.md`.

**Commit mode (only if the user enables it).** Use a clean `git worktree` of the final commit, with `tmp/refactor/dom-baseline` copied in. Run `npm ci`, `npm run verify`, the DOM harness and the preview smoke test there. Write and commit `reports/refactor/FINAL_SUITE.md`, then run `npm run test:mutation -- --candidate <that commit> --g4-evidence reports/refactor/FINAL_SUITE.md`.

## 4. Reading failures

- **A failing existing test is a behavior change until proven otherwise.** Fix the code, not the test.
- **DOM harness.** The failure message lists up to 25 differences: ARIA or text diff, element identity, attribute, box or style property. The full current capture is written to `tmp/refactor/dom-current/<id>-<width>.json`. Typical causes are template whitespace, a lost wrapper element, a cascade-order change or a changed class list. Revert or repair. **Never re-capture the baseline.**
- **Visual suite.** Look at the diff images under `reports/playwright-results/`. Never use `-u` or `--update-snapshots`.
- **Mutation preflight.** Possible outcomes:
  - `detected`: good.
  - `survived-requires-triage`: the tests no longer catch that defect in the new code shape. The anchor probably now injects a different or weaker defect; fix the anchor. Never weaken a test. A08 is the only accepted survivor.
  - `blocked-unintended-failure`: the mutated test failed, but not with `expectedFailure` in an assertion (for example a compile or harness error, or a different assertion), or the restoration run was not green. Fix the `after` text so it injects the intended defect.
  - **The run aborts with "expected one patch location"**: an anchor matches zero or several times. Run the anchor checker and re-point it (§5).
- **Flakes.** Only cases that use real time may be rerun, once, with both results logged:
  - the `demo.spec` cases (real mock, real 2-second polling, the 5-second slow fault and the 15-second expiry);
  - the `http.test` slow-response case.

  Every other failure is real.

## 5. Re-pointing a mutation anchor

When `check-mutation-anchors.ts` reports a broken ID after an intentional refactor:

1. Open the entry in `tests/audit/mutations.ts`. Read its `description`, `testName` and `expectedFailure`, and the original `before`/`after` pair.
2. Find the refactored code that implements the same guarded behavior.
3. Set `before` to an exact, unique substring of the new code, including indentation. Set `after` so it injects **the same defect** described by `description`, and so it still runs: Vitest and Vite transpile without type-checking, but runtime references must exist.
4. Don't change `id`, `description`, `requirements`, `file` (unless the code moved files), `runner`, `testFile`, `testName`, `expectedFailure` or `category`. If the code moved to another file, update `file` only.
5. Run the checker, which must print OK. In no-commit mode, the runtime proof (`npm run test:mutation -- --candidate HEAD --preflight --ids <ID>`, which must report `detected` at the same assertion) waits until the user commits, so list every re-pointed ID in the log for that later run. In commit mode, commit the source and anchor changes together, then run it immediately.
6. Record the old and new anchors in the log. Have the reviewer confirm the defect is semantically unchanged.

## 6. Evidence

### `reports/refactor/REFACTOR_LOG.md` (one entry per step)

```markdown
## RF-xx <title>
- Backup: tmp/refactor/backup/RF-xx · Commit: none (no-commit mode) · Risk: A | B | C
- Files: <paths>
- Transformation(s): <extract constant | split function | …>
- Equivalence argument: <why every input yields the same outputs and side effects>
- Anchors: none | <ID>: "<old before>" -> "<new before>"; preflight <verdict>
- Checks: L1 ✓ (unit 73, component 27, anchors OK) · L2 ✓ (contract 21, browser 40, DOM 36/36, JS gzip 71.9 kB, CSS gzip 3.09 kB)
- Review: refactor-reviewer PASS | findings fixed: <…> | not required (risk A)
- Notes: <surprises, reverted attempts, follow-ups>
```

### `reports/refactor/SUMMARY.md` (RF-99)

- Base commit (`7a44f8a`) and the full list of changed and new files. Steps done, skipped or reverted (with reasons). Re-pointed mutation IDs awaiting the post-commit audit.
- A table of lines per file, before and after (`wc -l`), plus the longest-function notes for the controller, the page template, `responseSchemas` and the mock handler.
- Duplicates removed (F-01 to F-35, status of each).
- Bundle sizes before and after.
- Test results: 186 or more cases. Visual, background and DOM harness results. The formal mutation audit verdicts per ID.
- Deviations, limitations (platform coverage) and decisions the user should make (optional O-steps).

## 7. Independent review

Invoke the project subagent by name. For example: "Use the refactor-reviewer subagent to review the uncommitted diff for RF-13 against BEHAVIOR_CONTRACT.md."

- Give it the step ID, the files and your equivalence argument. Point it at this step's diff: `sh scripts/refactor/step-backup.sh diff RF-xx`. The plain `git diff` would also include earlier steps.
- It runs read-only commands and returns `PASS` or `CHANGES REQUIRED` with findings.
- You, the author, fix the findings. Don't argue a finding away without a test or a contract reference. If you disagree after one round, record both positions in the log and ask the user.
- Review is **required** for every risk C step (RF-06, RF-07, RF-11, RF-12, RF-13, RF-15, RF-17, RF-20, RF-21) and at RF-99.

## 8. Platform notes

| Environment | What runs | What to record |
| --- | --- | --- |
| macOS (the original evidence machine) | Everything | Full results |
| Linux or a CI container | Everything except `test:visual`. **Don't run `npm run test:visual` or `npm run verify` here**: Playwright's default `updateSnapshots: "missing"` would write new `*-chromium-linux.png` baselines that later runs compare against. Run the individual scripts instead. The background test needs a display (`xvfb-run`). | Visual "not run: platform". Ask the user to run `npm run test:visual` on the Mac before merging. Delete any stray `*-linux.png` and never commit one. |
| `CI` env var set | `reuseExistingServer` is false, so Playwright always starts its own dev server | Nothing special |
