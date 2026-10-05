# Kickoff prompt for Claude Code

## Before you start (once, in a terminal at the project root)

```bash
mkdir -p .claude/agents
cp docs/refactor/claude-config/agents/refactor-reviewer.md .claude/agents/
cp docs/refactor/claude-config/settings.json .claude/settings.json
```

This installs the independent `refactor-reviewer` subagent and a deny list. The deny list blocks all Git writes (add, commit, branch switching, restore, reset, stash, push, …) and snapshot updates. Then open this folder in Claude Code and paste the prompt below as your first message.

This prompt uses **no-commit mode**: Claude only edits files, and you review and commit them yourself. To let Claude commit instead, see REFACTOR_GUIDE.md §8 "If the user later switches to commit mode".

---

```text
Read CLAUDE.md, then docs/refactor/REFACTOR_GUIDE.md, BEHAVIOR_CONTRACT.md, CODEBASE_MAP.md,
REFACTOR_PLAN.md and VERIFICATION.md in full before changing anything. The original build
specification is in Git (git show HEAD:docs/ARCHITECTURE.md, HEAD:docs/API_CONTRACT.md,
HEAD:docs/DESIGN_SPEC.md, HEAD:AGENTS.md); read the parts the plan points to.

Goal: refactor this Vue 3 / TypeScript / Vite stablecoin checkout and its mock HTTP API
for readability, simplicity and efficiency with zero change in behavior. Behavior means
everything in BEHAVIOR_CONTRACT.md: safety invariants, HTTP contract, rendered DOM/text/
ARIA/layout, timing constants, error copy, test-facing exports and mutation-audit
effectiveness.

Authorization for this session:
- NO-COMMIT MODE: edit files in place only. Do not run any Git write command (no add,
  commit, branch creation, switch, checkout, restore, reset, stash, rebase, merge, push
  or worktree). I will review the uncommitted changes and commit them myself.
- Before each step, back up its files with scripts/refactor/step-backup.sh; undo a step
  only with "step-backup.sh restore", never with git restore or checkout.
- Do not edit existing tests, visual snapshots, the DOM baseline or tracked historical
  reports. You may add new tests and re-point tests/audit/mutations.ts anchors as
  VERIFICATION.md §5 describes.
- Do not add, remove or upgrade dependencies. Optional steps O-1..O-6 need my approval.

Process:
1. Execute RF-00 exactly. If the baseline is not green, or source/test/config files differ
   from HEAD, stop and report before editing.
2. Work through RF-01..RF-23 in order. For each step: back up its files, write the
   equivalence argument in reports/refactor/REFACTOR_LOG.md, make the smallest edit, run
   the step's check level, run the mutation-anchor checker, get a refactor-reviewer
   subagent PASS (on "step-backup.sh diff RF-xx") for every risk-C step, then log the
   changed files, commands, exit codes and counts.
3. Run the L3 phase gate at the end of every phase. The mutation preflight needs a commit,
   so skip it after RF-00 and rely on the anchor checker. Then STOP and report the phase
   to me (changed/new files, one line per step, check results) and wait for "continue".
4. If a step cannot be made provably equivalent after three attempts, restore it with
   step-backup.sh, log why, and continue with the next independent step. Never weaken a
   test or re-baseline anything to get green.
5. Finish with RF-99 (L4 in the working tree, preview smoke test, final reviewer pass) and
   write reports/refactor/SUMMARY.md. Tell me the mutation audit is the remaining check
   to run after I commit.

Ask me before any change that would alter user-visible text, layout, timing, HTTP
behavior or a test, and when you find what looks like a real bug: record it, don't fix it
inside the refactor.

Final report (in English):
- Steps done, skipped or reverted.
- Per-file before/after line counts and the main simplifications.
- Bundle sizes.
- Every verification command with its exit code and counts.
- The baseline mutation audit result and the re-pointed mutation IDs awaiting the post-commit audit.
- Platform limits.
- Decisions you need from me.
```

---

## Shorter variants

- **Report in Korean.** Add at the end: "Report to me in Korean."
- **Single phase.** Replace process step 2 with: "Work through Phase 3 (RF-10..RF-14) only, then stop after its L3 gate and report."
- **After you have committed the reviewed changes:** "Run the full mutation audit: npm run test:mutation -- --candidate HEAD --preflight, compare with the RF-00 baseline (22 detected + A08 survived) and add the result to reports/refactor/SUMMARY.md."
- **Review only, no edits.** "Read the refactor docs and produce a concrete diff proposal for RF-13 in reports/refactor/RF-13-proposal.md without changing any source file."
