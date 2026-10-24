import {createHash, randomBytes, randomInt, randomUUID} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  chmodSync,
  statSync,
  readdirSync,
  openSync,
  closeSync,
  fsyncSync,
} from 'node:fs';
import {join} from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import Database from 'better-sqlite3-multiple-ciphers';
import {
  ProfileDraftSchema,
  VaultSetupSchema,
  ProxyChangeSchema,
  initialResearch,
  type ResearchDraft,
  type ResearchWorkspace,
  type ProxyChange,
  type ProxyChangeResult,
  type ProxyPool,
  type ProxyDiagnostic,
  type ProxyImportPreview,
  type ProxyRouteDraft,
  type Profile,
  type ProfileDraft,
  type PublicRoute,
  type Snapshot,
  type SnapshotTrigger,
  type VaultStatus,
} from '@ecdys/shared';
import {deriveKeyInWorker, seal, subkey, unseal, type Sealed} from './crypto';
import {WorkspaceError} from './errors';
import {ProxyLibrary, routeIdentity} from './proxy-library';
import {previewProxyImport} from './route-import';
import {probeProxy} from './proxy-probe';
import {ResearchLibrary} from './research';
export {WorkspaceError} from './errors';
interface VaultHeader {
  format: 1;
  salt: string;
  memoryMiB: number;
  master: Sealed;
  localId: string;
  createdAt: number;
}
type Config = {
  name: string;
  tags: string[];
  folder: string;
  policy: Profile['policy'];
  timezone: string;
  route: (PublicRoute & {secretRef?: string}) | null;
};
interface ProfileRow {
  id: string;
  config: string;
  revision: number;
  created_at: number;
  updated_at: number;
  parent_id: string | null;
  branch_name: string | null;
}
interface SnapshotRow {
  id: string;
  profile_id: string;
  trigger: SnapshotTrigger;
  captured_at: number;
  revision: number;
  config: string;
  hash: string;
  bytes: number;
  pinned: number;
}
interface Options {
  directory: string;
  profileLimit?: number;
  deriveKey?: (passphrase: string, salt: Buffer, memoryMiB: number) => Promise<Buffer>;
}

export class WorkspaceService {
  private db: Database.Database | null = null;
  private master: Buffer | null = null;
  private pending: Promise<unknown> = Promise.resolve();
  private createdFiles: string[] = [];
  private warnings = new Set<string>();
  private diagnosticEpoch = 0;
  private diagnostics = new Set<AbortController>();
  private browserLease?: {profileId: string; controller: AbortController};
  private readonly directory: string;
  private readonly limit: number;
  private readonly deriveKey: NonNullable<Options['deriveKey']>;
  constructor(options: Options) {
    this.directory = options.directory;
    this.limit = options.profileLimit ?? 10;
    if (!Number.isInteger(this.limit) || this.limit < 1 || this.limit > 99)
      throw new Error('Invalid profile limit.');
    this.deriveKey = options.deriveKey ?? deriveKeyInWorker;
  }
  private serial<T>(work: () => T | Promise<T>): Promise<T> {
    const result = this.pending.then(work);
    this.pending = result.catch(() => undefined);
    return result;
  }
  private header(): VaultHeader {
    const parsed = JSON.parse(
      readFileSync(
        join(
          this.directory,
          existsSync(join(this.directory, 'vault.json')) ? 'vault.json' : 'vault.json.tmp',
        ),
        'utf8',
      ),
    ) as VaultHeader;
    if (parsed.format !== 1 || ![1024, 2048, 4096, 8192].includes(parsed.memoryMiB))
      throw new WorkspaceError('VAULT_INVALID', 'Unsupported vault format.');
    return parsed;
  }
  status(): Promise<VaultStatus> {
    return this.serial(() => {
      const finalHeader = existsSync(join(this.directory, 'vault.json'));
      const exists =
        finalHeader ||
        existsSync(join(this.directory, 'vault.json.tmp')) ||
        existsSync(join(this.directory, 'workspace.sqlite'));
      let header: VaultHeader | undefined;
      try {
        if (exists) header = this.header();
      } catch {}
      const databasePath = join(this.directory, 'workspace.sqlite');
      const databasePresent =
        existsSync(databasePath) &&
        statSync(databasePath).isFile() &&
        statSync(databasePath).size > 0;
      return {
        exists,
        unlocked: this.db !== null,
        profileLimit: this.limit,
        memoryMiB: header?.memoryMiB,
        recoveryRequired: exists && (!finalHeader || !header || !databasePresent),
        storageWarnings: this.db ? [...this.warnings] : [],
        ...(this.db && header ? {localId: header.localId, createdAt: header.createdAt} : {}),
      };
    });
  }
  async create(input: {passphrase: string; memoryMiB?: number}): Promise<void> {
    return this.serial(async () => {
      const setup = VaultSetupSchema.parse(input);
      if (
        existsSync(join(this.directory, 'vault.json')) ||
        existsSync(join(this.directory, 'workspace.sqlite')) ||
        existsSync(join(this.directory, 'vault.json.tmp'))
      )
        throw new WorkspaceError('VAULT_EXISTS', 'A vault already exists.');
      mkdirSync(this.directory, {recursive: true, mode: 0o700});
      mkdirSync(join(this.directory, 'snapshots'), {recursive: true, mode: 0o700});
      const salt = randomBytes(16),
        master = randomBytes(32);
      let key: Buffer | undefined;
      let database: Database.Database | undefined;
      try {
        key = await this.deriveKey(setup.passphrase, salt, setup.memoryMiB);
        const header: VaultHeader = {
          format: 1,
          salt: salt.toString('base64'),
          memoryMiB: setup.memoryMiB,
          master: seal(master, key, 'ecdys:vault:1'),
          localId: Array.from({length: 16}, () => randomInt(10)).join(''),
          createdAt: Date.now(),
        };
        writeFileSync(join(this.directory, 'vault.json.tmp'), JSON.stringify(header), {
          mode: 0o600,
          flag: 'wx',
          flush: true,
        });
        this.syncDirectory(this.directory);
        database = this.open(master, 'create');
        database.pragma('wal_checkpoint(FULL)');
        renameSync(join(this.directory, 'vault.json.tmp'), join(this.directory, 'vault.json'));
        this.syncDirectory(this.directory);
        this.db = database;
        this.master = master;
        this.reconcileSnapshots();
      } catch (error) {
        database?.close();
        this.db = null;
        this.master = null;
        master.fill(0);
        throw error;
      } finally {
        key?.fill(0);
      }
    });
  }
  unlock(passphrase: string): Promise<void> {
    return this.serial(async () => {
      if (this.db) return;
      let key: Buffer | undefined;
      let master: Buffer | undefined;
      let database: Database.Database | undefined;
      try {
        if (passphrase.length > 1024) throw new Error('Invalid input');
        const header = this.header();
        key = await this.deriveKey(
          passphrase,
          Buffer.from(header.salt, 'base64'),
          header.memoryMiB,
        );
        master = unseal(header.master, key, 'ecdys:vault:1');
        database = this.open(master, 'existing');
        if (!existsSync(join(this.directory, 'vault.json'))) {
          renameSync(join(this.directory, 'vault.json.tmp'), join(this.directory, 'vault.json'));
          this.syncDirectory(this.directory);
        }
        this.db = database;
        this.master = master;
        this.reconcileSnapshots();
      } catch (error) {
        if (database && database !== this.db) database.close();
        this.closeData();
        master?.fill(0);
        if (
          error instanceof WorkspaceError &&
          ['VAULT_RECOVERY_REQUIRED', 'RESEARCH_RECOVERY_REQUIRED'].includes(error.code)
        )
          throw error;
        throw new WorkspaceError(
          'UNLOCK_FAILED',
          'Could not unlock the vault. Check your passphrase and vault files.',
        );
      } finally {
        key?.fill(0);
      }
    });
  }
  lock(): Promise<void> {
    return this.serial(() => this.closeData());
  }
  private closeData() {
    this.browserLease?.controller.abort();
    this.browserLease = undefined;
    this.diagnosticEpoch++;
    for (const controller of this.diagnostics) controller.abort();
    this.diagnostics.clear();
    const db = this.db;
    this.db = null;
    db?.close();
    this.master?.fill(0);
    this.master = null;
  }
  private open(master: Buffer, mode: 'create' | 'existing'): Database.Database {
    const databasePath = join(this.directory, 'workspace.sqlite');
    if (
      mode === 'existing' &&
      (!existsSync(databasePath) ||
        !statSync(databasePath).isFile() ||
        statSync(databasePath).size === 0)
    ) {
      throw new WorkspaceError(
        'VAULT_RECOVERY_REQUIRED',
        'The vault database is missing or incomplete. Restore your backup; no replacement was created.',
      );
    }
    const db = new Database(databasePath, {fileMustExist: mode === 'existing'});
    const key = subkey(master, 'ecdys:database:1');
    try {
      db.pragma("cipher = 'sqlcipher'");
      db.pragma('legacy = 4');
      db.key(key);
      db.pragma('foreign_keys = ON');
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
      if (mode === 'create')
        db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY, config TEXT NOT NULL, revision INTEGER NOT NULL,
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          parent_id TEXT REFERENCES profiles(id) ON DELETE SET NULL, branch_name TEXT
        );
        CREATE TABLE IF NOT EXISTS secrets (
          id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          envelope TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS snapshots (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          trigger TEXT NOT NULL, captured_at INTEGER NOT NULL, revision INTEGER NOT NULL,
          config TEXT NOT NULL, hash TEXT NOT NULL, bytes INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0
        );
        PRAGMA user_version = 1;
      `);
      if (mode === 'existing') {
        const version = db.pragma('user_version', {simple: true});
        const tables = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('profiles','secrets','snapshots')",
          )
          .all();
        if (
          ![1, 2, 3].includes(Number(version)) ||
          tables.length !== 3 ||
          db.pragma('quick_check', {simple: true}) !== 'ok'
        ) {
          throw new WorkspaceError(
            'VAULT_RECOVERY_REQUIRED',
            'The database schema is unsupported or incomplete. Its contents were preserved.',
          );
        }
        if (
          Number(version) >= 2 &&
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('proxy_pools','proxy_endpoints')",
            )
            .all().length !== 2
        )
          throw new WorkspaceError(
            'VAULT_RECOVERY_REQUIRED',
            'The proxy library schema is incomplete. Restore your backup.',
          );
        if (
          version === 3 &&
          !db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='research_workspace'",
            )
            .get()
        )
          throw new WorkspaceError(
            'VAULT_RECOVERY_REQUIRED',
            'The research schema is incomplete. Restore your backup; its contents were preserved.',
          );
      }
      if (db.pragma('user_version', {simple: true}) === 1)
        db.transaction(() =>
          db.exec(`
        CREATE TABLE proxy_pools (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, revision INTEGER NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE proxy_endpoints (id TEXT PRIMARY KEY, pool_id TEXT NOT NULL REFERENCES proxy_pools(id) ON DELETE CASCADE, ordinal INTEGER NOT NULL, route TEXT NOT NULL, credential TEXT);
        CREATE INDEX proxy_endpoint_pool ON proxy_endpoints(pool_id, ordinal);
        PRAGMA user_version = 2;
      `),
        )();
      if (db.pragma('user_version', {simple: true}) === 2)
        db.transaction(() => {
          db.exec(
            `CREATE TABLE research_workspace (id INTEGER PRIMARY KEY CHECK(id = 1), document TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0), updated_at INTEGER NOT NULL);`,
          );
          db.prepare('INSERT INTO research_workspace VALUES (1, ?, 1, ?)').run(
            JSON.stringify(initialResearch()),
            Date.now(),
          );
          db.pragma('user_version = 3');
        })();
      new ResearchLibrary(db).read();
      chmodSync(join(this.directory, 'workspace.sqlite'), 0o600);
      return db;
    } catch (error) {
      db.close();
      master.fill(0);
      throw error;
    } finally {
      key.fill(0);
    }
  }
  private syncDirectory(path: string) {
    if (process.platform === 'win32') {
      this.warnings.add(
        'Directory publication durability is not yet verified on Windows. Native storage support remains a release gate.',
      );
      return;
    }
    const descriptor = openSync(path, 'r');
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  }
  private cleanupFile(path: string) {
    try {
      unlinkSync(path);
      this.syncDirectory(join(this.directory, 'snapshots'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.warnings.add(
          'Some unreferenced snapshot files could not be removed. Cleanup will retry when the vault is reopened.',
        );
      }
    }
  }
  private reconcileSnapshots() {
    this.warnings.clear();
    const path = join(this.directory, 'snapshots');
    if (!existsSync(path)) {
      mkdirSync(path, {mode: 0o700});
      this.syncDirectory(this.directory);
    }
    const expected = new Set(
      (this.database().prepare('SELECT id FROM snapshots').all() as {id: string}[]).map(
        (row) => row.id + '.enc',
      ),
    );
    const files = readdirSync(path);
    for (const name of expected) {
      if (!files.includes(name))
        this.warnings.add(
          'Some configuration checkpoint files are missing. Restore them from backup before relying on recovery.',
        );
    }
    for (const name of files) {
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/i.test(name) &&
        !expected.has(name)
      )
        this.cleanupFile(join(path, name));
    }
    for (const {id} of this.database().prepare('SELECT id FROM profiles').all() as {id: string}[])
      this.prune(id);
    this.syncDirectory(path);
  }
  private database(): Database.Database {
    if (!this.db || !this.master)
      throw new WorkspaceError('VAULT_LOCKED', 'Unlock your workspace first.');
    return this.db;
  }
  private row(id: string): ProfileRow {
    const row = this.database().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as
      | ProfileRow
      | undefined;
    if (!row) throw new WorkspaceError('PROFILE_NOT_FOUND', 'Profile not found.');
    return row;
  }
  private publicConfig(config: Config): Snapshot['config'] {
    const safe = structuredClone(config);
    if (safe.route) delete safe.route.secretRef;
    return safe;
  }
  private profile(row: ProfileRow): Profile {
    const stats = this.database()
      .prepare(
        'SELECT COUNT(*) AS count, MAX(captured_at) AS last FROM snapshots WHERE profile_id = ?',
      )
      .get(row.id) as {count: number; last: number};
    return {
      ...this.publicConfig(JSON.parse(row.config)),
      id: row.id,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      parentProfileId: row.parent_id,
      branchName: row.branch_name,
      snapshotCount: stats.count,
      lastSnapshotAt: stats.last,
    };
  }
  private transaction<T>(work: () => T): T {
    const db = this.database();
    this.createdFiles = [];
    try {
      return db.transaction(work)();
    } catch (error) {
      for (const file of this.createdFiles) this.cleanupFile(file);
      throw error;
    } finally {
      this.createdFiles = [];
    }
  }
  private checkLimit() {
    const {count} = this.database().prepare('SELECT COUNT(*) AS count FROM profiles').get() as {
      count: number;
    };
    if (count >= this.limit)
      throw new WorkspaceError(
        'PROFILE_LIMIT',
        'Your current local allowance is full. Export or remove a profile.',
      );
  }
  private checkRevision(row: ProfileRow, revision: number) {
    if (this.browserLease?.profileId === row.id)
      throw new WorkspaceError(
        'BROWSER_ACTIVE',
        'Close the temporary browser before changing its profile or route.',
      );
    if (row.revision !== revision)
      throw new WorkspaceError(
        'REVISION_CONFLICT',
        'This profile changed. Reload it before editing.',
      );
  }
  private secret(profileId: string, password: string): string {
    const id = randomUUID(),
      key = subkey(this.master!, 'ecdys:secrets:1');
    try {
      this.database()
        .prepare('INSERT INTO secrets VALUES (?, ?, ?)')
        .run(id, profileId, JSON.stringify(seal(Buffer.from(password), key, id)));
      return id;
    } finally {
      key.fill(0);
    }
  }
  private config(profileId: string, input: ProfileDraft, previous?: Config): Config {
    const parsed = ProfileDraftSchema.parse(input);
    if (!parsed.route) return {...parsed, route: null};
    if (parsed.route.kind === 'vpn') return {...parsed, route: parsed.route};
    const {password, clearPassword, ...route} = parsed.route;
    let secretRef: string | undefined;
    if (password) secretRef = this.secret(profileId, password);
    else if (
      !clearPassword &&
      previous?.route &&
      previous.route.kind === route.kind &&
      'host' in previous.route &&
      previous.route.host === route.host &&
      previous.route.port === route.port &&
      previous.route.username === route.username
    )
      secretRef = previous.route.secretRef;
    return {
      ...parsed,
      route: {...route, hasPassword: Boolean(secretRef), ...(secretRef ? {secretRef} : {})},
    };
  }
  private capture(row: ProfileRow, trigger: SnapshotTrigger) {
    const id = randomUUID(),
      key = randomBytes(32),
      wrappingKey = subkey(this.master!, 'ecdys:snapshots:1');
    const context = 'ecdys:snapshot:1:' + row.id + ':' + id;
    try {
      const payload = seal(gzipSync(Buffer.from(row.config), {level: 9}), key, context);
      const envelope = Buffer.from(
        JSON.stringify({
          format: 1,
          profileId: row.id,
          id,
          key: seal(key, wrappingKey, context + ':key'),
          payload,
        }),
      );
      const path = join(this.directory, 'snapshots', id + '.enc');
      writeFileSync(path, envelope, {mode: 0o600, flag: 'wx', flush: true});
      this.createdFiles.push(path);
      this.syncDirectory(join(this.directory, 'snapshots'));
      this.database()
        .prepare(
          'INSERT INTO snapshots(id, profile_id, trigger, captured_at, revision, config, hash, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          row.id,
          trigger,
          Date.now(),
          row.revision,
          row.config,
          createHash('sha256').update(envelope).digest('hex'),
          envelope.length,
        );
      return id;
    } finally {
      key.fill(0);
      wrappingKey.fill(0);
    }
  }
  private readSnapshot(snapshot: SnapshotRow): Config {
    let key: Buffer | undefined;
    const wrappingKey = subkey(this.master!, 'ecdys:snapshots:1');
    try {
      const bytes = readFileSync(join(this.directory, 'snapshots', snapshot.id + '.enc'));
      if (
        bytes.length > 1_000_000 ||
        createHash('sha256').update(bytes).digest('hex') !== snapshot.hash
      )
        throw new Error('Integrity mismatch');
      const envelope = JSON.parse(bytes.toString()) as {
        format: number;
        profileId: string;
        id: string;
        key: Sealed;
        payload: Sealed;
      };
      if (
        envelope.format !== 1 ||
        envelope.profileId !== snapshot.profile_id ||
        envelope.id !== snapshot.id
      )
        throw new Error('Identity mismatch');
      const context = 'ecdys:snapshot:1:' + snapshot.profile_id + ':' + snapshot.id;
      key = unseal(envelope.key, wrappingKey, context + ':key');
      return JSON.parse(
        gunzipSync(unseal(envelope.payload, key, context), {
          maxOutputLength: 128 * 1024,
        }).toString(),
      ) as Config;
    } catch {
      throw new WorkspaceError(
        'SNAPSHOT_INVALID',
        'The snapshot failed integrity verification. Your current profile was preserved.',
      );
    } finally {
      key?.fill(0);
      wrappingKey.fill(0);
    }
  }
  private prune(profileId: string) {
    // Retention follows a durable commit. A cleanup failure must never turn an
    // already-applied edit into a reported failure (or invite a second rotation).
    let removed = 0;
    try {
      const obsolete = this.database()
        .prepare(
          'SELECT id FROM snapshots WHERE profile_id = ? AND pinned = 0 ORDER BY sequence DESC LIMIT -1 OFFSET 20',
        )
        .all(profileId) as {id: string}[];
      for (const {id} of obsolete) {
        this.database().prepare('DELETE FROM snapshots WHERE id = ?').run(id);
        removed++;
        this.cleanupFile(join(this.directory, 'snapshots', id + '.enc'));
      }
    } catch {
      this.warnings.add(
        'Checkpoint retention cleanup could not finish. Committed changes are saved; older checkpoints were retained. Cleanup will retry at the next unlock.',
      );
    }
    return removed;
  }
  researchWorkspace(): Promise<ResearchWorkspace> {
    return this.serial(() => new ResearchLibrary(this.database()).read());
  }
  saveResearchWorkspace(input: {
    revision: number;
    draft: ResearchDraft;
  }): Promise<ResearchWorkspace> {
    return this.serial(() => new ResearchLibrary(this.database()).save(input));
  }
  listProfiles(): Promise<Profile[]> {
    return this.serial(() =>
      (
        this.database()
          .prepare('SELECT * FROM profiles ORDER BY created_at, id')
          .all() as ProfileRow[]
      ).map((row) => this.profile(row)),
    );
  }
  private library(): ProxyLibrary {
    return new ProxyLibrary(this.database(), this.master!);
  }
  previewProxyImport(source: string): Promise<ProxyImportPreview> {
    return this.serial(() => {
      this.database();
      return previewProxyImport(source);
    });
  }
  listProxyPools(): Promise<ProxyPool[]> {
    return this.serial(() => this.library().list());
  }
  importProxyPool(input: {name: string; source: string}): Promise<ProxyPool> {
    return this.serial(() => this.library().import(input));
  }
  deleteProxyPool(id: string, revision: number): Promise<void> {
    return this.serial(() => this.library().delete(id, revision));
  }
  async testProxyEndpoint(id: string): Promise<ProxyDiagnostic> {
    const context = await this.serial(() => {
      const library = this.library();
      if (this.diagnostics.size >= 3)
        throw new WorkspaceError('DIAGNOSTICS_BUSY', 'Wait for an active tunnel test to finish.');
      const route = library.draft(id),
        controller = new AbortController();
      this.diagnostics.add(controller);
      return {route, controller, epoch: this.diagnosticEpoch};
    });
    try {
      const report = await probeProxy(context.route, {signal: context.controller.signal});
      return await this.serial(() => {
        this.database();
        if (context.epoch !== this.diagnosticEpoch)
          throw new WorkspaceError(
            'VAULT_LOCKED',
            'The workspace was locked during this diagnostic.',
          );
        return {endpointId: id, ...report};
      });
    } finally {
      delete context.route.password;
      this.diagnostics.delete(context.controller);
    }
  }
  prepareTemporaryBrowser(id: string, revision: number) {
    return this.serial(() => {
      const row = this.row(id);
      this.checkRevision(row, revision);
      if (this.browserLease)
        throw new WorkspaceError('BROWSER_ACTIVE', 'Close the current temporary browser first.');
      const config = JSON.parse(row.config) as Config;
      if (!config.route || config.route.kind === 'vpn')
        throw new WorkspaceError(
          'PROXY_REQUIRED',
          'Select an authenticated SOCKS5 or HTTP CONNECT route for this browser.',
        );
      if (config.policy !== 'standard')
        throw new WorkspaceError(
          'POLICY_UNAVAILABLE',
          'Protected execution needs persistent browser recovery. Use a Standard profile for temporary browsing.',
        );
      const {secretRef, hasPassword, ...publicRoute} = config.route;
      const route: ProxyRouteDraft = {...publicRoute};
      if (hasPassword) {
        if (!secretRef)
          throw new WorkspaceError('SECRET_MISSING', 'The saved proxy credential is missing.');
        const secret = this.database()
          .prepare('SELECT envelope FROM secrets WHERE id = ? AND profile_id = ?')
          .get(secretRef, id) as {envelope: string} | undefined;
        if (!secret)
          throw new WorkspaceError('SECRET_MISSING', 'The saved proxy credential is missing.');
        const key = subkey(this.master!, 'ecdys:secrets:1');
        try {
          const plaintext = unseal(JSON.parse(secret.envelope), key, secretRef);
          try {
            route.password = plaintext.toString();
          } finally {
            plaintext.fill(0);
          }
        } finally {
          key.fill(0);
        }
      }
      this.transaction(() => this.capture(row, 'auto_pre_launch'));
      this.prune(id);
      const lease = {profileId: id, controller: new AbortController()};
      this.browserLease = lease;
      return {
        profile: this.profile(this.row(id)),
        route,
        signal: lease.controller.signal,
        release: () =>
          this.serial(() => {
            if (this.browserLease === lease) this.browserLease = undefined;
          }),
      };
    });
  }
  changeProxyRoutes(input: ProxyChange): Promise<ProxyChangeResult[]> {
    return this.serial(() => {
      const request = ProxyChangeSchema.parse(input);
      const library = this.library();
      const endpoints =
        request.choice.mode === 'assign'
          ? [{id: request.choice.endpointId, route: library.draft(request.choice.endpointId)}]
          : library.pool(request.choice.poolId).endpoints;
      return request.targets.map((target): ProxyChangeResult => {
        try {
          const result = this.transaction(() => {
            const row = this.row(target.id);
            this.checkRevision(row, target.revision);
            const previous = JSON.parse(row.config) as Config;
            let endpoint = endpoints[0]!;
            if (request.choice.mode === 'rotate') {
              const current =
                previous.route && previous.route.kind !== 'vpn'
                  ? routeIdentity(previous.route)
                  : null;
              const index = endpoints.findIndex((entry) => routeIdentity(entry.route) === current);
              const candidate = Array.from(
                {length: endpoints.length},
                (_, offset) => endpoints[(index + offset + 1) % endpoints.length]!,
              ).find((entry) => routeIdentity(entry.route) !== current);
              if (!candidate)
                throw new WorkspaceError(
                  'NO_ALTERNATIVE_ROUTE',
                  'This pool has no different endpoint for this profile.',
                );
              endpoint = candidate;
            }
            const config = this.config(row.id, {...previous, route: library.draft(endpoint.id)});
            this.capture(row, 'auto_edit');
            this.database()
              .prepare(
                'UPDATE profiles SET config = ?, revision = revision + 1, updated_at = ? WHERE id = ?',
              )
              .run(JSON.stringify(config), Date.now(), row.id);
            return this.profile(this.row(row.id));
          });
          const removed = this.prune(result.id);
          return {
            profileId: result.id,
            ok: true,
            profile: {...result, snapshotCount: result.snapshotCount - removed},
          };
        } catch (error) {
          return {
            profileId: target.id,
            ok: false,
            error:
              error instanceof WorkspaceError
                ? {code: error.code, message: error.message}
                : {
                    code: 'ROUTE_CHANGE_FAILED',
                    message: 'The route change could not be committed. Check workspace storage.',
                  },
          };
        }
      });
    });
  }
  createProfile(input: ProfileDraft): Promise<Profile> {
    return this.serial(() =>
      this.transaction(() => {
        const parsed = ProfileDraftSchema.parse(input);
        this.checkLimit();
        const id = randomUUID(),
          now = Date.now();
        this.database()
          .prepare('INSERT INTO profiles VALUES (?, ?, 1, ?, ?, NULL, NULL)')
          .run(id, '{}', now, now);
        const config = this.config(id, parsed);
        this.database()
          .prepare('UPDATE profiles SET config = ? WHERE id = ?')
          .run(JSON.stringify(config), id);
        const row = this.row(id);
        this.capture(row, 'baseline');
        return this.profile(row);
      }),
    );
  }
  updateProfile(id: string, revision: number, input: ProfileDraft): Promise<Profile> {
    return this.serial(() => {
      const result = this.transaction(() => {
        const row = this.row(id);
        this.checkRevision(row, revision);
        const config = this.config(id, input, JSON.parse(row.config));
        this.capture(row, 'auto_edit');
        this.database()
          .prepare(
            'UPDATE profiles SET config = ?, revision = revision + 1, updated_at = ? WHERE id = ?',
          )
          .run(JSON.stringify(config), Date.now(), id);
        return this.profile(this.row(id));
      });
      this.prune(id);
      return this.profile(this.row(result.id));
    });
  }
  listSnapshots(id: string): Promise<Snapshot[]> {
    return this.serial(() => {
      this.row(id);
      return (
        this.database()
          .prepare('SELECT * FROM snapshots WHERE profile_id = ? ORDER BY sequence DESC')
          .all(id) as SnapshotRow[]
      ).map((row) => ({
        id: row.id,
        profileId: row.profile_id,
        trigger: row.trigger,
        capturedAt: row.captured_at,
        revision: row.revision,
        pinned: Boolean(row.pinned),
        bytes: row.bytes,
        scope: 'config',
        config: this.publicConfig(JSON.parse(row.config)),
      }));
    });
  }
  restoreSnapshot(profileId: string, snapshotId: string, revision: number): Promise<Profile> {
    return this.serial(() => {
      const result = this.transaction(() => {
        const row = this.row(profileId);
        this.checkRevision(row, revision);
        const snapshot = this.database()
          .prepare('SELECT * FROM snapshots WHERE id = ? AND profile_id = ?')
          .get(snapshotId, profileId) as SnapshotRow | undefined;
        if (!snapshot) throw new WorkspaceError('SNAPSHOT_NOT_FOUND', 'Snapshot not found.');
        const config = this.readSnapshot(snapshot);
        this.capture(row, 'auto_pre_restore');
        this.database()
          .prepare(
            'UPDATE profiles SET config = ?, revision = revision + 1, updated_at = ? WHERE id = ?',
          )
          .run(JSON.stringify(config), Date.now(), profileId);
        return this.profile(this.row(profileId));
      });
      this.prune(profileId);
      return this.profile(this.row(result.id));
    });
  }
  async createSnapshot(profileId: string): Promise<Snapshot[]> {
    await this.serial(() => {
      this.transaction(() => this.capture(this.row(profileId), 'manual'));
      this.prune(profileId);
    });
    return this.listSnapshots(profileId);
  }
  pinSnapshot(snapshotId: string, pinned: boolean): Promise<void> {
    return this.serial(() => {
      this.database()
        .prepare('UPDATE snapshots SET pinned = ? WHERE id = ?')
        .run(Number(pinned), snapshotId);
    });
  }
  branchProfile(parentId: string, name: string): Promise<Profile> {
    return this.serial(() => {
      const result = this.transaction(() => {
        if (!name.trim() || name.length > 80)
          throw new WorkspaceError('INVALID_INPUT', 'Use a branch name of 1–80 characters.');
        this.checkLimit();
        const parent = this.row(parentId),
          id = randomUUID(),
          now = Date.now();
        const config = JSON.parse(parent.config) as Config;
        config.name = (config.name + ' / ' + name.trim()).slice(0, 120);
        this.database()
          .prepare('INSERT INTO profiles VALUES (?, ?, 1, ?, ?, ?, ?)')
          .run(id, '{}', now, now, parentId, name.trim());
        const secretCopies = new Map<string, string>();
        const copySecret = (source: Config): Config => {
          const copy = structuredClone(source),
            oldRef = copy.route?.secretRef;
          if (oldRef && copy.route) {
            if (!secretCopies.has(oldRef)) {
              const row = this.database()
                .prepare('SELECT envelope FROM secrets WHERE id = ?')
                .get(oldRef) as {envelope: string};
              const key = subkey(this.master!, 'ecdys:secrets:1');
              try {
                const plaintext = unseal(JSON.parse(row.envelope), key, oldRef);
                try {
                  secretCopies.set(oldRef, this.secret(id, plaintext.toString()));
                } finally {
                  plaintext.fill(0);
                }
              } finally {
                key.fill(0);
              }
            }
            copy.route.secretRef = secretCopies.get(oldRef);
          }
          return copy;
        };
        const inherited = this.database()
          .prepare('SELECT * FROM snapshots WHERE profile_id = ? ORDER BY sequence')
          .all(parentId) as SnapshotRow[];
        for (const snapshot of inherited) {
          const inheritedConfig = copySecret(this.readSnapshot(snapshot));
          const copiedId = this.capture(
            {...parent, id, revision: snapshot.revision, config: JSON.stringify(inheritedConfig)},
            snapshot.trigger,
          );
          this.database()
            .prepare('UPDATE snapshots SET pinned = ?, captured_at = ? WHERE id = ?')
            .run(snapshot.pinned, snapshot.captured_at, copiedId);
        }
        this.database()
          .prepare('UPDATE profiles SET config = ? WHERE id = ?')
          .run(JSON.stringify(copySecret(config)), id);
        this.capture(this.row(id), 'baseline');
        return this.profile(this.row(id));
      });
      this.prune(result.id);
      return this.profile(this.row(result.id));
    });
  }
  deleteProfile(id: string, revision: number): Promise<void> {
    return this.serial(() => {
      const paths: string[] = [];
      this.transaction(() => {
        const row = this.row(id);
        this.checkRevision(row, revision);
        for (const snapshot of this.database()
          .prepare('SELECT id FROM snapshots WHERE profile_id = ?')
          .all(id) as {id: string}[])
          paths.push(join(this.directory, 'snapshots', snapshot.id + '.enc'));
        this.database().prepare('DELETE FROM profiles WHERE id = ?').run(id);
      });
      for (const path of paths) this.cleanupFile(path);
    });
  }
}
