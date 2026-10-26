# Styg Foundation Implementation Plan

> Checked 2026-10-26 against application revision `2dffb6d`: The scoped foundation code tasks are implemented. This does not complete original milestone M0: signup, GnuPG, payments and licensing are still pending. See the [implementation audit](../../PLAN-AUDIT.md).

> Implement task-by-task in this session with test-first checks. User has authorized execution.

**Goal:** Deliver an executable Styg desktop foundation with encrypted profile recovery and a Linux routing proof.

**Architecture:** Electron owns storage, keys, and processes. Solid consumes a narrow typed context bridge. SQLCipher transactions couple edits and snapshots. Routing is a separate fail-closed boundary.

**Tech Stack:** TypeScript, Electron, Solid, Vite, SQLCipher-compatible SQLite, Argon2id, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-10-23-styg-foundation.md

## Global Constraints
- Product name: Styg. No anonymity scores or unsupported security guarantees.
- No merchant secrets, payment integrations, or real VPN credentials.
- Never launch a networked browser without verified route enforcement.
- Profile data directory isolation is not an OS security boundary.

## Review Focus
- Wrong passphrase and damaged vault metadata must not overwrite an existing workspace.
- Tampered encrypted snapshots must fail without modifying the profile.
- Invalid profile IDs and inputs must never select arbitrary filesystem paths.
- Snapshot pruning must preserve pinned snapshots; restore must preserve pre-restore state.
- Missing route enforcement must block launches and remain visible in the UI.

## Task 1 — Encrypted workspace and configuration recovery
Files: packages/shared/src/model.ts; packages/desktop/src/{crypto,vault}.ts; tests/vault.test.ts.
Interfaces: Vault.create/open(root,passphrase,params), list/create/update/snapshots/restore/pin/close. Public profile DTOs contain no keys.
- [x] Write and run failing integration tests against temporary real encrypted databases, wrong passphrases, edits/restores, tamper rejection, limits and pinning.
- [x] Implement worker Argon2id, encrypted SQLCipher storage, transaction-bound configuration snapshots and validated input.
- [x] Run tests and record result.

## Task 2 — Desktop and UI
Files: packages/desktop/src/{main,preload}.ts; packages/renderer/src/{App,index,style}.tsx/css; Electron/Vite configs; tests/ui.spec.ts.
Interfaces: window.styg.invoke accepts a discriminated request, returns a typed result. Renderer has no Node access.
- [x] Add failing browser UI smoke flow for bridge-unavailable state and accessible forms.
- [x] Build a desktop shell, unlock/create forms, profile editor, timeline/restore, diagnostics, and lock.
- [x] Run typecheck/build and UI smoke tests; attempt Electron launch when native runtime is available.

## Task 3 — Routing proof and lifecycle gate
Files: packages/desktop/src/routing.ts; scripts/routing-{preflight,proof}.mjs; tests/routing.test.ts; docs/ROUTING.md.
Interfaces: route preflight returns structured blocked/ready diagnostics; unverified route launches throw. Proof runs only in isolated namespaces supplied by an administrator.
- [x] Add failing gate and proof-result tests.
- [x] Implement fail-closed gate, capability preflight and independent-route/disconnect proof runner.
- [x] Run unit tests and preflight; record real routing as blocked if privileges/credentials are unavailable.

## Task 4 — Delivery verification
Files: README.md; docs/STATUS.md; docs/PROGRESS.md.
- [x] Run complete tests/typecheck/build/UI checks; review the boundary and document limitations.
- [x] Document native module ABI switching and start commands; commit the foundation branch locally.
