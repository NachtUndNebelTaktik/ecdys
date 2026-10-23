import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {routingPreflight} from './routing-preflight.mjs';
import {assessRoutingProof} from '../packages/desktop/src/routing.ts';

// Only disposable namespaces and down/unaddressed veth links are created in the
// host namespace. All addresses, routes, firewall rules and HTTP serving are local
// to the laboratory namespaces; host routing/firewall rules are never modified.
if(!process.argv.includes('--run')) {
  console.log('Usage: sudo node scripts/routing-proof.mjs --run\nCreates and cleans up an isolated local IPv4 routing laboratory. Requires ip, nft, curl and python3.');
  process.exit(2);
}
const preflight=routingPreflight();
if(preflight.status!=='ready') {console.log(JSON.stringify(preflight,null,2));process.exit(2);}
const prefix=`styg-${process.pid}`;
const router=`${prefix}-r`,a=`${prefix}-a`,b=`${prefix}-b`;
const created=[],temporaryLinks=[];
let server;
const ip=(...args)=>execFileSync('ip',args,{encoding:'utf8',timeout:10000,stdio:['pipe','pipe','pipe']});
const local=(ns,...args)=>ip('-n',ns,...args);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const probe=ns=>{
  try {const value=ip('netns','exec',ns,'curl','--noproxy','*','--silent','--fail','--max-time','2','http://10.253.0.1:8765').trim();return value||null;}catch{return null;}
};
async function waitFor(ns,expected) {for(let i=0;i<20;i++){if(probe(ns)===expected)return true;await sleep(100);}return false;}
function link(ns,index,kind) {
  const subnet=kind==='tun0'?201:202;
  const host=`s${process.pid}${index}${subnet}`;
  const peer=`r${index}${subnet}`;
  ip('link','add',host,'type','veth','peer','name',peer);temporaryLinks.push(host,peer);
  ip('link','set',peer,'netns',router);ip('link','set',host,'netns',ns);
  local(ns,'link','set',host,'name',kind);
  local(ns,'addr','add',`10.${subnet}.${index}.2/30`,'dev',kind);
  local(router,'addr','add',`10.${subnet}.${index}.1/30`,'dev',peer);
  local(ns,'link','set',kind,'up');local(router,'link','set',peer,'up');
  local(ns,'route','add','10.253.0.1/32','via',`10.${subnet}.${index}.1`,'dev',kind,'metric',kind==='tun0'?'10':'100');
}
try {
  for(const ns of [router,a,b]) {ip('netns','add',ns);created.push(ns);local(ns,'link','set','lo','up');}
  local(router,'link','add','target','type','dummy');local(router,'addr','add','10.253.0.1/32','dev','target');local(router,'link','set','target','up');
  link(a,1,'tun0');link(a,1,'fallback0');link(b,2,'tun0');link(b,2,'fallback0');
  const python=`from http.server import HTTPServer,BaseHTTPRequestHandler\nclass Echo(BaseHTTPRequestHandler):\n def do_GET(self):\n  self.send_response(200);self.end_headers();self.wfile.write(self.client_address[0].encode())\n def log_message(self,*args): pass\nHTTPServer(('10.253.0.1',8765),Echo).serve_forever()`;
  server=spawn('ip',['netns','exec',router,'python3','-u','-c',python],{stdio:'ignore'});
  if(!await waitFor(a,'10.201.1.2')) throw new Error('Primary route A did not become reachable');
  const egressA=probe(a),egressB=probe(b);
  local(a,'link','set','tun0','down');
  try {local(a,'route','del','10.253.0.1/32','dev','tun0','metric','10');} catch {}
  const fallbackReachableA=await waitFor(a,'10.202.1.2');
  local(a,'link','set','tun0','up');
  // Bringing the link up does not reliably restore a manually added route.
  local(a,'route','replace','10.253.0.1/32','via','10.201.1.1','dev','tun0','metric','10');
  const rules='table inet styg_proof { chain output { type filter hook output priority 0; policy drop; oifname "lo" accept; oifname "tun0" accept; } }';
  for(const ns of [a,b]) execFileSync('ip',['netns','exec',ns,'nft','-f','-'],{input:rules,timeout:5000});
  if(!await waitFor(a,'10.201.1.2') || !await waitFor(b,'10.201.2.2')) throw new Error('Firewall blocked the allowed route');
  local(a,'link','set','tun0','down');
  try {local(a,'route','del','10.253.0.1/32','dev','tun0','metric','10');} catch {}
  const disconnectedA=probe(a)!==null;
  const unaffectedB=probe(b)==='10.201.2.2';
  local(a,'link','set','tun0','up');local(a,'route','replace','10.253.0.1/32','via','10.201.1.1','dev','tun0','metric','10');
  const recoveredA=await waitFor(a,'10.201.1.2');
  const measurements={egressA,egressB,fallbackReachableA,disconnectedA,unaffectedB,recoveredA};
  const result=assessRoutingProof(measurements);
  console.log(JSON.stringify({scope:preflight.scope,measurements,...result},null,2));
  process.exitCode=result.passed?0:1;
} catch(error) {
  console.error(JSON.stringify({passed:false,error:error.message}));process.exitCode=1;
} finally {
  if(server && server.exitCode===null) {server.kill('SIGTERM');await Promise.race([once(server,'exit'),sleep(2000)]);if(server.exitCode===null)server.kill('SIGKILL');}
  for(const ns of created.reverse()) {try{ip('netns','delete',ns);}catch{}}
  for(const name of temporaryLinks) {try{ip('link','delete',name);}catch{}}
}
