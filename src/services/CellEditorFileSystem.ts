/**
 * CellEditorFileSystem.ts
 * Writable virtual file system (`nexql-cell:`) used to edit a long text/JSON grid
 * cell in a real VS Code editor tab. Saving a document stages the edit back into
 * the originating notebook output (Review Changes); nothing is sent to the database.
 */

import * as vscode from 'vscode';
import {
  CellEditSessionStore,
  buildCellEditorPath,
  OpenCellEditSessionInput,
  LANGUAGE_BY_FORMAT,
} from './cellEditorSessions';

export const CELL_EDITOR_SCHEME = 'nexql-cell';

export class CellEditorFileSystem implements vscode.FileSystemProvider {
  private static instance: CellEditorFileSystem | undefined;
  static getInstance(): CellEditorFileSystem {
    if (!CellEditorFileSystem.instance) {
      CellEditorFileSystem.instance = new CellEditorFileSystem();
    }
    return CellEditorFileSystem.instance;
  }

  private readonly store = new CellEditSessionStore();
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;

  /** Register the provider for the `nexql-cell` scheme. */
  static register(): vscode.Disposable {
    const provider = CellEditorFileSystem.getInstance();
    const reg = vscode.workspace.registerFileSystemProvider(CELL_EDITOR_SCHEME, provider, {
      isCaseSensitive: true,
    });
    const closeWatcher = vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.scheme === CELL_EDITOR_SCHEME) {
        provider.store.close(doc.uri.path);
      }
    });
    return vscode.Disposable.from(reg, closeWatcher);
  }

  /** Open (or refresh) a session and return the URI of its virtual document. */
  openSession(input: OpenCellEditSessionInput): { uri: vscode.Uri; languageId: string } {
    const existed = this.store.get(buildCellEditorPath(input)) !== undefined;
    const session = this.store.open(input);
    const uri = vscode.Uri.from({ scheme: CELL_EDITOR_SCHEME, path: session.path });
    if (existed) {
      // Same cell reopened: let VS Code reload the (clean) document with fresh content.
      this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }
    return { uri, languageId: LANGUAGE_BY_FORMAT[input.format] };
  }

  // ── FileSystemProvider ───────────────────────────────────────────

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => undefined);
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const session = this.store.get(uri.path);
    if (session) {
      return {
        type: vscode.FileType.File,
        ctime: session.ctime,
        mtime: session.mtime,
        size: Buffer.byteLength(session.content, 'utf8'),
      };
    }
    if (this.store.isDirectory(uri.path)) {
      return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    }
    throw vscode.FileSystemError.FileNotFound(uri);
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    return this.store
      .listChildren(uri.path)
      .map(({ name, isDirectory }) => [
        name,
        isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
      ]);
  }

  createDirectory(): void {
    // Directories are implicit.
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const session = this.store.get(uri.path);
    if (!session) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return Buffer.from(session.content, 'utf8');
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    if (!this.store.get(uri.path)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    try {
      this.store.write(uri.path, Buffer.from(content).toString('utf8'));
    } catch (err) {
      throw vscode.FileSystemError.Unavailable(err instanceof Error ? err.message : String(err));
    }
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  delete(uri: vscode.Uri): void {
    this.store.close(uri.path);
    this.emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions('Cell editor documents cannot be renamed');
  }
}
