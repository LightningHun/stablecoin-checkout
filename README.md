# Stablecoin Checkout

A Vue 3 + TypeScript + Vite checkout for choosing a currency and network, viewing transfer details, and following payment progress. The HTTP backend in `backend/` supplies the data.

## Documentation

- [Design doc](docs/DESIGN_DOC.md): page flow, state, ownership, time, money and failure handling.
- [ADR 001: One controller owns the payment lifecycle](docs/adr/001-state-owner.md).
- [ADR 002: Exact amounts and absolute deadlines](docs/adr/002-time-money.md).
- [ADR 003: Preserve payment identity when a request is uncertain](docs/adr/003-mock-recovery.md).
- [API contract](docs/API_CONTRACT.md): routes, payloads and backend behavior.
- [Localization](docs/I18N.md): message resources and adding a language.
- [Requirements PDF](docs/reference/stablecoin-checkout-requirement.pdf).

## Run locally

Requires **Node.js 22.12 or newer**.

```bash
npm ci
npm run dev
```

| Service | URL |
| --- | --- |
| Checkout | http://127.0.0.1:5173/ |
| Checkout with demo controls | http://127.0.0.1:5173/?demo=1 |
| Backend API | http://127.0.0.1:8787/api/currencies |

`npm run dev` starts both servers. **Ctrl+C** stops them. If port 8787 is occupied, stop the process using it or choose another backend port: `MOCK_PORT=8788 npm run dev`.

To preview a production build, stop development and run:

```bash
npm run build
npm run preview
```

Preview serves the page on **4173** and starts the backend API on **8787**. Restarting the backend clears its in-memory orders and payments.

## Try a payment

1. Open the demo URL and expand **Demo controls**.
2. Click **Reset demo**, then reopen the controls after the page reloads.
3. Choose **USDT / Ethereum (ERC-20)** and click **Continue**.
4. Set **Payment state** to `detected`, then click **Apply state**.
5. Set **Payment state** to `confirming`, then click **Apply state**.
6. Wait for the normal poll to show **2 of 3 confirmations**.
7. Click **Advance 15 minutes**. The next successful poll shows **Paid**.

Demo state changes happen in the backend. There is no separate frontend refresh event: the normal poller reads them, usually two seconds after the preceding request finishes. Reset before testing another completed lifecycle because terminal states stop polling and the client rejects backward state changes.

**Change** reopens the selector and hides transfer instructions and the footer reference. Selecting another currency or network does not create a payment until Continue. Continuing the same accepted pair retains its payment; continuing a different pair creates a new one. See [reference and data reuse](docs/DESIGN_DOC.md#what-change-and-continue-reuse) for the details.

## Demo scenarios

| Payment state | Expected display |
| --- | --- |
| `awaiting_payment` | Exact amount, network, address, QR and countdown. |
| `detected` | Received amount and zero confirmations; no transfer controls. |
| `confirming` | Confirmation progress; no transfer controls. |
| `paid` | Paid receipt, transaction and payment reference. |
| `underpaid` | Received and outstanding amounts; send only the remainder while the original quote is usable. |
| `overpaid` | Receipt, excess amount and merchant-contact guidance. |
| `expired` | Expiry notice; an unfunded payment can request a new quote. |
| `failed` | Failure reason and merchant-contact guidance. |

| Control | Effect |
| --- | --- |
| **Apply state** | Changes the current payment for this order. |
| **Advance 15 minutes** | Moves the backend clock forward. The next payment read applies awaiting-payment expiry or detected/confirming progression. |
| **Apply connection** | Applies Healthy, HTTP 500, Disconnect or Slow (5 seconds) to subsequent payment requests. It does not reset exhausted retry limits. |
| **Apply amount** | Changes the amount for the next created or requoted payment. It does not rewrite an accepted quote. |
| **Create signed order link** | Registers another order and returns its checkout URL. Signing uses a public demo key. |
| **Reset demo** | Clears backend demo state for all orders, including other tabs, and reloads this page. |

Confirmations also advance with real waiting: one per network interval. USDT/Ethereum needs 180 seconds for its next confirmation; Tron needs one confirmation after 60 seconds. A payment needing one confirmation can go directly from `detected` to `paid`.

For `underpaid`, the original deadline ends the opportunity to send the remainder. The page then shows **Payment incomplete**, retains the receipt and continues polling within retry limits. The API status remains `underpaid`.

For a quick expiry check, run this while the backend is running, reload the page, and click Continue:

```bash
curl -X POST http://127.0.0.1:8787/api/demo/reset \
  -H 'Content-Type: application/json' \
  -d '{"ttlMs":15000}'
```

For deterministic API tests, reset with `freeze: true` and an optional ISO `now`. Frozen backend time moves only through `advanceMs`; the browser clock remains independent.

## Where things live

| Location | Purpose |
| --- | --- |
| `src/features/checkout/CheckoutPage.vue` | Connects page actions, the controller and displayed sections. |
| `src/features/checkout/components/` | Selection, transfer, progress, copy, recovery and demo UI. |
| `src/features/checkout/application/` | Payment requests, polling, retry policy and link validation. |
| `src/features/checkout/domain/` | Payment rules, quote rules and exact money calculations. |
| `src/features/checkout/infrastructure/` | HTTP client, response validation, clock and local storage. |
| `backend/` | HTTP routes, catalogue, payment data, scenarios and timed confirmations. |
| `src/styles/`, `src/config/`, `src/i18n/` | Shared styles, network colors, explorer links and UI messages. |
| `tests/` | Unit, component, HTTP contract, browser and mutation tests. |

## Checks

```bash
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:component
npm run test:contract
npx playwright install chromium
npm run test:e2e
```

`npm run verify` runs the checks from typecheck through E2E in sequence and stops at the first failure. It does not install browsers or run mutation testing. The browser suite includes native tab-switching tests; leave the test browser windows alone while they run.

Screenshot comparison tests and their baseline images have been removed. Functional browser tests remain, and failures can still produce diagnostic screenshots and traces. The recorded runs cover Chromium on macOS; they do not establish current PDF fidelity or Safari/Firefox coverage. Historical G3–G6 and their supporting reports apply only to their named commits and reference versions, not to the current working tree. The separate [mutation runner](tests/audit/run.ts) requires an explicit candidate commit; formal runs also require G4 evidence.

## Working with the agent

### Three things your agent wrote that you threw away, and why

1. **Comparing only the first and last four characters of the address.** The initial design told users to check only the ends of the address. This can miss an address-poisoning attempt that uses a different address with matching ends. I changed the display to separate the full address into groups of four characters and the guidance to ask users to compare every character with their wallet. This makes the address easier to check and helps users spot mismatches. The copied address and QR code still contain the original address without spaces.
2. **Keeping explorer configuration in `TransactionLink.vue`.** The component originally contained network explorer URLs and transaction-hash validation patterns. I moved these settings into [src/config/explorers.ts](src/config/explorers.ts) to separate configuration from rendering, improve readability, and make explorer support easier to extend.
3. **Keeping network symbol colors in `tokens.css`.** Network-specific colors were mixed with the shared design tokens. I moved the color variables and their network class mappings into [src/styles/network-colors.css](src/styles/network-colors.css), making the colors easier to find, review, and extend when adding a network.

### One place where you did it your own way and the code got better

The original implementation kept component CSS together in `main.css` and repeated `@media (max-width: ...)` rules for responsive layouts. I moved component-specific styles into the corresponding Vue components and used SCSS nesting to make related rules easier to read. `App.vue` now uses a shared 600px breakpoint to determine the mobile layout and passes that state through a `mobile` prop. Components apply their mobile styles using a `.mobile` class, so they no longer need to repeat the width-based media query. Global styles remain in `main.css`, and reduced-motion media queries remain in place.

### Anything the agent got wrong about the payment state machine

The agent initially removed the expiration countdown for `underpaid` payments. I changed this so the countdown continues in `underpaid`, using the original `quote.expires_at` as the deadline for sending the remaining amount. When that deadline is reached, the page hides the transfer instructions and copy controls, keeps the partial-payment receipt, and continues polling the existing payment reference under the normal retry rules. This expires the opportunity to send the remainder through the displayed quote; it does not change the API payment status from `underpaid` to `expired`.
