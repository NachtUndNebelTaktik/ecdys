# ecdys — Temporary Linux browser runtime

The first working browsing mode opens real Chromium inside the existing Browser workspace. It navigates HTTP/HTTPS pages, accepts mouse, wheel, keyboard and pasted text, applies the profile timezone, and transports WebSockets through the saved proxy. This is a development runtime with one temporary Standard session, not completion of persistent browser management or the full disposable-session requirement.

## Run and use

The supported development environment needs Linux user/network namespaces, bubblewrap at /usr/bin/bwrap, util-linux prlimit, and Chromium 154 at /usr/lib/chromium/chromium. The application checks prerequisites; unavailable or failed isolation never falls back to launching directly. Other operating systems and Chromium versions remain unsupported by this runtime.

Swap must be disabled. Browser files live in a private 512 MiB tmpfs with a private HOME/cache, and the process tree has a zero core-file limit. Application configuration stays in the existing encrypted vault. This mode does not claim an encrypted persistent browser filesystem, protection against a compromised administrator, or certification of every host crash-dump policy.

1. Create or select a Standard profile and save its SOCKS5 or HTTP CONNECT route. Authenticated SOCKS5 and authenticated CONNECT are supported; HTTPS CONNECT verifies the proxy certificate.
2. Open Browser, choose that profile, and select Open temporary browser.
3. Read and acknowledge the memory-only session behavior, then start.
4. Enter an HTTP/HTTPS address in the live address bar. Click the viewport to interact, type, paste plain text, or scroll.
5. Close and discard when finished. Workspace lock and application exit also close the session.

Cookies, logins, site storage and open-page state are discarded on close or crash. Reloading the application interface reconnects to an existing active session and its latest frame; it does not restart Chromium. Downloads and additional windows are disabled. Protected-execution profiles cannot launch in this temporary mode. Close before editing a live profile or changing its route. Persistent recovery, saved browser tabs, live route replacement, uploads, full clipboard/context-menu behavior, multi-session scheduling and accessibility of page contents remain future work.

## Boundary and transport

The trusted main process takes a profile revision lease, decrypts its saved credential internally and commits an auto_pre_launch **configuration** checkpoint. No proxy password or secret reference enters renderer API output. The lease prevents edit, delete, restore and saved-route replacement while that profile is running; other profiles can still be edited.

Bubblewrap creates separate user, network, PID, mount, IPC and UTS namespaces. Its process tree sees private loopback and no external network interface. The browser keeps its Chromium sandbox; there is no no-sandbox flag. Read-only runtime/library mounts and private writable memory mounts keep browser files separate from the host vault. Parent death and namespace teardown terminate the owned process tree. The worker verifies the network namespace differs from the host, interfaces are loopback-only, storage is tmpfs, swap is absent and core limits are zero before reporting readiness.

A private loopback HTTP proxy inside the namespace forwards streams to a per-session Unix-domain broker. Only the host broker can open upstream network sockets, always through the selected saved proxy. SOCKS5 destination hostnames go to the upstream proxy without local destination DNS. IPv4/IPv6 targets use their proper SOCKS address formats. The broker authenticates its private channel, bounds control messages, concurrent sockets and handshake deadlines, and validates HTTPS proxy certificates. There is no direct-destination fallback. Resolving the selected proxy's own hostname is host control-plane traffic.

Blank startup does not admit vendor background destinations. The broker admits destinations requested by navigation or reported by the active page's CDP Network events, including subresources, redirects and WebSockets. Unadmitted requests fail before opening an upstream proxy connection. This is a destination boundary, not an ad/tracker classifier: a visited page can request third-party resources, and destination admission cannot distinguish every later browser request to an already admitted host. Startup flags additionally disable background services, including remote phishing/autofill/optimization services; this trades those remote checks for the selected privacy policy. Website TLS checks remain enabled. Existing browser security, website TLS and same-origin policies remain enabled.

Control uses private CDP pipes and a bounded named command protocol. There is no listening debugging port, arbitrary shell command, file navigation or renderer-supplied JavaScript evaluation. Web content executes in the contained Chromium process; the application displays JPEG frames and forwards validated input. Frames and navigation metadata remain in active process memory and are not logged or saved in interface preferences.

The streamed viewport is limited to about eight frame updates per second. It establishes functional browser integration; it is not a low-latency trading renderer or a performance acceptance result. Native rendering, resource governance, full fingerprint/WebRTC support, bundled browser provisioning and platform release gates remain required.

Closing revokes the broker and its streams before terminating the browser tree, releases the profile lease and clears the last displayed frame. Lock cancels launch as well as active browsing. A failed launch releases resources and leaves the saved profile/configuration checkpoint intact.

## Verification

Core tests exercise real Chromium navigation through authenticated CONNECT, interaction, cookie continuity within a session, fresh cookies after restart, cancellation and helper death cleanup, denied file URLs, coalesced tunnel payloads, profile leases and launch checkpoints. A real namespace probe verifies that direct host-loopback, IPv4 and IPv6 sockets cannot connect. Existing fragmented proxy, authentication, downgrade, TLS, timeout and credential-redaction regressions remain in place.

The Electron browser scenario uses an owned authenticated SOCKS5 fixture. Its .test destination resolves only at that fixture. It verifies real page loading, timezone, clicks, typed form submission, WebSocket messages, pre-launch configuration capture, no upstream vendor startup requests, renderer reload/reconnection and workspace-lock cleanup. The screenshot is a live local test page, explicitly labeled as a fixture, not market data or proof of public exit-IP identity.

These Linux development checks do not close G1–G6. Cross-platform networking, packet-capture coverage of all leak paths, privileged/signed installation, persistent encrypted storage and recovery, fingerprint/WebRTC validation, automation compatibility and trading workload benchmarks remain release requirements.
