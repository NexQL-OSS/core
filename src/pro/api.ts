import * as vscode from 'vscode';
import { ConnectionManager } from '../services/ConnectionManager';
import { SecretStorageService } from '../services/SecretStorageService';
import { LicenseService } from '../services/LicenseService';
import { TelemetryService } from '../services/TelemetryService';
import { MessageHandlerRegistry } from '../services/MessageHandler';
import { NotebookBuilder } from '../commands/helper';
import type { ConnectionConfig } from '../common/types';

/** Params for ChatViewProvider.openBackupToolsAssistant (Backup & Restore panel). */
export interface OpenBackupToolsAssistantParams {
  scenario: 'version_banner' | 'tool_log';
  connectionId: string;
  databaseLabel: string;
  databaseName: string;
  connection?: ConnectionConfig;
  toolLog?: string;
  serverMajor: number;
  pgDumpMajor: number;
  pgRestoreMajor: number;
}

/**
 * Minimal interface for the chat view provider that core code may call.
 * The concrete ChatViewProvider class lives in packages/pro/src — core only
 * ever holds this type-safe interface reference.
 */
export interface IChatViewProvider {
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void>;
  sendToChat(data: { query: string; results?: string; message: string }): void | Promise<void>;
  attachDbObject(dbObject: any): void | Promise<void>;
  syncSentinelContext?(context: any): void;
  handleExplainError?(error: string, query: string): void | Promise<void>;
  handleFixQuery?(error: string, query: string): void | Promise<void>;
  handleAnalyzeData?(data: any, query: string, rowCount: number): void | Promise<void>;
  handleOptimizeQuery?(query: string, executionTime: number): void | Promise<void>;
  openBackupToolsAssistant(params: OpenBackupToolsAssistantParams): void | Promise<void>;
  refreshModelInfo(): void;
  /** Open NexQL Bot in an editor column beside the active editor (Pro). */
  openInEditor?(column?: vscode.ViewColumn): Promise<void>;
  setConnectionContext?(
    connectionId: string,
    database: string,
    source: 'explicit' | 'guess',
  ): void;
  /** @deprecated Query Studio no longer embeds chat — use openInEditor. */
  attachStudioAgent?(
    webview: vscode.Webview,
    studioUri: vscode.Uri,
    connectionId: string,
    database: string,
  ): void;
  detachStudioAgent?(webview: vscode.Webview): void;
  handleWebviewMessage?(webview: vscode.Webview, data: unknown): Promise<void>;
  confirmWriteViaWebview?(req: {
    sql: string;
    reason: string;
    classification: 'ddl' | 'dml' | 'destructive';
    impact?: string;
  }): Promise<{ approved: boolean }>;
}

/** Command/args/env bundle for spawning nexql-mcp via stdio. */
export interface McpLaunchDescriptor {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Pro-supplied launch resolver. Called each time a client starts the `NexQL`
 * MCP server; replaces core's default (vendored binary / `npx`).
 */
export type McpLaunchResolver = () => Promise<McpLaunchDescriptor> | McpLaunchDescriptor;

/**
 * Handle to the single `NexQL` MCP server provider that core registers with
 * VS Code (`src/features/mcp`). Pro never registers its own provider; it
 * customises this one.
 */
export interface IMcpRegistration {
  /** Replace the default launch (managed host, ephemeral profile, ...). Dispose to restore the default. */
  setLaunchResolver(resolver: McpLaunchResolver | undefined): vscode.Disposable;
  /** Ask VS Code to re-query the server definition (e.g. after the managed profile changed). */
  refresh(): void;
}

/**
 * Minimal interface for the MCP host that core settings UI may call.
 * Concrete impl: `NexqlMcpStdioHost` in packages/pro (stdio spawn of nexql-mcp).
 */
export interface McpServerStatus {
  mode: 'stdio' | 'http';
  ready: boolean;
  /** Absolute path to the nexql-mcp binary (stdio). */
  binaryPath: string;
  /** Ephemeral config.toml path (stdio). */
  configPath?: string;
  binarySource?: string;
  version?: string;
  /** Latest `nexql-mcp` version published to npm, when known (best-effort, may be stale/undefined offline). */
  latestVersion?: string;
  /** True when `latestVersion` is a confirmed newer release than `version`. */
  updateAvailable?: boolean;
  /** Legacy HTTP fields — unused after Phase 7 stdio cutover. */
  port?: number;
  token?: string;
  /** Connections omitted from the ephemeral profile (e.g. SSH-tunneled). */
  skippedConnections?: string[];
  /** True when profile/binary changed and the MCP client must reconnect. */
  restartRequired: boolean;
  /** Monotonic counter bumped on profile/binary regeneration. */
  generation: number;
}

export interface IMcpServer {
  start(): Promise<McpServerStatus>;
  restart(): Promise<McpServerStatus>;
  /**
   * Re-checks the npm registry for a newer `nexql-mcp` release and updates
   * `info.latestVersion`/`info.updateAvailable`. `force` bypasses the cache
   * (used by the Settings page's manual "Check for update" button).
   */
  checkForUpdate?(force?: boolean): Promise<McpServerStatus>;
  /** Drop the ephemeral profile and signal that MCP clients must reconnect. */
  invalidate(): void;
  getStdioLaunch(options?: { managedExtension?: boolean }): McpLaunchDescriptor;
  readonly info: McpServerStatus | undefined;
  /** Active workspace connection context reflected in the ephemeral profile. */
  activeConnectionContext?: { connectionId: string; database?: string };
  readonly onDidChange?: vscode.Event<void>;
  getInstance?(): IMcpServer | undefined;
}

/**
 * NexqlCoreApi defines the surface area of public core services
 * shared with the premium (Pro) components.
 */
export interface NexqlCoreApi {
  apiVersion: string;
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
  connectionManager: ConnectionManager;
  secretStorageService: SecretStorageService;
  licenseService: LicenseService;
  telemetryService: TelemetryService;
  messageHandlerRegistry: MessageHandlerRegistry;
  notebookBuilder: typeof NotebookBuilder;

  // Decoupled chat view provider accessors
  setChatViewProvider(provider: IChatViewProvider | undefined): void;
  getChatViewProvider(): IChatViewProvider | undefined;

  /**
   * Core-owned MCP server registration. Undefined when the host lacks
   * `vscode.lm.registerMcpServerDefinitionProvider` (older VS Code, Cursor).
   */
  mcp?: IMcpRegistration;

  // Optional: MCP server accessor (set by pro during activatePro)
  setMcpServer?(server: IMcpServer): void;
  getMcpServer?(): IMcpServer | undefined;

  // Optional: AI Service accessor (set by pro during activatePro)
  setAiService?(service: any): void;
  getAiService?(): any;
}
