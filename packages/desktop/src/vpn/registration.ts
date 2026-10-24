import {z} from 'zod';
import {isIP} from 'node:net';
import {createCipheriv,createDecipheriv,createPrivateKey,createPublicKey,generateKeyPairSync,hkdfSync,randomBytes} from 'node:crypto';
import {VpnProvider,type VpnProviderType} from '../../../shared/src/vpn';
export const WireGuardKey=z.string().regex(/^[A-Za-z0-9+/]{43}=$/).refine(v=>Buffer.from(v,'base64').toString('base64')===v&&Buffer.from(v,'base64').some(b=>b!==0));
export const Address=z.string().max(80).refine(v=>{
  const [ip,prefix,...extra]=v.split('/');const version=isIP(ip);return !extra.length&&((version===4&&prefix==='32')||(version===6&&prefix==='128'));
},'Invalid WireGuard interface address');
const Token=z.string().min(1).max(4096).regex(/^[\x21-\x7e]+$/);
export const Remote=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('mullvad'),id:z.uuid(),addresses:z.array(Address).length(2)}).strict(),
  z.object({kind:z.literal('ivpn'),token:Token,addresses:z.array(Address).length(1)}).strict(),
]);
const Registration=z.object({version:z.literal(1),provider:VpnProvider,phase:z.enum(['draft','pending','registered']),privateKey:WireGuardKey,publicKey:WireGuardKey,remote:Remote.nullable(),checkedAt:z.number().int().nonnegative().nullable(),expiresAt:z.number().int().nonnegative().nullable(),active:z.boolean()}).strict().refine(v=>(v.phase==='registered')===(v.remote!==null)&&(!v.remote||v.remote.kind===v.provider),'Invalid registration state');
export type RegistrationData=z.infer<typeof Registration>;
export type RemoteData=z.infer<typeof Remote>;
function checked(data:unknown,provider:VpnProviderType):RegistrationData {
  const value=Registration.parse(data);if(value.provider!==provider)throw new Error('Provider setup identity mismatch');
  const privateBytes=Buffer.from(value.privateKey,'base64');
  try{const key=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b656e04220420','hex'),privateBytes]),format:'der',type:'pkcs8'});
    if(createPublicKey(key).export({format:'jwk'}).x!==Buffer.from(value.publicKey,'base64').toString('base64url'))throw new Error('Invalid provider key pair');
  }finally{privateBytes.fill(0);}return value;
}
export function generateRegistration(provider:VpnProviderType):RegistrationData {
  VpnProvider.parse(provider);const pair=generateKeyPairSync('x25519'),key=pair.privateKey.export({format:'jwk'});
  return checked({version:1,provider,phase:'draft',privateKey:Buffer.from(key.d!,'base64url').toString('base64'),publicKey:Buffer.from(key.x!,'base64url').toString('base64'),remote:null,checkedAt:null,expiresAt:null,active:false},provider);
}
const aad=(provider:VpnProviderType)=>Buffer.from(JSON.stringify(['styg/vpn-registration',1,VpnProvider.parse(provider)]));
const derive=(master:Buffer)=>Buffer.from(hkdfSync('sha256',master,Buffer.alloc(0),'styg/vpn-registration-key/v1',32));
export function sealRegistration(data:RegistrationData,master:Buffer,provider:VpnProviderType):Buffer {
  const value=checked(data,provider),key=derive(master),iv=randomBytes(12),plain=Buffer.from(JSON.stringify(value));
  try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(provider));const body=Buffer.concat([cipher.update(plain),cipher.final()]);return Buffer.concat([Buffer.from([1]),iv,cipher.getAuthTag(),body]);
  }finally{key.fill(0);plain.fill(0);}
}
export function openRegistration(envelope:Buffer,master:Buffer,provider:VpnProviderType):RegistrationData {
  if(envelope.length<30||envelope.length>16384||envelope[0]!==1)throw new Error('Invalid saved provider setup');
  const key=derive(master);let plain:Buffer|undefined;
  try{const cipher=createDecipheriv('aes-256-gcm',key,envelope.subarray(1,13));cipher.setAAD(aad(provider));cipher.setAuthTag(envelope.subarray(13,29));plain=Buffer.concat([cipher.update(envelope.subarray(29)),cipher.final()]);return checked(JSON.parse(plain.toString()),provider);}
  finally{key.fill(0);plain?.fill(0);}
}
