# Independent acceptance expectations

Author: independent test designer `/root/test_designer`. Derived from `REQUIREMENTS.md`, `API_CONTRACT.md`, `ARCHITECTURE.md`, `VERIFICATION.md`, `DESIGN_SPEC.md`, both extracted sources, and visual inspection of all 24 96-DPI design renders before examining production helpers. This is an acceptance oracle, not a claim that the implementation passed.

The source fixes USDT/Tron to amount 162.69, fee 1.00, total 163.69, exchange rate 0.9214, address TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e. Other quote values require labelled synthetic fixtures and independent arithmetic review; tests must never derive expected values by calling production helpers. All six catalogue rows are copied literally in `tests/fixtures/oracles.ts`.

| Tests | Oracle and boundary |
| --- | --- |
| T01 | Payment Project, ORD-88213, en-IE €149.90, de-DE 149,90 €; locale formatting preserves cents. |
| T02 | Exactly six currency/network pairs and source metadata. Draft choice makes no POST; Continue issues one POST. Accepted replacement data must be coherent. |
| T03/T04 | Replacement hides old transfer controls. Late old-reference/generation responses cannot overwrite new quote. Independent QR decoding and clipboard equal canonical accepted address. Clipboard denial reveals selectable fallback. |
| T05 | BigInt minor units: 162.69 + 1.00 = 163.69, 163.69 - 120.00 = 43.69, 180.00 - 163.69 = 16.31. ETH 1e-18 and 1.123456789012345678 remain exact; 19 fractional ETH digits and 7 token digits reject. |
| T06/T07 | Deadline difference after one coalesced 120-second interval; ±300-second wall skew cannot change server-anchored remaining time. Boundary 1ms before permits sending; at/after hides controls. Missing/uncertain clock samples trigger reconciliation instead of invented expiry. |
| T08 | detected, confirming, underpaid survive original deadline and 500; local zero can hide transfer without relabelling financial status. A detection seen during recovery prevents requote. |
| T09/T10 | Active GET maximum one despite slow responses, focus and retries. Terminal statuses paid, overpaid, failed, expired schedule no GET. Disposal invalidates callbacks, aborts and clears timers/listeners, including late finally. |
| T11 | Eight statuses only; reject unknown state, malformed required fields, negative/excess-precision amounts and wrong identity. Error preserves last verified facts and disables unsafe actions. |
| T12/T13 | Underpaid transfer amount is only 43.69; duplicate delivery remains 120.00 received. Overpaid is 180.00 received / 16.31 excess, no send action and no automatic-refund/custody guarantee. |
| T14 | Local zero reconciles; only server-expired offers requote. Successful same-reference requote changes client generation. 409 problem+json refetches; double click causes one mutation. |
| T15 | Disconnect, timeout and 500 remain request-health failures. GET recovery/backoff works; uncertain POST is never automatically retried. |
| T16/T17 | Real HTTP 200/201/409 and documented headers, decimal strings, eight controls, reset, disconnect, 500, delay; controls remain outside the ordinary shopper flow. |
| T18 | Native keyboard interaction, clear labels, focus visibility, polite status announcements excluding ticking time, complete readable identifiers; no overflow at 320/390/768/1280/1440 and 200% zoom. |

## Visual oracle

At 1280 the reference main column spans approximately x=360..920 (560px); at 390 it spans x=16..374, with step content beginning near x=60. Header is ~56px high, white background and thin divider. Fiat amount is strongest type, then step labels; financial values/identifiers use monospace. Reference font has no identifiable font family, so a documented close licensed substitution is permitted. Reference desktop spacing and natural mobile wrap should remain recognisable; exact text changes required by the conflict table are not defects.

| View | Pages | Required composition and actions |
| --- | --- | --- |
| D01 | 1/2 | Three currency segments; Tron selected with red border and Ethereum alternative; black Continue; later steps inactive. No invented payment reference before creation. |
| D02 | 3/4 | USDC selected; three networks; Polygon purple selected border; fee/timing metadata. |
| D03 | 5/6 | Completed choice, Change; red network warning; 163.69 total; address/QR side by side on desktop and QR above address on mobile; countdown; waiting panel. |
| D04 | 7/8 | Completed choice/send; active confirmation; 0 of 1; received facts; no actionable transfer controls, countdown, Change or Continue. |
| D05 | 9/10 | Ethereum blue badge; 2 of 3; segmented progress; original deadline no longer governs. |
| D06 | 11/12 | Paid receipt, network/order/reference; no unsupported navigation. |
| D07 | 13/14 | Expired warning; two recovery cards side by side desktop/stacked mobile; explicit Get a new quote; already-sent caution without monitoring promise. |
| D08 | 15/16 | Short-payment warning; 43.69 send remaining; same Tron address/QR; no countdown; 120.00 received facts. |
| D09 | 17/18 | Paid with 16.31 extra; 180.00 receipt; reference copy; truthful merchant-assistance text without automatic refund or custody promises. |
| D10 | 19/20 | Payment failed, settlement_rejected reason, reference/details; only fields actually received; no blind resend. |
| D11 | 21/22 | Black connection alert below header; retry; accepted awaiting snapshot, status-age uncertainty and local deadline safety. |
| D12 | 23/24 | USDC/Polygon loading warning and skeleton; no usable address, QR or copy controls; delayed response remains loading, no duplicate POST. |

Deterministic browser captures must exist for all 24 views, with no masking of amount/address/network/status/actions. Generated application screenshots are pending independent G3A comparison to the PDF before approval as regression baselines. VM01 is additionally guarded by geometric QR-before-address assertions on mobile (desktop must remain side by side). VM02 is guarded by explicit absence of enabled Continue/send/copy controls in detected, independently of screenshot differences.

The real two-minute background-tab smoke is supplemental to simulated clock tests and must be recorded honestly when executed. G3A, G4 and G5 remain distinct gates; this document does not sign off any of them.
