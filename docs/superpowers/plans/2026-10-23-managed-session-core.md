# Managed Session Core Implementation Plan

> Checked 2026-10-26 against application revision `2dffb6d`: The internal Linux runtime/coordinator is implemented and fixture-tested. Product sessions remain blocked; no production route supervisor or managed browser bundle is delivered. See the [implementation audit](../../PLAN-AUDIT.md).

**Goal:** Own browser lifecycle and closed-state snapshots while keeping production routing blocked.
**Architecture:** Bounded CDP pipe + Linux process-group runtime; vault-backed exclusive browser lease; trusted-supervisor session coordinator; Electron shutdown drains sessions before locking.
**Tech stack:** Existing TypeScript, Node streams/child_process, SQLCipher-compatible SQLite, Electron and Vitest. No extra dependencies.
**Spec:** docs/superpowers/specs/2026-10-23-managed-session-core.md
**Execution:** Inline under continued authorization; one fresh read-only final review.

## Constraints and review focus
- Default route supervisor rejects before snapshots/spawn; no renderer override or debug port.
- Leases cover startup, lifetime, exit and snapshot completion; no live-file captures.
- Startup/crash/protocol/forced-exit paths stop all owned live processes before releasing files.
- Lock/quit and launch/close races are bounded; snapshot failure preserves working files and reports failure.
- Real fixture recovery uses compatible local Chromium only; no unsupported portability claim.

## Task 1 — Private process runtime
Files: browser/cdp-pipe.ts, browser/process-group.ts, browser/owned-locks.ts, browser/chromium.ts, tests/cdp-pipe.test.ts, tests/chromium.test.ts, tests/fixtures/fake-chromium.mjs.
- [x] Write and observe failing tests for fragmented frames, errors/timeouts and pipe closure.
- [x] Implement bounded private-pipe transport.
- [x] Write and observe failing startup/close/crash/child-cleanup process tests.
- [x] Implement Linux group ownership and bounded graceful/forced shutdown; verify focused tests.

## Task 2 — Profile ownership and coordinator
Files: desktop/vault.ts, desktop/state-store.ts, browser/sessions.ts, shared/model.ts, tests/sessions.test.ts.
- [x] Write and observe failing tests for default launch gate, ownership, auto snapshots, duplicate launch, startup/shutdown races, forced/crashed close and snapshot failure.
- [x] Implement browser lease and coordinator; preserve existing snapshot migration/restore behavior.
- [x] Verify focused tests and typecheck.

## Task 3 — Real recovery and desktop handoff
Files: tests/browser-recovery.test.ts, desktop/main.ts, renderer labels/status, docs.
- [x] Write/run real-browser failing integration test before adapting storage/lifecycle; verify actual cookies/localStorage/IndexedDB restoration.
- [x] Wire default blocked coordinator and orderly lock/quit; test IPC cannot enable launch.
- [x] Run backend/typecheck/build/UI/desktop checks; request read-only review and fix verified findings.
- [x] Update version/docs/progress and commit locally.

## Product acceptance still pending

- [ ] Supply and verify the trusted per-profile OS routing supervisor.
- [ ] Bundle a supported managed browser and verify the production launch/close flow behind that supervisor.
- [ ] Validate macOS/Windows process containment and recovery.
