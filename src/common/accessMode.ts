/**
 * Access mode vocabulary shared with the NexQL MCP server badges
 * ("Works in read mode" / "Needs write mode"). Pure module: no VS Code imports.
 */

export type AccessMode = 'read' | 'write';

export interface AccessModeConnectionLike {
  readOnlyMode?: boolean;
  environment?: 'production' | 'staging' | 'development' | string;
}

export const ACCESS_MODE_LABELS: Record<AccessMode, string> = {
  read: 'Read-only',
  write: 'Read/write',
};

/** Codicon ids (without `$(...)`). */
export const ACCESS_MODE_ICONS: Record<AccessMode, string> = {
  read: 'lock',
  write: 'edit',
};

/** Contributed theme color ids (defined in package.json by the design-token work). */
export const ACCESS_MODE_COLOR_IDS: Record<AccessMode, string> = {
  read: 'nexql.mode.read',
  write: 'nexql.mode.write',
};

export function getAccessMode(conn: AccessModeConnectionLike | undefined | null): AccessMode {
  return conn?.readOnlyMode === true ? 'read' : 'write';
}

export function accessModeLabel(mode: AccessMode): string {
  return ACCESS_MODE_LABELS[mode];
}

/** Status bar / label text such as `$(lock) Read-only`. */
export function accessModeText(mode: AccessMode): string {
  return `$(${ACCESS_MODE_ICONS[mode]}) ${ACCESS_MODE_LABELS[mode]}`;
}

export function toggleAccessMode(mode: AccessMode): AccessMode {
  return mode === 'read' ? 'write' : 'read';
}

/** Production connection that can write: should be visually flagged. */
export function isProductionWrite(conn: AccessModeConnectionLike | undefined | null): boolean {
  return conn?.environment === 'production' && getAccessMode(conn) === 'write';
}

/** Whether switching to `next` must be confirmed by the user. */
export function requiresWriteConfirmation(
  conn: AccessModeConnectionLike | undefined | null,
  next: AccessMode,
): boolean {
  return next === 'write' && conn?.environment === 'production';
}
