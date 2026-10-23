import {randomUUID} from 'node:crypto';
import {Id,type ManagedSession} from '../../../shared/src/model';
import {Vault,type BrowserProfileLease} from '../vault';
import {assertRouteReady} from '../routing';
import {BrowserStartupCleanupError,type BrowserExit,type BrowserHandle} from './chromium';
export interface BrowserSupervisor {assertReady(profileId:string):void;launch(directory:string):Promise<BrowserHandle>;}
const blockedSupervisor:BrowserSupervisor={assertReady:assertRouteReady,async launch(){assertRouteReady();}};
type Entry={view:ManagedSession;started:Promise<void>;lease?:BrowserProfileLease;handle?:BrowserHandle;stopRequested:boolean;ready:boolean;watched?:boolean;finalization?:Promise<void>;};
export class BrowserSessions {
  private entries=new Map<string,Entry>();
  private shuttingDown=false;
  constructor(private vault:Vault,private supervisor:BrowserSupervisor=blockedSupervisor){}
  list():ManagedSession[]{return [...this.entries.values()].map(entry=>({...entry.view}));}
  async launch(profileId:string):Promise<ManagedSession> {
    Id.parse(profileId);if(this.shuttingDown)throw new Error('Session manager is shutting down');
    this.supervisor.assertReady(profileId);
    const previous=this.entries.get(profileId);
    if(previous&&(['launching','active','closing'].includes(previous.view.status)||previous.lease))throw new Error('Profile already has a managed browser session');
    const entry:Entry={view:{id:randomUUID(),profileId,status:'launching',startedAt:Date.now()},started:Promise.resolve(),stopRequested:false,ready:false};
    this.entries.set(profileId,entry);entry.started=this.start(entry);await entry.started;return {...entry.view};
  }
  private async start(entry:Entry):Promise<void> {
    try {
      entry.lease=await this.vault.claimBrowser(entry.view.profileId);
      if(entry.stopRequested)throw new Error('Session launch cancelled during shutdown');
      entry.handle=await this.supervisor.launch(entry.lease.directory);
      entry.ready=true;entry.view.pid=entry.handle.pid;entry.view.browserVersion=entry.handle.version;
      this.watch(entry);
      if(entry.stopRequested){await entry.handle.close();await this.finalize(entry,await entry.handle.exited);throw new Error('Session launch cancelled during shutdown');}
      entry.view.status='active';
    }catch(error) {
      if(error instanceof BrowserStartupCleanupError){entry.handle=error.browser;entry.view.pid=error.browser.pid;entry.view.error=error.message;this.watch(entry);}
      if(entry.handle){
        try{await this.finalize(entry,await entry.handle.close());}
        catch(cleanupError){entry.view.status='failed';entry.view.error='Browser startup cleanup could not be verified; profile remains owned';throw cleanupError;}
      }
      else {entry.lease?.release();entry.lease=undefined;entry.view.status='failed';entry.view.error=error instanceof Error?error.message:'Browser startup failed';}
      throw error;
    }
  }
  private watch(entry:Entry) {
    if(entry.watched)return;entry.watched=true;
    void entry.handle!.exited.then(exit=>this.finalize(entry,exit)).catch(error=>{
      entry.view.status='failed';entry.view.error=`Process cleanup could not be verified: ${error instanceof Error?error.message:'unknown error'}`;
    });
  }
  private finalize(entry:Entry,exit:BrowserExit):Promise<void> {
    if(entry.finalization)return entry.finalization;
    entry.finalization=(async()=>{
      entry.view.exitCode=exit.code;
      try {
        if(!entry.ready){entry.view.status='failed';entry.view.error??='Browser startup failed. Working files are preserved.';}
        else if(exit.code===0&&!exit.forced&&!exit.signal) {
          entry.view.status='closing';
          const snapshot=await entry.lease!.snapshotClosed(entry.handle!.version);entry.view.snapshotId=snapshot.id;entry.view.status='stopped';delete entry.view.error;
        }else {entry.view.status='crashed';entry.view.error=exit.forced?'Browser required forced termination. Working files are preserved.':'Browser exited unexpectedly. Restore the pre-launch snapshot if needed.';}
      }catch(error){entry.view.status='failed';entry.view.error=`Browser stopped, but its close snapshot failed: ${error instanceof Error?error.message:'unknown error'}`;}
      finally{entry.lease?.release();entry.lease=undefined;}
    })();return entry.finalization;
  }
  async close(profileId:string):Promise<ManagedSession> {
    Id.parse(profileId);const entry=this.entries.get(profileId);if(!entry)throw new Error('Managed session not found');
    entry.stopRequested=true;if(['launching','active'].includes(entry.view.status))entry.view.status='closing';
    await entry.started.catch(()=>{});
    if(entry.handle)await this.finalize(entry,await entry.handle.close());
    return {...entry.view};
  }
  async shutdown():Promise<ManagedSession[]> {
    this.shuttingDown=true;
    const results=await Promise.allSettled([...this.entries.keys()].map(id=>this.close(id)));
    const errors=results.flatMap(result=>result.status==='rejected'?[result.reason]:[]);
    if(errors.length)throw new AggregateError(errors,'Managed browser cleanup failed; workspace remains owned');
    return this.list();
  }
}
