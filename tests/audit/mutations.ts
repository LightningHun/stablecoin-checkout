export interface Mutation {
  id: string
  description: string
  requirements: string[]
  file: string
  patches: Array<{ before: string; after: string }>
  runner: 'vitest' | 'playwright'
  testFile: string
  testName: string
  expectedFailure: string
  category: 'mandatory' | 'targeted'
}
const controller = 'src/features/checkout/application/usePaymentController.ts'
const model = 'src/features/checkout/domain/paymentModel.ts'
const policy = 'src/features/checkout/domain/quotePolicy.ts'
const money = 'src/features/checkout/domain/money.ts'
const clock = 'src/features/checkout/infrastructure/ClockService.ts'
const quote = 'src/features/checkout/components/QuoteDetails.vue'
const progress = 'src/features/checkout/components/PaymentProgress.vue'
const componentTests = 'tests/component/controller.test.ts'
const policyTests = 'tests/unit/policy.test.ts'
const checkoutTests = 'tests/acceptance/checkout.spec.ts'
const patch = (before: string, after: string) => [{ before, after }]
export const mutations: Mutation[] = [
  {
    id: 'M01', description: 'Allow the original deadline to expire a detected payment', requirements: ['R06', 'T08'], file: policy,
    patches: patch('  if (!payment) return "unavailable";', `  if (!payment) return "unavailable";
  if (payment.status === "detected" && Date.parse(payment.quote.expires_at) <= now) return "local-deadline-reached";`),
    runner: 'vitest', testFile: componentTests, testName: 'T08 funds in detected survive deadline and HTTP 500', expectedFailure: 'local-deadline-reached', category: 'mandatory',
  },
  {
    id: 'M02', description: 'Decrease remaining time once per invocation instead of reading elapsed time', requirements: ['R05', 'T06'], file: clock,
    patches: [
      { before: '  private uncertainty = 0;', after: '  private uncertainty = 0;\n  private tickRemaining: number | null = null;' },
      { before: '    return Math.max(0, Date.parse(expiresAt) - this.now() - this.uncertainty);', after: `    this.tickRemaining = this.tickRemaining === null
      ? Math.max(0, Date.parse(expiresAt) - this.now() - this.uncertainty)
      : Math.max(0, this.tickRemaining - 1000);
    return this.tickRemaining;` },
    ],
    runner: 'vitest', testFile: 'tests/unit/clock.test.ts', testName: 'uses elapsed time after a coalesced two-minute suspension', expectedFailure: '780000', category: 'mandatory',
  },
  {
    id: 'M03', description: 'Remove the single-flight guard for polling requests', requirements: ['R07', 'T09'], file: controller,
    patches: patch('    if (active) return active;', '    // Deliberate G5 defect: start another GET even while one is active.'),
    runner: 'vitest', testFile: componentTests, testName: 'T09 slow GET and simultaneous focus/retry events keep maximum active GET at one', expectedFailure: 'called 1 times', category: 'mandatory',
  },
  {
    id: 'M04', description: 'Let terminal payments schedule and perform further automatic GET requests', requirements: ['R07', 'T10'], file: controller,
    patches: [
      { before: '      isTerminal(payment.value.status)\n', after: '      false\n' },
      { before: '      (!force && isTerminal(payment.value.status))', after: '      (!force && false)' },
    ],
    runner: 'vitest', testFile: componentTests, testName: 'T10 terminal paid does not schedule another poll', expectedFailure: 'length of 1', category: 'mandatory',
  },
  {
    id: 'M05', description: 'Accept a response from an old generation of the same payment reference', requirements: ['R03', 'R07', 'T03', 'T10'], file: model,
    patches: patch('    generation !== currentGeneration ||', '    (generation !== currentGeneration && false) ||'),
    runner: 'vitest', testFile: policyTests, testName: 'T10 rejects old references and same-reference old generations', expectedFailure: 'to be null', category: 'mandatory',
  },
  {
    id: 'M06', description: 'Pass scaled decimal money through Number and lose ETH precision', requirements: ['R13', 'T05'], file: money,
    patches: patch(`  return (
    BigInt(whole!) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0") || "0")
  );`, '  return BigInt(Math.round(Number(value) * 10 ** scale));'),
    runner: 'vitest', testFile: 'tests/unit/money.test.ts', testName: 'preserves the smallest ETH unit and every digit of a long ETH amount', expectedFailure: '1123456789012345678', category: 'mandatory',
  },
  {
    id: 'M07', description: 'Copy the previous Tron quote address after the seeded Ethereum replacement', requirements: ['R03', 'R04', 'T03', 'T04'], file: quote,
    patches: patch(':value="address"', `:value="quote.network === 'ethereum' ? 'TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e' : address"`),
    runner: 'playwright', testFile: 'tests/acceptance/transport.spec.ts', testName: 'T03 accepted replacement never mixes token network amount QR or clipboard', expectedFailure: '0x2222222222222222222222222222222222222222', category: 'mandatory',
  },
  {
    id: 'M08', description: 'Display full quote total in place of outstanding transfer amount', requirements: ['R09', 'T12'], file: quote,
    patches: patch('{{ amount }}', '{{ payment.quote.total_due }}'),
    runner: 'playwright', testFile: checkoutTests, testName: 'T12 underpaid sends only the outstanding amount and duplicate delivery is idempotent', expectedFailure: '43', category: 'mandatory',
  },
  {
    id: 'M09', description: 'Add an unsupported automatic excess-refund promise', requirements: ['R09', 'T13'], file: 'src/i18n/locales/en.ts',
    patches: patch('about next steps with your payment reference.', 'about next steps with your payment reference. The excess will be refunded automatically.'),
    runner: 'playwright', testFile: checkoutTests, testName: 'T13 overpaid exposes exact facts without an automatic refund or another send', expectedFailure: 'will be refunded', category: 'mandatory',
  },
  {
    id: 'M10', description: 'Skip pre-requote reconciliation and submit before discovering detected funds', requirements: ['R06', 'R10', 'T08', 'T14'], file: controller,
    patches: patch(`          const reconciled = await request((s) => client.status(reference, s));
          accept(reconciled, gen);
          if (
            reconciled.data.status !== "expired" ||
            hasFunds(reconciled.data.status)
          )
            return;`, '          // Deliberate G5 defect: requote without reconciling newly arrived funds.'),
    runner: 'vitest', testFile: componentTests, testName: 'T08/T14 M10 reconciliation observes detected funds before attempting a requote', expectedFailure: 'not be called', category: 'mandatory',
  },
  {
    id: 'M11', description: 'Convert an HTTP 500 transport fault into payment failed', requirements: ['R11', 'T15'], file: controller,
    patches: patch('  function markError(cause: unknown) {', `  function markError(cause: unknown) {
    if (cause instanceof ApiError && cause.status === 500 && payment.value) {
      payment.value = { ...payment.value, status: "failed", reason: "http_500" };
    }`),
    runner: 'playwright', testFile: checkoutTests, testName: 'T15 transport failure keeps known funds instead of inventing payment failed', expectedFailure: 'money arrived', category: 'mandatory',
  },
  {
    id: 'M12', description: 'Issue a new payment reference in the mock requote response', requirements: ['R10', 'R12', 'T14', 'T16'], file: 'backend/server.ts',
    patches: patch('              p.payment_reference,', '              `AQH-${sequence++}-PMT`,'),
    runner: 'vitest', testFile: 'tests/contract/http.test.ts', testName: 'T14 M12 server-confirmed expiry requotes with the same reference', expectedFailure: 'AQH-100306-PMT', category: 'mandatory',
  },
  {
    id: 'VM01', description: 'Remove mobile QR/address vertical stacking', requirements: ['R28', 'D03', 'T18'], file: 'src/styles/_checkout-shared.scss',
    patches: patch(`    .address-panel {
      flex-direction: column;`, `    .address-panel {
      flex-direction: row;`),
    runner: 'playwright', testFile: checkoutTests, testName: 'T18 responsive 390px and VM01 QR arrangement', expectedFailure: 'Mobile reference requires address below the QR', category: 'mandatory',
  },
  {
    id: 'VM02', description: 'Expose a Continue send action after funds are detected', requirements: ['R06', 'R28', 'D04', 'T08'], file: progress,
    patches: patch('    <div class="progress-heading">', `    <button v-if="payment?.status === 'detected'">Continue sending</button>
    <div class="progress-heading">`),
    runner: 'playwright', testFile: checkoutTests, testName: 'T08 VM02 detected removes every transfer action and survives deadline plus HTTP 500', expectedFailure: 'Received: 1', category: 'mandatory',
  },
  {
    id: 'A01', description: 'Replace exact addition with subtraction', requirements: ['R13', 'T05'], file: money,
    patches: patch('parseUnits(a, scale) + parseUnits(b, scale)', 'parseUnits(a, scale) - parseUnits(b, scale)'),
    runner: 'vitest', testFile: 'tests/unit/money.test.ts', testName: 'keeps the source amounts exact with independently specified results', expectedFailure: '163.69', category: 'targeted',
  },
  {
    id: 'A02', description: 'Replace exact subtraction with addition', requirements: ['R13', 'T05'], file: money,
    patches: patch('parseUnits(a, scale) - parseUnits(b, scale)', 'parseUnits(a, scale) + parseUnits(b, scale)'),
    runner: 'vitest', testFile: 'tests/unit/money.test.ts', testName: 'keeps the source amounts exact with independently specified results', expectedFailure: '43.69', category: 'targeted',
  },
  {
    id: 'A03', description: 'Accept a mismatched expected payment reference', requirements: ['R07', 'T10'], file: model,
    patches: patch('    incoming.payment_reference !== expectedReference', '    (incoming.payment_reference !== expectedReference && false)'),
    runner: 'vitest', testFile: 'tests/unit/audit-policy.test.ts', testName: 'T10 expected reference is checked even without a previous snapshot', expectedFailure: 'to be null', category: 'targeted',
  },
  {
    id: 'A04', description: 'Allow payment state regression in the reducer', requirements: ['R06', 'T08'], file: model,
    patches: patch('      !allowed[previous.status].includes(incoming.status))', '      (!allowed[previous.status].includes(incoming.status) && false))'),
    runner: 'vitest', testFile: policyTests, testName: 'rejects regressive payment snapshots after funds are observed', expectedFailure: 'to be null', category: 'targeted',
  },
  {
    id: 'A05', description: 'Permit decreasing confirmation counts', requirements: ['R07', 'T10'], file: model,
    patches: patch('    incoming.confirmations < previous.confirmations', '    (incoming.confirmations < previous.confirmations && false)'),
    runner: 'vitest', testFile: 'tests/unit/audit-policy.test.ts', testName: 'T10 confirmations cannot decrease within the same quote', expectedFailure: 'to be null', category: 'targeted',
  },
  {
    id: 'A06', description: 'Expose quote controls during blocked reconciliation', requirements: ['R03', 'T03'], file: policy,
    patches: patch('  if (blocked) return "reconciling";', '  if (blocked && false) return "reconciling";'),
    runner: 'vitest', testFile: policyTests, testName: 'server expiry and blocked reconciliation remain distinct', expectedFailure: 'reconciling', category: 'targeted',
  },
  {
    id: 'A07', description: 'Remove underpaid outstanding-transfer availability', requirements: ['R09', 'T12'], file: policy,
    patches: patch('  if (payment.status !== "awaiting_payment" && payment.status !== "underpaid")', '  if (payment.status !== "awaiting_payment")'),
    runner: 'vitest', testFile: 'tests/unit/underpaid-expiry.test.ts', testName: 'evaluates the original deadline at 899999 ms elapsed', expectedFailure: 'usable', category: 'targeted',
  },
  {
    id: 'A08', description: 'Accept callbacks after scope disposal and generation invalidation', requirements: ['R07', 'T09'], file: controller,
    patches: patch('    if (disposed || gen !== generation.value) return false;', '    if ((disposed || gen !== generation.value) && false) return false;'),
    runner: 'vitest', testFile: componentTests, testName: 'T09 scope disposal aborts in-flight GET and late finally cannot restart timers', expectedFailure: 'awaiting_payment', category: 'targeted',
  },
  {
    id: 'A09', description: 'Encode the previous Tron address after an Ethereum replacement', requirements: ['R03', 'R04', 'T03', 'T04'], file: quote,
    patches: patch('QRCode.toDataURL(value, {', `QRCode.toDataURL(quote.value.network === 'ethereum' ? 'TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e' : value, {`),
    runner: 'playwright', testFile: 'tests/acceptance/audit-transfer.spec.ts', testName: 'T03/T04 replacement QR independently decodes to the accepted Ethereum address', expectedFailure: 'Replacement QR must encode the accepted Ethereum address', category: 'targeted',
  },
]
