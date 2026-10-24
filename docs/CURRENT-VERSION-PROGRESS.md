# Styg 0.6 stability pass

Base c9475c1; branch fix/current-version-stability. Work stays within the current version: no new tunnel activation, browser launch enablement or external account mutation.

Read-only backend/UI reviews run in parallel. Confirmed issues:

- Failed registration rechecks retain old successful verification and may permit stale tunnel preparation.
- A catalog result from a dismissed dialog can appear in a new dialog for the same profile.
- A dialog reopened during provider removal retains old state; its Recheck action can accidentally create a fresh provider registration without fresh slot consent.
- Registration validity is checked before catalog I/O but can expire while that I/O is pending.
- A lost deletion response retains old approval even when the provider deleted the session.
- Slot-consent state survives same-dialog removal and must be cleared after successful actions.

Fix scope: guarded recheck-only action, conservative verification invalidation, post-I/O validity checks, dialog generation checks, and polling only while a provider operation is active. Reproduce each issue before fixing; verify the complete current-version suite and desktop workflows, then commit locally.

Implemented with failing regressions first, then passing focused checks: failed Mullvad/IVPN recheck approval, recheck after removal without new creation, expiration during catalog I/O, lost deletion response/reopen, canceled recheck/removal, delayed removal/dialog reopening, dismissed catalog errors, and fresh slot consent after same-dialog removal. The public route gate and schema v5 are unchanged. Patch version 0.6.1.

Final validation: backend 176 passed / 2 opt-in skipped; typecheck and production build passed; browser UI 2 passed; actual Electron workflows 2 passed. No live account credentials, provider-side registration or host-network changes were used in this pass. Changes remain on the local fix branch.

Final bounded backend and UI reviews found no remaining blockers in the fixes and regression coverage.
