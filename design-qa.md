# Ecdys sharpened settings visual QA — 2026-10-27

Source truth: the user's selected 2026-10-27 EcDys Settings HTML/CSS and sharpening notes, superseding the earlier portrait screenshot crops. This review compares the supplied visual specification with fresh rendered captures; it does not claim a pixel-identical reproduction of a full-page reference inside an Electron modal.

## Rendered evidence

- `docs/images/settings-overview.png`, `settings-app.png`, `settings-help.png`: dark/Crimson, 1440 × 1000 browser viewport; 1392 × 952 dialog including its border.
- `docs/images/settings-light.png`: Light/Violet at the same viewport.
- `docs/images/settings-compact.png`: dark/Crimson, 860 × 800 compact desktop viewport; search and section chips replace the rail.
- `docs/images/settings-electron.png`: actual Linux Electron window, captured after restart persistence and real workspace locking; the headless display constrains window height.

Browser geometry inspection measured a **266px rail, 14px card radius, 52px minimum row height, 23px icon tiles and `#dc143c` base accent**. No horizontal dialog overflow occurred. The final capture run recorded no JavaScript/console errors or failed HTTP responses.

## Fidelity and deliberate adjustments

- The rail, compact chips, search, wide current-state panel, hairline card treatment, section ticks, active navigation rail, icon tiles, mono values and six-colour palette follow the supplied revision. Crimson leads the palette; all accent treatments derive from the selected theme token. Small accent text/button ink uses a readable derived or contrasting colour.
- Fonts and Tabler outline icons are bundled locally. Cloud, route, graph and swap controls use library glyphs. Their MIT and Inter's OFL notices remain included in the build. The favicon is an unmodified bundled Tabler fingerprint asset.
- Every supplied control is represented, including Data controls. Browsing report now sits under Account immediately after Trocador. There is no filler Age row.
- The example email, Pro entitlement, unlocked vault, old build number and Weekly cadence are replaced with actual availability/version/lock state. Browsing report stays Off. SOCKS5 Direct means no configured proxy; Routing explicitly remains Blocked. Unavailable Mindmap/payment/cloud services remain unavailable.
- Inert dots are hollow grey; active dots use the selected accent. Colour is accompanied by a state label. The close control remains accessible while scrolling.
- Existing saved Sage/Indigo values remain compatible; they do not silently reset the other preferences. New selection offers the six supplied colours in order.

## Findings resolved

- At the end of a long viewport, multiple sections can be visible together. Scroll tracking initially overwrote an explicit navigation choice. It now preserves that choice until the content actually moves, then resumes tracking.
- Compact sticky search initially covered an Account heading after navigation. Jumps now use the scroll container's actual padding; a browser check verifies the heading is not occluded.
- A manual browser capture exposed the preview's missing favicon request. A local library asset fixes that request; no console errors remain in the final capture.

At the end of the page, adjacent groups can remain visible because scrolling is naturally bounded by the content height. Explicit section navigation remains selected. This is not presented as a separate tab view.

No remaining actionable P0/P1/P2 issue was found within this settings revision.

## Interaction evidence

**25 browser checks passed**, including every detail row, appearance/system/accent persistence, search/current-value filtering/empty state, Escape and slash typing, filtered navigation, scroll tracking, compact heading visibility, legacy accents, preference reset, startup storage failure handling, mandatory cleanup warnings, native focus containment and focus restoration. The later functional correction changes the unavailable-storage warning/footer state; default visual captures remain representative.

**3 Electron workflows passed**, including preference persistence after restart and locking a real encrypted workspace with Ctrl/Cmd+Shift+L. The settings workflow captured no console or page errors. Typecheck and production build passed. The full default unit/integration suite passed **260 tests with 3 existing skips**; the maximum-size opt-in recovery, privileged routing and offline MHTML-opening conditions are documented in the plan audit rather than counted as passes.

## Scope and handoff

This is a local renderer/preferences increment. It adds no account, payment, wallet, proxy, map, report or cloud backend. Browser routing/launch gates stay intact. Native macOS/Windows acceptance is not covered by these Linux checks. Changes remain local; no push or remote merge.

final result: passed
