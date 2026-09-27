import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

/**
 * Shared user flows for the e2e specs. Everything goes through what a user can
 * see and reach: roles, labels and visible text.
 */

export const isMobile = (testInfo: TestInfo) => testInfo.project.name === 'mobile'

/** Opens the app at `path` and waits until the shell (not the loading skeleton) is interactive. */
export async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await waitForShell(page)
}

export async function waitForShell(page: Page) {
  // Generous: a cold dev server compiles modules on first request, and the shell
  // waits for IndexedDB before it replaces the loading skeleton.
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await expect(topBarControl(page)).toBeVisible()
}

/** A control that exists in the top bar on every layout: Export YAML (text button or phone icon button). */
function topBarControl(page: Page): Locator {
  return page.getByRole('banner').getByRole('button', { name: 'Export YAML' })
}

const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768

/**
 * The sidebar as a scope for locators. On phones it lives in a drawer, which
 * this opens first.
 */
export async function sidebar(page: Page): Promise<Locator> {
  if (!phone(page)) return page.getByRole('navigation', { name: 'Document' }).locator('..')
  const drawer = page.getByRole('dialog', { name: 'Navigation' })
  // aria-expanded follows the drawer's state rather than its animation.
  const trigger = page.getByRole('button', { name: 'Open navigation', includeHidden: true })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await expect(drawer).toBeHidden() // let a closing drawer finish first
    await trigger.click()
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(drawer).toBeVisible()
  return drawer
}

/** Closes the phone drawer if it is open, and waits until it is gone. No-op on wider layouts. */
export async function closeSidebar(page: Page) {
  if (!phone(page)) return
  const drawer = page.getByRole('dialog', { name: 'Navigation' })
  const trigger = page.getByRole('button', { name: 'Open navigation', includeHidden: true })
  if ((await trigger.getAttribute('aria-expanded')) === 'true') {
    await drawer.getByRole('button', { name: 'Close navigation' }).click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  }
  await expect(drawer).toBeHidden()
}

/** Runs a top-bar action that phones keep in the "More actions" menu. */
async function topBarAction(page: Page, desktopName: string, menuItemName: string) {
  if (phone(page)) {
    await page.getByRole('banner').getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: menuItemName }).click()
  } else {
    await page.getByRole('banner').getByRole('button', { name: desktopName, exact: true }).click()
  }
}

export async function undoFromTopBar(page: Page) {
  if (phone(page)) {
    await page.getByRole('banner').getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: /^Undo/ }).click()
  } else {
    await page.getByRole('banner').getByRole('button', { name: 'Undo' }).click()
  }
}

export async function redoFromTopBar(page: Page) {
  if (phone(page)) {
    await page.getByRole('banner').getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: /^Redo/ }).click()
  } else {
    await page.getByRole('banner').getByRole('button', { name: 'Redo' }).click()
  }
}

// ---------------------------------------------------------------------------
// Creating things

/** Creates a route through the "New route" dialog and waits for its page. Returns the route id. */
export async function createRoute(page: Page, path: string, method?: string): Promise<string> {
  const nav = await sidebar(page)
  await nav.getByRole('button', { name: 'New route' }).click()
  const dialog = page.getByRole('dialog', { name: 'New route' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Path').fill(path)
  if (method) {
    await dialog.getByRole('combobox', { name: 'Method' }).click()
    await page.getByRole('option', { name: method, exact: true }).click()
  }
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/routes\/[^/]+$/)
  return new URL(page.url()).pathname.split('/').pop()!
}

/** Creates a schema through the "New schema" dialog and waits for its page. Returns the schema id. */
export async function createSchema(page: Page, name: string, type?: string): Promise<string> {
  const nav = await sidebar(page)
  await nav.getByRole('button', { name: 'New schema' }).click()
  const dialog = page.getByRole('dialog', { name: 'New schema' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Name').fill(name)
  if (type) {
    await dialog.getByRole('combobox', { name: 'Type' }).click()
    await page.getByRole('option', { name: new RegExp(`^${type}\\b`) }).click()
  }
  await dialog.getByRole('button', { name: 'Create schema' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/schemas\/[^/]+$/)
  return new URL(page.url()).pathname.split('/').pop()!
}

// ---------------------------------------------------------------------------
// Import

export async function openImportDialog(page: Page): Promise<Locator> {
  await topBarAction(page, 'Import', 'Import…')
  const dialog = page.getByRole('dialog', { name: 'Import a spec' })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Pastes a spec into the import dialog, imports it and waits for the success toast. */
export async function importByPaste(page: Page, spec: string, expectedToast?: string | RegExp) {
  const dialog = await openImportDialog(page)
  await dialog.getByRole('textbox', { name: 'OpenAPI document' }).fill(spec)
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(toastItem(page, expectedToast ?? /^Imported /)).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
}

// ---------------------------------------------------------------------------
// Toasts

export function toasts(page: Page): Locator {
  return page.getByRole('region', { name: /Notifications/ })
}

export function toastItem(page: Page, text: string | RegExp): Locator {
  return toasts(page).getByRole('listitem').filter({ hasText: text })
}

// ---------------------------------------------------------------------------
// Inspector

/** Opens the inspector (docked panel, or a sheet on phones) on the given tab. */
export async function openInspector(page: Page, tab: 'YAML' | 'Problems'): Promise<Locator> {
  if (phone(page)) {
    await page.getByRole('banner').getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: tab, exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Inspector' })
    await expect(sheet).toBeVisible()
    return sheet
  }
  const toggle = page.getByRole('banner').getByRole('button', { name: 'Inspector' })
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const panel = page.getByRole('complementary', { name: 'Inspector' })
  await panel.getByRole('tab', { name: new RegExp(`^${tab}`) }).click()
  await expect(panel.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true')
  return panel
}

/** Closes the inspector sheet on phones (it covers the page). The docked panel stays. */
export async function closeInspectorSheet(page: Page) {
  if (!phone(page)) return
  const sheet = page.getByRole('dialog', { name: 'Inspector' })
  if (!(await sheet.isVisible())) return
  await sheet.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(sheet).toBeHidden()
}

/**
 * The full text of the virtualized YAML view: scrolls the region top to bottom
 * and collects each rendered line (the gutter number is excluded).
 */
export async function readYaml(scope: Locator | Page): Promise<string> {
  const region = scope.getByRole('region', { name: 'Generated YAML' })
  await expect(region).toBeVisible()
  return region.evaluate(async (el) => {
    // Runs in the page, so it can't live in the module scope.
    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const lines = new Map<number, string>()
    const collect = () => {
      for (const line of el.querySelectorAll<HTMLElement>('[data-line]')) {
        lines.set(Number(line.dataset.line), line.lastElementChild?.textContent ?? '')
      }
    }
    const start = el.scrollTop
    el.scrollTop = 0
    await frame()
    collect()
    while (el.scrollTop + el.clientHeight < el.scrollHeight - 1) {
      const before = el.scrollTop
      el.scrollTop = before + Math.max(100, el.clientHeight - 40)
      await frame()
      collect()
      if (el.scrollTop === before) break
    }
    el.scrollTop = start
    return [...lines.entries()]
      .toSorted(([a], [b]) => a - b)
      .map(([, text]) => text.replace(/\s+$/, ''))
      .join('\n')
  })
}

/** Polls the YAML view until it contains every snippet. */
export async function expectYamlToContain(scope: Locator | Page, ...snippets: (string | RegExp)[]) {
  await expect
    .poll(
      async () => {
        const yaml = await readYaml(scope)
        return snippets.every((s) => (typeof s === 'string' ? yaml.includes(s) : s.test(yaml)))
      },
      { message: `YAML contains ${snippets.join(', ')}`, timeout: 10_000 },
    )
    .toBe(true)
}

// ---------------------------------------------------------------------------
// Persistence

/** Waits until the sidebar footer reports the document is saved to IndexedDB. */
export async function expectSaved(page: Page) {
  const nav = await sidebar(page)
  await expect(nav.getByRole('status').filter({ hasText: /Saved locally|Saving…|Not saved/ })).toHaveText(
    'Saved locally',
    { timeout: 10_000 },
  )
}

/** `$ref` to a component schema, in either quote style. */
export const schemaRef = (name: string) => new RegExp(`\\$ref: ["']?#/components/schemas/${name}["']?$`, 'm')

/** Keyboard "Mod" (⌘ on macOS, Ctrl elsewhere). */
export const MOD = 'ControlOrMeta'
