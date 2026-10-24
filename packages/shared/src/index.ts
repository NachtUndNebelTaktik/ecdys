import {z} from 'zod';
import type {ResearchDraft, ResearchWorkspace} from './research';
export {z};
export * from './research';

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
export const ProxyRouteDraftSchema = z
  .union([RouteDraftSchema.options[0], RouteDraftSchema.options[1]])
  .superRefine((route, ctx) => {
    const encoder = new TextEncoder();
    if (
      /[\x00-\x1f\x7f]/.test((route.username || '') + (route.password || '')) ||
      (route.kind === 'socks5' &&
        (encoder.encode(route.username || '').length > 255 ||
          encoder.encode(route.password || '').length > 255)) ||
      (route.kind === 'http_connect' && route.username?.includes(':')) ||
      Boolean(route.password) !== Boolean(route.username)
    )
      ctx.addIssue({code: 'custom', message: 'Use valid paired proxy credentials.'});
  });
export type ProxyRouteDraft = z.output<typeof ProxyRouteDraftSchema>;
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
export type SnapshotTrigger =
  | 'baseline'
  | 'manual'
  | 'auto_edit'
  | 'auto_pre_restore'
  | 'auto_pre_launch';
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
  researchWorkspace(): Promise<ResearchWorkspace>;
  saveResearchWorkspace(input: {
    revision: number;
    draft: ResearchDraft;
  }): Promise<ResearchWorkspace>;
  browserSupport(): Promise<BrowserSupport>;
  browserSession(): Promise<TemporaryBrowserSession | null>;
  startTemporaryBrowser(input: {
    profileId: string;
    revision: number;
    acceptTemporary: true;
  }): Promise<TemporaryBrowserSession>;
  navigateBrowser(sessionId: string, url: string): Promise<void>;
  inputBrowser(sessionId: string, input: BrowserInput): Promise<void>;
  stopBrowser(sessionId: string): Promise<void>;
  onBrowserEvent(listener: (event: BrowserEvent) => void): () => void;
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
  previewProxyImport(source: string): Promise<ProxyImportPreview>;
  importProxyPool(input: {name: string; source: string}): Promise<ProxyPool>;
  listProxyPools(): Promise<ProxyPool[]>;
  deleteProxyPool(id: string, revision: number): Promise<void>;
  changeProxyRoutes(input: ProxyChange): Promise<ProxyChangeResult[]>;
  testProxyEndpoint(id: string): Promise<ProxyDiagnostic>;
}
export type PublicProxyRoute = Exclude<PublicRoute, {kind: 'vpn'}>;
export interface ProxyImportPreview {
  valid: boolean;
  count: number;
  duplicates: number;
  entries: {line: number; route: PublicProxyRoute}[];
  issues: {line: number; message: string}[];
}
export interface ProxyEndpoint {
  id: string;
  route: PublicProxyRoute;
}
export interface ProxyPool {
  id: string;
  name: string;
  revision: number;
  createdAt: number;
  endpoints: ProxyEndpoint[];
}
export const ProxyChangeSchema = z
  .object({
    targets: z
      .array(z.object({id: z.uuid(), revision: z.number().int().positive()}).strict())
      .min(1)
      .max(99)
      .refine((targets) => new Set(targets.map((target) => target.id)).size === targets.length),
    choice: z.discriminatedUnion('mode', [
      z.object({mode: z.literal('assign'), endpointId: z.uuid()}).strict(),
      z.object({mode: z.literal('rotate'), poolId: z.uuid()}).strict(),
    ]),
  })
  .strict();
export type ProxyChange = z.infer<typeof ProxyChangeSchema>;
export type ProxyChangeResult =
  | {profileId: string; ok: true; profile: Profile}
  | {profileId: string; ok: false; error: SafeError};
export interface ProxyDiagnostic {
  endpointId: string;
  checkedAt: number;
  durationMs: number;
  scope: 'proxy_tunnel';
  state: 'pass' | 'fail';
  code: string;
  message: string;
  destination: 'example.com:443';
}
export interface SafeError {
  code: string;
  message: string;
}
export type IpcResult<T> = {ok: true; data: T} | {ok: false; error: SafeError};

export const BrowserUrlSchema = z
  .string()
  .max(4096)
  .transform((value, ctx) => {
    if (value === 'about:blank') return value;
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error();
      return url.href;
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Use an HTTP or HTTPS address without embedded credentials.',
      });
      return z.NEVER;
    }
  });
const coordinateX = z.number().min(0).max(1200),
  coordinateY = z.number().min(0).max(720);
export const BrowserInputSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('text'), text: z.string().min(1).max(4096)}).strict(),
  z
    .object({
      type: z.literal('key'),
      key: z.enum([
        'Enter',
        'Backspace',
        'Tab',
        'Escape',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Delete',
        'Home',
        'End',
      ]),
      shift: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      type: z.literal('pointer'),
      action: z.enum(['down', 'up']),
      button: z.enum(['left', 'right']),
      x: coordinateX,
      y: coordinateY,
    })
    .strict(),
  z
    .object({
      type: z.literal('wheel'),
      x: coordinateX,
      y: coordinateY,
      deltaX: z.number().min(-2000).max(2000),
      deltaY: z.number().min(-2000).max(2000),
    })
    .strict(),
]);
export type BrowserInput = z.input<typeof BrowserInputSchema>;
export interface BrowserSupport {
  available: boolean;
  reasons: string[];
  platform: string;
  mode: 'temporary_linux';
}
export interface TemporaryBrowserSession {
  id: string;
  profileId: string;
  profileName: string;
  startedAt: number;
  url: string;
  version: string;
  mode: 'temporary';
  width: 1200;
  height: 720;
  status: 'launching' | 'active' | 'stopped' | 'crashed';
}
export type BrowserEvent =
  | {type: 'session'; session: TemporaryBrowserSession | null}
  | {type: 'frame'; sessionId: string; data: string};
