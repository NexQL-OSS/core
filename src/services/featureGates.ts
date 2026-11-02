import * as vscode from 'vscode';
import { LicenseService, LicenseTier } from './LicenseService';
import { isProBuild } from '../common/buildTier';
import { TelemetryService } from './TelemetryService';
import { readEnforcement, type LicenseEnforcement } from './licensePolicy';

/** Fire-and-forget gate telemetry; never let instrumentation break gating. */
function reportGate(feature: ProFeature, mode: LicenseEnforcement, allowed: boolean, paid: boolean): void {
  try {
    TelemetryService.getInstance().trackGateDecision(feature, mode, allowed, paid);
  } catch {
    /* telemetry is best-effort */
  }
}

/** Premium features. All features are available on free tier except team/singularity-locked capabilities. */
export enum ProFeature {
  AiAssistant = 'aiAssistant',
  SchemaDiff = 'schemaDiff',
  SchemaDesigner = 'schemaDesigner',
  ExplainStudio = 'explainStudio',
  Dashboard = 'dashboard',
  UnlimitedSavedQueries = 'unlimitedSavedQueries',
  BackupRestore = 'backupRestore',
  DataImport = 'dataImport',
  UnlimitedNotebooks = 'unlimitedNotebooks',
  AuditLog = 'auditLog',
  /** Manual single-device backup to the user's own Postgres (free tier). */
  CloudBackup = 'cloudBackup',
  /** Automatic multi-device sync via consumer storage backends (sponsor+). */
  CloudSync = 'cloudSync',
  /** Sharing synced items with other team members (singularity). */
  SyncSharing = 'syncSharing',
  /** Re-binding a free-tier backup to a new device (metered on free). */
  SyncDeviceRebind = 'syncDeviceRebind',
  DbIndexBuild = 'dbIndexBuild',
  DbIndexAuto = 'dbIndexAuto',
  DbIndexMulti = 'dbIndexMulti',
  DbIndexEmbed = 'dbIndexEmbed',
  AgenticModes = 'agenticModes',
  QueryStudio = 'queryStudio',
}

const FEATURE_LABELS: Record<ProFeature, string> = {
  [ProFeature.AiAssistant]: 'AI Assistant',
  [ProFeature.SchemaDiff]: 'Schema Diff',
  [ProFeature.SchemaDesigner]: 'Schema Designer / ERD',
  [ProFeature.ExplainStudio]: 'Visual EXPLAIN',
  [ProFeature.Dashboard]: 'Real-time Dashboard',
  [ProFeature.UnlimitedSavedQueries]: 'Unlimited Saved Queries',
  [ProFeature.BackupRestore]: 'Backup & Restore',
  [ProFeature.DataImport]: 'Data Import',
  [ProFeature.UnlimitedNotebooks]: 'Unlimited Notebooks',
  [ProFeature.AuditLog]: 'Production Audit Log',
  [ProFeature.CloudBackup]: 'Cloud Backup',
  [ProFeature.CloudSync]: 'Cloud Sync',
  [ProFeature.SyncSharing]: 'Team Sync Sharing',
  [ProFeature.SyncDeviceRebind]: 'Backup Device Rebind',
  [ProFeature.DbIndexBuild]: 'Database Index Build',
  [ProFeature.DbIndexAuto]: 'Auto Database Indexing',
  [ProFeature.DbIndexMulti]: 'Multi-Database Indexing',
  [ProFeature.DbIndexEmbed]: 'Semantic Database Indexing',
  [ProFeature.AgenticModes]: 'Agentic Mode Loops',
  [ProFeature.QueryStudio]: 'Query Studio',
};

/** Ordering for entitlement comparison: a tier unlocks everything at or below its rank. */
const TIER_RANK: Record<LicenseTier, number> = { free: 0, sponsor: 1, singularity: 2 };

export const TIER_DISPLAY: Record<LicenseTier, string> = {
  free: 'Free',
  sponsor: 'Sponsor',
  singularity: 'Singularity (Team)',
};

/**
 * Minimum tier that fully unlocks a feature. Features absent here unlock at
 * `sponsor` (any paid tier). `singularity`-level features are team
 * capabilities and are locked for lower tiers.
 */
const FEATURE_MIN_TIER: Partial<Record<ProFeature, LicenseTier>> = {
  [ProFeature.AuditLog]: 'singularity',
  [ProFeature.CloudBackup]: 'free',
  [ProFeature.CloudSync]: 'sponsor',
  [ProFeature.SyncSharing]: 'singularity',
  [ProFeature.DbIndexAuto]: 'sponsor',
  [ProFeature.DbIndexMulti]: 'sponsor',
  [ProFeature.DbIndexEmbed]: 'sponsor',
};

/** User-facing upgrade copy for above-tier features. */
const TEAM_UPGRADE_MESSAGES: Partial<Record<ProFeature, string>> = {
  [ProFeature.CloudSync]: 'Automatic multi-device sync requires NexQL Sponsor or Teams.',
  [ProFeature.SyncSharing]: 'Team sync sharing requires a Teams (Singularity) subscription.',
};

export function minTierFor(feature: ProFeature): LicenseTier {
  return FEATURE_MIN_TIER[feature] ?? 'sponsor';
}

export function featureLabel(feature: ProFeature): string {
  return FEATURE_LABELS[feature];
}

export function meetsTier(actual: LicenseTier, required: LicenseTier): boolean {
  return TIER_RANK[actual] >= TIER_RANK[required];
}



/**
 * Storage backends per tier (cumulative). Free = bring-your-own Postgres,
 * manual sync, single device. Sponsor adds consumer clouds + auto multi-device
 * sync. Singularity adds hosted NexQL Cloud and team sharing.
 */
const SYNC_PROVIDERS_BY_TIER: Record<LicenseTier, ReadonlyArray<string>> = {
  free: ['postgres'],
  sponsor: ['cloud', 'postgres'],
  singularity: ['cloud', 'postgres'],
};

export function allowedSyncProviders(): ReadonlyArray<string> {
  if (enforcement() === 'off') {
    return SYNC_PROVIDERS_BY_TIER.singularity;
  }
  return SYNC_PROVIDERS_BY_TIER[LicenseService.getInstance().getTier()];
}

export function isSyncProviderAllowed(providerId: string): boolean {
  return allowedSyncProviders().includes(providerId);
}

/** Tier required to use a given sync backend (for upgrade copy). */
export function syncProviderMinTier(providerId: string): LicenseTier {
  if (SYNC_PROVIDERS_BY_TIER.free.includes(providerId)) {
    return 'free';
  }
  return SYNC_PROVIDERS_BY_TIER.sponsor.includes(providerId) ? 'sponsor' : 'singularity';
}

const PRICING_URL = 'https://nexql.astrx.dev/#pricing';

/**
 * Effective enforcement. Shipped builds always return `freemium`.
 * `off` is honored only in the Extension Development Host.
 * Legacy `hard`/`soft` (and any other value) map to `freemium`.
 */
function enforcement(): LicenseEnforcement {
  return readEnforcement();
}

/**
 * Synchronous unlock check for render-time gating (e.g. webviews). On free tier,
 * all features except singularity-locked team capabilities are enabled.
 */
export function isProFeatureEnabled(feature: ProFeature): boolean {
  if (
    feature === ProFeature.AiAssistant ||
    feature === ProFeature.AgenticModes ||
    feature === ProFeature.DataImport ||
    feature === ProFeature.BackupRestore ||
    feature === ProFeature.DbIndexBuild ||
    feature === ProFeature.DbIndexAuto ||
    feature === ProFeature.DbIndexMulti ||
    feature === ProFeature.DbIndexEmbed
  ) {
    return true;
  }
  if (enforcement() === 'off') {
    return true;
  }
  const tier = LicenseService.getInstance().getTier();
  if (meetsTier(tier, minTierFor(feature))) {
    return true;
  }
  // Free tier: allow all non-team features (anything below singularity).
  return tier === 'free' && minTierFor(feature) !== 'singularity';
}

/**
 * Action gate. Returns true if the action may proceed.
 * Paid → always. Free → allow all non-team features; singularity-locked features are blocked.
 */
export async function requirePro(feature: ProFeature, _context?: vscode.ExtensionContext): Promise<boolean> {
  if (
    feature === ProFeature.AiAssistant ||
    feature === ProFeature.AgenticModes ||
    feature === ProFeature.DataImport ||
    feature === ProFeature.BackupRestore ||
    feature === ProFeature.DbIndexBuild ||
    feature === ProFeature.DbIndexAuto ||
    feature === ProFeature.DbIndexMulti ||
    feature === ProFeature.DbIndexEmbed
  ) {
    return true;
  }
  const mode = enforcement();
  if (mode === 'off') {
    return true;
  }

  const tier = LicenseService.getInstance().getTier();
  const paid = tier !== 'free';
  const required = minTierFor(feature);

  if (meetsTier(tier, required)) {
    reportGate(feature, mode, true, paid);
    return true;
  }

  // Free tier: allow all non-team features. Only singularity-locked capabilities are paid-only.
  if (!paid && required !== 'singularity') {
    reportGate(feature, mode, true, paid);
    return true;
  }

  // Paid but below required tier, or free user hitting a team feature.
  reportGate(feature, mode, false, paid);
  promptUpgrade(
    TEAM_UPGRADE_MESSAGES[feature] ??
      `${FEATURE_LABELS[feature]} requires NexQL ${TIER_DISPLAY[required]}.`,
  );
  return false;
}

function promptUpgrade(message: string): void {
  // Free/OSS builds never surface upgrade prompts (defensive: gates should
  // not even be reachable there).
  if (!isProBuild()) {
    return;
  }
  void vscode.window
    .showInformationMessage(message, 'View Plans', 'Activate License')
    .then((choice) => handleUpgradeChoice(choice));
}

async function handleUpgradeChoice(choice: string | undefined): Promise<void> {
  if (choice === 'View Plans') {
    await vscode.env.openExternal(vscode.Uri.parse(PRICING_URL));
  } else if (choice === 'Activate License') {
    await vscode.commands.executeCommand('postgres-explorer.license.activate');
  }
}

/** Inline upgrade HTML for webviews that gate synchronously (paid-only features). */
export function getUpgradeHtml(feature: ProFeature): string {
  const label = FEATURE_LABELS[feature];
  const required = minTierFor(feature);
  const plans = required === 'singularity' ? `NexQL ${TIER_DISPLAY.singularity}` : 'NexQL Sponsor or Singularity';
  // Brand screen: ribbon, display face and a serif emphasis word. Self-contained (no shared CSS),
  // so every colour is a --vscode-* variable with the brand fallbacks from docs/DESIGN_SYSTEM.md.
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      :root {
        --accent: var(--vscode-nexql-accent, var(--vscode-textLink-foreground));
        --accent-ink: var(--vscode-nexql-accentForeground, var(--vscode-button-foreground, #0b0e14));
        --border: color-mix(in srgb, var(--vscode-widget-border) 65%, transparent);
        --ribbon: linear-gradient(105deg, var(--vscode-nexql-ribbon-blue, #3d6fe0), var(--vscode-nexql-ribbon-indigo, #6c4cd6) 30%,
          var(--vscode-nexql-ribbon-purple, #a23bc9) 52%, var(--vscode-nexql-ribbon-magenta, #e0388f) 72%,
          var(--vscode-nexql-ribbon-orange, #f26b3a) 90%, var(--vscode-nexql-ribbon-amber, #f5b23a));
        --wash: radial-gradient(60% 80% at 0% 0%, color-mix(in srgb, var(--vscode-nexql-ribbon-magenta, #e0388f) 10%, transparent), transparent 70%),
          radial-gradient(60% 80% at 100% 0%, color-mix(in srgb, var(--vscode-nexql-ribbon-blue, #3d6fe0) 12%, transparent), transparent 70%);
      }
      body { margin: 0; padding: 40px 20px; font-family: var(--vscode-font-family); font-size: 13px; line-height: 1.55;
             color: var(--vscode-foreground); background: var(--vscode-editor-background); }
      .card { max-width: 480px; margin: 0 auto; text-align: center; overflow: hidden; padding: 0 28px 28px;
              border: 1px solid var(--border); border-radius: 10px; background-image: var(--wash);
              background-color: color-mix(in srgb, var(--vscode-input-background) 88%, var(--vscode-editor-background));
              box-shadow: 2px 4px 8px color-mix(in srgb, #000 30%, transparent), inset 1px 1px 0 color-mix(in srgb, #fff 10%, transparent); }
      .ribbon { height: 3px; margin: 0 -28px 24px; background: var(--ribbon); }
      .pill { display: inline-block; padding: 2px 11px; border-radius: 999px; font-size: 11px;
              font-family: var(--vscode-editor-font-family, monospace); letter-spacing: 0.06em; text-transform: uppercase;
              color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
              background: color-mix(in srgb, var(--accent) 10%, transparent); }
      h2 { margin: 14px 0 8px; font-family: "Space Grotesk", "Avenir Next", "Segoe UI", system-ui, sans-serif;
           font-size: 26px; line-height: 1.15; letter-spacing: -0.02em; font-weight: 600; }
      h2 em { font-family: "Instrument Serif", "Iowan Old Style", Georgia, serif; font-weight: 400; font-size: 1.1em; color: var(--accent); }
      p { margin: 0; color: var(--vscode-descriptionForeground); }
      a.btn { display: inline-block; margin-top: 18px; padding: 8px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;
              background: var(--accent); color: var(--accent-ink); border: 1px solid var(--accent); }
      a.btn:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
      .hint { margin-top: 20px; font-size: 12px; }
      .vscode-high-contrast .card, .vscode-high-contrast-light .card { border-color: var(--vscode-contrastBorder, currentColor); background-image: none; box-shadow: none; }
      .vscode-high-contrast .ribbon, .vscode-high-contrast-light .ribbon { background: var(--vscode-contrastBorder, currentColor); height: 1px; }
    </style></head>
    <body>
      <div class="card">
        <div class="ribbon"></div>
        <span class="pill">Paid feature</span>
        <h2>Unlock <em>${label}</em></h2>
        <p>Upgrade to ${plans} to use ${label}.</p>
        <a class="btn" href="${PRICING_URL}">View plans</a>
        <p class="hint">Already subscribed? Run <b>NexQL: Activate License</b> from the command palette.</p>
      </div>
    </body></html>`;
}
