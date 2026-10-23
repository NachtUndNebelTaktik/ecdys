import {expect,it} from 'vitest';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Vault} from '../packages/desktop/src/vault';
import {BrowserSessions} from '../packages/desktop/src/browser/sessions';
import {ChromiumProcess} from '../packages/desktop/src/browser/chromium';

async function page(browser:ChromiumProcess,url:string) {
  const {targetId}=await browser.command<{targetId:string}>('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await browser.command<{sessionId:string}>('Target.attachToTarget',{targetId,flatten:true});
  await browser.command('Page.navigate',{url},sessionId);
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){const state=await browser.command<{result:{value?:boolean}}>('Runtime.evaluate',{expression:'window.fixtureReady===true',returnByValue:true},sessionId);if(state.result.value)return sessionId;await new Promise(resolve=>setTimeout(resolve,30));}
  throw new Error('Local browser fixture did not finish');
}
async function measured(browser:ChromiumProcess,sessionId:string) {
  const expression=`(async()=>{const cookie=await (await fetch('/cookie')).text();const indexed=await new Promise((resolve,reject)=>{const request=indexedDB.open('StygFixture',1);request.onsuccess=()=>{const db=request.result;const read=db.transaction('markers').objectStore('markers').get('marker');read.onsuccess=()=>{resolve(read.result);db.close()};read.onerror=()=>reject(read.error)};request.onerror=()=>reject(request.error)});return {cookie,local:localStorage.getItem('marker'),indexed}})()`;
  const value=await browser.command<{result:{value:unknown};exceptionDetails?:unknown}>('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
  expect(value.exceptionDetails).toBeUndefined();return value.result.value;
}
it('restores real persistent cookies, localStorage and IndexedDB after compatible Chromium relaunch',async()=>{
  const root=await mkdtemp(join(tmpdir(),'styg-browser-recovery-'));let vault:Vault|undefined,manager:BrowserSessions|undefined;
  const server=createServer((request,response)=>{
    const url=new URL(request.url??'/','http://localhost');
    if(url.pathname==='/cookie'){response.end(request.headers.cookie??'');return;}
    const marker=url.searchParams.get('write');if(marker)response.setHeader('Set-Cookie',`styg=${marker}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax`);
    response.setHeader('Content-Type','text/html');response.end(`<script>(async()=>{const marker=new URL(location.href).searchParams.get('write');const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('StygFixture',1);r.onupgradeneeded=()=>r.result.createObjectStore('markers');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(marker){localStorage.setItem('marker',marker);await new Promise((resolve,reject)=>{const t=db.transaction('markers','readwrite');t.objectStore('markers').put(marker,'marker');t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}db.close();window.fixtureReady=true})()</script>`);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {
    const executable=process.env.STYG_TEST_CHROMIUM??'/usr/bin/chromium';const quote=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";
    // The executor needs this test wrapper; production runtime adds no sandbox bypass.
    const wrapper=join(root,'chromium-test');await writeFile(wrapper,`#!/bin/sh\nexec ${quote(executable)} --headless=new --no-sandbox --disable-gpu --password-store=basic --disable-breakpad --disable-crash-reporter --disable-dev-shm-usage "$@"\n`,{mode:0o700});
    vault=await Vault.create(join(root,'vault'),'real browser recovery test passphrase',{memoryMiB:64,iterations:2});const profile=vault.createProfile({name:'Local recovery fixture'});const handles:ChromiumProcess[]=[];
    manager=new BrowserSessions(vault,{assertReady(){},async launch(directory){const browser=await ChromiumProcess.start({executable:wrapper,directory,closeTimeoutMs:3000});handles.push(browser);return browser;}});
    await manager.launch(profile.id);const first=handles.at(-1)!;expect(await measured(first,await page(first,`${origin}/?write=first`))).toEqual({cookie:'styg=first',local:'first',indexed:'first'});
    const firstClose=await manager.close(profile.id);expect(firstClose,firstClose.error).toMatchObject({status:'stopped'});const snapshotId=firstClose.snapshotId!;
    expect(vault.snapshots(profile.id).find(s=>s.id===snapshotId)).toMatchObject({hasBrowserState:true,browserVersion:first.version});
    await manager.launch(profile.id);const second=handles.at(-1)!;expect(await measured(second,await page(second,`${origin}/?write=second`))).toEqual({cookie:'styg=second',local:'second',indexed:'second'});
    process.kill(second.pid,'SIGKILL');await second.exited;
    expect(await manager.close(profile.id)).toMatchObject({status:'crashed'});
    await vault.restoreSnapshot(profile.id,snapshotId,vault.profiles()[0].revision);
    await manager.launch(profile.id);const restored=handles.at(-1)!;
    expect(await measured(restored,await page(restored,origin))).toEqual({cookie:'styg=first',local:'first',indexed:'first'});
    expect(await manager.close(profile.id)).toMatchObject({status:'stopped'});
  }finally{await manager?.shutdown();vault?.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
},60000);
