import { expect } from 'chai';
import {
  CellEditSessionStore,
  buildCellEditorPath,
  parseSavedCellContent,
  sanitizePathSegment,
} from '../../services/cellEditorSessions';

describe('cellEditorSessions', () => {
  describe('buildCellEditorPath', () => {
    it('builds a readable path with a format extension', () => {
      expect(
        buildCellEditorPath({
          schema: 'public',
          table: 'invoices',
          rowLabel: 'id=5',
          columnName: 'metadata',
          format: 'json',
        }),
      ).to.equal('/public.invoices/id=5/metadata.json');
    });

    it('sanitizes separators and falls back for empty labels', () => {
      expect(sanitizePathSegment('a/b\\c:d')).to.equal('a_b_c_d');
      expect(sanitizePathSegment('..hidden')).to.equal('_hidden');
      expect(sanitizePathSegment('   ', 'fallback')).to.equal('fallback');
      expect(
        buildCellEditorPath({ rowLabel: 'row-1', columnName: 'notes', format: 'text' }),
      ).to.equal('/result/row-1/notes.txt');
    });
  });

  describe('parseSavedCellContent', () => {
    it('parses json and rejects invalid json', () => {
      expect(parseSavedCellContent('json', '{"a":1}')).to.deep.equal({ a: 1 });
      expect(() => parseSavedCellContent('json', '{ nope')).to.throw(/Invalid JSON/);
    });

    it('stages other formats verbatim', () => {
      expect(parseSavedCellContent('text', 'hello\nworld')).to.equal('hello\nworld');
      expect(parseSavedCellContent('xml', '<a/>')).to.equal('<a/>');
    });
  });

  describe('CellEditSessionStore', () => {
    const input = (onSave: (t: string) => void = () => undefined) => ({
      table: 'invoices',
      rowLabel: 'id=5',
      columnName: 'notes',
      format: 'text' as const,
      content: 'hello',
      onSave,
    });

    it('opens a session and reports directories implicitly', () => {
      const store = new CellEditSessionStore();
      const session = store.open(input(), 100);
      expect(session.content).to.equal('hello');
      expect(store.get(session.path)).to.equal(session);
      expect(store.isDirectory('/')).to.be.true;
      expect(store.isDirectory('/invoices')).to.be.true;
      expect(store.isDirectory(session.path)).to.be.false;
      expect(store.listChildren('/invoices/id=5')).to.deep.equal([
        { name: 'notes.txt', isDirectory: false },
      ]);
    });

    it('reopening the same cell keeps ctime and refreshes content', () => {
      const store = new CellEditSessionStore();
      const first = store.open(input(), 100);
      const again = store.open({ ...input(), content: 'fresh' }, 200);
      expect(again.ctime).to.equal(first.ctime);
      expect(again.mtime).to.equal(200);
      expect(again.content).to.equal('fresh');
    });

    it('write calls onSave before storing and keeps old content when onSave throws', () => {
      const store = new CellEditSessionStore();
      const saved: string[] = [];
      const session = store.open(input((t) => saved.push(t)));
      store.write(session.path, 'next');
      expect(saved).to.deep.equal(['next']);
      expect(store.get(session.path)!.content).to.equal('next');

      const failing = store.open(
        { ...input(() => { throw new Error('nope'); }), columnName: 'other' },
      );
      expect(() => store.write(failing.path, 'x')).to.throw('nope');
      expect(store.get(failing.path)!.content).to.equal('hello');
    });

    it('write and close on unknown paths', () => {
      const store = new CellEditSessionStore();
      expect(() => store.write('/missing', 'x')).to.throw(/No open cell edit session/);
      expect(store.close('/missing')).to.be.false;
    });
  });
});
