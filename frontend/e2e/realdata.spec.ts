import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openApp, trackErrors } from './helpers'

test.describe('real data layers', () => {
  test('ships validated snapshots with the site', async ({ request }) => {
    const manifest = await request.get('/data/real/manifest.json')
    expect(manifest.ok()).toBe(true)
    const body = (await manifest.json()) as { schema_version: number; sources: Record<string, { status: string }> }
    expect(body.schema_version).toBe(1)
    expect(Object.keys(body.sources).sort()).toEqual(['anthropic_economic_index', 'github_forks', 'openai_usage_report', 'pypi_downloads', 'wikipedia_pageviews'])
  })

  test('switches to a country layer, shows provenance and picks a country', async ({ page }) => {
    const errors = trackErrors(page)
    await openApp(page)

    await page.getByRole('button', { name: /^Layer/ }).click()
    const menu = page.getByRole('listbox', { name: 'Map layer' })
    await menu.getByRole('option', { name: /Claude usage by country/ }).click()

    await expect(page).toHaveURL(/layer=usage-index/)
    await expect(page.getByRole('button', { name: /Real data from Anthropic/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Usage index' })).toBeVisible()
    await expect(page.locator('.legend').getByText(/proportional to population/)).toBeVisible()

    // Pick a country from the analytics rankings; the country card and outline appear.
    await page.getByRole('button', { name: 'Analytics' }).click()
    await expect(page.getByRole('tab', { name: 'Real data' })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: /usage index .* Show on globe/ }).first().click()
    const card = page.locator('.city-card')
    await expect(card.getByText('Claude usage index')).toBeVisible()
    await expect(page).toHaveURL(/country=[A-Z]{2}/)
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
    expect(errors).toEqual([])
  })

  test('shows the Wikipedia trend and developer cities with sources', async ({ page }) => {
    await openApp(page, 'layer=dev-cities')
    const chip = page.getByRole('button', { name: /Real data from GitHub/ })
    await expect(chip).toBeVisible()
    // The visible label keeps the publisher name (only a trailing parenthetical is dropped).
    await expect(chip).toContainText(/Real data · GitHub · \d{4}-\d{2}-\d{2}/)
    await expect(page.getByRole('heading', { name: 'Developers by city' })).toBeVisible()

    await page.getByRole('button', { name: 'Analytics' }).click()
    const panel = page.getByRole('complementary', { name: 'Analytics' })
    await expect(panel.getByRole('heading', { name: /Wikipedia interest/ })).toBeVisible()
    await expect(panel.getByRole('img', { name: /Daily Wikipedia article views/ })).toBeVisible()
    await expect(panel.getByRole('heading', { name: 'What people use AI for' })).toBeVisible()
    await expect(panel.getByRole('link', { name: /How People Use ChatGPT/ })).toBeVisible()

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.cesium-widget').analyze()
    expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
  })

  test('lists every source in the About dialog', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'About this project' }).click()
    const dialog = page.getByRole('dialog', { name: 'About PerAI View' })
    await expect(dialog.getByRole('heading', { name: 'Real data sources' })).toBeVisible()
    await expect(dialog.locator('.source-list li')).toHaveCount(5)
  })
})
