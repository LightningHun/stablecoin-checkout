import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mutations } from "../../tests/audit/mutations";

const root = new URL("../../", import.meta.url);
for (const mutation of mutations) {
  const source = readFileSync(
    fileURLToPath(new URL(mutation.file, root)),
    "utf8",
  );
  for (const { before } of mutation.patches) {
    const count = source.split(before).length - 1;
    if (count !== 1)
      throw new Error(
        `${mutation.id}: expected one anchor in ${mutation.file}, found ${count}`,
      );
  }
}
console.log("OK");
