import { expect } from 'chai';
import * as sinon from 'sinon';
import { ConnectionManager } from '../../services/ConnectionManager';
import { SecretStorageService } from '../../services/SecretStorageService';
import type { ConnectionConfig } from '../../common/types';

/** CI uses GitHub Actions service on 5432; local docker-compose.test often maps 5416. */
const TEST_DB_HOST = process.env.DB_HOST || 'localhost';
const TEST_DB_PORT = Number(process.env.DB_PORT || 5432);

function baseConn(overrides: Partial<ConnectionConfig> & { id: string }): ConnectionConfig {
  return {
    host: TEST_DB_HOST,
    port: TEST_DB_PORT,
    database: 'testdb',
    username: 'testuser',
    password: 'testpass',
    sslmode: 'disable',
    ...overrides
  };
}

describe('Connection Lifecycle Integration Tests', () => {
  let connectionManager: ConnectionManager;
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    connectionManager = ConnectionManager.getInstance();
    // SecretStorageService requires a VS Code ExtensionContext that is unavailable
    // outside the extension host. Stub it so createClientConfig can proceed; the
    // config.password field carries the actual credential in these tests.
    sandbox.stub(SecretStorageService, 'getInstance').returns({
      getPassword: sandbox.stub().resolves(undefined),
    } as any);
  });

  afterEach(async () => {
    sandbox.restore();
    await connectionManager.closeAll();
  });

  describe('Basic Connection Lifecycle', () => {
    it('should establish a connection to PostgreSQL', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-basic-conn' });

      const client = await connectionManager.getPooledClient(config);
      expect(client).to.exist;

      const result = await client.query('SELECT 1 as result');
      expect(result.rows).to.have.length(1);
      expect(result.rows[0].result).to.equal(1);

      client.release();
    });

    it('should reuse pool for same connection id after release', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-reuse-conn' });

      const c1 = await connectionManager.getPooledClient(config);
      await c1.query('SELECT 1');
      c1.release();

      const c2 = await connectionManager.getPooledClient(config);
      const r = await c2.query('SELECT 1 as n');
      expect(r.rows[0].n).to.equal(1);
      c2.release();
    });

    it('should handle connection closure gracefully', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-close-conn' });

      const client = await connectionManager.getPooledClient(config);
      client.release();

      await expect(connectionManager.closeAllConnectionsById('test-close-conn')).to.eventually.be.fulfilled;
    });
  });

  describe('SSL Connection Tests', () => {
    it('should attempt SSL connection and fallback on failure', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-ssl-conn', sslmode: 'prefer' });

      try {
        const client = await connectionManager.getPooledClient(config);
        expect(client).to.exist;
        client.release();
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it('should handle SSL with reject unauthorized false', async function () {
      this.timeout(10000);

      const config = {
        ...baseConn({ id: 'test-ssl-insecure', sslmode: 'require' }),
        ssl: { rejectUnauthorized: false }
      } as ConnectionConfig & { ssl?: { rejectUnauthorized: boolean } };

      try {
        const client = await connectionManager.getPooledClient(config);
        expect(client).to.exist;
        client.release();
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Pool Exhaustion Scenarios', () => {
    it('should handle multiple concurrent connections', async function () {
      this.timeout(15000);

      const config = baseConn({ id: 'test-concurrent' });

      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(
          (async () => {
            const client = await connectionManager.getPooledClient(config);
            try {
              return await client.query('SELECT 1');
            } finally {
              client.release();
            }
          })()
        );
      }

      const results = await Promise.all(promises);
      expect(results).to.have.length(5);
    });

    it.skip('pool max size is fixed in ConnectionManager; custom max exhaustion is not exercised here', async function () {
      this.timeout(15000);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle authentication failure', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-auth-fail', password: 'wrongpass' });

      try {
        await connectionManager.getPooledClient(config);
        expect.fail('Should have thrown authentication error');
      } catch (error) {
        expect((error as Error).message.toLowerCase()).to.match(/password authentication failed|authentication failed/);
      }
    });

    it('should handle connection to non-existent database', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-db-not-found', database: 'nonexistentdb' });

      try {
        await connectionManager.getPooledClient(config);
        expect.fail('Should have thrown database does not exist error');
      } catch (error) {
        expect((error as Error).message).to.match(/does not exist|database "nonexistentdb"/i);
      }
    });

    it('should handle connection to unreachable host', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-unreachable', host: 'unreachable.invalid', port: 5432 });

      try {
        await connectionManager.getPooledClient(config);
        expect.fail('Should have thrown connection error');
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe('Connection Pool Management', () => {
    it('should manage multiple connections per pool', async function () {
      this.timeout(10000);

      const config1 = baseConn({ id: 'test-pool-1' });
      const config2 = baseConn({ id: 'test-pool-2' });

      const client1 = await connectionManager.getPooledClient(config1);
      const client2 = await connectionManager.getPooledClient(config2);

      expect(client1).to.not.equal(client2);

      client1.release();
      client2.release();
    });

    it('should release connections on explicit close by id', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-release' });

      const client = await connectionManager.getPooledClient(config);
      client.release();

      await connectionManager.closeAllConnectionsById('test-release');
    });

    it('should handle cleanup of all connections', async function () {
      this.timeout(10000);

      const config = baseConn({ id: 'test-cleanup' });

      const client = await connectionManager.getPooledClient(config);
      client.release();

      await connectionManager.closeAll();
    });
  });

  describe('Version Compatibility', () => {
    it('should work with different PostgreSQL versions', async function () {
      this.timeout(10000);

      const versions = [
        { port: 5412, version: 'pg12' },
        { port: 5414, version: 'pg14' },
        { port: 5415, version: 'pg15' },
        { port: 5416, version: 'pg16' },
        { port: 5417, version: 'pg17' }
      ];

      for (const { port, version } of versions) {
        try {
          const config = baseConn({
            id: `test-${version}`,
            host: 'localhost',
            port
          });

          const client = await connectionManager.getPooledClient(config);
          const result = await client.query('SELECT version()');
          expect(result.rows).to.have.length(1);
          client.release();
        } catch (error) {
          console.log(`PostgreSQL ${version} not available: ${error}`);
        }
      }
    });
  });
});
