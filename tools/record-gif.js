#!/usr/bin/env node
// Records docs/gameplay.gif: a few seconds of level 1 played by a scripted bot, captured
// straight from the game canvas and encoded with ffmpeg (which must be installed).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { openGame, ROOT } = require('./browser');

const OUT = path.join(ROOT, 'docs', 'gameplay.gif');
const FPS = 30, STEPS = 60 / FPS;   // the game runs at 60 Hz: keep every 2nd frame, play back in real time
const SECONDS = 8;

// One continuous run through the start of level 1, played the way a person would:
// keep moving, jump only for walls, gaps and water drops, shoot when an enemy is ahead.
const setup = `() => {
  localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta(); GAME.toasts = []; GAME.applySkin();
  T.play(0); window.__hold = 0; window.__cool = 0; T.step(20);
}`;
const tick = `() => {
  const w = GAME.world, p = w.player;
  GAME.dialog = null; p.hp = p.maxHp;
  Input.down.clear(); Input.down.add('right');
  const tx = Math.floor((p.x + p.w + 12) / 16), ty = Math.floor((p.y + p.h - 1) / 16);
  const wall = w.solidAt(tx, ty) || w.solidAt(tx, ty - 1);
  const gap = !w.solidAt(tx, ty + 1) && !w.solidAt(tx, ty + 2) && !w.oneWayAt(tx, ty + 1);
  const drop = w.objects.some(o => !o.dead && (o.type === 'drop' || o.type === 'crystal') && o.x - p.x > 16 && o.x - p.x < 64 && p.y - o.y > 24 && p.y - o.y < 76);
  const foe = w.enemies.find(e => !e.dead && e.x - p.x > 10 && e.x - p.x < 110 && Math.abs(e.y - p.y) < 28);
  if (p.ground && window.__hold <= 0 && (wall || gap || drop)) { Input.pressed.add('jump'); window.__hold = drop || wall ? 22 : 16; }
  if (window.__hold-- > 0) Input.down.add('jump');
  if (foe && window.__cool-- <= 0) { Input.pressed.add('shoot'); window.__cool = 22; }
}`;

(async () => {
  if (!fs.existsSync('/usr/bin/ffmpeg') && !process.env.PATH.split(':').some(d => fs.existsSync(path.join(d, 'ffmpeg')))) throw new Error('ffmpeg is required');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pichonkun-gif-'));
  const { page, errors, close } = await openGame();
  let n = 0;
  await page.evaluate(`(${setup})(); window.__tick = ${tick};`);
  for (; n < SECONDS * FPS; n++) {
    const data = await page.evaluate(`T.step(${STEPS}, window.__tick); GAME.saveFlash = 0; GAME.render(); GAME.canvas.toDataURL('image/png')`);
    fs.writeFileSync(path.join(dir, `f${String(n).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  await close();
  if (errors.length) throw new Error(errors.join(' | '));
  const scale = process.env.GIF_WIDTH || '432';
  const vf = `fps=${FPS},scale=${scale}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'), '-vf', vf, OUT]);
  fs.rmSync(dir, { recursive: true });
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${n} frames, ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`);
})().catch(e => { console.error(e); process.exit(1); });
