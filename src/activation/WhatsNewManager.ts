
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { readSharedTemplateCss } from '../lib/template-loader';

/** Internal id for {@link vscode.window.createWebviewPanel} (not a sidebar view). */
const WHATS_NEW_PANEL_VIEW_TYPE = 'postgresExplorer.whatsNew';

export class WhatsNewManager {
  private static readonly globalStateKey = 'postgres-explorer.lastRunVersion';

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri
  ) { }

  public async checkAndShow(manual: boolean = false): Promise<void> {
    const currentVersion = this.context.extension.packageJSON.version;
    const lastRunVersion = this.context.globalState.get<string>(WhatsNewManager.globalStateKey);

    if (manual || currentVersion !== lastRunVersion) {
      await this.showWhatsNew(currentVersion);
      await this.context.globalState.update(WhatsNewManager.globalStateKey, currentVersion);
    }
  }

  private async showWhatsNew(version: string): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    const panel = vscode.window.createWebviewPanel(
      WHATS_NEW_PANEL_VIEW_TYPE,
      `What's New in NexQL ${version}`,
      column,
      {
        enableScripts: true,
        enableCommandUris: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'resources'),
          vscode.Uri.joinPath(this.extensionUri, 'out')
        ]
      }
    );

    panel.webview.html = await this.getWebviewContent(panel.webview, version);

    const messageSub = panel.webview.onDidReceiveMessage(async (message: { type?: string; command?: string; url?: string }) => {
      if (message?.type === 'openWalkthrough') {
        await vscode.commands.executeCommand(
          'workbench.action.openWalkthrough',
          `${this.context.extension.id}#nexqlWelcome`,
          false
        );
        return;
      }
      if (message?.type === 'openExternal' && typeof message.url === 'string') {
        try {
          await vscode.env.openExternal(vscode.Uri.parse(message.url));
        } catch (err) {
          console.warn('[NexQL WhatsNew] openExternal failed', err);
        }
        return;
      }
      if (message?.type !== 'runCommand' || typeof message.command !== 'string') {
        return;
      }
      if (!message.command.startsWith('postgres-explorer.')) {
        return;
      }
      await vscode.commands.executeCommand(message.command);
    });
    panel.onDidDispose(() => messageSub.dispose());
  }

  private getCommunityLinks(): { issues: string; website: string; repository: string; discussions: string } {
    const pkg = this.context.extension.packageJSON as {
      bugs?: { url?: string };
      homepage?: string;
      repository?: { url?: string } | string;
    };
    const issues = pkg.bugs?.url ?? 'https://github.com/dev-asterix/NexQL/issues';
    const website = pkg.homepage ?? 'https://nexql.astrx.dev/';
    let repoBase = 'https://github.com/dev-asterix/NexQL';
    const repo = pkg.repository;
    if (typeof repo === 'object' && repo?.url) {
      repoBase = repo.url.replace(/\.git$/i, '');
    } else if (typeof repo === 'string') {
      repoBase = repo.replace(/\.git$/i, '');
    }
    return {
      issues,
      website,
      repository: repoBase,
      discussions: `${repoBase}/discussions`,
    };
  }

  private async getWebviewContent(webview: vscode.Webview, version: string): Promise<string> {
    const changelogContent = await this.getChangelogContent();
    const links = this.getCommunityLinks();
    const sharedCss = await readSharedTemplateCss(this.extensionUri);
    const logoPath = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'postgres-explorer.png'));
    const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'marked.min.js'));
    const highlightScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'highlight.min.js'));
    const highlightCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'resources', 'highlight.css'));

    const encodedChangelog = Buffer.from(changelogContent).toString('base64');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>What's New in NexQL</title>
        <link rel="stylesheet" href="${highlightCssUri}">
        <script src="${markedUri}"></script>
        <script src="${highlightScriptUri}"></script>
        <style>
          ${sharedCss}

          /* ── What's New: a brand screen (display + serif faces, ribbon wash, higher elevation allowed) ── */
          /* Editor font + system/emoji fonts so changelog Unicode and emoji render reliably (GFM is default in marked). */
          body {
            font-family: var(--vscode-font-family), system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif,
              "Segoe UI Emoji", "Segoe UI Symbol", "Apple Color Emoji", "Noto Color Emoji", emoji;
            margin: 0;
            padding: 24px 20px 56px;
            line-height: 1.6;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            font-size: 13px;
          }
          .page { max-width: 820px; margin: 0 auto; }

          .hero {
            position: relative;
            overflow: hidden;
            border: 1px solid var(--pg-ui-border);
            border-radius: var(--pg-radius-lg);
            background-color: var(--pg-ui-surface-raised);
            box-shadow: var(--pg-elevation-3);
            padding: 0 28px 26px;
          }
          .hero .pg-ribbon { border-radius: 0; margin: 0 -28px 22px; width: auto; }
          .hero-top {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 18px;
          }
          .logo { width: 36px; height: 36px; flex-shrink: 0; border-radius: 8px; }
          .hero-top .pg-pill { font-family: var(--pg-font-mono); letter-spacing: 0.04em; }
          .header-actions {
            display: flex;
            align-items: center;
            gap: 2px;
            margin-left: auto;
          }
          .hero h1 {
            margin: 0 0 10px;
            font-size: clamp(30px, 6vw, 44px);
            line-height: 1.08;
            font-weight: 600;
            color: var(--vscode-foreground);
            border: none;
            padding: 0;
          }
          .hero h1 .pg-serif {
            font-style: italic;
            font-size: 1.12em;
            color: var(--pg-brand-accent);
          }
          .hero-lede {
            margin: 0 0 18px;
            max-width: 52ch;
            font-size: 14px;
            color: var(--pg-text-muted);
          }
          .hero-actions { display: flex; flex-wrap: wrap; gap: 8px; }
          .hero-actions .pg-btn { text-decoration: none; cursor: pointer; }

          .icon-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            color: var(--vscode-icon-foreground, var(--vscode-foreground));
            background: transparent;
            border: none;
            cursor: pointer;
            text-decoration: none;
            opacity: 0.9;
          }
          .icon-btn:hover {
            background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2));
            opacity: 1;
          }
          .icon-btn:focus-visible, .pg-btn:focus-visible, .release > summary:focus-visible {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: 1px;
          }
          .icon-btn svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.75;
            stroke-linecap: round;
            stroke-linejoin: round;
          }

          /* ── Release notes: one block per version, one card per heading ── */
          .notes-label { margin: 34px 0 12px; }
          .release { margin: 0 0 14px; }
          .release > summary {
            list-style: none;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 2px;
            cursor: pointer;
            font-family: var(--pg-font-display);
            font-size: 20px;
            font-weight: 600;
            letter-spacing: -0.01em;
            color: var(--vscode-foreground);
          }
          .release > summary::-webkit-details-marker { display: none; }
          .release > summary::before {
            content: '';
            width: 7px;
            height: 7px;
            border-right: 2px solid var(--pg-text-muted);
            border-bottom: 2px solid var(--pg-text-muted);
            transform: rotate(-45deg);
            transition: transform 0.15s ease;
            flex-shrink: 0;
          }
          .release[open] > summary::before { transform: rotate(45deg); }
          .release > summary .pg-pill { font-family: var(--pg-font-mono); font-size: 10.5px; }
          .release-body { display: grid; gap: 12px; padding-top: 6px; }
          .release:not([open]) > summary { font-size: 16px; font-weight: 500; color: var(--pg-text-muted); }

          .release-body .pg-card { margin: 0; box-shadow: var(--pg-elevation-1); }
          .release-body .pg-card-header { padding: 10px 16px; }
          .release-body .pg-card-title { font-size: 13px; }
          .release-body .pg-card-body { display: block; padding: 12px 16px; }
          .release-body .pg-card-body > :first-child { margin-top: 0; }
          .release-body .pg-card-body > :last-child { margin-bottom: 0; }

          .content a { color: var(--pg-brand-accent); text-decoration: none; }
          .content a:hover { text-decoration: underline; }
          .content code {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textBlockQuote-background);
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 0.95em;
          }
          .content pre {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 1rem;
            overflow-x: auto;
            border-radius: 4px;
          }
          .content pre code { background-color: transparent; padding: 0; }
          .content blockquote {
            border-left: 3px solid var(--pg-brand-accent);
            margin: 0 0 8px;
            padding: 2px 0 2px 12px;
            color: var(--vscode-descriptionForeground);
          }
          .content ul, .content ol { padding-left: 1.4rem; margin: 0; }
          .content li { margin-bottom: 0.5rem; }
          .content li:last-child { margin-bottom: 0; }
          .content p { margin: 0 0 8px; }
          .content li.task-list-item,
          .content li:has(> input[type="checkbox"]:first-child) {
            list-style-type: none;
            margin-left: -1.25rem;
          }
          .content input[type="checkbox"] {
            margin-right: 0.5rem;
            vertical-align: middle;
            pointer-events: none;
            accent-color: var(--pg-brand-accent);
          }
          .content hr { border: none; border-top: 1px solid var(--pg-ui-border); margin: 1.5rem 0; }
          .content table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.95em; }
          .content th, .content td { border: 1px solid var(--pg-ui-border); padding: 0.45rem 0.65rem; text-align: left; }
          .content thead th {
            background-color: var(--vscode-editor-lineHighlightBackground, var(--vscode-textBlockQuote-background));
            font-weight: 600;
          }
          .content img { max-width: 100%; height: auto; vertical-align: middle; }
          .content del { opacity: 0.9; }
          /* Theme-aware code blocks: base from VS Code; highlight.js classes keep token contrast. */
          .content pre code.hljs {
            background: transparent !important;
            color: var(--vscode-editor-foreground) !important;
          }
          .content pre:has(> code.hljs) {
            background-color: var(--vscode-textBlockQuote-background);
            border: 1px solid var(--pg-ui-border);
          }
          .content .hljs-comment,
          .content .hljs-quote { color: var(--vscode-descriptionForeground) !important; }
          .content .hljs-keyword,
          .content .hljs-selector-tag,
          .content .hljs-meta .hljs-keyword { color: var(--vscode-symbolIcon-keywordForeground, #569cd6) !important; }
          .content .hljs-string,
          .content .hljs-meta .hljs-string { color: var(--vscode-symbolIcon-stringForeground, #ce9178) !important; }
          .content .hljs-number,
          .content .hljs-literal { color: var(--vscode-symbolIcon-numberForeground, #b5cea8) !important; }
          .content .hljs-title,
          .content .hljs-section { color: var(--vscode-symbolIcon-methodForeground, #dcdcaa) !important; }
          .content .hljs-built_in,
          .content .hljs-type { color: var(--vscode-symbolIcon-classForeground, #4ec9b0) !important; }

          body.vscode-high-contrast .hero,
          body.vscode-high-contrast-light .hero { border-color: var(--vscode-contrastBorder, currentColor); }
          body.vscode-high-contrast .content a,
          body.vscode-high-contrast-light .content a { text-decoration: underline; }
        </style>
      </head>
      <body>
        <div class="page">
          <header class="hero pg-brand-wash">
            <span class="pg-ribbon" aria-hidden="true"></span>
            <div class="hero-top">
              <img src="${logoPath}" alt="" class="logo">
              <span class="pg-pill pg-pill--accent"><span class="pg-live-dot"></span>v${version}</span>
              <nav class="header-actions" aria-label="Community links">
                <a href="#" class="icon-btn" data-external-href="https://nexql-themes.astrx.dev" title="NexQL Themes" aria-label="NexQL Themes">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 14.7255 3.09032 17.1962 4.85857 19C5.03442 19.1788 5.25367 19.317 5.4988 19.4045C5.74393 19.4921 6.00624 19.526 6.265 19.504C6.776 19.46 7.18 19.056 7.224 18.545C7.262 18.096 7.643 17.75 8.1 17.75H9.5C10.88 17.75 12 16.63 12 15.25V14.5C12 13.95 12.45 13.5 13 13.5H16.5C18.43 13.5 20 11.93 20 10C20 8.07 18.43 6.5 16.5 6.5H15.5C14.12 6.5 13 5.38 13 4V3C13 2.45 12.55 2 12 2"/>
                    <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor"/>
                    <circle cx="11.5" cy="7.5" r="1.5" fill="currentColor"/>
                    <circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"/>
                  </svg>
                </a>
                <a href="#" class="icon-btn" data-external-href="${links.issues}" title="GitHub Issues" aria-label="GitHub Issues">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 20v-9"/>
                    <path d="M8 20v-5"/>
                    <path d="M16 20v-5"/>
                    <path d="M12 4V3"/>
                    <path d="M8 4l-1 1"/>
                    <path d="M16 4l1 1"/>
                    <path d="M9 11H5"/>
                    <path d="M19 11h-4"/>
                    <ellipse cx="12" cy="11" rx="5" ry="6"/>
                  </svg>
                </a>
                <a href="#" class="icon-btn" data-external-href="${links.website}" title="Website" aria-label="Website">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M2 12h20"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                </a>
                <a href="#" class="icon-btn" data-external-href="${links.discussions}" title="GitHub Discussions" aria-label="GitHub Discussions">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                  </svg>
                </a>
              </nav>
            </div>
            <h1 class="pg-display">What's <span class="pg-serif">new</span> in NexQL</h1>
            <p class="hero-lede">Thanks for using NexQL. Here is what changed, newest first.</p>
            <div class="hero-actions">
              <button type="button" class="pg-btn pg-btn--primary" data-walkthrough>Take the quick route</button>
              <button type="button" class="pg-btn pg-btn--secondary" data-external-href="https://nexql-mcp.astrx.dev">About nexql-mcp</button>
            </div>
          </header>

          <p class="pg-mono-label notes-label">Release notes</p>
          <div id="markdown-content" class="content"></div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const rawContent = "${encodedChangelog}";
          /** atob() yields one char per byte; markdown is UTF-8 — must decode bytes to Unicode or em dashes etc. become mojibake (â). */
          function base64ToUtf8(b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
          }
          const decodedContent = base64ToUtf8(rawContent);
          const parseOpts = { async: false, breaks: true, gfm: true };
          const target = document.getElementById('markdown-content');

          /** Regroup the flat markdown: each "##" becomes a collapsible release, each "###" a card. */
          function buildReleases(html) {
            // DOMParser keeps the intro's badge image (dropped below) from being fetched.
            const src = new DOMParser().parseFromString(html, 'text/html').body;
            const out = document.createDocumentFragment();
            let release = null;
            let body = null;
            let cardBody = null;
            let seen = 0;

            function startCard(title) {
              const card = document.createElement('section');
              card.className = 'pg-card';
              if (title) {
                const head = document.createElement('div');
                head.className = 'pg-card-header';
                const h = document.createElement('h3');
                h.className = 'pg-card-title';
                h.textContent = title;
                head.appendChild(h);
                card.appendChild(head);
              }
              cardBody = document.createElement('div');
              cardBody.className = 'pg-card-body';
              card.appendChild(cardBody);
              body.appendChild(card);
            }

            Array.from(src.childNodes).forEach(function (node) {
              const tag = node.nodeType === 1 ? node.tagName : '';
              if (tag === 'H2') {
                release = document.createElement('details');
                release.className = 'release';
                if (seen === 0) release.open = true;
                seen++;
                const sum = document.createElement('summary');
                const text = (node.textContent || '').trim();
                const m = text.match(/^\\[?([^\\]]*)\\]?\\s*(?:[-–—]\\s*(.*))?$/);
                const name = document.createElement('span');
                name.textContent = m && m[1] ? m[1] : text;
                sum.appendChild(name);
                if (m && m[2]) {
                  const date = document.createElement('span');
                  date.className = 'pg-pill';
                  date.textContent = m[2];
                  sum.appendChild(date);
                }
                release.appendChild(sum);
                body = document.createElement('div');
                body.className = 'release-body';
                release.appendChild(body);
                out.appendChild(release);
                cardBody = null;
                return;
              }
              if (!release) return; // intro (badges, quick links) is replaced by the hero
              if (tag === 'H3') {
                startCard((node.textContent || '').trim());
                return;
              }
              if (tag === 'HR') return;
              if (node.nodeType !== 1) return; // whitespace between blocks
              if (!cardBody) startCard('');
              cardBody.appendChild(document.importNode(node, true));
            });
            return out;
          }

          target.appendChild(buildReleases(marked.parse(decodedContent, parseOpts)));
          document.querySelectorAll('#markdown-content a[href^="http"]').forEach(function (anchor) {
            const url = anchor.getAttribute('href');
            if (!url) return;
            anchor.setAttribute('data-external-href', url);
            anchor.setAttribute('href', '#');
          });
          if (typeof hljs !== 'undefined' && typeof hljs.highlightElement === 'function') {
            document.querySelectorAll('#markdown-content pre code').forEach(function (block) {
              try {
                hljs.highlightElement(block);
              } catch (e) {
                console.warn('[NexQL WhatsNew] code highlight skipped', e);
              }
            });
          }

          /** Resolve command id from href; packaged webviews may resolve command: as relative to a repo base URL. */
          function commandIdFromHref(href) {
            if (!href) return null;
            const i = href.indexOf('command:');
            if (i < 0) return null;
            let id = href.slice(i + 'command:'.length).split(/[?#]/)[0];
            id = decodeURIComponent(id);
            return id || null;
          }

          function isExternalHttp(href) {
            return typeof href === 'string' && /^https?:\\/\\//i.test(href);
          }

          document.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest && e.target.closest('button');
            if (btn) {
              if (btn.hasAttribute('data-walkthrough')) {
                vscode.postMessage({ type: 'openWalkthrough' });
              } else if (btn.getAttribute('data-external-href')) {
                vscode.postMessage({ type: 'openExternal', url: btn.getAttribute('data-external-href') });
              } else if (btn.getAttribute('data-command')) {
                vscode.postMessage({ type: 'runCommand', command: btn.getAttribute('data-command') });
              }
              return;
            }
            const a = e.target && e.target.closest && e.target.closest('a');
            if (!a) return;
            const externalUrl = a.getAttribute('data-external-href');
            if (externalUrl) {
              e.preventDefault();
              e.stopPropagation();
              vscode.postMessage({ type: 'openExternal', url: externalUrl });
              return;
            }
            const href = a.getAttribute('href');
            const command = commandIdFromHref(href);
            if (command && command.startsWith('postgres-explorer.')) {
              e.preventDefault();
              e.stopPropagation();
              vscode.postMessage({ type: 'runCommand', command });
              return;
            }
            if (isExternalHttp(href)) {
              e.preventDefault();
              e.stopPropagation();
              vscode.postMessage({ type: 'openExternal', url: href });
            }
          }, true);
        </script>
      </body>
      </html>
    `;
  }

  private async getChangelogContent(): Promise<string> {
    const variants = ['CHANGELOG.md', 'changelog.md', 'Changelog.md'];

    for (const variant of variants) {
      try {
        const changelogPath = path.join(this.extensionUri.fsPath, variant);
        return await fs.promises.readFile(changelogPath, 'utf8');
      } catch {
        // Try next variant
      }
    }

    let files: string[] = [];
    try {
      files = await fs.promises.readdir(this.extensionUri.fsPath);
    } catch {
      files = ['(unable to list directory)'];
    }

    return `# Error\nUnable to load CHANGELOG.md\n\nExtension path: \`${this.extensionUri.fsPath}\`\n\nFiles in extension root:\n${files.map(f => `- ${f}`).join('\n')}`;
  }
}
