# NexQL Core — CI release setup

The Marketplace and Open VSX listing `ric-v.postgres-explorer` is the **Pro** build. Only the private pro repo (`NexQL-OSS/pro`) publishes to the registries. Core builds the free VSIX and creates the GitHub Release, and never publishes.

| Repo | Workflow | Trigger | Does |
|------|----------|---------|------|
| core | **Release (Free build)** — [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) | Push tag `v[0-9]*` (then exactly `vMAJOR.MINOR.PATCH`) | Version guard, unit tests, free VSIX, GitHub Release from `CHANGELOG.md` |
| core | **Build Nightly (Free)** — [`.github/workflows/publish-nightly.yml`](../.github/workflows/publish-nightly.yml) | Manual | Free nightly VSIX artifacts only |
| pro | **Publish Extension (Pro)** — `pro/.github/workflows/publish.yml` | Push tag `v[0-9]*` in pro, or manual with `version` | Checks out core at `v<version>`, typecheck + core and pro unit tests, one VSIX per platform, publishes each to both registries |
| pro | **Publish Nightly Extension (Pro)** — `pro/.github/workflows/publish-nightly.yml` | Manual with `core_ref` | Same checks, per-platform Marketplace pre-release and Open VSX `postgres-explorer-nightly` |

Platforms: `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`. Each matrix runner runs `npm ci` itself, so platform-native packages (`@cursor/sdk-<platform>`) match the VSIX target.

Local `make publish`, `publish-vsx`, `publish-ovsx` and `publish-nightly` refuse to run: they would replace the Pro listing with the free build. `make package` and `make package-pro VSCE_TARGET=<platform>` still build VSIXs locally.

---

## 1. Repository secrets

Set these in the **pro** repo (**Settings → Secrets and variables → Actions**). Core no longer needs them; remove them from core.

| Secret | How to obtain |
|--------|----------------|
| `VSCE_PAT` | [VS Code Marketplace publisher token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) — scope **Marketplace (Manage)** for publisher `ric-v` |
| `OVSX_PAT` | [Open VSX user token](https://open-vsx.org/user-settings/tokens) — publisher must own namespace `ric-v` |

Core is public, so the pro workflows check it out without a token.

### Recommended hardening

- In the pro repo: **Settings → Environments → New environment** named `production`, with required reviewers.
- Add `environment: production` to the `publish` / `publish-nightly` jobs to gate registry uploads on approval.

---

## 2. Version and changelog (you control these)

**Source of truth:** core `package.json` → `"version"`. Pro publishes that same version.

| Channel | Where the number lives | Example |
|---------|-------------------------|---------|
| Stable | Core `package.json` (even minor), tag `v` + that version in core **and** pro | `2.6.0`, tags `v2.6.0` |
| Nightly | Computed at publish time. Not stored in `package.json`. Not a git tag. | `2.6.0` → `2.7.0`, `2.6.1` → `2.7.1` |

Nightly published version is computed by `scripts/compute-nightly-version.js` from the base in `package.json` (see [CLAUDE.md](../CLAUDE.md)).

### Files to update before a stable release

| File | What to change |
|------|----------------|
| `package.json` | `"version"` |
| `package-lock.json` | Root `"version"` and `packages[""].version` (or `npm install --package-lock-only`) |
| `CHANGELOG.md` | Prepend `## [X.Y.Z] - YYYY-MM-DD` section |
| `README.md` | `stable-vX.Y.Z` badge and footer version |
| `MARKETPLACE.md` | Same badge as README |
| `../website/` (separate repo) | Landing copy — see [`.claude/skills/release/VERSION_SITES.md`](../.claude/skills/release/VERSION_SITES.md) |

`scripts/check-release-version.js` is the same check PRs, the core release, and both pro publish workflows run. See [RELEASING.md](../RELEASING.md).

---

## 3. Stable release

1. Complete section 2 in core. Commit and merge to `main`.
2. Tag core and push the tag:

   ```bash
   cd core
   VERSION=$(node -p "require('./package.json').version")
   git tag -a "v${VERSION}" -m "Release v${VERSION}"
   git push origin "v${VERSION}"
   ```

   **Release (Free build)** verifies the tag, runs unit tests, packages the free VSIX and opens the GitHub Release.
3. Tag pro with the same version and push it (or **Actions → Publish Extension (Pro) → Run workflow** with `X.Y.Z`):

   ```bash
   cd pro
   git tag -a "v${VERSION}" -m "Release v${VERSION}"
   git push origin "v${VERSION}"
   ```

   The pro workflow checks out core at `v${VERSION}`, so step 2 must come first.
4. Confirm on [Marketplace](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer) and [Open VSX](https://open-vsx.org/extension/ric-v/postgres-explorer) that all five platforms are listed.

### Republish a failed run (same version)

Re-run the failed pro matrix job, or **Actions → Publish Extension (Pro) → Run workflow** with the version. Registries reject a platform/version pair that already exists, so only the missing targets succeed. That is expected.

The existing core tag `v2.4.0` fails the version guard (its `package-lock.json` says `2.5.0`). Do not move it.

---

## 4. Nightly release (manual)

Nightlies do **not** use git tags.

1. Merge changes to core `main`.
2. Bump the even patch in core `package.json` and `package-lock.json` (`2.6.0` → `2.6.1`) and add `## [2.6.1]` to `CHANGELOG.md`. Do not set `package.json` to the odd nightly number.
3. In pro: **Actions → Publish Nightly Extension (Pro) → Run workflow**, `core_ref` = `main` (or a branch/SHA).
4. Confirm the pre-release on Marketplace and `postgres-explorer-nightly` on Open VSX.

| Core `package.json` | Published nightly (Marketplace) | Open VSX package name |
|--------------------------|--------------------------------|------------------------|
| `2.6.0` | `2.7.0` | `postgres-explorer-nightly` |
| `2.6.1` | `2.7.1` | `postgres-explorer-nightly` |

Registries reject republishing the same version. Bump the patch on core `main` before each nightly.

---

## 5. `make git-tag` vs full release prep

`make git-tag CHANNEL=stable BUMP=patch` runs `scripts/bump-version.js`, which bumps `package.json`, commits, tags, and **pushes** — but does not update `CHANGELOG.md`, README, or website, and does not tag pro. Prefer section 3.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tag, `package.json`, and CHANGELOG disagree | Version edited in only one place, or the tag has an extra `v` | `node scripts/check-release-version.js`. Tags are `vX.Y.Z` only. `vvX.Y.Z` is refused. |
| Pro checkout of core fails | Core tag `vX.Y.Z` not pushed yet | Push the core tag first (section 3, step 2) |
| `package-lock.json does not match` | Lockfile header not updated with `package.json` | Update the root version and `packages[""].version` |
| `odd minor` in `package.json` | Nightly number was written into `package.json` | Put the even stable version in `package.json`. The workflow derives the odd nightly. |
| `Extension version already exists` | Re-published same version/platform | Bump patch and re-run, or ignore for targets that already uploaded |
| Missing `VSCE_PAT` / `OVSX_PAT` | Secrets not configured in pro | Section 1 |
| `make publish` exits with "Registry publishing moved" | Intentional | Use the pro workflows |

---

## 7. Related repos

| Repo | Release mechanism |
|------|-------------------|
| **pro** | Registry publishing for `ric-v.postgres-explorer` (sections 3 and 4) |
| **mcp** | Tag `v*` → [mcp/.github/workflows/release.yml](../../mcp/.github/workflows/release.yml) |
| **vsc-themes** | Version bump on `main` → auto publish |
| **website** | Separate deploy; update marketing copy per stable release |

---

## 8. Quick reference

```bash
# Local builds (no publishing)
make package                              # free VSIX
make package-pro VSCE_TARGET=linux-x64    # pro VSIX for one platform

# Stable: core tag first, then pro tag
git -C core tag -a vX.Y.Z -m "Release vX.Y.Z" && git -C core push origin vX.Y.Z
git -C pro  tag -a vX.Y.Z -m "Release vX.Y.Z" && git -C pro  push origin vX.Y.Z

# Nightly: bump core patch on main → pro Actions → Publish Nightly Extension (Pro)
```
