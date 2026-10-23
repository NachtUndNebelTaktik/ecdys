# Styg recovery preview — 2026-10-23

Implemented: encrypted workspace, Argon2id worker, SQLCipher-compatible database, configuration CRUD/search, separate profile browser directories, automatic configuration snapshots, manual closed-directory snapshots, authenticated wrapped snapshot keys, pin/prune, full restore rollback, durable interrupted-restore journal, and Electron controls with accurate snapshot content labels.

Validated on Linux:
- Backend tests cover encrypted persistence, original v1 migration, binary/empty-directory recovery, tamper and cross-profile rejection, unsafe/colliding paths, active lock markers, symlinks/hardlinks, size/entry limits, database write rollback, pin/prune, concurrent edit rejection, worker cancellation on lock, and three simulated interrupted-restore states.
- The maximum-size opt-in test round-trips 64 MiB of incompressible data and checks its hash.
- TypeScript, production Electron/preload/worker/renderer build, browser-preview bridge check, and real Electron create/edit/manual-state-save/full-restore/config-only-restore/lock/wrong-passphrase/restart/reopen flow.

Browser state tests use regular-file fixtures, not actual Chromium cookies/IndexedDB. Same-account, compatible-build cookie recovery remains unverified. Working directories/staging are plaintext local files; saved archives and the database are encrypted. Windows/macOS behavior and real power-loss recovery are not validated. See SNAPSHOTS.md.

Networked browser launches remain hard-blocked. The Linux routing laboratory still needs nft and network-administration capabilities; VPN integration needs provider credentials. No unsafe launch bypass is supplied.

Not included: managed browser-session launch/close, fingerprint injection/validation, GnuPG/capsules, WebDriver, payments/licensing, teams, updates and release installers. No production readiness, independent cryptographic audit or state-level protection is claimed.
