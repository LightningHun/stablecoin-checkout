import { test, expect } from '@playwright/test'
import { catalogueRows, statuses, syntheticQuotes, sourceAddress } from '../fixtures/oracles'

test.beforeEach(async ({ request }) => {
  expect((await request.post('/api/demo/reset')).ok()).toBe(true)
})

for (const state of statuses) {
  test(`T17 real HTTP evaluator control drives ${state}`, async ({ page }) => {
    await page.goto('/?demo=1')
    await page.getByRole('button', { name: /Continue with/ }).click()
    await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
    await page.getByText('Demo controls · no real funds', { exact: true }).click()
    await page.getByTestId('demo-state').selectOption(state)
    await page.getByTestId('demo-apply-state').click()
    await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', state)
    await page.getByTestId('demo-reset').click()
    await expect(page.getByRole('button', { name: /Continue with/ })).toBeVisible()
    await expect(page.getByText(/AQH-100306-PMT/)).toHaveCount(0)
  })
}

for (const fault of ['500', 'disconnect', 'slow']) {
  test(`T17 real HTTP evaluator ${fault} and recovery`, async ({ page }) => {
    await page.goto('/?demo=1')
    await page.getByRole('button', { name: /Continue with/ }).click()
    await expect(page.getByTestId('transfer-amount')).toContainText('163.69')
    await page.getByText('Demo controls · no real funds', { exact: true }).click()
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
