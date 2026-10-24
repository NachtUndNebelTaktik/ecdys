# ecdys — Tooling Revision 2 change and evidence record

Revision date: 2026-10-24. Application slice: v0.6.0 development foundation.

## Source and continuity

The owner's [public shared conversation](https://gab.ai/c/6adcad28c9e4acbaeba2d67f?public=true) contains a separate master specification whose Section 9 defines tooling. [MASTER-SPEC-REVISION-2.md](../MASTER-SPEC-REVISION-2.md) consolidates that master and the supplied replacement Section 9 into one document.

The existing browser blueprint's Section 9 is a risk register. It was not overwritten. BLUEPRINT-v4.0.md, CHANGE-LEDGER-v4.0.md, specs/DATA-CONTRACTS-v4.0.md and VERIFICATION-v4.0.md remain unchanged historical/detailed references. The new master identifies its explicit overrides and lists all thirty retained requirements. Browser/profile recovery, Monero, authenticated SOCKS5 switching, teams, offline operation, trading and the full desktop scope remain required.

## Changes to requirements

- No tools, binaries, catalogues or tool-name allowlists/denylists ship in the core. Manual executable registration, strict manifests and an offline local YAML adapter populate an operator-owned registry.
- Import performs data validation, never repository fetching, installation or executable probing. Health/version probes are explicit execution with the selected policy.
- argv arrays, agent-side validation, bounded parsers, limits, supervision, active-scope acknowledgement, declared network intent and truthful provenance remain mandatory. Conditional templates emit zero or one element; they never split field values.
- Process, native sandbox and optional container profiles have explicit capability boundaries. Process retains host-user access; it cannot promise complete network confinement or egress observation. Missing container support denies a job without downgrade.
- Direct is a valid browser route. It is never a recovery path for a failed selected proxy or unavailable VPN.
- Layouts use an application-owned format behind `LayoutEngine`. Cloud is a removable optional bundle; packaged application runtimes remove end-user toolchain requirements.
- The two dependency gates are the [platform capability matrix](TOOLING-CAPABILITY-MATRIX.md) and the cloud threat model. Cloud's gate blocks only cloud. Retained browser/payment/team/release acceptance checks remain obligations for their own features.
- Core dependency licences still apply. Not redistributing third-party tools removes their redistribution audit as a core dependency; an operator-supplied licence string is not legal certification.

## Implemented in this slice

| Change                             | Observed behavior                                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty website tool shelf           | Fresh research documents contain zero tool definitions and show **No tools configured.** Manual website registration works. Existing saved entries survive reopen and schema migration.                    |
| Explicit Direct temporary browsing | A Standard profile without a saved proxy uses the disclosed Direct policy in the existing Linux temporary browser. Namespaces, destination admission, profile leases and close/lock cleanup remain active. |
| Proxy failure policy               | A session captures its selected policy. Failed SOCKS5/CONNECT connections do not open direct destination sockets. Unsupported VPN and protected execution remain denied with reasons.                      |
| Consolidated specification         | Sections 0–18, full Section 9.0–9.8, a valid JSON manifest example, two revised gates and all thirty original requirement references are present.                                                          |

No 219-tool catalogue was present in this repository. The actual code change removes six seeded website definitions from fresh research documents; it does not erase existing operator data. No upstream repository was cloned, tool binary fetched, container image pulled or toolchain installed for this revision.

## Verification scope

The core suite exercises fresh/reopened/migrated research data, proxy and Direct transport admission, captured policy, no-fallback behavior and the existing encrypted storage/browser boundaries. The real Electron suite covers appearance, encrypted profile/notepad operations, the designed empty shelf, authenticated SOCKS5 browsing and Direct browsing against owned loopback fixtures. No external target investigation is part of these checks. Final results: typecheck passed; 91 core tests across thirteen files passed; renderer/main/preload/worker production builds passed; all five real Electron scenarios passed. Commands and additional scope are recorded in [build status](BUILD-STATUS.md).

A read-only review checked continuity and found two specification overclaims. The final text now discloses same-user access in process mode and bounds imported field/version regex evaluation as well as output parsing. Code adapters explicitly inherit the selected profile's limitations. A separate route review found no confirmed Direct bypass or proxy downgrade; it requested pending-connection cancellation/failure coverage. Three deterministic regressions now cover connection failure, cancellation during pending connection/lookup, and the exact six-second deadline, including socket/listener/timer cleanup.

The JSON example is parsed as strict JSON. Document checks verify numbered sections, all thirty requirement references, two gate headings, local links and byte-for-byte preservation of the four existing specification files. Formatting, typecheck, production builds, core tests and real Electron checks validate the application slice; none certifies an unimplemented native tool executor.

## Specified work still pending

Native executable registration and health, manifest/catalogue import, the portable registry, execution profiles, job manager/console, code adapters, docking and minimal mode are not implemented. The current shelf registers website links only. Its UI does not expose inactive import buttons or fabricated version/run results.

The capability matrix records Linux observations and candidate macOS/Windows facilities. All arbitrary-tool executor profiles are currently unavailable in ecdys. Existing Chromium containment does not certify arbitrary binaries. Cloud transport and paid entitlement verification remain unconnected; the current local application has no cloud runtime dependency.

Persistent browser-state recovery, native platform releases, provider/payment/team integrations and trading performance remain in the retained product plan. This is a tested development slice and consolidated implementation contract, not completion of the full product.
