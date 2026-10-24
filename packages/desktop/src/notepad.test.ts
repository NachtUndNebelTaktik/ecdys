import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  truncate,
  symlink,
} from 'node:fs/promises';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import argon2 from 'argon2';
import {NOTEPAD_MAX_FILE_BYTES, PRO_CLOUD_STORAGE_BYTES} from '@ecdys/shared';
import {WorkspaceService} from './workspace';
import {dispatch, parseInvocation, type NotepadDialogs} from './ipc';
import {subkey, unseal} from './crypto';

const phrase = 'encrypted notepad integration passphrase';
const fixtures: {root: string; directory: string; service: WorkspaceService}[] = [];
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
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ecdys-notepad-')),
    directory = join(root, 'vault');
  const service = new WorkspaceService({directory, deriveKey}),
    item = {root, directory, service};
  fixtures.push(item);
  await service.create({passphrase: phrase, memoryMiB: 1024});
  return item;
}
async function alterDatabase(directory: string, work: (db: Database.Database) => void) {
  const header = JSON.parse(await readFile(join(directory, 'vault.json'), 'utf8'));
  const wrapping = await deriveKey(phrase, Buffer.from(header.salt, 'base64'));
  const master = unseal(header.master, wrapping, 'ecdys:vault:1'),
    key = subkey(master, 'ecdys:database:1');
  const db = new Database(join(directory, 'workspace.sqlite'));
  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma('legacy=4');
    db.key(key);
    work(db);
  } finally {
    db.close();
    wrapping.fill(0);
    master.fill(0);
    key.fill(0);
  }
}
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  for (const {service, root} of fixtures.splice(0)) {
    await service.lock();
    await rm(root, {recursive: true, force: true});
  }
});

describe('encrypted notepad and native file boundary', () => {
  it('saves encrypted notes/files, retains originals and restores identical bytes after lock', async () => {
    const {service, root, directory} = await fixture(),
      initial = await service.notepad();
    expect(initial.cloud).toEqual({
      plan: 'Pro',
      allowanceBytes: PRO_CLOUD_STORAGE_BYTES,
      status: 'not_connected',
    });
    const body = 'Private operator note <script>never execute</script>';
    const note = await service.saveNotepad({
      revision: initial.note.revision,
      draft: {title: 'Working notes', body},
    });
    const data = Buffer.from('private-evidence-5371\0binary\xff'),
      source = join(root, 'evidence.bin'),
      target = join(root, 'exported.bin');
    await writeFile(source, data);
    const ticket = await service.notepadTicket(),
      file = await service.importNotepadFile(source, ticket);
    const encrypted = await readFile(join(directory, 'notepad-files', file.id + '.enc'));
    expect(encrypted.includes(data)).toBe(false);
    expect(encrypted.subarray(0, 10).toString()).toBe('ECDYSFILE1');
    expect(JSON.stringify(file)).not.toContain(root);
    await expect(
      service.saveNotepad({revision: initial.note.revision, draft: {title: 'Stale', body: 'Lost'}}),
    ).rejects.toMatchObject({code: 'REVISION_CONFLICT'});
    await service.lock();
    expect((await readFile(join(directory, 'workspace.sqlite'))).includes(Buffer.from(body))).toBe(
      false,
    );
    await expect(service.notepad()).rejects.toMatchObject({code: 'VAULT_LOCKED'});
    await expect(service.exportNotepadFile(file.id, target, ticket)).rejects.toMatchObject({
      code: 'VAULT_LOCKED',
    });
    await service.unlock(phrase);
    expect((await service.notepad()).note).toEqual(note);
    await service.exportNotepadFile(file.id, target, await service.notepadTicket());
    expect(await readFile(target)).toEqual(data);
    expect(await readFile(source)).toEqual(data);
    await service.removeNotepadFile(file.id);
    expect((await service.notepad()).files).toEqual([]);
    expect(fs.existsSync(join(directory, 'notepad-files', file.id + '.enc'))).toBe(false);
    expect(await readFile(target)).toEqual(data);
    expect(await readFile(source)).toEqual(data);
  });
  it('rejects tampering and swapped envelopes before replacing an export destination', async () => {
    const {service, root, directory} = await fixture(),
      source = join(root, 'same.txt'),
      target = join(root, 'keep.txt');
    await writeFile(source, 'identical plaintext');
    await writeFile(target, 'preserve destination');
    const ticket = await service.notepadTicket(),
      a = await service.importNotepadFile(source, ticket),
      b = await service.importNotepadFile(source, ticket);
    const path = (id: string) => join(directory, 'notepad-files', id + '.enc');
    const aBytes = await readFile(path(a.id)),
      bBytes = await readFile(path(b.id));
    expect(aBytes).not.toEqual(bBytes);
    await writeFile(path(a.id), bBytes);
    await expect(service.exportNotepadFile(a.id, target, ticket)).rejects.toMatchObject({
      code: 'FILE_INTEGRITY',
    });
    expect(await readFile(target, 'utf8')).toBe('preserve destination');
    bBytes[bBytes.length - 1] = bBytes[bBytes.length - 1]! ^ 1;
    await writeFile(path(b.id), bBytes);
    await expect(service.exportNotepadFile(b.id, target, ticket)).rejects.toMatchObject({
      code: 'FILE_INTEGRITY',
    });
    expect(await readFile(target, 'utf8')).toBe('preserve destination');
    await expect(
      service.exportNotepadFile(b.id, join(directory, 'workspace.sqlite'), ticket),
    ).rejects.toMatchObject({code: 'FILE_DESTINATION'});
  });
  it('refuses raw renderer paths, handles dialog cancellation and rejects old unlock epochs', async () => {
    const {service, root} = await fixture(),
      source = join(root, 'selected.txt');
    await writeFile(source, 'selected');
    expect(() => parseInvocation({method: 'importNotepadFile', args: [source]})).toThrow();
    expect(() =>
      parseInvocation({method: 'exportNotepadFile', args: [randomUUID(), source]}),
    ).toThrow();
    expect(() =>
      parseInvocation({method: 'removeNotepadFile', args: ['../../vault.json']}),
    ).toThrow();
    const dialogs: NotepadDialogs = {
      selectImport: vi.fn(async () => null),
      selectExport: vi.fn(async () => null),
    };
    expect(
      await dispatch(service, {method: 'importNotepadFile', args: []}, undefined, dialogs),
    ).toBeNull();
    let release!: (path: string) => void;
    dialogs.selectImport = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const pending = dispatch(service, {method: 'importNotepadFile', args: []}, undefined, dialogs);
    await vi.waitFor(() => expect(dialogs.selectImport).toHaveBeenCalled());
    await service.lock();
    await service.unlock(phrase);
    release(source);
    await expect(pending).rejects.toMatchObject({code: 'VAULT_CHANGED'});
    expect((await service.notepad()).files).toEqual([]);
    await service.lock();
    const called = vi.mocked(dialogs.selectImport).mock.calls.length;
    await expect(
      dispatch(service, {method: 'importNotepadFile', args: []}, undefined, dialogs),
    ).rejects.toMatchObject({code: 'VAULT_LOCKED'});
    expect(vi.mocked(dialogs.selectImport).mock.calls).toHaveLength(called);
  });
  it('bounds file reads and accepts empty files without executing or previewing them', async () => {
    const {service, root} = await fixture(),
      empty = join(root, 'empty.txt'),
      oversized = join(root, 'large.bin');
    await writeFile(empty, '');
    await writeFile(oversized, '');
    await truncate(oversized, NOTEPAD_MAX_FILE_BYTES + 1);
    const ticket = await service.notepadTicket();
    await expect(service.importNotepadFile(oversized, ticket)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    });
    const file = await service.importNotepadFile(empty, ticket),
      target = join(root, 'empty-copy.txt');
    await service.exportNotepadFile(file.id, target, ticket);
    expect((await readFile(target)).length).toBe(0);
    if (process.platform !== 'win32') {
      const link = join(root, 'symlink.txt');
      await symlink(empty, link);
      await expect(service.importNotepadFile(link, ticket)).rejects.toBeDefined();
    }
    await mkdir(join(root, 'folder'));
    await expect(service.importNotepadFile(join(root, 'folder'), ticket)).rejects.toMatchObject({
      code: 'FILE_INVALID',
    });
  });
  it('rolls back a failed file publication and reconciles only recognized orphans', async () => {
    const {service, root, directory} = await fixture(),
      source = join(root, 'original.txt');
    await writeFile(source, 'source');
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('publication failure');
    });
    syncBuiltinESMExports();
    await expect(
      service.importNotepadFile(source, await service.notepadTicket()),
    ).rejects.toBeDefined();
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    expect((await service.notepad()).files).toEqual([]);
    expect(await readdir(join(directory, 'notepad-files'))).toEqual([]);
    const file = await service.importNotepadFile(source, await service.notepadTicket());
    const folder = join(directory, 'notepad-files'),
      orphan = join(folder, randomUUID() + '.enc'),
      temporary = join(folder, randomUUID() + '.enc.tmp'),
      unrelated = join(folder, 'operator-note.txt');
    await writeFile(orphan, 'orphan');
    await writeFile(temporary, 'interrupted');
    await writeFile(unrelated, 'keep this');
    await rm(join(folder, file.id + '.enc'));
    await service.lock();
    await service.unlock(phrase);
    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(temporary)).toBe(false);
    expect(await readFile(unrelated, 'utf8')).toBe('keep this');
    expect((await service.notepad()).files[0]).toMatchObject({id: file.id, available: false});
    expect((await service.status()).storageWarnings?.join(' ')).toContain(
      'notepad files are missing',
    );
  });
  it('migrates v3 without replacing research, profiles or their checkpoints', async () => {
    const {service, directory} = await fixture(),
      profile = await service.createProfile({name: 'Retain profile'}),
      research = await service.researchWorkspace();
    const {revision, updatedAt: _updatedAt, ...draft} = research;
    await service.saveResearchWorkspace({revision, draft: {...draft, title: 'Retain research'}});
    await service.lock();
    await alterDatabase(directory, (db) =>
      db.exec('DROP TABLE notepad_files; DROP TABLE notepad; PRAGMA user_version=3;'),
    );
    await service.unlock(phrase);
    expect((await service.notepad()).note.body).toBe('');
    expect((await service.researchWorkspace()).title).toBe('Retain research');
    expect((await service.listProfiles())[0]?.id).toBe(profile.id);
    expect(await service.listSnapshots(profile.id)).toHaveLength(1);
  });
  it.each(['table', 'row'])(
    'preserves damaged v4 notepad %s rather than recreating it',
    async (condition) => {
      const {service, directory} = await fixture();
      await service.lock();
      await alterDatabase(directory, (db) =>
        db.exec(condition === 'table' ? 'DROP TABLE notepad;' : 'DELETE FROM notepad;'),
      );
      await expect(service.unlock(phrase)).rejects.toMatchObject({
        code: condition === 'table' ? 'VAULT_RECOVERY_REQUIRED' : 'NOTEPAD_RECOVERY_REQUIRED',
      });
      await alterDatabase(directory, (db) => {
        if (condition === 'table')
          expect(
            db.prepare("SELECT name FROM sqlite_master WHERE name='notepad'").get(),
          ).toBeUndefined();
        else expect(db.prepare('SELECT * FROM notepad').all()).toEqual([]);
      });
    },
  );
  it('enforces the local storage budget independently of the future Pro cloud allowance', async () => {
    const {service, root, directory} = await fixture(),
      source = join(root, 'small.txt');
    await writeFile(source, 'small');
    await service.lock();
    await alterDatabase(directory, (db) => {
      const insert = db.prepare('INSERT INTO notepad_files VALUES (?, ?, ?, ?, ?)');
      db.transaction(() => {
        for (let i = 0; i < 191; i++)
          insert.run(
            randomUUID(),
            'reserved.bin',
            NOTEPAD_MAX_FILE_BYTES,
            '0'.repeat(64),
            Date.now(),
          );
      })();
    });
    await service.unlock(phrase);
    const state = await service.notepad();
    expect(state.usedBytes).toBeGreaterThan(state.localLimitBytes);
    await expect(
      service.importNotepadFile(source, await service.notepadTicket()),
    ).rejects.toMatchObject({code: 'NOTEPAD_QUOTA'});
    expect((await service.notepad()).cloud.allowanceBytes).toBe(1_000_000_000);
  });
});
