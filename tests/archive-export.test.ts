import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {writePageArchive} from '../packages/desktop/src/browser/archive-export';
const roots:string[]=[];
async function fixture(){const root=await mkdtemp(join(tmpdir(),'ecdys-export-'));roots.push(root);return {root,path:join(root,'capture.mhtml')};}
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
it('saves the chosen page bytes with private file permissions',async()=>{
  const {path}=await fixture();const bytes=Buffer.from('MIME-Version: 1.0\r\nContent-Type: multipart/related\r\n');
  await writePageArchive(path,bytes,()=>{});
  expect(await readFile(path)).toEqual(bytes);
  if(process.platform!=='win32')expect((await stat(path)).mode&0o777).toBe(0o600);
});
it('preserves an existing file and hides local paths from errors',async()=>{
  const {path}=await fixture();await writeFile(path,'existing');
  const error=await writePageArchive(path,Buffer.from('new'),()=>{}).catch(error=>error);
  expect(error.message).toMatch(/already exists/i);expect(error.message).not.toContain(path);
  expect(await readFile(path,'utf8')).toBe('existing');
});
it('leaves no export when the owning session changes before or during saving',async()=>{
  const {root,path}=await fixture();
  await expect(writePageArchive(path,Buffer.from('page'),()=>{throw new Error('Session changed');})).rejects.toThrow(/session changed/i);
  expect(await readdir(root)).toEqual([]);
  let checks=0;
  await expect(writePageArchive(path,Buffer.from('page'),()=>{if(++checks===2)throw new Error('Session changed');})).rejects.toThrow(/session changed/i);
  expect(await readdir(root)).toEqual([]);
});
