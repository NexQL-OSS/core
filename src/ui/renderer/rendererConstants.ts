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

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** VS Code chart color CSS variables for theme-aware Chart.js palettes. */
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

function withAlpha(rgb: string, alpha: number): string {
  const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return rgb;
  }
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

/** Resolve theme chart palette once per renderer session (Chart.js needs concrete colors). */
export function getThemeChartPalette(): { fills: string[]; borders: string[] } {
  if (chartPaletteCache) {
    return chartPaletteCache;
  }
  const borders = CHART_COLOR_VARS.map((v) => resolveCssColor(v));
  const fills = borders.map((c) => withAlpha(c, 0.6));
  chartPaletteCache = { fills, borders };
  return chartPaletteCache;
}

export function resetThemeChartPaletteCache(): void {
  chartPaletteCache = undefined;
}
