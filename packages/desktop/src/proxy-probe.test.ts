import {afterEach, describe, expect, it} from 'vitest';
import {createServer, type Socket, type Server} from 'node:net';
import {createServer as createTlsServer} from 'node:tls';
import {readFileSync} from 'node:fs';
import {probeProxy} from './proxy-probe';

const servers: Server[] = [],
  sockets = new Set<Socket>();
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function fixture(handler: (socket: Socket) => void) {
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    handler(socket);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as {port: number}).port;
}
function socks(
  socket: Socket,
  options: {auth?: boolean; rejectAuth?: boolean; rejectConnect?: boolean; fragmented?: boolean},
  observed: string[],
) {
  let stage = 0,
    bytes = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    bytes = Buffer.concat([bytes, chunk]);
    for (;;) {
      if (stage === 0) {
        if (bytes.length < 3) return;
        observed.push('greeting:' + bytes.subarray(0, 3).toString('hex'));
        bytes = bytes.subarray(3);
        stage = options.auth ? 1 : 2;
        socket.write(Buffer.from([5, options.auth ? 2 : 0]));
      } else if (stage === 1) {
        if (bytes.length < 2 || bytes.length < 3 + bytes[1]!) return;
        const userLength = bytes[1]!,
          passLength = bytes[2 + userLength]!;
        if (bytes.length < 3 + userLength + passLength) return;
        observed.push(
          'auth:' +
            bytes.subarray(2, 2 + userLength).toString() +
            ':' +
            bytes.subarray(3 + userLength, 3 + userLength + passLength).toString(),
        );
        bytes = bytes.subarray(3 + userLength + passLength);
        stage = 2;
        socket.write(Buffer.from([1, options.rejectAuth ? 1 : 0]));
      } else if (stage === 2) {
        if (bytes.length < 5 || bytes.length < 7 + bytes[4]!) return;
        const length = bytes[4]!;
        observed.push(
          'target:' +
            bytes.subarray(5, 5 + length).toString() +
            ':' +
            bytes.readUInt16BE(5 + length),
        );
        observed.push('addressType:' + bytes[3]);
        stage = 3;
        const reply = Buffer.from([5, options.rejectConnect ? 5 : 0, 0, 1, 127, 0, 0, 1, 1, 187]);
        if (options.fragmented) {
          socket.write(reply.subarray(0, 2));
          setTimeout(() => socket.write(reply.subarray(2)), 5);
        } else socket.write(reply);
      } else return;
    }
  });
}
describe('real proxy tunnel diagnostics', () => {
  it('consumes informational HTTP replies before a complete final tunnel response', async () => {
    const port = await fixture((socket) =>
      socket.once('data', () =>
        socket.write(
          'HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 Connection established\r\nProxy-Agent: local-fixture\r\n\r\n',
        ),
      ),
    );
    expect(
      await probeProxy({
        kind: 'http_connect',
        host: '127.0.0.1',
        port,
        tlsToProxy: false,
        routeLock: true,
      }),
    ).toMatchObject({state: 'pass', code: 'TUNNEL_ACCEPTED'});
  });
  it('does not report tunnel success for malformed HTTP header lines', async () => {
    const port = await fixture((socket) =>
      socket.once('data', () => socket.write('HTTP/1.1 200 OK\r\nnot-a-valid-header\r\n\r\n')),
    );
    expect(
      await probeProxy({
        kind: 'http_connect',
        host: '127.0.0.1',
        port,
        tlsToProxy: false,
        routeLock: true,
      }),
    ).toMatchObject({state: 'fail', code: 'PROTOCOL_ERROR'});
  });
  it('bounds the number of informational responses within the total deadline', async () => {
    const port = await fixture((socket) =>
      socket.once('data', () => socket.write('HTTP/1.1 100 Continue\r\n\r\n'.repeat(8))),
    );
    expect(
      await probeProxy(
        {kind: 'http_connect', host: '127.0.0.1', port, tlsToProxy: false, routeLock: true},
        {timeoutMs: 200},
      ),
    ).toMatchObject({state: 'fail', code: 'PROTOCOL_ERROR'});
  });
  it('refuses an untrusted HTTPS proxy certificate before sending credentials', async () => {
    let received = '';
    const server = createTlsServer(
      {
        key: readFileSync(new URL('./fixtures/proxy-test-key.pem', import.meta.url)),
        cert: readFileSync(new URL('./fixtures/proxy-test-cert.pem', import.meta.url)),
      },
      (socket) => {
        sockets.add(socket);
        socket.on('data', (chunk) => {
          received += chunk.toString();
        });
        socket.on('error', () => {});
      },
    );
    server.on('tlsClientError', () => {});
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as {port: number}).port;
    expect(
      await probeProxy({
        kind: 'http_connect',
        host: '127.0.0.1',
        port,
        tlsToProxy: true,
        routeLock: true,
        username: 'operator',
        password: 'private',
      }),
    ).toMatchObject({state: 'fail', code: 'TLS_FAILED'});
    expect(received).toBe('');
  });
  it('performs a fragmented SOCKS5 CONNECT with remote destination DNS', async () => {
    const observed: string[] = [];
    const port = await fixture((socket) => socks(socket, {fragmented: true}, observed));
    const result = await probeProxy({
      kind: 'socks5',
      host: '127.0.0.1',
      port,
      remoteDNS: true,
      routeLock: true,
    });
    expect(result).toMatchObject({
      state: 'pass',
      code: 'TUNNEL_ACCEPTED',
      scope: 'proxy_tunnel',
      destination: 'example.com:443',
    });
    expect(observed).toContain('target:example.com:443');
    expect(observed).toContain('addressType:3');
  });
  it('authenticates saved credentials without placing them in the diagnostic report', async () => {
    const observed: string[] = [];
    const port = await fixture((socket) => socks(socket, {auth: true}, observed));
    const result = await probeProxy({
      kind: 'socks5',
      host: '127.0.0.1',
      port,
      remoteDNS: true,
      routeLock: true,
      username: 'operator',
      password: 'secret-wire-password',
    });
    expect(result.state).toBe('pass');
    expect(observed).toContain('auth:operator:secret-wire-password');
    expect(JSON.stringify(result)).not.toContain('secret-wire-password');
  });
  it('rejects an authentication downgrade when credentials were supplied', async () => {
    const port = await fixture((socket) => socks(socket, {}, []));
    expect(
      await probeProxy({
        kind: 'socks5',
        host: '127.0.0.1',
        port,
        remoteDNS: true,
        routeLock: true,
        username: 'operator',
        password: 'private',
      }),
    ).toMatchObject({state: 'fail', code: 'AUTH_METHOD_REJECTED'});
  });
  it.each([
    ['auth', 'AUTH_FAILED'],
    ['connect', 'DESTINATION_REJECTED'],
  ])('reports %s rejection without a direct fallback', async (mode, code) => {
    const port = await fixture((socket) =>
      socks(
        socket,
        {auth: true, rejectAuth: mode === 'auth', rejectConnect: mode === 'connect'},
        [],
      ),
    );
    expect(
      await probeProxy({
        kind: 'socks5',
        host: '127.0.0.1',
        port,
        remoteDNS: true,
        routeLock: true,
        username: 'operator',
        password: 'private',
      }),
    ).toMatchObject({state: 'fail', code});
  });
  it('sends HTTP CONNECT authentication to the proxy and accepts a complete fragmented response', async () => {
    let request = '';
    const port = await fixture((socket) =>
      socket.on('data', (chunk) => {
        request += chunk.toString();
        if (request.endsWith('\r\n\r\n')) {
          socket.write('HTTP/1.1 200 Connection');
          setTimeout(() => socket.write(' established\r\n\r\n'), 5);
        }
      }),
    );
    expect(
      await probeProxy({
        kind: 'http_connect',
        host: '127.0.0.1',
        port,
        tlsToProxy: false,
        routeLock: true,
        username: 'operator',
        password: 'private',
      }),
    ).toMatchObject({state: 'pass'});
    expect(request).toContain('CONNECT example.com:443 HTTP/1.1\r\n');
    expect(request).toContain(
      'Proxy-Authorization: Basic ' + Buffer.from('operator:private').toString('base64'),
    );
    expect(request).not.toContain('\r\nAuthorization:');
  });
  it('uses fixed errors for proxy authentication failures instead of echoing response bodies', async () => {
    const port = await fixture((socket) =>
      socket.once('data', () => socket.end('HTTP/1.1 407 private-secret\r\n\r\nprivate-secret')),
    );
    const result = await probeProxy({
      kind: 'http_connect',
      host: '127.0.0.1',
      port,
      tlsToProxy: false,
      routeLock: true,
    });
    expect(result).toMatchObject({state: 'fail', code: 'AUTH_FAILED'});
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('bounds hostile HTTP response sizes', async () => {
    const port = await fixture((socket) =>
      socket.once('data', () => socket.write('HTTP/1.1 200 OK\r\nX-Fill: ' + 'a'.repeat(20_000))),
    );
    expect(
      await probeProxy({
        kind: 'http_connect',
        host: '127.0.0.1',
        port,
        tlsToProxy: false,
        routeLock: true,
      }),
    ).toMatchObject({state: 'fail', code: 'RESPONSE_TOO_LARGE'});
  });
  it('applies a total deadline to a stalled peer and destroys the socket', async () => {
    const port = await fixture(() => {});
    const start = performance.now();
    expect(
      await probeProxy(
        {kind: 'socks5', host: '127.0.0.1', port, remoteDNS: true, routeLock: true},
        {timeoutMs: 80},
      ),
    ).toMatchObject({state: 'fail', code: 'TIMEOUT'});
    expect(performance.now() - start).toBeLessThan(1000);
  });
  it('cancels an in-flight handshake on demand', async () => {
    const port = await fixture(() => {});
    const controller = new AbortController();
    const promise = probeProxy(
      {kind: 'socks5', host: '127.0.0.1', port, remoteDNS: true, routeLock: true},
      {signal: controller.signal},
    );
    controller.abort();
    expect(await promise).toMatchObject({state: 'fail', code: 'CANCELLED'});
  });
  it('does not send plaintext CONNECT when TLS-to-proxy is enabled', async () => {
    let first: Buffer | undefined;
    const port = await fixture((socket) =>
      socket.once('data', (chunk) => {
        first = chunk;
        socket.end('HTTP/1.1 200 OK\r\n\r\n');
      }),
    );
    expect(
      await probeProxy({
        kind: 'http_connect',
        host: '127.0.0.1',
        port,
        tlsToProxy: true,
        routeLock: true,
      }),
    ).toMatchObject({state: 'fail', code: 'TLS_FAILED'});
    expect(first?.[0]).toBe(22);
    expect(first?.includes(Buffer.from('CONNECT'))).toBe(false);
  });
});
