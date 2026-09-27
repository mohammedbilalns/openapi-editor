import { expect, test, type Page } from '@playwright/test'
import { REALISTIC_SPEC_YAML } from '../src/test/fixtures/realistic-spec'
import { closeInspectorSheet, closeSidebar, expectYamlToContain, importByPaste, openApp, openInspector, sidebar } from './support/app'

async function goToSection(page: Page, label: 'Info' | 'Servers' | 'Security' | 'Tags') {
  const main = page.getByRole('main')
  const segmented = main.getByRole('navigation', { name: 'Settings sections' })
  if (await segmented.isVisible()) await segmented.getByRole('link', { name: label }).click()
  else await main.getByRole('combobox', { name: 'Settings section' }).selectOption({ label })
  await expect(page).toHaveURL(new RegExp(`/settings/${label.toLowerCase()}$`))
}

test('settings: info title, a server, a security scheme and a tag', async ({ page }) => {
  await openApp(page, '/settings')
  await expect(page).toHaveURL(/\/settings\/info$/)
  const main = page.getByRole('main')

  // Info: the title shows up in the document card (and the breadcrumb on wider screens).
  await main.getByLabel('Title').fill('Zoo API')
  const nav = await sidebar(page)
  await expect(nav.getByRole('button', { name: /^Zoo API/ })).toContainText('v1.0.0 · OpenAPI 3.0')
  await closeSidebar(page)
  const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
  if (await breadcrumb.isVisible()) await expect(breadcrumb.getByRole('link', { name: 'Zoo API' })).toBeVisible()
  await expect(page).toHaveTitle(/Zoo API/)

  // Servers
  await goToSection(page, 'Servers')
  await expect(main.getByText('No servers yet.')).toBeVisible()
  await main.getByRole('button', { name: 'Add server' }).click()
  await expect(main.getByLabel('New server URL')).toBeFocused()
  await main.getByLabel('New server URL').fill('https://api.zoo.test/v1')
  await main.getByLabel('New server description').fill('Production')
  await main.getByRole('button', { name: 'Add server' }).click()
  const servers = main.getByRole('list', { name: 'Servers' })
  await expect(servers.getByLabel('Server 1 URL')).toHaveValue('https://api.zoo.test/v1')
  await expect(servers.getByLabel('Server 1 description')).toHaveValue('Production')

  // Security
  await goToSection(page, 'Security')
  await main.getByRole('button', { name: 'Add security scheme' }).click()
  await main.getByLabel('New scheme name').fill('bearerAuth')
  await main.getByRole('button', { name: 'Add scheme' }).click()
  const schemes = main.getByRole('list', { name: 'Security schemes' })
  await expect(schemes.getByRole('textbox', { name: 'Scheme name' })).toHaveValue('bearerAuth')
  await expect(schemes.getByText('HTTP', { exact: true })).toBeVisible()
  await expect(schemes.getByRole('combobox', { name: 'Scheme' })).toHaveText(/Bearer/)

  // Tags: add, then delete (unused, so no confirmation).
  await goToSection(page, 'Tags')
  await main.getByRole('button', { name: 'Add tag' }).click()
  await main.getByLabel('New tag name').fill('animals')
  await main.getByLabel('New tag description').fill('Every animal in the zoo')
  await main.getByRole('button', { name: 'Add tag' }).click()
  await expect(main.getByRole('textbox', { name: 'Tag name' })).toHaveValue('animals')
  await expect(main.getByRole('textbox', { name: 'Description of animals' })).toHaveValue('Every animal in the zoo')

  const inspector = await openInspector(page, 'YAML')
  await expectYamlToContain(
    inspector,
    'title: Zoo API',
    'url: https://api.zoo.test/v1',
    /securitySchemes:\n\s+bearerAuth:\n\s+type: http\n\s+scheme: bearer/,
    /tags:\n\s+- name: animals\n\s+description: Every animal in the zoo/,
  )
  await closeInspectorSheet(page)

  await main.getByRole('button', { name: 'Delete tag animals' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(main.getByText('No tags yet.')).toBeVisible()
})

test('deleting a tag in use confirms and removes it from its routes', async ({ page }) => {
  await openApp(page)
  await importByPaste(page, REALISTIC_SPEC_YAML)
  await expect((await sidebar(page)).getByRole('button', { name: /^pets\s*4$/ })).toBeVisible()
  await (await sidebar(page)).getByRole('link', { name: 'Settings' }).click()
  await closeSidebar(page)
  await goToSection(page, 'Tags')
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'Delete tag pets' }).click()
  const confirmDialog = page.getByRole('alertdialog', { name: 'Delete pets?' })
  await expect(confirmDialog).toContainText('4 routes use pets. The tag is removed from them.')
  await confirmDialog.getByRole('button', { name: 'Delete tag' }).click()
  await expect(confirmDialog).toBeHidden()
  await expect(main.getByRole('textbox', { name: 'Tag name' })).toHaveCount(1) // "store" is left

  const nav = await sidebar(page)
  // No route has a tag any more, so the route list is flat.
  await expect(nav.getByRole('button', { name: /^(pets|Untagged)\s*\d/ })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: /^(get|post|delete)\s*\/pets/i })).toHaveCount(4)
})
