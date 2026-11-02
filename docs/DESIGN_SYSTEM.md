# NexQL Design System

One visual language for webview panels, tree icons and notebook renderer output. It follows the NexQL brand (rose accent, the "ribbon" gradient, bevelled elevation lit from the top left) but stays editor-native: every surface is derived from the active VS Code theme.

A live preview lives in [`design-system-demo.html`](design-system-demo.html) (open it in a browser; `?theme=light` and `?theme=hc` switch themes). Screenshots: [dark](design-system-dark.png), [light](design-system-light.png).

## Layers

| Layer | Location | Consumed by |
|-------|----------|-------------|
| Contributed colors (`nexql.*`) | `package.json` > `contributes.colors` | Everything. Exposed as `--vscode-nexql-*` in webviews and notebook renderers, and as `ThemeColor('nexql.*')` in tree providers |
| `--pg-*` tokens | `templates/shared/styles.css` | All webview panels (`readSharedTemplateCss()`) |
| Component classes | `templates/shared/components.css` | Same loader, appended after `styles.css` |
| `SHARED_WEBVIEW_CSS` / `MODERN_WEBVIEW_BASE_CSS` | `src/common/htmlStyles.ts` | Injected before the shared CSS. Owns spacing tokens (`--sp-*`), skeleton keyframes and the `.skeleton` / `.empty-state-simple` / `.text-meta` utilities |
| Renderer mirrors | `src/ui/renderer/rendererConstants.ts` | Notebook renderer only (it cannot read `--pg-*`) |
| Tree colors | `package.json` | `postgres.accent` now defaults to `nexql.accent`; `postgres.env*` are unchanged |

Users can override any contributed color through `workbench.colorCustomizations`, for example `"nexql.accent": "#7c3aed"`.

## Contributed colors

| Id | Dark | Light | High contrast | HC light |
|----|------|-------|---------------|----------|
| `nexql.accent` | `#E0A4CC` | `#882D5A` (AA on light surfaces) | `#F5C2E0` | `#882D5A` |
| `nexql.accentForeground` (text on an accent fill) | `#0B0E14` | `#F8F9FC` | `#0B0E14` | `#F8F9FC` |
| `nexql.ribbon.blue` / `indigo` / `purple` / `magenta` / `orange` / `amber` | `#3D6FE0` `#6C4CD6` `#A23BC9` `#E0388F` `#F26B3A` `#F5B23A` (same in every theme kind) | | | |
| `nexql.mode.read` | `#7EE8A8` | `#0A6234` | same as dark | same as light |
| `nexql.mode.write` | `#F26B3A` | `#9A3412` | same as dark | same as light |
| `nexql.mode.admin` | `#F5B23A` | `#7A4E00` | same as dark | same as light |

## Token catalog (`--pg-*`)

Every token below has a theme-var fallback, so panels still render if a contributed color is missing.

**Surfaces and borders:** `--pg-ui-surface`, `--pg-ui-surface-raised`, `--pg-ui-surface-muted`, `--pg-ui-border`, `--pg-ui-border-strong`, `--pg-ui-hover`, `--pg-ui-text-muted` (alias `--pg-text-muted`). Legacy `--ui-*` aliases still work.

**Brand:**
- `--pg-brand-accent` = `var(--vscode-nexql-accent, var(--vscode-textLink-foreground))`, plus `--pg-brand-accent-muted` and `--pg-brand-accent-ink`.
- `--pg-ribbon` (105deg gradient), `--pg-ribbon-v` (same stops, vertical), `--pg-ribbon-soft` (low-alpha wash).
- `--pg-mode-read`, `--pg-mode-write`, `--pg-mode-admin`.

**Elevation (bevel):** `--pg-elevation-1` to `--pg-elevation-4`, built with `color-mix` against `--vscode-editor-background`. Light edge on the top left, dark edge on the bottom right, drop shadows falling down and right. Steps 3 and 4 add a faint indigo/magenta glow in dark themes only (`body.vscode-dark`). Helper tokens: `--pg-bevel-hi`, `--pg-bevel-lo`, `--pg-shadow-ink`. `--pg-surface-gradient` shades a card from its lit corner to its shadowed corner.

**Type:** `--pg-font-display`, `--pg-font-serif` (brand screens only), `--pg-font-mono`. System fallbacks only because the webview CSP blocks remote fonts. Bundled OFL fonts (Space Grotesk, Instrument Serif) can be added later with `@font-face` and `webview.asWebviewUri`.

**Other:** radii (`--pg-radius-*`), transitions, glass (`--pg-glass-bg`, `--pg-glass-blur`), semantic info/warn/error fills, `--env-prod|staging|dev`.

### Theme handling

- Dark: `body.vscode-dark` deepens shadows, strengthens the bevel and enables the glow.
- High contrast (`body.vscode-high-contrast`, `body.vscode-high-contrast-light`): no gradients, no shadows, no glow. Elevation tokens become `none`, the ribbon collapses to a solid `--vscode-contrastBorder`, and borders use `--vscode-contrastBorder`.
- `prefers-reduced-motion: reduce`: animations and transitions are effectively disabled; the live dot and running-step pulse stop.

## Components

| Class | Purpose |
|-------|---------|
| `.pg-card` / `-header` / `-title` / `-desc` / `-body` | Standard content card (bevel elevation, surface gradient) |
| `.pg-hero-card` (+ `-header`, `-body`, ...) | Featured card; `::before` is a 3px `--pg-ribbon` bar |
| `.pg-ribbon` | 3px brand gradient bar |
| `.pg-pill`, `.pg-pill--accent`, `.pg-live-dot` | Status pill; pulsing dot (colour via `--pg-live-color`) |
| `.pg-mode-badge` + `.pg-mode--read` / `--write` / `--admin` | Session mode: coloured dot, tinted border, mono uppercase |
| `.pg-mono-label` | 12px mono uppercase section label, 0.08em tracking |
| `.pg-code` + `.pg-copy` | Code block with copy button; add `.is-copied` after copying |
| `.pg-route` / `-item` / `-no` / `-label` / `-meta` | "Ticket" card of numbered steps (use an `ol`) |
| `.pg-rail` / `.pg-track` / `.pg-track-fill` / `.pg-rail-step` | Vertical wizard progress rail. Set `--pg-rail-progress: 45%` on `.pg-rail`. Steps number themselves; mark `.is-done` or `aria-current="step"` |
| `.pg-stat-grid` / `.pg-stat` / `-value` / `-label` | Figure tiles; `.pg-stat--accent` colours the value |
| `.pg-insight` | Callout with an accent left edge |
| `.pg-steps` / `.pg-step` / `-name` / `-desc` / `-time` | Tool/step trace; state classes `.is-ok`, `.is-error`, `.is-running` |
| `.pg-badge`, `.pg-status-dot`, `.pg-chip` | Tags and status |
| `.pg-tab-strip` / `.pg-tab-btn` / `.pg-tab-panel` | Tabs |
| `.pg-btn`, `.pg-btn-sm`, `.pg-btn-danger`, `.pg-btn--*` | Buttons |
| `.pg-empty-state`, `.pg-modal*`, `.pg-toast` | Empty states, dialogs, toasts |
| `.pg-brand-wash`, `.pg-display`, `.pg-serif` | Brand-screen helpers (see below) |

Settings Hub keeps its `.hub-*` classes; its `--hub-*` tokens alias `--pg-*`.

## Brand screens vs dense panels

- **Brand screens** are welcome, What's New, empty states and upgrade screens. They may use display and serif fonts (`.pg-display`, `.pg-serif`), ribbon washes (`.pg-brand-wash`, `--pg-ribbon-soft`) and the higher elevation steps with glow.
- **Dense panels** (dashboard, activity monitor, settings, tables, chat) use the UI font, flat surfaces, elevation 1 to 2, the plain ribbon bar at most, and no washes, glows or display fonts.

When in doubt, treat it as a dense panel.

## Selective glass

| Use blur (`backdrop-filter`) | No blur (raised surface + elevation) |
|------------------------------|--------------------------------------|
| `.pg-modal-backdrop`, `.pg-toast`, renderer hover toolbars | `.pg-card`, `.pg-hero-card`, fields, tables, result body |

## Renderer

The notebook renderer cannot read `--pg-*`. `rendererConstants.ts` mirrors what it needs with `--vscode-*` variables only: `BRAND_ACCENT`, `BRAND_ACCENT_MUTED`, `RIBBON_GRADIENT`, `MODE_COLORS` (`read`, `write`, `admin`), `RENDERER_ELEVATION_1` to `_3`, and the glass constants. Chart.js palettes resolve at runtime via `getThemeChartPalette()`.

## Loaders

| Pattern | Use when |
|---------|----------|
| `loadPanelTemplate(webview, uri, folder, vars)` | New or simple panels (`index.html`, CSP, nonce) |
| `loadCompleteTemplate(uri, folder, vars)` | Templates with `{{STYLES}}` / `{{SCRIPTS}}` placeholders only |
| Manual load (Settings Hub) | Complex variable injection or external script URIs |

Real panel loaders inject `MODERN_WEBVIEW_BASE_CSS`, then `readSharedTemplateCss()`, then the panel CSS. The shared CSS relies on that order for the skeleton keyframes and `--sp-*` tokens.

## Rules of thumb

1. Use tokens, never raw hex, except the ribbon fallbacks and semantic colours.
2. New components go in `components.css` with a `pg-` prefix and need a high-contrast check.
3. Add a unit test when you add a contract token or class (`src/test/unit/DesignTokens.test.ts`).
