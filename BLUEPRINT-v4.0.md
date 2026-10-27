# ecdys

**Product name:** ecdys. **Domain:** ecdys.app.

## Complete Implementation Blueprint v4.0

**Revision date:** 2026-10-24  
**Document status:** Revised implementation specification; capabilities described here are requirements, not claims of completed software.  
**Supersedes:** Blueprint v3.0 supplied by the owner.  
**Product identity:** Sovereign browser workstation for security operations, crypto/Web3, and browser-based trading. Team collaboration and offline operation are built-in capabilities, not separate product identities.  
**Commercial figures:** Deferred for reconciliation. Preserve the original purchase options, tiers, and payment methods; do not implement conflicting amounts from v3.0.

This is one replacement specification. The [change ledger](CHANGE-LEDGER-v4.0.md) explains corrections, including disposition of all 36 original locked decisions. The [data contracts](specs/DATA-CONTRACTS-v4.0.md) define persistence and interface details referenced below. Neither document introduces an alternative product.

## Contents

1. Product purpose, audience, and operating principles
2. Architecture and trust boundaries
3. Technology stack and monorepo
4. Operational and security specifications
5. Application requirements US-1 through US-30
6. Data and interface contracts
7. Technical examples
8. Milestones and dependencies
9. Risk register
10. Verification, performance, and release gates
11. Design decision register
12. Documentation and distribution
13. Glossary and official references

## 1. Product purpose, audience, and operating principles

### 1.1 What is being built

A desktop browser workstation that manages up to 99 persistent profiles with separate browsing storage, configurable fingerprints, dedicated or explicitly shared network routes, automatic snapshots, automation, diagnostics, and workspace tools.

Profiles are the infrastructure for operational work. ecdys brings configuration, recovery, comparison, network policy, and resource control into one locally owned workspace. It is intended to become the operator's working environment, including work involving sensitive investigations or real capital. Proxies, authenticated SOCKS5 configuration and switching, and Monero payments are core requirements, not optional future integrations.

The complete product includes folders, tags, maps, bulk operations, recipes, disposable children, comparison labs, capsules, team collaboration, billing, licensing, and controlled updates. These capabilities are retained as part of v1.0. Sequencing them is an implementation dependency decision, not permission to delete them.

### 1.2 Who it serves

- Sovereign operators and builders running self-hosted infrastructure who want deliberate control over data, dependencies, and outbound connections.
- Privacy-focused researchers, dissidents, and investigators maintaining compartmentalized identities.
- Authorized security practitioners conducting browser-based research, inspection, and penetration testing.
- Crypto and DeFi operators separating node administration, wallet-connected sites, capital operations, and unfamiliar content.
- Day traders using charting, DOM feeds, and browser-based execution platforms across multiple monitors.
- Engineers and multi-account operators who need repeatable automation and recoverable environments.

This specification does not add a custodial wallet, transaction signer, exchange order engine, offensive testing suite, or remote browser farm. Existing browser-based tools run inside managed environments. Their network behavior and trust relationships remain visible and attributable.

### 1.3 Principles translated into behavior

| Principle               | Required engineering behavior                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data autonomy           | Operational state stays local by default; sharing and export are explicit; teams host their own collaboration service.                                         |
| Silent operation        | No application telemetry, advertising SDKs, engagement analytics, or unsolicited background scans. Document every application-controlled outbound destination. |
| Functional austerity    | Features load when needed; background work has budgets; interfaces prioritize operation, diagnosis, and recovery.                                              |
| Compartmentalization    | Separate profile storage, permission decisions, extension policy, and enforceable network bindings. Shared resources are explicit.                             |
| Recovery by design      | Durable snapshots, restoration journals, independent branches, and verifiable transfer formats.                                                                |
| Operational continuity  | No automatic suspension, route rotation, restart, update, or disruptive bulk change of a protected live session.                                               |
| Diagnostic transparency | Show evidence, status age, limitations, and concrete remedies. Never substitute an anonymity percentage for measurements.                                      |
| User control            | Deliberate updates, export availability, documented local APIs, and offline access under the selected license policy.                                          |

### 1.4 Guarantees and boundaries

Target adversaries include website trackers, accidental profile crossover, misconfiguration, network loss, malicious web content within the browser sandbox, and unauthorized application users. State-level targeting motivates conservative engineering, but the application does not claim immunity to a compromised kernel, administrator, browser exploit, physical access to an unlocked host, or endpoint surveillance.

No application telemetry does not mean no website traffic. A broker, exchange, wallet-connected site, RPC provider, VPN operator, or explicitly selected test site can observe interactions sent to it. The application must explain these boundaries without obscuring its useful protections.

Managed browser processes share an operating system. They are lighter than separate VMs but do not provide VM-equivalent isolation. Performance figures are targets for measured workloads, not guarantees for arbitrary sites.

## 2. Architecture and trust boundaries

### 2.1 Components

    Operator
      |
      v
    Electron UI -- typed, authorized IPC --> Desktop coordinator
                                                |
                        +-----------------------+----------------------+
                        |                       |                      |
                        v                       v                      v
                 Crypto/storage worker   Session supervisor    Local API gateway
                        |                       |                      |
                 SQLCipher + encrypted    Native route helper   Private ChromeDriver
                 snapshot/capsule files          |                      |
                                                +--> Managed Chromium <+
                        |
                        +-- explicit encrypted sync --> Self-hosted team service

    Desktop billing UI -- HTTPS --> Operator billing/license service
                                        |
                               Payment providers / wallet RPC

### 2.2 Desktop coordinator

Owns profile changes, session lifecycles, launch admission, snapshot journals, health checks, and authorization. Serializes mutations per profile. It never grants the renderer arbitrary shell, filesystem, SQL, or CDP access.

The UI loads packaged application content using a restricted custom protocol. Enable context isolation and sandboxing; disable Node integration, including in workers. Apply a restrictive CSP, validate IPC sender and payloads, and expose only named operations through preload. Untrusted browsing content runs in managed Chromium, outside the privileged application UI.

### 2.3 Native route helper

A minimal separately reviewed native component establishes tunnel resources and enforces traffic policy. Use authenticated local IPC with caller identity checks, bounded payloads, explicit operations, and platform-specific installation/signing. It accepts structured configuration rather than shell command strings.

The helper owns browser process launch containment so policy exists before any browser child can create an outbound connection. It tracks descendants by durable OS process identity and ownership, not a PID alone. Policy must survive coordinator failure in a blocked or controlled state.

Linux implementation investigates network namespaces, dedicated route tables, and nftables enforcement. Windows investigates WFP with owned process-tree classification and appropriate tunnel support. macOS investigates signed Network Extension facilities and process/flow binding. These are implementation candidates, not equivalent APIs or evidence that all three already work. Platform-specific capability, entitlement, packaging, and enforcement tests gate shipping.

### 2.4 Self-hosted team service

Optional for single-user work; required for cross-machine teams. Provides team membership, invite redemption, device identities, profile access grants, encrypted object synchronization, configuration revisions, execution leases, and an append-only service audit stream.

The service stores explicitly shared operational payloads as ciphertext. Clients generate profile keys; key envelopes grant access to authorized devices. Service-visible metadata includes membership, object identifiers, revisions, sizes, access activity, and audit envelopes. Self-hosting does not eliminate that metadata.

Only one team device may own a writable/running shared profile at a time. Default execution lease duration is 120 seconds, renewed every 30 seconds. After lease loss, network access is blocked and mutations are fenced before another device can acquire it. A protected trading session warns immediately and attempts reconnection, but cannot continue indefinitely as an unfenced shared writer. Operators needing disconnected execution fork a private local copy before launch.

Existing private profiles remain available offline. Shared profiles remain inspectable/exportable from authorized cached data; running a shared profile requires a valid lease. Concurrent offline edits are retained as conflict branches for explicit resolution.

### 2.5 Operator billing and licensing service

Owns merchant credentials, provider webhook validation, invoices, payment allocation, entitlement issuance, and support-approved transfers. Monero wallet administration and RPC credentials never ship in the customer desktop.

It stores billing/account data, not browser history, cookies, operational logs, or profile contents. Team deployments contact it only for commercial functions they elect to use. Air-gapped installations accept signed licenses and signed update bundles by file.

### 2.6 Browser and automation boundary

Use a supported managed Chromium build with a matched ChromeDriver release. Prefer private inherited pipes for CDP. If a required tool needs a socket, it must be inaccessible to untrusted browser processes and other users; a random loopback port alone is not access control.

Expose only the authenticated WebDriver gateway to authorized local clients. Internal ChromeDriver endpoints must be restricted by OS access policy or a private transport adapter. Tokens are scoped to one managed session and one role. Remote automation uses an explicitly configured authenticated tunnel; the application does not listen on the LAN by default.

## 3. Technology stack and monorepo

### 3.1 Stack

| Layer                    | Selection and constraints                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI                       | Solid.js + TypeScript; Solid stores as the default state layer. Avoid a duplicate global store unless a measured need justifies it.                                              |
| Styling                  | Tailwind CSS + DaisyUI; accessible focus, keyboard operation, compact and high-contrast themes.                                                                                  |
| Desktop                  | A currently supported Electron release pinned per application build.                                                                                                             |
| Managed browser          | Supported Chromium/Chrome-for-Testing-compatible artifacts, pinned per release and matched to ChromeDriver. Security response covers both Electron and managed browser engines.  |
| Browser control          | CDP with Puppeteer where appropriate; ChromeDriver for W3C WebDriver. Playwright for application testing.                                                                        |
| Native helper            | Rust with narrowly scoped OS bindings; external dependencies and driver licenses reviewed before selection.                                                                      |
| Local database           | SQLCipher through a maintained native binding, built and tested against the pinned Electron ABI.                                                                                 |
| Team/commercial services | Separate Node.js LTS + TypeScript services, PostgreSQL, and S3-compatible object storage for encrypted team objects. Commercial and team databases/credentials remain separate.  |
| Crypto                   | Maintained Argon2id implementation off the UI thread; OS-backed/native crypto and Node crypto for AES-GCM/HKDF; system GnuPG with OpenPGP.js for compatible fallback operations. |
| VPN                      | Capability-based Mullvad and IVPN adapters, actual tunnel management, and custom SOCKS5 through a local authenticated-upstream gateway.                                          |
| Compression              | Streaming gzip level 9 in bounded background workers; compression is not a security mechanism.                                                                                   |
| Maps and graphs          | D3.js, lazy loaded; saved positions in encrypted workspace data, not sensitive localStorage.                                                                                     |
| Diffs                    | Structured configuration diff, text diff, pixelmatch, and CDP accessibility/DOM snapshots with explicit limitations.                                                             |
| Resource monitoring      | Native process-tree accounting, with pidusage where reliable; include browser descendants and helper overhead.                                                                   |
| Playground               | Monaco, isolated worker runtime, message-only capability bridge; no Node integration.                                                                                            |
| Validation               | Zod for payloads and persisted versioned documents.                                                                                                                              |
| Tests/build              | Vitest, Playwright, pnpm workspaces, Turborepo, electron-builder, native OS CI.                                                                                                  |
| Distribution             | Signed application artifacts and signed update manifests; owner-controlled CDN with GitHub Releases fallback.                                                                    |

Versions are recorded in a checked-in release manifest with hashes, ABI, architecture, driver pairing, schema versions, and security advisory references. Build tools download exact verified artifacts; Puppeteer is not a security patch backport service.

### 3.2 Repository layout

    project-root/
      packages/
        desktop/             # coordinator, lifecycle, profiles, snapshots, updates
          src/
            main.ts
            preload.ts
            ipc/
            browser/
            networking/
            encryption/
            storage/
            snapshots/
            diagnostics/
            resources/
            automation/
            collaboration/
            recipes/
            capsules/
            updates/
        renderer/            # Solid UI; no privileged runtime or remote web content
        shared/              # versioned schemas, IPC contracts, policy constants
        native-helper/       # Rust core + Linux/Windows/macOS adapters
        team-service/        # self-hosted control plane, leases, encrypted sync
        commerce-service/    # accounts, invoices, webhooks, licensing, transfers
      docs/                  # user/operator/developer guides and API references
      scripts/               # verified downloads, builds, signing, packaging
      fixtures/              # deterministic sites, archives, network test cases
      .github/workflows/     # OS CI, signing/release, browser compatibility checks
      pnpm-workspace.yaml
      turbo.json

Keep secrets, private key material, browser binaries, test keyrings, operational profiles, downloaded archives, and generated installers out of source control. Production private keys are never generated or stored in developer scripts by default.

## 4. Operational and security specifications

### 4.1 Profile and session lifecycle

Profiles have a stable identity, mutable configuration revision, protected storage, and a timeline. One profile supports one writable active browser instance. Disposable children and branches use separate identities and directories.

Session states are queued, preparing, launching, active, route_blocked, suspending, suspended, closing, stopped, and crashed. A profile launch follows:

1. Authorize user and entitlement; acquire local mutation lock and team lease if shared.
2. Reserve resources; validate storage readiness, extension policy, and browser compatibility.
3. Commit the pre-launch snapshot. A failed required checkpoint blocks launch.
4. Establish route containment and tunnel/proxy, including DNS; prove route readiness.
5. Run validation when due using the same browser build, route, policy, and fingerprint configuration in a separate test identity.
6. Launch Chromium inside already enforced containment, inject supported settings before navigation, and expose the authorized gateway.
7. Mark active only after browser and route probes succeed; record a non-mutating post-load observation.

Creation, edits, restore, branch merge, close, suspend, bulk changes, and updates use the same coordinator. Required checkpoints complete before mutations they protect. Compression occurs asynchronously, but that does not permit edits to outrun their protective snapshot.

Save & Close first attempts graceful state capture and browser shutdown. A timeout records an unclean close and preserves the last verified snapshot; it does not label an unverified capture as complete. Close the owned process tree; use OS process handles, groups, or job objects so PID reuse cannot kill unrelated processes.

### 4.2 Operating policies

Policies change lifecycle behavior, not profile identity or security claims. Operators can select and review policy per profile.

| Policy              | Default behavior                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard            | Idle suspension after 30 minutes with pre-suspend capture; due route rotations apply before launch; deliberate changes may restart after confirmation.                       |
| Protected execution | No idle suspension or automatic rotation/restart/update; respect explicit user changes; warn and queue disruptive work. Existing sessions retain their resource reservation. |
| Disposable          | Separate storage, parent settings copied, one-hour default expiry, quarantined downloads, explicit promotion.                                                                |

Protected execution is intended for live trading, long-running research, and sensitive automation. It does not override route loss, a shared lease expiry, OS failure, or an emergency policy already explicitly selected. Route failure always blocks prohibited egress. Never use CPU or RAM priority changes as a promise of zero jitter.

The UI vault locks after 15 minutes of operator inactivity by default. This prevents UI mutations and credential reveal. Existing sessions can continue under their policies, so the application truthfully reports that active browser state and required keys remain accessible to their processes. Full lock saves/closes sessions, clears handles and keys as feasible, and unmounts any dedicated workspace volume. Do not falsely label a UI lock as complete memory erasure.

### 4.3 Routing, providers, and route locking

Every launched profile requires a configured VPN or proxy route. VPNs and proxies are first-class route types; custom SOCKS5, including username/password authentication and changing endpoints, is mandatory. Support HTTP CONNECT proxies as a first-class proxy type alongside SOCKS5. Absence of a route blocks launch. Route lock is enabled by default. Turning it off requires an explicit warning and persists the accepted policy: after an active selected route is lost, direct transport and system DNS may be used. This is never permitted merely because initial route setup failed. Show when direct fallback becomes active and remove the fail-closed claim for that mode. Protected execution never silently disables it.

Each route binding identifies provider account reference, tunnel/device identity, endpoint, allowed DNS path, egress policy, and verification time. The application may explicitly share one tunnel between selected profiles, but must show that sharing in health and the connection map. Never present a shared tunnel as independent routing.

Provider adapters report discoverable capabilities: endpoint catalog, available location/load metadata, authentication method, device registration, credential expiry, and supported rotation. Do not invent public APIs, credentials, load percentages, or an assumed request allowance. Support imported provider-generated WireGuard configurations when automated provisioning is not permitted or available. Hide unsupported controls with an explanation rather than simulate success.

A provider endpoint's ingress IP is not necessarily its exit IP. Route health uses tunnel state, policy state, authenticated endpoint identity, and an observed exit IP through that specific route. IP geolocation is approximate. IP checks cannot prove absence of leaks and are never made before every website request.

Network enforcement precedes navigation and covers the browser's entire owned process tree, DNS, IPv6, QUIC/UDP, WebRTC, service workers, extension traffic, and child processes that can use sockets. Direct connections are denied unless explicitly part of the selected policy. Bootstrap traffic for provider authentication/catalog lookup belongs to the control plane and must use the configured control-plane route, not an undocumented exception for browser traffic.

On route loss, the native boundary blocks first, marks the session route_blocked, then informs the UI. CDP offline emulation is supplementary feedback, not the enforcement boundary. Reconnect requires re-establishment, policy verification, and an explicit resume decision for protected execution. Closing still allows local snapshot/export operations.

Rotation modes remain every launch, every 5/10 launches, hourly, daily, and manual. Apply equivalent scheduling to operator-supplied proxy pools; support changing one SOCKS5 host, port, authentication reference, or pool selection. Count only successfully activated launches. A due rotation normally applies at the next launch; a live protected session queues it. Explicit Rotate Now or Change SOCKS5 explains that sockets and authenticated sites may disconnect. Block new outbound flows, validate the replacement route, close old-route flows, and resume only on the new binding; never mix routes silently. Preserve tabs and storage where supported; explain and confirm a browser restart if the shipped adapter requires one. Failed replacement retains the previous verified binding or remains blocked. If catalog lookup fails, a still-healthy last-known route may be reused with a warning; if enforcement or tunnel health fails, there is no direct fallback while route lock is enabled.

Use ipinfo.io as the selectable default external probe, with icanhazip.com as an optional user-selected simpler probe. Show destination, information disclosed, route used, and configurable diagnostic frequency. Disabling external probes leaves local enforcement active and labels external verification unavailable. At launch, explicit tests, route transitions, and diagnostics may probe; periodic probes default to off.

### 4.4 Fingerprints, WebRTC, and validation

Presets are configuration templates, not claims that Chromium becomes a different engine. Retain the original five template intents: Chromium/Windows, Firefox/macOS compatibility target, Safari/iOS compatibility target, Edge/Linux compatibility target, and Tor-like restrictive target. Display engine limitations alongside non-Chromium targets and preserve imported legacy preset IDs for traceability.

Supported controls include UA/client hints where available, language, IANA timezone, viewport/screen configuration, permitted device properties, stable per-profile settings, and only browser-level Canvas/WebGL modifications that have passed the capability gate. Script-only overrides are not asserted to cover workers, frames, extensions, network/TLS signatures, GPU behavior, fonts, or all observable properties.

Do not randomize fingerprint values on every request. Stable profile settings are versioned; random creation seeds use a CSPRNG. Unique Canvas output can itself be identifying. Validation measures configured versus observed properties, drift, contradictions, and tested leak paths; it does not prove anonymity or universal undetectability.

Base WebRTC policy requests non-proxied UDP restrictions and verifies them. Paranoid mode requires a tested implementation that disables the relevant WebRTC APIs/transports in the shipped browser build, including frames and workers where applicable. A Chromium flag alone is not acceptance evidence. If native patches are necessary, maintain reviewed patches, reproducible builds, and a current upstream security baseline. Sites using video conferencing may fail.

Strict mode admits a due launch only when every required check is pass. Failed, unknown, unavailable, unsupported, missing, and timed-out required checks all block; optional checks remain visible without blocking. Warning mode shows reasons and permits explicit launch; disabled mode skips validation while preserving route enforcement. Offline-capable deterministic local checks run without external contact. External suites are separately selected by the operator; a strict external policy can block offline launch by design.

Use four suite adapters: BrowserLeaks, CreepJS, AmIUnique, and Cover Your Tracks. Each declares collection methods, target identity, expected output, permissions, timeout, and limitations. Tests use disposable validation identities with the managed release build and profile settings; never concurrently open the operational user-data directory.

Run up to four suites concurrently subject to resource and service limits. Default per-suite timeout is 30 seconds and overall deadline 120 seconds, both visible. Rate limits use bounded retry/backoff. Record pass, fail, unknown, unavailable, or unsupported per observation. Retain ten aggregate runs per profile. No universal seven-second promise or made-up uniqueness threshold is accepted.

### 4.5 Encryption and working state

Generate a random 256-bit workspace master key. Derive a passphrase wrapping key with Argon2id and a random salt of at least 16 bytes; use it to wrap the master key with authenticated encryption. Derive domain-separated database and wrapping keys from the master using HKDF-SHA-256. Store algorithm, salt, parameters, and format version in the vault header.

The master KDF target remains 4 GiB, two passes, one lane, with 1–8 GiB selectable. First setup benchmarks without blocking the UI, verifies allocation headroom, and asks the operator to accept the selected parameters. Never silently lower KDF cost. Queue memory-heavy jobs and handle allocation failure cleanly. Maintain native/WASM implementation test vectors and input-size limits.

Snapshots get random 256-bit data keys, random 96-bit AES-GCM nonces, and authenticated metadata binding object ID, original profile identity, revision, and format version. Wrap data keys under a domain-separated workspace/profile wrapping key. Persist only wrapped keys. Rewrap keys on passphrase/key management operations without recompressing every snapshot. UUIDs provide identity; timestamps provide ordering, not key uniqueness.

This deliberately replaces repeated passphrase-based 256 MiB derivation for every snapshot. The retained capability is independently keyed encrypted snapshots with affordable frequent recovery checkpoints. Encryption must preserve nonce uniqueness under each key and reject tag failures before interpreting payloads.

SQLCipher protects the database, not unrelated browser files. Require a protected workspace storage adapter before launching sensitive operational profiles: an operator-controlled encrypted volume/filesystem using supported OS facilities. Supported encrypted-volume detection, mount lifecycle, swap/crash-dump handling, and browser file compatibility are platform gates. Keep working browser state, temporary exports, recovery journals, quarantine, logs, and snapshot staging on that protected storage. A plaintext target is an explicit unprotected mode with a persistent health warning and cannot pass the encrypted-at-rest release claim.

Whole-system disk encryption protects a powered-off/locked device according to the OS; it does not make files unreadable to the logged-in user. A dedicated mount can support stronger full-lock behavior. The UI states the active adapter and lock behavior. Neither SQLCipher nor encrypted snapshots imply protection against an administrator on an unlocked host.

Use system GnuPG with argument-array process spawning and pinentry for PGP operations. Detect availability at launch. If unavailable, quietly select OpenPGP.js for supported operations and show the selected provider in settings. Fallback cannot silently acquire hardware-token keys or private keys held only by gpg-agent. If a selected key is unavailable, explain the missing capability and offer a compatible key/import path. Do not derive or overwrite an existing PGP key's passphrase from the application passphrase.

Settings retain the key import modal with Import from file and Paste key choices. Validate supported key formats and bounded input, preview public fingerprints and intended use, and never log imported key text. Private-key import remains an explicit local operation; no commercial/team service receives it by default.

Credentials use encrypted secret references, never plaintext copies in profile JSON. PGP recipient encryption remains available for VPN credentials; key envelopes bind secret IDs to their recipients. Do not promise native memory locking removes all JavaScript copies, debugger access, or crash-dump exposure. Minimize plaintext lifetimes and explicitly document residual memory risk.

### 4.6 Snapshots, branches, and capsules

Snapshot triggers are baseline, manual, auto_pre_launch, auto_edit, auto_close, auto_pre_restore, auto_pre_merge, auto_pre_suspend, and auto_pre_update. A post-load observation links to the pre-launch checkpoint instead of creating an ambiguous new baseline. All triggers exist in types, schemas, persistence, and logs.

Snapshot storage uses streaming encrypted files in the protected workspace and SQLCipher metadata. Files move from staging to committed by atomic rename and a journaled metadata transaction. Startup reconciles incomplete artifacts. Retain the newest 20 unpinned ordinary snapshots; pinned and update-recovery snapshots are exempt. Pruning starts only after a new snapshot is durably committed. Disk pressure warns; it never silently deletes pinned recovery points.

The payload is a versioned manifest of supported browser files/state, configuration, permissions, extension inventory, and compatibility metadata. Consistent configuration snapshots are available while running. Full session captures use graceful close or a tested browser/OS-consistent mechanism; raw copies of open SQLite/LevelDB files are not declared crash-consistent backups. Browsing state scope includes cookies, storage, IndexedDB where supported, permissions, tabs, extension data, and explicitly stated exclusions. Arbitrary in-memory JS or a server-side authenticated session cannot be guaranteed recoverable.

Restore first captures current recoverable state, validates compatibility and integrity, stages restoration, and atomically switches the profile directory. A failed restore leaves the original and recovery journal intact. Branches retain immutable payload references only where reference-counted storage is safe; their metadata, keys, edits, retention, and future snapshots are independent. Config-only merge never silently overwrites parent cookies or active state.

A capsule is one OpenPGP-encrypted container holding an archive, manifest, object hashes, and a signature over the exact manifest bytes. The manifest and filenames are inside encryption. The outer header contains only format identification and bounded parsing metadata, not profile name, account identity, or content inventory. Signatures authenticate content; signer trust is a separate decision.

Import decrypts into protected staging, validates cryptographic integrity/signature and signer trust, then checks a bounded manifest before extraction/preview. Reject traversal, absolute paths, escaping links, devices, executable hooks, duplicate/conflicting entries, malformed lengths, and decompression bombs. Default limits: 2 GiB encrypted input, 10 GiB expanded content, 100,000 entries; an explicit pre-import override requires resource admission. Capsules never execute content.

Snapshots transferred in a capsule have keys rewrapped to capsule-export material; the recipient rewraps them to its own vault on import. New profile IDs do not break decryption because original cryptographic identities remain authenticated until re-encryption. Credentials are excluded by default; explicitly included secrets must be accessible to intended recipients. Portable session files do not automatically make OS-bound browser secrets or hardware keys portable; document and test those limits.

### 4.7 Logging, diagnostics, and inspection

Flight recorders use encrypted structured segments in protected storage, append-oriented within a segment, with rotation and retention. Cap retained segments at 50 MiB per profile by default; enforce 30/60/90/180-day retention, default 90 days. Rotation/retention means the whole history is not immutable. Team audits have a separate accountability model.

Events cover launch/close/crash, route and policy changes, snapshots, extension changes, memory pressure, automation command types/results/latency, and disposable lifecycle. Exclude tokens, credential values, cookies, form contents, page text, request/response bodies, and script arguments/results by default. URL logging requires explicit opt-in; query/fragment redaction stays enabled unless separately changed.

Use allowlisted event schemas rather than attempting to remove secrets after dumping arbitrary objects. Diagnostic JSON and CSV exports preview sensitive fields and remain local unless the operator sends them. Escape CSV cells that spreadsheet software might treat as formulas.

Health dimensions are network, VPN/proxy, browser, storage/backup/sync, and fingerprint. Show status, evidence time, last successful check, and concrete remedy. A sync section clearly says disabled/local-only when no team service is configured. External tests are never presented as continuously verified after going stale.

The website-inspection panel loads the operator's chosen test endpoint inside a dedicated target context on the profile route. It reports configured, measured, and match/mismatch/unknown properties with provenance. It cannot enumerate cookies or storage from unrelated origins. Permission probing must not grant permissions as a side effect. Keep JS timezone observations distinct from approximate IP geolocation.

### 4.8 Resource governor and performance

Count the complete owned browser process tree, Electron, active helpers, validation, compression, and quarantined/disposable work. Display total host use separately from application use. Default managed-session budget is 80% of physical RAM; per-session soft threshold is 2 GiB. Actual availability, OS reserve, and required overhead can reduce admitted launches.

Queue launches FIFO with resource reservations and cancellation. Do not pretend predicted RAM is exact; show launch estimates and measured use. Warn at per-session thresholds. Standard sessions may save/terminate into suspended state according to policy. OS process freezing alone does not claim to free RAM.

Protected sessions are never automatically evicted to admit new work. Defer heavy diagnostics, compression concurrency, and map/lab work under pressure. The OS can still terminate a process under extreme pressure; surface this limitation. Disposables do not consume saved-profile entitlement slots until promoted, but count toward all physical resource and actual session concurrency limits.

Sample resources every 5 seconds for active dashboards, retain one hour in a bounded ring, and use 30-second sampling when the dashboard is inactive. Release measurements distinguish cached/private/shared memory and document platform differences. Multiple-monitor charts and WebSocket continuity get dedicated benchmark scenarios.

### 4.9 Extensions and capital-sensitive work

Per-profile extension inventory includes ID, version, source, package hash, permissions, update policy, and enablement. Default templates install no extension silently. Recipes request explicit installation approval. High-value profiles use reviewed allowlists and deliberate extension updates; comparison and connection tools reveal shared packages.

The application must not claim that browser isolation validates a transaction, checks a smart contract, prevents clipboard replacement by host malware, or protects an already compromised signer. Wallet signing stays with the selected wallet/hardware and website. Browser-visible permissions, extensions, navigation context, and route are the station's enforceable responsibilities.

### 4.10 Team authorization and synchronization

Roles remain Admin, Operator, and Viewer. Admin manages team, billing references, invitations, grants, and audit export. Operator creates/edits/launches profiles within assigned grants and sees authorized logs. Viewer reads authorized metadata/reports but cannot launch, mutate, extract secret values, or export session credentials. Granting session-state access is explicit and distinct from a generic Viewer role.

Invites are 12-character CSPRNG-generated alphanumeric codes with a 7-day expiry, stored as hashes and atomically consumed once. A QR embeds the team origin, invite, and protocol version. Joining requires verification of the team server certificate/fingerprint through a trusted channel. Rate-limit redemption attempts. Admin may revoke unused codes.

Devices have signing and encryption identities bound during enrollment. Encryption recipients follow grants. Revocation stops future service access and key distribution and rotates keys for future changes; it cannot erase previously downloaded plaintext or keys. Never imply E2EE makes a malicious server or previously authorized device harmless.

Local actions produce signed device audit envelopes queued offline. Service-side sequence numbers, receive times, signature checks, and durable append permissions protect the service audit stream against ordinary member editing. Device event times are untrusted metadata. The service cannot prove every offline action was submitted; show gaps and last synchronization rather than claiming total coverage.

### 4.11 Payments, licensing, and cancellation

Keep one-time, monthly, and annual purchase options; paid profile tiers 10/50/99; subscription team-seat add-ons; Monero, Bitcoin, Ethereum, Litecoin, Stripe cards, and PayPal. Free/trial allowances remain 10 profiles/1 seat/5 requests per second and a 7-day trial with 20 profiles/10 requests per second/100 playground calls. Exact commercial API quotas, seat concurrency allowances, and prices belong to one signed/versioned product catalog and remain unresolved until commercial reconciliation.

Account creation assigns a unique Monero subaddress through the commercial service. Use monerod plus monero-wallet-rpc as the implementation, with Cake Wallet interoperability as a deployment choice, not a claim that Cake Wallet is the RPC daemon. Use authenticated private RPC access. Desktop users see only their address/invoice status.

Poll pending Monero invoices every 2 minutes, require at least 3 reported confirmations under the pinned RPC semantics, and show confirmation count rather than promising a fixed six-minute settlement. Use integer atomic units, record exchange-rate quote and expiry, and allocate each incoming output only once. A static account subaddress does not identify which invoice was paid; allow only one open XMR invoice per account/address, track unallocated outputs, and handle partial/late/overpayments through reconciliation.

After 24 hours stop active checkout polling and mark the invoice expired, while a service reconciliation job continues detecting late payments. Never ignore money received because the checkout window closed. Crypto subscriptions renew with explicit invoices; do not imply automatic wallet debits without a separately authorized mechanism.

Webhook processing validates signatures over raw payloads, deduplicates provider event IDs, persists before acknowledgement, tolerates out-of-order delivery, and reconciles ambiguous states with provider APIs. Logs contain event IDs and sanitized status, not full sensitive payment payloads.

Licenses are signed Ed25519 JWTs with issuer, audience, subject, entitlement ID, family ID, issue time, tier/limits, billing type, and signing-key ID. Pin accepted algorithms and keys; validate claims and format. The original master trust anchor remains stable, with a documented emergency rotation and signed successor-key mechanism. Keep signing secrets in an operator-controlled restricted signer; update signing uses a separate trust domain.

One-time licenses do not expire or require periodic contact after activation. Transfers update commercial authority and issue a replacement license in the same family; an offline old installation may continue using its old signature. State this limitation during transfer. Ordinary migration to a new machine under the same account is not the one allowed ownership transfer.

Subscriptions have signed paid-through times. Cancellation at period end preserves access until that time, then allows seven days of read-only access with export. Thereafter archive profiles without deleting user data; reactivation or a new purchase can restore access subject to the current catalog. The original conflicting 30-day destructive implication is removed. Time rollback detection can flag inconsistent local time but cannot provide tamper-proof offline enforcement.

Billing or license failures never delete operational state, execute orders, or silently terminate protected live sessions. Block new launches/mutations when required; notify existing sessions and require deliberate close/export. Immediate network safety rules still apply. Support transfers for random-ID accounts authenticate through account-controlled device proof rather than requiring an email trail.

### 4.12 Updates and rollback

Updates cover application, browser, driver, helper, and schema compatibility as a release set. Verify signed manifests and artifact hashes before execution. The CDN and GitHub mirror are distribution locations, not trust authorities. Use separate signing material from license issuance.

Provide changelogs, release date, compatibility findings, Install Now, Install Tonight at 03:00 local time, and Skip This Version. Scheduled installation runs only while the app or an explicitly enabled OS scheduler is available and all affected sessions are quiescent. Protected active sessions defer installation and receive a clear pending notice.

Security releases show urgency and a recommended deadline. Preserve export and local inspection. After a critical deadline, block new affected launches under the announced policy; never silently kill existing protected sessions. Offline installations cannot receive unseen notices and have a documented signed offline-update procedure.

Before installation, checkpoint all affected profiles and metadata, preserving those recovery points from ordinary pruning. Never downgrade an in-place browser directory or database after a forward-only migration. Rollback restores a compatible checkpoint in a new working directory, preserves post-update state as a separate recovery artifact, and asks which state to open.

Keep the last three compatible installed release sets, subject to a disk preflight showing actual size; do not promise 900 MB. An external signed bootstrapper records pending/healthy markers and can revert a failed startup without relying on the failed Electron process. Default health deadline is 60 seconds, with diagnostic evidence retained. Rolling back to known-vulnerable versions requires an explicit warning and cannot restore a security guarantee.

## 5. Application requirements US-1 through US-30

Original identifiers are retained for traceability. These are application capabilities with implementation acceptance criteria. A requirement is complete only when its behavior, storage, authorization, errors, and platform acceptance checks agree.

### US-1 — Create an account with a random ID or email

**Purpose:** Choose a recovery/identity arrangement appropriate to the operator.

- Offer a CSPRNG-generated 16-digit numeric ID, kept as a string with leading zeros, or a verified email address. Random IDs identify accounts; knowledge of an ID alone never authorizes account changes, billing access, or team membership.
- Show the generated ID with copy/save and a save warning. The initial one-time presentation must be recoverable from an authenticated local account view; never strand an operator solely because a clipboard copy failed.
- Email verification uses a short-lived, single-use magic link handled by the commercial account service. Initial vault setup separately establishes the local encryption passphrase.
- Assign an immutable internal account UUID. A chosen random identifier remains immutable; email recovery changes require proof of control and are not a profile ownership transfer.
- Provision a unique Monero subaddress and its wallet/account/address indices through the commercial service. Display it in Account/Billing, including a locally generated QR.
- Account setup does not require browsing state to leave the machine. Offline setup creates a local workspace and imports a signed entitlement/account binding; service address provisioning waits for an explicit online commercial action.
- Settings show account type, creation time, account binding, recovery options, and assigned XMR address or its pending status.

### US-2 — Choose a tier, billing type, and payment method

**Purpose:** Purchase capabilities using privacy-oriented crypto or conventional payment.

- Offer paid 10/50/99-profile tiers, one-time/monthly/annual terms, subscription seat add-ons, and one base seat for one-time purchases.
- Keep Monero, BTC, ETH, LTC, Stripe cards, and PayPal. Monero checkout is a release gate, not a placeholder.
- Load totals and entitlements from one versioned product catalog. Pricing reconciliation remains outside this revision; no conflicting v3.0 amount is promoted into a new price.
- Show tier, billing term, seats, currency, fees/quote expiry where applicable, total, paid-through/renewal date, and payment method before approval.
- Generate XMR address/amount QR locally. Card entry uses hosted provider checkout; payment credentials never transit the renderer as merchant secrets.
- Activate only from verified payment evidence and a signed entitlement. Monero requires at least three confirmed blocks under the pinned RPC interpretation.
- Show purchase/refund policy before checkout, preserving the owner's no-refund intent subject to applicable provider and legal obligations.
- Crypto subscription renewal uses invoices and explicit payment; fiat recurring charges follow the authorized provider subscription.

### US-3 — Create profiles with automatic snapshots

**Purpose:** Make configuration changes recoverable without remembering manual backups.

- Creation commits a baseline snapshot before the profile becomes launchable.
- Configuration edits commit auto_edit before mutation; successful launch links its first-load observation to auto_pre_launch; Save & Close commits supported session state as auto_close.
- Snapshot metadata includes object ID, original profile ID, time, trigger, config revision/hash, browser release, supported-state inventory, compressed/encrypted sizes, and integrity metadata.
- Show last committed snapshot and pending/failed checkpoints distinctly. A green indicator requires a verified completed snapshot.
- Retain the latest 20 unpinned ordinary snapshots plus pinned/update recovery points; prune only after durable commit.
- Refuse a protected edit or launch when its mandatory checkpoint cannot complete; explain storage, lock, or crypto failure.
- Enforce saved-profile entitlement atomically and the 99-profile ceiling. Branches and promoted disposables consume slots; active ordinary archived profiles do not evade the total retained-profile cap without an explicit catalog policy.

### US-4 — Restore from snapshot history

**Purpose:** Recover configuration and supported browsing state with a reversible restore.

- Provide a timeline with time, trigger, state presence, size, browser compatibility, pins, and structured differences from the current revision.
- Preview fingerprint, route/proxy, extension, permission, and state changes before confirmation.
- Create auto_pre_restore, stage the selected state, validate integrity, and atomically switch directories/configuration.
- Active sessions require deliberate save/close before restore. Never restore over open browser databases.
- Retain original state on failed restore and show a recoverable operation journal entry.
- Display additions, removals, and modifications with labels as well as green/red/yellow indicators.
- Pin/unpin and export selected snapshots through the encrypted capsule path.

### US-5 — Branch a profile

**Purpose:** Experiment without damaging a working environment.

- Create a named branch with independent identity, configuration, route settings, supported session state, and snapshot timeline.
- Preserve parent ID, branch badge, creation revision, and source snapshot provenance.
- Duplicate or safely reference-count immutable payloads while assigning independent key envelopes and retention ownership.
- Branch edits and pruning cannot change parent state. Creating a branch respects profile limits and disk/resource admission.
- Merge into parent is explicitly config-only by default, shows differences, commits auto_pre_merge, and requires parent closure if affected runtime settings change.
- Discard removes the branch's owned data without deleting shared payloads still referenced elsewhere.
- Promote to standalone removes the operational parent relationship while preserving historical provenance; it does not claim to erase correlation already observed externally.

### US-6 — Configure VPNs and first-class proxies

**Purpose:** Give every profile a deliberate, testable route, including essential SOCKS5 use.

- Route choices are Mullvad VPN, IVPN VPN, Custom SOCKS5, and Custom HTTP CONNECT. VPN and proxy controls have equal access in the profile editor.
- VPN adapters validate supported account/configuration inputs and show available endpoints/location/load only when supplied by a verified provider interface.
- SOCKS5 supports host, port, username/password references, remote hostname resolution, endpoint replacement, and proxy-pool membership. HTTP CONNECT shows its transport encryption and authentication capabilities.
- Provide individual entry and bounded line/JSON proxy import with a preview, clear syntax errors, and masked credentials. Raw imports are not logged or placed into UI persistence.
- Browser-facing local gateways handle upstream proxy authentication where Chromium lacks the needed mechanism. Native enforcement prevents bypass and local DNS leakage.
- Encrypt provider/proxy secrets; persist secret IDs in configurations. Allow per-profile and confirmed bulk route changes.
- Test Connection exercises the actual selected route, remote resolution, authentication, egress observation when enabled, and measured latency.
- Missing route or failed mandatory enforcement blocks launch with an actionable error. SOCKS5 routing by itself does not encrypt unencrypted application traffic; show the distinction.

### US-7 — Lock traffic to the selected network route

**Purpose:** Prevent accidental direct-IP fallback when the required VPN/proxy route fails.

- Route lock defaults on per profile; disabling it identifies the exact fallback permitted and requires a clear warning.
- Install native enforcement before browser launch. Cover startup, established flows, IPv4/IPv6, DNS, UDP/QUIC, WebRTC, extensions, and child processes.
- Tunnel, upstream proxy, enforcement, or identity failure blocks prohibited traffic without waiting for an external IP check.
- Mark route_blocked and show provider/proxy, reason, timestamp, and Reconnect/Close actions.
- Reconnect validates replacement containment before resuming; protected execution requires explicit resume after disruption.
- Record route-lock events without credentials. Packet-capture failure tests are required on every advertised OS.
- An unverifiable or unsupported native adapter cannot claim route-lock support or silently launch as protected.

### US-8 — Rotate or change VPN/proxy/SOCKS5 endpoints

**Purpose:** Control endpoint changes while preserving explicit operational continuity.

- Offer every launch, every 5/10 successful launches, hourly, daily, and manual scheduling.
- Show remaining successful launches or next due time, pending changes, and the current endpoint.
- Provide Rotate Now, Change SOCKS5, and pool selection on both individual and bulk workflows.
- Stage and test replacement settings before binding them. Stop old-route traffic before resuming new-route traffic; retain browser state where supported.
- Explain disruption to existing sockets, authentication, location, and open trading terminals. Protected active sessions defer scheduled changes; explicit changes require confirmation.
- If rotation fails, retain a healthy previous route with a warning or stay blocked; never silently fall back to direct networking.
- Log route reference, revision, timing, and result with secrets removed. Respect provider/proxy pool exhaustion and device limits.

### US-9 — Use paranoid WebRTC mode

**Purpose:** Disable WebRTC exposure for profiles that do not need it.

- Provide base and paranoid modes per profile, with the video-conferencing compatibility warning.
- Base requests restricted UDP handling and verifies observed behavior; paranoid requires tested API/transport disabling in the actual browser release.
- Never accept an unrecognized/no-op flag as proof of disabling.
- Test top-level pages, frames, relevant worker contexts, extension behavior, IPv6, and route failure.
- External BrowserLeaks validation is optional and explicit; a deterministic local leak harness is mandatory for release checks.
- Standard and paranoid profiles can run together with independent settings.

### US-10 — View health and run diagnostics

**Purpose:** Identify whether a failure belongs to routing, browser, storage/sync, or configuration.

- Show green/yellow/red plus unknown/not-tested status with text and accessible icons.
- Provide network, VPN/proxy, browser, storage/backup/sync, and fingerprint sections with time, evidence, and actionable remedy.
- Include route enforcement health, proxy authentication, actual build availability, last verified checkpoint, disk quota, and sync state if configured.
- Warn at 80% profile storage quota and block storage-expanding operations at a documented safe reserve; 95% is a red warning rather than a promise that writes are safe.
- Run Full Diagnostic streams progress and marks skipped, timed-out, unavailable, and failed tests accurately.
- A protected session can defer disruptive diagnostics; local read-only checks remain available.
- Export a sanitized JSON report locally, previewing identifiers and optional sensitive fields.

### US-11 — Record a session flight recorder

**Purpose:** Explain failures without collecting browsing content by default.

- Maintain per-profile encrypted JSONL-equivalent segments, capped at 50 MiB retained, with default 90-day retention and 30/60/90/180-day choices.
- Record launch/process identity, route changes, crashes, snapshot operations, extensions, resource warnings, automation command class/result/latency, and disposable events.
- Exclude URLs, cookies, forms, secrets, command arguments, and page content by default.
- URL logging is explicit opt-in; redact query/fragment by default and show when enabled.
- Provide timeline filters for time, event type, severity, and safe searchable details.
- Export sanitized CSV with formula-cell escaping and a preview of optional identifiers.
- Segment rotation and retention are crash-safe. Local logs are diagnostics, not an immutable proof of all actions.

### US-12 — Organize profiles with folders, tags, and saved filters

**Purpose:** Keep large workspaces navigable.

- Provide nested folders, drag/drop movement, sibling ordering, counts, and cycle prevention.
- Tags remain independent of folders, with eight preset colors and accessible non-color labels.
- Combine folder, tag, health, route, activity, and archive filters using explicit AND/OR groups.
- Save named filter expressions, including Action needed and Needs rotation.
- Enforce profile visibility grants before calculating lists/counts in a shared workspace.
- Persist organization in the encrypted workspace and explicitly shared team metadata; do not leak sensitive names into plain UI preferences.
- Bulk moves and tagging use journaled operations with per-profile outcomes.

### US-13 — Navigate a visual workspace and command palette

**Purpose:** Arrange and reach operational environments without endless scrolling.

- Provide list/card/map views, stable operator-defined positions, compact labels, zoom, pan, and health/activity badges.
- Use a manual 2D layout for workspace positions; a continuously running force simulation must not rearrange the operator's saved workspace.
- Save positions in encrypted workspace data and sync only when explicitly shared.
- Cmd/Ctrl+K searches names, tags, folders, recent use, and unhealthy status using local indexed/fuzzy matching.
- Enter focuses an active session or initiates the normal admitted launch flow; never bypass authorization, route checks, checkpoints, or resource limits.
- Export layout JSON with a preview of profile names/tags and a warning that it is plaintext unless exported in a capsule.
- Provide keyboard navigation and a list fallback for map actions.

### US-14 — Apply bulk operations

**Purpose:** Change many profiles with predictable partial outcomes.

- Support checkboxes, Shift-range selection, selected counts, and Delete, Export, Change VPN/Proxy, Rotate/Change SOCKS5, Tag, Move, and Archive actions.
- Preview the affected profiles, active/protected sessions, restart implications, and required checkpoints.
- Process a bounded queue with visible progress and cancellation between per-profile transactions.
- Each profile operation is atomic. Successful changes remain; failures restore that profile's pre-operation state; unstarted items remain unchanged.
- Cancellation does not pretend committed successes were undone. Offer explicit restore operations from checkpoints if the user wants reversal.
- Protected active sessions remain queued until explicit disruption approval.
- Record aggregate and per-profile outcomes with IDs and sanitized reasons; allow retry of failed items.

### US-15 — Monitor resources and govern launches

**Purpose:** Keep active work responsive under constrained hardware.

- Display application/host RAM separately, CPU, active sessions, limits, and complete per-profile process-tree measurements.
- Default managed-session RAM budget is 80% physical RAM with headroom checks, a 2 GiB per-session soft threshold, and FIFO launch admission.
- Show an exceed-budget explanation with Queue/Cancel and safe close/suspend options.
- Standard idle sessions may save/terminate after 30 minutes; protected execution sessions do not auto-suspend.
- Include one-hour graphs and sorting by resource use; samples remain bounded and do not trigger telemetry.
- Count disposables, validation, labs, and helper/crypto overhead in actual resource use.
- Resume uses a verified saved state and normal route admission; distinguish resume from continuous execution.

### US-16 — Configure fingerprints with presets and overrides

**Purpose:** Create stable, deliberate observable browser configurations.

- Retain all five original preset intents and a custom configuration mode, with versioned IDs and supported-engine labels.
- Fields include UA, client hints when supported, platform target, language(s), IANA timezone, screen/viewport, Canvas seed/policy, WebGL policy/vendor/renderer, hardware concurrency, DNT, and WebRTC policy.
- Import custom JSON with bounded Zod validation and a human-readable preview.
- Warn on contradictory configurations such as mobile UA with unsupported desktop engine behavior.
- Test Fingerprint launches a separate test identity using the actual managed build and route, then reports measured observations.
- Show unsupported controls explicitly. Do not imply Firefox/Safari/Tor equivalence, or that a unique Canvas hash proves reduced trackability.
- Version changes create a checkpoint and a reproducible diff.

### US-17 — Validate against multiple suites

**Purpose:** Find drift, contradictions, and tested leak paths before operational use.

- Retain BrowserLeaks, CreepJS, AmIUnique, and Cover Your Tracks adapters with explicit destination disclosure and resource-aware concurrent execution.
- Use the operational release's browser engine, fingerprint settings, route policy, extensions policy where safe, and deterministic local harness.
- Never open one user-data directory in four browser processes or submit operational cookies to test services.
- Report per-property evidence with pass/fail/unknown/unavailable/unsupported, test version, route, browser version, and configuration hash.
- Strict mode defaults on for required local checks. Every required due observation must pass; inconclusive or unsupported checks block too. External checks are enabled deliberately.
- Warning and disabled modes remain available with truthful status. Schedulers support every 1/5/10 successful launches or manual.
- With interval 5, baseline validation precedes the first launch and the next due check precedes launch 6; persist counters only on successful activation.
- Retain the last ten aggregate runs. External DOM changes/rate limits become adapter errors, not fabricated failures or scores.

### US-18 — Compare environments in the lab

**Purpose:** Inspect differences across two to five selected profiles.

- Provide labeled live panes with shared address input, per-pane route/health status, and normal launch authorization/resource admission.
- Keep remote web content out of privileged Electron UI. Panes use a private authenticated local frame/input bridge to the separate Chromium targets.
- Preserve scrolling synchronization on by default and action replication off by default, with visible state and an enabling warning.
- Replicate bounded input events through profile-scoped CDP; prevent feedback loops, credential/token transfer, and cross-profile clipboard leakage.
- Pixel comparisons require equal capture dimensions and expose pixelmatch color sensitivity separately from the default 5% changed-area alert threshold.
- Structural comparisons use accessibility snapshots plus documented DOM/text extraction where needed; inaccessible frames and hidden semantics are marked unknown.
- Support dynamic-region exclusions, wait conditions, and deterministic fixtures to reduce false positives.
- Save/re-run named tests with URL, profile IDs, capture policy, expected differences, and last outcomes. Stored URLs/screenshots are sensitive local data and shared only explicitly.
- Protected trading sessions are excluded from synchronized inputs until explicitly approved. The lab does not promise safe cross-account order replication.

### US-19 — Export and import encrypted capsules

**Purpose:** Transfer recoverable profile data with integrity and provenance.

- Wizard selects configuration, supported session state, snapshots, and optional logs; credentials remain excluded unless separately approved.
- Select a GnuPG recipient or paste an OpenPGP public key; choose a signing key and show its fingerprint.
- Encrypt the entire manifest/archive/signature package; no plaintext profile manifest sits beside the ciphertext.
- Sign the exact manifest, including content hashes, format version, browser/schema versions, provenance, and export time.
- Import authenticates/decrypts in protected staging, verifies signature and signer trust, rejects unsafe archives, then previews compatibility and content.
- Duplicate identity offers import under a new UUID or merge snapshots only. Never silently overwrite a running profile or execute imported hooks.
- Rewrap keys for the destination; preserve authenticated original identities until payload re-encryption.
- Show unsupported OS-bound browser credentials, missing private keys, insufficient disk, malformed data, and unsigned/untrusted signers as distinct results.

### US-20 — Visualize connections between profiles

**Purpose:** Reveal shared resources and possible correlation paths.

- Provide D3 force-directed nodes with health/folder labels and selectable edge types.
- Retain VPN endpoints, extensions, download paths, ancestry, and cookie-domain overlap; add proxy endpoint sharing as the same network-resource category.
- Normalize domain/path/resource identifiers and show evidence timestamp and source state freshness.
- Label cookie-domain overlap as domain overlap, not proof that cookie values, identities, or actual storage are shared.
- Hover explains the resource; selection highlights connections; filters and grouped edges keep 99 profiles usable.
- Keep the complete underlying graph; aggregate dense edges for rendering instead of silently dropping analysis above 500 edges.
- Actions retain Separate routes, Remove extension, Create standalone copies, and Remove selected domain cookies. Each previews consequences and checkpoints affected profiles.
- Separate routes respects provider/pool capacity. Removing overlapping-domain cookies is deliberate deletion, not a claim to eliminate all correlation.
- Export full graph JSON with explicit metadata disclosure and optional capsule protection.

### US-21 — Inspect what a website can observe

**Purpose:** Compare configuration with measured observations and detect drift.

- Load an operator-selected test endpoint through the profile's route in a dedicated inspection target; provide a self-hostable example.
- Display configured/measured/status/provenance for UA, platform, languages, viewport, timezone, permissions, origin-scoped storage, Canvas/WebGL where tested, external IP, and tested WebRTC behavior.
- Do not enumerate other origins' cookies or storage or trigger permission grants simply to inspect them.
- Distinguish JS timezone from IP-geolocation estimates and unsupported from matching.
- Record changes between inspection runs in a dedicated inspection history, not in an invented third-party test score.
- Clicking a property explains its setting, measurement method, coverage, and corrective action.
- Export sanitized JSON locally; never display anonymity confidence percentages.

### US-22 — Save recipes and maintain templates

**Purpose:** Reuse proven configurations without cloning sensitive identities accidentally.

- Save name, description, category, version, fingerprint target, route policy, extension inventory, bookmarks, permissions, and network settings.
- Categories remain OSINT, Client Work, Development, Shopping, Testing, and Custom.
- Exclude cookies, account credentials, wallet secrets, session tokens, and private proxy passwords by default. Secret references become unresolved bindings on another workspace.
- Provide library cards, filtering, create-from-recipe, preview/customization, and versioned provenance on created profiles.
- Recipe updates notify affected profiles, show differences, and apply only after confirmation with a checkpoint.
- Require explicit extension-installation approval and source/hash checks.
- Import/export bounded versioned JSON with schema validation; show that plaintext recipe files may reveal endpoints and bookmarks.

### US-23 — Launch disposable child sessions

**Purpose:** Inspect unfamiliar content separately from saved operational state.

- Inherit the parent's configuration/fingerprint and chosen route by explicit copied references, with separate storage and permissions.
- Display DISPOSABLE, parent, actual shared route, resource use, and expiry; default one hour with 30-minute/1-hour/2-hour/24-hour choices.
- Downloads land in a per-child protected staging area, never one shared deleteable global folder.
- Complete downloads through a broker-owned writable staging path, then apply restricted access and record hashes/metadata. A deny-all directory is not used as Chromium's writable destination.
- An access-control or platform quarantine failure is a visible blocking/warning state according to the selected download policy; it is not reported as quarantined.
- Promote copies a consistent state into a newly admitted saved profile with a new ID; preserve the disposable for review. File release separately requires explicit destination/action.
- Discard terminates owned processes and removes only that child's storage after confirmation. Cleanup journals permit safe retry without touching siblings.
- Expiry blocks further browsing and prompts Review/Extend or Discard. App close presents a list before discard; abnormal shutdown leaves a recovery/cleanup notice on next launch.
- No saved-profile slot is consumed until promotion, but resource/concurrency limits always apply. Log creation, promotion, expiry, and discard.

### US-24 — Invite team members with codes or QR

**Purpose:** Make collaboration available without requiring email invitations.

- Admin generates Operator/Viewer invitations with cryptographically random 12-character alphanumeric codes, seven-day expiry, and QR display.
- Store invite hashes and event metadata; do not persist raw code/QR unnecessarily.
- Join through a verified self-hosted team origin; bind account/device identity and role in an atomic single-use redemption.
- Show invalid, expired, revoked, used, seat-full, and server-unavailable errors without account enumeration.
- Admin can list status and revoke unused invitations. Redemption is rate limited.
- Membership and grants determine access; joining never automatically decrypts every profile or reveals VPN/proxy credentials.
- Team capability is part of ecdys. Single-user operators do not need to deploy or contact a team service.

### US-25 — View and export team audit records

**Purpose:** Provide accountability for collaboration with explicit coverage limits.

- Admin-only audit view filters actor, action, date range, profile, device, and synchronization state.
- Record service membership/grant changes, invites, lease transitions, and submitted signed profile/session operation envelopes.
- Provide server sequence, receive time, reported device time, actor, action, profile ID, and sanitized details.
- Retain 90 days by default with team-configurable policy. Encrypted/shared content does not require copying cookies or script arguments into audit records.
- Offline device records queue for later submission; display last received state and gaps rather than claiming complete observation.
- Export all authorized team records as formula-safe CSV. Operator/Viewer access follows their log grants and excludes Admin-only audit administration.
- Service maintenance, signing-key change, retention, and export actions are audited.

### US-26 — View allowances and manage renewal

**Purpose:** Make current entitlements, renewals, and limits predictable.

- Display tier, billing type, seats, price from catalog, paid-through/renewal date, masked payment reference, XMR invoice/address where relevant, and last verified status time.
- Show saved-profile usage, seat usage, configured API allowance/reset, and actual session/resource limits separately.
- Warn at 80% profile allowance and 95% of a configured API allowance; show a renewal reminder seven days before an online verified renewal.
- Email reminders require an email account and consent; random-ID accounts receive in-app notices without invented email delivery.
- Cancel at period end, retain paid access, then seven-day read-only/export grace, then non-destructive archive.
- Allow provider-supported reactivation before expiry; after a cancelled subscription is no longer renewable, offer a new purchase without deleting local data.
- Change payment method through the correct provider flow. Switching to Monero creates a manual invoice arrangement rather than silently retaining fiat auto-debit.
- Offline billing shows cached signed entitlement and stale commercial status. Offline operation remains a built-in feature, not a separate product edition.

### US-27 — Request a one-time ownership transfer

**Purpose:** Change the account owning a one-time license once.

- Billing offers transfer only for eligible one-time license families; ordinary same-account device migration is separate.
- Prepare a local support request with account ID, masked license reference, destination, optional reason, and irreversibility acknowledgement.
- Support validates account/device proof, destination ownership, license family, prior transfer, and conflicting entitlements. A random ID or email sender alone is insufficient proof.
- Track the one-transfer limit across the entire license family, including the newly issued license; issuing a new JWT does not reset eligibility.
- Issue the destination's signed entitlement and mark the authoritative old entitlement transferred. Connected old clients enter seven-day read-only/export mode, then archive.
- Explicitly disclose that a permanently offline old installation cannot be immediately revoked; do not imply remote erasure or universal enforcement.
- Send receipts through authenticated in-app/support retrieval, and email only where available and authorized.
- Show transfer available/used and date. The station does not transmit a support request automatically.

### US-28 — Control updates and recover previous versions

**Purpose:** Maintain supported software without unplanned interruption or destructive downgrade.

- Show release-set versions, current/available browser and driver, release date, signed changelog, and compatibility results.
- Offer Install Now, Install Tonight, Skip, and manual signed offline installation.
- Announce critical updates, recommended deadline, and any future new-launch restrictions; preserve export and current protected sessions.
- Commit pre-update profile and database checkpoints before migrations. Defer installation while affected sessions remain active.
- Keep three compatible prior release sets with real disk-size reporting.
- Rollback uses staged compatible copies and preserves newer state for recovery; never downgrade live directories in place.
- External bootstrapper verifies health and reverts failed startup while preserving diagnostics and state.
- Explain vulnerable-version and schema compatibility limits before rollback.

### US-29 — Control sessions using authenticated Selenium

**Purpose:** Make real browser automation reliable and diagnosable.

- Expose a copyable numeric-loopback gateway URL and session-scoped Bearer token; keep raw driver/CDP endpoints private.
- Support W3C session creation/claim, navigation, screenshot, element lookup, script execution, alerts, window operations within declared compatibility, and orderly quit.
- Use matched ChromeDriver; report attach-mode limitations honestly. One writable automation owner at a time prevents conflicting sessions.
- Authenticate every control request at the gateway. Never insert its token into website headers, URLs, navigation state, or flight recorder contents.
- Paid/trial rate limit defaults to 10 accepted commands per rolling second per managed session; free defaults to 5. Return 429 and Retry-After without executing excess commands.
- Return sanitized 401 invalid token, 403 unauthorized scope, 409 ownership/state conflict, 503 unavailable/crashed/route-blocked, and W3C-compatible unsupported-command errors.
- Publish Python/Node.js transport-authenticated examples, screenshots/text/alerts/error handling, and a Test Integration action against an operator-selected target.
- Log command class, request ID, result, and latency; omit arguments/results by default. API entitlements do not override route or resource controls.

### US-30 — Test automation before purchase

**Purpose:** Exercise the station's automation integration without committing to a paid plan.

- Keep free 10-profile/one-seat/5 requests-per-second access and a seven-day trial with 20 profiles, full 10 requests per second, and 100 playground calls.
- Create a temporary one-hour playground identity, admitted through the same route and resource rules; do not silently contact a test site without showing the destination.
- Provide executable browser JavaScript examples using a restricted command bridge, plus Python/Node.js tabs clearly labeled external-client examples with download/copy instructions.
- Run worker code with no Node integration and a separate restrictive CSP/origin. Keep Bearer tokens in the trusted broker, not user code.
- A dedicated worker has no preload IPC or network authority. The owner renderer supplies only validated command messages scoped to the temporary identity; the main process enforces them again.
- Provide hard run deadlines, cancellation, bounded console output, CPU/memory limits where enforceable, and termination on expiry.
- Simulate proxy failure, rate limit, and invalid commands through deterministic fixtures; do not create real network leaks to demonstrate failure.
- Display quota/expiry honestly, offer upgrade using the catalog, and keep trial profiles exportable as capsules.
- Do not advertise native Python or Node.js execution in a WebWorker. Adding those runtimes later requires an explicit separate runtime design.

## 6. Data and interface contracts

The normative entity inventory, states, invariants, and versioned JSON shapes are in [DATA-CONTRACTS-v4.0.md](specs/DATA-CONTRACTS-v4.0.md). Implement migrations from those contracts; do not transplant v3.0's unscoped local tables into a multi-device service.

### 6.1 Ownership and storage domains

| Domain             | Authority and data                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local vault        | Workspace, local identities, profiles, revisions, folders/tags, recipes, snapshots, secret envelopes, sessions, inspections, comparisons, jobs, release checkpoints. SQLCipher and encrypted object files. |
| Team service       | Teams, memberships, device public keys, grants, invite hashes, encrypted objects/envelopes, revisions, leases, audit stream. PostgreSQL plus encrypted object storage.                                     |
| Commercial service | Accounts, verified recovery bindings, product catalog, invoices, output allocations, subscriptions, entitlement/license families, signing metadata, transfers, webhook receipts. PostgreSQL.               |
| Ephemeral runtime  | Unwrapped working keys, gateway tokens, live driver handles, route sessions, scoped playground channels. Do not persist reusable gateway Bearer tokens in the session table.                               |

Use UUIDs, UTC integer milliseconds, explicit schema versions, foreign keys, and parameterized queries. Account IDs and amounts are strings where numeric precision or leading zeros matter. Monetary amounts use integer minor/atomic units plus currency and quote metadata, never floating point.

### 6.2 Transaction and compatibility rules

- All profile writes carry expectedRevision; stale changes return a conflict with the current revision. One coordinator owns a local profile mutation at a time.
- Shared writes also carry an execution/edit lease and fencing token validated server-side. Leases use service time and a monotonically increasing fence.
- File/database changes use operation journals with prepared, committed, rolled_back, and needs_recovery states. Deletion and pruning respect reference counts and recovery ownership.
- Browser, snapshot, capsule, recipe, schema, and update compatibility versions are independent. Unknown future formats fail with an export-preserving explanation rather than best-effort mutation.
- Secret references, not decrypted values, cross routine configuration IPC. Renderer credential entry is transient and never saved to DOM logs or localStorage.
- Derived connection edges are cacheable analysis, not authoritative proof of identity linkage.

### 6.3 Public local interfaces

The preload bridge exposes typed operations for profiles, lifecycle, routes/proxies, snapshots, recipes, diagnostics, resources, maps, comparison, capsules, automation, billing, team enrollment, and updates. Every mutation includes caller authorization, expected revision where applicable, and a request ID.

The native helper contract exposes prepareRoute, verifyRoute, launchContained, replaceRoute, blockRoute, terminateOwnedTree, and releaseRoute. Handles are opaque, caller-bound, and revocable. There is no generic runCommand, evaluate, unrestricted file read, or arbitrary route-table mutation endpoint.

The local automation gateway exposes W3C WebDriver routes for one managed session. Desktop control IPC is distinct from WebDriver. Gateway host/port changes create new tokens; session closure invalidates them.

Service APIs are HTTPS JSON under /v1 with authentication, object-level authorization, bounded request bodies, schema validation, and idempotency keys for payment/invite/sync operations. Team object uploads have size/hash checks; downloads and key envelopes are grant checked. No public service endpoint receives browser CDP commands.

## 7. Technical examples

Examples specify the corrected integration shape. They are not proof that an unbuilt ecdys gateway works. Pin supported Selenium versions in release CI and run both languages against the shipped gateway before publishing them as tested.

### 7.1 Transport-authenticated Python Selenium

Complete syntax-checkable source is [selenium_python.py](examples/selenium_python.py). It uses Selenium ClientConfig Bearer authentication for the connection to the gateway, not page request headers.

    from selenium import webdriver
    from selenium.webdriver.remote.client_config import AuthType, ClientConfig
    from selenium_python import PacingConnection

    config = ClientConfig(
        remote_server_addr=endpoint,
        auth_type=AuthType.BEARER,
        token=token,
        timeout=30,
    )
    connection = PacingConnection(client_config=config)
    driver = webdriver.Remote(
        command_executor=connection,
        options=webdriver.ChromeOptions(),
    )
    try:
        driver.get(target_url)
        print(driver.title)
        driver.save_screenshot(output_path)
    finally:
        driver.quit()

This excerpt uses PacingConnection from the complete example. It serializes requests with 250 ms between completed commands, including startup/cleanup, so the sample fits the free five-per-second allowance without retrying browser actions. The complete example validates the numeric-loopback endpoint, reads the token from the process environment, avoids shell command substitution, and keeps local control traffic out of environmental HTTP proxies. It does not set debuggerAddress to a WebDriver port or call Network.setExtraHTTPHeaders.

### 7.2 Transport-authenticated Node.js Selenium

Complete source is [selenium_node.cjs](examples/selenium_node.cjs). It supplies a custom Selenium HTTP client that adds Authorization to control requests.

    // BearerClient is defined in the complete linked example.
    // It paces requests and adds Authorization only on the control transport.
    const executor = new Executor(new BearerClient(endpoint, token));
    const driver = WebDriver.createSession(executor, {browserName: 'chrome'});

Restrict the gateway to non-redirecting control responses. Token values are never printed, included in target URLs, or installed in the managed browser's request headers.

### 7.3 Playground bridge

Worker code receives a small API such as navigate, findText, screenshot, and print. Each call becomes a message containing runId, sequence, command, and bounded arguments. The trusted broker supplies the implicit session identity and token. The main process checks schema, scope, active run, deadlines, resource state, route readiness, and quotas again.

Workers do not get a generic IPC bridge or raw filesystem/CDP functions. Block direct fetch, XHR, WebSocket, imports, and nested-worker escape paths using a dedicated origin/CSP and a reviewed interpreter/runtime boundary. Ordinary WebWorkers alone are not a complete arbitrary-code sandbox. A capability-isolated JS interpreter in the worker is the default executable runtime; host callbacks expose only the small API. Prove this boundary before claiming confinement.

### 7.4 Snapshot flow

    capture consistent state or declare config-only scope
      -> create random object ID + random data key + nonce
      -> canonical manifest + stream archive
      -> gzip level 9 in bounded worker
      -> AES-256-GCM with authenticated header
      -> wrap data key under the profile wrapping key
      -> write staging file + durable journal
      -> atomic publish + metadata commit
      -> prune eligible unreferenced ordinary snapshots

Restoration checks authentication and resource bounds before deserializing or decompressing large payloads. For large objects, use bounded authenticated chunks with unique keys/nonces and a final authenticated manifest, or spool the ciphertext and verify its tag before decompression. Do not emit unauthenticated plaintext into extraction.

### 7.5 Monero invoice flow

    authenticated account -> commercial service creates one open invoice
      -> wallet RPC assigns/looks up account subaddress
      -> quote amount in atomic units + address + expiry
      -> poll incoming outputs every two minutes
      -> verify account/subaddress, output identity, amount, confirmations
      -> allocate each output once in a database transaction
      -> mark paid and enqueue restricted signer job
      -> signed entitlement delivered idempotently

Use at-least-once background jobs with idempotent settlement. Never issue a new license merely because get_transfers returned an old incoming transaction above the requested amount.

## 8. Milestones and dependencies

### 8.1 Schedule policy

Retain all 23 milestones M0–M22 and all 30 requirements. The original 32-week schedule remains a planning baseline requiring staffing, native-platform feasibility, provider credentials, release signing, and measured estimates. It is not a fixed delivery guarantee.

Each milestone ships a reviewable capability plus tests and documentation. Security and native integration work begins with foundation; it is not deferred until M21. Independent work can proceed concurrently when interfaces are established, but billing, snapshots, routes, and shared authorization cannot be mocked through release acceptance.

### 8.2 Delivery sequence

| Milestone                                  | Baseline window | Required deliverable and exit evidence                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Foundation and feasibility              | Weeks 1–2       | Monorepo, Electron boundaries, vault header/SQLCipher, local signup, native route/storage prototypes on all target OSes, private driver transport, commerce account/XMR testnet path, team topology. Exit: demonstrate feasibility or record a blocking platform constraint with preserved requirement. |
| M1 Profiles and encrypted snapshots        | Weeks 3–4       | CRUD/revisions/limits, consistent baseline/edit/close snapshots, keys/envelopes, protected storage paths, crash journal/pruning. Exit: recover a known fixture after a forced application crash.                                                                                                        |
| M2 Restore and branching                   | Week 5          | Timeline, structured config diffs, independent branches, config merge, reversible restore. Pixel/DOM comparison engines are integrated in M11, not falsely completed here.                                                                                                                              |
| M3 VPNs, proxies, SOCKS5 switching, WebRTC | Weeks 6–7       | Actual Mullvad/IVPN routes, mandatory authenticated SOCKS5 and HTTP CONNECT, imports/pools, atomic route changes, fail-closed boundary, verified WebRTC controls. Exit: packet-capture failure matrix on every advertised platform and provider-capacity evidence.                                      |
| M4 Health and diagnostics                  | Week 8          | Five health dimensions, stale evidence, proxy diagnostics, sanitized exports, background-contact controls. Exit: actionable results for deterministic failed dependencies.                                                                                                                              |
| M5 Fingerprints and validation             | Weeks 9–10      | Supported controls/presets/custom import, deterministic local harness, four external adapters, policy modes/history. Exit: actual managed build/route tested, unsupported controls visible, no fabricated scores.                                                                                       |
| M6 Session management and Selenium         | Weeks 11–12     | Real authenticated W3C gateway, private driver/CDP, process ownership, lifecycle/error cleanup, Python/Node examples. Exit: transport auth, no token sent to target site, rates enforced, owned-tree cleanup.                                                                                           |
| M7 Resources and continuity                | Week 13         | Process-tree metrics, launch reservations, suspension/resume, protected execution, chart/WebSocket fixtures. Exit: saturation cannot evict or restart protected work silently.                                                                                                                          |
| M8 Flight recorder                         | Week 14         | Encrypted bounded segments, redaction, URL consent, retention, safe CSV. Exit: planted test secrets never appear in default records/exports.                                                                                                                                                            |
| M9 Organization and workspace              | Weeks 15–16     | Folders, tags, filters, map, command palette, layout export, keyboard paths. Exit: 99-profile workspace remains navigable without data leakage in UI prefs.                                                                                                                                             |
| M10 Recipes                                | Week 17         | Versioned templates, approved extension provisioning, updates/diffs, safe JSON import/export. Exit: no silent credential or identity cloning.                                                                                                                                                           |
| M11 Environment lab                        | Week 18         | Two-to-five private live panes, shared URL, sync scrolling/actions, pixel/structural diff, exclusions, saved comparisons. Exit: bounded-resource fixture comparisons and no privileged remote-content embedding.                                                                                        |
| M12 Website inspection                     | Week 19         | Self-hostable endpoint, measurement provenance, origin limits, drift history, JSON export. Exit: JS timezone/IP geolocation and unavailable observations remain distinct.                                                                                                                               |
| M13 Connection map                         | Week 20         | Full underlying graph, grouped rendering, VPN/proxy/extension/path/ancestry/domain edges, previewed actions, JSON export. Exit: distinguish domain overlap from actual shared identity.                                                                                                                 |
| M14 Capsules                               | Week 21         | Encrypted metadata, signatures, safe extraction, conflict handling, key rewrap, cross-machine fixtures. Exit: tampered, hostile, incompatible, and untrusted imports handled correctly.                                                                                                                 |
| M15 Disposables                            | Week 22         | Separate storage/routes, brokered downloads, per-child quarantine, promotion, expiry/cleanup. Exit: one child's discard cannot affect another or its parent.                                                                                                                                            |
| M16 Bulk operations                        | Week 23         | Journaled bounded queue, atomic per-profile change, cancel/retry, protected-session handling. Exit: partial failures leave each profile in a documented state.                                                                                                                                          |
| M17 Payments and subscriptions             | Weeks 24–25     | All six payment choices, catalog, Monero confirmed settlement/reconciliation, webhook replay/order handling, signed offline entitlements, cancellation/grace. Exit: testnet/sandbox payment end-to-end with no merchant secret in desktop.                                                              |
| M18 Transfers and support                  | Week 26         | Proof-based request, license-family transfer cap, offline revocation disclosure, receipts. Exit: new JWT cannot reset the one-transfer limit.                                                                                                                                                           |
| M19 Updates and rollback                   | Week 27         | Signed release sets, offline bundles, compatibility, checkpointing, protected deferral, external recovery bootstrapper. Exit: failed update and forward-only migration recover without in-place downgrade.                                                                                              |
| M20 Automation playground                  | Week 28         | Isolated JS runtime, external Python/Node examples, quotas, fixture errors, cancellation, trial portability. Exit: isolation probes cannot gain network/filesystem/token access.                                                                                                                        |
| M21 Integrated hardening                   | Weeks 29–30     | Cross-platform fault injection, full recovery/sync/payment/security matrix, measured performance, independent review. Team implementation from M0 onward must satisfy US-24/25 and sharing/lease/key contracts by this gate.                                                                            |
| M22 Documentation and release              | Weeks 31–32     | Complete guides/examples, signed/notarized builds, published manifests/checksums, user-reviewed commercial catalog, support process. Exit: every requirement has release evidence and supported-platform scope is truthful.                                                                             |

### 8.3 Team capability workstream

Team work is not hidden inside a late testing milestone. M0 defines enrollment, keys, grants, leases, and sync interfaces; M1–M2 implement versioned objects/conflicts; M6 implements fenced execution; M8 implements signed audit ingestion; M9 implements scoped workspace visibility; M17 enforces seats; M18 verifies support permissions. M21 validates the complete end-to-end feature.

### 8.4 Release-blocking feasibility gates

- **G1 Native routing:** Distinct simultaneous routes, fail-closed enforcement, helper/process failure, DNS/IPv6/UDP, proxy authentication/switching, and platform signing/entitlements.
- **G2 Protected storage:** Browser working data, staging, swap/dumps, mounts/locks, and cross-machine restoration limitations.
- **G3 Browser capability:** Maintained security baseline, driver pairing, fingerprint/WebRTC behavior, live lab bridge, extension compatibility.
- **G4 Commercial trust:** Operator-only secrets/signing, one-time output allocation, offline entitlement verification, and provider sandbox availability.
- **G5 Collaboration:** Device enrollment, E2EE/key envelopes, scope enforcement, stale lease fencing, offline conflicts, and explicit revocation limits.
- **G6 Script isolation:** No worker/runtime path to raw network, filesystem, token, or unrestricted application IPC.

A failed gate blocks the affected advertised capability/platform. It does not authorize deleting it from the blueprint or substituting an unverified guarantee.

## 9. Risk register

| Risk                                               | Consequence                                                        | Treatment and release evidence                                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native routing differs across OSes                 | A profile can escape its route or independence cannot be delivered | G1 early prototypes, platform packet capture and helper failure tests; no protected launch on unsupported adapters.                                                                                               |
| Provider APIs/device limits change                 | Many profiles cannot obtain unique simultaneous routes             | Capability adapters, permitted configuration import, explicit shared-route labeling, additional operator-owned accounts/pools within provider terms. Never equate 99 profiles with 99 permitted provider tunnels. |
| SOCKS5 authentication/DNS gaps                     | Failed routing or local resolution leaks                           | Local gateway, remote-DNS tests, authenticated proxy fixtures, fail-closed switching.                                                                                                                             |
| Browser/driver security drift                      | Vulnerable renderer or broken automation                           | Current supported baselines, advisory response, pinned compatible release sets and reproducible patch maintenance.                                                                                                |
| Fingerprint overclaims                             | Operators trust coverage that does not exist                       | Per-property measured evidence, engine limitations, local/external adapters, no anonymity scores.                                                                                                                 |
| Browser working data remains exposed               | Snapshot encryption creates a false full-vault claim               | Protected storage adapter, path inventory, full-lock versus UI-lock disclosure, platform-specific tests.                                                                                                          |
| Inconsistent browser snapshot                      | Corrupt cookies/storage or failed recovery                         | Consistent capture, closure when needed, journals, restoration fixtures for each browser format.                                                                                                                  |
| KDF/validation/compression exhaust RAM             | Live charts or sessions stutter/crash                              | Worker limits, admission, allocation checks, protected-session scheduling, measured high-load workloads.                                                                                                          |
| Unsafe or misleading quarantine                    | Download fails or user opens a risky file                          | Writable staging, broker ownership, per-file permissions, explicit release, no malware-containment claim.                                                                                                         |
| Capsule parser/format abuse                        | File overwrite, resource exhaustion, leaked metadata               | Encrypted manifest, authenticated extraction, size/count limits, hostile archive fixtures and fuzzing.                                                                                                            |
| Team split-brain or revoked-device cache           | Shared identities race or old data remains accessible              | Leases/fencing, future key rotation, explicit offline/private copies, documented cache limits.                                                                                                                    |
| Audit completeness overstated                      | Missing offline actions appear accounted for                       | Signed envelopes, service ordering, last-sync/gap display, limited completeness claims.                                                                                                                           |
| Static XMR address/payment replay                  | Old transfer activates another purchase                            | Output-level unique allocations, one open invoice, partial/late-payment reconciliation, idempotent signer jobs.                                                                                                   |
| Signing key compromise                             | Forged licenses or updates                                         | Restricted offline/managed signer, distinct update trust keys, key IDs and emergency rotation procedure.                                                                                                          |
| Offline revocation contradiction                   | Transferred installations continue offline                         | Accepted product tradeoff disclosed at transfer; authoritative service enforcement for connected commerce, no forced phone-home.                                                                                  |
| Third-party tests unavailable                      | Strict launches blocked or diagnostics incomplete                  | Local harness baseline, explicit external policy, accurate unavailable status, operator-selectable modes.                                                                                                         |
| Update migration/rollback mismatch                 | User state lost after downgrade                                    | Preflight compatibility, checkpoint copies, preserve newer state, external bootstrapper recovery.                                                                                                                 |
| Disruptive automation during trading               | Lost market connectivity or unintended synchronized input          | Protected execution, explicit disruptive approvals, lab/input scoping, deterministic continuity tests.                                                                                                            |
| Real sites overwhelm fixed performance assumptions | 50 sessions exceed advertised hardware                             | Publish workload/hardware percentiles; governor bounds admission; no arbitrary-site guarantees.                                                                                                                   |
| Feature dependency/staffing underestimated         | Original schedule slips                                            | Keep all capabilities, evidence gates, staffing-based re-estimation after M0; track dependencies rather than reduce scope.                                                                                        |

## 10. Verification, performance, and release gates

### 10.1 Test strategy

Vitest covers deterministic policies, state transitions, quota windows, schema/import limits, pruning, ownership, monetary allocation, and permission decisions. Playwright covers UI and managed-browser integration. Native networking/storage tests run on real target OS configurations; a mocked VPN or Linux-only CI cannot establish Windows/macOS route guarantees.

Use owned local fixtures for deterministic tests. External suites and payment/VPN providers have separate credentialed smoke tests with explicit network contact and service limitations. Do not make public test-site uptime a prerequisite for all offline development checks.

Required scenarios:

1. Create/unlock/offline license import and local setup without leaking secrets.
2. Create 99 saved profiles; reject atomic over-limit races; preserve permitted trial/free transitions.
3. Snapshot/edit/close/restore/crash recovery, failed disk writes, pruning pins, branches, key changes, and original/destination profile IDs.
4. Distinct simultaneous route bindings; authenticated SOCKS5, HTTP CONNECT, remote DNS, pool exhaustion, route replacement, and no fallback.
5. Packet capture under VPN/proxy loss, invalid auth, helper death, Chromium child creation, IPv6, QUIC, resolver failure, sleep/wake, captive portal, and network-interface changes.
6. Fingerprint controls and paranoid WebRTC across main frames, subframes, workers, extensions, and supported browser versions.
7. Real Python/Node W3C automation, wrong token/scope/host, direct-driver bypass attempts, cross-session access, rate boundary, crash state, and absent token at the target HTTP server.
8. Protected charts under resource pressure, long-lived WebSocket streams, pending rotation, bulk change, idle timeout, scheduled updates, and license expiry.
9. Default redaction with planted credentials/URLs/script arguments; retention/rotation failure; CSV formula payloads.
10. Recipe/JSON/IPC XSS and injection cases, extension source mismatch, path traversal/symlinks, hostile archives, invalid tags/signatures, and untrusted signers.
11. Separate disposable downloads/promotion/discard, expiry, abnormal shutdown, and failed access-control application.
12. Team invite concurrency, origin verification, grants/Viewer scope, encrypted recipient envelopes, stale leases/fencing, offline branches, revocation, and audit gaps.
13. Monero testnet payment output allocation, repeated events, partial/late/overpayment, chain reorganization, stale quotes, webhook replay/out-of-order delivery, and signing outage.
14. License transfer across a family, same-account migration, disconnected old license behavior, subscription paid-through/grace/archive, and non-destructive reactivation.
15. Signed update verification, wrong key/hash, schema migration, pending protected session, failed startup, backward incompatibility, and newer-state preservation.
16. Playground direct network/import/worker/token/filesystem/IPC escape probes, runaway code, output flooding, cancellation, quotas, and expiry.

### 10.2 Security evidence

Parameterize SQL and authorize object access in the main/service processes. Escape UI text; sanitize any deliberately supported HTML with a maintained sanitizer and keep untrusted HTML outside privileged UI. Validate IPC origins as well as payloads.

Review logs, exports, databases, temporary paths, and process boundaries using planted fixture secrets. A grep for a few words is insufficient proof that no secret can leak. Inspect memory-handling paths and relevant native protections, but do not claim all plaintext disappears while sessions use it.

Code-sign application/helper artifacts, verify dependencies and reproducible hashes, document privileged installation steps, and conduct an independent architecture/implementation assessment before production claims. No critical or high-impact unresolved finding may be hidden by an aggregate test coverage percentage.

Track coverage as an engineering signal. The original 92% target may guide core policy code, but release acceptance requires scenario evidence, native enforcement tests, and recovery behavior; percentage alone is not a gate.

### 10.3 Performance measurements

| Workload                     | Target and measurement rule                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 99-profile workspace         | UI interactions and command palette p95 below 200 ms on the reference host; no active browsers needed.                                                                                                                                                        |
| Standard browser concurrency | Measure 10/20/50 controlled sessions with recorded page mix, tab counts, versions, RAM, CPU, and route count. The original 50-session/12.8 GiB/80% CPU figures remain experiment targets, not universal requirements.                                         |
| Protected trading layout     | Benchmark one and multiple protected sessions across two and four monitors using deterministic chart/DOM/WebSocket replay; record frame-time p95/p99, input-to-render latency, message lag, gaps, and disconnects.                                            |
| Snapshots                    | Benchmark 50 MiB of compressible JSON and representative mixed browser data; report capture, compression, encryption, commit times, peak RAM, and ratio separately. Two-second compression is a target on declared hardware, not a minimum compression ratio. |
| Route switching              | Record blocking interval, reconnection time, dropped sockets, DNS path, and whether restart was required for each adapter. No invisible or zero-latency switch claim.                                                                                         |
| Lab/map                      | Record two-to-five-pane rendering/diff load and complete dense 99-node graph aggregation; bounded workers must protect active-session budgets.                                                                                                                |
| Offline operation            | Verify normal local operations create no hidden account, telemetry, or test-service calls. Explicit browsing and configured routes retain their expected network traffic.                                                                                     |

Reference hosts, OS versions, power modes, GPU, CPU, physical RAM, display resolution, and benchmark fixture versions are published with results. Minimum RAM/disk and concurrent-session recommendations are determined from these measurements; retain the original 8 GiB baseline/16 GiB recommendation only if the KDF and selected workloads fit.

### 10.4 Release checklist

- Every US-1 through US-30 criterion maps to implemented behavior, documented limitations, and evidence.
- G1–G6 pass on each advertised platform or the release clearly remains a pre-release on that platform.
- All six payment methods have sandbox/testnet evidence; real commercial account/signing prerequisites are satisfied.
- Monero, proxy/SOCKS5 operation and switching, offline access, recovery, and protected trading continuity have explicit release evidence.
- No fake implemented controls, unsupported browser-equivalence claims, hidden contacts, or unverified isolation guarantees.
- Documented recovery/export works when billing, team service, update service, or external test suites are unavailable.
- Signed installers, update manifests, checksums, license trust material, and rollback artifacts are independently verifiable.
- Performance recommendations match tested hardware/workloads; no unresolved data-loss or route-bypass issue is waived through marketing language.

## 11. Design decision register

The [ledger](CHANGE-LEDGER-v4.0.md#3-original-36-decisions) records all 36 original decisions individually. The following additional decisions govern this revision:

1. Product name is ecdys. Do not retain Gab AI branding or assume an unconfigured support address is live.
2. All 30 requirements and advanced capabilities remain in the product.
3. Proxies, authenticated SOCKS5 switching, and Monero are essential, first-class capabilities.
4. Collaboration is built in and uses a self-hosted team service; it does not redefine ecdys as a team product.
5. Offline operation is built in, including permanent offline use for activated one-time licenses.
6. Network enforcement is native and fail closed; external probes and CDP are diagnostics/control aids.
7. Payment and license authority are outside distributed desktops; operational browsing data is outside the commercial service.
8. Supported browser engines and drivers replace a frozen Chromium 120 security baseline.
9. Random per-snapshot data keys with authenticated wrapping replace timestamp-based repeated passphrase derivation.
10. Encrypted working-state coverage and lock semantics are explicit; snapshot encryption is not passed off as complete browser-directory encryption.
11. Protected execution prevents automatic disruptive maintenance and resource eviction while retaining route safety.
12. Real W3C WebDriver transport and scoped tokens replace CDP/Selenium conflation.
13. Playground code uses a restricted browser JS runtime; native Python/Node examples run externally.
14. Capsule metadata is encrypted, signer trust is distinct from signature validity, and extraction is bounded.
15. Performance/latency/anonymity language must correspond to measurable behavior and documented coverage.
16. Prices, exact commercial quotas, provider API availability, native entitlements, benchmark results, and release dates are unresolved prerequisites, not invented facts.

## 12. Documentation and distribution

### 12.1 Documentation set

Preserve the user/operator/developer/API guides. Required topics include installation and platform support, random-ID/email/offline setup, vault/KDF/PGP, VPN and proxy/SOCKS5 configuration/switching, profile recovery, fingerprint limitations/validation, protected trading workspaces, maps/lab/recipes, disposable quarantine, encrypted capsules, teams/self-hosting, audit coverage, payments/licensing/transfers, Selenium/playground, and signed update recovery.

Developer documentation includes IPC/service authorization, native helper capabilities, route enforcement matrix, schemas/migrations, snapshot/capsule/key formats, browser/driver compatibility, test fixtures, performance methods, and dependency licenses.

Guides are complete when an operator can follow the workflows, not when arbitrary page-count targets are met. Publish redacted screenshots without real account IDs, addresses, route secrets, cookies, live capital, or user browsing data.

### 12.2 Packaging and updates

Target macOS signed/notarized distributions for Intel and Apple Silicon, Windows signed installers, and Linux AppImage/.deb builds with the native helper installed through a supported privileged flow. CPU architectures, OS minimums, filesystem dependencies, drivers, and native entitlements are verified in the release manifest.

An AppImage cannot by itself guarantee privileged networking or sandbox support on every distribution. Document helper installation and required OS capabilities. Windows signing does not guarantee SmartScreen reputation; macOS notarization does not certify every application behavior.

Use ecdys branding in metadata, desktop entries, installers, docs, and display names. Canonical distribution slugs use ecdys. Existing storage-directory names are retained where needed for compatibility. Distribution/download/API/support hostnames are deployment configuration until the owner provisions and verifies them; the product name does not prove control of a domain.

Primary owner-controlled CDN and GitHub Releases mirror serve the same signed manifests/artifacts. Publish SHA-256 checksums and signatures, SBOM/dependency notices, supported release matrix, and offline verification instructions. Do not ship license signer keys, merchant secrets, development keyrings, or test wallet credentials.

### 12.3 Support

Keep an email-based support channel without Discord/Telegram requirements. Configure the actual address before release; do not assume support@ecdys.app already exists. Preserve the original 24–48 business-hour target as an operational service goal requiring staffing, not a promise generated by code.

Support exports are prepared locally and sent only by an explicit operator action. Transfer requests and random-ID proof flows do not require disclosure of operational browsing data.

## 13. Glossary and official references

### 13.1 Glossary

- **Workspace:** The operator's local vault, profiles, organization, and operational tools.
- **Profile:** A persistent browser identity/configuration with separate storage and route policy.
- **Protected execution:** Lifecycle policy that defers automatic disruptive actions during active work.
- **Route binding:** A concrete tunnel/proxy and enforcement policy assigned to a session.
- **Route lock:** Native prevention of egress outside the selected policy while enabled.
- **SOCKS5 switching:** Deliberate replacement of a proxy binding with tested remote DNS/authentication and no silent direct fallback.
- **Snapshot:** Authenticated encrypted recovery checkpoint with declared consistent-state coverage.
- **Branch:** Independent profile identity derived from a known revision/checkpoint.
- **Capsule:** Encrypted transfer package containing a signed manifest and selected operational state.
- **Secret envelope:** Authenticated wrapping of secret/key material for a specific workspace or recipient.
- **Flight recorder:** Bounded local diagnostic history with content excluded by default.
- **Inspection:** Configured-versus-measured observations with provenance and explicit unknowns.
- **Execution lease/fence:** Service authority preventing simultaneous shared-profile writers.
- **Team audit:** Service-ordered records plus signed submitted device events, with visible synchronization coverage.
- **Entitlement:** Signed commercial permission; independent of local encryption keys.
- **License family:** Stable purchase/ownership lineage preserving the one-transfer limit.
- **WebDriver:** W3C browser automation protocol, exposed through the authenticated gateway.
- **CDP:** Chromium control protocol, privately used by the station and driver.
- **Quarantine:** Controlled download storage/release workflow; not a malware sandbox.

### 13.2 Official sources and evidence limits

Documentation consulted for this revision supports API/trust-boundary corrections. It does not establish that the product has passed its release gates.

| Reference                                                                                                                                                     | Relevance                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)                                                                                 | Context isolation, sandboxing, current versions, IPC sender validation.                                                                           |
| [Electron support timelines](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)                                                              | Latest three stable major releases supported; exact release selection must be verified at implementation.                                         |
| [ChromeDriver remote debugging limitations](https://developer.chrome.com/docs/chromedriver/help/operation-not-supported-when-using-remote-debugging)          | debuggerAddress attaches through ChromeDriver and has command limitations.                                                                        |
| [Selenium Python ClientConfig](https://www.selenium.dev/selenium/docs/api/py/selenium_webdriver_remote/selenium.webdriver.remote.client_config.html)          | Bearer transport authentication and per-client configuration.                                                                                     |
| [Selenium JavaScript HTTP client source](https://www.selenium.dev/selenium/docs/api/javascript/http_index.js.html)                                            | Request header map, custom HttpClient, and Executor exports.                                                                                      |
| [Selenium JavaScript WebDriver](https://www.selenium.dev/selenium/docs/api/javascript/WebDriver.html)                                                         | createSession with an executor.                                                                                                                   |
| [MDN WebWorkers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)                                                          | Workers have network APIs; a worker is not a Python/Node runtime or sufficient network confinement.                                               |
| [Stripe API key guidance](https://docs.stripe.com/keys)                                                                                                       | Only publishable keys belong in distributed clients.                                                                                              |
| [Monero wallet RPC](https://docs.getmonero.org/rpc-library/wallet-rpc/)                                                                                       | RPC shapes, subaddresses, transfer evidence, integer atomic units. Validate against the pinned daemon; older official pages are explicitly dated. |
| [SQLite backup API](https://www.sqlite.org/backup.html)                                                                                                       | Consistent database backup requires supported procedures rather than raw open-file copying.                                                       |
| [SQLCipher API](https://www.zetetic.net/sqlcipher/sqlcipher-api/)                                                                                             | Encrypted database configuration and format compatibility.                                                                                        |
| [GnuPG agent options](https://www.gnupg.org/documentation/manuals/gnupg/Agent-Options.html)                                                                   | Key-agent/caching behavior is independent of the application UI lock.                                                                             |
| [IVPN device policy](https://www.ivpn.net/knowledgebase/general/how-many-devices-or-simultaneous-connections-can-i-have-to-ivpn/)                             | Provider limits vary by plan; recheck at integration, do not hardcode a historical count.                                                         |
| [Mullvad WireGuard](https://mullvad.net/en/help/wireguard-and-mullvad-vpn)                                                                                    | Actual VPN setup is distinct from endpoint discovery; integration permissions/capacity require verification.                                      |
| [Apple Network Extension entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.networkextension) | Native macOS support depends on specific signed capabilities and distribution constraints.                                                        |

**End of replacement blueprint.** This document preserves product scope while identifying implementation obligations, accepted tradeoffs, and evidence needed before release.
