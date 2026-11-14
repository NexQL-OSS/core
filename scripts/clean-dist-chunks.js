const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '../dist');

// esbuild --splitting names lazy chunks `<Name>-<HASH>.js` (8 uppercase
// alphanumerics). Each rebuild writes new hashes, so every hashed file left
// over from an earlier build is stale and would otherwise ship in the VSIX
// (.vscodeignore includes dist/*.js). Fixed bundle names such as
// extension.js, renderer_v2.js and chat-chart.js never match.
const HASHED_CHUNK = /^[A-Za-z0-9_]+-[A-Z0-9]{8}\.js(\.map)?$/;

function cleanDistChunks(dir = distDir) {
  if (!fs.existsSync(dir)) {
    return 0;
  }
  let deletedCount = 0;
  for (const file of fs.readdirSync(dir)) {
    if (!HASHED_CHUNK.test(file)) {
      continue;
    }
    try {
      fs.unlinkSync(path.join(dir, file));
      deletedCount++;
    } catch (err) {
      console.error(`Failed to delete stale chunk ${file}:`, err);
    }
  }
  return deletedCount;
}

if (require.main === module) {
  const deletedCount = cleanDistChunks();
  if (deletedCount > 0) {
    console.log(`[cleanup] Deleted ${deletedCount} stale chunk files from dist/`);
  }
}

module.exports = { cleanDistChunks, HASHED_CHUNK };
