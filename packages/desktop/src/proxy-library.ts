import {randomUUID} from 'node:crypto';
import type Database from 'better-sqlite3-multiple-ciphers';
import {z, type ProxyPool, type ProxyRouteDraft, type PublicProxyRoute} from '@ecdys/shared';
import {WorkspaceError} from './errors';
import {seal, subkey, unseal, type Sealed} from './crypto';
import {parseProxyImport, publicProxy} from './route-import';

interface EndpointRow {
  id: string;
  pool_id: string;
  route: string;
  credential: string | null;
}
export function routeIdentity(route: PublicProxyRoute | ProxyRouteDraft): string {
  return JSON.stringify([
    route.kind,
    route.host.toLowerCase(),
    route.port,
    route.username || '',
    route.kind === 'http_connect' ? route.tlsToProxy : true,
  ]);
}
export class ProxyLibrary {
  constructor(
    private readonly db: Database.Database,
    private readonly master: Buffer,
  ) {}
  list(): ProxyPool[] {
    return (
      this.db.prepare('SELECT id FROM proxy_pools ORDER BY created_at, id').all() as {id: string}[]
    ).map(({id}) => this.pool(id));
  }
  pool(id: string): ProxyPool {
    const row = this.db.prepare('SELECT * FROM proxy_pools WHERE id = ?').get(id) as
      | {id: string; name: string; revision: number; created_at: number}
      | undefined;
    if (!row) throw new WorkspaceError('POOL_NOT_FOUND', 'The proxy pool no longer exists.');
    return {
      id: row.id,
      name: row.name,
      revision: row.revision,
      createdAt: row.created_at,
      endpoints: (
        this.db
          .prepare('SELECT * FROM proxy_endpoints WHERE pool_id = ? ORDER BY ordinal')
          .all(id) as EndpointRow[]
      ).map((endpoint) => ({
        id: endpoint.id,
        route: JSON.parse(endpoint.route) as PublicProxyRoute,
      })),
    };
  }
  import(input: {name: string; source: string}): ProxyPool {
    const name = z.string().trim().min(1).max(80).parse(input.name);
    let routes: ProxyRouteDraft[];
    try {
      routes = parseProxyImport(input.source);
    } catch {
      throw new WorkspaceError(
        'INVALID_PROXY_IMPORT',
        'Fix the invalid proxy entries before importing.',
      );
    }
    const {count} = this.db.prepare('SELECT COUNT(*) AS count FROM proxy_pools').get() as {
      count: number;
    };
    const {count: endpointCount} = this.db
      .prepare('SELECT COUNT(*) AS count FROM proxy_endpoints')
      .get() as {count: number};
    if (count >= 20 || endpointCount + routes.length > 1000)
      throw new WorkspaceError(
        'PROXY_LIBRARY_FULL',
        'This vault supports 20 pools and 1,000 saved endpoints.',
      );
    if (this.db.prepare('SELECT id FROM proxy_pools WHERE name = ? COLLATE NOCASE').get(name))
      throw new WorkspaceError('POOL_NAME_EXISTS', 'A proxy pool with this name already exists.');
    const poolId = randomUUID();
    const key = subkey(this.master, 'ecdys:proxy-library:1');
    try {
      this.db.transaction(() => {
        this.db
          .prepare('INSERT INTO proxy_pools VALUES (?, ?, 1, ?)')
          .run(poolId, name, Date.now());
        for (const [ordinal, route] of routes.entries()) {
          const id = randomUUID();
          let credential: string | null = null;
          if (route.password) {
            const bytes = Buffer.from(route.password);
            try {
              credential = JSON.stringify(seal(bytes, key, 'ecdys:proxyendpoint:1:' + id));
            } finally {
              bytes.fill(0);
            }
          }
          this.db
            .prepare('INSERT INTO proxy_endpoints VALUES (?, ?, ?, ?, ?)')
            .run(id, poolId, ordinal, JSON.stringify(publicProxy(route)), credential);
        }
      })();
    } finally {
      key.fill(0);
    }
    return this.pool(poolId);
  }
  draft(id: string): ProxyRouteDraft {
    const row = this.db.prepare('SELECT * FROM proxy_endpoints WHERE id = ?').get(id) as
      | EndpointRow
      | undefined;
    if (!row)
      throw new WorkspaceError('ENDPOINT_NOT_FOUND', 'The saved proxy endpoint no longer exists.');
    const {hasPassword: _hasPassword, ...route} = JSON.parse(row.route) as PublicProxyRoute;
    if (!row.credential) return route;
    const key = subkey(this.master, 'ecdys:proxy-library:1');
    let plaintext: Buffer | undefined;
    try {
      plaintext = unseal(JSON.parse(row.credential) as Sealed, key, 'ecdys:proxyendpoint:1:' + id);
      return {...route, password: plaintext.toString('utf8')};
    } finally {
      plaintext?.fill(0);
      key.fill(0);
    }
  }
  delete(id: string, revision: number) {
    const pool = this.pool(id);
    if (pool.revision !== revision)
      throw new WorkspaceError(
        'REVISION_CONFLICT',
        'This proxy pool changed. Reload it before deleting.',
      );
    this.db.prepare('DELETE FROM proxy_pools WHERE id = ?').run(id);
  }
}
