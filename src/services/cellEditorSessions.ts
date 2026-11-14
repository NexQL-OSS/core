/**
 * cellEditorSessions.ts
 * In-memory store behind the `nexql-cell:` virtual documents that let a long
 * text/JSON grid cell be edited in a real VS Code editor tab. Pure (no vscode
 * imports) so it is unit-testable; `CellEditorFileSystem` adapts it to VS Code.
 */

export type CellEditorFormat = 'json' | 'xml' | 'html' | 'text';

export interface CellEditSession {
  path: string;
  content: string;
  format: CellEditorFormat;
  /** Called with the saved text. Throw to reject the save (the editor stays dirty). */
  onSave: (text: string) => void;
  ctime: number;
  mtime: number;
}

export interface OpenCellEditSessionInput {
  schema?: string;
  table?: string;
  rowLabel: string;
  columnName: string;
  format: CellEditorFormat;
  content: string;
  onSave: (text: string) => void;
}

const EXTENSION_BY_FORMAT: Record<CellEditorFormat, string> = {
  json: 'json',
  xml: 'xml',
  html: 'html',
  text: 'txt',
};

export const LANGUAGE_BY_FORMAT: Record<CellEditorFormat, string> = {
  json: 'json',
  xml: 'xml',
  html: 'html',
  text: 'plaintext',
};

/** Make an arbitrary label safe to use as a single URI path segment. */
export function sanitizePathSegment(raw: string, fallback = 'value'): string {
  const cleaned = String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\\/:*?"<>|#%]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '_')
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function buildCellEditorPath(
  input: Pick<OpenCellEditSessionInput, 'schema' | 'table' | 'rowLabel' | 'columnName' | 'format'>,
): string {
  const tableLabel = input.table
    ? sanitizePathSegment(input.schema ? `${input.schema}.${input.table}` : input.table, 'table')
    : 'result';
  const row = sanitizePathSegment(input.rowLabel, 'row');
  const column = sanitizePathSegment(input.columnName, 'column');
  return `/${tableLabel}/${row}/${column}.${EXTENSION_BY_FORMAT[input.format]}`;
}

/**
 * Convert text saved from an editor tab into the value staged on the grid.
 * JSON columns must parse (and are staged as parsed values); everything else is
 * staged verbatim. Throws a readable Error for invalid JSON.
 */
export function parseSavedCellContent(format: CellEditorFormat, text: string): unknown {
  if (format !== 'json') {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON, not staged: ${(err as Error).message}`);
  }
}

export class CellEditSessionStore {
  private readonly sessions = new Map<string, CellEditSession>();

  open(input: OpenCellEditSessionInput, now: number = Date.now()): CellEditSession {
    const path = buildCellEditorPath(input);
    const existing = this.sessions.get(path);
    const session: CellEditSession = {
      path,
      content: input.content,
      format: input.format,
      onSave: input.onSave,
      ctime: existing?.ctime ?? now,
      mtime: now,
    };
    this.sessions.set(path, session);
    return session;
  }

  get(path: string): CellEditSession | undefined {
    return this.sessions.get(path);
  }

  /** Replace stored content after a save, invoking the session callback first. */
  write(path: string, text: string, now: number = Date.now()): CellEditSession {
    const session = this.sessions.get(path);
    if (!session) {
      throw new Error(`No open cell edit session for ${path}`);
    }
    session.onSave(text);
    session.content = text;
    session.mtime = now;
    return session;
  }

  close(path: string): boolean {
    return this.sessions.delete(path);
  }

  /** Paths of direct children (files or directories) under `dir`, by name. */
  listChildren(dir: string): Array<{ name: string; isDirectory: boolean }> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const children = new Map<string, boolean>();
    for (const path of this.sessions.keys()) {
      if (!path.startsWith(prefix)) {
        continue;
      }
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash === -1) {
        children.set(rest, false);
      } else {
        children.set(rest.slice(0, slash), true);
      }
    }
    return Array.from(children, ([name, isDirectory]) => ({ name, isDirectory }));
  }

  isDirectory(path: string): boolean {
    if (path === '/' || path === '') {
      return true;
    }
    const prefix = path.endsWith('/') ? path : `${path}/`;
    for (const key of this.sessions.keys()) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  clear(): void {
    this.sessions.clear();
  }
}
