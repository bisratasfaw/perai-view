// Captures the README screenshots and the social-preview image from a running preview build.
//
//   npm run build && npm run preview      (in one terminal)
//   npm run screenshots                   (in another)
//
// Options (env): BASE_URL (default http://localhost:4173), PW_CHANNEL=chrome to use installed Chrome.
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const images = path.join(root, 'docs', 'images')
const publicDir = path.join(root, 'frontend', 'public')
const base = process.env.BASE_URL ?? 'http://localhost:4173'

await mkdir(images, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function open(page, query) {
  await page.goto(`${base}/?debug${query ? `&${query}` : ''}`)
  await page.waitForFunction(() => window.__globe?.viewer.scene.globe.tilesLoaded === true, null, { timeout: 90_000 })
  await page.evaluate(() => window.__globe.setRotationWanted(false))
  // Give imagery refinement, labels and a few live events time to appear.
  await sleep(6000)
  await page.waitForFunction(() => window.__globe?.viewer.scene.globe.tilesLoaded === true, null, { timeout: 60_000 })
}

async function shot(name, { query = '', viewport = { width: 1440, height: 900 }, scale = 1, before } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await open(page, query)
  if (before) await before(page)
  // README screenshots are JPEG to keep the repository small; the social card stays PNG.
  const isOg = name.startsWith('og')
  const file = path.join(isOg ? publicDir : images, `${name}.${isOg ? 'png' : 'jpg'}`)
  await page.screenshot(isOg ? { path: file } : { path: file, type: 'jpeg', quality: 86 })
  console.log('saved', path.relative(root, file))
  await context.close()
}

await shot('hero')
await shot('heat-map', { query: 'layer=heat' })
await shot('cyber', { query: 'theme=cyber' })
await shot('analytics', {
  query: 'city=London',
  before: async (page) => {
    await page.getByRole('button', { name: 'Analytics' }).click()
    await sleep(2500)
  },
})
await shot('real-data', {
  query: 'layer=usage-index&country=DE',
  before: async (page) => {
    await page.getByRole('button', { name: 'Analytics' }).click()
    await page.getByRole('tab', { name: 'Real data' }).click()
    await sleep(2500)
  },
})
await shot('mobile', { viewport: { width: 390, height: 844 }, scale: 2 })
await shot('og-image', { viewport: { width: 1200, height: 630 } })

await browser.close()
