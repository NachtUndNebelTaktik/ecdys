# Configuration and closed browser-state snapshots

Styg now supports two explicit snapshot contents:

| Contents | Trigger in this build | Restores |
|---|---|---|
| Configuration only | Baseline, pre-edit, pre-merge, configuration restore rollback | Profile settings; browser files remain untouched |
| Configuration + browser state | Manual save, pre-launch, clean close, fork point, full restore rollback | Profile settings and regular browser-directory files |

The UI labels every snapshot. A state snapshot containing zero files is valid and is labelled as zero files; it does not imply a browser session has run.

## Storage and encryption

Profile working folders are `workspace/profiles/<profile UUID>/browser`. Each new profile gets a separate directory, mode 0700 on the verified Linux platform. Restored files use mode 0600 and directories 0700. Windows ACL behavior is not verified.

The encrypted SQLite database stores both snapshot envelopes as BLOBs. Configuration retains its original format. Browser state uses a versioned manifest of directory paths and base64-encoded regular file bytes, compressed with gzip level 9. Each archive receives a random AES-256-GCM data key. That key is wrapped with a separate master-derived key. Profile ID, snapshot ID and the browser-state purpose are authenticated, preventing cross-profile/snapshot reuse. No unwrapped snapshot key is persisted.

Scanning, compression, encryption, manifest validation and staging run in a worker. The current bounded format allows 64 MiB of raw file data and 4096 total file/directory entries. It is not a streaming format and can use considerably more memory than the raw data size. Larger profile quotas require a different streaming implementation.

Archives are encrypted at rest. Working browser files and temporary restore staging are ordinary local files; use OS disk encryption to protect them. Locking Styg clears its retained encryption key and closes the database; it does not encrypt or erase the working directories.

## Capture checks

Close the browser before saving. Styg refuses known Chromium singleton/lock markers, symbolic links, hard links, special files, unsafe/absolute/traversal paths, case-folded or Unicode-normalized path collisions, and directories that change during capture. File reads are bounded to the inventoried size. Capture applies the same path/size rules needed to restore successfully, including for rollback archives.

Lock markers and inventory stability are additional checks, not proof that an arbitrary external browser has exited. Future browser lifecycle integration must supply a managed process/quiescence guarantee, particularly on Windows. The internal Linux session core supplies an exclusive profile lease and waits for owned process-group quiescence; it is not yet enabled for normal app launches. The managed-session integration now validates real persistent cookies, localStorage and IndexedDB recovery using local Debian Chromium with a test basic password store, including restore after a killed browser. Production launches remain blocked. OS-protected cookies, cross-machine portability, sessionStorage and tab history are not verified. See [session test boundaries](SESSIONS.md).

## Restore sequence

The confirmation first shows allowlisted configuration differences and captures the current profile revision. A changed revision rejects confirmation before any restore mutation. Restoring configuration does not replace identity or ancestry. See [branches and previews](BRANCHES.md).

1. Authenticate and validate all archived contents before creating staging files.
2. Write a private staging directory, sync its files/directories, and record a unique operation marker.
3. Capture an encrypted full rollback snapshot of the current closed directory. Refuse the restore if that rollback cannot be safely captured.
4. In one SQLite transaction, save the rollback, update configuration, and insert the durable restore journal.
5. Move the current browser directory aside, then install the staging directory. Sync the parent directory after each move.
6. Verify the installed operation marker, remove the previous directory, clear the journal, and remove the marker.

After a recorded interruption, unlock resumes the journal before exposing profiles. Recovery handles the prepared, old-directory-moved, and replacement-installed states. Missing or conflicting artifacts keep the workspace locked with an error; they are not replaced with an empty workspace. Configuration-only restores use the existing SQLite-only transaction and leave browser files alone.

The tests simulate the interruption states using real filesystem operations. Actual process-kill/power-loss testing and Windows/macOS recovery validation remain pending. Forced termination may leave an uncommitted staging directory; on unlock, known abandoned staging directories are cleaned only when no restore journal references them. Unreferenced previous directories are preserved for review.

## Retention and migration

The 20 newest unpinned snapshots are retained in addition to pinned snapshots, regardless of content type. Configuration, state BLOBs and pin/prune changes participate in SQLite transactions. Before a state restore, a full rollback snapshot is added.

Unlock migrates database schemas v1/v2/v3 to v4 transactionally; existing configuration profiles and encrypted state snapshots remain readable. `workspace.json` format stays v1 because its encryption metadata is unchanged. Older builds cannot open database schema v4. Back up the complete workspace while Styg is closed before upgrading; rollback to an older build requires the matching pre-migration backup. Since 0.5, configuration history includes VPN settings; provider credentials remain outside profile snapshots. See [VPN data boundaries](VPN.md).
