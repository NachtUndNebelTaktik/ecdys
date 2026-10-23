import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function routingPreflight() {
  const checks=[];
  checks.push({name:'Linux host',passed:process.platform==='linux'});
  for(const [name,args] of [['ip',['-Version']],['nft',['--version']],['python3',['--version']]]) {
    try {execFileSync(name,args,{stdio:'ignore'});checks.push({name:`${name} executable`,passed:true});}
    catch {checks.push({name:`${name} executable`,passed:false});}
  }
  let caps=0n;
  try {caps=BigInt(`0x${readFileSync('/proc/self/status','utf8').match(/^CapEff:\s*([a-f0-9]+)/m)?.[1]??'0'}`);}catch{}
  checks.push({name:'CAP_NET_ADMIN',passed:(caps&(1n<<12n))!==0n});
  checks.push({name:'CAP_SYS_ADMIN (namespace mounting)',passed:(caps&(1n<<21n))!==0n});
  return {status:checks.every(c=>c.passed)?'ready':'blocked',checks,scope:'Local IPv4/IPv6 HTTP, UDP and DNS namespace/firewall laboratory. Does not validate a provider VPN or production browser routing.'};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const result=routingPreflight(); console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='ready'?0:2;
}
