import {expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {EventEmitter,once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {assessRoutingProof,readRoutingDropCounter} from '../packages/desktop/src/routing-proof';

// Controller/lifecycle test only. OS commands are replaced at their boundary;
// no namespaces or firewall rules are installed, and this is not routing proof.
async function runController(options:{signal?:'SIGINT'|'SIGTERM';cleanupFailure?:boolean;serverFailure?:boolean}={}) {
  const path=resolve('scripts/routing-proof.mjs');
  const source=(await readFile(path,'utf8')).replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path).href));
  let up=true,forced=false,enforced=false,packets=0,output:any;
  const processAdapter=Object.assign(new EventEmitter(),{argv:['node',path,'--run'],pid:5555,exitCode:undefined as number|undefined});
  const deleted:string[]=[];
  function execute(_program:string,args:string[]) {
    if(args.includes('probe')) {
      const family=args[args.indexOf('--host')+1].includes(':')?6:4,sibling=args[2].endsWith('-b');
      if(!sibling&&enforced&&(!up||forced)){packets++;return JSON.stringify({status:'timeout'});}
      const index=sibling?2:1,subnet=!sibling&&!up?202:201;
      return JSON.stringify({status:'received',source:family===4?`10.${subnet}.${index}.2`:`fd53:${subnet}:${index}::2`});
    }
    if(args.includes('--json'))return JSON.stringify({nftables:[{counter:{family:'inet',table:'styg_proof',name:'blocked',packets}}]});
    if(args.includes('nft')&&args.includes('-f'))enforced=true;
    if(args[0]==='-n'&&args[1].endsWith('-a')&&args.slice(2,5).join(' ')==='link set tun0')up=args[5]==='up';
    if(args.includes('route')&&args.at(-1)==='5')forced=args.includes('add');
    if(args.includes('-j'))return '[]';
    if(args[0]==='netns'&&args[1]==='delete') {deleted.push(args[2]);if(options.cleanupFailure)throw new Error('cleanup denied');}
    return '';
  }
  function spawn() {
    const child=Object.assign(new EventEmitter(),{pid:1234,exitCode:null as number|null,signalCode:null,stdout:new EventEmitter(),stderr:new EventEmitter(),kill:(_signal:string)=>true});
    child.kill=()=>{
      if(options.signal)processAdapter.emit(options.signal);
      queueMicrotask(()=>{child.exitCode=0;child.emit('exit',0);});return true;
    };
    queueMicrotask(()=>{
      if(options.serverFailure){child.pid=0;child.emit('error',new Error('endpoint failed to start'));return;}
      child.stdout.emit('data',JSON.stringify({endpoints:[4,6].map(family=>({family,host:family===4?'10.253.0.1':'fd53:57::1',httpPort:8765,udpPort:8766,dnsPort:53}))})+'\n');
    });return child;
  }
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const run=new AsyncFunction('execFileSync','spawn','once','randomBytes','fileURLToPath','routingPreflight','assessRoutingProof','readRoutingDropCounter','process','console',source);
  await run(execute,spawn,once,()=>Buffer.from('12345678','hex'),fileURLToPath,()=>({status:'ready',scope:'controller test, no OS proof'}),assessRoutingProof,readRoutingDropCounter,processAdapter,{log:(value:string)=>{output=JSON.parse(value);}});
  return {output,code:processAdapter.exitCode,deleted};
}
it('assesses collected observations and cleans owned namespaces before reporting',async()=>{
  const {output,code,deleted}=await runController();expect(code).toBe(0);expect(output).toMatchObject({passed:true,cleanupIssues:[]});expect(deleted).toHaveLength(3);
});
it.each(['SIGINT','SIGTERM'] as const)('cannot report success when %s arrives during cleanup',async signal=>{
  const {output,code,deleted}=await runController({signal});expect(output.passed).toBe(false);expect(code).toBe(1);expect(deleted).toHaveLength(3);
});
it('cannot report success after a namespace cleanup failure',async()=>{
  const {output,code}=await runController({cleanupFailure:true});expect(code).toBe(1);expect(output.passed).toBe(false);expect(output.cleanupIssues).toHaveLength(3);
});
it('cleans created namespaces when the endpoint fails to spawn',async()=>{
  const {output,code,deleted}=await runController({serverFailure:true});expect(code).toBe(1);expect(output.passed).toBe(false);expect(deleted).toHaveLength(3);expect(output.issues[0]).toContain('failed to start');
});
