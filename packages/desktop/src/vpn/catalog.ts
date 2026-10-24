import {z} from 'zod';
import {isIP} from 'node:net';
import {VpnProvider,type VpnProviderType,type Relay,type RelayCatalog} from '../../../shared/src/vpn';
export const CATALOG_URLS={mullvad:'https://api.mullvad.net/public/relays/wireguard/v2',ivpn:'https://api.ivpn.net/v5/servers.json'} as const;
const label=z.string().trim().min(1).max(120);
const hostname=z.string().max(253).regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/);
const ipv4=z.string().refine(value=>isIP(value)===4);
const publicKey=z.string().regex(/^[A-Za-z0-9+/]{43}=$/).refine(value=>Buffer.from(value,'base64').length===32);
const mullvadSchema=z.object({locations:z.record(z.string(),z.object({country:label,city:label})),wireguard:z.object({relays:z.array(z.object({hostname,active:z.boolean(),location:z.string().max(80),ipv4_addr_in:ipv4,public_key:publicKey})).max(5000)})});
const ivpnSchema=z.object({wireguard:z.array(z.object({country:label,city:label,hosts:z.array(z.object({hostname:hostname.refine(v=>v.endsWith('.wg.ivpn.net')),host:ipv4,public_key:publicKey,load:z.number().min(0).max(100).nullable().optional()})).max(500)})).max(500)});
export function parseRelays(provider:VpnProviderType,data:unknown):Relay[] {
  VpnProvider.parse(provider);let relays:Relay[];
  if(provider==='mullvad') {
    const parsed=mullvadSchema.parse(data);
    relays=parsed.wireguard.relays.filter(r=>r.active).map(r=>{
      const location=parsed.locations[r.location];if(!location)throw new Error('Missing relay location');
      return {hostname:r.hostname,country:location.country,city:location.city,ipv4:r.ipv4_addr_in,publicKey:r.public_key,load:null};
    });
  }else relays=ivpnSchema.parse(data).wireguard.flatMap(group=>group.hosts.map(r=>({hostname:r.hostname,country:group.country,city:group.city,ipv4:r.host,publicKey:r.public_key,load:r.load??null})));
  if(!relays.length||relays.length>5000||new Set(relays.map(r=>r.hostname)).size!==relays.length)throw new Error('Invalid relay catalog');
  return relays.sort((a,b)=>a.country.localeCompare(b.country)||a.city.localeCompare(b.city)||a.hostname.localeCompare(b.hostname));
}
type Transport=(url:string,signal:AbortSignal)=>Promise<Response>;
const MAX_BYTES=2*1024*1024;
async function readCatalog(response:Response,url:string,signal:AbortSignal):Promise<unknown> {
  if(!response.ok||response.redirected||(response.url&&response.url!==url)||Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();throw new Error('Invalid catalog response');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Empty catalog response');
  const chunks:Uint8Array[]=[];let size=0;
  const abort=()=>{void reader.cancel().catch(()=>undefined);};signal.addEventListener('abort',abort,{once:true});
  try {
    while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw new Error('Catalog too large');chunks.push(value);}
    signal.throwIfAborted();return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally {signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
export class ProviderCatalog {
  private cache=new Map<VpnProviderType,RelayCatalog>();
  private retryAt=new Map<VpnProviderType,number>();
  constructor(private transport:Transport,private now=Date.now,private timeoutMs=10000){}
  async get(provider:VpnProviderType):Promise<RelayCatalog> {
    VpnProvider.parse(provider);const previous=this.cache.get(provider),now=this.now();
    if(previous&&(now-previous.checkedAt<3600000||(this.retryAt.get(provider)??0)>now))return structuredClone(previous);
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const url=CATALOG_URLS[provider];
      const relays=await Promise.race([
        this.transport(url,controller.signal).then(response=>readCatalog(response,url,controller.signal)).then(data=>parseRelays(provider,data)),
        new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Catalog request timed out'));},this.timeoutMs);}),
      ]);
      const result:RelayCatalog={provider,relays,checkedAt:this.now(),stale:false};this.cache.set(provider,result);this.retryAt.delete(provider);return structuredClone(result);
    }catch {
      const warning=`Could not refresh ${provider==='ivpn'?'IVPN':'Mullvad'} server catalog. Check your connection and retry.`;
      if(!previous)throw new Error(warning);
      const stale={...previous,stale:true,warning};this.cache.set(provider,stale);this.retryAt.set(provider,this.now()+30000);return structuredClone(stale);
    }finally {clearTimeout(timer);}
  }
}
