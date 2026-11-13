#!/usr/bin/env node
// Static checks for js/levels.js: chunk widths, object counts vs. dialogue data, required markers.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'levels.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + '\nthis.LEVELS = LEVELS; this.buildLevelGrid = buildLevelGrid;', ctx);
const { LEVELS, buildLevelGrid } = ctx;

let errors = 0, warnings = 0;
const SOLID = '#=i<>x%';
const GROUNDED = 'fbdmSN?LCPEHu'; // things that must stand on something (viruses may drop)

if (LEVELS.length !== 10) { console.error(`expected 10 levels, found ${LEVELS.length}`); errors++; }

LEVELS.forEach((L, li) => {
  const tag = `Level ${li + 1} (${L.name})`;
  const err = m => { errors++; console.error(`ERROR   ${tag}: ${m}`); };
  const warn = m => { warnings++; console.warn(`WARNING ${tag}: ${m}`); };
  for (const k of ['name', 'theme', 'music', 'intro', 'tip', 'chunks']) if (!L[k]) err(`missing "${k}"`);
  L.chunks.forEach((c, ci) => {
    const w = c[0].length;
    c.forEach((r, ri) => { if (r.length !== w) err(`chunk ${ci} row ${ri} has width ${r.length}, expected ${w}`); });
    if (c.length > 15) err(`chunk ${ci} is taller than 15 rows`);
  });
  const { grid, W, H } = buildLevelGrid(L);
  const flat = grid.flat();
  const count = ch => flat.filter(c => c === ch).length;
  const expect = (ch, n, what) => { if (count(ch) !== n) err(`${count(ch)} '${ch}' ${what} on map but ${n} defined`); };
  expect('S', (L.signs || []).length, 'signs');
  expect('N', (L.npcs || []).length, 'NPCs');
  expect('?', (L.riddles || []).length, 'riddle terminals');
  expect('L', L.levers ? L.levers.labels.length : 0, 'levers');
  if (count('D') && !L.levers) err('lever doors (D) without a lever puzzle');
  if (count('P') !== 1) err(`needs exactly one start (P), found ${count('P')}`);
  if (count('E') !== 1) err(`needs exactly one exit (E), found ${count('E')}`);
  if (count('*') !== 3) err(`needs exactly 3 crystals (*), found ${count('*')}`);
  if (!!L.boss !== (count('B') === 1)) err('boss definition and B marker do not match');
  (L.riddles || []).forEach((r, i) => {
    if (!(r.ok >= 0 && r.ok < r.a.length)) err(`riddle ${i} has invalid answer index`);
    if (!r.hint) err(`riddle ${i} has no hint`);
  });
  if (L.levers) {
    const o = [...L.levers.order].sort().join();
    if (o !== L.levers.labels.map((_, i) => i).join()) err('lever order must be a permutation of the labels');
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = grid[y][x];
    const below = y + 1 < H ? grid[y + 1][x] : ' ';
    if (GROUNDED.includes(c) && !(SOLID.includes(below) || below === '-')) err(`'${c}' at ${x},${y} is floating`);
    // a secret wall must be standable: something solid under the room, and a way in from open air
    if (c === '%' || (c === '*' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (grid[y + dy] || [])[x + dx] === '%'))) {
      if (y + 1 >= H) err(`secret wall at ${x},${y} has no floor`);
    }
    if (c === 'v' && !(SOLID.includes(below) || below === '-')) warn(`virus at ${x},${y} will drop to the ground`);
  }
  console.log(`ok      ${tag}: ${W}x${H} tiles, ${count('o')} drops`);
});

console.log(`\n${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
