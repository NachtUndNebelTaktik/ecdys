import {afterEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,symlink,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Vault} from '../packages/desktop/src/vault';
import {BrowserSessions} from '../packages/desktop/src/browser/sessions';
import {ChromiumProcess,BrowserStartupCleanupError} from '../packages/desktop/src/browser/chromium';
const roots:string[]=[],vaults:Vault[]=[],managers:BrowserSessions[]=[];
async function fixture(mode='normal'){
  const root=await mkdtemp(join(tmpdir(),'styg-session-'));roots.push(root);const v=await Vault.create(join(root,'vault'),'session test passphrase',{memoryMiB:64,iterations:2});vaults.push(v);
  const p=v.createProfile({name:'Session test'}),directory=join(root,'vault','profiles',p.id,'browser');await writeFile(join(directory,'fixture-mode'),mode);
  const handles:ChromiumProcess[]=[];
  // Explicit test-only supervisor; product construction uses the blocked default.
  const sessions=new BrowserSessions(v,{assertReady(){},async launch(dir:string){const handle=await ChromiumProcess.start({executable:resolve('tests/fixtures/fake-chromium.mjs'),directory:dir,startupTimeoutMs:1000,closeTimeoutMs:50});handles.push(handle);return handle;}});managers.push(sessions);
  return {root,v,p,directory,sessions,handles};
}
afterEach(async()=>{for(const manager of managers.splice(0))await manager.shutdown();for(const v of vaults.splice(0))v.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
it('rejects product-default launch before snapshots or process creation',async()=>{
  const {v,p,directory}=await fixture();const sessions=new BrowserSessions(v);managers.push(sessions);const before=v.snapshots(p.id);
  await expect(sessions.launch(p.id)).rejects.toThrow(/OS-enforced/);expect(v.snapshots(p.id)).toEqual(before);expect(sessions.list()).toEqual([]);await expect(access(join(directory,'fixture.pid'))).rejects.toThrow();
});
it('holds profile ownership until clean shutdown and closed-state snapshot completion',async()=>{
  const {v,p,sessions}=await fixture();const active=await sessions.launch(p.id);expect(active).toMatchObject({profileId:p.id,status:'active',browserVersion:'Chrome/154.0.0.0'});
  expect(v.snapshots(p.id)[0]).toMatchObject({trigger:'pre_launch',hasBrowserState:true});
  expect(()=>v.updateProfile(p.id,{name:'unsafe edit'})).toThrow(/busy/i);await expect(v.saveStateSnapshot(p.id)).rejects.toThrow(/busy/i);await expect(v.createBranch(p.id,'unsafe fork')).rejects.toThrow(/busy/i);
  await expect(v.restoreSnapshot(p.id,v.snapshots(p.id).at(-1)!.id)).rejects.toThrow(/busy/i);expect(()=>v.close()).toThrow(/session|browser/i);
  const closing=sessions.close(p.id);expect(()=>v.updateProfile(p.id,{name:'still busy'})).toThrow(/busy/i);
  expect(await closing).toMatchObject({status:'stopped'});expect(v.snapshots(p.id)[0]).toMatchObject({trigger:'auto_close',hasBrowserState:true,browserVersion:'Chrome/154.0.0.0'});
  expect(v.updateProfile(p.id,{name:'closed edit'}).name).toBe('closed edit');
});
it('refuses duplicate launch while the first launch is still preparing',async()=>{
  const {p,sessions}=await fixture();const first=sessions.launch(p.id);await expect(sessions.launch(p.id)).rejects.toThrow(/already|busy/i);await first;expect(sessions.list()).toHaveLength(1);
});
it('drains a launch racing with shutdown and permanently rejects new launches',async()=>{
  const {v,p,sessions}=await fixture();const launch=sessions.launch(p.id);const result=launch.catch(error=>error);await sessions.shutdown();expect(await result).toBeInstanceOf(Error);
  expect(sessions.list().every(session=>!['active','launching','closing'].includes(session.status))).toBe(true);v.updateProfile(p.id,{name:'released'});await expect(sessions.launch(p.id)).rejects.toThrow(/shut|closing/i);
});
it('preserves files and reports snapshot failure after the browser has stopped',async()=>{
  const {v,p,sessions,directory}=await fixture();await sessions.launch(p.id);await symlink('/tmp',join(directory,'unsafe-link'));
  expect(await sessions.close(p.id)).toMatchObject({status:'failed'});expect(v.snapshots(p.id).some(s=>s.trigger==='auto_close')).toBe(false);expect(await readFile(join(directory,'fixture-mode'),'utf8')).toBe('normal');v.updateProfile(p.id,{name:'released'});
});
it('does not create a successful close snapshot after forced termination',async()=>{
  const {v,p,sessions}=await fixture('ignore-close');await sessions.launch(p.id);expect(await sessions.close(p.id)).toMatchObject({status:'crashed'});expect(v.snapshots(p.id).some(s=>s.trigger==='auto_close')).toBe(false);v.updateProfile(p.id,{name:'released'});
});
it('records an unexpected crash and preserves the pre-launch recovery point',async()=>{
  const {v,p,sessions,handles}=await fixture();await sessions.launch(p.id);await handles[0].command('Fixture.crash');await handles[0].exited;
  const stopped=await sessions.close(p.id);expect(stopped).toMatchObject({status:'crashed',exitCode:23});expect(v.snapshots(p.id)[0].trigger).toBe('pre_launch');v.updateProfile(p.id,{name:'released'});
});

it('retains browser ownership if failed-start cleanup cannot be verified',async()=>{
  const {v,p}=await fixture();let allowCleanup=false;let owned:ChromiumProcess|undefined;
  const sessions=new BrowserSessions(v,{assertReady(){},async launch(directory){
    const handle=await ChromiumProcess.start({executable:resolve('tests/fixtures/fake-chromium.mjs'),directory,closeTimeoutMs:100});
    owned=handle;const close=handle.close.bind(handle);handle.close=()=>allowCleanup?close():Promise.reject(new Error('cleanup unverified'));
    throw new BrowserStartupCleanupError(handle,new Error('startup did not finish'));
  }});managers.push(sessions);
  try {
    await expect(sessions.launch(p.id)).rejects.toThrow();expect(()=>v.updateProfile(p.id,{name:'unsafe release'})).toThrow(/busy/i);expect(()=>v.close()).toThrow(/session|browser/i);
    allowCleanup=true;expect(await sessions.close(p.id)).toMatchObject({status:'failed'});expect(v.snapshots(p.id).some(s=>s.trigger==='auto_close')).toBe(false);v.updateProfile(p.id,{name:'released'});
  }finally{allowCleanup=true;await owned?.close();}
});
it('releases a verified session after retrying actual runtime lock cleanup',async()=>{
  const {v,p,directory,sessions}=await fixture('owned-locks');await sessions.launch(p.id);
  await rm(join(directory,'SingletonCookie'));await symlink('foreign-cookie',join(directory,'SingletonCookie'));
  await expect(sessions.close(p.id)).rejects.toThrow(/lock|identity/i);expect(()=>v.close()).toThrow(/session|browser/i);
  await rm(join(directory,'SingletonCookie'));const result=await sessions.close(p.id);expect(result.status).toBe('stopped');expect(result.error).toBeUndefined();v.updateProfile(p.id,{name:'released'});
});
it('closes a browser whose launch completes after shutdown was requested',async()=>{
  const {v,p}=await fixture();let reached!:(value:ChromiumProcess)=>void,release!:()=>void;
  const spawned=new Promise<ChromiumProcess>(resolve=>{reached=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const sessions=new BrowserSessions(v,{assertReady(){},async launch(directory){
    const handle=await ChromiumProcess.start({executable:resolve('tests/fixtures/fake-chromium.mjs'),directory,closeTimeoutMs:100});reached(handle);await gate;return handle;
  }});managers.push(sessions);
  const launch=sessions.launch(p.id),result=launch.catch(error=>error);const handle=await spawned;
  const shutdown=sessions.shutdown();release();await shutdown;
  expect(await result).toBeInstanceOf(Error);expect(await handle.exited).toMatchObject({code:0,forced:false});expect(sessions.list()[0].status).toBe('stopped');v.updateProfile(p.id,{name:'released'});
});
