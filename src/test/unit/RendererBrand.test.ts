import { expect } from 'chai';
import { JSDOM } from 'jsdom';
import {
  CHART_PALETTE_SOURCES,
  COST_HEAT,
  getThemeChartPalette,
  resetThemeChartPaletteCache,
} from '../../ui/renderer/rendererConstants';
import {
  RENDERER_BRAND_STYLE_ID,
  buildRendererBrandCss,
  ensureRendererBrandStyles,
} from '../../ui/renderer/rendererStyles';
import { createInlineBanner } from '../../renderer/components/InlineBanner';
import { createErrorPanel } from '../../renderer/components/ErrorPanel';
import { createTopBar } from '../../renderer/components/TopBar';
import { applyResultViewTabStyle } from '../../renderer/components/ResultToolbarUi';
import { costHeatColor } from '../../renderer/components/ExplainVisualizer';
import { ExplainRecommendationsPanel } from '../../renderer/components/ExplainRecommendationsPanel';

const RIBBON_ORDER = ['blue', 'indigo', 'magenta', 'orange', 'amber', 'purple'];

describe('Renderer brand styling', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    resetThemeChartPaletteCache();
  });

  afterEach(() => {
    resetThemeChartPaletteCache();
    dom.window.close();
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).getComputedStyle;
  });

  describe('chart palette', () => {
    it('leads with the ribbon hues in order: blue, indigo, magenta, orange, amber, purple', () => {
      const lead = CHART_PALETTE_SOURCES.slice(0, 6).map((s) => s.source);
      expect(lead).to.deep.equal(RIBBON_ORDER.map((n) => `--vscode-nexql-ribbon-${n}`));
    });

    it('resolves the nexql ribbon colors when they are defined', () => {
      const root = dom.window.document.documentElement;
      RIBBON_ORDER.forEach((n, i) => root.style.setProperty(`--vscode-nexql-ribbon-${n}`, `#00000${i + 1}`));
      const { borders, fills } = getThemeChartPalette();
      expect(borders.length).to.equal(fills.length);
      // The six ribbon hues come first, in order, resolved to concrete rgb() for Chart.js.
      expect(borders.slice(0, 6)).to.deep.equal(RIBBON_ORDER.map((_, i) => `rgb(0, 0, ${i + 1})`));
      expect(fills[0]).to.equal('rgba(0, 0, 1, 0.6)');
    });

    it('falls back to --vscode-charts-* only when the nexql variables are missing', () => {
      const { borders } = getThemeChartPalette();
      expect(borders[0]).to.contain('--vscode-charts-blue');
      expect(borders[3]).to.contain('--vscode-charts-orange');
      expect(borders[4]).to.contain('--vscode-charts-yellow');
    });

    it('falls back per color, not all or nothing', () => {
      dom.window.document.documentElement.style.setProperty('--vscode-nexql-ribbon-blue', '#112233');
      const { borders } = getThemeChartPalette();
      expect(borders[0]).to.equal('rgb(17, 34, 51)');
      expect(borders[1]).to.contain('--vscode-charts-');
    });
  });

  describe('stylesheet', () => {
    const css = buildRendererBrandCss();

    it('injects once', () => {
      ensureRendererBrandStyles();
      ensureRendererBrandStyles();
      expect(dom.window.document.querySelectorAll(`#${RENDERER_BRAND_STYLE_ID}`)).to.have.length(1);
    });

    it('never reads --pg-* tokens (not available in the renderer sandbox)', () => {
      expect(css).to.not.contain('--pg-');
    });

    it('draws a 2px ribbon on the result container', () => {
      expect(css).to.match(/\.nx-result::before\s*\{[^}]*height: 2px;[^}]*linear-gradient\(105deg/);
    });

    it('has high-contrast overrides without gradients or shadows', () => {
      for (const kind of ['vscode-high-contrast', 'vscode-high-contrast-light']) {
        expect(css).to.contain(`body.${kind} .nx-result::before`);
      }
      const hcBlock = /body\.vscode-high-contrast \.nx-result::before[^{]*\{([^}]*)\}/.exec(css)![1];
      expect(hcBlock).to.contain('--vscode-contrastBorder');
      expect(hcBlock).to.not.contain('gradient');
      expect(css).to.match(/body\.vscode-high-contrast \.nx-result,[^{]*\{[^}]*box-shadow: none/);
    });

    it('respects prefers-reduced-motion', () => {
      expect(css).to.contain('@media (prefers-reduced-motion: reduce)');
      expect(css).to.match(/prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
    });
  });

  describe('components', () => {
    it('banners map severity to a left-edge accent modifier', () => {
      const cases: Array<['info' | 'warning' | 'error' | 'success', string]> = [
        ['info', 'nx-banner--info'],
        ['warning', 'nx-banner--warn'],
        ['error', 'nx-banner--error'],
        ['success', 'nx-banner--success'],
      ];
      for (const [severity, cls] of cases) {
        const el = createInlineBanner({ severity, message: 'm' });
        expect(el.classList.contains('nx-banner'), severity).to.equal(true);
        expect(el.classList.contains(cls), severity).to.equal(true);
      }
    });

    it('error panel is an error banner and keeps its three actions', () => {
      const el = createErrorPanel({
        errorMessage: 'boom',
        onExplainError: () => {},
        onFixWithAI: () => {},
        onRetry: () => {},
      });
      expect(el.classList.contains('nx-banner--error')).to.equal(true);
      expect(el.querySelectorAll('button')).to.have.length(3);
    });

    it('top bar shows a mode-colored chip for read-only and write sessions', () => {
      const make = (readOnlyMode: boolean) =>
        createTopBar(
          {
            connectionName: 'c',
            host: 'h',
            database: 'd',
            isConnected: true,
            readOnlyMode,
            environment: 'production',
            onRunAll: () => {},
            onClearOutputs: () => {},
            onAddCodeCell: () => {},
            onAddMarkdownCell: () => {},
          },
          () => {},
        );
      const ro = make(true).querySelector('[data-session-mode]') as HTMLElement;
      const rw = make(false).querySelector('[data-session-mode]') as HTMLElement;
      expect(ro.dataset.sessionMode).to.equal('read');
      expect(ro.classList.contains('nx-chip--read')).to.equal(true);
      expect(rw.dataset.sessionMode).to.equal('write');
      expect(rw.classList.contains('nx-chip--write')).to.equal(true);
    });

    it('active view tab carries the accent underline hook, inactive does not', () => {
      const a = document.createElement('button');
      const b = document.createElement('button');
      applyResultViewTabStyle(a, true);
      applyResultViewTabStyle(b, false);
      expect(a.dataset.pgTabActive).to.equal('1');
      expect(b.dataset.pgTabActive).to.equal('0');
      expect(buildRendererBrandCss()).to.match(
        /\.nx-tab\[data-pg-tab-active="1"\]\s*\{[^}]*border-bottom-color: var\(--vscode-nexql-accent/,
      );
    });

    it('explain heat ramps from cool blue to magenta', () => {
      expect(costHeatColor(2)).to.equal(COST_HEAT.cool);
      expect(costHeatColor(20)).to.contain(COST_HEAT.amber);
      expect(costHeatColor(100)).to.contain(COST_HEAT.magenta);
    });

    it('recommendations render as severity insight callouts', () => {
      const host = document.createElement('div');
      new ExplainRecommendationsPanel(host).render([
        {
          severity: 'critical',
          category: 'index',
          title: 'Add index',
          description: 'd',
          suggestion: 'CREATE INDEX x ON t(c);',
          estimatedImprovement: '10x',
        } as any,
      ]);
      expect(host.querySelector('.nx-insight--critical')).to.not.equal(null);
    });
  });
});
