import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Request, type Result } from '../../shared/src/model';
import { Vault } from './vault';
import { assertRouteReady, routingStatus } from './routing';
const here=dirname(fileURLToPath(import.meta.url));
let window:BrowserWindow|undefined;
let vault:Vault|undefined;
let lockTimer:NodeJS.Timeout|undefined;
let queue:Promise<unknown>=Promise.resolve();
const workspace=()=>join(app.getPath('userData'),'workspace');
function lock() { clearTimeout(lockTimer); vault?.close(); vault=undefined; }
function touch() { clearTimeout(lockTimer); if(vault) lockTimer=setTimeout(()=>{lock(); window?.reload();},15*60*1000); }
function requireVault() { if(!vault) throw new Error('Workspace is locked'); return vault; }
async function handle(raw:unknown):Promise<unknown> {
  const request=Request.parse(raw);
  if(request.action==='status') return {exists:await Vault.exists(workspace()),unlocked:!!vault,routing:routingStatus(),browserVersion:process.versions.chrome,platform:process.platform};
  if(request.action==='createWorkspace' || request.action==='unlock') {
    if(vault) throw new Error('Workspace is already unlocked');
    vault=request.action==='unlock'?await Vault.open(workspace(),request.passphrase):await Vault.create(workspace(),request.passphrase,{memoryMiB:request.memoryMiB,iterations:2});
    touch(); return null;
  }
  if(request.action==='lock') { lock(); return null; }
  const active=requireVault(); touch();
  switch(request.action) {
    case 'profiles': return active.profiles();
    case 'createProfile': return active.createProfile(request.input);
    case 'updateProfile': return active.updateProfile(request.id,request.input);
    case 'snapshots': return active.snapshots(request.id);
    case 'restore': return active.restore(request.id,request.snapshotId);
    case 'pin': active.pin(request.id,request.snapshotId,request.pinned); return null;
    case 'launch': assertRouteReady();
  }
}
function createWindow() {
  window=new BrowserWindow({width:1440,height:960,minWidth:1060,minHeight:720,backgroundColor:'#101514',title:'Styg',show:false,webPreferences:{preload:join(here,'../preload/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.removeMenu();
  window.once('ready-to-show',()=>window?.show());
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.webContents.on('will-attach-webview',event=>event.preventDefault());
  const devUrl=process.env.ELECTRON_RENDERER_URL;
  if(devUrl) void window.loadURL(devUrl); else void window.loadFile(join(here,'../renderer/index.html'));
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{window?.show();window?.focus();});
  app.whenReady().then(()=>{
    app.setName('Styg');
    session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    ipcMain.handle('styg:request',(event,raw)=>{
      if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame) return {ok:false,error:'Untrusted request origin'};
      const operation=queue.then(async():Promise<Result>=>{
        try { return {ok:true,value:await handle(raw)}; }
        catch(error) { return {ok:false,error:error instanceof z.ZodError?error.issues.map(issue=>issue.message).join('; '):error instanceof Error?error.message:'Operation failed'}; }
      });
      queue=operation.catch(()=>undefined); return operation;
    });
    createWindow();
  });
  app.on('window-all-closed',()=>{lock();app.quit();});
  app.on('before-quit',lock);
}
