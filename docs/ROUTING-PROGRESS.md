# Routing evidence progress
Plan: docs/superpowers/plans/2026-10-23-routing-evidence.md
Base: ba8dd98
Scope: The user's next approved step is network isolation. Implementation extends the existing local namespace laboratory; live privileged proof and provider/browser traffic remain required before enabling launches.
Pre-flight: Task 3 consumes Task 1's strict v2 measurement contract and Task 2's received/timeout/error JSON. Neither errors nor missing cases may be translated into blocked evidence.
Environment: connected, unrestricted HTTP policy enforced, no configured credentials or VPN; nft and CAP_NET_ADMIN/CAP_SYS_ADMIN absent. No policy changes attempted.

Task 1: strict v2 evidence implemented. RED: v1 evaluator rejected complete new evidence, accepted legacy evidence and threw for null; GREEN: contract tests passed. Added independent nft JSON counter parsing checks (missing function RED, focused GREEN). Schema requires all eight unique cases and all three cycles, exact topology sources, timeouts plus positive drop growth, sibling success and recovery.
Task 2: real Python loopback fixtures/probes implemented. Initial test run failed with missing fixture. GREEN: eight socket integration tests passed on IPv4 and IPv6; includes independent raw DNS wire assertions, wrong nonce/transaction rejection, actual UDP timeout, refused TCP and truncated TCP frame errors.
Task 3: CLI RED showed three failures for missing machine-readable blocked/argument/preflight results. GREEN: 36 focused checks passed, one privileged check explicitly skipped. Actual --run exits 2 with missing nft and capabilities; JSON saved in docs/routing-preflight.json. Runner restores IPv6 address before reconnect routes for kernels that remove it on link down.

Final review: fresh read-only reviewer found one Important issue: SIGINT/SIGTERM during cleanup could retain a previously passing report. Regression tests reproduced both signals as false passes using actual runner/evaluator with OS commands substituted at their boundary (controller tests, not kernel proof). Fixed by yielding for queued signals after cleanup and invalidating the final result if interrupted. Focused RED→GREEN confirmed.
Additional probe regression: a completed but silent TCP connection was misclassified as blocked timeout. A real loopback TCP test reproduced it; response timeouts after a successful TCP handshake now produce errors. The earlier full run caught this newly introduced failing regression (1 failed, 97 passed, 2 skipped); the final gate below follows the fix.
Focused post-fix verification: 42 passed, 1 privileged test skipped; typecheck passed. No remaining Critical/Important review finding. No minor findings reported.

Final gate: `pnpm test` — 103 passed, 2 opt-in checks skipped (maximum-size state test and privileged routing); `pnpm typecheck`, `pnpm build`, `pnpm test:ui` (1 passed), `pnpm test:desktop` (1 passed) — all exit 0. Maximum-size state rebinding was already verified in the prior increment; no state implementation changed here.
Delivery: local branch feat/routing-evidence; no remote writes, host route/firewall edits, provider integration or launch bypass. The laboratory implementation is delivered; actual privileged OS isolation and real provider/browser validation remain pending.
