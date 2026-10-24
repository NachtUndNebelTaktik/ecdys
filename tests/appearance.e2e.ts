import {test, expect, _electron as electron, type ElectronApplication} from '@playwright/test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

test('browser appearance controls change rendered surfaces and preserve workspace choices', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-appearance-'));
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: [
        '--ozone-platform=headless',
        '--user-data-dir=' + join(directory, 'electron'),
        resolve('packages/desktop/dist/main.cjs'),
      ],
      env: {...process.env, ECDYS_DATA_DIR: directory},
    });
    const page = await app.firstWindow();
    const errors: string[] = [],
      externalRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().startsWith('https:') || request.url().startsWith('http:'))
        externalRequests.push(request.url());
    });
    await page
      .getByLabel('Passphrase', {exact: true})
      .fill('local appearance integration passphrase');
    await page.getByLabel('Confirm passphrase').fill('local appearance integration passphrase');
    await page.getByLabel('Key derivation memory').selectOption('1024');
    await page.getByRole('button', {name: 'Create local vault'}).click();
    await expect(page.getByRole('heading', {name: 'Profile workspace'})).toBeVisible({
      timeout: 60_000,
    });
    await page.evaluate(async () => {
      await window.ecdys!.createProfile({name: 'Zeta execution', tags: ['capital']});
      await window.ecdys!.createProfile({name: 'Alpha research', tags: ['research']});
    });
    await page.reload();
    const browserNav = page.getByRole('navigation').getByRole('button', {name: /^Browser/});
    await expect(browserNav).toBeVisible({timeout: 4000});
    await browserNav.click();
    await page.setViewportSize({width: 1440, height: 1100});
    const surface = page.getByRole('region', {name: 'Browser surface', exact: true});
    const customize = page.getByRole('button', {name: 'Customize appearance', exact: false});
    const customizer = page.getByRole('complementary', {name: 'Customize browser appearance'});
    const workspace = page.locator('.browser-workspace-layout');
    await expect(customize).toHaveAttribute('aria-expanded', 'false');
    await expect(customizer).not.toBeVisible();
    const fullWidth = (await surface.boundingBox())!.width;
    expect(fullWidth).toBeCloseTo((await workspace.boundingBox())!.width, 0);
    await customize.click();
    await expect(customizer).toBeVisible();
    expect((await surface.boundingBox())!.width).toBeLessThan(fullWidth - 200);
    await expect(surface).toHaveCSS('border-top-left-radius', '24px');
    await expect(surface.getByRole('navigation', {name: 'Browser bookmarks'})).toBeVisible();
    await expect(
      surface.getByRole('complementary', {name: 'Browser workspace sidebar'}),
    ).toBeVisible();
    await page.getByLabel('Interface theme', {exact: true}).selectOption('light');
    await expect(surface).toHaveCSS('background-color', 'rgb(245, 247, 245)');
    await page.getByRole('button', {name: 'Ice accent', exact: true}).click();
    await expect(surface.locator('.browser-primary-action')).toHaveCSS(
      'background-color',
      'rgb(50, 105, 157)',
    );
    await page
      .getByRole('heading', {name: 'Browser workspace', exact: true})
      .scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/browser-light.png'});
    await page.getByRole('slider', {name: 'Corner rounding'}).focus();
    await page.getByRole('slider', {name: 'Corner rounding'}).press('End');
    await expect(surface).toHaveCSS('border-top-left-radius', '32px');
    await page.getByLabel('Browser spacing', {exact: true}).selectOption('compact');
    await expect(surface.locator('.browser-toolbar')).toHaveCSS('min-height', '44px');
    await page.getByRole('slider', {name: 'Browser text size'}).focus();
    await page.getByRole('slider', {name: 'Browser text size'}).press('End');
    await expect(surface).toHaveCSS('font-size', '18px');
    await page.getByLabel('Show bookmarks bar', {exact: true}).uncheck();
    await page.getByLabel('Show browser sidebar', {exact: true}).uncheck();
    await expect(surface.getByRole('navigation', {name: 'Browser bookmarks'})).not.toBeVisible();
    await expect(
      surface.getByRole('complementary', {name: 'Browser workspace sidebar'}),
    ).not.toBeVisible();
    await page.getByLabel('Smooth transitions', {exact: true}).uncheck();
    await expect(surface).toHaveCSS('transition-duration', '0s');
    await surface.getByRole('textbox', {name: 'Find a workspace profile'}).fill('Alpha');
    await expect(surface.locator('.browser-resume-list > button')).toHaveCount(1);
    await surface.getByRole('button', {name: 'New browser tab', exact: true}).click();
    await expect(surface.getByRole('tab')).toHaveCount(2);
    await expect(surface.locator('.browser-resume-list > button')).toHaveCount(2);
    await surface.getByRole('tab', {name: 'New tab', exact: false}).press('ArrowLeft');
    await expect(surface.locator('.browser-resume-list > button')).toHaveCount(1);
    await surface.getByRole('tab', {name: 'Workspace', exact: false}).press('ArrowRight');
    await surface.getByRole('button', {name: 'Close tab 2', exact: true}).click();
    await expect(surface.getByRole('tab')).toHaveCount(1);
    await surface.getByRole('button', {name: 'Close tab 1', exact: true}).click();
    await expect(surface.getByRole('tab')).toHaveCount(1);
    await expect(surface.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
    await expect(surface.getByRole('tab')).toBeFocused();
    for (const address of ['__proto__', 'constructor']) {
      await surface.getByRole('textbox', {name: 'Browser address'}).fill(address);
      await surface.getByRole('textbox', {name: 'Browser address'}).press('Enter');
      await expect(page.getByRole('heading', {name: 'Browser workspace', exact: true})).toBeVisible(
        {timeout: 3000},
      );
      await expect(surface.getByRole('status')).toContainText('Managed browsing');
    }
    await surface.getByRole('textbox', {name: 'Browser address'}).fill('https://example.com');
    await surface.getByRole('textbox', {name: 'Browser address'}).press('Enter');
    await expect(surface.getByRole('status')).toContainText('Managed browsing');
    expect(externalRequests).toEqual([]);
    await surface.getByRole('button', {name: 'Return to browser start', exact: true}).click();
    await surface.getByRole('textbox', {name: 'Browser address'}).fill('ecdys://routes');
    await surface.getByRole('textbox', {name: 'Browser address'}).press('Enter');
    await expect(page.getByRole('heading', {name: 'Network routes', exact: true})).toBeVisible();
    await browserNav.click();
    await surface.getByRole('button', {name: 'Return to browser start', exact: true}).click();
    await page
      .getByRole('button', {name: /Settings/, exact: false})
      .first()
      .click();
    await page.getByLabel('Interface theme', {exact: true}).selectOption('system');
    await page.emulateMedia({colorScheme: 'light'});
    await browserNav.click();
    await expect(surface).toHaveCSS('background-color', 'rgb(245, 247, 245)');
    await page.emulateMedia({colorScheme: 'dark'});
    await expect(surface).toHaveCSS('background-color', 'rgb(19, 26, 30)');
    await page.getByLabel('Interface theme', {exact: true}).selectOption('night');
    await expect(page.locator('.night-filter')).toBeVisible();
    await page.getByRole('slider', {name: 'Night warmth'}).focus();
    await page.getByRole('slider', {name: 'Night warmth'}).press('End');
    await expect(page.locator('.night-filter')).toHaveCSS('opacity', '0.4');
    await page
      .getByRole('heading', {name: 'Browser workspace', exact: true})
      .scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/browser-night.png'});
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Profiles/})
      .click();
    await page.getByLabel('Sort profiles', {exact: true}).selectOption('name_desc');
    await expect(page.locator('.profile-card h3')).toHaveText(['Zeta execution', 'Alpha research']);
    await page.getByLabel('Sort profiles', {exact: true}).selectOption('name_asc');
    await page.getByLabel('Profile layout', {exact: true}).selectOption('list');
    await expect(page.locator('.profile-card h3')).toHaveText(['Alpha research', 'Zeta execution']);
    await expect(page.locator('.profile-grid')).toHaveClass(/profile-list/);
    const before = await page.evaluate(() => window.ecdys!.listProfiles());
    await page.reload();
    await expect(page.getByLabel('Sort profiles', {exact: true})).toHaveValue('name_asc');
    await expect(page.getByLabel('Profile layout', {exact: true})).toHaveValue('list');
    await browserNav.click();
    await expect(surface).toHaveCSS('border-top-left-radius', '32px');
    await expect(surface).toHaveCSS('background-color', 'rgb(23, 23, 19)');
    await expect(page.locator('.night-filter')).toBeVisible();
    await customize.click();
    await page.getByRole('button', {name: 'Reset appearance', exact: true}).click();
    await expect(surface).toHaveCSS('border-top-left-radius', '24px');
    await expect(surface).toHaveCSS('font-size', '14px');
    await expect(page.locator('.night-filter')).not.toBeVisible();
    await expect(surface.getByRole('navigation', {name: 'Browser bookmarks'})).toBeVisible();
    await page.setViewportSize({width: 1440, height: 1250});
    await page.getByRole('button', {name: 'Hide appearance', exact: false}).click();
    await expect(customizer).not.toBeVisible();
    expect((await surface.boundingBox())!.width).toBeCloseTo(
      (await workspace.boundingBox())!.width,
      0,
    );
    await page
      .getByRole('heading', {name: 'Browser workspace', exact: true})
      .scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/browser-workspace.png'});
    await page.setViewportSize({width: 1050, height: 720});
    await expect(surface).toBeVisible();
    expect(
      await surface.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await customize.click();
    await expect(customizer).toBeVisible();
    expect(
      await surface.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    expect(
      await customizer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page
      .getByRole('heading', {name: 'Browser workspace', exact: true})
      .scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/browser-compact.png'});
    await page.getByRole('slider', {name: 'Browser text size'}).focus();
    await page.getByRole('slider', {name: 'Browser text size'}).press('End');
    expect(
      await surface.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await expect(surface).toHaveCSS('transition-duration', '0s');
    const beforeHiding = (await surface.boundingBox())!.width;
    await page.getByRole('button', {name: 'Hide appearance', exact: false}).click();
    await expect(customizer).not.toBeVisible();
    expect((await surface.boundingBox())!.width).toBeGreaterThan(beforeHiding);
    await page.getByRole('button', {name: 'Customize appearance', exact: false}).click();
    await page.getByLabel('Interface theme', {exact: true}).selectOption('crimson');
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'crimson');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 13, 17)');
    await expect(surface).toHaveCSS('background-color', 'rgb(28, 19, 25)');
    await expect(surface).toHaveCSS('color', 'rgb(245, 232, 237)');
    await expect(page.locator('.sidebar')).toHaveCSS('background-color', 'rgb(26, 18, 24)');
    await expect(page.getByRole('button', {name: 'Crimson accent', exact: true})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(surface.locator('.browser-primary-action')).toHaveCSS(
      'background-color',
      'rgb(244, 119, 147)',
    );
    await expect(page.locator('.night-filter')).not.toBeVisible();
    expect(
      await customizer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
    await page.getByRole('button', {name: 'Ice accent', exact: true}).click();
    await expect(surface.locator('.browser-primary-action')).toHaveCSS(
      'background-color',
      'rgb(166, 207, 255)',
    );
    await expect(surface).toHaveCSS('background-color', 'rgb(28, 19, 25)');
    await page.getByRole('button', {name: 'Crimson accent', exact: true}).click();
    await page.getByRole('slider', {name: 'Browser text size'}).focus();
    await page.getByRole('slider', {name: 'Browser text size'}).press('Home');
    await page.getByRole('slider', {name: 'Browser text size'}).press('ArrowRight');
    await page.getByRole('slider', {name: 'Browser text size'}).press('ArrowRight');
    await page
      .getByRole('heading', {name: 'Browser workspace', exact: true})
      .scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/browser-crimson-compact.png'});
    await page.setViewportSize({width: 1440, height: 1250});
    await page
      .locator('.sidebar')
      .getByRole('button', {name: /Settings/})
      .click();
    await expect(page.getByLabel('Interface theme', {exact: true})).toHaveValue('crimson');
    await expect(
      page.getByRole('region', {name: 'Live appearance preview'}).locator('.browser-surface'),
    ).toHaveCSS('background-color', 'rgb(28, 19, 25)');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'crimson');
    await browserNav.click();
    await expect(surface).toHaveCSS('background-color', 'rgb(28, 19, 25)');
    await customize.click();
    await expect(page.getByLabel('Interface theme', {exact: true})).toHaveValue('crimson');
    await expect(page.getByRole('button', {name: 'Crimson accent', exact: true})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({path: 'artifacts/browser-crimson-customizer.png'});
    await page.getByRole('button', {name: 'Hide appearance', exact: false}).click();
    await page.screenshot({path: 'artifacts/browser-crimson.png'});
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Profiles/})
      .click();
    await expect(page.getByLabel('Profile layout', {exact: true})).toHaveValue('list');
    await expect(page.locator('.profile-card').first()).toHaveCSS(
      'background-color',
      'rgb(28, 19, 25)',
    );
    expect(await page.evaluate(() => window.ecdys!.listProfiles())).toEqual(before);
    await browserNav.click();
    await customize.click();
    await page.getByRole('button', {name: 'Reset appearance', exact: true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-ui-theme', 'dark');
    await expect(surface).toHaveCSS('background-color', 'rgb(19, 26, 30)');
    await expect(surface.locator('.browser-primary-action')).toHaveCSS(
      'background-color',
      'rgb(196, 239, 145)',
    );
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
    await rm(directory, {recursive: true, force: true});
  }
});
