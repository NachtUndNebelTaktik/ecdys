import {afterEach,describe,expect,it} from 'vitest';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink,link,stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {StateStore} from '../packages/desktop/src/state-store';
const temporary:string[]=[];
const stores:StateStore[]=[];
const key=Buffer.alloc(32,9);
async function fixture(){const root=await mkdtemp(join(tmpdir(),'styg-state-'));temporary.push(root);const store=new StateStore(root);stores.push(store);const id=randomUUID();const dir=await store.ensure(id);return {root,store,id,dir};}
afterEach(async()=>{for(const s of stores.splice(0))s.close();for(const p of temporary.splice(0))await rm(p,{recursive:true,force:true});});

describe('private profile directories',()=>{
  it('creates distinct private directories and rejects path-shaped IDs',async()=>{
    const {store,id,dir}=await fixture();const other=await store.ensure(randomUUID());
    expect(other).not.toBe(dir);expect(await store.ensure(id)).toBe(dir);
    expect((await stat(dir)).mode&0o777).toBe(0o700);
    await expect(store.ensure('../outside')).rejects.toThrow();
  });
  it('rejects a symlink at the profile boundary',async()=>{
    const {root,store}=await fixture();const id=randomUUID();
    await symlink(root,join(root,'profiles',id));
    await expect(store.ensure(id)).rejects.toThrow(/link|directory/i);
  });
});

describe('closed directory recovery',()=>{
  it('encrypts binary files and recovers them with empty directories into an identified staging area',async()=>{
    const {store,id,dir}=await fixture();
    await mkdir(join(dir,'Default','empty'),{recursive:true});
    const bytes=Buffer.from([0,255,10,0,81]);await writeFile(join(dir,'Default','Cookies'),bytes);
    await writeFile(join(dir,'Local State'),'sensitive-test-state');
    const snapshotId=randomUUID();const saved=await store.capture(id,snapshotId,key);
    expect(saved.fileCount).toBe(2);expect(saved.stateBytes).toBe(bytes.length+20);
    expect(saved.envelope.includes(Buffer.from('sensitive-test-state'))).toBe(false);
    await writeFile(join(dir,'Local State'),'changed');
    const operationId=randomUUID();await store.stage(id,operationId,snapshotId,saved.envelope,key);
    expect(await readFile(join(dir,'Local State'),'utf8')).toBe('changed');
    await store.finishRestore(id,operationId);
    expect(await readFile(join(dir,'Local State'),'utf8')).toBe('sensitive-test-state');
    expect(await readFile(join(dir,'Default','Cookies'))).toEqual(bytes);
    expect(await readdir(join(dir,'Default','empty'))).toEqual([]);
  });
  it('rejects wrong profile identity and tampering before replacing current files',async()=>{
    const {store,id,dir}=await fixture();await writeFile(join(dir,'Preferences'),'original');
    const sid=randomUUID();const saved=await store.capture(id,sid,key);
    const damaged=Buffer.from(saved.envelope);damaged[damaged.length-8]^=1;
    await expect(store.stage(id,randomUUID(),sid,damaged,key)).rejects.toThrow();
    const other=randomUUID();await store.ensure(other);
    await expect(store.stage(other,randomUUID(),sid,saved.envelope,key)).rejects.toThrow();
    expect(await readFile(join(dir,'Preferences'),'utf8')).toBe('original');
  });
  it('refuses to capture or replace a directory with browser lock markers',async()=>{
    const {store,id,dir}=await fixture();const sid=randomUUID();const saved=await store.capture(id,sid,key);
    await writeFile(join(dir,'SingletonLock'),'1234');
    await expect(store.capture(id,randomUUID(),key)).rejects.toThrow(/close.*browser|lock/i);
    await expect(store.stage(id,randomUUID(),sid,saved.envelope,key)).rejects.toThrow(/close.*browser|lock/i);
  });
  it('rejects symbolic and hard links rather than backing up external bytes',async()=>{
    const {root,store,id,dir}=await fixture();await writeFile(join(root,'outside'),'private');
    await symlink(join(root,'outside'),join(dir,'linked'));
    await expect(store.capture(id,randomUUID(),key)).rejects.toThrow(/link/i);
    await rm(join(dir,'linked'));await link(join(root,'outside'),join(dir,'hard-linked'));
    await expect(store.capture(id,randomUUID(),key)).rejects.toThrow(/link/i);
  });
  it('recovers when interrupted after moving the old directory aside',async()=>{
    const {store,id,dir}=await fixture();await writeFile(join(dir,'Preferences'),'baseline');
    const sid=randomUUID();const saved=await store.capture(id,sid,key);
    await writeFile(join(dir,'Preferences'),'current');const op=randomUUID();await store.stage(id,op,sid,saved.envelope,key);
    const {rename}=await import('node:fs/promises');await rename(dir,join(dir,'..',`previous-${op}`));
    await store.finishRestore(id,op);
    expect(await readFile(join(dir,'Preferences'),'utf8')).toBe('baseline');
  });
});

it.each(['../escaped','/absolute','C:/outside','Default/../../escaped','Default\\escaped','Default/CON'])('rejects authenticated unsafe manifest path %s before staging',async path=>{
  const {store,id,dir}=await fixture();const sid=randomUUID(),op=randomUUID();
  const {sealStateManifest}=await import('../packages/desktop/src/state-archive');
  const envelope=sealStateManifest({version:1,directories:[],files:[{path,data:Buffer.from('outside').toString('base64')}]},key,id,sid);
  await expect(store.stage(id,op,sid,envelope,key)).rejects.toThrow(/path|parent/i);
  expect(await readdir(dir)).toEqual([]);
  expect(await readdir(join(dir,'..'))).toEqual(['browser']);
});
it('rejects duplicate case-folded paths and excessive archive entries',async()=>{
  const {store,id}=await fixture();const sid=randomUUID();const {sealStateManifest}=await import('../packages/desktop/src/state-archive');
  const duplicate=sealStateManifest({version:1,directories:[],files:[{path:'Preferences',data:''},{path:'preferences',data:''}]},key,id,sid);
  await expect(store.stage(id,randomUUID(),sid,duplicate,key)).rejects.toThrow(/duplicate/i);
  const many=sealStateManifest({version:1,directories:Array.from({length:4097},(_,i)=>`folder-${i}`),files:[]},key,id,sid);
  await expect(store.stage(id,randomUUID(),sid,many,key)).rejects.toThrow(/4096/);
});
it('refuses an existing staging operation without deleting its files',async()=>{
  const {store,id,dir}=await fixture();const sid=randomUUID(),op=randomUUID();const saved=await store.capture(id,sid,key);
  await store.stage(id,op,sid,saved.envelope,key);
  const stage=join(dir,'..',`restore-${op}`);
  await expect(store.stage(id,op,sid,saved.envelope,key)).rejects.toThrow();
  expect(await readFile(join(stage,'.styg-restore-token'),'utf8')).toBe(op);
});

it('rejects an oversized sparse file before reading its contents',async()=>{
  const {store,id,dir}=await fixture();const {truncate}=await import('node:fs/promises');
  const path=join(dir,'oversized');await writeFile(path,'');await truncate(path,64*1024*1024+1);
  await expect(store.capture(id,randomUUID(),key)).rejects.toThrow(/64 MiB/);
});

it.skipIf(process.platform!=='linux')('refuses source paths that would collide during archive validation',async()=>{
  const {store,id,dir}=await fixture();await writeFile(join(dir,'Preferences'),'A');await writeFile(join(dir,'preferences'),'B');
  await expect(store.capture(id,randomUUID(),key)).rejects.toThrow(/duplicate/i);
});
