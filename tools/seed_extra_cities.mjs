#!/usr/bin/env node
/**
 * seed_extra_cities.mjs
 *
 * The official bundle (public/city-boundaries.json) covers 55 cities, but the
 * app's URBAN_BOUNDARIES fallback table also ships a few extra entries
 * (San Francisco Bay Area, Tampa Bay, Sacramento, San Jose, Raleigh-Durham).
 * Those still used hand-drawn octagons — this script seeds them into the JSON
 * (center + their old shape) so tools/build_urfboundaries.py can regenerate
 * proper built-up outlines for them.
 *
 * Run: node tools/seed_extra_cities.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const jsonPath = path.join(root, 'public', 'city-boundaries.json');
const geoUtilsPath = path.join(root, 'src', 'utils', 'geoUtils.js');

const current = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const src = fs.readFileSync(geoUtilsPath, 'utf8');
const m = src.match(/const URBAN_BOUNDARIES = \{([\s\S]*?)\n\};/);
if (!m) {
  console.error('Could not parse URBAN_BOUNDARIES from geoUtils.js');
  process.exit(1);
}
const entries = new Map();
const re = /\n\s*'([^']+)':\s*\{([\s\S]*?)\n\s*\},/g;
let match;
while ((match = re.exec(m[1])) !== null) {
  const name = match[1];
  const block = match[2];
  const center = block.match(/center:\s*\[([\d.-]+),\s*([\d.-]+)\]/);
  const boundary = [...block.matchAll(/\[([\d.-]+),\s*([\d.-]+)\]/g)].map(g => [parseFloat(g[1]), parseFloat(g[2])]);
  if (center && boundary.length >= 3) {
    entries.set(name, { center: [center[1], center[2]].map(Number), boundary });
  }
}
let added = 0;
for (const [name, entry] of entries) {
  if (!current[name]) {
    current[name] = entry;
    added++;
  }
}
fs.writeFileSync(jsonPath, JSON.stringify(current), 'utf8');
fs.writeFileSync(path.join(root, 'src', 'data', 'city-boundaries.json'), JSON.stringify(current), 'utf8');
fs.writeFileSync(path.join(root, 'boundaries.json'), JSON.stringify(current), 'utf8');
console.log(`Seeded ${added} extra cities, total ${Object.keys(current).length}`);