# Linux routing proof

The lab tests the OS mechanism before provider integration. Two client namespaces represent profiles, each with a preferred veth interface named `tun0` and a usable fallback interface. A third namespace serves a private IP-echo endpoint. This simulates tunnel interfaces; it runs no VPN protocol and accesses no Internet service.

All addresses, routes, HTTP serving and nftables rules belong to disposable namespaces. No host routes or firewall tables change. The script briefly creates unaddressed/down veth links in the host namespace before moving them into the lab. Use a disposable Linux VM for the first privileged run.

## Run

Requires Linux, Node 22.18+, iproute2, nftables, curl, Python 3, CAP_NET_ADMIN and CAP_SYS_ADMIN.

```sh
node scripts/routing-preflight.mjs
# Inspect the script first, then on a suitable host:
sudo node scripts/routing-proof.mjs --run
```

The explicit `--run` prevents accidental namespace changes. The script creates `styg-<pid>-{a,b,r}`, starts its echo server and cleans up its server/namespaces/temporary links in `finally`. A forced kill or machine crash may require an administrator to remove those specific leftovers.

## Required measurements

1. A reaches the endpoint with source `10.201.1.2`; B uses `10.201.2.2`.
2. Before firewall installation, removing A's preferred route reaches the endpoint via `10.202.1.2`. A broken fallback cannot count as a successful kill switch.
3. With output rules allowing only `lo` and `tun0`, removal of A's preferred route produces a failed request despite the usable fallback.
4. B remains reachable during A's outage.
5. Restoring A's route restores its original source address.

JSON must contain `passed: true` and no issues. Exit 0 means these local checks passed; 1 means a test/setup failed; 2 means prerequisites or `--run` are missing.

## Observed here

Preflight is **blocked**: nft, CAP_NET_ADMIN and CAP_SYS_ADMIN are unavailable. The privileged lab has not run here. No VPN provider accounts or tunnel configuration were supplied.

## Production work remaining

A privileged minimal supervisor must launch non-privileged browser processes inside assigned namespaces and configure actual provider tunnels. Test IPv4, IPv6, DNS, UDP, child processes, startup, rotation, disconnect races and repeated reconnects using actual Chromium traffic. Separate macOS and Windows implementations are required.

A local proof cannot authorize a production browser launch. The current backend always rejects launch requests until a real supervisor and route enforcement are implemented.
