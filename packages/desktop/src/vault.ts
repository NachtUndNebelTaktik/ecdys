import Database from 'better-sqlite3-multiple-ciphers';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { Id, KdfParams, ProfileInput, ProfilePatch, type KdfParameters, type Profile, type ProfileInputType, type Snapshot } from '../../shared/src/model';
import { deriveMasterKey, openSnapshot, sealSnapshot } from './crypto';

const Metadata=z.object({version:z.literal(1),salt:z.string().regex(/^[a-f0-9]{64}$/),kdf:KdfParams}).strict();
const passphraseSchema=z.string().min(12).max(1024);
const schema=`
CREATE TABLE profiles(id TEXT PRIMARY KEY, config TEXT NOT NULL, createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
CREATE TABLE snapshots(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, profileId TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, timestamp INTEGER NOT NULL, trigger TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, envelope BLOB NOT NULL);
CREATE INDEX snapshots_profile ON snapshots(profileId,seq);
CREATE TRIGGER profile_limit BEFORE INSERT ON profiles WHEN (SELECT COUNT(*) FROM profiles)>=99 BEGIN SELECT RAISE(ABORT,'Maximum 99 profiles'); END;
PRAGMA user_version=1;`;

export class Vault {
  private locked=false;
  private constructor(private db:Database.Database,private key:Buffer) {}
  static async exists(root:string) { try { await access(root); return true; } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return false; throw error; } }
  private static connect(file:string,key:Buffer,existing:boolean) {
    const db=new Database(file,{fileMustExist:existing});
    try {
      db.pragma("cipher='sqlcipher'"); db.pragma('legacy=4');
      db.key(key);
      db.pragma('foreign_keys=ON'); db.pragma('secure_delete=ON');
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
      return new Vault(db,key);
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
      if(db.pragma('user_version',{simple:true})!==1) throw new Error('Unsupported workspace version');
      db.prepare('SELECT count(*) FROM profiles').get(); return new Vault(db,key);
    } catch { db?.close(); key.fill(0); throw new Error('Unable to unlock workspace. Check the passphrase and workspace files.'); }
  }
  close() { if(this.locked) return; this.db.close(); this.key.fill(0); this.locked=true; }
  private guard() { if(this.locked) throw new Error('Workspace is locked'); }
  private get(id:string):Profile {
    this.guard(); Id.parse(id);
    const row=this.db.prepare('SELECT * FROM profiles WHERE id=?').get(id) as {id:string;config:string;createdAt:number;updatedAt:number}|undefined;
    if(!row) throw new Error('Profile not found');
    return {...ProfileInput.parse(JSON.parse(row.config)),id:row.id,createdAt:row.createdAt,updatedAt:row.updatedAt};
  }
  profiles():Profile[] {
    this.guard();
    return (this.db.prepare('SELECT id FROM profiles ORDER BY createdAt,id').all() as {id:string}[]).map(row=>this.get(row.id));
  }
  createProfile(input:ProfileInputType):Profile {
    this.guard(); const config=ProfileInput.parse(input); const id=randomUUID(); const now=Date.now();
    this.db.transaction(()=>{
      this.db.prepare('INSERT INTO profiles VALUES(?,?,?,?)').run(id,JSON.stringify(config),now,now);
      this.capture(id,'baseline');
    })(); return this.get(id);
  }
  updateProfile(id:string,input:z.input<typeof ProfilePatch>):Profile {
    const current=this.get(id); const patch=ProfilePatch.parse(input);
    const {id:_,createdAt:__,updatedAt:___,...previous}=current;
    const config=ProfileInput.parse({...previous,...patch});
    this.db.transaction(()=>{
      this.capture(id,'pre_edit');
      this.db.prepare('UPDATE profiles SET config=?,updatedAt=? WHERE id=?').run(JSON.stringify(config),Date.now(),id);
      this.prune(id);
    })(); return this.get(id);
  }
  private capture(profileId:string,trigger:Snapshot['trigger']) {
    const profile=this.get(profileId); const {id:_,createdAt:__,updatedAt:___,...config}=profile;
    const id=randomUUID(); const envelope=sealSnapshot(config,this.key,profileId,id);
    this.db.prepare('INSERT INTO snapshots(id,profileId,timestamp,trigger,envelope) VALUES(?,?,?,?,?)').run(id,profileId,Date.now(),trigger,envelope);
  }
  private prune(id:string) {
    this.db.prepare('DELETE FROM snapshots WHERE profileId=? AND pinned=0 AND seq NOT IN (SELECT seq FROM snapshots WHERE profileId=? AND pinned=0 ORDER BY seq DESC LIMIT 20)').run(id,id);
  }
  snapshots(id:string):Snapshot[] {
    this.get(id);
    return (this.db.prepare('SELECT id,profileId,timestamp,trigger,pinned,length(envelope) AS size FROM snapshots WHERE profileId=? ORDER BY seq DESC').all(id) as (Omit<Snapshot,'pinned'>&{pinned:number})[]).map(row=>({...row,pinned:!!row.pinned}));
  }
  restore(profileId:string,snapshotId:string):Profile {
    this.get(profileId); Id.parse(snapshotId);
    const row=this.db.prepare('SELECT envelope FROM snapshots WHERE id=? AND profileId=?').get(snapshotId,profileId) as {envelope:Buffer}|undefined;
    if(!row) throw new Error('Snapshot not found for this profile');
    const config=ProfileInput.parse(openSnapshot(row.envelope,this.key,profileId,snapshotId));
    this.db.transaction(()=>{
      this.capture(profileId,'pre_restore');
      this.db.prepare('UPDATE profiles SET config=?,updatedAt=? WHERE id=?').run(JSON.stringify(config),Date.now(),profileId);
      this.prune(profileId);
    })(); return this.get(profileId);
  }
  pin(profileId:string,snapshotId:string,pinned:boolean) {
    this.get(profileId); Id.parse(snapshotId); z.boolean().parse(pinned);
    this.db.transaction(()=>{
      const result=this.db.prepare('UPDATE snapshots SET pinned=? WHERE id=? AND profileId=?').run(pinned?1:0,snapshotId,profileId);
      if(!result.changes) throw new Error('Snapshot not found');
      this.prune(profileId);
    })();
  }
}
