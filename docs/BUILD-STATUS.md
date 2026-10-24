# ecdys.app — Build status

## Current slice

The repository contains a runnable Electron/Solid application foundation with actual encrypted local profile configuration and recoverable configuration checkpoints.

This is partial M0–M2 work. No complete milestone or production release is claimed. All thirty requirements and the full blueprint remain in force.

| Area | Status |
| --- | --- |
| Desktop/IPC | Implemented and exercised in real Electron; sandbox and context isolation enabled, Node integration disabled. |
| Configuration vault | Argon2 worker, wrapped random master, SQLCipher-compatible storage and lock/unlock implemented. |
| Profile configuration | CRUD, bounded input, revision conflicts, local allowance, tags/folder labels, protected policy, proxy/VPN configuration. |
| Proxy credentials | Encrypted storage and response redaction implemented. Live connection/testing/switching pending. |
| Configuration recovery | Baseline/edit/manual/pre-restore checkpoints, independent keys, pins, retention, branches, restore integrity. |
| Failure/restart handling | Missing/empty DB refusal, recoverable initialization, durable POSIX directory publication, orphan reconciliation. |
| Browser state | Not implemented. No cookies/tabs/browser storage are claimed in current checkpoints. |
| Native networking/storage | Not implemented. Browsing stays blocked. |
| SOCKS5 live switching / Monero | Required integrations, not implemented. |
| Fingerprints / automation / lab / capsules / disposables / recipes / full maps | Pending and retained in blueprint. |
| Licensing / team feature / controlled updates | Pending; local configuration works offline. |
| Distribution | Development build only; signed installers and cross-platform release verification pending. |

## Verification

Final verified commands:

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:ui

Results: typecheck passed; 27 core tests passed; renderer/main/preload/worker production builds passed; one real Electron end-to-end test passed.

The desktop scenario creates a vault, configures authenticated SOCKS5, edits a profile, restores a checkpoint, creates a branch, locks, rejects a wrong passphrase and reopens persisted profiles. It checks actual WebContents sandbox/context-isolation/Node settings.

Database unit fixtures use a 16 MiB injected KDF for repeated tests. This injection is not exposed through IPC. The desktop flow uses the real worker at an explicit 1 GiB; the default production setting remains 4 GiB.

Coverage includes strict required-pass validation, encrypted at-rest profile values, revision/limit races, secret redaction, tampering, inherited pins/retention, missing/truncated DB preservation, failed initialization, directory-sync failure, safe orphan reconciliation, sanitized IPC and idle policy.

## Review corrections

A read-only reviewer found four Important storage issues. All were corrected through six failure/restart regressions: missing/empty DB replacement, premature handle publication, snapshot publication/cleanup, and branch retention.

The desktop test also caught a short-viewport sidebar overflow that made Lock unreachable; the sidebar now scrolls. Inherited snapshot pins received a separate regression and correction.

The author reran the complete suite after corrections. No second independent approval or cross-platform security certification is implied.

## Remaining gates

Native routing and protected browser storage remain prerequisites for browsing. Saving a proxy does not prove a network connection. Windows directory publication durability requires native support and currently surfaces a storage warning. POSIX fsync tests do not prove every power-loss or storage-controller scenario.

Blueprint gates G1–G6, production account/payment/signing infrastructure, browser compatibility, native platform builds, independent security assessment and real trading workload benchmarks remain required.
