#!/usr/bin/env node
// Regenerates docs/screenshots/*.png straight from the game canvas.
'use strict';
const fs = require('fs');
const path = require('path');
const { openGame, ROOT } = require('./browser');

const OUT = path.join(ROOT, 'docs', 'screenshots');

const SHOTS = {
  'title': () => { localStorage.clear(); GAME.save = defaultSave(); GAME.save.started = true; GAME.state = 'title'; T.step(90); },
  'story': () => { GAME.beginStory(); T.step(150); },
  'level-01-meadow': () => { T.play(0); T.bot(150, { god: true }); },
  'level-02-pollen-peaks': () => { T.play(1); T.bot(330, { god: true }); },
  'level-03-smog-street': () => { T.play(2); T.bot(210, { god: true }); },
  'level-04-intake-duct': () => { T.play(3); T.bot(470, { god: true }); },
  'level-05-filter-fortress': () => { T.play(4); T.bot(330, { god: true }); },
  'level-06-frosty-coils': () => { T.play(5); T.bot(250, { god: true }); },
  'level-07-drip-drain': () => { T.play(6); T.bot(160, { god: true }); },
  'level-08-compressor-core': () => { T.play(7); T.bot(300, { god: true }); },
  'level-09-factory': () => { T.play(8); T.bot(230, { god: true }); },
  'riddle': () => { T.play(0); const w = GAME.world; const t = w.objects.find(o => o.type === 'terminal'); w.player.x = t.x - 14; w.player.y = t.y - 2; w.snapCamera(); T.step(5); GAME.openRiddle(LEVELS[0].riddles[0], 0); T.step(12); },
  'dialog': () => { T.play(0); T.step(40, i => { if (i < 14) Input.down.add('right'); else Input.down.clear(); }); GAME.say(LEVELS[0].npcs[0].slice(2)); T.step(200); },
  'boss-smogmaw': () => {
    T.play(9); const w = GAME.world; w.player.x = w.boss.x - 120; w.player.y = 150; w.player.face = 1; w.snapCamera();
    T.step(20, () => { GAME.dialog = null; });
    T.step(140, i => { GAME.dialog = null; w.player.inv = 0; w.player.hp = 3; Input.down.add('up'); if (i % 14 === 0) Input.pressed.add('shoot'); });
    Input.down.clear();
  },
  'boss-dust-baron': () => {
    T.play(4); const w = GAME.world; w.player.x = w.boss.x - 90; w.player.y = 150; w.player.face = 1; w.snapCamera();
    T.step(20, () => { GAME.dialog = null; });
    T.step(100, i => { GAME.dialog = null; w.player.inv = 0; w.player.hp = 3; if (i % 20 === 0) Input.pressed.add('shoot'); });
  },
  'boss-mold-queen': () => {
    T.play(6); const w = GAME.world; w.player.x = w.boss.x - 100; w.player.y = 150; w.player.face = 1; w.snapCamera();
    T.step(20, () => { GAME.dialog = null; });
    T.step(125, i => { GAME.dialog = null; w.player.inv = 0; w.player.hp = 3; if (i % 20 === 0) Input.pressed.add('shoot'); });
  },
  'level-clear': () => { T.play(1); T.bot(200, { god: true }); GAME.world.drops = GAME.world.dropsTotal; GAME.run.crystals = [0, 2]; GAME.run.score = 3180; GAME.run.bestCombo = 3; GAME.save.name = 'PIC'; GAME.levelComplete(); T.step(220); },
  'name-entry': () => { GAME.askName(() => {}); GAME.nameEdit.text = 'PICHON'; T.step(5); Input.setTyping(false); },
  'ending': () => { GAME.state = 'ending'; GAME.say(STORY_ENDING.slice(3)); T.step(160); },
  'wingman': () => {
    GAME.save.best = { 5: 90 }; GAME.save.angelXp = 20; GAME.save.air = 100;
    T.play(1); T.bot(250, { god: true });
    const w = GAME.world, p = w.player; GAME.save.air = 100; GAME.callAngel();
    const e = w.enemies.find(x => !x.dead) || w.enemies[0];
    if (e) { e.x = p.x + 90; e.y = p.y - 24; e.ox = e.x; e.oy = e.y; }
    T.step(50, i => { p.inv = 2; if (i === 44) Input.pressed.add('shoot'); }); p.hp = 7;   // 1 and 3/4 hearts
  },
  'game-over': () => { GAME.save.hard = false; T.play(2); T.bot(120, { god: true }); GAME.gameOver(); T.step(60); },
  'backup': () => { GAME.save.started = true; GAME.state = 'title'; GAME.sub = 'backup'; GAME.menu = 0; GAME.backupMsg = ''; T.step(20); },
  'secret-room': () => {
    T.play(3); const w = GAME.world, p = w.player; w.enemies = [];
    p.x = 47 * 16 + 3; p.y = 12 * 16 - 19; w.snapCamera();
    T.step(34, () => { Input.down.add('left'); }); Input.down.clear(); T.step(20);
  },
  'level-select': () => {
    const R = ['S', 'A', 'A', 'B', 'S', 'C'], C = [3, 2, 3, 1, 3, 0];
    GAME.save.unlocked = 7; GAME.save.best = { 0: 17, 1: 20, 2: 15, 3: 22, 4: 12, 5: 18 };
    R.forEach((r, i) => { GAME.save.hi[i] = { score: 9400 - i * 730, rank: r, time: 90 }; GAME.save.cry[i] = [0, 1, 2].slice(0, C[i]); });
    GAME.state = 'levelselect'; GAME.lsSel = 3;
  },
  'achievements': () => {
    ['level1', 'crystal1', 'secret1', 'combo3', 'allDrops', 'noHit', 'quiz', 'rankS', 'hero'].forEach(id => { GAME.meta.ach[id] = 1; });
    GAME.meta.finished = true; GAME.meta.cry = { 0: [0, 1, 2], 1: [0, 1, 2], 2: [0, 1, 2], 3: [0, 1] }; GAME.checkRewards(true);
    GAME.state = 'awards'; GAME.boardT = 30;
  },
  'options-skins': () => { GAME.meta.skin = 'violet'; GAME.applySkin(); GAME.state = 'title'; GAME.sub = 'options'; GAME.menu = 3; T.step(30); },
  'hard-mode': () => {
    GAME.sub = null; GAME.meta.skin = 'mint'; GAME.applySkin(); GAME.save.hard = true;
    T.play(2); T.bot(210, { god: true }); GAME.world.player.hp = 2; GAME.toasts = []; GAME.dialog = null; GAME.toast('ACHIEVEMENT!', 'CLEANING SPREE'); T.step(30); GAME.dialog = null;
    GAME.keepToast = true;
  },
  'leaderboard': () => { GAME.sub = null; GAME.save.hard = false; GAME.meta.skin = 'blue'; GAME.applySkin(); GAME.save.name = 'PICHON'; boardSubmit(GAME.save); GAME.openBoard(); T.step(30); },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { page, errors, close } = await openGame();
  for (const [name, fn] of Object.entries(SHOTS)) {
    const data = await page.evaluate(`(${fn.toString()})(); GAME.saveFlash = 0; if (!GAME.keepToast) GAME.toasts = []; GAME.keepToast = false; GAME.render(); GAME.canvas.toDataURL('image/png')`);
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', name + '.png');
  }
  await close();
  if (errors.length) { console.error(errors); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
