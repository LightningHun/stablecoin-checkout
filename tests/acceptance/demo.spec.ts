import { test, expect } from '@playwright/test'
import { catalogueRows, statuses, syntheticQuotes, sourceAddress } from '../fixtures/oracles'
import { noTransferAction } from './fixtures'

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBe(true)
})

for (const state of statuses) {
  test(`T17 real HTTP evaluator control drives ${state}`, async ({ page }) => {
    await page.goto('/?demo=1')
    await page.getByRole('button', { name: /Continue with/ }).click()
    await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
    await page.getByText('Demo controls', { exact: true }).click()
    await page.getByTestId('demo-state').selectOption(state)
    await page.getByTestId('demo-apply-state').click()
    await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', state)
    await page.getByTestId('demo-reset').click()
    await expect(page.getByRole('button', { name: /Continue with/ })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('stablecoin-checkout:payment-reference:ORD-88213'))).toBeNull()
    await expect(page.getByTestId('transfer-amount')).toHaveCount(0)
  })
}

for (const fault of ['500', 'disconnect', 'slow']) {
  test(`T17 real HTTP evaluator ${fault} and recovery`, async ({ page }) => {
    await page.goto('/?demo=1')
    await page.getByRole('button', { name: /Continue with/ }).click()
    await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
    await page.getByText('Demo controls', { exact: true }).click()
    await page.getByTestId('demo-fault').selectOption(fault)
    await page.getByTestId('demo-apply-fault').click()
    if (fault !== 'slow') {
      await expect(page.getByRole('alert')).toBeVisible()
      await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'awaiting_payment')
    } else {
      await expect(page.getByTestId('transfer-address')).toHaveText(sourceAddress)
    }
    await page.getByTestId('demo-fault').selectOption('none')
    await page.getByTestId('demo-apply-fault').click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByTestId('transfer-address')).toHaveText(sourceAddress)
  })
}

for (const [currency, , network, networkName] of catalogueRows) {
  test(`T02 real UI quote for ${currency}/${network}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: currency, exact: true }).check()
    await page.getByRole('radio', { name: new RegExp(networkName.replace(/[()]/g, '\\$&')) }).check()
    await page.getByRole('button', { name: /Continue with/ }).click()
    const key = `${currency}/${network}`
    const expected = key === 'USDT/tron' ? { total_due: '163.69', crypto_address: sourceAddress } : syntheticQuotes[key as keyof typeof syntheticQuotes]
    await expect(page.getByTestId('transfer-amount')).toContainText(expected.total_due)
    await expect(page.getByTestId('transfer-address')).toHaveText(expected.crypto_address)
  })
}

test('T14 real HTTP 15-second quote expiry removes sending and requotes the same reference', async ({ page, request }, info) => {
  await request.post('/api/demo/reset', { data: { ttlMs: 15000 } })
  await page.goto('/')
  await page.getByRole('button', { name: /Continue with/ }).click()
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'awaiting_payment')
  await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
  const initial = await (await request.get('/api/demo')).json() as { payment: { payment_reference: string; quote: { expires_at: string } } }
  const started = Date.now()
  await info.attach('15-second-quote-awaiting', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'expired', { timeout: 20000 })
  await noTransferAction(page)
  await info.attach('15-second-quote-expired', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  const elapsedMs = Date.now() - started
  expect(elapsedMs).toBeGreaterThan(12000)
  expect(elapsedMs).toBeLessThan(20000)
  await page.getByRole('button', { name: /Get a new quote/i }).click()
  await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
  const renewed = await (await request.get('/api/demo')).json() as { payment: { payment_reference: string; quote: { expires_at: string } } }
  expect(renewed.payment.payment_reference).toBe(initial.payment.payment_reference)
  expect(Date.parse(renewed.payment.quote.expires_at)).toBeGreaterThan(Date.parse(initial.payment.quote.expires_at))
  await info.attach('15-second-expiry-observation', { body: JSON.stringify({ ttlMs: 15000, elapsedMs, initial, renewed }), contentType: 'application/json' })
})
