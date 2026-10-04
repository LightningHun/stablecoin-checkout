import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, type EffectScope } from 'vue'
import { usePaymentController, type RestoreResult } from '../../src/features/checkout/application/usePaymentController'
import { ClockService } from '../../src/features/checkout/infrastructure/ClockService'
import { ApiError, type ApiResult, type PaymentClient } from '../../src/features/checkout/infrastructure/paymentClient'
import { clearReference, loadReference, saveReference } from '../../src/features/checkout/infrastructure/paymentStorage'
import type { Currency, CurrencyCode, Payment } from '../../src/features/checkout/domain/paymentModel'
import { catalogueRows, fixedNow, paymentSnapshot } from '../fixtures/oracles'

const reference = 'AQH-100306-PMT'
const key = 'stablecoin-checkout:payment-reference:ORD-88213'
const scopes: EffectScope[] = []
const currencies: Currency[] = (['USDT', 'USDC', 'ETH'] as CurrencyCode[]).map(code => ({
  code, name: code, decimals: code === 'ETH' ? 18 : 6,
  networks: catalogueRows.filter(row => row[0] === code).map(row => ({
    id: row[2], name: row[3], network_fee: row[4], required_confirmations: row[5], avg_confirmation_seconds: row[6],
  })),
}))
const sample = <T>(data: T): ApiResult<T> => ({
  data, serverTime: new Date(Date.now()).toISOString(), start: Date.now() - fixedNow, end: Date.now() - fixedNow,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function setup(state: Parameters<typeof paymentSnapshot>[0] = 'awaiting_payment') {
  const current = paymentSnapshot(state) as Payment
  const client = {
    currencies: vi.fn<PaymentClient['currencies']>(async () => sample(currencies)),
    status: vi.fn<PaymentClient['status']>(async () => sample(current)),
    create: vi.fn<PaymentClient['create']>(async () => sample(current)),
    requote: vi.fn<PaymentClient['requote']>(async () => sample(current)),
  }
  const scope = effectScope()
  scopes.push(scope)
  const controller = scope.run(() => usePaymentController({
    client, clock: new ClockService(() => Date.now() - fixedNow, () => Date.now()),
  }))!
  return { controller, client, scope }
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(fixedNow) })
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('restore a payment from a validated server snapshot', () => {
  it('restores awaiting_payment, samples the clock and resumes polling', async () => {
    const { controller, client } = setup()
    await controller.initialize()
    const result: RestoreResult = await controller.restore(reference)
    expect(result).toBe('restored')
    expect(controller.payment.value?.payment_reference).toBe('AQH-100306-PMT')
    expect(controller.payment.value?.quote.total_due).toBe('163.69')
    expect(controller.draft.value).toEqual({ currency: 'USDT', network: 'tron' })
    expect(controller.remaining.value).toBe(900000)
    expect(controller.health.value).toBe('fresh')
    await vi.advanceTimersByTimeAsync(2000)
    expect(client.status).toHaveBeenCalledTimes(2)
    expect(controller.remaining.value).toBe(898000)
    expect(client.create).not.toHaveBeenCalled()
  })

  it.each(['paid', 'overpaid', 'failed', 'expired'] as const)('restored %s never schedules a poll', async state => {
    const { controller, client } = setup(state)
    await controller.initialize()
    expect(await controller.restore(reference)).toBe('restored')
    expect(controller.payment.value?.status).toBe(state)
    await vi.advanceTimersByTimeAsync(30000)
    window.dispatchEvent(new Event('focus'))
    expect(client.status).toHaveBeenCalledTimes(1)
  })

  it.each(['underpaid', 'detected', 'confirming'] as const)('restores %s as a new snapshot and observed funds survive the quote deadline', async state => {
    const { controller, client } = setup(state)
    await controller.initialize()
    expect(await controller.restore(reference)).toBe('restored')
    expect(controller.payment.value?.status).toBe(state)
    expect(controller.canChange.value).toBe(false)
    client.status.mockRejectedValue(new ApiError('HTTP 500', 500))
    vi.setSystemTime(fixedNow + 1000000)
    await vi.advanceTimersByTimeAsync(2000)
    if (state === 'underpaid') expect(controller.availability.value).toBe('local-deadline-reached')
    else expect(controller.availability.value).not.toBe('local-deadline-reached')
    expect(controller.payment.value?.status).toBe(state)
  })

  it('returns not-found on 404, leaves no payment and unlocks the selector', async () => {
    const { controller, client } = setup()
    await controller.initialize()
    client.status.mockRejectedValue(new ApiError('Unknown payment', 404))
    expect(await controller.restore(reference)).toBe('not-found')
    expect(controller.payment.value).toBeNull()
    expect(controller.canChange.value).toBe(true)
    expect(controller.restoring.value).toBe(false)
    expect(controller.error.value).toBe('')
    expect(controller.referenceMissing.value).toBe(true)
    await vi.advanceTimersByTimeAsync(30000)
    expect(client.status).toHaveBeenCalledTimes(1)
  })

  it.each([
    new TypeError('Disconnected'), new ApiError('HTTP 500', 500),
    new ApiError('The payment server returned invalid data. Transfer controls are paused.', 0, true),
  ])('keeps restore locked after $message and Retry repeats GET rather than catalogue loading', async failure => {
    const { controller, client } = setup()
    await controller.initialize()
    client.status.mockRejectedValueOnce(failure)
    expect(await controller.restore(reference)).toBe('unavailable')
    expect(controller.payment.value).toBeNull()
    expect(controller.health.value).toBe('unavailable')
    expect(controller.canChange.value).toBe(false)
    expect(controller.restoring.value).toBe(true)
    await controller.create()
    expect(client.create).not.toHaveBeenCalled()
    expect(await controller.retry()).toBe('restored')
    expect(client.status).toHaveBeenCalledTimes(2)
    expect(client.currencies).toHaveBeenCalledTimes(1)
    expect(controller.payment.value?.status).toBe('awaiting_payment')
    expect(controller.canChange.value).toBe(true)
  })

  it('times out using the existing request timeout and can retry restoration', async () => {
    const { controller, client } = setup()
    await controller.initialize()
    client.status.mockImplementationOnce((_ref, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const restoring = controller.restore(reference)
    await vi.advanceTimersByTimeAsync(10000)
    expect(await restoring).toBe('unavailable')
    expect(controller.canChange.value).toBe(false)
    expect(await controller.retry()).toBe('restored')
  })

  it('waits for the catalogue in the single-flight slot and coalesces restore/retry', async () => {
    const { controller, client } = setup()
    const catalogue = deferred<ApiResult<Currency[]>>()
    const status = deferred<ApiResult<Payment>>()
    client.currencies.mockReturnValueOnce(catalogue.promise)
    client.status.mockReturnValueOnce(status.promise)
    const initialized = controller.initialize()
    const first = controller.restore(reference)
    const second = controller.restore(reference)
    const retry = controller.retry()
    expect(controller.canChange.value).toBe(false)
    expect(client.status).not.toHaveBeenCalled()
    catalogue.resolve(sample(currencies))
    await initialized
    await Promise.resolve()
    expect(controller.currencies.value).toHaveLength(3)
    expect(client.status).toHaveBeenCalledTimes(1)
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(client.status).toHaveBeenCalledTimes(1)
    status.resolve(sample(paymentSnapshot() as Payment))
    expect(await first).toBe('restored')
    expect(await second).toBe('restored')
    expect(await retry).toBe('restored')
  })

  it('does not build a payment from the reference, and rejects a different response identity', async () => {
    const { controller, client } = setup()
    await controller.initialize()
    const status = deferred<ApiResult<Payment>>()
    client.status.mockReturnValueOnce(status.promise)
    const restoring = controller.restore('AQH-999999-PMT')
    expect(controller.payment.value).toBeNull()
    expect(controller.canChange.value).toBe(false)
    expect(client.status).toHaveBeenCalledWith('AQH-999999-PMT', expect.any(AbortSignal))
    status.resolve(sample(paymentSnapshot() as Payment))
    expect(await restoring).toBe('unavailable')
    expect(controller.payment.value).toBeNull()
    expect(controller.error.value).toBe('Unrecognized payment identity or state regression. Transfer controls are paused.')
  })

  it('keeps the controller storage-agnostic and accepts only the GET response', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const { controller } = setup('underpaid')
    await controller.initialize()
    await controller.restore(reference)
    expect(controller.payment.value).toMatchObject({
      payment_reference: 'AQH-100306-PMT', status: 'underpaid', amount_outstanding: '43.69',
      crypto_address: 'TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e',
    })
    expect(getItem).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('invalidates an in-flight restore on scope disposal without accepting or scheduling its late response', async () => {
    const { controller, client, scope } = setup()
    await controller.initialize()
    const status = deferred<ApiResult<Payment>>()
    client.status.mockReturnValueOnce(status.promise)
    const restoring = controller.restore(reference)
    const signal = client.status.mock.calls[0]![1]
    scope.stop()
    expect(signal.aborted).toBe(true)
    status.resolve(sample(paymentSnapshot('paid') as Payment))
    expect(await restoring).toBe('unavailable')
    expect(controller.payment.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('never bypasses the uncertain POST lock with restore or retry', async () => {
    const { controller, client } = setup()
    await controller.initialize()
    client.create.mockRejectedValue(new TypeError('Disconnected'))
    await controller.create()
    expect(controller.uncertain.value).toBe(true)
    expect(await controller.restore(reference)).toBe('unavailable')
    await controller.retry()
    expect(client.status).not.toHaveBeenCalled()
    expect(controller.canChange.value).toBe(false)
  })
})

describe('reference-only browser storage', () => {
  it('writes only one string key, loads it and clears it without touching unrelated storage', () => {
    localStorage.setItem('unrelated', 'keep')
    expect(loadReference()).toBeNull()
    saveReference('AQH-100306-PMT')
    expect(localStorage.getItem(key)).toBe('AQH-100306-PMT')
    expect(localStorage.length).toBe(2)
    expect(loadReference()).toBe('AQH-100306-PMT')
    clearReference()
    expect(loadReference()).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('keep')
  })
  it('treats an empty reference as absent', () => {
    localStorage.setItem(key, '')
    expect(loadReference()).toBeNull()
  })
  it('degrades safely when accessing localStorage itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(loadReference()).toBeNull()
    expect(() => saveReference(reference)).not.toThrow()
    expect(() => clearReference()).not.toThrow()
  })
  it('degrades safely when storage methods throw', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new DOMException('Blocked', 'QuotaExceededError') })
    }
    expect(loadReference()).toBeNull()
    expect(() => saveReference(reference)).not.toThrow()
    expect(() => clearReference()).not.toThrow()
  })
})
