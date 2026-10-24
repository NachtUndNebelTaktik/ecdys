import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
import {VpnCredential,VpnProvider,type VpnProviderType} from '../../../shared/src/vpn';
const aad=(provider:VpnProviderType)=>Buffer.from(JSON.stringify(['styg/vpn-credential',1,VpnProvider.parse(provider)]));
const derive=(master:Buffer)=>Buffer.from(hkdfSync('sha256',master,Buffer.alloc(0),'styg/vpn-credential-key/v1',32));
export function sealCredential(account:string,master:Buffer,provider:VpnProviderType):Buffer {
  const value=VpnCredential.parse({provider,account}).account;
  const key=derive(master),iv=randomBytes(12),plain=Buffer.from(value);
  try {const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad(provider));const body=Buffer.concat([cipher.update(plain),cipher.final()]);return Buffer.concat([Buffer.from([1]),iv,cipher.getAuthTag(),body]);}
  finally {plain.fill(0);key.fill(0);}
}
// Main-process-only future adapter. No IPC action returns decrypted credentials.
export function openCredential(envelope:Buffer,master:Buffer,provider:VpnProviderType):string {
  if(envelope.length<30||envelope.length>256||envelope[0]!==1)throw new Error('Invalid encrypted VPN credential');
  const key=derive(master);let plain:Buffer|undefined;
  try {const cipher=createDecipheriv('aes-256-gcm',key,envelope.subarray(1,13));cipher.setAAD(aad(provider));cipher.setAuthTag(envelope.subarray(13,29));plain=Buffer.concat([cipher.update(envelope.subarray(29)),cipher.final()]);return VpnCredential.parse({provider,account:plain.toString()}).account;}
  finally {plain?.fill(0);key.fill(0);}
}
