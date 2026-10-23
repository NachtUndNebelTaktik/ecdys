# Branches and Preview Implementation Plan

**Goal:** Review restores and safely experiment in independent profile branches.
**Architecture:** Pure typed diffs plus revision checks; BranchManager coordinates encrypted history cloning, hidden creation reservations, journaled activation/deletion and configuration-only merges. Electron owns all operations; renderer shows content-aware previews and confirmations.
**Spec:** docs/superpowers/specs/2026-10-23-branches-and-previews.md
**Execution:** Continue inline under the user's authorization, test-first and independently reviewed.

## Review focus
- Metadata must never enter encrypted configuration payloads accidentally.
- Cloned state must be re-bound to new identities; fork failure must preserve parent and clean/resume reservations.
- Stale previews must not overwrite newer settings or discard a changed branch.
- Merge must preserve parent name/tags/files and save a rollback point.
- Discard must refuse standalone profiles, child branches and browser lock markers; interrupted deletion must resume only for journaled paths.

## Task 1 — Diffs, revisions and preview
Files: shared/model.ts; desktop/profile-diff.ts; desktop/vault.ts; tests/branches.test.ts.
- [x] Write failing tests for diff semantics, read-only preview, metadata-safe snapshot capture and stale restore rejection.
- [x] Add schema v3 migration and revision-aware preview/restoration.
- [x] Verify focused tests.

## Task 2 — Fork and branch lifecycle
Files: desktop/branches.ts; desktop/state-store.ts; desktop/state-worker.ts; tests/branches.test.ts.
- [x] Write failing real DB/filesystem tests for current-state/history independence, key rebinding, limit/name checks, failure cleanup, interrupted fork/discard recovery, merge rollback and promotion.
- [x] Implement hidden fork reservation, per-snapshot re-encryption, existing journal activation, configuration-only merge, promotion and journaled discard.
- [x] Run full backend suite, including original recovery and migration tests.

## Task 3 — Desktop flow and delivery
Files: main.ts; renderer/{App,SnapshotPanel,DiffTable,BranchDialog}.tsx; tests/desktop.spec.ts; docs.
- [x] Extend real Electron tests with diff previews and create/edit/merge/promote/discard branches.
- [x] Add validated IPC, ancestry badges, environment diffs and clear confirmations.
- [x] Run typecheck/build, backend and UI checks; review and fix verified issues.
- [x] Update documentation/version/screenshot and commit the feature branch.
