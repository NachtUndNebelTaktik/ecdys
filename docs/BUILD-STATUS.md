# ecdys — Build status

Product display name: **ecdys**. **ecdys.app** is the domain. Window titles, native application metadata and interface wordmarks use the product name. The earlier user-data directory is preserved so the display-name correction does not relocate saved vaults or appearance preferences; explicit user-data overrides still take precedence.

## Current slice

The repository contains a runnable Electron/Solid application foundation with actual encrypted local profile configuration, recoverable configuration checkpoints and a customizable browser-style local workspace.

This is partial M0–M3/M16 work, now including proxy pools and saved-route operations. No complete milestone or production release is claimed. All thirty requirements and the full blueprint remain in force.

| Area                                                                           | Status                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop/IPC                                                                    | Implemented and exercised in real Electron; sandbox and context isolation enabled, Node integration disabled.                                                                                                                                 |
| Configuration vault                                                            | Argon2 worker, wrapped random master, SQLCipher-compatible storage and lock/unlock implemented.                                                                                                                                               |
| Profile configuration                                                          | CRUD, bounded input, revision conflicts, local allowance, tags/folder labels, protected policy, proxy/VPN configuration.                                                                                                                      |
| Proxy credentials                                                              | Encrypted profile credentials and pool credentials; passwords and secret references omitted from public responses.                                                                                                                            |
| Proxy library                                                                  | Up to twenty named encrypted pools / 1,000 endpoints; bounded URI/JSON imports, redacted preview, deduplication and safe deletion.                                                                                                            |
| Proxy diagnostics                                                              | Real SOCKS5/auth and HTTP CONNECT handshakes; HTTPS proxy certificate validation; remote destination DNS, total deadline, cancellation on lock and bounded responses.                                                                         |
| Saved-route switching                                                          | Assign/rotate selected profiles with revision checks, independent credentials, pre-change checkpoints and per-profile outcomes. Live browser traffic switching remains pending.                                                               |
| Vault upgrades                                                                 | Transactional v1-to-v2 schema migration, preserving profiles and configuration history.                                                                                                                                                       |
| Configuration recovery                                                         | Baseline/edit/manual/pre-restore checkpoints, independent keys, pins, retention, branches, restore integrity.                                                                                                                                 |
| Failure/restart handling                                                       | Missing/empty DB refusal, recoverable initialization, durable POSIX directory publication, orphan reconciliation.                                                                                                                             |
| Browser interface                                                              | Rounded local browser workspace, per-tab local searches, keyboard tab navigation, shared live appearance controls and Settings preview; Light/Dark/System/Night with adjustable warm filter; persisted profile sorting and grid/list layouts. |
| Browser state                                                                  | Not implemented. No cookies/tabs/browser storage are claimed in current checkpoints.                                                                                                                                                          |
| Native networking/storage                                                      | Not implemented. Browsing stays blocked.                                                                                                                                                                                                      |
| Native SOCKS5 live switching / Monero                                          | Required integrations, not implemented. Tunnel testing and saved-route rotation do not complete them.                                                                                                                                         |
| Fingerprints / automation / lab / capsules / disposables / recipes / full maps | Pending and retained in blueprint.                                                                                                                                                                                                            |
| Licensing / team feature / controlled updates                                  | Pending; local configuration works offline.                                                                                                                                                                                                   |
| Distribution                                                                   | Development build only; signed installers and cross-platform release verification pending.                                                                                                                                                    |

## Verification

Final verified commands:

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:ui

Results: typecheck passed; 58 core tests passed; renderer/main/preload/worker production builds passed; two real Electron end-to-end tests passed.

The desktop scenario creates a vault, configures authenticated SOCKS5, edits a profile, restores a checkpoint, creates a branch, imports a proxy pool, tests a credential-bearing CONNECT tunnel through the real IPC bridge against an owned loopback fixture, assigns and rotates a saved route, deletes the pool while retaining the profile route, locks, rejects a wrong passphrase and reopens persisted profiles. It checks actual WebContents sandbox/context-isolation/Node settings.

Database unit fixtures use a 16 MiB injected KDF for repeated tests. This injection is not exposed through IPC. The desktop flow uses the real worker at an explicit 1 GiB; the default production setting remains 4 GiB.

Coverage additionally includes redacted and atomic imports, encoded URI credentials/IPv6, migration, stale/missing bulk targets, no-alternative rotation, SOCKS5 authentication and downgrade refusal, remote destination DNS, fragmented CONNECT/SOCKS5 replies, hostile response sizes, stalled peers, cancellation, untrusted TLS certificates and fixed diagnostic errors. Protocol fixtures use owned loopback servers, not external validation sites.

Earlier coverage includes strict required-pass validation, encrypted at-rest profile values, revision/limit races, secret redaction, tampering, inherited pins/retention, missing/truncated DB preservation, failed initialization, directory-sync failure, safe orphan reconciliation, sanitized IPC and idle policy.

## Review corrections

A read-only reviewer found four Important storage issues. All were corrected through six failure/restart regressions: missing/empty DB replacement, premature handle publication, snapshot publication/cleanup, and branch retention.

The desktop test also caught a short-viewport sidebar overflow that made Lock unreachable; the sidebar now scrolls. Inherited snapshot pins received a separate regression and correction.

The author reran the complete suite after foundation corrections. A separate fresh review covered the proxy operations slice. Its two Important findings and one protocol parsing finding were corrected through four new regressions that failed first; the complete 55-test suite then passed. No second independent approval or cross-platform security certification is implied.

## Remaining gates

Native routing and protected browser storage remain prerequisites for browsing. Saving a proxy does not prove a network connection. A tunnel acceptance report proves only the proxy protocol observation; it does not prove the exit IP or end-to-end TLS to the requested destination. Tests run only on explicit operator action and request example.com:443 through the selected proxy. SOCKS5 and plain HTTP proxy credentials are unencrypted in transit; HTTPS CONNECT verifies TLS to the proxy. Browser launch remains blocked irrespective of tunnel success. Windows directory publication durability requires native support and currently surfaces a storage warning. POSIX fsync tests do not prove every power-loss or storage-controller scenario.

Blueprint gates G1–G6, production account/payment/signing infrastructure, browser compatibility, native platform builds, independent security assessment and real trading workload benchmarks remain required.

## Proxy implementation details

Passwords are encrypted with an authenticated, domain-separated library key and copied into independent profile-secret envelopes on assignment. Deleting a pool never deletes assigned profile credentials or their recovery history. Imports are all-or-nothing; per-profile route changes commit separately so successful changes survive a stale or failing target. Other profile settings are copied, not reconstructed from defaults.

Diagnostics run outside the database serialization queue, with at most three in flight. Lock cancels their sockets and prevents results from an earlier unlock epoch being returned. Reports remain in UI memory for the current Routes view; there is no automatic background network testing or diagnostic persistence yet. JavaScript credential strings cannot be guaranteed erased from every runtime memory copy; bounded native buffers and key buffers are cleared where controlled.

The development environment supports Linux user/network namespaces. No host route or firewall was changed, and this probe is not a native containment implementation. Windows/macOS routing and protected storage still need platform implementations and fault-injection verification.

## Proxy review and decisions

The read-only reviewer independently ran the then-current 51-test suite and typecheck. It found a post-commit retention failure could be incorrectly reported as a failed route change, and informational HTTP replies could cause a false tunnel failure. Both were reproduced and corrected. Retention failures now preserve the success result, keep extra checkpoints, surface a storage warning and retry on unlock. HTTP diagnostics consume bounded informational replies before the final status, retaining the cumulative size limit and total deadline.

The reviewer also identified malformed HTTP headers producing a success report. The author treated this as a diagnostic correctness issue and included it in the same correction pass: invalid headers now fail protocol validation. This can reject nonstandard proxy responses that the earlier permissive parser accepted.

The reviewer found no additional credential-return, pool-deletion dependency, atomic-import, migration-replacement, direct-fallback or old-epoch diagnostic defects. These are review observations, not an external security certification. No second review approval is claimed; corrections were verified by the failing regressions and complete suite. There are no deferred minor findings from this review.

Review limits remain explicit: native containment, protected browser storage, live traffic switching, Windows/macOS durability, production provider interoperability and power-loss recovery are not certified by these local protocol and database tests. They remain in the full implementation plan and release gates.

## Browser interface verification (v0.3.2)

The additional desktop scenario exercises the rendered Browser surface and shared Settings controls. It verifies Light/Dark/System/Night colors, live desktop-theme following, Night filter strength, real CSS corner/text/spacing changes, bookmark and sidebar visibility, reduced-motion behavior, independent tab searches, keyboard tab movement and close/final-tab focus, local-address navigation, refusal of website and prototype-property addresses, alphabetical sorting, list/grid layout and persisted preferences after reload. Reset preserves sort/layout, and the profile API returns exactly the same saved configuration afterward.

The author visually inspected desktop screenshots for Dark, Light, Night and the 1050 px minimum layout. No new managed-browser or native routing availability is claimed by these interface changes. Native browsing and existing release gates remain unchanged. The new appearance preferences contain UI choices only, with no profile names, identifiers, URLs, credentials or browsing history.

The browser now opens at the full available workspace width. Appearance controls open on demand in a slimmer side panel. Electron checks verify that the default surface fills its workspace, opening and closing the panel changes its width, and the browser and controls fit at the minimum supported width.
