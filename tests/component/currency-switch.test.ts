import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import AssetNetworkSelector from '../../src/features/checkout/components/AssetNetworkSelector.vue'
import type { Currency, CurrencyCode, Pair } from '../../src/features/checkout/domain/paymentModel'
import { catalogueRows, fixedNow } from '../fixtures/oracles'

const currencies: Currency[] = (['USDT', 'USDC', 'ETH'] as CurrencyCode[]).map(code => ({
  code,
  name: code,
  decimals: code === 'ETH' ? 18 : 6,
  networks: catalogueRows.filter(row => row[0] === code).map(row => ({
    id: row[2], name: row[3], network_fee: row[4],
    required_confirmations: row[5], avg_confirmation_seconds: row[6],
  })),
}))

let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(fixedNow)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
})

describe('currency defaults follow the displayed network order', () => {
  it.each([
    { currency: 'USDC', order: ['solana', 'polygon', 'ethereum'], expected: 'solana', label: 'Solana' },
    { currency: 'USDT', order: ['ethereum', 'tron'], expected: 'ethereum', label: 'Ethereum (ERC-20)' },
  ] as const)('selects the first listed network when switching to $currency', async ({ currency, order, expected, label }) => {
    const reorderedCurrencies = currencies.map(entry => entry.code === currency
      ? { ...entry, networks: order.map(id => entry.networks.find(network => network.id === id)!) }
      : entry)
    const initialPair: Pair = currency === 'USDC'
      ? { currency: 'USDT', network: 'tron' }
      : { currency: 'USDC', network: 'polygon' }
    wrapper = mount(AssetNetworkSelector, {
      props: { currencies: reorderedCurrencies, pair: initialPair, disabled: false },
    })

    await wrapper.get(`input[name="currency"][value="${currency}"]`).setValue(true)
    expect(wrapper.emitted('select')).toEqual([[{ currency, network: expected }]])
    expect(wrapper.emitted('continue')).toBeUndefined()

    await wrapper.setProps({ pair: { currency, network: expected } })
    expect(wrapper.findAll('input[name="network"]').map(input => input.attributes('value'))).toEqual(order)
    expect(wrapper.get('input[name="network"]:checked').attributes('value')).toBe(expected)
    expect(wrapper.get('[data-testid="continue"]').text()).toBe(`Continue with ${currency} on ${label}`)
  })
})
