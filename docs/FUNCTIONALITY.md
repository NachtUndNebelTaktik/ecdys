# Functional acceptance

The user's “sharp” requirement means maintainable code and working features. Completion is judged by the action a feature performs, its persisted result, its failure handling and executable acceptance checks. Interface coverage is tracked separately from underlying feature delivery.

## Settings controls

| Control | Current functional state | Required action / remaining acceptance |
| --- | --- | --- |
| Personalization | Working | Profile density and reduced motion apply immediately and persist across restart. |
| Mindmap | Missing | Create/use a local workspace map, persist positions and navigate real profiles. |
| SOCKS5 | Missing | Configure and authenticate the proxy, route actual profile traffic and verify direct-fallback denial. “Direct” currently means no proxy is configured. |
| Email | Missing | Link/verify an account email and exercise account sign-in/recovery. |
| Subscription | Missing | Confirm a real purchase, issue/validate entitlements and handle renewal/cancellation. |
| Trocador | Missing | Obtain a real quote, create/track a swap and handle provider failures. |
| Browsing report | Missing | Collect permitted real events, apply retention/cadence choices and generate/export the report. |
| Appearance | Working | Dark/light/system changes apply and persist; system changes are observed. |
| Accent colour | Working | Six colours apply/persist; previous Sage/Indigo choices remain compatible. |
| General | Working read-only | Display the current build/platform and workspace lock state. |
| Notifications | Working in-app | Toggle optional success messages while preserving errors and cleanup warnings. OS push notifications are outside this implementation. |
| Monero | Missing | Configure an actual wallet/payment connection and verify transaction/confirmation handling. |
| Security | Working local lock | Close the real encrypted workspace and enforce the existing operation-based timeout. OS route protection and the complete blueprint threat model remain pending. |
| Secure cloud storage | Missing | Configure a real sync target, transfer authenticated encrypted data and verify restore/conflicts. |
| Storage | Partial | Profile/selected-snapshot counts and backup guidance work; capacity accounting and storage-management actions are not implemented. |
| Data controls | Working device reset | Reset the five device preferences while preserving the workspace and unrelated storage. |
| Help centre | Working local guidance | Explain the available profile, recovery and routing workflows. |
| Keyboard shortcuts | Working | Settings, search, Escape/back and desktop workspace lock operate through their actual controls. |

The eight missing entries currently open availability explanations. Their underlying features are incomplete. The larger blueprint has additional unfinished work; see the [implementation audit](PLAN-AUDIT.md).

## Current application flows

Encrypted workspace creation/unlock/lock, profile creation/editing, snapshots/restores, recovery checks and branches have working local implementations and integration checks. Provider registration/recovery clients have synthetic protocol acceptance. The page archive engine is tested against local Chromium fixtures.

The product cannot yet launch a browsing profile: the trusted production supervisor is intentionally blocked because actual OS-enforced provider routing is not implemented/verified. Consequently the normal in-app page archive workflow is also blocked. Fingerprint controls/validation, Selenium, team accounts, billing and cloud services are unfinished.

## Correction completed in this pass

Startup preference loading used to discard the reason for falling back to defaults; the app then initialized its persistence indicator to success. A denied store therefore displayed an automatic-save claim until a write was attempted. Loading now returns validated preferences together with storage availability. Settings immediately reports session-only changes when reads fail, including after reload; its footer uses the same state. Malformed readable preference data still falls back safely without being misclassified as denied storage. No new preference fields or storage writes were added.

## Next functional dependency

Implement the trusted Linux profile routing supervisor, verify it with actual provider/browser traffic and then enable the managed browser launch path. The 2026-10-27 preflight still reports missing nft, CAP_NET_ADMIN and CAP_SYS_ADMIN in this executor. A real isolation proof requires a suitably equipped host; the existing block remains enforced. Remaining local tools and external integrations retain their own acceptance gates.
