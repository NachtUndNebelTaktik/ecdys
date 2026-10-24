import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, type Socket} from 'node:net';
import argon2 from 'argon2';
import Database from 'better-sqlite3-multiple-ciphers';
import {WorkspaceService} from './workspace';
import {subkey, unseal} from './crypto';

const directories: string[] = [];
const workspaces: WorkspaceService[] = [];
const phrase = 'a strong and memorable local passphrase';
const fastDerive = (passphrase: string, salt: Buffer) =>
  argon2.hash(passphrase, {
    type: argon2.argon2id,
    salt,
    memoryCost: 16 * 1024,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
    raw: true,
  });
async function fixture(limit = 10) {
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-test-'));
  directories.push(directory);
  const deriveKey = (passphrase: string, salt: Buffer) =>
    argon2.hash(passphrase, {
      type: argon2.argon2id,
      salt,
      memoryCost: 16 * 1024,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
      raw: true,
    });
  const service = new WorkspaceService({directory, profileLimit: limit, deriveKey});
  workspaces.push(service);
  await service.create({passphrase: phrase, memoryMiB: 1024});
  return {service, directory};
}
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  for (const workspace of workspaces.splice(0)) await workspace.lock();
  for (const directory of directories.splice(0))
    await rm(directory, {recursive: true, force: true});
});

describe('encrypted workspace lifecycle', () => {
  it.each(['missing', 'empty'])(
    'does not replace a %s database during unlock',
    async (condition) => {
      const {service, directory} = await fixture();
      await service.createProfile({name: 'Preserve this identity'});
      await service.lock();
      const path = join(directory, 'workspace.sqlite');
      if (condition === 'missing') await rm(path);
      else await writeFile(path, Buffer.alloc(0));
      await expect(service.unlock(phrase)).rejects.toMatchObject({code: 'VAULT_RECOVERY_REQUIRED'});
      expect((await service.status()).unlocked).toBe(false);
      if (condition === 'missing') expect(fs.existsSync(path)).toBe(false);
      else expect((await readFile(path)).length).toBe(0);
    },
  );
  it('does not publish a closed handle after a permission failure and can recover initialization', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ecdys-init-failure-'));
    directories.push(directory);
    const service = new WorkspaceService({directory, deriveKey: fastDerive});
    workspaces.push(service);
    vi.spyOn(fs, 'chmodSync').mockImplementationOnce(() => {
      throw new Error('permission failure');
    });
    syncBuiltinESMExports();
    await expect(service.create({passphrase: phrase, memoryMiB: 1024})).rejects.toBeDefined();
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    expect(await service.status()).toMatchObject({
      exists: true,
      unlocked: false,
      recoveryRequired: true,
    });
    await service.unlock(phrase);
    expect((await service.status()).unlocked).toBe(true);
    expect(await service.listProfiles()).toEqual([]);
  });
  it('rolls back an edit when the snapshot directory cannot be durably published', async () => {
    const {service} = await fixture();
    const profile = await service.createProfile({name: 'Original'});
    const realSync = fs.fsyncSync;
    vi.spyOn(fs, 'fsyncSync').mockImplementation((fd) => {
      if (fs.fstatSync(fd).isDirectory()) throw new Error('directory sync failure');
      realSync(fd);
    });
    syncBuiltinESMExports();
    await expect(
      service.updateProfile(profile.id, 1, {name: 'Must not commit'}),
    ).rejects.toBeDefined();
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    expect((await service.listProfiles())[0]?.name).toBe('Original');
    expect(await service.listSnapshots(profile.id)).toHaveLength(1);
  });
  it('reconciles only recognized unreferenced snapshot files on restart', async () => {
    const {service, directory} = await fixture();
    const profile = await service.createProfile({name: 'Research'});
    const retained = (await service.listSnapshots(profile.id))[0]!;
    const orphan = join(directory, 'snapshots', randomUUID() + '.enc');
    const unrelated = join(directory, 'snapshots', 'operator-notes.txt');
    await writeFile(orphan, 'interrupted transaction');
    await writeFile(unrelated, 'do not delete');
    await service.lock();
    await service.unlock(phrase);
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(unrelated)).toBe(true);
    expect(fs.existsSync(join(directory, 'snapshots', retained.id + '.enc'))).toBe(true);
  });
  it('retains twenty unpinned checkpoints across repeated branching', async () => {
    const {service} = await fixture();
    const parent = await service.createProfile({name: 'Production'});
    for (let i = 0; i < 19; i++) await service.createSnapshot(parent.id);
    const branch = await service.branchProfile(parent.id, 'first');
    expect((await service.listSnapshots(branch.id)).filter((s) => !s.pinned)).toHaveLength(20);
    expect(branch.snapshotCount).toBe(20);
    const grandchild = await service.branchProfile(branch.id, 'second');
    expect((await service.listSnapshots(grandchild.id)).filter((s) => !s.pinned)).toHaveLength(20);
  });
  it('persists profiles across lock/unlock without exposing names in the database file', async () => {
    const {service, directory} = await fixture();
    const profile = await service.createProfile({
      name: 'sensitive-capital-identity',
      tags: ['trading'],
    });
    await service.lock();
    expect(
      (await readFile(join(directory, 'workspace.sqlite'))).includes(
        Buffer.from('sensitive-capital-identity'),
      ),
    ).toBe(false);
    const plain = new Database(join(directory, 'workspace.sqlite'));
    expect(() => plain.prepare('SELECT * FROM profiles').all()).toThrow();
    plain.close();
    await expect(service.listProfiles()).rejects.toMatchObject({code: 'VAULT_LOCKED'});
    await expect(service.unlock('the wrong local passphrase')).rejects.toMatchObject({
      code: 'UNLOCK_FAILED',
    });
    await service.unlock(phrase);
    expect((await service.listProfiles())[0]?.id).toBe(profile.id);
  });
  it('creates a baseline before edits and restores configuration through a recoverable checkpoint', async () => {
    const {service} = await fixture();
    const original = await service.createProfile({name: 'Research', tags: ['OSINT']});
    const baseline = (await service.listSnapshots(original.id))[0]!;
    expect(baseline.trigger).toBe('baseline');
    const edited = await service.updateProfile(original.id, original.revision, {
      name: 'Changed',
      tags: ['test'],
    });
    const restored = await service.restoreSnapshot(original.id, baseline.id, edited.revision);
    expect(restored).toMatchObject({name: 'Research', tags: ['OSINT'], revision: 3});
    expect((await service.listSnapshots(original.id)).map((s) => s.trigger)).toEqual([
      'auto_pre_restore',
      'auto_edit',
      'baseline',
    ]);
  });
  it('rejects stale edits without writing an extra checkpoint', async () => {
    const {service} = await fixture();
    const p = await service.createProfile({name: 'Research'});
    await service.updateProfile(p.id, 1, {name: 'Current'});
    await expect(service.updateProfile(p.id, 1, {name: 'Stale'})).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    expect((await service.listSnapshots(p.id)).length).toBe(2);
    expect((await service.listProfiles())[0]?.name).toBe('Current');
  });
  it('bounds profiles under concurrent creation requests', async () => {
    const {service} = await fixture(2);
    const results = await Promise.allSettled(
      [1, 2, 3, 4].map((n) => service.createProfile({name: 'Profile ' + n})),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(await service.listProfiles()).toHaveLength(2);
  });
  it('never returns stored SOCKS5 passwords from profiles or snapshot previews', async () => {
    const {service, directory} = await fixture();
    const p = await service.createProfile({
      name: 'Capital',
      route: {
        kind: 'socks5',
        host: 'proxy.test',
        port: 1080,
        username: 'operator',
        password: 'top-secret-proxy-password',
      },
    });
    expect(p.route).toMatchObject({kind: 'socks5', hasPassword: true, remoteDNS: true});
    expect(JSON.stringify(await service.listProfiles())).not.toContain('top-secret-proxy-password');
    expect(JSON.stringify(await service.listSnapshots(p.id))).not.toContain(
      'top-secret-proxy-password',
    );
    await service.lock();
    for (const file of await readdir(directory)) {
      if (file.endsWith('.sqlite'))
        expect(
          (await readFile(join(directory, file))).includes(
            Buffer.from('top-secret-proxy-password'),
          ),
        ).toBe(false);
    }
  });
  it('branches independently and retains parent configuration', async () => {
    const {service} = await fixture();
    const parent = await service.createProfile({name: 'Production', tags: ['capital']});
    const branch = await service.branchProfile(parent.id, 'test-route');
    await service.updateProfile(branch.id, branch.revision, {name: 'Branch changed'});
    const profiles = await service.listProfiles();
    expect(profiles.find((p) => p.id === parent.id)?.name).toBe('Production');
    expect(profiles.find((p) => p.id === branch.id)?.parentProfileId).toBe(parent.id);
  });
  it('preserves inherited snapshot pins on an independent branch', async () => {
    const {service} = await fixture();
    const parent = await service.createProfile({name: 'Production'});
    const baseline = (await service.listSnapshots(parent.id))[0]!;
    await service.pinSnapshot(baseline.id, true);
    const branch = await service.branchProfile(parent.id, 'recovery-test');
    const history = await service.listSnapshots(branch.id);
    expect(history.filter((snapshot) => snapshot.pinned)).toHaveLength(1);
    expect(history.find((snapshot) => snapshot.pinned)?.id).not.toBe(baseline.id);
  });
  it('rejects tampered snapshot payloads without changing current configuration', async () => {
    const {service, directory} = await fixture();
    const p = await service.createProfile({name: 'Original'});
    const snapshot = (await service.listSnapshots(p.id))[0]!;
    await service.updateProfile(p.id, p.revision, {name: 'Current'});
    const path = join(directory, 'snapshots', snapshot.id + '.enc');
    const bytes = await readFile(path);
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    await writeFile(path, bytes);
    await expect(service.restoreSnapshot(p.id, snapshot.id, 2)).rejects.toMatchObject({
      code: 'SNAPSHOT_INVALID',
    });
    expect((await service.listProfiles())[0]?.name).toBe('Current');
    expect(await service.listSnapshots(p.id)).toHaveLength(2);
  });
});

describe('encrypted proxy library and route operations', () => {
  const source =
    'socks5://operator:private-pool-secret@first.test:1080\nsocks5://operator:second-pool-secret@second.test:1080';
  it('reports a committed route change as successful when retention cleanup fails', async () => {
    const {service, directory} = await fixture();
    const p = await service.createProfile({name: 'Committed route'});
    for (let index = 0; index < 19; index++) await service.createSnapshot(p.id);
    const pool = await service.importProxyPool({name: 'Pool', source});
    const header = JSON.parse(await readFile(join(directory, 'vault.json'), 'utf8'));
    const wrapping = await fastDerive(phrase, Buffer.from(header.salt, 'base64'));
    const master = unseal(header.master, wrapping, 'ecdys:vault:1');
    const key = subkey(master, 'ecdys:database:1');
    const db = new Database(join(directory, 'workspace.sqlite'));
    try {
      db.pragma("cipher='sqlcipher'");
      db.pragma('legacy=4');
      db.key(key);
      db.exec(
        "CREATE TRIGGER retention_failure BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT, 'retention unavailable'); END;",
      );
    } finally {
      db.close();
      key.fill(0);
      master.fill(0);
      wrapping.fill(0);
    }
    const result = await service.changeProxyRoutes({
      targets: [{id: p.id, revision: 1}],
      choice: {mode: 'assign', endpointId: pool.endpoints[0]!.id},
    });
    expect(result[0]).toMatchObject({
      ok: true,
      profile: {revision: 2, route: {host: 'first.test'}, snapshotCount: 21},
    });
    expect((await service.listProfiles())[0]?.route).toMatchObject({host: 'first.test'});
    expect(await service.listSnapshots(p.id)).toHaveLength(21);
    expect((await service.status()).storageWarnings?.join(' ')).toMatch(/retention/i);
    const retryWrapping = await fastDerive(phrase, Buffer.from(header.salt, 'base64'));
    const retryMaster = unseal(header.master, retryWrapping, 'ecdys:vault:1');
    const retryKey = subkey(retryMaster, 'ecdys:database:1');
    const retryDb = new Database(join(directory, 'workspace.sqlite'));
    try {
      retryDb.pragma("cipher='sqlcipher'");
      retryDb.pragma('legacy=4');
      retryDb.key(retryKey);
      retryDb.exec('DROP TRIGGER retention_failure');
    } finally {
      retryDb.close();
      retryKey.fill(0);
      retryMaster.fill(0);
      retryWrapping.fill(0);
    }
    await service.lock();
    await service.unlock(phrase);
    expect(await service.listSnapshots(p.id)).toHaveLength(20);
    expect((await service.status()).storageWarnings?.join(' ')).not.toMatch(/retention/i);
  });
  it('decrypts an endpoint only in main for a real handshake and cancels it on vault lock', async () => {
    let accepted!: () => void;
    const connected = new Promise<void>((resolve) => {
      accepted = resolve;
    });
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      socket.once('data', accepted);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const {service} = await fixture();
      const port = (server.address() as {port: number}).port;
      const pool = await service.importProxyPool({
        name: 'Local fixture',
        source: 'socks5://operator:private@127.0.0.1:' + port,
      });
      const diagnostic = service.testProxyEndpoint(pool.endpoints[0]!.id);
      const result = expect(diagnostic).rejects.toMatchObject({code: 'VAULT_LOCKED'});
      await connected;
      await service.lock();
      await result;
      expect((await service.status()).unlocked).toBe(false);
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('persists pools and returns only redacted credentials', async () => {
    const {service, directory} = await fixture();
    const pool = await service.importProxyPool({name: 'Research exits', source});
    expect(pool.endpoints).toHaveLength(2);
    expect(pool.endpoints[0]?.route).toMatchObject({kind: 'socks5', hasPassword: true});
    expect(JSON.stringify(pool)).not.toContain('private-pool-secret');
    await service.lock();
    expect(
      (await readFile(join(directory, 'workspace.sqlite'))).includes(
        Buffer.from('private-pool-secret'),
      ),
    ).toBe(false);
    await service.unlock(phrase);
    expect(await service.listProxyPools()).toEqual([pool]);
  });
  it('validates a complete import before any writes and rejects duplicate names', async () => {
    const {service} = await fixture();
    await expect(
      service.importProxyPool({name: 'Invalid', source: source + '\nftp://bad.test'}),
    ).rejects.toMatchObject({code: 'INVALID_PROXY_IMPORT'});
    expect(await service.listProxyPools()).toEqual([]);
    await service.importProxyPool({name: 'Research', source});
    await expect(service.importProxyPool({name: 'research', source})).rejects.toMatchObject({
      code: 'POOL_NAME_EXISTS',
    });
    expect(await service.listProxyPools()).toHaveLength(1);
  });
  it('rotates only the route, saving the previous configuration for restore', async () => {
    const {service} = await fixture();
    const pool = await service.importProxyPool({name: 'Research', source});
    const p = await service.createProfile({
      name: 'Futures',
      policy: 'protected_execution',
      folder: 'Capital',
      tags: ['live'],
      timezone: 'America/New_York',
    });
    const first = await service.changeProxyRoutes({
      targets: [{id: p.id, revision: 1}],
      choice: {mode: 'assign', endpointId: pool.endpoints[0]!.id},
    });
    expect(first[0]?.ok).toBe(true);
    await service.changeProxyRoutes({
      targets: [{id: p.id, revision: 2}],
      choice: {mode: 'rotate', poolId: pool.id},
    });
    expect((await service.listProfiles())[0]).toMatchObject({
      name: 'Futures',
      policy: p.policy,
      folder: p.folder,
      tags: p.tags,
      timezone: p.timezone,
      route: {host: 'second.test'},
      revision: 3,
    });
    const history = await service.listSnapshots(p.id);
    expect(history[0]?.config.route).toMatchObject({host: 'first.test', hasPassword: true});
    await service.deleteProxyPool(pool.id, pool.revision);
    await service.restoreSnapshot(p.id, history[0]!.id, 3);
    expect((await service.listProfiles())[0]?.route).toMatchObject({
      host: 'first.test',
      hasPassword: true,
    });
  });
  it('keeps successful bulk changes and reports stale or missing targets without changing them', async () => {
    const {service} = await fixture();
    const pool = await service.importProxyPool({name: 'Pool', source});
    const a = await service.createProfile({name: 'A'}),
      b = await service.createProfile({name: 'B'});
    await service.updateProfile(b.id, 1, {name: 'B changed'});
    const result = await service.changeProxyRoutes({
      targets: [
        {id: a.id, revision: 1},
        {id: b.id, revision: 1},
        {id: randomUUID(), revision: 1},
      ],
      choice: {mode: 'assign', endpointId: pool.endpoints[0]!.id},
    });
    expect(result.map((r) => r.ok)).toEqual([true, false, false]);
    expect(result[1]).toMatchObject({error: {code: 'REVISION_CONFLICT'}});
    expect((await service.listProfiles()).find((p) => p.id === b.id)?.route).toBeNull();
    expect(await service.listSnapshots(b.id)).toHaveLength(2);
  });
  it('rejects a rotation without another endpoint and does not create a checkpoint', async () => {
    const {service} = await fixture();
    const pool = await service.importProxyPool({name: 'Single', source: 'socks5://only.test:1080'});
    const p = await service.createProfile({
      name: 'A',
      route: {kind: 'socks5', host: 'only.test', port: 1080},
    });
    const result = await service.changeProxyRoutes({
      targets: [{id: p.id, revision: 1}],
      choice: {mode: 'rotate', poolId: pool.id},
    });
    expect(result[0]).toMatchObject({ok: false, error: {code: 'NO_ALTERNATIVE_ROUTE'}});
    expect(await service.listSnapshots(p.id)).toHaveLength(1);
    await service.lock();
    await expect(service.listProxyPools()).rejects.toMatchObject({code: 'VAULT_LOCKED'});
  });
  it('upgrades a v1 vault without replacing profile or checkpoint data', async () => {
    const {service, directory} = await fixture();
    const p = await service.createProfile({name: 'Existing operator'});
    await service.lock();
    const header = JSON.parse(await readFile(join(directory, 'vault.json'), 'utf8'));
    const wrapping = await fastDerive(phrase, Buffer.from(header.salt, 'base64'));
    const master = unseal(header.master, wrapping, 'ecdys:vault:1');
    const key = subkey(master, 'ecdys:database:1');
    const db = new Database(join(directory, 'workspace.sqlite'));
    try {
      db.pragma("cipher='sqlcipher'");
      db.pragma('legacy=4');
      db.key(key);
      db.exec(
        'DROP TABLE IF EXISTS proxy_endpoints; DROP TABLE IF EXISTS proxy_pools; PRAGMA user_version=1;',
      );
    } finally {
      db.close();
      key.fill(0);
      master.fill(0);
      wrapping.fill(0);
    }
    await service.unlock(phrase);
    expect((await service.listProfiles())[0]?.id).toBe(p.id);
    expect(await service.listSnapshots(p.id)).toHaveLength(1);
    expect(await service.listProxyPools()).toEqual([]);
    expect((await service.importProxyPool({name: 'Migrated', source})).endpoints).toHaveLength(2);
  });
});
