import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { load } from 'js-yaml'
import { closeSidebar, createRoute, expectSaved, isMobile, openApp, waitForShell } from './support/app'

test('edits are saved locally and survive a reload', async ({ page }) => {
  await openApp(page)
  await createRoute(page, '/pets/{petId}')
  const main = page.getByRole('main')
  await main.getByLabel('Summary').fill('Get one pet')
  await main.getByLabel('Summary').blur()
  await expectSaved(page)

  await page.reload()
  await waitForShell(page)
  await expect(main.getByRole('textbox', { name: 'Path' })).toHaveValue('/pets/{petId}')
  await expect(main.getByLabel('Summary')).toHaveValue('Get one pet')
  await expect(main.getByRole('table', { name: 'Parameters' }).getByRole('row', { name: 'petId' })).toBeVisible()
})

test('Export YAML downloads {slug}.yaml with the current document', async ({ page }) => {
  await openApp(page, '/settings/info')
  await page.getByRole('main').getByLabel('Title').fill('Zoo API: Édition 2!')
  await createRoute(page, '/animals')
  await closeSidebar(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('banner').getByRole('button', { name: 'Export YAML' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('zoo-api-edition-2.yaml')

  const text = await readFile((await download.path())!, 'utf8')
  const doc = load(text) as { openapi: string; info: { title: string }; paths: Record<string, unknown> }
  expect(doc.openapi).toMatch(/^3\.0\./)
  expect(doc.info.title).toBe('Zoo API: Édition 2!')
  expect(Object.keys(doc.paths)).toEqual(['/animals'])
})

// ---------------------------------------------------------------------------
// Theme

/** Records <html>'s classes at the moment <body> is created, i.e. before anything can paint. */
async function recordClassBeforePaint(page: Page) {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (document.body) {
        ;(window as unknown as { e2eClassAtBody?: string }).e2eClassAtBody = document.documentElement.className
        observer.disconnect()
      }
    })
    observer.observe(document, { childList: true, subtree: true })
  })
}

const classAtBody = (page: Page) =>
  page.evaluate(() => (window as unknown as { e2eClassAtBody?: string }).e2eClassAtBody ?? '')

async function chooseTheme(page: Page, theme: 'Light' | 'Dark' | 'System', mobile: boolean) {
  const banner = page.getByRole('banner')
  await banner.getByRole('button', { name: mobile ? 'More actions' : 'Theme' }).click()
  await page.getByRole('menuitemradio', { name: theme }).click()
}

test('theme choice applies, persists across reloads and is set before first paint', async ({ page }, testInfo) => {
  const mobile = isMobile(testInfo)
  await recordClassBeforePaint(page)
  await openApp(page)
  // Default is "system"; the tests run with a light colour scheme.
  expect((await classAtBody(page)).split(/\s+/)).toContain('light')
  await expect(page.locator('html')).toHaveClass(/\blight\b/)

  await chooseTheme(page, 'Dark', mobile)
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect(page.locator('html')).not.toHaveClass(/\blight\b/)

  await page.reload()
  await waitForShell(page)
  const early = (await classAtBody(page)).split(/\s+/)
  expect(early).toContain('dark')
  expect(early).not.toContain('light')

  await page.getByRole('banner').getByRole('button', { name: mobile ? 'More actions' : 'Theme' }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveClass(/\blight\b/)
})

test.describe('system theme', () => {
  test.use({ colorScheme: 'dark' })
  test('follows a dark OS preference from the first paint', async ({ page }) => {
    await recordClassBeforePaint(page)
    await openApp(page)
    expect((await classAtBody(page)).split(/\s+/)).toContain('dark')
  })
})
