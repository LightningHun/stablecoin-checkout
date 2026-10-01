import { expect, type Page } from '@playwright/test'
import { catalogueRows, fixedNow, paymentSnapshot, sourceQuote, type statuses } from '../fixtures/oracles'

export type State = typeof statuses[number]
export const independentCatalogue = {
  currencies: ['USDT', 'USDC', 'ETH'].map(code => ({
    code, name: code === 'USDT' ? 'Tether' : code === 'USDC' ? 'USD Coin' : 'Ether', decimals: code === 'ETH' ? 18 : 6,
    networks: catalogueRows.filter(row => row[0] === code).map(row => ({
      id: row[2], name: row[3], network_fee: row[4], required_confirmations: row[5], avg_confirmation_seconds: row[6],
    })),
  })),
}

export type BrowserPayment = Record<string, unknown> & { status: string; payment_reference: string; quote: typeof sourceQuote | Record<string, unknown> }
export async function stubApi(page: Page, initial: State = 'awaiting_payment') {
  let current: BrowserPayment = paymentSnapshot(initial)
  let getMode: 'ok' | '500' | 'disconnect' = 'ok'
  let createDelay = 0
  const requests = { get: 0, create: 0, requote: 0, activeGet: 0, maxActiveGet: 0 }
  await page.clock.install({ time: new Date(fixedNow) })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-server-time': new Date(fixedNow).toISOString() }
    const fulfill = async (body: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(body) })
    if (url.pathname === '/api/currencies') return fulfill(independentCatalogue)
    if (url.pathname.endsWith('/requote')) {
      requests.requote += 1
      current = { ...paymentSnapshot(), payment_reference: current.payment_reference, quote: { ...sourceQuote, expires_at: '2026-08-14T09:07:10.842Z' } }
      return fulfill(current, 201)
    }
    if (url.pathname === '/api/payments' && request.method() === 'POST') {
      requests.create += 1
      if (createDelay) await new Promise(resolve => setTimeout(resolve, createDelay))
      return fulfill(current, 201)
    }
    requests.get += 1
    requests.activeGet += 1
    requests.maxActiveGet = Math.max(requests.maxActiveGet, requests.activeGet)
    try {
      if (getMode === 'disconnect') return await route.abort('connectionfailed')
      if (getMode === '500') return await fulfill({ error: 'Temporary server failure' }, 500)
      return await fulfill(current)
    } finally { requests.activeGet -= 1 }
  })
  return {
    requests,
    setState(state: State) { current = { ...paymentSnapshot(state), payment_reference: current.payment_reference } },
    setPayment(payment: BrowserPayment) { current = payment },
    setFault(mode: typeof getMode) { getMode = mode },
    setCreateDelay(ms: number) { createDelay = ms },
    current: () => current,
  }
}

export async function startQuote(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
}

export async function noTransferAction(page: Page) {
  await expect(page.getByTestId('transfer-amount')).toHaveCount(0)
  await expect(page.getByTestId('copy-amount')).toHaveCount(0)
  await expect(page.getByTestId('copy-address')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Copy address$|^Copy amount$|^Continue|^Send/i }).and(page.locator(':enabled'))).toHaveCount(0)
  await expect(page.getByTestId('transfer-qr')).toHaveCount(0)
}

export async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}
