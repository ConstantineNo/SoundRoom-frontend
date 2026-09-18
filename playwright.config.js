import { defineConfig } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
process.env.TMPDIR = resolve('.tmp')
mkdirSync(process.env.TMPDIR, { recursive: true })
export default defineConfig({
  testDir: './tests', timeout: 30000, fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
  projects: [ { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } } ]
})
