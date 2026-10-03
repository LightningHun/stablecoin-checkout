import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, onMounted } from 'vue'
import PaymentProgress from '../../src/features/checkout/components/PaymentProgress.vue'
import QuoteDetails from '../../src/features/checkout/components/QuoteDetails.vue'
import { usePaymentController } from '../../src/features/checkout/application/usePaymentController'
import type { PaymentClient } from '../../src/features/checkout/infrastructure/paymentClient'
import type { Payment } from '../../src/features/checkout/domain/paymentModel'
import { fixedNow, paymentSnapshot, sourceAddress } from '../fixtures/oracles'

describe('T11–T13 Vue presentation and T09 real mount disposal', () => {
  it('T12 renders exact outstanding value and removes original countdown', async () => {
    const wrapper = mount(QuoteDetails, { props: { payment: paymentSnapshot('underpaid') as Payment, remaining: 0 } })
    await flushPromises()
    expect(wrapper.get('[data-testid="transfer-amount"]').text()).toMatch(/^43\.69\s*USDT$/)
    expect(wrapper.get('[data-testid="transfer-address"]').text()).toBe(sourceAddress)
    expect(wrapper.find('[data-testid="countdown"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('T13 shows real excess facts and merchant assistance without a refund guarantee', () => {
    const wrapper = mount(PaymentProgress, { props: { payment: paymentSnapshot('overpaid') as Payment, health: 'fresh', lastChecked: fixedNow } })
    expect(wrapper.text()).toContain('180.00')
    expect(wrapper.text()).toContain('16.31')
    expect(wrapper.text()).not.toMatch(/automatic.{0,30}refund|will be refunded|went to Payment Project/i)
    wrapper.unmount()
  })
  it('T11 failed does not invent a received amount or transaction', () => {
    const wrapper = mount(PaymentProgress, { props: { payment: paymentSnapshot('failed') as Payment, health: 'fresh', lastChecked: fixedNow } })
    expect(wrapper.text()).toContain('settlement rejected')
    expect(wrapper.text()).not.toContain('Amount received')
    expect(wrapper.text()).not.toContain('Transaction')
    expect(wrapper.text()).toContain('Do not send again')
    wrapper.unmount()
  })
  it('T09 repeated real Vue mounting disposes the sole controller owner', async () => {
    vi.useFakeTimers()
    const empty = { data: [{ code: 'USDT', name: 'Tether', decimals: 6, networks: [{ id: 'tron', name: 'Tron (TRC-20)', network_fee: '1.00', required_confirmations: 1, avg_confirmation_seconds: 60 }] }], serverTime: new Date(fixedNow).toISOString(), start: 0, end: 0 }
    const client: PaymentClient = { currencies: vi.fn(async () => empty), create: vi.fn(), status: vi.fn(), requote: vi.fn() }
    const Host = defineComponent({ setup() { const controller = usePaymentController({ client }); onMounted(controller.initialize); return () => h('div', controller.health.value) } })
    try {
      for (let i = 0; i < 3; i++) {
        const wrapper = mount(Host)
        await flushPromises()
        expect(wrapper.text()).toBe('fresh')
        wrapper.unmount()
      }
      expect(vi.getTimerCount()).toBe(0)
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(10000)
      expect(client.status).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
})
