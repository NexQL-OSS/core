import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

/**
 * ErrorPanel component for displaying query execution errors.
 * Shows the raw PostgreSQL error, an optional plain-English explanation,
 * and three action buttons: Explain error, Fix with AI, and Retry.
 */

export interface ErrorPanelOptions {
  errorCode?: string;
  errorMessage: string;
  explanation?: string;
  cellId?: string;
  onExplainError: () => void;
  onFixWithAI: () => void;
  onRetry: () => void;
}

/**
 * Creates an error panel element for displaying query execution failures.
 */
export function createErrorPanel(options: ErrorPanelOptions): HTMLElement {
  ensureRendererBrandStyles();

  const container = document.createElement('div');
  container.className = 'nx-banner nx-banner--error nx-banner--panel';

  // Raw error in monospace
  const errorLine = document.createElement('div');
  const errorText = options.errorCode
    ? `ERROR ${options.errorCode}: ${options.errorMessage}`
    : options.errorMessage;
  errorLine.textContent = errorText;
  errorLine.style.cssText = `
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    color: var(--vscode-errorForeground);
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  `;
  container.appendChild(errorLine);

  // Plain-English explanation (omitted when undefined)
  if (options.explanation !== undefined) {
    const explanationEl = document.createElement('p');
    explanationEl.textContent = options.explanation;
    explanationEl.style.cssText = `
      margin: 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    `;
    container.appendChild(explanationEl);
  }

  // Action buttons row
  const actionsRow = document.createElement('div');
  actionsRow.style.cssText = `
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  `;

  actionsRow.appendChild(createButton('◎ Explain error', options.onExplainError));
  actionsRow.appendChild(createButton('✦ Fix with AI', options.onFixWithAI));
  actionsRow.appendChild(createButton('↺ Retry', options.onRetry));

  container.appendChild(actionsRow);

  return container;
}

function createButton(label: string, onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = 'nx-btn';
  btn.onclick = () => onClick();
  return btn;
}
