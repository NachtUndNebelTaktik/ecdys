# ecdys.app — Blueprint Revision Verification

**Date:** 2026-10-24  
**Task:** Implement the approved full blueprint revision.  
**Artifact:** Documentation, data/interface contracts, and integration examples. This report does not certify an application implementation.

## Checks performed

| Check | Result and evidence |
| --- | --- |
| Requirement coverage | All US-1 through US-30 appear once as full requirement sections, in order, and appear in the change-ledger continuity map. |
| Milestone coverage | All 23 milestones M0–M22 appear in order, with dependency/exit evidence and a team workstream. |
| Original decisions | All 36 original decisions D01–D36 have an explicit preserved/clarified/corrected disposition and rationale. |
| Owner steering | ecdys.app naming, essential proxies/SOCKS5 switching/Monero, self-hosted team feature, permanent offline one-time licenses, and deferred prices are explicit. |
| Data separation | Local operational, self-hosted collaboration, commercial authority, and ephemeral runtime data have separate contracts. |
| Integration examples | Python AST parse and Node.js syntax check passed. Both include request pacing for free-tier compatibility. No dependency installation, running gateway, website navigation, screenshot capture, or Selenium end-to-end test was performed. |
| Local document links | All relative links and local heading fragments resolve. |
| Official references | Consulted official Electron, ChromeDriver, Selenium, MDN, Stripe, Monero, SQLite/SQLCipher, GnuPG, provider, and Apple documentation as indicated in the blueprint. Version-sensitive integration facts remain implementation gates. |
| Scope | No application scaffold, production migration, merchant account, domain, inbox, infrastructure, public release, or deployment was created. |

## Verification commands

Python's ast.parse was used for examples/selenium_python.py. Node was invoked with:

    node --check examples/selenium_node.cjs

Ad hoc read-only Python checks compared ordered US, M, and D identifiers against complete ranges, resolved local document links/anchors, and checked the six corrected consistency rules against the final artifacts. These checks establish document structure, not application behavior.

## Independent review

An independent read-only reviewer checked substantive requirement omissions, cross-document conflicts, type/schema inconsistencies, trust-boundary errors, and examples. The reviewer found no Critical issue and six Important issues in the draft. The author corrected them:

| Finding | Final correction |
| --- | --- |
| Required unknown/unsupported validation could evade strict admission | Require pass for every required due check across requirements and contracts. |
| Route-lock fallback/DNS behavior could not be serialized | Add EgressPolicyV1 discriminated policy and explicit accepted direct-fallback behavior. |
| Payment allocation referenced a nonexistent output ID | Add PaymentOutput UUID and retain natural-key uniqueness. |
| Async signing had no valid pending entitlement | Add pending_signature, nullable JWT/key/issue time, and atomic activation after signing. |
| Fast example requests could exceed free-tier limits, including quit | Pace all transport commands with 250 ms after completion and serialize requests. |
| Gateway inventory omitted title/window commands | Add the routes and compatibility behavior. |

The reviewer confirmed all 30 capability areas, required proxies/SOCKS5/Monero, offline licensing, desktop targets, and workstation identity remained. The corrections received author consistency/syntax checks; no second independent approval of the final revised files or runtime execution is claimed.

## Limits and prerequisites

The documentation describes unbuilt software. Native route enforcement, simultaneous VPN routing, protected storage, browser fingerprint patches, WebRTC disabling, live lab bridging, script isolation, encrypted team sync, real payment settlement, and update rollback have not been executed or proven in this task.

No security certification, anonymity guarantee, performance benchmark, commercial readiness, delivery date, or tested OS support is inferred from document completeness or example syntax.

The blueprint explicitly requires G1–G6 feasibility evidence and the full release matrix. Pricing/catalog reconciliation, actual provider access, native entitlements, merchant credentials, code signing, and support provisioning remain release prerequisites. Their absence does not remove the corresponding capabilities.
