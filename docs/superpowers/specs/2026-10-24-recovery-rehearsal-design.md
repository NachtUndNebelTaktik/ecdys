# Ecdys Recovery Rehearsal

The user delegated choosing and adding a useful built-in tool. This small addition checks a saved snapshot before the user needs to restore it, using the existing encrypted snapshot formats and browser-state worker.

Approaches considered: restoring into a temporary folder exercises disk writes but introduces plaintext copies and cleanup risks; reusing the configuration preview misses the browser archive; authenticating and decoding both envelopes in the existing bounded worker checks saved content without writing files. The last approach is the implementation choice.

From each snapshot, **Check recovery** runs a local, read-only rehearsal. A successful report identifies the profile/snapshot, completion time, configuration-only versus configuration-and-browser-state coverage, and decoded file/directory/byte counts. It returns no settings, filenames, page contents or secrets. UI text states that the check authenticates and reads saved contents; it does not launch a browser, test protected cookies, establish browser compatibility or verify routing. Configuration-only snapshots are clearly labeled as containing no browser files.

The worker must authenticate identity, validate configuration and archive paths/limits, wipe decoded buffers on completion, and sanitize errors. No capture, staging, restore or browser-directory creation is permitted. One rehearsal per workspace at a time bounds memory. Lock cancels the worker promptly, and late completions cannot publish success. UI progress is separate from mutation busy state so Lock stays available; reports disappear on profile changes or lock. No schema change or new dependency is needed.

Shared contract: `rehearseSnapshot` accepts strict UUID `id` and `snapshotId`. `Vault.rehearseSnapshot(profileId, snapshotId)` returns `Promise<RecoveryRehearsalReport>`, containing `profileId`, `snapshotId`, `checkedAt`, `coverage` (`configuration_only` or `configuration_and_browser_state`), `fileCount`, `directoryCount`, `stateBytes`, and nullable `browserVersion`.
