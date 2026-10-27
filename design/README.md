# Supplied doctrine reference

`reference/doctrine` preserves the user's `EcDys-doctrine-design.zip` without editing its contents. `SOURCE.json` records the archive and per-file SHA-256 hashes. Git attributes disable newline conversion for this reference and the governing document, which is copied verbatim to [docs/DESIGN-DOCTRINE.md](../docs/DESIGN-DOCTRINE.md).

The package includes React component source, dark/light render previews and pure boundary/workspace models with 19 Node checks. It describes its own limits: workspace content is in page memory, the vault and sandbox are not implemented, and opening a destination leaves the preview through the host browser.

These files are retained as design/interaction references outside the production build and test globs. They are not imported by the Electron/Solid renderer and add no React dependency. External-opening handlers from the preview must not be used as the managed profile launch path. The desktop application retains its encrypted database/snapshot system and blocked route guard.

The pure reference checks can be run independently:

```sh
node --test design/reference/doctrine/tests/boundary-model.test.ts design/reference/doctrine/tests/workspace-model.test.ts
```
