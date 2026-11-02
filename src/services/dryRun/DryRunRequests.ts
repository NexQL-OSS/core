/**
 * Hand-off between the `postgres-explorer.dryRunCell` command and the notebook kernel.
 *
 * The command cannot create a cell execution itself (only the controller can), so it marks
 * the cell and triggers the normal `notebook.cell.execute`; the kernel then consumes the mark
 * and runs the dry-run path instead of a normal run.
 *
 * Marks expire quickly. A stale mark can only turn a later run into a dry run, which is the
 * safe direction (nothing is written).
 */
const TTL_MS = 15_000;
const pending = new Map<string, number>();

export function requestDryRun(cellUri: string, now: number = Date.now()): void {
  pending.set(cellUri, now + TTL_MS);
}

export function consumeDryRunRequest(cellUri: string, now: number = Date.now()): boolean {
  const expiresAt = pending.get(cellUri);
  if (expiresAt === undefined) {
    return false;
  }
  pending.delete(cellUri);
  return expiresAt >= now;
}

export function clearDryRunRequests(): void {
  pending.clear();
}
