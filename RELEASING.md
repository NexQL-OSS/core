# Releasing NexQL Core

`package.json` `"version"` is the only version you edit. It is the **stable** release (even minor). `package-lock.json` and the latest stable `CHANGELOG.md` heading must match it. The git tag for that release is `v` plus that version, once: `v2.4.0`, never `vv2.4.0`.

Nightly versions are not written into `package.json` and are not git tags. `scripts/compute-nightly-version.js` derives them (`2.4.0` → `2.5.0`, `2.4.1` → `2.5.1`).

`scripts/check-release-version.js` fails the PR, the core release, and both pro publish workflows when those sources disagree. A missing changelog section fails the stable release. There is no generated-notes fallback.

**Who publishes:** the Marketplace and Open VSX listing `ric-v.postgres-explorer` is the Pro build, and only the private pro repo publishes it. Core's tag workflow builds the free VSIX and creates the GitHub Release. Local `make publish*` targets refuse to run so a local publish cannot replace Pro with the free build.

Secrets, tokens, and the long operator notes are in [docs/RELEASE_CI_SETUP.md](docs/RELEASE_CI_SETUP.md).

## Current published versions

| Channel | Version | Where |
|---------|---------|--------|
| Stable | `2.4.0` | Marketplace release, Open VSX `ric-v.postgres-explorer`, git tag `v2.4.0` |
| Nightly | `2.5.0` | Marketplace pre-release, Open VSX `ric-v.postgres-explorer-nightly` |

`2.5.1` and `2.2.3` were never published. Do not tag them.

## Stable

1. Add `## [X.Y.Z] - YYYY-MM-DD` at the top of `CHANGELOG.md` (keep `## [Unreleased]` only for notes that have not shipped). `X.Y.Z` must be a new even-minor version, higher than `2.4.0`.
2. Set that same version in `package.json`.
3. Update the lockfile header without rewriting the file:

   ```bash
   npm install --package-lock-only
   ```

   If that churns unrelated lock entries, change only the root `"version"` and `packages[""].version`.
4. Check, commit, and tag the commit that contains those files:

   ```bash
   node scripts/check-release-version.js
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore(release): bump version to X.Y.Z"
   git tag -a "vX.Y.Z" -m "Release vX.Y.Z"
   git push origin main
   git push origin "vX.Y.Z"
   ```

5. The core tag push runs **Release (Free build)**. It checks out `vX.Y.Z`, refuses a mismatch, runs unit tests, packages the free VSIX, and opens a GitHub Release from the changelog section. It does not publish to any registry.
6. Tag the pro repo with the same `vX.Y.Z` and push it (or run **Publish Extension (Pro)** with input `X.Y.Z`). It checks out core at `vX.Y.Z`, so step 4 must come first. It runs the core and pro unit tests, builds one VSIX per platform (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`) and publishes each to the Marketplace and Open VSX.

`make git-tag` bumps, checks, commits, tags, and pushes core. It refuses an odd minor and a doubled `v`. It does not update the changelog or tag pro. Prefer the steps above.

To republish: re-run the failed jobs of **Publish Extension (Pro)**, or run it again with the version. Platform/version pairs that already uploaded are rejected by the registries; the missing ones go through.

## Nightly

Do not tag. Bump the stable patch first (`2.6.0` → `2.6.1`), push core `main`, then run **Publish Nightly Extension (Pro)** in the pro repo (`core_ref` = `main`). It publishes Marketplace pre-release `2.7.1` and Open VSX `postgres-explorer-nightly` `2.7.1`, one VSIX per platform. Core's **Build Nightly (Free)** only builds artifacts.

The registries reject a version that already exists. A nightly from an unchanged `2.6.0` publishes `2.7.0` once; the next one needs a patch bump.

## Tag rule

| Input | Result |
|-------|--------|
| `2.4.1` | tag `v2.4.1` |
| `v2.4.1` | tag `v2.4.1` |
| `vv2.4.1` | refused |

The stable workflow listens for tags matching `v[0-9]*`, then requires the rest to be `MAJOR.MINOR.PATCH`. `vv0.1.5` does not start a publish.

## Private pro repo

`NexQL-OSS/pro` holds the registry secrets (`VSCE_PAT`, `OVSX_PAT`) and both publish workflows. Neither has run yet. Before the first run, confirm both secrets are set in pro and removed from core. nexql-mcp is not vendored into the Pro VSIX: Pro launches it via `npx` or the user's own install.

Operator details: [docs/RELEASE_CI_SETUP.md](docs/RELEASE_CI_SETUP.md).
