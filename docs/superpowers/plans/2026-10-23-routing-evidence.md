# Dual-stack Routing Evidence Implementation Plan

> Checked 2026-10-26 against application revision `2dffb6d`: The laboratory/evaluator implementation is verified. The checked execution task records an observed blocked attempt, not a successful privileged isolation proof. See the [implementation audit](../../PLAN-AUDIT.md).

**Goal:** Make the local route-lock lab require complete dual-stack, DNS and repeated-failure evidence.
**Architecture:** Strict typed evidence evaluator; standard-library Python network fixtures/probes; a Node Linux namespace runner collecting real observations and firewall counters.
**Tech Stack:** Existing TypeScript/Zod/Vitest, Node 22.18+, Python 3, iproute2 and nftables.
**Spec:** docs/superpowers/specs/2026-10-23-routing-evidence.md
**Execution:** Inline continuation under existing authorization, on feat/routing-evidence; one fresh read-only final review.

## Global constraints
- No host route/firewall edits, no extra dependencies, no launch bypass.
- Eight cases: IPv4/IPv6 × HTTP/UDP/DNS-UDP/DNS-TCP; three reconnect cycles each.
- Missing permissions are blocked, never passed; errors are distinct from timeouts.

## Review focus
- A dead server or malformed reply must not count as blocking; require fresh responses, sibling control and counter growth.
- Missing/duplicate family/protocol cases and legacy evidence fail.
- Fallback must work before enforcement and be denied even while tun0 stays up.
- Cleanup errors and process-start failures fail the run; only owned paths/names are removed.
- Namespace/protocol validation does not authorize real browser launches.

## Task 1 — Evidence contract
Files: desktop/routing-proof.ts, desktop/routing.ts, tests/routing.test.ts.
- [x] Write/run failing tests for complete evidence, every missing/failing control, malformed/duplicate/legacy input and exact egress identities.
- [x] Implement assessRoutingProof(unknown) -> {passed:boolean,issues:string[]} with a strict v2 schema and semantic checks.
- [x] Run focused tests.

## Task 2 — Real protocol fixtures
Files: scripts/routing-fixture.py, tests/routing-fixture.test.ts.
- [x] Write/run failing real-loopback tests for both families, four protocols, raw DNS correctness, rejected mismatched replies and timeout/error distinction.
- [x] Implement server CLI (JSON readiness with dynamic ports) and probe CLI (nonce-correlated received/timeout/error JSON).
- [x] Run focused tests and full backend suite.

## Task 3 — Namespace runner and handoff
Files: scripts/routing-proof.mjs, scripts/routing-preflight.mjs, tests/routing-cli.test.ts, tests/routing-runner.test.ts, docs/ROUTING.md, docs/STATUS.md, README.md.
- [x] Write/run CLI behavior checks for no --run, blocked preflight and startup failures.
- [x] Extend isolated lab topology/routes/firewall counters; collect controls and three cycles for all cases; surface cleanup failures.
- [x] Run actual preflight/--run and record the observed block; validate typecheck/build/full tests and existing UI checks.
- [x] Request read-only review, fix verified issues, update docs/progress and commit locally.

## Acceptance still blocked

- [ ] Execute and pass the real namespace/firewall proof on a host with nft, CAP_NET_ADMIN and CAP_SYS_ADMIN.
- [ ] Verify the real provider/browser path separately; a laboratory pass alone never enables launches.
