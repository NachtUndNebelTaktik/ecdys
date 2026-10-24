# ecdys — Build status

Product display name: **ecdys**. **ecdys.app** is the domain. Window titles, native application metadata and interface wordmarks use the product name. The earlier user-data directory is preserved so the display-name correction does not relocate saved vaults or appearance preferences; explicit user-data overrides still take precedence.

## Current slice

The repository contains a runnable Electron/Solid application foundation with actual encrypted local profile configuration, recoverable configuration checkpoints, an encrypted OSINT research workspace and a customizable browser workspace with a first temporary Linux browsing runtime.

This is partial M0–M3/M16 work, now including proxy pools and saved-route operations. No complete milestone or production release is claimed. All thirty requirements and the full blueprint remain in force.

| Area                                                                           | Status                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop/IPC                                                                    | Implemented and exercised in real Electron; sandbox and context isolation enabled, Node integration disabled.                                                                                                                                               |
| Configuration vault                                                            | Argon2 worker, wrapped random master, SQLCipher-compatible storage and lock/unlock implemented.                                                                                                                                                             |
| Profile configuration                                                          | CRUD, bounded input, revision conflicts, local allowance, tags/folder labels, protected policy, proxy/VPN configuration.                                                                                                                                    |
| Proxy credentials                                                              | Encrypted profile credentials and pool credentials; passwords and secret references omitted from public responses.                                                                                                                                          |
| Proxy library                                                                  | Up to twenty named encrypted pools / 1,000 endpoints; bounded URI/JSON imports, redacted preview, deduplication and safe deletion.                                                                                                                          |
| Proxy diagnostics                                                              | Real SOCKS5/auth and HTTP CONNECT handshakes; HTTPS proxy certificate validation; remote destination DNS, total deadline, cancellation on lock and bounded responses.                                                                                       |
| Saved-route switching                                                          | Assign/rotate selected profiles with revision checks, independent credentials, pre-change checkpoints and per-profile outcomes. Live browser traffic switching remains pending.                                                                             |
| Vault upgrades                                                                 | Transactional v1-to-v2-to-v3 migration, preserving profiles, proxy credentials and configuration history. Damaged research data is not silently replaced.                                                                                                   |
| OSINT research                                                                 | Saved mindmap, typed nodes, source notes, labeled links, drag/pan/zoom/fit, keyboard movement and undo. Searchable categorized tool shelf, pins and editable website links; explicit opening through the active routed session.                             |
| Configuration recovery                                                         | Baseline/edit/manual/pre-restore checkpoints, independent keys, pins, retention, branches, restore integrity.                                                                                                                                               |
| Failure/restart handling                                                       | Missing/empty DB refusal, recoverable initialization, durable POSIX directory publication, orphan reconciliation.                                                                                                                                           |
| Browser interface                                                              | Rounded local browser workspace, per-tab local searches, keyboard tab navigation, shared live appearance controls and Settings preview; Light/Dark/System/Night/Crimson with adjustable Night warm filter; persisted profile sorting and grid/list layouts. |
| Browser state                                                                  | Temporary sessions hold site state in private tmpfs and discard it on close. No browser state is included in checkpoints.                                                                                                                                   |
| Native networking/storage                                                      | Linux temporary runtime uses private namespaces, a saved-proxy broker and RAM-only files. Persistent and cross-platform adapters remain pending.                                                                                                            |
| Native SOCKS5 live switching / Monero                                          | Required integrations, not implemented. Tunnel testing and saved-route rotation do not complete them.                                                                                                                                                       |
| Fingerprints / automation / lab / capsules / disposables / recipes / full maps | Pending and retained in blueprint.                                                                                                                                                                                                                          |
| Licensing / team feature / controlled updates                                  | Pending; local configuration works offline.                                                                                                                                                                                                                 |
| Distribution                                                                   | Development build only; signed installers and cross-platform release verification pending.                                                                                                                                                                  |

## Verification

Final verified commands:

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:ui

Results: typecheck passed; 73 core tests passed; renderer/main/preload/worker production builds passed; four real Electron end-to-end tests passed.

The desktop scenario creates a vault, configures authenticated SOCKS5, edits a profile, restores a checkpoint, creates a branch, imports a proxy pool, tests a credential-bearing CONNECT tunnel through the real IPC bridge against an owned loopback fixture, assigns and rotates a saved route, deletes the pool while retaining the profile route, locks, rejects a wrong passphrase and reopens persisted profiles. It checks actual WebContents sandbox/context-isolation/Node settings.

Database unit fixtures use a 16 MiB injected KDF for repeated tests. This injection is not exposed through IPC. The desktop flow uses the real worker at an explicit 1 GiB; the default production setting remains 4 GiB.

Coverage additionally includes redacted and atomic imports, encoded URI credentials/IPv6, migration, stale/missing bulk targets, no-alternative rotation, SOCKS5 authentication and downgrade refusal, remote destination DNS, fragmented CONNECT/SOCKS5 replies, hostile response sizes, stalled peers, cancellation, untrusted TLS certificates and fixed diagnostic errors. Protocol fixtures use owned loopback servers, not external validation sites.

Earlier coverage includes strict required-pass validation, encrypted at-rest profile values, revision/limit races, secret redaction, tampering, inherited pins/retention, missing/truncated DB preservation, failed initialization, directory-sync failure, safe orphan reconciliation, sanitized IPC and idle policy.

## Review corrections

A read-only reviewer found four Important storage issues. All were corrected through six failure/restart regressions: missing/empty DB replacement, premature handle publication, snapshot publication/cleanup, and branch retention.

The desktop test also caught a short-viewport sidebar overflow that made Lock unreachable; the sidebar now scrolls. Inherited snapshot pins received a separate regression and correction.

The author reran the complete suite after foundation corrections. A separate fresh review covered the proxy operations slice. Its two Important findings and one protocol parsing finding were corrected through four new regressions that failed first; the complete 55-test suite then passed. No second independent approval or cross-platform security certification is implied.

## Remaining gates

Native routing and protected persistent browser storage remain prerequisites for persistent profile browsing. Saving a proxy does not prove a network connection. A tunnel acceptance report proves only the proxy protocol observation; it does not prove the exit IP or end-to-end TLS to the requested destination. Tests run only on explicit operator action and request example.com:443 through the selected proxy. SOCKS5 and plain HTTP proxy credentials are unencrypted in transit; HTTPS CONNECT verifies TLS to the proxy. Persistent profile launch remains blocked irrespective of a diagnostic result. Temporary Linux sessions use a separate native runtime and explicitly acknowledged disposable storage. Windows directory publication durability requires native support and currently surfaces a storage warning. POSIX fsync tests do not prove every power-loss or storage-controller scenario.

Blueprint gates G1–G6, production account/payment/signing infrastructure, browser compatibility, native platform builds, independent security assessment and real trading workload benchmarks remain required.

## Proxy implementation details

Passwords are encrypted with an authenticated, domain-separated library key and copied into independent profile-secret envelopes on assignment. Deleting a pool never deletes assigned profile credentials or their recovery history. Imports are all-or-nothing; per-profile route changes commit separately so successful changes survive a stale or failing target. Other profile settings are copied, not reconstructed from defaults.

Diagnostics run outside the database serialization queue, with at most three in flight. Lock cancels their sockets and prevents results from an earlier unlock epoch being returned. Reports remain in UI memory for the current Routes view; there is no automatic background network testing or diagnostic persistence yet. JavaScript credential strings cannot be guaranteed erased from every runtime memory copy; bounded native buffers and key buffers are cleared where controlled.

The development environment supports Linux user/network namespaces. The temporary browser now uses those namespaces without changing a host route or firewall. Windows/macOS routing, persistent protected storage and full release fault-injection coverage still require platform implementations.

## Proxy review and decisions

The read-only reviewer independently ran the then-current 51-test suite and typecheck. It found a post-commit retention failure could be incorrectly reported as a failed route change, and informational HTTP replies could cause a false tunnel failure. Both were reproduced and corrected. Retention failures now preserve the success result, keep extra checkpoints, surface a storage warning and retry on unlock. HTTP diagnostics consume bounded informational replies before the final status, retaining the cumulative size limit and total deadline.

The reviewer also identified malformed HTTP headers producing a success report. The author treated this as a diagnostic correctness issue and included it in the same correction pass: invalid headers now fail protocol validation. This can reject nonstandard proxy responses that the earlier permissive parser accepted.

The reviewer found no additional credential-return, pool-deletion dependency, atomic-import, migration-replacement, direct-fallback or old-epoch diagnostic defects. These are review observations, not an external security certification. No second review approval is claimed; corrections were verified by the failing regressions and complete suite. There are no deferred minor findings from this review.

Review limits remain explicit: native containment, protected browser storage, live traffic switching, Windows/macOS durability, production provider interoperability and power-loss recovery are not certified by these local protocol and database tests. They remain in the full implementation plan and release gates.

## Browser interface verification (v0.4.0)

The additional desktop scenario exercises the rendered Browser surface and shared Settings controls. It verifies Light/Dark/System/Night colors, live desktop-theme following, Night filter strength, real CSS corner/text/spacing changes, bookmark and sidebar visibility, reduced-motion behavior, independent tab searches, keyboard tab movement and close/final-tab focus, local-address navigation, refusal of website and prototype-property addresses, alphabetical sorting, list/grid layout and persisted preferences after reload. Reset preserves sort/layout, and the profile API returns exactly the same saved configuration afterward.

The author visually inspected desktop screenshots for Dark, Light, Night and the 1050 px minimum layout. Those appearance changes are separate from the temporary Linux runtime added in v0.4.0. Persistent browsing and the remaining release gates are not completed. The new appearance preferences contain UI choices only, with no profile names, identifiers, URLs, credentials or browsing history.

The browser now opens at the full available workspace width. Appearance controls open on demand in a slimmer side panel. Electron checks verify that the default surface fills its workspace, opening and closing the panel changes its width, and the browser and controls fit at the minimum supported width.

Crimson adds night-black surfaces throughout the browser and application chrome with a matching accent, also available separately. Selecting Crimson applies that accent; further accent changes remain supported. The Electron scenario checks the palette on browser/profile/Settings surfaces, persistence after reload, accent overrides, reset to Dark/Sage, and the compact control layout.

## Temporary browser runtime (v0.4.0)

The Browser section can open one acknowledged temporary Standard session on the supported Linux development environment. Real Chromium 154 runs with its sandbox enabled inside separate network, PID, user, mount, IPC and UTS namespaces. A host-side Unix broker holds the saved proxy credential and connects only through that selected SOCKS5 or HTTP CONNECT route. Browser control uses private pipes, not a listening CDP port. Profile/route mutation is blocked while its session is leased, and an auto_pre_launch configuration checkpoint precedes launch.

Site files live on a private bounded tmpfs; swap must be disabled and process core limits are zero. Cookies, logins and storage do not survive close, crash or workspace lock. There is no encrypted persistent browser-state or full-lock certification claim. The development viewport streams images with bounded refresh; it is not a trading performance benchmark. Downloads, protected-execution sessions, live route replacement, persistent browser-state recovery and other platform adapters remain pending.

See BROWSER-RUNTIME.md for prerequisites, operation, evidence and release boundaries.

## OSINT workspace (v0.4.0)

The OSINT tab adds a mindmap and a configurable tool shelf within the same station. Research documents autosave in the encrypted vault with serialized writes and revision conflict checks. Notes and tool URLs are never put in appearance localStorage or queried automatically. Tool opening uses the active proxy-routed temporary browser session. Local research remains available offline. This research mindmap is separate from the blueprint's future profile connection map and does not replace it.

The new database and autosave regressions cover persistence, encrypted at-rest notes, stale writes, graph/URL bounds, migrations, damaged data preservation and failure/retry. The desktop flow additionally checks node dragging and keyboard movement, connection editing, undo, custom tools, conflict recovery and lock/reopen. See OSINT-WORKSPACE.md for limits. Neither arbitrary local tool execution nor external OSINT API integration is claimed.
