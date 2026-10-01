# Sources and provenance

Functional source: supplied selected reformatted requirements PDF and extraction under docs/reference. Visual source: supplied crypto-checkout-design.pdf (24 pages), rendered at 96 DPI and individually inspected. Both preserved unchanged. Applicable interpretations are in docs/API_CONTRACT.md and docs/DESIGN_SPEC.md.

Application, mock, fixtures, tests and report prose authored in this session. No completed assignment solutions searched or copied. Five missing-pair quote fixtures are original synthetic examples (mock/fixtures.ts); USDT/Tron preserves the source example. The ETH fee remains the catalogue's 3.20 token amount, not a realistic fee claim. Status confirmations are normalized to the selected network.

No external image, logo or QR artwork reused. QRCode encodes the actual canonical address; jsQR independently decodes it in tests. Merchant mark and network badges are CSS/text. System sans-serif (-apple-system, BlinkMacSystemFont, Arial, Helvetica) and system monospace substitute for the PDF's unidentifiable Glyphless font.

Primary tooling references consulted: [Vite guide](https://vite.dev/guide/) for Node compatibility and [Vue TypeScript guide](https://vuejs.org/guide/typescript/overview) for SFC checks. Dependencies retain package licenses in node_modules and published package distributions. Vue, Vite, TypeScript, Zod, QRCode, Vitest, Playwright, Vue Test Utils, jsQR and PNGJS are used as libraries; no external implementation snippets pasted. npm audit after the Vitest update reported zero vulnerabilities. This provenance record is not an absolute plagiarism guarantee.
