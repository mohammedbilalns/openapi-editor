import { expect, test } from '@playwright/test'
import { REALISTIC_SPEC_YAML } from '../src/test/fixtures/realistic-spec'
import { closeSidebar, importByPaste, isMobile, MOD, openApp, openImportDialog, sidebar, toastItem } from './support/app'

const IMPORTED = 'Imported Pet Store. 5 routes, 10 schemas.'

test('paste import: toast with counts, sidebar grouped by tag, jump to a route from the command palette', async ({
  page,
}, testInfo) => {
  await openApp(page)
  await importByPaste(page, REALISTIC_SPEC_YAML, IMPORTED)

  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Pet Store. 5 routes, 10 schemas.')

  const nav = await sidebar(page)
  await expect(nav.getByRole('button', { name: 'Pet Store' })).toBeVisible()
  const pets = nav.getByRole('button', { name: /^pets\s*4$/ })
  await expect(pets).toHaveAttribute('aria-expanded', 'true')
  await expect(nav.getByRole('button', { name: /^Untagged\s*1$/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /^get\s*\/health/i })).toBeVisible()
  await expect(nav.getByRole('link', { name: /^delete\s*\/pets\/\{petId\}/i })).toBeVisible()

  // Collapsing a group hides its routes.
  await pets.click()
  await expect(pets).toHaveAttribute('aria-expanded', 'false')
  await expect(nav.getByRole('link', { name: /^delete\s*\/pets\/\{petId\}/i })).toBeHidden()
  await pets.click()
  await closeSidebar(page)

  if (isMobile(testInfo)) {
    await (await sidebar(page)).getByRole('button', { name: /Jump to/ }).click()
  } else {
    await page.keyboard.press(`${MOD}+K`)
  }
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox').fill('delete petId')
  await expect(palette.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(palette).toBeHidden()

  await expect(page).toHaveURL(/\/routes\//)
  const main = page.getByRole('main')
  await expect(main.getByRole('textbox', { name: 'Path' })).toHaveValue('/pets/{petId}')
  await expect(main.getByRole('combobox', { name: 'Method' })).toHaveText(/delete/i)
})

test('file import: upload a YAML file; a wrong file type is refused', async ({ page }) => {
  await openApp(page)
  const dialog = await openImportDialog(page)
  await dialog.getByRole('tab', { name: 'File' }).click()

  const chooser = dialog.getByLabel('Choose an OpenAPI file')
  await chooser.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(dialog.getByRole('alert')).toHaveText("notes.txt isn't a .yaml, .yml or .json file.")
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()

  await chooser.setInputFiles({
    name: 'petstore.yaml',
    mimeType: 'application/yaml',
    buffer: Buffer.from(REALISTIC_SPEC_YAML),
  })
  await expect(dialog.getByText(/petstore\.yaml · \d+ KB/)).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(toastItem(page, IMPORTED)).toBeVisible()
})

test('URL import: fetches a CORS-enabled URL; a server without CORS shows guidance', async ({ page }) => {
  await page.route('https://specs.example.test/petstore.yaml', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/yaml' },
      body: REALISTIC_SPEC_YAML,
    }),
  )
  // A CORS rejection reaches the page as a bare network error (fulfilled responses
  // skip the browser's CORS check, so abort instead).
  await page.route('https://no-cors.example.test/**', (route) => route.abort('failed'))

  await openApp(page)
  const dialog = await openImportDialog(page)
  await dialog.getByRole('tab', { name: 'URL' }).click()
  await expect(dialog.getByText('The server has to allow cross-origin requests.')).toBeVisible()

  const url = dialog.getByRole('textbox', { name: 'Spec URL' })
  const fetchButton = dialog.getByRole('button', { name: 'Fetch' })

  await url.fill('https://no-cors.example.test/openapi.yaml')
  await fetchButton.click()
  await expect(dialog.getByRole('alert')).toContainText(
    "Couldn't fetch no-cors.example.test. The server may not allow cross-origin requests (CORS).",
  )
  await expect(url).toHaveAttribute('aria-invalid', 'true')
  await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toBeDisabled()

  await url.fill('https://specs.example.test/petstore.yaml')
  await fetchButton.click()
  await expect(dialog.getByText(/Fetched \d+ KB from specs\.example\.test\./)).toBeVisible()
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(toastItem(page, IMPORTED)).toBeVisible()
})

test('a spec that cannot be read is listed as a problem and blocks the import', async ({ page }) => {
  await openApp(page)
  const dialog = await openImportDialog(page)
  await dialog.getByRole('textbox', { name: 'OpenAPI document' }).fill('openapi: 3.0.3\ninfo: [unclosed\n')
  const importButton = dialog.getByRole('button', { name: 'Import', exact: true })
  await importButton.click()
  await expect(dialog.getByRole('list', { name: 'Import problems' })).toContainText('Failed to parse YAML')
  await expect(dialog.getByText(/stops? the import/)).toBeVisible()
  await expect(importButton).toBeDisabled()

  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('main').getByRole('heading', { name: /^Nothing here yet/ })).toBeVisible()
})
