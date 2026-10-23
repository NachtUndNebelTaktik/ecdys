import { app, BrowserWindow, ipcMain, session, dialog } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Request, type Result } from '../../shared/src/model';
import { Vault } from './vault';
import { routingStatus } from './routing';
import {BrowserSessions} from './browser/sessions';
const here=dirname(fileURLToPath(import.meta.url));
let window:BrowserWindow|undefined;
let vault:Vault|undefined;
let sessions:BrowserSessions|undefined;
let lockTask:Promise<{incompleteSnapshots:number}>|undefined;
let quitting=false;
let allowQuit=false;
let lockTimer:NodeJS.Timeout|undefined;
let queue:Promise<unknown>=Promise.resolve();
const workspace=()=>join(app.getPath('userData'),'workspace');
async function lock():Promise<{incompleteSnapshots:number}> {
  if(lockTask)return lockTask;
  clearTimeout(lockTimer);
  lockTask=(async()=>{
    const closed=await sessions?.shutdown()??[];
    vault?.close();vault=undefined;sessions=undefined;
    return {incompleteSnapshots:closed.filter(item=>item.status==='failed'||item.status==='crashed').length};
  })();
  try{return await lockTask;}finally{lockTask=undefined;}
}
function lifecycleError(){dialog.showErrorBox('Styg could not finish browser cleanup','The workspace remains open. Browser cleanup could not be verified; preserve profile files and retry closing sessions.');}
function touch() { clearTimeout(lockTimer); if(vault) lockTimer=setTimeout(()=>{const operation=queue.then(async()=>{await lock();if(window&&!window.isDestroyed())window.reload();});queue=operation.catch(lifecycleError);},15*60*1000); }
function requireVault() { if(!vault) throw new Error('Workspace is locked'); return vault; }
async function handle(raw:unknown):Promise<unknown> {
  const request=Request.parse(raw);
  if(request.action==='status') return {exists:await Vault.exists(workspace()),unlocked:!!vault,routing:routingStatus(),browserVersion:process.versions.chrome,platform:process.platform};
  if(request.action==='createWorkspace' || request.action==='unlock') {
    if(vault) throw new Error('Workspace is already unlocked');
    vault=request.action==='unlock'?await Vault.open(workspace(),request.passphrase):await Vault.create(workspace(),request.passphrase,{memoryMiB:request.memoryMiB,iterations:2});
    sessions=new BrowserSessions(vault);touch(); return null;
  }
  if(request.action==='lock') return lock();
  const active=requireVault(); touch();
  switch(request.action) {
    case 'profiles': return active.profiles();
    case 'createProfile': return active.createProfile(request.input);
    case 'updateProfile': return active.updateProfile(request.id,request.input);
    case 'snapshots': return active.snapshots(request.id);
    case 'saveStateSnapshot': return active.saveStateSnapshot(request.id);
    case 'previewSnapshot': return active.previewSnapshot(request.id,request.snapshotId);
    case 'restore': return active.restoreSnapshot(request.id,request.snapshotId,request.expectedRevision);
    case 'createBranch': return active.createBranch(request.id,request.name);
    case 'previewMerge': return active.previewMerge(request.id);
    case 'mergeBranch': return active.mergeBranch(request.id,request.branchRevision,request.parentRevision);
    case 'promoteBranch': return active.promoteBranch(request.id,request.expectedRevision);
    case 'discardBranch': return active.discardBranch(request.id,request.expectedRevision);
    case 'pin': active.pin(request.id,request.snapshotId,request.pinned); return null;
    case 'launch': return sessions!.launch(request.id);
    case 'sessions': return sessions!.list();
    case 'closeSession': return sessions!.close(request.id);
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
      if(quitting)return {ok:false,error:'Styg is closing'};
      if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame) return {ok:false,error:'Untrusted request origin'};
      const operation=queue.then(async():Promise<Result>=>{
        try { return {ok:true,value:await handle(raw)}; }
        catch(error) { return {ok:false,error:error instanceof z.ZodError?error.issues.map(issue=>issue.message).join('; '):error instanceof Error?error.message:'Operation failed'}; }
      });
      queue=operation.catch(()=>undefined); return operation;
    });
    createWindow();
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{
    if(allowQuit)return;
    event.preventDefault();if(quitting)return;quitting=true;
    void queue.then(()=>lock()).then(()=>{allowQuit=true;app.quit();}).catch(()=>{
      quitting=false;if(!window||window.isDestroyed())createWindow();lifecycleError();
    });
  });
}
