# ecdys — Master Build Specification, Revision 2

**Product:** ecdys. **Domain:** ecdys.app.  
**Revision date:** 2026-10-24.  
**Status:** Current build requirements, not a claim that every capability is implemented.  
**Source:** The owner's [shared master specification and tooling delta](https://gab.ai/c/6adcad28c9e4acbaeba2d67f?public=true), consolidated with the existing ecdys project.  
**Scope:** One desktop workstation for browser operations, security research, crypto/Web3 and browser-based trading. OSINT, teams and offline operation belong to that same product.

## 0. How to use this document

This is the current master for the research workspace and tooling revision. It consolidates the shared master rather than requiring a builder to apply a conversational patch. Sections 1–12 define behavior, Section 13 defines the two revised dependency gates, and Sections 14–18 define delivery and acceptance.

The original [complete browser blueprint](BLUEPRINT-v4.0.md), [decision ledger](CHANGE-LEDGER-v4.0.md) and [data contracts](specs/DATA-CONTRACTS-v4.0.md) remain detailed references for retained browser, recovery, payment and team requirements. This revision explicitly replaces mandatory proxy use, bundled tool/catalogue assumptions and compulsory tool runtimes. It does not delete unrelated capabilities, security checks or release obligations. Appendix A records their continuity.

Read actual project files first. Reuse the Electron/Solid/TypeScript application, encrypted vault, IPC boundary and existing browser supervisor. Do not replace the application with a React website, a Python deployment or an upstream tool launcher. [Build status](docs/BUILD-STATUS.md) is the record of implemented and tested behavior; requirements in this document are not implementation evidence.

Do not invent upstream findings, licences, platform support, successful runs, anonymity, or test results. Unknown capability is a visible state. It is not permission to fall back to a weaker profile.

## 1. Product definition

ecdys is a desktop, local-first operational workstation. Profiles, cases, layouts, notes, evidence, browser sessions and tool results stay under the operator's control. The workspace must remain readable and practical as its capabilities grow.

The research surface contains:

1. A dockable workspace with movable, resizable, split, tabbed, collapsed, floating and detached panels.
2. A browser panel with an explicit `direct`, SOCKS5, HTTP CONNECT or supported VPN policy and visible session/storage state.
3. A mindmap with free positioning, labeled relationships, notes and source provenance.
4. An encrypted local notepad and saved files; Pro can add a separate, opt-in 1 GB cloud module.
5. An initially empty operator-owned tool registry and structured parameter forms.
6. A dockable console showing actual job output, limits, cancellation, provenance and exports.

The product's value is the workspace, isolation, recovery, provenance and console. It does not depend on a catalogue, marketplace or account for local tool registration. Proxies, authenticated SOCKS5 switching, Monero, team collaboration and offline operation remain product capabilities; optional proxy use does not make proxy support optional to implement.

## 2. Non-negotiables

- **Local-first:** jobs run on the operator's machine. Browser navigation and explicitly declared tool requests necessarily send data to their selected destinations; exports and cloud synchronization require separate operator actions. Local-first is not a claim that a network tool sends nothing.
- **Zero redistributed tools:** no executable tool definitions, third-party tool binaries or vendored catalogues ship in the core. The packaged application and its own browser/runtime are core dependencies, not an included OSINT tool collection.
- **No unrestricted shell:** the executor takes a resolved executable and an argv array. No endpoint accepts a shell command, command string, pipeline or redirect.
- **Real results:** output displayed as a result comes from a recorded job. Examples and fixtures are labeled; they never masquerade as completed investigations.
- **Explicit policy:** unknown parameters, unresolved executable paths, undeclared network requirements, missing required capabilities or missing keys deny the affected operation with a reason.
- **No silent downgrade:** a missing proxy, sandbox or container runtime never selects a different transport or isolation profile automatically. An explicitly selected Direct browser is a valid policy, distinct from proxy failure.
- **Encryption with defined boundaries:** cloud content and filenames are encrypted on the client. This does not hide account, size, timing, IP or access metadata, prevent an unlocked-device compromise, or eliminate the need for the cloud threat model.
- **No application telemetry:** no background catalogue fetching, repository cloning, tool installation, target scanning or cloud upload.

## 3. System architecture

```text
Packaged renderer: panel shells, layout port, forms, console, minimal mode
        |
        | typed, sender-checked IPC
        v
Local coordinator / packaged agent
  Vault service          encrypted documents and file envelopes
  Registry service       operator JSON, validation, diff and atomic writes
  Local YAML adapter     bytes -> disabled suggestions; no networking/execution
  Policy service         fields, case scope, exposure, capabilities, limits
  Job manager            queue, immutable run definition, events, cancellation
  Executor               executable + argv; selected isolation profile only
  Parser/provenance      bounded parsing, raw output, hashes and versions
        |
        +-- process: operator-trusted binary; host permissions are explicit
        +-- sandbox: tested native filesystem/network confinement
        +-- container: optional operator-provided Docker/Podman environment

Optional cloud module -- explicit encrypted sync --> optional service
```

Electron IPC is the default local transport; an additional HTTP server is not required just to run the desktop. If a standalone agent transport is added, bind to loopback by default, authenticate control and streams, validate origins and scope tokens. Non-loopback access requires explicit configuration and a documented threat model. Never put a reusable control secret in the renderer bundle.

The renderer receives named operations and sanitized data. It gets no arbitrary filesystem, shell, SQL or CDP API. Untrusted websites remain outside the privileged UI. Tool parsers and optional code adapters cannot run inside the coordinator's trusted process.

The agent ships as a signed native component or with an application-owned runtime. Operator installation of Node, Python, Go, Ruby, Docker or tool dependencies is not a condition for launching the application. Development/build version pins remain valid. An operator-selected tool can have its own dependencies; their absence affects that tool's health, not core startup.

## 4. Panel and layout subsystem

### 4.1 Workspace behavior

Every Browser, Mindmap, Notepad, Tools and Console panel can dock left, right, above or below another panel, stack at the center as tabs, resize, collapse and restore. Enforce minimum sizes and accessible focus order. Floating and detached groups retain identity and bounds, including monitor removal/reconnection handling.

Keep named layouts such as Investigation and Capture, per-case persistence, and keyboard equivalents for moving, resizing and switching panels. The notepad and console can sit beside a mindmap. Rearrangement must not lose edits, interrupt a browser, restart a job, duplicate a stream or change the case a panel belongs to.

### 4.2 Application-owned layout format

```ts
type PanelId = 'browser' | 'mindmap' | 'notepad' | 'osint' | 'console';
type LayoutNode =
  | {kind: 'split'; direction: 'row' | 'col'; sizes: number[]; children: LayoutNode[]}
  | {kind: 'tabs'; activeId: string; children: LayoutNode[]}
  | {
      kind: 'panel';
      instanceId: string;
      panelId: PanelId;
      floating?: {x: number; y: number; w: number; h: number};
    };
type SavedLayout = {
  version: number;
  caseId: string;
  name: string;
  tree: LayoutNode;
  savedAt: string;
};

interface LayoutEngine {
  mount(host: HTMLElement, panels: PanelDefinition[]): void;
  restore(layout: SavedLayout): void;
  snapshot(): SavedLayout;
  move(
    instanceId: string,
    targetId: string,
    position: 'left' | 'right' | 'above' | 'below' | 'tab',
  ): void;
  resize(instanceId: string, width: number, height: number): void;
  setMinimal(enabled: boolean): void;
  dispose(): void;
}
```

The persisted format contains no Dockview/FlexLayout types, component objects or DOM references. Validate tree depth, child counts, finite sizes, known panel IDs, unique instances and existing active tabs before applying it. Migrate versioned layouts without discarding the operator's prior arrangement.

### 4.3 Panel registry and state ownership

```ts
interface PanelDefinition {
  id: PanelId;
  title: string;
  singleInstance: boolean;
  minSize: {width: number; height: number};
  sensitive: boolean;
  mount(ctx: PanelContext): PanelHandle;
}
```

Case documents live in a case-scoped workspace store, outside transient panel components. A panel holds view state such as selection, zoom and scroll. Browser and job sessions are owned by the agent/supervisor and referenced by stable IDs, so a dock/remount reattaches rather than relaunches them. Detached windows use the same authorized case/session identities; they receive no vault keys.

### 4.4 Replaceable docking dependency

Use one `LayoutEngine` port and one implementation behind it. Verify the chosen installed library and Solid integration before adopting it. No docking-library type may escape the implementation into panels, data contracts or persistence. Record the chosen version and rationale. No library has been selected or installed by this specification.

## 5. Data model and persistence

These are logical records, not a command to replace the existing encrypted database or discard its migrations.

| Record             | Required data and invariants                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Case               | ID, name, labels, creation/update time, revision and access context. Local cases need no cloud account.                                                                                                     |
| Layout             | Case ID, name, versioned application-owned tree and timestamp. Device preferences remain separate.                                                                                                          |
| Mindmap node/edge  | IDs, case, type, content, positions, relationships and revision; derived nodes include immutable job/result provenance.                                                                                     |
| Notepad/attachment | Encrypted note revisions, file IDs, names inside encrypted metadata, content digest, authenticated envelope and size. Preserve existing v4 vault data.                                                      |
| Tool registry      | One canonical `ec-dys.tools.json` document with definitions and local state. Optional database indexes are derived caches, not another authority.                                                           |
| Job                | ID, case, frozen tool definition/manifest hash, validated parameters, resolved executable identity, argv, selected profile and network policy, status, caps, acknowledgement reference and lifecycle times. |
| Job output/result  | Separate ordered stdout/stderr chunks, byte counters, truncation and parse status, raw/parsed hashes, tool version, adapter hash where applicable, exit status and egress evidence.                         |
| Device policy      | Code-adapter opt-in, catalogue notice acknowledgement/version, shortcuts, theme, minimal mode and label-masking preferences. Imported files cannot grant these permissions.                                 |

Tool inputs, case names, results, source URLs and history are sensitive operational data. Encrypt persisted case/job content and keep it out of ordinary appearance localStorage. Registry exports are deliberate operator-owned plain data; preview path/metadata disclosure and offer stripped or encrypted export. Registry files contain secret references, never API keys, proxy passwords or vault keys.

Freeze the accepted manifest and executable identity for a queued job. External registry edits cannot change an admitted job in place. Revalidate relevant capabilities, path identity and policy at launch. Record the exact revision actually used.

## 6. Browser panel

- The temporary browser is ephemeral; persistent managed profiles remain a separate retained product capability. Clearly show which session mode is active and what is lost on close/lock.
- `direct` is a first-class valid browser route. Show **Direct** when no proxy is selected and explain that destinations can see the host's public IP and DNS follows the selected direct policy.
- SOCKS5, authenticated SOCKS5 changing/pools, HTTP CONNECT and supported VPN routing remain first-class options. Keep secret credentials out of the renderer and bind each session to its selected policy.
- A configured proxy that fails never turns into Direct. An explicit route change is required, and active/protected-session continuity rules still apply.
- Device defaults may supply routes for new profiles; explicit per-profile routes and profile isolation remain supported. A device default must not silently overwrite saved profile routing.
- Downloads are disabled by default. Where enabled, route them through controlled staging, record provenance and require explicit file release/export.
- Session ID, route, temporary/persistent storage, clearing rules and health are visible. A panel move reattaches to the same session.
- Keep untrusted web content outside the privileged renderer. No page content becomes tool-output HTML or application script.
- Test actual no-proxy browsing, configured proxy use, route-loss refusal and browser continuity independently. Direct mode makes no proxy privacy claim.

## 7. Mindmap panel

Support topics, domains, notes, findings, sources, people and infrastructure while preserving existing organization/address nodes. Keep manual positioning, labeled edges, zoom/pan/fit, keyboard operation, undo and a detail inspector.

Each tool-derived finding includes job ID, tool ID/version, collection time, source/output hash and applicable result/adapter revision. A manually entered unsupported statement is labeled as an assertion, not a verified result. A source URL alone is not verification of a claim.

Dragging a parsed result onto a map creates a node with its provenance. Dropping a node onto the notepad inserts a citation with source and timestamp. Encrypted, revision-checked case persistence retains unresolved conflicts. Keep the existing research mindmap distinct from the original profile connection map; both are retained.

## 8. Encrypted notepad

### 8.1 Local tier

Local notes and saved files work offline for all users. Reuse the existing vault/key hierarchy and independently authenticated file encryption; document its actual keys and limits instead of inventing a hardware-backed secret that is not implemented.

Autosave reports pending, durable saved and failed states. Keep an unsaved draft through write/revision errors. Show file name, size, encryption/availability state, storage use and per-item removal. Current baseline is 25 MiB per saved file. Import leaves the original in place; explicitly exporting a decrypted copy explains the destination boundary. Never preview or execute an attachment automatically.

Lock unmounts sensitive panels, closes owned browser/tool sessions according to the lock policy and clears controlled keys/caches. Device encryption and deleted ciphertext are not promises of protection from an unlocked compromised host or forensic secure erasure.

### 8.2 Pro cloud: separate and removable

Pro's allowance is **1,000,000,000 bytes** for encrypted notes/files. Cloud code is a separate optional bundle behind a capability port. Core builds, launches and remains fully functional with that bundle absent, not merely switched off. There is no unconditional cloud import, credential, account, SDK initialization or service call in the local path.

Client encryption covers content and filenames. The service receives opaque encrypted objects and the explicitly documented metadata it needs. Keys are not transmitted. Before cloud ships, Gate 2 must document key hierarchy, recovery, metadata, entitlement/quota enforcement, authenticated clients, replay/rollback protection, device compromise and a server-visibility table.

Attach/detach sync is explicit. Detach offers the recorded choice to purge server copies or retain encrypted copies until a disclosed expiry; local data remains. Conflicts retain both versions. Explain recovery responsibilities and retention without implying that encryption hides all metadata or defeats every coercion/compromise scenario.

Cloud review blocks only cloud. It never blocks local notes, browser work, tooling, mindmaps, export or the retained offline licence workflow.

## 9. TOOLING SUBSYSTEM (REVISION 2 — USER-CHOSEN INTEGRATION)

### 9.0 Governing principle

The core contains **no tool definitions, no bundled tool binaries, no vendored catalogue and no hardcoded tool allowlist or denylist**. It exposes an empty registry, forms, policy, execution interfaces and console. The operator supplies tools from sources they trust on their own machine.

No Go/Ruby/Docker/Python tool dependency or upstream catalogue revision is required to build or launch the core. No upstream tool redistribution/licence audit blocks it because those tools are not redistributed. The core's own application/runtime/dependency licences and notices still apply.

The registry is portable data: one JSON file in, one JSON file out. Tool membership is operator choice. General execution grammar, privilege, case-scope and network policies remain mandatory; they are not a hidden catalogue of permitted tool names.

### 9.1 Designed empty state

A fresh native registry shows:

- Headline: **No tools configured.**
- An explanation of manual registration, manifest import and local catalogue import.
- Actions: **Add tool**, **Import manifest**, **Import catalogue**.
- **Show example manifest**, opening a complete annotated example in the editor.

Do not seed tools, contact sources or install anything to fill this screen. Examples are documentation/templates, never registered entries. JSON does not support comments: editor annotations or explicitly labeled JSONC may explain a template, but the imported/exported file is strict JSON.

The existing website-link shelf is not a native registry or executor. Its manual URL registration must remain truthful while the native paths are implemented. Do not ship dead buttons as evidence that these acceptance criteria are complete.

### 9.2 Three operator-chosen registration paths

**A. Manual:** name, executable path, description, category, tags, parameter fields, argv and parsing policy. Point to a binary already installed by the operator. An explicit health check verifies a regular executable path and captures a real bounded version probe. A version probe executes code: it uses the selected isolation/network policy and limits, and is never silently run during file import.

**B. Manifest:** the operator selects a strict JSON file describing one or more tools. Parse, validate and preview it as data. Do not execute hooks, install commands, probes or presets during import. Validation and execution admission are separate operations.

**C. Catalogue:** the operator selects a local directory they already cloned. The application does not clone, fetch, install or resolve upstream repositories. A local schema adapter reads only `.yaml`/`.yml` files inside that chosen tree and produces disabled suggestions.

Catalogue importer rules:

1. No application networking, DNS lookup, executable probe or package manager during import. Reject remote URLs/UNC locations and prevent symlinks escaping the selected local tree. Report unsupported storage/schema rather than guessing.
2. Bound file count, depth, file/aggregate bytes, YAML aliases and parser time. Disable custom executable YAML tags and object construction. Treat install/run command strings as untrusted data, never shell input.
3. Write accepted entries with `enabled=false` and `licence_verified=false`, regardless of catalogue claims. Nothing can run merely because it was imported.
4. Preserve original category strings. Unknown categories appear in **ungrouped** with their original value available, not dropped or automatically banned.
5. Report parse failures per file with the adapter/version, location and a safe reason. A partial import is explicitly previewed; failures are not silently swallowed.
6. Reimport is explicit and diffable. Persist only accepted entries; unselected/rejected catalogue entries are not remembered in the registry or used to populate a hidden list.
7. Before the device's first catalogue import, show and record: **“You obtained this catalogue from your own source. You are responsible for reviewing tool licences and deciding what you may run or share. ecdys does not install, redistribute or verify these tools.”** An imported registry cannot forge this device acknowledgement.

There is no required upstream catalogue schema. Adapters declare which schema they understand and report unsupported files. Optional adapted-profile packs can be authored/shared separately as plain manifests and explicitly imported; no such pack is installed or automatically registered by core.

### 9.3 Declarative manifests

An operator can describe an adapter without writing code or forking the app. The following is an illustrative owner-supplied definition, not a bundled tool or a verified upstream licence/compatibility finding:

```json
{
  "manifest_version": 1,
  "tools": [
    {
      "id": "subfinder",
      "name": "Subfinder",
      "description": "Passive subdomain enumeration.",
      "category": "information_gathering",
      "tags": ["dns", "subdomains", "passive"],
      "homepage": "https://github.com/projectdiscovery/subfinder",
      "licence": "MIT",
      "binary": {
        "path": "/usr/local/bin/subfinder",
        "version_args": ["-version"],
        "version_regex": "v?([0-9]+\\.[0-9]+\\.[0-9]+)",
        "search_paths": ["/usr/local/bin", "/usr/bin", "~/go/bin", "~/.local/bin"]
      },
      "exposure": "passive",
      "requires_privilege": false,
      "timeout_s": 180,
      "max_output_bytes": 2000000,
      "concurrency": 1,
      "network": {"required": true, "profile": "egress-dns"},
      "fields": [
        {
          "key": "domain",
          "label": "Domain",
          "type": "string",
          "required": true,
          "pattern": "^(?!-)[a-z0-9-]{1,63}(\\.[a-z0-9-]{1,63})+$",
          "placeholder": "example.com"
        },
        {"key": "silent", "label": "Silent output", "type": "bool", "default": true},
        {"key": "recursive", "label": "Recursive", "type": "bool", "default": false}
      ],
      "argv": [
        "{binary}",
        "-d",
        "{domain}",
        "-json",
        "-timeout",
        "30",
        "{?silent:-silent}",
        "{?recursive:-recursive}"
      ],
      "output": {
        "mode": "lines",
        "line_format": "json",
        "fallback": {"kind": "raw_line", "text_path": "$line"},
        "result_kind": "subdomains"
      },
      "presets": [
        {"name": "Passive subdomains", "params": {"domain": "{target}", "silent": true}},
        {"name": "Recursive subdomains", "params": {"domain": "{target}", "recursive": true}}
      ]
    }
  ]
}
```

`network.required` is required even when false. Tool IDs are unique and versioned by manifest content hash. Field names, types, enum/range/pattern constraints, input lengths, default values and unknown properties are checked in the agent. All operator-supplied regexes, including `fields[].pattern` and `binary.version_regex`, use bounded input/pattern size and killable evaluation with a deadline; they cannot block the coordinator during import, validation or health checks. Preset `{target}` is a documented case-binding step before normal field validation; it is not recursive argv expansion.

Executable discovery is local, explicit and bounded. Expand `~` through a named local path operation, not a shell or arbitrary environment interpolation. Record the resolved canonical path and identity; never silently choose another binary with the same name after a version/path check fails. Missing paths are **requires configuration**.

**argv grammar and admission:**

- `argv` is an array. Its first element is exactly `{binary}`, resolved by the agent. A literal launcher such as `["sh", "-c", "{domain}"]` fails import with `ARGV_ENTRYPOINT_INVALID`; nothing is written.
- Ordinary elements produce exactly one argv element. `{field_key}` is the only field substitution; a field value is never split, globbed, reparsed, expanded or allowed to add elements.
- Conditional elements have the whole-element form `{?flag:literal}`. The referenced field must be boolean; true emits one manifest-literal argument and false emits zero. This is the sole exception to one element per template. The literal contains no placeholders or execution operators.
- Unknown placeholders reject the whole tool with `UNKNOWN_PLACEHOLDER`. No silent empty substitution, recursive templating, shell escaping API or implicit variable interpolation.
- Shell command modes, `sh -c`, `cmd /c`, PowerShell command strings, pipes, redirects, command substitution and shell operators such as `;` are not an execution language. Manifest attempts are rejected with a specific reason. Version-probe argv is subject to the same restrictions.
- Launch through a resolved executable and argument array with shell interpretation disabled. No executor convenience path may concatenate the preview into a command string. Previews are display data only.
- Arrays prevent shell word splitting, not a selected tool's own option/code interpretation. Field semantics must reject unsafe option-like values where required. The agent cannot prove that an arbitrary renamed native binary never invokes a shell internally; process mode explicitly trusts that binary. General shell policy is not a tool-name allowlist or a complete malware detector.
- Run field validation again in the agent before queueing, freeze the accepted definition, and recheck path/capabilities before launch. Renderer validation is only feedback.

**Declarative output parsing:**

- Modes: `lines`, `json`, `csv`, `regex`, `raw`.
- `lines` with `line_format=json` parses each line as an object; invalid lines follow the declared raw-line fallback. Preserve bounded stdout/stderr and their order/provenance.
- JSONPath is a small field/array subset such as `$.host` and `$.data[].name`, never expressions, functions, eval or prototype traversal. `$line` is a dedicated fallback token.
- Regex parsing exposes named capture groups only; unnamed groups are discarded. Bound input, pattern complexity, records and parser time in a killable worker so a pattern cannot freeze the coordinator.
- Parser failure or no match gives `parsed:null` with an explicit parse status and retained raw output. A successful process does not become a failed job merely because nothing parsed; a nonzero/denied/timed-out process does not become successful because a line parsed.
- Byte caps and truncation apply before unbounded JSON/CSV/regex buffering. Incomplete final lines/records and partial results are marked.

### 9.4 Optional code adapters

Code adapters are disabled at the device level by default. Enabling requires the explicit toggle text:

> Code adapters run third-party code with the agent's permissions. Enable only for adapters you wrote or have read.

Store adapters in a user-owned plugin directory outside the app bundle. Each declares manifest fields and implements `argv`, `parse` and `health`. Load it in a subprocess under the tool's selected execution profile, including its disclosed process-mode limitations, never in the coordinator. Supervise crashes, output floods and timeouts; enforce filesystem/network confinement only where the selected profile supports it. Default case policies may refuse code adapters on the unconfined process profile.

Record `adapter_hash` and manifest hash for health and jobs. A changed adapter invalidates prior approval/health. Cards and every applicable run/preset confirmation show a distinct code-adapter badge. Registry imports, shared presets and app updates cannot enable the device toggle or execute adapters automatically. Declarative manifests remain sufficient when code adapters are never enabled.

### 9.5 Operator-chosen isolation

| Profile     | Prerequisite                                                                             | Boundary and intended choice                                                                                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process`   | Packaged application/agent and operator-installed binary; no container/toolchain runtime | Explicit argv, per-job workdir, deadlines/caps and owned process-tree teardown. Trust the binary: it runs with the user's host permissions and may access host files/network. |
| `sandbox`   | Verified native OS adapter and required available helper/features                        | Filesystem and network confinement with documented limits; recommended when available. Missing OS/helper capability denies this profile.                                      |
| `container` | Optional working Docker/Podman environment and operator-provided compatible image        | Isolated rootfs, cap drop, no privileged mode/host sockets, bounded mounts/resources and named audited egress. No automatic image pull or runtime install.                    |

The core never requires Docker. Process mode is the stock-machine path. Native sandbox availability varies; bubblewrap is not preinstalled on every Linux host, macOS APIs can be deprecated, and Windows Job Objects alone do not confine filesystem/network access. Advertise only tested capabilities from Gate 1, not “sandbox works everywhere with no setup.”

Display the chosen profile and its consequences on the card and in every run confirmation. If container support is absent, deny with `CAPABILITY_UNAVAILABLE` and a remedy; the operator may explicitly select another profile. A process profile never presents itself as a degraded sandbox.

Egress evidence on sandbox/container includes its tested coverage. Process logging and resource controls are best-effort where the platform cannot enforce them; show that limitation. `network.required=false` is a declaration, not proof of no traffic from an unconfined binary. A case requiring enforced no-network/destination restrictions denies profiles that cannot meet it. No manifest flag is accepted as evidence of confinement.

`requires_privilege=true` is visible admission metadata: refuse it on process. Sandbox/container still require an actual supported privilege mechanism and policy; the flag never grants host root, admin, container privileged mode or unreviewed capabilities. Refuse unsupported privilege requirements with a reason. No separate upstream privilege-inventory gate is required.

### 9.6 Mandatory execution spine

- Agent-side field/target validation, fixed argv construction and no shell invocation by the executor.
- Per-job private workdir, timeout, combined output cap, per-tool/per-case/global concurrency caps and owned descendant teardown on cancel, timeout, output-limit termination, lock and coordinator loss.
- States: `queued`, `running`, `completed`, `failed`, `cancelled`, `denied`; termination reason separately distinguishes timeout, output cap and dependency failure.
- Active exposure acknowledgement per case before its first active run, recorded on the job. Bind it to the relevant target/scope and acknowledgement version; material scope changes require renewed acknowledgement. Missing acknowledgement denies queue admission and shows the authorization prompt.
- Explicit `network.required`, selected named policy and supported enforcement. Undeclared networking is denied. Imported policy names that do not resolve locally require configuration; they are never fetched.
- Egress record for every job: actual observations where supported, otherwise `unavailable`/`best_effort` with scope and gaps, never a fabricated empty “no traffic” record.
- Provenance on every result: tool ID, real resolved version or explicitly unknown, executable/manifest hash, optional adapter hash, selected profile/policy, timestamps, exit/termination state and output hashes.
- Console truthfulness: stdout/stderr from the actual job, byte counts, dropped/truncated extent and raw/parsed status. Output parsing never replaces the underlying execution result.
- Bounded environment with only declared credentials; secret references are resolved in the agent. Do not inherit unrelated tokens, proxy passwords or cloud credentials. Do not pass agent/vault handles or credentials; enforce their isolation where supported. Same-user host access remains possible in process mode and is explicitly disclosed.

No hardcoded tool allowlist/denylist, bundled catalogue, forced container runtime or assumed Go/Ruby/Python toolchain is part of this spine.

### 9.7 Licence facts

Because ecdys does not redistribute third-party tools, their redistribution review is not a core build/release prerequisite. This does not waive licences on software the core actually distributes, nor decide what an operator may run or redistribute.

Manifests carry an operator-supplied `licence` string; `unknown` is valid and visible. Cards and exports retain it. Catalogue suggestions start with `licence_verified=false` and an unverified badge. The operator may record confirmation; this is the operator's assertion, not a legal certification by ecdys. Do not turn the licence string into a hidden per-tool allowlist or silently remove a tool because its category/licence is unknown.

Public manifest sharing remains the operator's decision. Exports include licence and verification state; imported verification is labeled as source-provided until the recipient confirms it locally.

### 9.8 Registry portability

The canonical file is **`ec-dys.tools.json`**: one versioned JSON document containing manifest entries plus local `enabled`, `profile`, `licence_verified` and `last_health` state. Separate immutable job records remain in case storage; the registry is not a job log or secret store.

Import previews `new`, `changed`, `removed` and `unchanged` entries with per-entry accept/reject before an atomic write. Default merge does not delete absent entries. Explicit replacement previews each removal and preserves the previous file for recovery. IDs/hashes, not array positions, match entries.

Round-trip restores accepted enabled/profile state exactly. Effective run admission still rechecks current device capabilities, executable identity, code-adapter device permission and scope. A copied `last_health` record is historical data, not current proof that another machine has the binary.

Provide a paths-stripped export that removes machine-specific executable/search/plugin/source paths and stale local health details, not just one `binary.path` field. The recipient sees **requires configuration**, retains portable metadata and chosen profile, and cannot run until locally bound. Export/import never includes resolved secrets. Optional passphrase-encrypted export protects path/metadata disclosure; it is not required for local use or versioning in the operator's own Git repository.

## 10. Console panel

The console binds to one job ID and reads a store-backed stream with sequence numbers. Multiple jobs have separate tabs. Moving, minimizing, detaching or reconnecting a panel does not restart a job or duplicate/interleave events.

Show status, start/end, elapsed duration, exit code, combined byte counts, truncation, parser status and denial/termination reason. Controls include cancel, clear view, copy, search, export raw plus parsed, and an explicitly approved workdir/evidence action. Clearing a view never deletes persisted results or changes the job's output hash.

Render plain text and safely parsed color styling only. No `innerHTML`, terminal hyperlinks, clipboard escapes, title changes or executable escape sequences. Virtualize bounded views; output floods cannot freeze the renderer. Exported CSV guards spreadsheet formulas. Raw output is sensitive: distinguish the collected output hash from any separately redacted share/export hash and never claim redacted content is byte-identical raw output.

## 11. Minimal mode

Minimal mode reduces the workspace to its structure: panel/tab shells, sets, counts, bounds and layout. Sensitive bodies are unmounted rather than CSS-hidden. Release application-owned decrypted panel caches and clear controlled buffers. Labels can be masked to Set 1, Set 2 because case/set names can themselves be sensitive.

Keep this a device preference with toolbar and keyboard toggles; optional idle/screen-lock triggers are explicit. Preserve the layout and session/job IDs. Running jobs may continue in the agent and persist encrypted output without exposing it to hidden renderer panels. Reopening a panel reads authorized state again.

Minimal mode is not vault lock. Active execution may still need plaintext in the agent, and JavaScript/OS memory copies cannot be guaranteed erased by unmounting. Tests inspect the DOM and application-owned panel caches; they must not claim that forensic memory recovery is impossible. Vault lock always overrides minimal mode and invokes the stronger session/job/key cleanup policy.

## 12. Security, privacy and platform requirements

Use typed authenticated control, sender/origin checks, per-object authorization and bounded payloads. Default desktop operations need no LAN listener. Shared team authorization remains distinct from owning the local desktop session.

Validate tool definitions, field semantics, local paths, case scope and execution profile in the agent. Deny traversal and symlink escapes; use per-job workdirs and encrypted sensitive staging. YAML, JSON, regex, JSONPath, outputs and code adapters are untrusted. Parsing/import never installs or executes anything.

Resolve credentials only where required. Redact known secrets before ordinary logs/share exports and prevent credential-bearing command previews. Explain that a process-profile binary retains the user's permissions and can read host data; a manifest cannot turn it into a confined process. Strict cases require a capable sandbox/container.

The operator chooses allowed target scope and destination policy. Default strict policies block unintended private/metadata destinations; explicit local/authorized targets remain configurable. No product-defined catalogue/category allowlist decides which tools exist. No background target probing or automatic upload.

Document retention, encrypted temporary/output storage, deletion/recovery limits and server-visible metadata. A threat model covers malicious output/imports/adapters, compromised tools, local attackers, device loss, namespace/adapter failure, privilege, process escape and optional cloud compromise.

On Windows, target process execution through the packaged agent with executable/argv boundaries, quoting tests, Job Object ownership/limits and owned-tree termination. Native confinement requires an AppContainer/WFP or other proven adapter; Job Objects alone are insufficient. Container use needs an operator-provided compatible Docker Desktop/Podman/WSL2 environment. A tool that cannot run there fails health clearly; it does not block the app. Windows/macOS execution is not advertised as verified until tested on those systems.

Signed packaged binaries include needed application runtimes and native modules. Build-time Node/Python/toolchain pins are not end-user installation prerequisites. Verify core dependency licences, signing, update rollback, browser compatibility, storage and protected trading behavior under the existing full-product release obligations.

## 13. Revised dependency gates — two

### Gate 1 — platform capability matrix

Determine OS × `process`/`sandbox`/`container` capability as **available**, **degrades-to (operator choice required)** or **unavailable with reason**, with prerequisites, actual tests and unsupported guarantees. Distinguish OS facility, optional installed helper and implemented product adapter. Record version/architecture, process cleanup, limits, filesystem/network confinement, egress coverage and required privilege/signing.

The current evidence and open work are in [the capability matrix](docs/TOOLING-CAPABILITY-MATRIX.md). Candidate facilities or successful Linux probes do not close Windows/macOS or the unbuilt tool-executor acceptance checks. A local core build is independent of an upstream catalogue, toolchain or optional container installation.

### Gate 2 — cloud threat model

Before cloud implementation/shipping, produce the key hierarchy, recovery, server-visibility table, metadata minimization, entitlement/account linkage, quotas, synchronization conflict/replay handling, deletion/expiry and review evidence. This gate blocks the cloud bundle only. The complete local product builds and works with cloud code uninstalled.

The former upstream-licence, particular-catalogue-schema, required toolchain and upstream privilege-inventory gates are removed. The old cloud Gate 5 becomes Gate 2; the old platform/dependency concerns are consolidated into Gate 1. No claim is made that the two gates are closed merely because they are documented.

Browser/storage/fingerprint/payment/team/signing and workload evidence from the original blueprint remain feature/release acceptance obligations. They are not resurrected catalogue gates and do not require unavailable cloud/tool integrations for unrelated local work.

## 14. Phased implementation

| Phase                          | Deliverable and evidence                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Capability baseline          | Populate Gate 1 with observed support; record core dependency boundaries and current gaps. No catalogue clone/licence audit, runtime installation or image pull.                                               |
| 1 Workspace                    | Panel registry, `LayoutEngine` wrapper, neutral layout tree, persistence, two layouts and keyboard moves; prove a real existing notepad panel survives moves.                                                  |
| 2 Local vault and minimal mode | Reuse/migrate local notes/files; test durable autosave, lock and sensitive DOM/cache cleanup without absolute memory-erasure claims.                                                                           |
| 3 Job spine and console        | Authenticated named operations, queue, immutable definitions, bounded streaming, denial reasons, timeout/cancel/tree teardown; use an owned test executable, not a bundled product tool.                       |
| 4 Registry/imports             | Designed empty screen; manual binary registration, strict manifest import, local-only YAML adapters, diff/accept, operator notice, portable/sanitized export.                                                  |
| 5 Real operator-selected tool  | Operator installs/chooses one binary locally; verify version, params/argv, actual output, selected process/sandbox policy and evidence. Docker is not required. Missing container denial is tested separately. |
| 6 Provenance                   | Job/result-to-map and node-to-note citations, raw/parsed hashes and explicit evidence exports.                                                                                                                 |
| 7 Extensibility                | Validate additional operator-authored manifests, unknown categories and optional code adapters. No curated collection or bundled default pack is introduced.                                                   |
| 8 Browser/layout continuity    | Explicit Direct and selected-proxy behavior, session survival across panel moves, storage clearing and download policy. Preserve protected-session safeguards.                                                 |
| 9 Optional cloud               | Only after Gate 2 and Pro entitlement/storage review; separate-bundle install/remove, explicit attach/detach, conflicts and server-copy retention.                                                             |

Complete the execution/isolation/provenance spine before broadening native integrations. Existing working local features may continue while capability or cloud work remains open. Detailed full-product milestones M0–M22 remain preserved; this workstream integrates rather than replacing that plan.

## 15. Deliverables

1. Current master spec, change/continuity notes and current implementation status.
2. Observed platform capability matrix and cloud-only gate report, distinguishing verified/unverified/unavailable.
3. Core stack/package/runtime and docking-wrapper rationale without dependency leakage into panels or persistence.
4. Versioned case/layout, registry/manifest, job/provenance and authenticated IPC contracts.
5. Concrete code against the existing repository, durable data migrations and no user-data wipe.
6. Setup/build instructions for developers and signed runtime artifacts for supported end-user platforms.
7. Tests for import/grammar/field validation, output safety, limits, cancellation/denials, registry round-trip, layouts/session continuity, minimal mode, vault/agent authorization and profile capability failure.
8. A threat model and a truthful implemented/tested/untested/blocked table. Planned native tooling must not be presented as a working console or registry because a website link opens.

## 16. Acceptance criteria — first shippable research/tooling cut

Unchecked items below are requirements, not a report that this development build passes them.

- [ ] Launch without Go/Ruby/Python tool dependencies, Docker, a tool catalogue, an account or a cloud bundle.
- [ ] Fresh native registry shows No tools configured, all three registration paths and the annotated example editor.
- [ ] Move/split/tab/float the browser, mindmap, notepad, tools and console; reload the exact saved layout without losing sessions, jobs or edits.
- [ ] Minimal mode leaves no sensitive body, filename, output or graph text in the DOM/application panel caches; label masking works and lock overrides it.
- [ ] Save a note/file, lock, restart and restore it; on-disk data is ciphertext and backup/migration failure preserves existing content.
- [ ] Manually register an existing executable; explicit health reports its real path/version and selected policy rather than a fabricated result.
- [ ] Import malicious argv such as `["sh", "-c", "{domain}"]`; reject it with a specific error and write nothing.
- [ ] Import an unknown placeholder or invalid field/default/conditional; reject the tool rather than substitute silently.
- [ ] Import a local cloned catalogue with no network available; perform no clone/fetch/DNS/probe, report per-file failures, retain only accepted disabled/unverified suggestions and preserve unknown categories as ungrouped.
- [ ] Record the first catalogue responsibility notice once per device; an imported acknowledgement cannot bypass it.
- [ ] Run an owned operator-selected tool on `process` without Docker; record actual output, exit/limits, environment and best-effort coverage.
- [ ] Choose `container` with no usable runtime/image; deny with a reason and never run on process instead.
- [ ] Deny `requires_privilege=true` on process; do not silently grant privilege on other profiles.
- [ ] Run an active tool without the required per-case scope acknowledgement; refuse admission and show the prompt. Record a later acknowledged run accurately.
- [ ] Reject missing `network.required`; deny a strict network case on a profile that cannot enforce it. Mark unavailable egress evidence truthfully.
- [ ] Watch real stdout/stderr in a docked/floating console, cancel mid-run and confirm owned descendants stop; verify timeout, output/concurrency limits and disconnect recovery.
- [ ] Display truncation and parser status. No parse yields raw output plus parsed null, not invented findings or an incorrect execution result.
- [ ] Every result and derived mindmap node carries the actual job/tool/version/manifest/output provenance; code adapters also include adapter hash.
- [ ] Export raw and parsed evidence separately with secret-disclosure/redaction handling and correct hashes.
- [ ] Export the registry, clear local registry state and reimport it; accepted enabled flags and profiles restore exactly, with current-device health/capability admission rechecked.
- [ ] Import a paths-stripped share and see requires-configuration entries, not broken/dropped tools or silently chosen binaries.
- [ ] Leave code adapters disabled and use the declarative path completely; imported presets cannot enable code execution.
- [ ] Denied jobs show specific reasons. No API/proxy/vault secret appears in ordinary logs, command previews, registry exports or the renderer bundle.
- [ ] Pro cloud tests, when separately shipped, pass Gate 2 and the core still passes its local acceptance suite with the cloud bundle removed.

## 17. What core does not supply

No upstream TUI, included hacking/OSINT suite, tool-name allowlist/denylist, auto-fetcher, package installer, forced Docker environment, bundled toolchain or marketplace. No cloud execution of tools or service-side plaintext decryption. Mobile clients remain outside the desktop scope.

This is a distribution/execution boundary, not a removal of ecdys team collaboration, browser-based trading, Monero, recipes, snapshots or the original profile workspace. Teams retain their authenticated grants/leases/audits; a public multi-tenant remote execution service is not introduced by this local tooling workstream.

## 18. Working rules

Read existing code, preserve operator data and proceed on authorized routine choices. Ask only for information that blocks a concrete action. Prefer one real tested vertical slice over dead controls, fake results or a list of unsupported tools.

Record tests actually run, exact scope and remaining platform limits. Keep chosen dependencies behind narrow ports. Reject silent downgrade, network contact and data loss. Changes to the product remain explicit, attributable revisions.

## Appendix A. Retained full-product requirements

The OSINT workstream extends these requirements from the complete blueprint. Their detailed acceptance clauses remain binding unless explicitly superseded above.

| ID    | Retained capability                                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| US-1  | Random-ID or email account options, local/private identity and recovery choices.                                                           |
| US-2  | One-time/subscription purchase options and original profile tiers; Monero, BTC, ETH, LTC, Stripe and PayPal. No invented conflicting fees. |
| US-3  | Automatic recoverable profile checkpoints and declared session-state coverage.                                                             |
| US-4  | Snapshot timeline, restore, pinning, pre-restore recovery and structured diffs.                                                            |
| US-5  | Independent profile branches, merge preview, discard and promotion.                                                                        |
| US-6  | Mullvad/IVPN and first-class authenticated SOCKS5/HTTP CONNECT, now with explicit Direct also valid.                                       |
| US-7  | Selected route locking and truthful loss/failure behavior; no silent switch from a failed selected proxy to Direct.                        |
| US-8  | Manual/scheduled endpoint and SOCKS5 switching with continuity and per-profile results.                                                    |
| US-9  | Tested per-profile WebRTC policies and visible compatibility/coverage limits.                                                              |
| US-10 | Actionable network, browser, storage/sync and fingerprint health with evidence age.                                                        |
| US-11 | Privacy-filtered bounded encrypted flight recorder and explicit URL logging.                                                               |
| US-12 | Folders, tags, combined/saved filters and bulk organization.                                                                               |
| US-13 | Saved workspace maps, command palette and keyboard/list alternatives.                                                                      |
| US-14 | Atomic per-profile bulk operations, progress/cancel, retry and checkpoints.                                                                |
| US-15 | Resource measurements, budgets, launch queue and protected-session continuity.                                                             |
| US-16 | Versioned supported fingerprint presets/overrides and validated import.                                                                    |
| US-17 | Real local/external observations, strict/warning/disabled policy and retained history.                                                     |
| US-18 | Two-to-five-profile comparison lab, pixel/structure diffs and explicit synchronized actions.                                               |
| US-19 | Encrypted capsules with integrity, provenance, safe import and conflict handling.                                                          |
| US-20 | Profile connection map with VPN/proxy, extension, path, ancestry and accurately labeled domain overlap.                                    |
| US-21 | Configured/measured inspection with source/coverage and change tracking.                                                                   |
| US-22 | Reusable versioned recipes, update diffs and safe portable definitions.                                                                    |
| US-23 | Isolated disposable children, controlled downloads, promotion and recoverable cleanup.                                                     |
| US-24 | Team invites/codes/QR, roles, grants, device access and concurrency/lease rules.                                                           |
| US-25 | Team-wide scoped audit history, retention and export with completeness limits.                                                             |
| US-26 | Allowances, renewals, cancellation/grace, payment changes and non-destructive archives.                                                    |
| US-27 | Support-approved one-time licence-family transfer and honest offline revocation limits.                                                    |
| US-28 | Signed controlled updates, compatibility, protected deferral and recoverable rollback.                                                     |
| US-29 | Actual authenticated Selenium/WebDriver gateway, limits and working client examples.                                                       |
| US-30 | Bounded automation playground/trial and portable profiles with truthful runtime limits.                                                    |

Themes remain Light, Dark, System, Night warm filtering and night-black Crimson accents. Offline operation, team capabilities and security/trading continuity remain inherent parts of ecdys. Their presence does not redefine it as a different product.
