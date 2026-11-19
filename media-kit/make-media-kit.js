#!/usr/bin/env node
// Renders the social-media kit (character boards, transparent sprites, animation frames and GIFs)
// straight from the game's own sprite code, so the art always matches the game.
// Usage: node media-kit/make-media-kit.js   (needs Chrome like the smoke test; GIFs also need ffmpeg)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { openGame } = require('../tools/browser');

const OUT = __dirname;

// What the boards show. Roles are written for the video audience, not for players.
const CAST = {
  heroes: [
    { key: 'pichon_idle', name: 'PICHONKUN', color: '#1565d8', role: 'A tiny water droplet born in the cooling coil of the Great Air Conditioner. Brave and curious.' },
    { key: 'angel', name: 'ANGEL', color: '#c08a20', role: 'A golden guardian droplet with wings. Flies in when the air is pure.' },
    { key: 'npc_leafa', name: 'LEAFA', color: '#1f7a2a', role: 'A cheerful leaf sprite from the meadow. First friend and guide.' },
    { key: 'npc_mesh', name: 'PROF. MESH', color: '#6a5a3a', role: 'A retired, slightly clogged air filter. Knows every duct.' },
    { key: 'npc_frosty', name: 'FROSTY', color: '#2a62b0', role: 'An ice cube from the frosty coils. Melts a little when nervous.' },
    { key: 'npc_granny', name: 'GRANNY CLOUD', color: '#5a6a94', role: 'Kind old cloud of the sky. Smogmaw stole her blue.' },
    { key: 'npc_bee', name: 'BUZZBY', color: '#a86a00', role: 'A busy bee who carries pollen the nice way.' },
  ],
  bosses: [
    { key: 'boss_smogmaw', name: 'SMOGMAW', color: '#a81c14', role: 'The villain. A greedy cloud of pollution from the old factory.' },
    { key: 'boss_dustbaron', name: 'DUST BARON', color: '#676270', role: 'Boss of Filter Fortress. Sneezes and clogs.' },
    { key: 'boss_moldqueen', name: 'MOLD QUEEN', color: '#4c6e1e', role: 'Ruler of the Drip Drain. Hisses spores.' },
  ],
  enemies: [
    { key: 'pollen', name: 'POLLEN PUFF', color: '#d07a08', role: 'Floats. Makes you sneeze.' },
    { key: 'flower', name: 'PUFF FLOWER', color: '#c23684', role: 'Spits pollen balls.' },
    { key: 'bacteria', name: 'BACTERIA', color: '#1f7a28', role: 'Crawls along the floor.' },
    { key: 'dust', name: 'DUST BUNNY', color: '#676270', role: 'Hops out of dirty ducts.' },
    { key: 'virus', name: 'VIRUS', color: '#5c1a9a', role: 'Spiky. Never jump on it!' },
    { key: 'smog', name: 'SMOG CLOUD', color: '#3a3a46', role: 'Drifts and drops soot.' },
    { key: 'mold', name: 'MOLD TURRET', color: '#4c6e1e', role: 'Slimy. Shoots spores.' },
    { key: 'germfly', name: 'GERM FLY', color: '#1f7a28', role: 'Buzzes around the drain.' },
  ],
};

// Exported stills and animations: [file name, sprite key, frame index or null for all, fps]
const STILLS = [
  ...CAST.heroes, ...CAST.bosses, ...CAST.enemies,
].map(c => [c.name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/-$/, ''), c.key]);
const POSES = ['idle', 'blink', 'jump', 'fall', 'land', 'hurt', 'happy', 'shoot'];
const ANIMS = [
  ['pichonkun-run', 'pichon_run', 15], ['pichonkun-idle', 'pichon_idle', 7], ['angel-fly', 'angel', 8],
  ['smogmaw', 'boss_smogmaw', 6], ['dust-baron', 'boss_dustbaron', 6], ['mold-queen', 'boss_moldqueen', 6],
  ['pollen-puff', 'pollen', 8], ['puff-flower', 'flower', 8], ['bacteria', 'bacteria', 8], ['dust-bunny', 'dust', 8],
  ['virus', 'virus', 8], ['smog-cloud', 'smog', 8], ['mold-turret', 'mold', 8], ['germ-fly', 'germfly', 10],
  ['water-drop', 'drop', 8], ['air-crystal', 'crystal', 8],
];

// ------------------------------------------------------------------ in-page drawing
function pageRender(cast) {
  const NAVY = PAL.navy, CREAM = PAL.cream;
  const frame0 = k => (Array.isArray(SPR[k]) ? SPR[k][0] : SPR[k]);

  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; return [c, ctx];
  }
  // sprite canvases are painted at 2x the game's pixel grid; k = how many screen pixels per sprite pixel
  function spr(ctx, s, cx, footY, k) {
    const w = s.img.width * k, h = s.img.height * k;
    const x = Math.round(cx - w / 2), y = Math.round(footY - h + s.oy * 2 * k);
    ctx.drawImage(s.img, x, y, w, h);
    return { x, y, w, h };
  }
  const text = (ctx, t, x, y, col, scale, align) => FONT.draw(ctx, t, x, y, col, { scale, align });
  function para(ctx, t, x, y, w, col, scale) {
    const lines = FONT.wrap(t, Math.floor(w / (FONT.CW * scale)));
    lines.forEach((l, i) => text(ctx, l, x, y + i * (FONT.CH + 2) * scale, col, scale, 'center'));
  }
  function panel(ctx, x, y, w, h, accent) {
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = NAVY; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
    if (accent) { ctx.fillStyle = accent; ctx.fillRect(x + 4, y + 4, w - 8, 10); }
  }
  function shadow(ctx, cx, y, w) {
    ctx.fillStyle = 'rgba(13,27,94,0.18)'; ctx.fillRect(Math.round(cx - w / 2), y, Math.round(w), 6);
  }
  function header(ctx, W, title, sub) {
    ctx.fillStyle = CREAM; ctx.fillRect(0, 0, W, ctx.canvas.height);
    text(ctx, title, 40, 32, NAVY, 6);
    if (sub) text(ctx, sub, 42, 90, PAL.blue, 3);
    ctx.fillStyle = NAVY; ctx.fillRect(40, 128, W - 80, 4);
  }
  // one character card: name bar on top, sprite standing on a shadow, role text below
  function card(ctx, x, y, w, h, c, k, nameScale = 4, roleScale = 2, spriteArea) {
    panel(ctx, x, y, w, h, c.color);
    text(ctx, c.name, x + w / 2, y + 30, NAVY, nameScale, 'center');
    const foot = y + (spriteArea || h - 110);
    const s = frame0(c.key);
    shadow(ctx, x + w / 2, foot - 2, s.w * k * 1.4);
    spr(ctx, s, x + w / 2, foot, k);
    if (c.role) para(ctx, c.role, x + w / 2, foot + 22, w - 40, NAVY, roleScale);
  }
  function palette(ctx, x, y, cols, size, labels) {
    cols.forEach((col, i) => {
      ctx.fillStyle = NAVY; ctx.fillRect(x + i * (size + 14) - 3, y - 3, size + 6, size + 6);
      ctx.fillStyle = col; ctx.fillRect(x + i * (size + 14), y, size, size);
      if (labels) text(ctx, col.replace('#', ''), x + i * (size + 14) + size / 2, y + size + 12, NAVY, 2, 'center');
    });
  }
  const out = {};

  // 1. Heroes and friends (1920x1080)
  {
    const [c, ctx] = canvas(1920, 1080);
    header(ctx, 1920, 'PICHONKUN - HEROES AND FRIENDS', 'PICHONKUN AND THE CLEAN AIR ADVENTURE  /  CHARACTER BOARD 1 OF 3');
    const W = 440, H = 450, G = 26, X = 40;
    cast.heroes.slice(0, 4).forEach((ch, i) => card(ctx, X + i * (W + G), 160, W, H, ch, 5, 4, 2, 345));
    cast.heroes.slice(4).forEach((ch, i) => card(ctx, X + i * (W + G), 160 + H + 20, W, H, ch, 5, 4, 2, 345));
    // info card
    const ix = X + 3 * (W + G), iy = 160 + H + 20;
    panel(ctx, ix, iy, W, H, PAL.cyan);
    text(ctx, 'CORE PALETTE', ix + W / 2, iy + 30, NAVY, 4, 'center');
    palette(ctx, ix + 28, iy + 90, [PAL.navy, PAL.blue, PAL.cyan, PAL.light], 76, true);
    palette(ctx, ix + 28, iy + 220, [PAL.white, PAL.cream, '#ffc81e', '#f03a62'], 76, true);
    para(ctx, 'NAVY OUTLINES, WATER BLUES, CREAM PAPER. GOLD = REWARDS, RED = HEARTS.', ix + W / 2, iy + 360, W - 40, NAVY, 2);
    out['character-board-1-heroes'] = c.toDataURL();
  }

  // 2. Villains (1920x1080)
  {
    const [c, ctx] = canvas(1920, 1080);
    header(ctx, 1920, 'PICHONKUN - VILLAINS', 'SMOGMAW, HIS BOSSES AND THE GERMS  /  CHARACTER BOARD 2 OF 3');
    const ws = [720, 540, 540], G = 20; let x = 40;
    cast.bosses.forEach((b, i) => { card(ctx, x, 160, ws[i], 500, b, 4, 4, 2, 420); x += ws[i] + G; });
    const W = 215, H = 360, y = 680;
    cast.enemies.forEach((e, i) => card(ctx, 40 + i * (W + 15.7), y, W, H, e, 5, 2, 2, 270));
    out['character-board-2-villains'] = c.toDataURL();
  }

  // 3. Pichonkun model sheet (1920x1080)
  {
    const [c, ctx] = canvas(1920, 1080);
    header(ctx, 1920, 'PICHONKUN - MODEL SHEET', 'POSES, RUN CYCLE, REWARD SKINS  /  CHARACTER BOARD 3 OF 3');
    const poses = [['IDLE', 'pichon_idle'], ['BLINK', 'pichon_blink'], ['JUMP', 'pichon_jump'], ['FALL', 'pichon_fall'],
      ['LAND', 'pichon_land'], ['SHOOT', 'pichon_shoot'], ['HURT', 'pichon_hurt'], ['HAPPY', 'pichon_happy']];
    panel(ctx, 40, 150, 1840, 310, PAL.blue);
    poses.forEach(([n, k], i) => {
      const cx = 40 + 115 + i * 230; spr(ctx, frame0(k), cx, 400, 4); shadow(ctx, cx, 398, 120);
      text(ctx, n, cx, 420, NAVY, 3, 'center');
    });
    panel(ctx, 40, 475, 1840, 320, PAL.cyan);
    text(ctx, 'RUN CYCLE  (12 FRAMES)', 70, 495, NAVY, 3);
    SPR.pichon_run.forEach((s, i) => { const cx = 40 + 77 + i * 153; spr(ctx, s, cx, 755, 4); shadow(ctx, cx, 753, 110); text(ctx, String(i + 1), cx, 768, PAL.blue, 2, 'center'); });
    panel(ctx, 40, 810, 1840, 250, '#ffc81e');
    text(ctx, 'REWARD SKINS', 70, 834, NAVY, 3);
    SKINS.forEach(([id, label], i) => {
      setSkin(id, SKINS[i][4]); const cx = 160 + i * 190; spr(ctx, SPR.pichon_idle[0], cx, 1010, 3); shadow(ctx, cx, 1008, 90);
      text(ctx, label, cx, 1024, NAVY, 2, 'center');
    });
    setSkin('blue', null);
    const ax = 1360; spr(ctx, SPR.angel[1], ax, 1010, 3); shadow(ctx, ax, 1008, 90); text(ctx, 'ANGEL', ax, 1024, NAVY, 2, 'center');
    para(ctx, 'SAME BODY, NEW HEAD COLOUR. ANGEL IS PICHONKUN IN GOLD WITH WINGS.', 1640, 900, 400, NAVY, 2);
    out['character-board-3-pichonkun'] = c.toDataURL();
  }

  // 4. Vertical cast poster for Reels / Shorts / TikTok (1080x1920)
  {
    const [c, ctx] = canvas(1080, 1920);
    ctx.fillStyle = PAL.navy; ctx.fillRect(0, 0, 1080, 1920);
    // sky gradient in hard bands, like the game's backdrops
    const bands = ['#0d1b5e', '#122a7a', '#1a3c96', '#1352c8', '#1a80e6', '#1cb0f2', '#4fcdf8', '#a8e8fc'];
    bands.forEach((b, i) => { ctx.fillStyle = b; ctx.fillRect(0, 1100 + i * 40, 1080, 40); });
    for (let i = 0; i < 70; i++) { const x = (i * 397) % 1080, y = (i * 211) % 1050; if (y < 270 && x > 160 && x < 920) continue; ctx.fillStyle = i % 5 ? '#b5ecfc' : '#ffe680'; ctx.fillRect(x, y, i % 3 ? 4 : 8, i % 3 ? 4 : 8); }
    text(ctx, 'PICHONKUN', 540, 90, '#ffffff', 13, 'center');
    text(ctx, 'AND THE CLEAN AIR ADVENTURE', 540, 210, PAL.cyan, 4, 'center');
    // hero + angel
    spr(ctx, SPR.angel[1], 820, 560, 6);
    spr(ctx, SPR.pichon_idle[0], 470, 940, 11);
    text(ctx, 'A TINY DROPLET', 540, 990, '#ffffff', 5, 'center');
    text(ctx, 'VS. A GIANT SMOG CLOUD', 540, 1050, '#ffe680', 5, 'center');
    // friends
    const fr = ['npc_leafa', 'npc_mesh', 'npc_frosty', 'npc_granny', 'npc_bee'];
    fr.forEach((k, i) => spr(ctx, frame0(k), 120 + i * 210, 1370, 4));
    // villains on a smog band
    ctx.fillStyle = '#23232c'; ctx.fillRect(0, 1420, 1080, 500);
    ctx.fillStyle = '#3a3a46'; for (let x = 0; x < 1080; x += 60) ctx.fillRect(x, 1410 + (x / 60 % 2) * 10, 60, 20);
    spr(ctx, frame0('boss_dustbaron'), 170, 1780, 3);
    spr(ctx, frame0('boss_smogmaw'), 560, 1760, 4);
    spr(ctx, frame0('boss_moldqueen'), 930, 1780, 3);
    text(ctx, 'PLAY FREE IN YOUR BROWSER', 540, 1830, '#ffffff', 4, 'center');
    text(ctx, 'IIOGURT.GITHUB.IO/PICHONKUN-PLATFORMER', 540, 1880, PAL.light, 2, 'center');
    out['cast-poster-vertical'] = c.toDataURL();
  }
  return out;
}

// transparent PNG of one sprite frame, k screen pixels per sprite pixel, with a small margin
function pageSprite(key, frame, k) {
  const v = SPR[key], s = Array.isArray(v) ? v[frame] : v;
  const c = document.createElement('canvas'); const m = 4 * k;
  c.width = s.img.width * k + m * 2; c.height = s.img.height * k + m * 2;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.img, m, m, s.img.width * k, s.img.height * k);
  return c.toDataURL();
}

const save = (file, dataUrl) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
};

function hasFfmpeg() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

(async () => {
  const { page, errors, close } = await openGame();
  try {
    const boards = await page.evaluate(pageRender, CAST);
    for (const [name, url] of Object.entries(boards)) { save(path.join(OUT, 'boards', name + '.png'), url); console.log('board   ', name); }

    for (const [name, key] of STILLS) save(path.join(OUT, 'sprites', name + '.png'), await page.evaluate(pageSprite, key, 0, 8));
    for (const p of POSES) save(path.join(OUT, 'sprites', 'pichonkun-' + p + '.png'), await page.evaluate(pageSprite, 'pichon_' + p, 0, 8));
    console.log('sprites ', STILLS.length + POSES.length, 'transparent PNGs');

    const ff = hasFfmpeg();
    for (const [name, key, fps] of ANIMS) {
      const n = await page.evaluate(k => SPR[k].length, key);
      const dir = path.join(OUT, 'animations', name);
      fs.rmSync(dir, { recursive: true, force: true });
      for (let i = 0; i < n; i++) save(path.join(dir, `frame-${String(i + 1).padStart(2, '0')}.png`), await page.evaluate(pageSprite, key, i, 8));
      if (ff) {
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'frame-%02d.png'),
          '-vf', 'split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse', '-loop', '0', path.join(OUT, 'animations', name + '.gif')]);
      }
    }
    console.log('anims   ', ANIMS.length, ff ? 'frame sets + GIFs' : 'frame sets (no ffmpeg, GIFs skipped)');
    if (errors.length) { console.error('Page errors:', errors); process.exitCode = 1; }
  } finally {
    await close();
  }
})().catch(e => { console.error(e); process.exit(1); });
