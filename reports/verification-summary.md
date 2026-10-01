# Stablecoin checkout delivery

The Vue 3 / TypeScript / Vite application and controllable HTTP mock are implemented and running locally at http://127.0.0.1:5173/. Evaluator controls: http://127.0.0.1:5173/?demo=1. Restart with `npm ci` then `npm run dev` on Node 22.12+; verified on Node 22.19.0. See [run instructions](run-instructions.md).

All six token/network pairs, eight payment states, exact decimal money, coherent QR/address/clipboard, server-aware expiry, serialized polling, stale-response rejection and recovery are implemented. Local expiry never erases observed funds. The browser expiry case uses **15 seconds**, as requested; the ordinary mock default remains 15 minutes. The distinct source-required two-minute real background-tab check also passed.

## Fixed candidate and gates

Reviewed and formally tested candidate: **`49018863d317cce6adf837c832d8823419002b71`**. Later documentation/evidence commits retain identical application/test/fixture/baseline bytes; the final Git HEAD is reported in the handoff. Initial failed review and repair evidence is preserved.

| Gate | Actual result | Evidence |
| --- | --- | --- |
| G0/G1 | Pass: requirement/architecture readiness | [G0-G1](gates/G0-G1.md) |
| G2 | Pass: independent expectations, meaningful red evidence and source-based corrections | [G2](gates/G2.md), [follow-up](gates/G2-followup.md) |
| G3 | Pass: independent code review after seven safety repairs and retry timing correction | [initial findings](gates/G3.md), [recheck](gates/G3-recheck.md), [final review/carry-forward](gates/G3-final-addendum.md) |
| G3A | Pass: separate built-application/API verification and all 24 PDF/browser comparisons | [G3A](gates/G3A.md), [requirements](requirement-traceability.md), [design](design-comparison.md) |
| G4 | Pass: 186/186 tests; no skips; clean fixed-candidate checkout | [G4](gates/G4.md) |
| G5 | Pass after independent survivor triage: all 14 mandatory defects caught, restored green | [G5](gates/G5.md), [test effectiveness](test-effectiveness.md) |
| G6 | Technical delivery verified; full source submission blocked by deferred README/human evidence | [G6](gates/G6.md) |

`npm ci`, `npm run typecheck`, `npm run lint`, and `npm run build` all exited 0. Tests passed: **73 unit + 27 component + 21 real HTTP + 41 browser behavior + 24 visual = 186**. Clean dependency installation reported zero vulnerabilities. Platform coverage is Chromium/macOS; the checked-in visual baselines are platform-specific.

The independent mutation audit detected M01-M12 and VM01-VM02 at their intended assertions, not compilation/harness failures. Eight additional mutations were detected. A08 removed an early controller guard but retained the reducer's generation rejection; the independent auditor documented its scoped equivalence. The runner conservatively exited **1** for that survivor; this actual exit is preserved rather than reported as zero. Every mutation was restored; both full 121-case unit/component/HTTP baselines and each selected browser restoration passed.

Canonical SHA-256 fingerprints:

- Application: `2af8c975a57298f7f9165c9dc6b52c6eb836b67ac1937e7fb08272176481513e`
- Suite, including approved baselines: `6e253a4b3827245675fe0db4132648e30d338482da13de8c91a85585247bddd5`
- Fixtures: `fe6dc02a603632cf754c453c24bd865735d9cf01c879e2e14118e0595d426dbb`
- Design PDF/spec: `2f57558eb340aeafd948dfc1ff5043085ff03f5dbb1519aadc5aed72c562624b`
- Approved visual baseline aggregate: `b5c217d884f66862d8589f866885b8b8548a402d27b0d9230c329b5213b62dfb`

## Remaining items and scope

No critical/major technical findings remain. Minor visual differences are documented in the independent comparison. **R19 README remains deferred by user instruction. R20's requested human rejection/code-improvement examples did not occur and have not been fabricated.** Actual agent mistakes, repairs, the user's 15-second direction and genuine incremental local commits are recorded in the [work journal](work-journal.md). Full source-submission compliance is therefore incomplete.

This is the specified local mock checkout: no real funds, chain/wallet integration, persistence, provider affiliation, refund capability or invented support/explorer/merchant links. Terminal expired polling stops; late-transfer monitoring and uncertain-creation recovery need an explicit real-provider contract. No remote was created, pushed or deployed. Architecture, three ADRs, preserved original inputs, instructions, lockfile, source, tests, approved baselines and concise evidence are committed; bulky logs/traces/generated artifacts remain local at the hashed report paths. [Sources and licenses](sources.md) distinguish original work from dependencies and supplied references.
