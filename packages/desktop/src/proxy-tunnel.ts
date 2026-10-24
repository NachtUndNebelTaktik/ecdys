import {connect, isIP, type Socket} from 'node:net';
import {connect as tlsConnect} from 'node:tls';
import {ProxyRouteDraftSchema, type ProxyRouteDraft} from '@ecdys/shared';
import {domainToASCII} from 'node:url';

export const tunnelMessages: Record<string, string> = {
  TUNNEL_ACCEPTED:
    'The proxy accepted a tunnel to example.com:443. Public IP identity and native route enforcement were not tested.',
  AUTH_METHOD_REJECTED: 'The proxy did not accept the configured authentication method.',
  AUTH_FAILED: 'The proxy rejected authentication. Check the saved username and password.',
  DESTINATION_REJECTED:
    'The proxy refused the requested destination. Check proxy access rules and connectivity.',
  PROTOCOL_ERROR: 'The endpoint returned an invalid proxy protocol response.',
  RESPONSE_TOO_LARGE: 'The proxy response exceeded the diagnostic size limit.',
  CONNECTION_CLOSED: 'The proxy closed the connection before the tunnel was established.',
  TIMEOUT: 'The proxy did not complete the tunnel within the diagnostic deadline.',
  CANCELLED: 'The diagnostic was cancelled.',
  TLS_FAILED:
    'The TLS connection to the proxy failed. Check its certificate, hostname and TLS port.',
  NETWORK_ERROR: 'The proxy could not be reached. Check its hostname, port and local network.',
  INVALID_CONFIGURATION: 'The proxy configuration is invalid. Check protocol and credentials.',
};
export class ProxyTunnelError extends Error {
  constructor(readonly code: string) {
    super(tunnelMessages[code]);
  }
}

// One bounded reader owns the stream for the entire handshake; fragmented packets
// and replies that arrive before the next read never lose bytes.
class Reader {
  private bytes = Buffer.alloc(0);
  private received = 0;
  private changed?: () => void;
  error?: ProxyTunnelError;
  private readonly listeners: (() => void)[] = [];
  constructor(
    private readonly socket: Socket,
    private readonly tls: boolean,
  ) {
    const data = (chunk: Buffer) => {
      socket.pause();
      this.bytes = Buffer.concat([this.bytes, chunk]);
      this.changed?.();
    };
    const failed = (error: unknown) =>
      this.fail(
        error instanceof ProxyTunnelError
          ? error
          : new ProxyTunnelError(tls ? 'TLS_FAILED' : 'NETWORK_ERROR'),
      );
    const closed = () => this.fail(new ProxyTunnelError('CONNECTION_CLOSED'));
    socket.on('data', data);
    socket.on('error', failed);
    socket.on('end', closed);
    socket.on('close', closed);
    this.listeners.push(() => {
      socket.off('data', data);
      socket.off('error', failed);
      socket.off('end', closed);
      socket.off('close', closed);
    });
  }

  fail(error: ProxyTunnelError) {
    this.error ??= error;
    this.changed?.();
    this.socket.destroy();
  }
  private async until(ready: () => boolean) {
    while (!ready()) {
      if (this.error) throw this.error;
      await new Promise<void>((resolve) => {
        this.changed = resolve;
        this.socket.resume();
      });
      this.changed = undefined;
    }
    if (
      this.error?.code === 'RESPONSE_TOO_LARGE' ||
      this.error?.code === 'TIMEOUT' ||
      this.error?.code === 'CANCELLED'
    )
      throw this.error;
  }
  private consume(length: number) {
    this.received += length;
    if (this.received > 16_384) throw new ProxyTunnelError('RESPONSE_TOO_LARGE');
  }
  release() {
    this.socket.pause();
    for (const remove of this.listeners) remove();
    if (this.bytes.length) this.socket.unshift(this.bytes);
    this.bytes = Buffer.alloc(0);
  }
  async take(length: number): Promise<Buffer> {
    await this.until(() => this.bytes.length >= length);
    this.consume(length);
    const result = Buffer.from(this.bytes.subarray(0, length));
    this.bytes = this.bytes.subarray(length);
    return result;
  }
  async headers(): Promise<string> {
    await this.until(() => {
      const end = this.bytes.indexOf('\r\n\r\n');
      if ((end < 0 ? this.bytes.length : end + 4) + this.received > 16_384)
        throw new ProxyTunnelError('RESPONSE_TOO_LARGE');
      return end >= 0;
    });
    const end = this.bytes.indexOf('\r\n\r\n') + 4;
    this.consume(end);
    const result = this.bytes.subarray(0, end).toString('latin1');
    this.bytes = this.bytes.subarray(end);
    return result;
  }
  clear() {
    this.bytes.fill(0);
    this.bytes = Buffer.alloc(0);
  }
}
async function socksHandshake(
  socket: Socket,
  reader: Reader,
  route: ProxyRouteDraft,
  destination: TunnelDestination,
) {
  const authenticated = Boolean(route.username && route.password);
  socket.write(Buffer.from([5, 1, authenticated ? 2 : 0]));
  const hello = await reader.take(2);
  if (hello[0] !== 5) throw new ProxyTunnelError('PROTOCOL_ERROR');
  if (hello[1] !== (authenticated ? 2 : 0)) throw new ProxyTunnelError('AUTH_METHOD_REJECTED');
  if (authenticated) {
    const username = Buffer.from(route.username!),
      password = Buffer.from(route.password!);
    const auth = Buffer.concat([
      Buffer.from([1, username.length]),
      username,
      Buffer.from([password.length]),
      password,
    ]);
    try {
      await new Promise<void>((resolve, reject) =>
        socket.write(auth, (error) => (error ? reject(error) : resolve())),
      );
    } finally {
      username.fill(0);
      password.fill(0);
      auth.fill(0);
    }
    const reply = await reader.take(2);
    if (reply[0] !== 1) throw new ProxyTunnelError('PROTOCOL_ERROR');
    if (reply[1] !== 0) throw new ProxyTunnelError('AUTH_FAILED');
  }
  const port = Buffer.alloc(2);
  port.writeUInt16BE(destination.port);
  let address: Buffer;
  if (isIP(destination.host) === 4) {
    address = Buffer.from([1, ...destination.host.split('.').map(Number)]);
  } else if (isIP(destination.host) === 6) {
    const normalized = new URL('http://[' + destination.host + ']').hostname.slice(1, -1);
    const halves = normalized.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const parts =
      halves.length === 2
        ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
        : left;
    address = Buffer.alloc(17);
    address[0] = 4;
    parts.forEach((part, index) => address.writeUInt16BE(parseInt(part, 16), 1 + index * 2));
  } else {
    const target = Buffer.from(destination.host, 'ascii');
    address = Buffer.concat([Buffer.from([3, target.length]), target]);
  }
  socket.write(Buffer.concat([Buffer.from([5, 1, 0]), address, port]));
  const reply = await reader.take(4);
  if (reply[0] !== 5 || reply[2] !== 0) throw new ProxyTunnelError('PROTOCOL_ERROR');
  if (reply[1] !== 0) throw new ProxyTunnelError('DESTINATION_REJECTED');
  if (reply[3] === 1) await reader.take(6);
  else if (reply[3] === 4) await reader.take(18);
  else if (reply[3] === 3) {
    const length = (await reader.take(1))[0]!;
    if (!length) throw new ProxyTunnelError('PROTOCOL_ERROR');
    await reader.take(length + 2);
  } else throw new ProxyTunnelError('PROTOCOL_ERROR');
}
async function connectHandshake(
  socket: Socket,
  reader: Reader,
  route: ProxyRouteDraft,
  destination: TunnelDestination,
) {
  const authority =
    (isIP(destination.host) === 6 ? '[' + destination.host + ']' : destination.host) +
    ':' +
    destination.port;
  let headers = 'CONNECT ' + authority + ' HTTP/1.1\r\nHost: ' + authority + '\r\n';
  if (route.username && route.password)
    headers +=
      'Proxy-Authorization: Basic ' +
      Buffer.from(route.username + ':' + route.password).toString('base64') +
      '\r\n';
  const request = Buffer.from(headers + '\r\n');
  try {
    await new Promise<void>((resolve, reject) =>
      socket.write(request, (error) => (error ? reject(error) : resolve())),
    );
  } finally {
    request.fill(0);
    headers = '';
  }
  for (let informational = 0; informational <= 5; informational++) {
    const lines = (await reader.headers()).slice(0, -4).split('\r\n');
    const match = /^HTTP\/1\.[01] ([0-9]{3})(?: [\t\x20-\x7e\x80-\xff]*)?$/.exec(lines[0]!);
    if (
      !match ||
      lines
        .slice(1)
        .some((line) => !/^[!#$%&'*+.^_\x60|~0-9A-Za-z-]+:[\t\x20-\x7e\x80-\xff]*$/.test(line))
    )
      throw new ProxyTunnelError('PROTOCOL_ERROR');
    const code = Number(match[1]);
    if (code >= 100 && code < 200 && code !== 101) continue;
    if (code === 407) throw new ProxyTunnelError('AUTH_FAILED');
    if (code < 200 || code >= 300) throw new ProxyTunnelError('DESTINATION_REJECTED');
    return;
  }
  throw new ProxyTunnelError('PROTOCOL_ERROR');
}

export interface TunnelDestination {
  host: string;
  port: number;
}
export async function openProxyTunnel(
  input: ProxyRouteDraft,
  target: TunnelDestination,
  options: {signal?: AbortSignal; timeoutMs?: number} = {},
): Promise<Socket> {
  const host = isIP(target.host) ? target.host : domainToASCII(target.host);
  if (
    !host ||
    host.length > 253 ||
    (!isIP(host) && !/^[a-z0-9_.-]+$/i.test(host)) ||
    !Number.isInteger(target.port) ||
    target.port < 1 ||
    target.port > 65535
  )
    throw new ProxyTunnelError('INVALID_CONFIGURATION');
  const parsed = ProxyRouteDraftSchema.safeParse(input);
  if (!parsed.success) throw new ProxyTunnelError('INVALID_CONFIGURATION');
  if (options.signal?.aborted) throw new ProxyTunnelError('CANCELLED');
  const route = parsed.data,
    tls = route.kind === 'http_connect' && route.tlsToProxy;
  const socket: Socket = tls
    ? tlsConnect({
        host: route.host,
        port: route.port,
        servername: isIP(route.host) ? undefined : route.host,
        rejectUnauthorized: true,
      })
    : connect({host: route.host, port: route.port});
  const reader = new Reader(socket, tls);
  // A consumer may attach its own handler after this promise resolves.
  socket.on('error', () => undefined);
  const abort = () => socket.destroy(new ProxyTunnelError('CANCELLED'));
  options.signal?.addEventListener('abort', abort, {once: true});
  socket.once('close', () => options.signal?.removeEventListener('abort', abort));
  const timer = setTimeout(
    () => reader.fail(new ProxyTunnelError('TIMEOUT')),
    options.timeoutMs ?? 6000,
  );
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        socket.off(tls ? 'secureConnect' : 'connect', ready);
        socket.off('error', failed);
        socket.off('close', failed);
      };
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(reader.error || new ProxyTunnelError(tls ? 'TLS_FAILED' : 'NETWORK_ERROR'));
      };
      socket.once(tls ? 'secureConnect' : 'connect', ready);
      socket.once('error', failed);
      socket.once('close', failed);
    });
    const destination = {host, port: target.port};
    if (route.kind === 'socks5') await socksHandshake(socket, reader, route, destination);
    else await connectHandshake(socket, reader, route, destination);
    reader.release();
    return socket;
  } catch (error) {
    socket.destroy();
    reader.clear();
    throw error instanceof ProxyTunnelError ? error : new ProxyTunnelError('NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    delete route.password;
  }
}
