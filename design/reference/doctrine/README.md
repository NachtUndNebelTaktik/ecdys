# EcDys — doctrine-based interface prototype

This package contains the authoritative design doctrine supplied by the user, the editable React/TypeScript interface, pure state and boundary logic, focused tests, and rendered dark/light previews.

## What is implemented

- Neutral dark and light themes, a four-pixel spacing system, one four-pixel control radius, one border token, no shadows, and immediate state changes.
- Navigation, a context panel that can be shown, hidden or docked below, adjustable panel widths, and compact panel density.
- Notes and bookmarks held in page memory, with actual edit/create timestamps.
- Address and search preparation before a separately labelled external navigation action.
- A session activity record of actual local actions. An external opening is reported only as requested; completion is not observed.
- Up to 30 content/layout undo snapshots. Undo does not roll back the activity record or actual external-opening observations.
- Granular, initially unselected export choices for notes, bookmarks, prepared destinations and activity. The output is explicitly unencrypted JSON.
- A clear-data confirmation naming the actual collections, counts and loss of undo history. Exported files and layout preferences are not deleted.
- Keyboard quick switch (Ctrl/Cmd K), address focus (Ctrl/Cmd L), and workspace Undo outside inputs and modal dialogs (Ctrl/Cmd Z).

## Limits

This is a hosted interface prototype, not a browser engine or a security boundary. There is no implemented vault, encryption at rest, EcDys sandbox, Tor routing, route inspection, durable session recovery, layout import, or tamper-evident audit log. The interface states those limits.

Workspace content is held in this page's memory and resets when the preview reloads. That fact does not establish what the hosting environment, browser or extensions may observe. External pages open through the current browser, outside the preview. Download requests are recorded as requests; the prototype does not claim that a file was successfully saved.

## Files

- `EcDys-Design-Doctrine.md` — the full user document; only Markdown heading formatting was added.
- `EcDys-dark.jpg`, `EcDys-light.jpg` — actual MagicPath render previews.
- `src/components/generated/ECDYSBrowserObsidianViolet.tsx` — shared interface component. The legacy export name is retained for MagicPath compatibility; visible branding is EcDys.
- `src/components/generated/ECDYSBrowserObsidianViolet.css` — both themes and responsive layout.
- `src/components/generated/EcDysDoctrineLight.tsx` — the same component with its initial theme set to light.
- `src/components/generated/EcDysBoundaryModel.ts` — pure destination validation and selective export logic.
- `src/components/generated/EcDysWorkspaceModel.ts` — immutable workspace, history and activity reducer.
- `src/EcDys.tsx` — a convenient public alias.
- `tests/` — the two focused logic test files.
- `IMPLEMENTATION-NOTES.md` — doctrine traceability, verification and remaining limits.

## Integrate into a React/TypeScript project

This is component source, not a standalone browser application. Copy `src` into an existing React/TypeScript build that supports CSS imports and TypeScript modules, such as the Vite environment used for the verified MagicPath build. It requires React and no additional UI library.

```tsx
import { EcDys } from './src/EcDys';

export default function App() {
  return <EcDys initialTheme="dark" />;
}
```

Use `initialTheme="light"` for the light initial view. The Layout screen changes themes and layout during a session.

## Verification

Both MagicPath builds completed successfully. Their actual default renders were inspected. The pure model tests were run with Node 24.22.1:

```sh
node tests/boundary-model.test.ts
node tests/workspace-model.test.ts
```

Results: 10 boundary/export checks and 9 workspace/undo checks passed. These are logic checks, not a claim of comprehensive browser interaction testing or a security audit.
