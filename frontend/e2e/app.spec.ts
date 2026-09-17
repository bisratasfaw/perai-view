import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openApp, trackErrors, waitForTiles } from './helpers'

test.describe('desktop', () => {
  test('loads the globe with imagery, borders and no errors', async ({ page }) => {
    const errors = trackErrors(page)
    await openApp(page)
    await waitForTiles(page)

    const layers = await page.evaluate(() => window.__globe!.viewer.imageryLayers.length)
    expect(layers).toBeGreaterThanOrEqual(2)
    await expect(page.getByRole('button', { name: /Simulated data/ })).toBeVisible()
    await expect(page.locator('.feed li').first()).toBeVisible()
    await expect(page.locator('.cesium-widget-credits')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('switches layer and style, and keeps them in the URL', async ({ page }) => {
    await openApp(page)
    const layer = page.getByRole('group', { name: 'Map layer' })
    const style = page.getByRole('group', { name: 'Globe style' })

    await layer.getByRole('button', { name: 'Heat map' }).click()
    await style.getByRole('button', { name: 'Cyber' }).click()
    await expect(layer.getByRole('button', { name: 'Heat map' })).toHaveAttribute('aria-pressed', 'true')
    await expect(style.getByRole('button', { name: 'Cyber' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Activity right now' })).toBeVisible()
    await expect(page).toHaveURL(/layer=heat/)
    await expect(page).toHaveURL(/theme=cyber/)

    await page.reload()
    await expect(page.getByRole('group', { name: 'Map layer' }).getByRole('button', { name: 'Heat map' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('opens analytics, flies to a city and shows its details', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Analytics' }).click()

    const panel = page.getByRole('complementary', { name: 'Analytics' })
    await expect(panel.getByText('AI activities')).toBeVisible()
    await expect(panel.getByRole('img', { name: /Activity per hour/ })).toBeVisible()
    await expect(panel.getByRole('list').filter({ hasText: 'ChatGPT' })).toBeVisible()
    const cities = panel.getByRole('button', { name: /Show on globe/ })
    await expect(cities).toHaveCount(10)

    await panel.getByRole('button', { name: /^Tokyo,/ }).click()
    const card = page.getByRole('region', { name: 'Tokyo' })
    await expect(card).toBeVisible()
    await expect(card.getByText('Leading assistant')).toBeVisible()
    await expect(card.getByText(/≈ \d{2}:\d{2} local time/)).toBeVisible()
    await expect(page).toHaveURL(/city=Tokyo/)

    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
    await page.getByRole('button', { name: 'Close analytics' }).click()
    await expect(panel).toBeHidden()
  })

  test('opening a shared link restores the selected city', async ({ page }) => {
    await openApp(page, 'city=Nairobi&theme=cyber')
    await expect(page.getByRole('region', { name: 'Nairobi' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Globe style' }).getByRole('button', { name: 'Cyber' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('explains that the data is simulated', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: /Simulated data/ }).click()
    const dialog = page.getByRole('dialog', { name: 'About PerAI View' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('All data on this site is simulated.')).toBeVisible()
    await expect(dialog.getByText(/directly in your browser/)).toBeVisible()

    // The static demo classifies prompts with the keyword fallback and says so.
    await dialog.getByRole('button', { name: 'Classify' }).click()
    await expect(dialog.locator('.classifier-result strong')).toHaveText('Coding')
    await expect(dialog.getByText(/keyword matcher answered/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('globe controls work from the keyboard', async ({ page }) => {
    await openApp(page)
    const pause = page.getByRole('button', { name: 'Pause rotation' })
    await pause.focus()
    await page.keyboard.press('Enter')
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Zoom in' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Reset view' }).click()
  })

  test('has no serious accessibility violations', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Analytics' }).click()
    await expect(page.getByText('AI activities')).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .exclude('.cesium-widget')
      .analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
})

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('does not auto-rotate and hides the rotation control', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Pause rotation' })).toHaveCount(0)
    const reduced = await page.evaluate(() => (window.__globe as unknown as { reducedMotion: boolean }).reducedMotion)
    expect(reduced).toBe(true)
  })
})
