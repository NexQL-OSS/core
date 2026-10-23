const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const { normalizeReleaseVersion } = require('./check-release-version');

function parseBaseSemver(versionField) {
  if (typeof versionField !== 'string') {
    throw new Error('Version must be a string');
  }
  const core = versionField.split('-')[0];
  const parts = core.split('.');
  if (parts.length !== 3) {
    throw new Error(`Expected major.minor.patch, got: ${versionField}`);
  }
  const nums = parts.map((p) => {
    const n = Number(p);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new Error(`Invalid semver segment in version: ${versionField}`);
    }
    return n;
  });
  return [nums[0], nums[1], nums[2]];
}

function getLastStableVersion() {
  try {
    const tags = execSync('git tag -l', { encoding: 'utf8' })
      .split('\n')
      .map(t => t.trim())
      .filter(t => /^v\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(t));
    
    let lastStable = null;
    let maxSemver = [-1, -1, -1];
    
    for (const t of tags) {
      const versionStr = t.slice(1); // remove 'v'
      const parts = versionStr.split('-');
      const core = parts[0];
      const segments = core.split('.').map(Number);
      if (segments.length === 3 && !segments.some(Number.isNaN)) {
        const [major, minor, patch] = segments;
        if (minor % 2 === 0) {
          if (
            major > maxSemver[0] ||
            (major === maxSemver[0] && minor > maxSemver[1]) ||
            (major === maxSemver[0] && minor === maxSemver[1] && patch > maxSemver[2])
          ) {
            maxSemver = [major, minor, patch];
            lastStable = t;
          }
        }
      }
    }
    return lastStable;
  } catch (e) {
    return null;
  }
}

function getNextVersion(currentVersion, channel, bumpType) {
  let [major, minor, patch] = parseBaseSemver(currentVersion);

  if (bumpType === 'major') {
    major += 1;
    minor = (channel === 'nightly') ? 1 : 0;
    patch = 0;
  } else if (bumpType === 'minor') {
    if (channel === 'stable') {
      minor = (minor % 2 === 0) ? minor + 2 : minor + 1;
    } else {
      minor = (minor % 2 === 0) ? minor + 1 : minor + 2;
    }
    patch = 0;
  } else if (bumpType === 'patch') {
    if (channel === 'stable' && minor % 2 !== 0) {
      minor += 1;
      patch = 0;
    } else if (channel === 'nightly' && minor % 2 === 0) {
      minor += 1;
      patch = 0;
    } else {
      patch += 1;
    }
  } else {
    throw new Error(`Invalid bump type: ${bumpType}`);
  }

  return `${major}.${minor}.${patch}`;
}

function syncLockfileVersion(lockPath, version) {
  const lines = fs.readFileSync(lockPath, 'utf8').split('\n');
  let replaced = 0;
  const headerLineLimit = 30;
  for (let i = 0; i < Math.min(lines.length, headerLineLimit); i += 1) {
    if (lines[i].includes('"version":') && replaced < 2) {
      lines[i] = lines[i].replace(/"version": "[^"]+"/, `"version": "${version}"`);
      replaced += 1;
    }
  }
  if (replaced !== 2) {
    throw new Error(
      `Expected to update 2 version fields in the ${lockPath} header, updated ${replaced}.`
    );
  }
  fs.writeFileSync(lockPath, lines.join('\n'), 'utf8');
}

function askQuestion(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  const root = process.cwd();
  const pkgPath = path.join(root, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    console.error('Error: package.json not found in the current working directory.');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;
  console.log(`Current version: ${currentVersion}`);

  // Parse command line arguments
  let channelArg = process.argv.find(arg => ['stable', 'nightly'].includes(arg.toLowerCase()));
  let bumpArg = process.argv.find(arg => ['patch', 'minor', 'major', 'fix'].includes(arg.toLowerCase()));
  const skipConfirm = process.argv.includes('-y') || process.argv.includes('--yes');

  if (bumpArg === 'fix') {
    bumpArg = 'patch';
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    let channel = channelArg ? channelArg.toLowerCase() : 'stable';
    if (channel !== 'stable' && channel !== 'nightly') {
      console.error(`Unknown channel "${channelArg}". Use stable. Nightly versions are computed, not selected.`);
      process.exit(1);
    }

    const lastStable = getLastStableVersion();
    if (channel === 'nightly') {
      console.error('Nightly publishes do not get a package.json version or a git tag.');
      console.error('package.json stays on an even minor. That version is the stable release.');
      console.error('scripts/compute-nightly-version.js derives the odd nightly (2.4.1 → 2.5.1).');
      console.error('Bump a stable patch, push main, then run Publish Extension (Nightly).');
      process.exit(1);
    }

    if (lastStable) {
      console.log(`Last stable version: ${lastStable}`);
    } else {
      console.log('Last stable version: None found');
    }

    let bumpType = bumpArg;
    if (!bumpType) {
      console.log('\nSelect Release Type:');
      console.log('  1) patch — patch bump (e.g. 2.4.0 → 2.4.1)');
      console.log('  2) minor — even minor bump (e.g. 2.4.0 → 2.6.0)');
      console.log('  3) major — major bump (e.g. 2.4.0 → 3.0.0)');
      console.log('  4) custom — enter custom version string');
      const answer = await askQuestion(rl, 'Choose [1-4]: ');
      if (answer.trim() === '1' || answer.toLowerCase() === 'patch' || answer.toLowerCase() === 'fix') {
        bumpType = 'patch';
      } else if (answer.trim() === '2' || answer.toLowerCase() === 'minor') {
        bumpType = 'minor';
      } else if (answer.trim() === '3' || answer.toLowerCase() === 'major') {
        bumpType = 'major';
      } else if (answer.trim() === '4' || answer.toLowerCase() === 'custom') {
        bumpType = 'custom';
      } else {
        console.error(`Invalid choice: ${answer}`);
        process.exit(1);
      }
    }

    let nextVersion;
    if (bumpType === 'custom') {
      const customAns = await askQuestion(rl, 'Enter custom version (2.4.1 or v2.4.1): ');
      try {
        nextVersion = normalizeReleaseVersion(customAns);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    } else {
      let baseVersion = currentVersion;
      if (channel === 'stable' && bumpType === 'patch') {
        if (lastStable) {
          baseVersion = lastStable.replace(/^v/, '');
        }
      }
      nextVersion = getNextVersion(baseVersion, channel, bumpType);
    }
    const nextMinor = Number(nextVersion.split('.')[1]);
    if (nextMinor % 2 !== 0) {
      console.error(`Refusing to write ${nextVersion} into package.json.`);
      console.error('package.json is the stable version and must use an even minor.');
      console.error('A doubled v (vv0.1.5) is also refused. Tags are exactly vMAJOR.MINOR.PATCH.');
      process.exit(1);
    }

    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const heading = new RegExp(`^## \\[${nextVersion.replace(/\./g, '\\.')}\\]`, 'm');
    if (!heading.test(changelog)) {
      console.error(`CHANGELOG.md has no "## [${nextVersion}]" section. Add it, then re-run.`);
      process.exit(1);
    }

    console.log(`\nNext version computed: v${nextVersion} (stable release)`);

    if (!skipConfirm) {
      const confirm = await askQuestion(rl, `Proceed with v${nextVersion}? [y/N]: `);
      if (!['y', 'yes'].includes(confirm.trim().toLowerCase())) {
        console.log('Aborted.');
        process.exit(0);
      }
    }

    // Write updated version to package.json and the lockfile header.
    // JSON.stringify on the lockfile would reformat the whole file, so only
    // the root package version fields in the header are replaced.
    pkg.version = nextVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    syncLockfileVersion(path.join(root, 'package-lock.json'), nextVersion);
    console.log('package.json and package-lock.json updated.');

    execSync('node ./scripts/check-release-version.js', { stdio: 'inherit' });

    // Execute Git commands
    console.log('Executing Git commands...');
    execSync('git add package.json package-lock.json CHANGELOG.md', { stdio: 'inherit' });
    execSync(`git commit -m "chore(release): bump version to ${nextVersion}"`, { stdio: 'inherit' });
    execSync(`git tag -a "v${nextVersion}" -m "Release v${nextVersion}"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    execSync(`git push origin "v${nextVersion}"`, { stdio: 'inherit' });
    console.log(`Git tag v${nextVersion} created and pushed successfully.`);

  } catch (error) {
    console.error('Error during execution:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
}
