# Acceptance expectations

The initial oracle was authored independently by `/root/test_designer`. This document reconciles those criteria with later user decisions and the current 33-page design reference as of 2026-10-06. It is a current expectation register, not a new independent review or a claim that the implementation passed. Historical reviewer observations remain in their original reports and apply only to their named candidates.

Sources: [requirements](../docs/REQUIREMENTS.md), [API contract](../docs/API_CONTRACT.md), [Design Doc](../docs/DESIGN_DOC.md), and [design reference mapping](../docs/DESIGN_SPEC.md). The initial workflow/evidence definitions remain archived under `ai-instructions/`.

The supplied USDT/Tron example has principal 162.69, fee 1.00, total 163.69, exchange rate 0.9214 and canonical address TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e. Literal expectations must remain independent of production calculation helpers. The six fixture catalogue rows are example data, not a frontend allowlist; current validation uses API-owned currency/network metadata.

| Tests | Oracle and boundary |
| --- | --- |
| T01 | Merchant and order information come from verified payment responses. Default mock: Nordwind Audio, ORD-88213, amount 149.90 and currency EUR. Format exact order digits for the chosen locale and retain the API currency code; do not hardcode the merchant or a euro symbol. Neutral loading appears before metadata. |
| T02 | All six fixture pairs and their metadata are supported; additional valid catalogue entries use the same API-owned rules. Initial selection uses the first currency/network; USDC therefore defaults to Ethereum. A fresh session uses one ordinary POST for display metadata and another on first Continue. Draft edits send no POST. Continuing an unchanged accepted pair reconciles it; a different pair creates a replacement only on Continue. |
| T03/T04 | Replacement immediately hides old transfer controls. Late old-reference/generation responses cannot overwrite a new quote. Independently decoded QR and clipboard equal the canonical accepted address; grouping is display-only. Clipboard denial reveals a selectable fallback. |
| T05 | Exact units: 162.69 + 1.00 = 163.69, 163.69 - 120.00 = 43.69, 180.00 - 163.69 = 16.31. ETH 1e-18 and 1.123456789012345678 remain exact. Reject nonzero fractional digits beyond API precision; equivalent trailing zero padding is permitted. |
| T06/T07 | Use an absolute deadline, including across delayed callbacks and device-clock skew. At the deadline, remove transfer controls; before it, allow them only with a usable clock and quote. A request spanning a wall/monotonic discontinuity cannot re-anchor time or clear uncertainty. Before the first usable server sample, do not latch expiry from device time. Distinguish simulated clock coverage from native background and physical sleep evidence. |
| T08 | Detected/confirming do not expire with the original quote. Underpaid retains its financial status and receipt, but its additional-transfer window ends at the original deadline. HTTP 500 does not erase funds or restore expired controls. Funds observed during reconciliation prevent replacement/requote. |
| T09/T10 | At most one active payment GET despite slow responses, focus and retry actions. Paid, overpaid, failed and expired stop automatic polling. Disposal invalidates callbacks, aborts and clears timers/listeners, including late completion/error paths. |
| T11 | Eight payment statuses; reject unknown states, malformed required fields, negative amounts, nonzero excess precision and wrong identity. Validate quote coherence against catalogue metadata. Errors preserve last verified facts and block unsafe actions. |
| T12/T13 | Default underpaid sends only 43.69 before the original deadline; repeated snapshots still mean 120.00 received. After expiry, show Payment incomplete with received/outstanding/transaction/reference facts and no transfer or requote actions. Default overpaid is 180.00 received / 16.31 excess, with merchant guidance and no automatic-refund/custody guarantee. |
| T14 | Local zero reconciles; only a server-expired, unfunded payment can requote. A successful requote retains the reference and changes the client generation. Reconcile on 409; double click produces one mutation. No partial-payment remainder requote is implied. |
| T15 | Disconnect, timeout and HTTP 500 affect request health, not financial status. Ordinary polling follows the preceding request; outage retries allow up to five automatic attempts after 2/4/8/16/30 seconds and three manual attempts at least ten seconds apart. Focus/demo commands cannot bypass exhausted limits. An uncertain creation POST is not blindly repeated. |
| T16/T17 | Real HTTP response shapes/codes, decimal strings, server-time fallbacks, all demo states, reset, disconnect, HTTP 500 and delay. Scenario controls change backend state; normal polling observes them. Order amounts apply to the next creation/requote. Frozen mock time advances only through advanceMs. |
| T18 | Keyboard radio interaction, labels, visible focus, polite status announcements excluding ticking time, readable identifiers, reduced motion and no overflow at 320/390/768/1280/1440 and 200% zoom. |

## Visual and interaction reference

At the 96-DPI reference convention, desktop content spans approximately x=360..920 (560px); mobile spans x=16..374 at 390px width. The order ID is below the fiat total. The header retains the merchant identity and divider. Financial values and identifiers use monospace. The PDF exposes a Glyphless font resource; the documented system-font substitution is retained. Apply the explicit behavioral/copy deviations in the design specification when comparing views.

Existing D01–D12 identifiers keep their scenario meanings; their PDF page numbers are updated. New scenarios use D13–D17 rather than repurposing historical IDs.

| View | Current PDF pages | Required composition and actions |
| --- | --- | --- |
| D01 | 1/2 | Initial USDT selection, Tron selected and Ethereum alternative, Continue, inactive later steps. No invented payment reference before an accepted payment. |
| D02 | 3/4 | USDC and three network cards. The reference selects Polygon; the current default is the first listed network, Ethereum. Polygon remains available as a deliberate choice. |
| D03 | 5/6 | Accepted pair and Change; network warning; 163.69 transfer amount; desktop QR beside address and mobile QR above it; countdown and waiting panel. |
| D04 | 7/8 | Completed choice/send steps, active confirmation, 0 of 1 and receipt facts; no transfer controls, countdown, Change or Continue. |
| D05 | 9/10 | Ethereum identity, 2 of 3 confirmations and segmented progress; the original deadline does not expire confirming funds. |
| D06 | 11/12 | Paid receipt with supported order/network/transaction/reference facts; no invented merchant-return destination. |
| D07 | 13/14 | Expired notice, no transfer controls, explicit unfunded requote and already-sent caution without a monitoring guarantee. |
| D08 | 15/16 | Underpaid shortfall, 43.69 remaining transfer to the same address/network, original countdown and 120.00 received facts. No new 15-minute window on status change. |
| D09 | 17/18 | Paid with 16.31 excess, 180.00 received, reference copy and merchant assistance without an automatic refund/custody promise. |
| D10 | 19/20 | Failed result and actual reason/reference/details; no invented receipt and no blind resend. |
| D11 | 23/24 | Connection alert with automatic retry countdown and manual retry availability; accepted snapshot remains subject to uncertainty and local expiry. |
| D12 | 29/30 | USDC/Polygon quote-loading skeleton; no usable transfer amount/address/QR/copy; no duplicate creation. |
| D13 | 21/22 | Expired underpaid: compact received summary, Payment incomplete, recorded received/outstanding/transaction/reference values and Copy reference; no further-send or requote controls. |
| D14 | 25/26 | Manual retry in flight with request/budget feedback; prevent another simultaneous retry and retain known facts. |
| D15 | 27/28 | Exhausted automatic/manual retries; no falsely fresh payment status or restart through focus/demo commands. |
| D16 | 31/32 | Invalid-link verdict and support details; no payment controller/actions. Do not infer a payment outcome from an invalid link. |
| D17 | 33 | Paid-reveal timeline after an accepted transition; no transfer content in an outgoing animation, no replay for a restored paid result, and immediate final state under reduced motion. |

Current screenshot comparison tests/baselines have been removed. This table defines reference coverage; it is not a claim that 33 pages have been independently approved or that new captures exist. Functional QR geometry/action checks remain distinct from PDF fidelity. VM01 must fail on broken mobile QR/address stacking; VM02 must fail if detected exposes a usable transfer action. Neither requires a screenshot difference to establish its defect.

G3–G6 reports retain their original candidates and conclusions. This policy reconciliation does not sign off any gate or rewrite earlier observations.
