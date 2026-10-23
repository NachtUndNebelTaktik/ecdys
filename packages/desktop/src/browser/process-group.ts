import {readdir,readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
export async function liveGroupMembers(groupId:number):Promise<number[]> {
  if(!Number.isSafeInteger(groupId)||groupId<=1)throw new Error('Invalid owned process group');
  const members:number[]=[];
  for(const name of await readdir('/proc')) {
    if(!/^\d+$/.test(name))continue;
    try {
      const stat=await readFile(`/proc/${name}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
      if(Number(fields[2])===groupId&&!['Z','X'].includes(fields[0]))members.push(Number(name));
    }catch(error){if(!['ENOENT','ESRCH'].includes((error as NodeJS.ErrnoException).code??''))throw error;}
  }
  return members;
}
export function signalGroup(groupId:number,signal:NodeJS.Signals) {
  if(!Number.isSafeInteger(groupId)||groupId<=1)throw new Error('Invalid owned process group');
  try{process.kill(-groupId,signal);}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
}
async function waitEmpty(groupId:number,timeoutMs:number) {
  const deadline=Date.now()+timeoutMs;
  do{if(!(await liveGroupMembers(groupId)).length)return true;await delay(25);}while(Date.now()<deadline);
  return !(await liveGroupMembers(groupId)).length;
}
export async function stopResidualGroup(groupId:number):Promise<boolean> {
  if(await waitEmpty(groupId,150))return false;
  signalGroup(groupId,'SIGTERM');if(await waitEmpty(groupId,250))return true;
  signalGroup(groupId,'SIGKILL');if(await waitEmpty(groupId,1000))return true;
  throw new Error('Owned browser processes did not stop; preserve profile files');
}
