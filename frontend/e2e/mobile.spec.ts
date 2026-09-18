import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { openApp, trackErrors } from './helpers'

test('fits a phone screen with every control reachable', async ({ page }) => {
  const errors = trackErrors(page)
  await openApp(page)

  const layout = await page.evaluate(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const visible = [...document.querySelectorAll<HTMLElement>('button, a[href]')].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    })
    // Inline text links (feed city names, imagery credits) are exempt from the target-size rule.
    const isInline = (el: HTMLElement) => Boolean(el.closest('.feed, .cesium-viewer-bottom'))
    return {
      horizontalOverflow: document.documentElement.scrollWidth > vw,
      offscreen: visible
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.left < 0 || r.right > vw || r.top < 0 || r.bottom > vh
        })
        .map((el) => el.getAttribute('aria-label') ?? el.textContent),
      tooSmall: visible
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return !isInline(el) && (r.width < 44 || r.height < 44)
        })
        .map((el) => el.getAttribute('aria-label') ?? el.textContent),
    }
  })

  expect(layout.horizontalOverflow).toBe(false)
  expect(layout.offscreen).toEqual([])
  expect(layout.tooSmall).toEqual([])
  expect(errors).toEqual([])
})

test('changes layers from the menu and opens analytics as a sheet', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Map layers and style' }).click()
  const menu = page.getByRole('group', { name: 'Map options' })
  await menu.getByRole('option', { name: /Heat map/ }).click()
  await expect(menu.getByRole('option', { name: /Heat map/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()

  await page.getByRole('button', { name: 'Analytics' }).click()
  const panel = page.getByRole('complementary', { name: 'Analytics' })
  await expect(panel.getByText('AI activities')).toBeVisible()
  const box = await panel.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).exclude('.cesium-widget').analyze()
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})

test('legend expands and collapses', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Legend' }).click()
  await expect(page.getByRole('heading', { name: 'Leading assistant' })).toBeVisible()
  await page.getByRole('button', { name: 'Hide legend' }).click()
  await expect(page.getByRole('button', { name: 'Legend' })).toBeVisible()
})
