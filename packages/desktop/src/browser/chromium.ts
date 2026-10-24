import {spawn,type ChildProcess} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {lstat} from 'node:fs/promises';
import type {Readable,Writable} from 'node:stream';
import {CdpPipe} from './cdp-pipe';
import {signalGroup,stopResidualGroup} from './process-group';
import {observeOwnedLocks} from './owned-locks';
import {listArchivePages,captureArchivePage,type ArchiveTarget,type CapturedPage} from './page-archive';
export type BrowserExit={code:number|null;signal:NodeJS.Signals|null;forced:boolean};
export interface BrowserHandle {pid:number;version:string;exited:Promise<BrowserExit>;close():Promise<BrowserExit>;listPages?():Promise<ArchiveTarget[]>;capturePage?(targetId:string):Promise<CapturedPage>;}
export class BrowserStartupCleanupError extends Error {
  constructor(readonly browser:BrowserHandle,cause:unknown){super('Browser startup failed and process cleanup could not be verified',{cause});}
}
export type ChromiumOptions={executable:string;directory:string;startupTimeoutMs?:number;closeTimeoutMs?:number};
async function waitUntil<T>(promise:Promise<T>,timeoutMs:number):Promise<boolean> {
  let timer:NodeJS.Timeout|undefined;
  try{return await Promise.race([promise.then(()=>true),new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);}
  finally{clearTimeout(timer);}
}
export class ChromiumProcess implements BrowserHandle {
  readonly pid:number;
  version='';
  private pipe:CdpPipe;
  private forced=false;
  private ended=false;
  private lockObservation:Promise<()=>Promise<void>>=Promise.resolve(async()=>{});
  private locksObserved=false;
  private groupStopped=false;
  private residualForced=false;
  private exitTask:Promise<BrowserExit>|undefined;
  private closeTask:Promise<BrowserExit>|undefined;
  private rawExit:Promise<{code:number|null;signal:NodeJS.Signals|null}>;
  private constructor(child:ChildProcess,private closeTimeoutMs:number,startupTimeoutMs:number) {
    this.pid=child.pid??0;
    this.pipe=new CdpPipe(child.stdio[3] as Writable,child.stdio[4] as Readable,startupTimeoutMs);
    child.stderr?.on('data',()=>{}); // Drain without persisting pages, credentials or command output.
    this.rawExit=new Promise(resolve=>{
      child.once('error',error=>{this.ended=true;this.pipe.dispose(error);resolve({code:null,signal:null});});
      child.once('exit',(code,signal)=>{this.ended=true;this.pipe.dispose();resolve({code,signal});});
    });
    void this.exited.catch(()=>{});
    void this.pipe.closed.then(()=>{if(!this.ended&&!this.closeTask)void this.close().catch(()=>{});});
  }
  static async start(options:ChromiumOptions):Promise<ChromiumProcess> {
    if(process.platform!=='linux')throw new Error('Managed process containment is currently implemented for Linux only');
    if(!isAbsolute(options.executable)||!isAbsolute(options.directory))throw new Error('Browser executable and profile directory must be absolute');
    const info=await lstat(options.directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Browser profile must be a regular directory');
    const child=spawn(options.executable,[`--user-data-dir=${options.directory}`,'--remote-debugging-pipe','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-component-update','--disable-default-apps','about:blank'],{detached:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
    const browser=new ChromiumProcess(child,options.closeTimeoutMs??5000,options.startupTimeoutMs??10000);
    try {
      const version=await browser.command<{product:string}>('Browser.getVersion');
      if(typeof version.product!=='string'||!version.product||version.product.length>120)throw new Error('Invalid browser version response');
      browser.locksObserved=true;browser.lockObservation=observeOwnedLocks(options.directory,browser.pid);await browser.lockObservation;
      browser.version=version.product;return browser;
    }catch(error){
      if(!browser.locksObserved&&!browser.ended){browser.locksObserved=true;browser.lockObservation=observeOwnedLocks(options.directory,browser.pid);void browser.lockObservation.catch(()=>{});}
      try{await browser.close();}catch(cleanupError){throw new BrowserStartupCleanupError(browser,cleanupError);}throw error;
    }
  }
  get exited():Promise<BrowserExit> {
    if(this.exitTask)return this.exitTask;
    const task=this.rawExit.then(async exit=>{
      if(!this.groupStopped){this.residualForced=this.pid?await stopResidualGroup(this.pid):false;this.groupStopped=true;}
      const cleanup=await this.lockObservation;await cleanup();
      return {...exit,forced:this.residualForced||this.forced};
    });
    this.exitTask=task;void task.catch(()=>{if(this.exitTask===task)this.exitTask=undefined;});return task;
  }
  command<T=unknown>(method:string,params:Record<string,unknown>={},sessionId?:string):Promise<T> {return this.pipe.send<T>(method,params,sessionId);}
  listPages():Promise<ArchiveTarget[]> {return listArchivePages(this.command.bind(this));}
  capturePage(targetId:string):Promise<CapturedPage> {return captureArchivePage(this.command.bind(this),targetId);}
  close():Promise<BrowserExit> {
    if(this.closeTask)return this.closeTask;
    this.closeTask=(async()=>{
      if(!this.ended) {
        void this.command('Browser.close').catch(()=>{});
        if(!await waitUntil(this.rawExit,this.closeTimeoutMs)) {
          this.forced=true;if(this.pid)signalGroup(this.pid,'SIGTERM');
          if(!await waitUntil(this.rawExit,500)) {
            if(this.pid)signalGroup(this.pid,'SIGKILL');
            if(!await waitUntil(this.rawExit,1000))throw new Error('Browser leader did not stop; preserve profile files');
          }
        }
      }
      return this.exited;
    })();const task=this.closeTask;void task.catch(()=>{if(this.closeTask===task)this.closeTask=undefined;});return task;
  }
}
