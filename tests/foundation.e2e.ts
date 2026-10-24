import {test, expect, _electron as electron, type ElectronApplication} from '@playwright/test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

test('real desktop vault, SOCKS5 configuration, edit recovery, branch and lock/unlock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-desktop-'));
  const phrase = 'local operator integration passphrase';
  let app: ElectronApplication | undefined;
  try {
    app = await electron.launch({
      args: ['--ozone-platform=headless', resolve('packages/desktop/dist/main.cjs')],
      env: {...process.env, ECDYS_DATA_DIR: directory},
    });
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page.getByRole('heading', {name: 'Establish your workspace.'})).toBeVisible();
    const preferences = await app.evaluate(({BrowserWindow}) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      const inspected = contents as typeof contents & {
        getLastWebPreferences(): {
          contextIsolation: boolean;
          sandbox: boolean;
          nodeIntegration: boolean;
        };
      };
      return inspected.getLastWebPreferences();
    });
    expect(preferences.contextIsolation).toBe(true);
    expect(preferences.sandbox).toBe(true);
    expect(preferences.nodeIntegration).toBe(false);
    await page.getByLabel('Passphrase', {exact: true}).fill(phrase);
    await page.getByLabel('Confirm passphrase').fill(phrase);
    await page.getByLabel('Key derivation memory').selectOption('1024');
    await page.getByRole('button', {name: 'Create local vault'}).click();
    await expect(page.getByRole('heading', {name: 'Profile workspace'})).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', {name: 'New profile', exact: false}).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Profile name').fill('Futures execution');
    await dialog.getByLabel('Tags', {exact: true}).fill('capital, futures');
    await dialog.getByLabel('Operating policy').selectOption('protected_execution');
    await dialog.getByLabel('Route type').selectOption('socks5');
    await dialog.getByLabel('Host', {exact: true}).fill('proxy.example.net');
    await dialog.getByLabel('Port', {exact: true}).fill('1080');
    await dialog.getByLabel('Username', {exact: true}).fill('operator');
    await dialog.getByLabel('Password', {exact: true}).fill('proxy-password-not-for-the-ui');
    await dialog.getByRole('button', {name: 'Create profile', exact: true}).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole('heading', {name: 'Futures execution', exact: true}).first(),
    ).toBeVisible();
    await expect(page.getByText('Launch blocked', {exact: true})).toBeVisible();
    const publicProfiles = await page.evaluate(() => window.ecdys!.listProfiles());
    expect(publicProfiles).toHaveLength(1);
    expect(JSON.stringify(publicProfiles)).not.toContain('proxy-password-not-for-the-ui');
    expect(publicProfiles[0]!.route).toMatchObject({
      kind: 'socks5',
      hasPassword: true,
      remoteDNS: true,
    });
    await page.getByRole('button', {name: 'Edit configuration', exact: true}).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Profile name').fill('Futures test');
    await dialog.getByLabel('Timezone', {exact: true}).fill('America/New_York');
    await dialog.getByRole('button', {name: 'Save configuration'}).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', {name: 'View checkpoints'}).click();
    const baseline = page
      .locator('article.snapshot-row')
      .filter({has: page.getByText('baseline', {exact: true})});
    await baseline.getByRole('button', {name: 'Restore', exact: false}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Confirm', exact: true}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', {name: 'Futures execution', exact: true})).toBeVisible();
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Profiles/})
      .click();
    await page.getByRole('button', {name: 'Create branch', exact: true}).click();
    await page.getByRole('dialog').getByLabel('Branch name').fill('test-route');
    await page
      .getByRole('dialog')
      .getByRole('button', {name: 'Create branch', exact: true})
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(await page.evaluate(() => window.ecdys!.listProfiles())).toHaveLength(2);
    await page.screenshot({path: 'artifacts/profile-workspace.png'});
    await page.getByRole('button', {name: /Lock workspace/}).click();
    await expect(page.getByRole('heading', {name: 'Welcome back, operator.'})).toBeVisible();
    expect(
      (await readFile(join(directory, 'workspace.sqlite'))).includes(
        Buffer.from('Futures execution'),
      ),
    ).toBe(false);
    await page.getByLabel('Passphrase', {exact: true}).fill('wrong local passphrase');
    await page.getByRole('button', {name: 'Unlock workspace'}).click();
    await expect(page.getByRole('alert')).toContainText('Could not unlock');
    await page.getByLabel('Passphrase', {exact: true}).fill(phrase);
    await page.getByRole('button', {name: 'Unlock workspace'}).click();
    await expect(page.getByRole('heading', {name: 'Profile workspace'})).toBeVisible({
      timeout: 60_000,
    });
    expect(await page.evaluate(() => window.ecdys!.listProfiles())).toHaveLength(2);
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
    await rm(directory, {recursive: true, force: true});
  }
});
