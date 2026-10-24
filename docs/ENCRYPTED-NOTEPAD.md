# Encrypted notepad and saved files

The notepad sits below the mindmap and tool shelf in the OSINT workspace. It keeps a named plain-text note and saved files alongside the operator's research. Local use works offline. It follows the same Light, Dark, System, Night and Crimson appearance settings as the rest of ecdys.

## Local operation

Text autosaves inside the SQLCipher-compatible vault. Saves are serialized and revision checked, with the same retained-draft/retry behavior as the mindmap. Manual lock flushes both editors first. Lock removes the editors from the interface. Text is plain data; HTML and scripts are not rendered or executed.

Save file opens a native file chooser. The main process reads a regular selected file into a bounded buffer, encrypts its contents with AES-256-GCM and saves an authenticated binary envelope in `notepad-files/<random-id>.enc`. A separate HKDF key is derived for each random file ID from the vault master key. The encrypted database holds the original name, size, creation date and SHA-256 digest. These fields and the file ID are bound to the ciphertext as authenticated metadata. Neither source paths nor plaintext file contents are returned to the renderer.

The selected original is left in place. Export explicitly opens a native save dialog and writes a decrypted copy outside the vault only after authentication, length and digest checks. Files are never opened or executed automatically. Removal deletes the encrypted saved copy; the original and any exported copies are kept. Removal is not a forensic secure-erasure guarantee.

This development slice supports 200 files, up to 25 MiB each, and a 5 GB local storage budget. The local budget is independent of the Pro cloud allowance. Text is bounded to 180,000 characters and a 192 Ki-character serialized document. Larger streamed files and multiple notebooks are future extensions, not silently implemented capabilities.

File publication uses a flushed temporary encrypted file, atomic rename and a committed database row. Failed publication rolls back the unreferenced file. On unlock, only recognized unreferenced `.enc` and `.enc.tmp` names are cleaned; unrelated files are preserved. Missing referenced files remain listed as unavailable and produce a storage warning. Schema v4 migrates v3 research and profile vaults without replacing their data. Missing notepad tables or rows in v4 are not silently recreated.

Native dialog operations hold an unlock-epoch ticket, not an encryption key. A selection from an earlier lock/unlock cannot import or export in a later epoch. Renderer IPC accepts no raw import/export paths. Export destinations inside the vault are refused. At most one native chooser can be open at a time.

## Pro: 1 GB cloud storage

The product requirement is **Pro includes 1,000,000,000 bytes of cloud storage for encrypted notes and files**. It is part of ecdys, alongside its existing offline and team features. The shared product contract records this allowance separately from local capacity.

Cloud transport, paid Pro entitlement verification and multi-device reconciliation are not connected in this build. The interface says CLOUD NOT CONNECTED; nothing uploads in the background, and no completed sync is simulated. Local notes and files remain usable without cloud access.

The production cloud implementation must encrypt content and filenames on the client, keep decryption keys out of the storage service, enforce the allowance using the signed Pro entitlement and server-side storage accounting, and detect concurrent edits before replacing a version. It must support explicit opt-in, offline edits, resumable encrypted transfers and export without requiring an active cloud subscription. Adding this requirement does not remove the original blueprint's team, proxy, Monero or offline work.

## Backups and verification

Back up `vault.json`, `workspace.sqlite`, `snapshots/` and `notepad-files/` together while the vault is locked. The database contains names, hashes and key context needed to restore files. Individual profile configuration checkpoints do not include the notepad or its files yet. Source-code ZIPs and the GitHub repository contain code, not user vault backups.

Tests cover encrypted at-rest text and files, matching decrypted bytes, unchanged originals, stale saves, zero-byte files, bounded regular-file reads, tampering and envelope swaps, canceled dialogs, lock-epoch rejection, publication failure, recognized orphan cleanup, missing-file reporting, quota enforcement, v3 migration and damaged v4 preservation. The real Electron flow edits a note, uses controlled native dialog selections to import/export an owned fixture, reloads, locks/unlocks, and removes the encrypted copy while retaining the originals. Windows/macOS native durability remain release gates.
