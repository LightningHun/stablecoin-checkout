import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import QuoteDetails from '../../src/features/checkout/components/QuoteDetails.vue'
import type { CurrencyCode, Payment } from '../../src/features/checkout/domain/paymentModel'
import { catalogueRows, paymentSnapshot, sourceQuote, syntheticQuotes } from '../fixtures/oracles'

const renderer = vi.hoisted(() => ({
  toDataURL: vi.fn<(value: string, options: { currency: CurrencyCode; width?: number }) => string | Promise<string>>(),
}))
vi.mock('../../src/features/checkout/components/paymentQr', () => renderer)

const qrSelector = '[data-testid="transfer-qr"]'
let wrapper: VueWrapper | undefined

function quoteFor(currency: CurrencyCode, network: string): Payment {
  const row = catalogueRows.find(entry => entry[0] === currency && entry[2] === network)!
  const vector = currency === 'USDT' && network === 'tron'
    ? sourceQuote
    : syntheticQuotes[`${currency}/${network}` as keyof typeof syntheticQuotes]
  return {
    ...paymentSnapshot(),
    quote: {
      ...sourceQuote, ...vector, crypto_currency: currency, network,
      network_name: row[3], network_fee: row[4], required_confirmations: row[5],
    },
  } as Payment
}

function deferredImage() {
  let resolve!: (value: string) => void
  const promise = new Promise<string>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  renderer.toDataURL.mockReset().mockReturnValue('data:image/svg+xml,accepted-quote')
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

describe('R04 styled QR uses the accepted quote snapshot', () => {
  it.each([
    ['USDT', 'tron', 'TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e'],
    ['USDT', 'ethereum', '0x1111111111111111111111111111111111111111'],
    ['USDC', 'ethereum', '0x2222222222222222222222222222222222222222'],
    ['USDC', 'polygon', '0x3333333333333333333333333333333333333333'],
    ['USDC', 'solana', '7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF'],
    ['ETH', 'ethereum', '0x4444444444444444444444444444444444444444'],
  ] as const)('passes the canonical %s/%s address and currency to the renderer', async (currency, network, address) => {
    wrapper = mount(QuoteDetails, { props: { payment: quoteFor(currency, network), remaining: 60000 } })
    await flushPromises()

    expect(renderer.toDataURL).toHaveBeenCalledExactlyOnceWith(address, expect.objectContaining({ currency }))
    expect(wrapper.get('[data-testid="transfer-address"]').text()).toBe(address)
    expect(wrapper.get(qrSelector).attributes('src')).toBe('data:image/svg+xml,accepted-quote')
  })

  it('removes the previous QR while a replacement render is pending', async () => {
    wrapper = mount(QuoteDetails, { props: { payment: quoteFor('USDT', 'tron'), remaining: 60000 } })
    await flushPromises()
    expect(wrapper.get(qrSelector).attributes('src')).toBe('data:image/svg+xml,accepted-quote')

    const replacement = deferredImage()
    renderer.toDataURL.mockReturnValueOnce(replacement.promise)
    await wrapper.setProps({ payment: quoteFor('USDC', 'solana') })
    expect(wrapper.get('[data-testid="transfer-address"]').text()).toBe('7YWHMfk9JZe1LM1g1ZauHuiSxhiqp1HwBwwxVwA7F4GF')
    expect(wrapper.find(qrSelector).exists()).toBe(false)

    replacement.resolve('data:image/svg+xml,replacement-quote')
    await flushPromises()
    expect(wrapper.get(qrSelector).attributes('src')).toBe('data:image/svg+xml,replacement-quote')
  })

  it.each(['before', 'after'] as const)('ignores an old render that settles %s the current render', async order => {
    const oldImage = deferredImage()
    const currentImage = deferredImage()
    renderer.toDataURL.mockReturnValueOnce(oldImage.promise).mockReturnValueOnce(currentImage.promise)
    wrapper = mount(QuoteDetails, { props: { payment: quoteFor('USDT', 'tron'), remaining: 60000 } })
    await wrapper.setProps({ payment: quoteFor('USDC', 'polygon') })
    expect(renderer.toDataURL).toHaveBeenLastCalledWith('0x3333333333333333333333333333333333333333', expect.objectContaining({ currency: 'USDC' }))

    if (order === 'before') {
      oldImage.resolve('data:image/svg+xml,obsolete-quote')
      await flushPromises()
      expect(wrapper.find(qrSelector).exists()).toBe(false)
    }
    currentImage.resolve('data:image/svg+xml,current-quote')
    await flushPromises()
    expect(wrapper.get(qrSelector).attributes('src')).toBe('data:image/svg+xml,current-quote')
    if (order === 'after') {
      oldImage.resolve('data:image/svg+xml,obsolete-quote')
      await flushPromises()
      expect(wrapper.get(qrSelector).attributes('src')).toBe('data:image/svg+xml,current-quote')
    }
  })

  it('regenerates the badge for a currency change even when the address is unchanged', async () => {
    const address = '0x1111111111111111111111111111111111111111'
    wrapper = mount(QuoteDetails, { props: { payment: quoteFor('USDT', 'ethereum'), remaining: 60000 } })
    await flushPromises()

    for (const currency of ['USDC', 'ETH'] as const) {
      const payment = quoteFor(currency, 'ethereum')
      payment.quote.crypto_address = address
      const image = deferredImage()
      renderer.toDataURL.mockReturnValueOnce(image.promise)
      await wrapper.setProps({ payment })
      expect(renderer.toDataURL).toHaveBeenLastCalledWith(address, expect.objectContaining({ currency }))
      expect(wrapper.find(qrSelector).exists()).toBe(false)
      image.resolve(`data:image/svg+xml,${currency}-badge`)
      await flushPromises()
      expect(wrapper.get(qrSelector).attributes('src')).toBe(`data:image/svg+xml,${currency}-badge`)
    }
    expect(renderer.toDataURL).toHaveBeenCalledTimes(3)
  })
})
