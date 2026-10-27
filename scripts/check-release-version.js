'use strict';

const fs = require('fs');
const path = require('path');
const { computeNightlyVersion } = require('./compute-nightly-version');

/** Stable extension versions are MAJOR.MINOR.PATCH. No leading v, no prerelease tag. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * Accept `2.4.0` or `v2.4.0`. Reject a second v (`vv2.4.0`, `vv0.1.5`).
 * Prefixing `v` onto a value that already starts with `v` is what created `vv0.1.5`.
 *
 * @param {string} input
 * @returns {string} MAJOR.MINOR.PATCH
 */
function normalizeReleaseVersion(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('Version is empty. Use MAJOR.MINOR.PATCH (example 2.4.0) or vMAJOR.MINOR.PATCH.');
  }
  const raw = input.trim();
  if (/^vv/i.test(raw)) {
    throw new Error(
      `Refusing "${raw}": doubled v prefix. ` +
        'Tags are vMAJOR.MINOR.PATCH. Do not add another v in front of a version that already has one.'
    );
  }
  const stripped = raw[0] === 'v' || raw[0] === 'V' ? raw.slice(1) : raw;
  if (!SEMVER.test(stripped)) {
    throw new Error(
      `Refusing "${raw}": expected MAJOR.MINOR.PATCH or a single leading v (example 2.4.0 or v2.4.0).`
    );
  }
  return stripped;
}

/**
 * @param {string} markdown
 * @returns {string[]}
 */
function changelogSemverHeadings(markdown) {
  const headings = [];
  const re = /^## \[([^\]]+)\]/gm;
  let match = re.exec(markdown);
  while (match) {
    if (SEMVER.test(match[1])) {
      headings.push(match[1]);
    }
    match = re.exec(markdown);
  }
  return headings;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compareSemver(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

/**
 * package.json is the only version you edit. It is the stable (even minor) version.
 * package-lock.json and the latest stable CHANGELOG heading must match it.
 * A nightly heading may exist only up to the version compute-nightly-version.js
 * derives from that stable version. Pass `tag` on a stable publish.
 *
 * @param {{ root?: string, tag?: string }} options
 * @returns {{ version: string, nightly: string }}
 */
function assertReleaseConsistency(options = {}) {
  const root = options.root || process.cwd();
  const pkgPath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const changelogPath = path.join(root, 'CHANGELOG.md');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const changelog = fs.readFileSync(changelogPath, 'utf8');

  const version = normalizeReleaseVersion(pkg.version);
  if (pkg.version !== version) {
    throw new Error(
      `package.json version must be plain MAJOR.MINOR.PATCH, found "${pkg.version}".`
    );
  }

  const minor = Number(version.split('.')[1]);
  if (minor % 2 !== 0) {
    throw new Error(
      `package.json version ${version} has an odd minor. ` +
        'The stable version in package.json uses an even minor. ' +
        `Nightly publishes are computed from it (example: 2.4.0 → ${computeNightlyVersion('2.4.0')}).`
    );
  }

  const lockRoot = lock.version;
  const lockPackage = lock.packages && lock.packages[''] ? lock.packages[''].version : undefined;
  if (lockRoot !== version || lockPackage !== version) {
    throw new Error(
      `package-lock.json does not match package.json ${version}. ` +
        `Lock root is "${lockRoot}", packages[""] is "${lockPackage}".`
    );
  }

  const headings = changelogSemverHeadings(changelog);
  if (!headings.includes(version)) {
    throw new Error(
      `CHANGELOG.md has no "## [${version}]" section. package.json is the source of truth.`
    );
  }

  const stableHeadings = headings
    .filter((heading) => Number(heading.split('.')[1]) % 2 === 0)
    .sort(compareSemver);
  const latestStable = stableHeadings[stableHeadings.length - 1];
  if (latestStable !== version) {
    throw new Error(
      `Latest stable CHANGELOG heading is ${latestStable}, but package.json is ${version}. ` +
        'Move unpublished notes under "## [Unreleased]".'
    );
  }

  const nightly = computeNightlyVersion(version);
  const nightlyHeadings = headings
    .filter((heading) => Number(heading.split('.')[1]) % 2 === 1)
    .sort(compareSemver);
  if (nightlyHeadings.length > 0) {
    const latestNightly = nightlyHeadings[nightlyHeadings.length - 1];
    if (compareSemver(latestNightly, nightly) > 0) {
      throw new Error(
        `CHANGELOG claims nightly ${latestNightly}, which is newer than ${nightly} ` +
          `(the nightly derived from package.json ${version}). ` +
          'That version is not published. Move it under "## [Unreleased]".'
      );
    }
  }

  if (options.tag) {
    const tagVersion = normalizeReleaseVersion(options.tag);
    if (tagVersion !== version) {
      throw new Error(
        `Tag ${options.tag} is version ${tagVersion}, but package.json is ${version}. ` +
          `Tag the commit as v${version}, or fix package.json before publishing.`
      );
    }
  }

  return { version, nightly };
}

function readFlag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function main() {
  try {
    const tag = readFlag('--tag');
    const expected = readFlag('--expect');
    const result = assertReleaseConsistency({ tag });
    if (expected) {
      const expectedVersion = normalizeReleaseVersion(expected);
      if (expectedVersion !== result.version) {
        throw new Error(
          `Expected version ${expectedVersion}, but package.json is ${result.version}.`
        );
      }
    }
    process.stdout.write(
      `version ${result.version} matches package.json, package-lock.json, and CHANGELOG.md` +
        ` (nightly ${result.nightly})\n`
    );
    if (tag) {
      process.stdout.write(`tag v${result.version} matches package.json\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`::error::${message}\n`);
    process.exit(1);
  }
}

module.exports = {
  assertReleaseConsistency,
  changelogSemverHeadings,
  normalizeReleaseVersion,
};

if (require.main === module) {
  main();
}
