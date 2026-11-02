import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

/**
 * ResultIdentityBar — statement badge + SQL preview (left), execution stats + actions (right).
 */

export interface ResultIdentityBarOptions {
  /** First line of SQL (truncated); shown after the command badge. */
  queryPreview: string;
  /** Full SQL for tooltip (optional). */
  queryFull?: string;
  /** Kernel command keyword (SELECT, INSERT, …) for badge tint. */
  command: string | undefined;
  /** Bold stats at the right end (e.g. "50 rows · 30ms"). */
  statsLine?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onOverflow: (anchorEl: HTMLElement) => void;
  onExpand?: () => void;
}

/** Pill tint per SQL leading keyword — semantic groups (read / write / DDL / session / admin). */
const COMMAND_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  // Read & introspection
  SELECT: {
    bg: 'color-mix(in srgb, #3b82f6 14%, transparent)',
    fg: '#3b82f6',
    border: 'color-mix(in srgb, #3b82f6 35%, transparent)',
  },
  WITH: {
    bg: 'color-mix(in srgb, #2563eb 14%, transparent)',
    fg: '#2563eb',
    border: 'color-mix(in srgb, #2563eb 34%, transparent)',
  },
  SHOW: {
    bg: 'color-mix(in srgb, #64748b 14%, transparent)',
    fg: '#64748b',
    border: 'color-mix(in srgb, #64748b 34%, transparent)',
  },
  DESCRIBE: {
    bg: 'color-mix(in srgb, #475569 14%, transparent)',
    fg: '#475569',
    border: 'color-mix(in srgb, #475569 34%, transparent)',
  },

  // Data writes
  INSERT: {
    bg: 'color-mix(in srgb, #22c55e 14%, transparent)',
    fg: '#22c55e',
    border: 'color-mix(in srgb, #22c55e 35%, transparent)',
  },
  UPDATE: {
    bg: 'color-mix(in srgb, #f59e0b 14%, transparent)',
    fg: '#f59e0b',
    border: 'color-mix(in srgb, #f59e0b 35%, transparent)',
  },
  DELETE: {
    bg: 'color-mix(in srgb, #ef4444 14%, transparent)',
    fg: '#ef4444',
    border: 'color-mix(in srgb, #ef4444 35%, transparent)',
  },
  MERGE: {
    bg: 'color-mix(in srgb, #0891b2 14%, transparent)',
    fg: '#0891b2',
    border: 'color-mix(in srgb, #0891b2 34%, transparent)',
  },
  COPY: {
    bg: 'color-mix(in srgb, #047857 14%, transparent)',
    fg: '#047857',
    border: 'color-mix(in srgb, #047857 34%, transparent)',
  },

  // DDL — schema objects
  CREATE: {
    bg: 'color-mix(in srgb, #0d9488 14%, transparent)',
    fg: '#0d9488',
    border: 'color-mix(in srgb, #0d9488 34%, transparent)',
  },
  ALTER: {
    bg: 'color-mix(in srgb, #6366f1 14%, transparent)',
    fg: '#6366f1',
    border: 'color-mix(in srgb, #6366f1 34%, transparent)',
  },
  DROP: {
    bg: 'color-mix(in srgb, #be123c 14%, transparent)',
    fg: '#be123c',
    border: 'color-mix(in srgb, #be123c 34%, transparent)',
  },
  TRUNCATE: {
    bg: 'color-mix(in srgb, #ea580c 14%, transparent)',
    fg: '#ea580c',
    border: 'color-mix(in srgb, #ea580c 34%, transparent)',
  },
  RENAME: {
    bg: 'color-mix(in srgb, #7c3aed 14%, transparent)',
    fg: '#7c3aed',
    border: 'color-mix(in srgb, #7c3aed 34%, transparent)',
  },
  COMMENT: {
    bg: 'color-mix(in srgb, #52525b 14%, transparent)',
    fg: '#52525b',
    border: 'color-mix(in srgb, #52525b 32%, transparent)',
  },
  CLUSTER: {
    bg: 'color-mix(in srgb, #b45309 14%, transparent)',
    fg: '#b45309',
    border: 'color-mix(in srgb, #b45309 34%, transparent)',
  },
  REFRESH: {
    bg: 'color-mix(in srgb, #14b8a6 14%, transparent)',
    fg: '#14b8a6',
    border: 'color-mix(in srgb, #14b8a6 34%, transparent)',
  },

  // Plans & explain
  EXPLAIN: {
    bg: 'color-mix(in srgb, #8b5cf6 14%, transparent)',
    fg: '#8b5cf6',
    border: 'color-mix(in srgb, #8b5cf6 35%, transparent)',
  },

  // Transactions
  BEGIN: {
    bg: 'color-mix(in srgb, #78716c 14%, transparent)',
    fg: '#78716c',
    border: 'color-mix(in srgb, #78716c 34%, transparent)',
  },
  START: {
    bg: 'color-mix(in srgb, #78716c 14%, transparent)',
    fg: '#78716c',
    border: 'color-mix(in srgb, #78716c 34%, transparent)',
  },
  COMMIT: {
    bg: 'color-mix(in srgb, #15803d 14%, transparent)',
    fg: '#15803d',
    border: 'color-mix(in srgb, #15803d 34%, transparent)',
  },
  ROLLBACK: {
    bg: 'color-mix(in srgb, #991b1b 14%, transparent)',
    fg: '#991b1b',
    border: 'color-mix(in srgb, #991b1b 34%, transparent)',
  },
  SAVEPOINT: {
    bg: 'color-mix(in srgb, #ca8a04 14%, transparent)',
    fg: '#ca8a04',
    border: 'color-mix(in srgb, #ca8a04 34%, transparent)',
  },
  RELEASE: {
    bg: 'color-mix(in srgb, #a16207 14%, transparent)',
    fg: '#a16207',
    border: 'color-mix(in srgb, #a16207 34%, transparent)',
  },

  // Permissions
  GRANT: {
    bg: 'color-mix(in srgb, #059669 14%, transparent)',
    fg: '#059669',
    border: 'color-mix(in srgb, #059669 34%, transparent)',
  },
  REVOKE: {
    bg: 'color-mix(in srgb, #d97706 14%, transparent)',
    fg: '#d97706',
    border: 'color-mix(in srgb, #d97706 34%, transparent)',
  },

  // Session / parameters
  SET: {
    bg: 'color-mix(in srgb, #57534e 14%, transparent)',
    fg: '#57534e',
    border: 'color-mix(in srgb, #57534e 32%, transparent)',
  },
  RESET: {
    bg: 'color-mix(in srgb, #57534e 14%, transparent)',
    fg: '#57534e',
    border: 'color-mix(in srgb, #57534e 32%, transparent)',
  },

  // Prepared statements
  PREPARE: {
    bg: 'color-mix(in srgb, #9333ea 14%, transparent)',
    fg: '#9333ea',
    border: 'color-mix(in srgb, #9333ea 34%, transparent)',
  },
  EXECUTE: {
    bg: 'color-mix(in srgb, #7e22ce 14%, transparent)',
    fg: '#7e22ce',
    border: 'color-mix(in srgb, #7e22ce 34%, transparent)',
  },
  DEALLOCATE: {
    bg: 'color-mix(in srgb, #a855f7 14%, transparent)',
    fg: '#a855f7',
    border: 'color-mix(in srgb, #a855f7 34%, transparent)',
  },

  // Maintenance & stats
  VACUUM: {
    bg: 'color-mix(in srgb, #0369a1 14%, transparent)',
    fg: '#0369a1',
    border: 'color-mix(in srgb, #0369a1 34%, transparent)',
  },
  ANALYZE: {
    bg: 'color-mix(in srgb, #0284c7 14%, transparent)',
    fg: '#0284c7',
    border: 'color-mix(in srgb, #0284c7 34%, transparent)',
  },
  REINDEX: {
    bg: 'color-mix(in srgb, #0e7490 14%, transparent)',
    fg: '#0e7490',
    border: 'color-mix(in srgb, #0e7490 34%, transparent)',
  },

  // Async & scripting
  LISTEN: {
    bg: 'color-mix(in srgb, #db2777 14%, transparent)',
    fg: '#db2777',
    border: 'color-mix(in srgb, #db2777 34%, transparent)',
  },
  NOTIFY: {
    bg: 'color-mix(in srgb, #c026d3 14%, transparent)',
    fg: '#c026d3',
    border: 'color-mix(in srgb, #c026d3 34%, transparent)',
  },
  UNLISTEN: {
    bg: 'color-mix(in srgb, #be185d 14%, transparent)',
    fg: '#be185d',
    border: 'color-mix(in srgb, #be185d 34%, transparent)',
  },
  DO: {
    bg: 'color-mix(in srgb, #a855f7 14%, transparent)',
    fg: '#a855f7',
    border: 'color-mix(in srgb, #a855f7 34%, transparent)',
  },

  DEFAULT: {
    bg: 'color-mix(in srgb, var(--vscode-descriptionForeground) 12%, transparent)',
    fg: 'var(--vscode-descriptionForeground)',
    border: 'var(--vscode-widget-border)',
  },
};

function commandColors(cmd: string | undefined) {
  if (!cmd) return COMMAND_COLORS.DEFAULT;
  const upper = cmd.toUpperCase();
  const key = upper.split(/\s+/)[0] ?? '';
  return COMMAND_COLORS[key] ?? COMMAND_COLORS.DEFAULT;
}

export function commandKeywordLabel(command: string | undefined): string {
  if (!command?.trim()) return 'QUERY';
  return command.trim().split(/\s+/)[0]!.toUpperCase();
}

/** Right-side control cluster — tight padding to the edge. */
const ACTION_BTN_CSS = `
  background: none; border: none; cursor: pointer;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
  border-radius: 3px;
  transition: background 0.1s;
  padding: 2px 3px;
  line-height: 1;
`;

export function createResultIdentityBar(options: ResultIdentityBarOptions): HTMLElement {
  const {
    queryPreview,
    queryFull,
    command,
    statsLine,
    onToggleCollapse,
    onOverflow,
    onExpand,
  } = options;
  const kw = commandKeywordLabel(command);
  const colors = commandColors(kw);

  ensureRendererBrandStyles();

  const bar = document.createElement('div');
  bar.className = 'nx-identity';

  const leftCluster = document.createElement('div');
  leftCluster.style.cssText =
    'display:flex;align-items:center;gap:7px;min-width:0;flex:1;cursor:pointer;';
  leftCluster.onclick = () => onToggleCollapse();

  const badge = document.createElement('span');
  badge.textContent = `● ${kw}`;
  badge.title = kw;
  badge.className = 'nx-cmd';
  badge.style.cssText = `
    background: ${colors.bg};
    color: ${colors.fg};
    border: 1px solid ${colors.border};
  `;

  const sep = document.createElement('span');
  sep.textContent = '·';
  sep.style.cssText = 'flex-shrink:0;opacity:0.45;font-weight:600;';

  const preview = document.createElement('span');
  preview.textContent = queryPreview;
  preview.title = queryFull?.trim() || queryPreview;
  preview.style.cssText = `
    flex: 1;
    min-width: 0;
    font-family: var(--vscode-editor-font-family), monospace;
    font-size: 11px;
    color: var(--vscode-editor-foreground);
    opacity: 0.92;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `;

  leftCluster.appendChild(badge);
  leftCluster.appendChild(sep);
  leftCluster.appendChild(preview);

  const rightCluster = document.createElement('div');
  rightCluster.style.cssText =
    'display:flex;align-items:center;flex-shrink:0;gap:3px;margin-left:auto;';

  const statsEl = document.createElement('span');
  statsEl.dataset.resultStats = 'true';
  statsEl.textContent = statsLine ?? '';
  statsEl.className = 'nx-identity__stats nx-mono-label';
  // The renderer toggles `display` when the text changes (updateIdentityStats).
  statsEl.style.display = statsLine?.trim() ? 'inline-block' : 'none';
  statsEl.onclick = (e) => e.stopPropagation();

  const chevron = document.createElement('span');
  chevron.dataset.chevron = 'true';
  chevron.textContent = options.isCollapsed ? '▶' : '▼';
  chevron.title = options.isCollapsed ? 'Expand result' : 'Collapse result';
  chevron.style.cssText =
    'font-size:10px;opacity:0.72;flex-shrink:0;padding:2px 2px;cursor:pointer;';
  chevron.onclick = (e) => {
    e.stopPropagation();
    onToggleCollapse();
  };

  const overflowBtn = document.createElement('button');
  overflowBtn.type = 'button';
  overflowBtn.textContent = '⋯';
  overflowBtn.title = 'More: transpose, notices, explain, navigation';
  overflowBtn.style.cssText = `${ACTION_BTN_CSS} font-size: 15px;`;
  overflowBtn.onmouseenter = () => {
    overflowBtn.style.background = 'var(--vscode-list-hoverBackground)';
  };
  overflowBtn.onmouseleave = () => {
    overflowBtn.style.background = 'none';
  };
  overflowBtn.onclick = (e) => {
    e.stopPropagation();
    onOverflow(overflowBtn);
  };

  rightCluster.appendChild(statsEl);
  rightCluster.appendChild(chevron);
  rightCluster.appendChild(overflowBtn);

  if (onExpand) {
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.textContent = '⤢';
    expandBtn.title = 'Focus query cell';
    expandBtn.style.cssText = `${ACTION_BTN_CSS} font-size: 13px;`;
    expandBtn.onmouseenter = () => {
      expandBtn.style.background = 'var(--vscode-list-hoverBackground)';
    };
    expandBtn.onmouseleave = () => {
      expandBtn.style.background = 'none';
    };
    expandBtn.onclick = (e) => {
      e.stopPropagation();
      onExpand();
    };
    rightCluster.appendChild(expandBtn);
  }

  bar.appendChild(leftCluster);
  bar.appendChild(rightCluster);

  return bar;
}
