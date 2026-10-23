# Managed session core and real browser recovery

Continue the approved second step: managed Chromium startup/shutdown, process cleanup, crash handling, and real cookie/localStorage/IndexedDB recovery. Keep all normal product launches blocked until a real OS-enforced route supervisor is available.

Use a private CDP pipe instead of a listening debug port. A Linux runtime owns its spawned process group and resolves exit only after no live group members remain. Try Browser.close first; bound shutdown and escalate TERM/KILL when necessary. Startup/protocol failures must clean up their processes. Forced or crashed termination never creates a successful close snapshot.

A session coordinator owns an exclusive profile lease from pre-launch capture until the browser exits and closed files are saved. Save a full pre_launch snapshot before starting and a full auto_close snapshot after a verified clean exit, with the actual browser version on close. Refuse edit/restore/fork/discard/manual capture while leased. Duplicate launch, shutdown during startup, and snapshot failures must release ownership only when processes are stopped. Vault locking refuses outstanding browser ownership; Electron stops sessions before clearing keys.

The coordinator accepts a trusted main-process supervisor interface. Its product default always rejects route readiness, before mutation or process creation. Tests provide an explicit local-fixture supervisor; no renderer option, environment switch, launch URL/flags/path or success JSON can enable product launch. No production browser bundle or provider route implementation is added here.

Use the existing Node/Solid/Electron stack with no extra dependencies. The native launcher is Linux-only initially; macOS/Windows process containment follows separately. Real browser tests use a fresh temporary profile, a loopback-only test website and the executor's Chromium; a test wrapper may disable its sandbox solely for the constrained executor. Product code never adds --no-sandbox. Probe/test traffic is not a privacy-isolation proof.

Validate clean-close archive/restore by changing persistent cookies, localStorage and IndexedDB, closing the browser, restoring the earlier encrypted snapshot, then relaunching the same account/build and measuring original values. sessionStorage/tab-history recovery, portable OS-protected cookies, route isolation, fingerprinting, WebDriver and provider integration remain outside this increment. Working directories remain ordinary files.
