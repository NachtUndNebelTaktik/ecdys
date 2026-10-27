# Ecdys settings reference

> Checked 2026-10-27: the scoped UI/preferences requirements below are implemented, including the sharpened HTML revision. The service rows are present; their unavailable account/map/proxy/payment/report/cloud backends are not. See the [checked plan](PLAN-AUDIT.md) and [sharpening plan](superpowers/plans/2026-10-27-settings-sharpening.md).

The supplied 2026-10-27 HTML supersedes the earlier three screenshot crops: 266px desktop rail, search, a wide-window state panel, 52px rows, 14px cards with hairline inset highlights, 23px icon tiles, mono values, 3px section ticks and a 2px active navigation rail. Implement inside the existing desktop Electron application. Keep Environment, Account, Appearance, App and Help navigation; compact windows use section chips. Keep every named row, add Data controls, and place Browsing report under Account beneath Trocador. Do not add the removed filler/age row.

Working local preferences: dark/light/system appearance; Crimson `#dc143c`, Rose `#ff3d6e`, Amber `#ff9f0a`, Teal `#2dd4bf`, Blue `#5b8dff`, Violet `#a78bfa` accents in that order; comfortable/compact density; reduced motion; optional in-app status messages. Accent treatments derive from one theme token; small accent text and button ink use readable derived/contrasting values. Preserve old Sage/Indigo preferences via a conditional saved-colour option. Persist only the existing five non-sensitive enum/boolean fields under the same storage key. Invalid/unavailable storage falls back safely; display session-only status if persistence fails. Important cleanup warnings stay visible even when optional status messages are disabled.

Existing workspace capabilities: lock now, accurate 15-minute workspace-operation timeout information, profile/selected-snapshot counts and storage boundaries, installed app/platform details, help and implemented keyboard shortcuts. Ctrl/Cmd+, opens Settings; Escape returns from detail or closes Settings; Ctrl/Cmd+Shift+L locks an unlocked desktop workspace.

Search filters current displayed row values rather than hidden select options, never persists, and ignores keyboard shortcuts while typing in a field. `/` focuses search inside Settings; Escape clears a query first. Section navigation clears conflicting search; scroll tracking respects explicit navigation when the final viewport contains adjacent groups. Compact navigation must not cover a target heading. Data controls resets only the five preferences, with no workspace mutation.

Services that are not implemented must open useful explanations and remain truthful: Mindmap unavailable, SOCKS5 unconfigured with launches still blocked, email unlinked, subscription local preview, Trocador and Monero not connected, browsing reports off, secure cloud storage off. Do not seed the screenshot's email or invent a Pro entitlement. No credentials, account metadata or browsing history in local storage; no new network request or external service connection from opening settings.

SOCKS5's row/state value is “Direct”, explicitly meaning no proxy is configured; Routing remains “Blocked”. Browsing report is “Off”, not “Weekly”, because scheduling does not exist. The rail and state panel use the actual lock state and app version, not the HTML's sample unlocked vault/build. Inert status dots are hollow grey; active states use the selected accent.

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
- [x] Apply the sharpened desktop/compact layout, search and live state panel.
- [x] Expand the palette while preserving saved preferences.
- [x] Implement Data controls reset without touching workspace data.
- [x] Verify filtered navigation, scroll tracking, unobscured compact headings and scoped search keys.
