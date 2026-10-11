import { expect, test } from '@playwright/test';
import { isMobile, openApp } from './support/app';

test.describe('Platform and workspace modes', () => {
  test('web mode renders standard Import and Export controls in top bar', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'Top bar actions are desktop/tablet specific');
    await openApp(page);

    const banner = page.getByRole('banner');
    await expect(banner.getByRole('button', { name: 'Import' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Export YAML' })).toBeVisible();

    // Desktop filesystem buttons should not be present in web mode
    await expect(banner.getByRole('button', { name: 'Open Folder' })).toBeHidden();
    await expect(banner.getByRole('button', { name: 'Open File' })).toBeHidden();
  });

  test('desktop mode dynamically renders Open Folder and Open File in top bar', async ({ page }, testInfo) => {
    test.skip(isMobile(testInfo), 'Top bar actions are desktop/tablet specific');
    // Inject Tauri runtime indicator before page loads
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__'] = {
        plugins: {},
      };
    });

    await openApp(page);

    const banner = page.getByRole('banner');
    await expect(banner.getByRole('button', { name: 'Open Folder' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'Open File' })).toBeVisible();

    // In desktop mode, standard Web Import button is hidden in favor of folder/file openers
    await expect(banner.getByRole('button', { name: 'Import', exact: true })).toBeHidden();
  });
});
