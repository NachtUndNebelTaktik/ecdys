# SDD ledger — plan: docs/superpowers/plans/2026-10-24-vpn-setup.md

- Base: 5cc21f9; branch feat/vpn-setup; scope follows the VPN setup spec.
- Pre-flight: shared profile config feeds snapshots, branch copies, diff previews and merge; VPN settings must enter all five consistently. Credential records remain workspace-level and outside configuration snapshots.
- Provider evidence checked 2026-10-24: official Mullvad public API and IVPN CLI docs; live public relay responses and IVPN upstream daemon confirm catalog shapes. Neither catalog proves authentication or a protected route.
- Tasks 1–2 complete: VPN schemas/defaults, authenticated provider credentials, schema v4, recoverable settings, strict IPC, bounded public catalog cache and pure rotation planner. Focused tests first failed for missing VPN fields/methods/modules, then passed. Full backend suite: 143 passed, 2 opt-in skipped.
- Task 3 complete: real Electron setup/save/lock/restart/reopen test passed. A separate `STYG_TEST_LIVE_VPN_CATALOGS=1 pnpm test:desktop` run loaded both official catalogs successfully without credential transmission. Default desktop tests remain offline.
- Product route gate unchanged. No provider authentication, provisioning, live rotation, SOCKS5 or GnuPG completion claimed.
