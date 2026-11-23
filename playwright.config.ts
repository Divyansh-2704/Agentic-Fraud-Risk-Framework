// Automated UI tests (Playwright, Chromium). They start their own API + UI on separate ports against the
// TEST database, so they never touch the demo data in the main database. Run: npm run test:ui
import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (existsSync('.env')) process.loadEnvFile('.env')
const testDb = /^postgres(ql)?:\/\//.test(process.env.TEST_DATABASE_URL ?? '') ? process.env.TEST_DATABASE_URL! : ''
const API_PORT = process.env.UI_TEST_API_PORT ?? '4100'
const UI_PORT = process.env.UI_TEST_UI_PORT ?? '5273'
const serverEnv: Record<string, string> = {
  ...(process.env as Record<string, string>),
  PORT: API_PORT,
  DATABASE_URL: testDb, // '' = SQLite fallback (file below)
  FCMS_DB: join(tmpdir(), 'fcms-ui-test.db'),
  FCMS_DATA_DIR: join(tmpdir(), 'fcms-ui-test'),
}

export default defineConfig({
  testDir: './e2e-ui',
  // The tests share one database and replay business flows, so they run one at a time, in file order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }], ['json', { outputFile: 'test-results/ui-results.json' }]],
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'npm run start -w server', url: `http://localhost:${API_PORT}/api/health`, env: serverEnv, reuseExistingServer: false, timeout: 180_000, stdout: 'ignore', stderr: 'pipe' },
    { command: 'npm run dev -w client', url: `http://localhost:${UI_PORT}`, env: { ...serverEnv, API_PORT, UI_PORT }, reuseExistingServer: false, timeout: 120_000, stdout: 'ignore', stderr: 'pipe' },
  ],
})
