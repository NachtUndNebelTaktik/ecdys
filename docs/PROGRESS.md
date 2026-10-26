# Styg foundation progress

> Historical foundation ledger. Later increments implement browser lifecycle, additional recovery and Settings. Use the [current checked plan](PLAN-AUDIT.md) rather than treating the deferred items and test totals below as current status.

Plan: docs/superpowers/plans/2026-10-23-styg-foundation.md

Ruling: The first slice stores atomic configuration snapshots in encrypted SQLite BLOBs, as permitted by the blueprint schema. Browser-state snapshots are deferred until a quiesced browser capture is implemented; the UI must say configuration only.
Ruling: Route enforcement cannot be proven in the current executor (no capabilities, no provider credentials). Launches stay blocked, and a separate real Linux proof is delivered for an administrator-equipped host.
Ruling: Argon2id uses a 256 MiB initial setting with selectable higher memory cost; 4 GiB remains available rather than forced on machines without enough memory.
Pre-flight: Renderer DTOs share Zod schemas with storage; routing is a separate gate and cannot mark the vault or profile as route-ready.

Task 1: encrypted storage and snapshots implemented. RED: eight initial behavior tests failed against empty implementations. GREEN: all passed after implementation; strict schema merging and worker shutdown corrected from actual failures.
Task 2: desktop shell/UI implemented. Preview test initially failed with missing UI; passed after implementation. Real Electron end-to-end flow passes, including reopening persisted profiles. An exact-name test locator was corrected to allow its decorative arrow.
Task 3: launch gate, Linux preflight, proof-result evaluator and runnable local IPv4 laboratory supplied. Evaluator RED→GREEN confirmed. Actual privileged lab blocked: nft and required capabilities unavailable. Browser session lifecycle is explicitly not implemented.
Final review: independent fresh-context reviewer found no Critical/Important issues; Node minimum corrected to 22.18 for direct TypeScript imports in the lab. Atomic pin/prune failure reproduced by a database trigger and fixed with a transaction. Additional stored-corruption and edit/restore rollback checks pass.
Deferred validation: real privileged routing lab, provider tunnels, browser lifecycle, automatic inactivity lock and worker-failure integration tests, macOS/Windows.
Final regression: a name-only patch reset omitted fields because Zod 4 applies defaults inside optional schemas. A preservation/explicit-clear test reproduced this. Patch schemas now use fields without creation defaults.
Final verification: pnpm typecheck; pnpm test (21/21); pnpm build; pnpm test:ui (1/1); pnpm test:desktop (1/1) — all exit 0. Routing --run exits 2 on missing prerequisites, with no namespace changes.
Task 4: source and handoff prepared on feat/foundation; no remote, merge, publication or production deployment.
