import { defineConfig, devices } from '@playwright/test'

const isCI = Boolean(process.env.CI)

// CI runners have no GPU, so WebGL runs on SwiftShader there (PW_GPU=swiftshader does the same locally).
const software = isCI || process.env.PW_GPU === 'swiftshader'
const gpuArgs = software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist']

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // Set PW_CHANNEL=chrome to use an installed Chrome instead of Playwright's Chromium.
    channel: process.env.PW_CHANNEL || undefined,
    launchOptions: { args: gpuArgs },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /mobile/ },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 240_000,
  },
})
