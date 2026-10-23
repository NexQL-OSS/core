---
name: release
description: >-
  Cut a NexQL Core stable or nightly release — compute patch/minor/major version,
  update CHANGELOG, README, website, and all version touchpoints, then optionally
  package the VSIX. Use when the user wants to release, bump version, tag, or
  publish NexQL Core.
disable-model-invocation: true
---

# Release NexQL Core

Work from **`core/`** (this repo). `$ARGUMENTS` may be `patch`, `minor`, `major`, `stable`, `nightly`, an explicit version (`2.4.0`), or a combo (`stable patch`). If omitted, ask channel (stable vs nightly) and bump type.

Releases are manual. `package.json` version, CHANGELOG headings, README badges, and website copy have drifted before — always read the current `package.json` version and confirm the computed next version with the user.

## Version rules (semver + channel)

| Channel | Where the number lives | Published as |
|---------|-------------------------|--------------|
| **stable** | `package.json` even minor (`2.4.0`) and tag `v` + that version | VS Marketplace release |
| **nightly** | Computed by `scripts/compute-nightly-version.js`. Not written to `package.json`. Not a git tag. | VS Marketplace pre-release (`2.4.0` → `2.5.0`) |

`node scripts/check-release-version.js` must pass before tagging. It fails on an odd `package.json` minor, a lockfile mismatch, a changelog stable heading that is not `package.json`, a nightly heading newer than the computed nightly, or a tag that is not exactly `v` + the package version. `vvX.Y.Z` is refused. Steps: [RELEASING.md](../../../RELEASING.md).

Bump logic for `package.json` (even minor only; `scripts/bump-version.js` refuses an odd result and a doubled `v`):

| Bump | Stable `package.json` | Published nightly |
|------|------------------------|-------------------|
| **patch** | +1 patch from the last even `v*` tag | `compute-nightly-version.js` on that version |
| **minor** | +2 minor (even→even), patch 0 | same derivation |
| **major** | major+1, minor 0, patch 0 | same derivation |

**Do not** run `make git-tag` or `scripts/bump-version.js` unless the user explicitly wants commit + tag + push — that script is interactive and pushes to `origin`/`upstream` automatically.

To preview the next version without side effects, replicate the logic above or ask the user for the target version.

## Release checklist

Copy and track:

```
Release v_____ (stable|nightly):
- [ ] 1. Preflight
- [ ] 2. Bump version in manifests
- [ ] 3. CHANGELOG entry
- [ ] 4. README / MARKETPLACE badges
- [ ] 5. Website marketing copy
- [ ] 6. Verify no stale version strings
- [ ] 7. (Optional) Build VSIX
- [ ] 8. (Only if asked) Commit, tag, push, publish
```

### 1. Preflight

```bash
cd core
git status          # clean tree (or user-approved dirty state)
git branch --show-current
git tag -l 'v*' --sort=-v:refname | head -5
node -p "require('./package.json').version"
```

### 2. Bump version in manifests

| File | Field / pattern |
|------|-----------------|
| `package.json` | `"version": "X.Y.Z"` |
| `package-lock.json` | top-level `"version"` and `"packages"."".version` — run `npm install --package-lock-only` after editing `package.json` |

`WhatsNewManager` reads `package.json` at runtime — no separate bump.

### 3. CHANGELOG entry

Prepend to `CHANGELOG.md` (Keep a Changelog style used in-repo):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### 🎯 Short headline

- **Feature** — one-line summary.
- **Fixed** — one-line summary.
```

Use today's date. Summarize changes since the previous heading (read `git log` since last tag if needed). For nightly-only releases, a `> Nightly releases - vX.Y.Z` line under the prior stable section is the existing convention.

### 4. README / MARKETPLACE badges

Replace the **previous** stable version string in:

| File | What to update |
|------|----------------|
| `README.md` | shields.io badge `stable-vOLD` → `stable-vNEW`; footer `**Stable:** <code>vOLD</code>` |
| `MARKETPLACE.md` | same badge pattern (`stable-vOLD` → `stable-vNEW`) |

`make package` swaps `MARKETPLACE.md` in as README during VSIX build — both must stay in sync.

### 5. Website (`../website/` — separate git repo)

Update hardcoded marketing version `vOLD` → `vNEW` and refresh release copy:

| File | What to update |
|------|----------------|
| `src/data/landing-content.ts` | Prepend entry to `RELEASES` array (`v`, `date`, `tag`, `title`, `body`) |
| `src/components/SiteHeader.astro` | `release-banner-full`, `release-banner-short`, `site-logo-badge` |
| `src/components/LandingStory.astro` | MCP kicker line (`MCP server · vX.Y.Z`) if still pinned to latest |
| `src/markup/demo-shell.html` | Same banner/badge strings (legacy static markup; keep aligned with `SiteHeader.astro`) |

**Dynamic (usually leave alone):** `public/js/visuals.js` fetches live version from the VS Marketplace API for stat badges. `public/html/minimized-overview.html` placeholders are filled at runtime.

Website has its own git history — commit there separately unless the user wants a combined workflow.

### 6. Verify no stale version strings

From `core/`:

```bash
OLD="2.2.3"   # previous version
NEW="2.4.0"   # target version
rg -n "$OLD" package.json CHANGELOG.md README.md MARKETPLACE.md
rg -n "$OLD" ../website/src/
```

Expect zero hits in release-touched files (ignore `package-lock.json` dependency versions and historical CHANGELOG sections).

### 7. (Optional) Build VSIX

```bash
cd core
make package              # stable → postgres-explorer-X.Y.Z.vsix
make package-nightly      # nightly pre-release pair
```

Report the `.vsix` path. Do not publish without explicit request (`make publish` needs `./pat` and `./pat-open-vsx`).

### 8. Commit / tag / push (only when asked)

```bash
cd core
git add package.json package-lock.json CHANGELOG.md README.md MARKETPLACE.md
git commit -m "Release vX.Y.Z"
git tag -a "vX.Y.Z" -m "Release vX.Y.Z"
git push origin main
git push origin "vX.Y.Z"
```

If the user prefers the interactive helper: `make git-tag CHANNEL=stable BUMP=patch` (runs `scripts/bump-version.js` — commits and pushes; does **not** update CHANGELOG/README/website).

Website repo (if updated): separate commit in `../website/`.

## Related repos (out of scope unless asked)

| Repo | Skill / tool |
|------|----------------|
| `themes/` | `themes/.claude/skills/release` — themes-only bump (`package.json` + `CHANGELOG.md`) |
| `mcp/` | `mcp/.claude/skills/release` — `./scripts/bump-version.sh X.Y.Z` |
| `pro/` | Version pinned via core checkout in `pro/.github/workflows/publish.yml` |

## Additional reference

Full file-by-file notes: [VERSION_SITES.md](VERSION_SITES.md)
