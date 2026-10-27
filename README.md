# ecdys

Product name: **ecdys**. Domain: **ecdys.app**.

A sovereign desktop browser workstation for security operations, crypto/Web3 and browser-based trading. Proxies, authenticated SOCKS5 switching and Monero remain essential requirements. Team collaboration and offline operation are built-in capabilities of the same station.

The application now includes a real encrypted local configuration vault and a first temporary Linux browser runtime. Temporary sessions navigate actual pages using explicitly selected Direct, SOCKS5 or HTTP CONNECT routing; their site data is discarded on close. A failed proxy never falls back to Direct. Persistent managed sessions remain in development.

## Run

This developer checkout requires Node.js 24, pnpm 11 and a desktop environment for normal interactive use. Packaged releases will include the application runtime; signed end-user installers are not shipped yet.

    pnpm install
    pnpm dev

The vault lives under Electron's per-user application-data directory. ECDYS_DATA_DIR can select a different workspace directory. Back up the header, database, snapshots and notepad-files directory together while the vault is locked.

Electron downloads its platform binary on first use. In environments requiring an HTTP proxy, its downloader may need NODE_USE_ENV_PROXY=1. Do not disable TLS verification.

## Implemented

- Electron 45 shell with sandboxed renderer, context isolation and typed, origin-checked IPC.
- SQLCipher-compatible encrypted database and random master key wrapped using Argon2id.
- Explicit 1/2/4/8 GiB KDF selection, default 4 GiB; production derivation runs in a worker.
- Local profiles, revisions, search, tags, folder labels, protected-execution policy and route configuration.
- Temporary Linux Chromium browsing with private network/PID/mount namespaces, an explicit Direct/proxy broker, live viewport, navigation, mouse/keyboard input and WebSockets. Direct uses the device's network identity and DNS.
- Rounded Browser workspace with interactive local tabs, profile search, keyboard tab navigation and local workspace shortcuts.
- Light, Dark, System, Night and Crimson appearance profiles; System follows desktop changes, Night applies an adjustable warm filter, Crimson uses night-black surfaces and crimson accents across the app.
- Live shared controls for accent, corners, density, browser text size, bookmarks, sidebar and transitions, plus a Settings preview.
- Remembered profile sorting and grid/list layouts; appearance reset preserves those organization choices.
- OSINT workspace with a draggable mindmap, typed nodes, source notes, labeled connections, zoom/pan/fit, keyboard movement and undo.
- An empty-by-default OSINT website tool shelf with manual registration, categories, search and pins; links open through the active temporary session using its selected route. Existing saved tools are preserved.
- Research autosave inside the encrypted vault, revision conflict protection and recovery after reload/lock. No automatic external tool queries.
- Encrypted notepad beneath the OSINT workspace, with autosaved text and encrypted saved files. Native dialogs import files and explicitly export decrypted copies; originals stay in place.
- Pro cloud allowance defined as 1 GB for notes and files. Cloud transport and paid entitlements remain unconnected; the current notepad works locally and offline.
- Encrypted proxy passwords omitted from public responses.
- Encrypted named proxy pools, URI/JSON import previews and duplicate removal.
- Real authenticated SOCKS5 and HTTP CONNECT tunnel tests, HTTPS certificate verification, bounded deadlines and lock cancellation.
- Revision-checked assignment and rotation of saved proxy routes, with per-profile outcomes and pre-change checkpoints.
- Transactional upgrades of existing vaults to the proxy-library and encrypted research schemas.
- Independently encrypted baseline/edit/manual/pre-restore configuration checkpoints, pins and twenty-unpinned retention.
- Independent configuration branches with copied history, pins and re-encrypted secret references.
- Manual lock and lock after fifteen minutes of system inactivity.
- Missing/empty-database refusal, interrupted-setup recovery, durable POSIX publication and recognized orphan cleanup.

## Implementation boundary

Checkpoints currently cover configuration only. Full browser-state recovery, cross-platform route enforcement, VPN integration, switching live browser traffic, protected persistent browser storage, bundled Chromium, fingerprints/WebRTC, Selenium, Monero/payments, licensing, teams and controlled updates remain required work. The Revision 2 native tool registry/executor, manifest/catalogue importers, dockable LayoutEngine and minimal mode are specified, not implemented. Proxy tunnel diagnostics and saved-route switching are implemented; a successful diagnostic does not prove public IP identity or native containment. Persistent profile launch stays blocked; the separately acknowledged temporary mode is available on supported Linux systems.

Local configuration operations work offline. Signed commercial offline entitlements are specified but not implemented. The foundation allows ten local profiles; there is no simulated activation.

The foundation has been exercised on Linux. Windows/macOS native verification and Windows durable directory publication remain release gates.

Temporary browsing requires Linux user/network namespaces, bubblewrap, util-linux prlimit, system Chromium 156 at the supported Debian path, and disabled swap. It currently supports one Standard session, no downloads or persistent site-state recovery, and a streamed development viewport. See [browser runtime and limitations](docs/BROWSER-RUNTIME.md).

## Verify

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:ui

Unit database fixtures use a deliberately smaller injected test KDF. The real Electron desktop test uses the production worker at an explicitly selected 1 GiB, actual SQLCipher storage and the sandboxed preload bridge.

The UI test uses Electron's headless Ozone backend without disabling renderer sandboxing. It does not substitute browser-only storage.

## Specification and progress

- [Consolidated master spec — Tooling Revision 2](MASTER-SPEC-REVISION-2.md)
- [Original-plan continuity audit](docs/CONTINUITY-AUDIT-2026-10-24.md)
- [Revision 2 changes and implementation boundaries](docs/REVISION-2-VERIFICATION.md)
- [Tooling platform capability matrix — Gate 1](docs/TOOLING-CAPABILITY-MATRIX.md)
- [Detailed browser blueprint v4.0](BLUEPRINT-v4.0.md)
- [Original decisions and change ledger](CHANGE-LEDGER-v4.0.md)
- [Data and interface contracts](specs/DATA-CONTRACTS-v4.0.md)
- [Foundation implementation scope](docs/FOUNDATION-IMPLEMENTATION.md)
- [Proxy pool operations and diagnostics](docs/ROUTE-MANAGEMENT.md)
- [Browser appearance and workspace controls](docs/BROWSER-APPEARANCE.md)
- [Temporary browser runtime](docs/BROWSER-RUNTIME.md)
- [OSINT mindmap and tool library](docs/OSINT-WORKSPACE.md)
- [Encrypted notepad, files and Pro cloud requirement](docs/ENCRYPTED-NOTEPAD.md)
- [GitHub repository setup](docs/GITHUB.md)
- [Build status and remaining gates](docs/BUILD-STATUS.md)
- [Documentation revision verification](VERIFICATION-v4.0.md)

Revision 2 incorporates the supplied shared conversation and supersedes its bundled-tool and mandatory-proxy assumptions. The original browser blueprint, contracts, change ledger and delivered ZIP remain intact as detailed references; the new master identifies the explicit revisions. This repository also contains the application foundation.
