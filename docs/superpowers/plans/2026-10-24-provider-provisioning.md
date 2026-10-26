# Provider provisioning implementation

> Checked 2026-10-26 against application revision `2dffb6d`: All four scoped provisioning steps are implemented against synthetic protocol fixtures. Real account acceptance, tunnel activation and route protection remain unverified/pending. See the [implementation audit](../../PLAN-AUDIT.md).

Base cc126dc; spec ../specs/2026-10-24-provider-provisioning.md. Inline implementation, test-first.

- [x] Step 1: Implement bounded fixed-origin provider clients and X25519/encrypted registration codecs against official upstream protocols. Verify sanitized authentication and device/session fixture flows.
- [x] Step 2: Add schema v5 registration storage, provider operation coordinator, cancellation and recovery. Verify key durability, ambiguous creates, reuse, removal and lock/account-change races.
- [x] Step 3: Integrate explicit desktop controls and strict IPC; add a safe tunnel preparation preview. Exercise real Electron with intercepted provider fixtures, including stalled secret-bearing requests and lock.
- [x] Step 4: Run whole-suite/typecheck/build/desktop/browser checks, review the complete diff, document evidence and remaining live-provider/OS limits, commit locally.

## Live acceptance still pending

- [ ] Verify account checks, registration reuse/removal and provider limits with real test accounts.
- [ ] Implement and verify OS WireGuard activation, DNS/IPv6 policy, handshake/exit identity and route-loss enforcement.
