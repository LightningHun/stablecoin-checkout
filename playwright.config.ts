import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/acceptance',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 5000, toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  outputDir: 'reports/playwright-results',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'en-IE', timezoneId: 'UTC' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
})
