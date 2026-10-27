import * as vscode from 'vscode';

/** Canonical license API. Shipped builds never talk to anything else. */
export const CANONICAL_LICENSE_ENDPOINT = 'https://nexql.astrx.dev/api';

/**
 * Not contributed in the manifest. Still read so a leftover settings.json
 * value is ignored in production instead of throwing, and so the Extension
 * Development Host can keep pointing at a local license server.
 */
export const LICENSE_ENFORCEMENT_SETTING = 'postgresExplorer.license.enforcement';
export const LICENSE_ENDPOINT_SETTING = 'postgresExplorer.license.endpoint';

/** `off` skips tier gates. `freemium` applies them. Legacy `hard`/`soft` are freemium. */
export type LicenseEnforcement = 'off' | 'freemium';

/**
 * Mode captured from `ExtensionContext.extensionMode` during activate.
 * Unset fails closed so a path that runs before activate cannot honor overrides.
 */
let extensionMode: vscode.ExtensionMode | undefined;

/** Record how this extension host was launched. Call once from `activate`. */
export function bindLicenseExtensionMode(mode: vscode.ExtensionMode | undefined): void {
  extensionMode = mode;
}

/**
 * True only in the Extension Development Host (F5 / `--extensionDevelopmentPath`).
 * Installed stable, nightly, and pro builds run as Production. Extension test
 * hosts run as Test and are not a bypass.
 */
export function isLicenseDevMode(): boolean {
  return extensionMode === vscode.ExtensionMode.Development;
}

export function resolveEnforcement(
  configured: string | undefined,
  devMode: boolean,
): LicenseEnforcement {
  if (!devMode) {
    return 'freemium';
  }
  return configured === 'off' ? 'off' : 'freemium';
}

export function resolveLicenseEndpoint(
  configured: string | undefined,
  devMode: boolean,
): string {
  if (!devMode) {
    return CANONICAL_LICENSE_ENDPOINT;
  }
  const trimmed = typeof configured === 'string' ? configured.trim() : '';
  return trimmed.length > 0 ? trimmed : CANONICAL_LICENSE_ENDPOINT;
}

export function readEnforcement(): LicenseEnforcement {
  let configured: string | undefined;
  try {
    configured = vscode.workspace.getConfiguration().get<string>(LICENSE_ENFORCEMENT_SETTING);
  } catch {
    return 'freemium';
  }
  return resolveEnforcement(configured, isLicenseDevMode());
}

export function readLicenseEndpoint(): string {
  let configured: string | undefined;
  try {
    configured = vscode.workspace.getConfiguration().get<string>(LICENSE_ENDPOINT_SETTING);
  } catch {
    return CANONICAL_LICENSE_ENDPOINT;
  }
  return resolveLicenseEndpoint(configured, isLicenseDevMode());
}

/** Absolute URL for a license API path (`/license/validate`, …). */
export function buildLicenseUrl(apiPath: string): URL {
  const base = readLicenseEndpoint().replace(/\/$/, '');
  const suffix = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  return new URL(`${base}${suffix}`);
}
