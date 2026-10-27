# NexQL Core — CI release setup

GitHub Actions publish the VS Code extension to the **VS Code Marketplace** and **Open VSX** instead of using local `./pat` files.

| Workflow | File | Trigger |
|----------|------|---------|
| **Stable** | [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) | Push tag `v[0-9]*` (then exactly `vMAJOR.MINOR.PATCH`) |
| **Nightly** | [`.github/workflows/publish-nightly.yml`](../.github/workflows/publish-nightly.yml) | Manual **Run workflow** |

Local `make publish` / `make publish-nightly` still work if you keep `./pat` and `./pat-open-vsx` on your machine.

---

## 1. Repository secrets

In GitHub: **Settings → Secrets and variables → Actions → New repository secret**

| Secret | How to obtain |
|--------|----------------|
| `VSCE_PAT` | [VS Code Marketplace publisher token](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token) — scope **Marketplace (Manage)** for publisher `ric-v` |
| `OVSX_PAT` | [Open VSX user token](https://open-vsx.org/user-settings/tokens) — publisher must own namespace `ric-v` |

### Verify tokens locally (optional)

```bash
cd core
npm ci
make package
npx @vscode/vsce@2.24.0 publish --packagePath postgres-explorer-$(node -p "require('./package.json').version").vsix -p "$VSCE_PAT"
npx ovsx publish postgres-explorer-$(node -p "require('./package.json').version").vsix -p "$OVSX_PAT"
```

Use a throwaway patch version or `--dry-run` if your tooling supports it; registries reject duplicate versions.

### Recommended hardening

- **Settings → Environments → New environment** named `production`
- Add required reviewers and restrict to `main` / tag refs
- In each workflow job, add `environment: production` (optional — enable when you want approval gates)

---

## 2. Push workflows to GitHub

These files must exist on the default branch of the **core** repository (`NexQL-OSS/core` or your fork):

```
.github/workflows/publish.yml
.github/workflows/publish-nightly.yml
docs/RELEASE_CI_SETUP.md
```

```bash
cd core
git add .github/workflows/publish.yml .github/workflows/publish-nightly.yml docs/RELEASE_CI_SETUP.md
git commit -m "Add GitHub Actions publish workflows for stable and nightly releases"
git push origin main
```

---

## 3. Version and changelog (you control these)

**Source of truth:** `package.json` → `"version"`.

| Channel | Where the number lives | Example |
|---------|-------------------------|---------|
| Stable | `package.json` (even minor) and tag `v` + that version | `2.4.0`, tag `v2.4.0` |
| Nightly | Computed at publish time. Not stored in `package.json`. Not a git tag. | `2.4.0` → `2.5.0`, `2.4.1` → `2.5.1` |

Nightly published version is computed by `scripts/compute-nightly-version.js` from the base in `package.json` (see [CLAUDE.md](../CLAUDE.md)).

### Files to update before a stable release

| File | What to change |
|------|----------------|
| `package.json` | `"version"` |
| `package-lock.json` | Run `npm install --package-lock-only` after editing `package.json` |
| `CHANGELOG.md` | Prepend `## [X.Y.Z] - YYYY-MM-DD` section |
| `README.md` | `stable-vX.Y.Z` badge and footer version |
| `MARKETPLACE.md` | Same badge as README |
| `../website/` (separate repo) | Landing copy — see [`.claude/skills/release/VERSION_SITES.md`](../.claude/skills/release/VERSION_SITES.md) |

CI reads the matching `CHANGELOG.md` section for the GitHub Release body. A missing section fails the publish. `scripts/check-release-version.js` is the same check PRs run. See [RELEASING.md](../RELEASING.md).

### Verify no stale version strings

```bash
cd core
OLD="2.4.0"   # version being replaced
NEW="2.4.1"   # target version
rg -n "$OLD" package.json CHANGELOG.md README.md MARKETPLACE.md
rg -n "$OLD" ../website/src/   # if website updated
```

---

## 4. Stable release (tag-triggered)

### Operator checklist

1. Complete section 3 (version bump + changelog + marketing copy).
2. Commit and push to `main`.
3. Create and push an annotated tag matching `package.json`:

```bash
cd core
VERSION=$(node -p "require('./package.json').version")
git tag -a "v${VERSION}" -m "Release v${VERSION}"
git push origin main
git push origin "v${VERSION}"
```

4. Watch **Actions → Publish Extension (Stable)**.
5. Confirm on [Marketplace](https://marketplace.visualstudio.com/items?itemName=ric-v.postgres-explorer) and [Open VSX](https://open-vsx.org/extension/ric-v/postgres-explorer).

### What CI does

1. Verifies the tag, `package.json`, `package-lock.json`, and `CHANGELOG.md` agree (`scripts/check-release-version.js`). The minor must be even. A missing changelog section fails the job.
2. Runs `make package` (stable VSIX with `MARKETPLACE.md` README)
3. Publishes to both registries
4. Creates a GitHub Release with the VSIX attached

### Republish a failed stable run (same version)

**Actions → Publish Extension (Stable) → Run workflow** and enter `2.4.0` or `v2.4.0`. The tag must already exist. `vv2.4.0` is rejected. The existing `v2.4.0` tag fails this check: its `package-lock.json` says `2.5.0`. Do not move that tag.

---

## 5. Nightly release (manual)

Nightlies do **not** use git tags. Bump `package.json` on `main` when you want a new nightly build.

### Operator checklist

1. Merge changes to `main`.
2. Bump the even patch in `package.json` and `package-lock.json` (`2.4.0` → `2.4.1`). Add `## [2.4.1]` to `CHANGELOG.md`. Do not set `package.json` to the odd nightly number.
3. Push to `main`.
4. **Actions → Publish Extension (Nightly) → Run workflow**
   - **ref:** leave as `main` (or a branch/SHA for a one-off build).
5. Confirm pre-release on Marketplace and `postgres-explorer-nightly` on Open VSX.

### Version example

| `package.json` on `main` | Published nightly (Marketplace) | Open VSX package name |
|--------------------------|--------------------------------|------------------------|
| `2.4.0` | `2.5.0` | `postgres-explorer-nightly` |
| `2.4.1` | `2.5.1` | `postgres-explorer-nightly` |

Do not put the odd nightly number in `package.json`. An odd minor fails the version check.

Registries reject republishing the same version — always bump patch on `main` before triggering another nightly.

### Optional: scheduled nightlies

Uncomment and adjust in `publish-nightly.yml`:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'   # 06:00 UTC daily
  workflow_dispatch:
    ...
```

You still need patch bumps on `main` before each scheduled run, or publishes will fail on duplicate version.

---

## 6. `make git-tag` vs full release prep

`make git-tag CHANNEL=stable BUMP=patch` runs `scripts/bump-version.js`, which bumps `package.json`, commits, tags, and pushes — but does **not** update `CHANGELOG.md`, README, or website.

**Recommended:** do the full checklist in section 3, then tag manually (section 4) or use `git-tag` only after docs are updated.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Tag, `package.json`, and CHANGELOG disagree | Version edited in only one place, or the tag has an extra `v` | `node scripts/check-release-version.js`. Tags are `vX.Y.Z` only. `vvX.Y.Z` is refused. |
| `package-lock.json does not match` | Lockfile header not updated with `package.json` | Update the root version and `packages[""].version` |
| Republish of tag `v2.4.0` fails the lock check | That commit's lockfile says `2.5.0` while `package.json` says `2.4.0`. The published VSIX still used `package.json`. | Do not move the tag. Ship the next fix as `2.4.1`. |
| `odd minor` in `package.json` | Nightly number was written into `package.json` | Put the even stable version in `package.json`. The workflow derives the odd nightly. |
| `Nightly published version must have an odd minor` | Base version in `package.json` can't map to odd minor | Adjust `package.json` per `compute-nightly-version.js` rules |
| `Extension version already exists` | Re-published same version | Bump patch and re-run |
| Workflow skipped on fork | `if: github.event.repository.fork == false` | Run from upstream repo or remove guard on your fork |
| Missing `VSCE_PAT` / `OVSX_PAT` | Secrets not configured | Section 1 |
| GitHub Release created but Marketplace failed | Partial failure | Fix token/issue; use **Run workflow** (stable) or re-dispatch nightly |

---

## 8. Related repos

| Repo | Release mechanism |
|------|-------------------|
| **pro** | [pro/.github/workflows/publish.yml](../../pro/.github/workflows/publish.yml) — multi-platform Pro VSIX |
| **mcp** | Tag `v*` → [mcp/.github/workflows/release.yml](../../mcp/.github/workflows/release.yml) |
| **vsc-themes** | Version bump on `main` → auto publish |
| **website** | Separate deploy; update marketing copy per stable release |

---

## 9. Quick reference

```bash
# Stable
make package                    # local VSIX only
git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z

# Nightly (local)
make package-nightly
make publish-nightly            # needs ./pat files

# Nightly (CI)
# Bump package.json on main → Actions → Publish Extension (Nightly)
```
