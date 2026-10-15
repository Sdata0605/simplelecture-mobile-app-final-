// Runs ONLY on EAS Build (lifecycle hook), before `npm ci`.
// Locally, Replit's firewall blocks protobufjs from the registry, so package.json
// pins it to a vendored tarball via an absolute file: override. That absolute path
// does not exist on the EAS worker, which breaks `npm ci` (ENOENT). EAS can reach
// registry.npmjs.org directly, so here we drop the override and repin the lockfile
// to the registry, keeping `npm ci` consistent.
const fs = require('fs');
const { execSync } = require('child_process');

const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const override = pkg.overrides && pkg.overrides.protobufjs;
if (typeof override === 'string' && override.startsWith('file:')) {
  delete pkg.overrides.protobufjs;
  if (Object.keys(pkg.overrides).length === 0) delete pkg.overrides;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('[eas-build-pre-install] Removed local protobufjs file: override');
  execSync('npm install --package-lock-only --ignore-scripts', { stdio: 'inherit' });
  console.log('[eas-build-pre-install] Repinned package-lock.json to the registry');
} else {
  console.log('[eas-build-pre-install] No protobufjs override; nothing to do');
}
