# Test-effectiveness evidence

Formal G5 candidate `49018863d317cce6adf837c832d8823419002b71`; auditor `/root/g5_auditor`. **Pass after scoped A08 survivor review**. Raw command exit was **1**, deliberately retained because the runner cannot approve its own survivor. See [G5 gate](gates/G5.md) for scope, canonical hashes, prerequisites, provenance and limitations.

Execution directory: `reports/logs/g5/2026-10-01T15-07-55-246Z-79167`. Each case below has three commands in its baseline/mutated/restored JSON/log files; their exact argument arrays, timestamps, exits, assertions, file paths and SHA-256 values are preserved in `summary.json`. The detecting-test CLI selects only the named case; unrelated cases marked skipped by that explicit filter are not hidden skips in the ordinary suite. Initial and final complete Vitest baselines each ran 121/121 with no failed or skipped cases.

## Mandatory defect observations

| ID / coverage | Expected safety assertion and actual defect observation | Baseline / mutated / restored exit | Intended failure |
| --- | --- | --- | --- |
| M01 — R06, T08 | Detected became local-deadline-reached after the original deadline; T08 rejected it. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M02 — R05, T06 | Remaining time was 899000ms rather than the independent 780000ms expectation after a two-minute jump. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M03 — R07, T09 | Four GET calls occurred while one was pending; expected exactly one. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M04 — R07, T10 | Terminal paid scheduled 16 total GET calls rather than retaining the original single call. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M05 — R03, R07, T03, T10 | An old-generation paid snapshot was accepted instead of null. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M06 — R13, T05 | ETH parsed as 1123456789012345728n rather than 1123456789012345678n. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M07 — R03, R04, T03, T04 | Clipboard returned the previous Tron address instead of the accepted 0x2222…2222 Ethereum address. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M08 — R09, T12 | Rendered transfer amount was 163.69USDT instead of only 43.69USDT outstanding. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M09 — R09, T13 | The forbidden “will be refunded automatically” promise appeared in main. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M10 — R06, R10, T08, T14 | Requote POST was called once after reconciliation was removed; expected no POST when funds arrived. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M11 — R11, T15 | HTTP 500 changed the visible money-arrived state to Payment failed / http 500. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| M12 — R10, R12, T14, T16 | Requote returned AQH-100307-PMT rather than preserving AQH-100306-PMT. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| VM01 — R28, D03, T18 | At 390px width, address y=671.671875 was above the required QR bottom y=945.671875. | 0 / 1 / 0 | Yes; restored bytes and green rerun |
| VM02 — R06, R28, D04, T08 | One enabled Continue action was present in detected; expected zero permitted transfer actions. | 0 / 1 / 0 | Yes; restored bytes and green rerun |

## Additional targeted analysis

This automated set targets exact money operations, the payment reducer, quote availability and the single controller; the QR case extends the seeded browser safety audit. Mutation declarations are original audit code in `tests/audit/mutations.ts`. No percentage is used in place of required detections.

| ID / target | Actual observation / disposition | Baseline / mutated / restored exit |
| --- | --- | --- |
| A01 — `src/features/checkout/domain/money.ts` | Addition yielded 161.69 instead of 163.69. | 0 / 1 / 0 |
| A02 — `src/features/checkout/domain/money.ts` | Subtraction yielded 283.69 instead of 43.69. | 0 / 1 / 0 |
| A03 — `src/features/checkout/domain/paymentModel.ts` | A mismatched expected reference with no previous snapshot was accepted instead of null. | 0 / 1 / 0 |
| A04 — `src/features/checkout/domain/paymentModel.ts` | Observed detected funds regressed to awaiting_payment instead of rejecting the snapshot. | 0 / 1 / 0 |
| A05 — `src/features/checkout/domain/paymentModel.ts` | Confirmations decreased from 2 to 1 instead of rejecting the snapshot. | 0 / 1 / 0 |
| A06 — `src/features/checkout/domain/quotePolicy.ts` | Blocked reconciliation exposed usable controls instead of reconciling. | 0 / 1 / 0 |
| A07 — `src/features/checkout/domain/quotePolicy.ts` | Underpaid lost usable outstanding-transfer controls. | 0 / 1 / 0 |
| A08 — `src/features/checkout/application/usePaymentController.ts` | Survived: the unchanged reducer still rejected the invalidated generation; accepted payment, aborted request and timer assertions remained green. | 0 / 0 / 0 |
| A09 — `src/features/checkout/components/QuoteDetails.vue` | Independent QR decoder recovered the previous Tron address instead of the accepted Ethereum address. | 0 / 1 / 0 |

A08 is redundant for the nominated accepted-payment and timer behavior: `usePaymentController.ts:338` invalidates generation during disposal; `paymentModel.ts:121` rejects old generations before any snapshot is returned; `usePaymentController.ts:173` and `:178` suppress late polling error/scheduling work. No payment or timer change is possible through that mutant path. The extra rejected-snapshot step is internally different, so the conclusion is deliberately scoped to those externally relevant safety assertions. The original early return remains intact. M05 removes the actual reducer generation guard and fails, demonstrating that stale-generation protection itself is covered.

The initial replacement test independently checked clipboard/address but not the changed QR. During readiness, the auditor added `audit-transfer.spec.ts` before freeze, independently decoded the new QR using jsQR, and proved A09 red. This repaired the test coverage gap without altering the implementation or expected source address. The test and all supplementary reducer checks were included in the G4 frozen suite.

## Detecting tests and patch identity

Every mutation is one behavioral defect in a disposable archive. M04 must disable both scheduling and polling terminal checks to produce the one prohibited after-terminal GET behavior; neither single redundant check alone would do so.

| ID | Test file and exact selected title | Unified patch SHA-256 |
| --- | --- | --- |
| M01 | `tests/component/controller.test.ts` — T08 funds in detected survive deadline and HTTP 500 | `24a6cc2fbc9df033a0d51e4fdcb521dce3583769796f47e187d63895ab43ec93` |
| M02 | `tests/unit/clock.test.ts` — uses elapsed time after a coalesced two-minute suspension | `4d90d7c2bc184df727b14f466f8b62992e6b1bae6629da75af52d3529b9a6e4e` |
| M03 | `tests/component/controller.test.ts` — T09 slow GET and simultaneous focus/retry events keep maximum active GET at one | `85c0fbfa7f583f1027140ba1a71b9b5683370e43e6786dc8048e0874d40cbf9d` |
| M04 | `tests/component/controller.test.ts` — T10 terminal paid does not schedule another poll | `c75bceb99734bb12cdd93e27f4ef40c1b8d2e03b080e81b816a4b6a097fb7359` |
| M05 | `tests/unit/policy.test.ts` — T10 rejects old references and same-reference old generations | `54d2c2a2a5ea0a27ae1082798580a2cfc91ea01dd7e90e7dcf0fde3a307614b5` |
| M06 | `tests/unit/money.test.ts` — preserves the smallest ETH unit and every digit of a long ETH amount | `d74bed0dfc1db62b14bcbfecb15136497b4c41fa92d46a0cf41b68f12ea077bb` |
| M07 | `tests/acceptance/transport.spec.ts` — T03 accepted replacement never mixes token network amount QR or clipboard | `48a4edab07b7fe585977baf7493479e3984571cc5ca53e34c45c643d7e1909a3` |
| M08 | `tests/acceptance/checkout.spec.ts` — T12 underpaid sends only the outstanding amount and duplicate delivery is idempotent | `4017d211ef66b8ca3017c373aa9ed8403e819d108ac0903bf1ee2eb6b9458ecf` |
| M09 | `tests/acceptance/checkout.spec.ts` — T13 overpaid exposes exact facts without an automatic refund or another send | `7254351fc98cc882ef85bb2919ac95380d9777ed034f3a1affb0b93d9535f25b` |
| M10 | `tests/component/controller.test.ts` — T08/T14 M10 reconciliation observes detected funds before attempting a requote | `c0112ee35b621055f0881057f0106f194e7b1495699aa043b012a31de45e2c3c` |
| M11 | `tests/acceptance/checkout.spec.ts` — T15 transport failure keeps known funds instead of inventing payment failed | `ab5fb60aba982de0791f216acd51a1c73df496466cd80d6e78bfd27033e96d8b` |
| M12 | `tests/contract/http.test.ts` — T14 M12 server-confirmed expiry requotes with the same reference | `064e31dc604443fef63a13d3ae83fce3c474b10f21f019fc79e32d79e92aa44e` |
| VM01 | `tests/acceptance/checkout.spec.ts` — T18 responsive 390px and VM01 QR arrangement | `09b43e1902cbae562adab41ffbde9d4e252871062a787fd634a097726ccad05e` |
| VM02 | `tests/acceptance/checkout.spec.ts` — T08 VM02 detected removes every transfer action and survives deadline plus HTTP 500 | `5ecf1a5e10fc227726f9c251d01b9e2500ca8ec573c6ab5d50cdbae209304586` |
| A01 | `tests/unit/money.test.ts` — keeps the source amounts exact with independently specified results | `9ade97a83d283c1c426b42097d86ae255170d1400ce6f33dc03f672aac0e7ac0` |
| A02 | `tests/unit/money.test.ts` — keeps the source amounts exact with independently specified results | `8f331c27e06d9c29f278e54325a9d6efaf2dbec5a7690aa73ab4b64c4e3be356` |
| A03 | `tests/unit/audit-policy.test.ts` — T10 expected reference is checked even without a previous snapshot | `847ab08c160999ac09b0c3e6d5d9378543a98751c456e63285b27c56667caa31` |
| A04 | `tests/unit/policy.test.ts` — rejects regressive payment snapshots after funds are observed | `74c16696c5ad69b61ce2568af44d8344ba0b61293c62a54dd4e707f1aca1521d` |
| A05 | `tests/unit/audit-policy.test.ts` — T10 confirmations cannot decrease within the same quote | `a671444c355031be8a4e639857bd448623bff9c37fae7fbf27f250b4d40defc6` |
| A06 | `tests/unit/policy.test.ts` — server expiry and blocked reconciliation remain distinct | `d38419f139148b80ce701188785c62108e2446d459a951c8abf44ac7fa8a0fc4` |
| A07 | `tests/unit/policy.test.ts` — T08 underpaid never becomes expired by local time | `ed9652ddcb3f1df90c0fb59e1c58c9256f81a7e75e7a89702f5c0e16e88b64fd` |
| A08 | `tests/component/controller.test.ts` — T09 scope disposal aborts in-flight GET and late finally cannot restart timers | `c11bebd193c0ca0bb74843d375ba23e8cb46ac2e1034c9962eb3b2e89747287d` |
| A09 | `tests/acceptance/audit-transfer.spec.ts` — T03/T04 replacement QR independently decodes to the accepted Ethereum address | `c91a461faef9aa3e359ba5c5d52c612b35904066db2676415ebebc968df98480` |

## Per-phase log identity

Raw JSON additionally records failure stacks, trace/screenshot locations and source-before/source-mutated hashes. Unified patches and corresponding original/changed files are local artifacts. Full artifact inventory: `reports/manifests/g5-artifacts.json`.

| ID | Baseline log SHA-256 | Mutated log SHA-256 | Restored log SHA-256 |
| --- | --- | --- | --- |
| M01 | `9241674eb74b6900181d426e493189a581f6437770fc4021ad92a32405668bf1` | `8e3ec3289cce2229d104ee669d52ab123b9cd2bbeacc7a8970a31298c88985ce` | `cd2041816f1b6ecba7ea6d88a6b187889b161803e8b01937bddfaedb8978d6e2` |
| M02 | `9cb483f27287b820ca059b24bc8999b67e63a8a26030dd1228a90877f36ea7d3` | `857a221a167cbfc898ab7ca8efe3ae1ff0cb9099648d7f4cf2364713409bf027` | `0274f61d638b17c492127a4af1366c48b0c78f872f45389a52eb424e377a7fda` |
| M03 | `14f23da2fc41483e2ad01dbefd5875631a3713752937efe4212694be158944eb` | `cac05b60479460d1b91789eb7de41974402674aeeb7acdd25b5ebd6ab53ac33f` | `448038fd83b206ddd8bb743532383bbcf5a4d72f53740bd58d1d7e11f792e272` |
| M04 | `9ad99b4a7c93b6dab2f1a32212f3527f1e03028ee2b5f1f4f809115035f640af` | `882356a7f72eddabd252cb09520c9a3b8ffd00e2fac4abad255d3d7848bc4f1d` | `db68c97f0862b12b07c9a41cc879355ace93f1f8e22dc42ef2e4f678a15a0d17` |
| M05 | `4736511f4f0811033485a9e8d7e19f15e5b185281d93a8c8a7f72462c2082cad` | `0cad0bc8ea1e472762a5b5f7d255a18fe8706a20238dd4fd6409a023f763b185` | `ecf08b3f6b89b7533857fd83f81855611f11641652acad14205b731d3dd1fff6` |
| M06 | `834fa0d4f8f0d5896a7c2276541efb1dda90933b071da0577e1120650995d1a4` | `a348978d63c7878e99fc053614b259d4bbe575e2f75ad54a2aaf120cd35109af` | `6ed357d8914a763c7f54e14c84ecedcecb9bcaad8210212c1067cbf1602421ec` |
| M07 | `5a2736601496a70ba0511aba2959d6f951e4f96015ad7ced2141eb6e39530c2e` | `680108c4e1bf96014587ca30dbbbf55a928a2622429f0fa91b9cbdb486b2e061` | `d98ce804920d0c2b90d26bfdc829990a5eed57c3f372224f57e48f3c27779bcf` |
| M08 | `31af56fc7a41b99e218204cabd1eb94d33956c065c75b4394cfa68946b2251de` | `274a58ec13ddeb2663578d0ea8c3424356c82f564c3c373d6a4c162c5946a692` | `ca076a337eb91f5bb8ac52982c53eba79ba1edb8f8432341cbb65f1104b7cc12` |
| M09 | `b027edf0bf202e8d8babb051b3caa51e1560e87f7278a0ad35adbb4ccc160dae` | `254307f4503cbb4849beab755ec991a93afed95753016d0ccfd6f63b1e587f3b` | `f2b247af3fd55c0df3845155b7ff038c45fe22966af7574010f9929a4cf166f6` |
| M10 | `a14170f26c20fb2dc31ac45f58dcbff2fa38b2d2b876057a8bdee3b7cf3c0281` | `cbfa5ac65e2eb257687dd2466cc366b1c62c7a42bb2244996f695571a0f13490` | `4d962bc992bd98f08dae85584ea60c57d62c67f8653d80f04ba930b195bc9504` |
| M11 | `aff6c451890efb9cc4158dbb3427a8691a927c0d5e006ed321348d1cdeb07f5f` | `3afd8d9614fb329f6c6c738db3c6f1ae626e7ea699f43af76199029936a0e560` | `818df2165c3886500ba8ae686715a1d430e24a7e36c84cf1c2b2c097a5be84eb` |
| M12 | `46dabf4e99b2d85c69875e79834952ece723ad10ce99271daf5fc24bcaf2f6a3` | `e66415d0c2a594aa511329686ced16e5335070a9d2d3b1215a5779050d8dfe65` | `8237db6af7b4a998e98118f49fdc2659327800100f931b3752875278e1990b5f` |
| VM01 | `ce334c4eef091805e8d33914a60732dd460ee9594b92b86fb726a023e47045e9` | `d5f37a601d619ed29e62b3530e989fd5e63c20cb5c8ea94ccd1f883673fd2820` | `f58f9915de968aef89068076df2df52e03ec1d199d73311d9b3ac5fd017773c7` |
| VM02 | `6db7a1d02292ebe7acef6d569b5a70b0798729e6211e3024220f48f5a69bf987` | `ede1a76fdddf33e0d4dc262ca90845c917818a0f651f1856a116a9ffb830b50a` | `1468532ceec8f54507161012f5b1ab90a91ec4f37d686fc2e1f56070489ea948` |
| A01 | `03f9b18f176a9e5d7398e5a3802094d63949994f5b74ba6980ee276cf4a83bb0` | `dd9063f7b33f86b40192651d266e2a8ae4c9048618d590919d6ad71ee7fd20ca` | `7c85bbbae5f6ee23a8ed214ae770831b1cfa81531c8632210a521054bec7478d` |
| A02 | `474be7cc54e37bccb979bc746c9324cd64f0a8f3a8f9743620fae25ac30b49e0` | `d586b723cc452ebefa8b2f7e5331f029c8620e3d902339e1fbfb7458a0ade97b` | `10fb9287196f562c7d8f263af7eac9e228e173eb6ce10de2ffa0b56e8db699bf` |
| A03 | `4f3b3c83663c8811c880df5deedb680137ce148ae74d26943fc2064ba9c5cd21` | `f561f166575945ceda60569d69a71fa5cfa0d896d1c823d4a5f1230ccff918a7` | `679fb1ddd762a54dc87557971a9c66b949852621cb690fb3df61466a42fdda55` |
| A04 | `fb3f658a496b44c26eb85717ceea7da0b87ccc5fb589b1fcd499aa72b29ae57c` | `e5ce31496f7cae14e125b2261d8a2dddf88a87b338691cac36ce95fcabf074f7` | `efea9899f11277c01af71c5d1c355d974905730b1693ad3fc41abfc8534fc550` |
| A05 | `45951515f8506972c6e2a826bdc5bd440e510c237a3e76cb0bddc64934e73930` | `3297f509616c1e085a4b15119b5751766162c9eae27fcdb316d102a6a62916b6` | `70bcc5dfc5668e0f65f84f166a974991fc7f409a1ff7378b2fc81c1c6e831d67` |
| A06 | `a80d807be56d2382d79a27038f7d62d6ba07bde6bcbc6dda929d3a5892f3810b` | `f19e9e38b7c0ac871023df685740d5825cae454f27efb673ec972381f2682188` | `18161ff94f8fe4c44d3086e99213a2d82671fbe48323b390430865ea609e75b6` |
| A07 | `5a2e7444f96fb024c313de83cf1d6fe4e3dffdf7614ac16c07fc53bd8301d943` | `0d1a4497d52977532af553fa15f48cd61c4b36ad217affaebd44a17d4c44a3a0` | `bb361fc22ccd3a33652887b3afec6cb648bf5d21848f5158304af79a56902ac7` |
| A08 | `fb381b9edf9102aa5ce7f23839c58052e8d8588b13b1655e0bd9493ca1ab3aa4` | `6d7d8a04e238d81b244b4163f2ac832f3dcdad73d3e4c82394f24ebca15a068a` | `ca62ffc1e50411df0052175eb507b0b096f42b8666ca8b356e9973e829bd2a4b` |
| A09 | `453a7a4cf6ed1b67c3a5c5619df7dca9152d2a5e3e67f37e171307f39bf404d6` | `177a754628a68397fcc63c09bad5ccf133d577880318107fc4b51853ac87ea73` | `f2517f820da3654aa674f742ed722e2ac9684f9f076df8de16b1106fe2bf7e3c` |

Files use the exact naming convention `{evidence-directory}/{ID}-baseline.log`, `{ID}-mutated.log`, `{ID}-restored.log` and `.json`; patches use `{ID}.patch`. This is a path convention for already created artifacts, not planned evidence.

## Test-source review

Inspected the frozen unit, component, HTTP and browser acceptance sources. Literal fixture expectations are independent of production money calculations. Exact decimals, catalogue values, references and addresses are asserted directly. The real HTTP contract suite complements browser route stubs; stubs make races/error delivery controllable without purporting to verify mock routing. Component hosts exercise real lifecycle disposal and clocks. The real background test observes native visibility at 60 and 120 seconds instead of faking hidden state.

No explicit `.skip`, `.fixme`, `.only`, `passWithNoTests`, swallowed assertion exception or self-comparison oracle was found. Conditional assertions in parameterized tests correspond to fixed input states/viewports. Awaited Vue/browser updates, context isolation, scenario resets and ephemeral HTTP servers prevent the inspected cases from relying on prior test order. The mutation parser treats absent reports/runtime errors as harness failure and does not count them as kills. Required assertions and tolerance were never weakened.

The test designer documented a genuine earlier backoff-oracle error and corrected it from `ARCHITECTURE.md`, with independent red evidence, before this candidate (`gates/G2-followup.md`). That correction is distinct from changing an expectation to conceal a defect.

## Visual audit

All 24 committed baselines byte-match independently reviewed G3A captures; all source-render hashes match. The reviewed 1280px/390px references retain full-page natural height, fonts settled and no masks of amount/address/network/status/action/QR. The G5 auditor directly inspected the D03 mobile and D04 desktop reference/capture pairs relevant to VM01/VM02. D01-D12 full independent comparison remains attributed to the separate G3A reviewer, not falsely claimed as a second complete visual inspection.

VM01 fails the explicit address-below-QR assertion, covering the D03/page6 mobile stacking requirement at 390px. VM02 fails enabled-action count zero for D04 detected; a visual difference alone was not accepted. Source-corrected copy/provider/link/date deviations remain those in `docs/DESIGN_SPEC.md`. No G5 snapshots were created or approved, and all existing baseline bytes were verified restored.

## Final restoration

All 107 tracked archived files independently matched the original Git candidate after execution; all phase log, JSON and patch hashes were rechecked. Both complete 121-case baselines passed, and each selected browser baseline/restoration was green. Root production/tests/snapshot files were not modified by the audit. Technical G5 approval does not remove documentation/history deferrals or claim full submission compliance.
