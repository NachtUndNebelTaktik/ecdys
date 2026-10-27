# Settings handoff

## Doctrine checkpoint — 2026-10-27

The later [doctrine](DESIGN-DOCTRINE.md) governs this screen. Settings now distinguishes unavailable/unknown/locked/unlocked vault state, uses unknown counts while reads are pending or failed, and offers session-scoped reset Undo that expires after a newer preference choice. Flat cards replace inset shadows; brand glow and modal blur were removed. No new account, wallet, cloud or proxy integration is implied.

Fresh checks: 260 backend tests passed / 3 existing skips; 42 browser checks and 3 actual Electron workflows passed; typecheck/build passed. The actual Electron flow still verifies persisted preferences and workspace locking. The user authorized a work-in-progress GitHub checkpoint; the separate `main` browser/notepad workstream is not merged. [Full checkpoint handoff](DOCTRINE-PROGRESS.md).

## Functional correction — 2026-10-27

The user clarified that “sharp” means code quality and working features. Base: `fbee7df`; local branch: `fix/settings-functionality`. The [functional checklist](FUNCTIONALITY.md) records the actual state of every Settings control. Eight named features still have no backend, and Storage is partial; their explanatory screens do not close functional acceptance.

Fixed a real preference-persistence defect: startup loading now returns validated preferences plus storage availability, and App initializes its persistence state from that result. A denied/unavailable store is reported immediately, including after reload; the footer no longer claims automatic saves. Safe defaults remain usable. Malformed readable data is kept distinct from unavailable storage. The existing preference-only accessor remains compatible; no new fields or startup writes were introduced.

The new browser check was observed failing before the fix, including the contradictory footer case, and now passes with the 25-check browser suite. Preference-boundary checks, typecheck/build and three actual Electron workflows also pass. Routing preflight still lacks nft, CAP_NET_ADMIN and CAP_SYS_ADMIN; no routing or launch gate was weakened. No visual redesign, new integration, push or remote merge was performed in this correction.

## Sharpened revision — 2026-10-27

Base: `c255517`. Local branch: `feat/sharp-settings`. Implemented the user's supplied HTML revision in the existing Electron/Solid screen: desktop rail/search, compact chips, current state, tighter cards/rows, library icon tiles, mono values, accent markers and six colours led by true CSS Crimson. Existing Sage/Indigo preferences remain compatible. Browsing report now sits beneath Trocador under Account and stays Off. SOCKS5 shows Direct, explained as no configured proxy; Routing remains Blocked. Data controls resets only device preferences.

Fresh checks: 260 backend tests passed / 3 existing skips; 24 browser checks and 3 Electron workflows passed; typecheck/build passed. Browser regressions caught and fixed final-viewport scroll tracking and compact sticky-search overlap. Actual Electron still verifies preference persistence after restart and real workspace locking. No backend/schema/provider/routing change or new dependency was introduced. A bundled Tabler favicon removes the browser preview's missing-icon request; the existing MIT notice covers it.

The checked [implementation plan](superpowers/plans/2026-10-27-settings-sharpening.md), [current guide](SETTINGS.md), [audit](PLAN-AUDIT.md) and refreshed images describe this revision. Everything remains local; no push or remote merge.

## Earlier screenshot-based increment

Base: `7125ca7`. Local branch: `feat/reference-settings`. The user requested the provided grouped dark/crimson settings reference. All work remains local; do not push from this workstream.

Implementation lives in renderer `SettingsPanel.tsx`, `settings.css`, `SettingsIcon.tsx`, `preferences.ts`, `themes.css`, and App entry/keyboard wiring. Tabler outline assets (MIT) and Inter Variable font assets (OFL) are bundled; no external asset host is used. No backend, vault schema, routing or provider setup change is included.

Their full license notices are included in renderer `public/THIRD-PARTY-NOTICES.txt` and verified in the built output.

Implemented device preferences save only five validated enum/boolean values. Pending account/payment/cloud/map/SOCKS5/report services open explanations without pretending to be connected. Workspace lock and operation timeout information remain accurate; critical cleanup warnings bypass optional-notification suppression.

Testing: 33 preference-boundary tests added; full backend suite 252 passed / 3 existing skips; browser suite 18 passed; actual Electron suite 3 passed, including restart persistence and real workspace locking from the shortcut. Typecheck, production build and diff checks passed. Browser tests cover every row, section navigation, light/dark/system, persistence, optional messages/required warnings, keyboard containment, Escape and focus restoration. Electron settings checked without console/page errors.

Independent bounded source review found no blocker. Review notes about shortcut coverage were addressed by the actual Electron test. Visual review corrected a cropped overview anchor and sticky navigation exposing clipped preceding text; the latest captures are in `docs/images/settings-*.png`. [Visual QA](../design-qa.md).
