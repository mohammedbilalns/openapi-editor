// Captures the README screenshots from the production build.
//
//   pnpm build && pnpm screenshots
//
// Serves dist/ with `vite preview` on SCREENSHOT_PORT (default 4360), imports
// docs/demo/crumb-and-co.yaml through the Import dialog and writes PNGs to
// docs/screenshots/. Set SCREENSHOT_BASE_URL to use a server that is already
// running instead. Needs Chromium: `pnpm exec playwright install chromium`.

import { mkdir, readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = fileURLToPath(new URL('../docs/screenshots/', import.meta.url))
const spec = await readFile(new URL('../docs/demo/crumb-and-co.yaml', import.meta.url), 'utf8')

const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const MOD = 'ControlOrMeta'

// ---------------------------------------------------------------------------
// Server

let server
let baseURL = process.env.SCREENSHOT_BASE_URL
if (!baseURL) {
  const { preview } = await import('vite')
  const port = Number(process.env.SCREENSHOT_PORT ?? 4360)
  server = await preview({ root, logLevel: 'warn', preview: { port, strictPort: true, open: false } })
  baseURL = `http://localhost:${port}`
}

// ---------------------------------------------------------------------------
// Helpers

/** Hides toasts and the text caret so they never land in a capture. */
const CAPTURE_CSS = `
  [data-sonner-toaster] { display: none !important; }
  * { caret-color: transparent !important; }
`

async function newPage(browser, { viewport, colorScheme, phone = false }) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    deviceScaleFactor: 2,
    colorScheme,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    isMobile: phone,
    hasTouch: phone,
  })
  const page = await context.newPage()
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await page.addStyleTag({ content: CAPTURE_CSS })
  return page
}

async function importDemo(page, phone) {
  const banner = page.getByRole('banner')
  if (phone) {
    await banner.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Import…' }).click()
  } else {
    await banner.getByRole('button', { name: 'Import', exact: true }).click()
  }
  const dialog = page.getByRole('dialog', { name: 'Import a spec' })
  await dialog.getByRole('textbox', { name: 'OpenAPI document' }).fill(spec)
  await dialog.getByRole('button', { name: 'Import', exact: true }).click()
  const anyway = dialog.getByRole('button', { name: 'Import anyway' })
  await expect(dialog.or(anyway)).toBeVisible()
  if (await anyway.isVisible().catch(() => false)) await anyway.click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toContainText('Crumb & Co.')
}

function sidebar(page) {
  return page.getByRole('navigation', { name: 'Document' })
}

async function openRoute(page, name) {
  await sidebar(page).getByRole('link', { name }).first().click()
  await expect(page).toHaveURL(/\/routes\//)
}

async function openSchema(page, name) {
  await sidebar(page).getByRole('link', { name: new RegExp(`^${name}\\b`) }).first().click()
  await expect(page).toHaveURL(/\/schemas\//)
}

async function setInspector(page, open, tab) {
  const toggle = page.getByRole('banner').getByRole('button', { name: 'Inspector' })
  if (((await toggle.getAttribute('aria-pressed')) === 'true') !== open) await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', String(open))
  if (!open) return
  const panel = page.getByRole('complementary', { name: 'Inspector' })
  const tabButton = panel.getByRole('tab', { name: new RegExp(`^${tab}`) })
  await tabButton.click()
  await expect(tabButton).toHaveAttribute('aria-selected', 'true')
  return panel
}

/**
 * Scrolls the virtualized YAML view to the first line equal to the last of
 * `needles` that follows lines equal to the ones before it, in order.
 */
async function scrollYamlTo(scope, ...needles) {
  const region = scope.getByRole('region', { name: 'Generated YAML' })
  await expect(region.locator('[data-line]').first()).toBeVisible()
  await region.evaluate(async (el, needles) => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    el.scrollTop = 0
    await frame()
    let next = 0
    let lastSeen = -1
    for (;;) {
      const rendered = [...el.querySelectorAll('[data-line]')].toSorted((a, b) => a.dataset.line - b.dataset.line)
      for (const line of rendered) {
        const number = Number(line.dataset.line)
        if (number <= lastSeen) continue
        lastSeen = number
        if ((line.lastElementChild?.textContent ?? '').trimEnd() !== needles[next]) continue
        if (++next < needles.length) continue
        el.scrollTop += line.getBoundingClientRect().top - el.getBoundingClientRect().top
        await frame()
        return
      }
      const before = el.scrollTop
      el.scrollTop += Math.max(100, el.clientHeight - 40)
      await frame()
      if (el.scrollTop === before) return
    }
  }, needles)
}

/** Waits for the page to settle, parks the pointer and drops focus, then captures. */
async function capture(page, name, { keepFocus = false } = {}) {
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByText('Updating…')).toHaveCount(0)
  if (!keepFocus) await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.mouse.move(0, (page.viewportSize()?.height ?? 800) - 1)
  await page.waitForTimeout(400) // debounced validation and YAML refresh
  const path = `${outDir}${name}.png`
  await page.screenshot({ path })
  const { size } = await stat(path)
  console.log(`${name}.png  ${(size / 1024).toFixed(0)} KB`)
}

// ---------------------------------------------------------------------------
// Captures

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

try {
  // Desktop
  const page = await newPage(browser, { viewport: DESKTOP, colorScheme: 'dark' })
  await importDemo(page, false)

  await setInspector(page, false)
  await capture(page, 'overview-dark')

  await openRoute(page, /^post\s*\/orders$/i)
  const inspector = await setInspector(page, true, 'YAML')
  await scrollYamlTo(inspector, '  /orders:', '    post:')
  await capture(page, 'route-editor-dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await capture(page, 'route-editor-light')
  await page.emulateMedia({ colorScheme: 'dark' })

  await setInspector(page, false)
  await openSchema(page, 'Loaf')
  await capture(page, 'schema-editor-dark')

  await openRoute(page, /^post\s*\/pickup-slots\/\{slotId\}\/hold/i)
  await setInspector(page, true, 'Problems')
  await capture(page, 'problems-dark')

  await setInspector(page, false)
  await page.keyboard.press(`${MOD}+K`)
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox').fill('order')
  await capture(page, 'command-palette-dark', { keepFocus: true })
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()

  await sidebar(page).getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('main').getByRole('link', { name: 'Security' }).click()
  await expect(page).toHaveURL(/\/settings\/security$/)
  await page.emulateMedia({ colorScheme: 'light' })
  await capture(page, 'settings-security-light')
  await page.context().close()

  // Phone
  const phone = await newPage(browser, { viewport: PHONE, colorScheme: 'dark', phone: true })
  await importDemo(phone, true)
  const trigger = phone.getByRole('button', { name: 'Open navigation' })
  const drawer = phone.getByRole('dialog', { name: 'Navigation' })
  await trigger.click()
  await expect(drawer).toBeVisible()
  await drawer.getByRole('link', { name: /^post\s*\/orders$/i }).first().click()
  await expect(drawer).toBeHidden()
  await expect(phone).toHaveURL(/\/routes\//)
  await capture(phone, 'phone-route-editor-dark')
  await trigger.click()
  await expect(drawer).toBeVisible()
  await capture(phone, 'phone-drawer-dark')
  await phone.context().close()
} finally {
  await browser.close()
  await server?.close()
}
