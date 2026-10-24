import {app, BrowserWindow, ipcMain, powerMonitor, protocol, session, dialog} from 'electron';
import {join, resolve, sep} from 'node:path';
import {readFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {WorkspaceService} from './workspace';
import {dispatch, isTrustedFrame, safeError} from './ipc';
import {shouldLockVault} from './idle';
import {TemporaryBrowserRuntime} from './browser-runtime';
import {WorkspaceError} from './errors';

protocol.registerSchemesAsPrivileged([
  {scheme: 'ecdys', privileges: {standard: true, secure: true, supportFetchAPI: true}},
]);
app.setName('ecdys');
// Display branding must not relocate existing vaults or appearance preferences.
// Keep the established data directory, and honor an explicit runtime override.
const userDataDirectory =
  app.commandLine.getSwitchValue('user-data-dir') || join(app.getPath('appData'), 'ecdys.app');
mkdirSync(userDataDirectory, {recursive: true, mode: 0o700});
app.setPath('userData', userDataDirectory);
if (!app.requestSingleInstanceLock()) app.quit();
let window: BrowserWindow | null = null;
let service: WorkspaceService;
let browserRuntime: TemporaryBrowserRuntime;
let quitting = false;

function createWindow() {
  window = new BrowserWindow({
    title: 'ecdys',
    width: 1440,
    height: 940,
    minWidth: 1050,
    minHeight: 720,
    backgroundColor: '#0b0e11',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  void window.loadURL('ecdys://app/index.html');
}

app.whenReady().then(() => {
  browserRuntime = new TemporaryBrowserRuntime((event) => {
    if (window && !window.isDestroyed()) window.webContents.send('ecdys:browser-event', event);
  });
  service = new WorkspaceService({
    directory: process.env.ECDYS_DATA_DIR || join(app.getPath('userData'), 'workspace'),
  });
  const rendererRoot = resolve(__dirname, '../../renderer/dist');
  protocol.handle('ecdys', async (request) => {
    const url = new URL(request.url);
    const file = resolve(rendererRoot, '.' + decodeURIComponent(url.pathname));
    if (url.hostname !== 'app' || (file !== rendererRoot && !file.startsWith(rendererRoot + sep)))
      return new Response('Not found', {status: 404});
    const extension = file.slice(file.lastIndexOf('.'));
    const mime: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
    };
    try {
      return new Response(await readFile(file), {
        headers: {'Content-Type': mime[extension] || 'application/octet-stream'},
      });
    } catch {
      return new Response('Not found', {status: 404});
    }
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({
      cancel: !details.url.startsWith('ecdys://app/') && !details.url.startsWith('devtools:'),
    });
  });
  let dialogOpen = false;
  async function chooseFile(
    work: (parent: BrowserWindow) => Promise<string | null>,
  ): Promise<string | null> {
    if (dialogOpen)
      throw new WorkspaceError('FILE_DIALOG_BUSY', 'Finish the open file dialog first.');
    if (!window || window.isDestroyed())
      throw new WorkspaceError('FILE_DIALOG_UNAVAILABLE', 'The desktop window is unavailable.');
    dialogOpen = true;
    try {
      return await work(window);
    } finally {
      dialogOpen = false;
    }
  }
  ipcMain.handle('ecdys:workspace', async (event, input: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      !event.senderFrame ||
      !isTrustedFrame(event.senderFrame.url, event.senderFrame === window.webContents.mainFrame)
    ) {
      return {
        ok: false,
        error: {code: 'FORBIDDEN', message: 'This frame cannot access the workspace.'},
      };
    }
    try {
      return {
        ok: true,
        data: await dispatch(service, input, browserRuntime, {
          selectImport: () =>
            chooseFile(async (parent) => {
              const result = await dialog.showOpenDialog(parent, {
                title: 'Save a file in the encrypted notepad',
                buttonLabel: 'Encrypt and save',
                properties: ['openFile'],
              });
              return result.canceled ? null : result.filePaths[0] || null;
            }),
          selectExport: (name) =>
            chooseFile(async (parent) => {
              const result = await dialog.showSaveDialog(parent, {
                title: 'Export a decrypted copy',
                defaultPath: name,
                buttonLabel: 'Export copy',
                message: 'This saves a decrypted copy outside your encrypted vault.',
              });
              return result.canceled ? null : result.filePath || null;
            }),
        }),
      };
    } catch (error) {
      return {ok: false, error: safeError(error)};
    }
  });
  createWindow();
  const idleTimer = setInterval(() => {
    void service
      .status()
      .then(async (status) => {
        if (shouldLockVault(status.unlocked, powerMonitor.getSystemIdleTime())) {
          await browserRuntime.stop();
          await service.lock();
          if (window && !window.isDestroyed()) window.webContents.send('ecdys:vault-locked');
        }
      })
      .catch(() => undefined);
  }, 30_000);
  idleTimer.unref();
  app.on('second-instance', () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', (event) => {
  if (!quitting && service) {
    event.preventDefault();
    quitting = true;
    void browserRuntime
      .stop()
      .then(() => service.lock())
      .finally(() => app.quit());
  }
});
