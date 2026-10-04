import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, watch, type EffectScope } from 'vue'
import { mount } from '@vue/test-utils'
import { usePaymentController } from '../../src/features/checkout/application/usePaymentController'
import { ClockService } from '../../src/features/checkout/infrastructure/ClockService'
import { ApiError, type ApiResult, type PaymentClient } from '../../src/features/checkout/infrastructure/paymentClient'
import type { Payment } from '../../src/features/checkout/domain/paymentModel'
import QuoteDetails from '../../src/features/checkout/components/QuoteDetails.vue'
import PaymentProgress from '../../src/features/checkout/components/PaymentProgress.vue'
import { fixedNow, paymentSnapshot } from '../fixtures/oracles'

const scopes: EffectScope[] = []
const snapshot = (state: Parameters<typeof paymentSnapshot>[0]) => paymentSnapshot(state) as Payment
const sample = <T>(data: T): ApiResult<T> => ({ data, serverTime: new Date(Date.now()).toISOString(), start: 0, end: 0 })
function setup(initial = snapshot('underpaid'), clock = new ClockService(() => Date.now() - fixedNow, () => Date.now())) {
  let current = initial
  const client = {
    currencies: vi.fn<PaymentClient['currencies']>(async () => sample([{ code: 'USDT', name: 'Tether', decimals: 6,
      networks: [{ id: 'tron', name: 'Tron (TRC-20)', network_fee: '1.00', required_confirmations: 1, avg_confirmation_seconds: 60 }] }])),
    create: vi.fn<PaymentClient['create']>(async () => sample(current)),
    status: vi.fn<PaymentClient['status']>(async () => sample(current)),
    requote: vi.fn<PaymentClient['requote']>(async () => sample(current)),
  }
  const scope = effectScope(); scopes.push(scope)
  const controller = scope.run(() => usePaymentController({ client, clock }))!
  return { controller, client, scope, setCurrent(p: Payment) { current = p } }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(fixedNow) })
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.useRealTimers() })

describe('underpaid countdown, reconciliation and recovery', () => {
  it('entering underpaid five minutes later keeps ten minutes, then counts down', async () => {
    const { controller, setCurrent } = setup(snapshot('awaiting_payment'))
    await controller.initialize(); await controller.create()
    vi.setSystemTime(fixedNow + 300000)
    setCurrent(snapshot('underpaid')); await controller.retry()
    expect(controller.payment.value?.quote.expires_at).toBe('2026-08-14T08:52:10.842Z')
    expect(controller.remaining.value).toBe(600000)
    const wrapper = mount(QuoteDetails, { props: { payment: controller.payment.value!, remaining: controller.remaining.value } })
    expect(wrapper.get('[data-testid="countdown"]').text()).toBe('10:00')
    await vi.advanceTimersByTimeAsync(1000)
    await wrapper.setProps({ remaining: controller.remaining.value })
    expect(wrapper.get('[data-testid="countdown"]').text()).toBe('09:59')
    await wrapper.setProps({ remaining: -1 })
    expect(wrapper.get('[data-testid="countdown"]').text()).toBe('00:00')
    wrapper.unmount()
  })

  it.each(['awaiting_payment', 'underpaid'] as const)('expires during a slow GET from %s without overlapping requests or reviving on an old clock sample', async initial => {
    const payment = { ...snapshot('underpaid'), quote: { ...snapshot('underpaid').quote, expires_at: '2026-08-14T08:37:11.842Z' } }
    const { controller, client, setCurrent } = setup({ ...snapshot(initial), quote: payment.quote })
    await controller.initialize(); await controller.create()
    const stale = sample(payment)
    let resolve!: (response: ApiResult<Payment>) => void
    client.status.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const pending = controller.retry()
    await vi.advanceTimersByTimeAsync(1250)
    expect(controller.remaining.value).toBe(0)
    expect(controller.availability.value).toBe('local-deadline-reached')
    expect(client.status).toHaveBeenCalledTimes(1)
    resolve(stale); await pending
    expect(controller.availability.value).toBe('local-deadline-reached')
    expect(controller.remaining.value).toBe(0)
    expect(controller.payment.value).toEqual(payment)
    expect(controller.canChange.value).toBe(false)
    setCurrent({ ...snapshot('paid'), quote: payment.quote })
    await vi.advanceTimersByTimeAsync(2000)
    expect(controller.payment.value?.status).toBe('paid')
    expect(client.status).toHaveBeenCalledTimes(2)
  })

  it('HTTP 500 at expiry preserves the receipt and keeps polling until paid', async () => {
    const { controller, client, setCurrent } = setup()
    await controller.initialize(); await controller.create()
    client.status.mockRejectedValue(new ApiError('HTTP 500', 500))
    vi.setSystemTime(fixedNow + 900000)
    await vi.advanceTimersByTimeAsync(250)
    expect(controller.health.value).toBe('stale')
    expect(controller.availability.value).toBe('local-deadline-reached')
    expect(controller.payment.value).toMatchObject({ payment_reference: 'AQH-100306-PMT', order_id: 'ORD-88213', status: 'underpaid', amount_received: '120.00', amount_outstanding: '43.69', tx_hash: '9d1f4c8a2be7...' })
    const progress = mount(PaymentProgress, { props: { payment: controller.payment.value, health: 'stale', lastChecked: fixedNow, canSendRemaining: false } })
    expect(progress.text()).toContain('Outstanding balance: 43.69 USDT')
    expect(progress.text()).toContain('120.00 USDT')
    expect(progress.text()).not.toContain('Send only')
    progress.unmount()
    setCurrent(snapshot('paid')); client.status.mockImplementation(async () => sample(snapshot('paid')))
    await vi.advanceTimersByTimeAsync(2000)
    expect(controller.payment.value?.status).toBe('paid')
    expect(client.requote).not.toHaveBeenCalled()
  })

  it('a suspended monotonic clock blocks underpaid sending until the server is resampled', async () => {
    const { controller, client } = setup(snapshot('underpaid'), new ClockService(() => 0, () => Date.now()))
    await controller.initialize(); await controller.create()
    client.status.mockRejectedValue(new TypeError('Disconnected'))
    vi.setSystemTime(fixedNow + 1000000)
    document.dispatchEvent(new Event('visibilitychange'))
    await controller.retry()
    expect(controller.availability.value).toBe('reconciling')
    client.status.mockResolvedValue(sample(snapshot('underpaid')))
    await controller.retry()
    expect(controller.remaining.value).toBe(0)
    expect(controller.availability.value).toBe('local-deadline-reached')
  })

  it('restoring an already expired underpayment never exposes a usable quote', async () => {
    vi.setSystemTime(fixedNow + 900000)
    const { controller, scope } = setup()
    const seen: string[] = []
    scope.run(() => watch(controller.availability, value => seen.push(value), { flush: 'sync' }))
    expect(await controller.restore('AQH-100306-PMT')).toBe('restored')
    expect(controller.remaining.value).toBe(0)
    expect(controller.availability.value).toBe('local-deadline-reached')
    expect(seen).not.toContain('usable')
    expect(controller.payment.value?.status).toBe('underpaid')
  })
})
