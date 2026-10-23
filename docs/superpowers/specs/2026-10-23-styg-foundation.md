# Styg foundation — approved direction

The user approved the Electron/Solid/TypeScript desktop shell, encrypted local workspace, profile creation, Chromium session lifecycle, baseline configuration snapshot/edit/restore, and an early Linux proof for independently routed profiles with disconnect blocking. The v3.1 corrections in the conversation govern implementation. No payment or team subsystem is part of this increment.

Use SQLCipher-compatible encrypted SQLite, Argon2id in a worker, and random wrapped AES-GCM snapshot keys. Never store unwrapped keys. Use context isolation and narrowly validated IPC. Initial snapshots contain configuration, explicitly not live browser storage. Persist browser storage separately in profile data directories; encrypted session-state capture is a follow-up requirement before production use.

Routing may not be simulated as a successful security check. A missing privileged routing component must block networked launches. Supply a Linux isolated-network proof that measures two different egresses and blocking after route removal. The available cloud executor has no network administration privileges or VPN accounts, so any unavailable real-world test must remain recorded as blocked.

Approaches considered: build all blueprint features together (too broad for first increment); create a UI-only demo (does not prove persistence); implement a secure local vertical slice plus explicit routing gate (selected by the user's Yes). Linux is the first routing target; macOS and Windows remain unverified.
