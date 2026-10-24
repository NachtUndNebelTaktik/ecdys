import {
  z,
  ProfileDraftSchema,
  VaultSetupSchema,
  ProxyChangeSchema,
  BrowserInputSchema,
  BrowserUrlSchema,
  SaveResearchSchema,
  SaveNotepadSchema,
  type SafeError,
} from '@ecdys/shared';
import {WorkspaceError, type WorkspaceService} from './workspace';
import type {TemporaryBrowserRuntime} from './browser-runtime';

const id = z.uuid();
const revision = z.number().int().positive();
const invocation = z.discriminatedUnion('method', [
  z.object({method: z.literal('notepad'), args: z.tuple([])}).strict(),
  z.object({method: z.literal('saveNotepad'), args: z.tuple([SaveNotepadSchema])}).strict(),
  z.object({method: z.literal('importNotepadFile'), args: z.tuple([])}).strict(),
  z.object({method: z.literal('exportNotepadFile'), args: z.tuple([id])}).strict(),
  z.object({method: z.literal('removeNotepadFile'), args: z.tuple([id])}).strict(),
  z.object({method: z.literal('researchWorkspace'), args: z.tuple([])}).strict(),
  z
    .object({method: z.literal('saveResearchWorkspace'), args: z.tuple([SaveResearchSchema])})
    .strict(),
  z.object({method: z.literal('browserSupport'), args: z.tuple([])}).strict(),
  z.object({method: z.literal('browserSession'), args: z.tuple([])}).strict(),
  z
    .object({
      method: z.literal('startTemporaryBrowser'),
      args: z.tuple([
        z.object({profileId: id, revision, acceptTemporary: z.literal(true)}).strict(),
      ]),
    })
    .strict(),
  z.object({method: z.literal('navigateBrowser'), args: z.tuple([id, BrowserUrlSchema])}).strict(),
  z.object({method: z.literal('inputBrowser'), args: z.tuple([id, BrowserInputSchema])}).strict(),
  z.object({method: z.literal('stopBrowser'), args: z.tuple([id])}).strict(),
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
export interface NotepadDialogs {
  selectImport(): Promise<string | null>;
  selectExport(name: string): Promise<string | null>;
}
export async function dispatch(
  service: WorkspaceService,
  input: unknown,
  runtime?: TemporaryBrowserRuntime,
  dialogs?: NotepadDialogs,
): Promise<unknown> {
  const request = parseInvocation(input);
  switch (request.method) {
    case 'notepad':
      return service.notepad();
    case 'saveNotepad':
      return service.saveNotepad(request.args[0]);
    case 'removeNotepadFile':
      return service.removeNotepadFile(request.args[0]);
    case 'importNotepadFile': {
      const ticket = await service.notepadTicket();
      if (!dialogs)
        throw new WorkspaceError(
          'FILE_DIALOG_UNAVAILABLE',
          'The native file chooser is unavailable.',
        );
      const path = await dialogs.selectImport();
      return path ? service.importNotepadFile(path, ticket) : null;
    }
    case 'exportNotepadFile': {
      const ticket = await service.notepadTicket();
      const file = await service.notepadFile(request.args[0]);
      if (!dialogs)
        throw new WorkspaceError(
          'FILE_DIALOG_UNAVAILABLE',
          'The native file chooser is unavailable.',
        );
      const path = await dialogs.selectExport(file.name);
      if (!path) return false;
      await service.exportNotepadFile(file.id, path, ticket);
      return true;
    }
    case 'researchWorkspace':
      return service.researchWorkspace();
    case 'saveResearchWorkspace':
      return service.saveResearchWorkspace(request.args[0]);
    case 'browserSupport':
      return (
        runtime?.support() || {
          available: false,
          reasons: ['The browser runtime is unavailable.'],
          platform: process.platform,
          mode: 'temporary_linux',
        }
      );
    case 'browserSession':
      await service.listProfiles();
      runtime?.replayFrame();
      return runtime?.session() || null;
    case 'startTemporaryBrowser': {
      if (!runtime)
        throw new WorkspaceError('BROWSER_UNAVAILABLE', 'The browser runtime is unavailable.');
      const input = request.args[0];
      const context = await service.prepareTemporaryBrowser(input.profileId, input.revision);
      return runtime.start(context);
    }
    case 'navigateBrowser':
      await service.listProfiles();
      if (!runtime)
        throw new WorkspaceError('BROWSER_UNAVAILABLE', 'The browser runtime is unavailable.');
      return runtime.navigate(...request.args);
    case 'inputBrowser':
      await service.listProfiles();
      if (!runtime)
        throw new WorkspaceError('BROWSER_UNAVAILABLE', 'The browser runtime is unavailable.');
      return runtime.input(...request.args);
    case 'stopBrowser':
      await service.listProfiles();
      if (!runtime)
        throw new WorkspaceError('BROWSER_UNAVAILABLE', 'The browser runtime is unavailable.');
      return runtime.stop(...request.args);
    case 'status':
      return service.status();
    case 'createVault':
      await service.create(request.args[0]);
      return service.status();
    case 'unlock':
      await service.unlock(request.args[0]);
      return service.status();
    case 'lock':
      await runtime?.stop();
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
