import {test, expect, _electron as electron, type ElectronApplication} from '@playwright/test';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createServer, type Socket} from 'node:net';

test('real desktop vault, SOCKS5 configuration, edit recovery, branch and lock/unlock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-desktop-'));
  const phrase = 'local operator integration passphrase';
  let proxyRequest = '';
  const proxySockets = new Set<Socket>();
  const proxy = createServer((socket) => {
    proxySockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => proxySockets.delete(socket));
    socket.on('data', (chunk) => {
      proxyRequest += chunk.toString();
      if (proxyRequest.includes('\r\n\r\n'))
        socket.write('HTTP/1.1 200 Connection established\r\n\r\n');
    });
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const proxyPort = (proxy.address() as {port: number}).port;
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
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Routes/})
      .click();
    await page.getByRole('button', {name: 'Import proxy pool'}).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Pool name').fill('Operator exits');
    await dialog
      .getByLabel('Proxy entries')
      .fill(
        'socks5://operator:library-secret-one@first.example:1080\nsocks5://operator:library-secret-two@second.example:1080\nhttp://fixture:local-fixture-only@127.0.0.1:' +
          proxyPort,
      );
    await dialog.getByRole('button', {name: 'Preview import'}).click();
    await expect(dialog.getByText('3 endpoints ready', {exact: true})).toBeVisible();
    await dialog.getByRole('button', {name: 'Save encrypted pool'}).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('heading', {name: 'Operator exits', exact: true})).toBeVisible();
    const localEndpoint = page
      .locator('article.endpoint-card')
      .filter({hasText: '127.0.0.1:' + proxyPort});
    await localEndpoint.getByRole('button', {name: 'Test tunnel', exact: false}).click();
    await expect(localEndpoint.getByText(/^Tunnel accepted/)).toBeVisible();
    expect(proxyRequest).toContain(
      'Proxy-Authorization: Basic ' + Buffer.from('fixture:local-fixture-only').toString('base64'),
    );
    await page.getByLabel('Select Futures execution', {exact: true}).check();
    await page.getByRole('button', {name: 'Assign endpoint'}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Apply route changes'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('1 route changed', {exact: true})).toBeVisible();
    let routed = (await page.evaluate(() => window.ecdys!.listProfiles())).find(
      (p) => p.name === 'Futures execution',
    )!;
    expect(routed.route).toMatchObject({kind: 'socks5', host: 'first.example', hasPassword: true});
    await page.getByRole('button', {name: 'Rotate from pool'}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Apply route changes'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    routed = (await page.evaluate(() => window.ecdys!.listProfiles())).find(
      (p) => p.name === 'Futures execution',
    )!;
    expect(routed.route).toMatchObject({host: 'second.example', hasPassword: true});
    const pools = await page.evaluate(() => window.ecdys!.listProxyPools());
    expect(JSON.stringify(pools)).not.toContain('library-secret');
    await page.setViewportSize({width: 1440, height: 1080});
    await page.getByRole('heading', {name: 'Network routes', exact: true}).scrollIntoViewIfNeeded();
    await page.screenshot({path: 'artifacts/routes-workspace.png'});
    await page.setViewportSize({width: 1050, height: 720});
    await page.getByRole('button', {name: 'Delete pool', exact: true}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Delete saved pool'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(await page.evaluate(() => window.ecdys!.listProxyPools())).toEqual([]);
    expect(
      (await page.evaluate(() => window.ecdys!.listProfiles())).find((p) => p.id === routed.id)
        ?.route,
    ).toMatchObject({host: 'second.example', hasPassword: true});
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
    await expect(page.getByRole('heading', {name: 'Network routes'})).toBeVisible({
      timeout: 60_000,
    });
    expect(await page.evaluate(() => window.ecdys!.listProfiles())).toHaveLength(2);
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Diagnostics/})
      .click();
    await expect(
      page
        .locator('article.diagnostic')
        .filter({has: page.getByRole('heading', {name: 'SOCKS5 / proxy switching', exact: true})}),
    ).toContainText('PARTIAL');
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
    for (const socket of proxySockets) socket.destroy();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
    await rm(directory, {recursive: true, force: true});
  }
});
