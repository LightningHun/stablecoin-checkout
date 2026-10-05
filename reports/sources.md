# Sources and provenance

Current functional source: [stablecoin-checkout-requirement.pdf](../docs/reference/stablecoin-checkout-requirement.pdf), 7 pages. Current visual source: [crypto-checkout-design.pdf](../docs/reference/crypto-checkout-design.pdf), 33 pages. The requirements PDF was renamed and the design reference was replaced after the original 24-page review. Historical G3–G6 and design-comparison reports describe their named candidates and earlier source hashes; their approval does not extend automatically to this reference revision.

Reference SHA-256 values recorded for this documentation update:

| File | Pages | SHA-256 |
| --- | --- | --- |
| `stablecoin-checkout-requirement.pdf` | 7 | `61866b95893c2694c21aa7d22501abb2f9619ffa4218e3b8d1588e00404446bb` |
| `crypto-checkout-design.pdf` | 33 | `9203d093140fdcb70fcef52ec4fa8a29bc134748fe1d56c1d7f1ce09b082c35a` |

The [design text extraction](../docs/reference/design.txt) was regenerated from the current PDF with pypdf, retaining page boundaries as form-feed separators and trimming trailing spaces. It is searchable support, not visual-fidelity evidence. This documentation update preserves both PDF files and does not claim a fresh 33-page application/design comparison. Applicable interpretations are in [the API contract](../docs/API_CONTRACT.md) and [the design specification](../docs/DESIGN_SPEC.md).

The original implementation and review sessions authored the application, mock, fixtures, tests and historical report prose; later changes are recorded in repository history and the current working tree. No completed assignment solutions searched or copied. Five missing-pair quote fixtures are original synthetic examples (`backend/fixtures.ts`); USDT/Tron preserves the source example. The ETH fee remains the catalogue's 3.20 token amount, not a realistic fee claim. Status confirmations are normalized to the selected network.

No external image, logo or QR artwork reused. QRCode encodes the actual canonical address; jsQR independently decodes it in tests. Merchant mark and network badges are CSS/text. System sans-serif (-apple-system, BlinkMacSystemFont, Arial, Helvetica) and system monospace substitute for the PDF's unidentifiable Glyphless font.

Primary tooling references consulted: [Vite guide](https://vite.dev/guide/) for Node compatibility and [Vue TypeScript guide](https://vuejs.org/guide/typescript/overview) for SFC checks. Dependencies retain package licenses in node_modules and published package distributions. Vue, Vite, TypeScript, Zod, QRCode, Vitest, Playwright, Vue Test Utils, jsQR and PNGJS are used as libraries; no external implementation snippets pasted. The earlier npm audit after the Vitest update reported zero vulnerabilities; it was not rerun for this documentation change and is not a current security assessment. This provenance record is not an absolute plagiarism guarantee.

Previously recorded installed-license metadata (not re-audited in this documentation update): Vue3.5.43, Vite7.3.6, Zod4.6.5, QRCode1.5.4, Vitest4.1.11, VueTestUtils2.4.6 and PNGJS7.0.0 use MIT; TypeScript5.9.3, Playwright1.63.0 and jsQR1.4.0 use Apache-2.0. Their copyright/license files remain in the installed packages; no library source is copied into application modules.
