import { z } from 'zod';

export const Id = z.uuid();
const timezone = z.string().max(80).refine(value => {
  try { new Intl.DateTimeFormat('en', {timeZone:value}); return true; } catch { return false; }
}, 'Choose a valid IANA timezone');
const ProfileFields = z.object({
  name:z.string().trim().min(1).max(100),
  tags:z.array(z.string().trim().min(1).max(32)).max(12),
  timezone, language:z.enum(['en-US','en-GB','de-DE','fr-FR']),
  screen:z.enum(['1920 × 1080','1440 × 900','1366 × 768']),
}).strict();
export const ProfileInput = ProfileFields.extend({
  tags:ProfileFields.shape.tags.default([]), timezone:timezone.default('UTC'),
  language:ProfileFields.shape.language.default('en-US'),
  screen:ProfileFields.shape.screen.default('1920 × 1080'),
});
// Defaults belong to creation only: Zod defaults inside optional fields would
// otherwise reset omitted settings when parsing a partial update.
export const ProfilePatch = ProfileFields.partial();
export type ProfileInputType = z.input<typeof ProfileInput>;
export type ProfileConfig = z.output<typeof ProfileInput>;
export type Profile = ProfileConfig & {id:string; createdAt:number; updatedAt:number};
export type Snapshot = {id:string; profileId:string; timestamp:number; trigger:'baseline'|'pre_edit'|'pre_restore'|'manual'; pinned:boolean; size:number};
export const KdfParams = z.object({memoryMiB:z.union([z.literal(64),z.literal(256),z.literal(1024),z.literal(4096)]),iterations:z.literal(2)}).strict();
export type KdfParameters = z.infer<typeof KdfParams>;
export const Request = z.discriminatedUnion('action', [
  z.object({action:z.literal('status')}).strict(),
  z.object({action:z.literal('createWorkspace'),passphrase:z.string().min(12).max(1024),memoryMiB:KdfParams.shape.memoryMiB}).strict(),
  z.object({action:z.literal('unlock'),passphrase:z.string().min(1).max(1024)}).strict(),
  z.object({action:z.literal('lock')}).strict(),
  z.object({action:z.literal('profiles')}).strict(),
  z.object({action:z.literal('createProfile'),input:ProfileInput}).strict(),
  z.object({action:z.literal('updateProfile'),id:Id,input:ProfilePatch}).strict(),
  z.object({action:z.literal('snapshots'),id:Id}).strict(),
  z.object({action:z.literal('restore'),id:Id,snapshotId:Id}).strict(),
  z.object({action:z.literal('pin'),id:Id,snapshotId:Id,pinned:z.boolean()}).strict(),
  z.object({action:z.literal('launch'),id:Id}).strict(),
]);
export type RequestType = z.input<typeof Request>;
export type WorkspaceStatus = {exists:boolean; unlocked:boolean; routing:{status:'blocked'; message:string}; browserVersion:string; platform:string};
export type Result<T=unknown> = {ok:true; value:T} | {ok:false; error:string};
export interface StygBridge { invoke<T=unknown>(request:RequestType):Promise<Result<T>>; }
declare global { interface Window { styg?:StygBridge; } }
