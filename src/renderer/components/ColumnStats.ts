/**
 * ColumnStats.ts
 * Computes and displays column statistics as a hover tooltip on column headers.
 * Computed client-side from the current result rows (no additional DB query needed for typical result sizes).
 */

import { ColumnStatsData } from '../../common/types';
import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

function esc(text: unknown): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class ColumnStatsTooltip {
  private tooltip: HTMLElement;
  private currentAnchor: HTMLElement | null = null;

  constructor() {
    ensureRendererBrandStyles();
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'nx-tooltip';
    document.body.appendChild(this.tooltip);
  }

  /**
   * Compute stats from in-memory rows (fast, client-side)
   */
  static compute(rows: any[], column: string): ColumnStatsData {
    let nullCount = 0;
    const distinctSet = new Set<string>();
    let min: any = undefined;
    let max: any = undefined;
    let totalLength = 0;
    let stringCount = 0;

    for (const row of rows) {
      const v = row[column];
      if (v === null || v === undefined || v === '') {
        nullCount++;
        continue;
      }
      distinctSet.add(String(v));

      // Numeric min/max
      const num = Number(v);
      if (!isNaN(num)) {
        if (min === undefined || num < min) { min = num; }
        if (max === undefined || num > max) { max = num; }
      } else {
        // String min/max (lexicographic)
        const s = String(v);
        if (min === undefined || s < String(min)) { min = s; }
        if (max === undefined || s > String(max)) { max = s; }
        totalLength += s.length;
        stringCount++;
      }
    }

    return {
      column,
      nullCount,
      nullPct: rows.length > 0 ? (nullCount / rows.length) * 100 : 0,
      distinctCount: distinctSet.size,
      min,
      max,
      avgLength: stringCount > 0 ? totalLength / stringCount : undefined,
      totalRows: rows.length,
    };
  }

  private formatValue(v: any): string {
    if (v === undefined) { return 'N/A'; }
    if (typeof v === 'number') {
      return v % 1 === 0 ? v.toString() : v.toFixed(4);
    }
    const s = String(v);
    return s.length > 30 ? s.slice(0, 30) + '...' : s;
  }

  show(anchor: HTMLElement, stats: ColumnStatsData) {
    this.currentAnchor = anchor;
    const rect = anchor.getBoundingClientRect();
    const nullBar = Math.round(stats.nullPct);
    const nonNullBar = 100 - nullBar;

    const tile = (label: string, value: string, extra = '', title = '', accent = false) => `
      <div class="nx-stat${accent ? ' nx-stat--accent' : ''}">
        <span class="nx-stat__value"${title ? ` title="${esc(title)}"` : ''}>${esc(value)}</span>
        <span class="nx-stat__label">${esc(label)}</span>
        ${extra}
      </div>`;
    const bar = (pct: number, color: string) =>
      `<div class="nx-stat__bar"><span style="width:${pct}%;background:${color};"></span></div>`;

    this.tooltip.innerHTML = `
      <div class="nx-tooltip__title">${esc(stats.column)}</div>
      <div class="nx-stat-grid">
        ${tile('Rows', stats.totalRows.toLocaleString())}
        ${tile('Nulls', `${stats.nullCount.toLocaleString()} (${stats.nullPct.toFixed(1)}%)`, bar(nullBar, 'var(--vscode-errorForeground)'))}
        ${tile('Distinct', stats.distinctCount.toLocaleString(), bar(nonNullBar, 'var(--vscode-nexql-accent, var(--vscode-textLink-foreground))'), '', true)}
        ${tile('Min', this.formatValue(stats.min), '', String(stats.min))}
        ${tile('Max', this.formatValue(stats.max), '', String(stats.max))}
        ${stats.avgLength !== undefined ? tile('Avg len', stats.avgLength.toFixed(1)) : ''}
      </div>
    `;

    // Position below the header cell
    const top = rect.bottom + 4;
    const left = Math.min(rect.left, window.innerWidth - 290);
    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.display = 'block';
  }

  hide() {
    this.tooltip.style.display = 'none';
    this.currentAnchor = null;
  }

  destroy() {
    document.body.removeChild(this.tooltip);
  }
}

/**
 * Attach stats tooltip to a column header element
 */
export function attachColumnStatsTooltip(
  headerCell: HTMLElement,
  column: string,
  getRows: () => any[],
  tooltip: ColumnStatsTooltip,
  delayMs = 600
) {
  let hoverTimer: any;

  headerCell.style.cursor = 'help';
  headerCell.title = 'Hover for column statistics';

  headerCell.addEventListener('mouseenter', () => {
    hoverTimer = setTimeout(() => {
      const rows = getRows();
      if (rows.length === 0) { return; }
      const stats = ColumnStatsTooltip.compute(rows, column);
      tooltip.show(headerCell, stats);
    }, delayMs);
  });

  headerCell.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    tooltip.hide();
  });
}
