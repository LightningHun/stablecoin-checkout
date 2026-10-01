import { test, expect, chromium, type Browser } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Playwright's usual Chromium startup deliberately enables always-focused emulation.
// Start a real isolated headed profile and connect with noDefaults, so native tab
// activation drives visibility and background throttling. Never fake document.hidden.
test('T06 real two-minute background tab keeps the absolute deadline', async ({ request }, info) => {
  test.setTimeout(150000)
  await request.post('/api/demo/reset', { data: { ttlMs: 900000 } })
  const profile = await mkdtemp(join(tmpdir(), 'checkout-background-'))
  const process = spawn(chromium.executablePath(), ['--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  let browser: Browser | undefined
  try {
  const endpoint = await new Promise<string>((resolve, reject) => {
    let buffer = ''
    const timeout = setTimeout(() => reject(new Error('Native Chromium startup timed out')), 15000)
    process.stderr.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(buffer)
      if (match) { clearTimeout(timeout); resolve(match[1]!) }
    })
    process.once('error', error => { clearTimeout(timeout); reject(error) })
  })
  browser = await chromium.connectOverCDP(endpoint, { noDefaults: true })
  const context = browser.contexts()[0]!
  const page = context.pages()[0]!
  await page.goto('http://127.0.0.1:5173/')
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
  expect(await page.evaluate(() => document.visibilityState)).toBe('hidden')
  await new Promise(resolve => setTimeout(resolve, 60000))
  expect(await page.evaluate(() => document.visibilityState)).toBe('hidden')
  await page.bringToFront()
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible')
  await expect.poll(async () => Math.abs(parse((await countdown.textContent())!) - (before - (Date.now() - started) / 1000))).toBeLessThanOrEqual(2)
  await info.attach('real-background-observation', { contentType: 'application/json', body: JSON.stringify({ harness: 'Native headed Chromium; isolated profile; CDP noDefaults; no visibility emulation', hiddenForAtLeastMs: 120000, elapsedMs: Date.now() - started, beforeSeconds: before, afterSeconds: parse((await countdown.textContent())!), visibilityAfterReturn: await page.evaluate(() => document.visibilityState) }) })
  await foreground.close()
  } finally {
    await browser?.close()
    process.kill('SIGTERM')
    await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})
