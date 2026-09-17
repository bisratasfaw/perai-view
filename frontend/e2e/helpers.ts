import { expect, type Page } from '@playwright/test'

interface GlobeDebug {
  viewer: {
    isDestroyed(): boolean
    imageryLayers: { length: number }
    scene: { globe: { tilesLoaded: boolean } }
  }
}

declare global {
  interface Window {
    __globe?: GlobeDebug
  }
}

/** Collects console errors and failed same-origin requests during a test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().startsWith('http://localhost')) errors.push(`${res.status()} ${res.url()}`)
  })
  return errors
}

/** Opens the app with the debug handle enabled and waits until the globe has rendered its tiles. */
export async function openApp(page: Page, query = ''): Promise<void> {
  const separator = query ? '&' : ''
  await page.goto(`/?debug${separator}${query}`)
  await expect(page.getByRole('heading', { name: 'PerAI View', level: 1 })).toBeVisible()
  await page.waitForFunction(() => Boolean(window.__globe && !window.__globe.viewer.isDestroyed()), null, { timeout: 60_000 })
}

export async function waitForTiles(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__globe?.viewer.scene.globe.tilesLoaded === true, null, { timeout: 60_000 })
}
