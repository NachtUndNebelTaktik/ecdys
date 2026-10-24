# Managed session core

Styg 0.4 adds internal browser lifecycle and storage recovery machinery. **Normal app launches remain blocked.** The product supervisor rejects readiness before a snapshot or process is created. No UI setting, environment switch or report can enable it. A real OS route supervisor, provider tunnels and browser distribution are still required.

## Lifecycle and ownership

The trusted main process owns a session coordinator. Its supervisor interface performs route authorization and creates a contained browser handle; the supplied product implementation always rejects. Only tests supply a local-fixture supervisor. IPC accepts profile IDs for `launch` and `closeSession`; `sessions` lists in-memory status metadata. It accepts no executable path, flags, URL, authorization override or CDP command.

The Linux process runtime controls Chromium through inherited DevTools pipes. It opens no debugging listener and never adds `--no-sandbox`. It waits for Browser.getVersion, bounds pending messages/frame size/timeouts, and rejects protocol failures. Chromium runs in an owned process group. Shutdown tries Browser.close, then bounded TERM/KILL escalation. Group checks exclude non-running zombies. Exit is reported only after no live group members remain; forced cleanup is distinguished from clean exit.

This is lifecycle ownership for cooperative Chromium children, not a malicious-process security boundary. A child can leave a process group; cgroup/job-object supervision, application SIGKILL/host-crash orphan cleanup and provider network containment are not implemented. macOS/Windows process containment is pending.

The coordinator acquires an exclusive profile lease before saving a full **pre_launch** snapshot. The lease covers startup, browser lifetime, process cleanup and final capture. Edit, manual capture, restore, fork, merge/discard and direct vault lock refuse conflicting ownership. Duplicate launches are rejected. A failed pre-launch archive prevents launch.

A clean exit saves a full **auto_close** snapshot, including the measured browser version. A crash or forced exit preserves working files and the pre-launch recovery point, without claiming a successful close snapshot. Snapshot errors after verified process stop are reported and release ownership. If process cleanup cannot be verified, ownership remains held; locking/quitting is refused rather than racing browser writes. Startup failures that still own processes carry that handle back to the coordinator.

Electron manual/idle locking and ordinary quit drain queued operations and managed sessions before clearing the vault key. The renderer clears profile data after lock. A snapshot failure with stopped processes permits locking and reports incomplete snapshots. Session status is currently in memory, not a durable flight recorder.

## Singleton locks and retry

After readiness, and on startup failure while the child is still alive, the runtime observes known singleton symlinks only if SingletonLock names its own hostname/PID. It records inode, device, ctime and link targets. After group quiescence it verifies the profile directory and markers again, unlinks only unchanged observed markers, and syncs the directory. Unknown, replaced or unobserved markers are preserved for review. It never follows a socket/cookie symlink to delete its target.

A replaced marker keeps cleanup failed and the profile owned. After an operator resolves that conflict, close can retry verification. Successful group quiescence is remembered, so retrying marker cleanup does not re-signal a later reused group. Extremely early startup death before lock ownership is observed can still leave unknown markers; preserve them and inspect the directory before attempting recovery.

External programs do not respect Styg's in-memory leases. Do not run another browser against a managed directory. The working files and staging directories remain ordinary local files, protected by OS permissions/disk encryption; they are not encrypted by locking Styg.

## What was actually tested

The real-browser integration uses Debian Chromium **154.0.8037.57**, fresh temporary data, and a loopback-only fixture website. It verifies persistent HttpOnly cookie transmission, localStorage and IndexedDB values; saves a clean close snapshot; changes the values; kills Chromium; restores the original encrypted snapshot; and relaunches the same build/account to verify all original values.

The constrained executor's test wrapper uses headless mode, `--no-sandbox` and `--password-store=basic`. Those flags are confined to test fixtures and never supplied by product code. This proves the tested basic-store recovery path, not OS key-store portability, cross-machine cookies, tab/sessionStorage history, arbitrary browser versions, browser fingerprinting or network isolation. No production browser binary is bundled by this increment.

```sh
pnpm test tests/cdp-pipe.test.ts tests/chromium.test.ts tests/sessions.test.ts tests/browser-recovery.test.ts
```

Tests expect Linux and `/usr/bin/chromium`; `STYG_TEST_CHROMIUM` selects the test executable only. Failure fixtures exercise actual child processes, unresponsive shutdown, surviving group descendants, startup/protocol errors and lock ownership conflicts. No privileged routing proof is supplied by these tests; see [routing limits](ROUTING.md).

Snapshot encryption remains unchanged (workspace metadata v1). Session triggers use the existing text column. VPN setup in 0.5 added non-secret VPN configuration to snapshot contents; provider registration in 0.6 migrates the database to v5 while keeping registration keys/tokens outside profile snapshots. State archives remain limited to 64 MiB and 4096 entries; an over-limit archive reports failure and preserves working files. Close Styg and back up the whole workspace before upgrading.
