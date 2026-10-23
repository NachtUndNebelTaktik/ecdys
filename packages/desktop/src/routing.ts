export const ROUTE_BLOCKED='Networked launch is blocked: an OS-enforced per-profile route has not been verified. Run the Linux routing proof on a host with network-administration privileges.';
export function routingStatus() { return {status:'blocked' as const,message:ROUTE_BLOCKED}; }
export function assertRouteReady():never { throw new Error(ROUTE_BLOCKED); }
export {assessRoutingProof} from './routing-proof.ts';
