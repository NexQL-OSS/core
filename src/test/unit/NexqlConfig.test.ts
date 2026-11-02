import { expect } from 'chai';
import type { ConnectionInfo } from '../../features/connections/connectionStore';
import {
  connectionToProfile,
  exportToToml,
  importProfiles,
  parseNexqlConfig,
  profileToConnection,
} from '../../features/connections/nexqlConfig';

const SECRET = 'S3cr3t-pass!';

const full: ConnectionInfo = {
  id: 'c1',
  name: 'prod',
  host: 'db.example.com',
  port: 5433,
  username: 'agent',
  password: SECRET,
  database: 'app',
  group: 'team',
  environment: 'production',
  readOnlyMode: true,
  sslmode: 'verify-full',
  sslCertPath: '/c.crt',
  sslKeyPath: '/c.key',
  sslRootCertPath: '/ca.crt',
  statementTimeout: 5000,
  connectTimeout: 10,
  applicationName: 'nexql',
  options: '-c search_path=x',
  ssh: { enabled: true, host: 'bastion', port: 2222, username: 'jump', privateKeyPath: '/home/me/.ssh/id_rsa' },
};

const strip = ({ id, password, ...rest }: ConnectionInfo) => rest;

describe('nexqlConfig', () => {
  it('exports agent access, defaulting to read and never emitting admin', () => {
    expect(connectionToProfile(full).access_mode).to.equal('read');
    // A writable connection must not grant the AI writes unless the exporter opts in.
    expect(connectionToProfile({ ...full, readOnlyMode: false }).access_mode).to.equal('read');
    expect(connectionToProfile({ ...full, readOnlyMode: false }, { allowAgentWrites: true }).access_mode).to.equal('write');
    expect(connectionToProfile({ ...full, readOnlyMode: true }, { allowAgentWrites: true }).access_mode).to.equal('read');
    expect(connectionToProfile({ id: 'x', name: 'x', host: 'h', port: 1 }).access_mode).to.equal('read');
  });

  it('round-trips connections minus secrets and ssh key path', () => {
    const noKey = { ...full, ssh: { ...full.ssh!, privateKeyPath: undefined } };
    const second: ConnectionInfo = { id: 'c2', name: 'local', host: 'localhost', port: 5432, readOnlyMode: false, environment: 'development' };
    const toml = exportToToml([full, second]);
    const back = importProfiles(toml);
    expect(back.map((b) => b.name)).to.deep.equal(['prod', 'local']);
    const clean = (c: any) => JSON.parse(JSON.stringify(c));
    expect(clean(back[0].connection)).to.deep.equal(clean(strip(noKey)));
    expect(clean(back[1].connection)).to.deep.equal(clean(strip(second)));
  });

  it('never leaks secrets into the output', () => {
    const toml = exportToToml([{ ...full, ssh: { ...full.ssh!, privateKeyPath: '/k/id_rsa' } }]);
    expect(toml).to.not.contain(SECRET);
    expect(toml).to.not.match(/password|passphrase|token|id_rsa/i);
  });

  it('keeps extension-only fields in the vscode namespace', () => {
    const p = connectionToProfile(full) as any;
    expect(p.vscode.environment).to.equal('production');
    expect(p.environment).to.equal(undefined);
  });

  it('dedupes duplicate names on export', () => {
    const toml = exportToToml([full, { ...full, id: 'c9' }]);
    expect(Object.keys(parseNexqlConfig(toml).profiles)).to.deep.equal(['prod', 'prod (2)']);
  });

  it('merge keeps other profiles and top-level keys; replace keeps only top-level', () => {
    const existing = 'default_profile = "keep"\ndeny_tables = ["auth.*"]\n[profiles.other]\nhost = "o"\n';
    const merged = parseNexqlConfig(exportToToml([full], { existingText: existing, mode: 'merge' }));
    expect(Object.keys(merged.profiles)).to.have.members(['other', 'prod']);
    expect(merged.topLevel.default_profile).to.equal('keep');
    const replaced = parseNexqlConfig(exportToToml([full], { existingText: existing, mode: 'replace' }));
    expect(Object.keys(replaced.profiles)).to.deep.equal(['prod']);
    expect(replaced.topLevel.deny_tables).to.deep.equal(['auth.*']);
  });

  it('imports nexql-mcp profiles, ignoring secrets and unsupported fields with warnings', () => {
    const r = profileToConnection('p', {
      url: 'postgres://u:pw@h.example:6543/db?sslmode=require',
      password: 'x',
      password_command: 'op read x',
      access_mode: 'admin',
      schemas: ['public'],
    });
    expect(r.connection).to.include({ host: 'h.example', port: 6543, database: 'db', username: 'u', sslmode: 'require', readOnlyMode: false });
    expect(JSON.stringify(r.connection)).to.not.contain('pw');
    expect(r.warnings.length).to.be.greaterThan(2);
  });

  it('defaults host/port for sparse profiles', () => {
    const r = importProfiles('[profiles.a]\nuser = "u"\n')[0];
    expect(r.connection).to.include({ host: 'localhost', port: 5432, username: 'u' });
  });

  it('rejects malformed TOML', () => {
    expect(() => importProfiles('[profiles.a\n')).to.throw();
  });
});
