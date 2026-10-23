import { isIP } from 'node:net';
export const ROUTE_BLOCKED='Networked launch is blocked: an OS-enforced per-profile route has not been verified. Run the Linux routing proof on a host with network-administration privileges.';
export function routingStatus() { return {status:'blocked' as const,message:ROUTE_BLOCKED}; }
export function assertRouteReady():never { throw new Error(ROUTE_BLOCKED); }
export type ProofSample={egressA:string|null;egressB:string|null;disconnectedA:boolean;unaffectedB:boolean;recoveredA:boolean;fallbackReachableA:boolean};
export function assessRoutingProof(sample:ProofSample):{passed:boolean;issues:string[]} {
  const issues:string[]=[];
  if(!sample.egressA || !isIP(sample.egressA) || !sample.egressB || !isIP(sample.egressB)) issues.push('Both profiles must have a measured IP address.');
  else if(sample.egressA===sample.egressB) issues.push('Profile egress addresses must be different.');
  if(sample.fallbackReachableA!==true) issues.push('The fallback route must be reachable before firewall enforcement is applied.');
  if(sample.disconnectedA!==false) issues.push('Traffic escaped while the assigned route was disconnected.');
  if(sample.unaffectedB!==true) issues.push('Disconnecting profile A must leave profile B reachable.');
  if(sample.recoveredA!==true) issues.push('Profile A must recover its original route.');
  return {passed:issues.length===0,issues};
}
