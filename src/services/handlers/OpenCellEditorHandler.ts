/**
 * OpenCellEditorHandler.ts
 * Opens a long text/JSON grid cell in a real VS Code editor tab (virtual
 * `nexql-cell:` document). Saving the document posts `cellEditorResult` back to
 * the notebook output, which stages the edit in Review Changes.
 */

import * as vscode from 'vscode';
import { IMessageHandler } from '../MessageHandler';
import { CellEditorFileSystem } from '../CellEditorFileSystem';
import { CellEditorFormat, parseSavedCellContent } from '../cellEditorSessions';
import { safelyPostMessage } from './messaging';

export interface OpenCellEditorRequest {
  type: 'openCellEditor';
  requestId: string;
  schema?: string;
  table?: string;
  rowLabel: string;
  columnName: string;
  columnType?: string;
  format: CellEditorFormat;
  content: string;
}

const FORMATS: ReadonlySet<string> = new Set(['json', 'xml', 'html', 'text']);

export function isOpenCellEditorRequest(message: any): message is OpenCellEditorRequest {
  return (
    !!message &&
    typeof message.requestId === 'string' &&
    message.requestId.length > 0 &&
    typeof message.rowLabel === 'string' &&
    typeof message.columnName === 'string' &&
    typeof message.content === 'string' &&
    typeof message.format === 'string' &&
    FORMATS.has(message.format)
  );
}

export class OpenCellEditorHandler implements IMessageHandler {
  async handle(
    message: OpenCellEditorRequest,
    context: { postMessage?: (message: any) => Thenable<boolean>; [key: string]: any },
  ): Promise<void> {
    if (!isOpenCellEditorRequest(message)) {
      return;
    }
    const postMessage = context.postMessage;
    if (!postMessage) {
      return;
    }

    try {
      const { uri, languageId } = CellEditorFileSystem.getInstance().openSession({
        schema: message.schema,
        table: message.table,
        rowLabel: message.rowLabel,
        columnName: message.columnName,
        format: message.format,
        content: message.content,
        onSave: (text) => {
          // Throws on invalid JSON so VS Code keeps the editor dirty and shows the reason.
          parseSavedCellContent(message.format, text);
          void safelyPostMessage(
            postMessage,
            { type: 'cellEditorResult', requestId: message.requestId, content: text },
            { contextLabel: 'Cell editor', notifyOnFailure: true },
          );
        },
      });

      const doc = await vscode.workspace.openTextDocument(uri);
      if (doc.languageId !== languageId) {
        try {
          await vscode.languages.setTextDocumentLanguage(doc, languageId);
        } catch {
          // Language mode is cosmetic; keep editing available.
        }
      }
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false,
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      await vscode.window.showErrorMessage(`Could not open cell in editor: ${text}`);
    }
  }
}
