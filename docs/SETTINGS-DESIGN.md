# Ecdys settings reference

> Checked 2026-10-26: the scoped UI/preferences requirements below are implemented. The service rows are present; their unavailable account/map/proxy/payment/report/cloud backends are not. See the [checked plan](PLAN-AUDIT.md).

Use the three screenshots supplied in the conversation: charcoal grouped cards on black, crimson section markers, rounded section pills, outline icons and right-aligned values. Implement inside the existing desktop application, with a responsive settings dialog rather than rebuilding the app. Keep the source's Environment, Account, Appearance, App and Help navigation and every named row.

Working local preferences: dark/light/system appearance, crimson/sage/indigo accent, comfortable/compact density, reduced motion and optional in-app status messages. Persist only these non-sensitive enum/boolean fields in device local storage. Invalid/unavailable storage falls back safely; display session-only status if persistence fails. Important cleanup warnings stay visible even when optional status messages are disabled.

Existing workspace capabilities: lock now, accurate 15-minute workspace-operation timeout information, profile/selected-snapshot counts and storage boundaries, installed app/platform details, help and implemented keyboard shortcuts. Ctrl/Cmd+, opens Settings; Escape returns from detail or closes Settings; Ctrl/Cmd+Shift+L locks an unlocked desktop workspace.

Services that are not implemented must open useful explanations and remain truthful: Mindmap unavailable, SOCKS5 unconfigured with launches still blocked, email unlinked, subscription local preview, Trocador and Monero not connected, browsing reports off, secure cloud storage off. Do not seed the screenshot's email or invent a Pro entitlement. No credentials, account metadata or browsing history in local storage; no new network request or external service connection from opening settings.

Native dialog handles focus containment; every row and selector is keyboard accessible. Use bundled library icons and no remote assets. Verify persistence/interactions in the browser and entry/lock behavior in Electron. Keep changes local; do not push or merge into GitHub.

## Checked implementation steps

- [x] Implement all reference sections/rows and working detail navigation.
- [x] Apply and persist only the five non-sensitive device preferences.
- [x] Preserve important warnings with optional status messages disabled.
- [x] Wire existing lock/status/storage/help behavior and the documented shortcuts.
- [x] Verify keyboard containment, Escape/back, focus restoration and restart persistence.
- [x] Label pending services accurately and avoid copying example identity/entitlement values.
- [x] Verify typecheck/build, browser controls and actual Electron workflow.
- [x] Keep the work local without a push or remote merge.
