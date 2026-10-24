import type {ProxyDiagnostic, ProxyRouteDraft} from '@ecdys/shared';
import {openProxyTunnel, ProxyTunnelError, tunnelMessages} from './proxy-tunnel';

export async function probeProxy(
  input: ProxyRouteDraft,
  options: {signal?: AbortSignal; timeoutMs?: number} = {},
): Promise<Omit<ProxyDiagnostic, 'endpointId'>> {
  const checkedAt = Date.now(),
    start = performance.now();
  let code = 'TUNNEL_ACCEPTED';
  try {
    const socket = await openProxyTunnel(input, {host: 'example.com', port: 443}, options);
    socket.destroy();
  } catch (error) {
    code = error instanceof ProxyTunnelError ? error.code : 'NETWORK_ERROR';
  }
  return {
    checkedAt,
    durationMs: Math.round(performance.now() - start),
    scope: 'proxy_tunnel',
    state: code === 'TUNNEL_ACCEPTED' ? 'pass' : 'fail',
    code,
    message: tunnelMessages[code]!,
    destination: 'example.com:443',
  };
}
