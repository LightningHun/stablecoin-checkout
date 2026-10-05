# Requirement register

The 28 entries below define acceptance targets; this register is not a completion report. Later user-directed policy changes are included explicitly. R01-R23 summarize the user-supplied exercise; R24-R28 include explicit user directions from this project. Source page labels refer to [the supplied requirements brief](reference/stablecoin-checkout-requirement.pdf); R28 explicitly references the separate design PDF.

| ID | Source pages | Acceptance target | Evidence IDs |
| --- | --- | --- | --- |
| R01 | 2 | Merchant, order reference and locale-formatted EUR 149.90. | T01 |
| R02 | 2-3 | All six currency/network pairs; exact catalogue fees, precision, confirmations and timing metadata. | T02 |
| R03 | 2 + later user direction | Currency/network edits remain a draft until Continue. A changed accepted pair creates a replacement only on Continue; an unchanged accepted pair is reconciled without extending its quote. Keep the network prominent beside transfer details. | T02, T03 |
| R04 | 2,4 | Exact amount, fee, total, rate, address, QR and copy; one coherent quote snapshot. | T04, T05 |
| R05 | 2,7 | Absolute expiry countdown; correct after two background minutes and clock skew. | T06, T07 |
| R06 | 2,4 | Detected means zero confirmations; received funds must not expire locally. | T08 |
| R07 | 2,4-5 | Poll status; stop on terminal states; no overlap, stale updates or leaked work. | T09, T10 |
| R08 | 2,4-5 | All eight specified statuses; distinguish shopper actions from merchant/support issues. | T11 |
| R09 | 2,5 + later user direction | Underpaid allows only the remainder until the original quote deadline, then removes transfer controls and preserves the receipt/status. Overpaid tells the truth about excess without a refund guarantee. | T12, T13 |
| R10 | 2,6 | Expiry recovery with same-reference requote; handle 409 problem details. | T14 |
| R11 | 2,6-7 | Network failure, HTTP 500 and slow responses preserve known payment facts. | T15 |
| R12 | 3-6 | Committed mock implements catalogue, creation, status and requote endpoints. | T16 |
| R13 | 3,7 | Decimal strings; six token decimals or eighteen ETH decimals; no money floats. | T05 |
| R14 | 6 | Evaluator can trigger each status, network error and slow response; documented controls. | T17 |
| R15 | 1-2 + later restoration work | Shopper page only; exclude auth, real wallets/chains, dashboard and durable backend storage. Browser storage contains only order-scoped payment references and pending-creation markers; transfer facts must be fetched again. | V01 |
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
| R28 | User + current design PDF pages 1-33 | Implement the responsive states and paid-reveal timeline across D01-D17, with explicit contract conflict resolutions and independent visual verification. Historical 24-view approval does not establish coverage of the current 33-page reference. | D01-D17, VM01-VM02; historical G3A/G4 evidence is candidate-specific |

## Ownership and evidence

The original workflow assigned requirement interpretation, implementation, test expectations, implementation review and test-effectiveness review to distinct roles. Its [verification definitions](../ai-instructions/Codex/VERIFICATION.md) and [implementation plan](../ai-instructions/Codex/IMPLEMENTATION_PLAN.md) preserve the original evidence IDs and workflow history. Current behavior is described in [the Design Doc](DESIGN_DOC.md), current expectations in [the acceptance criteria](../reports/acceptance-expectations.md), and runnable checks in [the README](../README.md#checks). The historical G3–G6 reports retain their original candidates and verdicts; this register does not extend those approvals.

Do not change an R/T/M expectation just to make a failure pass. Correct a genuine source error with a documented rationale and independent review; retain IDs and explain revisions. Explicit mock assumptions live in [the API contract](API_CONTRACT.md).

## Delivery documentation status

The README now contains setup, demo scenarios and Working with the agent. The source-requested omitted-scope section is excluded at the user’s request, so its part of R19 is not marked complete. The earlier README deferral describes historical work and is not the current documentation status. R21/R22 still require assessment of real Git history and the instruction files included in the eventual submission. Instruction archives are under `ai-instructions/`; their presence alone is not a new delivery signoff. This documentation update does not revise historical gate verdicts or authorize commits, remote creation, pushing or deployment.
