import {z} from 'zod';
import {isIP} from 'node:net';
import {Address,WireGuardKey,type RemoteData} from './registration';
import {VpnCredential,type VpnProviderType} from '../../../shared/src/vpn';
export type ProviderTransport=(url:string,init:RequestInit)=>Promise<Response>;
export type AccountCheck={active:boolean;expiresAt:number};
type ErrorCode='authentication'|'expired'|'limit'|'challenge'|'not_found'|'conflict'|'invalid_response'|'network'|'cancelled'|'timeout';
const messages:Record<ErrorCode,string>={authentication:'Provider authentication failed. Check the saved account.',expired:'Provider account or access token has expired.',limit:'Provider device/session limit reached. Manage your existing provider devices before retrying.',challenge:'Provider requires CAPTCHA or two-factor verification. Complete setup with its official client.',not_found:'Provider registration was not found. Remove this local setup before registering again.',conflict:'Provider key registration conflicts with existing setup. Review provider devices.',invalid_response:'Provider returned an invalid response. Setup may require review.',network:'Provider request failed. Check connectivity; registration may require review.',cancelled:'Provider operation canceled. Incomplete registration may require review.',timeout:'Provider request timed out. Registration may require review.'};
export class ProviderError extends Error {constructor(readonly code:ErrorCode,readonly safeToRetry=false,readonly registrationAbsent=false){super(messages[code]);this.name='ProviderError';}}
const token=z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/);
const timestamp=z.iso.datetime({offset:true}).transform(v=>Date.parse(v));
const device=z.object({id:z.uuid(),pubkey:WireGuardKey,ipv4_address:Address.refine(v=>isIP(v.split('/')[0])===4),ipv6_address:Address.refine(v=>isIP(v.split('/')[0])===6)});
const service=z.object({is_active:z.boolean(),active_until:z.number().int().nonnegative().max(8640000000000)});
const ivpnError=(code:number)=>code===401?'authentication':code===602?'limit':code===702?'expired':code===601?'not_found':[70001,70002,70011,70012].includes(code)?'challenge':code===424?'conflict':'invalid_response';
const origin={mullvad:'https://api.mullvad.net',ivpn:'https://api.ivpn.net'} as const;
function decode<T>(schema:z.ZodType<T>,data:unknown):T {const parsed=schema.safeParse(data);if(!parsed.success)throw new ProviderError('invalid_response');return parsed.data;}
export class ProviderClient {
  constructor(private transport:ProviderTransport,private now=Date.now,private timeoutMs=10000){}
  private async request(provider:VpnProviderType,path:string,method:'GET'|'POST'|'DELETE',signal:AbortSignal,body?:unknown,bearer?:string):Promise<unknown> {
    if(signal.aborted)throw new ProviderError('cancelled');
    const url=origin[provider]+path,controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
    let expired=false;
    try {
      const task=(async()=>{
        const headers:Record<string,string>={Accept:'application/json'};if(body!==undefined)headers['Content-Type']='application/json';if(bearer)headers.Authorization=`Bearer ${token.parse(bearer)}`;
        const response=await this.transport(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store'});
        if(response.redirected||(response.url&&response.url!==url)||Number(response.headers.get('content-length'))>65536||response.status>=300&&response.status<400){void response.body?.cancel().catch(()=>undefined);throw new ProviderError('invalid_response');}
        if(method==='DELETE'&&response.status===404){void response.body?.cancel().catch(()=>undefined);return null;}
        if(response.status===204){if(method!=='DELETE')throw new ProviderError('invalid_response');return null;}
        if(provider==='mullvad'&&method==='DELETE'&&response.ok){void response.body?.cancel().catch(()=>undefined);throw new ProviderError('invalid_response');}
        const reader=response.body?.getReader();if(!reader)throw new ProviderError('invalid_response');
        const cancel=()=>{void reader.cancel().catch(()=>undefined);};controller.signal.addEventListener('abort',cancel,{once:true});
        let size=0;const chunks:Uint8Array[]=[];let parsed:unknown;
        try{while(true){controller.signal.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>65536)throw new ProviderError('invalid_response');chunks.push(chunk.value);}controller.signal.throwIfAborted();parsed=JSON.parse(Buffer.concat(chunks).toString());}
        finally{controller.signal.removeEventListener('abort',cancel);void reader.cancel().catch(()=>undefined);reader.releaseLock();}
        if(!response.ok){
          const code=z.object({code:z.string().max(100).optional()}).safeParse(parsed);
          if(response.status===401||response.status===403)throw new ProviderError('authentication',true);
          if(response.status===404)throw new ProviderError('not_found',true);
          if(code.success&&code.data.code==='MAX_DEVICES_REACHED')throw new ProviderError('limit',true);
          if(code.success&&code.data.code==='PUBKEY_IN_USE')throw new ProviderError('conflict');
          throw new ProviderError('network');
        }
        if(provider==='ivpn'){
          const {status}=z.object({status:z.number().int()}).parse(parsed);
          if(status!==200){const code=ivpnError(status);throw new ProviderError(code,['authentication','limit','expired','challenge'].includes(code),status===601);}
        }
        return parsed;
      })();
      const cancellation=new Promise<never>((_resolve,reject)=>{
        controller.signal.addEventListener('abort',()=>reject(new ProviderError(signal.aborted?'cancelled':expired?'timeout':'cancelled')),{once:true});
        timer=setTimeout(()=>{expired=true;controller.abort();},this.timeoutMs);
      });
      const result=await Promise.race([task,cancellation]);
      if(controller.signal.aborted)throw new ProviderError(signal.aborted?'cancelled':'timeout');return result;
    }catch(error){if(error instanceof ProviderError)throw error;throw new ProviderError(signal.aborted?'cancelled':expired?'timeout':error instanceof z.ZodError||error instanceof SyntaxError?'invalid_response':'network');}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
  }
  async mullvadAuthenticate(account:string,signal:AbortSignal):Promise<AccountCheck&{token:string}> {
    VpnCredential.parse({provider:'mullvad',account});
    const auth=decode(z.object({access_token:token,expiry:timestamp}),await this.request('mullvad','/auth/v1/token','POST',signal,{account_number:account}));
    if(auth.expiry<=this.now()+60000)throw new ProviderError('expired',true);
    const check=decode(z.object({expiry:timestamp}),await this.request('mullvad','/accounts/v1/accounts/me','GET',signal,undefined,auth.access_token));
    return {token:auth.access_token,expiresAt:check.expiry,active:check.expiry>this.now()};
  }
  async mullvadDevices(bearer:string,signal:AbortSignal):Promise<{id:string;pubkey:string}[]> {
    return decode(z.array(z.object({id:z.uuid(),pubkey:WireGuardKey})).max(100),await this.request('mullvad','/accounts/v1/devices','GET',signal,undefined,bearer));
  }
  private parseDevice(data:unknown,publicKey:string):RemoteData {
    const value=device.safeParse(data);if(!value.success||value.data.pubkey!==publicKey)throw new ProviderError('invalid_response');
    return {kind:'mullvad',id:value.data.id,addresses:[value.data.ipv4_address,value.data.ipv6_address]};
  }
  async mullvadGet(bearer:string,id:string,publicKey:string,signal:AbortSignal):Promise<RemoteData> {z.uuid().parse(id);const result=this.parseDevice(await this.request('mullvad',`/accounts/v1/devices/${id}`,'GET',signal,undefined,bearer),publicKey);if(result.kind!=='mullvad'||result.id!==id)throw new ProviderError('invalid_response');return result;}
  async mullvadCreate(bearer:string,publicKey:string,signal:AbortSignal):Promise<RemoteData> {WireGuardKey.parse(publicKey);return this.parseDevice(await this.request('mullvad','/accounts/v1/devices','POST',signal,{pubkey:publicKey,hijack_dns:false},bearer),publicKey);}
  async mullvadRemove(bearer:string,id:string,signal:AbortSignal):Promise<void> {z.uuid().parse(id);await this.request('mullvad',`/accounts/v1/devices/${id}`,'DELETE',signal,undefined,bearer);}
  async ivpnCreate(account:string,publicKey:string,signal:AbortSignal):Promise<AccountCheck&{remote:RemoteData}> {
    VpnCredential.parse({provider:'ivpn',account});WireGuardKey.parse(publicKey);
    const parsed=z.object({token,service_status:service,wireguard:z.object({status:z.literal(200),ip_address:z.string().refine(v=>isIP(v)===4)})}).safeParse(await this.request('ivpn','/v4/session/new','POST',signal,{username:account,wg_public_key:publicKey,force:false}));
    if(!parsed.success)throw new ProviderError('invalid_response');const result=parsed.data;
    return {remote:{kind:'ivpn',token:result.token,addresses:[result.wireguard.ip_address+'/32']},active:result.service_status.is_active,expiresAt:result.service_status.active_until*1000};
  }
  async ivpnStatus(sessionToken:string,signal:AbortSignal):Promise<AccountCheck> {
    const data=z.object({service_status:service}).safeParse(await this.request('ivpn','/v4/session/status','POST',signal,{session_token:token.parse(sessionToken)}));
    if(!data.success)throw new ProviderError('invalid_response');return {active:data.data.service_status.is_active,expiresAt:data.data.service_status.active_until*1000};
  }
  async ivpnRemove(sessionToken:string,signal:AbortSignal):Promise<void> {try{await this.request('ivpn','/v4/session/delete','POST',signal,{session_token:token.parse(sessionToken)});}catch(error){if(!(error instanceof ProviderError&&error.registrationAbsent))throw error;}}
}
