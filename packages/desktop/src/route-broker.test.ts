import {describe, expect, it} from 'vitest';
import {createServer, type Socket} from 'node:net';
import {createRouteBroker, connectBroker, type TemporaryBrowserRoute} from './route-broker';

describe.skipIf(process.platform !== 'linux')('selected Direct broker transport', () => {
  it.each(['127.0.0.1', 'localhost'])(
    'admits %s only after a page request and revokes live sockets on close',
    async (host) => {
      let hits = 0;
      const peers = new Set<Socket>();
      const target = createServer((socket) => {
        hits++;
        peers.add(socket);
        socket.on('error', () => undefined);
        socket.once('close', () => peers.delete(socket));
        socket.once('data', () => socket.write('owned direct fixture'));
      });
      await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
      const port = (target.address() as {port: number}).port;
      const broker = await createRouteBroker({kind: 'direct'});
      let client: Socket | undefined;
      try {
        const path = broker.directory + '/route.sock';
        await expect(connectBroker(path, '0'.repeat(64), {host, port})).rejects.toThrow();
        await expect(connectBroker(path, broker.token, {host, port})).rejects.toThrow();
        expect(hits).toBe(0);
        broker.allow(host, port);
        client = await connectBroker(path, broker.token, {host, port});
        const output: Buffer[] = [];
        client.on('data', (chunk) => output.push(chunk));
        client.resume();
        client.write('request');
        await expect.poll(() => Buffer.concat(output).toString()).toBe('owned direct fixture');
        expect(hits).toBe(1);
        await broker.close();
        await expect.poll(() => client!.destroyed).toBe(true);
        await expect.poll(() => peers.size).toBe(0);
      } finally {
        client?.destroy();
        await broker.close();
        for (const peer of peers) peer.destroy();
        await new Promise<void>((resolve) => target.close(() => resolve()));
      }
    },
  );
  it('never converts a configured proxy failure into a direct destination connection', async () => {
    let targetHits = 0,
      proxyHits = 0;
    const peers = new Set<Socket>();
    const target = createServer((socket) => {
      targetHits++;
      peers.add(socket);
      socket.on('error', () => undefined);
      socket.once('close', () => peers.delete(socket));
    });
    const proxy = createServer((socket) => {
      proxyHits++;
      peers.add(socket);
      socket.on('error', () => undefined);
      socket.once('close', () => peers.delete(socket));
      socket.once('data', () => socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'));
    });
    await Promise.all([
      new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve)),
      new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve)),
    ]);
    const port = (target.address() as {port: number}).port;
    const policy: TemporaryBrowserRoute = {
      kind: 'http_connect',
      host: '127.0.0.1',
      port: (proxy.address() as {port: number}).port,
      tlsToProxy: false,
      routeLock: true,
    };
    const broker = await createRouteBroker(policy);
    // Even mutation of the caller's old object cannot change a running binding.
    (policy as {kind: string}).kind = 'direct';
    try {
      broker.allow('127.0.0.1', port);
      await expect(
        connectBroker(broker.directory + '/route.sock', broker.token, {host: '127.0.0.1', port}),
      ).rejects.toThrow();
      expect(proxyHits).toBe(1);
      expect(targetHits).toBe(0);
    } finally {
      await broker.close();
      for (const peer of peers) peer.destroy();
      await Promise.all([
        new Promise<void>((resolve) => proxy.close(() => resolve())),
        new Promise<void>((resolve) => target.close(() => resolve())),
      ]);
    }
  });
});
