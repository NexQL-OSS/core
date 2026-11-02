import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { MODERN_WEBVIEW_BASE_CSS, PANEL_BRAND_TOKENS_CSS } from '../../common/htmlStyles';

const root = path.resolve(__dirname, '../../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('Welcome walkthrough', () => {
  const walkthrough = pkg.contributes.walkthroughs.find((w: { id: string }) => w.id === 'nexqlWelcome');
  const commandIds = new Set<string>(pkg.contributes.commands.map((c: { command: string }) => c.command));
  const linkedCommands = (text: string): string[] =>
    Array.from(text.matchAll(/\(command:([^)?]+)/g)).map((m) => m[1]);

  it('is a six-stop route in order', () => {
    const titles: string[] = walkthrough.steps.map((s: { title: string }) => s.title);
    expect(titles).to.have.length(6);
    const expected = ['Connect a database', 'Open a notebook', 'Run a query', 'Explore results', 'Optional: connect an AI app via nexql-mcp', 'Database Health report'];
    expected.forEach((label, i) => expect(titles[i]).to.equal(`${i + 1}. ${label}`));
  });

  it('keeps the original command links and step ids', () => {
    const ids: string[] = walkthrough.steps.map((s: { id: string }) => s.id);
    expect(ids).to.include.members(['nexqlWelcome.addConnection', 'nexqlWelcome.openExplorer', 'nexqlWelcome.newNotebook']);
    const all = walkthrough.steps.map((s: { description: string }) => s.description).join('\n');
    expect(linkedCommands(all)).to.include.members([
      'postgres-explorer.addConnection',
      'workbench.view.extension.postgres-explorer',
      'postgres-explorer.newNotebook',
    ]);
  });

  it('only links commands that exist (extension commands) or core VS Code commands', () => {
    for (const step of walkthrough.steps) {
      for (const cmd of linkedCommands(step.description)) {
        if (cmd.startsWith('postgres-explorer.')) {
          expect(commandIds.has(cmd), `${step.id} -> ${cmd}`).to.equal(true);
        } else {
          expect(cmd, step.id).to.match(/^(workbench|notebook)\./);
        }
      }
    }
  });

  it('has a markdown file for every step', () => {
    for (const step of walkthrough.steps) {
      expect(fs.existsSync(path.join(root, step.media.markdown)), step.media.markdown).to.equal(true);
    }
  });

  it('shows an empty-tree welcome with an add-connection link', () => {
    const welcome = pkg.contributes.viewsWelcome.find((w: { view: string }) => w.view === 'postgresExplorer');
    expect(welcome.contents).to.contain('command:postgres-explorer.addConnection');
  });
});

describe('Inline panel brand tokens', () => {
  it('MODERN_WEBVIEW_BASE_CSS carries the accent and elevation tokens', () => {
    expect(MODERN_WEBVIEW_BASE_CSS).to.contain(PANEL_BRAND_TOKENS_CSS);
    expect(PANEL_BRAND_TOKENS_CSS).to.contain('--pg-brand-accent: var(--vscode-nexql-accent');
    expect(PANEL_BRAND_TOKENS_CSS).to.contain('--pg-elevation-1');
    expect(PANEL_BRAND_TOKENS_CSS).to.match(/vscode-high-contrast[\s\S]*--pg-elevation-1: none/);
  });
});
