import {z} from 'zod';

export const VpnProvider=z.enum(['mullvad','ivpn']);
export type VpnProviderType=z.infer<typeof VpnProvider>;
export const Rotation=z.enum(['manual','per_launch','every_5','every_10','hourly','daily']);
export const VpnSettings=z.object({
  provider:z.enum(['none','mullvad','ivpn']),
  endpoint:z.string().regex(/^[a-z0-9][a-z0-9.-]{0,251}[a-z0-9]$/,'Use a server hostname').nullable(),
  rotation:Rotation,routeLock:z.literal(true),
}).strict().refine(v=>v.provider!=='none'||v.endpoint===null,'Select a provider before choosing a server')
  .refine(v=>v.provider!=='ivpn'||v.endpoint===null||v.endpoint.endsWith('.wg.ivpn.net'),'Choose an IVPN WireGuard hostname');
export type VpnSettingsType=z.infer<typeof VpnSettings>;
export const defaultVpn=():VpnSettingsType=>({provider:'none',endpoint:null,rotation:'manual',routeLock:true});
export const VpnCredential=z.discriminatedUnion('provider',[
  z.object({provider:z.literal('mullvad'),account:z.string().trim().regex(/^\d{16}$/,'Mullvad requires a 16-digit account number')}).strict(),
  z.object({provider:z.literal('ivpn'),account:z.string().trim().regex(/^(?:i-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|ivpn[a-z0-9]{8})$/i,'Use your IVPN account ID (i-XXXX-XXXX-XXXX or ivpnXXXXXXXX)')}).strict(),
]);
export type CredentialPresence=Record<VpnProviderType,boolean>;
export type Relay={hostname:string;country:string;city:string;ipv4:string;publicKey:string;load:number|null};
export type RelayCatalog={provider:VpnProviderType;relays:Relay[];checkedAt:number;stale:boolean;warning?:string};
export type RegistrationStatus={provider:VpnProviderType;phase:'not_started'|'draft'|'pending'|'registered';account:'unchecked'|'active'|'expired';checkedAt:number|null;expiresAt:number|null;inProgress?:boolean};
export type TunnelPreview={provider:VpnProviderType;hostname:string;port:number;peerIp:string;interfaceAddresses:string[];checkedAt:number;route:'blocked'};
