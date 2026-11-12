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
  'level-06-frosty-coils': () => { T.play(5); T.bot(250, { god: true }); },
  'level-07-drip-drain': () => { T.play(6); T.bot(160, { god: true }); },
  'level-09-factory': () => { T.play(8); T.bot(230, { god: true }); },
  'riddle': () => { T.play(0); const w = GAME.world; const t = w.objects.find(o => o.type === 'terminal'); w.player.x = t.x - 14; w.player.y = t.y - 2; w.snapCamera(); T.step(5); GAME.openRiddle(LEVELS[0].riddles[0], 0); T.step(12); },
  'dialog': () => { T.play(4); T.step(30, () => {}); GAME.say(LEVELS[4].npcs[0]); T.step(200); },
  'boss-smogmaw': () => {
    T.play(9); const w = GAME.world; w.player.x = w.boss.x - 120; w.player.y = 150; w.player.face = 1; w.snapCamera();
    T.step(20, () => { GAME.dialog = null; });
    T.step(140, i => { GAME.dialog = null; w.player.inv = 0; w.player.hp = 3; Input.down.add('up'); if (i % 14 === 0) Input.pressed.add('shoot'); });
    Input.down.clear();
  },
  'level-select': () => { GAME.save.unlocked = 7; GAME.save.best = { 0: 17, 1: 20, 2: 15, 3: 22, 4: 12, 5: 18 }; GAME.state = 'levelselect'; GAME.lsSel = 3; },
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { page, errors, close } = await openGame();
  for (const [name, fn] of Object.entries(SHOTS)) {
    const data = await page.evaluate(`(${fn.toString()})(); GAME.saveFlash = 0; GAME.render(); GAME.canvas.toDataURL('image/png')`);
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
    console.log('wrote', name + '.png');
  }
  await close();
  if (errors.length) { console.error(errors); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
