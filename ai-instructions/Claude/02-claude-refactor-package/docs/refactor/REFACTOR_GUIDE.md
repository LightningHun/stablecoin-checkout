# Refactor guide

Status: instructions for a behavior-preserving refactor of the verified checkout. Read this file first, then the [behavior contract](BEHAVIOR_CONTRACT.md), [codebase map](CODEBASE_MAP.md), [plan](REFACTOR_PLAN.md) and [verification protocol](VERIFICATION.md).

## 1. Starting point

The application already passed independent gates G0-G6 on candidate `49018863`. The repository `HEAD` at handoff is `7a44f8a` (evidence-only commits after the candidate).

- 186 ordinary test cases pass: 73 unit, 27 component, 21 real-HTTP contract, 41 browser behavior and 24 visual.
- The mutation audit detects all 14 mandatory deliberate defects (M01-M12, VM01-VM02) and 8 of 9 targeted mutations.
- A08 is a reviewed, equivalent survivor.

Its correctness is the asset to protect. The refactor exists to make that correctness easier to read, change and trust. It does not add features.

The original specification (the Codex execution package) defines what "correct" means: `git show HEAD:docs/REQUIREMENTS.md`, `API_CONTRACT.md`, `ARCHITECTURE.md`, `DESIGN_SPEC.md`, `VERIFICATION.md`, and `docs/adr/00{1,2,3}-*.md`. These files are tracked but missing from this working copy. Read them from Git; don't restore or delete them.

## 2. What the three goals mean here

| Goal | Concrete meaning in this codebase | How it is judged |
| --- | --- | --- |
| **Readability** | A newcomer can find where each rule lives. Names state intent (`isOutcome`, `backoffDelay`, `DEMO_ORDER`), not mechanics (`result`, `tick`, `wallAt`). There are no comma-chained declarations, no inline status arrays or nested ternaries in templates, and no method calls in templates for derived values. Comments explain *why*: the invariant protected or the race prevented. | Reviewer check against [§5 conventions](#5-conventions). Function and template sizes in the [codebase map](CODEBASE_MAP.md) shrink. |
| **Simplicity** | Each piece of knowledge has one home: currency scale, status groups, demo order data, the decimal pattern, display formatting. Multi-purpose functions are split (`mutate(pair, requote)`, `accept(result, gen, replace, expected)`). Convoluted expressions are replaced by **strictly** equivalent direct ones (the controller's `availability` time argument). A new shared module or constant needs at least two real call sites. A single-use helper is fine when it moves logic out of a template into named, testable TypeScript. | Fewer duplicated literals and expressions, shorter functions, fewer boolean-flag parameters. Every simplification carries an equivalence argument in the log. |
| **Efficiency** | Remove redundant work: repeated `parseUnits` of the same string, inline arrays allocated on every render, `title()` recomputed each render, `URLSearchParams` parsed twice. Keep the bundle within budget. This app has no performance problem, so efficiency must never cost clarity or safety. | JS bundle gzip at most +0.5 kB (baseline 71.93 kB), CSS not larger (baseline 3.09 kB gzip). Polling cadence, timeouts, backoff, ticker and TTL stay unchanged because they are contract. |

## 3. Scope

**In scope:**

- `src/**`
- `mock/**`
- `scripts/serve.ts` and `scripts/fingerprint.ts` (readability only)
- New pure helper modules
- New test files that add coverage for new helpers
- Re-pointing anchors in `tests/audit/mutations.ts`

A `format` script is optional step O-6 and needs approval.

**Out of scope unless the user explicitly opts in:**

- Any change visible to a shopper, evaluator, test or HTTP client: copy, layout, spacing, colors, focus order, timing, status codes, headers, payload fields, mock scenario semantics.
- Editing existing tests, fixtures, oracles, visual baselines or the refactor harness (`tests/refactor/`), including Prettier-formatting `tests/` (optional step O-1).
- Dependency changes: no new libraries, no upgrades, no `zod/mini`, no lazy-loaded `qrcode` (optional steps O-2 and O-3).
- Moving global CSS into `<style scoped>`. Specificity and cascade changes are too risky for no user value (O-4).
- New architecture: Pinia, router, a state-machine library, or a second polling owner.
- Changing recorded design deviations or project decisions. The merchant name, absent links, refund wording and expired-polling stop are all deliberate.
- README creation, Git remote operations, deployment.

## 4. Allowed transformations

Use only behavior-preserving moves. Name the move in the log.

| Move | Example here | Main risk to check |
| --- | --- | --- |
| Extract constant or lookup | `CURRENCY_SCALE`, `DEMO_ORDER`, `SUPPORTED_PAIRS`, `DEFAULT_NETWORK` | The value or key type changes; the oracle independence is broken (tests must keep literals) |
| Extract pure function | `backoffDelay`, `formatCountdown`, `checkPaymentFacts` | The boundary case changes: rounding, `>=` versus `>`, an empty value |
| Extract presentational component | `QuoteLoading.vue`, `ConnectionBanner.vue` | A DOM wrapper, whitespace or attribute order changes; the DOM harness must stay green |
| Introduce named computed | `heading`, `isOutcome`, `confirmationMarker` | Lost type narrowing in templates (`'amount_received' in payment`) |
| Split boolean-flag function | `mutate(pair, requote)` into `replaceQuote` and `renewExpiredQuote` | The order of `await`s and state writes, or the `posted` flag semantics |
| Rename (internal only) | `tick` to `clockTick`, `allowed` to `ALLOWED_TRANSITIONS` | Exported names used by tests; mutation anchors |
| Consolidate duplicate CSS | Merge the two `@media (max-width: 600px)` blocks | Cascade order for equal specificity; the VM01 anchor |
| Reformat | Prettier on `CopyButton.vue` and `DemoControls.vue` | Template whitespace between inline elements changes the rendered text |

**Never in a refactor step:**

- Changing a condition's truth table
- Reordering `await`s or state writes in the controller
- Changing a regex, literal, default parameter or exported signature
- Changing the timing of side effects: creating timers, adding listeners, `onScopeDispose` registration order, or adding an `await` at an entry point (a microtask hop is observable under fake timers)
- Swapping `===` for truthiness
- Replacing an exact `BigInt` operation with anything else
- Replacing a value read at call time with a cached `computed` value, or the reverse. `remaining` is cached between ticks while `clock.now()` is live.

"Equivalent in the tests" is not enough. Several paths are not exercised with realistic values. For example, the controller tests always sample the clock with zero round-trip uncertainty. The equivalence argument must hold for **every** input and timing.

## 5. Conventions

### TypeScript

- One declaration per statement. Group the controller's state into three commented blocks: reactive state exposed to the page, reactive internal state, and non-reactive flight control.
- `UPPER_SNAKE_CASE` for fixed domain data and tuning constants (`DEFAULT_POLL_MS`, `MAX_BACKOFF_MS`). Use `ReadonlySet` or `readonly` arrays and `as const` objects.
- Prefer early returns and guard clauses over nested conditions. Keep functions under about 30 lines; the controller's top-level composable is the only exception, and it should mostly wire named inner functions.
- Avoid boolean-flag parameters on new functions. Pass a discriminated kind or split the function. Existing exported signatures stay as they are.
- No `any`. In new code, a non-null assertion needs a one-line comment naming the invariant that guarantees it.
- Money is handled only in `domain/money.ts` helpers with explicit scales. Milliseconds and confirmation counts may use `number`.
- Keep every user-visible string byte-identical. When centralizing messages, copy them exactly and let the tests prove it.

### Vue

- `<script setup lang="ts">`, typed `defineProps` and `defineEmits`. Presentational components receive readonly data and emit intents.
- Templates are declarative:
  - No inline array literals.
  - No ternary nested more than one level.
  - Derived values go in `computed`, not methods called from the template.
  - Keep **type narrowing** wherever the template then reads status-specific fields. This covers both `in`-narrowing (`'amount_received' in payment`) and status-equality narrowing (`payment.status === 'detected'` before `payment.confirmations` or `detected_at`). A computed boolean flag does not narrow, and `vue-tsc` will fail.
- Only `CheckoutPage.vue` calls `usePaymentController()`.
- Keep every `data-testid`, `role`, `aria-*`, `alt`, label text, class name and element order.
- **Inline whitespace is rendered output.** `</span\n><span>` and `>text</span` formatting exists to avoid or keep spaces. After any template edit, the DOM harness must report identical `innerText`.

### CSS

- Design tokens live in `src/styles/tokens.css`. Move repeated raw colors there (`#355bea`, `#444`, `#555`, `#666`, `#909090`, `#ededee`, `#ffffff33`) without changing computed values.
- Organize `main.css` into sections in the order of the page. Keep one `@media (max-width: 600px)` block where cascade order allows it.
- **Equal specificity means the later rule wins.** Moving a rule across another rule for the same element can change the result. For example, `<div class="eyebrow network-label">` gets its color, size and weight from `.network-label` only because `.network-label` (L364) comes after `.eyebrow` (L64).
- No new `!important`. No class renames, because tests and mutation patches reference classes.

### Comments

- Keep and sharpen safety comments, for example "Wait for the GET to settle before POST; invalidated GET callbacks cannot update state."
- Add a short *why* comment where a reader could "simplify" a guard away: generation checks, the funds latch, the uncertain-POST lock, the quote-equality check.
- Delete comments that only restate the code.

### Formatting

`src/`, `mock/` and `scripts/serve.ts` use Prettier 3 defaults (double quotes, semicolons, trailing commas, 80 columns). The three exceptions are `CopyButton.vue`, `DemoControls.vue` and `scripts/fingerprint.ts`. Keep touched production files Prettier-clean with `npx prettier --check <file>`. Prettier can rewrap template text and move mutation anchors, so run the anchor checker afterwards.

## 6. Workflow for every step

1. **Pick** the next RF step in [REFACTOR_PLAN.md](REFACTOR_PLAN.md). Don't skip ahead. Optional O-steps require user approval.
2. **Read** every file the step touches, plus the tests that cover it (the plan lists them).
3. **Back up** the files the step will edit or create: `sh scripts/refactor/step-backup.sh save RF-xx <files>` ([§8](#8-git-mode-no-commit-the-users-current-choice)). If you need another file mid-step, run `save` again for it *before* editing it.
4. **Write the equivalence argument** in `reports/refactor/REFACTOR_LOG.md` before editing. One to five sentences: why every input produces the same output and side effects.
5. **Edit** with the smallest diff that achieves the step.
6. **Run the checks** at the step's level (L1, L2 or L3; see [VERIFICATION.md](VERIFICATION.md)). Always run the mutation anchor checker. If an anchor broke, re-point it ([VERIFICATION.md §5](VERIFICATION.md#5-re-pointing-a-mutation-anchor)).
7. **Get review** when the plan marks it "Review: required". Give the `refactor-reviewer` subagent this step's diff: `sh scripts/refactor/step-backup.sh diff RF-xx`. Resolve every finding, or revert the step.
8. **Log** the changed files, commands with exit codes and counts, the reviewer verdict and any notes. Don't commit (§8).
9. **Stop at the end of each phase.** After the L3 phase gate, report to the user: the files changed, a short summary per step, and the check results. Wait for the user's "continue" before the next phase. The user reviews the uncommitted changes themselves.

## 7. Stop and ask the user when

- A step seems to require changing a test assertion, a snapshot, the DOM baseline, user-visible copy, layout, timing or HTTP behavior.
- The baseline (RF-00) is not green, or the working tree differs from `HEAD` in source, test or config files.
- A behavior difference turns out to be a real bug in the original. Record it and don't fix it inside the refactor. The user decides whether to fix it as a separate, test-first change.
- The same step fails verification after three repair attempts. Revert the step with `sh scripts/refactor/step-backup.sh restore RF-xx`, log what was tried, and continue with the next independent step.

## 8. Git mode: NO-COMMIT (the user's current choice)

The user reviews every change personally before anything is committed. Until the user explicitly says otherwise:

- **Make no Git writes at all.** No `git add`, `git commit`, branch creation, `git switch`, `git checkout`, `git restore`, `git reset`, `git stash`, `git rebase`, `git push` or `git worktree`. Read-only Git is fine: `git status`, `git diff`, `git show`, `git log`. `.claude/settings.json` denies the write commands as a backstop.
- **Edit files in place, on the current branch.** Changes stay uncommitted in the working tree, where the user can see them in the app's diff view or with `git diff`.
- **Never use `git restore` or `git checkout -- <file>` to undo a step.** They reset a file to `HEAD`, which would also erase every *earlier* step's changes in that file. Undo only with the step backups:

  ```bash
  sh scripts/refactor/step-backup.sh save    RF-xx <files to edit or create>   # before editing
  sh scripts/refactor/step-backup.sh diff    RF-xx                             # this step's changes only
  sh scripts/refactor/step-backup.sh restore RF-xx                             # undo this step (most recent step only)
  ```

  Backups live in `tmp/refactor/backup/` (git-ignored). Never delete them during the refactor.
- **Mutation audit timing.** `npm run test:mutation` archives a *commit* with `git archive`, so it cannot see uncommitted changes. During the refactor, the anchor checker (`npx tsx scripts/refactor/check-mutation-anchors.ts`) is the per-step guard. The baseline mutation run in RF-00 still works, because the code then equals `HEAD`. The full post-refactor mutation audit runs only after the user has reviewed and committed the changes ([VERIFICATION §3 L4](VERIFICATION.md#l4-final-rf-99)).
- **Never stage the deleted spec docs.** `AGENTS.md`, `START_PROMPT.txt`, `docs/*.md`, `docs/adr/*` and `docs/reference/*` are tracked but missing from this copy. That matters later, when the user commits: stage explicit paths only, never `git add -A`.

### If the user later switches to commit mode

Only when the user explicitly authorizes commits:

- Create `refactor/readability-simplicity` from the current `HEAD`.
- Commit the refactor package first (`CLAUDE.md`, `docs/refactor`, `.claude/agents/refactor-reviewer.md`, `.claude/settings.json`, `scripts/refactor`, `tests/refactor`), with explicit paths only.
- Then make one commit per verified step: `refactor(RF-xx): <summary>`. Fix forward, with no amend, rebase, reset, push or remote operations.
- The user must also remove the matching Git deny entries from `.claude/settings.json`: `git add`, `git commit` and `git switch`, plus `git worktree` for the commit-mode final check.

## 9. Judgment calls already made

These decisions keep the refactor from re-arguing settled questions. Do not reverse them.

| Question | Decision | Why |
| --- | --- | --- |
| Merge `responseSchemas` pair rules with `mock/catalogue.ts`? | **No.** Keep them separate; make the client table readable. | The mock stands in for an external provider. The client must validate the provider rather than share its data. |
| Change `acceptSnapshot`'s positional signature? | **No.** Restructure the body only. | Tests call it positionally. It is test-facing API. |
| Replace `JSON.stringify(next.quote) !== JSON.stringify(payment.value.quote)`? | Wrap it in a named `isSameQuote()` with a comment. Don't change the comparison. | Zod emits keys in schema order, so the comparison is structural. A field-by-field rewrite gains nothing and risks drift. |
| Remove the controller's early stale guard in `accept` (A08)? | **No.** Keep the literal line `if (disposed \|\| gen !== generation.value) return false;` exactly once, with a comment. Do **not** route it through a helper shared with the other stale checks (L174, L180, L190, L250). | It is a readable statement of intent. G5 accepted the survivor only as redundant, not as removable. If a shared helper carried the anchor, the A08 mutation would disable every stale check: a different defect, and the expected audit result would change. |
| Change the 250 ms ticker, its lifecycle or the poll and backoff numbers? | **No.** Name them as constants only. | Contract values. T06, T07, T09 and T15 depend on them. The efficiency gain would be negligible. |
| Move CSS into components (`<style scoped>`)? | **No** (optional O-4 only). | It changes specificity, so pixel-identical results are hard to guarantee. |
| Lazy-load `qrcode` or switch to `zod/mini`? | **No** by default (O-2, O-3). | It changes async timing and the code shape around mutation anchors. Bundle size is not a stated problem. |
