import {expect, test, type Locator, type Page} from '@playwright/test';

const preferenceKey = 'ecdys.ui-preferences.v1';
const sections = ['Environment', 'Account', 'Appearance', 'App', 'Help'] as const;
const rows = [
  'Personalization', 'Mindmap', 'SOCKS5', 'Email', 'Subscription', 'Trocador',
  'Browsing report', 'General', 'Notifications', 'Monero', 'Security',
  'Secure cloud storage', 'Storage', 'Data controls', 'Help centre', 'Keyboard shortcuts',
] as const;

test.use({viewport: {width: 1440, height: 1000}});

function settings(page: Page) {
  return page.getByRole('dialog', {name: 'Settings', exact: true});
}

function row(dialog: Locator, name: string) {
  return dialog.getByRole('button', {name: new RegExp(`^${name}(?:\\s|$)`)});
}

async function openSettings(page: Page) {
  await page.getByRole('button', {name: 'Open settings', exact: true}).click();
  await expect(settings(page)).toBeVisible();
  return settings(page);
}

async function detail(dialog: Locator, name: string) {
  await row(dialog, name).click();
  await expect(dialog.getByRole('button', {name: 'Back to settings', exact: true})).toBeVisible();
}

async function installWorkspaceFixture(page: Page, initiallyUnlocked = true) {
  await page.addInitScript(({initiallyUnlocked}) => {
    let unlocked = initiallyUnlocked;
    const profiles: Record<string, unknown>[] = [];
    const actions: string[] = [];
    (window as any).__settingsFixtureActions = actions;
    (window as any).styg = {
      invoke: async (request: {action: string; input?: Record<string, unknown>}) => {
        actions.push(request.action);
        if (request.action === 'lock') {
          unlocked = false;
          return {ok: true, value: {incompleteSnapshots: 1}};
        }
        if (request.action === 'unlock') {
          unlocked = true;
          return {ok: true, value: undefined};
        }
        if (request.action === 'status') return {
          ok: true,
          value: {exists: true, unlocked, routing: {status: 'blocked', message: 'Fixture route blocked'}, browserVersion: 'fixture', platform: 'linux'},
        };
        if (request.action === 'createProfile') {
          const profile = {
            id: '11111111-1111-4111-8111-111111111111', ...request.input,
            vpn: {provider: 'none', endpoint: '', rotation: 'manual', routeLock: true},
            createdAt: 1, updatedAt: 1, parentProfileId: null, branchName: null, revision: 1,
          };
          profiles.push(profile);
          return {ok: true, value: profile};
        }
        if (request.action === 'profiles') return {ok: true, value: [...profiles]};
        if (request.action === 'snapshots') return {ok: true, value: []};
        return {ok: false, error: 'Unexpected settings fixture request'};
      },
    };
  }, {initiallyUnlocked});
}

test('settings offers every section and row in the browser preview without making requests', async ({page}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const dialog = await openSettings(page);
  expect(await dialog.evaluate(element => element.tagName)).toBe('DIALOG');
  expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true);
  const navigation = dialog.getByRole('navigation', {name: 'Settings sections'});
  for (const name of rows) await expect(row(dialog, name)).toHaveCount(1);
  for (const section of sections) {
    await navigation.getByRole('button', {name: section, exact: true}).click();
    await expect(dialog.getByRole('heading', {name: section, exact: true})).toBeInViewport();
    for (const name of rows) await expect(row(dialog, name)).toHaveCount(1);
  }
  expect(requests).toEqual([]);
});

test('every settings row opens a detail and returns to the overview', async ({page}) => {
  await page.goto('/');
  const dialog = await openSettings(page);
  for (const name of rows) {
    await detail(dialog, name);
    await dialog.getByRole('button', {name: 'Back to settings', exact: true}).click();
    await expect(dialog.getByRole('navigation', {name: 'Settings sections'})).toBeVisible();
    await expect(row(dialog, name)).toHaveCount(1);
  }
});

test('appearance and accent apply immediately and persist through reload', async ({page}) => {
  await page.goto('/');
  let dialog = await openSettings(page);
  await dialog.getByRole('combobox', {name: 'Appearance', exact: true}).selectOption({label: 'Light'});
  await dialog.getByRole('combobox', {name: 'Accent colour', exact: true}).selectOption({label: 'Teal'});
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  dialog = await openSettings(page);
  await expect(dialog.getByRole('combobox', {name: 'Appearance', exact: true})).toHaveValue('light');
  await expect(dialog.getByRole('combobox', {name: 'Accent colour', exact: true})).toHaveValue('teal');
  await dialog.getByRole('combobox', {name: 'Appearance', exact: true}).selectOption({label: 'Dark'});
  await dialog.getByRole('combobox', {name: 'Accent colour', exact: true}).selectOption({label: 'Violet'});
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  const stored = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  expect(Object.keys(stored)).toEqual([preferenceKey]);
  expect(Object.keys(JSON.parse(stored[preferenceKey])).sort()).toEqual(['accent', 'appearance', 'density', 'notifications', 'reduceMotion']);
  expect(stored[preferenceKey]).not.toMatch(/@|password|passphrase|token|credential|wallet/i);
});

test('system appearance follows the browser colour scheme while keeping the system preference', async ({page}) => {
  await page.emulateMedia({colorScheme: 'dark'});
  await page.goto('/');
  const dialog = await openSettings(page);
  await dialog.getByRole('combobox', {name: 'Appearance', exact: true}).selectOption({label: 'System'});
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'system');
  const darkBackground = await dialog.evaluate(element => getComputedStyle(element).backgroundColor);
  await page.emulateMedia({colorScheme: 'light'});
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'system');
  await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(darkBackground);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'system');
});

test('personalization applies density and reduced motion and restores them after reload', async ({page}) => {
  await page.goto('/');
  let dialog = await openSettings(page);
  await detail(dialog, 'Personalization');
  await dialog.getByLabel('Density', {exact: true}).selectOption({label: 'Compact'});
  await dialog.getByLabel('Reduce motion', {exact: true}).check();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  dialog = await openSettings(page);
  await detail(dialog, 'Personalization');
  await expect(dialog.getByLabel('Density', {exact: true})).toHaveValue('compact');
  await expect(dialog.getByLabel('Reduce motion', {exact: true})).toBeChecked();
  await dialog.getByLabel('Density', {exact: true}).selectOption({label: 'Comfortable'});
  await dialog.getByLabel('Reduce motion', {exact: true}).uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable');
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'false');
});

test('unconnected services state their limits without copied identity or subscription claims', async ({page}) => {
  await page.goto('/');
  const dialog = await openSettings(page);
  await expect(row(dialog, 'Email')).toContainText('No email connected');
  await expect(row(dialog, 'Subscription')).toContainText('Local preview');
  await expect(row(dialog, 'Trocador')).toContainText('Not connected');
  await expect(row(dialog, 'SOCKS5')).toContainText('Direct');
  expect(await dialog.innerText()).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  expect(await dialog.innerText()).not.toMatch(/\bPro\b|\bPremium\b/);
  for (const [name, limitation] of [
    ['SOCKS5', /SOCKS5 is not available/i],
    ['Trocador', /no exchange is connected/i],
    ['Monero', /payment services are not connected/i],
    ['Secure cloud storage', /no cloud sync service/i],
  ] as const) {
    await detail(dialog, name);
    await expect(dialog).toContainText(limitation);
    if (name === 'SOCKS5') await expect(dialog).toContainText(/browser launches remain blocked/i);
    await expect(dialog.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
    await dialog.getByRole('button', {name: 'Back to settings', exact: true}).click();
  }
  await detail(dialog, 'Security');
  await expect(dialog.getByRole('button', {name: 'Lock workspace', exact: true})).toBeDisabled();
});

test('keyboard shortcuts, native focus containment, detail back and focus restoration work', async ({page}) => {
  await page.goto('/');
  const opener = page.getByRole('button', {name: 'Open settings', exact: true});
  await opener.focus();
  await page.keyboard.press('Control+,');
  const dialog = settings(page);
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  for (let index = 0; index < 24; index++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await detail(dialog, 'Keyboard shortcuts');
  await expect(dialog).toContainText(/Ctrl|Control/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('navigation', {name: 'Settings sections'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole('button', {name: 'Close settings', exact: true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('settings remains available in a locked workspace and cannot invoke a redundant lock', async ({page}) => {
  await installWorkspaceFixture(page, false);
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Unlock Ecdys', exact: true})).toBeVisible();
  const dialog = await openSettings(page);
  await detail(dialog, 'Security');
  await expect(dialog.getByRole('button', {name: 'Lock workspace', exact: true})).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__settingsFixtureActions)).not.toContain('lock');
});

test('optional status messages persist while cleanup warnings remain visible', async ({page}) => {
  await installWorkspaceFixture(page);
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Profiles.', exact: true})).toBeVisible();
  let dialog = await openSettings(page);
  await detail(dialog, 'Notifications');
  await dialog.getByLabel('Show status messages', {exact: true}).uncheck();
  await dialog.getByRole('button', {name: 'Close settings', exact: true}).click();
  await page.getByRole('button', {name: '＋ New profile', exact: true}).click();
  const editor = page.getByRole('dialog', {name: 'A new context', exact: true});
  await editor.getByLabel('Profile name', {exact: true}).fill('Settings fixture');
  await editor.getByRole('button', {name: /^Create profile/}).click();
  await expect(page.getByRole('region', {name: 'Profiles', exact: true}).getByRole('heading', {name: 'Settings fixture', exact: true})).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  dialog = await openSettings(page);
  await detail(dialog, 'Security');
  await expect(dialog.getByRole('button', {name: 'Lock workspace', exact: true})).toBeEnabled();
  await dialog.getByRole('button', {name: 'Lock workspace', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Unlock Ecdys', exact: true})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Some session snapshots were incomplete');
  expect(await page.evaluate(() => (window as any).__settingsFixtureActions.filter((action: string) => action === 'lock').length)).toBe(1);
  if (await dialog.isVisible()) await dialog.getByRole('button', {name: 'Close settings', exact: true}).click();
  await page.reload();
  dialog = await openSettings(page);
  await detail(dialog, 'Notifications');
  await expect(dialog.getByLabel('Show status messages', {exact: true})).not.toBeChecked();
  await dialog.getByLabel('Show status messages', {exact: true}).check();
  await dialog.getByRole('button', {name: 'Close settings', exact: true}).click();
  await page.getByRole('button', {name: '＋ New profile', exact: true}).click();
  await editor.getByLabel('Profile name', {exact: true}).fill('Settings fixture');
  await editor.getByRole('button', {name: /^Create profile/}).click();
  await expect(page.getByRole('status')).toContainText('Profile created with an encrypted baseline snapshot');
  await page.getByRole('button', {name: /^Lock workspace/}).click();
  await expect(page.getByRole('status')).toContainText('Some session snapshots were incomplete');
});

test('captures the default overview, app and help sections for visual review', async ({page}) => {
  await page.goto('/');
  const dialog = await openSettings(page);
  const navigation = dialog.getByRole('navigation', {name: 'Settings sections'});
  for (const [section, path] of [['Environment', 'settings-overview'], ['App', 'settings-app'], ['Help', 'settings-help']] as const) {
    await navigation.getByRole('button', {name: section, exact: true}).click();
    await expect(dialog.getByRole('heading', {name: section, exact: true})).toBeInViewport();
    await page.mouse.move(0, 0);
    await dialog.screenshot({path: `test-results/${path}.png`, animations: 'disabled'});
  }
});

test('settings search filters rows, handles empty results and clears before Escape closes the dialog', async ({page}) => {
  await page.goto('/');
  const dialog = await openSettings(page);
  await page.keyboard.press('/');
  const search = dialog.getByRole('searchbox', {name: 'Search settings', exact: true});
  await expect(search).toBeFocused();
  await search.fill('  monero  ');
  await expect(row(dialog, 'Monero')).toBeVisible();
  await expect(row(dialog, 'Personalization')).toHaveCount(0);
  await search.fill('no matching setting');
  await expect(dialog.getByRole('status')).toHaveText('No settings match');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(row(dialog, 'Personalization')).toBeVisible();
  await search.fill('weekly');
  await expect(dialog.getByRole('status')).toHaveText('No settings match');
  await search.fill('Light');
  await expect(dialog.getByRole('status')).toHaveText('No settings match');
  await search.fill('Monero/');
  await search.press('/');
  await expect(search).toHaveValue('Monero//');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', {name: 'Open settings', exact: true}).click();
  await expect(search).toHaveValue('');
});

test('section navigation clears a conflicting search and scrollspy follows visible content', async ({page}) => {
  await page.goto('/');
  const dialog = await openSettings(page);
  const search = dialog.getByRole('searchbox', {name: 'Search settings', exact: true});
  const navigation = dialog.getByRole('navigation', {name: 'Settings sections'});
  await search.fill('Monero');
  await navigation.getByRole('button', {name: 'Appearance', exact: true}).click();
  await expect(search).toHaveValue('');
  await expect(dialog.getByRole('heading', {name: 'Appearance', exact: true})).toBeInViewport();
  await expect(navigation.getByRole('button', {name: 'Appearance', exact: true})).toHaveAttribute('aria-current', 'location');
  await dialog.getByRole('heading', {name: 'Environment', exact: true}).scrollIntoViewIfNeeded();
  await dialog.getByRole('heading', {name: 'Help', exact: true}).scrollIntoViewIfNeeded();
  await expect(navigation.getByRole('button', {name: 'Help', exact: true})).toHaveAttribute('aria-current', 'location');
});

for (const accent of ['sage', 'indigo'] as const) {
  test(`saved ${accent} preferences survive the new palette until another colour is selected`, async ({page}) => {
    await page.addInitScript(({key, accent}) => localStorage.setItem(key, JSON.stringify({appearance: 'light', accent, density: 'compact', reduceMotion: true, notifications: false})), {key: preferenceKey, accent});
    await page.goto('/');
    const dialog = await openSettings(page);
    const colour = dialog.getByRole('combobox', {name: 'Accent colour', exact: true});
    await expect(colour).toHaveValue(accent);
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    await colour.selectOption('rose');
    await expect(page.locator('html')).toHaveAttribute('data-accent', 'rose');
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), preferenceKey)).toEqual({appearance: 'light', accent: 'rose', density: 'compact', reduceMotion: true, notifications: false});
  });
}

test('data controls reset only device preferences and leave an unlocked workspace available', async ({page}) => {
  await installWorkspaceFixture(page);
  await page.goto('/');
  const dialog = await openSettings(page);
  await dialog.getByRole('combobox', {name: 'Appearance', exact: true}).selectOption('light');
  await dialog.getByRole('combobox', {name: 'Accent colour', exact: true}).selectOption('blue');
  await detail(dialog, 'Personalization');
  await dialog.getByLabel('Density', {exact: true}).selectOption('compact');
  await dialog.getByLabel('Reduce motion', {exact: true}).check();
  await dialog.getByRole('button', {name: 'Back to settings', exact: true}).click();
  await detail(dialog, 'Notifications');
  await dialog.getByLabel('Show status messages', {exact: true}).uncheck();
  await dialog.getByRole('button', {name: 'Back to settings', exact: true}).click();
  await detail(dialog, 'Data controls');
  await dialog.getByRole('button', {name: 'Reset device preferences', exact: true}).click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), preferenceKey)).toEqual({appearance: 'dark', accent: 'crimson', density: 'comfortable', reduceMotion: false, notifications: true});
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'crimson');
  await dialog.getByRole('button', {name: 'Close settings', exact: true}).click();
  await expect(page.getByRole('heading', {name: 'Profiles.', exact: true})).toBeVisible();
});

test('compact desktop windows retain search and section navigation without horizontal overflow', async ({page}) => {
  await page.setViewportSize({width: 860, height: 800});
  await page.goto('/');
  const dialog = await openSettings(page);
  await expect(dialog.getByRole('searchbox', {name: 'Search settings', exact: true})).toBeVisible();
  const navigation = dialog.getByRole('navigation', {name: 'Settings sections'});
  await navigation.getByRole('button', {name: 'Account', exact: true}).click();
  const accountHeading = dialog.getByRole('heading', {name: 'Account', exact: true});
  await expect.poll(() => accountHeading.evaluate(element => {
    const box = element.getBoundingClientRect();
    const visible = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return visible === element || (visible !== null && element.contains(visible));
  })).toBe(true);
  await navigation.getByRole('button', {name: 'App', exact: true}).click();
  await expect(dialog.getByRole('heading', {name: 'App', exact: true})).toBeInViewport();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.screenshot({path: 'test-results/settings-compact.png', animations: 'disabled'});
});

test('startup storage failures keep preferences usable and warn before the first change', async ({page}) => {
  await page.addInitScript(key => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function(name) {
      if (name === key) throw new DOMException('Storage denied', 'SecurityError');
      return getItem.call(this, name);
    };
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Storage denied', 'SecurityError');
      return setItem.call(this, name, value);
    };
  }, preferenceKey);
  await page.goto('/');
  let dialog = await openSettings(page);
  await expect(dialog.getByRole('status')).toContainText('Device storage is unavailable');
  await expect(dialog).not.toContainText('Device preferences save automatically.');
  await dialog.getByRole('combobox', {name: 'Appearance', exact: true}).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'light');
  await expect(dialog.getByRole('status')).toContainText('Device storage is unavailable');
  await page.reload();
  dialog = await openSettings(page);
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(dialog.getByRole('status')).toContainText('Device storage is unavailable');
});
