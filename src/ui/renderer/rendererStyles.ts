/**
 * Shared stylesheet for the notebook result renderer (brand chrome).
 *
 * The renderer sandbox cannot read the webview `--pg-*` tokens, so this builds the same
 * visual language from `--vscode-*` variables only (see rendererConstants.ts for the mirrors).
 * Dense panels stay flat: no display fonts, no glows, no washes.
 *
 * Why a stylesheet rather than more inline styles: high-contrast and reduced-motion rules
 * need selectors, and inline declarations would always beat them.
 */
import {
  BRAND_ACCENT,
  COST_HEAT,
  HC_BORDER,
  MODE_COLORS,
  RENDERER_ELEVATION_1,
  RENDERER_FONT_MONO,
  RIBBON_GRADIENT,
  SEVERITY_COLORS,
} from './rendererConstants';

export const RENDERER_BRAND_STYLE_ID = 'nexql-renderer-brand-style';

/** Build `body.vscode-high-contrast SEL, body.vscode-high-contrast-light SEL { ... }` for a selector list. */
function hc(selectors: string[], declarations: string): string {
  const list = selectors
    .flatMap((sel) => [`body.vscode-high-contrast ${sel}`, `body.vscode-high-contrast-light ${sel}`])
    .join(',\n');
  return `${list} {\n${declarations}\n}`;
}

export function buildRendererBrandCss(): string {
  return `
/* ── Tokens (scoped to renderer chrome) ── */
.nx-result, .nx-table, .nx-topbar {
  --nx-accent: ${BRAND_ACCENT};
  --nx-mono: ${RENDERER_FONT_MONO};
  --nx-zebra: color-mix(in srgb, var(--vscode-editor-foreground) 4%, transparent);
  --nx-select-bg: color-mix(in srgb, ${BRAND_ACCENT} 16%, var(--vscode-editor-background));
  --nx-select-fg: var(--vscode-editor-foreground);
  --nx-select-edge: inset 2px 0 0 ${BRAND_ACCENT};
  --nx-header-bg: color-mix(in srgb, var(--vscode-editor-background) 93%, var(--vscode-editor-foreground));
}

/* ── Result container: flat card with a 2px ribbon on the top edge ── */
.nx-result {
  position: relative;
  font-family: var(--vscode-font-family), "Segoe UI", "Helvetica Neue", sans-serif;
  font-size: 13px;
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
  box-shadow: ${RENDERER_ELEVATION_1};
  background: var(--vscode-editor-background);
}
.nx-result::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: ${RIBBON_GRADIENT};
  z-index: 40;
  pointer-events: none;
}

/* ── Mono uppercase meta label (.pg-mono-label) ── */
.nx-mono-label {
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

/* ── Identity bar ── */
.nx-identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 6px 5px 10px;
  border-bottom: 1px solid var(--vscode-widget-border);
  user-select: none;
  background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background));
  font-family: var(--vscode-font-family);
  font-size: 12px;
}
.nx-identity__stats {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-editor-foreground);
  padding: 0 6px 0 4px;
  white-space: nowrap;
  cursor: default;
}
.nx-cmd {
  flex-shrink: 0;
  padding: 1px 9px;
  border-radius: 999px;
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ── Status chips: pill with a mode-colored dot (.pg-mode-badge) ── */
.nx-chip {
  --nx-chip-color: var(--vscode-descriptionForeground);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 1px 9px;
  border-radius: 999px;
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 10px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--vscode-editor-foreground);
  border: 1px solid color-mix(in srgb, var(--nx-chip-color) 50%, transparent);
  background: color-mix(in srgb, var(--nx-chip-color) 10%, transparent);
}
.nx-chip::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--nx-chip-color);
}
.nx-chip--read { --nx-chip-color: ${MODE_COLORS.read}; }
.nx-chip--write { --nx-chip-color: ${MODE_COLORS.write}; }
.nx-chip--admin { --nx-chip-color: ${MODE_COLORS.admin}; }
.nx-chip--prod { --nx-chip-color: var(--vscode-errorForeground); }
.nx-chip--staging { --nx-chip-color: var(--vscode-editorWarning-foreground); }
.nx-chip--dev { --nx-chip-color: var(--vscode-charts-blue, var(--vscode-textLink-foreground)); }
.nx-chip--ok { --nx-chip-color: ${MODE_COLORS.read}; }
.nx-chip--bad { --nx-chip-color: var(--vscode-errorForeground); }

/* ── Notebook top bar ── */
.nx-topbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-sideBar-background));
  border-bottom: 1px solid var(--vscode-widget-border);
  font-family: var(--vscode-font-family);
  font-size: 12px;
}
.nx-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--vscode-widget-border);
  background: color-mix(in srgb, var(--vscode-sideBar-background) 70%, transparent);
  white-space: nowrap;
}
.nx-strip__context {
  color: var(--vscode-descriptionForeground);
  /* Host, database and user names keep their real case. */
  text-transform: none;
  letter-spacing: 0.02em;
}
.nx-conn-pill {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 11px;
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 10.5px;
  letter-spacing: 0.02em;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  color: var(--vscode-editor-foreground);
  border: 1px solid color-mix(in srgb, var(--nx-chip-color) 50%, transparent);
  background: color-mix(in srgb, var(--nx-chip-color) 10%, var(--vscode-editor-background));
  transition: opacity 0.15s;
}
.nx-conn-pill:hover { opacity: 0.8; }
.nx-conn-pill__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  background: var(--nx-chip-color);
}
.nx-btn {
  padding: 3px 9px;
  font-size: 11px;
  font-family: var(--vscode-font-family);
  color: var(--vscode-button-secondaryForeground);
  background: var(--vscode-button-secondaryBackground);
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}
.nx-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
.nx-btn--danger {
  background: color-mix(in srgb, var(--vscode-errorForeground) 14%, var(--vscode-button-secondaryBackground));
  color: var(--vscode-errorForeground);
}
.nx-sep {
  border-left: 1px solid var(--vscode-panel-border);
  align-self: stretch;
  margin: 2px;
}

/* ── Banners: left-edge accent (.pg-insight) ──
   info = accent, warn = write mode, error = errorForeground, success = read mode */
.nx-banner {
  --nx-sev: ${SEVERITY_COLORS.info};
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-left: 3px solid var(--nx-sev);
  border-bottom: 1px solid var(--vscode-widget-border);
  background: color-mix(in srgb, var(--nx-sev) 8%, var(--vscode-editor-background));
  font-family: var(--vscode-font-family);
  font-size: 11px;
  color: var(--vscode-editor-foreground);
}
.nx-banner--info { --nx-sev: ${SEVERITY_COLORS.info}; }
.nx-banner--warn { --nx-sev: ${SEVERITY_COLORS.warn}; }
.nx-banner--error { --nx-sev: ${SEVERITY_COLORS.error}; }
.nx-banner--success { --nx-sev: ${SEVERITY_COLORS.success}; }
.nx-banner__icon { color: var(--nx-sev); font-size: 13px; flex-shrink: 0; }
.nx-banner__text { flex: 1; min-width: 0; }
.nx-banner__action {
  background: none;
  border: 1px solid color-mix(in srgb, var(--nx-sev) 55%, transparent);
  color: var(--vscode-editor-foreground);
  border-radius: 3px;
  padding: 1px 8px;
  cursor: pointer;
  font-size: 11px;
  font-family: var(--vscode-font-family);
  flex-shrink: 0;
}
.nx-banner__action:hover { background: color-mix(in srgb, var(--nx-sev) 16%, transparent); }
.nx-banner__dismiss {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--vscode-descriptionForeground);
  font-size: 15px;
  line-height: 1;
  padding: 0 4px;
  flex-shrink: 0;
}
.nx-banner--panel {
  align-items: flex-start;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0;
  padding: 12px 16px;
  border: 1px solid var(--vscode-widget-border);
  border-left: 3px solid var(--nx-sev);
  border-radius: 2px 6px 6px 2px;
  font-size: 12px;
}
.nx-banner--dry-run { padding: 8px 12px; font-size: 12px; font-weight: 600; }
.nx-banner--txn {
  gap: 12px;
  padding: 8px 16px;
  border-left-width: 4px;
  font-size: 12px;
}
.nx-banner--txn .nx-banner__text { font-weight: 500; }

/* Primary action inside a banner: tinted fill, not a solid block */
.nx-banner__action--filled {
  font-weight: 600;
  background: color-mix(in srgb, var(--nx-sev) 24%, transparent);
}

/* ── Tabs: accent underline on the active tab ── */
.nx-tabband {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-editor-background);
}
.nx-tabband__left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.nx-tabband__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
  padding: 4px 0;
}
.nx-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 7px;
  margin-bottom: -1px;
  font-family: var(--vscode-font-family);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1;
  cursor: pointer;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
  -webkit-font-smoothing: antialiased;
}
.nx-tab:hover {
  background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 55%, transparent);
  color: var(--vscode-editor-foreground);
}
.nx-tab[data-pg-tab-active="1"] {
  color: var(--vscode-editor-foreground);
  font-weight: 600;
  border-bottom-color: ${BRAND_ACCENT};
  background: color-mix(in srgb, ${BRAND_ACCENT} 7%, transparent);
}
.nx-tab:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }

/* Result-history strip (previous results in the same cell) */
.nx-histstrip {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  scrollbar-width: thin;
  flex-shrink: 0;
  background: var(--vscode-tab-inactiveBackground, var(--vscode-editor-background));
  border-bottom: 1px solid var(--vscode-widget-border);
}
.nx-histtab {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 12px 4px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  border-right: 1px solid var(--vscode-widget-border);
  border-bottom: 2px solid transparent;
  color: var(--vscode-tab-inactiveForeground, var(--vscode-descriptionForeground));
  background: transparent;
}
.nx-histtab:hover { background: var(--vscode-list-hoverBackground); }
.nx-histtab[aria-selected="true"] {
  color: var(--vscode-tab-activeForeground, var(--vscode-editor-foreground));
  background: var(--vscode-tab-activeBackground, var(--vscode-editor-background));
  border-bottom-color: ${BRAND_ACCENT};
  font-weight: 500;
}
.nx-histtab__meta {
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
}

/* View selector dropdown */
.nx-viewsel {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 11px;
  font-family: var(--vscode-font-family);
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border, transparent);
  border-bottom: 2px solid ${BRAND_ACCENT};
  border-radius: 3px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s;
}
.nx-viewsel:hover { background: var(--vscode-button-secondaryHoverBackground); }
.nx-viewsel__menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 2px;
  min-width: 130px;
  background: var(--vscode-menu-background);
  border: 1px solid var(--vscode-menu-border);
  border-radius: 4px;
  box-shadow: ${RENDERER_ELEVATION_1};
  z-index: 500;
  padding: 3px 0;
}
.nx-viewsel__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 10px;
  cursor: pointer;
  font-size: 12px;
  font-family: var(--vscode-font-family);
  color: var(--vscode-menu-foreground);
  border-left: 2px solid transparent;
}
.nx-viewsel__item:hover {
  background: var(--vscode-menu-selectionBackground);
  color: var(--vscode-menu-selectionForeground);
}
.nx-viewsel__item[aria-selected="true"] {
  font-weight: 600;
  border-left-color: ${BRAND_ACCENT};
}

/* ── Ghost tools (row tools, filter, export) ── */
.nx-tool {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-family: var(--vscode-font-family);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--vscode-widget-border) 55%, transparent);
  background: transparent;
  color: var(--vscode-descriptionForeground);
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}
.nx-tool:not([data-pg-row-tool-flash]):not(:disabled):hover {
  background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 50%, transparent);
  border-color: color-mix(in srgb, ${BRAND_ACCENT} 45%, var(--vscode-widget-border));
  color: var(--vscode-editor-foreground);
}
.nx-tool[data-pg-row-tool-flash] {
  color: ${MODE_COLORS.read};
  border-color: color-mix(in srgb, ${MODE_COLORS.read} 45%, var(--vscode-widget-border));
}
.nx-tool--compact { gap: 5px; padding: 4px 10px; font-size: 10px; background: color-mix(in srgb, var(--vscode-editor-background) 88%, transparent); }
.nx-tool--filter { gap: 6px; padding: 5px 12px; font-size: 12px; }
.nx-tool:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

/* AI / Actions pill: static accent border, no animated ring */
.pg-ai-menu-btn-wrap {
  display: inline-flex;
  align-items: center;
  position: relative;
  box-sizing: border-box;
  padding: 1px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, ${BRAND_ACCENT} 45%, var(--vscode-widget-border));
  background: color-mix(in srgb, ${BRAND_ACCENT} 6%, var(--vscode-editor-background));
  transition: border-color 0.14s ease, background 0.14s ease;
}
.pg-ai-menu-btn-wrap:hover {
  background: color-mix(in srgb, ${BRAND_ACCENT} 14%, var(--vscode-editor-background));
  border-color: ${BRAND_ACCENT};
}
.pg-ai-menu-btn--animated button { font-weight: 600; letter-spacing: 0.03em; }

/* ── Action bar (row tools left, AI right) ── */
.nx-actionbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  min-height: 32px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--vscode-widget-border);
  font-family: var(--vscode-font-family);
}

/* ── Footer ── */
.nx-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px;
  border-top: 1px solid var(--vscode-widget-border);
  background: var(--vscode-editor-background);
  font-family: var(--vscode-font-family);
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}
.nx-footer__btn {
  --nx-btn-color: var(--vscode-descriptionForeground);
  padding: 2px 10px;
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: pointer;
  border-radius: 4px;
  color: var(--vscode-editor-foreground);
  border: 1px solid color-mix(in srgb, var(--nx-btn-color) 45%, transparent);
  border-left: 3px solid var(--nx-btn-color);
  background: color-mix(in srgb, var(--nx-btn-color) 8%, transparent);
  transition: background 0.1s;
}
.nx-footer__btn:hover { background: color-mix(in srgb, var(--nx-btn-color) 18%, transparent); }
.nx-footer__btn--add { --nx-btn-color: ${SEVERITY_COLORS.info}; }
.nx-footer__btn--delete { --nx-btn-color: ${SEVERITY_COLORS.error}; }
.nx-footer__btn--commit { --nx-btn-color: ${SEVERITY_COLORS.warn}; }
.nx-footer__btn--revert { --nx-btn-color: ${SEVERITY_COLORS.success}; }

/* ── Stat tiles (.pg-stat) ── */
.nx-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 6px;
}
.nx-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--vscode-editor-background) 94%, var(--vscode-editor-foreground));
}
.nx-stat__value {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--vscode-editor-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nx-stat--accent .nx-stat__value { color: ${BRAND_ACCENT}; }
.nx-stat__label {
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
}
.nx-stat__bar {
  height: 3px;
  margin-top: 3px;
  border-radius: 2px;
  background: var(--vscode-widget-border);
  overflow: hidden;
}
.nx-stat__bar > span { display: block; height: 100%; opacity: 0.85; transition: width 0.2s; }
.nx-tooltip .nx-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.nx-tooltip {
  position: fixed;
  display: none;
  z-index: 9999;
  pointer-events: none;
  min-width: 200px;
  max-width: 300px;
  padding: 10px 12px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--vscode-editor-foreground);
  background: var(--vscode-editorHoverWidget-background, var(--vscode-editor-background));
  border: 1px solid var(--vscode-editorHoverWidget-border, var(--vscode-widget-border));
  border-left: 3px solid ${BRAND_ACCENT};
  border-radius: 2px 6px 6px 2px;
  box-shadow: ${RENDERER_ELEVATION_1};
}
.nx-tooltip__title {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Insight callout (.pg-insight) ── */
.nx-insight {
  --nx-sev: ${SEVERITY_COLORS.info};
  padding: 10px 14px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-left: 3px solid var(--nx-sev);
  border-radius: 2px 6px 6px 2px;
  background: color-mix(in srgb, var(--nx-sev) 7%, var(--vscode-editor-background));
}
.nx-insight--critical { --nx-sev: ${COST_HEAT.magenta}; }
.nx-insight--high { --nx-sev: ${COST_HEAT.orange}; }
.nx-insight--medium { --nx-sev: ${COST_HEAT.amber}; }
.nx-insight--low { --nx-sev: ${COST_HEAT.cool}; }
.nx-insight__title { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
.nx-insight__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--nx-sev); }
.nx-insight__tag {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--vscode-editor-foreground);
  border: 1px solid color-mix(in srgb, var(--nx-sev) 50%, transparent);
  background: color-mix(in srgb, var(--nx-sev) 12%, transparent);
}
.nx-insight__code {
  display: block;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid var(--vscode-widget-border);
  background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-editor-foreground));
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  overflow-x: auto;
  word-break: break-word;
}
.nx-insight__copy {
  margin-top: 4px;
  padding: 3px 10px;
  background: transparent;
  border: 1px solid var(--vscode-widget-border);
  border-radius: 4px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  transition: background 0.2s;
}
.nx-insight__copy:hover { background: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 65%, transparent); }

/* ── Data table ── */
.nx-table table { border-collapse: separate; border-spacing: 0; }
.nx-table thead th {
  background: var(--nx-header-bg);
  transition: box-shadow 0.15s ease;
}
.nx-table.nx-table--scrolled thead th { box-shadow: ${RENDERER_ELEVATION_1}; }
.nx-th-label {
  /* No text-transform: column names are case-sensitive identifiers. */
  font-family: var(--nx-mono, ${RENDERER_FONT_MONO});
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.nx-th-sorted { color: ${BRAND_ACCENT}; }

/* ── High contrast: no gradients, no shadows, contrast borders ── */
${hc(['.nx-result'], `  box-shadow: none;\n  border-color: ${HC_BORDER};`)}
${hc(['.nx-result::before'], `  background: ${HC_BORDER};`)}
${hc(
  ['.nx-identity', '.nx-topbar', '.nx-actionbar', '.nx-footer', '.nx-tabband', '.nx-histstrip', '.nx-histtab', '.nx-banner'],
  `  border-color: ${HC_BORDER};\n  background-image: none;`,
)}
${hc(['.nx-banner'], `  background: transparent;\n  border-bottom: 1px solid ${HC_BORDER};\n  border-left: 3px solid var(--nx-sev);`)}
${hc(
  ['.nx-banner--panel', '.nx-strip', '.nx-stat', '.nx-tooltip', '.nx-insight', '.nx-chip', '.nx-conn-pill', '.nx-footer__btn', '.nx-tool', '.nx-btn', '.nx-viewsel', '.nx-viewsel__menu'],
  `  box-shadow: none;\n  border-color: ${HC_BORDER};\n  background-image: none;`,
)}
${hc(
  ['.nx-banner--panel', '.nx-tooltip', '.nx-insight', '.nx-footer__btn'],
  `  border-left: 3px solid var(--nx-sev, var(--nx-btn-color, ${HC_BORDER}));`,
)}
${hc(['.nx-chip', '.nx-conn-pill', '.nx-stat', '.nx-insight', '.nx-banner--panel'], `  background: transparent;`)}
${hc(['.pg-ai-menu-btn-wrap'], `  background: transparent;\n  border-color: ${HC_BORDER};\n  animation: none;\n  box-shadow: none;`)}
${hc(
  ['.nx-tab[data-pg-tab-active="1"]', '.nx-histtab[aria-selected="true"]'],
  `  background: transparent;\n  border-bottom-color: var(--vscode-contrastActiveBorder, ${HC_BORDER});`,
)}
${hc(['.nx-tab:hover', '.nx-tool:hover', '.nx-footer__btn:hover'], `  background: transparent;\n  outline: 1px dashed var(--vscode-contrastActiveBorder, ${HC_BORDER});\n  outline-offset: -1px;`)}
${hc(
  ['.nx-viewsel'],
  `  border-bottom-color: var(--vscode-contrastActiveBorder, ${HC_BORDER});`,
)}
${hc(
  ['.nx-table'],
  `  --nx-zebra: transparent;\n  --nx-select-bg: color-mix(in srgb, var(--vscode-contrastActiveBorder, var(--vscode-focusBorder)) 28%, var(--vscode-editor-background));\n  --nx-select-fg: var(--vscode-editor-foreground);\n  --nx-select-edge: none;\n  --nx-header-bg: var(--vscode-editor-background);`,
)}
${hc(['.nx-table thead th', '.nx-table.nx-table--scrolled thead th'], `  box-shadow: none !important;`)}
${hc(['.nx-table th', '.nx-table td'], `  border-color: ${HC_BORDER} !important;`)}
${hc(['.nx-th-sorted'], `  color: var(--vscode-contrastActiveBorder, ${HC_BORDER});\n  text-decoration: underline;`)}
${hc(['.explain-node', '.explain-summary-card', '.explain-metric', '.explain-node-header'], `  box-shadow: none;\n  background-image: none;\n  border-color: ${HC_BORDER};`)}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .nx-result *, .nx-topbar *, .nx-table *, .nx-tab, .nx-tool, .nx-btn, .nx-banner, .nx-conn-pill,
  .nx-footer__btn, .nx-viewsel, .nx-stat__bar > span, .nx-insight__copy, .pg-ai-menu-btn-wrap {
    transition: none !important;
    animation: none !important;
  }
  .transaction-banner-pulse { animation: none !important; }
  .topbar-dot-disconnected { animation: none !important; }
}`;
}

/** Inject the renderer brand stylesheet once per document. Safe to call from any component. */
export function ensureRendererBrandStyles(): void {
  if (typeof document === 'undefined' || !document.head) {
    return;
  }
  if (document.getElementById(RENDERER_BRAND_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = RENDERER_BRAND_STYLE_ID;
  style.textContent = buildRendererBrandCss();
  document.head.appendChild(style);
}
