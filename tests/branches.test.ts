import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,readFile,writeFile,readdir,rm,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3-multiple-ciphers';
import {Vault} from '../packages/desktop/src/vault';
import {deriveMasterKey,openSnapshot} from '../packages/desktop/src/crypto';
import {openStateManifest} from '../packages/desktop/src/state-archive';
import {configurationDiff} from '../packages/desktop/src/profile-diff';
import {defaultVpn} from '../packages/shared/src/vpn';
const passphrase='correct horse battery staple';
const roots:string[]=[],vaults:Vault[]=[];
async function fixture(){const root=await mkdtemp(join(tmpdir(),'styg-branches-'));roots.push(root);const dir=join(root,'vault');const v=await Vault.create(dir,passphrase,{memoryMiB:64,iterations:2});vaults.push(v);const p=v.createProfile({name:'Research',tags:['production'],timezone:'Europe/Berlin'});return {dir,v,p,browser:join(dir,'profiles',p.id,'browser')};}
async function external<T>(dir:string,fn:(db:Database.Database,key:Buffer)=>T|Promise<T>){const meta=JSON.parse(await readFile(join(dir,'workspace.json'),'utf8'));const key=await deriveMasterKey(passphrase,Buffer.from(meta.salt,'hex'),meta.kdf);const db=new Database(join(dir,'workspace.db'));try{db.pragma("cipher='sqlcipher'");db.pragma('legacy=4');db.key(key);return await fn(db,key);}finally{key.fill(0);db.close();}}
afterEach(async()=>{for(const v of vaults.splice(0))v.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});

it('reports changed settings and added/removed tags without including identity metadata',()=>{
  const before={name:'Before',tags:['old','kept'],timezone:'UTC',language:'en-US',screen:'1920 × 1080',vpn:defaultVpn()} as const;
  const after={...before,name:'After',tags:['new','kept'],timezone:'Europe/Berlin'};
  expect(configurationDiff({...before,tags:[...before.tags]},after)).toEqual([
    {field:'name',kind:'modified',before:'Before',after:'After'},
    {field:'tags',kind:'removed',before:'old',after:null},
    {field:'tags',kind:'added',before:null,after:'new'},
    {field:'timezone',kind:'modified',before:'UTC',after:'Europe/Berlin'},
  ]);
});
it('previews a snapshot without mutating history and rejects a stale restore',async()=>{
  const {v,p}=await fixture();const baseline=v.snapshots(p.id)[0];v.updateProfile(p.id,{timezone:'UTC'});const history=v.snapshots(p.id);
  const preview=v.previewSnapshot(p.id,baseline.id);
  expect(preview.changes).toContainEqual({field:'timezone',kind:'modified',before:'UTC',after:'Europe/Berlin'});
  expect(v.snapshots(p.id)).toEqual(history);
  v.updateProfile(p.id,{language:'de-DE'});
  await expect(v.restoreSnapshot(p.id,baseline.id,preview.currentRevision)).rejects.toThrow(/changed|stale/i);
  expect(v.profiles()[0]).toMatchObject({timezone:'UTC',language:'de-DE'});
});
it('copies current files and retained history into a genuinely independent branch',async()=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'historical');const historical=await v.saveStateSnapshot(p.id);v.pin(p.id,historical.id,true);
  v.updateProfile(p.id,{language:'de-DE'});await writeFile(join(browser,'Preferences'),'fork-time');const parentHistory=v.snapshots(p.id);
  const branch=await v.createBranch(p.id,'test-timezone');const branchDir=join(dir,'profiles',branch.id,'browser');
  expect(branch).toMatchObject({parentProfileId:p.id,branchName:'test-timezone',language:'de-DE',tags:['production']});
  expect(await readFile(join(branchDir,'Preferences'),'utf8')).toBe('fork-time');
  expect(v.snapshots(branch.id)).toHaveLength(parentHistory.length+1);
  expect(v.snapshots(branch.id)[0]).toMatchObject({trigger:'fork',pinned:true,hasBrowserState:true});
  await writeFile(join(branchDir,'Preferences'),'branch-only');v.updateProfile(branch.id,{timezone:'Asia/Tokyo'});
  expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('fork-time');expect(v.profiles().find(x=>x.id===p.id)?.timezone).toBe('Europe/Berlin');
  expect(v.snapshots(p.id)).toEqual(parentHistory);
  const clonedHistory=v.snapshots(branch.id).find(s=>s.trigger==='manual')!;
  await v.restoreSnapshot(branch.id,clonedHistory.id);
  expect(await readFile(join(branchDir,'Preferences'),'utf8')).toBe('historical');
  await external(dir,(db,key)=>{
    const source=db.prepare('SELECT envelope,stateEnvelope FROM snapshots WHERE id=?').get(historical.id) as {envelope:Buffer;stateEnvelope:Buffer};
    const clone=db.prepare('SELECT envelope,stateEnvelope FROM snapshots WHERE id=?').get(clonedHistory.id) as {envelope:Buffer;stateEnvelope:Buffer};
    expect(clone.envelope).not.toEqual(source.envelope);expect(clone.stateEnvelope).not.toEqual(source.stateEnvelope);
    expect(()=>openSnapshot(clone.envelope,key,p.id,historical.id)).toThrow();
    expect(()=>openStateManifest(clone.stateEnvelope,key,p.id,historical.id)).toThrow();
    expect(openStateManifest(clone.stateEnvelope,key,branch.id,clonedHistory.id).files[0].bytes.toString()).toBe('historical');
  });
});
it('merges only environment settings and preserves a parent rollback snapshot',async()=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'parent bytes');const branch=await v.createBranch(p.id,'experiment');
  v.updateProfile(branch.id,{name:'Experiment',tags:['test'],timezone:'Asia/Tokyo',language:'de-DE',screen:'1440 × 900'});
  await writeFile(join(dir,'profiles',branch.id,'browser','Preferences'),'branch bytes');const preview=v.previewMerge(branch.id);
  expect(preview.changes.map(c=>c.field)).toEqual(['timezone','language','screen']);
  const merged=v.mergeBranch(branch.id,preview.branchRevision,preview.parentRevision);
  expect(merged).toMatchObject({id:p.id,name:'Research',tags:['production'],timezone:'Asia/Tokyo',language:'de-DE',screen:'1440 × 900'});
  expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('parent bytes');expect(v.profiles()).toHaveLength(2);
  const rollback=v.snapshots(p.id).find(s=>s.trigger==='pre_merge')!;expect(rollback.hasBrowserState).toBe(false);
  await v.restoreSnapshot(p.id,rollback.id);expect(v.profiles().find(x=>x.id===p.id)?.timezone).toBe('Europe/Berlin');
});
it('rejects merge confirmations after either profile changes',async()=>{
  const {v,p}=await fixture();const branch=await v.createBranch(p.id,'experiment');const preview=v.previewMerge(branch.id);
  v.updateProfile(p.id,{language:'fr-FR'});
  expect(()=>v.mergeBranch(branch.id,preview.branchRevision,preview.parentRevision)).toThrow(/changed|stale/i);
  const updated=v.previewMerge(branch.id);v.updateProfile(branch.id,{timezone:'UTC'});
  expect(()=>v.mergeBranch(branch.id,updated.branchRevision,updated.parentRevision)).toThrow(/changed|stale/i);
});
it('promotes without changing browser files or snapshot history',async()=>{
  const {dir,v,p}=await fixture();const branch=await v.createBranch(p.id,'standalone');const snapshots=v.snapshots(branch.id);
  const path=join(dir,'profiles',branch.id,'browser','Preferences');await writeFile(path,'keep');
  const promoted=v.promoteBranch(branch.id,branch.revision);
  expect(promoted).toMatchObject({parentProfileId:null,branchName:null});expect(promoted.revision).toBeGreaterThan(branch.revision);
  expect(v.snapshots(branch.id)).toEqual(snapshots);expect(await readFile(path,'utf8')).toBe('keep');
  await expect(v.discardBranch(branch.id,promoted.revision)).rejects.toThrow(/branch/i);
});
it('discards only the selected branch and refuses branches with descendants or active lock markers',async()=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'parent');const branch=await v.createBranch(p.id,'test');
  const child=await v.createBranch(branch.id,'nested');
  await expect(v.discardBranch(branch.id,branch.revision)).rejects.toThrow(/child|descendant/i);
  v.promoteBranch(child.id,child.revision);
  const branchDir=join(dir,'profiles',branch.id,'browser');await writeFile(join(branchDir,'SingletonLock'),'busy');
  await expect(v.discardBranch(branch.id,branch.revision)).rejects.toThrow(/browser|lock/i);
  await rm(join(branchDir,'SingletonLock'));await v.discardBranch(branch.id,branch.revision);
  expect(v.profiles().map(x=>x.id)).toEqual(expect.arrayContaining([p.id,child.id]));expect(v.profiles().some(x=>x.id===branch.id)).toBe(false);
  expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('parent');expect(await readdir(join(dir,'profiles'))).not.toContain(branch.id);
});
it('cleans failed forks without modifying parent history or leaving an extra profile',async()=>{
  const {dir,v,p}=await fixture();const state=await v.saveStateSnapshot(p.id);const before=v.snapshots(p.id);
  await external(dir,db=>db.prepare('UPDATE snapshots SET stateEnvelope=? WHERE id=?').run(Buffer.alloc(60,255),state.id));
  await expect(v.createBranch(p.id,'broken-copy')).rejects.toThrow();
  expect(v.profiles()).toHaveLength(1);expect(v.profiles()[0].id).toBe(p.id);
  expect(v.snapshots(p.id).map(s=>s.id)).toEqual(before.map(s=>s.id));expect(await readdir(join(dir,'profiles'))).toEqual([p.id]);
});
it('checks branch names and stale discard without side effects',async()=>{
  const {v,p}=await fixture();await expect(v.createBranch(p.id,' ')).rejects.toThrow();const branch=await v.createBranch(p.id,'Duplicate');
  await expect(v.createBranch(p.id,'duplicate')).rejects.toThrow(/name|unique/i);
  v.updateProfile(branch.id,{language:'fr-FR'});await expect(v.discardBranch(branch.id,branch.revision)).rejects.toThrow(/changed|stale/i);
  expect(v.profiles()).toHaveLength(2);
});

it('keeps every retained parent snapshot and adds a pinned fork point',async()=>{
  const {v,p}=await fixture();v.pin(p.id,v.snapshots(p.id)[0].id,true);
  for(let i=0;i<25;i++)v.updateProfile(p.id,{name:`Research ${i}`});
  const parent=v.snapshots(p.id);expect(parent).toHaveLength(21);
  const branch=await v.createBranch(p.id,'retained');const child=v.snapshots(branch.id);
  expect(child).toHaveLength(22);expect(child.filter(s=>!s.pinned)).toHaveLength(20);expect(child.filter(s=>s.pinned)).toHaveLength(2);
});
it('respects the 99-profile cap without leaking a fork reservation',async()=>{
  const {dir,v,p}=await fixture();for(let i=0;i<98;i++)v.createProfile({name:`P ${i}`});
  await expect(v.createBranch(p.id,'overflow')).rejects.toThrow(/99/);
  expect(v.profiles()).toHaveLength(99);expect(await readdir(join(dir,'profiles'))).toHaveLength(99);
});
it('cleans an interrupted fork reservation after locking cancels its worker',async()=>{
  const {dir,v,p}=await fixture();const pending=v.createBranch(p.id,'interrupted');const rejected=expect(pending).rejects.toThrow(/stopped|locked/i);v.close();await rejected;
  const reopened=await Vault.open(dir,passphrase);vaults.push(reopened);expect(reopened.profiles().map(x=>x.id)).toEqual([p.id]);
  expect(await readdir(join(dir,'profiles'))).toEqual([p.id]);
});
it('cleans an unactivated fork when the activation transaction fails',async()=>{
  const {dir,v,p}=await fixture();const before=v.snapshots(p.id);
  await external(dir,db=>db.exec("CREATE TRIGGER fail_activation BEFORE UPDATE ON profiles WHEN OLD.status='creating' AND NEW.status='ready' BEGIN SELECT RAISE(ABORT,'Forced activation failure'); END;"));
  await expect(v.createBranch(p.id,'failed')).rejects.toThrow(/Forced activation failure/);
  expect(v.profiles().map(x=>x.id)).toEqual([p.id]);expect(v.snapshots(p.id)).toEqual(before);expect(await readdir(join(dir,'profiles'))).toEqual([p.id]);
});
it('rolls back the parent snapshot and settings if a merge write fails',async()=>{
  const {dir,v,p}=await fixture();const branch=await v.createBranch(p.id,'test');v.updateProfile(branch.id,{timezone:'UTC'});const preview=v.previewMerge(branch.id),before=v.snapshots(p.id);
  await external(dir,db=>db.exec(`CREATE TRIGGER fail_merge BEFORE UPDATE ON profiles WHEN OLD.id='${p.id}' BEGIN SELECT RAISE(ABORT,'Forced merge failure'); END;`));
  expect(()=>v.mergeBranch(branch.id,preview.branchRevision,preview.parentRevision)).toThrow(/Forced merge failure/);
  expect(v.profiles().find(x=>x.id===p.id)?.timezone).toBe('Europe/Berlin');expect(v.snapshots(p.id)).toEqual(before);
});
it.each(['prepared','trashed','purged'])('resumes only a journaled branch discard on reopen: %s',async point=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'parent');const branch=await v.createBranch(p.id,'discard');const op=randomUUID();
  await external(dir,db=>db.transaction(()=>{db.prepare("UPDATE profiles SET status='deleting' WHERE id=?").run(branch.id);db.prepare('INSERT INTO discard_jobs VALUES(?,?)').run(branch.id,op);})());
  const source=join(dir,'profiles',branch.id),trash=join(dir,'profiles',`trash-${op}`);
  if(point!=='prepared')await rename(source,trash);if(point==='purged')await rm(trash,{recursive:true});v.close();
  const reopened=await Vault.open(dir,passphrase);vaults.push(reopened);expect(reopened.profiles().map(x=>x.id)).toEqual([p.id]);
  expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('parent');expect(await readdir(join(dir,'profiles'))).toEqual([p.id]);
});

it('migrates a v2 workspace with encrypted browser-state history',async()=>{
  const {mkdir}=await import('node:fs/promises');const {randomBytes}=await import('node:crypto');
  const {sealSnapshot}=await import('../packages/desktop/src/crypto');const {sealStateManifest}=await import('../packages/desktop/src/state-archive');
  const root=await mkdtemp(join(tmpdir(),'styg-v2-migration-'));roots.push(root);const dir=join(root,'vault');await mkdir(dir,{mode:0o700});
  const salt=randomBytes(32),params={memoryMiB:64,iterations:2} as const,key=await deriveMasterKey(passphrase,salt,params),pid=randomUUID(),sid=randomUUID();
  const config={name:'V2 profile',tags:['kept'],timezone:'UTC',language:'en-US',screen:'1920 × 1080'};
  const db=new Database(join(dir,'workspace.db'));
  try {
    db.pragma("cipher='sqlcipher'");db.pragma('legacy=4');db.key(key);
    db.exec('CREATE TABLE profiles(id TEXT PRIMARY KEY,config TEXT NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL); CREATE TABLE snapshots(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,profileId TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,timestamp INTEGER NOT NULL,trigger TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,envelope BLOB NOT NULL,stateEnvelope BLOB,fileCount INTEGER NOT NULL DEFAULT 0,stateBytes INTEGER NOT NULL DEFAULT 0,browserVersion TEXT); CREATE TABLE restore_jobs(profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,operationId TEXT NOT NULL); PRAGMA user_version=2;');
    db.prepare('INSERT INTO profiles VALUES(?,?,?,?)').run(pid,JSON.stringify(config),1,1);
    const state=sealStateManifest({version:1,directories:[],files:[{path:'Preferences',data:Buffer.from('v2 bytes').toString('base64')}]},key,pid,sid);
    db.prepare('INSERT INTO snapshots(id,profileId,timestamp,trigger,envelope,stateEnvelope,fileCount,stateBytes) VALUES(?,?,?,?,?,?,?,?)').run(sid,pid,1,'manual',sealSnapshot(config,key,pid,sid),state,1,8);
  }finally{key.fill(0);db.close();}
  await writeFile(join(dir,'workspace.json'),JSON.stringify({version:1,salt:salt.toString('hex'),kdf:params}));
  const v=await Vault.open(dir,passphrase);vaults.push(v);expect(v.profiles()[0]).toMatchObject({id:pid,parentProfileId:null,branchName:null,revision:1});
  await v.restoreSnapshot(pid,sid);expect(await readFile(join(dir,'profiles',pid,'browser','Preferences'),'utf8')).toBe('v2 bytes');
  const branch=await v.createBranch(pid,'migrated');expect(branch.parentProfileId).toBe(pid);
});
it('finishes an activated branch directory swap while retaining its ancestry',async()=>{
  const {StateStore}=await import('../packages/desktop/src/state-store');const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),'parent bytes');
  const branch=await v.createBranch(p.id,'activation');const fork=v.snapshots(branch.id).find(s=>s.trigger==='fork')!,op=randomUUID();
  const branchPath=join(dir,'profiles',branch.id,'browser');await writeFile(join(branchPath,'Preferences'),'current');
  await external(dir,async(db,key)=>{
    const row=db.prepare('SELECT stateEnvelope FROM snapshots WHERE id=?').get(fork.id) as {stateEnvelope:Buffer};const store=new StateStore(dir);
    try{await store.stage(branch.id,op,fork.id,row.stateEnvelope,key);}finally{store.close();}
    db.prepare('INSERT INTO restore_jobs VALUES(?,?)').run(branch.id,op);
  });
  await rename(branchPath,join(branchPath,'..',`previous-${op}`));v.close();
  const reopened=await Vault.open(dir,passphrase);vaults.push(reopened);
  expect(reopened.profiles().find(x=>x.id===branch.id)).toMatchObject({parentProfileId:p.id,branchName:'activation'});
  expect(await readFile(join(branchPath,'Preferences'),'utf8')).toBe('parent bytes');expect(await readFile(join(browser,'Preferences'),'utf8')).toBe('parent bytes');
});
it('preserves files and refuses unlock if an incomplete branch lacks its creation journal',async()=>{
  const {dir,v,p}=await fixture();const branch=await v.createBranch(p.id,'preserve');const path=join(dir,'profiles',branch.id,'browser','Preferences');await writeFile(path,'preserve');
  await external(dir,db=>db.prepare("UPDATE profiles SET status='creating' WHERE id=?").run(branch.id));v.close();
  await expect(Vault.open(dir,passphrase)).rejects.toThrow(/journal|recovery/i);expect(await readFile(path,'utf8')).toBe('preserve');
});
