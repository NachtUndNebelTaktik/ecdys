import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3-multiple-ciphers';
import {Vault} from '../packages/desktop/src/vault';
import {StateStore} from '../packages/desktop/src/state-store';
import {deriveMasterKey,sealSnapshot} from '../packages/desktop/src/crypto';
import {sealStateManifest} from '../packages/desktop/src/state-archive';

const passphrase='correct horse battery staple';
const secret='rehearsal-private-canary';
const roots:string[]=[],vaults:Vault[]=[];
async function fixture() {
  const root=await mkdtemp(join(tmpdir(),'styg-rehearsal-'));roots.push(root);
  const dir=join(root,'vault'),v=await Vault.create(dir,passphrase,{memoryMiB:64,iterations:2});vaults.push(v);
  const p=v.createProfile({name:'Saved profile',timezone:'Europe/Berlin'});
  return {dir,v,p,browser:join(dir,'profiles',p.id,'browser')};
}
async function external<T>(dir:string,fn:(db:Database.Database,key:Buffer)=>T|Promise<T>) {
  const meta=JSON.parse(await readFile(join(dir,'workspace.json'),'utf8'));
  const key=await deriveMasterKey(passphrase,Buffer.from(meta.salt,'hex'),meta.kdf),db=new Database(join(dir,'workspace.db'));
  try{db.pragma("cipher='sqlcipher'");db.pragma('legacy=4');db.key(key);return await fn(db,key);}
  finally{key.fill(0);db.close();}
}
async function tree(root:string):Promise<unknown[]> {
  const entries:unknown[]=[];
  async function visit(path:string) {
    const info=await lstat(path);
    entries.push([relative(root,path),info.mode,info.mtimeMs,info.isDirectory()?null:createHash('sha256').update(await readFile(path)).digest('hex')]);
    if(info.isDirectory())for(const name of (await readdir(path)).sort())await visit(join(path,name));
  }
  await visit(root);return entries;
}
afterEach(async()=>{for(const v of vaults.splice(0))v.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});

it('checks configuration-only recovery without creating missing profile directories or changing saved data',async()=>{
  const {dir,v,p,browser}=await fixture(),snapshot=v.snapshots(p.id)[0];
  v.updateProfile(p.id,{name:'Current profile'});await rm(join(browser,'..'),{recursive:true});
  const profiles=v.profiles(),history=v.snapshots(p.id),before=await tree(dir),started=Date.now();
  const report=await v.rehearseSnapshot(p.id,snapshot.id);
  expect(report).toEqual({profileId:p.id,snapshotId:snapshot.id,checkedAt:expect.any(Number),coverage:'configuration_only',fileCount:0,directoryCount:0,stateBytes:0,browserVersion:null});
  expect(report.checkedAt).toBeGreaterThanOrEqual(started);expect(report.checkedAt).toBeLessThanOrEqual(Date.now());
  expect(v.profiles()).toEqual(profiles);expect(v.snapshots(p.id)).toEqual(history);expect(await tree(dir)).toEqual(before);
});

it('counts authenticated browser contents rather than cached metadata and returns no contents or configuration',async()=>{
  const {dir,v,p,browser}=await fixture();await mkdir(join(browser,'Default','empty'),{recursive:true});
  await writeFile(join(browser,'Default','Cookies'),Buffer.from([0,255,10,0,81]));await writeFile(join(browser,'Local State'),secret);
  const saved=await v.saveStateSnapshot(p.id);
  await external(dir,db=>db.prepare('UPDATE snapshots SET fileCount=99,stateBytes=999,browserVersion=? WHERE id=?').run('146.0.0.0',saved.id));
  v.updateProfile(p.id,{name:'Current profile'});await writeFile(join(browser,'Local State'),'current bytes');
  await writeFile(join(browser,'SingletonLock'),'running-browser');
  const history=v.snapshots(p.id),profiles=v.profiles(),before=await tree(dir);
  const report=await v.rehearseSnapshot(p.id,saved.id);
  expect(report).toEqual({profileId:p.id,snapshotId:saved.id,checkedAt:expect.any(Number),coverage:'configuration_and_browser_state',fileCount:2,directoryCount:2,stateBytes:29,browserVersion:'146.0.0.0'});
  expect(JSON.stringify(report)).not.toMatch(/rehearsal-private-canary|Cookies|Local State|Saved profile|Berlin/);
  expect(v.profiles()).toEqual(profiles);expect(v.snapshots(p.id)).toEqual(history);expect(await tree(dir)).toEqual(before);
});

it('reports an authenticated empty browser archive as full coverage',async()=>{
  const {v,p}=await fixture(),saved=await v.saveStateSnapshot(p.id);
  expect(await v.rehearseSnapshot(p.id,saved.id)).toMatchObject({coverage:'configuration_and_browser_state',fileCount:0,directoryCount:0,stateBytes:0});
});

it.each(['configuration envelope','browser envelope','configuration profile identity','configuration snapshot identity','browser profile identity','browser snapshot identity','authenticated configuration','authenticated archive path'])('rejects invalid %s with a safe error and unchanged files/history',async kind=>{
  const {dir,v,p,browser}=await fixture();await writeFile(join(browser,'Preferences'),secret);const saved=await v.saveStateSnapshot(p.id);
  await external(dir,(db,key)=>{
    let column='envelope',envelope:Buffer;
    if(kind==='configuration envelope')envelope=Buffer.from(`malformed-json-${secret}`);
    else if(kind==='browser envelope'){column='stateEnvelope';envelope=Buffer.from(`malformed-json-${secret}`);}
    else if(kind==='authenticated configuration'||kind.startsWith('configuration ')) {
      const config=kind==='authenticated configuration'?{name:'Valid name',[secret]:true}:{name:'Saved profile'};
      envelope=sealSnapshot(config,key,kind==='configuration profile identity'?randomUUID():p.id,kind==='configuration snapshot identity'?randomUUID():saved.id);
    }else {
      column='stateEnvelope';envelope=sealStateManifest({version:1,directories:[],files:[{path:kind==='authenticated archive path'?`../${secret}`:'Preferences',data:Buffer.from(secret).toString('base64')}]},key,kind==='browser profile identity'?randomUUID():p.id,kind==='browser snapshot identity'?randomUUID():saved.id);
    }
    db.prepare(`UPDATE snapshots SET ${column}=? WHERE id=?`).run(envelope,saved.id);
  });
  const history=v.snapshots(p.id),profiles=v.profiles(),before=await tree(dir);
  const error=await v.rehearseSnapshot(p.id,saved.id).then(()=>null,error=>error as Error);
  expect(error).toBeInstanceOf(Error);expect(error!.message).toMatch(/recovery.*(failed|unable)|unable.*recovery/i);
  expect(error!.message).not.toContain(secret);expect(error!.message).not.toMatch(/JSON|Zod|unrecognized_keys|at position/);
  expect(v.profiles()).toEqual(profiles);expect(v.snapshots(p.id)).toEqual(history);expect(await tree(dir)).toEqual(before);
});

it('rejects authenticated archive content changed after encryption',async()=>{
  const {dir,v,p}=await fixture(),saved=await v.saveStateSnapshot(p.id);
  await external(dir,db=>{
    const row=db.prepare('SELECT stateEnvelope FROM snapshots WHERE id=?').get(saved.id) as {stateEnvelope:Buffer};
    const object=JSON.parse(row.stateEnvelope.toString()),bytes=Buffer.from(object.payload,'base64');bytes[bytes.length-1]^=1;object.payload=bytes.toString('base64');
    db.prepare('UPDATE snapshots SET stateEnvelope=? WHERE id=?').run(Buffer.from(JSON.stringify(object)),saved.id);
  });
  await expect(v.rehearseSnapshot(p.id,saved.id)).rejects.toThrow(/recovery/i);
});

it('rejects snapshots from another profile and missing snapshots',async()=>{
  const {v,p}=await fixture(),other=v.createProfile({name:'Other'}),snapshot=v.snapshots(p.id)[0];
  await expect(v.rehearseSnapshot(other.id,snapshot.id)).rejects.toThrow(/snapshot/i);
  await expect(v.rehearseSnapshot(p.id,randomUUID())).rejects.toThrow(/snapshot/i);
});

it('allows only one rehearsal per workspace and releases its slot after completion and failure',async()=>{
  const {dir,v,p}=await fixture(),other=v.createProfile({name:'Other'}),snapshot=v.snapshots(p.id)[0],otherSnapshot=v.snapshots(other.id)[0];
  const pending=v.rehearseSnapshot(p.id,snapshot.id);
  await expect(v.rehearseSnapshot(other.id,otherSnapshot.id)).rejects.toThrow(/already|progress|busy/i);await pending;
  await external(dir,db=>db.prepare('UPDATE snapshots SET envelope=? WHERE id=?').run(Buffer.from(secret),snapshot.id));
  await expect(v.rehearseSnapshot(p.id,snapshot.id)).rejects.toThrow(/recovery/i);
  expect((await v.rehearseSnapshot(other.id,otherSnapshot.id)).coverage).toBe('configuration_only');
});

it.each(['removed','replaced'])('rejects a snapshot %s while its worker is checking it',async change=>{
  const {dir,v,p}=await fixture(),snapshot=v.snapshots(p.id)[0];
  await external(dir,async db=>{
    const pending=v.rehearseSnapshot(p.id,snapshot.id),rejection=expect(pending).rejects.toThrow(/snapshot|changed|recovery/i);
    if(change==='removed')db.prepare('DELETE FROM snapshots WHERE id=?').run(snapshot.id);
    else db.prepare('UPDATE snapshots SET envelope=? WHERE id=?').run(Buffer.from(secret),snapshot.id);
    await rejection;
  });
});

it('cancels the actual state worker on lock and does not publish a report or alter history',async()=>{
  const {dir,v,p}=await fixture(),history=v.snapshots(p.id),pending=v.rehearseSnapshot(p.id,history[0].id);
  const rejected=expect(pending).rejects.toThrow(/stopped|locked|cancel/i);v.close();await rejected;
  const reopened=await Vault.open(dir,passphrase);vaults.push(reopened);expect(reopened.snapshots(p.id)).toEqual(history);
  await expect(v.rehearseSnapshot(p.id,history[0].id)).rejects.toThrow(/locked/i);
});

it('terminates a read-only StateStore check when the store closes',async()=>{
  const {dir,p}=await fixture(),key=Buffer.alloc(32,7),snapshotId=randomUUID(),store=new StateStore(dir);
  const envelope=sealSnapshot({name:'Saved profile'},key,p.id,snapshotId);
  try {
    const pending=store.rehearse(p.id,snapshotId,envelope,null,key),rejected=expect(pending).rejects.toThrow(/stopped|locked|cancel/i);
    store.close();await rejected;
  }finally{store.close();key.fill(0);}
});
