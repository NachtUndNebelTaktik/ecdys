import { z } from 'zod';
import {VpnSettings,defaultVpn,VpnProvider,VpnCredential} from './vpn';

export const Id = z.uuid();
const timezone = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat('en', {timeZone:value}); return true; } catch { return false; }
}, 'Choose a valid IANA timezone');
const ProfileFields = z.object({
  name:z.string().trim().min(1).max(100),
  tags:z.array(z.string().trim().min(1).max(32)).max(12),
  timezone, language:z.enum(['en-US','en-GB','de-DE','fr-FR']),
  screen:z.enum(['1920 × 1080','1440 × 900','1366 × 768']),
  vpn:VpnSettings,
}).strict();
export const ProfileInput = ProfileFields.extend({
  tags:ProfileFields.shape.tags.default([]), timezone:timezone.default('UTC'),
  language:ProfileFields.shape.language.default('en-US'),
  screen:ProfileFields.shape.screen.default('1920 × 1080'),
  vpn:VpnSettings.default(defaultVpn),
});
// Defaults belong to creation only: Zod defaults inside optional fields would
// otherwise reset omitted settings when parsing a partial update.
export const ProfilePatch = ProfileFields.partial();
export type ProfileInputType = z.input<typeof ProfileInput>;
export type ProfileConfig = z.output<typeof ProfileInput>;
export type Profile = ProfileConfig & {id:string; createdAt:number; updatedAt:number; parentProfileId:string|null; branchName:string|null; revision:number};
export type ConfigChange={field:keyof ProfileConfig;kind:'added'|'removed'|'modified';before:string|null;after:string|null};
export type SnapshotPreview={snapshot:Snapshot;currentRevision:number;changes:ConfigChange[]};
export type MergePreview={branch:Profile;parent:Profile;branchRevision:number;parentRevision:number;changes:ConfigChange[]};
export const Revision=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const BranchName=z.string().trim().min(1).max(64).refine(value=>!/[\x00-\x1f]/.test(value),'Branch name cannot contain control characters');
export type Snapshot = {id:string; profileId:string; timestamp:number; trigger:'baseline'|'pre_edit'|'pre_restore'|'manual'|'fork'|'pre_merge'|'pre_launch'|'auto_close'; pinned:boolean; size:number; hasBrowserState:boolean; fileCount:number; stateBytes:number; browserVersion:string|null};
export type ManagedSession={id:string;profileId:string;status:'launching'|'active'|'closing'|'stopped'|'crashed'|'failed';startedAt:number;pid?:number;browserVersion?:string;snapshotId?:string;exitCode?:number|null;error?:string};
export const KdfParams = z.object({memoryMiB:z.union([z.literal(64),z.literal(256),z.literal(1024),z.literal(4096)]),iterations:z.literal(2)}).strict();
export type KdfParameters = z.infer<typeof KdfParams>;
export const Request = z.discriminatedUnion('action', [
  z.object({action:z.literal('status')}).strict(),
  z.object({action:z.literal('createWorkspace'),passphrase:z.string().min(12).max(1024),memoryMiB:KdfParams.shape.memoryMiB}).strict(),
  z.object({action:z.literal('unlock'),passphrase:z.string().min(1).max(1024)}).strict(),
  z.object({action:z.literal('lock')}).strict(),
  z.object({action:z.literal('profiles')}).strict(),
  z.object({action:z.literal('vpnCredentials')}).strict(),
  z.object({action:z.literal('saveVpnCredential'),credential:VpnCredential}).strict(),
  z.object({action:z.literal('clearVpnCredential'),provider:VpnProvider}).strict(),
  z.object({action:z.literal('vpnCatalog'),provider:VpnProvider}).strict(),
  z.object({action:z.literal('vpnRegistrationStatus'),provider:VpnProvider}).strict(),
  z.object({action:z.literal('prepareVpnRegistration'),provider:VpnProvider,acknowledgeSlot:z.literal(true)}).strict(),
  z.object({action:z.literal('recheckVpnRegistration'),provider:VpnProvider}).strict(),
  z.object({action:z.literal('removeVpnRegistration'),provider:VpnProvider,acknowledgeRemoval:z.literal(true)}).strict(),
  z.object({action:z.literal('resetUncertainVpnRegistration'),provider:VpnProvider,reviewedProviderAccount:z.literal(true)}).strict(),
  z.object({action:z.literal('previewVpnTunnel'),id:Id}).strict(),
  z.object({action:z.literal('createProfile'),input:ProfileInput}).strict(),
  z.object({action:z.literal('updateProfile'),id:Id,input:ProfilePatch}).strict(),
  z.object({action:z.literal('snapshots'),id:Id}).strict(),
  z.object({action:z.literal('saveStateSnapshot'),id:Id}).strict(),
  z.object({action:z.literal('previewSnapshot'),id:Id,snapshotId:Id}).strict(),
  z.object({action:z.literal('restore'),id:Id,snapshotId:Id,expectedRevision:Revision}).strict(),
  z.object({action:z.literal('createBranch'),id:Id,name:BranchName}).strict(),
  z.object({action:z.literal('previewMerge'),id:Id}).strict(),
  z.object({action:z.literal('mergeBranch'),id:Id,branchRevision:Revision,parentRevision:Revision}).strict(),
  z.object({action:z.literal('promoteBranch'),id:Id,expectedRevision:Revision}).strict(),
  z.object({action:z.literal('discardBranch'),id:Id,expectedRevision:Revision}).strict(),
  z.object({action:z.literal('pin'),id:Id,snapshotId:Id,pinned:z.boolean()}).strict(),
  z.object({action:z.literal('launch'),id:Id}).strict(),
  z.object({action:z.literal('sessions')}).strict(),
  z.object({action:z.literal('closeSession'),id:Id}).strict(),
]);
export type RequestType = z.input<typeof Request>;
export type WorkspaceStatus = {exists:boolean; unlocked:boolean; routing:{status:'blocked'; message:string}; browserVersion:string; platform:string};
export type Result<T=unknown> = {ok:true; value:T} | {ok:false; error:string};
export interface StygBridge { invoke<T=unknown>(request:RequestType):Promise<Result<T>>; }
declare global { interface Window { styg?:StygBridge; } }
