import {test, expect, _electron as electron, type ElectronApplication} from '@playwright/test';
import {createServer} from 'node:http';
import {createServer as tcpServer, connect, type Socket} from 'node:net';
import {createHash} from 'node:crypto';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

test('real browser viewport uses authenticated SOCKS5 for pages, input and WebSockets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-browsing-'));
  const sockets = new Set<Socket>(),
    visits: string[] = [],
    targets: string[] = [];
  const site = createServer((request, response) => {
    visits.push(request.url!);
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><head><title>ecdys runtime fixture</title></head><body style="margin:0;background:#0c0c0c;color:#ededee;font:16px system-ui">
      <div style="padding:40px 64px"><p style="color:#f04464;font-size:12px;letter-spacing:3px">ECDYS · LIVE RUNTIME CHECK</p><h1 style="font-size:40px;margin-top:36px">Your browser is live.</h1><p style="color:#aaaab0;max-width:600px;line-height:1.8">This is a local integration fixture, loaded by real Chromium through an authenticated SOCKS5 proxy.</p>
      <a href="/clicked" style="position:absolute;top:260px;left:64px;display:inline-block;padding:16px 24px;background:#f04464;color:#080808;border-radius:10px;text-decoration:none">Test a real navigation</a>
      <form action="/typed"><input name="q" placeholder="Type here, then press Enter" style="position:absolute;top:350px;left:64px;width:360px;padding:16px;background:#161616;color:white;border:1px solid #303030;border-radius:10px;font:16px system-ui"></form>
      <p style="position:absolute;top:440px;left:64px;color:#aaaab0">Timezone: <span id="zone"></span> · WebSocket: <span id="socket">connecting</span></p><p style="position:absolute;top:530px;left:64px;color:#85858c;font-size:13px">Memory-only session. This page is a test fixture, not market data.</p></div>
      <script>document.querySelector('input').value=new URLSearchParams(location.search).get('q')||'';const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;document.getElementById('zone').textContent=zone;window.addEventListener('load',()=>fetch('/ready?path='+encodeURIComponent(location.pathname)+'&zone='+encodeURIComponent(zone)));const ws=new WebSocket('ws://'+location.host+'/socket');ws.onmessage=()=>{document.getElementById('socket').textContent='connected';fetch('/ws-confirmed')};</script></body></html>`);
  });
  site.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  site.on('upgrade', (request, socket) => {
    const accept = createHash('sha1')
      .update(String(request.headers['sec-websocket-key']) + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
        accept +
        '\r\n\r\n',
    );
    socket.write(Buffer.from([0x81, 2, 79, 75]));
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const sitePort = (site.address() as {port: number}).port;
  const proxy = tcpServer((client) => {
    sockets.add(client);
    client.on('error', () => undefined);
    client.on('close', () => sockets.delete(client));
    let state = 0,
      buffer = Buffer.alloc(0);
    const handshake = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (state === 0 && buffer.length >= 3) {
        if (!buffer.subarray(0, 3).equals(Buffer.from([5, 1, 2]))) {
          client.destroy();
          return;
        }
        buffer = buffer.subarray(3);
        state = 1;
        client.write(Buffer.from([5, 2]));
      }
      if (state === 1 && buffer.length >= 2) {
        const usernameLength = buffer[1]!;
        if (buffer.length < usernameLength + 3) return;
        const passwordLength = buffer[usernameLength + 2]!;
        if (buffer.length < usernameLength + passwordLength + 3) return;
        const username = buffer.subarray(2, usernameLength + 2).toString(),
          password = buffer
            .subarray(usernameLength + 3, usernameLength + passwordLength + 3)
            .toString();
        if (username !== 'operator' || password !== 'owned-proxy-secret') {
          client.end(Buffer.from([1, 1]));
          return;
        }
        buffer = buffer.subarray(usernameLength + passwordLength + 3);
        state = 2;
        client.write(Buffer.from([1, 0]));
      }
      if (state === 2 && buffer.length >= 5) {
        if (buffer[3] !== 3) {
          client.destroy();
          return;
        }
        const length = buffer[4]!;
        if (buffer.length < length + 7) return;
        const host = buffer.subarray(5, length + 5).toString(),
          port = buffer.readUInt16BE(length + 5);
        targets.push(host + ':' + port);
        if (host !== 'runtime.ecdys.test' || port !== sitePort) {
          client.end(Buffer.from([5, 2, 0, 1, 0, 0, 0, 0, 0, 0]));
          return;
        }
        state = 3;
        client.off('data', handshake);
        const head = buffer.subarray(length + 7);
        const upstream = connect(sitePort, '127.0.0.1', () => {
          client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
          if (head.length) upstream.write(head);
          client.pipe(upstream);
          upstream.pipe(client);
        });
        sockets.add(upstream);
        upstream.on('error', () => client.destroy());
        upstream.on('close', () => sockets.delete(upstream));
        client.on('close', () => upstream.destroy());
      }
    };
    client.on('data', handshake);
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
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
    const page = await app.firstWindow(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.getByLabel('Passphrase', {exact: true}).fill('real browser integration passphrase');
    await page.getByLabel('Confirm passphrase').fill('real browser integration passphrase');
    await page.getByLabel('Key derivation memory').selectOption('1024');
    await page.getByRole('button', {name: 'Create local vault'}).click();
    await expect(page.getByRole('heading', {name: 'Profile workspace'})).toBeVisible({
      timeout: 60000,
    });
    const profile = await page.evaluate(
      async (port) =>
        window.ecdys!.createProfile({
          name: 'SOCKS5 browser fixture',
          timezone: 'America/New_York',
          route: {
            kind: 'socks5',
            host: '127.0.0.1',
            port,
            username: 'operator',
            password: 'owned-proxy-secret',
          },
        }),
      (proxy.address() as {port: number}).port,
    );
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Browser/})
      .click();
    await page.getByRole('button', {name: 'Customize appearance', exact: false}).click();
    await page.getByLabel('Interface theme', {exact: true}).selectOption('crimson');
    await page.getByRole('button', {name: 'Hide appearance', exact: false}).click();
    await page.getByRole('button', {name: 'Open temporary browser', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', {name: 'Start temporary browser'})).toBeDisabled();
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', {name: 'Start temporary browser'}).click();
    await expect(dialog).not.toBeVisible({timeout: 30000});
    expect(targets).toEqual([]);
    await page
      .getByRole('textbox', {name: 'Live browser address'})
      .fill(`http://runtime.ecdys.test:${sitePort}/first`);
    await page.getByRole('textbox', {name: 'Live browser address'}).press('Enter');
    await expect
      .poll(() => visits.some((url) => url === '/ready?path=%2Ffirst&zone=America%2FNew_York'))
      .toBe(true);
    await expect.poll(() => visits.includes('/ws-confirmed')).toBe(true);
    await expect(page.getByRole('img', {name: 'Live browser page'})).toBeVisible();
    const viewport = page.getByRole('group', {name: 'Live browser viewport'});
    const bounds = (await viewport.boundingBox())!;
    await viewport.click({
      position: {x: (160 * bounds.width) / 1200, y: (285 * bounds.height) / 720},
    });
    await expect.poll(() => visits.includes('/clicked')).toBe(true);
    await expect
      .poll(() => visits.some((url) => url.startsWith('/ready?path=%2Fclicked')))
      .toBe(true);
    await viewport.click({
      position: {x: (160 * bounds.width) / 1200, y: (375 * bounds.height) / 720},
    });
    await viewport.pressSequentially('ecdys is working');
    await viewport.press('Enter');
    await expect.poll(() => visits.includes('/typed?q=ecdys+is+working')).toBe(true);
    await expect(page.getByRole('textbox', {name: 'Live browser address'})).toHaveValue(/typed/);
    await page.setViewportSize({width: 1440, height: 1250});
    await page
      .getByRole('heading', {name: 'Browser workspace', exact: true})
      .scrollIntoViewIfNeeded();
    const snapshots = await page.evaluate((id) => window.ecdys!.listSnapshots(id), profile.id);
    expect(snapshots.some((snapshot) => snapshot.trigger === 'auto_pre_launch')).toBe(true);
    expect(JSON.stringify(await page.evaluate(() => window.ecdys!.browserSession()))).not.toContain(
      'owned-proxy-secret',
    );
    await page.reload();
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Browser/})
      .click();
    await expect(page.getByRole('img', {name: 'Live browser page'})).toBeVisible();
    await page
      .getByRole('heading', {name: 'Browser workspace', exact: true})
      .scrollIntoViewIfNeeded();
    await expect(page.getByRole('img', {name: 'Live browser page'})).toHaveJSProperty(
      'complete',
      true,
    );
    await page.screenshot({path: 'artifacts/browser-live.png'});
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Profiles/})
      .click();
    await expect(
      page.locator('.metric').filter({hasText: 'ACTIVE SESSIONS'}).locator('.metric-number'),
    ).toHaveText('01');
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^OSINT/})
      .click();
    await page.getByRole('tab', {name: 'OSINT tools', exact: false}).click();
    await expect(page.locator('.research-route-note')).toContainText('Route ready');
    await page.getByRole('button', {name: 'Add tool', exact: false}).click();
    await page.getByLabel('Tool name', {exact: true}).fill('Owned runtime source');
    await page
      .getByLabel('Tool website URL', {exact: true})
      .fill(`http://runtime.ecdys.test:${sitePort}/osint-tool`);
    await page.getByRole('dialog').getByRole('button', {name: 'Save tool'}).click();
    await page
      .locator('.research-tool')
      .filter({hasText: 'Owned runtime source'})
      .getByRole('button', {name: 'Open', exact: false})
      .click();
    await expect(page.getByRole('heading', {name: 'Browser workspace', exact: true})).toBeVisible();
    await expect.poll(() => visits.includes('/osint-tool')).toBe(true);
    await page
      .getByRole('navigation')
      .getByRole('button', {name: /^Browser/})
      .click();
    await page
      .locator('.sidebar')
      .getByRole('button', {name: 'Lock workspace', exact: false})
      .click();
    await expect(page.getByRole('button', {name: 'Unlock workspace'})).toBeVisible();
    expect([...new Set(targets)]).toEqual(['runtime.ecdys.test:' + sitePort]);
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
    for (const socket of sockets) socket.destroy();
    await Promise.all([
      new Promise<void>((resolve) => proxy.close(() => resolve())),
      new Promise<void>((resolve) => site.close(() => resolve())),
    ]);
    await rm(directory, {recursive: true, force: true});
  }
});
