/**
 * InlineBanner.ts
 * Dismissible inline banner. Severity controls color.
 */

import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

export type BannerSeverity = 'warning' | 'info' | 'error' | 'success';

export interface InlineBannerOptions {
  severity: BannerSeverity;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  /** Called when the user clicks the dismiss (×) control. */
  onDismiss?: () => void;
  /** Optional mute control (e.g. hide this hint forever). Rendered before dismiss. */
  onMuteForever?: () => void;
}

/** Modifier class and glyph per severity: info = accent, warn = write mode, error = errorForeground, success = read mode. */
const SEVERITY_STYLES: Record<BannerSeverity, { cls: string; icon: string }> = {
  warning: { cls: 'nx-banner--warn', icon: '⚠' },
  info: { cls: 'nx-banner--info', icon: 'ⓘ' },
  error: { cls: 'nx-banner--error', icon: '✕' },
  success: { cls: 'nx-banner--success', icon: '✓' },
};

export function createInlineBanner(options: InlineBannerOptions): HTMLElement {
  const { severity, message, actionLabel, onAction, dismissible = true, onDismiss, onMuteForever } =
    options;
  const s = SEVERITY_STYLES[severity];

  ensureRendererBrandStyles();

  const banner = document.createElement('div');
  banner.className = `nx-banner ${s.cls}`;

  const icon = document.createElement('span');
  icon.textContent = s.icon;
  icon.className = 'nx-banner__icon';
  banner.appendChild(icon);

  const text = document.createElement('span');
  text.textContent = message;
  text.className = 'nx-banner__text';
  banner.appendChild(text);

  if (actionLabel && onAction) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.textContent = actionLabel;
    actionBtn.className = 'nx-banner__action';
    actionBtn.onclick = onAction;
    banner.appendChild(actionBtn);
  }

  if (onMuteForever) {
    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.textContent = '🔕';
    muteBtn.title = 'Mute forever — never show this hint again';
    muteBtn.className = 'nx-banner__dismiss';
    muteBtn.onclick = () => {
      onMuteForever();
      banner.remove();
    };
    banner.appendChild(muteBtn);
  }

  if (dismissible) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.title = 'Dismiss for now (hint may return after a week or 100 streaming queries)';
    closeBtn.className = 'nx-banner__dismiss';
    closeBtn.onclick = () => {
      onDismiss?.();
      banner.remove();
    };
    banner.appendChild(closeBtn);
  }

  return banner;
}
