// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Server } from 'node:http'
import { createMockServer } from '../../mock/server'

interface Snapshot {
  payment_reference: string
  status: string
  confirmations?: number
  [key: string]: unknown
}

const initialTime = '2026-08-14T08:37:10.842Z'
let injectedTime = Date.parse(initialTime)
let server: Server
let base: string

async function request(path: string, body?: unknown) {
  return fetch(`${base}${path}`, body === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
async function scenario(body: Record<string, unknown>) {
  expect((await request('/api/demo/scenario', body)).status).toBe(200)
}
async function create(network = 'ethereum', currency = 'USDT') {
  const response = await request('/api/payments', { order_id: 'ORD-88213', currency, network })
  expect(response.status).toBe(201)
  return await response.json() as Snapshot
}
async function read(reference: string) {
  const response = await request(`/api/payments/${reference}`)
  expect(response.status).toBe(200)
  return await response.json() as Snapshot
}

beforeAll(async () => {
  server = createMockServer({ now: () => injectedTime })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Mock failed to bind an HTTP port')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})
beforeEach(async () => {
  injectedTime = Date.parse(initialTime)
  expect((await request('/api/demo/reset', { now: initialTime, freeze: true })).status).toBe(200)
})

describe('mock clock confirmation progression', () => {
  it('Ethereum confirming 2/3 stays at 179 seconds and settles at the 180-second boundary', async () => {
    const payment = await create()
    await scenario({ status: 'confirming' })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'confirming', confirmations: 2, required_confirmations: 3 })
    await scenario({ advanceMs: 179000 })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'confirming', confirmations: 2, required_confirmations: 3 })
    await scenario({ advanceMs: 1000 })
    const paid = await read(payment.payment_reference)
    expect(paid).toEqual({
      payment_reference: payment.payment_reference,
      order_id: 'ORD-88213',
      status: 'paid',
      merchant: { name: 'Payment Project', logo_url: null },
      order: { currency: 'EUR', amount: '149.90' },
      quote: {
        crypto_currency: 'USDT', network: 'ethereum', network_name: 'Ethereum (ERC-20)',
        exchange_rate: '0.9214', crypto_amount: '162.69', network_fee: '4.50', total_due: '167.19',
        crypto_address: '0x1111111111111111111111111111111111111111',
        required_confirmations: 3, expires_at: '2026-08-14T08:52:10.842Z',
      },
      amount_received: '167.19', tx_hash: '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20', required_confirmations: 3,
      confirmations: 3, settled_at: '2026-08-14T08:40:10.842Z',
    })
    expect(await read(payment.payment_reference)).toEqual(paid)
  })

  it('Ethereum detected becomes confirming 1/3 after 180 seconds without leaking server bookkeeping', async () => {
    const payment = await create()
    await scenario({ status: 'detected' })
    await scenario({ advanceMs: 180000 })
    const result = await read(payment.payment_reference)
    expect(result).toMatchObject({ status: 'confirming', confirmations: 1, required_confirmations: 3, amount_received: '167.19', tx_hash: '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20' })
    expect(Object.keys(result).sort()).toEqual([
      'amount_received', 'confirmations', 'merchant', 'order', 'order_id', 'payment_reference',
      'quote', 'required_confirmations', 'status', 'tx_hash',
    ])
  })

  it('Tron detected becomes paid directly after 60 seconds', async () => {
    const payment = await create('tron')
    await scenario({ status: 'detected' })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'detected', confirmations: 0 })
    await scenario({ advanceMs: 60000 })
    expect(await read(payment.payment_reference)).toMatchObject({
      status: 'paid', confirmations: 1, required_confirmations: 1, amount_received: '163.69',
      tx_hash: '9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20', settled_at: '2026-08-14T08:38:10.842Z',
    })
  })

  it('confirmation counts never decrease across repeated reads and partial intervals are retained', async () => {
    const payment = await create()
    await scenario({ status: 'detected' })
    const steps = [
      { advanceMs: 179000, status: 'detected', confirmations: 0 },
      { advanceMs: 2000, status: 'confirming', confirmations: 1 },
      { advanceMs: 178000, status: 'confirming', confirmations: 1 },
      { advanceMs: 1000, status: 'confirming', confirmations: 2 },
      { advanceMs: 180000, status: 'paid', confirmations: 3 },
    ]
    for (const step of steps) {
      await scenario({ advanceMs: step.advanceMs })
      const first = await read(payment.payment_reference)
      expect(first).toMatchObject({ status: step.status, confirmations: step.confirmations })
      expect(await read(payment.payment_reference)).toEqual(first)
    }
    expect(await read(payment.payment_reference)).toMatchObject({ settled_at: '2026-08-14T08:46:10.842Z' })
  })

  it.each(['underpaid', 'failed', 'overpaid', 'expired', 'paid'])('%s is unchanged after advancing 15 minutes', async status => {
    const payment = await create()
    await scenario({ status })
    const before = await read(payment.payment_reference)
    expect(before.status).toBe(status)
    await scenario({ advanceMs: 900000 })
    expect(await read(payment.payment_reference)).toEqual(before)
  })

  it('a delayed read records the time the final confirmation was reached, not the read time', async () => {
    const payment = await create()
    await scenario({ status: 'detected' })
    await scenario({ advanceMs: 900000 })
    expect(await read(payment.payment_reference)).toMatchObject({
      status: 'paid', confirmations: 3, required_confirmations: 3,
      amount_received: '167.19', tx_hash: '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20', settled_at: '2026-08-14T08:46:10.842Z',
    })
  })

  it('a frozen clock ignores injected time changes until advanceMs is used', async () => {
    const payment = await create('tron')
    await scenario({ status: 'detected' })
    const before = await read(payment.payment_reference)
    injectedTime += 900000
    expect(await read(payment.payment_reference)).toEqual(before)
    await scenario({ advanceMs: 60000 })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'paid', confirmations: 1, settled_at: '2026-08-14T08:38:10.842Z' })
  })

  it('an unfrozen clock progresses when the injected real-time clock advances', async () => {
    expect((await request('/api/demo/reset', { now: initialTime, freeze: false })).status).toBe(200)
    const payment = await create()
    await scenario({ status: 'detected' })
    injectedTime += 180000
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'confirming', confirmations: 1, required_confirmations: 3 })
    injectedTime += 360000
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'paid', confirmations: 3, settled_at: '2026-08-14T08:46:10.842Z' })
  })

  it('reapplying a demo status restarts the progression clock at that moment', async () => {
    const payment = await create()
    await scenario({ status: 'confirming' })
    await scenario({ advanceMs: 179000 })
    await scenario({ status: 'confirming' })
    await scenario({ advanceMs: 1000 })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'confirming', confirmations: 2 })
    await scenario({ advanceMs: 179000 })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'paid', confirmations: 3, settled_at: '2026-08-14T08:43:09.842Z' })
  })

  it('Solana uses its 15-second interval and skips directly from detected to paid', async () => {
    const payment = await create('solana', 'USDC')
    await scenario({ status: 'detected' })
    await scenario({ advanceMs: 14999 })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'detected', confirmations: 0 })
    await scenario({ advanceMs: 1 })
    expect(await read(payment.payment_reference)).toMatchObject({
      status: 'paid', confirmations: 1, required_confirmations: 1, amount_received: '162.73',
      tx_hash: 'cB5S93YMJGZggvjc58ioc7My7pHt387wECNfFGZExpXCEN9xND2ACbZDKu88a16dEX9v1t1E5PAdGJTiR1fntGB', settled_at: '2026-08-14T08:37:25.842Z',
    })
  })

  it('Polygon uses 30-second intervals and all six required confirmations', async () => {
    const payment = await create('polygon', 'USDC')
    await scenario({ status: 'detected' })
    await scenario({ advanceMs: 30000 })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'confirming', confirmations: 1, required_confirmations: 6 })
    await scenario({ advanceMs: 90000 })
    expect(await read(payment.payment_reference)).toMatchObject({ status: 'confirming', confirmations: 4, required_confirmations: 6 })
    await scenario({ advanceMs: 60000 })
    expect(await read(payment.payment_reference)).toMatchObject({
      status: 'paid', confirmations: 6, required_confirmations: 6, amount_received: '162.81',
      tx_hash: '0x9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20', settled_at: '2026-08-14T08:40:10.842Z',
    })
  })
})
