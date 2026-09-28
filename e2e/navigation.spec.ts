import { expect, test } from '@playwright/test'
import { REALISTIC_SPEC_YAML } from '../src/test/fixtures/realistic-spec'
import { importByPaste, isMobile, MOD, openApp, waitForShell } from './support/app'

test.describe('deep links', () => {
  test('a schema that does not exist shows the missing-entity state', async ({ page }) => {
    await openApp(page, '/schemas/does-not-exist')
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'This schema is gone.' })).toBeVisible()
    await expect(main.getByText('It may have been deleted or replaced by an import.')).toBeVisible()
    await expect(main.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await main.getByRole('link', { name: 'Go to overview' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('the breadcrumb names a missing schema as missing', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'the breadcrumb trail is a desktop element')
    await openApp(page, '/schemas/does-not-exist')
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Missing schema', { timeout: 2_000 })
  })

  test('a route that does not exist shows the missing-entity state', async ({ page }) => {
    await openApp(page, '/routes/does-not-exist')
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'This route is gone.' })).toBeVisible()
    await expect(main.getByText('It may have been deleted or replaced by an import.')).toBeVisible()
    await expect(main.getByRole('link', { name: 'Go to overview' })).toBeVisible()
  })

  for (const path of ['/nope', '/settings/bogus']) {
    test(`an unknown address (${path}) shows the 404 page`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: 'Page not found.' })).toBeVisible()
      await expect(page.getByText('Check the address or go back to the overview.')).toBeVisible()
      await page.getByRole('link', { name: 'Go to overview' }).click()
      await expect(page).toHaveURL(/\/$/)
      await waitForShell(page)
    })
  }
})

test.describe('phone layout', () => {
  test.skip(({ isMobile: phone }) => !phone, 'phone-only layout')

  test('the navigation drawer opens, navigates and closes', async ({ page }) => {
    await openApp(page)
    await importByPaste(page, REALISTIC_SPEC_YAML)

    const openButton = page.getByRole('button', { name: 'Open navigation' })
    const drawer = page.getByRole('dialog', { name: 'Navigation' })

    // Escape closes it and returns focus to the menu button.
    await openButton.click()
    await expect(drawer).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await expect(openButton).toBeFocused()

    // Following a link closes it.
    await openButton.click()
    await drawer.getByRole('link', { name: /^get\s*\/pets\/\{petId\}/i }).click()
    await expect(drawer).toBeHidden()
    await expect(page).toHaveURL(/\/routes\//)
    await expect(page.getByRole('banner')).toContainText('/pets/{petId}')
    await expect(page.getByRole('main').getByRole('textbox', { name: 'Path' })).toHaveValue('/pets/{petId}')

    // The close button works too.
    await openButton.click()
    await drawer.getByRole('button', { name: 'Close navigation' }).click()
    await expect(drawer).toBeHidden()
  })

  test('the inspector opens as a full-screen sheet', async ({ page }) => {
    await openApp(page)
    await importByPaste(page, REALISTIC_SPEC_YAML)
    await page.getByRole('banner').getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'YAML', exact: true }).click()

    const sheet = page.getByRole('dialog', { name: 'Inspector' })
    await expect(sheet.getByRole('region', { name: 'Generated YAML' })).toContainText('openapi: 3.0')
    const viewport = page.viewportSize()!
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox()
        return box && Math.round(box.x) === 0 && Math.round(box.width) === viewport.width && Math.round(box.height) === viewport.height
      })
      .toBe(true)

    await sheet.getByRole('tab', { name: /^Problems/ }).click()
    await expect(sheet.getByRole('tab', { name: /^Problems/ })).toHaveAttribute('aria-selected', 'true')

    await sheet.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(sheet).toBeHidden()
  })
})

test('keyboard: Mod+Backslash toggles the inspector (remembered across reloads), Mod+K opens the palette', async ({
  page,
}, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboard shortcuts are a desktop affordance')
  await openApp(page)
  const toggle = page.getByRole('banner').getByRole('button', { name: 'Inspector' })
  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(inspector).toHaveCount(0)

  await page.keyboard.press(`${MOD}+Backslash`)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector.getByRole('region', { name: 'Generated YAML' })).toContainText('openapi: 3.0')

  await page.reload()
  await waitForShell(page)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(inspector).toBeVisible()

  await page.keyboard.press(`${MOD}+K`)
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('combobox')).toBeFocused()
  await palette.getByRole('combobox').fill('toggle inspector')
  await page.keyboard.press('Enter')
  await expect(palette).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})
