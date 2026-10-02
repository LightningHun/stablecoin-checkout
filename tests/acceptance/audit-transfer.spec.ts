import { expect, test } from '@playwright/test'
import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { paymentSnapshot, sourceQuote } from '../fixtures/oracles'
import { startQuote, stubApi } from './fixtures'

test('T03/T04 replacement QR independently decodes to the accepted Ethereum address', async ({ page }) => {
  const api = await stubApi(page)
  await startQuote(page)
  const address = '0x2222222222222222222222222222222222222222'
  api.setPayment({ ...paymentSnapshot(), payment_reference: 'AQH-200000-PMT', quote: {
    ...sourceQuote, network: 'ethereum', network_name: 'Ethereum (ERC-20)',
    network_fee: '4.50', total_due: '167.19', required_confirmations: 3,
    crypto_address: address,
  } })
  await page.getByRole('button', { name: 'Change', exact: true }).click()
  await page.getByRole('radio', { name: /Ethereum/ }).check()
  await expect(page.getByTestId('continue')).toBeVisible()
  await expect(page.getByTestId('transfer-address')).toHaveCount(0)
  await page.getByTestId('continue').click()
  await expect(page.getByTestId('transfer-address')).toHaveText(address)
  await expect(page.getByTestId('transfer-amount')).toContainText('167.19')
  const png = PNG.sync.read(await page.getByTestId('transfer-qr').screenshot())
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)
  expect(decoded?.data, 'Replacement QR must encode the accepted Ethereum address').toBe(address)
})
