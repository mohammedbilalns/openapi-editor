import { expect, test } from '@playwright/test'
import { generateSpec, generateSpecYaml } from '../src/test/fixtures/generate-spec'
import { MOD, openApp, openImportDialog, openInspector, sidebar, toastItem } from './support/app'

// ~5 MB of YAML, ~160k lines: big enough that anything unvirtualized or O(n²) shows.
const SIZE = { paths: 700, schemas: 500, tags: 30 }

test.describe('large spec @slow', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop smoke test; the phone layout adds nothing here')
  test.describe.configure({ timeout: 120_000 })

  test('imports a ~5 MB spec, stays virtualized and responsive', async ({ page }) => {
    const yaml = generateSpecYaml(SIZE)
    expect(yaml.length).toBeGreaterThan(4_500_000)
    const generated = generateSpec(SIZE) as { 'x-generated-operations': number }
    const operations = generated['x-generated-operations']

    await openApp(page)
    const dialog = await openImportDialog(page)
    await dialog.getByRole('tab', { name: 'File' }).click()
    await dialog
      .getByLabel('Choose an OpenAPI file')
      .setInputFiles({ name: 'large.yaml', mimeType: 'application/yaml', buffer: Buffer.from(yaml) })
    await expect(dialog.getByText(/large\.yaml · \d+(\.\d)? MB/)).toBeVisible()
    // The generated spec parses without warnings, so it imports straight away.
    await dialog.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 60_000 })
    await expect(toastItem(page, `${operations} routes, ${SIZE.schemas} schemas.`)).toBeVisible()

    // The sidebar is virtualized: only a window of the route rows is in the DOM.
    const nav = await sidebar(page)
    await expect(nav.getByRole('link', { name: /^(get|post|put|patch|delete)\b/i }).first()).toBeVisible()
    const renderedRouteLinks = await nav.getByRole('link', { name: /^(get|post|put|patch|delete)\b/i }).count()
    expect(renderedRouteLinks).toBeGreaterThan(5)
    expect(renderedRouteLinks).toBeLessThan(100)

    // The YAML panel renders and scrolls to the end of a ~160k-line document.
    const inspector = await openInspector(page, 'YAML')
    const region = inspector.getByRole('region', { name: 'Generated YAML' })
    await expect(region).toContainText('openapi: 3.0', { timeout: 30_000 })
    await region.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await expect(region).not.toContainText('openapi: 3.0')
    const lastLine = await region.evaluate((el) =>
      Math.max(...[...el.querySelectorAll<HTMLElement>('[data-line]')].map((line) => Number(line.dataset.line))),
    )
    expect(lastLine).toBeGreaterThan(100_000)

    // Editing a route stays responsive and the change is visible elsewhere.
    await nav.getByRole('link', { name: /^(get|post|put|patch|delete)\b/i }).first().click()
    await expect(page).toHaveURL(/\/routes\//)
    const summary = page.getByRole('main').getByLabel('Summary')
    const started = Date.now()
    await summary.fill('')
    await summary.pressSequentially('Edited in a big spec', { delay: 10 })
    await expect(summary).toHaveValue('Edited in a big spec', { timeout: 5_000 })
    const typingMs = Date.now() - started
    expect(typingMs, 'typing 20 characters took too long').toBeLessThan(5_000)
    await summary.blur()

    await page.keyboard.press(`${MOD}+K`)
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await palette.getByRole('combobox').fill('Edited in a big spec')
    await expect(palette.getByRole('option', { name: /Edited in a big spec/ })).toHaveCount(1, { timeout: 5_000 })
  })
})
