// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { createMockServer } from '../../mock/server'
import { catalogueRows, fixedNow, sourceAddress, sourceQuote, statuses, syntheticQuotes } from '../fixtures/oracles'

let server: Server
let base: string
async function request(path: string, body?: unknown) {
  return fetch(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
const create = (currency = 'USDT', network = 'tron') => request('/api/payments', { order_id: 'ORD-88213', currency, network })

beforeAll(async () => {
  server = createMockServer({ now: () => fixedNow })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mock failed to bind an HTTP port')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
beforeEach(async () => { expect((await request('/api/demo/reset', { now: new Date(fixedNow).toISOString(), freeze: true, ttlMs: 900000 })).status).toBe(200) })

describe('T16 real HTTP source contract', () => {
  it('T02 exposes exactly the six independently transcribed catalogue rows', async () => {
    const response = await request('/api/currencies')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('x-server-time')).toBe(new Date(fixedNow).toISOString())
    const body = await response.json() as { currencies: Array<{ code: string; decimals: number; networks: Array<{ id: string; name: string; network_fee: string; required_confirmations: number; avg_confirmation_seconds: number }> }> }
    const actual = body.currencies.flatMap(currency => currency.networks.map(network => [currency.code, currency.decimals, network.id, network.name, network.network_fee, network.required_confirmations, network.avg_confirmation_seconds]))
    expect(actual).toEqual(catalogueRows)
  })
  it('creates and reads the complete source USDT/Tron quote as decimal strings', async () => {
    const response = await create()
    expect(response.status).toBe(201)
    const payment = await response.json()
    expect(payment).toMatchObject({ order_id: 'ORD-88213', status: 'awaiting_payment', merchant: { name: 'Payment Project', logo_url: null }, order: { currency: 'EUR', amount: '149.90' }, quote: sourceQuote })
    expect(payment.payment_reference).toEqual(expect.any(String))
    const read = await request(`/api/payments/${payment.payment_reference}`)
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual(payment)
  })
  it.each(catalogueRows)('T02 supports %s with %i decimals on %s', async (currency, decimals, network, name, fee, confirmations) => {
    const response = await create(currency, network)
    expect(response.status).toBe(201)
    const { quote } = await response.json()
    expect(quote).toMatchObject({ crypto_currency: currency, network, network_name: name, network_fee: fee, required_confirmations: confirmations })
    const key = `${currency}/${network}`
    const values = key === 'USDT/tron' ? sourceQuote : syntheticQuotes[key as keyof typeof syntheticQuotes]
    expect(quote).toEqual({ ...values, crypto_currency: currency, network, network_name: name, network_fee: fee, required_confirmations: confirmations, expires_at: sourceQuote.expires_at })
    for (const key of ['crypto_amount', 'network_fee', 'total_due', 'exchange_rate']) {
      expect(typeof quote[key]).toBe('string')
      expect(quote[key]).toMatch(/^\d+(?:\.\d+)?$/)
    }
    for (const key of ['crypto_amount', 'network_fee', 'total_due']) expect((quote[key].split('.')[1] || '').length).toBeLessThanOrEqual(decimals)
    if (network === 'ethereum' || network === 'polygon') expect(quote.crypto_address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    if (network === 'tron') expect(quote.crypto_address).toBe(sourceAddress)
    if (network === 'solana') expect(quote.crypto_address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
  })
  it('returns documented problem+json 409 for an unexpired requote', async () => {
    const payment = await (await create()).json()
    const response = await request(`/api/payments/${payment.payment_reference}/requote`, { currency: 'USDT', network: 'tron' })
    expect(response.status).toBe(409)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
    expect(await response.json()).toMatchObject({ type: 'https://developers.triple-a.io/errors/quote-not-expired', title: 'Quote has not expired', status: 409 })
    expect((await (await request(`/api/payments/${payment.payment_reference}`)).json()).quote.expires_at).toBe(sourceQuote.expires_at)
  })
  it('T14 M12 server-confirmed expiry requotes with the same reference', async () => {
    const payment = await (await create()).json()
    await request('/api/demo/scenario', { status: 'expired' })
    const expired = await (await request(`/api/payments/${payment.payment_reference}`)).json()
    expect(expired.status).toBe('expired')
    const response = await request(`/api/payments/${payment.payment_reference}/requote`, { currency: 'USDT', network: 'tron' })
    expect(response.status).toBe(201)
    const result = await response.json()
    expect(result.payment_reference).toBe(payment.payment_reference)
    expect(result.status).toBe('awaiting_payment')
    expect(result).not.toHaveProperty('expired_at')
  })
  it('T03/T08 atomically refuses replacement and requote after funds arrived', async () => {
    const payment = await (await create()).json()
    await request('/api/demo/scenario', { status: 'detected' })
    expect((await create('USDC', 'polygon')).status).toBe(409)
    expect((await request(`/api/payments/${payment.payment_reference}/requote`, { currency: 'USDT', network: 'tron' })).status).toBe(409)
    expect((await (await request(`/api/payments/${payment.payment_reference}`)).json()).status).toBe('detected')
  })
  it('T03/T08 remembers observed funds after settlement failure and retains the existing reference', async () => {
    const payment = await (await create()).json()
    await request('/api/demo/scenario', { status: 'detected' })
    expect((await (await request(`/api/payments/${payment.payment_reference}`)).json()).status).toBe('detected')
    await request('/api/demo/scenario', { status: 'failed' })
    expect((await (await request(`/api/payments/${payment.payment_reference}`)).json()).status).toBe('failed')
    expect((await create('USDC', 'polygon')).status).toBe(409)
    expect((await request(`/api/payments/${payment.payment_reference}/requote`, { currency: 'USDT', network: 'tron' })).status).toBe(409)
    const retained = await request(`/api/payments/${payment.payment_reference}`)
    expect(retained.status).toBe(200)
    expect(await retained.json()).toMatchObject({ payment_reference: payment.payment_reference, status: 'failed' })
  })
  it.each(statuses)('T11/T17 deterministic scenario %s returns a full coherent snapshot', async status => {
    const payment = await (await create()).json()
    expect((await request('/api/demo/scenario', { status })).status).toBe(200)
    const response = await request(`/api/payments/${payment.payment_reference}`)
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ status, payment_reference: payment.payment_reference, merchant: { name: 'Payment Project' }, order: { currency: 'EUR', amount: '149.90' }, quote: { crypto_address: sourceAddress } })
    if (status === 'detected') expect(result).toMatchObject({ confirmations: 0, required_confirmations: 1, amount_received: '163.69' })
    if (status === 'underpaid') expect(result).toMatchObject({ amount_received: '120.00', amount_outstanding: '43.69', crypto_address: sourceAddress })
    if (status === 'overpaid') expect(result).toMatchObject({ amount_received: '180.00', amount_excess: '16.31' })
    if (status === 'failed') expect(result).toMatchObject({ reason: 'settlement_rejected' })
    if (status !== 'underpaid') expect(result).not.toHaveProperty('amount_outstanding')
    if (status !== 'overpaid') expect(result).not.toHaveProperty('amount_excess')
  })
  it('T17 HTTP 500, slow and disconnect are controllable and reset restores normal routes', async () => {
    const payment = await (await create()).json()
    await request('/api/demo/scenario', { fault: '500' })
    expect((await request(`/api/payments/${payment.payment_reference}`)).status).toBe(500)
    await request('/api/demo/scenario', { fault: 'slow', delayMs: 80 })
    const started = performance.now()
    expect((await request(`/api/payments/${payment.payment_reference}`)).status).toBe(200)
    expect(performance.now() - started).toBeGreaterThanOrEqual(65)
    await request('/api/demo/scenario', { fault: 'disconnect' })
    await expect(request(`/api/payments/${payment.payment_reference}`)).rejects.toThrow()
    await request('/api/demo/reset', { now: new Date(fixedNow).toISOString(), freeze: true })
    expect((await create()).status).toBe(201)
  })
})
