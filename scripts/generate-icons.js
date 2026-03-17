#!/usr/bin/env node
/**
 * Generate tray icon PNGs for Locohost menubar.
 *
 * Converts the actual Locohost mascot SVG to template PNGs using macOS sips.
 * Template images: black on transparent. macOS handles light/dark inversion.
 *
 * Sizes: 22x22 (1x) and 44x44 (2x).
 * Variants: default, warning (amber dot), critical (red dot).
 */

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'ui', 'icons');

// The Locohost mascot SVG path (from the logo)
const MASCOT_PATH = 'M65.4023 39.5L88.3057 21.083L75.167 87.6943H68.4951L70.6562 55.3057L40.6387 36.0557L19.5557 59.7041L21.3408 87.6943H13.1387L0 29.9443L17.417 38.1943L12.2227 8.55566L32.4023 29.9443L38.1943 0L49.9023 32L68.1387 0L65.4023 39.5ZM53 87H40.7773L39.7773 72.833L53 70.833V87ZM34.4023 57C36.3353 57 37.9023 58.567 37.9023 60.5C37.9023 62.433 36.3353 64 34.4023 64C32.4695 63.9998 30.9023 62.4329 30.9023 60.5C30.9023 58.5671 32.4695 57.0002 34.4023 57ZM55.4023 55C57.3353 55 58.9023 56.567 58.9023 58.5C58.9023 60.433 57.3353 62 55.4023 62C53.4695 61.9998 51.9023 60.4329 51.9023 58.5C51.9023 56.5671 53.4695 55.0002 55.4023 55Z';

const SVG_W = 89;
const SVG_H = 88;

function writeSVG(tmpPath, size, dotColor) {
  const pad = Math.round(size * 0.08);
  const iconSize = size - pad * 2;

  let extra = '';
  if (dotColor) {
    const dotR = Math.round(size * 0.14);
    const dotCx = size - dotR - 1;
    const dotCy = dotR + 1;
    extra = `<circle cx="${dotCx}" cy="${dotCy}" r="${dotR}" fill="${dotColor}"/>`;
  }

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
<g transform="translate(${pad},${pad}) scale(${iconSize/SVG_W},${iconSize/SVG_H})">
<path d="${MASCOT_PATH}" fill="black"/>
</g>
${extra}
</svg>`;

  fs.writeFileSync(tmpPath, svg);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const VARIANTS = [
  { name: 'default', dot: null },
  { name: 'warning', dot: '#e6a000' },
  { name: 'critical', dot: '#dc3232' },
];

for (const variant of VARIANTS) {
  for (const size of [22, 44]) {
    const suffix = size === 44 ? '@2x' : '';
    const filename = `tray-${variant.name}${suffix}.png`;
    const tmpSvg = path.join(OUT_DIR, `_tmp_${variant.name}_${size}.svg`);
    const outPng = path.join(OUT_DIR, filename);

    writeSVG(tmpSvg, size, variant.dot);
    execFileSync('sips', ['-s', 'format', 'png', tmpSvg, '--out', outPng], { stdio: 'pipe' });
    fs.unlinkSync(tmpSvg);

    const stats = fs.statSync(outPng);
    console.log(`wrote ${filename}  (${stats.size} bytes, ${size}x${size})`);
  }
}

// Clean up standalone mascot SVG if present
const mascotSvg = path.join(OUT_DIR, 'mascot.svg');
if (fs.existsSync(mascotSvg)) fs.unlinkSync(mascotSvg);

console.log('done');
