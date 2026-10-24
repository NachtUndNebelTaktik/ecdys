# ecdys — Product continuity audit

Audit date: 2026-10-24. Application baseline: v0.6.0, commit `c1bd6847af460cebabd34b536c79bc7d4a777301`.

The review compared the owner's original v3.0 blueprint and subsequent instructions, the retained [browser blueprint v4.0](../BLUEPRINT-v4.0.md), its [change ledger](../CHANGE-LEDGER-v4.0.md) and [data contracts](../specs/DATA-CONTRACTS-v4.0.md), the [shared conversation](https://gab.ai/c/6adcad28c9e4acbaeba2d67f?public=true), and [Master Specification Revision 2](../MASTER-SPEC-REVISION-2.md). Source inspection checked the current implementation separately.

## Overall finding

No major original product capability was found deleted from the plan. The master explicitly retains the detailed browser requirements by reference, not only their abbreviated Appendix A entries. All US-1–US-30 and M0–M22 remain requirements. This was a comparison of acceptance clauses and cross-references, not merely a count of headings.

There are seven specification seams below: an incomplete contract update, an unresolved policy change, a weakened redaction requirement, two lifecycle ambiguities, a weakened deletion-UI requirement and a stale migration premise. These should be reconciled before dependent work. They do not imply that the full native tooling or persistent browser is implemented.

## Scope that remains preserved

| Original capability                                                                                        | Retained location                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Random-ID/email identity, pricing tiers, all payment methods including Monero                              | Browser blueprint US-1/2; master Appendix A US-1/2                                                                           |
| Persistent isolated profiles, automatic session recovery, history, branching and restore                   | Browser blueprint US-3/4/5 and §4.1/4.6; master Appendix A US-3/4/5                                                          |
| VPN, authenticated SOCKS5/CONNECT, pools, switching, rotation and route locking                            | Browser blueprint US-6/7/8; master §6 and Appendix A US-6/7/8                                                                |
| Fingerprint controls, WebRTC policy, validation, health and inspection                                     | Browser blueprint US-9/10/16/17/21; master Appendix A                                                                        |
| Flight recorder, folders/tags/filters, profile map, command palette, bulk operations and resource governor | Browser blueprint US-11–15; master Appendix A                                                                                |
| Comparison lab, capsules, profile connection map, recipes and disposable children                          | Browser blueprint US-18/19/20/22/23; master Appendix A. Research mindmap remains separate from the profile connection map.   |
| Teams, roles, invitations, device authorization and audit                                                  | Browser blueprint US-24/25 and team contracts; master §17 and Appendix A. Teams have not become a different product.         |
| Billing, cancellation/grace, transfer and controlled updates/rollback                                      | Browser blueprint US-26/27/28; master Appendix A                                                                             |
| Selenium, Python/Node client examples and trial playground                                                 | Browser blueprint US-29/30; master Appendix A                                                                                |
| Offline local work and permanent offline one-time entitlements                                             | Browser blueprint §4.11 and US-1/26/27/28; master §8/17 and retained references                                              |
| Rounded wide browser, customizable layout/appearance, Light/Dark/System/Night/Crimson                      | Master closing requirements; implemented appearance and browser workspace. Crimson remains night-black with crimson accents. |
| Mindmap, encrypted notepad and saved files below OSINT, optional Pro 1 GB cloud                            | Master §7/8; implemented local mindmap/notepad/files. Cloud remains separately gated and unconnected.                        |
| Operator-owned tool registry, docking, console and minimal mode                                            | Master §4/9/10/11. Most of this native-tooling work remains unimplemented.                                                   |
| Product name ecdys, domain ecdys.app, GitHub source                                                        | README and native application metadata; existing storage-directory names preserve saved vault compatibility.                 |

## Specification details needing reconciliation

1. **Direct routing has no matching current normative data contract.** Master §6 permits Direct, but `RouteConfigV1` only has VPN/SOCKS5/CONNECT variants, and endpoint/binding records require an endpoint. The implementation already represents an explicitly Direct profile with a null saved route; its temporary broker captures `{kind:'direct'}`. The future versioned contract and migration must define that state and its DNS/egress policy rather than reverting to a mandatory proxy or inventing an endpoint. Sources: [master §6](../MASTER-SPEC-REVISION-2.md#6-browser-panel), [contracts §5.1](../specs/DATA-CONTRACTS-v4.0.md#51-profile-configuration), [workspace admission](../packages/desktop/src/workspace.ts).

2. **Route-lock-off fallback has contradictory instructions.** The retained blueprint §4.3 and `EgressPolicyV1` allow warned, preauthorized direct fallback after loss of an active route when route lock is disabled. The new master §6 requires an explicit route change after proxy failure. The stricter rule is not accompanied by an explicit retirement/migration decision for the former policy. Reconcile this deliberately. Current temporary browsing stays fail-closed for every configured proxy; this audit does not enable fallback. Sources: [blueprint §4.3](../BLUEPRINT-v4.0.md#43-routing-providers-and-route-locking), contracts §5.1, master §6.

3. **Declared secret-pattern redaction before output storage lost its explicit requirement.** The shared master §12, Secrets, says: “Redaction pass over stdout/stderr before storage where the adapter declares secret patterns.” Revision 2 §12 explicitly redacts ordinary logs/share exports, while §5/10 preserves encrypted raw output and distinguishes raw/redacted hashes. Encryption does not substitute for the earlier redaction policy. Restore an explicit storage rule or record a deliberate, operator-controlled raw-retention exception, with honest labels/hashes. This affects the future job pipeline, which is not implemented yet.

4. **Job control-connection loss needs a named policy.** The shared master §9.5 says cancelling the browser connection must not leave a job running. Revision 2 §9.6 kills on cancellation/coordinator loss, while §10/11 allow reconnecting, hidden panels and continuing jobs. Distinguish deliberate cancel, panel remount, temporary renderer disconnect and loss of the last authorized controller; specify supervision/deadline and reconnection behavior for each. The existing cancellation requirement remains; the ordinary disconnect case is ambiguous.

5. **Protected-session continuity needs explicit UI-lock/full-lock wording.** The browser blueprint §4.2 distinguishes an inactivity UI lock, under which protected work can continue, from full lock, which saves/closes sessions. Master §8.1/11 refers broadly to lock cleanup “according to the lock policy.” The retained reference may preserve the distinction, but it should be explicit so an idle UI event does not unexpectedly end future trading sessions. Current temporary sessions explicitly discard on lock, and protected sessions are not launchable; this is not a claim of a current protected-session defect.

6. **Research retention and deletion recoverability became documentation-only.** Shared master §12, Data, requires per-case/per-attachment retention and deletion behavior in the UI, including whether deletion is recoverable. Revision 2 §8.1 keeps per-item removal and §12 calls for documentation, but neither explicitly retains that operator-facing requirement. Restore the UI disclosure for research cases/attachments, with accurate limits for backups and ciphertext/key deletion. Profile snapshot/log retention clauses do not cover this separately.

7. **The binding migration reference has an obsolete premise.** Data contracts §7 says there is no existing repository/database and describes an existing database as hypothetical. The application now has real v1–v4 migrations and saved operator data; master §0/5 requires preserving it. Treat the old sentence as historical, and publish a current contract/migration addendum before new schema work. Do not replace real data based on the original design-only premise.

## Implementation depth that must stay visible

These capabilities remain planned; their absence in v0.6.0 is not evidence that they were removed from the product.

- **Wallet extensions:** the temporary browser launches with `--disable-extensions`. It cannot presently run extension-based wallet workflows. See [browser-worker.ts](../packages/desktop/src/browser-worker.ts), launch flags around line 176. Original extension compatibility and permission controls remain in blueprint §4.9.
- **Ordinary web tabs:** visible workspace tabs contain local start/search state. They hide during live browsing, and the browser worker closes other page targets. There is one live page, not a finished multi-tab chart/browser workflow. See [BrowserWorkspace.tsx](../packages/renderer/src/BrowserWorkspace.tsx), local state/navigation and live visibility; browser worker target handling around line 259.
- **Chart and browser interaction:** the input contract has pointer down/up without move/drag, and the renderer does not forward Ctrl/Meta/Alt combinations. Browser shortcuts, chart dragging and hover-dependent controls are incomplete. See [shared input contracts](../packages/shared/src/index.ts), pointer schema around line 320, and [TemporaryBrowser.tsx](../packages/renderer/src/TemporaryBrowser.tsx), event handlers around line 203.
- **Appearance versus website rendering:** rounded/wide chrome and appearance controls are implemented. “Browser text size” changes interface CSS; it does not implement page zoom/font control. The live viewport is a fixed 1200×720 image stream. Its roughly eight-frame-per-second development path, with GPU disabled, is not trading-performance evidence. See [BrowserAppearance.tsx](../packages/renderer/src/BrowserAppearance.tsx), browser worker metrics and [runtime limitations](BROWSER-RUNTIME.md).
- **Cases and sets:** the implemented research store is one global encrypted document, bounded to 100 nodes, 200 links and 60 website tools. Case-scoped documents, docked layouts, result provenance, native tools/console and minimal mode remain future work. See [research persistence](../packages/desktop/src/research.ts) and [research schema](../packages/shared/src/research.ts).
- **Full station capability:** browser-state snapshots, persistent/multiple managed sessions, live SOCKS5 switching, provider VPNs, fingerprints/WebRTC, lab, capsules, recipes, resource governance, Selenium, commerce/licensing, team service and signed platform releases remain unfinished. [Build status](BUILD-STATUS.md) already records most of these boundaries. Monero and teams remain requirements, not connected services.

One small copy mismatch remains in `BrowserWorkspace.tsx` around line 101: the local-address message tells operators to use temporary browsing “through a saved proxy,” despite explicit Direct support. This is stale wording, not a runtime routing failure.

## Intentional changes, not losses

The owner's Revision 2 deliberately removes bundled catalogues/binaries, hardcoded tool-name lists, forced Docker/toolchains and compulsory proxy use. It makes cloud independently removable and limits the revised tooling/cloud dependency gates to two. These do not remove proxy support, Monero, teams, offline use or browser release obligations.

Earlier mechanism corrections remain recorded in the change ledger: a maintained browser baseline instead of frozen Chromium 120, native route enforcement instead of per-request IP polling, independent wrapped snapshot keys instead of stored raw keys, actual authenticated WebDriver instead of CDP tokens sent to websites, honest non-Chromium preset limitations, and brokered quarantine. Their intended capabilities remain required.

## Audit limits and handoff

This was a requirements/source review with independent browser-contract, shared-master and implementation checks. No application behavior or product policy was changed, and no fresh application test/build run is claimed. Documentation verification checks the report's links, requirement mappings, source presence, unchanged application files and source checksums. Existing development test results do not prove the unfinished product works.

Priorities for dependent work: reconcile the seven specification seams; expose the browser limits clearly; then complete the workstation's browser/session and case/layout/job foundations without dropping the retained features. Pricing reconciliation remains deferred as the owner requested. No new commercial figures, shipment date or reduction in product scope is proposed by this audit.
