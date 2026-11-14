import { expect } from 'chai';
import * as vscode from 'vscode';
import { CellEditorFileSystem, CELL_EDITOR_SCHEME } from '../../services/CellEditorFileSystem';
import { isOpenCellEditorRequest } from '../../services/handlers/OpenCellEditorHandler';

describe('CellEditorFileSystem', () => {
  const open = (fs: CellEditorFileSystem, onSave: (t: string) => void = () => undefined, content = '{"a":1}') =>
    fs.openSession({
      table: 'invoices',
      rowLabel: 'id=5',
      columnName: 'metadata',
      format: 'json',
      content,
      onSave,
    });

  it('serves the cell value as a virtual file with a json language id', () => {
    const fs = new CellEditorFileSystem();
    const { uri, languageId } = open(fs);
    expect(uri.scheme).to.equal(CELL_EDITOR_SCHEME);
    expect(languageId).to.equal('json');
    expect(Buffer.from(fs.readFile(uri)).toString('utf8')).to.equal('{"a":1}');
    expect(fs.stat(uri).type).to.equal(vscode.FileType.File);
    expect(fs.stat(uri).size).to.equal(7);
  });

  it('stages the saved text through the session callback', () => {
    const fs = new CellEditorFileSystem();
    const saved: string[] = [];
    const { uri } = open(fs, (t) => saved.push(t));
    fs.writeFile(uri, Buffer.from('{"a":2}'));
    expect(saved).to.deep.equal(['{"a":2}']);
    expect(Buffer.from(fs.readFile(uri)).toString('utf8')).to.equal('{"a":2}');
  });

  it('turns a rejected save into an Unavailable file system error', () => {
    const fs = new CellEditorFileSystem();
    const { uri } = open(fs, () => { throw new Error('Invalid JSON, not staged'); });
    expect(() => fs.writeFile(uri, Buffer.from('{'))).to.throw('Invalid JSON, not staged');
  });

  it('refuses to create files that were not opened through a session', () => {
    const fs = new CellEditorFileSystem();
    const stray = vscode.Uri.from({ scheme: CELL_EDITOR_SCHEME, path: '/x/y/z.json' });
    expect(() => fs.writeFile(stray, Buffer.from('{}'))).to.throw();
    expect(() => fs.stat(stray)).to.throw();
  });

  it('lists implicit directories and forbids rename', () => {
    const fs = new CellEditorFileSystem();
    const { uri } = open(fs);
    expect(fs.readDirectory(vscode.Uri.from({ scheme: CELL_EDITOR_SCHEME, path: '/invoices' }))).to.deep.equal([
      ['id=5', vscode.FileType.Directory],
    ]);
    expect(() => fs.rename()).to.throw();
    fs.delete(uri);
    expect(() => fs.stat(uri)).to.throw();
  });

  it('reopening a cell refreshes its content', () => {
    const fs = new CellEditorFileSystem();
    open(fs, undefined, 'old');
    const { uri } = open(fs, undefined, 'new');
    expect(Buffer.from(fs.readFile(uri)).toString('utf8')).to.equal('new');
  });
});

describe('isOpenCellEditorRequest', () => {
  const valid = {
    type: 'openCellEditor',
    requestId: 'r1',
    rowLabel: 'id=1',
    columnName: 'body',
    format: 'text',
    content: 'x',
  };
  it('accepts a well formed request', () => {
    expect(isOpenCellEditorRequest(valid)).to.be.true;
  });
  it('rejects missing or malformed fields', () => {
    expect(isOpenCellEditorRequest(null)).to.be.false;
    expect(isOpenCellEditorRequest({ ...valid, requestId: '' })).to.be.false;
    expect(isOpenCellEditorRequest({ ...valid, format: 'exe' })).to.be.false;
    expect(isOpenCellEditorRequest({ ...valid, content: 5 })).to.be.false;
  });
});
