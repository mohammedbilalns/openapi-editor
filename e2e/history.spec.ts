import { expect, test } from '@playwright/test'
import { REALISTIC_SPEC_YAML } from '../src/test/fixtures/realistic-spec'
import {
  closeSidebar,
  createRoute,
  importByPaste,
  isMobile,
  MOD,
  openApp,
  redoFromTopBar,
  sidebar,
  toastItem,
  undoFromTopBar,
} from './support/app'

test('undo and redo an edit from the top bar', async ({ page }, testInfo) => {
  await openApp(page)
  if (!isMobile(testInfo)) {
    await expect(page.getByRole('banner').getByRole('button', { name: 'Undo' })).toBeDisabled()
    await expect(page.getByRole('banner').getByRole('button', { name: 'Redo' })).toBeDisabled()
  }
  await createRoute(page, '/pets')
  const summary = page.getByRole('main').getByLabel('Summary')
  await summary.fill('List pets')
  await summary.blur()

  await undoFromTopBar(page)
  await expect(summary).toHaveValue('')
  await redoFromTopBar(page)
  await expect(summary).toHaveValue('List pets')

  // Undoing past the creation leaves the page on the missing-route state, with its own Undo gone to Redo.
  await undoFromTopBar(page)
  await undoFromTopBar(page)
  await expect(page.getByRole('main').getByRole('heading', { name: 'This route is gone.' })).toBeVisible()
  await redoFromTopBar(page)
  await expect(page.getByRole('main').getByRole('textbox', { name: 'Path' })).toHaveValue('/pets')
})

test('undo and redo with the keyboard', async ({ page }, testInfo) => {
  test.skip(isMobile(testInfo), 'keyboard shortcuts are a desktop affordance')
  await openApp(page)
  await createRoute(page, '/pets')
  const summary = page.getByRole('main').getByLabel('Summary')
  await summary.fill('List pets')
  await summary.blur()
  const description = page.getByRole('main').getByRole('region', { name: 'Route details' }).getByLabel('Description')
  await description.fill('All of them')
  await description.blur()

  await page.keyboard.press(`${MOD}+Z`)
  await expect(description).toHaveValue('')
  await expect(summary).toHaveValue('List pets')
  await page.keyboard.press(`${MOD}+Z`)
  await expect(summary).toHaveValue('')

  await page.keyboard.press(`${MOD}+Shift+Z`)
  await expect(summary).toHaveValue('List pets')
  await page.keyboard.press('Control+Y')
  await expect(description).toHaveValue('All of them')

  // Inside a field, Mod+Z is the store's undo too (the field has no history of its own).
  await summary.focus()
  await page.keyboard.press(`${MOD}+Z`)
  await expect(description).toHaveValue('')
})

test('delete a route and bring it back from the toast', async ({ page }) => {
  await openApp(page)
  await createRoute(page, '/pets/{petId}', 'delete')
  await page.getByRole('main').getByRole('button', { name: 'Route actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete route' }).click()

  await expect(page).toHaveURL(/\/$/)
  const nav = await sidebar(page)
  await expect(nav.getByText('No routes yet')).toBeVisible()
  await closeSidebar(page)

  await toastItem(page, 'Route deleted.').getByRole('button', { name: 'Undo' }).click()
  const navAfter = await sidebar(page)
  await navAfter.getByRole('link', { name: /^delete\s*\/pets\/\{petId\}/i }).click()
  await expect(page).toHaveURL(/\/routes\//)
  await expect(page.getByRole('main').getByRole('textbox', { name: 'Path' })).toHaveValue('/pets/{petId}')
})

test('an import can be undone', async ({ page }) => {
  await openApp(page)
  await importByPaste(page, REALISTIC_SPEC_YAML)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(/^Pet Store\./)
  await undoFromTopBar(page)
  await expect(page.getByRole('main').getByRole('heading', { name: /^Nothing here yet/ })).toBeVisible()
  await redoFromTopBar(page)
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText(/^Pet Store\./)
})
