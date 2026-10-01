# Expected implementation outputs

This is the target inventory for the future implementation, not a claim that these files exist or checks have passed. Preserve the current instructions and references. Follow ARCHITECTURE.md for module ownership and VERIFICATION.md for acceptance. Equivalent additional modules are allowed when justified; do not create empty files merely to match this list.

## Application and configuration

```text
.gitignore
package.json
package-lock.json
index.html
vite.config.ts
tsconfig.json
tsconfig.app.json
tsconfig.node.json
# Additional TypeScript projects/configuration for mock and tests as needed.
eslint.config.js
vitest.config.ts
playwright.config.ts
src/
  main.ts
  App.vue
  styles/tokens.css
  styles/main.css
  features/checkout/
    CheckoutPage.vue
    components/
      OrderSummary.vue
      AssetNetworkSelector.vue
      QuoteDetails.vue
      PaymentProgress.vue
      RecoveryPanel.vue
    application/usePaymentController.ts
    domain/paymentModel.ts
    domain/money.ts
    domain/quotePolicy.ts
    infrastructure/paymentClient.ts
    infrastructure/responseSchemas.ts
    infrastructure/ClockService.ts
mock/
  server.ts
  catalogue.ts
  fixtures.ts
  scenarios.ts
```

Use compatible config extensions if required by the chosen tools. All app, mock and test TypeScript must actually be checked. Add small presentational components, licensed assets and process-management scripts only as needed. npm run dev and npm run preview must both provide the application and working mock API. The exact verified startup commands belong in reports/run-instructions.md while README remains deferred.

## Tests and validation

```text
tests/
  unit/          # Money, transitions, quote policy, time and controller behavior
  component/     # Vue rendering, events, cleanup and accessibility behavior
  contract/      # Real HTTP endpoint and fixture contract checks
  acceptance/    # Browser checkout flows and responsive/visual cases
  audit/         # Isolated deliberate-defect tooling and mutation configuration
```

Provide runnable tests for T01-T18, visual comparisons for D01-D12 at both reference widths, and audit support for M01-M12 plus VM01-VM02. Exact test filenames follow the implemented modules. Independently approved visual baselines may be tracked when needed for reproducible tests; runtime screenshots and traces remain generated evidence. Do not count a missing suite, a harness error or an unexecuted check as success.

## Evidence and implementation documentation

```text
reports/
  run-instructions.md
  verification-summary.md
  requirement-traceability.md
  design-comparison.md
  test-effectiveness.md
  work-journal.md
  sources.md
  gates/         # Actual G0-G6 records, including G3A
  screenshots/   # Desktop/mobile evidence
  traces/        # Relevant browser traces
  logs/          # Command results and mutation failures/restoration
  manifests/     # Candidate, fixture and evidence fingerprints
docs/
  ARCHITECTURE.md  # Update to describe the actual implementation and final defense
  adr/            # A few real decisions with context/options/consequences
```

Use the evidence fields in VERIFICATION.md. Reports may consolidate duplicate details through links, but every required observation needs an evidence location. Record actual agent rejections and human contributions only; if the brief asks for examples that did not occur, report that honestly. Never fabricate them to fill a quota. Track concise Markdown evidence, real ADRs and source attribution; exclude bulky generated logs/traces/screenshots from routine commits while retaining them locally with hashes. Supply those artifacts separately when requested. Do not add dependencies or image snapshots merely to increase file count.

README.md remains deferred under the user's existing instruction. Record setup and scenario controls in reports/run-instructions.md, and identify the missing README as a deferred submission item. No remote repository or deployment is required by this authorization.

## Git and generated output

Initialize local Git only if the intended project is not already a repository. Use the existing configured identity; resolve missing identity rather than inventing it. Commit the instruction/reference baseline and then actual milestones such as tooling, domain logic, mock API, UI, lifecycle handling, tests, fixes and evidence. Milestones are examples, not a mandate to manufacture history. Preserve meaningful reversals and do not squash everything into a final commit.

Each review uses a fixed application commit plus relevant hashes. Record the reviewed candidate separately from later evidence-only commits. At delivery report final HEAD, reviewed application commit, recent real commits, relevant verification results and remaining working-tree changes. If permissions or identity block Git, disclose it and use the documented manifest fallback while continuing useful work.

Generated dist/ is expected after npm run build; node_modules/ is expected after dependency installation. Keep both out of Git and out of this input package. .git/ is local history created during implementation, not an input artifact to fabricate now. Ignore .DS_Store, temporary render files, credentials and generated evidence. Commit reproducible source, configuration, lockfile, tests, required baselines, instructions, references, ADRs and concise reports using explicit paths and inspected diffs. Do not create a remote, push or deploy without another user request.
