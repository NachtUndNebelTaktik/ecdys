import Database from 'better-sqlite3-multiple-ciphers';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Id, KdfParams, ProfileInput, ProfilePatch, type KdfParameters, type Profile, type ProfileInputType, type Snapshot, type SnapshotPreview, type MergePreview } from '../../shared/src/model';
import {BranchManager} from './branches';
import {configurationDiff,profileConfiguration} from './profile-diff';
import {Revision} from '../../shared/src/model';
import { StateStore, type CapturedState } from './state-store';
import { deriveMasterKey, openSnapshot, sealSnapshot } from './crypto';

const Metadata=z.object({version:z.literal(1),salt:z.string().regex(/^[a-f0-9]{64}$/),kdf:KdfParams}).strict();
const passphraseSchema=z.string().min(12).max(1024);
const schema=`
CREATE TABLE profiles(id TEXT PRIMARY KEY, config TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL, parentProfileId TEXT REFERENCES profiles(id) ON DELETE SET NULL, branchName TEXT, revision INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','creating','deleting')));
CREATE TABLE snapshots(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, profileId TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, timestamp INTEGER NOT NULL, trigger TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, envelope BLOB NOT NULL, stateEnvelope BLOB, fileCount INTEGER NOT NULL DEFAULT 0, stateBytes INTEGER NOT NULL DEFAULT 0, browserVersion TEXT);
CREATE INDEX snapshots_profile ON snapshots(profileId,seq);
CREATE TRIGGER profile_limit BEFORE INSERT ON profiles WHEN (SELECT COUNT(*) FROM profiles)>=99 BEGIN SELECT RAISE(ABORT,'Maximum 99 profiles'); END;
CREATE TABLE restore_jobs(profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, operationId TEXT NOT NULL);
CREATE TABLE fork_jobs(profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, operationId TEXT NOT NULL);
CREATE TABLE discard_jobs(profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, operationId TEXT NOT NULL);
CREATE UNIQUE INDEX branch_names ON profiles(parentProfileId,branchName COLLATE NOCASE) WHERE parentProfileId IS NOT NULL AND status<>'deleting';
PRAGMA user_version=3;`;

export class Vault {
  private locked=false;
  private recoveryBlocked=false;
  private states:StateStore;
  private branches:BranchManager;
  private constructor(private db:Database.Database,private key:Buffer,root:string) {
    this.states=new StateStore(root);
    this.branches=new BranchManager({db,key,states:this.states,get:id=>this.get(id),guard:()=>this.guard(),blockRecovery:()=>{this.recoveryBlocked=true;},capture:(id,trigger)=>this.capture(id,trigger),prune:id=>this.prune(id)});
  }
  private static migrate(db:Database.Database) {
    db.transaction(()=>{
      let version=db.pragma('user_version',{simple:true});
      if(version===1){db.exec('ALTER TABLE snapshots ADD COLUMN stateEnvelope BLOB; ALTER TABLE snapshots ADD COLUMN fileCount INTEGER NOT NULL DEFAULT 0; ALTER TABLE snapshots ADD COLUMN stateBytes INTEGER NOT NULL DEFAULT 0; ALTER TABLE snapshots ADD COLUMN browserVersion TEXT; CREATE TABLE restore_jobs(profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,operationId TEXT NOT NULL);');version=2;}
      if(version===2){db.exec("ALTER TABLE profiles ADD COLUMN parentProfileId TEXT REFERENCES profiles(id) ON DELETE SET NULL; ALTER TABLE profiles ADD COLUMN branchName TEXT; ALTER TABLE profiles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1; ALTER TABLE profiles ADD COLUMN status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','creating','deleting')); CREATE TABLE fork_jobs(profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,operationId TEXT NOT NULL); CREATE TABLE discard_jobs(profileId TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,operationId TEXT NOT NULL); CREATE UNIQUE INDEX branch_names ON profiles(parentProfileId,branchName COLLATE NOCASE) WHERE parentProfileId IS NOT NULL AND status<>'deleting';");version=3;}
      if(version!==3)throw new Error('Unsupported workspace version');db.pragma('user_version=3');
    })();
  }
  private async recover() {
    await this.branches.recover();
    const jobs=this.db.prepare('SELECT profileId,operationId FROM restore_jobs').all() as {profileId:string;operationId:string}[];
    for(const job of jobs) {
      await this.states.finishRestore(job.profileId,job.operationId);
      this.db.prepare('DELETE FROM restore_jobs WHERE profileId=?').run(job.profileId);
      await this.states.cleanupRestore(job.profileId,job.operationId);
    }
    for(const {id} of this.db.prepare('SELECT id FROM profiles').all() as {id:string}[]) {
      await this.states.cleanupCompletedMarker(id);await this.states.cleanupAbandonedStages(id);
    }
  }
  static async exists(root:string) { try { await access(root); return true; } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return false; throw error; } }
  private static connect(file:string,key:Buffer,existing:boolean) {
    const db=new Database(file,{fileMustExist:existing});
    try {
      db.pragma("cipher='sqlcipher'"); db.pragma('legacy=4');
      db.key(key);
      db.pragma('foreign_keys=ON'); db.pragma('secure_delete=ON'); db.pragma('synchronous=FULL');
      db.pragma('journal_mode=DELETE');
      return db;
    } catch(error) { db.close(); throw error; }
  }
  static async create(root:string,passphrase:string,params:KdfParameters={memoryMiB:256,iterations:2}):Promise<Vault> {
    passphraseSchema.parse(passphrase); KdfParams.parse(params);
    if(await Vault.exists(root)) throw new Error('Workspace already exists. Unlock it instead.');
    const salt=randomBytes(32); const key=await deriveMasterKey(passphrase,salt,params);
    let owned=false; let db:Database.Database|undefined;
    try {
      await mkdir(root,{mode:0o700}); owned=true;
      db=Vault.connect(join(root,'workspace.db'),key,false); db.exec(schema);
      await writeFile(join(root,'workspace.json'),JSON.stringify({version:1,salt:salt.toString('hex'),kdf:params}),{flag:'wx',mode:0o600});
      return new Vault(db,key,root);
    } catch(error) { db?.close(); key.fill(0); if(owned) await rm(root,{recursive:true,force:true}); throw error; }
  }
  static async open(root:string,passphrase:string):Promise<Vault> {
    z.string().min(1).max(1024).parse(passphrase);
    const bytes=await readFile(join(root,'workspace.json'));
    if(bytes.length>2048) throw new Error('Invalid workspace metadata');
    const meta=Metadata.parse(JSON.parse(bytes.toString()));
    const key=await deriveMasterKey(passphrase,Buffer.from(meta.salt,'hex'),meta.kdf);
    let db:Database.Database|undefined;
    try {
      db=Vault.connect(join(root,'workspace.db'),key,true);
      Vault.migrate(db);db.prepare('SELECT count(*) FROM profiles').get();
    } catch {db?.close();key.fill(0);throw new Error('Unable to unlock workspace. Check the passphrase and workspace files.');}
    let vault:Vault|undefined;
    try {vault=new Vault(db,key,root);await vault.recover();return vault;}
    catch(error) {if(vault)vault.close();else {db.close();key.fill(0);}throw new Error(`Browser-state recovery could not finish. Preserve profile folders and retry unlock: ${error instanceof Error?error.message:'unknown recovery error'}`);}
  }
  close() {if(this.locked)return;this.states.close();this.db.close();this.key.fill(0);this.locked=true;}
  private guard() {
    if(this.locked)throw new Error('Workspace is locked');
    if(this.recoveryBlocked||this.db.prepare('SELECT 1 FROM restore_jobs UNION ALL SELECT 1 FROM discard_jobs LIMIT 1').get())throw new Error('Browser-state recovery is pending. Lock and reopen the workspace to retry.');
  }
  private get(id:string):Profile {
    this.guard(); Id.parse(id);
    const row=this.db.prepare("SELECT * FROM profiles WHERE id=? AND status='ready'").get(id) as {id:string;config:string;createdAt:number;updatedAt:number;parentProfileId:string|null;branchName:string|null;revision:number}|undefined;
    if(!row) throw new Error('Profile not found');
    return {...ProfileInput.parse(JSON.parse(row.config)),id:row.id,createdAt:row.createdAt,updatedAt:row.updatedAt,parentProfileId:row.parentProfileId,branchName:row.branchName,revision:row.revision};
  }
  profiles():Profile[] {
    this.guard();
    return (this.db.prepare("SELECT id FROM profiles WHERE status='ready' ORDER BY createdAt,id").all() as {id:string}[]).map(row=>this.get(row.id));
  }
  createProfile(input:ProfileInputType):Profile {
    this.guard(); const config=ProfileInput.parse(input); const id=randomUUID(); const now=Date.now();
    if((this.db.prepare('SELECT COUNT(*) AS count FROM profiles').get() as {count:number}).count>=99)throw new Error('Maximum 99 profiles');
    this.states.ensureSync(id);
    try {this.db.transaction(()=>{
      this.db.prepare('INSERT INTO profiles(id,config,createdAt,updatedAt) VALUES(?,?,?,?)').run(id,JSON.stringify(config),now,now);
      this.capture(id,'baseline');
    })();}catch(error){try{this.states.removeEmptyProfileSync(id);}catch{}throw error;}
    return this.get(id);
  }
  updateProfile(id:string,input:z.input<typeof ProfilePatch>):Profile {
    this.states.assertIdle(id);const current=this.get(id); const patch=ProfilePatch.parse(input);
    const previous=profileConfiguration(current);
    const config=ProfileInput.parse({...previous,...patch});
    this.db.transaction(()=>{
      this.capture(id,'pre_edit');
      this.db.prepare('UPDATE profiles SET config=?,updatedAt=?,revision=revision+1 WHERE id=?').run(JSON.stringify(config),Date.now(),id);
      this.prune(id);
    })(); return this.get(id);
  }
  private capture(profileId:string,trigger:Snapshot['trigger']) {
    const profile=this.get(profileId);const config=profileConfiguration(profile);
    const id=randomUUID(); const envelope=sealSnapshot(config,this.key,profileId,id);
    this.db.prepare('INSERT INTO snapshots(id,profileId,timestamp,trigger,envelope) VALUES(?,?,?,?,?)').run(id,profileId,Date.now(),trigger,envelope);
  }
  private prune(id:string) {
    this.db.prepare('DELETE FROM snapshots WHERE profileId=? AND pinned=0 AND seq NOT IN (SELECT seq FROM snapshots WHERE profileId=? AND pinned=0 ORDER BY seq DESC LIMIT 20)').run(id,id);
  }
  snapshots(id:string):Snapshot[] {
    this.get(id);
    return (this.db.prepare('SELECT id,profileId,timestamp,trigger,pinned,length(envelope)+COALESCE(length(stateEnvelope),0) AS size,(stateEnvelope IS NOT NULL) AS hasBrowserState,fileCount,stateBytes,browserVersion FROM snapshots WHERE profileId=? ORDER BY seq DESC').all(id) as (Omit<Snapshot,'pinned'>&{pinned:number})[]).map(row=>({...row,pinned:!!row.pinned,hasBrowserState:!!row.hasBrowserState}));
  }
  restore(profileId:string,snapshotId:string,expectedRevision?:number):Profile {
    this.states.assertIdle(profileId);this.checkedProfile(profileId,expectedRevision); Id.parse(snapshotId);
    const row=this.db.prepare('SELECT envelope,stateEnvelope FROM snapshots WHERE id=? AND profileId=?').get(snapshotId,profileId) as {envelope:Buffer;stateEnvelope:Buffer|null}|undefined;
    if(!row) throw new Error('Snapshot not found for this profile');
    if(row.stateEnvelope)throw new Error('Browser-state snapshots require restoreSnapshot');
    const config=ProfileInput.parse(openSnapshot(row.envelope,this.key,profileId,snapshotId));
    this.db.transaction(()=>{
      this.capture(profileId,'pre_restore');
      this.db.prepare('UPDATE profiles SET config=?,updatedAt=?,revision=revision+1 WHERE id=?').run(JSON.stringify(config),Date.now(),profileId);
      this.prune(profileId);
    })(); return this.get(profileId);
  }
  private insertFullSnapshot(profile:Profile,id:string,trigger:Snapshot['trigger'],state:CapturedState) {
    const config=profileConfiguration(profile);
    this.db.prepare('INSERT INTO snapshots(id,profileId,timestamp,trigger,envelope,stateEnvelope,fileCount,stateBytes) VALUES(?,?,?,?,?,?,?,?)').run(id,profile.id,Date.now(),trigger,sealSnapshot(config,this.key,profile.id,id),state.envelope,state.fileCount,state.stateBytes);
  }
  async saveStateSnapshot(profileId:string):Promise<Snapshot> {
    const profile=this.get(profileId);
    return this.states.withLease(profileId,async()=>{
      const id=randomUUID(),state=await this.states.capture(profileId,id,this.key);this.guard();
      this.db.transaction(()=>{this.insertFullSnapshot(profile,id,'manual',state);this.prune(profileId);})();
      return this.snapshots(profileId).find(snapshot=>snapshot.id===id)!;
    });
  }
  async restoreSnapshot(profileId:string,snapshotId:string,expectedRevision?:number):Promise<Profile> {
    const profile=this.checkedProfile(profileId,expectedRevision);Id.parse(snapshotId);
    const row=this.db.prepare('SELECT envelope,stateEnvelope FROM snapshots WHERE id=? AND profileId=?').get(snapshotId,profileId) as {envelope:Buffer;stateEnvelope:Buffer|null}|undefined;
    if(!row)throw new Error('Snapshot not found for this profile');
    if(!row.stateEnvelope)return this.restore(profileId,snapshotId,expectedRevision);
    const config=ProfileInput.parse(openSnapshot(row.envelope,this.key,profileId,snapshotId));
    return this.states.withLease(profileId,async()=>{
      const operationId=randomUUID();let committed=false;
      try {
        await this.states.stage(profileId,operationId,snapshotId,row.stateEnvelope!,this.key);
        const rollbackId=randomUUID(),rollback=await this.states.capture(profileId,rollbackId,this.key);this.guard();
        this.db.transaction(()=>{
          this.insertFullSnapshot(profile,rollbackId,'pre_restore',rollback);
          this.db.prepare('UPDATE profiles SET config=?,updatedAt=?,revision=revision+1 WHERE id=?').run(JSON.stringify(config),Date.now(),profileId);
          this.db.prepare('INSERT INTO restore_jobs(profileId,operationId) VALUES(?,?)').run(profileId,operationId);this.prune(profileId);
        })();committed=true;
        await this.states.finishRestore(profileId,operationId);
        this.db.prepare('DELETE FROM restore_jobs WHERE profileId=?').run(profileId);
        await this.states.cleanupRestore(profileId,operationId);
        return this.get(profileId);
      }catch(error) {
        if(!committed){await this.states.discardStage(profileId,operationId);throw error;}
        this.recoveryBlocked=true;
        throw new Error(`Browser-state recovery is pending. Lock and reopen the workspace to retry: ${error instanceof Error?error.message:'restore interrupted'}`);
      }
    });
  }
  private checkedProfile(id:string,revision?:number):Profile {
    const profile=this.get(id);if(revision!==undefined){Revision.parse(revision);if(profile.revision!==revision)throw new Error('Profile changed since this preview. Review it again before continuing.');}return profile;
  }
  previewSnapshot(profileId:string,snapshotId:string):SnapshotPreview {
    const profile=this.get(profileId);Id.parse(snapshotId);
    const row=this.db.prepare('SELECT envelope FROM snapshots WHERE id=? AND profileId=?').get(snapshotId,profileId) as {envelope:Buffer}|undefined;
    if(!row)throw new Error('Snapshot not found for this profile');
    const config=ProfileInput.parse(openSnapshot(row.envelope,this.key,profileId,snapshotId));
    return {snapshot:this.snapshots(profileId).find(snapshot=>snapshot.id===snapshotId)!,currentRevision:profile.revision,changes:configurationDiff(profileConfiguration(profile),config)};
  }
  createBranch(parentId:string,name:string):Promise<Profile>{return this.branches.createBranch(parentId,name);}
  previewMerge(id:string):MergePreview{return this.branches.previewMerge(id);}
  mergeBranch(id:string,branchRevision:number,parentRevision:number):Profile{return this.branches.mergeBranch(id,branchRevision,parentRevision);}
  promoteBranch(id:string,expectedRevision:number):Profile{return this.branches.promoteBranch(id,expectedRevision);}
  discardBranch(id:string,expectedRevision:number):Promise<void>{return this.branches.discardBranch(id,expectedRevision);}
  pin(profileId:string,snapshotId:string,pinned:boolean) {
    this.states.assertIdle(profileId);this.get(profileId); Id.parse(snapshotId); z.boolean().parse(pinned);
    this.db.transaction(()=>{
      const result=this.db.prepare('UPDATE snapshots SET pinned=? WHERE id=? AND profileId=?').run(pinned?1:0,snapshotId,profileId);
      if(!result.changes) throw new Error('Snapshot not found');
      this.prune(profileId);
    })();
  }
}
