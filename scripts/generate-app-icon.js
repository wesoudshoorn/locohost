#!/usr/bin/env node
/**
 * Generate macOS .icns app icon from the Locohost mascot.
 *
 * Creates a 1024x1024 PNG, then uses iconutil to produce an .icns file
 * for use in the Electron app bundle.
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'build');

const MASCOT_PATH = 'M65.4023 39.5L88.3057 21.083L75.167 87.6943H68.4951L70.6562 55.3057L40.6387 36.0557L19.5557 59.7041L21.3408 87.6943H13.1387L0 29.9443L17.417 38.1943L12.2227 8.55566L32.4023 29.9443L38.1943 0L49.9023 32L68.1387 0L65.4023 39.5ZM53 87H40.7773L39.7773 72.833L53 70.833V87ZM34.4023 57C36.3353 57 37.9023 58.567 37.9023 60.5C37.9023 62.433 36.3353 64 34.4023 64C32.4695 63.9998 30.9023 62.4329 30.9023 60.5C30.9023 58.5671 32.4695 57.0002 34.4023 57ZM55.4023 55C57.3353 55 58.9023 56.567 58.9023 58.5C58.9023 60.433 57.3353 62 55.4023 62C53.4695 61.9998 51.9023 60.4329 51.9023 58.5C51.9023 56.5671 53.4695 55.0002 55.4023 55Z';

const SVG_W = 89;
const SVG_H = 88;

fs.mkdirSync(OUT_DIR, { recursive: true });

// iconutil requires a specific iconset directory structure
const iconsetDir = path.join(OUT_DIR, 'icon.iconset');
fs.mkdirSync(iconsetDir, { recursive: true });

const SIZES = [16, 32, 64, 128, 256, 512, 1024];

function makeSVG(size) {
  const pad = Math.round(size * 0.12);
  const iconSize = size - pad * 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
<rect width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" fill="#1a1a1a"/>
<g transform="translate(${pad},${pad}) scale(${iconSize/SVG_W},${iconSize/SVG_H})">
<path d="${MASCOT_PATH}" fill="white"/>
</g>
</svg>`;
}

for (const size of SIZES) {
  const tmpSvg = path.join(iconsetDir, `_tmp_${size}.svg`);
  fs.writeFileSync(tmpSvg, makeSVG(size));

  // 1x
  if (size <= 512) {
    const out1x = path.join(iconsetDir, `icon_${size}x${size}.png`);
    execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), tmpSvg, '--out', out1x], { stdio: 'pipe' });
  }

  // 2x (half-size name, double pixels) — e.g. icon_256x256@2x.png is 512px
  if (size >= 32) {
    const halfSize = size / 2;
    if (SIZES.includes(halfSize)) {
      const out2x = path.join(iconsetDir, `icon_${halfSize}x${halfSize}@2x.png`);
      execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), tmpSvg, '--out', out2x], { stdio: 'pipe' });
    }
  }

  fs.unlinkSync(tmpSvg);
}

// Generate .icns from iconset
const icnsPath = path.join(OUT_DIR, 'icon.icns');
execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath]);

// Clean up iconset
fs.rmSync(iconsetDir, { recursive: true });

console.log(`wrote ${icnsPath}`);
