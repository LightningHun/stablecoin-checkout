# CLAUDE.md: stablecoin checkout refactor

This repository is a finished, independently verified Vue 3 + TypeScript + Vite shopper checkout for stablecoin payments, plus a controllable HTTP mock API. It was built against the Codex execution package. The current mission is a **behavior-preserving refactor** for readability, simplicity and efficiency. Nothing a shopper, evaluator or test can observe may change.

## One-time setup (before the first Claude Code session)

The reviewer subagent and the safety deny list ship in `docs/refactor/claude-config/`. Claude Code only loads them from `.claude/`. Install them once, either from a terminal at the project root or by asking Claude to run these commands in a separate setup session, then start a **new** session so the reviewer loads:

```bash
mkdir -p .claude/agents
cp docs/refactor/claude-config/agents/refactor-reviewer.md .claude/agents/
cp docs/refactor/claude-config/settings.json .claude/settings.json
```

If `.claude/agents/refactor-reviewer.md` is missing when you start, tell the user. With their OK, run the three commands, then ask them to start a new session. Don't proceed with risk-C steps without the reviewer.

## Read before editing

1. `docs/refactor/REFACTOR_GUIDE.md`: goals, scope, conventions, workflow, Git rules.
2. `docs/refactor/BEHAVIOR_CONTRACT.md`: everything that must stay identical.
3. `docs/refactor/CODEBASE_MAP.md`: how the code works today and the findings to fix.
4. `docs/refactor/REFACTOR_PLAN.md`: ordered steps RF-00 to RF-99. Follow them in order.
5. `docs/refactor/VERIFICATION.md`: check levels L1-L4, evidence format, failure handling.

The original build specification is tracked in Git at `HEAD`, but `AGENTS.md`, `START_PROMPT.txt`, `docs/*.md`, `docs/adr/*` and `docs/reference/*` are **absent from this working copy**. Read them with `git show HEAD:docs/ARCHITECTURE.md`, `git show HEAD:docs/API_CONTRACT.md`, `git show HEAD:docs/DESIGN_SPEC.md`, `git show HEAD:AGENTS.md` and so on. Never stage their deletion.

## Golden rules

1. **No behavior change.** Keep the HTTP contract, rendered DOM, text, ARIA, layout, focus, timing constants, error copy, money formatting and mock semantics identical. If a step needs any of these to change, stop and ask the user.
2. **The tests are the oracle.**
   - Never edit, delete, skip or weaken anything under `tests/`. That includes the refactor harness in `tests/refactor/`.
   - The one exception: in `tests/audit/mutations.ts` you may re-point `patches[].before`/`after`, plus `file` if the code moved. Each re-pointed mutation must inject the same defect.
   - Adding new test files is allowed.
   - Never run `playwright test -u` or `--update-snapshots`. Never re-capture `tmp/refactor/dom-baseline`.
3. **Keep the safety invariants** (BEHAVIOR_CONTRACT §1):
   - Payment status, request health and quote availability stay separate.
   - Observed funds never expire locally.
   - Money uses decimal strings and scaled `BigInt`, never `Number` or `parseFloat`.
   - One accepted quote snapshot drives token, network, amount, address, QR and clipboard.
   - `CheckoutPage.vue` owns the only `usePaymentController`, and its requests are single-flight.
   - Old generations and old references are ignored.
   - Uncertain POSTs are never retried, and HTTP errors never become payment `failed`.
4. **Keep the test-facing API stable** (BEHAVIOR_CONTRACT §3). Exported names and signatures imported by tests stay the same.
5. **Work in one small step at a time.** Back up the step's files, state the equivalence argument, edit, verify at the step's level, review when required, log. Don't batch unrelated transformations. Stop after each phase for the user's review.
6. **Don't add, remove or upgrade dependencies.** Don't introduce state libraries, routers or global stores.
7. **Treat tracked files under `reports/` as historical evidence.** Don't edit them. Write new evidence only under `reports/refactor/`.

## Git: NO-COMMIT mode (the user's choice)

- **Make no Git writes.** No `add`, `commit`, branch, `switch`, `checkout`, `restore`, `reset`, `stash`, `rebase`, `push` or `worktree`. Read-only `git status`, `diff`, `show` and `log` are fine. The user reviews the uncommitted changes and commits them personally.
- **Back up before every step:** `sh scripts/refactor/step-backup.sh save RF-xx <files>`. Show one step's diff with `... diff RF-xx`, and undo it with `... restore RF-xx`.
- **Never undo with `git restore` or `git checkout`.** They would wipe earlier steps' changes too.
- **The mutation audit needs a commit**, so after RF-00 it is deferred until the user commits. The anchor checker guards each step meanwhile.
- **Full rules** are in `docs/refactor/REFACTOR_GUIDE.md` §8, which also covers switching to commit mode, only if the user explicitly asks.
- `.claude/settings.json` (installed from `docs/refactor/claude-config/`) denies Git writes and other dangerous commands. It is a backstop, not the full rule set.

## Commands

```bash
npm ci                         # Node >= 22.12 (verified on 22.19 and 22.22)
npm run dev                    # app on 127.0.0.1:5173 + mock on 127.0.0.1:8787; Vite proxies /api
                               # evaluator controls: http://127.0.0.1:5173/?demo=1
npm run build && npm run preview   # built app on 127.0.0.1:4173 with the same mock

npm run typecheck && npm run lint && npm run build
npm run test:unit              # 73 Vitest cases
npm run test:component         # 27
npm run test:contract          # 21 (real HTTP mock)
npm run test:e2e               # Playwright behavior cases
npx playwright test --grep-invert "@visual"   # functional browser subset
npm run test:visual            # 24 visual baselines (*-chromium-darwin.png, macOS only)
npm run verify                 # all of the above in sequence: 186 cases at the start

sh scripts/refactor/step-backup.sh save|diff|restore RF-xx [files]   # per-step backup / step diff / undo (no-commit mode)
npx tsx scripts/refactor/check-mutation-anchors.ts             # every G5 mutation patch still applies once
npx playwright test -c tests/refactor/playwright.config.ts     # DOM/ARIA/layout equivalence, 36 captures
npm run test:mutation -- --candidate HEAD --preflight                 # mutation audit: archives a COMMIT (baseline, or after the user commits)
```

The check levels (L1 fast, L2 step gate, L3 phase gate, L4 final) are defined in `docs/refactor/VERIFICATION.md`.

## Environment traps

- **Stale mock.** `npm run dev` loads `mock/` once. Playwright reuses a running server (`reuseExistingServer`), so after editing `mock/`, `scripts/` or `vite.config.ts`, stop any running dev server before browser tests.
- **Visual baselines are macOS-only** (`chromium-darwin`). On another OS, **never run `npm run test:visual` or `npm run verify`.** Playwright's default `updateSnapshots: "missing"` would silently write `*-chromium-linux.png` baselines, and later runs would compare against them. Run the other scripts individually, mark visual as "not run: platform", and rely on the DOM harness captured on the same machine. If stray `*-linux.png` files appear, delete them and don't commit them.
- **`scripts/fingerprint.ts` crashes** (ENOENT) while tracked docs are missing from the working tree. Don't use it.
- The mutation runner archives a commit with `git archive`, so it cannot see uncommitted edits (see the Git section above). A08 is a known, reviewed equivalent survivor, and the runner exits 1 for it by design.

## Project facts that look like bugs but are decisions

- The merchant is "Payment Project", not the brief's "Nordwind Audio", and the only order is ORD-88213 for EUR 149.90.
- The UI makes no refund promises, has no support or explorer links, and uses no provider name. Expired quotes stop polling. These are design deviations recorded at G0/G3A.
- `tests/fixtures/oracles.ts` deliberately duplicates literals instead of importing production constants. Keep it independent.
- `responseSchemas.ts` keeps its own supported-pair table, separate from `mock/catalogue.ts`. The client must not trust the mock.
