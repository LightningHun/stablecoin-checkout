import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, type EffectScope } from 'vue'
import { usePaymentController } from '../../src/features/checkout/application/usePaymentController'
import { ClockService } from '../../src/features/checkout/infrastructure/ClockService'
import { ApiError, type ApiResult, type PaymentClient } from '../../src/features/checkout/infrastructure/paymentClient'
import type { Currency, CurrencyCode, Pair, Payment } from '../../src/features/checkout/domain/paymentModel'
import { catalogueRows, fixedNow, paymentSnapshot, sourceQuote } from '../fixtures/oracles'

const pair: Pair = { currency: 'USDT', network: 'tron' }
const scopes: EffectScope[] = []
const sample = <T>(data: T): ApiResult<T> => ({ data, serverTime: new Date(Date.now()).toISOString(), start: Date.now() - fixedNow, end: Date.now() - fixedNow })
const payment = (status: Parameters<typeof paymentSnapshot>[0] = 'awaiting_payment') => paymentSnapshot(status) as unknown as Payment
const currencies: Currency[] = (['USDT', 'USDC', 'ETH'] as CurrencyCode[]).map(code => ({ code, name: code, decimals: code === 'ETH' ? 18 : 6, networks: catalogueRows.filter(row => row[0] === code).map(row => ({ id: row[2], name: row[3], network_fee: row[4], required_confirmations: row[5], avg_confirmation_seconds: row[6] })) }))

async function setup(initial = payment(), clock = new ClockService(() => Date.now() - fixedNow, () => Date.now())) {
  let current = initial
  const client = {
    currencies: vi.fn<PaymentClient['currencies']>(async () => sample(currencies)),
    create: vi.fn<PaymentClient['create']>(async () => sample(current)),
    status: vi.fn<PaymentClient['status']>(async () => sample(current)),
    requote: vi.fn<PaymentClient['requote']>(async () => sample(current)),
  }
  const scope = effectScope()
  scopes.push(scope)
  const controller = scope.run(() => usePaymentController({ client, clock, pollMs: 2000, timeoutMs: 10000 }))!
  await controller.initialize()
  await controller.create(pair)
  await nextTick()
  return { controller, client, scope, setCurrent(value: Payment) { current = value } }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(fixedNow) })
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.useRealTimers() })

describe('T06–T15 actual composable lifecycle', () => {
  it.each(['detected', 'confirming', 'underpaid'] as const)('T08 funds in %s survive deadline and HTTP 500', async state => {
    const { controller, setCurrent, client } = await setup()
    setCurrent(payment(state))
    await controller.retry()
    expect(controller.payment.value?.status).toBe(state)
    client.status.mockRejectedValue(new ApiError('HTTP 500', 500))
    vi.setSystemTime(fixedNow + 1000000)
    await vi.advanceTimersByTimeAsync(1000)
    await controller.retry()
    expect(controller.payment.value?.status).toBe(state)
    expect(controller.availability.value).not.toBe('server-expired')
    expect(controller.availability.value).not.toBe('local-deadline-reached')
    expect(controller.health.value).toBe('stale')
    expect(controller.canChange.value).toBe(false)
  })
  it('T06 one coalesced timer callback reads the absolute elapsed two minutes', async () => {
    const { controller } = await setup()
    expect(controller.remaining.value).toBe(900000)
    vi.setSystemTime(fixedNow + 119000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(controller.remaining.value).toBe(780000)
  })
  it('T07 offline resume with halted monotonic clock withholds sending until the server clock is resampled', async () => {
    const clock = new ClockService(() => 0, () => Date.now())
    const { controller, client } = await setup(payment(), clock)
    expect(controller.availability.value).toBe('usable')
    client.status.mockRejectedValue(new TypeError('Disconnected'))
    vi.setSystemTime(fixedNow + 120000)
    window.dispatchEvent(new Event('focus'))
    await controller.retry()
    expect(controller.payment.value?.status).toBe('awaiting_payment')
    expect(controller.health.value).toBe('stale')
    expect(controller.availability.value).not.toBe('usable')
    expect(controller.canChange.value).toBe(false)
    client.status.mockResolvedValue(sample(payment()))
    await controller.retry()
    expect(controller.availability.value).toBe('usable')
    expect(controller.remaining.value).toBe(780000)
  })
  it('T09 slow GET and simultaneous focus/retry events keep maximum active GET at one', async () => {
    const { controller, client } = await setup()
    let resolveStatus: ((value: ApiResult<Payment>) => void) | undefined
    client.status.mockImplementation(() => new Promise(resolve => { resolveStatus = resolve }))
    const first = controller.retry()
    void controller.retry()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(6000)
    expect(client.status).toHaveBeenCalledTimes(1)
    resolveStatus!(sample(payment()))
    await first
    await nextTick()
    expect(client.status).toHaveBeenCalledTimes(1)
  })
  it.each(['paid', 'overpaid', 'failed', 'expired'] as const)('T10 terminal %s does not schedule another poll', async state => {
    const { controller, client, setCurrent } = await setup()
    setCurrent(payment(state))
    await controller.retry()
    expect(controller.payment.value?.status).toBe(state)
    const calls = client.status.mock.calls.length
    await vi.advanceTimersByTimeAsync(30000)
    expect(client.status.mock.calls).toHaveLength(calls)
  })
  it('T09 scope disposal aborts in-flight GET and late finally cannot restart timers', async () => {
    const { controller, client, scope } = await setup()
    let finish: ((value: ApiResult<Payment>) => void) | undefined
    let pendingSignal: AbortSignal | undefined
    client.status.mockImplementation((_reference, signal) => { pendingSignal = signal; return new Promise(resolve => { finish = resolve }) })
    const pending = controller.retry()
    scope.stop()
    expect(pendingSignal?.aborted).toBe(true)
    finish!(sample(payment('paid')))
    await pending
    await vi.advanceTimersByTimeAsync(30000)
    expect(controller.payment.value?.status).toBe('awaiting_payment')
    expect(client.status).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('T09 repeated mount/unmount equivalents remove focus listeners', async () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    for (let i = 0; i < 3; i++) {
      const { scope, client } = await setup()
      scope.stop()
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(3000)
      expect(client.status).not.toHaveBeenCalled()
    }
    const registered = add.mock.calls.filter(([type]) => type === 'focus')
    const removed = remove.mock.calls.filter(([type]) => type === 'focus')
    expect(registered).toHaveLength(3)
    expect(removed).toHaveLength(3)
    for (const entry of registered) expect(removed.some(item => item[1] === entry[1])).toBe(true)
  })
  it('T15 HTTP 500 retains financial facts and recovers on manual retry', async () => {
    const { controller, client } = await setup()
    client.status.mockRejectedValueOnce(new ApiError('HTTP 500', 500))
    await controller.retry()
    expect(controller.payment.value?.status).toBe('awaiting_payment')
    expect(controller.health.value).toBe('stale')
    await controller.retry()
    expect(controller.payment.value?.status).toBe('awaiting_payment')
    expect(controller.health.value).toBe('fresh')
  })
  it('T15 request timeout aborts a slow GET while retaining the known financial state', async () => {
    const { controller, client } = await setup()
    let signal: AbortSignal | undefined
    client.status.mockImplementation((_reference, requestSignal) => {
      signal = requestSignal
      return new Promise((_resolve, reject) => requestSignal.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError'))))
    })
    const pending = controller.retry()
    await vi.advanceTimersByTimeAsync(10001)
    await pending
    expect(signal?.aborted).toBe(true)
    expect(controller.payment.value?.status).toBe('awaiting_payment')
    expect(controller.health.value).toBe('stale')
    expect(client.status).toHaveBeenCalledTimes(1)
  })
  it('T11 a protocol block survives a later transport failure until a validated response restores trust', async () => {
    const { controller, client } = await setup()
    client.status.mockRejectedValueOnce(new ApiError('Invalid JSON', 0, true))
    await controller.retry()
    expect(controller.availability.value).not.toBe('usable')
    client.status.mockRejectedValueOnce(new ApiError('HTTP 500', 500))
    await controller.retry()
    expect(controller.availability.value).not.toBe('usable')
    expect(controller.canChange.value).toBe(false)
    await controller.retry()
    expect(controller.availability.value).toBe('usable')
    expect(controller.payment.value?.status).toBe('awaiting_payment')
  })
  it('T15 repeated GET failures back off rather than hammering the server', async () => {
    const { controller, client } = await setup()
    client.status.mockRejectedValue(new ApiError('HTTP 500', 500))
    await controller.retry()
    await vi.advanceTimersByTimeAsync(1900)
    expect(client.status).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(client.status).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3900)
    expect(client.status).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(client.status).toHaveBeenCalledTimes(3)
  })
  it('T03/T10 ignores an old response delivered during serialized replacement', async () => {
    const { controller, client } = await setup()
    let finishOld: ((value: ApiResult<Payment>) => void) | undefined
    client.status.mockImplementation(() => new Promise(resolve => { finishOld = resolve }))
    const oldGet = controller.retry()
    const replacement = { ...payment(), payment_reference: 'AQH-200000-PMT', quote: { ...sourceQuote, crypto_currency: 'USDC', network: 'polygon', network_name: 'Polygon', crypto_amount: '162.71', network_fee: '0.10', total_due: '162.81', crypto_address: '0x3333333333333333333333333333333333333333', required_confirmations: 6 } } as Payment
    client.create.mockResolvedValue(sample(replacement))
    const selecting = controller.select({ currency: 'USDC', network: 'polygon' })
    expect(controller.availability.value).toBe('reconciling')
    expect(client.create).toHaveBeenCalledTimes(1)
    finishOld!(sample(payment('paid')))
    await oldGet
    await selecting
    expect(controller.payment.value?.status).toBe('awaiting_payment')
    expect(controller.payment.value?.payment_reference).toBe('AQH-200000-PMT')
    expect(controller.payment.value?.quote.crypto_address).toBe('0x3333333333333333333333333333333333333333')
  })
  it('T15 uncertain creation failure never retries the POST automatically', async () => {
    const { controller, client } = await setup()
    client.create.mockRejectedValue(new TypeError('Network disconnected'))
    await controller.select({ currency: 'USDC', network: 'polygon' })
    await vi.advanceTimersByTimeAsync(120000)
    expect(client.create).toHaveBeenCalledTimes(2)
    expect(controller.availability.value).not.toBe('usable')
  })
  it('T15 creation HTTP 500 is an uncertain mutation outcome and blocks a second creation', async () => {
    const { controller, client } = await setup()
    client.create.mockRejectedValue(new ApiError('HTTP 500', 500))
    await controller.select({ currency: 'USDC', network: 'polygon' })
    expect(controller.uncertain.value).toBe(true)
    expect(controller.availability.value).not.toBe('usable')
    expect(controller.canChange.value).toBe(false)
    await controller.create(pair)
    await controller.retry()
    await vi.advanceTimersByTimeAsync(120000)
    expect(client.create).toHaveBeenCalledTimes(2)
  })
  it('T11 received-money regression preserves the previous verified amount and pauses transfer', async () => {
    const { controller, setCurrent } = await setup()
    setCurrent(payment('underpaid'))
    await controller.retry()
    setCurrent({ ...payment('underpaid'), amount_received: '100.00', amount_outstanding: '63.69' } as Payment)
    await controller.retry()
    expect(controller.payment.value).toMatchObject({ amount_received: '120.00', amount_outstanding: '43.69' })
    expect(controller.health.value).toBe('stale')
    expect(controller.availability.value).not.toBe('usable')
  })
  it('T08/T14 M10 reconciliation observes detected funds before attempting a requote', async () => {
    const { controller, client, setCurrent } = await setup()
    setCurrent(payment('expired'))
    await controller.retry()
    setCurrent(payment('detected'))
    await controller.requote()
    expect(controller.payment.value?.status).toBe('detected')
    expect(client.requote).not.toHaveBeenCalled()
    expect(controller.canChange.value).toBe(false)
  })
  it('T14 409 triggers a refetch and never fabricates expiry', async () => {
    const { controller, client, setCurrent } = await setup()
    setCurrent(payment('expired'))
    await controller.retry()
    client.requote.mockRejectedValue(new ApiError('Quote has not expired', 409))
    const calls = client.status.mock.calls.length
    await controller.requote()
    expect(client.status.mock.calls.length).toBeGreaterThanOrEqual(calls + 2)
    expect(controller.payment.value?.quote.expires_at).toBe(sourceQuote.expires_at)
    expect(controller.payment.value?.payment_reference).toBe('AQH-100306-PMT')
  })
  it('T14 double submission sends exactly one requote mutation', async () => {
    const { controller, client, setCurrent } = await setup()
    setCurrent(payment('expired'))
    await controller.retry()
    const newPayment = { ...payment(), quote: { ...sourceQuote, expires_at: '2026-08-14T09:07:10.842Z' } } as Payment
    client.requote.mockResolvedValue(sample(newPayment))
    await Promise.all([controller.requote(), controller.requote()])
    expect(client.requote).toHaveBeenCalledTimes(1)
    expect(controller.payment.value?.payment_reference).toBe('AQH-100306-PMT')
    expect(controller.payment.value?.quote.expires_at).toBe('2026-08-14T09:07:10.842Z')
  })
})
