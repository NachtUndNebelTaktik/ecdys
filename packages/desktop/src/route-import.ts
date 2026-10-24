import {isIP} from 'node:net';
import {
  ProxyRouteDraftSchema,
  type ProxyImportPreview,
  type ProxyRouteDraft,
  type PublicProxyRoute,
} from '@ecdys/shared';

export function publicProxy(route: ProxyRouteDraft): PublicProxyRoute {
  const {password, clearPassword: _clear, ...safe} = route;
  return {...safe, hasPassword: Boolean(password)};
}
function fromUri(source: string): unknown {
  const url = new URL(source);
  if (
    !['socks5:', 'socks5h:', 'http:', 'https:'].includes(url.protocol) ||
    (url.pathname && url.pathname !== '/') ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid proxy URI');
  // Explicit root slash is harmless; proxy URLs never describe a web path.
  return {
    kind: url.protocol.startsWith('socks5') ? 'socks5' : 'http_connect',
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(
      url.port || (url.protocol === 'https:' ? 443 : url.protocol === 'http:' ? 80 : 1080),
    ),
    ...(url.username ? {username: decodeURIComponent(url.username)} : {}),
    ...(url.password ? {password: decodeURIComponent(url.password)} : {}),
    ...(url.protocol.startsWith('socks5')
      ? {remoteDNS: true}
      : {tlsToProxy: url.protocol === 'https:'}),
  };
}
function inspect(source: string): {preview: ProxyImportPreview; routes: ProxyRouteDraft[]} {
  const preview: ProxyImportPreview = {
    valid: true,
    count: 0,
    duplicates: 0,
    entries: [],
    issues: [],
  };
  const routes: ProxyRouteDraft[] = [];
  const fail = (line: number, message: string) => {
    preview.valid = false;
    preview.issues.push({line, message});
  };
  if (Buffer.byteLength(source) > 131_072) {
    fail(0, 'Import is too large. Maximum 128 KiB.');
    return {preview, routes};
  }
  let rows: {line: number; value: unknown}[];
  try {
    if (source.trimStart().startsWith('[')) {
      const values: unknown = JSON.parse(source);
      if (!Array.isArray(values)) throw new Error();
      rows = values.map((value, index) => ({line: index + 1, value}));
    } else {
      rows = source
        .split(/\r?\n/)
        .map((value, index) => ({line: index + 1, value: value.trim()}))
        .filter(({value}) => value && !value.startsWith('#'));
    }
  } catch {
    fail(0, 'Enter a valid JSON array or one proxy URI per line.');
    return {preview, routes};
  }
  if (!rows.length || rows.length > 100) {
    fail(0, 'Import between 1 and 100 proxy entries.');
    return {preview, routes};
  }
  const seen = new Set<string>();
  for (const row of rows) {
    try {
      const route = ProxyRouteDraftSchema.parse(
        typeof row.value === 'string' ? fromUri(row.value) : row.value,
      );
      route.host = route.host.toLowerCase().replace(/^\[|\]$/g, '');
      if (!isIP(route.host) && !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(route.host))
        throw new Error();
      delete route.clearPassword;
      const identity = JSON.stringify([
        route.kind,
        route.host,
        route.port,
        route.username || '',
        route.password || '',
        route.kind === 'http_connect' ? route.tlsToProxy : true,
      ]);
      if (seen.has(identity)) {
        preview.duplicates++;
        continue;
      }
      seen.add(identity);
      routes.push(route);
      preview.entries.push({line: row.line, route: publicProxy(route)});
    } catch {
      fail(row.line, 'Invalid proxy entry. Check protocol, host, port and paired credentials.');
    }
  }
  preview.count = routes.length;
  return {preview, routes};
}
export function parseProxyImport(source: string): ProxyRouteDraft[] {
  const result = inspect(source);
  if (!result.preview.valid) throw new Error('Fix the invalid proxy entries before importing.');
  return result.routes;
}
export function previewProxyImport(source: string): ProxyImportPreview {
  return inspect(source).preview;
}
