import { expect, test, type Page } from '@playwright/test'
import {
  closeInspectorSheet,
  closeSidebar,
  createRoute,
  createSchema,
  expectYamlToContain,
  openApp,
  openInspector,
  readYaml,
  schemaRef,
  sidebar,
  toastItem,
} from './support/app'

async function addField(page: Page, name: string, { required = false } = {}) {
  const fields = page.getByRole('main').getByRole('region', { name: 'Fields' })
  await fields.getByRole('button', { name: 'Add field' }).click()
  // The new row's name input is focused and selected; typing replaces the placeholder name.
  const nameInput = fields.getByRole('textbox', { name: 'Field name' }).last()
  await expect(nameInput).toBeFocused()
  await nameInput.fill(name)
  await nameInput.press('Enter')
  const row = fields.getByRole('listitem', { name: `Field ${name}` })
  await expect(row).toBeVisible()
  if (required) {
    await row.getByRole('checkbox', { name: 'Required' }).check()
    await expect(row.getByRole('checkbox', { name: 'Required' })).toBeChecked()
  }
}

/** Pet (object: name required, tag optional) referenced from GET /pets 200. */
async function petReferencedByRoute(page: Page) {
  await openApp(page)
  await createSchema(page, 'Pet')
  await addField(page, 'name', { required: true })
  await addField(page, 'tag')

  await createRoute(page, '/pets')
  const response = page.getByRole('main').getByRole('table', { name: 'Responses' }).getByRole('row', { name: '200' })
  await response.getByRole('combobox', { name: 'Body for 200' }).click()
  await page.getByRole('option', { name: 'Pet', exact: true }).click()
  await expect(response.getByRole('combobox', { name: 'Body for 200' })).toHaveText('Pet')
}

test('create an object schema, reference it from a response, rename it: the $ref follows', async ({ page }) => {
  await petReferencedByRoute(page)

  const inspector = await openInspector(page, 'YAML')
  await expectYamlToContain(
    inspector,
    schemaRef('Pet'),
    /Pet:\n\s+type: object\n(.*\n)*?\s+required:\n\s+- name/,
  )

  // Rename the schema from its page.
  await closeInspectorSheet(page)
  const nav = await sidebar(page)
  await nav.getByRole('link', { name: /^Pet\b/ }).click()
  await expect(page).toHaveURL(/\/schemas\//)
  const main = page.getByRole('main')
  await expect(main.getByText('Used in 1 place')).toBeVisible()
  await main.getByRole('textbox', { name: 'Schema name' }).fill('Animal')
  await main.getByRole('textbox', { name: 'Schema name' }).blur()

  const inspectorAfter = await openInspector(page, 'YAML')
  await expectYamlToContain(inspectorAfter, schemaRef('Animal'), /^ {4}Animal:$/m)
  expect(await readYaml(inspectorAfter)).not.toContain('schemas/Pet')
})

test('deleting a schema that is in use asks first; cancel keeps it, confirm breaks the reference and can be undone', async ({
  page,
}) => {
  await petReferencedByRoute(page)
  const response = page.getByRole('main').getByRole('table', { name: 'Responses' }).getByRole('row', { name: '200' })

  const deleteFromSidebar = async () => {
    const nav = await sidebar(page)
    await nav.getByRole('button', { name: 'Actions for Pet' }).click()
    await page.getByRole('menuitem', { name: 'Delete schema' }).click()
  }

  await deleteFromSidebar()
  const confirmDialog = page.getByRole('alertdialog', { name: 'Delete Pet?' })
  await expect(confirmDialog).toContainText('1 place references this schema. Their references will break.')
  await confirmDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirmDialog).toBeHidden()
  await expect((await sidebar(page)).getByRole('link', { name: /^Pet\b/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(response.getByRole('combobox', { name: 'Body for 200' })).toHaveText('Pet')

  await deleteFromSidebar()
  await confirmDialog.getByRole('button', { name: 'Delete schema' }).click()
  await expect(confirmDialog).toBeHidden()
  await closeSidebar(page)
  await expect(response.getByRole('combobox', { name: 'Body for 200' })).toHaveText('Missing schema')

  await toastItem(page, 'Schema deleted.').getByRole('button', { name: 'Undo' }).click()
  await expect(response.getByRole('combobox', { name: 'Body for 200' })).toHaveText('Pet')
  await expect((await sidebar(page)).getByRole('link', { name: /^Pet\b/ })).toBeVisible()
})

test('deleting an unused schema is immediate, with an Undo toast', async ({ page }) => {
  await openApp(page)
  await createSchema(page, 'Scratch', 'string')
  await expect(page.getByRole('main').getByRole('region', { name: 'Constraints' })).toBeVisible()

  await page.getByRole('main').getByRole('button', { name: 'Schema actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete schema' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
  await expect((await sidebar(page)).getByText('No schemas yet')).toBeVisible()
  await closeSidebar(page)

  await toastItem(page, 'Schema deleted.').getByRole('button', { name: 'Undo' }).click()
  await expect((await sidebar(page)).getByRole('link', { name: 'Scratch' })).toBeVisible()
})
