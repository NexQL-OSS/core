import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import {
  BRAND_ACCENT,
  MODE_COLORS,
  RENDERER_ELEVATION_1,
  RENDERER_ELEVATION_2,
  RENDERER_ELEVATION_3,
  RIBBON_GRADIENT,
} from '../../ui/renderer/rendererConstants';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Design tokens', () => {
  describe('contributes.colors', () => {
    const pkg = JSON.parse(read('package.json'));
    const colors: Array<{ id: string; defaults: Record<string, string> }> = pkg.contributes.colors;
    const byId = (id: string) => colors.find((c) => c.id === id);

    it('contributes the brand accent with AA light default', () => {
      const accent = byId('nexql.accent');
      expect(accent?.defaults).to.deep.include({
        dark: '#E0A4CC',
        light: '#882D5A',
        highContrast: '#F5C2E0',
        highContrastLight: '#882D5A',
      });
      expect(byId('nexql.accentForeground')?.defaults).to.include({ dark: '#0B0E14', light: '#F8F9FC' });
    });

    it('contributes ribbon stops identical across theme kinds', () => {
      const expected: Record<string, string> = {
        blue: '#3D6FE0', indigo: '#6C4CD6', purple: '#A23BC9',
        magenta: '#E0388F', orange: '#F26B3A', amber: '#F5B23A',
      };
      for (const [name, hex] of Object.entries(expected)) {
        const d = byId(`nexql.ribbon.${name}`)?.defaults;
        expect(d, name).to.not.equal(undefined);
        expect(Object.values(d!)).to.have.members([hex, hex, hex, hex]);
      }
    });

    it('contributes mode colors', () => {
      expect(byId('nexql.mode.read')?.defaults).to.include({ dark: '#7EE8A8', light: '#0A6234' });
      expect(byId('nexql.mode.write')?.defaults).to.include({ dark: '#F26B3A', light: '#9A3412' });
      expect(byId('nexql.mode.admin')?.defaults).to.include({ dark: '#F5B23A', light: '#7A4E00' });
    });

    it('points postgres.accent at nexql.accent and keeps env colors', () => {
      const d = byId('postgres.accent')?.defaults;
      expect(Object.values(d!)).to.deep.equal(['nexql.accent', 'nexql.accent', 'nexql.accent', 'nexql.accent']);
      for (const id of ['postgres.envProd', 'postgres.envStaging', 'postgres.envDev']) {
        expect(byId(id), id).to.not.equal(undefined);
      }
    });
  });

  describe('renderer constants', () => {
    it('BRAND_ACCENT prefers nexql accent and falls back to link color', () => {
      expect(BRAND_ACCENT).to.equal('var(--vscode-nexql-accent, var(--vscode-textLink-foreground))');
    });

    it('RIBBON_GRADIENT is the 105deg six-stop ribbon', () => {
      expect(RIBBON_GRADIENT).to.match(/^linear-gradient\(105deg, /);
      for (const n of ['blue', 'indigo', 'purple', 'magenta', 'orange', 'amber']) {
        expect(RIBBON_GRADIENT).to.contain(`--vscode-nexql-ribbon-${n}`);
      }
    });

    it('MODE_COLORS expose read/write/admin via nexql vars', () => {
      expect(Object.keys(MODE_COLORS)).to.have.members(['read', 'write', 'admin']);
      expect(MODE_COLORS.read).to.contain('--vscode-nexql-mode-read');
      expect(MODE_COLORS.write).to.contain('--vscode-nexql-mode-write');
      expect(MODE_COLORS.admin).to.contain('--vscode-nexql-mode-admin');
    });

    it('elevations use only --vscode-* vars and are bevelled', () => {
      for (const e of [RENDERER_ELEVATION_1, RENDERER_ELEVATION_2, RENDERER_ELEVATION_3]) {
        expect(e).to.not.contain('--pg-');
        expect(e).to.contain('inset 1px 1px 0');
        expect(e).to.contain('inset -1px -1px 0');
      }
    });
  });

  describe('shared CSS contract', () => {
    const styles = read('templates/shared/styles.css');
    const components = read('templates/shared/components.css');

    it('defines every brand token', () => {
      for (const t of [
        '--pg-brand-accent', '--pg-brand-accent-ink', '--pg-ribbon', '--pg-ribbon-soft',
        '--pg-mode-read', '--pg-mode-write', '--pg-mode-admin',
        '--pg-elevation-1', '--pg-elevation-2', '--pg-elevation-3', '--pg-elevation-4',
        '--pg-surface-gradient', '--pg-font-display', '--pg-font-serif',
      ]) {
        expect(styles, t).to.match(new RegExp(`${t}:`));
      }
    });

    it('keeps legacy token aliases', () => {
      for (const t of ['--ui-surface', '--ui-border', '--pg-ui-surface', '--pg-ui-border', '--pg-text-muted', '--env-prod']) {
        expect(styles, t).to.match(new RegExp(`${t}:`));
      }
    });

    it('does not load remote fonts', () => {
      expect(styles).to.not.match(/googleapis|@import/);
    });

    it('strips gradients and shadows in high contrast', () => {
      expect(styles).to.match(/body\.vscode-high-contrast,\s*body\.vscode-high-contrast-light\s*\{[^}]*--pg-elevation-1: none/);
      expect(styles).to.contain('--vscode-contrastBorder');
    });

    it('defines the component classes', () => {
      for (const c of [
        'pg-ribbon', 'pg-pill', 'pg-live-dot', 'pg-mode-badge', 'pg-mode--read', 'pg-mode--write', 'pg-mode--admin',
        'pg-mono-label', 'pg-code', 'pg-copy', 'pg-route', 'pg-route-item', 'pg-route-no', 'pg-route-label', 'pg-route-meta',
        'pg-rail', 'pg-track', 'pg-track-fill', 'pg-rail-step', 'pg-stat-grid', 'pg-stat', 'pg-stat-value', 'pg-stat-label',
        'pg-insight', 'pg-steps', 'pg-step', 'pg-step-name', 'pg-step-desc', 'pg-step-time',
      ]) {
        expect(components, c).to.match(new RegExp(`\\.${c}[\\s,{:.\\[]`));
      }
      expect(components).to.contain('[aria-current=\'step\']');
      expect(components).to.contain('.pg-rail-step.is-done');
    });

    it('hero card ribbon uses the shared token and motion respects reduced-motion', () => {
      expect(components).to.match(/\.pg-hero-card::before\s*\{[^}]*background: var\(--pg-ribbon\)/);
      expect(styles).to.contain('prefers-reduced-motion');
      expect(components).to.contain('prefers-reduced-motion');
    });

    it('Settings Hub tokens alias --pg-*', () => {
      const hub = read('templates/settings-hub/styles.css');
      expect(hub).to.contain('--hub-accent: var(--pg-brand-accent)');
      expect(hub).to.contain('--hub-shadow: var(--pg-elevation-1)');
    });
  });
});
