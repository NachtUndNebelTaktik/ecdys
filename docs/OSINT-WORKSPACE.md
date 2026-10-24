# ecdys OSINT workspace

The OSINT navigation tab contains a Mindmap and an OSINT tools shelf, with an encrypted notepad and saved files below. All belong to the local encrypted workspace; none contacts a website automatically. See ENCRYPTED-NOTEPAD.md for file storage and the Pro 1 GB cloud requirement.

## Mindmap

Create the first node, name it, and add notes or a source URL in the details panel. Nodes can represent topics, people, organizations, domains, addresses or notes. Adding a node while another is selected creates a connected child. Use Connect to node to add a labeled connection between existing findings. Connections describe the operator's research; they are not automatically inferred or verified relationships.

Drag nodes to arrange the map, drag empty space to pan, and use the zoom or Fit controls. Focused nodes move with arrow keys: 20 units per press, or 100 with Shift. The map supports up to 100 nodes and 200 connections. Nodes hold up to 4,000 characters of notes. The combined map and tool document is bounded to 192 Ki characters.

Undo keeps the last twenty structural changes for the current unlocked view. It is not a durable research history. Node deletion asks for confirmation and removes only that node and its links. Other findings remain. Research board names, positions, notes, sources and connections persist; camera position and temporary undo history do not.

## Tool shelf

Fresh workspaces contain no tool definitions, bundled binaries or starter catalogue. The designed empty state says **No tools configured.** The operator can manually add website links from sources they trust, then edit, remove, pin, search and categorize up to sixty saved links. An empty shelf remains empty after reopening or migration; no tools are fetched or repopulated. Existing saved records, including links retained from an earlier build, are preserved as operator-owned data and are never wiped automatically.

Website and source URLs accept HTTP or HTTPS without embedded credentials. Scripts, local files and executable commands are rejected. Cards load no external favicons or previews. No query, subject, note or node is sent automatically to any tool.

Open requires an active browser session. It navigates that session through its selected route; it does not open the operating system's default browser. Without a session, Go to Browser lets the operator set one up. Source links use the same path. Normal website requests, authentication and third-party service terms then apply. This implemented shelf is for website links. The declarative executable registry, binary health checks, manifest/catalogue import, native execution console and isolation-profile choices in Tooling Revision 2 remain implementation work; no nonfunctional controls simulate them.

## Storage and failure handling

The full research document is stored in the SQLCipher-compatible vault database, not localStorage. Appearance preferences remain separate. Edits autosave through a serialized queue; newer edits made during a write are coalesced into the next write. An older response cannot replace newer work in the editor. The save indicator shows pending, saved or failed status.

Revision checks reject stale writes. A storage or revision error retains the local draft and offers Retry save and an explicitly confirmed Reload saved action. Manual workspace lock flushes pending writes first and remains blocked on a failed flush. Automatic inactivity lock clears the research interface along with other vault data. Edits are durable only after the saved indicator; an application or system crash during a pending write can still lose that pending edit.

Schema v3 adds the research document transactionally after the earlier proxy migration; v4 adds the notepad and saved files. Existing profiles, credentials and checkpoints are retained. A missing research table, row or malformed document in a research-enabled vault is not silently recreated. Restore a backup containing the header, database, snapshots and notepad-files directory together. Research notes are protected by the encrypted database, but are not yet included in individual profile configuration checkpoints or capsule exports.

## Verification

Database tests exercise an empty fresh shelf, empty-state persistence, preservation of saved operator links, encrypted at-rest notes, lock refusal, reopen persistence, persistent tool removal, stale writers, graph and URL validation, v2 migration and refusal to replace damaged v3 data. Autosave tests exercise overlapping writes and failure/retry with a retained newer draft.

The real Electron scenario first confirms the designed empty shelf, then manually configures its own fixture website tools. It creates and edits a map, drags and moves nodes by keyboard, connects findings, removes/undoes a node, searches and customizes tools, rejects a script URL, reloads, recovers from a revision conflict and locks/unlocks. A separate live Chromium/SOCKS5 scenario opens an operator-configured website tool against an owned fixture and verifies it uses the selected proxy. Tests do not query external services or investigate real subjects.
