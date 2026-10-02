import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TransactionLink from '../../src/features/checkout/components/TransactionLink.vue'
import PaymentProgress from '../../src/features/checkout/components/PaymentProgress.vue'
import type { Payment } from '../../src/features/checkout/domain/paymentModel'
import { paymentSnapshot } from '../fixtures/oracles'

const hex = '9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'
const evm = '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'
const solana = 'cB5S93YMJGZggvjc58ioc7My7pHt387wECNfFGZExpXCEN9xND2ACbZDKu88a16dEX9v1t1E5PAdGJTiR1fntGB'

describe('transaction explorer links', () => {
  it.each([
    ['ethereum', evm, '0x9d1f4c8a2b…', 'https://etherscan.io/tx/0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20', 'Etherscan'],
    ['polygon', evm, '0x9d1f4c8a2b…', 'https://polygonscan.com/tx/0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20', 'PolygonScan'],
    ['tron', hex, '9d1f4c8a2be7…', 'https://tronscan.org/transaction/9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20/overview', 'TRONSCAN'],
    ['solana', solana, 'cB5S93YMJGZg…', 'https://solscan.io/tx/cB5S93YMJGZggvjc58ioc7My7pHt387wECNfFGZExpXCEN9xND2ACbZDKu88a16dEX9v1t1E5PAdGJTiR1fntGB', 'Solscan'],
  ])('links %s to the full transaction and exposes the full hash on hover', (network, hash, label, url, explorer) => {
    const wrapper = mount(TransactionLink, { props: { network, hash } })
    const link = wrapper.get('a')
    expect(link.text()).toBe(label)
    expect(link.attributes('href')).toBe(url)
    expect(link.attributes('title')).toBe(hash)
    expect(link.attributes('aria-label')).toBe(`Transaction ${hash} on ${explorer} (opens in a new tab)`)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.get('svg').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it.each([
    ['tron', '9d1f4c8a2be7...'],
    ['ethereum', hex],
    ['solana', 'javascript:alert(1)'],
    ['solana', '0'.repeat(88)],
    ['polygon', `${evm}/../other`],
    ['unknown', evm],
    ['__proto__', evm],
  ])('does not invent an explorer URL for %s with an incomplete or unsupported hash', (network, hash) => {
    const wrapper = mount(TransactionLink, { props: { network, hash } })
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toBe(hash)
    wrapper.unmount()
  })

  it('updates the explorer and full hover text when the accepted transaction changes', async () => {
    const wrapper = mount(TransactionLink, { props: { network: 'tron', hash: hex } })
    await wrapper.setProps({ network: 'polygon', hash: evm })
    expect(wrapper.get('a').attributes('href')).toBe('https://polygonscan.com/tx/0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20')
    expect(wrapper.get('a').attributes('title')).toBe(evm)
    wrapper.unmount()
  })

  it.each(['detected', 'confirming', 'underpaid', 'paid', 'overpaid'] as const)('shows the accepted full hash in the %s receipt', status => {
    const payment = { ...paymentSnapshot(status), tx_hash: hex } as Payment
    const wrapper = mount(PaymentProgress, { props: { payment, health: 'fresh', lastChecked: null } })
    const link = wrapper.get('a.transaction-link')
    expect(link.attributes('href')).toBe('https://tronscan.org/transaction/9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20/overview')
    expect(link.attributes('title')).toBe(hex)
    wrapper.unmount()
  })
})
