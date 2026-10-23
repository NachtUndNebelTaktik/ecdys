# Linux routing laboratory

This lab checks OS route/firewall mechanisms with simulated tunnel interfaces. It uses two disposable profile namespaces and a third namespace serving private HTTP, UDP echo and DNS TXT endpoints. It runs no VPN protocol, uses no Internet service, and cannot enable Styg browser launches.

All addresses, routes, servers and nftables rules belong to those namespaces. Only down/unaddressed veth pairs briefly exist in the host namespace before being moved into the lab. Host routes/firewall tables are not edited. Use a disposable Linux VM for the first administrator run.

## Run

Requires Linux, Node 22.18+, iproute2, nftables, Python 3, IPv6 kernel support and privileges to create/mount network namespaces and bind the local DNS service on port 53. The commands below use root; the namespace operations require CAP_NET_ADMIN and CAP_SYS_ADMIN.

```sh
node scripts/routing-preflight.mjs
# Read the scripts first, then on a suitable disposable host:
sudo node scripts/routing-proof.mjs --run > routing-result.json
```

A successful preflight reports tool/capability availability, not successful isolation. `--run` is mandatory. Namespace names contain the invocation PID and a random suffix (`styg-<pid>-<suffix>-{a,b,r}`). The script stops its endpoint process and deletes only the namespaces and temporary links it created. Cleanup errors make the result fail. SIGINT/SIGTERM trigger cleanup; SIGKILL or a machine crash can leave resources for an administrator to inspect/remove by their Styg namespace names.

## Required evidence

The version-2 evaluator requires all eight cases, each with three disconnect/recovery cycles:

| Family | Protocols | Assigned sources A / B | Usable fallback source A |
|---|---|---|---|
| IPv4 | HTTP, UDP echo, DNS over UDP, DNS over TCP | `10.201.1.2` / `10.201.2.2` | `10.202.1.2` |
| IPv6 | HTTP, UDP echo, DNS over UDP, DNS over TCP | `fd53:201:1::2` / `fd53:201:2::2` | `fd53:202:1::2` |

Targets are namespace-local `10.253.0.1` and `fd53:57::1`. Services use TCP 8765, UDP 8766, and DNS TCP/UDP 53. Every probe includes a fresh nonce; DNS uses a real, uncached TXT query/answer with matching transaction and question. Observed sources are returned by the receiving socket. Invalid replies are errors.

1. Measure both assigned profile sources before enforcement.
2. Remove A's assigned route and prove its fallback works **before** installing the firewall. A broken fallback cannot prove a kill switch.
3. Install namespace output rules accepting only `lo` and `tun0`; prove both assigned paths still work.
4. Prefer A's fallback while `tun0` remains up. A's request must time out, the named firewall drop counter must increase, and B must keep its assigned source.
5. Repeat A disconnect/reconnect three times. For each protocol/family, require a timeout plus increasing drop counter during outage, B's original source during outage, and A's original source after recovery.

Malformed, incomplete, duplicate and legacy IPv4-only reports fail assessment. A connection error, missing counter or unhealthy sibling is never successful blocking evidence. The structured report includes evidence and `cleanupIssues`; success requires `passed: true`, `status: "passed"`, no assessment issues and no cleanup issues.

Exit 0: measured local checks and cleanup passed. Exit 1: setup, observation, assessment or cleanup failed. Exit 2: explicit execution/valid arguments or prerequisites are missing (`status: "blocked"`, `passed: false`).

## Validation in this workspace

The actual privileged run is **blocked**: nft, CAP_NET_ADMIN and CAP_SYS_ADMIN are unavailable. [Recorded result](routing-preflight.json). No successful kernel routing proof is claimed. No VPN accounts or tunnel configuration were supplied.

Unprivileged tests exercise the strict evaluator, CLI blocked/error behavior, and real IPv4/IPv6 loopback HTTP/UDP/DNS servers and clients. They check independent DNS wire bytes, stale/malformed responses, silent UDP timeouts, refused TCP, truncated frames and response timeouts after a successful TCP connection. Controller tests additionally substitute OS commands to verify cleanup, startup failures and interruption reporting. These tests validate the measurement tools and orchestration; they do not prove namespace/firewall enforcement.

```sh
pnpm test tests/routing.test.ts tests/routing-fixture.test.ts tests/routing-cli.test.ts tests/routing-runner.test.ts
# Opt in on the administrator-equipped disposable Linux host:
sudo env STYG_PRIVILEGED_ROUTING_TEST=1 pnpm test tests/routing-cli.test.ts
```

## Before production browsing

A minimal privileged supervisor must create actual provider tunnels, enforce assigned routes **before** starting non-privileged Chromium, and clean up child processes safely. The app still has no such supervisor and rejects every networked launch.

This lab sends explicit DNS packets to a private endpoint; it does not validate the system or Chromium resolver, host resolver IPC, DoH, or actual WebRTC/STUN. It checks sequential route changes and reconnects, not established browser connections under disconnect races, actual VPN rotation, or a complete IPv6/control-plane policy. Those need managed Chromium traffic and provider tunnels. macOS and Windows need separate native enforcement and tests.
