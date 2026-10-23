import {describe,expect,it} from 'vitest';
import {readRoutingDropCounter} from '../packages/desktop/src/routing-proof';
import {assertRouteReady,routingStatus,assessRoutingProof} from '../packages/desktop/src/routing';

// These literal source addresses are the topology contract, not evaluator output.
function goodEvidence() {
  return {version:2,paths:([4,6] as const).flatMap(family=>(['http','udp','dns_udp','dns_tcp'] as const).map(protocol=>{
    const received=(source:string)=>({status:'received',source});
    const sourceA=family===4?'10.201.1.2':'fd53:201:1::2',sourceB=family===4?'10.201.2.2':'fd53:201:2::2',fallback=family===4?'10.202.1.2':'fd53:202:1::2';
    const outage=()=>({a:{status:'timeout'},b:received(sourceB),dropPacketsBefore:10,dropPacketsAfter:11});
    return {family,protocol,primaryA:received(sourceA),primaryB:received(sourceB),fallbackA:received(fallback),enforcedA:received(sourceA),enforcedB:received(sourceB),forcedFallback:outage(),cycles:[0,1,2].map(()=>({...outage(),recoveredA:received(sourceA)}))};
  }))};
}
describe('routing gate',()=>{
  it('blocks launches regardless of local lab success',()=>{
    expect(assessRoutingProof(goodEvidence()).passed).toBe(true);
    expect(routingStatus().status).toBe('blocked');
    expect(()=>assertRouteReady()).toThrow(/OS-enforced/);
  });
});
describe('dual-stack evidence',()=>{
  it('accepts complete measured controls for both families and all protocols',()=>{
    expect(assessRoutingProof(goodEvidence())).toEqual({passed:true,issues:[]});
  });
  it.each(['primaryA','primaryB','fallbackA','enforcedA','enforcedB'])('rejects absent or wrong-source %s controls',key=>{
    for(const replacement of [undefined,{status:'timeout'},{status:'received',source:'127.0.0.1'},{status:'received',source:'10.201.2.2'}]){
      const evidence=goodEvidence();Object.assign(evidence.paths[0],{[key]:replacement});
      if(key==='primaryB'||key==='enforcedB') {if((replacement as {source?:string})?.source==='10.201.2.2')continue;}
      expect(assessRoutingProof(evidence).passed).toBe(false);
    }
  });
  it.each(['forcedFallback','cycle'])('requires timed-out traffic and increasing firewall counters during %s',kind=>{
    for(const patch of [{a:{status:'received',source:'10.202.1.2'}},{a:{status:'error',detail:'connection refused'}},{dropPacketsAfter:10},{dropPacketsBefore:-1},{dropPacketsAfter:NaN},{dropPacketsAfter:Number.MAX_SAFE_INTEGER+1},{b:{status:'timeout'}}]){
      const evidence=goodEvidence(),path=evidence.paths[0];Object.assign(kind==='cycle'?path.cycles[1]:path.forcedFallback,patch);
      expect(assessRoutingProof(evidence).passed).toBe(false);
    }
  });
  it('rejects missing cycles and recovery through a different source',()=>{
    const evidence=goodEvidence();evidence.paths[7].cycles.pop();expect(assessRoutingProof(evidence).passed).toBe(false);
    const other=goodEvidence();other.paths[7].cycles[2].recoveredA.source='fd53:202:1::2';expect(assessRoutingProof(other).passed).toBe(false);
  });
  it('rejects missing or duplicate family/protocol cases',()=>{
    const missing=goodEvidence();missing.paths.pop();expect(assessRoutingProof(missing).passed).toBe(false);
    const duplicate=goodEvidence();duplicate.paths[7]=duplicate.paths[0];expect(assessRoutingProof(duplicate).passed).toBe(false);
  });
  it.each([null,{},[],{version:2,paths:'bad'},{egressA:'10.201.1.2',egressB:'10.201.2.2',disconnectedA:false,unaffectedB:true,recoveredA:true,fallbackReachableA:true}])('rejects malformed and legacy observations without throwing: %j',sample=>{
    expect(assessRoutingProof(sample).passed).toBe(false);expect(assessRoutingProof(sample).issues.length).toBeGreaterThan(0);
  });
  it('rejects protocol typos, extra observations and wrong-family IPv6 controls',()=>{
    for(const patch of [{protocol:'dns'},{extra:true},{family:7},{primaryA:{status:'received',source:'10.201.1.2'}}]){
      const evidence=goodEvidence();Object.assign(evidence.paths[4],patch);expect(assessRoutingProof(evidence).passed).toBe(false);
    }
  });
});

describe('firewall counter observations',()=>{
  const counter=(packets:unknown)=>({counter:{family:'inet',table:'styg_proof',name:'blocked',packets,bytes:40}});
  it('reads only the lab drop counter from nft JSON',()=>{
    expect(readRoutingDropCounter({nftables:[{metainfo:{version:'1.0'}},counter(12)]})).toBe(12);
  });
  it.each([{}, {nftables:[]}, {nftables:[counter(-1)]}, {nftables:[counter(1.5)]}, {nftables:[counter(1),counter(2)]}, {nftables:[{counter:{family:'ip',table:'other',name:'blocked',packets:99}}]}])('rejects absent, ambiguous or invalid counter observations: %j',value=>{
    expect(()=>readRoutingDropCounter(value)).toThrow();
  });
});
