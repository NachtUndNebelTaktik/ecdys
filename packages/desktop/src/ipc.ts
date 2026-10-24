import {
  z,
  ProfileDraftSchema,
  VaultSetupSchema,
  ProxyChangeSchema,
  type SafeError,
} from '@ecdys/shared';
import {WorkspaceError, type WorkspaceService} from './workspace';

const id = z.uuid();
const revision = z.number().int().positive();
const invocation = z.discriminatedUnion('method', [
  z.object({method: z.literal('status'), args: z.tuple([])}).strict(),
  z.object({method: z.literal('createVault'), args: z.tuple([VaultSetupSchema])}).strict(),
  z.object({method: z.literal('unlock'), args: z.tuple([z.string().min(1).max(1024)])}).strict(),
  z.object({method: z.literal('lock'), args: z.tuple([])}).strict(),
  z.object({method: z.literal('listProfiles'), args: z.tuple([])}).strict(),
  z.object({method: z.literal('createProfile'), args: z.tuple([ProfileDraftSchema])}).strict(),
  z
    .object({method: z.literal('updateProfile'), args: z.tuple([id, revision, ProfileDraftSchema])})
    .strict(),
  z.object({method: z.literal('deleteProfile'), args: z.tuple([id, revision])}).strict(),
  z
    .object({
      method: z.literal('branchProfile'),
      args: z.tuple([id, z.string().trim().min(1).max(80)]),
    })
    .strict(),
  z.object({method: z.literal('listSnapshots'), args: z.tuple([id])}).strict(),
  z.object({method: z.literal('restoreSnapshot'), args: z.tuple([id, id, revision])}).strict(),
  z.object({method: z.literal('createSnapshot'), args: z.tuple([id])}).strict(),
  z.object({method: z.literal('pinSnapshot'), args: z.tuple([id, z.boolean()])}).strict(),
  z
    .object({method: z.literal('previewProxyImport'), args: z.tuple([z.string().max(131_072)])})
    .strict(),
  z
    .object({
      method: z.literal('importProxyPool'),
      args: z.tuple([
        z
          .object({name: z.string().trim().min(1).max(80), source: z.string().max(131_072)})
          .strict(),
      ]),
    })
    .strict(),
  z.object({method: z.literal('listProxyPools'), args: z.tuple([])}).strict(),
  z.object({method: z.literal('deleteProxyPool'), args: z.tuple([id, revision])}).strict(),
  z.object({method: z.literal('changeProxyRoutes'), args: z.tuple([ProxyChangeSchema])}).strict(),
  z.object({method: z.literal('testProxyEndpoint'), args: z.tuple([id])}).strict(),
]);
export function isTrustedFrame(url: string, isMainFrame: boolean): boolean {
  if (!isMainFrame) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'ecdys:' &&
      parsed.hostname === 'app' &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port
    );
  } catch {
    return false;
  }
}
export function parseInvocation(input: unknown) {
  if (JSON.stringify(input).length > 262_144)
    throw new WorkspaceError('INVALID_INPUT', 'Request too large.');
  return invocation.parse(input);
}
export function safeError(error: unknown): SafeError {
  if (error instanceof WorkspaceError) return {code: error.code, message: error.message};
  if (error instanceof z.ZodError)
    return {
      code: 'INVALID_INPUT',
      message: 'Check your input. A required value is missing or invalid.',
    };
  return {
    code: 'INTERNAL_ERROR',
    message: 'The operation could not be completed. Your workspace was not intentionally replaced.',
  };
}
export async function dispatch(service: WorkspaceService, input: unknown): Promise<unknown> {
  const request = parseInvocation(input);
  switch (request.method) {
    case 'status':
      return service.status();
    case 'createVault':
      await service.create(request.args[0]);
      return service.status();
    case 'unlock':
      await service.unlock(request.args[0]);
      return service.status();
    case 'lock':
      await service.lock();
      return service.status();
    case 'listProfiles':
      return service.listProfiles();
    case 'createProfile':
      return service.createProfile(request.args[0]);
    case 'updateProfile':
      return service.updateProfile(...request.args);
    case 'deleteProfile':
      return service.deleteProfile(...request.args);
    case 'branchProfile':
      return service.branchProfile(...request.args);
    case 'listSnapshots':
      return service.listSnapshots(request.args[0]);
    case 'restoreSnapshot':
      return service.restoreSnapshot(...request.args);
    case 'createSnapshot':
      return service.createSnapshot(request.args[0]);
    case 'pinSnapshot':
      return service.pinSnapshot(...request.args);
    case 'previewProxyImport':
      return service.previewProxyImport(request.args[0]);
    case 'importProxyPool':
      return service.importProxyPool(request.args[0]);
    case 'listProxyPools':
      return service.listProxyPools();
    case 'deleteProxyPool':
      return service.deleteProxyPool(...request.args);
    case 'changeProxyRoutes':
      return service.changeProxyRoutes(request.args[0]);
    case 'testProxyEndpoint':
      return service.testProxyEndpoint(request.args[0]);
  }
}
