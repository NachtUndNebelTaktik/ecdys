import {lstat,readlink,unlink,open} from 'node:fs/promises';
import type {BigIntStats} from 'node:fs';
import {join} from 'node:path';
import {hostname} from 'node:os';
const NAMES=['SingletonLock','SingletonCookie','SingletonSocket'];
async function entry(path:string):Promise<{stat:BigIntStats;target:string}|undefined> {
  try{const stat=await lstat(path,{bigint:true});if(!stat.isSymbolicLink())return undefined;return {stat,target:await readlink(path)};}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
}
export async function observeOwnedLocks(directory:string,pid:number):Promise<()=>Promise<void>> {
  const root=await lstat(directory,{bigint:true});
  if(!root.isDirectory()||root.isSymbolicLink())throw new Error('Invalid managed profile directory');
  const observed=new Map<string,{stat:BigIntStats;target:string}>();
  for(const name of NAMES){const value=await entry(join(directory,name));if(value)observed.set(name,value);}
  if(observed.get('SingletonLock')?.target!==`${hostname()}-${pid}`)return async()=>{};
  return async()=>{
    const currentRoot=await lstat(directory,{bigint:true});
    if(!currentRoot.isDirectory()||currentRoot.isSymbolicLink()||currentRoot.ino!==root.ino||currentRoot.dev!==root.dev)throw new Error('Browser directory identity changed; preserve files');
    const removals:string[]=[];
    for(const [name,original] of observed) {
      const path=join(directory,name);let current;
      try{current=await lstat(path,{bigint:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
      if(!current.isSymbolicLink()||current.ino!==original.stat.ino||current.dev!==original.stat.dev||current.ctimeNs!==original.stat.ctimeNs||await readlink(path)!==original.target)throw new Error('Browser lock identity changed; preserve files');
      removals.push(path);
    }
    for(const path of removals)await unlink(path);
    if(removals.length){const handle=await open(directory,'r');try{await handle.sync();}finally{await handle.close();}}
  };
}
