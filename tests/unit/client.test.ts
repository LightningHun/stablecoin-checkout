import { afterEach, expect, it, vi } from 'vitest'
import { ApiError, createPaymentClient } from '../../src/features/checkout/infrastructure/paymentClient'

afterEach(() => vi.unstubAllGlobals())

it('T11 successful HTTP with invalid JSON is classified as a protocol error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{invalid-json', { status: 200, headers: { 'content-type': 'application/json', 'x-server-time': '2026-08-14T08:37:10.842Z' } })))
  const client = createPaymentClient()
  await expect(client.status('AQH-100306-PMT', new AbortController().signal)).rejects.toBeInstanceOf(ApiError)
  await expect(client.status('AQH-100306-PMT', new AbortController().signal)).rejects.toMatchObject({ protocol: true })
})
