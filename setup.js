#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const MIN_NODE_VERSION = 18;

function checkNodeVersion() {
  const version = parseInt(process.version.slice(1).split('.')[0], 10);
  if (version < MIN_NODE_VERSION) {
    console.error(`Node.js ${MIN_NODE_VERSION}+ required (found ${process.version})`);
    process.exit(1);
  }
  console.log(`  Node.js ${process.version}`);
}

function ensureNvmrc() {
  if (!fs.existsSync('.nvmrc')) {
    fs.writeFileSync('.nvmrc', '22\n');
    console.log('  Created .nvmrc (Node 22)');
  } else {
    console.log('  .nvmrc exists');
  }
}

function checkDependencies() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const hasDeps = pkg.dependencies && Object.keys(pkg.dependencies).length > 0;

  if (hasDeps && !fs.existsSync('node_modules')) {
    console.log('  Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  } else if (!hasDeps) {
    console.log('  No dependencies needed');
  } else {
    console.log('  Dependencies installed');
  }
}

function ensureHealthDirs() {
  const logDir = path.join(os.homedir(), 'mac-health-watch', 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
    console.log(`  Created ${logDir}`);
  } else {
    console.log('  Health log directory exists');
  }
}

function generateIcons() {
  const iconsDir = path.join('ui', 'icons');
  const hasIcons = fs.existsSync(path.join(iconsDir, 'tray-default.png'));
  if (!hasIcons && fs.existsSync('scripts/generate-icons.js')) {
    console.log('  Generating tray icons...');
    execSync('node scripts/generate-icons.js', { stdio: 'inherit' });
  } else if (hasIcons) {
    console.log('  Tray icons exist');
  }
}

console.log('\nSetting up Locohost...\n');
checkNodeVersion();
ensureNvmrc();
checkDependencies();
ensureHealthDirs();
generateIcons();
console.log('\nReady!');
console.log('  Standalone:  npm run dev');
console.log('  Menubar:     npm run electron');
console.log('  Auto-start:  npm run install-agent\n');
