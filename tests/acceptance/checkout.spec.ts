import { test, expect } from '@playwright/test'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { sourceAddress, paymentSnapshot } from '../fixtures/oracles'
import { noHorizontalOverflow, noTransferAction, startQuote, stubApi } from './fixtures'

test('T01 initial summary and draft selection do not invent a payment reference', async ({ page }) => {
  const api = await stubApi(page)
  await page.goto('/')
  await expect(page.getByText('Payment Project', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/ORD-88213/).first()).toBeVisible()
  await expect(page.getByText('€149.90', { exact: true })).toBeVisible()
  await expect(page.getByText('AQH-100306-PMT')).toHaveCount(0)
  expect(api.requests.create).toBe(0)
  await page.getByRole('radio', { name: 'USDC', exact: true }).check()
  expect(api.requests.create).toBe(0)
})

test('T04 address, clipboard and independently decoded QR agree', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await stubApi(page)
  await startQuote(page)
  await expect(page.getByTestId('transfer-address')).toHaveText(sourceAddress)
  await page.getByRole('button', { name: 'Copy address', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sourceAddress)
  const png = PNG.sync.read(await page.getByTestId('transfer-qr').screenshot())
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  expect(decoded?.data, 'Independent QR decoder must recover the literal source address').toBe(sourceAddress)
})

test('T04 clipboard denial exposes a selectable canonical fallback', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }))
  await stubApi(page)
  await startQuote(page)
  await page.getByRole('button', { name: 'Copy address', exact: true }).click()
  await expect(page.getByRole('textbox', { name: /copy manually/i })).toHaveValue(sourceAddress)
})

test('T08 VM02 detected removes every transfer action and survives deadline plus HTTP 500', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setState('detected')
  await page.clock.runFor(2200)
  await expect(page.getByTestId('payment-status')).toContainText(/money arrived/i)
  await expect(page.getByText('0 of 1 confirmations', { exact: true })).toBeVisible()
  await noTransferAction(page)
  await expect(page.getByRole('button', { name: /^Continue|^Send/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0)
  api.setFault('500')
  await page.clock.fastForward(16 * 60 * 1000)
  await expect(page.getByTestId('payment-status')).toContainText(/money arrived/i)
  await expect(page.getByText(/this quote expired/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /new quote/i })).toHaveCount(0)
})

test('T08 VM02 detection closes an already-open Change selector and removes Continue', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  await page.getByRole('button', { name: 'Change', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'USDT', exact: true })).toBeVisible()
  api.setState('detected')
  await page.clock.runFor(2200)
  await expect(page.getByTestId('payment-status')).toContainText(/money arrived/i)
  await expect(page.getByRole('radio')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Continue|^Send|^Change$/i })).toHaveCount(0)
  await noTransferAction(page)
})

test('T12 underpaid sends only the outstanding amount and duplicate delivery is idempotent', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setState('underpaid')
  await page.clock.runFor(2200)
  await expect(page.getByTestId('transfer-amount')).toHaveText(/43\.69\s*USDT/)
  await expect(page.getByTestId('transfer-address')).toHaveText(sourceAddress)
  await expect(page.getByTestId('countdown')).toHaveCount(0)
  await page.clock.fastForward(16 * 60 * 1000)
  await expect(page.getByTestId('transfer-amount')).toHaveText(/43\.69\s*USDT/)
  await expect(page.getByTestId('payment-status')).toContainText('120.00')
  await expect(page.getByTestId('payment-status')).not.toContainText('240.00')
})

test('T13 overpaid exposes exact facts without an automatic refund or another send', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setState('overpaid')
  await page.clock.runFor(2200)
  await expect(page.getByTestId('payment-status')).toContainText('16.31')
  await expect(page.getByTestId('payment-status')).toContainText('180.00')
  await expect(page.locator('main')).not.toContainText(/automatically.{0,30}refund|refund.{0,30}automatically|will be refunded/i)
  await noTransferAction(page)
  const gets = api.requests.get
  await page.clock.runFor(12000)
  expect(api.requests.get).toBe(gets)
})

test('T11 malformed status preserves verified facts and disables unsafe transfer', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setPayment({ ...paymentSnapshot(), status: 'surprise_settled' })
  await page.clock.runFor(2200)
  await expect(page.getByRole('alert')).toContainText(/invalid|protocol|unrecognised|unrecognized/i)
  await noTransferAction(page)
  await expect(page.locator('main')).not.toContainText(/^Paid$/)
})

test('T11 invalid JSON HTTP 200 is a protocol failure that disables all transfer controls', async ({ page }) => {
  await stubApi(page)
  await startQuote(page)
  await page.route('**/api/payments/AQH-100306-PMT', route => route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'x-server-time': '2026-08-14T08:37:10.842Z' }, body: '{invalid-json' }))
  await page.clock.runFor(2200)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'awaiting_payment')
  await noTransferAction(page)
})

test('T15 transport failure keeps known funds instead of inventing payment failed', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  api.setState('detected')
  await page.clock.runFor(2200)
  api.setFault('500')
  await page.clock.runFor(2200)
  await expect(page.getByRole('alert')).toContainText(/HTTP 500/i)
  await expect(page.getByTestId('payment-status')).toContainText(/money arrived/i)
  await expect(page.getByTestId('payment-status')).not.toContainText(/payment failed/i)
  api.setFault('ok')
  await page.getByRole('button', { name: /Retry now/i }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const width of [320, 390, 768, 1280, 1440]) {
  test(`T18 responsive ${width}px and VM01 QR arrangement`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await stubApi(page)
    await startQuote(page)
    await noHorizontalOverflow(page)
    const qr = await page.getByTestId('transfer-qr').boundingBox()
    const address = await page.getByTestId('transfer-address').boundingBox()
    expect(qr).not.toBeNull()
    expect(address).not.toBeNull()
    if (width <= 390) expect(address!.y, 'Mobile reference requires address below the QR').toBeGreaterThanOrEqual(qr!.y + qr!.height)
    if (width >= 768) expect(address!.x, 'Desktop reference requires address beside the QR').toBeGreaterThan(qr!.x + qr!.width)
  })
}

test('T18 keyboard flow and announcements avoid ticking countdown noise', async ({ page }) => {
  await stubApi(page)
  await page.goto('/')
  const continueButton = page.getByRole('button', { name: /Continue with/ })
  await continueButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
  await expect(page.getByTestId('countdown').locator('xpath=ancestor-or-self::*[@aria-live="polite" or @aria-live="assertive"]')).toHaveCount(0)
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  await noHorizontalOverflow(page)
  const copyButton = page.getByRole('button', { name: 'Copy address', exact: true })
  await copyButton.focus()
  await expect(copyButton).toBeFocused()
})
