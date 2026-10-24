import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Vault} from '../packages/desktop/src/vault';
import {ProfileInput,ProfilePatch,Request} from '../packages/shared/src/model';
import Database from 'better-sqlite3-multiple-ciphers';
import {deriveMasterKey,openSnapshot,sealSnapshot} from '../packages/desktop/src/crypto';
import {openCredential} from '../packages/desktop/src/vpn/credentials';

const roots:string[]=[],vaults:Vault[]=[];
async function create(){const root=await mkdtemp(join(tmpdir(),'styg-vpn-'));roots.push(root);const dir=join(root,'vault');const v=await Vault.create(dir,'test-only secure passphrase',{memoryMiB:64,iterations:2});vaults.push(v);return {v,dir};}
afterEach(async()=>{for(const v of vaults.splice(0))v.close();for(const dir of roots.splice(0))await rm(dir,{recursive:true,force:true});});
const vpn={provider:'mullvad',endpoint:'se-got-wg-001',rotation:'every_5',routeLock:true} as const;

it('defaults old configuration to no VPN while partial edits preserve saved VPN settings',()=>{
  expect(ProfileInput.parse({name:'Old profile'})).toHaveProperty('vpn',{provider:'none',endpoint:null,rotation:'manual',routeLock:true});
  expect(ProfilePatch.parse({name:'Renamed'})).not.toHaveProperty('vpn');
  expect(()=>ProfilePatch.parse({vpn:{...vpn,routeLock:false}})).toThrow();
});
it('restores, forks and merges VPN settings with configuration rollback points',async()=>{
  const {v}=await create();const p=v.createProfile({name:'Parent'});const baseline=v.snapshots(p.id)[0];
  v.updateProfile(p.id,{vpn});v.updateProfile(p.id,{name:'Renamed'});
  expect(v.profiles()[0].vpn).toEqual(vpn);
  const branch=await v.createBranch(p.id,'vpn-test');expect(branch.vpn).toEqual(vpn);
  const changed={...vpn,provider:'ivpn',endpoint:'at1.wg.ivpn.net'} as const;
  v.updateProfile(branch.id,{vpn:changed});const preview=v.previewMerge(branch.id);
  expect(preview.changes.some(c=>c.field==='vpn')).toBe(true);
  expect(v.mergeBranch(branch.id,preview.branchRevision,preview.parentRevision).vpn).toEqual(changed);
  const history=v.snapshots(p.id);const rollback=history.find(s=>s.trigger==='pre_merge')!;
  v.restore(p.id,rollback.id);expect(v.profiles().find(x=>x.id===p.id)!.vpn).toEqual(vpn);
  v.restore(p.id,baseline.id);expect(v.profiles().find(x=>x.id===p.id)!.vpn.provider).toBe('none');
});
it('stores credentials without read-back and persists presence across lock/reopen',async()=>{
  const {v,dir}=await create();
  v.saveVpnCredential('mullvad','1234567890123456');
  v.saveVpnCredential('ivpn','i-ABCD-EFGH-IJKL');
  expect(v.vpnCredentials()).toEqual({mullvad:true,ivpn:true});
  expect(JSON.stringify(v.vpnCredentials())).not.toContain('1234567890123456');
  expect(()=>v.saveVpnCredential('ivpn','wrong')).toThrow(/account/i);
  expect(v.vpnCredentials()).toEqual({mullvad:true,ivpn:true});
  v.close();expect((await readFile(join(dir,'workspace.db'))).includes(Buffer.from('1234567890123456'))).toBe(false);
  expect(()=>v.vpnCredentials()).toThrow(/locked/i);
  const next=await Vault.open(dir,'test-only secure passphrase');vaults.push(next);
  expect(next.vpnCredentials()).toEqual({mullvad:true,ivpn:true});next.clearVpnCredential('mullvad');
  expect(next.vpnCredentials()).toEqual({mullvad:false,ivpn:true});
});
it('does not accept secret read-back, arbitrary catalog URLs or route unlock requests',()=>{
  for(const action of [{action:'getVpnCredential',provider:'mullvad'},{action:'vpnCatalog',provider:'mullvad',url:'https://example.com'},{action:'vpnCatalog',provider:'custom_socks5'}])expect(()=>Request.parse(action)).toThrow();
});
async function database(dir:string,action:(db:Database.Database,key:Buffer)=>void){
  const meta=JSON.parse(await readFile(join(dir,'workspace.json'),'utf8'));const key=await deriveMasterKey('test-only secure passphrase',Buffer.from(meta.salt,'hex'),meta.kdf);
  const db=new Database(join(dir,'workspace.db'));
  try{db.pragma("cipher='sqlcipher'");db.pragma('legacy=4');db.key(key);action(db,key);}finally{db.close();key.fill(0);}
}
it('adds credential storage to a v3 workspace without changing old profiles or history',async()=>{
  const {v,dir}=await create();const p=v.createProfile({name:'Existing profile'});const baseline=v.snapshots(p.id)[0];v.close();
  await database(dir,(db,key)=>{
    const legacy={name:'Existing profile',tags:[],timezone:'UTC',language:'en-US',screen:'1920 × 1080'};
    db.prepare('UPDATE profiles SET config=? WHERE id=?').run(JSON.stringify(legacy),p.id);
    db.prepare('UPDATE snapshots SET envelope=? WHERE id=?').run(sealSnapshot(legacy,key,p.id,baseline.id),baseline.id);
    db.exec('DROP TABLE vpn_credentials; PRAGMA user_version=3;');
  });
  const next=await Vault.open(dir,'test-only secure passphrase');vaults.push(next);
  expect(next.profiles()[0]).toMatchObject({id:p.id,name:'Existing profile'});expect(next.snapshots(p.id)[0].id).toBe(baseline.id);
  next.saveVpnCredential('mullvad','1234567890123456');expect(next.vpnCredentials().mullvad).toBe(true);
  next.updateProfile(p.id,{vpn});next.restore(p.id,baseline.id);
  expect(next.profiles()[0].vpn).toEqual({provider:'none',endpoint:null,rotation:'manual',routeLock:true});
  await database(dir,db=>expect(db.pragma('user_version',{simple:true})).toBe(4));
});
it('encrypts the credential even inside an unlocked database and excludes it from configuration snapshots',async()=>{
  const {v,dir}=await create();const p=v.createProfile({name:'Private account'});
  v.saveVpnCredential('mullvad','1234567890123456');v.updateProfile(p.id,{vpn});
  await database(dir,(db,key)=>{
    const row=db.prepare('SELECT envelope FROM vpn_credentials WHERE provider=?').get('mullvad') as {envelope:Buffer};
    expect(row.envelope.includes(Buffer.from('1234567890123456'))).toBe(false);
    expect(openCredential(row.envelope,key,'mullvad')).toBe('1234567890123456');
    for(const snapshot of db.prepare('SELECT id,envelope FROM snapshots WHERE profileId=?').all(p.id) as {id:string;envelope:Buffer}[])expect(JSON.stringify(openSnapshot(snapshot.envelope,key,p.id,snapshot.id))).not.toContain('1234567890123456');
  });
});
