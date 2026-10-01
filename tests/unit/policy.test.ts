import { describe, expect, it } from 'vitest'
import { acceptSnapshot, hasFunds, isTerminal, type Payment } from '../../src/features/checkout/domain/paymentModel'
import { quoteAvailability, transferAmount } from '../../src/features/checkout/domain/quotePolicy'
import { fixedNow, paymentSnapshot } from '../fixtures/oracles'

const snapshot = (state: Parameters<typeof paymentSnapshot>[0] = 'awaiting_payment') => paymentSnapshot(state) as unknown as Payment

describe('T08/T10/T11 independent payment policy', () => {
  it.each(['paid', 'overpaid', 'failed', 'expired'] as const)('%s is terminal', state => expect(isTerminal(state)).toBe(true))
  it.each(['awaiting_payment', 'detected', 'confirming', 'underpaid'] as const)('%s is nonterminal', state => expect(isTerminal(state)).toBe(false))
  it.each(['detected', 'confirming', 'underpaid', 'paid', 'overpaid'] as const)('%s establishes observed funds', state => expect(hasFunds(state)).toBe(true))
  it('uses authoritative total rather than deriving it from rate or amount', () => {
    const payment = snapshot()
    payment.quote.total_due = '163.690001'
    expect(transferAmount(payment)).toBe('163.690001')
  })
  it('T12 exposes only the outstanding amount', () => expect(transferAmount(snapshot('underpaid'))).toBe('43.69'))
  it('allows skipped progress from awaiting directly to paid', () => expect(acceptSnapshot(snapshot(), snapshot('paid'))?.status).toBe('paid'))
  it('rejects regressive payment snapshots after funds are observed', () => expect(acceptSnapshot(snapshot('detected'), snapshot())).toBeNull())
  it('T10 rejects old references and same-reference old generations', () => {
    expect(acceptSnapshot(snapshot(), { ...snapshot(), payment_reference: 'OLD' }, 'AQH-100306-PMT', 2, 2)).toBeNull()
    expect(acceptSnapshot(snapshot(), snapshot('paid'), 'AQH-100306-PMT', 1, 2)).toBeNull()
  })
  it('T12/T13 duplicate snapshots are idempotent facts, never accumulated funds', () => {
    const first = acceptSnapshot(snapshot(), snapshot('underpaid'))!
    const duplicate = acceptSnapshot(first, snapshot('underpaid'))!
    expect(duplicate).toMatchObject({ amount_received: '120.00' })
    const excess = acceptSnapshot(snapshot(), snapshot('overpaid'))!
    expect(acceptSnapshot(excess, snapshot('overpaid'))).toMatchObject({ amount_received: '180.00' })
  })
  it('T07 exposes a live quote at 1ms before deadline but removes it at zero', () => {
    expect(quoteAvailability(snapshot(), fixedNow + 899999)).toBe('usable')
    expect(quoteAvailability(snapshot(), fixedNow + 900000)).toBe('local-deadline-reached')
    expect(quoteAvailability(snapshot(), fixedNow + 900001)).toBe('local-deadline-reached')
  })
  it.each(['detected', 'confirming', 'underpaid'] as const)('T08 %s never becomes expired by local time', state => {
    const policy = quoteAvailability(snapshot(state), fixedNow + 1800000)
    expect(policy).not.toBe('server-expired')
    expect(policy).not.toBe('local-deadline-reached')
    if (state === 'underpaid') expect(policy).toBe('usable')
  })
  it('server expiry and blocked reconciliation remain distinct', () => {
    expect(quoteAvailability(snapshot('expired'), fixedNow)).toBe('server-expired')
    expect(quoteAvailability(snapshot(), fixedNow, true)).toBe('reconciling')
  })
})
