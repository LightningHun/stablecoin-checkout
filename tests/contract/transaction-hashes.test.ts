// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { createMockServer } from '../../backend/server'

let server: Server
let base: string
async function post(path: string, body: unknown) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
beforeAll(async () => {
  server = createMockServer({ now: () => Date.parse('2026-08-14T08:37:10.842Z') })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No mock listening address')
  base = `http://127.0.0.1:${address.port}`
})
beforeEach(async () => {
  expect((await post('/api/demo/reset', { freeze: true })).status).toBe(200)
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})

describe('full synthetic demo transaction identifiers', () => {
  it.each([
    ['USDT', 'tron', '9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'],
    ['USDT', 'ethereum', '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'],
    ['USDC', 'ethereum', '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'],
    ['USDC', 'polygon', '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'],
    ['USDC', 'solana', 'cB5S93YMJGZggvjc58ioc7My7pHt387wECNfFGZExpXCEN9xND2ACbZDKu88a16dEX9v1t1E5PAdGJTiR1fntGB'],
    ['ETH', 'ethereum', '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20'],
  ])('returns the full %s/%s identifier and retains it on settlement', async (currency, network, expected) => {
    const created = await post('/api/payments', { order_id: 'ORD-88213', currency, network })
    expect(created.status).toBe(201)
    const { payment_reference: reference } = await created.json()
    for (const status of ['detected', 'paid']) {
      expect((await post('/api/demo/scenario', { status })).status).toBe(200)
      const response = await fetch(`${base}/api/payments/${reference}`)
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ status, tx_hash: expected, quote: { crypto_currency: currency, network } })
    }
  })
})
