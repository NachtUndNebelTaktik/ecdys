// Runs inside bubblewrap's private PID/mount/network namespaces. This process
// has no host TCP route. Only the fixed Unix broker can reach a saved proxy.
import {spawn} from 'node:child_process';
import {createServer, request as httpRequest, Agent, type IncomingHttpHeaders} from 'node:http';
import {networkInterfaces} from 'node:os';
import {readlinkSync, statfsSync, readFileSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {connectBroker} from './route-broker';
import {BrowserCdp} from './browser-cdp';
import {BrowserInputSchema, BrowserUrlSchema} from '@ecdys/shared';

let writable = true;
function emit(value: {type: string; [key: string]: unknown}) {
  if (value.type !== 'frame' || writable)
    writable = process.stdout.write(JSON.stringify(value) + '\n');
}
process.stdout.on('drain', () => {
  writable = true;
});
function headers(input: IncomingHttpHeaders) {
  const excluded = new Set([
    'proxy-authorization',
    'proxy-connection',
    'connection',
    'keep-alive',
    'transfer-encoding',
    'te',
    'trailer',
  ]);
  for (const name of String(input.connection || '')
    .toLowerCase()
    .split(','))
    excluded.add(name.trim());
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !excluded.has(key.toLowerCase())),
  );
}
function destination(url: URL) {
  if (url.username || url.password || !['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol))
    throw new Error('Invalid destination.');
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port || (['https:', 'wss:'].includes(url.protocol) ? 443 : 80)),
  };
}

async function start(config: {token: string; timezone: string; hostNetwork: string}) {
  if (
    Object.keys(networkInterfaces()).some((name) => name !== 'lo') ||
    readlinkSync('/proc/self/ns/net') === config.hostNetwork ||
    Number(statfsSync('/tmp').type) !== 0x01021994 ||
    !/^Max core file size\s+0\s+0\s+/m.test(readFileSync('/proc/self/limits', 'utf8')) ||
    readFileSync('/proc/swaps', 'utf8').trim().split('\n').length !== 1
  )
    throw new Error('The private runtime boundary could not be verified.');
  const tunnel = (url: URL) =>
    connectBroker('/run/ecdys/route.sock', config.token, destination(url));
  const proxy = createServer({maxHeaderSize: 16384}, (request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url!);
        if (url.protocol !== 'http:') throw new Error('Use CONNECT for TLS.');
        const socket = await tunnel(url),
          agent = new Agent({keepAlive: false});
        agent.createConnection = () => socket;
        const forwarded = httpRequest(
          {
            host: url.hostname,
            port: url.port || 80,
            method: request.method,
            path: url.pathname + url.search,
            headers: {...headers(request.headers), host: url.host, connection: 'close'},
            agent,
          },
          (upstream) => {
            response.writeHead(upstream.statusCode || 502, headers(upstream.headers));
            upstream.pipe(response);
          },
        );
        forwarded.once('socket', () => socket.resume());
        forwarded.on('error', () => {
          if (!response.headersSent) response.writeHead(502);
          response.end('The selected proxy could not load this page.');
        });
        response.once('close', () => {
          forwarded.destroy();
          agent.destroy();
        });
        request.pipe(forwarded);
      } catch {
        response.writeHead(502);
        response.end('The selected proxy could not load this page.');
      }
    })();
  });
  proxy.on('clientError', (_error, socket) => socket.destroy());
  proxy.on('connect', (request, client, head) => {
    client.on('error', () => undefined);
    void (async () => {
      try {
        const url = new URL('https://' + request.url);
        if (url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid tunnel.');
        const socket = await tunnel(url);
        if (client.destroyed) {
          socket.destroy();
          return;
        }
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) socket.write(head);
        client.once('close', () => socket.destroy());
        socket.once('error', () => client.destroy());
        socket.pipe(client);
        client.pipe(socket);
      } catch {
        client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      }
    })();
  });
  proxy.on('upgrade', (request, client, head) => {
    client.on('error', () => undefined);
    void (async () => {
      try {
        const url = new URL(request.url!);
        const socket = await tunnel(url);
        if (client.destroyed) {
          socket.destroy();
          return;
        }
        const forwarded = {
          ...headers(request.headers),
          host: url.host,
          connection: 'Upgrade',
          upgrade: 'websocket',
        };
        socket.write(
          `${request.method} ${url.pathname + url.search} HTTP/1.1\r\n` +
            Object.entries(forwarded)
              .map(([name, value]) => `${name}: ${value}`)
              .join('\r\n') +
            '\r\n\r\n',
        );
        if (head.length) socket.write(head);
        client.once('close', () => socket.destroy());
        socket.once('error', () => client.destroy());
        socket.pipe(client);
        client.pipe(socket);
      } catch {
        client.destroy();
      }
    })();
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', () => {
      proxy.off('error', reject);
      resolve();
    });
  });
  const port = (proxy.address() as {port: number}).port;
  const chrome = spawn(
    '/usr/lib/chromium/chromium',
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-client-side-phishing-detection',
      '--disable-domain-reliability',
      '--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,OptimizationHints,MediaRouter,Translate,InterestFeedContentSuggestions',
      '--safebrowsing-disable-auto-update',
      '--disable-component-update',
      '--disable-sync',
      '--disable-extensions',
      '--disable-quic',
      '--disable-breakpad',
      '--deny-permission-prompts',
      '--password-store=basic',
      '--user-data-dir=/tmp/profile',
      '--disk-cache-dir=/tmp/cache',
      '--remote-debugging-pipe',
      '--window-size=1200,720',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--proxy-server=http://127.0.0.1:' + port,
      '--proxy-bypass-list=<-loopback>',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      'about:blank',
    ],
    {stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe']},
  );
  chrome.on('error', () => {
    emit({type: 'fatal'});
    process.exit(1);
  });
  let stopping = false;
  chrome.once('exit', () => {
    if (!stopping) {
      emit({type: 'fatal'});
      process.exit(1);
    }
  });
  const cdp = new BrowserCdp(chrome),
    version = await cdp.send('Browser.getVersion');
  const {targetId} = await cdp.send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await cdp.send('Target.attachToTarget', {targetId, flatten: true});
  const page = (method: string, params: object = {}) => cdp.send(method, params, sessionId);
  await page('Page.enable');
  await page('Network.enable');
  await page('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page('Emulation.setTimezoneOverride', {timezoneId: config.timezone});
  await cdp.send('Browser.setDownloadBehavior', {behavior: 'deny'});
  let lastFrame = 0;
  let pendingFrame: string | undefined, frameTimer: NodeJS.Timeout | undefined;
  const flushFrame = () => {
    frameTimer = undefined;
    if (!pendingFrame) return;
    if (!writable) {
      frameTimer = setTimeout(flushFrame, 50);
      return;
    }
    lastFrame = Date.now();
    emit({type: 'frame', data: pendingFrame});
    pendingFrame = undefined;
  };
  cdp.onEvent = (method, params) => {
    if (method === 'Network.requestWillBeSent' || method === 'Network.webSocketCreated') {
      try {
        const target = destination(
          new URL(method === 'Network.requestWillBeSent' ? params.request.url : params.url),
        );
        emit({type: 'destination', ...target});
      } catch {
        /* Non-network schemes are not admitted. */
      }
    }
    if (method === 'Page.screencastFrame') {
      void page('Page.screencastFrameAck', {sessionId: params.sessionId}).catch(() => undefined);
      if (typeof params.data === 'string' && params.data.length <= 2_796_204) {
        pendingFrame = params.data;
        if (!frameTimer)
          frameTimer = setTimeout(flushFrame, Math.max(0, 120 - (Date.now() - lastFrame)));
      }
    }
    if (method === 'Page.frameNavigated' && !params.frame?.parentId)
      emit({
        type: 'navigated',
        url: String(params.frame?.unreachableUrl || params.frame?.url || 'about:blank').slice(
          0,
          4096,
        ),
      });
    if (
      method === 'Target.targetCreated' &&
      params.targetInfo?.type === 'page' &&
      params.targetInfo.targetId !== targetId
    )
      void cdp
        .send('Target.closeTarget', {targetId: params.targetInfo.targetId})
        .catch(() => undefined);
  };
  await cdp.send('Target.setDiscoverTargets', {discover: true});
  await page('Page.startScreencast', {
    format: 'jpeg',
    quality: 85,
    maxWidth: 1200,
    maxHeight: 720,
    everyNthFrame: 1,
  });
  emit({
    type: 'ready',
    version: String(version.product).slice(0, 100),
    network: readlinkSync('/proc/self/ns/net'),
  });
  return async (message: any) => {
    if (message.method === 'stop') {
      stopping = true;
      await cdp.send('Browser.close').catch(() => undefined);
      proxy.close();
      process.exit(0);
    }
    if (message.method === 'navigate') {
      const url = BrowserUrlSchema.parse(message.url);
      const result = await page('Page.navigate', {url});
      if (result.errorText) throw new Error('The selected route could not load this address.');
    } else if (message.method === 'input') {
      const input = BrowserInputSchema.parse(message.input);
      if (input.type === 'text') await page('Input.insertText', {text: input.text});
      else if (input.type === 'key') {
        const codes: Record<string, number> = {
          Enter: 13,
          Backspace: 8,
          Tab: 9,
          Escape: 27,
          ArrowLeft: 37,
          ArrowUp: 38,
          ArrowRight: 39,
          ArrowDown: 40,
          Delete: 46,
          Home: 36,
          End: 35,
        };
        await page('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: input.key,
          windowsVirtualKeyCode: codes[input.key],
          modifiers: input.shift ? 8 : 0,
          ...(input.key === 'Enter'
            ? {text: String.fromCharCode(13), unmodifiedText: String.fromCharCode(13)}
            : {}),
        });
        await page('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: input.key,
          windowsVirtualKeyCode: codes[input.key],
          modifiers: input.shift ? 8 : 0,
        });
      } else if (input.type === 'wheel')
        await page('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: input.x,
          y: input.y,
          deltaX: input.deltaX,
          deltaY: input.deltaY,
        });
      else
        await page('Input.dispatchMouseEvent', {
          type: input.action === 'down' ? 'mousePressed' : 'mouseReleased',
          x: input.x,
          y: input.y,
          button: input.button,
          clickCount: 1,
        });
    } else throw new Error('Unsupported browser command.');
  };
}
const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
let handler: Awaited<ReturnType<typeof start>> | undefined;
let processing = Promise.resolve(),
  queued = 0;
lines.on('line', (raw) => {
  if (raw.length > 65536 || ++queued > 128) {
    emit({type: 'fatal'});
    process.exit(1);
  }
  processing = processing.then(async () => {
    let request: any;
    try {
      request = JSON.parse(raw);
      if (!handler) handler = await start(request);
      else {
        await handler(request);
        emit({type: 'reply', id: request.id, ok: true});
      }
    } catch {
      emit({type: handler ? 'reply' : 'fatal', id: request?.id, ok: false});
      if (!handler) process.exit(1);
    } finally {
      queued--;
    }
  });
});
lines.on('close', () => process.exit(0));
