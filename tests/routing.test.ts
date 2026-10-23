import {describe,expect,it} from 'vitest';
import {assertRouteReady,routingStatus,assessRoutingProof} from '../packages/desktop/src/routing';
describe('routing gate',()=>{
  it('blocks every launch while OS enforcement is unavailable',()=>{
    expect(routingStatus().status).toBe('blocked');
    expect(()=>assertRouteReady()).toThrow(/OS-enforced/);
  });
});
describe('Linux routing proof assessment',()=>{
  const good={egressA:'10.201.1.2',egressB:'10.201.2.2',disconnectedA:false,unaffectedB:true,recoveredA:true,fallbackReachableA:true};
  it('requires distinct egresses, blocking during disconnect, unaffected sibling and recovery',()=>{
    expect(assessRoutingProof(good)).toEqual({passed:true,issues:[]});
  });
  it.each([
    {...good,egressA:null},
    {...good,egressB:'10.201.1.2'},
    {...good,disconnectedA:true},
    {...good,unaffectedB:false},
    {...good,recoveredA:false},
    {...good,fallbackReachableA:false},
    {...good,egressA:'not an IP'},
  ])('fails incomplete or leaking results: %j',sample=>{
    expect(assessRoutingProof(sample).passed).toBe(false);
    expect(assessRoutingProof(sample).issues.length).toBeGreaterThan(0);
  });
});
