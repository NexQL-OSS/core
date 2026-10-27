import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';

import { LicenseService, LICENSE_CACHE_TTL_MS, LICENSE_OFFLINE_GRACE_MS } from '../../services/LicenseService';
import { SecretStorageService } from '../../services/SecretStorageService';
import { TelemetryService } from '../../services/TelemetryService';
import {
  isProFeatureEnabled,
  isSyncProviderAllowed,
  ProFeature,
  requirePro,
} from '../../services/featureGates';
import {
  CANONICAL_LICENSE_ENDPOINT,
  LICENSE_ENDPOINT_SETTING,
  LICENSE_ENFORCEMENT_SETTING,
  bindLicenseExtensionMode,
  buildLicenseUrl,
  isLicenseDevMode,
  readEnforcement,
  readLicenseEndpoint,
  resolveEnforcement,
  resolveLicenseEndpoint,
} from '../../services/licensePolicy';

const FAKE_ENDPOINT = 'http://127.0.0.1:3999/api';
const VALIDATE_PATH = '/license/validate';

function stubConfig(sandbox: sinon.SinonSandbox, values: Record<string, unknown>): void {
  sandbox.stub(vscode.workspace, 'getConfiguration').returns({
    get: (key: string, fallback?: unknown) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback),
  } as vscode.WorkspaceConfiguration);
}

function useMode(mode: vscode.ExtensionMode | 'unbound'): void {
  bindLicenseExtensionMode(mode === 'unbound' ? undefined : mode);
}

describe('license override policy', () => {
  const enforcementCases: Array<{
    name: string;
    configured: string | undefined;
    devMode: boolean;
    expected: 'off' | 'freemium';
  }> = [
    { name: 'production ignores off', configured: 'off', devMode: false, expected: 'freemium' },
    { name: 'development honors off', configured: 'off', devMode: true, expected: 'off' },
    { name: 'production keeps freemium', configured: 'freemium', devMode: false, expected: 'freemium' },
    { name: 'development keeps freemium', configured: 'freemium', devMode: true, expected: 'freemium' },
    { name: 'production treats missing as freemium', configured: undefined, devMode: false, expected: 'freemium' },
    { name: 'development treats missing as freemium', configured: undefined, devMode: true, expected: 'freemium' },
    { name: 'production maps legacy hard', configured: 'hard', devMode: false, expected: 'freemium' },
    { name: 'development maps legacy soft', configured: 'soft', devMode: true, expected: 'freemium' },
    { name: 'development ignores non-exact off', configured: 'OFF', devMode: true, expected: 'freemium' },
  ];

  for (const row of enforcementCases) {
    it(row.name, () => {
      expect(resolveEnforcement(row.configured, row.devMode)).to.equal(row.expected);
    });
  }

  const endpointCases: Array<{
    name: string;
    configured: string | undefined;
    devMode: boolean;
    expected: string;
  }> = [
    { name: 'production ignores custom endpoint', configured: FAKE_ENDPOINT, devMode: false, expected: CANONICAL_LICENSE_ENDPOINT },
    { name: 'development honors custom endpoint', configured: FAKE_ENDPOINT, devMode: true, expected: FAKE_ENDPOINT },
    { name: 'production ignores empty override', configured: '   ', devMode: false, expected: CANONICAL_LICENSE_ENDPOINT },
    { name: 'development falls back when blank', configured: '   ', devMode: true, expected: CANONICAL_LICENSE_ENDPOINT },
    { name: 'development trims the override', configured: `  ${FAKE_ENDPOINT}  `, devMode: true, expected: FAKE_ENDPOINT },
    { name: 'production ignores missing override', configured: undefined, devMode: false, expected: CANONICAL_LICENSE_ENDPOINT },
    { name: 'development uses canonical when unset', configured: undefined, devMode: true, expected: CANONICAL_LICENSE_ENDPOINT },
  ];

  for (const row of endpointCases) {
    it(row.name, () => {
      expect(resolveLicenseEndpoint(row.configured, row.devMode)).to.equal(row.expected);
    });
  }

  describe('host mode', () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      bindLicenseExtensionMode(undefined);
      sandbox.restore();
    });

    const modeCases: Array<{ name: string; mode: vscode.ExtensionMode | 'unbound'; dev: boolean }> = [
      { name: 'production', mode: vscode.ExtensionMode.Production, dev: false },
      { name: 'test host', mode: vscode.ExtensionMode.Test, dev: false },
      { name: 'development host', mode: vscode.ExtensionMode.Development, dev: true },
      { name: 'unbound before activate', mode: 'unbound', dev: false },
    ];

    for (const row of modeCases) {
      it(`treats ${row.name} as ${row.dev ? 'dev' : 'shipped'}`, () => {
        useMode(row.mode);
        stubConfig(sandbox, {
          [LICENSE_ENFORCEMENT_SETTING]: 'off',
          [LICENSE_ENDPOINT_SETTING]: FAKE_ENDPOINT,
        });

        expect(isLicenseDevMode()).to.equal(row.dev);
        expect(readEnforcement()).to.equal(row.dev ? 'off' : 'freemium');
        expect(readLicenseEndpoint()).to.equal(row.dev ? FAKE_ENDPOINT : CANONICAL_LICENSE_ENDPOINT);
        expect(buildLicenseUrl(VALIDATE_PATH).href).to.equal(
          `${row.dev ? FAKE_ENDPOINT : CANONICAL_LICENSE_ENDPOINT}${VALIDATE_PATH}`,
        );
      });
    }

    it('keeps gates on when configuration cannot be read', () => {
      useMode(vscode.ExtensionMode.Development);
      sandbox.stub(vscode.workspace, 'getConfiguration').throws(new Error('no workspace'));
      expect(readEnforcement()).to.equal('freemium');
      expect(readLicenseEndpoint()).to.equal(CANONICAL_LICENSE_ENDPOINT);
    });
  });
});

describe('feature gates honor enforcement only in development', () => {
  let sandbox: sinon.SinonSandbox;
  let tier: 'free' | 'singularity' = 'free';

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    tier = 'free';
    sandbox.stub(LicenseService, 'getInstance').returns({ getTier: () => tier } as LicenseService);
    sandbox.stub(TelemetryService, 'getInstance').returns({
      trackGateDecision: () => undefined,
    } as unknown as TelemetryService);
  });

  afterEach(() => {
    bindLicenseExtensionMode(undefined);
    sandbox.restore();
  });

  const gateCases: Array<{
    name: string;
    mode: vscode.ExtensionMode;
    enforcement: string;
    audit: boolean;
    cloud: boolean;
    require: boolean;
  }> = [
    { name: 'production ignores off', mode: vscode.ExtensionMode.Production, enforcement: 'off', audit: false, cloud: false, require: false },
    { name: 'test host ignores off', mode: vscode.ExtensionMode.Test, enforcement: 'off', audit: false, cloud: false, require: false },
    { name: 'development honors off', mode: vscode.ExtensionMode.Development, enforcement: 'off', audit: true, cloud: true, require: true },
    { name: 'production freemium stays locked for free', mode: vscode.ExtensionMode.Production, enforcement: 'freemium', audit: false, cloud: false, require: false },
    { name: 'development freemium stays locked for free', mode: vscode.ExtensionMode.Development, enforcement: 'freemium', audit: false, cloud: false, require: false },
  ];

  for (const row of gateCases) {
    it(row.name, async () => {
      useMode(row.mode);
      stubConfig(sandbox, { [LICENSE_ENFORCEMENT_SETTING]: row.enforcement });

      expect(isProFeatureEnabled(ProFeature.AuditLog)).to.equal(row.audit);
      expect(isSyncProviderAllowed('cloud')).to.equal(row.cloud);
      expect(await requirePro(ProFeature.AuditLog)).to.equal(row.require);
    });
  }

  it('production still honors a singularity entitlement when enforcement is off', async () => {
    tier = 'singularity';
    useMode(vscode.ExtensionMode.Production);
    stubConfig(sandbox, { [LICENSE_ENFORCEMENT_SETTING]: 'off' });

    expect(isProFeatureEnabled(ProFeature.AuditLog)).to.equal(true);
    expect(isSyncProviderAllowed('cloud')).to.equal(true);
    expect(await requirePro(ProFeature.SyncSharing)).to.equal(true);
  });
});

describe('LicenseService endpoint and fail-open', () => {
  let sandbox: sinon.SinonSandbox;
  const captured: URL[] = [];
  let httpsBehavior: 'sponsor' | 'singularity' | 'error';
  const originalTransport = (LicenseService as unknown as {
    transport: (url: URL, body: string) => Promise<{ statusCode?: number; body: string }>;
  }).transport;

  function installTransport(): void {
    (LicenseService as unknown as { transport: typeof originalTransport }).transport = async (url: URL) => {
      captured.push(url);
      const behavior = url.protocol === 'https:' ? httpsBehavior : 'singularity';
      if (behavior === 'error') {
        throw new Error('network down');
      }
      const tier = behavior === 'sponsor' ? 'sponsor' : 'singularity';
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: true, tier, status: 'active', expiresAt: null }),
      };
    };
  }

  function licenseContext(): vscode.ExtensionContext {
    return {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/ext'),
      extension: { packageJSON: { version: '0.0.0' } },
      workspaceState: { get: () => undefined, update: async () => undefined },
      globalState: { get: () => undefined, update: async () => undefined },
      secrets: {
        get: async () => undefined,
        store: async () => undefined,
        delete: async () => undefined,
      },
    } as unknown as vscode.ExtensionContext;
  }

  async function flush(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    captured.length = 0;
    httpsBehavior = 'sponsor';
    (LicenseService as unknown as { instance?: LicenseService }).instance = undefined;
    installTransport();
    sandbox.stub(SecretStorageService, 'getInstance').returns({
      getLicenseCache: async () => undefined,
      setLicenseCache: async () => undefined,
      deleteLicenseCache: async () => undefined,
    } as unknown as SecretStorageService);
    (vscode.env as { machineId?: string }).machineId = 'machine-1';
  });

  afterEach(() => {
    const existing = (LicenseService as unknown as { instance?: LicenseService }).instance;
    existing?.dispose();
    (LicenseService as unknown as { instance?: LicenseService }).instance = undefined;
    (LicenseService as unknown as { transport: typeof originalTransport }).transport = originalTransport;
    bindLicenseExtensionMode(undefined);
    sandbox.restore();
  });

  it('posts validation to the canonical host when a custom endpoint is configured in production', async () => {
    useMode(vscode.ExtensionMode.Production);
    stubConfig(sandbox, { [LICENSE_ENDPOINT_SETTING]: FAKE_ENDPOINT });
    httpsBehavior = 'singularity';

    const license = LicenseService.getInstance(licenseContext());
    const result = await license.activate('NQ-TEST');

    expect(result.ok).to.equal(true);
    expect(result.tier).to.equal('singularity');
    expect(license.getTier()).to.equal('singularity');
    expect(captured).to.have.length(1);
    expect(captured[0].protocol).to.equal('https:');
    expect(captured[0].hostname).to.equal('nexql.astrx.dev');
    expect(captured[0].pathname).to.equal('/api/license/validate');
  });

  it('posts validation to the configured host in development', async () => {
    useMode(vscode.ExtensionMode.Development);
    stubConfig(sandbox, { [LICENSE_ENDPOINT_SETTING]: FAKE_ENDPOINT });

    const license = LicenseService.getInstance(licenseContext());
    const result = await license.activate('NQ-TEST');

    expect(result.ok).to.equal(true);
    expect(result.tier).to.equal('singularity');
    expect(captured).to.have.length(1);
    expect(captured[0].protocol).to.equal('http:');
    expect(captured[0].hostname).to.equal('127.0.0.1');
    expect(captured[0].port).to.equal('3999');
    expect(captured[0].pathname).to.equal('/api/license/validate');
  });

  it('does not grant a paid tier when the license server is unreachable', async () => {
    useMode(vscode.ExtensionMode.Production);
    stubConfig(sandbox, { [LICENSE_ENDPOINT_SETTING]: FAKE_ENDPOINT });
    httpsBehavior = 'error';

    const license = LicenseService.getInstance(licenseContext());
    const result = await license.activate('NQ-TEST');

    expect(result.ok).to.equal(false);
    expect(license.getTier()).to.equal('free');
    expect(captured[0].hostname).to.equal('nexql.astrx.dev');
    expect(captured[0].protocol).to.equal('https:');
  });

  it('keeps a cached paid tier through the offline grace window and drops it after', async () => {
    const startedAt = 1_700_000_000_000;
    let now = startedAt;
    sandbox.stub(Date, 'now').callsFake(() => now);
    useMode(vscode.ExtensionMode.Production);
    stubConfig(sandbox, {});
    httpsBehavior = 'sponsor';

    const license = LicenseService.getInstance(licenseContext());
    const activated = await license.activate('NQ-PAID');
    expect(activated.ok).to.equal(true);
    expect(license.getTier()).to.equal('sponsor');

    now += LICENSE_CACHE_TTL_MS + 1;
    httpsBehavior = 'error';
    expect(license.getTier()).to.equal('sponsor');
    await flush();
    expect(license.getTier()).to.equal('sponsor');

    now += LICENSE_OFFLINE_GRACE_MS;
    expect(license.getTier()).to.equal('sponsor');
    await flush();

    now += 1;
    expect(license.getTier()).to.equal('free');
  });
});
