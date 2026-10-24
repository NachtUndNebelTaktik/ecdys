import {expect,it} from 'vitest';
import {ProviderClient,ProviderError} from '../packages/desktop/src/vpn/provider-client';
import {generateRegistration,sealRegistration,openRegistration} from '../packages/desktop/src/vpn/registration';
import {createPrivateKey,createPublicKey} from 'node:crypto';
const now=Date.parse('2026-10-24T00:00:00Z'),future='2027-01-01T00:00:00Z';
const pub=Buffer.alloc(32,7).toString('base64'),id='11111111-1111-4111-8111-111111111111';
const signal=()=>new AbortController().signal;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});

it('generates real X25519 keys and authenticates registration ciphertext against provider and purpose',()=>{
  const data=generateRegistration('mullvad');
  const key=createPrivateKey({key:{kty:'OKP',crv:'X25519',d:Buffer.from(data.privateKey,'base64').toString('base64url'),x:Buffer.from(data.publicKey,'base64').toString('base64url')},format:'jwk'});
  expect(createPublicKey(key).export({format:'jwk'}).x).toBe(Buffer.from(data.publicKey,'base64').toString('base64url'));
  const master=Buffer.alloc(32,19),encrypted=sealRegistration(data,master,'mullvad');
  expect(encrypted.includes(Buffer.from(data.privateKey))).toBe(false);
  expect(openRegistration(encrypted,master,'mullvad')).toEqual(data);
  expect(()=>openRegistration(encrypted,master,'ivpn')).toThrow();
  expect(()=>openRegistration(encrypted,Buffer.alloc(32,20),'mullvad')).toThrow();
  const corrupt=Buffer.from(encrypted);corrupt[corrupt.length-1]^=1;expect(()=>openRegistration(corrupt,master,'mullvad')).toThrow();
});
it('uses current Mullvad token/account/device contracts without account IDs in URLs',async()=>{
  const requests:{url:string;init:RequestInit}[]=[];
  const c=new ProviderClient(async(url,init)=>{requests.push({url,init});
    if(url.endsWith('/auth/v1/token'))return json({access_token:'test-access-token',expiry:future});
    if(url.endsWith('/accounts/me'))return json({expiry:future});
    if(init.method==='POST')return json({id,pubkey:pub,ipv4_address:'10.64.0.2/32',ipv6_address:'fc00::2/128'},201);
    return json([{id,pubkey:pub}]);
  },()=>now);
  const auth=await c.mullvadAuthenticate('1234567890123456',signal());expect(auth.expiresAt).toBe(Date.parse(future));
  expect(await c.mullvadDevices(auth.token,signal())).toEqual([{id,pubkey:pub}]);
  expect(await c.mullvadCreate(auth.token,pub,signal())).toMatchObject({kind:'mullvad',id,addresses:['10.64.0.2/32','fc00::2/128']});
  expect(requests[0]).toMatchObject({url:'https://api.mullvad.net/auth/v1/token',init:{method:'POST',body:JSON.stringify({account_number:'1234567890123456'})}});
  expect(requests[1].init.headers).toMatchObject({Authorization:'Bearer test-access-token'});
  expect(requests.every(r=>!r.url.includes('1234567890123456'))).toBe(true);
});
it('uses IVPN force=false and retains only session/WireGuard fields from login',async()=>{
  const requests:{url:string;init:RequestInit}[]=[];
  const c=new ProviderClient(async(url,init)=>{requests.push({url,init});return json({status:200,token:'test-session-token',vpn_password:'must-not-retain',service_status:{is_active:true,active_until:Date.parse(future)/1000},wireguard:{status:200,ip_address:'172.16.0.2'}});},()=>now);
  const result=await c.ivpnCreate('i-ABCD-EFGH-IJKL',pub,signal());
  expect(result).toEqual({remote:{kind:'ivpn',token:'test-session-token',addresses:['172.16.0.2/32']},expiresAt:Date.parse(future),active:true});
  expect(JSON.parse(requests[0].init.body as string)).toEqual({username:'i-ABCD-EFGH-IJKL',wg_public_key:pub,force:false});
  expect(requests[0].url).toBe('https://api.ivpn.net/v4/session/new');
});
it.each([[401,'authentication'],[602,'limit'],[702,'expired'],[70001,'challenge'],[70011,'challenge']])('sanitizes IVPN API error %s',async(status,code)=>{
  const c=new ProviderClient(async()=>json({status,message:'secret account and token'}),()=>now);
  try{await c.ivpnCreate('i-ABCD-EFGH-IJKL',pub,signal());throw new Error('expected rejection');}catch(error){expect(error).toBeInstanceOf(ProviderError);expect(error).toMatchObject({code,safeToRetry:true});expect(String(error)).not.toContain('secret');}
});
it('rejects mismatched keys, invalid addresses, expired tokens and unsafe responses',async()=>{
  const invalid=[json({id,pubkey:Buffer.alloc(32,8).toString('base64'),ipv4_address:'10.0.0.1/32',ipv6_address:'fc00::1/128'},201),json({id,pubkey:pub,ipv4_address:'bad',ipv6_address:'fc00::1/128'},201),json({message:'secret'},302),new Response('x'.repeat(65537)),json({access_token:'bad\nheader',expiry:future})];
  for(const response of invalid){const c=new ProviderClient(async()=>response,()=>now);await expect(c.mullvadCreate('token',pub,signal())).rejects.toBeInstanceOf(ProviderError);}
  const c=new ProviderClient(async()=>json({access_token:'token',expiry:'2020-01-01T00:00:00Z'}),()=>now);await expect(c.mullvadAuthenticate('1234567890123456',signal())).rejects.toThrow(/expired/i);
});
it('enforces deadline/cancellation even when transport ignores abort and sanitizes transport errors',async()=>{
  const c=new ProviderClient(()=>new Promise(()=>undefined),()=>now,10);
  await expect(c.ivpnStatus('private-token',signal())).rejects.toThrow(/timed out/i);
  const controller=new AbortController();const p=new ProviderClient(()=>new Promise(()=>undefined)).ivpnStatus('private-token',controller.signal);controller.abort();await expect(p).rejects.toMatchObject({code:'cancelled'});
  await expect(new ProviderClient(async()=>{throw new Error('private-token');}).ivpnStatus('private-token',signal())).rejects.not.toThrow('private-token');
});
it('requires matching device IDs and the documented deletion acknowledgement',async()=>{
  const c=new ProviderClient(async()=>json({id:'22222222-2222-4222-8222-222222222222',pubkey:pub,ipv4_address:'10.0.0.2/32',ipv6_address:'fc00::2/128'}));
  await expect(c.mullvadGet('token',id,pub,signal())).rejects.toMatchObject({code:'invalid_response'});
  await expect(new ProviderClient(async()=>json({accepted:true})).mullvadRemove('token',id,signal())).rejects.toMatchObject({code:'invalid_response'});
});
it('does not treat a missing IVPN RPC endpoint as proof that the provider session was deleted',async()=>{
  await expect(new ProviderClient(async()=>json({message:'Not found'},404)).ivpnRemove('token',signal())).rejects.toThrow();
  await expect(new ProviderClient(async()=>json({status:601})).ivpnRemove('token',signal())).resolves.toBeUndefined();
});
