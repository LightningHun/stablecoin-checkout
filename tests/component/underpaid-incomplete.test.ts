import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PaymentProgress from '../../src/features/checkout/components/PaymentProgress.vue'
import type { Payment } from '../../src/features/checkout/domain/paymentModel'
import { paymentSnapshot } from '../fixtures/oracles'

const hash = '9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'
const wrappers: VueWrapper[] = []
function render(payment = { ...paymentSnapshot('underpaid'), tx_hash: hash } as Payment, quoteExpired = true) {
  const wrapper = mount(PaymentProgress, { props: { payment, quoteExpired, canSendRemaining: !quoteExpired, health: 'fresh', lastChecked: null, decimals: 6 } })
  wrappers.push(wrapper)
  return wrapper
}
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('expired underpaid presentation', () => {
  it('uses the accepted snapshot for the receipt, original expiry and transaction without inventing a received time', () => {
    const wrapper = render()
    expect(wrapper.attributes('data-status')).toBe('underpaid')
    expect(wrapper.get('.progress-heading strong').text()).toBe('Payment incomplete')
    expect(wrapper.get('.incomplete-warning').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('[data-testid="incomplete-subtitle"]').text()).toMatch(/^120\.00 of 163\.69 USDT received · the rate for the rest expired at /)
    expect(wrapper.get('time').attributes('datetime')).toBe('2026-08-14T08:52:10.842Z')
    expect(wrapper.findAll('.receipt dt').map(node => node.text())).toEqual(['Received', 'Still owed', 'Transaction', 'Payment reference'])
    expect(wrapper.findAll('.receipt dd').map(node => node.text())).toEqual(['120.00 USDT', '43.69 USDT', '9d1f4c8a2be7…', 'AQH-100306-PMT'])
    expect(wrapper.get('.receipt a').attributes('href')).toBe('https://tronscan.org/transaction/9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20/overview')
    expect(wrapper.get('[data-testid="incomplete-description"]').text()).toBe('The remaining 43.69 USDT was not received before the rate expired. Do not send anything more to this address. Your previous payment is still recorded. Contact Payment Project with the details below for next steps.')
    expect(wrapper.text()).not.toMatch(/received at|Send only|refund|safe/)
    expect(wrapper.find('.partial-progress').exists()).toBe(false)
  })

  it('copies the original payment reference and resets the existing success feedback after three seconds', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const wrapper = render({ ...paymentSnapshot('underpaid'), payment_reference: 'CUSTOM-ORDER-123-PMT', merchant: { name: 'Another Merchant', logo_url: null }, amount_received: '100.01', amount_outstanding: '63.68', tx_hash: hash } as Payment)
    expect(wrapper.get('[data-testid="incomplete-description"]').text()).toContain('Contact Another Merchant')
    expect(wrapper.findAll('.receipt dd').map(node => node.text())).toEqual(['100.01 USDT', '63.68 USDT', '9d1f4c8a2be7…', 'CUSTOM-ORDER-123-PMT'])
    await wrapper.get('button').trigger('click'); await flushPromises()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('CUSTOM-ORDER-123-PMT')
    expect(wrapper.get('button').text()).toBe('Copied')
    expect(wrapper.get('.copy-control [role="status"]').text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(3000)
    expect(wrapper.get('button').text()).toBe('Copy reference')
    expect(wrapper.get('.copy-control [role="status"]').text()).toBe('')
  })

  it('keeps the normal underpaid send guidance until expiry and accepts a later paid snapshot', async () => {
    const wrapper = render(undefined, false)
    expect(wrapper.text()).toContain('Send only the outstanding 43.69 USDT.')
    expect(wrapper.find('.partial-progress').exists()).toBe(true)
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.setProps({ quoteExpired: true, canSendRemaining: false })
    expect(wrapper.get('.progress-heading strong').text()).toBe('Payment incomplete')
    await wrapper.setProps({ payment: paymentSnapshot('paid') as Payment })
    expect(wrapper.attributes('data-status')).toBe('paid')
    expect(wrapper.get('.progress-heading strong').text()).toBe('Paid')
    expect(wrapper.find('[data-testid="incomplete-description"]').exists()).toBe(false)
  })

  it.each(['awaiting_payment', 'detected', 'confirming', 'paid', 'overpaid', 'expired', 'failed'] as const)('does not apply the incomplete presentation to %s', status => {
    const wrapper = render(paymentSnapshot(status) as Payment)
    expect(wrapper.attributes('data-status')).toBe(status)
    expect(wrapper.text()).not.toContain('Payment incomplete')
    expect(wrapper.find('.underpaid-incomplete').exists()).toBe(false)
    expect(wrapper.find('[data-testid="incomplete-subtitle"]').exists()).toBe(false)
  })
})
