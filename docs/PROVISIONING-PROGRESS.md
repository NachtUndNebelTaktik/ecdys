# Provider provisioning progress

Base cc126dc; branch feat/provider-provisioning. No real account credentials or network-administration capabilities are configured in this environment.

Current upstream evidence: Mullvad app access/device/account implementations; IVPN daemon API requests/responses/error codes. One provider registration per workspace avoids exhausting slots at the profile limit. Actual OS tunnel activation remains outside this chapter.

Tasks: provider clients/codecs; durable orchestration; UI/IPC/preview; full verification and review.

- Provider clients and X25519/registration codecs: complete. Fixed-origin requests follow current official contracts, bound response size/deadlines, sanitize errors, and retain only required fields. Credentials/private keys/tokens have no read-back IPC. No live credentials were used.
- Durable orchestration: complete. Schema v5 preserves old data, stores draft/pending state before mutations, reuses registration across restart, reconciles Mullvad by public key and blocks ambiguous IVPN retries. Account changes are refused while setup exists or an operation is active.
- Desktop integration: complete. Separate provider loading does not block dialog dismissal/locking. A real Electron fixture flow verifies registration/recheck/removal, public tunnel preview, strict secret-free DTOs, cancellation of an authenticated request and uncertain state after unlocking. Launch gate unchanged.
- Whole-diff self-review found and fixed ownership and outcome hazards with RED→GREEN regressions: refuse deletion after external key replacement; keep earlier uncertainty after a later limit rejection; distinguish IVPN API session absence from a generic missing RPC endpoint. Profile changes/stale account checks also reject previews. No new sub-agents were used.
- Limits retained: no live provider validation, CAPTCHA/2FA interaction, WG handshake/OS activation, privileged routing proof, automatic endpoint rotation or browser launch enablement. Provider-side registrations consume account slots; one per provider/workspace is reused across profiles.
- Final verification: `pnpm test` — 169 passed, 2 opt-in skipped; `pnpm typecheck` and `pnpm build` passed; browser-preview test 1 passed; desktop workflows 2 passed. Whole-diff self-review complete, with no remaining material finding in this increment. Preserve the local branch; no merge, push, deployment or live provider registration was performed.
