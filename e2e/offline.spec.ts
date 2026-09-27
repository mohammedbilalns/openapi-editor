import { expect, test } from '@playwright/test'
import { closeSidebar, createRoute, openApp, openImportDialog, sidebar } from './support/app'

test('losing the connection: an Offline badge, editing keeps working, URL import is unavailable', async ({
  page,
  context,
}) => {
  await openApp(page)
  // Open the route page while online: without a working service worker, pages whose code
  // hasn't loaded yet can't be reached offline (see the service worker test below).
  await createRoute(page, '/offline')
  await context.setOffline(true)

  const nav = await sidebar(page)
  await expect(nav.getByText('Offline', { exact: true })).toBeVisible()
  await closeSidebar(page)

  const summary = page.getByRole('main').getByLabel('Summary')
  await summary.fill('Edited offline')
  await expect(summary).toHaveValue('Edited offline')

  const dialog = await openImportDialog(page)
  await expect(dialog.getByRole('tab', { name: 'URL' })).toBeDisabled()
  await expect(dialog.getByText('Fetching from a URL needs a connection.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()

  await context.setOffline(false)
  await expect((await sidebar(page)).getByText('Offline', { exact: true })).toBeHidden()
  await closeSidebar(page)
  const again = await openImportDialog(page)
  await expect(again.getByRole('tab', { name: 'URL' })).toBeEnabled()
})

test.describe('service worker (production build)', () => {
  test.skip(process.env.E2E_DEV === '1', 'the service worker only exists in production builds')
  test.skip(({ isMobile }) => isMobile, 'same service worker on every layout; covered on desktop')
  test.use({ serviceWorkers: 'allow' })

  test('after the first visit the app reloads and works offline', async ({ page, context }) => {
    test.setTimeout(60_000)

    await openApp(page)
    // Wait until the service worker has installed (precached the shell) and controls the page.
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 })
    await expect((await sidebar(page)).getByText('Offline', { exact: true })).toBeVisible()
    await createRoute(page, '/offline')
    const dialog = await openImportDialog(page)
    await expect(dialog.getByRole('tab', { name: 'URL' })).toBeDisabled()
  })
})
