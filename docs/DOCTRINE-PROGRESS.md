# EcDys doctrine checkpoint — 2026-10-27

Base: `2b12441`. Branch: `feat/doctrine-boundaries`. This is an unfinished-product source checkpoint, not a release or installer. The user authorized pushing this development branch after previously keeping this workstream local.

## Delivered in this branch

- Preserved all 13 files from the supplied design archive, with per-file/archive hash provenance. Copied the doctrine verbatim as governing policy. The React reference remains outside the Electron/Solid build and contributes no runtime dependency or browser-launch bypass.
- Kept the observed vault boundary visible. Unknown status does not imply an empty workspace; browser-only preview reports unavailable. Unread/failed profile and snapshot counts show unknown and offer retry.
- Cleared history before changing profiles and rejected late, locked-workspace or wrong-profile results. Initial history loading now runs independently of the mutation busy state, keeping Lock and profile selection usable.
- Added native branch confirmation, contained keyboard navigation and safe initial focus. Deletion identifies the profile by name/ID and states the local data lost, absent Undo, remaining external backups and lack of secure erasure.
- Added device-preference reset Undo. It restores the previous five values through the ordinary persistence path; closing Settings or changing another preference invalidates it.
- Disclosed host/provider requests and local plaintext archive export at their actions. Local unregistered-key deletion is named separately from removing a provider registration. Removed brand glow, backdrop blur and card shadows without replacing the framework or workspace format.

The two new initial-history regressions were observed failing because Lock and profile selection remained disabled. Separating the read from the mutation busy state made them pass. The earlier Undo regressions were also observed failing before implementation and now pass. Profile-list failure/retry, late-result ownership, focus, cancellation and busy-operation dismissal have executable browser coverage.

## Verification

| Check | Observed result |
| --- | --- |
| `pnpm typecheck` | Passed. |
| `pnpm build` | Passed for main, preload, workers and renderer. |
| `pnpm test` | 260 passed / 3 existing skips, 23 files. |
| `pnpm test:ui` | 42 passed. |
| `pnpm native:electron`, then `pnpm test:desktop` | Rebuild and all 3 actual Linux Electron workflows passed. |
| Supplied reference model tests | 19 passed separately; not counted as desktop product acceptance. |
| Reference provenance | All 13 file hashes and canonical doctrine match the preserved source. |
| `pnpm routing:preflight` | Blocked, exit 2: nft, CAP_NET_ADMIN and CAP_SYS_ADMIN absent. |

The three backend skips remain the opt-in maximum-size recovery case, privileged routing proof and policy-blocked offline MHTML reopening. Maximum-size recovery last passed separately on 2026-10-26. Real provider acceptance, Windows/macOS acceptance and physical key segregation are not established by these checks.

Native dependencies are currently rebuilt for Electron. Run `pnpm native:node` before another Node/Vitest backend run, then `pnpm native:electron` before Electron testing. UI and desktop runners both use `test-results`; run them sequentially when retaining captures.

## Parallel workstream and next steps

GitHub `main` was refreshed during this checkpoint and is at `7eaee05`: it contains a separate implementation with temporary/direct browsing, an encrypted notepad, saved files and its own revised specifications. It changes runtime/storage/contracts across the repository. Those changes are preserved on `main`; this branch does not replace, merge or claim to verify them.

1. Compare the two storage/IPC/browser architectures and write an integration map. Preserve each implementation's tested behaviour and data compatibility; do not copy entire conflicting trees over one another.
2. Port the observed-state, consent, Undo and destructive-action contracts to the selected common runtime, with acceptance checks against that runtime. Keep intentional Direct browsing distinct from any claim of verified VPN isolation.
3. Continue the functional checklist and routing acceptance on an equipped host. Missing services, uniform visual normalization and physically segregated cryptographic trust remain separate work, not completed by source publication.

See [functional acceptance](FUNCTIONALITY.md), [adoption boundaries](DOCTRINE-ADOPTION.md) and [visual/interaction review](../design-qa.md). This is a resumable checkpoint; the application is not finished.
