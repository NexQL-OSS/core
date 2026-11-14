/**
 * Database Health dashboard HTML.
 *
 * Pure: a view model goes in, a complete HTML document comes out. No VS Code API is touched, so
 * the output can be unit tested and rendered in the design-system demo. All interactivity is
 * delegated to a small script that posts `refresh`, `openNotebook` and `copy` messages.
 */
import { BarItem, HealthFinding, HealthLevel, HealthSection, HealthTile, HealthViewModel } from './healthModel';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Status words and glyphs: colour is never the only cue (high-contrast themes, colour blindness). */
const LEVEL_TEXT: Record<HealthLevel, { word: string; glyph: string }> = {
  ok: { word: 'Healthy', glyph: '✓' },
  watch: { word: 'Watch', glyph: '!' },
  act: { word: 'Act now', glyph: '✕' },
  unknown: { word: 'Unknown', glyph: '–' },
};

const OVERALL_TEXT: Record<HealthLevel, string> = {
  ok: 'Healthy: nothing needs attention',
  watch: 'A few things are worth a look',
  act: 'Needs attention now',
  unknown: 'Not enough data to judge',
};

function chip(level: HealthLevel, text?: string): string {
  const t = LEVEL_TEXT[level];
  return `<span class="chip lvl-${level}"><span class="glyph" aria-hidden="true">${t.glyph}</span>${escapeHtml(text ?? t.word)}</span>`;
}

function renderTile(t: HealthTile): string {
  const gauge =
    t.gauge === undefined
      ? ''
      : `<div class="gauge" role="img" aria-label="${escapeHtml(t.label)} ${escapeHtml(t.value)}"><div class="gauge-fill lvl-${t.level}" style="width:${t.gauge.toFixed(1)}%"></div></div>`;
  return `<div class="tile lvl-${t.level}-edge">
  <div class="tile-label">${escapeHtml(t.label)}</div>
  <div class="tile-value">${escapeHtml(t.value)}</div>
  ${gauge}
  <div class="tile-sub">${escapeHtml(t.sub)}</div>
  ${t.level === 'unknown' ? '' : `<div class="tile-status">${chip(t.level)}</div>`}
</div>`;
}

function renderFinding(f: HealthFinding): string {
  return `<li class="finding lvl-${f.level}-edge">
  ${chip(f.level)}
  <div class="finding-body"><div class="finding-title">${escapeHtml(f.title)}</div><div class="finding-action">${escapeHtml(f.action)}</div></div>
  <a class="jump" href="#sec-${f.section}" data-jump="${f.section}">Details</a>
</li>`;
}

function renderBar(item: BarItem): string {
  const copy = item.copy
    ? `<button class="copy" type="button" data-copy="${escapeHtml(item.copy)}" title="Copy SQL" aria-label="Copy SQL for ${escapeHtml(item.label)}">Copy SQL</button>`
    : '';
  return `<li class="bar-row">
  <div class="bar-text">
    <div class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
    ${item.sublabel ? `<div class="bar-sub">${escapeHtml(item.sublabel)}</div>` : ''}
  </div>
  <div class="bar-track"><div class="bar-fill lvl-${item.level}" style="width:${Math.max(item.pct, 2).toFixed(1)}%"></div></div>
  <div class="bar-value">${escapeHtml(item.value)}</div>
  ${copy}
</li>`;
}

function renderSection(sec: HealthSection, vm: HealthViewModel): string {
  let body: string;
  if (sec.error) {
    body = `<p class="note lvl-unknown-edge">Could not load this check: ${escapeHtml(sec.error)}</p>`;
  } else if (sec.key === 'locks' && vm.blocked.length > 0) {
    body = vm.blocked
      .map(
        b => `<div class="lock-card">
  <div class="lock-side"><div class="lock-role">Blocked</div><div class="lock-meta">pid ${escapeHtml(b.blockedPid)}, waiting ${escapeHtml(b.blockedFor)} for ${escapeHtml(b.waitingOn)}</div><pre>${escapeHtml(b.blockedQuery)}</pre></div>
  <div class="lock-arrow" aria-hidden="true">←</div>
  <div class="lock-side"><div class="lock-role">Blocking</div><div class="lock-meta">pid ${escapeHtml(b.blockingPid)}, ${escapeHtml(b.blockingState)}, open ${escapeHtml(b.blockingAge)}</div><pre>${escapeHtml(b.blockingQuery)}</pre>
    <button class="copy" type="button" data-copy="${escapeHtml(`SELECT pg_cancel_backend(${b.blockingPid});`)}">Copy cancel SQL</button></div>
</div>`
      )
      .join('\n');
  } else if (sec.items.length === 0) {
    body = `<p class="note">${escapeHtml(sec.empty)}</p>`;
  } else {
    body = `<ul class="bars">${sec.items.map(renderBar).join('\n')}</ul>`;
  }
  const more = sec.more > 0 ? `<p class="more">And ${sec.more} more. Open as notebook to see all rows.</p>` : '';
  const guidance = sec.guidance.length
    ? `<details class="guidance"><summary>How to read this</summary><ul>${sec.guidance.map(g => `<li>${escapeHtml(g)}</li>`).join('')}</ul></details>`
    : '';
  // Sections that need action start open; healthy ones start collapsed to keep the page short.
  const open = sec.level === 'act' || sec.level === 'watch' || sec.error ? ' open' : '';
  return `<details class="card" id="sec-${sec.key}"${open}>
  <summary><span class="card-title">${escapeHtml(sec.title)}</span><span class="card-headline">${escapeHtml(sec.headline)}</span>${chip(sec.level)}</summary>
  <div class="card-body">${body}${more}${guidance}</div>
</details>`;
}

const CSS = `
:root {
  --ok: var(--vscode-testing-iconPassed, #3fb27f);
  --watch: var(--vscode-editorWarning-foreground, #cca700);
  --act: var(--vscode-editorError-foreground, #f14c4c);
  --unknown: var(--vscode-descriptionForeground, #8b8b8b);
  --surface: var(--vscode-sideBar-background, var(--vscode-editor-background));
  --line: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.35)));
  --mono: var(--vscode-editor-font-family, ui-monospace, Menlo, Consolas, monospace);
}
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; padding: 0 0 32px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family); font-size: var(--vscode-font-size, 13px); line-height: 1.5; }
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 20px; }
header { border-top: 2px solid var(--pg-brand-accent); border-bottom: 1px solid var(--line); background: var(--surface); padding: 14px 0; }
header .wrap { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: center; justify-content: space-between; }
h1 { margin: 0; font-size: 1.25em; font-weight: 600; }
.sub { opacity: .7; font-size: .9em; margin-top: 2px; }
.actions { display: flex; gap: 8px; }
button, .linkbtn { font: inherit; cursor: pointer; border-radius: 4px; padding: 4px 12px; border: 1px solid var(--line);
  background: transparent; color: inherit; }
button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
button:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.15)); }
button.primary:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible, summary:focus-visible, a:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
.verdict { display: flex; align-items: center; gap: 12px; margin: 20px 0 16px; padding: 14px 16px; border: 1px solid var(--line);
  border-left-width: 4px; border-radius: 6px; background: var(--surface); font-size: 1.1em; font-weight: 600; }
.chip { display: inline-flex; align-items: center; gap: 5px; padding: 1px 9px; border-radius: 999px; border: 1px solid currentColor;
  font-size: .82em; font-weight: 600; white-space: nowrap; }
.chip .glyph { font-weight: 700; }
.lvl-ok { color: var(--ok); } .lvl-watch { color: var(--watch); } .lvl-act { color: var(--act); } .lvl-unknown { color: var(--unknown); }
.lvl-ok-edge { border-left: 3px solid var(--ok); } .lvl-watch-edge { border-left: 3px solid var(--watch); }
.lvl-act-edge { border-left: 3px solid var(--act); } .lvl-unknown-edge { border-left: 3px solid var(--unknown); }
.verdict.lvl-ok { border-left-color: var(--ok); } .verdict.lvl-watch { border-left-color: var(--watch); }
.verdict.lvl-act { border-left-color: var(--act); } .verdict.lvl-unknown { border-left-color: var(--unknown); }
.verdict .word { color: var(--vscode-editor-foreground); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
.tile { padding: 12px 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); display: flex; flex-direction: column; gap: 4px; }
.tile-label { font-size: .8em; text-transform: uppercase; letter-spacing: .05em; opacity: .7; }
.tile-value { font-size: 1.7em; font-weight: 600; line-height: 1.15; font-variant-numeric: tabular-nums; }
.tile-sub { font-size: .85em; opacity: .75; min-height: 1.3em; }
.tile-status { margin-top: 2px; }
.gauge { height: 6px; border-radius: 3px; background: color-mix(in srgb, currentColor 14%, transparent); overflow: hidden; }
.gauge-fill, .bar-fill { height: 100%; border-radius: 3px; background: currentColor; }
h2 { font-size: .85em; text-transform: uppercase; letter-spacing: .06em; opacity: .75; margin: 28px 0 10px; font-weight: 600; }
.findings { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.finding { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
.finding-body { flex: 1; min-width: 0; }
.finding-title { font-weight: 600; }
.finding-action { opacity: .8; font-size: .92em; }
.jump { color: var(--vscode-textLink-foreground); text-decoration: none; font-size: .9em; white-space: nowrap; }
.jump:hover { text-decoration: underline; }
.allclear { padding: 12px 14px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); opacity: .85; }
.card { border: 1px solid var(--line); border-radius: 6px; background: var(--surface); margin-bottom: 10px; }
.card > summary { display: flex; align-items: center; gap: 12px; padding: 10px 14px; cursor: pointer; list-style: none; }
.card > summary::-webkit-details-marker { display: none; }
.card > summary::before { content: '▸'; opacity: .6; width: 1em; }
.card[open] > summary::before { content: '▾'; }
.card-title { font-weight: 600; }
.card-headline { flex: 1; opacity: .75; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-body { padding: 4px 14px 14px; border-top: 1px solid var(--line); }
.bars { list-style: none; margin: 8px 0 0; padding: 0; }
.bar-row { display: grid; grid-template-columns: minmax(140px, 1.4fr) minmax(80px, 1fr) 84px auto; gap: 12px; align-items: center; padding: 6px 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 50%, transparent); }
.bar-row:last-child { border-bottom: none; }
.bar-label { font-family: var(--mono); font-size: .92em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-sub { font-size: .8em; opacity: .65; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--unknown) 18%, transparent); overflow: hidden; }
.bar-fill.lvl-ok { color: var(--ok); } .bar-fill.lvl-watch { color: var(--watch); } .bar-fill.lvl-act { color: var(--act); }
.bar-value { text-align: right; font-variant-numeric: tabular-nums; font-family: var(--mono); font-size: .9em; }
.copy { font-size: .8em; padding: 1px 8px; }
.note { margin: 12px 0 0; padding: 8px 12px; border-radius: 4px; background: color-mix(in srgb, var(--unknown) 12%, transparent); }
.more { margin: 8px 0 0; opacity: .65; font-size: .88em; }
.guidance { margin-top: 12px; }
.guidance summary { cursor: pointer; opacity: .75; font-size: .9em; }
.guidance ul { margin: 6px 0 0; padding-left: 20px; opacity: .85; }
.lock-card { display: grid; grid-template-columns: 1fr auto 1fr; gap: 12px; align-items: start; margin-top: 10px; padding: 10px; border: 1px solid var(--line); border-radius: 6px; }
.lock-role { font-weight: 600; } .lock-meta { font-size: .85em; opacity: .75; }
.lock-arrow { align-self: center; opacity: .6; font-size: 1.3em; }
pre { margin: 6px 0; padding: 8px; max-height: 120px; overflow: auto; font-family: var(--mono); font-size: .85em; white-space: pre-wrap; word-break: break-word; background: var(--vscode-textCodeBlock-background, rgba(128,128,128,.12)); border-radius: 4px; }
footer { margin-top: 24px; opacity: .55; font-size: .85em; }
body.vscode-high-contrast .tile, body.vscode-high-contrast .card, body.vscode-high-contrast .finding, body.vscode-high-contrast .verdict { border-color: var(--vscode-contrastBorder, currentColor); }
@media (max-width: 640px) {
  .bar-row { grid-template-columns: 1fr 70px; } .bar-track { grid-column: 1 / -1; order: 3; } .bar-row .copy { grid-column: 1 / -1; justify-self: start; }
  .lock-card { grid-template-columns: 1fr; } .lock-arrow { display: none; }
}
@media (prefers-reduced-motion: no-preference) { .gauge-fill, .bar-fill { transition: width .35s ease; } }
`;

const SCRIPT = `
const vscode = acquireVsCodeApi();
document.addEventListener('click', (e) => {
  const el = e.target instanceof Element ? e.target.closest('[data-action],[data-copy],[data-jump]') : null;
  if (!el) { return; }
  if (el.hasAttribute('data-action')) { vscode.postMessage({ type: el.getAttribute('data-action') }); }
  else if (el.hasAttribute('data-copy')) {
    vscode.postMessage({ type: 'copy', text: el.getAttribute('data-copy') });
    const old = el.textContent; el.textContent = 'Copied'; setTimeout(() => { el.textContent = old; }, 1200);
  } else if (el.hasAttribute('data-jump')) {
    e.preventDefault();
    const t = document.getElementById('sec-' + el.getAttribute('data-jump'));
    if (t) { t.open = true; t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
});
`;

export interface RenderOptions {
  nonce: string;
  cspSource: string;
  /** CSS for the brand tokens (PANEL_BRAND_TOKENS_CSS), injected so this module stays free of other imports. */
  brandCss?: string;
}

export function renderHealthHtml(vm: HealthViewModel, opts: RenderOptions): string {
  const when = vm.generatedAt.toLocaleString();
  const findings = vm.findings.length
    ? `<ul class="findings">${vm.findings.map(renderFinding).join('\n')}</ul>`
    : `<div class="allclear">No issues found. Nothing to fix right now.</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}'; script-src 'nonce-${opts.nonce}';" />
<title>Database Health: ${escapeHtml(vm.database)}</title>
<style nonce="${opts.nonce}">${opts.brandCss ?? ''}${CSS}</style>
</head>
<body>
<header><div class="wrap">
  <div><h1>Database Health</h1><div class="sub">${escapeHtml(vm.database)} · checked ${escapeHtml(when)}</div></div>
  <div class="actions">
    <button type="button" class="primary" data-action="refresh">Refresh</button>
    <button type="button" data-action="openNotebook">Open as notebook</button>
  </div>
</div></header>
<main class="wrap">
  <div class="verdict lvl-${vm.overall}">${chip(vm.overall)}<span class="word">${escapeHtml(OVERALL_TEXT[vm.overall])}</span></div>
  <div class="tiles">${vm.tiles.map(renderTile).join('\n')}</div>
  <h2>What to do</h2>
  ${findings}
  <h2>Checks</h2>
  ${vm.sections.map(s => renderSection(s, vm)).join('\n')}
  <footer>Read-only checkup. Statistics reset on restart, so unused-index and dead-row results are most meaningful on a server that has run under normal load for a while.</footer>
</main>
<script nonce="${opts.nonce}">${SCRIPT}</script>
</body>
</html>`;
}

/** Minimal page shown while the first load is running or when it failed outright. */
export function renderHealthMessageHtml(title: string, message: string, opts: RenderOptions & { retry?: boolean }): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}'; script-src 'nonce-${opts.nonce}';" />
<title>${escapeHtml(title)}</title>
<style nonce="${opts.nonce}">${opts.brandCss ?? ''}${CSS}</style></head>
<body><header><div class="wrap"><div><h1>${escapeHtml(title)}</h1></div></div></header>
<main class="wrap"><p class="note">${escapeHtml(message)}</p>
${opts.retry ? '<p><button type="button" class="primary" data-action="refresh">Try again</button></p>' : ''}</main>
<script nonce="${opts.nonce}">${SCRIPT}</script></body></html>`;
}
