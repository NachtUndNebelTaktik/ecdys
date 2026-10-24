# Snapshot previews and independent branches

Ecdys 0.3 adds the current portion of blueprint US-4/US-5. It handles saved settings and closed browser-directory files. It does not launch browsers or apply fingerprints/VPN routes.

## Review a restore

Select a profile, choose a snapshot and click Restore. The confirmation compares current settings with the snapshot: changed scalar settings, added tags and removed tags. It labels whether browser files will also be replaced. Opening a preview does not create a snapshot or decrypt browser-file archives.

Confirmations carry the profile revision. If settings or ancestry changed after the preview, restore is rejected; cancel and review again. Restore preserves the profile's identity and branch ancestry. A configuration restore saves a configuration rollback point; a state restore captures a full rollback before replacement. These revisions track application-managed changes, not edits made directly to working files by an external program.

## Create a branch

Use **Create branch** in the selected profile's recovery panel. Close any external browser using that profile first. Branch names must be 1–64 characters, with no control characters; names are unique within a parent, ignoring case.

The branch receives a new profile ID, separate browser directory, parent link and BRANCH badge. It copies the parent's current closed browser files and all retained snapshots. Every copied snapshot is authenticated and re-encrypted with fresh snapshot/profile identities and random keys. Original timestamps, triggers and pin flags are preserved. A new pinned **fork** snapshot records the branch's starting configuration and files. Parent files, settings and history remain unchanged.

Branches count toward the 99-profile limit. They use the same 64 MiB / 4096-entry state limits as other snapshots. Copying a large pinned history takes additional time and disk space; it is not a filesystem link or shared mutable archive. Subsequent captures apply normal retention: 20 unpinned snapshots plus pinned snapshots.

## Merge, promote or discard

| Action | Result |
|---|---|
| Review merge | Compare the branch's timezone, language, screen and VPN settings against its parent. Confirmation checks both revisions, saves a **pre_merge** configuration rollback point, then replaces those settings atomically. |
| Promote to standalone | Clear ancestry while keeping the profile ID, configuration, browser files and snapshot history. |
| Discard branch | Permanently remove that branch's configuration, history and browser directory after confirmation. Resolve its child branches first. Standalone profiles cannot be discarded through this action. |

Merge preserves the parent's name, tags and browser files and keeps the branch. There is no cookie, file or session-state merge. The environment fields are saved settings in this build; provider authentication, tunnels and fingerprint injection remain pending. Since 0.5, VPN configuration is copied/restored/merged with other environment settings; provider credentials stay workspace-level and outside profile history. See [VPN setup](VPN.md). A nested branch merges into its immediate parent. Promoting a branch does not detach that profile's own children.

Promotion and discard also check the revision shown in their confirmation. Browser lock markers prevent copying/discarding closed-directory state; arbitrary external programs are not managed by Ecdys yet.

## Interrupted operations and migration

Fork creation reserves a hidden profile and a durable creation journal before copying. Incomplete reservations are removed on reopening. Activation commits the copied history, fork point and restore journal together, then installs the staged files through the normal recoverable directory swap. Newly created directory entries are synced before publication. An activated but interrupted fork finishes on reopen.

Discard records its journal before renaming the branch directory into an operation-specific trash directory. Reopening resumes deletion whether the rename or file removal had already completed. Recovery derives paths from validated IDs. Missing journals and conflicting paths stop unlock and preserve files for review rather than guessing.

Schema v3 adds ancestry, revisions, hidden operation status and fork/discard journals. Unlock migrates schemas v1/v2 transactionally while retaining existing encrypted history. `workspace.json` remains format v1. Close Ecdys and back up the entire workspace before upgrading; older 0.1/0.2 builds need the matching pre-migration backup to roll back.

Linux tests cover independent files/history, identity rebinding, stale confirmations, merge rollback, migration, cancellation and simulated interrupted creation/activation/deletion. The maximum-size test also rebinds and restores a 64 MiB incompressible archive. Actual power-loss behavior, Windows/macOS recovery and OS-protected and cross-machine Chromium cookie recovery remain unverified. The local basic-store recovery test is described in [managed sessions](SESSIONS.md). Working directories and staging remain ordinary local files; see [snapshot boundaries](SNAPSHOTS.md).
