// Refactor-only harness configuration. Not part of `npm run verify` or any gate.
// Usage is documented in docs/refactor/VERIFICATION.md.
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import base from '../../playwright.config'

const root = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: 'dom-equivalence.spec.ts',
  reporter: [['list']],
  outputDir: `${root}tmp/refactor/playwright-results`,
  webServer: { ...(base.webServer as object), command: 'npm run dev', cwd: root },
})
