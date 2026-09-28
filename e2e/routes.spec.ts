import { expect, test } from '@playwright/test'
import { expectYamlToContain, isMobile, openApp, openInspector } from './support/app'

test('first run: empty state, create a route with a path parameter, edit it, see it in the YAML', async ({
  page,
}, testInfo) => {
  await openApp(page)
  const main = page.getByRole('main')

  await expect(main.getByRole('heading', { name: 'Nothing here yet. Start with a route or import a spec.' })).toBeVisible()
  await expect(main.getByText('Everything stays in this browser. There are no accounts and nothing is uploaded.')).toBeVisible()

  await main.getByRole('button', { name: 'New route' }).click()
  const dialog = page.getByRole('dialog', { name: 'New route' })
  await expect(dialog.getByLabel('Path')).toBeFocused()
  await dialog.getByLabel('Path').fill('/pets/{id}')
  await expect(dialog.getByText('Adds the path parameter id.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()

  await expect(page).toHaveURL(/\/routes\/[\w-]+$/)
  await expect(main.getByRole('textbox', { name: 'Path' })).toHaveValue('/pets/{id}')

  // The {id} segment became a locked, required path parameter.
  const params = main.getByRole('table', { name: 'Parameters' })
  const idRow = params.getByRole('row', { name: 'id' })
  await expect(idRow).toBeVisible()
  await expect(idRow.getByRole('textbox', { name: 'Name' })).toHaveValue('id')
  await expect(idRow.getByRole('textbox', { name: 'Name' })).not.toBeEditable()
  await expect(idRow.getByRole('checkbox', { name: 'Required' })).toBeChecked()
  await expect(idRow.getByRole('checkbox', { name: 'Required' })).toBeDisabled()
  await expect(idRow.getByRole('button', { name: /^Delete parameter/ })).toHaveCount(0)

  await main.getByLabel('Summary').fill('Get a pet by id')

  if (!isMobile(testInfo)) {
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('/pets/{id}')
  }

  const inspector = await openInspector(page, 'YAML')
  await expectYamlToContain(inspector, '/pets/{id}:', 'summary: Get a pet by id', 'in: path')
})

test('editing the path adds parameters for new segments and keeps the ones it dropped', async ({ page }) => {
  await openApp(page)
  const main = page.getByRole('main')
  await main.getByRole('button', { name: 'New route' }).click()
  const dialog = page.getByRole('dialog', { name: 'New route' })
  await dialog.getByLabel('Path').fill('/owners/{ownerId}')
  await dialog.getByRole('button', { name: 'Create' }).click()

  const path = main.getByRole('textbox', { name: 'Path' })
  await path.fill('/owners/{ownerId}/pets/{petId}')
  await path.blur()

  const params = main.getByRole('table', { name: 'Parameters' })
  const petIdRow = params.getByRole('row', { name: 'petId' })
  await expect(petIdRow.getByRole('checkbox', { name: 'Required' })).toBeChecked()
  await expect(petIdRow.getByRole('checkbox', { name: 'Required' })).toBeDisabled()

  // Dropping {ownerId} keeps its parameter: it is flagged and can now be deleted by hand.
  await path.fill('/pets/{petId}')
  await path.blur()
  const ownerIdRow = params.getByRole('row', { name: 'ownerId' })
  await expect(ownerIdRow.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-invalid', 'true')
  await expect(ownerIdRow.getByRole('button', { name: 'Delete parameter ownerId' })).toBeVisible()
  await expect(petIdRow.getByRole('button', { name: /^Delete parameter/ })).toHaveCount(0)

  const inspector = await openInspector(page, 'YAML')
  await expectYamlToContain(inspector, /^ {2}\/pets\/\{petId\}:$/m, 'name: ownerId', 'name: petId')
})
