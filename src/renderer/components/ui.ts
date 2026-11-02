import { BRAND_ACCENT } from '../../ui/renderer/rendererConstants';

export type ButtonVariant = 'neutral' | 'success' | 'destructive' | 'ai';

export function createButton(text: string, isSmall = false, variant: ButtonVariant = 'neutral'): HTMLElement {
  const btn = document.createElement('button');
  btn.innerText = text;

  const styles = getButtonStyles(variant);
  btn.style.cssText = `
    background: ${styles.background};
    color: ${styles.color};
    border: 1px solid ${styles.border};
    padding: ${isSmall ? '5px 10px' : '7px 14px'};
    border-radius: 999px;
    cursor: pointer;
    font-family: var(--vscode-font-family);
    font-size: ${isSmall ? '11px' : '13px'};
    display: inline-flex;
    align-items: center;
    gap: 6px;
    line-height: 1;
    font-weight: 600;
    letter-spacing: 0.01em;
    user-select: none;
    transition:
      transform 0.15s ease,
      background 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      opacity 0.15s ease;
    box-shadow: 0 1px 0 color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  `;
  btn.onmouseover = () => {
    btn.style.background = styles.hoverBackground;
    btn.style.borderColor = styles.hoverBorder;
    btn.style.transform = 'translateY(-1px)';
    btn.style.boxShadow = '0 4px 12px color-mix(in srgb, var(--vscode-editor-background) 72%, transparent)';
  };
  btn.onmouseout = () => {
    btn.style.background = styles.background;
    btn.style.borderColor = styles.border;
    btn.style.transform = 'translateY(0)';
    btn.style.boxShadow = '0 1px 0 color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)';
  };
  return btn;
}

function getButtonStyles(variant: ButtonVariant): {
  background: string;
  hoverBackground: string;
  border: string;
  hoverBorder: string;
  color: string;
} {
  switch (variant) {
    case 'success':
      return {
        background:
          'color-mix(in srgb, var(--vscode-terminal-ansiGreen) 14%, var(--vscode-button-secondaryBackground))',
        hoverBackground:
          'color-mix(in srgb, var(--vscode-terminal-ansiGreen) 22%, var(--vscode-button-secondaryBackground))',
        border: 'color-mix(in srgb, var(--vscode-terminal-ansiGreen) 36%, var(--vscode-panel-border))',
        hoverBorder: 'color-mix(in srgb, var(--vscode-terminal-ansiGreen) 52%, var(--vscode-panel-border))',
        color: 'var(--vscode-editor-foreground)',
      };
    case 'destructive':
      return {
        background:
          'color-mix(in srgb, var(--vscode-terminal-ansiRed) 14%, var(--vscode-button-secondaryBackground))',
        hoverBackground:
          'color-mix(in srgb, var(--vscode-terminal-ansiRed) 24%, var(--vscode-button-secondaryBackground))',
        border: 'color-mix(in srgb, var(--vscode-terminal-ansiRed) 38%, var(--vscode-panel-border))',
        hoverBorder: 'color-mix(in srgb, var(--vscode-terminal-ansiRed) 56%, var(--vscode-panel-border))',
        color: 'var(--vscode-editor-foreground)',
      };
    case 'ai':
      return {
        background:
          'color-mix(in srgb, var(--vscode-terminal-ansiCyan) 14%, var(--vscode-button-secondaryBackground))',
        hoverBackground:
          'color-mix(in srgb, var(--vscode-terminal-ansiCyan) 24%, var(--vscode-button-secondaryBackground))',
        border: 'color-mix(in srgb, var(--vscode-terminal-ansiCyan) 40%, var(--vscode-panel-border))',
        hoverBorder: 'color-mix(in srgb, var(--vscode-terminal-ansiCyan) 58%, var(--vscode-panel-border))',
        color: 'var(--vscode-editor-foreground)',
      };
    case 'neutral':
    default:
      return {
        background:
          'color-mix(in srgb, var(--vscode-button-secondaryBackground) 84%, var(--vscode-editor-background))',
        hoverBackground:
          'color-mix(in srgb, var(--vscode-button-secondaryHoverBackground) 78%, var(--vscode-editor-background))',
        border: 'color-mix(in srgb, var(--vscode-panel-border) 70%, var(--vscode-button-border))',
        hoverBorder: 'color-mix(in srgb, var(--vscode-focusBorder) 32%, var(--vscode-panel-border))',
        color: 'var(--vscode-button-secondaryForeground)',
      };
  }
}

export function createTab(text: string, id: string, isActive: boolean, onClick: () => void): HTMLElement {
  const tab = document.createElement('div');
  tab.textContent = text;
  tab.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      user-select: none;
      border-bottom: 2px solid ${isActive ? BRAND_ACCENT : 'transparent'};
      opacity: ${isActive ? '1' : '0.6'};
      transition: opacity 0.2s;
    `;
  tab.onclick = onClick;
  return tab;
}

// Re-export breadcrumb from dedicated module
export { createBreadcrumb, BreadcrumbSegment, BreadcrumbOptions } from './Breadcrumb';
