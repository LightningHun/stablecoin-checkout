import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import CheckoutPage from '../../src/features/checkout/CheckoutPage.vue'
import AssetNetworkSelector from '../../src/features/checkout/components/AssetNetworkSelector.vue'
import type { Currency, CurrencyCode, Pair, Payment } from '../../src/features/checkout/domain/paymentModel'
import * as paymentClient from '../../src/features/checkout/infrastructure/paymentClient'
import type { ApiResult, PaymentClient } from '../../src/features/checkout/infrastructure/paymentClient'
import { catalogueRows, fixedNow, paymentSnapshot, sourceAddress, sourceQuote, syntheticQuotes } from '../fixtures/oracles'

const currencies: Currency[] = (['USDT', 'USDC', 'ETH'] as CurrencyCode[]).map(code => ({
  code,
  name: code,
  decimals: code === 'ETH' ? 18 : 6,
  networks: catalogueRows.filter(row => row[0] === code).map(row => ({
    id: row[2], name: row[3], network_fee: row[4],
    required_confirmations: row[5], avg_confirmation_seconds: row[6],
  })),
}))

const sample = <T>(data: T): ApiResult<T> => ({
  data, serverTime: new Date(fixedNow).toISOString(), start: performance.now(), end: performance.now(),
})

let wrapper: VueWrapper | undefined
let host: HTMLDivElement | undefined

async function setup() {
  let current = paymentSnapshot() as Payment
  let created = 0
  const client = {
    currencies: vi.fn<PaymentClient['currencies']>(async () => sample(currencies)),
    create: vi.fn<PaymentClient['create']>(async (pair: Pair) => {
      const row = catalogueRows.find(entry => entry[0] === pair.currency && entry[2] === pair.network)!
      const vector = pair.currency === 'USDT' && pair.network === 'tron'
        ? sourceQuote
        : syntheticQuotes[`${pair.currency}/${pair.network}` as keyof typeof syntheticQuotes]
      current = {
        ...paymentSnapshot(),
        payment_reference: `AQH-${100306 + created++}-PMT`,
        quote: {
          ...sourceQuote, ...vector, crypto_currency: pair.currency, network: pair.network,
          network_name: row[3], network_fee: row[4], required_confirmations: row[5],
        },
      } as Payment
      return sample(current)
    }),
    status: vi.fn<PaymentClient['status']>(async () => sample(current)),
    requote: vi.fn<PaymentClient['requote']>(async () => sample(current)),
  }
  vi.spyOn(paymentClient, 'createPaymentClient').mockReturnValue(client)
  host = document.createElement('div')
  document.body.append(host)
  wrapper = mount(CheckoutPage, { attachTo: host })
  await flushPromises()
  await wrapper.get('[data-testid="continue"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('[data-testid="transfer-address"]').text()).toBe(sourceAddress)
  await wrapper.get('[data-testid="change"]').trigger('click')
  return { page: wrapper, client }
}

function expectNoTransferControls(page: VueWrapper) {
  for (const id of ['transfer-amount', 'transfer-address', 'transfer-qr', 'copy-amount', 'copy-address']) {
    expect(page.find(`[data-testid="${id}"]`).exists()).toBe(false)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(fixedNow)
})
afterEach(() => {
  wrapper?.unmount()
  host?.remove()
  wrapper = undefined
  host = undefined
  vi.useRealTimers()
})

describe('currency changes after reopening the checkout selector', () => {
  it('keeps each currency network list open without replacing the existing quote', async () => {
    const { page, client } = await setup()
    expectNoTransferControls(page)

    for (const [currency, networks, firstNetwork] of [
      ['USDC', ['Ethereum (ERC-20)', 'Polygon', 'Solana'], 'ethereum'],
      ['ETH', ['Ethereum'], 'ethereum'],
      ['USDT', ['Tron (TRC-20)', 'Ethereum (ERC-20)'], 'tron'],
    ] as const) {
      await page.get(`input[name="currency"][value="${currency}"]`).setValue(true)
      await flushPromises()
      expect(page.findAll('input[name="network"]').map(input => input.attributes('aria-label'))).toEqual(networks)
      expect(page.get('input[name="network"]:checked').attributes('value')).toBe(firstNetwork)
      expect(page.get('[data-testid="continue"]').text()).toContain(`Continue with ${currency} on`)
      expect(page.find('[data-testid="quote-loading"]').exists()).toBe(false)
      expectNoTransferControls(page)
      expect(client.create).toHaveBeenCalledTimes(2)
      expect(client.requote).not.toHaveBeenCalled()
    }
  })

  it('keeps network changes pending until Continue and restores send-section focus', async () => {
    const { page, client } = await setup()
    await page.get('input[name="currency"][value="USDC"]').setValue(true)
    await flushPromises()
    expect(client.create).toHaveBeenCalledTimes(2)
    for (const network of ['solana', 'ethereum', 'solana']) {
      await page.get(`input[name="network"][value="${network}"]`).setValue(true)
      await flushPromises()
      expect(client.create).toHaveBeenCalledTimes(2)
      expect(page.find('.selector').exists()).toBe(true)
      expect(page.find('[data-testid="quote-loading"]').exists()).toBe(false)
      expectNoTransferControls(page)
    }
    expect(page.get('[data-testid="continue"]').text()).toBe('Continue with USDC on Solana')
    await page.get('[data-testid="continue"]').trigger('click')
    await flushPromises()

    expect(client.create.mock.calls.map(([pair]) => pair)).toEqual([
      { currency: 'USDT', network: 'tron' },
      { currency: 'USDT', network: 'tron' },
      { currency: 'USDC', network: 'solana' },
    ])
    expect(page.find('.selector').exists()).toBe(false)
    expect(page.get('[data-testid="selected-network"]').text()).toContain('USDC on Solana')
    expect(page.get('[data-testid="transfer-address"]').text()).toBe('7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF')
    expect(page.get('[data-testid="transfer-amount"]').text()).toMatch(/^162\.73\s*USDC$/)
    expect(page.text()).not.toContain(sourceAddress)
    expect(document.activeElement).toBe(page.get('.send-step').element)
  })

  it('submits the displayed currency draft when Continue is clicked', async () => {
    const { page, client } = await setup()
    await page.get('input[name="currency"][value="USDC"]').setValue(true)
    await flushPromises()
    expect(client.create).toHaveBeenCalledTimes(2)
    expect(page.get('[data-testid="continue"]').text()).toBe('Continue with USDC on Ethereum (ERC-20)')
    expectNoTransferControls(page)
    await page.get('[data-testid="continue"]').trigger('click')
    await flushPromises()

    expect(client.create.mock.calls.map(([pair]) => pair)).toEqual([
      { currency: 'USDT', network: 'tron' },
      { currency: 'USDT', network: 'tron' },
      { currency: 'USDC', network: 'ethereum' },
    ])
    expect(page.find('.selector').exists()).toBe(false)
    expect(page.get('[data-testid="selected-network"]').text()).toContain('USDC on Ethereum (ERC-20)')
    expect(page.get('[data-testid="transfer-address"]').text()).toBe('0x2222222222222222222222222222222222222222')
    expect(page.get('[data-testid="transfer-amount"]').text()).toMatch(/^167\.20\s*USDC$/)
    expect(document.activeElement).toBe(page.get('.send-step').element)
  })
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
