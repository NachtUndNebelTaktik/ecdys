# Branches and previews progress
Plan: docs/superpowers/plans/2026-10-23-branches-and-previews.md
Base: dfbdb54
Ruling: Merge touches environment fields only; parent name, tags and browser files remain unchanged. No state merge is implied.
Ruling: The new fork point is pinned in addition to cloned retained history, so copying history does not immediately prune the parent's oldest retained snapshot.
Ruling: Fork reservations are hidden, encrypted-database-backed profiles with a creation journal; startup removes incomplete forks or finishes activated directory swaps. Discard is separately journaled and requires child branches to be promoted/discarded first.

Implemented: schema v3 transactional migration; configuration-only previews/diffs; revisions on restore and lifecycle confirmations; re-encrypted retained history and pinned fork point; independent current files; merge/promotion/discard; validated Electron IPC and dialogs.

Verification before final gate: 21 focused branch/maximum-size tests passed. Expanded real Electron create/edit/restore/fork/merge/promote/discard/reopen flow passed. Full final verification recorded below after completion.

Independent read-only review found one durability issue: new profile directory entries were not synced in their containing directory before branch publication. Fixed by syncing each newly created directory and its parent, and syncing profiles after failed-creation cleanup before journal deletion. Focused review accepted the fix; no remaining blocker reported. This is source review plus simulated recovery tests, not a real power-loss validation.

Final gate passed on Linux: `STYG_LARGE_STATE_TEST=1 pnpm test` (71 tests in 6 files), `pnpm typecheck`, `pnpm build`, `pnpm test:ui` (1 test), and `pnpm test:desktop` (1 real Electron workflow). Routing preflight remains blocked as expected: nft, CAP_NET_ADMIN and CAP_SYS_ADMIN unavailable. Networked launches remain blocked. Version 0.3.0 and current screenshots/docs saved.
