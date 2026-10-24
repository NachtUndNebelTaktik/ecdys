# Provider provisioning implementation

Base cc126dc; spec ../specs/2026-10-24-provider-provisioning.md. Inline implementation, test-first.

1. Implement bounded fixed-origin provider clients and X25519/encrypted registration codecs against official upstream protocols. Verify sanitized authentication and device/session fixture flows.
2. Add schema v5 registration storage, provider operation coordinator, cancellation and recovery. Verify key durability, ambiguous creates, reuse, removal and lock/account-change races.
3. Integrate explicit desktop controls and strict IPC; add a safe tunnel preparation preview. Exercise real Electron with intercepted provider fixtures, including stalled secret-bearing requests and lock.
4. Run whole-suite/typecheck/build/desktop/browser checks, review the complete diff, document evidence and remaining live-provider/OS limits, commit locally.
