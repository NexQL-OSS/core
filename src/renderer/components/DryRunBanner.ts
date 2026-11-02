/**
 * DryRunBanner.ts
 * Prominent banner shown above dry-run result tables. Built on the shared InlineBanner so
 * spacing/typography stay consistent; only the accent (left bar, weight) is overridden.
 */
import { createInlineBanner } from './InlineBanner';
import type { DryRunInfo } from '../../common/types';
import { MODE_COLORS } from '../../ui/renderer/rendererConstants';

/**
 * Accent for "this would write" states. `--vscode-nexql-mode-write` is contributed by the
 * theming work; the fallback keeps the banner correct before/without it.
 */
export const DRY_RUN_ACCENT = MODE_COLORS.write;

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function dryRunBannerMessage(info: DryRunInfo): string {
  const rollbackNote = info.rollbackConfirmed
    ? ''
    : ' WARNING: the rollback could not be confirmed. Check your session before continuing.';
  if (info.phase === 'before') {
    const shown = info.capped
      ? `first ${info.shownRows.toLocaleString()} rows (more match)`
      : plural(info.shownRows, 'row', 'rows');
    return `Dry run: nothing was saved. Before: ${shown} as they are now.${rollbackNote}`;
  }
  if (info.affectedCount === null) {
    return `Dry run: nothing was saved. The ${info.verb} ran and was rolled back.${rollbackNote}`;
  }
  if (info.verb === 'DDL') {
    return `Dry run: nothing was saved. The statement ran successfully and was rolled back.${rollbackNote}`;
  }
  const count = plural(info.affectedCount, 'row', 'rows');
  const base = `Dry run: nothing was saved. ${count} would change.`;
  if (info.phase === 'after') {
    const shown = info.capped ? ` first ${info.shownRows.toLocaleString()} rows` : ' rows';
    return `${base} After the change:${shown}.${rollbackNote}`;
  }
  return `${base}${rollbackNote}`;
}

export function createDryRunBanner(info: DryRunInfo): HTMLElement {
  const banner = createInlineBanner({
    severity: 'warning',
    message: dryRunBannerMessage(info),
    dismissible: false,
  });
  banner.dataset.dryRunBanner = 'true';
  banner.setAttribute('role', 'status');
  banner.classList.add('nx-banner--dry-run');
  // Slightly heavier edge than a plain warning banner: this one means "would write".
  banner.style.borderLeft = `4px solid ${DRY_RUN_ACCENT}`;

  if (info.notes.length > 0) {
    const details = document.createElement('div');
    details.style.cssText =
      'font-size:11px;font-weight:400;color:var(--vscode-descriptionForeground);margin-top:2px;';
    details.textContent = info.notes.join(' ');
    // InlineBanner is a flex row; append the notes under the message text.
    const text = banner.children[1] as HTMLElement | undefined;
    if (text) {
      text.appendChild(details);
    }
  }
  return banner;
}
