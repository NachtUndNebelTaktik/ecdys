# VPN setup in Styg 0.5

Open **VPN setup** on a profile card. Choose Mullvad or IVPN, save an account if desired, load the public WireGuard server list or enter a hostname offline, choose a rotation policy, and save the profile settings. Saving an account takes effect immediately at workspace scope, independently of the profile dialog's Save/Cancel buttons. Removing an account affects every profile using that provider.

The panel distinguishes stored credentials, catalog retrieval and endpoint selection from authentication and routing. **It does not authenticate, connect a tunnel, test an exit IP or enable browser launches.** A saved rotation policy is not an active scheduler. Route lock remains required. Provider authentication, WireGuard key/device provisioning and the OS routing supervisor are the next integration boundary. Custom SOCKS5 is not part of this increment.

## Blueprint corrections

- IVPN uses an account ID (`i-XXXX-XXXX-XXXX` or legacy `ivpnXXXXXXXX`), not the proposed username/API-key pair. Mullvad uses a 16-digit account number.
- Listing relays does not require submitting account credentials and does not validate an account. Fetching a catalog also does not establish a WireGuard tunnel.
- Mullvad's catalog weight is a selection weight, not measured utilization. Styg displays no invented load percentage. IVPN's host load is displayed when supplied.
- Credentials currently use purpose-separated AES-256-GCM encryption inside the encrypted database. GnuPG/OpenPGP adapters are still pending; this implementation does not claim to use them.
- Rotation planning is separate from tunnel rotation. The planner evaluates launch-count and time boundaries, excludes the current host, prefers available reported load and otherwise orders hosts by name. It retains the current selection with a warning if no alternative exists. It is not wired to actual launches yet; no counter or last-rotation timestamp is fabricated.

## Data and recovery

Schema v4 adds `vpn_credentials(provider, envelope)`. A dedicated HKDF domain derives the credential encryption key; each save uses a random 96-bit nonce. Authentication binds the envelope to its version, purpose and provider. No credential read-back IPC exists. The renderer receives only per-provider presence booleans; password fields clear on save and when switching providers. Strings and application memory are not guaranteed to be zeroized by JavaScript.

Each profile stores non-secret `vpn` settings: provider, nullable endpoint hostname, rotation policy and required route lock. These settings participate in pre-edit snapshots, restore previews, rollback, forks and environment merges. Credentials are workspace-level records and are excluded from profile snapshots. Restoring a profile does not restore or remove a provider account. A branch uses the same saved workspace account while keeping an independent endpoint configuration.

Existing v1/v2/v3 workspaces migrate to v4 transactionally. Old configuration snapshots receive a default of no configured provider on read. Back up the entire closed workspace before migration; older applications need the matching pre-migration backup.

## Public catalog transport

The main process permits only these fixed URLs:

- `https://api.mullvad.net/public/relays/wireguard/v2`
- `https://api.ivpn.net/v5/servers.json`

Requests use a separate non-persistent Electron session, omit credentials, reject redirects, preserve the host's inherited outbound proxy and retain TLS verification. The reader limits decoded bodies to 2 MiB, enforces a 10-second deadline and validates relay identifiers, addresses, public keys and bounded collections. Only active Mullvad WireGuard relays are included. Duplicate identifiers or invalid payloads reject the refresh. No account credentials are sent by any network operation in this increment.

Validated catalogs stay in memory for one hour. If a later refresh fails, the last catalog is retained with its original check time and an explicit stale warning; retries have a 30-second cooldown. With no cached catalog, refresh fails visibly. A hostname entered offline remains an unverified selection. Future launch code must validate and provision it through the trusted routing supervisor.

Catalog I/O runs outside the vault mutation queue and uses its own loading indicator. The dialog can close during a refresh; workspace lock/quit cancels pending requests without waiting for the network deadline. Late results do not reopen a dismissed dialog. Concurrent requests for the same provider share one fetch.

## Evidence and sources

Checked on 2026-10-24:

- [Mullvad public API documentation](https://api.mullvad.net/public/documentation/) specifies WireGuard v2 relay lists and account numbers.
- [IVPN CLI documentation](https://www.ivpn.net/knowledgebase/general/command-line-client-faq/) documents account-ID login, server selection and firewall commands.
- [IVPN account troubleshooting](https://www.ivpn.net/knowledgebase/troubleshooting/i-cannot-connect-to-the-vpn-what-can-i-do/) documents both account-ID formats.
- [Official IVPN desktop API source](https://github.com/ivpn/desktop-app/blob/development/daemon/api/api.go) identifies `api.ivpn.net/v5/servers.json`. This is an upstream app endpoint and may change independently of Styg.

Unit/integration tests cover normalization, malformed/oversized/error/redirect responses, deadlines, cache age/stale fallback, rotation boundaries, credential authentication and non-disclosure, lock/reopen, v3 migration and recovery semantics. The default Electron workflow saves settings without external network access. An optional public-catalog smoke run is available with `STYG_TEST_LIVE_VPN_CATALOGS=1 pnpm test:desktop`; it sends no account credentials.
