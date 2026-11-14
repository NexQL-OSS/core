import { expect } from 'chai';
import {
  getEditorType,
  getTextEditDepth,
  INLINE_TEXT_MAX_CHARS,
  POPOVER_MAX_BYTES,
} from '../../renderer/components/table/CellEditors';

describe('getEditorType', () => {
  const cases: { type: string; value: unknown; expected: ReturnType<typeof getEditorType> }[] = [
    { type: 'jsonb', value: {}, expected: 'json' },
    { type: 'varchar', value: 'hi', expected: 'longtext' },
    { type: 'varchar', value: 'x'.repeat(501), expected: 'longtext' },
    { type: 'text', value: '', expected: 'longtext' },
    { type: 'xml', value: '<a/>', expected: 'longtext' },
    { type: 'interval', value: '1 day', expected: 'longtext' },
    { type: 'path', value: '[(0,0),(1,1)]', expected: 'longtext' },
    { type: 'polygon', value: '((0,0),(1,1),(1,0))', expected: 'longtext' },
    { type: 'box', value: '(1,1),(0,0)', expected: 'longtext' },
    { type: 'line', value: '{1,2,3}', expected: 'longtext' },
    { type: 'varchar(64)', value: 'x', expected: 'longtext' },
    { type: 'numeric(10,2)', value: '1.00', expected: 'number' },
    { type: 'int4range', value: '[1,10)', expected: 'longtext' },
    { type: 'bytea', value: '\\xdead', expected: 'longtext' },
    { type: 'uuid', value: '00000000-0000-0000-0000-000000000000', expected: 'longtext' },
    { type: 'money', value: '12.34', expected: 'longtext' },
    { type: 'oid:12345', value: 'enum_val', expected: 'longtext' },
    { type: 'int4', value: 1, expected: 'number' },
    { type: 'unknown', value: 'x'.repeat(201), expected: 'longtext' },
    { type: '', value: 'short', expected: 'longtext' },
    { type: 'bool', value: true, expected: 'boolean' },
    { type: 'date', value: '2024-01-01', expected: 'date' },
    { type: 'timestamp', value: '2024-01-01T00:00:00Z', expected: 'datetime' },
  ];

  cases.forEach(({ type, value, expected }) => {
    it(`maps ${JSON.stringify(type)} to ${expected}`, () => {
      expect(getEditorType(type, value)).to.equal(expected);
    });
  });
});

describe('getTextEditDepth', () => {
  it('keeps short single-line text inline, like numbers', () => {
    expect(getTextEditDepth('varchar', 'INV-0000000005')).to.equal('inline');
    expect(getTextEditDepth('text', null)).to.equal('inline');
    expect(getTextEditDepth('uuid', '00000000-0000-0000-0000-000000000000')).to.equal('inline');
    expect(getTextEditDepth('text', 'x'.repeat(INLINE_TEXT_MAX_CHARS))).to.equal('inline');
  });

  it('uses the popover for long or multi-line text and for json', () => {
    expect(getTextEditDepth('text', 'x'.repeat(INLINE_TEXT_MAX_CHARS + 1))).to.equal('popover');
    expect(getTextEditDepth('text', 'a\nb')).to.equal('popover');
    expect(getTextEditDepth('jsonb', { a: 1 })).to.equal('popover');
    expect(getTextEditDepth('json', '{"a":1}')).to.equal('popover');
  });

  it('goes to an editor tab past the popover limit only when a tab can be opened', () => {
    const big = 'x'.repeat(POPOVER_MAX_BYTES + 1);
    expect(getTextEditDepth('text', big, true)).to.equal('editor-tab');
    expect(getTextEditDepth('text', big, false)).to.equal('popover');
    expect(getTextEditDepth('jsonb', { big }, true)).to.equal('editor-tab');
  });
});
