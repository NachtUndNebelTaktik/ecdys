# Styg 0.6 — provider registration and WireGuard preparation

This chapter adds Mullvad/IVPN account checks and provider-side WireGuard registration. **It does not activate a tunnel, modify host routes/firewalls or enable browser launches.** Protocol fixtures pass; no real provider account has been authenticated here.

## Desktop flow

1. Open a profile's VPN setup and save a provider account.
2. Read the provider registration notice and enable **I allow Styg to use a provider device/session slot**. **Prepare WireGuard** sends the account and a locally generated public key to that provider. The private key stays in the encrypted workspace.
3. A successful response displays **WireGuard registration saved**, the last account check and expiration. **Recheck provider** reuses the saved registration. It does not create another session/device for each profile.
4. Save the profile's endpoint. **Preview saved endpoint** resolves that saved hostname against a fresh public catalog and displays peer ingress IP/port and assigned interface addresses. It requires a successful account check within the last hour. This is preparation metadata, not a handshake, exit IP or route-protection test.
5. To replace/remove a saved account, first explicitly remove its Styg registration. The removal control acts on the tracked registration only. Profile snapshots, restore and branches do not duplicate or remove provider registrations.

Registration is a workspace-level action and takes effect independently of Save/Cancel for profile settings. It may consume one provider slot even with no tunnel running. Concurrent profile sessions, provider connection limits and per-profile OS routes still need validation; this release does not promise 99 independent VPN tunnels.

## Recoverable state

| State | Meaning | Next action |
|---|---|---|
| Not started | No retained registration material | Prepare explicitly |
| Draft | Local key saved; no known successful registration | Retry or remove local draft |
| Pending / uncertain | A mutating request may have reached the provider | Reconcile Mullvad by the retained public key; review IVPN sessions before reset |
| Registered | Remote ID/token and assigned addresses retained | Recheck, preview or explicitly remove |

The encrypted draft is committed before the registration request, and pending state is committed immediately before its network mutation. Lock/quit cancels requests promptly; late responses cannot write to the closed workspace. If a response is lost, the persisted pending state survives reopening.

Mullvad reconciliation lists devices and matches the retained public key before creating. It reads an existing matching device instead of creating another. An earlier uncertain outcome stays uncertain even if a later retry receives a device-limit error. Styg never rotates keys or deletes unrelated devices automatically. Before removing a confirmed device, it checks the tracked ID and key against the provider's current record; an externally replaced key blocks deletion.

IVPN registration uses `force: false`. A lost or malformed create response can leave a provider session whose token Styg never received. Styg blocks another create in that state. Review/clean up uncertain Styg sessions with the provider's official tools, then explicitly acknowledge **Reset reviewed local setup**. This acknowledgment discards the local key; it does not itself delete a remote session. API challenges such as CAPTCHA/2FA are reported without guessing or bypassing them; interactive challenge support is not included yet.

Removing a confirmed IVPN session uses the retained token. Only a successful API acknowledgement or IVPN's explicit `601` session-not-found code permits local removal. A generic HTTP 404 at the RPC endpoint is not proof of session deletion. Failed or canceled removal preserves registration material for retry.

## Storage and control boundaries

Schema v5 adds `vpn_registrations(provider, envelope)` with a foreign key to the saved provider credential. Existing v1–v4 workspaces migrate transactionally; old apps require their matching pre-migration backup. The registration envelope uses a distinct HKDF domain, random AES-256-GCM nonces and authenticated provider/purpose/version. It stores an X25519 private/public key pair, phase, provider ID/session token, assigned addresses and last account check. Key-pair correspondence is validated on encryption/decryption.

Only non-secret status and tunnel-preview fields cross IPC. Account IDs, private keys, access/session tokens and raw provider responses are not returned or logged. Mullvad access tokens are short-lived operation data, not persisted. IVPN session tokens are retained encrypted so the registration can be rechecked and removed after restart. JavaScript string/key-object memory clearing remains best effort; the local OS account can inspect process memory.

Provider operations have per-provider exclusion, ten-second request deadlines, 64 KiB decoded response limits, redirect rejection, fixed HTTPS origins, TLS validation and an isolated non-persistent Electron session that honors the inherited outbound proxy. They do not hold the vault mutation queue open during external I/O. Account changes are refused during an operation or while registration material exists. Dialog disposal ignores late UI results; lock cancels control-plane I/O before closing the vault.

The tunnel preview uses only a current selected relay and registered addresses. Default preparation ports are Mullvad UDP 51820 and IVPN UDP 2049. The trusted OS routing supervisor must still consume keys, validate routes and DNS/IPv6 handling, enforce fail-closed firewall policy, verify handshake/exit identity and clean up interfaces. No `wg-quick` file, shell hook, OS command, plaintext key file or launch bypass is supplied by this increment.

## Evidence and API sources

Implementation checked against official upstream code on 2026-10-24:

- [Mullvad access-token requests](https://github.com/mullvad/mullvadvpn-app/blob/main/mullvad-api/src/access.rs): `POST /auth/v1/token` with `account_number`; Bearer token used for account/device calls.
- [Mullvad account API](https://github.com/mullvad/mullvadvpn-app/blob/main/mullvad-api/src/lib.rs): `GET /accounts/v1/accounts/me` and account expiration.
- [Mullvad device API](https://github.com/mullvad/mullvadvpn-app/blob/main/mullvad-api/src/device.rs): list/get/create/delete devices, public keys and assigned IPv4/IPv6 addresses.
- [IVPN API client](https://github.com/ivpn/desktop-app/blob/development/daemon/api/api.go), [request types](https://github.com/ivpn/desktop-app/blob/development/daemon/api/types/requests.go), [responses](https://github.com/ivpn/desktop-app/blob/development/daemon/api/types/responses.go) and [error codes](https://github.com/ivpn/desktop-app/blob/development/daemon/api/types/errors.go): `/v4/session/new`, `/status`, `/delete`, `wg_public_key`, session tokens and account status.
- [IVPN supported protocol/port combinations](https://www.ivpn.net/knowledgebase/general/command-line-client-faq/).

These app APIs may change without a third-party stability guarantee. Fixtures validate Styg's behavior against the inspected contracts; they do not establish live account acceptance. Backend tests cover encryption, real X25519 correspondence, protocol/error contracts, registration reuse/reopen, uncertain outcomes, cancellation/overlap, safe deletion and stale-profile/account preview rejection. A real Electron test intercepts provider HTTPS within test-only sessions using synthetic responses; production has no fixture switch or endpoint override.
