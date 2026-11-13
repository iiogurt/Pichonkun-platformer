#!/usr/bin/env node
// Records docs/gameplay.gif: a few short clips played by a scripted bot, captured
// straight from the game canvas and encoded with ffmpeg (which must be installed).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { openGame, ROOT } = require('./browser');

const OUT = path.join(ROOT, 'docs', 'gameplay.gif');
const FPS = 15, STEPS = 60 / FPS;   // game runs at 60 Hz; keep every 4th frame

// Each clip: setup() once, then tick(i) before every game update. All run inside the page.
const bot = `(i) => {
  const w = GAME.world; GAME.riddle = null;
  if (GAME.dialog) GAME.dialog = null;
  if (w) { w.player.inv = Math.max(w.player.inv, 2); w.player.hp = w.player.maxHp; }
  Input.down.add('right');
  if (i % 40 === 0) { Input.pressed.add('jump'); Input.down.add('jump'); }
  if (i % 40 === 22) Input.down.delete('jump');
  if (i % 12 === 0) Input.pressed.add('shoot');
}`;
const CLIPS = [
  { name: 'pollen peaks', frames: 66, setup: `() => { localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta(); GAME.toasts = []; GAME.applySkin(); T.play(1); T.step(110, ${bot}); }`, tick: bot },
  { name: 'secret room', frames: 38, setup: `() => { Input.down.clear(); T.play(3); const w = GAME.world, p = w.player; w.enemies = []; p.x = 50 * 16; p.y = 12 * 16 - 19; p.face = -1; w.snapCamera(); T.step(20); }`,
    tick: `(i) => { Input.down.clear(); if (i < 75) Input.down.add('left'); else if (i > 110) Input.down.add('right'); }` },
  { name: 'factory', frames: 44, setup: `() => { Input.down.clear(); T.play(8); T.step(150, ${bot}); }`, tick: bot },
  { name: 'boss', frames: 50, setup: `() => { Input.down.clear(); T.play(9); const w = GAME.world; w.player.x = w.boss.x - 130; w.player.y = 150; w.snapCamera(); T.step(30, () => { GAME.dialog = null; }); }`,
    tick: `(i) => { const w = GAME.world, p = w.player; GAME.dialog = null; p.hp = p.maxHp; p.inv = Math.max(p.inv, 2); Input.down.clear(); Input.down.add('up');
      Input.down.add(Math.floor(i / 50) % 2 ? 'left' : 'right'); if (i % 45 === 0) { Input.pressed.add('jump'); Input.down.add('jump'); } if (i % 10 === 0) Input.pressed.add('shoot'); }` },
  { name: 'level clear', frames: 46, setup: `() => { Input.down.clear(); T.play(1); T.step(60, ${bot}); Input.down.clear(); const w = GAME.world; w.drops = w.dropsTotal; GAME.run.crystals = [0, 1, 2]; GAME.run.score = 4870; GAME.run.bestCombo = 4; GAME.run.time = 60 * 96; GAME.save.name = 'PIC'; GAME.toasts = []; GAME.levelComplete(); }`,
    tick: `() => { Input.down.clear(); }` },
];

(async () => {
  if (!fs.existsSync('/usr/bin/ffmpeg') && !process.env.PATH.split(':').some(d => fs.existsSync(path.join(d, 'ffmpeg')))) throw new Error('ffmpeg is required');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pichonkun-gif-'));
  const { page, errors, close } = await openGame();
  let n = 0;
  for (const c of CLIPS) {
    await page.evaluate(`(${c.setup})(); window.__tick = ${c.tick}; window.__i = 0;`);
    for (let f = 0; f < c.frames; f++) {
      const data = await page.evaluate(`T.step(${STEPS}, () => window.__tick(window.__i++)); GAME.saveFlash = 0; GAME.render(); GAME.canvas.toDataURL('image/png')`);
      fs.writeFileSync(path.join(dir, `f${String(n++).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log(`recorded ${c.name} (${c.frames} frames)`);
  }
  await close();
  if (errors.length) throw new Error(errors.join(' | '));
  const scale = process.env.GIF_WIDTH || '480';
  const vf = `fps=${FPS},scale=${scale}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-vf', vf, OUT]);
  fs.rmSync(dir, { recursive: true });
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${n} frames, ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
