import {connect, isIP, type Socket} from 'node:net';
import {connect as tlsConnect} from 'node:tls';
import {ProxyRouteDraftSchema, type ProxyDiagnostic, type ProxyRouteDraft} from '@ecdys/shared';

const messages: Record<string, string> = {
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
class ProbeFailure extends Error {
  constructor(readonly code: string) {
    super(messages[code]);
  }
}

// One bounded reader owns the stream for the entire handshake; fragmented packets
// and replies that arrive before the next read never lose bytes.
class Reader {
  private bytes = Buffer.alloc(0);
  private received = 0;
  private changed?: () => void;
  error?: ProbeFailure;
  constructor(
    private readonly socket: Socket,
    private readonly tls: boolean,
  ) {
    socket.on('data', (chunk: Buffer) => {
      this.received += chunk.length;
      if (this.received > 16_384) {
        this.fail(new ProbeFailure('RESPONSE_TOO_LARGE'));
        return;
      }
      this.bytes = Buffer.concat([this.bytes, chunk]);
      this.changed?.();
    });
    socket.on('error', (error: unknown) =>
      this.fail(
        error instanceof ProbeFailure
          ? error
          : new ProbeFailure(tls ? 'TLS_FAILED' : 'NETWORK_ERROR'),
      ),
    );
    socket.on('end', () => this.fail(new ProbeFailure('CONNECTION_CLOSED')));
    socket.on('close', () => this.fail(new ProbeFailure('CONNECTION_CLOSED')));
  }
  fail(error: ProbeFailure) {
    this.error ??= error;
    this.changed?.();
    this.socket.destroy();
  }
  private async until(ready: () => boolean) {
    while (!ready()) {
      if (this.error) throw this.error;
      await new Promise<void>((resolve) => {
        this.changed = resolve;
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
  async take(length: number): Promise<Buffer> {
    await this.until(() => this.bytes.length >= length);
    const result = Buffer.from(this.bytes.subarray(0, length));
    this.bytes = this.bytes.subarray(length);
    return result;
  }
  async headers(): Promise<string> {
    await this.until(() => this.bytes.indexOf('\r\n\r\n') >= 0);
    const end = this.bytes.indexOf('\r\n\r\n') + 4;
    const result = this.bytes.subarray(0, end).toString('latin1');
    this.bytes = this.bytes.subarray(end);
    return result;
  }
  clear() {
    this.bytes.fill(0);
    this.bytes = Buffer.alloc(0);
  }
}
async function socksHandshake(socket: Socket, reader: Reader, route: ProxyRouteDraft) {
  const authenticated = Boolean(route.username && route.password);
  socket.write(Buffer.from([5, 1, authenticated ? 2 : 0]));
  const hello = await reader.take(2);
  if (hello[0] !== 5) throw new ProbeFailure('PROTOCOL_ERROR');
  if (hello[1] !== (authenticated ? 2 : 0)) throw new ProbeFailure('AUTH_METHOD_REJECTED');
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
    if (reply[0] !== 1) throw new ProbeFailure('PROTOCOL_ERROR');
    if (reply[1] !== 0) throw new ProbeFailure('AUTH_FAILED');
  }
  const target = Buffer.from('example.com', 'ascii');
  socket.write(
    Buffer.concat([Buffer.from([5, 1, 0, 3, target.length]), target, Buffer.from([1, 187])]),
  );
  const reply = await reader.take(4);
  if (reply[0] !== 5 || reply[2] !== 0) throw new ProbeFailure('PROTOCOL_ERROR');
  if (reply[1] !== 0) throw new ProbeFailure('DESTINATION_REJECTED');
  if (reply[3] === 1) await reader.take(6);
  else if (reply[3] === 4) await reader.take(18);
  else if (reply[3] === 3) {
    const length = (await reader.take(1))[0]!;
    if (!length) throw new ProbeFailure('PROTOCOL_ERROR');
    await reader.take(length + 2);
  } else throw new ProbeFailure('PROTOCOL_ERROR');
}
async function connectHandshake(socket: Socket, reader: Reader, route: ProxyRouteDraft) {
  let headers = 'CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n';
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
      throw new ProbeFailure('PROTOCOL_ERROR');
    const code = Number(match[1]);
    if (code >= 100 && code < 200 && code !== 101) continue;
    if (code === 407) throw new ProbeFailure('AUTH_FAILED');
    if (code < 200 || code >= 300) throw new ProbeFailure('DESTINATION_REJECTED');
    return;
  }
  throw new ProbeFailure('PROTOCOL_ERROR');
}
export async function probeProxy(
  input: ProxyRouteDraft,
  options: {signal?: AbortSignal; timeoutMs?: number} = {},
): Promise<Omit<ProxyDiagnostic, 'endpointId'>> {
  const checkedAt = Date.now(),
    start = performance.now();
  let code = 'TUNNEL_ACCEPTED',
    socket: Socket | undefined,
    reader: Reader | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => reader?.fail(new ProbeFailure('CANCELLED'));
  try {
    const parsed = ProxyRouteDraftSchema.safeParse(input);
    if (!parsed.success) throw new ProbeFailure('INVALID_CONFIGURATION');
    if (options.signal?.aborted) throw new ProbeFailure('CANCELLED');
    const route = parsed.data,
      tls = route.kind === 'http_connect' && route.tlsToProxy;
    socket = tls
      ? tlsConnect({
          host: route.host,
          port: route.port,
          servername: isIP(route.host) ? undefined : route.host,
          rejectUnauthorized: true,
        })
      : connect({host: route.host, port: route.port});
    reader = new Reader(socket, tls);
    options.signal?.addEventListener('abort', abort, {once: true});
    timer = setTimeout(() => reader!.fail(new ProbeFailure('TIMEOUT')), options.timeoutMs ?? 6_000);
    await new Promise<void>((resolve, reject) => {
      const ready = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(reader!.error || new ProbeFailure(tls ? 'TLS_FAILED' : 'NETWORK_ERROR'));
      };
      const cleanup = () => {
        socket!.off(tls ? 'secureConnect' : 'connect', ready);
        socket!.off('error', failed);
        socket!.off('close', failed);
      };
      socket!.once(tls ? 'secureConnect' : 'connect', ready);
      socket!.once('error', failed);
      socket!.once('close', failed);
    });
    if (route.kind === 'socks5') await socksHandshake(socket, reader, route);
    else await connectHandshake(socket, reader, route);
  } catch (error) {
    code = error instanceof ProbeFailure ? error.code : 'NETWORK_ERROR';
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
    socket?.destroy();
    reader?.clear();
  }
  return {
    checkedAt,
    durationMs: Math.round(performance.now() - start),
    scope: 'proxy_tunnel',
    state: code === 'TUNNEL_ACCEPTED' ? 'pass' : 'fail',
    code,
    message: messages[code]!,
    destination: 'example.com:443',
  };
}
