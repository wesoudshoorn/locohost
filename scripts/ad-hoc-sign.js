/**
 * After-pack hook: ad-hoc sign the app with entitlements.
 * This makes macOS honor the entitlements without needing a paid Developer ID.
 */
import { execFileSync } from 'child_process';
import path from 'path';

export default async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const entitlements = path.join(context.packager.projectDir, 'build', 'entitlements.mac.plist');

  console.log(`  • ad-hoc signing ${appPath}`);

  // Sign all nested frameworks/helpers first, then the app itself
  execFileSync('codesign', [
    '--deep',
    '--force',
    '--sign', '-',
    '--entitlements', entitlements,
    appPath
  ], { stdio: 'inherit' });

  console.log('  • ad-hoc signing complete');
};
