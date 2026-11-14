import { expect } from 'chai';
import * as sinon from 'sinon';
import { JSDOM } from 'jsdom';
import { TableRenderer } from '../../renderer/components/table/TableRenderer';

const NodeAbortController = globalThis.AbortController;

describe('TableRenderer', () => {
  let sandbox: sinon.SinonSandbox;
  let dom: JSDOM;
  let container: HTMLElement;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
    (global as any).window = dom.window;
    (global as any).document = dom.window.document;
    (global as any).MouseEvent = dom.window.MouseEvent;
    (global as any).Event = dom.window.Event;
    (global as any).HTMLElement = dom.window.HTMLElement;
    (global as any).HTMLTableRowElement = dom.window.HTMLTableRowElement;
    // The modal editor passes an AbortSignal to jsdom's addEventListener; it must be jsdom's own.
    (global as any).AbortController = dom.window.AbortController;
    // jsdom has no layout, so no scrollIntoView; the cell editor calls it.
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
    (global as any).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    };
    container = dom.window.document.getElementById('root') as HTMLElement;
  });

  afterEach(() => {
    sandbox.restore();
    dom.window.close();
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).MouseEvent;
    delete (global as any).Event;
    delete (global as any).HTMLElement;
    delete (global as any).HTMLTableRowElement;
    (global as any).AbortController = NodeAbortController;
    delete (global as any).IntersectionObserver;
  });

  it('keeps edits tied to the underlying source row after sorting', async () => {
    const rows = [
      { id: 2, name: 'Bravo' },
      { id: 1, name: 'Alpha' },
    ];
    const originalRows = JSON.parse(JSON.stringify(rows));
    const modifiedCells = new Map<string, { originalValue: any; newValue: any }>();
    const onDataChange = sandbox.spy();

    const renderer = new TableRenderer(container, {
      onDataChange,
    });

    renderer.render({
      columns: ['id', 'name'],
      rows,
      originalRows,
      columnTypes: {
        id: 'int4',
        name: 'text',
      },
      tableInfo: {
        schema: 'public',
        table: 'users',
        primaryKeys: ['id'],
      } as any,
      modifiedCells,
      sortState: {
        column: 'id',
        direction: 'asc',
      },
      foreignKeys: [],
    });

    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).to.have.length(2);

    const firstDataRow = bodyRows[0] as HTMLTableRowElement;
    const editableCell = firstDataRow.querySelectorAll('td')[2] as HTMLElement;
    expect(editableCell.textContent).to.equal('Alpha');

    editableCell.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));

    // Short single-line text is edited in the cell itself; Enter saves.
    const editor = dom.window.document.querySelector('td input[type="text"]') as HTMLInputElement;
    expect(editor).to.exist;
    expect(dom.window.document.querySelector('textarea')).to.not.exist;
    editor.value = 'Changed';
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onDataChange.calledOnce).to.be.true;
    expect(onDataChange.firstCall.args).to.deep.equal([1, 'name', 'Changed', 'Alpha']);
    expect(rows[1].name).to.equal('Changed');
    expect(rows[0].name).to.equal('Bravo');
    expect(modifiedCells.has('1-name')).to.be.true;
    expect(modifiedCells.has('0-name')).to.be.false;
  });

  function renderTextGrid(
    events: ConstructorParameters<typeof TableRenderer>[1],
    value: unknown,
    type = 'text',
  ) {
    const rows = [{ id: 1, body: value }];
    const originalRows = JSON.parse(JSON.stringify(rows));
    const modifiedCells = new Map<string, { originalValue: any; newValue: any }>();
    const renderer = new TableRenderer(container, events);
    renderer.render({
      columns: ['id', 'body'],
      rows,
      originalRows,
      columnTypes: { id: 'int4', body: type },
      tableInfo: { schema: 'public', table: 'notes', primaryKeys: ['id'] } as any,
      modifiedCells,
      foreignKeys: [],
    });
    const cell = container.querySelectorAll('tbody tr')[0].querySelectorAll('td')[2] as HTMLElement;
    cell.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
    return { rows, modifiedCells };
  }

  it('opens long or multi-line text in an overlay popover that does not sit in the flow', () => {
    renderTextGrid({}, 'line one\nline two');
    const popover = dom.window.document.querySelector('[data-inline-editor="true"]') as HTMLElement;
    expect(popover).to.exist;
    expect(popover.style.position).to.equal('absolute');
    expect(dom.window.document.querySelector('textarea')).to.exist;
  });

  it('opens json in the popover with a live validity badge', () => {
    renderTextGrid({}, { a: 1 }, 'jsonb');
    const popover = dom.window.document.querySelector('[data-inline-editor="true"]') as HTMLElement;
    expect(popover).to.exist;
    expect(popover.textContent).to.contain('valid JSON');
    const textarea = popover.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '{ nope';
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(popover.textContent).to.not.contain('valid JSON');
  });

  it('hands the value to an editor tab and stages saves from it', () => {
    const onOpenCellInEditor = sandbox.spy();
    const onDataChange = sandbox.spy();
    const { rows, modifiedCells } = renderTextGrid(
      { onOpenCellInEditor, onDataChange },
      'a\nb',
    );
    const openBtn = Array.from(
      dom.window.document.querySelectorAll('[data-inline-editor="true"] button'),
    ).find((b) => b.textContent?.startsWith('Open in editor')) as HTMLButtonElement;
    expect(openBtn).to.exist;
    openBtn.click();

    expect(onOpenCellInEditor.calledOnce).to.be.true;
    const req = onOpenCellInEditor.firstCall.args[0];
    expect(req).to.include({ rowLabel: 'id=1', columnName: 'body', content: 'a\nb', format: 'text' });
    expect(dom.window.document.querySelector('[data-inline-editor="true"]')).to.not.exist;

    req.apply('edited in tab');
    expect(rows[0].body).to.equal('edited in tab');
    expect(modifiedCells.get('0-body')).to.deep.equal({ originalValue: 'a\nb', newValue: 'edited in tab' });
    expect(onDataChange.calledOnceWith(0, 'body', 'edited in tab', 'a\nb')).to.be.true;
  });

  it('opens huge values straight in an editor tab when one is available', async () => {
    const onOpenCellInEditor = sandbox.spy();
    renderTextGrid({ onOpenCellInEditor }, 'x'.repeat(11 * 1024));
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(onOpenCellInEditor.calledOnce).to.be.true;
    expect(dom.window.document.querySelector('[data-inline-editor="true"]')).to.not.exist;
  });

  it('virtualizes large result sets so most rows are not in the DOM', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ id: i, v: `row-${i}` }));
    const originalRows = JSON.parse(JSON.stringify(rows));

    const renderer = new TableRenderer(container, {});
    renderer.render({
      columns: ['id', 'v'],
      rows,
      originalRows,
      columnTypes: { id: 'int4', v: 'text' },
      tableInfo: { schema: 'public', table: 't', primaryKeys: ['id'] } as any,
      foreignKeys: [],
    });

    const dataRows = container.querySelectorAll('tbody tr[data-source-index]');
    expect(dataRows.length).to.be.lessThan(rows.length);
    expect(dataRows.length).to.be.at.least(1);

    renderer.dispose();
  });

  it('sets aria-sort on the active sort column header', () => {
    const rows = [{ id: 1, n: 'a' }];
    const renderer = new TableRenderer(container, {});
    renderer.render({
      columns: ['id', 'n'],
      rows,
      originalRows: JSON.parse(JSON.stringify(rows)),
      columnTypes: { id: 'int4', n: 'text' },
      sortState: { column: 'n', direction: 'asc' },
      foreignKeys: [],
    });

    const sortedHeader = container.querySelector('thead th[aria-sort="ascending"]');
    expect(sortedHeader?.textContent).to.include('n');

    renderer.dispose();
  });
});
