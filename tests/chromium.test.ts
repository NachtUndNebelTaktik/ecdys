import {afterEach,expect,it} from 'vitest';
import {mkdtemp,writeFile,readFile,rm,lstat,unlink,symlink,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {ChromiumProcess} from '../packages/desktop/src/browser/chromium';
import {liveGroupMembers} from '../packages/desktop/src/browser/process-group';
const roots:string[]=[],browsers:ChromiumProcess[]=[];
async function start(mode='normal'){
  const directory=await mkdtemp(join(tmpdir(),'styg-runtime-'));roots.push(directory);await writeFile(join(directory,'fixture-mode'),mode);
  const browser=await ChromiumProcess.start({executable:resolve('tests/fixtures/fake-chromium.mjs'),directory,startupTimeoutMs:500,closeTimeoutMs:100});browsers.push(browser);return {directory,browser};
}
afterEach(async()=>{for(const browser of browsers.splice(0))await browser.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
it('owns a private pipe and closes its process group without a debug port or sandbox bypass',async()=>{
  const {browser}=await start();expect(browser.version).toBe('Chrome/154.0.0.0');
  const {args}=await browser.command<{args:string[]}>('Fixture.args');expect(args).toContain('--remote-debugging-pipe');expect(args.some(arg=>arg.startsWith('--remote-debugging-port'))).toBe(false);expect(args).not.toContain('--no-sandbox');
  const exit=await browser.close();expect(exit).toMatchObject({code:0,forced:false});expect(await liveGroupMembers(browser.pid)).toEqual([]);
});
it.each(['silent','bad-protocol'])('stops failed %s startup before rejecting',async mode=>{
  const directory=await mkdtemp(join(tmpdir(),'styg-runtime-failed-'));roots.push(directory);await writeFile(join(directory,'fixture-mode'),mode);
  await expect(ChromiumProcess.start({executable:resolve('tests/fixtures/fake-chromium.mjs'),directory,startupTimeoutMs:100,closeTimeoutMs:50})).rejects.toThrow(/timed out|frame|JSON/i);
  const pid=Number(await readFile(join(directory,'fixture.pid'),'utf8'));expect(await liveGroupMembers(pid)).toEqual([]);
});
it('reports a missing executable without keeping a child alive',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'styg-runtime-missing-'));roots.push(directory);
  await expect(ChromiumProcess.start({executable:'/styg-no-such-browser',directory})).rejects.toThrow(/ENOENT|spawn|start/i);
});
it('escalates an unresponsive browser to forced termination',async()=>{
  const {browser}=await start('ignore-close');expect(await browser.close()).toMatchObject({forced:true,signal:'SIGKILL'});expect(await liveGroupMembers(browser.pid)).toEqual([]);
});
it('terminates owned descendants even when the leader exits first',async()=>{
  const {browser,directory}=await start('child');const childPid=Number(await readFile(join(directory,'child.pid'),'utf8'));expect(await liveGroupMembers(browser.pid)).toContain(childPid);
  expect(await browser.close()).toMatchObject({forced:true});expect(await liveGroupMembers(browser.pid)).toEqual([]);
});
it('reports unexpected process exit and releases all owned live processes',async()=>{
  const {browser}=await start();await browser.command('Fixture.crash');expect(await browser.exited).toMatchObject({code:23});expect(await liveGroupMembers(browser.pid)).toEqual([]);
});

it('cleans only observed browser locks after the owned group has stopped',async()=>{
  const {browser,directory}=await start('owned-locks');expect((await lstat(join(directory,'SingletonLock'))).isSymbolicLink()).toBe(true);
  await browser.close();for(const name of ['SingletonLock','SingletonCookie','SingletonSocket'])await expect(lstat(join(directory,name))).rejects.toThrow(/ENOENT/);
});
it('preserves a replaced lock instead of unlinking another owner’s marker',async()=>{
  const {browser,directory}=await start('owned-locks');await unlink(join(directory,'SingletonCookie'));await symlink('foreign-cookie',join(directory,'SingletonCookie'));
  try{await expect(browser.close()).rejects.toThrow(/lock|identity|preserve/i);expect(await readlink(join(directory,'SingletonCookie'))).toBe('foreign-cookie');}
  finally{browsers.splice(browsers.indexOf(browser),1);expect(await liveGroupMembers(browser.pid)).toEqual([]);}
});

it.each(['silent-locks','bad-protocol-locks'])('cleans observed owned locks after %s startup fails',async mode=>{
  const directory=await mkdtemp(join(tmpdir(),'styg-startup-locks-'));roots.push(directory);await writeFile(join(directory,'fixture-mode'),mode);
  await expect(ChromiumProcess.start({executable:resolve('tests/fixtures/fake-chromium.mjs'),directory,startupTimeoutMs:100,closeTimeoutMs:100})).rejects.toThrow();
  for(const name of ['SingletonLock','SingletonCookie','SingletonSocket'])await expect(lstat(join(directory,name))).rejects.toThrow(/ENOENT/);
});
it('can reverify lock cleanup after a foreign marker is removed',async()=>{
  const {browser,directory}=await start('owned-locks');const cookie=join(directory,'SingletonCookie');await unlink(cookie);await symlink('foreign-cookie',cookie);
  try {
    await expect(browser.close()).rejects.toThrow(/lock|identity/i);expect(await liveGroupMembers(browser.pid)).toEqual([]);await unlink(cookie);
    expect(await browser.close()).toMatchObject({code:0,forced:false});await expect(lstat(join(directory,'SingletonLock'))).rejects.toThrow(/ENOENT/);
  }finally{browsers.splice(browsers.indexOf(browser),1);expect(await liveGroupMembers(browser.pid)).toEqual([]);}
});
