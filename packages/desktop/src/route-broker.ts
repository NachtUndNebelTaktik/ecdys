import {createServer, connect, type Socket} from 'node:net';
import {mkdtemp, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import type {ProxyRouteDraft} from '@ecdys/shared';
import {openProxyTunnel, ProxyTunnelError, type TunnelDestination} from './proxy-tunnel';

export function readControlLine(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    let bytes = Buffer.alloc(0);
    const timer = setTimeout(() => finish(new Error('Control deadline exceeded.')), 6000);
    const finish = (error?: Error, value?: string) => {
      clearTimeout(timer);
      socket.pause();
      socket.off('data', data);
      socket.off('error', failed);
      socket.off('end', failed);
      if (error) {
        socket.destroy();
        reject(error);
      } else resolve(value!);
    };
    const failed = () => finish(new Error('Control connection closed.'));
    const data = (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      const end = bytes.indexOf(10);
      if ((end < 0 ? bytes.length : end) > 4096)
        return finish(new Error('Control message too large.'));
      if (end >= 0) {
        socket.pause();
        if (bytes.length > end + 1) socket.unshift(bytes.subarray(end + 1));
        finish(undefined, bytes.subarray(0, end).toString('utf8'));
      }
    };
    socket.on('data', data);
    socket.once('error', failed);
    socket.once('end', failed);
    socket.resume();
  });
}

// Only this host-side broker can open internet sockets. The contained browser
// sees a Unix socket and a private loopback HTTP proxy, never these credentials.
export async function createRouteBroker(route: ProxyRouteDraft) {
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-route-'));
  await chmod(directory, 0o700);
  const socketPath = join(directory, 'route.sock'),
    token = randomBytes(32).toString('hex');
  const clients = new Set<Socket>(),
    controller = new AbortController();
  let closed = false;
  const allowed = new Set<string>();
  const waiting = new Map<string, Set<() => void>>();
  const keyFor = (host: string, port: number) => host.toLowerCase() + ':' + port;
  const server = createServer((client) => {
    client.on('error', () => undefined);
    if (closed || clients.size >= 128) {
      client.destroy();
      return;
    }
    clients.add(client);
    client.once('close', () => clients.delete(client));
    void (async () => {
      let upstream: Socket | undefined;
      try {
        const request = JSON.parse(await readControlLine(client));
        if (
          typeof request.token !== 'string' ||
          request.token.length !== token.length ||
          !timingSafeEqual(Buffer.from(request.token), Buffer.from(token))
        )
          throw new Error('Unauthorized.');
        if (typeof request.host !== 'string' || typeof request.port !== 'number')
          throw new Error('Invalid destination.');
        const destinationKey = keyFor(request.host, request.port);
        if (!allowed.has(destinationKey))
          await new Promise<void>((resolve) => {
            const callbacks = waiting.get(destinationKey) || new Set<() => void>();
            let timer: NodeJS.Timeout;
            const finish = () => {
              clearTimeout(timer);
              callbacks.delete(finish);
              if (!callbacks.size) waiting.delete(destinationKey);
              resolve();
            };
            callbacks.add(finish);
            waiting.set(destinationKey, callbacks);
            timer = setTimeout(finish, 1000);
          });
        if (closed || client.destroyed || !allowed.has(destinationKey))
          throw new Error('Destination not admitted by the browser page.');
        upstream = await openProxyTunnel(
          route,
          {host: request.host, port: request.port},
          {signal: controller.signal},
        );
        if (closed || client.destroyed) {
          upstream.destroy();
          return;
        }
        client.write('OK\n');
        client.once('close', () => upstream?.destroy());
        upstream.once('error', () => client.destroy());
        upstream.pipe(client);
        client.pipe(upstream);
      } catch (error) {
        upstream?.destroy();
        if (!client.destroyed)
          client.end(
            'ERR ' + (error instanceof ProxyTunnelError ? error.code : 'BROKER_REFUSED') + '\n',
          );
      }
    })();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, () => {
        server.off('error', reject);
        resolve();
      });
    });
    await chmod(socketPath, 0o600);
  } catch (error) {
    server.close();
    await rm(directory, {recursive: true, force: true});
    throw error;
  }
  return {
    directory,
    token,
    allow(host: string, port: number) {
      if (
        closed ||
        !host ||
        host.length > 253 ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535 ||
        allowed.size >= 2048
      )
        return;
      const key = keyFor(host, port);
      allowed.add(key);
      for (const finish of waiting.get(key) || []) finish();
    },
    async close() {
      if (closed) return;
      closed = true;
      allowed.clear();
      for (const callbacks of waiting.values()) for (const finish of callbacks) finish();
      waiting.clear();
      controller.abort();
      for (const client of clients) client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      delete route.password;
      await rm(directory, {recursive: true, force: true});
    },
  };
}

export async function connectBroker(
  socketPath: string,
  token: string,
  destination: TunnelDestination,
): Promise<Socket> {
  const socket = connect(socketPath);
  socket.on('error', () => undefined);
  socket.write(JSON.stringify({...destination, token}) + '\n');
  const reply = await readControlLine(socket);
  if (reply !== 'OK') {
    socket.destroy();
    throw new Error('The selected proxy could not open this connection.');
  }
  return socket;
}
