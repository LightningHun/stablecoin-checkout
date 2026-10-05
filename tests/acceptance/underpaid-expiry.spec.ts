import { expect, test, type Page } from '@playwright/test'
import { fixedNow, paymentSnapshot, sourceQuote } from '../fixtures/oracles'
import { noTransferAction, stubApi } from './fixtures'

async function applyDemoAndPoll(page: Page, click: () => Promise<void>) {
  const applied = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/demo/scenario' && response.request().method() === 'POST',
  )
  await click()
  expect((await applied).status()).toBe(200)
  const polled = page.waitForResponse(response =>
    /^\/api\/payments\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === 'GET',
  )
  await page.clock.runFor(2000)
  await polled
}

async function expectExpired(page: Page) {
  await noTransferAction(page)
  await expect(page.getByTestId('transfer-address')).toHaveCount(0)
  await expect(page.getByTestId('countdown')).toHaveCount(0)
  await expect(page.getByTestId('payment-status').getByRole('status').filter({ hasText: /^Payment incomplete$/ })).toHaveText('Payment incomplete')
  await expect(page.getByTestId('incomplete-description')).toContainText('Do not send anything more to this address.')
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'underpaid')
  await expect(page.getByTestId('incomplete-subtitle')).toContainText('120.00 of 163.69 USDT received · the rate for the rest expired at')
  await expect(page.locator('.underpaid-incomplete .receipt > div').filter({ has: page.locator('dt', { hasText: /^Still owed$/ }) }).locator('dd')).toHaveText('43.69 USDT')
  await expect(page.getByTestId('payment-status')).not.toContainText('Send only')
  await expect(page.getByRole('button', { name: /Get a new quote|^Change$/ })).toHaveCount(0)
}

test('real mock: original underpaid deadline counts down, expires, restores without a flash and later becomes Paid', async ({ page, request }) => {
  expect((await request.post('/api/demo/reset', { data: { freeze: true, now: '2026-08-14T08:37:10.842Z' } })).status()).toBe(200)
  await page.clock.install({ time: new Date(fixedNow) })
  await page.clock.pauseAt(new Date(fixedNow + 1000))
  await page.goto('/?demo=1')
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('transfer-amount')).toHaveText(/163\.69\s*USDT/)
  expect((await request.post('/api/demo/scenario', { data: { advanceMs: 300000 } })).status()).toBe(200)
  await page.getByText('Demo controls', { exact: true }).click()
  await page.getByTestId('demo-state').selectOption('underpaid')
  await applyDemoAndPoll(page, () => page.getByTestId('demo-apply-state').click())
  await expect(page.getByTestId('countdown')).toHaveText('10:00')
  await expect(page.getByTestId('countdown').locator('xpath=ancestor-or-self::*[@aria-live="polite" or @aria-live="assertive"]')).toHaveCount(0)
  await page.clock.runFor(1000)
  await expect(page.getByTestId('countdown')).toHaveText('09:59')
  const before = await (await request.get('/api/payments/AQH-100307-PMT')).json()
  expect(before.quote.expires_at).toBe('2026-08-14T08:52:10.842Z')
  await applyDemoAndPoll(page, () => page.getByRole('button', { name: 'Advance 15 minutes', exact: true }).click())
  await expectExpired(page)
  expect(await (await request.get('/api/payments/AQH-100307-PMT')).json()).toEqual(before)
  await page.addInitScript(() => {
    const state = window as unknown as Window & { transferRenders: number }
    state.transferRenders = 0
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches('[data-testid="transfer-amount"], [data-testid="transfer-qr"], [data-testid="copy-address"]') || node.querySelector('[data-testid="transfer-amount"], [data-testid="transfer-qr"], [data-testid="copy-address"]')))
          state.transferRenders++
      }
    }).observe(document, { childList: true, subtree: true })
  })
  await page.reload()
  await expectExpired(page)
  expect(await page.evaluate(() => (window as unknown as Window & { transferRenders: number }).transferRenders)).toBe(0)
  await expect(page.getByTestId('payment-status').getByRole('link')).toHaveAttribute('href', 'https://tronscan.org/transaction/9d1f4c8a2be7a684d203a78f6b51c904e8f2d76519a0c3be62f41795a8d36c20/overview')
  await page.getByText('Demo controls', { exact: true }).click()
  await page.getByTestId('demo-state').selectOption('paid')
  await applyDemoAndPoll(page, () => page.getByTestId('demo-apply-state').click())
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'paid')
  await expect(page.getByTestId('payment-status').getByRole('status').filter({ hasText: /^Paid$/ })).toHaveText('Paid')
  await noTransferAction(page)
})

test('slow reconciliation and an old server clock never resurrect an expired underpaid quote', async ({ page }) => {
  const api = await stubApi(page, 'underpaid')
  const quote = { ...sourceQuote, expires_at: '2026-08-14T08:37:11.842Z' }
  const payment = { ...paymentSnapshot('underpaid'), quote }
  api.setPayment(payment)
  await page.clock.pauseAt(new Date(fixedNow + 1000))
  await page.goto('/')
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('transfer-amount')).toHaveText(/43\.69\s*USDT/)
  let finish!: () => void
  let gets = 0
  await page.route('**/api/payments/AQH-100306-PMT', async route => {
    gets++
    await new Promise<void>(resolve => { finish = resolve })
    await route.fulfill({ headers: { 'x-server-time': '2026-08-14T08:37:10.842Z' }, json: payment })
  })
  await page.clock.runFor(1100)
  await expectExpired(page)
  await expect.poll(() => gets).toBe(1)
  await page.clock.runFor(2000)
  expect(gets).toBe(1)
  const response = page.waitForResponse('**/api/payments/AQH-100306-PMT')
  finish(); await response
  await expectExpired(page)
  await page.unroute('**/api/payments/AQH-100306-PMT')
  api.setPayment({ ...paymentSnapshot('paid'), quote })
  await page.clock.runFor(2200)
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'paid')
})

test('HTTP 500 at the underpaid deadline hides every send control while retaining the receipt', async ({ page }) => {
  const api = await stubApi(page, 'underpaid')
  api.setPayment({ ...paymentSnapshot('underpaid'), quote: { ...sourceQuote, expires_at: '2026-08-14T08:37:11.842Z' } })
  await page.clock.pauseAt(new Date(fixedNow + 1000))
  await page.goto('/')
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('transfer-qr')).toBeVisible()
  api.setFault('500')
  await page.clock.runFor(1100)
  await expectExpired(page)
  await expect(page.getByRole('alert')).toBeVisible()
  await page.clock.runFor(12000)
  await expectExpired(page)
  expect(api.requests.get).toBeGreaterThan(1)
  expect(api.requests.maxActiveGet).toBe(1)
  expect(api.requests.requote).toBe(0)
})
