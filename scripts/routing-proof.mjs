import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {routingPreflight} from './routing-preflight.mjs';
import {assessRoutingProof,readRoutingDropCounter} from '../packages/desktop/src/routing-proof.ts';

// All addresses/routes/firewall rules live in owned disposable namespaces.
// Only down/unaddressed veth pairs briefly exist in the host namespace.
const args=process.argv.slice(2),preflight=routingPreflight();
const emit=value=>console.log(JSON.stringify(value,null,2));
if(args.some(arg=>arg!=='--run')||args.length>1) {
  emit({passed:false,status:'blocked',reason:'invalid_arguments',usage:'sudo node scripts/routing-proof.mjs --run'});process.exit(2);
}
if(!args.includes('--run')) {
  emit({passed:false,status:'blocked',reason:'explicit_run_required',usage:'sudo node scripts/routing-proof.mjs --run'});process.exit(2);
}
if(preflight.status!=='ready') {
  emit({passed:false,status:'blocked',reason:'missing_prerequisites',preflight});process.exit(2);
}
const token=randomBytes(4).toString('hex'),prefix=`styg-${process.pid}-${token}`;
const router=`${prefix}-r`,a=`${prefix}-a`,b=`${prefix}-b`;
const created=[],temporaryLinks=new Set(),cleanupIssues=[];
const fixture=fileURLToPath(new URL('./routing-fixture.py',import.meta.url));
const evidence={version:2,paths:[]};
let server,serverFailure='',interrupted=false,result;
const markInterrupted=()=>{interrupted=true;};
process.once('SIGINT',markInterrupted);process.once('SIGTERM',markInterrupted);
const execute=(program,args,options={})=>execFileSync(program,args,{encoding:'utf8',timeout:10000,stdio:['pipe','pipe','pipe'],...options});
const ip=(...args)=>execute('ip',args);
const local=(ns,...args)=>ip('-n',ns,...args);
const familyArgs=family=>family===6?['-6']:[];
const target=family=>family===6?'fd53:57::1':'10.253.0.1';
const subnet=(kind,index,family)=>family===4?`10.${kind==='tun0'?201:202}.${index}`:`fd53:${kind==='tun0'?201:202}:${index}`;
function route(kind,index,family,action='replace',metric=kind==='tun0'?10:100) {
  const ns=index===1?a:b,base=subnet(kind,index,family),endpoint=`${target(family)}/${family===4?32:128}`;
  const nextHop=family===4?`${base}.1`:`${base}::1`;
  return local(ns,...familyArgs(family),'route',action,endpoint,'via',nextHop,'dev',kind,'metric',String(metric));
}
function link(ns,index,kind) {
  const suffix=`${index}${kind==='tun0'?'t':'f'}`,host=`s${token}${suffix}`,peer=`r${token}${suffix}`;
  ip('link','add',host,'type','veth','peer','name',peer);temporaryLinks.add(host);temporaryLinks.add(peer);
  ip('link','set',peer,'netns',router);temporaryLinks.delete(peer);
  ip('link','set',host,'netns',ns);temporaryLinks.delete(host);
  local(ns,'link','set',host,'name',kind);
  for(const family of [4,6]) {
    const base=subnet(kind,index,family),client=family===4?`${base}.2/30`:`${base}::2/64`,gateway=family===4?`${base}.1/30`:`${base}::1/64`;
    local(ns,...familyArgs(family),'addr','add',client,'dev',kind,...(family===6?['nodad']:[]));
    local(router,...familyArgs(family),'addr','add',gateway,'dev',peer,...(family===6?['nodad']:[]));
  }
  local(ns,'link','set',kind,'up');local(router,'link','set',peer,'up');
  for(const family of [4,6])route(kind,index,family,'add');
}
function checkRunning() {
  if(interrupted)throw new Error('Routing proof interrupted');
  if(serverFailure)throw new Error(serverFailure);
  if(server&&(server.exitCode!==null||server.signalCode!==null))throw new Error('Lab endpoint process exited');
}
function probe(ns,path) {
  checkRunning();
  const port=path.protocol==='http'?8765:path.protocol==='udp'?8766:53;
  // No proxy or DNS resolver dependency: numeric target, real DNS wire packets.
  return JSON.parse(ip('netns','exec',ns,'python3',fixture,'probe','--host',target(path.family),'--protocol',path.protocol,'--port',String(port),'--timeout','0.5'));
}
function drops(ns) {return readRoutingDropCounter(JSON.parse(ip('netns','exec',ns,'nft','--json','list','counter','inet','styg_proof','blocked')));}
function outage(path) {
  const dropPacketsBefore=drops(a),observation=probe(a,path),dropPacketsAfter=drops(a);
  return {a:observation,b:probe(b,path),dropPacketsBefore,dropPacketsAfter};
}
function requireReceived(observation,source,phase) {
  if(observation.status!=='received'||observation.source!==source)throw new Error(`${phase}: expected ${source}, measured ${JSON.stringify(observation)}`);
}
function primarySource(family,index=1){return family===4?`10.201.${index}.2`:`fd53:201:${index}::2`;}
function setTunnel(up) {
  local(a,'link','set','tun0',up?'up':'down');
  // Some kernels remove global IPv6 addresses when an interface goes down.
  if(up)local(a,'-6','addr','replace','fd53:201:1::2/64','dev','tun0','nodad');
  for(const family of [4,6]) {
    if(up)route('tun0',1,family);
    else {
      // A down link may retain a route on some kernels; remove that route explicitly.
      const routes=JSON.parse(local(a,...familyArgs(family),'-j','route','show',`${target(family)}/${family===4?32:128}`));
      if(routes.some(entry=>entry.dev==='tun0'))route('tun0',1,family,'del');
    }
  }
}
async function startServer() {
  server=spawn('ip',['netns','exec',router,'python3','-u',fixture,'serve','--bind',target(4),'--bind',target(6),'--http-port','8765','--udp-port','8766','--dns-port','53'],{stdio:['ignore','pipe','pipe']});
  let errors='';server.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-4000);});
  return new Promise((resolve,reject)=>{
    let output='';
    const timer=setTimeout(()=>reject(new Error(`Lab endpoint readiness timed out: ${errors}`)),5000);
    server.once('error',error=>{serverFailure=`Lab endpoint failed: ${error.message}`;clearTimeout(timer);reject(new Error(serverFailure));});
    server.once('exit',()=>{clearTimeout(timer);reject(new Error(`Lab endpoint exited before readiness: ${errors}`));});
    server.stdout.on('data',chunk=>{
      output+=chunk.toString();
      if(output.includes('\n')) {
        clearTimeout(timer);
        try {
          const ready=JSON.parse(output.split('\n')[0]);
          if(![4,6].every(family=>ready.endpoints?.some(endpoint=>endpoint.family===family&&endpoint.host===target(family)&&endpoint.httpPort===8765&&endpoint.udpPort===8766&&endpoint.dnsPort===53)))throw new Error('Invalid endpoint readiness');
          resolve();
        }catch(error){reject(error);}
      }
    });
  });
}
async function stopServer() {
  if(!server?.pid||(server.exitCode!==null||server.signalCode!==null))return;
  let timer;
  const exit=once(server,'exit');server.kill('SIGTERM');
  await Promise.race([exit,new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);clearTimeout(timer);
  if(server.exitCode===null&&server.signalCode===null){server.kill('SIGKILL');await exit;}
}
try {
  for(const ns of [router,a,b]) {ip('netns','add',ns);created.push(ns);local(ns,'link','set','lo','up');}
  local(router,'link','add','target','type','dummy');
  local(router,'addr','add',`${target(4)}/32`,'dev','target');local(router,'-6','addr','add',`${target(6)}/128`,'dev','target','nodad');local(router,'link','set','target','up');
  link(a,1,'tun0');link(a,1,'fallback0');link(b,2,'tun0');link(b,2,'fallback0');
  await startServer();
  for(const family of [4,6])for(const protocol of ['http','udp','dns_udp','dns_tcp']) {
    const path={family,protocol,cycles:[]};path.primaryA=probe(a,path);path.primaryB=probe(b,path);
    requireReceived(path.primaryA,primarySource(family),'Initial route A');requireReceived(path.primaryB,primarySource(family,2),'Initial route B');
    evidence.paths.push(path);
  }
  setTunnel(false);
  for(const path of evidence.paths) {
    path.fallbackA=probe(a,path);
    requireReceived(path.fallbackA,path.family===4?'10.202.1.2':'fd53:202:1::2','Unenforced fallback');
  }
  setTunnel(true);
  const rules='table inet styg_proof { counter blocked {} chain output { type filter hook output priority 0; policy drop; oifname "lo" accept; oifname "tun0" accept; counter name blocked drop; } }';
  for(const ns of [a,b])execute('ip',['netns','exec',ns,'nft','-f','-'],{input:rules});
  for(const path of evidence.paths) {
    path.enforcedA=probe(a,path);path.enforcedB=probe(b,path);
    requireReceived(path.enforcedA,primarySource(path.family),'Enforced route A');requireReceived(path.enforcedB,primarySource(path.family,2),'Enforced route B');
  }
  // Route to the fallback with tun0 still up. Interface liveness alone is insufficient.
  for(const family of [4,6])route('fallback0',1,family,'add',5);
  for(const path of evidence.paths)path.forcedFallback=outage(path);
  for(const family of [4,6])route('fallback0',1,family,'del',5);
  for(let cycle=0;cycle<3;cycle++) {
    setTunnel(false);
    for(const path of evidence.paths)path.cycles.push(outage(path));
    setTunnel(true);
    for(const path of evidence.paths)path.cycles[cycle].recoveredA=probe(a,path);
  }
  checkRunning();const assessment=assessRoutingProof(evidence);
  result={status:assessment.passed?'passed':'failed',scope:preflight.scope,evidence,...assessment};
} catch(error) {
  result={status:'failed',passed:false,scope:preflight.scope,evidence,issues:[error instanceof Error?error.message:String(error)]};
} finally {
  try{await stopServer();}catch(error){cleanupIssues.push(`endpoint cleanup: ${error.message}`);}
  for(const ns of created.reverse()){try{ip('netns','delete',ns);}catch(error){cleanupIssues.push(`${ns}: ${error.message}`);}}
  for(const name of temporaryLinks){try{ip('link','delete',name);temporaryLinks.delete(name);}catch(error){cleanupIssues.push(`${name}: ${error.message}`);}}
  // Deliver signal callbacks delayed by synchronous probes/cleanup before reporting.
  await new Promise(resolve=>setImmediate(resolve));
  process.removeListener('SIGINT',markInterrupted);process.removeListener('SIGTERM',markInterrupted);
}
if(interrupted)result={...result,status:'failed',passed:false,issues:[...(result.issues??[]),'Routing proof interrupted']};
if(cleanupIssues.length)result={...result,status:'failed',passed:false};
emit({...result,cleanupIssues});process.exitCode=result.passed?0:1;
