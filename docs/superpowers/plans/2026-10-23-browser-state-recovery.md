# Browser State Recovery Implementation Plan

**Goal:** Recover closed browser-directory data alongside profile configuration, with durable interrupted-restore recovery.
**Architecture:** Worker handles bounded directory archives and authenticated encryption. SQLite atomically records snapshots/configuration/restore journal; a staged directory swap finishes or resumes from that journal. The renderer calls validated operations and never receives filesystem paths or keys.
**Spec:** docs/superpowers/specs/2026-10-23-browser-state-recovery.md
**Execution:** Continue inline as authorized; use the test-first and verification workflow.

## Constraints and review focus
- Networked launches remain blocked. No provider credentials or production route claims.
- Retain old configuration snapshot format and transparently migrate encrypted DB v1 to v2.
- Reject locks, links, malformed archives, traversal paths and oversized state before touching the current directory.
- File/DB errors must preserve the old state or leave a durable recovery journal that blocks use until recovered.
- Never label a configuration-only snapshot as containing browser state.

## Task 1 — Profile state archives and directories
Files: packages/desktop/src/state-{archive,worker,store}.ts; tests/state-store.test.ts; electron.vite.config.mts.
Interface: StateStore.ensure(id), capture(id,snapshotId,key), stage(id,operationId,snapshotId,envelope,key), finishRestore(id,operationId), close(). Worker returns encrypted envelope, fileCount and raw bytes; storage paths stay backend-only.
- [x] Write failing tests for distinct private directories, binary/empty-directory recovery, wrong identity/tamper, active locks, links and bounded/unsafe manifests.
- [x] Implement worker codecs, private staging directories and recoverable swap state machine.
- [x] Run focused tests.

## Task 2 — Vault integration and migration
Files: packages/desktop/src/vault.ts; packages/shared/src/model.ts; tests/state-vault.test.ts.
Interfaces: Vault.saveStateSnapshot(id), Vault.restoreSnapshot(id,snapshotId) return promises. Legacy restore(id,snapshotId) remains configuration-only. Snapshot DTO adds hasBrowserState, fileCount, stateBytes and browserVersion.
- [x] Write failing tests for DB migration, full rollback restore, configuration-only preservation, corrupt state, pin/prune and simulated interruption recovery.
- [x] Add schema migration, state capture operations and transactional durable restore journal.
- [x] Run full Vitest suite.

## Task 3 — Desktop controls and end-to-end verification
Files: packages/desktop/src/main.ts; packages/renderer/src/App.tsx; tests/desktop.spec.ts; README.md; docs/STATUS.md.
- [x] Extend the real Electron flow with manual state snapshot and content-aware restore assertions.
- [x] Add validated IPC, snapshot content labels and accurate restore confirmation.
- [x] Run typecheck/build, all unit and UI/desktop tests, and independent code review.
- [x] Record remaining browser/routing/OS-key limitations and commit on the feature branch.
