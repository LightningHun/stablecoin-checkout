# G3A independent implementation verification

- gate_id: G3A
- verdict: **pass**
- candidate kind: git-commit
- candidate: `3b7a43ad4f4bd74a4dce8387876db8e977e6a2b6`
- reviewer: `/root/g3a_implementation`, a fresh session that neither implemented nor G3-code-reviewed the candidate. Reviewer writes were limited to reports, generated evidence and external review harnesses; no tracked candidate input was edited.
- prerequisite: G3 clearance in `G3-final-addendum.md`, independently read before signoff.
- clean source: `tmp/g3a-3b7a43a`, produced by `git archive 3b7a43ad4f4bd74a4dce8387876db8e977e6a2b6 | tar -x -C tmp/g3a-3b7a43a`. Every tracked file was then compared byte-for-byte with `git show <candidate>:<path>`; **zero differences**. The archive is a clean source checkout, not a second Git repository. Reviewer-only config/harness files and generated outputs were excluded from candidate fingerprints.
- runtime: Node `v22.19.0`, npm `10.9.3`, macOS arm64, Chromium through Playwright 1.63.0; explicit Node 22 PATH used.
- scope: R01-R15, R23, implementation provenance under R25, R26, R27 and R28. R16-R22, R24 final audit/delivery conclusions, README deferral and full submission compliance remain later-gate matters.

## Candidate and evidence identity

Independently recomputed hashes match the coordinator's fixed candidate. Full file manifest: `reports/manifests/g3a-candidate.json`.

| Input | SHA-256 |
| --- | --- |
| Application/configuration/lockfile | `2af8c975a57298f7f9165c9dc6b52c6eb836b67ac1937e7fb08272176481513e` |
| Acceptance/unit/component suite | `23825e5551be3a3f334bb9a1eaab3dd9c3d0ee3ed7e3f62968a9bb7f994cefa3` |
| Fixtures | `fe6dc02a603632cf754c453c24bd865735d9cf01c879e2e14118e0595d426dbb` |
| Design PDF/spec | `2f57558eb340aeafd948dfc1ff5043085ff03f5dbb1519aadc5aed72c562624b` |
| 24 approved baseline filename/hash pairs | `b5c217d884f66862d8589f866885b8b8548a402d27b0d9230c329b5213b62dfb` |

The baseline aggregate hashes JSON of sorted `[filename, sha256]` pairs. Individual baseline and reference-render hashes are in `reports/manifests/g3a-approved-visuals.json` and the design comparison report. Other screenshots, traces, logs, built assets and reviewer harnesses are fingerprinted in `reports/manifests/g3a-artifacts.json`.

| Primary artifact | SHA-256 |
| --- | --- |
| Real API/UI observation JSON | `6dc439edcd4a1c21a03ebd6a99385db773eaf153f68cc194b73d92fb6b875a90` |
| Independent race observation JSON | `a1112679def7d17584f6c97bb3ca83694c978a8460167283fede04103d60d17b` |
| Real API/UI browser trace | `0d9b65070b51a028b459ec037b16fed238341af88bc33c006f9ee074b03ab428` |
| Independent race trace | `05331f242e94a7867fb3ed4b6be2da802771ad95cb50ce71809f132c451575ee` |
| No-update visual repeat log | `a0faf008792cd80ea0f0a972aa20a66a24e9d762968d26edada81d153fc19492` |
| Built `index-EIre3BXl.js` | `f0159ea512ba569b6e74d928e1388b50155357389aaa3016d899423829429050` |
| Built `index-BEqS4xZz.css` | `9361711391f7d46432956582a61d75af23576bc36544cdce7079b6bff169936c` |
| Original design PDF | `95264e90046043bc00ecb3ad54ed3ed3bce6444f41832ad2813a2878a9fd327e` |

## Executed commands

Commands below ran inside the clean final checkout, with `PATH=/Users/joshua/.nvm/versions/node/v22.19.0/bin:$PATH`. Logs are in the root repository's reports directory. These are G3A observations/supporting checks, not a claim that G4 or G5 has run.

| Command | Exit / observed result | Evidence |
| --- | --- | --- |
| `npm ci` | 0; lockfile installation | `reports/logs/g3a-final-npm-ci.log` |
| `npm run build` | 0; production Vite bundle | `reports/logs/g3a-final-build.log`; clean-copy `dist/` |
| `MOCK_PORT=8788 npm run preview` | Served built app on 4173 with `/api` proxied to mock 8788; clean shutdown exit 0 | Tool session 64611; observation trace below |
| `node g3a-observe.mjs` | 0; independent real HTTP/UI/clipboard/QR, state, clock and delay observations | `reports/logs/g3a-final-observations.log`, `reports/manifests/g3a-observations.json`, `reports/traces/g3a-built-observations.zip`, `reports/screenshots/g3a/` |
| `node g3a-races.mjs` | 0; prior GET delivered after replacement did not alter accepted new quote | `reports/logs/g3a-final-race.log`, `reports/manifests/g3a-race.json`, `reports/traces/g3a-race.zip` |
| `node node_modules/@playwright/test/cli.js test --config g3a.config.ts --grep @visual --update-snapshots` | 0; 24 captures created for independent PDF comparison | `reports/logs/g3a-final-visual-capture.log` |
| Same visual command without `--update-snapshots` | 0; 24/24 matched the independently inspected baselines | `reports/logs/g3a-final-visual-repeat.log` |
| `npm run test:unit` | 0; 73/73 | `reports/logs/g3a-final-unit.log` |
| `npm run test:component` | 0; 27/27 | `reports/logs/g3a-final-component.log` |
| `npm run test:contract` | 0; 21/21 real HTTP checks | `reports/logs/g3a-final-contract.log` |

The reviewer config changes only runner settings: built preview base URL 4173, no development-server launch, output directory and explicit Chromium/DPR 1 viewport configuration. It uses the committed test files and unchanged assertions. Local serving initially failed in the sandbox on the earlier candidate's tsx IPC socket (`EPERM`); the same preview command succeeded after the required tool escalation. That failed launch was not counted as a pass.

## Integrated observations

The reviewer-authored real-API harness independently asserted the six catalogue tuples, selected every pair in the built UI, read the accepted server snapshot, decoded each rendered QR through jsQR, and read the system clipboard. The six expected addresses were independent literal values. All tokens, networks, amounts, addresses, decoded QR values and clipboard values agreed. ETH retained `3.261234567890123456`; EUR displayed as `€149.90` and `149,90 €` in the two locales. Each unexpired requote returned HTTP 409 with `application/problem+json`; real HTTP tests separately checked 200/201 methods and successful same-reference requote.

Every API state was forced through the real HTTP controls and observed in the built page. Detected displayed zero confirmations and removed transfer actions; underpaid displayed only `43.69`, the original canonical address and no countdown; overpaid displayed `180.00` received and `16.31` excess without a refund promise; failed exposed its actual reason/reference without inventing a received transfer. Paid, overpaid, expired and failed stop polling. Real-scenario state screenshots and full accepted snapshots are retained.

At the user's requested 15-second TTL, the live browser displayed `00:15`, then server-confirmed expired after **15,408 ms**, removed transfer controls and offered recovery. A double click issued one requote POST, retained `AQH-100306-PMT`, and restored a new quote. In a separate live run, detected remained detected at `2026-10-01T14:55:46.632Z`, after its original `14:55:45.732Z` deadline, while GETs returned HTTP 500. No expired or requote action appeared. Confirming and underpaid also survived a controlled server-clock advance beyond a 15-second deadline. No actual 15-minute wait was used.

A real 5-second slow Polygon creation exposed only the selected pair and skeleton until acceptance; the usable quote appeared after **5,447 ms**. A delayed GET plus coalesced focus/visibility triggers recorded `maxActiveGets: 1`. The independent stale-response probe held an old Tron GET, changed to Ethereum, observed the abort, then delivered an old detected payload after the new quote had been accepted. The UI retained awaiting_payment, the new reference `AQH-100307-PMT`, Ethereum, `167.19`, the Ethereum address and matching clipboard. Old detected UI did not appear. Unit/component evidence additionally covers same-reference generation rejection, monotonic/server-clock boundaries and skew, idempotence, scope cleanup, terminal polling, 409 reconciliation, timeout, protocol failures and the corrected backoff sequence.

The preliminary built-browser run on `848c8845` passed 38 cases, including keyboard use, 320/390/768/1280/1440 widths, 200% CSS zoom, clipboard denial, uncertain creation, malformed JSON and evaluator faults (`reports/logs/g3a-built-browser.log`). This is retained as historical supporting evidence, not mislabelled as a final-candidate run. The final application delta is only the backoff formula; the final reviewer harness, visual captures and unit/component/HTTP checks above were rerun on `3b7a43a`. Formal complete-suite repetition belongs to G4.

## Findings and disposition

- **Resolved harness finding, R28:** the earlier visual test waited for a status container that was already visible before creation. D11 desktop failed to reach its alert, and awaiting capture time varied. The independent test designer added accepted-state and loaded-QR preconditions without changing the source oracle; the revised candidate captured 24/24 and repeated 24/24 without baseline updates. Earlier failed evidence remains in `reports/logs/g3a-visual-capture.log` and `reports/g3a-visual-results/` history where retained.
- **Minor presentation notes, R28:** the terminal connector continues below the last marker, some waiting text is heavier, and receipt fields use additional rows. The narrow column, responsive arrangement, state markers, receipt region and facts remain intact; there is no clipping or lost region. These are recorded visual differences, not a waiver of an absent required feature. Detailed decisions are in `reports/design-comparison.md`.
- **No unresolved critical/major implementation finding.** No unsupported custody/refund/late-monitoring claims, phantom provider links, real wallet/chain integration, runtime AI or persistence were observed.

Requirement-by-requirement code and observed-evidence mapping is in `reports/requirement-traceability.md`. This pass is limited to the identified application and evidence; baseline-only/report commits can inherit it only after an explicit unchanged-application check. G4 behavior testing, G5 mutation effectiveness and G6 documentation/history delivery are not approved here.

## Baseline delivery carry-forward

Independently inspected the diff to `49018863d317cce6adf837c832d8823419002b71`. It adds the 24 approved PNGs and changes only reports, plan/run documentation and `.gitignore`; no application, fixture, design contract or test-source file changed. All 24 committed PNG bytes match the reviewed captures. Application, fixture and design hashes above remain identical. The suite hash now includes those approved baseline files and is `6e253a4b3827245675fe0db4132648e30d338482da13de8c91a85585247bddd5`.

**G3A pass carries forward to 49018863d317cce6adf837c832d8823419002b71.** Full independently calculated evidence is in `reports/manifests/g3a-carry-forward.json`. G4 may execute on this candidate; this acknowledgement does not pre-approve its results.
