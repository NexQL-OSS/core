import * as fs from 'fs';
import * as path from 'path';
import type { McpLaunchDescriptor } from '../../pro/api';

/** Command + args used when no vendored binary is present (matches the documented install). */
export const NEXQL_MCP_NPX_COMMAND = 'npx';
export const NEXQL_MCP_NPX_ARGS: readonly string[] = ['-y', 'nexql-mcp@latest', '--stdio'];

export type McpLaunchSource = 'vendored' | 'npx';

export interface DefaultMcpLaunch extends McpLaunchDescriptor {
  source: McpLaunchSource;
}

export interface DefaultLaunchEnv {
  platform: NodeJS.Platform;
  arch: string;
  /** Returns true when `p` is an existing executable regular file. */
  isExecutableFile(p: string): boolean;
}

const realEnv: DefaultLaunchEnv = {
  platform: process.platform,
  arch: process.arch,
  isExecutableFile(p: string): boolean {
    try {
      const stat = fs.statSync(p);
      if (!stat.isFile()) return false;
      return process.platform === 'win32' || (stat.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  },
};

/** `<extensionPath>/bin/nexql-mcp/<platform>-<arch>/nexql-mcp[.exe]` */
export function vendoredBinaryPath(
  extensionPath: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string {
  const exe = platform === 'win32' ? 'nexql-mcp.exe' : 'nexql-mcp';
  return path.join(extensionPath, 'bin', 'nexql-mcp', `${platform}-${arch}`, exe);
}

/**
 * Free-build launch resolution. Order:
 *   1. vendored binary for this platform under `bin/nexql-mcp/` (when present and executable)
 *   2. `npx -y nexql-mcp@latest --stdio`
 *
 * No `--config`/env is passed: nexql-mcp reads the user's own profiles from
 * `~/.config/nexql-mcp/`.
 */
export function resolveDefaultMcpLaunch(
  extensionPath: string,
  env: DefaultLaunchEnv = realEnv,
): DefaultMcpLaunch {
  const bin = vendoredBinaryPath(extensionPath, env.platform, env.arch);
  if (env.isExecutableFile(bin)) {
    return { command: bin, args: ['--stdio'], env: {}, source: 'vendored' };
  }
  return { command: NEXQL_MCP_NPX_COMMAND, args: [...NEXQL_MCP_NPX_ARGS], env: {}, source: 'npx' };
}
