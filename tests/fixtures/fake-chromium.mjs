#!/usr/bin/env node
import {readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {Socket} from 'node:net';
import {hostname} from 'node:os';
const dir=process.argv.find(arg=>arg.startsWith('--user-data-dir=')).split('=').slice(1).join('=');
const mode=readFileSync(join(dir,'fixture-mode'),'utf8');writeFileSync(join(dir,'fixture.pid'),String(process.pid));
if(mode.includes('locks')){symlinkSync(`${hostname()}-${process.pid}`,join(dir,'SingletonLock'));symlinkSync('fixture-cookie',join(dir,'SingletonCookie'));symlinkSync('/tmp/fixture-browser-socket',join(dir,'SingletonSocket'));}
if(mode==='ignore-close')process.on('SIGTERM',()=>{});
const input=new Socket({fd:3,readable:true,writable:false}),output=new Socket({fd:4,readable:false,writable:true});let buffer='';
let ready=Promise.resolve();
if(mode==='child'){
  const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.send('ready');setInterval(()=>{},1000)"],{stdio:['ignore','ignore','ignore','ipc']});
  writeFileSync(join(dir,'child.pid'),String(child.pid));ready=new Promise(resolve=>child.once('message',resolve));
}
input.on('data',async chunk=>{
  buffer+=chunk.toString();let end;
  while((end=buffer.indexOf('\0'))!==-1){
    const frame=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);await ready;
    if(mode.startsWith('silent'))continue;
    if(mode.startsWith('bad-protocol')){output.write('broken-frame\0');continue;}
    if(frame.method==='Browser.close'){
      if(mode==='ignore-close')continue;
      output.write(JSON.stringify({id:frame.id,result:{}})+'\0',()=>process.exit(0));continue;
    }
    const result=frame.method==='Browser.getVersion'?{product:'Chrome/154.0.0.0'}:frame.method==='Fixture.args'?{args:process.argv.slice(2)}:frame.params;
    output.write(JSON.stringify({id:frame.id,result})+'\0');
    if(frame.method==='Fixture.crash')setImmediate(()=>process.exit(23));
  }
});
