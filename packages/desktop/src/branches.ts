import type Database from 'better-sqlite3-multiple-ciphers';
import {randomUUID} from 'node:crypto';
import {BranchName,ProfileInput,Revision,type Profile,type MergePreview,type Snapshot} from '../../shared/src/model';
import {openSnapshot,sealSnapshot} from './crypto';
import {configurationDiff,ENVIRONMENT_FIELDS,profileConfiguration} from './profile-diff';
import {StateStore} from './state-store';
type Context={db:Database.Database;key:Buffer;states:StateStore;get:(id:string)=>Profile;guard:()=>void;blockRecovery:()=>void;capture:(id:string,trigger:Snapshot['trigger'])=>void;prune:(id:string)=>void};
type HistoryRow={seq:number;id:string;timestamp:number;trigger:string;pinned:number;envelope:Buffer;stateEnvelope:Buffer|null;fileCount:number;stateBytes:number;browserVersion:string|null};
export class BranchManager {
  constructor(private ctx:Context){}
  private check(profile:Profile,revision:number) {Revision.parse(revision);if(profile.revision!==revision)throw new Error('Profile changed since this preview. Review it again before continuing.');}
  private branch(id:string) {const profile=this.ctx.get(id);if(!profile.parentProfileId)throw new Error('This operation requires a branch');return profile;}
  private async removeCreation(id:string,operationId:string) {
    await this.ctx.states.discardStage(id,operationId);this.ctx.states.removeEmptyProfileSync(id);
    this.ctx.db.prepare("DELETE FROM profiles WHERE id=? AND status='creating'").run(id);
  }
  async recover() {
    const db=this.ctx.db;
    const creating=db.prepare("SELECT p.id,p.parentProfileId,f.operationId FROM profiles p LEFT JOIN fork_jobs f ON f.profileId=p.id WHERE p.status='creating'").all() as {id:string;parentProfileId:string|null;operationId:string|null}[];
    for(const row of creating){if(!row.parentProfileId||!row.operationId)throw new Error('Incomplete branch creation journal; preserve profile files');await this.removeCreation(row.id,row.operationId);}
    const deleting=db.prepare("SELECT p.id,p.parentProfileId,d.operationId FROM profiles p LEFT JOIN discard_jobs d ON d.profileId=p.id WHERE p.status='deleting'").all() as {id:string;parentProfileId:string|null;operationId:string|null}[];
    for(const row of deleting){if(!row.parentProfileId||!row.operationId)throw new Error('Incomplete branch discard journal; preserve profile files');await this.ctx.states.discardProfile(row.id,row.operationId);db.prepare('DELETE FROM profiles WHERE id=?').run(row.id);}
  }
  async createBranch(parentId:string,name:string):Promise<Profile> {
    const parent=this.ctx.get(parentId);const label=BranchName.parse(name);const db=this.ctx.db;
    return this.ctx.states.withLease(parentId,async()=>{
      const id=randomUUID(),operationId=randomUUID(),forkId=randomUUID(),now=Date.now();
      const config={...profileConfiguration(parent),name:`${parent.name.slice(0,97-label.length)} · ${label}`};
      if((db.prepare('SELECT COUNT(*) AS count FROM profiles').get() as {count:number}).count>=99)throw new Error('Maximum 99 profiles');
      if(db.prepare("SELECT 1 FROM profiles WHERE parentProfileId=? AND branchName=? COLLATE NOCASE AND status<>'deleting'").get(parentId,label))throw new Error('A branch with this name already exists for this parent');
      db.transaction(()=>{
        db.prepare("INSERT INTO profiles(id,config,createdAt,updatedAt,parentProfileId,branchName,status) VALUES(?,?,?,?,?,?,'creating')").run(id,JSON.stringify(config),now,now,parentId,label);
        db.prepare('INSERT INTO fork_jobs VALUES(?,?)').run(id,operationId);
      })();
      let activated=false;
      try {
        this.ctx.states.ensureSync(id);
        let sequence=0;
        while(true) {
          this.ctx.guard();
          const row=db.prepare('SELECT * FROM snapshots WHERE profileId=? AND seq>? ORDER BY seq LIMIT 1').get(parentId,sequence) as HistoryRow|undefined;
          if(!row)break;sequence=row.seq;const snapshotId=randomUUID();
          const oldConfig=ProfileInput.parse(openSnapshot(row.envelope,this.ctx.key,parentId,row.id));
          const state=row.stateEnvelope?await this.ctx.states.rebind(parentId,row.id,id,snapshotId,row.stateEnvelope,this.ctx.key):null;
          this.ctx.guard();
          db.prepare('INSERT INTO snapshots(id,profileId,timestamp,trigger,pinned,envelope,stateEnvelope,fileCount,stateBytes,browserVersion) VALUES(?,?,?,?,?,?,?,?,?,?)').run(snapshotId,id,row.timestamp,row.trigger,row.pinned,sealSnapshot(oldConfig,this.ctx.key,id,snapshotId),state?.envelope??null,state?.fileCount??0,state?.stateBytes??0,row.browserVersion);
        }
        const state=await this.ctx.states.captureFor(parentId,id,forkId,this.ctx.key);
        await this.ctx.states.stage(id,operationId,forkId,state.envelope,this.ctx.key);this.ctx.guard();
        db.transaction(()=>{
          db.prepare("INSERT INTO snapshots(id,profileId,timestamp,trigger,pinned,envelope,stateEnvelope,fileCount,stateBytes) VALUES(?,?,?,'fork',1,?,?,?,?)").run(forkId,id,Date.now(),sealSnapshot(config,this.ctx.key,id,forkId),state.envelope,state.fileCount,state.stateBytes);
          db.prepare("UPDATE profiles SET status='ready' WHERE id=?").run(id);
          db.prepare('INSERT INTO restore_jobs VALUES(?,?)').run(id,operationId);
          db.prepare('DELETE FROM fork_jobs WHERE profileId=?').run(id);
        })();activated=true;
        await this.ctx.states.finishRestore(id,operationId);
        db.prepare('DELETE FROM restore_jobs WHERE profileId=?').run(id);await this.ctx.states.cleanupRestore(id,operationId);
        return this.ctx.get(id);
      }catch(error) {
        if(activated){this.ctx.blockRecovery();throw new Error('Branch activation needs recovery. Lock and reopen the workspace to finish.');}
        try{await this.removeCreation(id,operationId);}catch{this.ctx.blockRecovery();}
        throw error;
      }
    });
  }
  previewMerge(id:string):MergePreview {
    const branch=this.branch(id),parent=this.ctx.get(branch.parentProfileId!);
    return {branch,parent,branchRevision:branch.revision,parentRevision:parent.revision,changes:configurationDiff(profileConfiguration(parent),profileConfiguration(branch),ENVIRONMENT_FIELDS)};
  }
  mergeBranch(id:string,branchRevision:number,parentRevision:number):Profile {
    const first=this.branch(id);this.ctx.states.assertIdle(id);this.ctx.states.assertIdle(first.parentProfileId!);
    this.ctx.db.transaction(()=>{
      const branch=this.branch(id),parent=this.ctx.get(branch.parentProfileId!);this.check(branch,branchRevision);this.check(parent,parentRevision);
      const config={...profileConfiguration(parent),timezone:branch.timezone,language:branch.language,screen:branch.screen};
      this.ctx.capture(parent.id,'pre_merge');
      this.ctx.db.prepare('UPDATE profiles SET config=?,updatedAt=?,revision=revision+1 WHERE id=?').run(JSON.stringify(config),Date.now(),parent.id);this.ctx.prune(parent.id);
    })();return this.ctx.get(first.parentProfileId!);
  }
  promoteBranch(id:string,expectedRevision:number):Profile {
    this.ctx.states.assertIdle(id);
    this.ctx.db.transaction(()=>{const branch=this.branch(id);this.check(branch,expectedRevision);this.ctx.db.prepare('UPDATE profiles SET parentProfileId=NULL,branchName=NULL,revision=revision+1,updatedAt=? WHERE id=?').run(Date.now(),id);})();
    return this.ctx.get(id);
  }
  async discardBranch(id:string,expectedRevision:number):Promise<void> {
    const branch=this.branch(id);this.check(branch,expectedRevision);
    return this.ctx.states.withLease(id,async()=>{
      if(this.ctx.db.prepare('SELECT 1 FROM profiles WHERE parentProfileId=? LIMIT 1').get(id))throw new Error('Promote or discard child branches first');
      await this.ctx.states.assertClosedProfile(id);this.check(this.branch(id),expectedRevision);
      const operationId=randomUUID();this.ctx.db.transaction(()=>{
        this.ctx.db.prepare("UPDATE profiles SET status='deleting' WHERE id=?").run(id);
        this.ctx.db.prepare('INSERT INTO discard_jobs VALUES(?,?)').run(id,operationId);
      })();
      try{await this.ctx.states.discardProfile(id,operationId);this.ctx.db.prepare('DELETE FROM profiles WHERE id=?').run(id);}
      catch{this.ctx.blockRecovery();throw new Error('Branch discard needs recovery. Lock and reopen the workspace to finish.');}
    });
  }
}
