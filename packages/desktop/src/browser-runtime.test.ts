import {describe, it, expect} from 'vitest';
import {createServer as createHttpServer} from 'node:http';
import {createServer, connect, type Socket} from 'node:net';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {TemporaryBrowserRuntime} from './browser-runtime';
import {openProxyTunnel} from './proxy-tunnel';
import type {BrowserEvent, Profile, ProxyRouteDraft} from '@ecdys/shared';

describe('real Linux temporary browser', () => {
  it.skipIf(process.platform !== 'linux')(
    'denies direct host-loopback, IPv4 and IPv6 sockets inside the native namespace',
    async () => {
      let reached = 0;
      const host = createServer((socket) => {
        reached++;
        socket.destroy();
      });
      await new Promise<void>((resolve) => host.listen(0, '127.0.0.1', resolve));
      const port = (host.address() as {port: number}).port;
      try {
        const script = `const net=require('node:net');Promise.all([['127.0.0.1',${port}],['1.1.1.1',443],['2606:4700:4700::1111',443]].map(([host,port])=>new Promise(resolve=>{const socket=net.connect({host,port});const timer=setTimeout(()=>{socket.destroy();resolve(false)},1000);socket.once('connect',()=>{clearTimeout(timer);socket.destroy();resolve(true)});socket.once('error',()=>{clearTimeout(timer);resolve(false)})}))).then(result=>process.stdout.write(JSON.stringify(result)));`;
        const result = await promisify(execFile)(
          '/usr/bin/bwrap',
          [
            '--unshare-all',
            '--die-with-parent',
            '--ro-bind',
            '/',
            '/',
            '--proc',
            '/proc',
            '--dev',
            '/dev',
            '--tmpfs',
            '/tmp',
            '--',
            process.execPath,
            '-e',
            script,
          ],
          {env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}, timeout: 5000},
        );
        expect(JSON.parse(result.stdout)).toEqual([false, false, false]);
        expect(reached).toBe(0);
      } finally {
        await new Promise<void>((resolve) => host.close(() => resolve()));
      }
    },
  );
  it.skipIf(process.platform !== 'linux')(
    'loads through an authenticated proxy, receives frames and input, then discards cookies',
    async () => {
      const sockets = new Set<Socket>(),
        destinations: string[] = [],
        visits: {url: string; cookie: string}[] = [];
      const website = createHttpServer((request, response) => {
        visits.push({url: request.url!, cookie: request.headers.cookie || ''});
        response.setHeader('Set-Cookie', 'session=temporary; Path=/');
        response.setHeader('Content-Type', 'text/html');
        response.end(
          '<html><body style="background:#101010;color:white;font:24px sans-serif"><h1>ecdys live browser</h1><form action="/typed"><input style="position:absolute;top:120px;left:20px;height:40px;width:240px" name="q"></form><a href="/clicked" style="position:absolute;top:200px;left:20px">Click fixture</a><script>window.addEventListener("load",()=>fetch("/ready?path="+encodeURIComponent(location.pathname)))</script></body></html>',
        );
      });
      website.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
      });
      await new Promise<void>((resolve) => website.listen(0, '127.0.0.1', resolve));
      const webPort = (website.address() as {port: number}).port;
      const proxy = createServer((client) => {
        sockets.add(client);
        client.on('error', () => undefined);
        client.on('close', () => sockets.delete(client));
        let input = '';
        const handshake = (chunk: Buffer) => {
          input += chunk.toString('latin1');
          if (!input.includes('\r\n\r\n')) return;
          client.off('data', handshake);
          if (
            !input.includes(
              'Proxy-Authorization: Basic ' +
                Buffer.from('operator:fixture-secret').toString('base64'),
            )
          ) {
            client.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
            return;
          }
          const target = input.split('\r\n')[0]!.split(' ')[1]!;
          destinations.push(target);
          // The .test name exists only at this owned proxy, proving remote DNS.
          if (target !== 'fixture.ecdys.test:' + webPort) {
            client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
            return;
          }
          const upstream = connect(webPort, '127.0.0.1', () => {
            client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            upstream.pipe(client);
            client.pipe(upstream);
          });
          sockets.add(upstream);
          upstream.on('error', () => client.destroy());
          upstream.on('close', () => sockets.delete(upstream));
          client.on('close', () => upstream.destroy());
        };
        client.on('data', handshake);
      });
      await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      const route: ProxyRouteDraft = {
        kind: 'http_connect',
        host: '127.0.0.1',
        port: (proxy.address() as {port: number}).port,
        tlsToProxy: false,
        username: 'operator',
        password: 'fixture-secret',
        routeLock: true,
      };
      const events: BrowserEvent[] = [];
      const runtime = new TemporaryBrowserRuntime((event) => {
        if (event.type !== 'frame' || !events.some((old) => old.type === 'frame'))
          events.push(event);
      }, resolve('packages/desktop/dist/browser-worker.cjs'));
      const profile = {
        id: 'cdbd267a-abcc-4c6b-bfdb-cd1f6de46f8d',
        name: 'Runtime fixture',
        timezone: 'UTC',
      } as Profile;
      const controller = new AbortController();
      let releases = 0;
      try {
        expect((await runtime.support()).available).toBe(true);
        let session = await runtime.start({
          profile,
          route: {...route},
          signal: controller.signal,
          release: async () => {
            releases++;
          },
        });
        expect(session.version).toMatch(/^Chrome\/154\./);
        await runtime
          .navigate(session.id, `http://fixture.ecdys.test:${webPort}/first`)
          .catch((error) => {
            throw new Error(
              'Initial navigation failed; visits=' +
                visits.length +
                ', tunnels=' +
                destinations.length,
              {cause: error},
            );
          });
        await expect.poll(() => visits.some((visit) => visit.url === '/first')).toBe(true);
        await expect
          .poll(() => events.some((event) => event.type === 'frame' && event.data.length > 1000))
          .toBe(true);
        await expect
          .poll(() => visits.some((visit) => visit.url === '/ready?path=%2Ffirst'), {timeout: 5000})
          .toBe(true);
        await runtime.input(session.id, {
          type: 'pointer',
          action: 'down',
          button: 'left',
          x: 60,
          y: 220,
        });
        await runtime.input(session.id, {
          type: 'pointer',
          action: 'up',
          button: 'left',
          x: 60,
          y: 220,
        });
        await expect
          .poll(() =>
            visits.some(
              (visit) => visit.url === '/clicked' && visit.cookie.includes('session=temporary'),
            ),
          )
          .toBe(true);
        await expect
          .poll(() => visits.some((visit) => visit.url === '/ready?path=%2Fclicked'))
          .toBe(true);
        await runtime.input(session.id, {
          type: 'pointer',
          action: 'down',
          button: 'left',
          x: 60,
          y: 140,
        });
        await runtime.input(session.id, {
          type: 'pointer',
          action: 'up',
          button: 'left',
          x: 60,
          y: 140,
        });
        await runtime.input(session.id, {type: 'text', text: 'ecdys typed'});
        await runtime.input(session.id, {type: 'key', key: 'Enter'});
        await expect
          .poll(() => visits.some((visit) => visit.url === '/typed?q=ecdys+typed'))
          .toBe(true);
        await expect(runtime.navigate(session.id, 'file:///etc/passwd')).rejects.toThrow();
        await runtime.stop(session.id);
        expect(releases).toBe(1);
        expect(runtime.session()).toBeNull();
        await expect(runtime.navigate(session.id, 'https://example.com')).rejects.toThrow();
        session = await runtime.start({
          profile,
          route: {...route},
          signal: controller.signal,
          release: async () => {
            releases++;
          },
        });
        await runtime.navigate(session.id, `http://fixture.ecdys.test:${webPort}/fresh`);
        await expect
          .poll(() => visits.some((visit) => visit.url === '/fresh' && !visit.cookie))
          .toBe(true);
        controller.abort();
        await expect.poll(() => runtime.session()).toBeNull();
        await runtime.stop();
        expect(releases).toBe(2);
        await runtime.start({
          profile,
          route: {...route},
          signal: new AbortController().signal,
          release: async () => {
            releases++;
          },
        });
        const helper = (runtime as unknown as {child: import('node:child_process').ChildProcess})
          .child;
        helper.kill('SIGKILL');
        await expect.poll(() => runtime.session(), {timeout: 5000}).toBeNull();
        await runtime.stop();
        expect(releases).toBe(3);
        expect(
          destinations.every((destination) => destination === 'fixture.ecdys.test:' + webPort),
        ).toBe(true);
      } finally {
        await runtime.stop();
        for (const socket of sockets) socket.destroy();
        await Promise.all([
          new Promise<void>((resolve) => proxy.close(() => resolve())),
          new Promise<void>((resolve) => website.close(() => resolve())),
        ]);
      }
    },
    60_000,
  );

  it('preserves application bytes coalesced with CONNECT responses and cancels live sockets', async () => {
    const server = createServer((socket) => {
      socket.on('error', () => undefined);
      socket.once('data', () =>
        socket.write(
          Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\n\r\n'), Buffer.alloc(32768, 65)]),
        ),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const controller = new AbortController();
    let socket: Socket | undefined;
    try {
      socket = await openProxyTunnel(
        {
          kind: 'http_connect',
          host: '127.0.0.1',
          port: (server.address() as {port: number}).port,
          tlsToProxy: false,
          routeLock: true,
        },
        {host: 'remote.example', port: 8443},
        {signal: controller.signal},
      );
      const output: Buffer[] = [];
      socket.on('data', (chunk) => output.push(chunk));
      socket.resume();
      await expect.poll(() => Buffer.concat(output).length).toBe(32768);
      controller.abort();
      await expect.poll(() => socket!.destroyed).toBe(true);
    } finally {
      socket?.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
