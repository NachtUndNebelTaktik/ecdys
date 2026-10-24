# Ecdys settings visual QA

Source visual truth: the three settings screenshots attached by the user in this conversation (overview, theme/app settings, help). The source images are not committed; the example email is not retained as application data or a fixture.

Implementation evidence: `docs/images/settings-overview.png`, `settings-app.png`, `settings-help.png`, and the actual Electron capture `settings-electron.png`.

Comparison state: dark appearance, crimson accent, default overview and section-jump states. Browser viewport 1440 × 1000 CSS px, deviceScaleFactor 1; dialog captures 940 × 952 pixels. The reference consists of portrait crops at differing presentation sizes. This is an adaptation within the existing desktop app, not a claim of pixel-identical mobile-screen reproduction. Comparison uses corresponding content groups at a consistent readable scale, rather than comparing crop heights as layout errors.

## Findings and comparison history

- Initial overview anchor scrolled the Settings heading out of view. Environment now returns to the top, and the final overview capture includes the heading, introduction, pills and Customize/Account groups.
- Sticky navigation initially left clipped preceding text above it. The sticky offset and section scroll margin were corrected; final App/Help captures keep the navigation against the dialog edge. At the bottom, earlier sections remain visible because the desktop viewport is taller than the Help section; all Help controls remain in view.
- Typography initially used a platform fallback. Inter Variable is now bundled locally, with monospaced navigation and metadata; no external font requests are needed.
- The Monero icon uses the library's circled coin mark to match the reference's treatment.
- Small accent text uses a lighter theme-derived crimson on dark surfaces so the kicker and existing snapshot actions remain readable; filled action buttons retain the crimson base.

No remaining actionable P0/P1/P2 issue was found in the desktop adaptation.

## Required fidelity surfaces

- **Fonts/typography:** locally bundled variable sans serif, strong Settings heading, smaller muted introduction, medium-weight row labels and spaced monospaced section/metadata text. Density is intentionally adapted for desktop.
- **Spacing/layout:** rounded grouped cards, consistent row dividers starting after the icon column, right-aligned values/chevrons, section markers, pill navigation and persistent close control. Every supplied row is represented.
- **Colours/tokens:** black base, charcoal cards, subdued dividers, light text, muted metadata and crimson highlights. Light/system appearances also render and persist correctly.
- **Assets:** bundled MIT Tabler outline icons; no rasterized interface, remote icon service or generated substitute. Bundled Inter font uses OFL licensing.
- **Copy/content:** section/row names follow the reference. Device-only persistence text and pending service values are deliberate correctness adjustments. The example email, Pro entitlement, working proxy, wallet and cloud connection are not fabricated.

Full-view evidence is the overview/app/help capture set. Focused review covered card dividers, icon/label/value columns, accent selector, close button and Help card rows in those rendered captures; text/icons are readable at their native dimensions.

## Interaction and accessibility evidence

18 browser checks pass, including every row/detail, section navigation, appearance/accent/system changes, persistence, density/motion, optional messages with mandatory cleanup warnings, native modal containment, Escape/back and focus restoration. Three Electron workflows pass, including real workspace lock by shortcut and preference persistence after restart. Electron settings produced no console/page errors. Typecheck and production build pass; the complete backend suite passes 252 tests with three documented environment/opt-in skips.

## Implementation checklist

- [x] All supplied settings groups and rows included.
- [x] Local presentation preferences apply immediately and persist.
- [x] Pending integrations remain accurate and make no new connection.
- [x] Native dialog controls and keyboard paths verified.
- [x] Updated rendered evidence inspected after the visual fixes.
- [x] Changes remain local; no push or remote merge.

Follow-up polish: align future connected-account/service states when those backends exist. Responsive styling is present; native macOS/Windows and a mobile product are not covered by this Linux desktop verification.

final result: passed
