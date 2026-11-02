/**
 * ResultFooter — optional row tools (far left); Add Row / Delete / Commit / Revert (right).
 * Row count and execution time live in ResultIdentityBar.
 */

import type { RowToolsOptions } from './ActionBar';
import { createRowTools } from './ActionBar';
import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

export interface ResultFooterOptions {
  onAddRow?: () => void;
  dirtyCount: number;
  onCommit?: () => void;
  /** Rows currently selected in the grid (table view); shows Delete Row (n) when &gt; 0. */
  deleteSelectionCount?: number;
  /** Mark selected rows for deletion (staged until Commit). */
  onDeleteSelected?: () => void;
  /** Warning when PK is missing — applied to Delete button title + muted style. */
  deleteUnavailableReason?: string;
  /** Discard pending edits / staged deletes (shown after Commit when dirtyCount &gt; 0). */
  onRevert?: () => void;
  /** All / Copy / Import / Export anchored in the footer (left, before stats). */
  rowTools?: RowToolsOptions;
}

function formatExecutionTime(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return ms >= 1000 ? `${seconds.toFixed(2)}s` : `${ms}ms`;
}

/** Stats line shown in the identity bar (footer no longer repeats row/time). */
export function formatResultExecutionStats(totalRows: number, executionTimeSeconds?: number): string {
  let statsText = `${totalRows.toLocaleString()} row${totalRows !== 1 ? 's' : ''}`;
  if (executionTimeSeconds !== undefined) {
    statsText += ` · ${formatExecutionTime(executionTimeSeconds)}`;
  }
  return statsText;
}

export function createResultFooter(options: ResultFooterOptions): HTMLElement {
  const {
    onAddRow,
    dirtyCount,
    onCommit,
    deleteSelectionCount = 0,
    onDeleteSelected,
    deleteUnavailableReason,
    onRevert,
    rowTools,
  } = options;

  ensureRendererBrandStyles();

  const footer = document.createElement('div');
  footer.dataset.resultFooter = 'true';
  footer.className = 'nx-footer';

  if (rowTools) {
    footer.appendChild(createRowTools(rowTools));
  }

  const spacer = document.createElement('div');
  spacer.style.flex = '1';
  footer.appendChild(spacer);

  if (onAddRow) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+ Add Row';
    addBtn.className = 'nx-footer__btn nx-footer__btn--add';
    addBtn.onclick = onAddRow;
    footer.appendChild(addBtn);
  }

  if (deleteSelectionCount > 0 && onDeleteSelected) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.setAttribute('data-pg-result-delete', 'true');
    deleteBtn.textContent = `Delete Row (${deleteSelectionCount})`;
    deleteBtn.className = 'nx-footer__btn nx-footer__btn--delete';
    if (deleteUnavailableReason) {
      deleteBtn.style.opacity = '0.72';
      deleteBtn.title = deleteUnavailableReason;
    } else {
      deleteBtn.title = 'Stage selected rows for deletion (commit with Commit)';
    }
    deleteBtn.onclick = onDeleteSelected;
    footer.appendChild(deleteBtn);
  }

  if (dirtyCount > 0 && onCommit) {
    const commitBtn = document.createElement('button');
    commitBtn.type = 'button';
    commitBtn.setAttribute('data-pg-result-commit', 'true');
    commitBtn.textContent = `Commit (${dirtyCount})`;
    commitBtn.className = 'nx-footer__btn nx-footer__btn--commit';
    commitBtn.onclick = onCommit;
    footer.appendChild(commitBtn);
  }

  if (dirtyCount > 0 && onRevert) {
    const revertBtn = document.createElement('button');
    revertBtn.type = 'button';
    revertBtn.textContent = 'Revert';
    revertBtn.title = 'Discard all unstaged cell edits and staged row deletions';
    revertBtn.className = 'nx-footer__btn nx-footer__btn--revert';
    revertBtn.onclick = onRevert;
    footer.appendChild(revertBtn);
  }

  return footer;
}
