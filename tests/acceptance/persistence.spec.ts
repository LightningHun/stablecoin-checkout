import { test, expect, type Page } from '@playwright/test'
import { fixedNow, paymentSnapshot } from '../fixtures/oracles'
import { noTransferAction, startQuote, stubApi } from './fixtures'

const key = 'stablecoin-checkout:payment-reference:ORD-88213'
const reference = 'AQH-100306-PMT'
const headers = { 'content-type': 'application/json', 'x-server-time': new Date(fixedNow).toISOString() }
async function stored(page: Page) {
  return page.evaluate(storageKey => localStorage.getItem(storageKey), key)
}
async function seed(page: Page) {
  await page.addInitScript(({ key, reference }) => localStorage.setItem(key, reference), { key, reference })
}

test('persistence restores an underpayment from GET and a later 404 starts fresh', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  expect(await stored(page)).toBe('AQH-100306-PMT')
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([key])
  api.setState('underpaid')
  await page.clock.runFor(2200)
  await expect(page.getByTestId('transfer-amount')).toHaveText(/43\.69\s*USDT/)
  const gets = api.requests.get
  await page.reload()
  await expect(page.getByTestId('transfer-amount')).toHaveText(/43\.69\s*USDT/)
  await expect(page.getByTestId('transfer-address')).toHaveText('TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e')
  await expect(page.getByTestId('continue')).toHaveCount(0)
  await expect(page.getByRole('radio')).toHaveCount(0)
  expect(api.requests.get).toBeGreaterThan(gets)
  expect(api.requests.create).toBe(1)
  await page.route('**/api/payments/*', route => route.fulfill({ status: 404, headers, json: { title: 'Unknown payment' } }))
  await page.reload()
  await expect(page.getByTestId('continue')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'USDT', exact: true })).toBeVisible()
  await expect(page.getByTestId('transfer-address')).toHaveCount(0)
  expect(await stored(page)).toBeNull()
})

test('persistence keeps a paid receipt across reload and stops all automatic GETs', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setState('paid')
  await page.clock.runFor(2200)
  await expect(page.getByText('Paid', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Paid', { exact: true })).toBeVisible()
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'paid')
  await expect(page.getByTestId('continue')).toHaveCount(0)
  const gets = api.requests.get
  await page.clock.runFor(30000)
  expect(api.requests.get).toBe(gets)
  expect(await stored(page)).toBe('AQH-100306-PMT')
})

test('a pending restore has no transfer actions or selector and only renders the GET snapshot', async ({ page }) => {
  await stubApi(page)
  await seed(page)
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  let gets = 0
  await page.route('**/api/payments/*', async route => {
    gets++
    await held
    await route.fulfill({ headers, json: paymentSnapshot('underpaid') })
  })
  try {
    await page.goto('/')
    await expect.poll(() => gets).toBe(1)
    await expect(page.getByText('Checking for an existing payment…', { exact: true })).toHaveCount(2)
    await noTransferAction(page)
    await expect(page.getByRole('button', { name: /^Copy|^Change$/ })).toHaveCount(0)
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.getByText(/Reference AQH/)).toHaveCount(0)
    release()
    await expect(page.getByTestId('transfer-amount')).toHaveText(/43\.69\s*USDT/)
    await expect(page.getByTestId('transfer-address')).toHaveText('TQ5Nn8kLpVv3xJ7wYcR2bF9aH4dM6sGz1e')
  } finally { release() }
})

for (const fault of ['network', '500', 'invalid-data'] as const) {
  test(`an unavailable ${fault} restore stays locked and Retry repeats the GET`, async ({ page }) => {
    const api = await stubApi(page)
    await seed(page)
    let attempts = 0
    await page.route('**/api/payments/*', async route => {
      attempts++
      if (attempts > 1) return route.fulfill({ headers, json: paymentSnapshot('underpaid') })
      if (fault === 'network') return route.abort('connectionfailed')
      if (fault === '500') return route.fulfill({ status: 500, headers, json: { title: 'Temporary server failure' } })
      return route.fulfill({ headers, json: { ...paymentSnapshot(), status: 'confirmed' } })
    })
    await page.goto('/')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByTestId('retry')).toBeEnabled()
    await noTransferAction(page)
    await expect(page.getByRole('radio')).toHaveCount(0)
    await expect(page.getByText('Checking for an existing payment…', { exact: true })).toHaveCount(2)
    expect(await stored(page)).toBe('AQH-100306-PMT')
    await page.getByTestId('retry').click()
    await expect(page.getByTestId('transfer-amount')).toHaveText(/43\.69\s*USDT/)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(attempts).toBe(2)
    expect(api.requests.create).toBe(0)
  })
}

test('an expired payment restores recovery and an accepted requote writes the reference again', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setState('expired')
  await page.clock.runFor(2200)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Get a new quote', exact: true })).toBeVisible()
  await noTransferAction(page)
  await page.evaluate(storageKey => localStorage.removeItem(storageKey), key)
  await page.getByRole('button', { name: 'Get a new quote', exact: true }).click()
  await expect(page.getByTestId('transfer-amount')).toHaveText(/163\.69\s*USDT/)
  expect(await stored(page)).toBe('AQH-100306-PMT')
  expect(api.requests.requote).toBe(1)
})

test('blocked browser storage preserves the ordinary fresh checkout', async ({ page }) => {
  const api = await stubApi(page)
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError') } })
  })
  await startQuote(page)
  await expect(page.getByTestId('transfer-amount')).toHaveText(/163\.69\s*USDT/)
  await page.reload()
  await expect(page.getByTestId('continue')).toBeVisible()
  expect(api.requests.create).toBe(1)
})
