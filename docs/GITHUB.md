# GitHub repository setup

The source repository and local commit history are complete in this workspace. Creating the requested private GitHub repository was attempted for `NachtUndNebelTaktik/ecdys`, but GitHub returned `Resource not accessible by integration (createRepository)`. The connected account can authenticate; its integration cannot create this repository. No remote repository was created by that attempt.

Create an **empty private** repository named **ecdys** in the account. Leave README, license and gitignore initialization unchecked so the existing project history can be pushed directly:

<https://github.com/new?name=ecdys&visibility=private>

Once it exists and the connected GitHub integration has access:

```sh
git remote add origin https://github.com/NachtUndNebelTaktik/ecdys.git
gh auth setup-git
git push -u origin HEAD:main
```

If `origin` is already configured, check `git remote -v` and use it when it matches the intended repository. Do not force-push over an initialized repository. The project source ZIP and standalone Git bundle are additional backups, not substitutes for the remote repository.

To restore the standalone history bundle into a new checkout:

```sh
git clone /path/to/ecdys-source-history-2026-10-24.bundle ecdys
cd ecdys
```

Use the README development and verification commands after restoring. Dependencies, local vaults, build outputs and credentials are excluded from the source backups.
