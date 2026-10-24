# ecdys.app

A sovereign desktop browser workstation for security operations, crypto/Web3 and browser-based trading. Proxies, authenticated SOCKS5 switching and Monero remain essential requirements. Team collaboration and offline operation are built-in capabilities of the same station.

The first application foundation is implemented. It provides a real encrypted local configuration vault and workspace; it does not launch managed browsing sessions yet.

## Run

Requires Node.js 24, pnpm 11 and a desktop environment for normal interactive use.

    pnpm install
    pnpm dev

The vault lives under Electron's per-user application-data directory. ECDYS_DATA_DIR can select a different workspace directory. Back up the header, database and snapshots together while the vault is locked.

Electron downloads its platform binary on first use. In environments requiring an HTTP proxy, its downloader may need NODE_USE_ENV_PROXY=1. Do not disable TLS verification.

## Implemented

- Electron 45 shell with sandboxed renderer, context isolation and typed, origin-checked IPC.
- SQLCipher-compatible encrypted database and random master key wrapped using Argon2id.
- Explicit 1/2/4/8 GiB KDF selection, default 4 GiB; production derivation runs in a worker.
- Local profiles, revisions, search, tags, folder labels, protected-execution policy and route configuration.
- Encrypted proxy passwords omitted from public responses.
- Independently encrypted baseline/edit/manual/pre-restore configuration checkpoints, pins and twenty-unpinned retention.
- Independent configuration branches with copied history, pins and re-encrypted secret references.
- Manual lock and lock after fifteen minutes of system inactivity.
- Missing/empty-database refusal, interrupted-setup recovery, durable POSIX publication and recognized orphan cleanup.

## Implementation boundary

Checkpoints currently cover configuration only. Full browser-state recovery, native route enforcement, live VPN/proxy connections and SOCKS5 switching, protected browser storage, managed Chromium, fingerprints/WebRTC, Selenium, Monero/payments, licensing, teams and controlled updates remain required work. The UI identifies them as unavailable; browser launch stays blocked.

Local configuration operations work offline. Signed commercial offline entitlements are specified but not implemented. The foundation allows ten local profiles; there is no simulated activation.

The foundation has been exercised on Linux. Windows/macOS native verification and Windows durable directory publication remain release gates.

## Verify

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:ui

Unit database fixtures use a deliberately smaller injected test KDF. The real Electron desktop test uses the production worker at an explicitly selected 1 GiB, actual SQLCipher storage and the sandboxed preload bridge.

The UI test uses Electron's headless Ozone backend without disabling renderer sandboxing. It does not substitute browser-only storage.

## Specification and progress

- [Complete blueprint v4.0](BLUEPRINT-v4.0.md)
- [Original decisions and change ledger](CHANGE-LEDGER-v4.0.md)
- [Data and interface contracts](specs/DATA-CONTRACTS-v4.0.md)
- [Foundation implementation scope](docs/FOUNDATION-IMPLEMENTATION.md)
- [Build status and remaining gates](docs/BUILD-STATUS.md)
- [Documentation revision verification](VERIFICATION-v4.0.md)

The previously delivered blueprint ZIP remains an unchanged specification archive. This repository now also contains the application foundation.
