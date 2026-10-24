import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Vault} from '../packages/desktop/src/vault';
import {ProviderClient} from '../packages/desktop/src/vpn/provider-client';
import {ProviderSetup} from '../packages/desktop/src/vpn/provider-setup';
import {ProviderCatalog} from '../packages/desktop/src/vpn/catalog';
import {Request} from '../packages/shared/src/model';
const roots:string[]=[],vaults:Vault[]=[];const pass='test-only provider workspace';
const id='11111111-1111-4111-8111-111111111111',future='2027-01-01T00:00:00Z',now=Date.parse('2026-10-24T00:00:00Z');
const pub=Buffer.alloc(32,9).toString('base64');
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'styg-provider-'));roots.push(root);const dir=join(root,'vault');const v=await Vault.create(dir,pass,{memoryMiB:64,iterations:2});vaults.push(v);
  v.saveVpnCredential('mullvad','1234567890123456');v.saveVpnCredential('ivpn','i-ABCD-EFGH-IJKL');
  const state={devices:[] as {id:string;pubkey:string}[],mullvadCreates:0,ivpnCreates:0,ivpnChecks:0,deletes:[] as string[],ambiguous:false,limit:false,rejectRecheck:false,loseDeleteResponse:false,wait:undefined as undefined|(()=>Promise<Response>)};
  const transport=async(url:string,init:RequestInit)=>{
    if(state.wait)return state.wait();const body=init.body?JSON.parse(init.body as string):{};
    if(url.endsWith('/auth/v1/token'))return Response.json({access_token:'fixture-access-token',expiry:future});
    if(url.endsWith('/accounts/me'))return Response.json({expiry:future});
    if(init.method==='DELETE'||url.endsWith('/session/delete')){state.deletes.push(url);if(state.loseDeleteResponse)throw new Error('lost removal response');return init.method==='DELETE'?new Response(null,{status:204}):Response.json({status:200});}
    if(url.endsWith('/devices')&&init.method==='POST'){if(state.limit)return Response.json({code:'MAX_DEVICES_REACHED'},{status:400});state.mullvadCreates++;state.devices=[{id,pubkey:body.pubkey}];if(state.ambiguous)throw new Error('lost response');return Response.json({...state.devices[0],ipv4_address:'10.64.0.2/32',ipv6_address:'fc00::2/128'},{status:201});}
    if(url.endsWith('/devices'))return Response.json(state.devices);
    if(url.endsWith('/devices/'+id)){if(state.rejectRecheck)return Response.json({code:'DEVICE_NOT_FOUND'},{status:404});return Response.json({...state.devices[0],ipv4_address:'10.64.0.2/32',ipv6_address:'fc00::2/128'});}
    if(url.endsWith('/session/new')){state.ivpnCreates++;if(state.ambiguous)throw new Error('lost response');return Response.json({status:200,token:'fixture-session-token',service_status:{is_active:true,active_until:Date.parse(future)/1000},wireguard:{status:200,ip_address:'172.16.0.2'}});}
    if(url.endsWith('/session/status')){state.ivpnChecks++;return Response.json(state.rejectRecheck?{status:601}:{status:200,service_status:{is_active:true,active_until:Date.parse(future)/1000}});}
    throw new Error('Unexpected provider fixture path');
  };
  const catalog=new ProviderCatalog(async()=>Response.json({locations:{'se-got':{country:'Sweden',city:'Gothenburg'}},wireguard:{relays:[{hostname:'se-got-wg-001',active:true,location:'se-got',ipv4_addr_in:'198.51.100.10',public_key:pub}]}}),()=>now);
  const client=new ProviderClient(transport,()=>now),setup=new ProviderSetup(v,client,catalog,()=>now);
  return {v,dir,state,setup,client,catalog};
}
afterEach(async()=>{for(const v of vaults.splice(0))v.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
it('registers once, reuses across reopen and never returns secrets in status or preview',async()=>{
  const {v,dir,state,setup,client,catalog}=await fixture();
  const p=v.createProfile({name:'Route planning',vpn:{provider:'mullvad',endpoint:'se-got-wg-001',rotation:'manual',routeLock:true}});
  expect(await setup.prepare('mullvad')).toMatchObject({phase:'registered',account:'active'});
  const stored=v.readVpnRegistration('mullvad')!;expect(stored.privateKey).toHaveLength(44);const key=stored.publicKey;
  const preview=await setup.preview(p.id);expect(preview).toMatchObject({provider:'mullvad',hostname:'se-got-wg-001',port:51820,peerIp:'198.51.100.10',route:'blocked'});
  expect(JSON.stringify([v.vpnRegistrationStatus('mullvad'),preview])).not.toMatch(/privateKey|fixture-access-token|1234567890123456/);
  await setup.prepare('mullvad');expect(state.mullvadCreates).toBe(1);setup.cancel();v.close();
  expect((await readFile(join(dir,'workspace.db'))).includes(Buffer.from(stored.privateKey))).toBe(false);
  const next=await Vault.open(dir,pass);vaults.push(next);const reopened=new ProviderSetup(next,client,catalog,()=>now);
  await reopened.prepare('mullvad');expect(state.mullvadCreates).toBe(1);expect(next.readVpnRegistration('mullvad')!.publicKey).toBe(key);
});
it('reconciles an ambiguous Mullvad create by the retained public key without another creation',async()=>{
  const {v,state,setup}=await fixture();state.ambiguous=true;
  await expect(setup.prepare('mullvad')).rejects.toThrow();expect(v.vpnRegistrationStatus('mullvad').phase).toBe('pending');
  state.ambiguous=false;await setup.prepare('mullvad');expect(state.mullvadCreates).toBe(1);expect(v.vpnRegistrationStatus('mullvad').phase).toBe('registered');
});
it('preserves earlier Mullvad uncertainty when a later reconciliation attempt reaches the device limit',async()=>{
  const {v,state,setup}=await fixture();state.ambiguous=true;await expect(setup.prepare('mullvad')).rejects.toThrow();
  state.ambiguous=false;state.devices=[];state.limit=true;await expect(setup.prepare('mullvad')).rejects.toThrow(/limit/i);
  expect(v.vpnRegistrationStatus('mullvad').phase).toBe('pending');await expect(setup.remove('mullvad')).rejects.toThrow(/uncertain/i);
});
it('never automatically retries an ambiguous IVPN create and requires explicit reviewed reset',async()=>{
  const {v,state,setup}=await fixture();state.ambiguous=true;
  await expect(setup.prepare('ivpn')).rejects.toThrow();expect(v.vpnRegistrationStatus('ivpn').phase).toBe('pending');
  state.ambiguous=false;await expect(setup.prepare('ivpn')).rejects.toThrow(/review/i);expect(state.ivpnCreates).toBe(1);
  expect(()=>setup.resetUncertain('ivpn',false)).toThrow();setup.resetUncertain('ivpn',true);
  await setup.prepare('ivpn');await setup.prepare('ivpn');expect(state.ivpnCreates).toBe(2);expect(state.ivpnChecks).toBe(1);
});
it('blocks account replacement/removal until the Styg registration is removed',async()=>{
  const {v,state,setup}=await fixture();await setup.prepare('ivpn');
  expect(()=>v.saveVpnCredential('ivpn','i-MNOP-QRST-UVWX')).toThrow(/registration/i);
  expect(()=>v.clearVpnCredential('ivpn')).toThrow(/registration/i);
  await setup.remove('ivpn');expect(state.deletes).toHaveLength(1);v.clearVpnCredential('ivpn');expect(v.vpnCredentials().ivpn).toBe(false);
});
it('removes only the tracked Mullvad device and preserves unrelated provider devices',async()=>{
  const {state,setup}=await fixture();await setup.prepare('mullvad');state.devices.push({id:'22222222-2222-4222-8222-222222222222',pubkey:pub});
  await setup.remove('mullvad');expect(state.deletes).toEqual(['https://api.mullvad.net/accounts/v1/devices/'+id]);
});
it('refuses to delete a device whose public key was replaced externally',async()=>{
  const {state,setup}=await fixture();await setup.prepare('mullvad');state.devices[0].pubkey=pub;
  await expect(setup.remove('mullvad')).rejects.toThrow();expect(state.deletes).toEqual([]);
});
it('cancels slow provider I/O promptly, refuses overlap and ignores late completions after lock',async()=>{
  const {v,state,setup}=await fixture();let finish!:(value:Response)=>void;
  state.wait=()=>new Promise(resolve=>{finish=resolve;});const operation=setup.prepare('ivpn');
  await expect(setup.prepare('ivpn')).rejects.toThrow(/in progress/i);setup.cancel();v.close();
  await expect(operation).rejects.toThrow(/cancel/i);finish(Response.json({status:200,token:'late-token'}));
  await new Promise(resolve=>setTimeout(resolve,0));expect(()=>v.vpnRegistrationStatus('ivpn')).toThrow(/locked/i);
});
it('refuses previews for unconfigured profiles and endpoints absent from the current catalog',async()=>{
  const {v,setup}=await fixture();const p=v.createProfile({name:'No route'});await expect(setup.preview(p.id)).rejects.toThrow();
  v.updateProfile(p.id,{vpn:{provider:'mullvad',endpoint:'absent-host',rotation:'manual',routeLock:true}});await setup.prepare('mullvad');await expect(setup.preview(p.id)).rejects.toThrow(/catalog/i);
});
it('rejects a stale account check and profile changes while fetching tunnel metadata',async()=>{
  const {v,setup,client,catalog}=await fixture();const p=v.createProfile({name:'Changing route',vpn:{provider:'mullvad',endpoint:'se-got-wg-001',rotation:'manual',routeLock:true}});await setup.prepare('mullvad');
  await expect(new ProviderSetup(v,client,catalog,()=>now+3600000).preview(p.id)).rejects.toThrow(/Recheck/);
  let finish!:(response:Response)=>void;const delayedCatalog=new ProviderCatalog(()=>new Promise(resolve=>{finish=resolve;}),()=>now);
  const pending=new ProviderSetup(v,client,delayedCatalog,()=>now).preview(p.id);v.updateProfile(p.id,{name:'Changed'});
  finish(Response.json({locations:{'se-got':{country:'Sweden',city:'Gothenburg'}},wireguard:{relays:[{hostname:'se-got-wg-001',active:true,location:'se-got',ipv4_addr_in:'198.51.100.10',public_key:pub}]}}));
  await expect(pending).rejects.toThrow(/Profile changed/);
});
it('does not allow renderer-controlled registration material, forced login or tunnel activation',()=>{
  for(const request of [{action:'prepareVpnRegistration',provider:'ivpn',acknowledgeSlot:true,force:true},{action:'prepareVpnRegistration',provider:'ivpn'},{action:'saveVpnRegistration',privateKey:'secret'},{action:'activateTunnel',id:'11111111-1111-4111-8111-111111111111'}])expect(()=>Request.parse(request)).toThrow();
});
it.each(['mullvad','ivpn'] as const)('invalidates preparation approval after a failed %s registration recheck while retaining removal material',async provider=>{
  const {v,state,setup}=await fixture();await setup.prepare(provider);const original=v.readVpnRegistration(provider)!;
  state.rejectRecheck=true;await expect(setup.prepare(provider)).rejects.toThrow();
  expect(v.vpnRegistrationStatus(provider)).toMatchObject({phase:'registered',account:'unchecked',checkedAt:null});
  expect(v.readVpnRegistration(provider)).toMatchObject({privateKey:original.privateKey,publicKey:original.publicKey,remote:original.remote});
  const p=v.createProfile({name:'Rejected registration',vpn:{provider,endpoint:provider==='mullvad'?'se-got-wg-001':'at1.wg.ivpn.net',rotation:'manual',routeLock:true}});
  await expect(setup.preview(p.id)).rejects.toThrow(/Recheck/);
  state.rejectRecheck=false;expect(await setup.prepare(provider)).toMatchObject({account:'active'});
});
it('refuses a recheck-only request after registration removal instead of consuming another provider slot',async()=>{
  const {v,state,setup}=await fixture();await setup.prepare('mullvad');await setup.remove('mullvad');
  await expect(setup.recheck('mullvad')).rejects.toThrow(/registration.*changed|no.*registration/i);
  expect(state.mullvadCreates).toBe(1);expect(v.vpnRegistrationStatus('mullvad').phase).toBe('not_started');
});
it('rejects a registration that expires while awaiting the catalog',async()=>{
  const {v,setup,client}=await fixture();const p=v.createProfile({name:'Expiring approval',vpn:{provider:'mullvad',endpoint:'se-got-wg-001',rotation:'manual',routeLock:true}});await setup.prepare('mullvad');
  const material=v.readVpnRegistration('mullvad')!;v.putVpnRegistration('mullvad',{...material,expiresAt:now+500});
  let time=now,finish!:(response:Response)=>void;
  const catalog=new ProviderCatalog(()=>new Promise(resolve=>{finish=resolve;}),()=>time);
  const pending=new ProviderSetup(v,client,catalog,()=>time).preview(p.id);time=now+1000;
  finish(Response.json({locations:{'se-got':{country:'Sweden',city:'Gothenburg'}},wireguard:{relays:[{hostname:'se-got-wg-001',active:true,location:'se-got',ipv4_addr_in:'198.51.100.10',public_key:pub}]}}));
  await expect(pending).rejects.toThrow(/Recheck/);
});
it('retains removal material but invalidates approval across reopen after a lost deletion response',async()=>{
  const {v,dir,state,setup,client,catalog}=await fixture();await setup.prepare('ivpn');const saved=v.readVpnRegistration('ivpn')!;state.loseDeleteResponse=true;
  await expect(setup.remove('ivpn')).rejects.toThrow();expect(state.deletes).toHaveLength(1);setup.cancel();v.close();
  const reopened=await Vault.open(dir,pass);vaults.push(reopened);
  expect(reopened.vpnRegistrationStatus('ivpn')).toMatchObject({phase:'registered',account:'unchecked',checkedAt:null});
  expect(reopened.readVpnRegistration('ivpn')!.remote).toEqual(saved.remote);
  const p=reopened.createProfile({name:'Deleted session',vpn:{provider:'ivpn',endpoint:'at1.wg.ivpn.net',rotation:'manual',routeLock:true}});
  await expect(new ProviderSetup(reopened,client,catalog,()=>now).preview(p.id)).rejects.toThrow(/Recheck/);
});
it.each(['recheck','remove'] as const)('keeps a canceled %s unverified and reports active operations to a reopened dialog',async action=>{
  const {v,state,setup}=await fixture();await setup.prepare('ivpn');state.wait=()=>new Promise(()=>undefined);
  const pending=setup[action]('ivpn');expect(setup.status('ivpn')).toMatchObject({inProgress:true,account:'unchecked',checkedAt:null});
  setup.cancel();await expect(pending).rejects.toThrow(/cancel/i);
  expect(v.vpnRegistrationStatus('ivpn')).toMatchObject({phase:'registered',account:'unchecked',checkedAt:null});expect(setup.status('ivpn').inProgress).toBe(false);
});
