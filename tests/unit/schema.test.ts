import { describe, expect, it } from 'vitest'
import { parsePayment } from '../../src/features/checkout/infrastructure/responseSchemas'
import { paymentSnapshot, statuses, catalogueRows } from '../fixtures/oracles'

const currencies = ['USDT', 'USDC', 'ETH'].map(code => ({
  code, name: code, decimals: code === 'ETH' ? 18 : 6,
  networks: catalogueRows.filter(row => row[0] === code).map(row => ({
    id: row[2], name: row[3], network_fee: row[4], required_confirmations: row[5], avg_confirmation_seconds: row[6],
  })),
}));

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
    { ...paymentSnapshot(), order_id: '' },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, total_due: '163.6900001' } },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, total_due: 163.69 } },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, expires_at: 'never' } },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, network_name: 'Ethereum (ERC-20)' } },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, crypto_address: '0x1111111111111111111111111111111111111111' } },
    { ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, crypto_currency: 'ETH' } },
  ])('rejects malformed, inconsistent or impossible payload %#', body => {
    expect(() => parsePayment(body, currencies)).toThrow()
  })
  it('T05 preserves authoritative total_due without recomputing a rounded rate', () => {
    const parsed = parsePayment({ ...paymentSnapshot(), quote: { ...paymentSnapshot().quote, total_due: '163.690001' } })
    expect(parsed.quote.total_due).toBe('163.690001')
  })
})
