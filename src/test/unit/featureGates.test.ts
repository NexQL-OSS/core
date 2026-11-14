import { expect } from 'chai';
import * as sinon from 'sinon';

import { LicenseService } from '../../services/LicenseService';
import { isProFeatureEnabled, ProFeature, requirePro } from '../../services/featureGates';

describe('featureGates free-tier rules', () => {
  let sandbox: sinon.SinonSandbox;

  function asTier(tier: 'free' | 'sponsor' | 'singularity') {
    sandbox.stub(LicenseService, 'getInstance').returns({
      getTier: () => tier,
      isPaid: () => tier !== 'free',
    } as any);
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('keeps unlimited notebooks behind a license on the free tier', async () => {
    asTier('free');
    expect(isProFeatureEnabled(ProFeature.UnlimitedNotebooks)).to.equal(false);
    expect(await requirePro(ProFeature.UnlimitedNotebooks)).to.equal(false);
  });

  it('still gives the free tier every other non-team feature', () => {
    asTier('free');
    expect(isProFeatureEnabled(ProFeature.SchemaDiff)).to.equal(true);
    expect(isProFeatureEnabled(ProFeature.CloudSync)).to.equal(true);
    expect(isProFeatureEnabled(ProFeature.SyncSharing)).to.equal(false);
  });

  it('unlocks unlimited notebooks for paid tiers', async () => {
    asTier('sponsor');
    expect(isProFeatureEnabled(ProFeature.UnlimitedNotebooks)).to.equal(true);
    expect(await requirePro(ProFeature.UnlimitedNotebooks)).to.equal(true);
  });
});
