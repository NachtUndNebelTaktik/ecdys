import {afterEach, describe, expect, it} from 'vitest';
import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import argon2 from 'argon2';
import Database from 'better-sqlite3-multiple-ciphers';
import {initialResearch, ResearchDraftSchema, type ResearchDraft} from '@ecdys/shared';
import {WorkspaceService} from './workspace';
import {parseInvocation} from './ipc';
import {subkey, unseal} from './crypto';

const phrase = 'research integration test passphrase';
const fixtures: {directory: string; service: WorkspaceService}[] = [];
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
  const directory = await mkdtemp(join(tmpdir(), 'ecdys-research-'));
  const service = new WorkspaceService({directory, deriveKey});
  const result = {directory, service};
  fixtures.push(result);
  await service.create({passphrase: phrase, memoryMiB: 1024});
  return result;
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
const node = (title: string) => ({
  id: randomUUID(),
  title,
  kind: 'topic' as const,
  note: '',
  sourceUrl: '',
  x: 0,
  y: 0,
});
afterEach(async () => {
  for (const {service, directory} of fixtures.splice(0)) {
    await service.lock();
    await rm(directory, {recursive: true, force: true});
  }
});

describe('encrypted OSINT research', () => {
  it('starts with no tool definitions and preserves the empty shelf across reopen', async () => {
    const {service} = await fixture();
    expect(initialResearch().tools).toEqual([]);
    expect((await service.researchWorkspace()).tools).toEqual([]);
    await service.lock();
    await service.unlock(phrase);
    expect((await service.researchWorkspace()).tools).toEqual([]);
  });
  it('retains linked notes, positions and custom tools across lock and reopen without plaintext files', async () => {
    const {service, directory} = await fixture();
    const first = await service.researchWorkspace();
    expect(first.nodes).toEqual([]);
    expect(first.tools).toEqual([]);
    const root = {
      ...node('Sensitive research subject'),
      note: 'private-research-note-6d123',
      sourceUrl: 'https://example.com/source',
      x: -120,
      y: 850,
    };
    const child = {...node('Public source'), kind: 'domain' as const, x: 250};
    const draft: ResearchDraft = {
      title: 'Operator board',
      nodes: [root, child],
      edges: [{id: randomUUID(), source: root.id, target: child.id, label: 'references'}],
      tools: [
        {
          id: randomUUID(),
          name: 'My source',
          url: 'https://example.com/tool',
          category: 'Custom',
          pinned: true,
          description: 'Saved by the operator',
        },
      ],
    };
    const saved = await service.saveResearchWorkspace({revision: first.revision, draft});
    expect(saved.revision).toBe(first.revision + 1);
    await service.lock();
    await expect(service.researchWorkspace()).rejects.toMatchObject({code: 'VAULT_LOCKED'});
    await expect(
      service.saveResearchWorkspace({revision: saved.revision, draft}),
    ).rejects.toMatchObject({code: 'VAULT_LOCKED'});
    for (const file of await readdir(directory)) {
      if (file.endsWith('.sqlite') || file.startsWith('workspace.sqlite-')) {
        const bytes = await readFile(join(directory, file));
        expect(bytes.includes(Buffer.from(root.note))).toBe(false);
        expect(bytes.includes(Buffer.from(root.title))).toBe(false);
      }
    }
    await service.unlock(phrase);
    expect(await service.researchWorkspace()).toEqual(saved);
    await service.saveResearchWorkspace({revision: saved.revision, draft: {...draft, tools: []}});
    await service.lock();
    await service.unlock(phrase);
    expect((await service.researchWorkspace()).tools).toEqual([]);
  });
  it('rejects stale revisions instead of losing another window’s research', async () => {
    const {service} = await fixture(),
      first = await service.researchWorkspace();
    const {revision, updatedAt: _updatedAt, ...draft} = first;
    const results = await Promise.allSettled([
      service.saveResearchWorkspace({revision, draft: {...draft, title: 'First writer'}}),
      service.saveResearchWorkspace({revision, draft: {...draft, title: 'Stale writer'}}),
    ]);
    expect(results[0]?.status).toBe('fulfilled');
    expect(results[1]).toMatchObject({status: 'rejected', reason: {code: 'REVISION_CONFLICT'}});
    expect((await service.researchWorkspace()).title).toBe('First writer');
  });
  it('preserves existing website records during an older research-vault upgrade', async () => {
    const {service, directory} = await fixture();
    const {revision, updatedAt: _updatedAt, ...draft} = await service.researchWorkspace();
    const existing: ResearchDraft = {
      ...draft,
      tools: [
        {
          id: randomUUID(),
          name: 'Previously saved source',
          category: 'Infrastructure',
          description: 'Retained from an earlier workspace.',
          url: 'https://saved-source.example/records',
          pinned: true,
        },
      ],
    };
    const saved = await service.saveResearchWorkspace({revision, draft: existing});
    await service.lock();
    await alterDatabase(directory, (db) =>
      db.exec('DROP TABLE notepad_files; DROP TABLE notepad; PRAGMA user_version=3;'),
    );
    await service.unlock(phrase);
    expect(await service.researchWorkspace()).toEqual(saved);
  });
  it('validates graph references, IDs, limits and tool URLs at the IPC and storage boundary', async () => {
    const {service} = await fixture(),
      before = await service.researchWorkspace(),
      a = node('A'),
      b = node('B');
    const edge = {id: randomUUID(), source: a.id, target: b.id, label: ''};
    const draft: ResearchDraft = {
      ...initialResearch(),
      nodes: [a, b],
      edges: [edge],
      tools: [
        {
          id: randomUUID(),
          name: 'Operator fixture',
          category: 'Custom',
          description: 'Explicitly configured test source.',
          url: 'https://fixture.example/source',
          pinned: false,
        },
      ],
    };
    expect(ResearchDraftSchema.safeParse(draft).success).toBe(true);
    const invalid: unknown[] = [
      {...draft, nodes: [a, a]},
      {...draft, nodes: [a]},
      {...draft, edges: [{...edge, target: a.id}]},
      {...draft, edges: [edge, {...edge, id: randomUUID(), source: b.id, target: a.id}]},
      {...draft, nodes: [{...a, x: Infinity}]},
      {...draft, nodes: Array.from({length: 101}, () => node('Too many'))},
      {...draft, tools: [{...draft.tools[0], url: 'javascript:alert(1)'}]},
      {...draft, tools: [{...draft.tools[0], url: 'https://user:password@example.com/'}]},
      {...draft, tools: [{...draft.tools[0], command: 'sh'}]},
      {
        ...draft,
        nodes: Array.from({length: 60}, () => ({...node('Large'), note: 'a'.repeat(4000)})),
      },
    ];
    for (const document of invalid) {
      expect(() =>
        parseInvocation({
          method: 'saveResearchWorkspace',
          args: [{revision: before.revision, draft: document}],
        }),
      ).toThrow();
      await expect(
        service.saveResearchWorkspace({
          revision: before.revision,
          draft: document as ResearchDraft,
        }),
      ).rejects.toBeDefined();
    }
    expect(await service.researchWorkspace()).toEqual(before);
  });
  it('migrates v2 while preserving saved profiles, proxy credentials and checkpoints', async () => {
    const {service, directory} = await fixture();
    const profile = await service.createProfile({name: 'Existing profile'});
    const pool = await service.importProxyPool({
      name: 'Existing proxies',
      source: 'socks5://user:secret@proxy.test:1080',
    });
    await service.lock();
    await alterDatabase(directory, (db) =>
      db.exec(
        'DROP TABLE notepad_files; DROP TABLE notepad; DROP TABLE research_workspace; PRAGMA user_version=2;',
      ),
    );
    await service.unlock(phrase);
    expect((await service.listProfiles())[0]?.id).toBe(profile.id);
    expect(await service.listSnapshots(profile.id)).toHaveLength(1);
    expect(await service.listProxyPools()).toEqual([pool]);
    expect((await service.researchWorkspace()).nodes).toEqual([]);
    expect((await service.researchWorkspace()).tools).toEqual([]);
    const result = await service.changeProxyRoutes({
      targets: [{id: profile.id, revision: profile.revision}],
      choice: {mode: 'assign', endpointId: pool.endpoints[0]!.id},
    });
    expect(result[0]).toMatchObject({ok: true, profile: {route: {hasPassword: true}}});
  });
  it.each(['table', 'row', 'document'])(
    'does not silently replace missing or invalid research %s in v3',
    async (condition) => {
      const {service, directory} = await fixture();
      await service.lock();
      await alterDatabase(directory, (db) => {
        if (condition === 'table') db.exec('DROP TABLE research_workspace;');
        else if (condition === 'row') db.exec('DELETE FROM research_workspace;');
        else db.prepare('UPDATE research_workspace SET document = ?').run('{broken');
      });
      await expect(service.unlock(phrase)).rejects.toMatchObject({
        code: condition === 'table' ? 'VAULT_RECOVERY_REQUIRED' : 'RESEARCH_RECOVERY_REQUIRED',
      });
      expect((await service.status()).unlocked).toBe(false);
      await alterDatabase(directory, (db) => {
        if (condition === 'table')
          expect(
            db.prepare("SELECT name FROM sqlite_master WHERE name='research_workspace'").get(),
          ).toBeUndefined();
        else if (condition === 'row')
          expect(db.prepare('SELECT * FROM research_workspace').all()).toEqual([]);
        else
          expect(db.prepare('SELECT document FROM research_workspace').get()).toMatchObject({
            document: '{broken',
          });
      });
    },
  );
});
