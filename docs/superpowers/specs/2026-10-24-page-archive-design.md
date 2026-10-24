# Native page archive increment

The user requested built-in utilities similar to SingleFile. Use the existing Chromium private CDP pipe to capture one owned active HTTP(S) page with `Page.captureSnapshot` in MHTML format. This avoids adding a privileged extension or an independent fetch/browser route. Production session launch remains blocked until the route supervisor is implemented.

Typed page-list/capture methods validate target IDs, schemes, session identity and navigation stability. Return bounded titles/origins to the picker and no page body through renderer IPC. Bound MHTML to 4 MiB, compute SHA-256, detach after capture and wipe discarded buffers. Oversized DevTools frames must reject affected commands and drain to the delimiter without closing the live browser.

Save only after an explicit native file chooser. Use `.mhtml`, private exclusive file creation, no overwrite, one export at a time, pre/post lifecycle checks and cleanup on failure. Saved content is deliberately plaintext and never rendered in the app. The UI states preservation limits, the route prerequisite and the distinction from SingleFile HTML. No database schema, plugin permission, browser launch bypass or host policy change is included.

Tests: protocol/target/session limits and races; real loopback Chromium capture of DOM/CSS/image content; export permissions/no overwrite/stale-owner cleanup; strict IPC rejects renderer paths/commands; UI keeps the session prerequisite visible. Offline file reopen may be skipped only for an observed executor policy block.
