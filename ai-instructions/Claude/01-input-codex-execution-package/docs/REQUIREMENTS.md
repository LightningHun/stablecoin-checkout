# Requirement register

All 28 requirements are planned acceptance targets, not completed work. R01-R23 summarize the user-supplied exercise; R24-R28 include explicit user directions from this project. Source page labels refer to [the selected reformatted brief](reference/stablecoin-checkout-requirement-reformatted.pdf); R28 explicitly references the separate design PDF.

| ID | Source pages | Acceptance target | Evidence IDs |
| --- | --- | --- | --- |
| R01 | 2 | Merchant, order reference and locale-formatted EUR 149.90. | T01 |
| R02 | 2-3 | All six currency/network pairs; exact catalogue fees, precision, confirmations and timing metadata. | T02 |
| R03 | 2 | Changing currency or network fetches a quote; network remains prominent beside transfer details. | T02, T03 |
| R04 | 2,4 | Exact amount, fee, total, rate, address, QR and copy; one coherent quote snapshot. | T04, T05 |
| R05 | 2,7 | Absolute expiry countdown; correct after two background minutes and clock skew. | T06, T07 |
| R06 | 2,4 | Detected means zero confirmations; received funds must not expire locally. | T08 |
| R07 | 2,4-5 | Poll status; stop on terminal states; no overlap, stale updates or leaked work. | T09, T10 |
| R08 | 2,4-5 | All eight specified statuses; distinguish shopper actions from merchant/support issues. | T11 |
| R09 | 2,5 | Underpaid shows outstanding amount; overpaid tells the truth about excess. | T12, T13 |
| R10 | 2,6 | Expiry recovery with same-reference requote; handle 409 problem details. | T14 |
| R11 | 2,6-7 | Network failure, HTTP 500 and slow responses preserve known payment facts. | T15 |
| R12 | 3-6 | Committed mock implements catalogue, creation, status and requote endpoints. | T16 |
| R13 | 3,7 | Decimal strings; six token decimals or eighteen ETH decimals; no money floats. | T05 |
| R14 | 6 | Evaluator can trigger each status, network error and slow response; documented controls. | T17 |
| R15 | 1-2 | Shopper page only; exclude auth, real wallets/chains, dashboard and persistence. | V01 |
| R16 | 6 | Design doc explains lifecycle, components/data, countdown, precision and failures. | V02 |
| R17 | 6 | Design doc ends with the required One thing I would defend section. | V02 |
| R18 | 7 | A few ADRs with context, options, decision and consequences. | V02 |
| R19 | 7 | README covers setup, scenario controls and What I dropped. | V03 |
| R20 | 7 | Working with the agent records three real rejected outputs, a real human improvement and state errors. | V04 |
| R21 | 1,7 | Git repository with genuine incremental history, including real reversals; no manufactured history. | V04 |
| R22 | 1,7 | Committed agent instructions file with practical coding and evidence rules. | V02 |
| R23 | 2,7 | Prioritize safety, recovery and correctness over visual polish or extra features. | V01, T03, T08, T13 |
| R24 | User | Independent stage verifies test effectiveness, and explanation connects claims to evidence. | G5, G6 |
| R25 | User | Original work; no copied submissions, fabricated attribution or invented agent history. | V05 |
| R26 | User | A separate independent stage verifies the integrated implementation before formal testing. | G3A |
| R27 | User | Use Vue 3, TypeScript and Vite for the checkout implementation. | G3, G3A |
| R28 | User + design PDF pages 1-24 | Implement the supplied responsive design across D01-D12, with explicit contract conflict resolutions and independent visual verification. | G3A, G4, D01-D12, VM01-VM02 |

## Ownership and evidence

The requirements analyst owns interpretation; the implementer owns feature delivery. The test designer owns independent T expectations. G3A independently verifies implementation; G5 independently verifies test effectiveness; G6 owns documentation/history delivery checks. See [verification](VERIFICATION.md) for all evidence IDs and [implementation plan](IMPLEMENTATION_PLAN.md) for assignment and progress.

Do not change an R/T/M expectation just to make a failure pass. Correct a genuine source error with a documented rationale and independent review; retain IDs and explain revisions. Explicit mock assumptions live in [the API contract](API_CONTRACT.md).

## Current user deferrals

Git setup and README creation are deferred by the user. Their original source requirements remain listed for traceability; they are not permission to create those outputs now. Track deferred submission items separately from technical implementation checks. Do not mark full submission compliance while they remain incomplete.
