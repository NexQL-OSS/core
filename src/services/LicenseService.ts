import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { SecretStorageService } from './SecretStorageService';
import { getDeviceName } from './deviceIdentity';
import { buildLicenseUrl } from './licensePolicy';

export type LicenseTier = 'free' | 'sponsor' | 'singularity';

/** Persisted entitlement snapshot. Lives in SecretStorage. */
interface LicenseCache {
  licenseKey: string;
  instanceId: string;
  tier: LicenseTier;
  status: string;
  validatedAt: number;
  expiresAt: number | null;
  gracePeriodStartedAt: number | null;
  /** Owner email for server-side device/history management. */
  email?: string | null;
}

interface ValidateResponse {
  valid: boolean;
  tier?: LicenseTier;
  status?: string;
  expiresAt?: number | null;
  reason?: string;
  expiringSoon?: boolean;
  graceUntil?: number | null;
  devicesPruned?: Array<{ instanceId: string; deviceName: string | null }>;
}

export interface LicenseServerStatus {
  found: boolean;
  tier?: LicenseTier;
  status?: string;
  period?: string;
  currency?: string;
  expiresAt?: number | null;
  email?: string | null;
  hasSubscription?: boolean;
  memberSince?: number | null;
  renewalCount?: number;
  deviceLimit?: number;
  devices?: Array<{
    instanceId: string;
    deviceName: string | null;
    lastSeen: number | null;
  }>;
}

export interface LicenseHistoryEvent {
  eventType: string;
  detail: Record<string, unknown>;
  source: string;
  createdAt: number | null;
}

export const LICENSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const LICENSE_OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_INTERVALS_MS = [15 * 60_000, 30 * 60_000, 60 * 60_000] as const;
const FOCUS_ATTEMPT_THROTTLE_MS = 60_000;
const LICENSE_HTTP_TIMEOUT_MS = 10_000;

interface LicenseHttpResult {
  statusCode?: number;
  body: string;
}

/**
 * POST helper. `LicenseService.transport` points here so unit tests can
 * replace the socket call. It is not read from user settings.
 */
function sendLicenseHttp(url: URL, body: string): Promise<LicenseHttpResult> {
  const lib = url.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: LICENSE_HTTP_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Manages NexQL license activation and tier entitlement.
 *
 * Source of truth is the server (`/api/license/validate` on
 * https://nexql.astrx.dev/api). Shipped builds ignore
 * `postgresExplorer.license.endpoint`; only the Extension Development Host
 * may redirect it. A cached snapshot in SecretStorage lets the extension
 * answer `getTier()` synchronously and keep working offline within a 7-day
 * grace window. Designed to fail OPEN to `free` (never blocks startup,
 * never throws into callers, never promotes a tier on network failure).
 */
export class LicenseService {
  private static instance: LicenseService;
  /** Socket implementation. Tests replace this; production always uses `sendLicenseHttp`. */
  private static transport: (url: URL, body: string) => Promise<LicenseHttpResult> = sendLicenseHttp;
  private cache: LicenseCache | null = null;
  private revalidating = false;
  private lastAttemptAt = 0;
  private retryTimer: ReturnType<typeof setInterval> | undefined;
  private consecutiveFailures = 0;

  private readonly _onDidChangeLicense = new vscode.EventEmitter<LicenseTier>();
  public readonly onDidChangeLicense = this._onDidChangeLicense.event;

  private constructor(private readonly context: vscode.ExtensionContext) { }

  public static getInstance(context?: vscode.ExtensionContext): LicenseService {
    if (!LicenseService.instance) {
      if (!context) {
        throw new Error('LicenseService not initialized');
      }
      LicenseService.instance = new LicenseService(context);
    }
    return LicenseService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      const raw = await SecretStorageService.getInstance().getLicenseCache();
      if (raw) {
        this.cache = JSON.parse(raw) as LicenseCache;
      }
    } catch {
      this.cache = null;
    }
    if (this.cache && this.isStale()) {
      void this.revalidate();
    }
    this.ensureBackgroundRetry();
    this._onDidChangeLicense.fire(this.getTier());
  }

  public getTier(): LicenseTier {
    const tier = this.entitledTier();
    if (tier !== 'free' && this.isStale()) {
      this.ensureBackgroundRetry();
    }
    if (tier !== 'free' && this.shouldAttempt()) {
      void this.revalidate();
    }
    return tier;
  }

  public onWindowFocused(): void {
    if (this.cache && this.entitledTier() !== 'free' && this.shouldAttempt()) {
      void this.revalidate();
    }
  }

  private entitledTier(): LicenseTier {
    return this.entitled() ? this.cache!.tier : 'free';
  }

  private shouldAttempt(): boolean {
    return this.isStale() && !this.revalidating && Date.now() - this.lastAttemptAt > FOCUS_ATTEMPT_THROTTLE_MS;
  }

  private needsBackgroundRetry(): boolean {
    return !!this.cache && this.isStale();
  }

  private retryIntervalMs(): number {
    return RETRY_INTERVALS_MS[Math.min(this.consecutiveFailures, RETRY_INTERVALS_MS.length - 1)];
  }

  private stopBackgroundRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  private scheduleBackgroundRetry(): void {
    this.stopBackgroundRetry();
    if (!this.needsBackgroundRetry()) {
      return;
    }
    this.retryTimer = setInterval(() => this.tickBackgroundRetry(), this.retryIntervalMs());
    this.retryTimer.unref?.();
  }

  private ensureBackgroundRetry(): void {
    if (this.needsBackgroundRetry()) {
      this.scheduleBackgroundRetry();
    } else {
      this.stopBackgroundRetry();
    }
  }

  private tickBackgroundRetry(): void {
    if (!this.needsBackgroundRetry()) {
      this.stopBackgroundRetry();
      return;
    }
    if (!this.revalidating) {
      void this.revalidate();
    }
  }

  public isPaid(): boolean {
    return this.getTier() !== 'free';
  }

  public getLicenseKey(): string | null {
    return this.cache?.licenseKey ?? null;
  }

  public getOwnerEmail(): string | null {
    return this.cache?.email ?? null;
  }

  public async setOwnerEmail(email: string): Promise<void> {
    if (!this.cache) return;
    this.cache.email = email.trim().toLowerCase();
    await this.persist();
  }

  private entitled(): boolean {
    const c = this.cache;
    if (!c) return false;
    if (c.status !== 'active') return false;
    if (c.expiresAt && Date.now() > c.expiresAt) return false;
    if (Date.now() - c.validatedAt <= LICENSE_CACHE_TTL_MS) return true;
    if (c.gracePeriodStartedAt && Date.now() - c.gracePeriodStartedAt > LICENSE_OFFLINE_GRACE_MS) {
      return false;
    }
    return true;
  }

  private isStale(): boolean {
    return !!this.cache && Date.now() - this.cache.validatedAt > LICENSE_CACHE_TTL_MS;
  }

  public async activate(licenseKey: string): Promise<{ ok: boolean; message: string; tier?: LicenseTier }> {
    const key = (licenseKey || '').trim().toUpperCase();
    if (!key) {
      return { ok: false, message: 'Please enter a license key.' };
    }

    let res: ValidateResponse;
    try {
      res = await this.callValidate(key);
    } catch {
      return { ok: false, message: 'Could not reach the license server. Check your connection and try again.' };
    }

    if (!res.valid || !res.tier) {
      const reason =
        res.reason === 'device_limit'
          ? 'This license has reached its device limit.'
          : res.status === 'cancelled'
            ? 'This subscription was cancelled.'
            : 'License key not valid or inactive.';
      return { ok: false, message: reason };
    }

    this.cache = {
      licenseKey: key,
      instanceId: vscode.env.machineId,
      tier: res.tier,
      status: res.status || 'active',
      validatedAt: Date.now(),
      expiresAt: res.expiresAt ?? null,
      gracePeriodStartedAt: null,
      email: this.cache?.email ?? null,
    };
    await this.persist();
    this._onDidChangeLicense.fire(res.tier);

    if (res.expiringSoon) {
      void this.maybeWarnExpiringSoon(res.expiresAt);
    }

    void this.maybeNotifyDevicesPruned(res.devicesPruned);

    if (res.tier === 'sponsor' || res.tier === 'singularity') {
      const { getSyncBootstrapHook } = await import('./syncRegistry');
      void getSyncBootstrapHook()?.(this.context);
    }

    this.ensureBackgroundRetry();
    return { ok: true, message: `Activated NexQL ${this.tierLabel(res.tier)}.`, tier: res.tier };
  }

  public async deactivate(): Promise<void> {
    this.stopBackgroundRetry();
    this.cache = null;
    await SecretStorageService.getInstance().deleteLicenseCache();
    this._onDidChangeLicense.fire('free');
  }

  public getStatus(): { tier: LicenseTier; offline: boolean; expiresAt: number | null } {
    const offline = this.entitled() && this.isStale();
    return {
      tier: this.getTier(),
      offline,
      expiresAt: this.cache?.expiresAt ?? null,
    };
  }

  public async fetchServerStatus(email?: string | null): Promise<LicenseServerStatus | null> {
    const key = this.cache?.licenseKey;
    if (!key) return null;
    try {
      const body: Record<string, string> = { licenseKey: key };
      const resolvedEmail = (email ?? this.cache?.email)?.trim();
      if (resolvedEmail) {
        body.email = resolvedEmail;
      }
      return await this.callApi<LicenseServerStatus>('/license/status', body);
    } catch {
      return null;
    }
  }

  public async fetchHistory(email: string): Promise<LicenseHistoryEvent[]> {
    const key = this.cache?.licenseKey;
    if (!key || !email.trim()) return [];
    try {
      const res = await this.callApi<{ ok: boolean; events: LicenseHistoryEvent[] }>(
        '/license/history',
        { licenseKey: key, email: email.trim(), limit: 50 },
      );
      return res?.events ?? [];
    } catch {
      return [];
    }
  }

  public async removeDevice(email: string, instanceId: string): Promise<{ ok: boolean; message: string }> {
    const key = this.cache?.licenseKey;
    if (!key) {
      return { ok: false, message: 'No license is active on this machine.' };
    }
    try {
      const res = await this.callApi<{ ok: boolean; error?: string }>(
        '/license/devices',
        { licenseKey: key, email: email.trim(), action: 'remove', instanceId },
      );
      if (!res?.ok) {
        return { ok: false, message: 'Could not remove device. Check your email and try again.' };
      }
      return { ok: true, message: 'Device removed.' };
    } catch {
      return { ok: false, message: 'Could not reach the license server.' };
    }
  }

  private async revalidate(): Promise<void> {
    if (this.revalidating || !this.cache) return;
    this.revalidating = true;
    this.lastAttemptAt = Date.now();
    const before = this.entitledTier();
    try {
      const res = await this.callValidate(this.cache.licenseKey);
      if (res.valid && res.tier) {
        this.consecutiveFailures = 0;
        this.cache = {
          ...this.cache,
          tier: res.tier,
          status: res.status || 'active',
          validatedAt: Date.now(),
          expiresAt: res.expiresAt ?? null,
          gracePeriodStartedAt: null,
        };
        await this.persist();
        if (res.expiringSoon) {
          void this.maybeWarnExpiringSoon(res.expiresAt);
        }
        void this.maybeNotifyDevicesPruned(res.devicesPruned);
      } else {
        this.cache = null;
        await SecretStorageService.getInstance().deleteLicenseCache();
      }
    } catch {
      this.consecutiveFailures++;
      if (this.cache && !this.cache.gracePeriodStartedAt) {
        this.cache.gracePeriodStartedAt = Date.now();
        await this.persist();
      }
    } finally {
      this.revalidating = false;
      const after = this.entitledTier();
      if (after !== before) {
        this._onDidChangeLicense.fire(after);
      }
      this.ensureBackgroundRetry();
    }
  }

  private async maybeWarnExpiringSoon(expiresAt?: number | null): Promise<void> {
    if (!expiresAt) return;
    const when = new Date(expiresAt).toLocaleDateString();
    const choice = await vscode.window.showWarningMessage(
      `Your NexQL license renews or expires on ${when}.`,
      'Manage License',
    );
    if (choice === 'Manage License') {
      void vscode.commands.executeCommand('postgres-explorer.license.manage');
    }
  }

  private async maybeNotifyDevicesPruned(
    devicesPruned?: Array<{ instanceId: string; deviceName: string | null }>,
  ): Promise<void> {
    if (!devicesPruned?.length) {
      return;
    }
    const n = devicesPruned.length;
    const names = devicesPruned
      .map((d) => d.deviceName || d.instanceId.slice(0, 8))
      .join(', ');
    await vscode.window.showWarningMessage(
      `${n} older device${n === 1 ? '' : 's'} (${names}) ${n === 1 ? 'was' : 'were'} removed to stay within the 4-device limit.`,
      'Manage License',
    );
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    await SecretStorageService.getInstance().setLicenseCache(JSON.stringify(this.cache));
  }

  private tierLabel(tier: LicenseTier): string {
    return tier === 'free' ? 'Free' : tier[0].toUpperCase() + tier.slice(1);
  }

  public async refreshDeviceName(deviceName?: string): Promise<void> {
    if (!this.cache?.licenseKey) {
      return;
    }
    const resolved = (deviceName ?? getDeviceName(this.context) ?? '').trim();
    if (!resolved) {
      return;
    }
    try {
      await this.callValidate(this.cache.licenseKey, resolved);
    } catch {
      // Best-effort — local name is already saved.
    }
  }

  private callValidate(licenseKey: string, deviceName?: string): Promise<ValidateResponse> {
    const payload: Record<string, string> = {
      licenseKey,
      instanceId: vscode.env.machineId,
    };
    const resolvedName = (deviceName ?? getDeviceName(this.context) ?? '').trim();
    if (resolvedName) {
      payload.deviceName = resolvedName;
    }
    return this.callApi<ValidateResponse>('/license/validate', payload);
  }

  private callApi<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const url = buildLicenseUrl(path);
    const body = JSON.stringify(payload);

    return LicenseService.transport(url, body).then((res) => {
      if (res.statusCode === 404) {
        return { found: false, valid: false, status: 'unknown' } as T;
      }
      if (!res.statusCode || res.statusCode >= 500) {
        throw new Error(`server ${res.statusCode}`);
      }
      try {
        return JSON.parse(res.body) as T;
      } catch {
        throw new Error('invalid json');
      }
    });
  }

  public dispose(): void {
    this.stopBackgroundRetry();
    this._onDidChangeLicense.dispose();
  }
}
