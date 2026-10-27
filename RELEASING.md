# Releasing NexQL Core

`package.json` `"version"` is the only version you edit. It is the **stable** release (even minor). `package-lock.json` and the latest stable `CHANGELOG.md` heading must match it. The git tag for that release is `v` plus that version, once: `v2.4.0`, never `vv2.4.0`.

Nightly versions are not written into `package.json` and are not git tags. `scripts/compute-nightly-version.js` derives them (`2.4.0` → `2.5.0`, `2.4.1` → `2.5.1`).

`scripts/check-release-version.js` fails the PR and both publish workflows when those sources disagree. A missing changelog section fails the stable publish. There is no generated-notes fallback.

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

5. The tag push runs **Publish Extension (Stable)**. It checks out `vX.Y.Z`, refuses a mismatch, publishes the VSIX, and opens a GitHub Release from the changelog section.

`make git-tag` bumps, checks, commits, tags, and pushes. It refuses an odd minor and a doubled `v`. It does not update the changelog for you. Prefer the steps above.

To republish an existing tag: **Actions → Publish Extension (Stable) → Run workflow**, input `2.4.0` or `v2.4.0`. `vv2.4.0` is rejected.

## Nightly

Do not tag. Bump the stable patch first (`2.4.0` → `2.4.1`), push `main`, then **Actions → Publish Extension (Nightly)**. The workflow publishes Marketplace pre-release `2.5.1` and Open VSX `postgres-explorer-nightly` `2.5.1`.

The registries reject a version that already exists. The next nightly from unchanged `2.4.0` would try to publish `2.5.0` again and fail.

## Tag rule

| Input | Result |
|-------|--------|
| `2.4.1` | tag `v2.4.1` |
| `v2.4.1` | tag `v2.4.1` |
| `vv2.4.1` | refused |

The stable workflow listens for tags matching `v[0-9]*`, then requires the rest to be `MAJOR.MINOR.PATCH`. `vv0.1.5` does not start a publish.

## Private pro repo

Pro publish workflows live in `NexQL-OSS/pro` (not this repo). They have not run. Before the first run:

- Stop pinning mcp at `v0.2.0`. The mcp repo's latest release is `v0.5.0`.
- Package pro from the core commit tagged with this repo's `package.json` version, and publish that same version.
- Use the same tag rule. Do not prefix `v` onto a ref that already starts with `v`.
