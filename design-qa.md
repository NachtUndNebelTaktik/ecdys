# EcDys doctrine checkpoint review — 2026-10-27

The [Design Doctrine](docs/DESIGN-DOCTRINE.md) governs this review. The earlier settings HTML still informs navigation and grouping. The supplied dark/light React reference is preserved in `design/reference/doctrine`; it is not the desktop runtime or evidence that its tools have been implemented there.

## Current rendered evidence

- `docs/images/settings-overview.png`, `settings-app.png`, `settings-help.png`: fresh dark/Crimson browser captures at a 1440 × 1000 viewport.
- `docs/images/settings-compact.png`: fresh compact desktop capture at an 860 × 800 viewport, with search and section chips.
- `docs/images/settings-light.png`, `settings-electron.png`: fresh actual Linux Electron captures, including persisted Light/Violet preferences after restart and subsequent Dark/Crimson selection. The headless display constrains window height.
- `docs/images/branch-discard.png`: actual Electron confirmation identifying the branch and explaining local deletion, retained external backups and the absence of Undo/secure erasure.
- Workspace, branch, merge, VPN setup and recovery-check images were refreshed from the actual Electron workflow.

The settings overview, compact view, light view and branch confirmation were visually inspected. Labels and values remain legible, controls align, long branch IDs wrap, and the branch target/consequences are visible. Compact navigation does not cover its selected heading; this is also checked by the browser suite. At the bottom of a scrollable overview, adjacent groups can remain visible because the content bounds further scrolling.

## Changes and practical limits

- Settings cards/state panels have flat 4px corners without shadows. Brand glow and modal backdrop blur were removed. Search/navigation, locally bundled outline icons, monospaced values and Crimson remain.
- A persistent vault indicator reports observed state. Browser preview is unavailable, pending/failed status is unknown, and unread counts are unknown rather than zero. Encrypted database/snapshots and plaintext browser working files are labelled separately.
- Snapshot history clears before selection changes. Late, wrong-profile and post-lock results cannot attach themselves to the current profile. Initial history reads leave Lock and profile selection available.
- Branch operations use native modal dialogs. Merge/promotion/discard start on Cancel; create starts on the name field. Keyboard navigation stays contained. A running discard cannot be dismissed mid-operation.
- Device reset offers Undo until another preference change or Settings closes. Provider requests identify the recipient/host-network boundary; unregistered-key removal is distinguished from provider registration removal. Page archives disclose plaintext content and local file output.
- Unavailable services remain unavailable on this branch. Fake email, entitlement, unlocked-vault and report-cadence values are not used. Normal profile launches remain blocked.

Application-wide radius/icon/spacing normalization, systematic error wording, provenance/staleness for every value, operator-controlled panels and Undo for other cheap edits remain unfinished. This bounded review is not a claim that every screen passes the doctrine. The separate browser/notepad workstream on GitHub `main` is not covered by these captures or tests.

## Executable evidence

**42 browser checks passed**, including unknown/failing/late history paths, lock and selection during initial reads, reset Undo and invalidation, safe branch focus/keyboard/cancellation, all settings details, persistence, search/navigation and unavailable storage handling.

**3 actual Linux Electron workflows passed**, including encrypted workspace recovery/branches, synthetic provider requests, restart preference persistence and workspace locking. The branch workflow additionally checked safe initial discard focus against the actual desktop runtime. The Settings Electron workflow reported no console/page errors. Typecheck and production build passed; the default backend suite passed **260 tests with 3 existing skips**.

The supplied reference models passed **19 separate Node checks**. They establish properties of that prototype only. All 13 reference file hashes and the canonical doctrine match the preserved source. Privileged route proof, offline MHTML reopening and cross-platform acceptance remain unverified as described in the [checkpoint handoff](docs/DOCTRINE-PROGRESS.md).

This is a work-in-progress source checkpoint, not a release. Parallel implementations have not been integrated.
