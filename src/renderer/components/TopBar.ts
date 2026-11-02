/**
 * TopBar component for the Notebook top-level action bar.
 * Renders a flex container with notebook-level action buttons and a right-aligned connection pill.
 */

import type { SentinelEnvironment } from '../../features/sentinel/types';
import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

export interface TopBarOptions {
  connectionName: string;
  host: string;
  port?: number;
  database: string;
  username?: string;
  environment?: SentinelEnvironment;
  readOnlyMode?: boolean;
  isConnected: boolean;
  showContextStrip?: boolean;
  isExecuting?: boolean;
  onRunAll: () => void;
  onClearOutputs: () => void;
  onAddCodeCell: () => void;
  onAddMarkdownCell: () => void;
  onCancel?: () => void;
}

const ENV_CHIP_STYLES: Record<SentinelEnvironment, { cls: string; label: string }> = {
  production: { cls: 'nx-chip--prod', label: 'PROD' },
  staging: { cls: 'nx-chip--staging', label: 'STAGING' },
  development: { cls: 'nx-chip--dev', label: 'DEV' },
};

/**
 * Creates a TopBar element with action buttons and a connection pill.
 */
export function createTopBar(options: TopBarOptions, postMessage: (msg: any) => void): HTMLElement {
  ensureTopBarStyle();
  ensureRendererBrandStyles();

  const bar = document.createElement('div');
  bar.className = 'nx-topbar';

  if (options.showContextStrip !== false && options.isConnected) {
    bar.appendChild(createContextStrip(options));
  }

  if (options.isExecuting && options.onCancel) {
    const cancelBtn = createTopBarButton('■ Cancel Query', options.onCancel);
    cancelBtn.classList.add('nx-btn--danger');
    bar.appendChild(cancelBtn);
    bar.appendChild(createSeparator());
  }

  bar.appendChild(createTopBarButton('▶ Run All', options.onRunAll));
  bar.appendChild(createTopBarButton('✕ Clear Outputs', options.onClearOutputs));
  bar.appendChild(createSeparator());
  bar.appendChild(createTopBarButton('+ Code Cell', options.onAddCodeCell));
  bar.appendChild(createTopBarButton('+ Markdown Cell', options.onAddMarkdownCell));

  const pill = createConnectionPill(options, postMessage);
  bar.appendChild(pill);

  return bar;
}

function createContextStrip(options: TopBarOptions): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'nexql-sentinel-strip nx-strip';

  if (options.environment) {
    strip.appendChild(createEnvChip(options.environment));
  }
  strip.appendChild(createModeChip(!!options.readOnlyMode));

  const context = document.createElement('span');
  const userHost = options.username
    ? `${options.username}@${options.host}`
    : options.host;
  const portSuffix = options.port ? `:${options.port}` : '';
  context.textContent = `${options.connectionName} · ${options.database} · ${userHost}${portSuffix}`;
  context.className = 'nx-strip__context nx-mono-label';
  context.title = context.textContent;
  strip.appendChild(context);

  return strip;
}

function createEnvChip(environment: SentinelEnvironment): HTMLElement {
  const style = ENV_CHIP_STYLES[environment];
  const chip = document.createElement('span');
  chip.className = `nx-chip ${style.cls}`;
  chip.textContent = style.label;
  return chip;
}

/** Session mode: green dot for read-only, write-mode dot for read/write. */
function createModeChip(readOnly: boolean): HTMLElement {
  const chip = document.createElement('span');
  chip.className = `nx-chip ${readOnly ? 'nx-chip--read' : 'nx-chip--write'}`;
  chip.dataset.sessionMode = readOnly ? 'read' : 'write';
  chip.textContent = readOnly ? 'Read-only' : 'Read/write';
  return chip;
}

function createConnectionPill(options: TopBarOptions, postMessage: (msg: any) => void): HTMLElement {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = `nx-conn-pill ${options.isConnected ? 'nx-chip--ok' : 'nx-chip--bad'}`;

  const dot = document.createElement('span');
  dot.className = 'nx-conn-pill__dot';
  if (!options.isConnected) {
    dot.classList.add('topbar-dot-disconnected');
  }

  const label = document.createElement('span');
  if (options.isConnected) {
    const userPart = options.username ? ` · ${options.username}` : '';
    label.textContent = `${options.connectionName} · ${options.database}${userPart}`;
    pill.title = [
      options.environment ? `Environment: ${ENV_CHIP_STYLES[options.environment].label}` : '',
      `Host: ${options.host}${options.port ? `:${options.port}` : ''}`,
      options.username ? `User: ${options.username}` : '',
      `Database: ${options.database}`,
      options.readOnlyMode ? 'Read-only mode' : '',
    ].filter(Boolean).join('\n');
  } else {
    label.textContent = 'Not connected';
    pill.title = 'No active connection';
  }

  pill.appendChild(dot);
  pill.appendChild(label);

  pill.onclick = () => {
    postMessage({ type: 'showConnectionInfo' });
  };

  return pill;
}

function createTopBarButton(label: string, onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = 'nx-btn';
  btn.onclick = () => onClick();
  return btn;
}

function createSeparator(): HTMLElement {
  const sep = document.createElement('div');
  sep.className = 'nx-sep';
  return sep;
}

function ensureTopBarStyle(): void {
  const STYLE_ID = 'topbar-disconnected-style';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes topbar-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }
    .topbar-dot-disconnected {
      animation: topbar-blink 1.4s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
}
