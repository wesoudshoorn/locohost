#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';

const MIN_NODE_VERSION = 18;

function checkNodeVersion() {
  const version = parseInt(process.version.slice(1).split('.')[0], 10);
  if (version < MIN_NODE_VERSION) {
    console.error(`❌ Node.js ${MIN_NODE_VERSION}+ required (found ${process.version})`);
    process.exit(1);
  }
  console.log(`✓ Node.js ${process.version}`);
}

function ensureNvmrc() {
  if (!fs.existsSync('.nvmrc')) {
    fs.writeFileSync('.nvmrc', '22\n');
    console.log('✓ Created .nvmrc (Node 22)');
  } else {
    console.log('✓ .nvmrc exists');
  }
}

function checkDependencies() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const hasDeps = pkg.dependencies && Object.keys(pkg.dependencies).length > 0;

  if (hasDeps && !fs.existsSync('node_modules')) {
    console.log('Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  } else if (!hasDeps) {
    console.log('✓ No dependencies needed');
  } else {
    console.log('✓ Dependencies installed');
  }
}

console.log('Setting up locohost...\n');
checkNodeVersion();
ensureNvmrc();
checkDependencies();
console.log('\n✓ Ready! Run: npm run dev');
