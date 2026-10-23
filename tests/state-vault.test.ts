import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3-multiple-ciphers';
import {Vault} from '../packages/desktop/src/vault';
import {StateStore} from '../packages/desktop/src/state-store';
import {deriveMasterKey,sealSnapshot} from '../packages/desktop/src/crypto';
const passphrase='correct horse battery staple';
const roots:string[]=[],vaults:Vault[]=[];
async function fixture(){const root=await mkdtemp(join(tmpdir(),'styg-state-vault-'));roots.push(root);const dir=join(root,'vault');const v=await Vault.create(dir,passphrase,{memoryMiB:64,iterations:2});vaults.push(v);const p=v.createProfile({name:'Baseline',timezone:'Europe/Berlin'});return {dir,v,p,browser:join(dir,'profiles',p.id,'browser')};}
async function external<T>(dir:string,fn:(db:Database.Database,key:Buffer)=>T|Promise<T>) {
  const meta=JSON.parse(await readFile(join(dir,'workspace.json'),'utf8'));const key=await deriveMasterKey(passphrase,Buffer.from(meta.salt,'hex'),meta.kdf);
  const db=new Database(join(dir,'workspace.db'));
  try{db.pragma("cipher='sqlcipher'");db.pragma('legacy=4');db.key(key);return await fn(db,key);}finally{key.fill(0);db.close();}
}
afterEach(async()=>{for(const v of vaults.splice(0))v.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});

it('creates separate browser directories and recovers full state with a full rollback snapshot',async()=>{
  const {dir,v,p,browser}=await fixture();const other=v.createProfile({name:'Other'});
  expect(await readdir(join(dir,'profiles'))).toHaveLength(2);
  expect(await readdir(join(dir,'profiles',other.id,'browser'))).toEqual([]);
  await mkdir(join(browser,'Default'));await writeFile(join(browser,'Default','Preferences'),'baseline bytes');
  const saved=await v.saveStateSnapshot(p.id);
  expect(saved).toMatchObject({hasBrowserState:true,fileCount:1,stateBytes:14,trigger:'manual'});
  v.updateProfile(p.id,{name:'Current',timezone:'UTC'});await writeFile(join(browser,'Default','Preferences'),'current bytes');
  await v.restoreSnapshot(p.id,saved.id);
  expect(v.profiles().find(x=>x.id===p.id)).toMatchObject({name:'Baseline',timezone:'Europe/Berlin'});
  expect(await readFile(join(browser,'Default','Preferences'),'utf8')).toBe('baseline bytes');
  const rollback=v.snapshots(p.id).find(s=>s.trigger==='pre_restore')!;expect(rollback.hasBrowserState).toBe(true);
  await v.restoreSnapshot(p.id,rollback.id);
  expect(v.profiles().find(x=>x.id===p.id)?.name).toBe('Current');
  expect(await readFile(join(browser,'Default','Preferences'),'utf8')).toBe('current bytes');
});
it('leaves browser files untouched when restoring a configuration-only snapshot',async()=>{
  const {v,p,browser}=await fixture();const baseline=v.snapshots(p.id)[0];
  expect(baseline.hasBrowserState).toBe(false);
  await writeFile(join(browser,'Preferences'),'keep these bytes');v.updateProfile(p.id,{name:'Changed'});
  await v.restoreSnapshot(p.id,baseline.id);
  expect(v.profiles()[0].name).toBe('Baseline');expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('keep these bytes');
});
it('rejects corrupted stored state without changing files, configuration or history',async()=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'baseline');const saved=await v.saveStateSnapshot(p.id);
  await writeFile(join(browser,'Preferences'),'current');v.updateProfile(p.id,{name:'Current'});
  await external(dir,db=>db.prepare('UPDATE snapshots SET stateEnvelope=? WHERE id=?').run(Buffer.alloc(80,255),saved.id));
  const before=v.snapshots(p.id);
  await expect(v.restoreSnapshot(p.id,saved.id)).rejects.toThrow();
  expect(v.profiles()[0].name).toBe('Current');expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('current');
  expect(v.snapshots(p.id)).toEqual(before);expect(await readdir(join(browser,'..'))).toEqual(['browser']);
});
it('cleans staging and keeps current state if the database rejects a restore',async()=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'baseline');const saved=await v.saveStateSnapshot(p.id);
  await writeFile(join(browser,'Preferences'),'current');v.updateProfile(p.id,{name:'Current'});const before=v.snapshots(p.id);
  await external(dir,db=>db.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT,'Forced restore failure'); END;"));
  await expect(v.restoreSnapshot(p.id,saved.id)).rejects.toThrow(/Forced restore failure/);
  expect(v.profiles()[0].name).toBe('Current');expect(v.snapshots(p.id)).toEqual(before);
  expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('current');expect(await readdir(join(browser,'..'))).toEqual(['browser']);
});
it.each(['prepared','old_moved','new_installed'])('finishes a durable interrupted restore on reopen: %s',async point=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'baseline');const saved=await v.saveStateSnapshot(p.id);
  await writeFile(join(browser,'Preferences'),'current');v.updateProfile(p.id,{name:'Current'});const op=randomUUID();
  await external(dir,async(db,key)=>{
    const row=db.prepare('SELECT stateEnvelope FROM snapshots WHERE id=?').get(saved.id) as {stateEnvelope:Buffer};
    const store=new StateStore(dir);try{await store.stage(p.id,op,saved.id,row.stateEnvelope,key);}finally{store.close();}
    db.transaction(()=>{
      db.prepare('UPDATE profiles SET config=? WHERE id=?').run(JSON.stringify({name:'Baseline',tags:[],timezone:'Europe/Berlin',language:'en-US',screen:'1920 × 1080'}),p.id);
      db.prepare('INSERT INTO restore_jobs(profileId,operationId) VALUES(?,?)').run(p.id,op);
    })();
  });
  if(point!=='prepared')await rename(browser,join(browser,'..',`previous-${op}`));
  if(point==='new_installed')await rename(join(browser,'..',`restore-${op}`),browser);
  v.close();const reopened=await Vault.open(dir,passphrase);vaults.push(reopened);
  expect(reopened.profiles()[0].name).toBe('Baseline');expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('baseline');
  expect(await readdir(join(browser,'..'))).toEqual(['browser']);expect(await readdir(browser)).toEqual(['Preferences']);
});
it('keeps the workspace locked when recovery artifacts are missing',async()=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'preserve');
  await external(dir,db=>db.prepare('INSERT INTO restore_jobs(profileId,operationId) VALUES(?,?)').run(p.id,randomUUID()));
  v.close();await expect(Vault.open(dir,passphrase)).rejects.toThrow(/recovery/i);
  expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('preserve');
});
it('migrates an original v1 encrypted workspace without losing profiles or snapshots',async()=>{
  const root=await mkdtemp(join(tmpdir(),'styg-migration-'));roots.push(root);const dir=join(root,'vault');await mkdir(dir,{mode:0o700});
  const salt=randomBytes(32),params={memoryMiB:64,iterations:2} as const,key=await deriveMasterKey(passphrase,salt,params);
  const db=new Database(join(dir,'workspace.db'));const pid=randomUUID(),sid=randomUUID();
  const config={name:'Legacy profile',tags:['kept'],timezone:'UTC',language:'en-US',screen:'1920 × 1080'};
  try {
    db.pragma("cipher='sqlcipher'");db.pragma('legacy=4');db.key(key);
    db.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY,config TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL); CREATE TABLE snapshots(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,profileId TEXT NOT NULL REFERENCES profiles(id),timestamp INTEGER NOT NULL,trigger TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,envelope BLOB NOT NULL); PRAGMA user_version=1;');
    db.prepare('INSERT INTO profiles VALUES(?,?,?,?)').run(pid,JSON.stringify(config),1,1);
    db.prepare('INSERT INTO snapshots(id,profileId,timestamp,trigger,envelope) VALUES(?,?,?,?,?)').run(sid,pid,1,'baseline',sealSnapshot(config,key,pid,sid));
  }finally{key.fill(0);db.close();}
  await writeFile(join(dir,'workspace.json'),JSON.stringify({version:1,salt:salt.toString('hex'),kdf:params}));
  const v=await Vault.open(dir,passphrase);vaults.push(v);
  expect(v.profiles()[0]).toMatchObject({name:'Legacy profile',tags:['kept']});expect(v.snapshots(pid)[0]).toMatchObject({id:sid,hasBrowserState:false});
  expect(await readdir(join(dir,'profiles',pid,'browser'))).toEqual([]);
  expect((await v.saveStateSnapshot(pid)).hasBrowserState).toBe(true);
});

it.skipIf(process.platform!=='linux')('preserves current files if a full rollback archive cannot be restored safely',async()=>{
  const {v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'baseline');const saved=await v.saveStateSnapshot(p.id);
  await writeFile(join(browser,'Preferences'),'current upper');await writeFile(join(browser,'preferences'),'current lower');v.updateProfile(p.id,{name:'Current'});
  const before=v.snapshots(p.id);await expect(v.restoreSnapshot(p.id,saved.id)).rejects.toThrow(/duplicate/i);
  expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('current upper');expect(await readFile(join(browser,'preferences'),'utf8')).toBe('current lower');
  expect(v.profiles()[0].name).toBe('Current');expect(v.snapshots(p.id)).toEqual(before);expect(await readdir(join(browser,'..'))).toEqual(['browser']);
});
it('rejects edits during an in-flight state capture',async()=>{
  const {v,p}=await fixture();const pending=v.saveStateSnapshot(p.id);
  expect(()=>v.updateProfile(p.id,{name:'Concurrent change'})).toThrow(/busy/i);
  await pending;expect(v.profiles()[0].name).toBe('Baseline');
});
it('cancels a state worker on lock without committing a snapshot',async()=>{
  const {dir,v,p}=await fixture();const pending=v.saveStateSnapshot(p.id);
  const rejected=expect(pending).rejects.toThrow(/stopped|locked/i);v.close();await rejected;
  const reopened=await Vault.open(dir,passphrase);vaults.push(reopened);expect(reopened.snapshots(p.id)).toHaveLength(1);
});
