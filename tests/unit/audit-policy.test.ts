import { describe, expect, it } from 'vitest'
import { acceptSnapshot, type Payment } from '../../src/features/checkout/domain/paymentModel'
import { paymentSnapshot, sourceQuote } from '../fixtures/oracles'

// Extra independent observations for mutation survivor triage. No production helper
// computes expected results, and these tests run in the ordinary Vitest suite too.
describe('G5 independent reducer safety observations', () => {
  it('T10 expected reference is checked even without a previous snapshot', () => {
    expect(acceptSnapshot(null, paymentSnapshot() as Payment, 'AQH-200000-PMT')).toBeNull()
  })
  it('T10 confirmations cannot decrease within the same quote', () => {
    const previous = { ...paymentSnapshot('confirming'), confirmations: 2, required_confirmations: 3,
      quote: { ...sourceQuote, network: 'ethereum', network_name: 'Ethereum (ERC-20)', required_confirmations: 3 },
    } as Payment
    const incoming = { ...previous, confirmations: 1 } as Payment
    expect(acceptSnapshot(previous, incoming)).toBeNull()
  })
  it.each(['detected', 'confirming', 'underpaid'] as const)('T08 observed %s cannot regress to server-expired', status => {
    expect(acceptSnapshot(paymentSnapshot(status) as Payment, paymentSnapshot('expired') as Payment)).toBeNull()
  })
})
