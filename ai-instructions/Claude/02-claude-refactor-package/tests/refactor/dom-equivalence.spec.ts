/**
 * Refactor equivalence oracle. This is NOT an acceptance test and never replaces
 * the formal suites; it proves that a refactor left the rendered UI unchanged.
 *
 * For each scenario (D01-D12 from tests/acceptance/design.spec.ts plus X01-X06)
 * at 390px and 1280px it records:
 *   - the ARIA snapshot of <body> (roles, names, states),
 *   - rendered text (innerText) and the focused element,
 *   - every element's identity (tag, classes, key attributes, form state),
 *     document-relative layout box and a curated set of computed styles.
 *
 *   Capture baseline (BEFORE the first refactor edit, on a clean tree):
 *     REFACTOR_DOM=baseline npx playwright test -c tests/refactor/playwright.config.ts
 *   Compare after each step:
 *     npx playwright test -c tests/refactor/playwright.config.ts
 *
 * Baselines live in tmp/refactor/dom-baseline (git-ignored) and depend on the
 * machine's fonts and browser build: capture and compare on the same machine.
 * Never re-capture the baseline to make a refactor pass. A difference means the
 * step changed rendered output and must be fixed or reverted.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { fixedNow, paymentSnapshot, sourceQuote } from '../fixtures/oracles'
import { stubApi, type State } from '../acceptance/fixtures'

const root = fileURLToPath(new URL('../..', import.meta.url))
const baselineDir = `${root}tmp/refactor/dom-baseline`
const currentDir = `${root}tmp/refactor/dom-current`
const capturing = process.env.REFACTOR_DOM === 'baseline'

interface Scenario { id: string; state?: State; search?: string; prepare?: (page: Page, api: Awaited<ReturnType<typeof stubApi>>) => Promise<void> }

const ethQuote = {
  ...sourceQuote, crypto_currency: 'ETH', network: 'ethereum', network_name: 'Ethereum', exchange_rate: '2448.0123',
  crypto_amount: '0.061234567890123456', network_fee: '3.20', total_due: '3.261234567890123456',
  crypto_address: '0x4444444444444444444444444444444444444444', required_confirmations: 3,
}

const continueButton = (page: Page) => page.getByRole('button', { name: /Continue with/ })
async function waitForQr(page: Page) {
  const qr = page.getByTestId('transfer-qr')
  await expect(qr).toBeVisible()
  await expect.poll(() => qr.evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true)
}
async function acceptQuote(page: Page, state: State) {
  await continueButton(page).click()
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', state)
  if (state === 'awaiting_payment' || state === 'underpaid') await waitForQr(page)
}
const selectPolygon = async (page: Page) => {
  await page.getByRole('radio', { name: 'USDC', exact: true }).check()
  await page.getByRole('radio', { name: /Polygon/ }).check()
}

// D01-D12 mirror tests/acceptance/design.spec.ts; X01-X06 cover UI the design set does not show
// (demo panel, clipboard fallback, de-DE, 18-decimal ETH quote, local deadline notice, uncertain POST).
const scenarios: Scenario[] = [
  { id: 'D01' },
  { id: 'D02', prepare: selectPolygon },
  ...(['D03', 'D04', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11'] as const).map((id): Scenario => {
    const state = ({ D03: 'awaiting_payment', D04: 'detected', D06: 'paid', D07: 'expired', D08: 'underpaid', D09: 'overpaid', D10: 'failed', D11: 'awaiting_payment' } as const)[id]
    return {
      id, state,
      prepare: async (page, api) => {
        await acceptQuote(page, state)
        if (id === 'D11') {
          api.setFault('disconnect')
          await page.clock.runFor(2100)
          await expect(page.getByRole('alert')).toBeVisible()
        }
      },
    }
  }),
  {
    id: 'D05', state: 'confirming',
    prepare: async (page, api) => {
      api.setPayment({ ...paymentSnapshot('confirming'), confirmations: 2, required_confirmations: 3, amount_received: '167.19',
        quote: { ...sourceQuote, network: 'ethereum', network_name: 'Ethereum (ERC-20)', network_fee: '4.50', total_due: '167.19',
          required_confirmations: 3, crypto_address: '0x1111111111111111111111111111111111111111' } })
      await page.getByRole('radio', { name: /Ethereum/ }).check()
      await acceptQuote(page, 'confirming')
    },
  },
  {
    id: 'D12',
    prepare: async (page, api) => {
      await selectPolygon(page)
      api.setCreateDelay(8000)
      await continueButton(page).click()
      await expect(page.getByText(/Getting your quote/i)).toBeVisible()
    },
  },
  {
    id: 'X01-demo-controls', state: 'awaiting_payment', search: '?demo=1',
    prepare: async page => {
      await acceptQuote(page, 'awaiting_payment')
      await page.getByText('Demo controls · no real funds', { exact: true }).click()
      await expect(page.getByTestId('demo-state')).toBeVisible()
    },
  },
  {
    id: 'X02-copy-fallback', state: 'awaiting_payment',
    prepare: async page => {
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }))
      await acceptQuote(page, 'awaiting_payment')
      await page.getByRole('button', { name: 'Copy address', exact: true }).click()
      await expect(page.getByRole('textbox', { name: /copy manually/i })).toBeVisible()
    },
  },
  { id: 'X03-de-DE', search: '?locale=de-DE' },
  {
    id: 'X04-eth-quote', state: 'awaiting_payment',
    prepare: async (page, api) => {
      api.setPayment({ ...paymentSnapshot(), quote: ethQuote })
      await page.getByRole('radio', { name: 'ETH', exact: true }).check()
      await acceptQuote(page, 'awaiting_payment')
    },
  },
  {
    id: 'X05-local-deadline', state: 'awaiting_payment',
    prepare: async (page, api) => {
      api.setPayment({ ...paymentSnapshot(), quote: { ...sourceQuote, expires_at: new Date(fixedNow + 3000).toISOString() } })
      await acceptQuote(page, 'awaiting_payment')
      // Leave the reconciling GET pending: the stub's fixed x-server-time would otherwise re-anchor the clock.
      await page.route('**/api/payments/*', () => undefined)
      await page.clock.runFor(3200)
      await expect(page.getByText(/Quote time ended/)).toBeVisible()
    },
  },
  {
    id: 'X06-uncertain-create',
    prepare: async page => {
      await page.route('**/api/payments', route => route.abort('connectionfailed'))
      await continueButton(page).click()
      await expect(page.getByRole('alert')).toContainText(/outcome is uncertain/)
    },
  },
]

const STYLE_PROPERTIES = [
  'display', 'position', 'box-sizing', 'visibility', 'opacity', 'z-index', 'overflow-x', 'overflow-y',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-left-style',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'color', 'background-color', 'background-image', 'box-shadow', 'accent-color', 'image-rendering', 'cursor',
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-transform', 'text-align',
  'text-decoration-line', 'text-underline-offset', 'white-space', 'overflow-wrap', 'word-break',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'justify-content', 'align-items', 'align-self',
  'row-gap', 'column-gap', 'grid-template-columns', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
  'place-items', 'transform', 'clip', 'outline-style',
]

interface ElementRecord { key: string; attributes: Record<string, string>; box: number[]; style: Record<string, string> }
interface Capture { aria: string; text: string; focused: string; elements: ElementRecord[] }

async function capture(page: Page): Promise<Capture> {
  const aria = await page.locator('body').ariaSnapshot()
  const dom = await page.evaluate(properties => {
    const round = (value: number) => Math.round(value * 100) / 100
    const hash = (value: string) => { let h = 2166136261; for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619); return (h >>> 0).toString(16) }
    const keyOf = (element: Element): string => {
      const parts: string[] = []
      for (let node: Element | null = element; node && node !== document.body; node = node.parentElement) {
        const index = node.parentElement ? Array.prototype.indexOf.call(node.parentElement.children, node) : 0
        parts.unshift(`${node.tagName.toLowerCase()}[${index}]${node.classList.length ? '.' + [...node.classList].join('.') : ''}`)
      }
      return parts.join('>') || 'body'
    }
    const elements = [...document.body.querySelectorAll('*')].map(element => {
      const attributes: Record<string, string> = {}
      for (const attribute of element.attributes) {
        if (attribute.name === 'class' || attribute.name === 'style' || attribute.name.startsWith('data-v-')) continue
        attributes[attribute.name] = attribute.name === 'src' ? `hash:${hash(attribute.value)}` : attribute.value
      }
      if (element.getAttribute('style')) attributes.style = element.getAttribute('style')!
      if (element instanceof HTMLInputElement) Object.assign(attributes, { '#checked': String(element.checked), '#value': element.value, '#disabled': String(element.disabled) })
      if (element instanceof HTMLButtonElement || element instanceof HTMLFieldSetElement) attributes['#disabled'] = String(element.disabled)
      if (element instanceof HTMLSelectElement) attributes['#value'] = element.value
      if (element instanceof HTMLDetailsElement) attributes['#open'] = String(element.open)
      const rect = element.getBoundingClientRect()
      const computed = getComputedStyle(element)
      const style: Record<string, string> = {}
      for (const property of properties) style[property] = computed.getPropertyValue(property)
      return { key: keyOf(element), attributes, box: [rect.x + scrollX, rect.y + scrollY, rect.width, rect.height].map(round), style }
    })
    const active = document.activeElement
    return { text: document.body.innerText, focused: active && active !== document.body ? keyOf(active) : 'body', elements }
  }, STYLE_PROPERTIES)
  return { aria, ...dom }
}

// The paused clock can still deliver one pending re-render (e.g. the countdown tick fired by
// pauseAt). Like toHaveScreenshot, wait until two consecutive captures are identical.
async function stableCapture(page: Page): Promise<Capture> {
  let previous = await capture(page)
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(150)
    const next = await capture(page)
    if (JSON.stringify(next) === JSON.stringify(previous)) return next
    previous = next
  }
  throw new Error('Rendered output did not stabilise within 3 seconds')
}

function differences(expected: Capture, actual: Capture): string[] {
  const found: string[] = []
  if (expected.aria !== actual.aria) found.push(`ARIA snapshot changed\n--- baseline\n${expected.aria}\n--- current\n${actual.aria}`)
  if (expected.text !== actual.text) found.push(`Rendered text changed\n--- baseline\n${JSON.stringify(expected.text)}\n--- current\n${JSON.stringify(actual.text)}`)
  if (expected.focused !== actual.focused) found.push(`Focused element changed: ${expected.focused} -> ${actual.focused}`)
  if (expected.elements.length !== actual.elements.length) found.push(`Element count changed: ${expected.elements.length} -> ${actual.elements.length}`)
  const count = Math.min(expected.elements.length, actual.elements.length)
  for (let i = 0; i < count && found.length < 25; i++) {
    const before = expected.elements[i]!
    const after = actual.elements[i]!
    if (before.key !== after.key) { found.push(`Element #${i} identity changed: ${before.key} -> ${after.key}`); continue }
    if (JSON.stringify(before.attributes) !== JSON.stringify(after.attributes)) found.push(`${before.key} attributes: ${JSON.stringify(before.attributes)} -> ${JSON.stringify(after.attributes)}`)
    if (before.box.join() !== after.box.join()) found.push(`${before.key} box [x,y,w,h]: ${before.box.join(', ')} -> ${after.box.join(', ')}`)
    for (const property of Object.keys(before.style))
      if (before.style[property] !== after.style[property]) found.push(`${before.key} ${property}: ${before.style[property]} -> ${after.style[property]}`)
  }
  return found
}

test.beforeAll(() => {
  if (!capturing) return
  mkdirSync(baselineDir, { recursive: true })
  const run = (command: string) => { try { return execSync(command, { cwd: root, encoding: 'utf8' }).trim() } catch { return 'unavailable' } }
  writeFileSync(`${baselineDir}/meta.json`, JSON.stringify({
    capturedAt: new Date().toISOString(), head: run('git rev-parse HEAD'),
    uncommittedSourceChanges: run('git status --porcelain -- src mock index.html'),
  }, null, 2))
})

for (const scenario of scenarios) for (const width of [1280, 390]) {
  test(`${scenario.id} ${width}px rendered output is unchanged`, async ({ page }) => {
    const file = `${scenario.id}-${width}.json`
    await page.setViewportSize({ width, height: 900 })
    const api = await stubApi(page, scenario.state)
    await page.clock.pauseAt(new Date(fixedNow + 1000))
    await page.goto(`/${scenario.search ?? ''}`)
    await expect(continueButton(page)).toBeEnabled()
    await scenario.prepare?.(page, api)
    await page.evaluate(() => document.fonts.ready)
    await page.clock.pauseAt(new Date(fixedNow + 5000))
    const current = await stableCapture(page)
    if (capturing) {
      writeFileSync(`${baselineDir}/${file}`, JSON.stringify(current, null, 1))
      return
    }
    expect(existsSync(`${baselineDir}/${file}`), `Missing baseline ${file}. Capture it on the unrefactored commit first.`).toBe(true)
    const baseline = JSON.parse(readFileSync(`${baselineDir}/${file}`, 'utf8')) as Capture
    const found = differences(baseline, current)
    if (found.length) {
      mkdirSync(currentDir, { recursive: true })
      writeFileSync(`${currentDir}/${file}`, JSON.stringify(current, null, 1))
    }
    expect(found, `${scenario.id} at ${width}px differs from the pre-refactor baseline (full capture: tmp/refactor/dom-current/${file})`).toEqual([])
  })
}
