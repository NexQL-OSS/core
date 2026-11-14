import * as vscode from 'vscode';
import { DatabaseTreeItem } from '../../providers/DatabaseTreeProvider';
import { NotebookBuilder, MarkdownUtils, getDatabaseConnection } from '../helper';

export async function cmdPasteTable(item: DatabaseTreeItem, context: vscode.ExtensionContext) {
  let release: (() => void) | undefined;
  try {
    const clipboardText = await vscode.env.clipboard.readText();
    if (!clipboardText || clipboardText.trim().length === 0) {
      vscode.window.showWarningMessage('Clipboard is empty.');
      return;
    }

    // simplistic detection
    const isJson = clipboardText.trim().startsWith('[') || clipboardText.trim().startsWith('{');
    let data: any[] = [];
    let format = 'CSV';

    if (isJson) {
      try {
        const parsed = JSON.parse(clipboardText);
        if (Array.isArray(parsed)) data = parsed;
        else if (typeof parsed === 'object') data = [parsed];
        format = 'JSON';
      } catch (e) {
        // Fallback to CSV if JSON parse fails?? No, likely invalid JSON.
        vscode.window.showErrorMessage('Invalid JSON in clipboard');
        return;
      }
    } else {
      // CSV Parse
      data = parseCSV(clipboardText);
      format = 'CSV';
    }

    if (data.length === 0) {
      vscode.window.showWarningMessage('No parseable data found in clipboard.');
      return;
    }

    // Infer Schema
    const columns = Object.keys(data[0]);
    const inferredTypes: Record<string, string> = {};

    columns.forEach(col => {
      inferredTypes[col] = inferType(data, col);
    });

    // Generate Notebook
    const schema = item.schema || 'public';
    const tableName = `imported_table_${Date.now().toString().slice(-4)}`;

    const ddl = `CREATE TABLE ${schema}.${tableName} (\n` +
      columns.map(col => `  "${col}" ${inferredTypes[col]}`).join(',\n') +
      '\n);';

    const insert = generateInsertScript(schema, tableName, columns, data);


    // ... logic ...

    let metadata: any;

    try {
      const conn = await getDatabaseConnection(item);
      metadata = conn.metadata;
      release = conn.release;
    } catch (e) {
      // Connection failed, maybe just show without metadata (will likely fail to execute but show notebook is fine?)
      // Actually NotebookBuilder needs metadata to link connection.
      // If connection fails, we can't really run the SQL.
      // But we can still show the SQL.
      // We will proceed with undefined metadata.
    }

    await new NotebookBuilder(metadata)
      .addMarkdown(
        MarkdownUtils.header(`📋 Smart Paste: New Table`) +
        MarkdownUtils.infoBox(`Detected **${format}** data with **${data.length}** rows. Review the inferred schema and data below.`) +
        `\n\n**Note:** Rename the table in the SQL script before running if desired.`
      )
      .addMarkdown('#### 1. Create Table')
      .addSql(ddl)
      .addMarkdown('#### 2. Insert Data')
      .addSql(insert)
      .showTemp();

  } catch (err: any) {
    vscode.window.showErrorMessage(`Smart Paste failed: ${err.message}`);
  } finally {
    if (release) release();
  }
}

function parseCSV(text: string): any[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Headers
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple manual split with quote support
    const row: any = {};
    const values: string[] = [];
    let inQuote = false;
    let val = '';
    for (const char of lines[i]) {
      if (char === '"') inQuote = !inQuote;
      else if (char === ',' && !inQuote) {
        values.push(val.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        val = '';
      } else val += char;
    }
    values.push(val.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

    headers.forEach((h, idx) => {
      row[h] = idx < values.length ? values[idx] : null;
    });
    result.push(row);
  }
  return result;
}

function inferType(data: any[], col: string): string {
  let isInt = true;
  let isFloat = true;
  let isBool = true;
  let isDate = true;
  let hasData = false;

  // Check first 50 rows
  const sample = data.slice(0, 50);

  for (const row of sample) {
    const val = row[col];
    if (val === null || val === undefined || val === '') continue;
    hasData = true;
    const s = String(val).trim();

    if (isBool && !['true', 'false', 't', 'f', '0', '1', 'yes', 'no'].includes(s.toLowerCase())) isBool = false;
    if (isInt && !/^-?\d+$/.test(s)) isInt = false;
    if (isFloat && !/^-?\d+(\.\d+)?$/.test(s)) isFloat = false;
    if (isDate && isNaN(Date.parse(s))) isDate = false; // crude date check
  }

  if (!hasData) return 'TEXT'; // Default to text if all null
  if (isBool) return 'BOOLEAN';
  if (isInt) return 'INTEGER';
  if (isFloat) return 'NUMERIC';
  if (isDate) return 'TIMESTAMP'; // or DATE
  return 'TEXT';
}

function generateInsertScript(schema: string, table: string, columns: string[], data: any[]): string {
  const quote = (v: any) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const rows = data.map(row => {
    const values = columns.map(c => quote(row[c])).join(', ');
    return `(${values})`;
  });

  // Batch insert?
  const cols = columns.map(c => `"${c}"`).join(', ');
  const header = `INSERT INTO ${schema}.${table} (${cols}) VALUES\n`;

  // Split into chunks of 1000 to avoid huge statements?
  // For notebook display, maybe just 100 rows preview + "..." if too large?
  // "Insert Script" implying full data.
  // If data is huge, we shouldn't dump 10MB into a notebook cell.

  if (rows.length > 500) {
    const chunk = rows.slice(0, 500).join(',\n');
    return `${header} ${chunk};\n\n-- ... and ${rows.length - 500} more rows (truncated for preview)`;
  }

  return `${header} ${rows.join(',\n')};`;
}
