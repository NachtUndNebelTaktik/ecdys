import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { Vault } from '../packages/desktop/src/vault';
import { deriveMasterKey, sealSnapshot, openSnapshot } from '../packages/desktop/src/crypto';

const roots: string[] = [];
const vaults: Vault[] = [];
const params = { memoryMiB: 64, iterations: 2 } as const;
async function root() { const r = await mkdtemp(join(tmpdir(), 'styg-test-')); roots.push(r); return join(r, 'vault'); }
async function create() { const dir = await root(); const v = await Vault.create(dir, 'correct horse battery staple', params); vaults.push(v); return {v, dir}; }
afterEach(async () => { for (const v of vaults.splice(0)) v.close(); for (const r of roots.splice(0)) await rm(r, {recursive:true, force:true}); });

describe('encrypted workspace', () => {
  it('persists profiles across lock/reopen without exposing names in the database file', async () => {
    const {v, dir} = await create();
    const p = v.createProfile({name:'Sensitive investigation alpha', tags:['research']});
    expect(v.snapshots(p.id)).toHaveLength(1);
    v.close();
    expect((await readFile(join(dir, 'workspace.db'))).includes(Buffer.from('Sensitive investigation alpha'))).toBe(false);
    const plaintext = new Database(join(dir, 'workspace.db'), {readonly:true});
    expect(() => plaintext.prepare('SELECT * FROM profiles').all()).toThrow(); plaintext.close();
    const reopened = await Vault.open(dir, 'correct horse battery staple'); vaults.push(reopened);
    expect(reopened.profiles()[0].name).toBe('Sensitive investigation alpha');
    expect(() => v.profiles()).toThrow(/locked/i);
  });
  it('rejects a wrong passphrase and refuses to overwrite an existing workspace', async () => {
    const {v, dir} = await create(); v.createProfile({name:'Keep me'}); v.close();
    await expect(Vault.open(dir,'incorrect passphrase')).rejects.toThrow(/unlock/i);
    await expect(Vault.create(dir,'new passphrase long enough',params)).rejects.toThrow(/exists/i);
    const reopened = await Vault.open(dir,'correct horse battery staple'); vaults.push(reopened);
    expect(reopened.profiles()[0].name).toBe('Keep me');
  });
  it('rejects corrupt metadata without creating a fresh database', async () => {
    const {v, dir} = await create(); v.close();
    const before = await readFile(join(dir,'workspace.db'));
    await writeFile(join(dir,'workspace.json'),'{"version":900}');
    await expect(Vault.open(dir,'correct horse battery staple')).rejects.toThrow();
    expect(await readFile(join(dir,'workspace.db'))).toEqual(before);
  });
});

describe('configuration recovery', () => {
  it('snapshots before edits and creates a rollback point before restore', async () => {
    const {v} = await create(); const p = v.createProfile({name:'Research', timezone:'UTC'});
    const baseline = v.snapshots(p.id)[0];
    v.updateProfile(p.id, {name:'Changed', timezone:'Europe/Berlin', tags:['test']});
    expect(v.snapshots(p.id)).toHaveLength(2);
    v.restore(p.id,baseline.id);
    expect(v.profiles()[0]).toMatchObject({name:'Research', timezone:'UTC', tags:[]});
    const rollback = v.snapshots(p.id).find(s => s.trigger === 'pre_restore')!;
    v.restore(p.id,rollback.id);
    expect(v.profiles()[0]).toMatchObject({name:'Changed', timezone:'Europe/Berlin'});
  });
  it('keeps the 20 newest unpinned snapshots in addition to pinned snapshots', async () => {
    const {v} = await create(); const p = v.createProfile({name:'Original'});
    const baseline = v.snapshots(p.id)[0]; v.pin(p.id,baseline.id,true);
    for(let i=0;i<25;i++) v.updateProfile(p.id,{name:`Edit ${i}`});
    expect(v.snapshots(p.id)).toHaveLength(21);
    expect(v.snapshots(p.id).find(s=>s.id===baseline.id)?.pinned).toBe(true);
    v.restore(p.id,baseline.id); expect(v.profiles()[0].name).toBe('Original');
  });
  it('rejects cross-profile snapshot restores and path-shaped IDs', async () => {
    const {v} = await create(); const a = v.createProfile({name:'A'}); const b=v.createProfile({name:'B'});
    expect(()=>v.restore(b.id,v.snapshots(a.id)[0].id)).toThrow(/snapshot/i);
    expect(()=>v.updateProfile('../../outside',{name:'x'})).toThrow();
    expect(v.profiles().find(p=>p.id===b.id)?.name).toBe('B');
  });
  it('rejects invalid timezones, empty names and excess profiles without side effects', async () => {
    const {v}=await create();
    expect(()=>v.createProfile({name:' '})).toThrow();
    expect(()=>v.createProfile({name:'Bad',timezone:'Nowhere/Imaginary'})).toThrow();
    expect(v.profiles()).toHaveLength(0);
    for(let i=0;i<99;i++) v.createProfile({name:`P ${i}`});
    expect(()=>v.createProfile({name:'Overflow'})).toThrow(/99/);
    expect(v.profiles()).toHaveLength(99);
  });
});

it('authenticates snapshot contents, wrapping keys and profile identity', () => {
  const key = Buffer.alloc(32,7);
  const envelope = sealSnapshot({name:'private'},key,'profile-a','snapshot-a');
  expect(openSnapshot(envelope,key,'profile-a','snapshot-a')).toEqual({name:'private'});
  expect(()=>openSnapshot(envelope,key,'profile-b','snapshot-a')).toThrow();
  expect(()=>openSnapshot(envelope,Buffer.alloc(32,8),'profile-a','snapshot-a')).toThrow();
  const damaged = Buffer.from(envelope); damaged[damaged.length-5] ^= 1;
  expect(()=>openSnapshot(damaged,key,'profile-a','snapshot-a')).toThrow();
  expect(sealSnapshot({name:'private'},key,'profile-a','snapshot-a')).not.toEqual(envelope);
});

async function withDatabase(dir:string,action:(db:Database.Database)=>void) {
  const meta=JSON.parse(await readFile(join(dir,'workspace.json'),'utf8'));
  const key=await deriveMasterKey('correct horse battery staple',Buffer.from(meta.salt,'hex'),meta.kdf);
  const db=new Database(join(dir,'workspace.db'));
  try {db.pragma("cipher='sqlcipher'");db.pragma('legacy=4');db.key(key);action(db);}
  finally {key.fill(0);db.close();}
}

it('does not change the profile or history when a stored snapshot is corrupt',async()=>{
  const {v,dir}=await create();const p=v.createProfile({name:'Baseline'});
  const baseline=v.snapshots(p.id)[0];v.updateProfile(p.id,{name:'Current'});
  const before=v.snapshots(p.id);
  await withDatabase(dir,db=>{db.prepare('UPDATE snapshots SET envelope=? WHERE id=?').run(Buffer.alloc(80,255),baseline.id);});
  expect(()=>v.restore(p.id,baseline.id)).toThrow();
  expect(v.profiles()[0].name).toBe('Current');
  expect(v.snapshots(p.id).map(s=>s.id)).toEqual(before.map(s=>s.id));
});

it('rolls back snapshots as well as configuration when edit or restore database writes fail',async()=>{
  const {v,dir}=await create();const p=v.createProfile({name:'Baseline'});
  const baseline=v.snapshots(p.id)[0];v.updateProfile(p.id,{name:'Current'});
  const before=v.snapshots(p.id);
  await withDatabase(dir,db=>db.exec("CREATE TRIGGER fail_profile_update BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT,'Forced write failure'); END;"));
  expect(()=>v.updateProfile(p.id,{name:'Never persisted'})).toThrow(/Forced write failure/);
  expect(()=>v.restore(p.id,baseline.id)).toThrow(/Forced write failure/);
  expect(v.profiles()[0].name).toBe('Current');
  expect(v.snapshots(p.id)).toEqual(before);
});

it('rolls back an unpin if pruning fails',async()=>{
  const {v,dir}=await create();const p=v.createProfile({name:'Baseline'});
  const baseline=v.snapshots(p.id)[0];v.pin(p.id,baseline.id,true);
  for(let i=0;i<20;i++)v.updateProfile(p.id,{name:`Edit ${i}`});
  await withDatabase(dir,db=>db.exec("CREATE TRIGGER fail_pruning BEFORE DELETE ON snapshots BEGIN SELECT RAISE(ABORT,'Forced prune failure'); END;"));
  expect(()=>v.pin(p.id,baseline.id,false)).toThrow(/Forced prune failure/);
  expect(v.snapshots(p.id).find(s=>s.id===baseline.id)?.pinned).toBe(true);
  expect(v.snapshots(p.id)).toHaveLength(21);
});

it('preserves omitted settings in a partial edit while allowing an explicit empty tag list',async()=>{
  const {v}=await create();
  const p=v.createProfile({name:'Original',tags:['research'],timezone:'Europe/Berlin',language:'de-DE',screen:'1440 × 900'});
  v.updateProfile(p.id,{name:'Renamed'});
  expect(v.profiles()[0]).toMatchObject({name:'Renamed',tags:['research'],timezone:'Europe/Berlin',language:'de-DE',screen:'1440 × 900'});
  v.updateProfile(p.id,{tags:[]});
  expect(v.profiles()[0]).toMatchObject({name:'Renamed',tags:[],timezone:'Europe/Berlin',language:'de-DE',screen:'1440 × 900'});
});
