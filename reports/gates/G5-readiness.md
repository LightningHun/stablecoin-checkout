# G5 readiness evidence — formal gate pending

This is tooling readiness evidence, not G5 approval. The coordinator has not supplied final G3/G3A/G4 clearance. Every formal G5 observation must be rerun on the final frozen candidate and its reviewed suite.

- Reviewer: independent G5 auditor, session `/root/g5_auditor`; authored no production implementation or repairs.
- Archived development candidate: `1e8a976367e38931be57747a069e12e10f98260f`.
- Candidate source hash: `27f360bd26d6b390a3ee23601bda668abffd5580a4f2ef1c5af3b5a079337211`.
- Archived suite hash: `40675b4544f958a0499059b35b1e65efb56b3ece7485b652d916f4fd0ae2f478`; supplemental audit-policy cases were explicitly overlaid for readiness, so this is not the final acceptance suite identity.
- Fixture hash: `b5227f41596792aff25f668c3e177454ff7689ca44deab9a863611e9f1675e93`.
- Design PDF/spec hash: `d59bc47df06f3f1d3e95c73f8c73b88a7f6fed15f03ba1265db38eea0ec665a5`.
- Environment: macOS arm64, Node 22.19.0, dependencies matching archived package-lock hash `bca84ae9f99174016687c1f52674da0b74adc06797a5376816bd1fab7b450c2c`.

## Added tooling and expectations

`tests/audit/run.ts` archives the requested Git commit into a disposable directory, uses a separate local browser port, never changes production root files, and records per-defect baseline, unified patch/hash, intended assertion, JSON/log output hashes, restoration, and final baseline. Formal mode requires a G4 evidence file and tooling bytes matching the candidate. Partial/preflight runs cannot constitute gate approval. The runner never updates visual snapshots.

`tests/audit/mutations.ts` specifies M01-M12, VM01-VM02 and nine additional automated mutations across money, reducer, quote policy, controller and QR generation. The terminal-polling defect removes both terminal guards because either guard independently prevents the prohibited GET; these two edits represent one behavioral defect.

`tests/unit/audit-policy.test.ts` independently checks reference identity without a prior snapshot, decreasing confirmations and server-expiry regression after observed funds. `tests/acceptance/audit-transfer.spec.ts` independently decodes a replacement Ethereum QR. These files must be committed and join the frozen ordinary G4 unit/browser suites.

## Actual commands and evidence

All commands ran at the project root. The mutation command needed approved escalation because sandbox IPC/listener creation was unavailable; this was not counted as a test result. Each summary includes the exact spawned commands, exits, source and artifact hashes.

| Command | Exit | Evidence / result |
| --- | --- | --- |
| `npm run typecheck` | 0 | Full current TypeScript/SFC typecheck; repeated after tooling additions. |
| `npx eslint tests/audit tests/unit/audit-policy.test.ts tests/acceptance/audit-transfer.spec.ts` | 0 | Auditor-owned additions. |
| `npm run test:mutation -- --preflight --candidate 1e8a976367e38931be57747a069e12e10f98260f --ids M01,M02,M03,M04,M05,M06,M10,M12,A01,A02,A03,A04,A05,A06,A07,A08` | 1 | `reports/logs/g5/2026-10-01T14-37-40-807Z-69702/summary.json`; all selected mandatory defects and A01-A07 detected; A08 survivor reported below; initial/final 110 tests green. |
| `npm run test:mutation -- --preflight --candidate 1e8a976367e38931be57747a069e12e10f98260f --ids M07,M08,M09,M11,VM01,VM02` | 1 | `reports/logs/g5/2026-10-01T14-38-31-905Z-70376/summary.json`; M07-M09/M11/VM01 detected; VM02 correctly failed the state-action assertion but parser initially did not normalize ANSI formatting; initial/final 110 tests green. |
| `npm run test:mutation -- --preflight --candidate 1e8a976367e38931be57747a069e12e10f98260f --ids A09` | 0 | `reports/logs/g5/2026-10-01T14-39-33-207Z-70983/summary.json`; stale replacement QR detected by independent decoding; restored green. |
| `npm run test:mutation -- --preflight --candidate 1e8a976367e38931be57747a069e12e10f98260f --ids VM02` | 0 | `reports/logs/g5/2026-10-01T14-40-12-382Z-71281/summary.json`; unchanged defect/test after parser normalization, intended enabled Continue-button assertion detected; restored green. |

All 14 required defects produced their intended assertion failure. VM01 failed the explicit 390px address-below-QR layout comparison; VM02 failed enabled-action count 0 versus 1, not merely a screenshot difference. Every tracked archived source byte was restored and every final unit/component/HTTP baseline passed. Raw failure reports preserve assertion code locations; compiler errors and harness failures were never accepted as kills.

## Test-source audit and survivor triage

The independently authored fixtures contain literal amounts, addresses and network metadata. Assertions do not compute expected money with production money helpers. HTTP contract tests exercise the real mock server on an ephemeral port; browser stubs isolate race/UI scenarios. These are complementary, not substitutes for integrated G3A and demo-control checks. Source review found no explicit skipped tests, swallowed assertion failures or self-comparison assertions in the inspected unit/component/contract/acceptance files. Parameterized conditional assertions correspond to fixed state or viewport inputs.

The earlier T03 replacement browser case checked address, amount and clipboard but did not decode the replacement QR despite its title. A stale QR could therefore escape that case while initial T04 QR decoding still passed. The added acceptance case closes this gap and A09 demonstrates meaningful red behavior.

A08 disables the controller's early disposed/generation guard in `accept`. It survived the disposal test because disposal increments the generation, `acceptSnapshot` independently rejects the mismatch, and the enclosing catch ignores the result after disposal. For this mutation's externally observable payment effect this is a redundant guard, not an untested acceptance of stale funds. The rationale must be rechecked against the final candidate; this preflight does not waive a future non-equivalent survivor.

G3A visual baseline provenance is still pending. The auditor has not approved snapshots against the PDF; VM01 uses the contract's explicit responsive geometry and VM02 uses state/action semantics. No formal visual or G5 signoff is inferred from these readiness runs. Changes to implementation/tests after the archived commit invalidate corresponding formal claims and may require patch-anchor updates, without changing any M/T/D expectation.
