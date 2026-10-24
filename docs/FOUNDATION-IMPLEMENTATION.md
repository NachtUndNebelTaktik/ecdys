# ecdys — Desktop foundation implementation

Source: BLUEPRINT-v4.0.md and specs/DATA-CONTRACTS-v4.0.md.

Goal: implement a runnable desktop foundation with a real encrypted local vault, profile/configuration checkpoints, typed safe IPC, and an operational workspace. This is the first vertical slice of M0–M2, not completion of M0 or the full application.

1. Establish pnpm workspaces, supported Electron/Solid builds, and native SQLCipher/Argon2 dependencies.
2. Test and implement input contracts, strict validation admission, route configuration, and credential-reference boundaries.
3. Test and implement vault creation/unlock/lock, random master-key wrapping, SQLCipher persistence, transactionally recoverable configuration snapshots, revision checks, profile limits, and branch/restore.
4. Wire named IPC to a sandboxed local-only renderer. Browsing launch remains blocked until native enforcement, protected browser storage, and browser integration exist.
5. Build the real workspace UI: vault setup, profiles/search, profile and proxy editor, snapshots/diffs/restore, branches, settings, and accurate integration status.
6. Verify tests, typechecking, production build, renderer interaction, and desktop startup where the environment permits it.

Tests must cover wrong passphrases, encrypted-at-rest profile values, restart persistence, stale revisions, snapshot/edit/restore consistency, branch independence, profile limits, private credentials, invalid inputs, and unauthorized IPC origins.

Implementation status must distinguish configuration checkpoints from full browser-state snapshots. Team/Monero/provider/native browsing integration remains visible and tracked. No payment credentials, signing key, or wallet RPC admin secret belongs in the desktop.

Work is on feat/foundation in a new repository; there was no pre-existing code checkout to isolate or preserve. The previously delivered blueprint ZIP remains an unchanged specification artifact.
