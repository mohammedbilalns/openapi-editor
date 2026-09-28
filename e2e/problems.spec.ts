import { expect, test, type Page } from '@playwright/test'
import { closeSidebar, createRoute, createSchema, isMobile, openApp, openInspector, sidebar } from './support/app'

test('a duplicate operationId is reported inline and in Problems, which links to the route', async ({ page }) => {
  await openApp(page)
  const main = page.getByRole('main')

  await createRoute(page, '/pets')
  await main.getByLabel('Operation ID').fill('listPets')
  await main.getByLabel('Operation ID').blur()
  await createRoute(page, '/animals')
  const animalsUrl = page.url()
  await main.getByLabel('Operation ID').fill('listPets')
  await main.getByLabel('Operation ID').blur()

  // Inline: the field is invalid and the page header counts the error.
  await expect(main.getByLabel('Operation ID')).toHaveAttribute('aria-invalid', 'true')
  await expect(main.getByLabel('Operation ID')).toHaveAccessibleDescription(/listPets/)
  await expect(main.getByRole('button', { name: /^1 error/ })).toBeVisible()

  // Sidebar: the Problems item shows a count, and the route row is marked.
  const nav = await sidebar(page)
  await expect(nav.getByRole('button', { name: /^Problems\s*\d+$/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /\/animals.*has errors/ })).toBeVisible()
  await nav.getByRole('link', { name: 'Overview' }).click()
  await expect(page).toHaveURL(/\/$/)
  await closeSidebar(page)

  const inspector = await openInspector(page, 'Problems')
  await expect(inspector.getByRole('tab', { name: /^Problems/ })).toHaveText(/\d+/)
  await inspector.getByRole('list', { name: 'Problems' }).getByRole('link', { name: /listPets/ }).click()
  await expect(page).toHaveURL(animalsUrl)
  await expect(main.getByRole('textbox', { name: 'Path' })).toHaveValue('/animals')
})

/** Pet referenced from GET /pets 200, then deleted: the reference is broken. Returns the route id. */
async function brokenReference(page: Page): Promise<string> {
  await openApp(page)
  await createSchema(page, 'Pet')
  const routeId = await createRoute(page, '/pets')
  const row = responseRow(page, '200')
  await row.getByRole('combobox', { name: 'Body for 200' }).click()
  await page.getByRole('option', { name: 'Pet', exact: true }).click()

  const nav = await sidebar(page)
  await nav.getByRole('button', { name: 'Actions for Pet' }).click()
  await page.getByRole('menuitem', { name: 'Delete schema' }).click()
  await page.getByRole('alertdialog', { name: 'Delete Pet?' }).getByRole('button', { name: 'Delete schema' }).click()
  await closeSidebar(page)
  await expect(row.getByRole('combobox', { name: 'Body for 200' })).toHaveAttribute('aria-invalid', 'true')
  return routeId
}

const responseRow = (page: Page, code: string) =>
  page.getByRole('main').getByRole('table', { name: 'Responses' }).getByRole('row', { name: code })

test('a broken schema reference links to the exact response row', async ({ page }) => {
  const routeId = await brokenReference(page)
  await (await sidebar(page)).getByRole('link', { name: 'Overview' }).click()
  await closeSidebar(page)

  const inspector = await openInspector(page, 'Problems')
  await inspector.getByRole('list', { name: 'Problems' }).getByRole('link', { name: /Broken reference/ }).click()
  await expect(page).toHaveURL(new RegExp(`/routes/${routeId}#response-200$`))
  await expect(responseRow(page, '200')).toBeInViewport()
})

test('phone: following a problem on the current page closes the inspector sheet', async ({ page }, testInfo) => {
  test.skip(!isMobile(testInfo), 'the inspector is only a covering sheet on phones')
  const routeId = await brokenReference(page)
  const inspector = await openInspector(page, 'Problems')
  await inspector.getByRole('list', { name: 'Problems' }).getByRole('link', { name: /Broken reference/ }).click()
  await expect(page).toHaveURL(new RegExp(`/routes/${routeId}#response-200$`))
  await expect(page.getByRole('dialog', { name: 'Inspector' })).toBeHidden()
})
