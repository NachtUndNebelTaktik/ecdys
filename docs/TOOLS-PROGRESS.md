# Ecdys built-in tools handoff

Local branch: `feat/recovery-rehearsal`, following rename commit `c238991`. The rename preserves the legacy workspace directory, encryption identifiers and recovery markers; opening an old-build workspace in the renamed app was checked directly.

Implemented:

- Recovery Rehearsal: configuration and browser archives authenticate and validate in the existing bounded worker, with counts derived from decoded contents and no file extraction. Lock cancels it; stale UI results and removed/replaced snapshots are rejected.
- Page archive: typed private-CDP MHTML capture, HTTP(S) target restrictions, owned-session checks, 4 MiB output cap, SHA-256 and explicit native Save dialog. Existing files are preserved, new files use private permissions, and stale-owner exports are removed.
- Oversized CDP responses reject pending commands and drain to their delimiter without closing the live browser. New commands remain correlated by their own IDs.
- Native utilities appear in profile details. Current production launch/routing gates remain in place.

Backend and frontend were implemented in parallel with failing tests first and separate bounded read-only reviews; neither review found a remaining blocker. Real local Chromium capture includes DOM text, CSS and image resources. Offline file reopening is blocked by this executor's enterprise policy and is explicitly skipped, without changing policy.

Final integrated verification: `pnpm test` — 219 passed / 3 skipped (22 files); `pnpm typecheck` and `pnpm build` passed; `pnpm test:ui` — 8 passed; `pnpm test:desktop` — 2 passed. The other skips are the existing opt-in maximum-size and privileged-routing checks. `git diff --check` passed. Screenshots were refreshed from the actual Electron workflow.

GitHub publication belongs to the other workstream. The user explicitly requested **no push** from this workstream. `origin` points to the verified private `NachtUndNebelTaktik/ecdys` repository; only its initial commit was fetched. No project files or commits were uploaded. The remote's Kloakbrowser description is retained in the local README. No remote merge was performed.
