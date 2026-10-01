import { test, expect } from '@playwright/test'
import { fixedNow, paymentSnapshot, sourceQuote } from '../fixtures/oracles'
import { noHorizontalOverflow, noTransferAction, stubApi, type State } from './fixtures'

const views: Array<{ id: string; pages: [number, number]; state?: State }> = [
  { id: 'D01', pages: [1, 2] }, { id: 'D02', pages: [3, 4] },
  { id: 'D03', pages: [5, 6], state: 'awaiting_payment' }, { id: 'D04', pages: [7, 8], state: 'detected' },
  { id: 'D05', pages: [9, 10], state: 'confirming' }, { id: 'D06', pages: [11, 12], state: 'paid' },
  { id: 'D07', pages: [13, 14], state: 'expired' }, { id: 'D08', pages: [15, 16], state: 'underpaid' },
  { id: 'D09', pages: [17, 18], state: 'overpaid' }, { id: 'D10', pages: [19, 20], state: 'failed' },
  { id: 'D11', pages: [21, 22], state: 'awaiting_payment' }, { id: 'D12', pages: [23, 24] },
]

for (const view of views) for (const width of [1280, 390]) {
  test(`@visual ${view.id} ${width}px reference page ${view.pages[width === 1280 ? 0 : 1]}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const api = await stubApi(page, view.state)
    await page.clock.pauseAt(new Date(fixedNow + 1000))
    if (view.id === 'D05') {
      api.setPayment({ ...paymentSnapshot('confirming'), confirmations: 2, required_confirmations: 3,
        amount_received: '167.19', quote: { ...sourceQuote, network: 'ethereum', network_name: 'Ethereum (ERC-20)',
          network_fee: '4.50', total_due: '167.19', required_confirmations: 3,
          crypto_address: '0x1111111111111111111111111111111111111111' } })
    }
    await page.goto('/')
    if (view.id === 'D02' || view.id === 'D12') {
      await page.getByRole('radio', { name: 'USDC', exact: true }).check()
      await page.getByRole('radio', { name: /Polygon/ }).check()
    }
    if (view.id === 'D05') await page.getByRole('radio', { name: /Ethereum/ }).check()
    if (view.id === 'D12') api.setCreateDelay(8000)
    if (view.state || view.id === 'D12') {
      await page.getByRole('button', { name: /Continue with/ }).click()
      if (view.id === 'D12') {
        await expect(page.getByText(/Getting your quote/i)).toBeVisible()
        await noTransferAction(page)
      } else {
        await expect(page.getByTestId('payment-status')).toBeVisible()
      }
    }
    if (view.id === 'D11') {
      api.setFault('disconnect')
      await page.clock.runFor(2100)
      await expect(page.getByRole('alert')).toBeVisible()
    }
    if (view.id === 'D04') await noTransferAction(page)
    await page.evaluate(() => document.fonts.ready)
    await noHorizontalOverflow(page)
    await page.clock.pauseAt(new Date(fixedNow + 5000))
    await info.attach('reference-map', { body: JSON.stringify({ view: view.id, pdfPage: view.pages[width === 1280 ? 0 : 1], width, deviceScaleFactor: 1, font: 'system sans-serif substitution', clock: '2026-08-14T08:37:13.842Z', deviations: 'docs/DESIGN_SPEC.md conflict resolutions' }), contentType: 'application/json' })
    await expect(page).toHaveScreenshot(`${view.id}-${width}.png`, { fullPage: true, animations: 'disabled' })
  })
}
