# GitHub source repository

The private project repository is:

<https://github.com/NachtUndNebelTaktik/ecdys>

The verified project source and local development history are published on `main`. The repository's original initial README commit is retained as a merge parent. The complete project README replaces that starter page; the original content remains available in Git history.

## Work with the source

```sh
git clone https://github.com/NachtUndNebelTaktik/ecdys.git
cd ecdys
pnpm install
pnpm dev
```

Use the README verification commands before pushing changes. GitHub credentials must have access to the private repository. Local vaults, credentials, dependencies and build outputs are excluded by gitignore.

The local working branch can publish to main with:

```sh
git push -u origin HEAD:main
```

Fetch and integrate newer remote commits first when required. Do not force-push over another contributor's work.

## Standalone backups

Source ZIPs and standalone Git bundles are additional backups. To restore a history bundle into a new checkout:

```sh
git clone /path/to/ecdys-source-history-2026-10-24.bundle ecdys
cd ecdys
```

The bundle preserves the history captured at its creation time. It does not automatically track later GitHub updates. Follow the README development instructions after restoring.
