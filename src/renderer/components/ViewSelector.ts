import { ensureRendererBrandStyles } from '../../ui/renderer/rendererStyles';

/**
 * ViewSelector.ts
 * Dropdown for Table / Chart / Analyst primary views.
 */

export type PrimaryView = 'table' | 'chart' | 'analyst';

export interface ViewSelectorOption {
  id: PrimaryView;
  label: string;
  icon: string;
}

export interface ViewSelectorOptions {
  current: PrimaryView;
  available?: ViewSelectorOption[];
  onChange: (view: PrimaryView) => void;
}

export interface ViewSelectorHandle {
  element: HTMLElement;
  setCurrentView: (view: PrimaryView) => void;
}

const DEFAULT_VIEWS: ViewSelectorOption[] = [
  { id: 'table', label: 'Table', icon: '⊞' },
  { id: 'chart', label: 'Chart', icon: '◎' },
  { id: 'analyst', label: 'Analyst', icon: '⊛' },
];

export function createViewSelector(options: ViewSelectorOptions): ViewSelectorHandle {
  const { current, available = DEFAULT_VIEWS, onChange } = options;
  ensureRendererBrandStyles();

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;flex-shrink:0;';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nx-viewsel';
  btn.setAttribute('aria-haspopup', 'listbox');

  let currentId: PrimaryView = current;

  const renderBtnLabel = (id: PrimaryView) => {
    currentId = id;
    const opt = available.find((v) => v.id === id) ?? available[0];
    btn.innerHTML = '';
    const iconSpan = document.createElement('span');
    iconSpan.textContent = opt.icon;
    const labelSpan = document.createElement('span');
    labelSpan.textContent = opt.label;
    const chevronSpan = document.createElement('span');
    chevronSpan.textContent = '▾';
    chevronSpan.style.cssText = 'font-size:9px;opacity:0.6;';
    btn.appendChild(iconSpan);
    btn.appendChild(labelSpan);
    btn.appendChild(chevronSpan);
  };

  renderBtnLabel(current);

  let popover: HTMLElement | null = null;

  const closePopover = () => {
    popover?.remove();
    popover = null;
    document.removeEventListener('click', outsideClick);
  };

  const outsideClick = (e: MouseEvent) => {
    if (!wrapper.contains(e.target as Node)) closePopover();
  };

  btn.onclick = (e) => {
    e.stopPropagation();
    if (popover) {
      closePopover();
      return;
    }

    popover = document.createElement('div');
    popover.className = 'nx-viewsel__menu';
    popover.setAttribute('role', 'listbox');

    available.forEach((opt) => {
      const item = document.createElement('div');
      item.className = 'nx-viewsel__item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', opt.id === currentId ? 'true' : 'false');
      const iconSpan = document.createElement('span');
      iconSpan.textContent = opt.icon;
      const labelSpan = document.createElement('span');
      labelSpan.textContent = opt.label;
      item.appendChild(iconSpan);
      item.appendChild(labelSpan);
      if (opt.id === currentId) {
        const check = document.createElement('span');
        check.textContent = '✓';
        check.style.cssText = 'margin-left:auto;font-size:11px;opacity:0.7;';
        item.appendChild(check);
      }
      item.onclick = (ev) => {
        ev.stopPropagation();
        renderBtnLabel(opt.id);
        onChange(opt.id);
        closePopover();
      };
      popover!.appendChild(item);
    });

    wrapper.appendChild(popover);
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
  };

  wrapper.appendChild(btn);

  return {
    element: wrapper,
    setCurrentView: (view: PrimaryView) => {
      if (available.some((o) => o.id === view)) {
        renderBtnLabel(view);
      }
    },
  };
}
