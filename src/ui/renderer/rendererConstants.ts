/**
 * Shared notebook renderer branding (CSS variables). The renderer sandbox cannot read
 * the webview `--pg-*` tokens, so everything here is built from `--vscode-*` vars only.
 * `--vscode-nexql-*` come from `contributes.colors` in package.json.
 */
export const BRAND_ACCENT = 'var(--vscode-nexql-accent, var(--vscode-textLink-foreground))';
export const BRAND_ACCENT_MUTED = `color-mix(in srgb, ${BRAND_ACCENT} 20%, transparent)`;

/** The NexQL "ribbon" brand gradient (105deg). Hex fallbacks apply if the colors are not registered. */
export const RIBBON_GRADIENT =
  'linear-gradient(105deg, ' +
  'var(--vscode-nexql-ribbon-blue, #3D6FE0), ' +
  'var(--vscode-nexql-ribbon-indigo, #6C4CD6) 30%, ' +
  'var(--vscode-nexql-ribbon-purple, #A23BC9) 52%, ' +
  'var(--vscode-nexql-ribbon-magenta, #E0388F) 72%, ' +
  'var(--vscode-nexql-ribbon-orange, #F26B3A) 90%, ' +
  'var(--vscode-nexql-ribbon-amber, #F5B23A))';

/** Session mode indicator colors (read-only / read-write / admin). */
export const MODE_COLORS = {
  read: 'var(--vscode-nexql-mode-read, var(--vscode-testing-iconPassed))',
  write: 'var(--vscode-nexql-mode-write, var(--vscode-editorWarning-foreground))',
  admin: 'var(--vscode-nexql-mode-admin, var(--vscode-editorWarning-foreground))',
} as const;

/** Mirror of webview glass tokens using VS Code theme vars only. */
export const RENDERER_GLASS_BG = 'color-mix(in srgb, var(--vscode-editor-background) 62%, transparent)';
export const RENDERER_GLASS_BLUR = 'blur(12px) saturate(1.15)';

/**
 * Bevel elevation, lit from the top left: light inset top-left edge, dark inset bottom-right
 * edge, soft drop shadows. Mixed against the editor background so it works in any theme.
 */
const BEVEL_LIGHT = 'color-mix(in srgb, var(--vscode-editor-foreground) 9%, transparent)';
const BEVEL_DARK = 'color-mix(in srgb, #000 30%, transparent)';
export const RENDERER_ELEVATION_1 =
  `1px 2px 3px color-mix(in srgb, #000 28%, transparent), inset 1px 1px 0 ${BEVEL_LIGHT}, inset -1px -1px 0 ${BEVEL_DARK}`;
export const RENDERER_ELEVATION_2 =
  `1px 2px 4px color-mix(in srgb, #000 24%, transparent), 8px 16px 30px -10px color-mix(in srgb, #000 40%, transparent), inset 1px 1px 0 ${BEVEL_LIGHT}, inset -1px -1px 0 ${BEVEL_DARK}`;
export const RENDERER_ELEVATION_3 =
  `2px 4px 8px color-mix(in srgb, #000 26%, transparent), 14px 28px 50px -16px color-mix(in srgb, #000 48%, transparent), inset 1px 1px 0 ${BEVEL_LIGHT}, inset -1px -1px 0 ${BEVEL_DARK}`;

/** Monospace stack for meta labels (mirrors `--pg-font-mono`). */
export const RENDERER_FONT_MONO = 'var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)';

/** Border used in high-contrast themes in place of gradients and shadows. */
export const HC_BORDER = 'var(--vscode-contrastBorder, currentColor)';

/** Banner/insight severities, mirroring the `.pg-insight` left-edge accent. */
export const SEVERITY_COLORS = {
  info: BRAND_ACCENT,
  warn: MODE_COLORS.write,
  error: 'var(--vscode-errorForeground)',
  success: MODE_COLORS.read,
} as const;

/**
 * Cost-heat ramp for EXPLAIN nodes, cool to hot, taken from the ribbon hues:
 * blue (cool), then amber -> orange -> magenta for hot nodes. Hex fallbacks apply if the nexql colors are missing.
 */
export const COST_HEAT = {
  cool: 'var(--vscode-nexql-ribbon-blue, #3D6FE0)',
  amber: 'var(--vscode-nexql-ribbon-amber, #F5B23A)',
  orange: 'var(--vscode-nexql-ribbon-orange, #F26B3A)',
  magenta: 'var(--vscode-nexql-ribbon-magenta, #E0388F)',
} as const;

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Chart series order: the ribbon hues first (blue, indigo, magenta, orange, amber, purple),
 * then green and red so up to eight series stay distinguishable. `source` is the CSS variable
 * to read; `fallback` is the `--vscode-charts-*` variable used only when `source` is not set.
 */
export const CHART_PALETTE_SOURCES: ReadonlyArray<{ source: string; fallback: string }> = [
  { source: '--vscode-nexql-ribbon-blue', fallback: 'var(--vscode-charts-blue)' },
  { source: '--vscode-nexql-ribbon-indigo', fallback: 'var(--vscode-charts-purple)' },
  { source: '--vscode-nexql-ribbon-magenta', fallback: 'var(--vscode-charts-red)' },
  { source: '--vscode-nexql-ribbon-orange', fallback: 'var(--vscode-charts-orange)' },
  { source: '--vscode-nexql-ribbon-amber', fallback: 'var(--vscode-charts-yellow)' },
  { source: '--vscode-nexql-ribbon-purple', fallback: 'var(--vscode-charts-purple)' },
  { source: '--vscode-nexql-mode-read', fallback: 'var(--vscode-charts-green)' },
  { source: '--vscode-charts-red', fallback: 'var(--vscode-charts-foreground)' },
];

/** VS Code chart color CSS variables, kept for consumers that want the stock palette. */
export const CHART_COLOR_VARS = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-red)',
  'var(--vscode-charts-green)',
  'var(--vscode-charts-yellow)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-foreground)',
  'var(--vscode-charts-blue)',
] as const;

let chartPaletteCache: { fills: string[]; borders: string[] } | undefined;

function resolveCssColor(cssValue: string): string {
  if (typeof document === 'undefined') {
    return cssValue;
  }
  const probe = document.createElement('span');
  probe.style.color = cssValue;
  document.documentElement.appendChild(probe);
  const resolved = getComputedStyle(probe).color || cssValue;
  probe.remove();
  return resolved;
}

/** Raw value of a CSS custom property on <html> or <body>, or '' if it is not defined. */
function readCssVar(name: string): string {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return '';
  }
  for (const el of [document.documentElement, document.body]) {
    if (!el) {
      continue;
    }
    const value = getComputedStyle(el).getPropertyValue(name).trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function withAlpha(rgb: string, alpha: number): string {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return rgb;
  }
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

/**
 * Resolve the theme chart palette once per renderer session (Chart.js needs concrete colors).
 * Leads with the NexQL ribbon hues and falls back per color to `--vscode-charts-*`.
 */
export function getThemeChartPalette(): { fills: string[]; borders: string[] } {
  if (chartPaletteCache) {
    return chartPaletteCache;
  }
  const borders = CHART_PALETTE_SOURCES.map(({ source, fallback }) => {
    const raw = readCssVar(source);
    return resolveCssColor(raw || fallback);
  });
  const fills = borders.map((c) => withAlpha(c, 0.6));
  chartPaletteCache = { fills, borders };
  return chartPaletteCache;
}

export function resetThemeChartPaletteCache(): void {
  chartPaletteCache = undefined;
}
