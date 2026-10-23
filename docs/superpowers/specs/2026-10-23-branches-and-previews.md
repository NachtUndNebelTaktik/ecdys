# Snapshot previews and independent profile branches

Continue blueprint US-4/US-5. Add read-only configuration diffs before restoring snapshots, independent profile forks including current closed browser files and retained history, environment-only merge with parent rollback, promotion, and confirmed discard. The route gate remains unchanged and networked launches stay blocked.

Preview DTOs include only allowlisted configuration fields, snapshot content metadata and a profile revision. Restore and merge IPC require the revisions shown in the preview; stale confirmation must fail before any mutation. Diff rows identify added/removed tags and changed scalar settings. Preview does not read browser-file contents and does not claim to verify cookie compatibility.

A branch has its own UUID, browser directory, parent ID and branch name. Fork re-encrypts every retained configuration/state snapshot under new profile/snapshot identities and keys, preserving order, pin flags and timestamps. Its current fork point is additionally pinned. Branches count toward 99 profiles. Parent data never changes during fork. Creation is staged as a hidden profile plus durable fork journal; incomplete forks are removed on reopen. Atomic activation uses the existing restore journal to install copied browser files recoverably.

Merge replaces timezone, language and screen settings only: parent name/tags/browser files stay unchanged. It records a pre-merge configuration snapshot, checks branch and parent revisions atomically, and leaves the branch available. This maps the current environment fields to the blueprint's configuration-only merge; VPN/fingerprint fields follow when those services exist.

Promotion removes ancestry without changing files or snapshots. Discard removes only a branch after confirmation, requires no child branches, journals deletion before any filesystem change and resumes on reopen. No standalone profile deletion is added here. No arbitrary filesystem paths cross IPC.

Schema v3 adds branch metadata, profile revisions/status, and fork/discard journals. Unlock migrates v1/v2 transactionally; old app rollback requires a matching workspace backup. Browser state limits, ordinary working files, same-account/build caveats and Linux-only validation remain as documented.
