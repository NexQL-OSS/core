import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

/**
 * TransactionBanner component for displaying an open transaction state.
 * Renders an amber pulsing banner with statement count and Commit/Rollback buttons.
 */

export interface TransactionBannerOptions {
  statementCount: number;
  onCommit: () => void;
  onRollback: () => void;
}

// Inject the pulse keyframes once into the document. The base banner look lives in the
// shared renderer stylesheet; only the transaction-specific motion is defined here.
function ensurePulseAmberStyle(): void {
  const STYLE_ID = 'transaction-banner-pulse-amber';
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes nx-pulse-warn {
      0%, 100% { background-color: color-mix(in srgb, var(--nx-sev) 10%, var(--vscode-editor-background)); }
      50%      { background-color: color-mix(in srgb, var(--nx-sev) 20%, var(--vscode-editor-background)); }
    }
    @media (prefers-reduced-motion: no-preference) {
      body:not(.vscode-high-contrast):not(.vscode-high-contrast-light) .transaction-banner-pulse {
        animation: nx-pulse-warn 2s ease-in-out infinite;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Creates a TransactionBanner element.
 * Shows "Transaction open · {n} statements · not committed" with Commit and Rollback buttons.
 */
export function createTransactionBanner(options: TransactionBannerOptions): HTMLElement {
  ensurePulseAmberStyle();
  ensureRendererBrandStyles();

  const banner = document.createElement('div');
  banner.className = 'nx-banner nx-banner--warn nx-banner--txn transaction-banner-pulse';
  banner.dataset.transactionBanner = 'true';

  // Text label
  const label = document.createElement('span');
  label.className = 'nx-banner__text';
  label.textContent = `Transaction open · ${options.statementCount} statement${options.statementCount !== 1 ? 's' : ''} · not committed`;
  banner.appendChild(label);

  // Commit button
  banner.appendChild(createBannerButton('Commit', true, options.onCommit));

  // Rollback button
  banner.appendChild(createBannerButton('Rollback', false, options.onRollback));

  return banner;
}

function createBannerButton(label: string, isFilled: boolean, onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = isFilled ? 'nx-banner__action nx-banner__action--filled' : 'nx-banner__action';
  btn.onclick = () => onClick();
  return btn;
}
