import {z} from 'zod';
import {isIP} from 'node:net';
const Received=z.object({status:z.literal('received'),source:z.string().refine(value=>isIP(value)!==0)}).strict();
const Probe=z.discriminatedUnion('status',[
  Received,z.object({status:z.literal('timeout')}).strict(),z.object({status:z.literal('error'),detail:z.string().min(1).max(500)}).strict(),
]);
const Counter=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const Outage=z.object({a:Probe,b:Probe,dropPacketsBefore:Counter,dropPacketsAfter:Counter}).strict();
const Path=z.object({
  family:z.union([z.literal(4),z.literal(6)]),protocol:z.enum(['http','udp','dns_udp','dns_tcp']),
  primaryA:Probe,primaryB:Probe,fallbackA:Probe,enforcedA:Probe,enforcedB:Probe,
  forcedFallback:Outage,cycles:z.array(Outage.extend({recoveredA:Probe})).length(3),
}).strict();
const Evidence=z.object({version:z.literal(2),paths:z.array(Path).length(8)}).strict();
export type RoutingProbe=z.infer<typeof Probe>;
export type RoutingPath=z.infer<typeof Path>;
export function assessRoutingProof(input:unknown):{passed:boolean;issues:string[]} {
  const parsed=Evidence.safeParse(input);
  if(!parsed.success)return {passed:false,issues:parsed.error.issues.map(issue=>`${issue.path.join('.')||'evidence'}: ${issue.message}`)};
  const issues:string[]=[],seen=new Set<string>();
  for(const path of parsed.data.paths) {
    const label=`IPv${path.family}/${path.protocol}`;
    if(seen.has(label))issues.push(`${label}: duplicate case; every family/protocol pair is required.`);seen.add(label);
    const sourceA=path.family===4?'10.201.1.2':'fd53:201:1::2',sourceB=path.family===4?'10.201.2.2':'fd53:201:2::2',fallback=path.family===4?'10.202.1.2':'fd53:202:1::2';
    const requireSource=(probe:RoutingProbe,expected:string,name:string)=>{
      if(probe.status!=='received'||probe.source!==expected)issues.push(`${label}/${name}: expected a fresh response from ${expected}.`);
    };
    requireSource(path.primaryA,sourceA,'primary A');requireSource(path.primaryB,sourceB,'primary B');
    requireSource(path.fallbackA,fallback,'unenforced fallback A');
    requireSource(path.enforcedA,sourceA,'enforced A');requireSource(path.enforcedB,sourceB,'enforced B');
    for(const [name,outage] of [['forced fallback',path.forcedFallback],...path.cycles.map((cycle,index)=>[`disconnect ${index+1}`,cycle] as const)] as const) {
      if(outage.a.status!=='timeout')issues.push(`${label}/${name}: assigned traffic must time out; errors are not blocking evidence.`);
      if(outage.dropPacketsAfter<=outage.dropPacketsBefore)issues.push(`${label}/${name}: firewall drop counter must increase.`);
      requireSource(outage.b,sourceB,`${name} sibling B`);
    }
    path.cycles.forEach((cycle,index)=>requireSource(cycle.recoveredA,sourceA,`recovery ${index+1}`));
  }
  return {passed:issues.length===0,issues};
}

export function readRoutingDropCounter(input:unknown):number {
  const document=z.object({nftables:z.array(z.unknown())}).parse(input);
  const identity=z.object({counter:z.object({family:z.string(),table:z.string(),name:z.string()}).passthrough()});
  const matches=document.nftables.flatMap(value=>{
    const entry=identity.safeParse(value);if(!entry.success)return [];
    const counter=entry.data.counter;
    return counter.family==='inet'&&counter.table==='styg_proof'&&counter.name==='blocked'?[counter]:[];
  });
  if(matches.length!==1)throw new Error('Expected exactly one lab firewall drop counter');
  return z.object({packets:Counter}).parse(matches[0]).packets;
}
