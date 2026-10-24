# ecdys — Proxy pools and route operations

Source: BLUEPRINT-v4.0.md, especially first-class proxies, recoverable changes, and honest diagnostics. This continues the existing desktop foundation without removing Monero, team, offline, or advanced workstation capabilities.

1. Add bounded URI/JSON proxy import with redacted previews, encrypted named pools, safe schema migration, and revision-checked profile assignment/rotation. Each successful route change must capture the previous configuration. Deleting a pool must preserve assigned routes and their recovery history.
2. Add real SOCKS5 authentication and HTTP CONNECT diagnostics, remote destination DNS, TLS verification for HTTPS proxies, total deadlines, cancellation on vault lock, bounded responses, and fixed safe errors. Use owned local protocol fixtures; do not change host networking. A proxy accepting a tunnel is an observation, not proof of native isolation or public IP identity.
3. Extend the existing Routes workspace with import preview, pool management, tunnel tests, profile selection, assignment/rotation, and per-profile outcomes. Verify with real Electron interaction, production builds, typechecking, and a fresh independent review.

Native enforcement, protected live browser storage, and a managed browser remain launch gates. Linux network namespaces are available in this development environment; this alone does not establish a cross-platform native enforcement implementation.

Verification: malformed imports never echo passwords; duplicates are removed; encrypted pools persist; v1 vaults migrate without data replacement; stale/missing targets remain unchanged; checkpoints restore credentials after pool deletion; tunnel authentication and rejection are tested with fragmented responses; stalled and malformed peers terminate; locking cancels diagnostics; UI imports and switches real saved profiles.
