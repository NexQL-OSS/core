/**
 * Pure mapping between the extension's connection records and the secret-free
 * `.nexql/config.toml` profile format shared with the nexql-mcp server.
 *
 * No VS Code dependencies. Secrets (passwords, SSH keys, tokens) are never
 * emitted. Extension-only settings with no nexql-mcp counterpart live in a
 * namespaced `[profiles.<name>.vscode]` sub-table, which nexql-mcp ignores.
 */
import { parse, stringify } from 'smol-toml';
import type { ConnectionInfo } from './connectionStore';

export const NEXQL_CONFIG_RELATIVE_PATH = '.nexql/config.toml';
/** Namespaced table for fields nexql-mcp has no equivalent for. */
export const VSCODE_NAMESPACE = 'vscode';

const SSL_MODES = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'] as const;
const ENVIRONMENTS = ['production', 'staging', 'development'] as const;

type TomlTable = Record<string, unknown>;

export interface NexqlProfile {
  host?: string;
  port?: number;
  dbname?: string;
  user?: string;
  sslmode?: string;
  sslcert?: string;
  sslkey?: string;
  sslrootcert?: string;
  access_mode?: 'read' | 'write';
  statement_timeout_ms?: number;
  [key: string]: unknown;
}

export interface ImportedProfile {
  /** Profile name (the key under `[profiles]`). */
  name: string;
  /** Connection fields, without `id` and never with a password. */
  connection: Omit<ConnectionInfo, 'id' | 'password'>;
  warnings: string[];
}

const isTable = (v: unknown): v is TomlTable =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : undefined;

function compact<T extends TomlTable>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) {
      delete obj[k];
    }
  }
  return obj;
}

/**
 * Agent access written to the shared file. nexql-mcp applies `access_mode` to
 * the AI assistant, not to the person, so a writable connection is still
 * exported as "read" unless the exporter opts in. Never emits "admin".
 */
export function exportedAccessMode(conn: Pick<ConnectionInfo, 'readOnlyMode'>, allowAgentWrites = false): 'read' | 'write' {
  return !conn.readOnlyMode && allowAgentWrites ? 'write' : 'read';
}

/** Map one connection to a nexql-mcp profile table. Never includes secrets. */
export function connectionToProfile(conn: ConnectionInfo, opts: { allowAgentWrites?: boolean } = {}): TomlTable {
  const profile: TomlTable = compact({
    host: conn.host,
    port: conn.port,
    dbname: conn.database,
    user: conn.username,
    sslmode: conn.sslmode,
    sslcert: conn.sslCertPath,
    sslkey: conn.sslKeyPath,
    sslrootcert: conn.sslRootCertPath,
    access_mode: exportedAccessMode(conn, opts.allowAgentWrites),
    statement_timeout_ms: conn.statementTimeout,
  });

  const ns: TomlTable = compact({
    read_only: conn.readOnlyMode,
    environment: conn.environment,
    group: conn.group,
    connect_timeout: conn.connectTimeout,
    application_name: conn.applicationName,
    options: conn.options,
    hide_platform_schemas: conn.hidePlatformSchemas,
    ssh: conn.ssh
      ? compact({
          enabled: conn.ssh.enabled,
          host: conn.ssh.host,
          port: conn.ssh.port,
          username: conn.ssh.username,
          // privateKeyPath is machine-specific and key-adjacent: not exported.
        })
      : undefined,
  });
  if (Object.keys(ns).length > 0) {
    profile[VSCODE_NAMESPACE] = ns;
  }
  return profile;
}

/** Map a profile table back to connection fields. Tolerates partial/unknown input. */
export function profileToConnection(name: string, raw: unknown): ImportedProfile {
  const warnings: string[] = [];
  const p: TomlTable = isTable(raw) ? raw : {};
  const ns: TomlTable = isTable(p[VSCODE_NAMESPACE]) ? (p[VSCODE_NAMESPACE] as TomlTable) : {};

  let host = str(p.host);
  let port = num(p.port);
  let database = str(p.dbname);
  let username = str(p.user);
  let sslmode = oneOf(SSL_MODES, p.sslmode);

  const url = str(p.url);
  if (url) {
    try {
      const u = new URL(url);
      host ??= decodeURIComponent(u.hostname) || undefined;
      port ??= u.port ? Number(u.port) : undefined;
      database ??= decodeURIComponent(u.pathname.replace(/^\//, '')) || undefined;
      username ??= decodeURIComponent(u.username) || undefined;
      sslmode ??= oneOf(SSL_MODES, u.searchParams.get('sslmode'));
      if (u.password) {
        warnings.push('Password embedded in "url" was ignored.');
      }
    } catch {
      warnings.push('Could not parse "url"; ignored.');
    }
  }
  if (p.password !== undefined) {
    warnings.push('Inline "password" was ignored.');
  }
  if (p.password_command !== undefined || p.password_file !== undefined) {
    warnings.push('password_command / password_file are not supported by the extension; enter the password when prompted.');
  }
  if (p.credential_provider !== undefined) {
    warnings.push(`credential_provider "${String(p.credential_provider)}" is not supported by the extension.`);
  }

  const connection: Omit<ConnectionInfo, 'id' | 'password'> = compact({
    name,
    host: host ?? 'localhost',
    port: port ?? 5432,
    database,
    username,
    sslmode,
    sslCertPath: str(p.sslcert),
    sslKeyPath: str(p.sslkey),
    sslRootCertPath: str(p.sslrootcert),
    statementTimeout: num(p.statement_timeout_ms),
    readOnlyMode: typeof ns.read_only === 'boolean' ? ns.read_only : p.access_mode === 'read',
    environment: oneOf(ENVIRONMENTS, ns.environment),
    group: str(ns.group),
    connectTimeout: num(ns.connect_timeout),
    applicationName: str(ns.application_name),
    options: str(ns.options),
    hidePlatformSchemas: typeof ns.hide_platform_schemas === 'boolean' ? ns.hide_platform_schemas : undefined,
    ssh: isTable(ns.ssh) && str(ns.ssh.host)
      ? {
          enabled: ns.ssh.enabled !== false,
          host: str(ns.ssh.host) as string,
          port: num(ns.ssh.port) ?? 22,
          username: str(ns.ssh.username) ?? '',
        }
      : undefined,
  }) as Omit<ConnectionInfo, 'id' | 'password'>;

  if (p.access_mode === 'admin') {
    warnings.push('access_mode "admin" has no extension equivalent; imported as a writable connection.');
  }
  return { name, connection, warnings };
}

export interface ParsedNexqlConfig {
  /** Top-level keys other than `profiles` (default_profile, deny_tables, ...), preserved on merge. */
  topLevel: TomlTable;
  profiles: Record<string, unknown>;
}

export function parseNexqlConfig(text: string): ParsedNexqlConfig {
  const doc = parse(text) as TomlTable;
  const { profiles, ...topLevel } = doc;
  return { topLevel, profiles: isTable(profiles) ? profiles : {} };
}

export function importProfiles(text: string): ImportedProfile[] {
  const { profiles } = parseNexqlConfig(text);
  return Object.keys(profiles).map((n) => profileToConnection(n, profiles[n]));
}

/** Unique profile names; duplicate display names get a numeric suffix. */
function uniqueNames(conns: ConnectionInfo[]): string[] {
  const used = new Set<string>();
  return conns.map((c) => {
    const base = (c.name || `${c.host}:${c.port}/${c.database ?? ''}`).trim();
    let n = base;
    for (let i = 2; used.has(n); i++) {
      n = `${base} (${i})`;
    }
    used.add(n);
    return n;
  });
}

export type ExportMode = 'replace' | 'merge';

/**
 * Serialize connections to config TOML. With `existingText` and mode "merge",
 * existing profiles and top-level keys are kept (same-named profiles are overwritten);
 * with "replace", only the profiles table is replaced and top-level keys are kept.
 */
export function exportToToml(
  conns: ConnectionInfo[],
  opts: { existingText?: string; mode?: ExportMode; allowAgentWrites?: boolean } = {},
): string {
  const existing = opts.existingText?.trim() ? parseNexqlConfig(opts.existingText) : undefined;
  const profiles: TomlTable = opts.mode === 'merge' && existing ? { ...existing.profiles } : {};
  const names = uniqueNames(conns);
  conns.forEach((c, i) => {
    profiles[names[i]] = connectionToProfile(c, { allowAgentWrites: opts.allowAgentWrites });
  });
  const doc: TomlTable = { ...(existing?.topLevel ?? {}), profiles };
  const header =
    '# .nexql/config.toml - shared by the NexQL VS Code extension and nexql-mcp.\n' +
    '# Secret-free. Credentials stay in each developer keyring.\n\n';
  return header + stringify(doc) + '\n';
}
