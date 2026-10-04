// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createMockServer } from '../../backend/server'

const initialTime = '2026-08-14T08:37:10.842Z'
let realNow = Date.parse(initialTime)
const server = createMockServer({ now: () => realNow })
let base: string
async function request(path: string, body?: unknown) {
  return fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
async function scenario(body: unknown) { expect((await request('/api/demo/scenario', body)).status).toBe(200) }
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('Missing test port')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})
it('frozen mock preserves the original deadline, receipt and funds latch across underpaid expiry', async () => {
  expect((await request('/api/demo/reset', { now: initialTime, freeze: true })).status).toBe(200)
  const created = await request('/api/payments', { order_id: 'ORD-88213', currency: 'USDT', network: 'tron' })
  expect(created.status).toBe(201)
  expect(await created.json()).toMatchObject({ payment_reference: 'AQH-100306-PMT', quote: { expires_at: '2026-08-14T08:52:10.842Z' } })
  await scenario({ advanceMs: 300000, status: 'underpaid' })
  const read = async () => {
    const response = await request('/api/payments/AQH-100306-PMT')
    expect(response.status).toBe(200)
    return { payment: await response.json(), time: response.headers.get('x-server-time') }
  }
  const before = await read()
  expect(before.payment).toMatchObject({ payment_reference: 'AQH-100306-PMT', order_id: 'ORD-88213', status: 'underpaid', amount_received: '120.00', amount_outstanding: '43.69', tx_hash: '9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20', quote: { expires_at: '2026-08-14T08:52:10.842Z' } })
  expect(before.time).toBe('2026-08-14T08:42:10.842Z')
  realNow += 1800000
  expect(await read()).toEqual(before)
  await scenario({ advanceMs: 599999 })
  expect(await read()).toEqual({ payment: before.payment, time: '2026-08-14T08:52:10.841Z' })
  await scenario({ advanceMs: 1 })
  expect(await read()).toEqual({ payment: before.payment, time: '2026-08-14T08:52:10.842Z' })
  await scenario({ advanceMs: 900000 })
  expect((await read()).payment).toEqual(before.payment)
  expect((await request('/api/payments/AQH-100306-PMT/requote', { currency: 'USDT', network: 'tron' })).status).toBe(409)
  expect((await request('/api/payments', { order_id: 'ORD-88213', currency: 'USDT', network: 'ethereum' })).status).toBe(409)
  await scenario({ status: 'paid' })
  expect((await read()).payment).toMatchObject({ status: 'paid', payment_reference: 'AQH-100306-PMT', amount_received: '163.69', tx_hash: '9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20' })
})
