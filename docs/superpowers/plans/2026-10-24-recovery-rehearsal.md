# Recovery Rehearsal Implementation Plan

> Checked 2026-10-26 against application revision `2dffb6d`: Read-only authentication/decoding checks are implemented and verified. A successful report does not establish browser launch, protected-cookie usability or network isolation. See the [implementation audit](../../PLAN-AUDIT.md).

**Goal:** Check saved encrypted contents without replacing current profile files.

**Architecture:** Reuse the bounded state worker for configuration/archive validation; Vault coordinates one check at a time. Renderer displays a scoped, temporary report and keeps Lock available.

**Tech stack:** Existing TypeScript, Electron, Solid, Zod, Vitest and Playwright; no dependencies or schema migration.

**Spec:** `docs/superpowers/specs/2026-10-24-recovery-rehearsal-design.md`.

## Backend

- [x] Add failing tests in `tests/recovery-rehearsal.test.ts` for full/config-only/empty snapshots, tampering, wrong identity, authenticated invalid input, unchanged data, overlap and cancellation.
- [x] Implement `Vault.rehearseSnapshot(profileId, snapshotId): Promise<RecoveryRehearsalReport>` in `vault.ts`, using a read-only `StateStore` worker call and sanitized errors.
- [x] Add worker verification in `state-worker.ts`; count authenticated decoded contents and clear buffers. No filesystem operations in this path.
- [x] Verify focused tests; root runs the complete backend suite after integration.

## Interface and IPC

- [x] Extend the shared model with `RecoveryRehearsalReport` and strict `rehearseSnapshot` request.
- [x] Add a failing browser/Electron workflow check for a per-snapshot **Check recovery** control, honest coverage and unchanged files/history.
- [x] Extend `SnapshotPanel.tsx` and `App.tsx` with separate progress state, lifecycle invalidation and a concise report; do not disable Lock during a check.
- [x] In `main.ts`, start after queued mutations but leave Lock able to cancel the worker. Never return a result from a closed vault.

## Final review and verification

- [x] Review memory bounds, untrusted archive/configuration errors, late UI results, snapshot deletion during a check and partial-coverage copy.
- [x] Run typecheck, build, backend suite, browser UI checks and actual Electron workflows. Update documentation and screenshots, then commit locally.
