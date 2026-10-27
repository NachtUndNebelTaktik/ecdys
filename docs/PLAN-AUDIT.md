# Ecdys implementation audit — 2026-10-26

Audited application revision: `2dffb6d`, version `0.7.0`. This review compares the repository's scoped plans/designs and the original v3 blueprint with source, reachable controls and fresh tests. It does not equate a completed development increment with a completed v1 product feature.

The user's subsequent clarification makes code quality and functional completion the priority. Use the [per-control functional checklist](FUNCTIONALITY.md) alongside this audit: eight Settings entries still lack their underlying feature, and Storage is partial. Successful interface tests do not close those feature gates.

**Doctrine precedence:** the later [EcDys Design Doctrine](DESIGN-DOCTRINE.md) supersedes the original mandatory-account and core profile/API paywall assumptions. The milestone/story tables below remain a historical comparison with v3, not authorization to gate local core features. Optional remote services may add reach. Physical cryptographic segregation remains an unimplemented architectural requirement. [Current adoption boundaries](DOCTRINE-ADOPTION.md).

**Result:** the scoped increment implementation tasks below are present and pass their current regression checks. The full blueprint remains partially implemented. Normal browser launch, OS tunnel/route enforcement, fingerprint overrides, accounts, billing and cloud services are not delivered.

Statuses: **Implemented** means the stated bounded scope exists with executable evidence; **Partial** means only part of the full requirement exists; **Blocked** means an additional prerequisite prevents execution/acceptance; **Planned** means no working implementation of that feature was found. Historical test-first/review steps remain supported by their progress ledgers; passing tests today do not independently prove the order of historical development.

## Scoped plans checked against the current tree

| Plan / task groups | Verified implementation and evidence | Remaining boundary |
| --- | --- | --- |
| [Foundation](superpowers/plans/2026-10-23-styg-foundation.md), tasks 1–4 | Implemented: encrypted workspace, validated profile creation/edit, configuration snapshots/restore/pin/prune, desktop bridge and blocked-route guard. [Vault](../packages/desktop/src/vault.ts), [crypto](../packages/desktop/src/crypto.ts), [tests](../tests/vault.test.ts), [Electron flow](../tests/desktop.spec.ts). | This is not all of original M0. No signup, GnuPG, Monero payment or license issuance. |
| [Closed browser-state recovery](superpowers/plans/2026-10-23-browser-state-recovery.md), tasks 1–3 | Implemented on tested Linux path: bounded encrypted archives, private staging, rollback, migration and interrupted-operation recovery. [State store](../packages/desktop/src/state-store.ts), [worker](../packages/desktop/src/state-worker.ts), [archive tests](../tests/state-store.test.ts), [vault recovery tests](../tests/state-vault.test.ts). | 64 MiB / 4096 entries. OS-protected/cross-machine cookies, sessionStorage/tab history, power-loss and macOS/Windows acceptance remain unverified. |
| [Branches/previews](superpowers/plans/2026-10-23-branches-and-previews.md), tasks 1–3 | Implemented: read-only configuration diffs, revision checks, independent closed-file/history forks, configuration merges, promotion and journaled discard. [Branch manager](../packages/desktop/src/branches.ts), [tests](../tests/branches.test.ts). | No pixel/DOM comparison lab; merging does not merge browser files. |
| [Routing evidence](superpowers/plans/2026-10-23-routing-evidence.md), tasks 1–3 | Laboratory/evaluator implemented: eight IPv4/IPv6 protocol cases, fallback controls, three disconnect cycles, cleanup/error checks. [Evaluator](../packages/desktop/src/routing-proof.ts), [runner](../scripts/routing-proof.mjs), [fixture tests](../tests/routing-fixture.test.ts), [controller tests](../tests/routing-runner.test.ts). | **Blocked acceptance:** fresh preflight lacks nft, CAP_NET_ADMIN and CAP_SYS_ADMIN. Controller/loopback tests do not establish real OS isolation. |
| [Managed session core](superpowers/plans/2026-10-23-managed-session-core.md), tasks 1–3 | Internal Linux lifecycle implemented: private CDP pipes, process ownership/cleanup, profile leases, pre-launch/clean-close snapshots and real fixture storage recovery. [Sessions](../packages/desktop/src/browser/sessions.ts), [runtime](../packages/desktop/src/browser/chromium.ts), [tests](../tests/sessions.test.ts), [real-browser recovery](../tests/browser-recovery.test.ts). | **Blocked product use:** [default supervisor](../packages/desktop/src/routing.ts) always rejects. No production managed-browser bundle or verified route supervisor. |
| [VPN setup](superpowers/plans/2026-10-24-vpn-setup.md), steps 1–4 | Implemented: recoverable provider/relay/rotation settings, encrypted credentials, public catalogs/cache, migration, planner and setup UI. [Catalog](../packages/desktop/src/vpn/catalog.ts), [planner](../packages/desktop/src/vpn/rotation.ts), [tests](../tests/vpn-vault.test.ts). | Rotation is a saved policy and pure planner; no live scheduler, tunnel, connection/IP test or custom SOCKS5. |
| [Provider provisioning](superpowers/plans/2026-10-24-provider-provisioning.md), steps 1–4 | Implemented with synthetic protocol evidence: clients, X25519/encrypted registration, reuse/recovery/removal, cancellation and non-secret tunnel preview. [Coordinator](../packages/desktop/src/vpn/provider-setup.ts), [tests](../tests/provider-setup.test.ts), [Electron provider fixtures](../tests/provider-desktop.spec.ts). | Real provider account acceptance is unverified. Registration/peer ingress metadata is not a WireGuard handshake, exit-IP proof or OS route. |
| [Recovery Rehearsal](superpowers/plans/2026-10-24-recovery-rehearsal.md), backend/interface/review steps | Implemented: authenticated, read-only configuration/archive checks, decoded counts, sanitized results, cancellation and stale-result rejection. [Tests](../tests/recovery-rehearsal.test.ts), [UI checks](../tests/ui.spec.ts). | Does not launch a browser, extract files or establish cookie/browser/OS/routing compatibility. |
| [Native page archive design](superpowers/specs/2026-10-24-page-archive-design.md) | Capture/export engine implemented: owned HTTP(S) page, bounded MHTML, SHA-256, native chooser, exclusive private writes and lifecycle checks. [Capture](../packages/desktop/src/browser/page-archive.ts), [export](../packages/desktop/src/browser/archive-export.ts), [tests](../tests/page-archive.test.ts). | **Blocked product use:** active verified sessions unavailable. Offline reopening is separately blocked by executor file-URL policy. MHTML is not SingleFile HTML. |
| [Settings design](SETTINGS-DESIGN.md) | Implemented: all reference groups/rows, five non-sensitive preferences, restart persistence, local help/status and real lock/shortcuts. [Settings](../packages/renderer/src/SettingsPanel.tsx), [preferences](../packages/renderer/src/preferences.ts), [browser checks](../tests/settings.spec.ts), [Electron restart/lock](../tests/settings-desktop.spec.ts). | Service rows are explanations of unavailable integrations, not implemented account/payment/proxy/map/report/cloud services. |
| Rename/stability follow-ups | Implemented: Ecdys branding with legacy workspace/crypto identifiers retained; recheck-only provider action and dialog lifecycle fixes. [Main process](../packages/desktop/src/main.ts), [provider tests](../tests/provider-setup.test.ts), [handoffs](CURRENT-VERSION-PROGRESS.md). | Legacy `styg` data/IPC/KDF identifiers are deliberate compatibility, not a missed visible rename. |

## Settings checklist

Follow-up checked 2026-10-27 after base `c255517`: the [sharpening plan](superpowers/plans/2026-10-27-settings-sharpening.md) applies the user's supplied desktop HTML to the working settings screen. This UI revision does not change the original milestone/service acceptance gates below.

- [x] Environment, Account, Appearance, App and Help navigation and grouped reference layout.
- [x] Appearance/accent, density, reduced motion and optional status messages apply and persist.
- [x] Lock, platform/version/lock state, storage counts, help and implemented shortcuts.
- [x] Critical cleanup warnings remain visible with optional messages off; no account/secret data in UI preference storage.
- [x] Search, desktop rail, compact section chips, current state and the tighter visual treatments.
- [x] Six-colour palette with true Crimson first and saved Sage/Indigo compatibility.
- [x] Data controls resets only the five device preferences; search text is never persisted.
- [ ] Mindmap / visual workspace map.
- [ ] SOCKS5 configuration and enforced per-profile routing.
- [ ] Linked email/account service and subscription/license entitlements.
- [ ] Trocador and Monero service connections.
- [ ] Browsing-report collection, scheduling and export.
- [ ] Secure cloud storage/synchronization.

The unchecked services are intentionally labelled unavailable/off in the current UI. Their **rows** satisfy the scoped settings design; their **features** do not satisfy the full blueprint yet.

## Original milestone plan: M0–M22

| Milestone | Status | What is present / still required |
| --- | --- | --- |
| M0 Foundation + Monero signup | Partial | Electron, IPC, Argon2id and encrypted local DB exist. Signup, GnuPG, wallet RPC and licensing are absent. Source is grouped under packages, but per-package manifests and Turborepo are absent. |
| M1 Profiles + snapshots | Partial | Create/edit/search, separate browser folders and encrypted snapshots exist. Full profile deletion/archive, folders, fingerprint configuration/application and a managed browser bundle are absent. |
| M2 Restore + branching | Partial | Configuration/closed-file restore, rollback, text diffs and branches exist. Pixel/DOM diff and full browser-environment acceptance are absent. |
| M3 VPN + WebRTC | Partial | Provider settings/catalogs/registration/preview exist. OS tunnels, continuously enforced route locking, actual rotation and WebRTC protection/validation are absent. |
| M4 Health/diagnostics | Partial | Blocked-route and provider/setup diagnostics exist. The five-system health panel and diagnostic export do not. |
| M5 Fingerprint presets/validation | Planned | Timezone/language/screen values are stored settings; UA/Canvas/WebGL overrides, presets, validation suites/history and strict launch validation are absent. |
| M6 Sessions + WebDriver | Partial | Internal Linux lifecycle is fixture-tested. Production launches, browser distribution and authenticated WebDriver server are absent. |
| M7 Resource governor | Planned | No RAM/CPU monitor, budget/launch queue or idle suspension. |
| M8 Flight recorder | Planned | Session error/status objects are not persistent flight-recorder logs, filtering, retention or CSV export. |
| M9 Folders/tags/map | Partial | Tags and name/tag search exist. Nested folders, tag colours, saved compound filters, map and command palette are absent. |
| M10 Recipes | Planned | No recipe library, versioning or import/export. |
| M11 Environment lab | Planned | No split-screen comparison, pixel/DOM diff, synchronized actions or reproducible comparison tests. |
| M12 Website visibility inspector | Planned | No configured/measured endpoint inspection or drift tracking. |
| M13 Connection map | Planned | No shared-resource graph, separation actions or JSON export. |
| M14 Capsules | Planned | Snapshot encryption is not signed PGP capsule export/import. |
| M15 Disposable sessions | Planned | No disposable lifecycle, download quarantine or promotion. |
| M16 Bulk operations | Planned | No bulk selection/action queue/cancellation/reporting. |
| M17 Payments/subscriptions | Planned | No merchant/wallet integration, invoices, renewal scheduler, entitlements or grace-period handling. |
| M18 License transfer | Planned | No license ownership/one-time transfer workflow or support backend. |
| M19 Controlled updates | Planned | No update installer, compatibility scan, scheduled install or rollback distribution. |
| M20 Automation playground | Planned | No WebDriver API, Monaco/runtime sandbox, quotas or trial enforcement. |
| M21 Security/performance acceptance | Partial | Current regression/negative-path tests exist. Independent audit, cross-platform CI, 92% coverage measurement and 50/99-session resource benchmarks are not demonstrated. |
| M22 Public release | Planned | Source/docs/dev build exist. Signed/notarized installers, release pipeline/CDN, production payment page and support operations are absent. |

## Original 30 user stories

No complete v1 story is signed off by this audit. Partial delivery exists for **US-3, US-4, US-5, US-6, US-8, US-10 and US-12**, with the boundaries above. The other stories remain planned:

| Stories | Missing end-to-end capability |
| --- | --- |
| US-1–US-2 | Signup/account identity, tier checkout and confirmed payment activation. |
| US-7, US-9 | Enforced route-loss protection and validated per-profile WebRTC modes. |
| US-11 | Persistent privacy-filtered flight recorder. |
| US-13–US-15 | Workspace map/palette, bulk operations and resource monitoring/governor. |
| US-16–US-17 | Actual fingerprint presets/custom overrides and multi-suite validation. |
| US-18–US-23 | Comparison lab, signed capsules, connection map, measured-property inspector, recipes and disposables. |
| US-24–US-25 | Team invitations/RBAC and team audit log. |
| US-26–US-28 | Subscription management, license transfer and controlled updates. |
| US-29–US-30 | Authenticated Selenium/WebDriver API and automation playground/trial. |

The blueprint contains **30** numbered stories, despite its “25 Total” heading, and **23** numbered milestones, M0 through M22. Milestone numbers and UI placeholders must not be used as completion counts.

## Implemented corrections, rather than missing work

- Ecdys is the current product name. Retaining legacy storage, IPC and KDF identifiers prevents a rename from losing access to encrypted workspaces.
- Workspace key derivation defaults to 256 MiB; 64 MiB, 1 GiB and 4 GiB are selectable with an available-memory check. The original mandatory 4 GiB default was not retained.
- Snapshots use random per-snapshot AES-GCM data keys wrapped with purpose-specific master-derived keys. They do not store unwrapped timestamp-derived keys. Configuration/state envelopes are transactional encrypted-database BLOBs rather than a separate snapshot-file index.
- The database library runs in SQLCipher v4 compatibility mode. This is documented as SQLite3MultipleCiphers, not an independently audited SQLCipher distribution.
- IVPN setup uses its account-ID/session protocol; Mullvad relay weights are not presented as measured server load. Saved settings and registration are kept distinct from tunnel/routing verification.
- No frozen Chromium 120 managed-browser distribution was supplied. The Electron renderer's Chromium version is not proof that a supported isolated profile browser has been bundled.
- The built-in archive engine uses MHTML, with a documented 4 MiB bound. It is not the exact SingleFile HTML format or a session/capsule export.

## Settings follow-up verification — 2026-10-27

Later doctrine checkpoint: **260 backend tests passed / 3 existing skips, 42 browser checks, 3 actual Electron workflows, typecheck/build passed**. The 19 supplied reference-model checks passed separately. Snapshot reads no longer hold Lock/profile selection busy; unknown/failed/stale ownership paths, reset Undo and safe branch confirmations are exercised. [Current checkpoint and integration boundary](DOCTRINE-PROGRESS.md). GitHub `main` now contains a different browser/notepad implementation; this branch's tables describe this implementation and have not audited the other workstream.

Earlier Settings follow-up: `pnpm test`: **260 passed / 3 skipped** across 23 files. `pnpm test:ui`: **25 passed**, including search/empty results/Escape, current-value filtering, navigation/scroll tracking, compact heading visibility, old-colour compatibility, preference reset and the later startup-storage failure fix. `pnpm test:desktop`: **3 passed**, including real workspace lock and restart persistence. Typecheck/build passed. The skip conditions are unchanged; the opt-in maximum-size recovery check was last run separately on 2026-10-26. This UI change makes no new privileged-routing or offline-archive verification claim.

## Earlier verification — 2026-10-26

| Check | Observed result |
| --- | --- |
| `pnpm test` | 252 passed, 3 skipped; 23 test files. |
| `pnpm typecheck` | Passed. |
| `pnpm build` | Passed, including desktop/preload/worker/renderer and bundled asset notices. |
| `pnpm test:ui` | 18 passed. |
| `pnpm test:desktop` | 3 passed, including actual encrypted-workspace lock and preference restart persistence. |
| `STYG_LARGE_STATE_TEST=1 pnpm exec vitest run tests/state-large.test.ts` | 1 passed: fresh 64 MiB incompressible archive capture, restore, branch rebinding and hash checks. This closes the default opt-in skip for this audit only. |
| `node scripts/routing-preflight.mjs` | Exit 2, blocked: nft, CAP_NET_ADMIN and CAP_SYS_ADMIN unavailable. No route/firewall changes made. |

The default three skips are maximum-size recovery (separately passed above), privileged routing and offline MHTML reopening. The latter two remain unverified here; no skip is recorded as a pass. Provider traffic in tests uses synthetic responses; browser recovery/capture uses local fixtures. Live provider registration and production browser-routing acceptance were not attempted.

## Next dependency gates

1. Implement the trusted per-profile Linux routing supervisor and provider tunnel/DNS/IPv6 lifecycle behind the existing blocked gate.
2. Verify the privileged namespace/firewall proof and real provider path on an appropriately equipped host, including usable controls and disconnect/fallback failure cases. A lab result alone still does not authorize launches.
3. Bundle a supported managed browser and enable a minimal production launch only after routing integration is verified; then implement and measure actual fingerprint controls before automation and advanced browser tools.

Keep accounts/payments/cloud/team work explicitly pending until their backends and acceptance tests exist. No new service connection, host-policy change, push or remote merge was made for this audit.
