import {contextBridge, ipcRenderer} from 'electron';
import type {EcdysApi, IpcResult} from '@ecdys/shared';

async function call<T>(method: keyof EcdysApi, ...args: unknown[]): Promise<T> {
  const response = (await ipcRenderer.invoke('ecdys:workspace', {method, args})) as IpcResult<T>;
  if (!response.ok) {
    const error = new Error(response.error.message);
    Object.assign(error, {code: response.error.code});
    throw error;
  }
  return response.data;
}
const api: EcdysApi = {
  notepad: () => call('notepad'),
  saveNotepad: (input) => call('saveNotepad', input),
  importNotepadFile: () => call('importNotepadFile'),
  exportNotepadFile: (id) => call('exportNotepadFile', id),
  removeNotepadFile: (id) => call('removeNotepadFile', id),
  researchWorkspace: () => call('researchWorkspace'),
  saveResearchWorkspace: (input) => call('saveResearchWorkspace', input),
  browserSupport: () => call('browserSupport'),
  browserSession: () => call('browserSession'),
  startTemporaryBrowser: (input) => call('startTemporaryBrowser', input),
  navigateBrowser: (id, url) => call('navigateBrowser', id, url),
  inputBrowser: (id, input) => call('inputBrowser', id, input),
  stopBrowser: (id) => call('stopBrowser', id),
  onBrowserEvent: (listener) => {
    const handler = (_event: unknown, value: Parameters<typeof listener>[0]) => listener(value);
    ipcRenderer.on('ecdys:browser-event', handler);
    return () => ipcRenderer.removeListener('ecdys:browser-event', handler);
  },
  onVaultLocked: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('ecdys:vault-locked', handler);
    return () => ipcRenderer.removeListener('ecdys:vault-locked', handler);
  },
  status: () => call('status'),
  createVault: (input) => call('createVault', input),
  unlock: (passphrase) => call('unlock', passphrase),
  lock: () => call('lock'),
  listProfiles: () => call('listProfiles'),
  createProfile: (draft) => call('createProfile', draft),
  updateProfile: (id, revision, draft) => call('updateProfile', id, revision, draft),
  deleteProfile: (id, revision) => call('deleteProfile', id, revision),
  branchProfile: (id, name) => call('branchProfile', id, name),
  listSnapshots: (id) => call('listSnapshots', id),
  restoreSnapshot: (id, snapshotId, revision) => call('restoreSnapshot', id, snapshotId, revision),
  createSnapshot: (id) => call('createSnapshot', id),
  pinSnapshot: (id, pinned) => call('pinSnapshot', id, pinned),
  previewProxyImport: (source) => call('previewProxyImport', source),
  importProxyPool: (input) => call('importProxyPool', input),
  listProxyPools: () => call('listProxyPools'),
  deleteProxyPool: (id, revision) => call('deleteProxyPool', id, revision),
  changeProxyRoutes: (input) => call('changeProxyRoutes', input),
  testProxyEndpoint: (id) => call('testProxyEndpoint', id),
};
contextBridge.exposeInMainWorld('ecdys', Object.freeze(api));
