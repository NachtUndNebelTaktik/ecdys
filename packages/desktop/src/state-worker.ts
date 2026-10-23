import {parentPort,workerData} from 'node:worker_threads';
import {lstat,readdir,open,mkdir,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {BROWSER_LOCKS,MAX_STATE_BYTES,MAX_STATE_ENTRIES,RESTORE_MARKER,openStateManifest,safeArchivePath,sealStateManifest,type StateManifest} from './state-archive.ts';

type Entry={path:string;directory:boolean;signature:string;size:number};
async function syncDirectory(path:string) {
  let handle;
  try {handle=await open(path,'r');await handle.sync();}
  catch(error){if(process.platform!=='win32'||!['EINVAL','EPERM','EISDIR'].includes((error as NodeJS.ErrnoException).code??''))throw error;}
  finally {await handle?.close();}
}
async function assertClosed(dir:string) {
  const root=await lstat(dir);if(!root.isDirectory()||root.isSymbolicLink())throw new Error('Browser data must be a regular directory');
  const names=await readdir(dir);
  if(names.some(name=>BROWSER_LOCKS.has(name.toLowerCase())))throw new Error('Close the browser before saving or restoring state (browser lock present)');
  if(names.includes(RESTORE_MARKER))throw new Error('Browser-state restore is pending recovery');
}
async function inventory(dir:string):Promise<Entry[]> {
  await assertClosed(dir);const entries:Entry[]=[];const normalizedPaths=new Set<string>();let total=0;
  async function visit(relative:string) {
    for(const name of (await readdir(relative?join(dir,relative):dir)).sort()) {
      const path=safeArchivePath(relative?`${relative}/${name}`:name);
      const normalized=path.normalize('NFC').toLowerCase();
      if(normalizedPaths.has(normalized))throw new Error('Duplicate browser-state path');
      normalizedPaths.add(normalized);const info=await lstat(join(dir,path));
      if(info.isSymbolicLink()||(!info.isDirectory()&&!info.isFile())||(!info.isDirectory()&&info.nlink!==1))throw new Error('Browser-state links and special files are not supported');
      if(entries.length>=MAX_STATE_ENTRIES)throw new Error('Browser state exceeds 4096 entries');
      const signature=JSON.stringify([info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs,info.nlink]);
      entries.push({path,directory:info.isDirectory(),signature,size:info.isFile()?info.size:0});
      if(info.isDirectory())await visit(path);else {total+=info.size;if(total>MAX_STATE_BYTES)throw new Error('Browser state exceeds 64 MiB');}
    }
  }
  await visit('');return entries;
}
async function capture(dir:string,key:Buffer,profileId:string,snapshotId:string) {
  const before=await inventory(dir);const manifest:StateManifest={version:1,directories:[],files:[]};let stateBytes=0;
  for(const entry of before) {
    if(entry.directory){manifest.directories.push(entry.path);continue;}
    const handle=await open(join(dir,entry.path),constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try {
      const info=await handle.stat();
      if(!info.isFile()||info.nlink!==1||JSON.stringify([info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs,info.nlink])!==entry.signature)throw new Error('Browser directory changed during capture; close the browser and retry');
      const bytes=Buffer.alloc(entry.size);let offset=0;
      while(offset<bytes.length){const result=await handle.read(bytes,offset,bytes.length-offset,offset);if(!result.bytesRead)throw new Error('Browser directory changed during capture');offset+=result.bytesRead;}
      const extra=Buffer.alloc(1);if((await handle.read(extra,0,1,bytes.length)).bytesRead)throw new Error('Browser directory changed during capture');
      stateBytes+=bytes.length;manifest.files.push({path:entry.path,data:bytes.toString('base64')});bytes.fill(0);
    }finally{await handle.close();}
  }
  if(JSON.stringify(before)!==JSON.stringify(await inventory(dir)))throw new Error('Browser directory changed during capture; close the browser and retry');
  return {envelope:sealStateManifest(manifest,key,profileId,snapshotId),fileCount:manifest.files.length,stateBytes};
}
async function stage(dir:string,target:string,operationId:string,envelope:Buffer,key:Buffer,profileId:string,snapshotId:string) {
  await assertClosed(dir);
  // Authentication, decompression limits and every path are checked before any
  // staging directory or file is created.
  const manifest=openStateManifest(envelope,key,profileId,snapshotId);
  await mkdir(target,{mode:0o700});
  for(const path of manifest.directories.sort((a,b)=>a.split('/').length-b.split('/').length))await mkdir(join(target,path),{mode:0o700});
  for(const file of manifest.files) {
    const handle=await open(join(target,file.path),'wx',0o600);
    try {await handle.writeFile(file.bytes);await handle.sync();}finally{file.bytes.fill(0);await handle.close();}
  }
  await writeFile(join(target,RESTORE_MARKER),operationId,{flag:'wx',mode:0o600});
  const marker=await open(join(target,RESTORE_MARKER),'r');try{await marker.sync();}finally{await marker.close();}
  for(const path of [...manifest.directories].sort((a,b)=>b.split('/').length-a.split('/').length))await syncDirectory(join(target,path));
  await syncDirectory(target);await syncDirectory(join(target,'..'));
  return null;
}
const key=Buffer.from(workerData.key);
try {
  let value:unknown;
  if(workerData.action==='capture')value=await capture(workerData.dir,key,workerData.profileId,workerData.snapshotId);
  else if(workerData.action==='stage')value=await stage(workerData.dir,workerData.target,workerData.operationId,Buffer.from(workerData.envelope),key,workerData.profileId,workerData.snapshotId);
  else if(workerData.action==='rebind') {
    const decoded=openStateManifest(Buffer.from(workerData.envelope),key,workerData.sourceProfileId,workerData.sourceSnapshotId);
    try {
      const manifest:StateManifest={version:1,directories:decoded.directories,files:decoded.files.map(file=>({path:file.path,data:file.bytes.toString('base64')}))};
      value={envelope:sealStateManifest(manifest,key,workerData.profileId,workerData.snapshotId),fileCount:decoded.files.length,stateBytes:decoded.stateBytes};
    }finally{for(const file of decoded.files)file.bytes.fill(0);}
  }else throw new Error('Unsupported browser-state operation');
  parentPort!.postMessage({ok:true,value});
}catch(error){parentPort!.postMessage({ok:false,error:error instanceof Error?error.message:'Browser-state operation failed'});}
finally{key.fill(0);workerData.key.fill(0);parentPort!.close();}
