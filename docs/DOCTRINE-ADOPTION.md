# Applying the EcDys doctrine

The [user's doctrine](DESIGN-DOCTRINE.md) governs new work. The supplied [reference package](../design/README.md) provides concrete dark/light examples and tested interaction models. This increment addresses observed behavioural violations while retaining the existing desktop runtime.

## Precedence and current boundaries

- Local profiles, recovery, exports and automation must not require an account or paid entitlement. Historical mandatory signup and profile/API tier assumptions are superseded. Optional remote services may add reach; the core must remain independently buildable and usable when they are absent. The unfinished core is not described as feature-complete.
- Physical key segregation, red/green USB workflows, air gaps and unidirectional transfer are architectural goals, not current guarantees. The current software vault derives keys in a worker and retains a key in main-process memory while unlocked. Working Chromium directories are plaintext OS files.
- The Electron renderer is sandboxed; vault/file/provider operations execute on the host main process. Neither fact establishes a virtual-machine boundary or verified browser routing. Provider API requests use the host network; no profile route is verified yet.
- The supplied prototype's in-memory notes/bookmarks/undo/export functions are not durable encrypted desktop features merely because their source files are present. Porting those behaviours requires explicit storage, lifecycle, boundary and acceptance work.
- Saved provider accounts and registration records are not VPN connections. Public catalog requests may reveal the host source IP; authenticated operations disclose the specified account/registration material to the provider.

## Bounded implementation work

- Keep a persistent observed vault state; browser-only preview and pending/failed reads remain unavailable/unknown. Show encrypted database/snapshot versus plaintext working-file boundaries.
- Clear old snapshot history before changing the selected profile. Loading and failed history reads display unknown counts; late or mismatched responses cannot attach another profile's snapshots or recovery results.
- Use native branch confirmation with the specific profile name/ID, safe initial focus and keyboard containment. Explain irreversible local deletion, external backups and the absence of secure-erasure guarantees.
- Offer session-scoped Undo for device-preference reset. A newer preference choice invalidates old reset history so Undo cannot overwrite it.
- Remove glass blur and brand glow. Keep a flat scrim and ordinary focus/state indicators; avoid a layout or framework replacement.
- State outbound destinations and data beside provider actions, including catalog refreshes triggered by an endpoint preview. Keep local save/reset actions distinct from remote requests.

## Remaining adoption work

The whole application has not passed the doctrine's five-question test yet. Remaining work includes systematic error copy, provenance/staleness for every observation, uniform geometric icons/spacing/radius, scoped Undo for other cheap changes, operator-controlled panels and granular export/import. The larger functional gaps remain in [FUNCTIONALITY.md](FUNCTIONALITY.md).

Premium separation and physically segregated cryptographic trust need concrete architectures and acceptance checks. This increment implements no physical isolation, networking privileges, billing or remote service. Normal browser launches remain blocked.
