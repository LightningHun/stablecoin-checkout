import { describe, expect, it } from 'vitest'
import { parsePayment } from '../../src/features/checkout/infrastructure/responseSchemas'
import { paymentSnapshot, statuses } from '../fixtures/oracles'

describe('T11 boundary validation of independent wire payloads', () => {
  it.each(statuses)('accepts a full %s source snapshot', status => {
    expect(parsePayment(paymentSnapshot(status)).status).toBe(status)
  })
  it.each([
    { ...paymentSnapshot(), status: 'payment_complete' },
    { ...paymentSnapshot('detected'), confirmations: 1 },
    { ...paymentSnapshot('detected'), required_confirmations: 3 },
    { ...paymentSnapshot('paid'), confirmations: 0 },
    { ...paymentSnapshot('underpaid'), amount_outstanding: '43.68' },
    { ...paymentSnapshot('underpaid'), crypto_address: 'wrong-address' },
    { ...paymentSnapshot('overpaid'), amount_excess: '16.30' },
    { ...paymentSnapshot('underpaid'), amount_received: '-120.00' },
    { ...paymentSnapshot(), order_id: 'SOME-OTHER-ORDER' },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, total_due: '163.6900001' } },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, total_due: 163.69 } },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, expires_at: 'never' } },
  ])('rejects malformed, inconsistent or impossible payload %#', body => {
    expect(() => parsePayment(body)).toThrow()
  })
  it('T05 preserves authoritative total_due without recomputing a rounded rate', () => {
    const parsed = parsePayment({ ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, total_due: '163.690001' } })
    expect(parsed.quote.total_due).toBe('163.690001')
  })
})
