import {z} from 'zod';
export {z};

const host = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .refine(
    (value) => !/[\s/\\@?#]/.test(value),
    'Enter a host without a URL scheme or credentials.',
  );
const proxy = {
  host,
  port: z.number().int().min(1).max(65535),
  username: z.string().max(256).optional(),
  password: z.string().min(1).max(2048).optional(),
  clearPassword: z.boolean().optional(),
  routeLock: z.literal(true).default(true),
};
export const RouteDraftSchema = z.discriminatedUnion('kind', [
  z
    .object({kind: z.literal('socks5'), ...proxy, remoteDNS: z.literal(true).default(true)})
    .strict(),
  z
    .object({kind: z.literal('http_connect'), ...proxy, tlsToProxy: z.boolean().default(true)})
    .strict(),
  z
    .object({
      kind: z.literal('vpn'),
      provider: z.enum(['mullvad', 'ivpn']),
      endpoint: z.string().trim().min(1).max(253),
      routeLock: z.literal(true).default(true),
    })
    .strict(),
]);
export const ProfileDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    tags: z
      .array(z.string().trim().min(1).max(32))
      .max(20)
      .default([])
      .transform((tags) => [...new Set(tags)]),
    folder: z.string().trim().max(80).default(''),
    policy: z.enum(['standard', 'protected_execution']).default('standard'),
    timezone: z
      .string()
      .max(80)
      .default('UTC')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', {timeZone: value});
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid IANA timezone.'),
    route: RouteDraftSchema.nullable().default(null),
  })
  .strict();
export const VaultSetupSchema = z
  .object({
    passphrase: z.string().min(12).max(1024),
    memoryMiB: z
      .union([z.literal(1024), z.literal(2048), z.literal(4096), z.literal(8192)])
      .default(4096),
  })
  .strict();
export type RouteDraft = z.input<typeof RouteDraftSchema>;
export type ProfileDraft = z.input<typeof ProfileDraftSchema>;
export type ParsedProfileDraft = z.output<typeof ProfileDraftSchema>;
export type PublicRoute =
  | {
      kind: 'socks5';
      host: string;
      port: number;
      username?: string;
      hasPassword: boolean;
      remoteDNS: true;
      routeLock: true;
    }
  | {
      kind: 'http_connect';
      host: string;
      port: number;
      username?: string;
      hasPassword: boolean;
      tlsToProxy: boolean;
      routeLock: true;
    }
  | {kind: 'vpn'; provider: 'mullvad' | 'ivpn'; endpoint: string; routeLock: true};
export interface Profile {
  id: string;
  name: string;
  tags: string[];
  folder: string;
  policy: 'standard' | 'protected_execution';
  timezone: string;
  route: PublicRoute | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
  parentProfileId: string | null;
  branchName: string | null;
  snapshotCount: number;
  lastSnapshotAt: number;
}
export type SnapshotTrigger = 'baseline' | 'manual' | 'auto_edit' | 'auto_pre_restore';
export interface Snapshot {
  id: string;
  profileId: string;
  trigger: SnapshotTrigger;
  capturedAt: number;
  revision: number;
  pinned: boolean;
  bytes: number;
  scope: 'config';
  config: Omit<
    Profile,
    | 'id'
    | 'revision'
    | 'createdAt'
    | 'updatedAt'
    | 'parentProfileId'
    | 'branchName'
    | 'snapshotCount'
    | 'lastSnapshotAt'
  >;
}
export interface VaultStatus {
  recoveryRequired?: boolean;
  storageWarnings?: string[];
  exists: boolean;
  unlocked: boolean;
  profileLimit: number;
  memoryMiB?: number;
  localId?: string;
  createdAt?: number;
}
export type ObservationState = 'pass' | 'fail' | 'unknown' | 'unavailable' | 'unsupported';
export function evaluateLaunch(input: {
  hasRoute: boolean;
  nativeRouteReady: boolean;
  protectedStorageReady: boolean;
  browserReady: boolean;
  requiredObservations: ObservationState[];
}): {allowed: boolean; reasons: string[]} {
  const reasons: string[] = [];
  if (!input.hasRoute) reasons.push('Configure a VPN or proxy route.');
  if (!input.nativeRouteReady) reasons.push('Native route enforcement is not available.');
  if (!input.protectedStorageReady) reasons.push('Protected browser storage is not available.');
  if (!input.browserReady) reasons.push('The managed browser is not available.');
  if (
    !input.requiredObservations.length ||
    input.requiredObservations.some((state) => state !== 'pass')
  )
    reasons.push('Every required validation check must pass.');
  return {allowed: reasons.length === 0, reasons};
}
export interface EcdysApi {
  onVaultLocked(listener: () => void): () => void;
  status(): Promise<VaultStatus>;
  createVault(input: z.input<typeof VaultSetupSchema>): Promise<VaultStatus>;
  unlock(passphrase: string): Promise<VaultStatus>;
  lock(): Promise<VaultStatus>;
  listProfiles(): Promise<Profile[]>;
  createProfile(draft: ProfileDraft): Promise<Profile>;
  updateProfile(id: string, revision: number, draft: ProfileDraft): Promise<Profile>;
  deleteProfile(id: string, revision: number): Promise<void>;
  branchProfile(id: string, name: string): Promise<Profile>;
  listSnapshots(id: string): Promise<Snapshot[]>;
  restoreSnapshot(profileId: string, snapshotId: string, revision: number): Promise<Profile>;
  createSnapshot(profileId: string): Promise<Snapshot[]>;
  pinSnapshot(snapshotId: string, pinned: boolean): Promise<void>;
}
export interface SafeError {
  code: string;
  message: string;
}
export type IpcResult<T> = {ok: true; data: T} | {ok: false; error: SafeError};
