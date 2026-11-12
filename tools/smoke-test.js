#!/usr/bin/env node
// Headless smoke test: boots the real game in Chrome and drives every level and screen.
'use strict';
const assert = require('assert');
const { openGame } = require('./browser');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('title screen renders', async page => {
  await page.evaluate(() => { T.step(60); GAME.render(); });
  assert.strictEqual(await page.evaluate(() => GAME.state), 'title');
});

test('intro story leads into level 1', async page => {
  const s = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.beginStory();
    let guard = 0;
    while (GAME.dialog && guard++ < 5000) { Input.pressed.add('confirm'); GAME.update(); Input.endFrame(); }
    GAME.update(); GAME.render();
    return { state: GAME.state, level: GAME.world && GAME.world.idx };
  });
  assert.deepStrictEqual(s, { state: 'intro', level: 0 });
});

for (let i = 0; i < 10; i++) {
  test(`level ${i + 1} loads and plays`, async page => {
    const r = await page.evaluate(lv => {
      T.play(lv); const x0 = GAME.world.player.x;
      T.bot(400, { god: true }); GAME.render();
      const p = GAME.world.player;
      return { ok: Number.isFinite(p.x) && Number.isFinite(p.y), moved: p.x - x0, state: GAME.state };
    }, i);
    assert.ok(r.ok, 'player position is not finite');
    assert.ok(r.moved > 100, `player barely moved (${r.moved}px)`);
  });
}

test('riddle: wrong answer gives hint, right answer opens the gate', async page => {
  const r = await page.evaluate(() => {
    T.play(0);
    const w = GAME.world, rd = LEVELS[0].riddles[0];
    const gatesBefore = w.grid.flat().filter(c => c === 'G').length;
    GAME.openRiddle(rd, 0); T.step(12);
    GAME.riddle.sel = (rd.ok + 1) % rd.a.length; Input.pressed.add('confirm'); T.step(1);
    const hint = GAME.riddle && GAME.riddle.msg;
    GAME.riddle.sel = rd.ok; Input.pressed.add('confirm'); T.step(1);
    return { hint, gatesBefore, gatesAfter: w.grid.flat().filter(c => c === 'G').length, open: GAME.riddle };
  });
  assert.ok(r.hint && r.hint.includes('HINT'));
  assert.ok(r.gatesBefore > 0 && r.gatesAfter === 0, 'gate did not open');
  assert.strictEqual(r.open, null);
});

test('lever puzzle: wrong order resets, right order opens doors', async page => {
  const r = await page.evaluate(() => {
    T.play(2);
    const w = GAME.world, order = LEVELS[2].levers.order;
    w.pullLever(w.levers[order[1]]); GAME.dialog = null;
    const reset = w.levers.every(l => !l.on);
    order.forEach(i => w.pullLever(w.levers[i]));
    return { reset, doors: w.grid.flat().filter(c => c === 'D').length };
  });
  assert.ok(r.reset, 'levers did not reset after wrong order');
  assert.strictEqual(r.doors, 0, 'doors did not open');
});

for (const lv of [4, 6, 9]) {
  test(`boss in level ${lv + 1} can be damaged`, async page => {
    const r = await page.evaluate(lv => {
      T.play(lv);
      const w = GAME.world;
      w.player.x = w.boss.x - 110; w.player.y = 150; w.player.face = 1; w.snapCamera();
      T.step(20, () => { GAME.dialog = null; });
      T.step(500, i => {
        GAME.dialog = null; w.player.inv = 2; w.player.hp = 3;
        if (lv === 9) Input.down.add('up');
        if (i % 14 === 0) Input.pressed.add('shoot');
      });
      Input.down.clear();
      return { active: w.bossActive, hp: w.boss.hp, max: w.boss.maxHp };
    }, lv);
    assert.ok(r.active, 'boss never activated');
    assert.ok(r.hp < r.max, `boss took no damage (${r.hp}/${r.max})`);
  });
}

test('checkpoint auto-saves and Continue restores it', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave();
    T.play(2);
    const w = GAME.world, cp = w.objects.find(o => o.type === 'checkpoint');
    w.player.x = cp.x + 2; w.player.y = cp.y - 2; T.step(3);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    const g2 = new Game(document.createElement('canvas'));
    g2.startLevel(g2.save.level, g2.save.cp);
    return { level: saved.level, hasCp: !!saved.cp, restoredX: Math.round(g2.world.player.x), cpX: Math.round(w.checkpoint.x) };
  });
  assert.strictEqual(r.level, 2);
  assert.ok(r.hasCp);
  assert.strictEqual(r.restoredX, r.cpX);
});

test('clearing a level unlocks the next and saves', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave();
    T.play(0); GAME.levelComplete(); T.step(70);
    Input.pressed.add('confirm'); T.step(1);
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return { unlocked: s.unlocked, state: GAME.state, level: GAME.world.idx };
  });
  assert.deepStrictEqual(r, { unlocked: 2, state: 'intro', level: 1 });
});

test('final level clear plays the ending and credits', async page => {
  const r = await page.evaluate(() => {
    T.play(9); GAME.levelComplete(); T.step(70);
    Input.pressed.add('confirm'); T.step(1);
    let guard = 0;
    while (GAME.dialog && guard++ < 5000) { Input.pressed.add('confirm'); GAME.update(); Input.endFrame(); }
    T.step(2); GAME.render();
    return GAME.state;
  });
  assert.strictEqual(r, 'credits');
});

test('audio engine runs every track and sound effect', async page => {
  await page.evaluate(() => {
    AUDIO.init();
    ['title', 'meadow', 'city', 'duct', 'ice', 'drain', 'factory', 'boss', 'sky', 'victory', 'ending'].forEach(t => AUDIO.playMusic(t));
    ['jump', 'shoot', 'stomp', 'kill', 'drop', 'hurt', 'checkpoint', 'right', 'wrong', 'gate', 'bossDie', 'powerup', 'save'].forEach(s => AUDIO.sfx(s));
    AUDIO.stopMusic();
  });
});

(async () => {
  const { page, errors, close } = await openGame();
  let failed = 0;
  for (const t of tests) {
    const before = errors.length;
    try {
      await t.fn(page);
      if (errors.length > before) throw new Error('page error: ' + errors.slice(before).join(' | '));
      console.log(`  \u2714 ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`  \u2718 ${t.name}\n      ${e.message}`);
    }
  }
  await close();
  console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
