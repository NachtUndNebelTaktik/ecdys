import {Worker} from 'node:worker_threads';
import {mkdirSync,lstatSync,chmodSync,rmdirSync} from 'node:fs';
import {lstat,readdir,readFile,rename,rm,unlink,open} from 'node:fs/promises';
import {join} from 'node:path';
import {Id} from '../../shared/src/model';
import {BROWSER_LOCKS,RESTORE_MARKER} from './state-archive';
export type CapturedState={envelope:Buffer;fileCount:number;stateBytes:number};
function privateDirectory(path:string) {
  try{mkdirSync(path,{mode:0o700});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  const info=lstatSync(path);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Profile data boundary must be a directory, not a link');
  if(process.platform!=='win32')chmodSync(path,0o700);
}
async function directoryExists(path:string) {
  try{const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Restore path must be a regular directory');return true;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
}
async function syncDirectory(path:string) {
  let handle;
  try{handle=await open(path,'r');await handle.sync();}
  catch(error){if(process.platform!=='win32'||!['EINVAL','EPERM','EISDIR'].includes((error as NodeJS.ErrnoException).code??''))throw error;}
  finally{await handle?.close();}
}
export class StateStore {
  private readonly root:string;
  private closed=false;
  private workers=new Set<Worker>();
  private leases=new Set<string>();
  constructor(root:string){this.root=join(root,'profiles');privateDirectory(this.root);}
  private profileRoot(id:string){Id.parse(id);if(this.closed)throw new Error('Workspace is locked');privateDirectory(this.root);const dir=join(this.root,id);privateDirectory(dir);return dir;}
  ensureSync(id:string):string {const dir=join(this.profileRoot(id),'browser');privateDirectory(dir);return dir;}
  async ensure(id:string){return this.ensureSync(id);}
  assertIdle(id:string){Id.parse(id);if(this.leases.has(id))throw new Error('Profile is busy saving or restoring browser state');}
  async withLease<T>(id:string,operation:()=>Promise<T>):Promise<T> {
    this.assertIdle(id);this.leases.add(id);try{return await operation();}finally{this.leases.delete(id);}
  }
  private run<T>(data:Record<string,unknown>):Promise<T> {
    if(this.closed)return Promise.reject(new Error('Workspace is locked'));
    const entry=new URL(import.meta.url.endsWith('.ts')?'./state-worker.ts':'./state-worker.js',import.meta.url);
    return new Promise((resolve,reject)=>{
      const worker=new Worker(entry,{workerData:data,resourceLimits:{maxOldGenerationSizeMb:384}});this.workers.add(worker);let done=false;
      const timer=setTimeout(()=>{
        done=true;
        void worker.terminate().then(()=>reject(new Error('Browser-state operation timed out')),()=>reject(new Error('Browser-state worker could not be stopped')));
      },120000);
      worker.once('message',message=>{if(done)return;done=true;clearTimeout(timer);if(message.ok)resolve(message.value as T);else reject(new Error(message.error));});
      worker.once('error',error=>{if(done)return;done=true;clearTimeout(timer);reject(new Error(`Browser-state worker failed: ${error.message}`));});
      worker.once('exit',()=>{clearTimeout(timer);this.workers.delete(worker);if(!done)reject(new Error('Browser-state operation stopped'));});
    });
  }
  async capture(id:string,snapshotId:string,key:Buffer):Promise<CapturedState> {
    Id.parse(snapshotId);const result=await this.run<CapturedState>({action:'capture',dir:this.ensureSync(id),key,profileId:id,snapshotId});
    return {...result,envelope:Buffer.from(result.envelope)};
  }
  async stage(id:string,operationId:string,snapshotId:string,envelope:Buffer,key:Buffer):Promise<void> {
    Id.parse(operationId);Id.parse(snapshotId);const dir=this.ensureSync(id);const target=join(this.profileRoot(id),`restore-${operationId}`);
    if(await directoryExists(target))throw new Error('Restore staging operation already exists');
    try{await this.run({action:'stage',dir,target,key,profileId:id,snapshotId,operationId,envelope});}
    catch(error){await this.discardStage(id,operationId);throw error;}
  }
  async discardStage(id:string,operationId:string) {
    Id.parse(operationId);const target=join(this.profileRoot(id),`restore-${operationId}`);
    if(await directoryExists(target))await rm(target,{recursive:true});
  }
  private async closedDirectory(dir:string) {
    const names=await readdir(dir);
    if(names.some(name=>BROWSER_LOCKS.has(name.toLowerCase())))throw new Error('Close the browser before restoring state (browser lock present)');
  }
  private async marker(dir:string,operationId:string) {
    const path=join(dir,RESTORE_MARKER),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>100||await readFile(path,'utf8')!==operationId)throw new Error('Restore staging identity does not match the journal');
  }
  async finishRestore(id:string,operationId:string):Promise<void> {
    Id.parse(operationId);const root=this.profileRoot(id),browser=join(root,'browser'),staged=join(root,`restore-${operationId}`),previous=join(root,`previous-${operationId}`);
    if(await directoryExists(staged)) {
      await this.marker(staged,operationId);
      if(await directoryExists(browser)) {
        await this.closedDirectory(browser);
        if(await directoryExists(previous))throw new Error('Ambiguous browser-state recovery; preserve both directories for review');
        await rename(browser,previous);await syncDirectory(root);
      }else if(!await directoryExists(previous))throw new Error('Previous browser directory is missing; preserve recovery files');
      await rename(staged,browser);await syncDirectory(root);
    }
    if(!await directoryExists(browser))throw new Error('Restored browser directory is missing');
    await this.marker(browser,operationId);await this.closedDirectory(browser);
    if(await directoryExists(previous)){await rm(previous,{recursive:true});await syncDirectory(root);}
  }
  async cleanupRestore(id:string,operationId:string) {
    Id.parse(operationId);const dir=join(this.profileRoot(id),'browser');await this.marker(dir,operationId);await unlink(join(dir,RESTORE_MARKER));await syncDirectory(dir);
  }
  async cleanupCompletedMarker(id:string) {
    const dir=this.ensureSync(id),path=join(dir,RESTORE_MARKER);
    try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>100)throw new Error('Invalid restore marker');const op=await readFile(path,'utf8');Id.parse(op);await this.cleanupRestore(id,op);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  removeEmptyProfileSync(id:string){const root=this.profileRoot(id);rmdirSync(join(root,'browser'));rmdirSync(root);}
  async cleanupAbandonedStages(id:string) {
    const root=this.profileRoot(id);
    for(const name of await readdir(root)) {
      if(name.startsWith('previous-'))throw new Error('Unreferenced previous browser directory needs review; preserve recovery files');
      if(name.startsWith('restore-')) {const op=name.slice(8);Id.parse(op);await this.discardStage(id,op);}
    }
  }
  close(){this.closed=true;for(const worker of this.workers)void worker.terminate();}
}
