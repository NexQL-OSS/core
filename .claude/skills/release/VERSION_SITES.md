# Version touchpoint reference — NexQL Core

Canonical version source: `core/package.json` → `"version"`.

Run from `core/` after bumping. Replace `OLD` with the version being superseded.

```bash
rg -n 'OLD' \
  package.json package-lock.json CHANGELOG.md README.md MARKETPLACE.md \
  ../website/src/
```

## Core repo (`core/`)

| File | Pattern | Notes |
|------|---------|-------|
| `package.json` | `"version": "X.Y.Z"` | **Source of truth** for extension + WhatsNew panel |
| `package-lock.json` | `"version": "X.Y.Z"` at root + `packages.""` | Regenerate: `npm install --package-lock-only` |
| `CHANGELOG.md` | `## [X.Y.Z] - YYYY-MM-DD` | Prepend; historical sections keep old versions |
| `README.md` | `stable-vX.Y.Z` in badge URL; `vX.Y.Z` in stable footer | Line ~10 badge, ~310 footer |
| `MARKETPLACE.md` | `stable-vX.Y.Z` in badge URL | Packaged as README during `make package` |

### Auto-derived (do not hand-edit)

| Location | Behavior |
|----------|----------|
| `src/activation/WhatsNewManager.ts` | Reads `extension.packageJSON.version` |
| `Makefile` `EXTENSION_VERSION` | `node -p "require('./package.json').version"` |
| `scripts/compute-nightly-version.js` | Derives Marketplace nightly from `package.json` |
| `.vscode/launch.json` `"version"` | Launch config schema version — **not** extension version |

## Website repo (`website/`)

Separate git repo; deploy after merge to its `main`.

| File | What contains the version |
|------|---------------------------|
| `src/data/landing-content.ts` | `RELEASES[0].v` — prepend new release object |
| `src/components/SiteHeader.astro` | Banner full/short copy, `site-logo-badge` |
| `src/components/LandingStory.astro` | MCP section kicker (`MCP server · vX.Y.Z`) |
| `src/markup/demo-shell.html` | Legacy duplicate of header banner/badge strings |

### Runtime / API-driven (skip on bump)

| File | Behavior |
|------|----------|
| `public/js/visuals.js` | Fetches version from VS Marketplace for `#stat-version`, `#badge-version`, schema.org meta |
| `public/html/minimized-overview.html` | Placeholder `v—` filled by `visuals.js` |
| `public/html/editor-file-views.html` | Placeholder badges filled at runtime |

## Git tags

Stable tags: `vX.Y.Z` where `X.Y.Z` is the even-minor `package.json` version. One `v` only. Nightlies are not tagged. `scripts/compute-nightly-version.js` derives the odd version at publish time.

```bash
git tag -l 'v*' --sort=-v:refname | head -10
```

## CI / publish (no version file edits)

| Path | Role |
|------|------|
| `Makefile` `package` / `package-nightly` / `publish*` | Build and upload VSIX |
| `scripts/bump-version.js` | Interactive bump + commit + tag + push (does not touch CHANGELOG/README/website) |
| `scripts/prepare-nightly-manifests.js` | Nightly manifest split for dual registry publish |
