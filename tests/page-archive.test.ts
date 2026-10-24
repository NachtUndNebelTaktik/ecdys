import {afterEach,expect,it} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {ChromiumProcess,type BrowserHandle} from '../packages/desktop/src/browser/chromium';
import {BrowserSessions} from '../packages/desktop/src/browser/sessions';
import {Vault} from '../packages/desktop/src/vault';
import type {ArchiveTarget,CapturedPage} from '../packages/desktop/src/browser/page-archive';

const MHTML='From: <Saved by Blink>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n boundary="archive-boundary"\r\n\r\n--archive-boundary\r\nContent-Type: text/html\r\nContent-Location: https://example.test/\r\n\r\n<html><body>Private saved document</body></html>\r\n--archive-boundary--\r\n';
const target={targetId:'page-1',type:'page',title:'Private\u0000 page',url:'https://name:password@example.test/path?token=secret#fragment',attached:false,canAccessOpener:false};
const roots:string[]=[],browsers:ChromiumProcess[]=[],vaults:Vault[]=[],managers:BrowserSessions[]=[];
type ArchiveBrowser=ChromiumProcess & {listPages():Promise<ArchiveTarget[]>;capturePage(id:string):Promise<CapturedPage>};
type ArchiveSessions=BrowserSessions & {listPages(profileId:string,sessionId:string):Promise<ArchiveTarget[]>;capturePage(profileId:string,sessionId:string,targetId:string):Promise<CapturedPage>};
async function runtime(options:Record<string,unknown>={}) {
  const root=await mkdtemp(join(tmpdir(),'ecdys-page-'));roots.push(root);
  const script=join(root,'browser');await writeFile(join(root,'scenario.json'),JSON.stringify({targets:[target],data:MHTML,...options}));
  await writeFile(script,`#!/usr/bin/env node
import {readFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {Socket} from 'node:net';
const directory=process.argv.find(v=>v.startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
const scenario=JSON.parse(readFileSync(${JSON.stringify(join(root,'scenario.json'))},'utf8'));
const input=new Socket({fd:3,readable:true,writable:false}),output=new Socket({fd:4,readable:false,writable:true});let buffer='';
input.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\\0'))!==-1){
 const command=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);appendFileSync(${JSON.stringify(join(root,'calls'))},JSON.stringify(command)+'\\n');
 let result={};
 if(command.method==='Browser.getVersion')result={product:'Chrome/154.0.0.0'};
 else if(command.method==='Target.getTargets')result={targetInfos:scenario.targets};
 else if(command.method==='Target.getTargetInfo')result={targetInfo:scenario.afterCapture&&scenario.captured?scenario.afterCapture:scenario.targets.find(t=>t.targetId===command.params.targetId)};
 else if(command.method==='Target.attachToTarget')result=command.params.targetId==='page-1'&&command.params.flatten===true?{sessionId:'attached-page'}:{};
 else if(command.method==='Page.captureSnapshot'){
   scenario.captured=true;
   if(command.sessionId!=='attached-page'||command.params.format!=='mhtml'){output.write(JSON.stringify({id:command.id,error:{message:'Wrong target session'}})+'\\0');continue;}
   if(scenario.error){output.write(JSON.stringify({id:command.id,error:{message:scenario.error}})+'\\0');continue;}
   result={data:scenario.oversized?'x'.repeat(9*1024*1024):scenario.data};
 } else if(command.method!=='Target.detachFromTarget'&&command.method!=='Browser.close'){output.write(JSON.stringify({id:command.id,error:{message:'Unexpected method'}})+'\\0');continue;}
 output.write(JSON.stringify({id:command.id,result})+'\\0');if(command.method==='Browser.close')setImmediate(()=>process.exit(0));
}});
`,{mode:0o700});
  const directory=join(root,'profile');await mkdir(directory);
  const browser=await ChromiumProcess.start({executable:script,directory,startupTimeoutMs:1000,closeTimeoutMs:100}) as ArchiveBrowser;browsers.push(browser);
  return {root,directory,browser,calls:async()=> (await readFile(join(root,'calls'),'utf8')).trim().split('\n').map(line=>JSON.parse(line))};
}
afterEach(async()=>{for(const manager of managers.splice(0))await manager.shutdown();for(const browser of browsers.splice(0))await browser.close();for(const vault of vaults.splice(0))vault.close();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});

it('lists bounded HTTP(S) page targets without URL credentials, queries or control characters',async()=>{
  const {browser}=await runtime({targets:[target,{...target,targetId:'worker',type:'service_worker'},{...target,targetId:'local',url:'file:///private.txt'},{...target,targetId:'bad',url:'javascript:alert(1)'}]});
  expect(await browser.listPages()).toEqual([{targetId:'page-1',title:'Private page',url:'https://example.test'}]);
});
it('bounds target count and label size, and skips malformed or oversized URLs and IDs',async()=>{
  const {browser}=await runtime({targets:[{...target,title:'é'.repeat(300)},{...target,targetId:'x'.repeat(129)},{...target,targetId:'long-url',url:'https://example.test/'+ 'a'.repeat(8192)},{...target,targetId:'bad-url',url:'invalid'}]});
  expect(await browser.listPages()).toEqual([{targetId:'page-1',title:'é'.repeat(200),url:'https://example.test'}]);
  const crowded=await runtime({targets:Array.from({length:101},(_,i)=>({...target,targetId:`page-${i}`}))});
  await expect(crowded.browser.listPages()).rejects.toThrow(/pages|archive/i);
});
it('captures the selected owned page as MHTML and detaches the temporary CDP session',async()=>{
  const {browser,calls}=await runtime();const result=await browser.capturePage('page-1');
  expect(result.bytes.toString()).toBe(MHTML);expect(result.sha256).toBe(createHash('sha256').update(MHTML).digest('hex'));
  const sent=await calls();expect(sent.find(c=>c.method==='Page.captureSnapshot')).toMatchObject({params:{format:'mhtml'},sessionId:'attached-page'});
  expect(sent.at(-1)).toMatchObject({method:'Target.detachFromTarget',params:{sessionId:'attached-page'}});
});
it.each([
  [{...target,type:'service_worker'},'page-1'],[{...target,url:'file:///private.txt'},'page-1'],
  [{...target,url:'data:text/html,private'},'page-1'],[target,'unknown'],[target,'bad\u0000id'],
])('refuses unknown, nonpage, and non-HTTP targets before capture',async(info,id)=>{
  const {browser,calls}=await runtime({targets:[info]});await expect(browser.capturePage(id)).rejects.toThrow(/page|target|archive/i);
  expect((await calls()).some(c=>c.method==='Page.captureSnapshot')).toBe(false);
});
it.each(['', 'not an archive', 'MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="x"\r\n\r\n--x\r\nContent-Type: text/html\r\n\r\n<html>unfinished', 'é'.repeat(2*1024*1024+1)])('rejects empty, malformed, or oversized MHTML and still detaches',async data=>{
  const {browser,calls}=await runtime({data});await expect(browser.capturePage('page-1')).rejects.toThrow(/archive|MHTML|limit/i);
  expect((await calls()).at(-1)).toMatchObject({method:'Target.detachFromTarget'});
});
it('rejects oversized CDP capture output while preserving the browser connection',async()=>{
  const {browser,calls}=await runtime({oversized:true});await expect(browser.capturePage('page-1')).rejects.toThrow(/archive|limit/i);
  expect(await browser.command('Browser.getVersion')).toEqual({product:'Chrome/154.0.0.0'});
  expect((await calls()).at(-2)).toMatchObject({method:'Target.detachFromTarget'});
  expect(await browser.close()).toMatchObject({code:0,forced:false});
});
it('sanitizes protocol errors and discards capture when the target navigates to a local URL',async()=>{
  for(const scenario of [{error:'PRIVATE token=secret https://name:password@example.test/'},{afterCapture:{...target,url:'file:///private.txt'}}]){
    const {browser,calls}=await runtime(scenario);let failure='';try{await browser.capturePage('page-1');}catch(error){failure=(error as Error).message;}
    expect(failure).toMatch(/archive|page/i);expect(failure).not.toMatch(/PRIVATE|secret|password|private\.txt/);
    expect((await calls()).at(-1)).toMatchObject({method:'Target.detachFromTarget'});
  }
});

async function managed(handle:BrowserHandle) {
  const root=await mkdtemp(join(tmpdir(),'ecdys-page-session-'));roots.push(root);const vault=await Vault.create(join(root,'vault'),'archive test passphrase',{memoryMiB:64,iterations:2});vaults.push(vault);
  const profile=vault.createProfile({name:'Archive session'});const sessions=new BrowserSessions(vault,{assertReady(){},async launch(){return handle;}}) as ArchiveSessions;managers.push(sessions);
  const session=await sessions.launch(profile.id);return {vault,profile,sessions,session};
}
function handle(capabilities:Partial<BrowserHandle>={}) {
  let resolve!:(value:{code:number;signal:null;forced:false})=>void;const exited=new Promise<{code:number;signal:null;forced:false}>(done=>{resolve=done;});
  return {pid:123,version:'Chrome/154.0.0.0',exited,async close(){const exit={code:0,signal:null,forced:false} as const;resolve(exit);return exit;},...capabilities} as BrowserHandle;
}
it('requires a matching active managed session and refuses unsupported handles',async()=>{
  const {sessions,profile,session}=await managed(handle());
  await expect(sessions.listPages(profile.id,session.id)).rejects.toThrow(/support|archive/i);
  await expect(sessions.listPages(profile.id,'00000000-0000-4000-8000-000000000000')).rejects.toThrow(/session/i);
  await sessions.close(profile.id);await expect(sessions.capturePage(profile.id,session.id,'page-1')).rejects.toThrow(/session/i);
});
it('does not return captured content if the owned session closes during capture',async()=>{
  let finish!:(value:CapturedPage)=>void;let entered!:()=>void;const capturing=new Promise<void>(resolve=>{entered=resolve;});
  const pending=new Promise<CapturedPage>(resolve=>{finish=resolve;});
  const owned=handle({async listPages(){return [{targetId:'page-1',title:'Page',url:'https://example.test'}];},async capturePage(){entered();return pending;}});
  const {sessions,profile,session}=await managed(owned);expect(await sessions.listPages(profile.id,session.id)).toHaveLength(1);
  const capture=sessions.capturePage(profile.id,session.id,'page-1');await capturing;await sessions.close(profile.id);
  const bytes=Buffer.from(MHTML);finish({bytes,sha256:'a'.repeat(64)});await expect(capture).rejects.toThrow(/session/i);expect(bytes.every(byte=>byte===0)).toBe(true);
});
it('keeps product-default launch blocked and never starts a browser for archive requests',async()=>{
  const {vault,profile,session}=await managed(handle());const sessions=new BrowserSessions(vault) as ArchiveSessions;managers.push(sessions);
  await expect(sessions.listPages(profile.id,session.id)).rejects.toThrow(/session/i);
  await expect(sessions.launch(profile.id)).rejects.toThrow(/OS-enforced/);
  expect(sessions.list()).toEqual([]);
});

async function attachPage(browser:ChromiumProcess,url:string) {
  const {targetId}=await browser.command<{targetId:string}>('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await browser.command<{sessionId:string}>('Target.attachToTarget',{targetId,flatten:true});
  await browser.command('Page.navigate',{url},sessionId);return {targetId,sessionId};
}
async function waitForPage(browser:ChromiumProcess,sessionId:string,expression:string) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){const state=await browser.command<{result:{value?:boolean}}>('Runtime.evaluate',{expression,returnByValue:true},sessionId);if(state.result.value)return;await new Promise(resolve=>setTimeout(resolve,30));}
  throw new Error('Local archive fixture did not finish');
}
async function realArchive() {
  const root=await mkdtemp(join(tmpdir(),'ecdys-real-archive-'));roots.push(root);
  const server=createServer((request,response)=>{
    if(request.url==='/style.css'){response.setHeader('Content-Type','text/css');response.end('h1{color:rgb(12, 34, 56)}');return;}
    if(request.url==='/image.svg'){response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" width="7" height="9"><rect width="7" height="9" fill="red"/></svg>');return;}
    response.setHeader('Content-Type','text/html');response.end('<!doctype html><link rel="stylesheet" href="/style.css"><h1>Initial document</h1><img id="saved-image" src="/image.svg"><script>document.querySelector("h1").textContent="Captured live document";window.addEventListener("load",()=>window.fixtureReady=true)</script>');
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try {
    const executable=process.env.STYG_TEST_CHROMIUM??'/usr/bin/chromium';const quote=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";
    // The test executor needs a wrapper. Product Chromium arguments never bypass its sandbox.
    const wrapper=join(root,'chromium-test');await writeFile(wrapper,`#!/bin/sh\nexec ${quote(executable)} --headless=new --no-sandbox --disable-gpu --password-store=basic --disable-breakpad --disable-crash-reporter --disable-dev-shm-usage "$@"\n`,{mode:0o700});
    const firstDir=join(root,'first');await mkdir(firstDir);const browser=await ChromiumProcess.start({executable:wrapper,directory:firstDir,closeTimeoutMs:3000});browsers.push(browser);
    const page=await attachPage(browser,origin);await waitForPage(browser,page.sessionId,'window.fixtureReady===true');
    const saved=await browser.capturePage(page.targetId);const file=join(root,'saved.mhtml');await writeFile(file,saved.bytes,{mode:0o600});saved.bytes.fill(0);
    await browser.close();return {root,wrapper,file};
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
}
it('captures live Chromium DOM, CSS and image resources in one MHTML artifact',async()=>{
  const fixture=await realArchive();const content=await readFile(fixture.file,'utf8');
  expect(content).toContain('Captured live document');expect(content).toContain('Content-Type: text/css');expect(content).toContain('Content-Type: image/svg+xml');
});
it('reopens a captured MHTML in a fresh offline Chromium browser',async context=>{
  const {root,wrapper,file}=await realArchive();
  const secondDir=join(root,'second');await mkdir(secondDir);const offline=await ChromiumProcess.start({executable:wrapper,directory:secondDir,closeTimeoutMs:3000});browsers.push(offline);
  const restored=await attachPage(offline,'about:blank');await offline.command('Network.enable',{},restored.sessionId);
  await offline.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},restored.sessionId);
  const navigation=await offline.command<{errorText?:string}>('Page.navigate',{url:pathToFileURL(file).href},restored.sessionId);
  if(navigation.errorText==='net::ERR_BLOCKED_BY_ADMINISTRATOR')context.skip('Chromium enterprise URL policy blocks file:// archives in this executor');
  expect(navigation.errorText).toBeUndefined();
  await waitForPage(offline,restored.sessionId,'document.querySelector("h1")?.textContent==="Captured live document"&&document.querySelector("img")?.complete===true');
  const measured=await offline.command<{result:{value:unknown}}>('Runtime.evaluate',{expression:'({text:document.querySelector("h1").textContent,color:getComputedStyle(document.querySelector("h1")).color,imageWidth:document.querySelector("img").naturalWidth})',returnByValue:true},restored.sessionId);
  expect(measured.result.value).toEqual({text:'Captured live document',color:'rgb(12, 34, 56)',imageWidth:7});
},60000);
