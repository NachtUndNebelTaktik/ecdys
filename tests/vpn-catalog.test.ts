import {expect,it} from 'vitest';
import {ProviderCatalog,parseRelays} from '../packages/desktop/src/vpn/catalog';
import {planRotation} from '../packages/desktop/src/vpn/rotation';
const publicKey=Buffer.alloc(32,8).toString('base64');
const mullvad={locations:{'se-got':{country:'Sweden',city:'Gothenburg'}},wireguard:{relays:[{hostname:'se-got-wg-001',active:true,location:'se-got',ipv4_addr_in:'198.51.100.1',public_key:publicKey,weight:100},{hostname:'se-got-wg-002',active:false,location:'se-got',ipv4_addr_in:'198.51.100.2',public_key:publicKey}]}};
const ivpn={wireguard:[{country:'Austria',city:'Vienna',hosts:[{hostname:'at1.wg.ivpn.net',host:'198.51.100.3',public_key:publicKey,load:17.14}]}]};
it('normalizes active WireGuard relays without representing Mullvad weight as live load',()=>{
  expect(parseRelays('mullvad',mullvad)).toEqual([{hostname:'se-got-wg-001',country:'Sweden',city:'Gothenburg',ipv4:'198.51.100.1',publicKey,load:null}]);
  expect(parseRelays('ivpn',ivpn)[0]).toMatchObject({hostname:'at1.wg.ivpn.net',load:17.14});
});
it('rejects empty/malformed catalogs, duplicate hostnames and missing relay locations',()=>{
  for(const data of [{},{wireguard:[]},{wireguard:[{...ivpn.wireguard[0],hosts:[{...ivpn.wireguard[0].hosts[0],host:'not an IP'}]}]}])expect(()=>parseRelays('ivpn',data)).toThrow();
  expect(()=>parseRelays('mullvad',{...mullvad,locations:{}})).toThrow();
  expect(()=>parseRelays('ivpn',{wireguard:[ivpn.wireguard[0],ivpn.wireguard[0]]})).toThrow();
  for(const location of ['__proto__','constructor','toString'])expect(()=>parseRelays('mullvad',{locations:{},wireguard:{relays:[{...mullvad.wireguard.relays[0],location}]}})).toThrow();
});
it('cancels pending catalog requests immediately without waiting for the deadline or accepting late results',async()=>{
  let finish!:(response:Response)=>void;
  const c=new ProviderCatalog(()=>new Promise(resolve=>{finish=resolve;}));
  const first=c.get('ivpn');const outcome=expect(first).rejects.toThrow('Could not refresh IVPN server catalog');
  c.cancelPending();await outcome;
  finish(new Response(JSON.stringify(ivpn)));
  await new Promise(resolve=>setTimeout(resolve,0));
  // A new request is issued, rather than consuming a cache written by the late response.
  let finished=false;const second=c.get('ivpn').finally(()=>{finished=true;});
  await new Promise(resolve=>setTimeout(resolve,0));expect(finished).toBe(false);
  const rejected=expect(second).rejects.toThrow();c.cancelPending();await rejected;
});
it('uses fixed credential-free origins, caches an hour and labels stale fallback without discarding it',async()=>{
  let now=1000,calls=0,fail=false;
  const catalog=new ProviderCatalog(async(url,signal)=>{expect(url).toBe('https://api.mullvad.net/public/relays/wireguard/v2');expect(signal).toBeInstanceOf(AbortSignal);calls++;if(fail)throw new Error('private transport data');return new Response(JSON.stringify(mullvad));},()=>now);
  const first=await catalog.get('mullvad');expect(first.stale).toBe(false);expect(first.checkedAt).toBe(1000);
  now+=3599999;await catalog.get('mullvad');expect(calls).toBe(1);
  now+=2;fail=true;const fallback=await catalog.get('mullvad');expect(calls).toBe(2);expect(fallback).toMatchObject({stale:true,checkedAt:1000,relays:first.relays});expect(fallback.warning).not.toContain('private transport');
});
it('bounds response size, HTTP status and timeout without forwarding transport details',async()=>{
  const bodies=[new Response('x'.repeat(2*1024*1024+1)),new Response('secret',{status:503}),new Response('bad-json')];
  for(const body of bodies){const c=new ProviderCatalog(async()=>body);await expect(c.get('ivpn')).rejects.toThrow('Could not refresh IVPN server catalog');}
  const hanging=new ProviderCatalog((_url,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))),Date.now,10);
  await expect(hanging.get('ivpn')).rejects.toThrow('Could not refresh IVPN server catalog');
});
it('rejects redirect responses and unexpected effective origins',async()=>{
  await expect(new ProviderCatalog(async()=>new Response(null,{status:302,headers:{location:'http://localhost'}})).get('mullvad')).rejects.toThrow();
  const response=new Response(JSON.stringify(mullvad));Object.defineProperty(response,'url',{value:'https://other.example/catalog'});
  await expect(new ProviderCatalog(async()=>response).get('mullvad')).rejects.toThrow();
});
it('retains the last valid catalog when a relay names an inherited location property',async()=>{
  let now=1000;
  const c=new ProviderCatalog(async()=>new Response(JSON.stringify(now===1000?mullvad:{locations:{},wireguard:{relays:[{...mullvad.wireguard.relays[0],location:'__proto__'}]}})),()=>now);
  const good=await c.get('mullvad');now+=3600001;
  expect(await c.get('mullvad')).toMatchObject({relays:good.relays,checkedAt:1000,stale:true});
});
const relays=['a','b','c'].map((hostname,i)=>({hostname,country:'Sweden',city:'Gothenburg',ipv4:`198.51.100.${i+1}`,publicKey,load:i===2?10:20}));
it('plans rotation only at policy boundaries and never selects the current endpoint',()=>{
  for(const [policy,count,due] of [['manual',100,false],['per_launch',1,true],['every_5',4,false],['every_5',5,true],['every_10',9,false],['every_10',10,true]] as const){
    expect(planRotation({policy,successfulLaunches:count,lastRotatedAt:1000,now:2000,current:'a',relays}).due).toBe(due);
  }
  expect(planRotation({policy:'hourly',successfulLaunches:0,lastRotatedAt:1000,now:3601000,current:'a',relays})).toMatchObject({due:true,endpoint:'c'});
  expect(planRotation({policy:'daily',successfulLaunches:0,lastRotatedAt:1000,now:3601000,current:'a',relays}).due).toBe(false);
  expect(planRotation({policy:'manual',manual:true,successfulLaunches:0,lastRotatedAt:null,now:1000,current:'a',relays:[relays[0]]})).toMatchObject({due:true,endpoint:'a',warning:expect.any(String)});
});
