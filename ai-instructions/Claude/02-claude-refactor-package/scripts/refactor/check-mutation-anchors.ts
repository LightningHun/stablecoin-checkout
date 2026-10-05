/**
 * Refactor guard for the G5 mutation audit.
 *
 * `npm run test:mutation` injects each defect in tests/audit/mutations.ts by
 * replacing an exact `before` string that must occur exactly once in its
 * target file. A refactor that renames, reformats or moves that text silently
 * disables the audit (the runner aborts with "expected one patch location").
 *
 * Run from anywhere after every refactor step:
 *   npx tsx scripts/refactor/check-mutation-anchors.ts
 *
 * Exit 0: every patch applies to exactly one location.
 * Exit 1: the listed anchors must be re-pointed in tests/audit/mutations.ts so
 *         that each mutation still injects the SAME semantic defect.
 * This checks applicability only; semantic equivalence needs human/agent review.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mutations } from "../../tests/audit/mutations";

const root = fileURLToPath(new URL("../..", import.meta.url));
const problems: string[] = [];
let anchorCount = 0;

for (const mutation of mutations) {
  const target = resolve(root, mutation.file);
  if (!existsSync(target)) {
    problems.push(`${mutation.id}: target file missing: ${mutation.file}`);
    continue;
  }
  if (!existsSync(resolve(root, mutation.testFile)))
    problems.push(
      `${mutation.id}: detecting test file missing: ${mutation.testFile}`,
    );

  // Apply patches in sequence exactly like tests/audit/run.ts does.
  let text = readFileSync(target, "utf8");
  mutation.patches.forEach((patch, index) => {
    anchorCount++;
    const matches = text.split(patch.before).length - 1;
    if (matches === 1) {
      text = text.replace(patch.before, patch.after);
      return;
    }
    const label = `${mutation.id} patch ${index + 1}/${mutation.patches.length}`;
    const preview = patch.before.split("\n")[0]!.trim().slice(0, 70);
    problems.push(
      `${label} (${mutation.file}): expected 1 match, found ${matches} -> "${preview}"`,
    );
  });
}

if (problems.length) {
  console.error(`Mutation anchors broken (${problems.length}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    "Update tests/audit/mutations.ts so each mutation injects the same defect into the refactored code.",
  );
  process.exit(1);
}
console.log(
  `OK: ${mutations.length} mutations, ${anchorCount} patch anchors each match exactly once.`,
);
