import { test, expect } from '@playwright/test'

// A headed browser is essential: headless tabs do not reliably become hidden.
test.use({ headless: false })
test('T06 real two-minute background tab keeps the absolute deadline', async ({ page, context, request }, info) => {
  test.setTimeout(150000)
  await request.post('/api/demo/reset', { data: { ttlMs: 900000 } })
  await page.goto('/')
  await page.getByRole('button', { name: /Continue with/ }).click()
  const countdown = page.getByTestId('countdown')
  await expect(countdown).toBeVisible()
  const parse = (value: string) => {
    const [minutes, seconds] = value.split(':').map(Number)
    return minutes! * 60 + seconds!
  }
  const before = parse((await countdown.textContent())!)
  const started = Date.now()
  const foreground = await context.newPage()
  await foreground.goto('about:blank')
  await foreground.bringToFront()
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden')
  await new Promise(resolve => setTimeout(resolve, 60000))
  await new Promise(resolve => setTimeout(resolve, 60000))
  await page.bringToFront()
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible')
  await expect.poll(async () => Math.abs(parse((await countdown.textContent())!) - (before - (Date.now() - started) / 1000))).toBeLessThanOrEqual(2)
  await info.attach('real-background-observation', { contentType: 'application/json', body: JSON.stringify({ hiddenForAtLeastMs: 120000, elapsedMs: Date.now() - started, beforeSeconds: before, afterSeconds: parse((await countdown.textContent())!), visibilityAfterReturn: await page.evaluate(() => document.visibilityState) }) })
  await foreground.close()
})
