# Independent design comparison

Reviewer: `/root/g3a_implementation`, independent of implementation and G3 code review. **Verdict: pass for D01-D12**, after inspection of all 24 full-size source renders and actual built-browser screenshots. Reviewed application `3b7a43ad4f4bd74a4dce8387876db8e977e6a2b6`; approved baselines were then byte-verified in delivery candidate `49018863d317cce6adf837c832d8823419002b71`. G3A scope, commands and findings are in `gates/G3A.md`.

## Reference observations

The 1280px desktop renders center a roughly 560px checkout column, with its step content indented about 48px. Mobile renders are 390px wide with 16px outer gutters and about 44px step-content indentation. All references retain the merchant/order header, thin divider, prominent fiat total, numbered/completed/inactive vertical steps, network accents, and compact monospaced identifiers. Font names cannot be recovered from the PDF's Glyphless resource; the documented system-font substitution is permitted.

| View | PDF pages | Independently observed source composition | Browser comparison |
| --- | --- | --- | --- |
| D01 | 1 / 2 | USDT segment selected, red Tron card, Ethereum alternative; black Continue; two inactive steps. Mobile fees wrap below timing; action fills content width. | **Pass.** All regions and proportional column/gutters match. Mobile metadata wraps and the button fills content width. Sample pre-creation payment reference becomes the real order reference; duration copy is conditional on quote readiness. Additional vertical spacing is minor. |
| D02 | 3 / 4 | USDC segment, purple Polygon selection between Ethereum and Solana; same step structure and responsive card rules. | **Pass.** All three alternatives, color accents, selection border, metadata and segmented currency controls remain readable; 390px cards stack correctly. Footer/step spacing is slightly longer. |
| D03 | 5 / 6 | Completed pair selection, active transfer step, red network warning, dominant 163.69 total and copy; desktop QR/address side by side, mobile centered QR above full address; deadline and waiting step. | **Pass.** Exact 163.69 transfer value remains prominent; live QR is alongside the address on desktop and centered above it on mobile. Canonical ungrouped address wraps without clipping. Additional exact amount/fee and address-only QR caution create extra mobile lines. New QR art is independently decoded, not copied from the PDF. |
| D04 | 7 / 8 | First two steps completed, no transfer controls; active Confirmation with 0 of 1 count, progress line, received/transaction/detected details. Mobile details stack. | **Pass.** No Change/Continue/send/copy/QR actions; 0 of 1 and empty progress bar visible. Desktop three-column fact layout becomes stacked mobile details. API time is 08:44:02 in UTC; no unsupported explorer link. |
| D05 | 9 / 10 | Blue Ethereum badge, 167.19 total received, 2 of 3 segmented progress; no further send controls; mobile count and details wrap below heading. | **Pass.** Two dark segments and one neutral segment, Ethereum identity and 167.19 retained. Confirming payload does not contain detected_at, so the sample third field is omitted; this shortens the mobile view without losing supported facts. |
| D06 | 11 / 12 | All steps complete, Paid receipt with strong heading, order/network/transaction/reference detail grid. Unsupported merchant-return action is omitted per contract. | **Pass, minor notes.** Complete markers, check icon, strong Paid heading and two-column receipt remain. API amount and settled date become explicit receipt rows instead of the source subtitle; Copy reference replaces unavailable merchant-return navigation. Terminal connector tail differs cosmetically. |
| D07 | 13 / 14 | Active send step with action-needed pill and expiry warning; two recovery cards side by side desktop and stacked mobile; inactive confirmation. Unsupported monitoring guarantee must be replaced. | **Pass.** Transfer panel is absent; two bordered recovery cards, primary Get a new quote and separate already-sent advice preserve the source hierarchy. Actual truthful expired/monitoring copy replaces fixed-date and continuous-monitoring promises. |
| D08 | 15 / 16 | Shortfall warning, red network warning, 43.69 remaining amount; QR/address transfer panel; no original countdown; partial received/progress details and attention marker. | **Pass.** 120.00 received and 43.69 remaining clearly separated; original address/QR retained; no countdown. Partial bar is approximately 73.31%; mobile transfer panel stacks. Unsupported detected time and guaranteed automatic completion omitted; attention marker is filled rather than outlined, a minor styling difference. |
| D09 | 17 / 18 | Completed payment with excess in heading; 180.00 received, 16.31 extra; reference-copy action and receipt grid. Custody/refund and unsupported navigation claims must be corrected. | **Pass, minor notes.** Excess heading, exact received/excess values, merchant guidance, copy action and receipt are present with no further-send controls. Removed contact/return buttons and unsupported refund/custody copy shorten the page. Fact grid adds settled/order/network rows; terminal connector tail is cosmetic. |
| D10 | 19 / 20 | Failed Confirmation with outlined cross and support-needed pill, reason, known details, copy action. Transfer data must only appear when actually supplied. | **Pass.** Cross/result heading, support pill, reason, warning not to resend and Copy details appear. Source screenshot assumes received money; actual failed fixture supplies no amount/hash, so the second step truthfully says details were not supplied and does not mark an invented transfer completed. |
| D11 | 21 / 22 | Full-width black connection banner below header; mobile banner wraps; prior transfer composition remains, with connection/last-check status. Current status uncertainty must replace guarantee wording. | **Pass.** Black banner and Retry now preserve placement/hierarchy, desktop remains one line and mobile wraps. Known transfer facts remain coherent with countdown; current-status uncertainty and last-check text replace unsupported guarantees. Additional caution text increases page height. |
| D12 | 23 / 24 | Selected USDC/Polygon, active send step with purple warning; amount/fee and QR/address skeletons, desktop side by side/mobile stacked; no usable transfer values; inactive confirmation. | **Pass.** Purple pair/warning and the amount, fee, QR and detail skeleton regions match the reference composition. Mobile skeleton QR centers above text blocks; no usable amount/address/QR/copy actions exist. No payment reference is fabricated before initial POST acceptance. |

## Approved source conflicts

The comparison applied the explicit resolutions in `docs/DESIGN_SPEC.md`: API-sourced merchant and payment reference; no invented provider or support/explorer/return URLs; truthful expiry/refund/custody/connection copy; canonical address and independently decodable QR; actual API money, dates and duration; no invented transfer fields. These differences do not justify unrelated layout or missing-state discrepancies.

Minor recorded differences beyond those copy corrections are the terminal step connector tail, filled attention marker, heavier waiting copy and some receipt facts placed in additional grid rows. The receipt/state region remains recognizable and complete; the transfer layout, hierarchy, column width, network accents, readable identifiers, safe actions and responsive stacking are preserved. No clipping, unreadable text, missing required region or substantial layout discrepancy was found. These notes are not an assertion of pixel-identical recreation.

## Capture conditions and reproducibility

Source: unchanged `docs/reference/crypto-checkout-design.pdf`, 24 pages, 96-DPI renders at `tmp/design-reference/page-01.png` through `page-24.png`. Application captures use built Vite output at localhost:4173 from the independently installed/buildable candidate, with the committed visual tests' deterministic HTTP fixtures. Separate real mock/API screenshots and independent QR decoding are recorded in G3A; static fixture screenshots do not substitute for those functional observations.

- Browser: Chromium, Playwright 1.63.0, macOS arm64; DPR 1; viewport 1280×900 or 390×900; full-page screenshot, natural varying height, no cropping or stretching.
- Clock: installed at `2026-08-14T08:37:10.842Z`, paused before navigation at +1 second and at the final +5-second capture target; deterministic server header remains the fixture time. Accepted awaiting responses resample that fixed server anchor, so D03 shows 15:00; after the failed refresh D11 shows 14:56. These are fixture effects, not claims about a live frozen server's elapsed time.
- Assets: CSS/text merchant and network badges; QR generated from the accepted canonical address. `document.fonts.ready` awaited; system sans/monospace stack substitutes for the unidentifiable Glyphless PDF font. Animations disabled only for capture; no regions, financial facts, statuses, addresses, QR or actions masked.
- Capture acceptance: wait for enabled Continue, accepted expected data-status and loaded QR where appropriate, then wait for fonts. D11 explicitly observes the failed GET alert; D12 intentionally captures a delayed POST before acceptance.
- Initial capture command produced 24/24 after the independent harness correction. A second run without updates matched 24/24. Regression tolerance is the committed 0.005 pixel ratio; this tolerance is only a future regression setting, not a numerical proof of PDF fidelity.
- Intermediate layouts and interaction checks covered 320/390/768/1280/1440 pixels, keyboard entry/copy focus, accessible names, non-ticking status announcements and 200% CSS zoom in the preliminary built-browser run. The corresponding UI/CSS inputs are unchanged on the approved application; the complete formal browser suite is G4's responsibility.

All final approved captures were visually inspected directly or byte-compared to the already directly inspected identical capture: 22 final images were identical to the initial source-reviewed captures; revised D03 mobile and newly completed D11 desktop were then inspected directly. Every source page was inspected full-size beforehand. Approval therefore comes from the source comparison and actual view inspection, followed by repeatability, rather than self-generated screenshots alone.

## Artifact sizes and fingerprints

Approved files now reside under `tests/acceptance/design.spec.ts-snapshots/`; original reviewer captures are under `tmp/g3a-3b7a43a/tests/acceptance/design.spec.ts-snapshots/`. Baseline delivery was byte-checked against the latter. The manifest `reports/manifests/g3a-approved-visuals.json` contains all 24 capture and all 24 source-render hashes. Aggregate SHA-256 of sorted baseline filename/hash pairs: `b5c217d884f66862d8589f866885b8b8548a402d27b0d9230c329b5213b62dfb`.

| View | Actual desktop / source height at 1280px | Actual mobile / source height at 390px |
| --- | --- | --- |
| D01 | 1060 / 1040 | 1115 / 1080 |
| D02 | 1134 / 1100 | 1205 / 1160 |
| D03 | 1228 / 1180 | 1473 / 1400 |
| D04 | 900 / 900 | 1066 / 1060 |
| D05 | 900 / 900 | 1008 / 1080 |
| D06 | 950 / 900 | 962 / 900 |
| D07 | 909 / 920 | 1059 / 1040 |
| D08 | 1345 / 1320 | 1640 / 1680 |
| D09 | 1003 / 1040 | 1034 / 1180 |
| D10 | 991 / 940 | 1016 / 1060 |
| D11 | 1296 / 1220 | 1626 / 1520 |
| D12 | 1123 / 1140 | 1333 / 1300 |

| Approved view | Desktop PNG SHA-256 | Mobile PNG SHA-256 |
| --- | --- | --- |
| D01 | `ccc9be3d7d37870e8d53c9d4d1178fe1ec8092512d705077059dd9f9042eae7b` | `c919a67611311edd67648d38755d2bc5ba81968b03939027eebbddf0174852fe` |
| D02 | `737e68c257c6e0e26ea02a19d14cc3c59737ef7be5a77fc11f3a049269ddd380` | `71c6437013b9eb7c01bbd89a8c22ebc195e6c616ffd3373e253aa5a4e30f8f5c` |
| D03 | `45ac6672f60d033695f38485a5264d045f2f4c6c68ba3710dc685423d43feaac` | `cc97bec38b50268fe70c2bbac633947358f303a4c83c9f5fbd13ae0059b5447a` |
| D04 | `3a44b3b91507b3c40ece3988f79cef1754fe52a3aab06221d1feec658ede8351` | `6889de4a4df369232effd63e42067441963110d048155aecbf7f6d4236902554` |
| D05 | `ea913920eaa399088feb1d9838c1c213924c6241a5c7b9d8dacdebb31656bf60` | `61d906dee0352b0a7da2f4008a5ac6ce948dbd8f9a9d7be795a77fbd91c63785` |
| D06 | `beda41955a806f73306f8a0db0b6eb06b76480ef0104456a9a8e923fd6e2ba38` | `cb8d1fe7038ac9ada1cc813138583381289d611932e88c0568a07fc1c0925b9e` |
| D07 | `574908257df121ccdb4157ecdb6bb0cd9b183d479775d1089986d52349091276` | `2224f16f25d74393221ce73dba547f5e4f5080e09829ea21fa7b2f2a45f7d85f` |
| D08 | `f7c08e139bc614120f62180ed0d52394f4a27b2ac0680c11e216091153429509` | `8017b5d6b3f732d880e76dcb634076e1336e366593628a050a9ae151e2a43c03` |
| D09 | `6f81f779928beb6266549bc3382f2cc14676ade2caa59fc1aa68c77f0727e8f4` | `f2c906b8209ce6408d884c75d9ffabfec66df1b4f1bd9ec5d3e87e3846443c80` |
| D10 | `ea07a9c4b4e3d0e71d90b5d748b9ae26a45e7b1b64fb0083a6b304f86507196b` | `93eeae044052c6049c81dc7ae32c7aba88fb0bf5dab646ca7f575b0b7c236fc0` |
| D11 | `3056de966f847c4a521acecbce00305ea9f4eb52fc57fde76b2b5c2f76224ace` | `5eb46e74376a8b05e1d9bca9586805f1992bc8c71c33a44dec1a7ed3a8a9b5a1` |
| D12 | `33953d29b142802511af2c96c97d4cf894dff23a59510dfc1295cc447eb79220` | `6057055aa4cd923917bba2ad13fb70423246e734f6eccff9f489dcb0b11d77de` |
