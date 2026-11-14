/**
 * Discriminated union for webview ↔ extension notebook messages (extend as handlers grow).
 * Prefer narrowing on `type` at call sites.
 */
export type HandlerMessageType =
  | 'breadcrumbNavigate'
  | 'saveColumnWidths'
  | 'getColumnWidths'
  | 'export_request'
  | 'retryCell'
  | 'explainError'
  | 'fixQuery'
  | 'runDerivedQuery'
  | 'showErrorMessage'
  | 'gridCommitPreference'
  | 'saveChanges'
  | 'insertRow'
  | 'fkLookup'
  | 'openCellEditor';

export interface HandlerMessageBase {
  type: HandlerMessageType | string;
}

export interface HandlerResponseBase {
  ok: boolean;
  code: string;
  remediation?: string;
  error?: string;
}
