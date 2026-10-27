# Sharper settings implementation plan

User source: the 2026-10-27 EcDys Settings HTML and accompanying visual notes. Continue in the existing Electron/Solid application; no remote push.

## Constraints

- Use true CSS Crimson `#dc143c`; all accent treatments derive from the selected colour.
- Match the 266px desktop rail, search, 52px rows, 14px cards, 23px icon tiles, mono values, heading ticks and active navigation rail. Compact window navigation stays usable.
- Keep native modal focus, Escape/back, preferences, workspace locking and local-only operation.
- Do not copy the sample email, Pro entitlement, old build number, unlocked state or weekly cadence. SOCKS5 “Direct” describes the absence of a proxy; browser routing remains blocked.
- Offer Crimson, Rose, Amber, Teal, Blue and Violet in that order. Preserve existing saved Sage/Indigo values without resetting other preferences.

## Steps

- [x] Add behaviour tests for searchable rows/empty results/Escape, section navigation after filtering, palette persistence, legacy colours and Data controls reset.
- [x] Extend validated preferences and theme tokens, preserving the existing storage key and five-field boundary.
- [x] Adapt `SettingsPanel.tsx`, `settings.css` and library icons to the supplied layout, with live current state and scoped keyboard search.
- [x] Verify browser interactions, window sizes, focus, actual Electron lock/restart, typecheck/build and the existing backend suite. Visually inspect fresh captures.
- [x] Update settings/audit documentation with checked results and any remaining service gates. Save locally; do not push.

## Review focus

Search must not persist, steal typing from controls, search unselected option labels, or leave navigation pointing at hidden sections. Escape clears a query before dismissing the modal. Hidden compact/desktop controls must not enter the focus loop. Live workspace locking must update state. Reset affects only the existing five device preferences. Unimplemented services must not gain connected indicators.

## Verified result — 2026-10-27

260 backend tests passed / 3 existing skips; 24 browser checks passed; 3 actual Electron workflows passed; typecheck/build and diff checks passed. Fresh desktop/compact/light/Electron captures were inspected; the capture run had no console errors or failed HTTP responses. The routing and offline archive acceptance gates remain unchanged. [Visual QA](../../../design-qa.md).
