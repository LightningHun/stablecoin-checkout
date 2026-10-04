import { describe, expect, it } from 'vitest'
import { quoteAvailability } from '../../src/features/checkout/domain/quotePolicy'
import type { Payment } from '../../src/features/checkout/domain/paymentModel'
import { fixedNow, paymentSnapshot } from '../fixtures/oracles'

describe('underpaid quote deadline is separate from received funds', () => {
  it.each([
    [899999, 'usable'],
    [900000, 'local-deadline-reached'],
    [900001, 'local-deadline-reached'],
  ])('evaluates the original deadline at %i ms elapsed', (elapsed, expected) => {
    const payment = paymentSnapshot('underpaid') as Payment
    expect(quoteAvailability(payment, fixedNow + Number(elapsed))).toBe(expected)
    expect(payment).toMatchObject({ status: 'underpaid', amount_received: '120.00', amount_outstanding: '43.69' })
  })
  it('cannot send while the clock or response is being reconciled', () => {
    expect(quoteAvailability(paymentSnapshot('underpaid') as Payment, fixedNow, true)).toBe('reconciling')
  })
})
