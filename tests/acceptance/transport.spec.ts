import { test, expect } from '@playwright/test'
import { fixedNow, paymentSnapshot, sourceAddress, sourceQuote } from '../fixtures/oracles'
import { independentCatalogue, noTransferAction, startQuote, stubApi } from './fixtures'

test('T10 every terminal state stops automatic polling', async ({ page }) => {
  for (const state of ['paid', 'overpaid', 'failed', 'expired'] as const) {
    const api = await stubApi(page)
    await startQuote(page)
    api.setState(state)
    await page.clock.runFor(2200)
    await expect(page.getByTestId('payment-status')).toBeVisible()
    const settledCount = api.requests.get
    await page.clock.runFor(30000)
    expect(api.requests.get, `${state} must not schedule further GETs`).toBe(settledCount)
    await page.unrouteAll({ behavior: 'wait' })
  }
})

test('T14 server-expired requote retains reference and double clicks coalesce', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setState('expired')
  await page.clock.runFor(2200)
  await noTransferAction(page)
  const button = page.getByRole('button', { name: /Get a new quote/i })
  await expect(button).toBeVisible()
  await button.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click() })
  await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
  expect(api.requests.requote).toBe(1)
  await expect(page.getByText(/AQH-100306-PMT/).first()).toBeVisible()
})

test('T15 uncertain creation is not automatically retried', async ({ page }) => {
  const api = await stubApi(page)
  await page.route('**/api/payments', async route => {
    api.requests.create += 1
    await route.abort('connectionfailed')
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.clock.runFor(120000)
  expect(api.requests.create).toBe(1)
  await noTransferAction(page)
})

test('T03 accepted replacement never mixes token network amount QR or clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await stubApi(page)
  await startQuote(page)
  const newAddress = '0x2222222222222222222222222222222222222222'
  let resolveResponse: (() => void) | undefined
  let createCount = 0
  await page.route('**/api/payments', async route => {
    createCount += 1
    const body = route.request().postDataJSON() as { currency: string; network: string }
    await new Promise<void>(resolve => { resolveResponse = resolve })
    await route.fulfill({ status: 201, headers: { 'content-type': 'application/json', 'x-server-time': new Date(fixedNow).toISOString() }, body: JSON.stringify({ ...paymentSnapshot(), payment_reference: 'AQH-200000-PMT', quote: { ...sourceQuote,
      crypto_currency: body.currency, network: body.network, network_name: 'Ethereum (ERC-20)', network_fee: '4.50', total_due: '167.19', required_confirmations: 3, crypto_address: newAddress,
    } }) })
  })
  await page.getByRole('button', { name: 'Change', exact: true }).click()
  // Replacement removes the radio immediately; click avoids checking a detached element afterward.
  await page.getByRole('radio', { name: /Ethereum/ }).click()
  await expect.poll(() => createCount).toBe(1)
  await noTransferAction(page)
  await expect(page.getByText(sourceAddress, { exact: true })).toHaveCount(0)
  resolveResponse!()
  await expect(page.getByTestId('transfer-address')).toHaveText(newAddress)
  await expect(page.getByTestId('transfer-amount')).toContainText('167.19')
  await expect(page.getByText(/Ethereum.*network only/)).toBeVisible()
  await page.getByRole('button', { name: 'Copy address', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(newAddress)
})

test('T07 local zero hides instructions before server reconciliation completes', async ({ page }) => {
  await page.clock.install({ time: new Date(fixedNow) })
  let getResolve: (() => void) | undefined
  let gets = 0
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const headers = { 'content-type': 'application/json', 'x-server-time': new Date(fixedNow).toISOString() }
    if (path === '/api/currencies') return route.fulfill({ headers, json: independentCatalogue })
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, headers, json: { ...paymentSnapshot(), quote: { ...sourceQuote, expires_at: new Date(fixedNow + 1000).toISOString() } } })
    gets += 1
    await new Promise<void>(resolve => { getResolve = resolve })
    return route.fulfill({ headers, json: { ...paymentSnapshot('detected'), quote: { ...sourceQuote, expires_at: new Date(fixedNow + 1000).toISOString() } } })
  })
  await startQuote(page)
  await page.clock.runFor(1100)
  await noTransferAction(page)
  await expect(page.getByRole('button', { name: /Get a new quote/i })).toHaveCount(0)
  await expect.poll(() => gets).toBe(1)
  getResolve!()
  await expect(page.getByTestId('payment-status')).toContainText(/money arrived/i)
  await noTransferAction(page)
})
