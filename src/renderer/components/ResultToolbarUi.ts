import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

/**
 * Shared SVG icons + ghost toolbar styles for notebook result chrome (tabs, row tools, filter).
 * Icons: 24×24 viewBox, stroke currentColor — scale via width/height on <svg>.
 */

export const RESULT_TOOLBAR_ICON_PX = 14;
export const RESULT_TOOLBAR_SPARKLE_PX = 18;

/** Inline SVG snippets (paths only inside root svg wrapper). */
function wrapSvg(children: string, size = RESULT_TOOLBAR_ICON_PX): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

export type ResultToolbarGlyph =
  | 'table'
  | 'chart'
  | 'analyst'
  | 'notices'
  | 'transpose'
  | 'review'
  | 'explain'
  | 'selectAll'
  | 'checkboxEmpty'
  | 'checkboxChecked'
  | 'copy'
  | 'copySuccess'
  | 'import'
  | 'export'
  | 'menuChat'
  | 'menuChart'
  | 'menuBolt'
  | 'plus'
  | 'sparkles'
  | 'chevronDown'
  | 'close'
  | 'previewEye'
  | 'save'
  | 'expandCell'
  | 'menuList';

export function resultToolbarSvg(
  glyph: ResultToolbarGlyph,
  size: number = RESULT_TOOLBAR_ICON_PX,
): string {
  const chev = Math.min(12, size);
  switch (glyph) {
    case 'table':
      return wrapSvg(
        '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 10h18M12 10v8"/>',
        size,
      );
    case 'chart':
      return wrapSvg('<path d="M4 19V9M12 19v-6M20 19V5"/><path d="M4 15l4-4 4 4 8-8"/>', size);
    case 'analyst':
      return wrapSvg(
        '<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/>',
        size,
      );
    case 'notices':
      return wrapSvg('<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>', size);
    case 'transpose':
      return wrapSvg(
        '<path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>',
        size,
      );
    case 'review':
      return wrapSvg(
        '<path d="M9 12h6M9 16h4"/><rect x="4" y="4" width="16" height="14" rx="2"/><path d="M8 8h8"/>',
        size,
      );
    case 'explain':
      return wrapSvg(
        '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/><path d="M11 8v4M11 14h.01"/>',
        size,
      );
    case 'selectAll':
      return wrapSvg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12l2 2 4-4"/>', size);
    case 'checkboxEmpty':
      return wrapSvg('<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/>', size);
    case 'checkboxChecked':
      return wrapSvg(
        '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5" fill="currentColor" fill-opacity="0.22"/><path d="M9 12l2 2 4-4"/>',
        size,
      );
    case 'copy':
      return wrapSvg(
        '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 012-2h10"/>',
        size,
      );
    case 'copySuccess':
      return wrapSvg(
        '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.2 2.2L16 9"/>',
        size,
      );
    case 'import':
      // Upload: arrow up into tray
      return wrapSvg(
        '<path d="M12 3v10"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>',
        size,
      );
    case 'export':
      // Download: arrow down to tray
      return wrapSvg(
        '<path d="M12 3v10"/><path d="M7 13l5 5 5-5"/><path d="M5 21h14"/>',
        size,
      );
    case 'menuChat':
      return wrapSvg(
        '<path d="M21 11.5a8.5 8.5 0 01-8.5 8.5H5a2 2 0 01-2-2V11.5a8.5 8.5 0 1118 0z"/>',
        size,
      );
    case 'menuChart':
      return wrapSvg('<path d="M4 19V9M12 19v-6M20 19V5"/><path d="M4 15l4-4 4 4 8-8"/>', size);
    case 'menuBolt':
      return wrapSvg('<path d="M13 3L4 14h7l-1 8 10-12h-7l3-7z"/>', size);
    case 'plus':
      return wrapSvg('<path d="M12 5v14M5 12h14"/>', size);
    case 'sparkles':
      return wrapSvg(
        '<path d="M9.94 6.94l.97 2.82 2.82.97-2.82.97-.97 2.82-.97-2.82-2.82-.97 2.82-.97z"/><path d="M16.5 3.5l.32 1 1 .32-1 .32-.32 1-.32-1-1-.32 1-.32z"/>',
        size,
      );
    case 'chevronDown':
      return wrapSvg('<path d="M6 9l6 6 6-6"/>', chev);
    case 'close':
      return wrapSvg('<path d="M18 6L6 18M6 6l12 12"/>', Math.min(13, size));
    case 'previewEye':
      return wrapSvg(
        '<path d="M2 12s4.5-7 10-7 10 7 10 7-4.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
        Math.min(13, size),
      );
    case 'save':
      return wrapSvg(
        '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
        size,
      );
    case 'expandCell':
      return wrapSvg(
        '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
        size,
      );
    case 'menuList':
      return wrapSvg('<path d="M4 6h16M4 12h16M4 18h16"/>', size);
    default:
      return wrapSvg('<circle cx="12" cy="12" r="2"/>', size);
  }
}

export const RESULT_TOOLBAR_ICON_CLASS = 'pg-result-tb__ic';
export const RESULT_TOOLBAR_LABEL_CLASS = 'pg-result-tb__tx';

export function fillToolbarButtonContent(
  btn: HTMLButtonElement,
  glyph: ResultToolbarGlyph,
  label: string,
): void {
  btn.innerHTML = '';
  const ic = document.createElement('span');
  ic.className = RESULT_TOOLBAR_ICON_CLASS;
  ic.innerHTML = resultToolbarSvg(glyph);
  const tx = document.createElement('span');
  tx.className = RESULT_TOOLBAR_LABEL_CLASS;
  tx.textContent = label;
  btn.appendChild(ic);
  btn.appendChild(tx);
}

/**
 * Result view tab (Table / Chart / Notices ...): flat text tab with an accent underline when
 * active. Look and hover live in the shared stylesheet (`.nx-tab`).
 */
export function applyResultViewTabStyle(btn: HTMLButtonElement, active: boolean): void {
  ensureRendererBrandStyles();
  btn.classList.add('nx-tab');
  btn.dataset.pgTabActive = active ? '1' : '0';
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  // Drop any inline override left by a previous state (hover tint, pending-change tint).
  btn.removeAttribute('style');
}

/** Hover is handled by `.nx-tab:hover`; kept so callers can opt a button into the tab look. */
export function attachResultViewTabHover(btn: HTMLButtonElement): void {
  ensureRendererBrandStyles();
  btn.classList.add('nx-tab');
}

/** Row tools + compact actions: ghost button (layout only; pair with `attachResultRowToolInteractions`). */
export function applyResultRowToolStyle(btn: HTMLButtonElement): void {
  ensureRendererBrandStyles();
  btn.classList.add('nx-tool');
  btn.removeAttribute('style');
}

/** Hover and the copy-success flash are CSS (`.nx-tool:hover`, `[data-pg-row-tool-flash]`). */
export function attachResultRowToolInteractions(btn: HTMLButtonElement): void {
  btn.classList.add('nx-tool');
}

export function fillRowToolButton(btn: HTMLButtonElement, glyph: ResultToolbarGlyph, label: string): void {
  fillToolbarButtonContent(btn, glyph, label);
  applyResultRowToolStyle(btn);
  attachResultRowToolInteractions(btn);
}

/** Compact chip for output hover toolbar (fades in on result card hover). */
export function fillOutputHoverToolButton(btn: HTMLButtonElement, glyph: ResultToolbarGlyph, label: string): void {
  fillToolbarButtonContent(btn, glyph, label);
  ensureRendererBrandStyles();
  btn.classList.add('nx-tool', 'nx-tool--compact');
  btn.removeAttribute('style');
}

/** Filter bar “Add filter” — matches toolbar ghost style. */
export function applyAddFilterButtonStyle(btn: HTMLButtonElement): void {
  fillToolbarButtonContent(btn, 'plus', 'Add filter');
  ensureRendererBrandStyles();
  btn.classList.add('nx-tool', 'nx-tool--filter');
  btn.removeAttribute('style');
}
