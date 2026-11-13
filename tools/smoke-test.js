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
    T.play(0); GAME.levelComplete(); T.step(100);
    Input.pressed.add('confirm'); T.step(1);
    const asked = GAME.state;                       // first clear of a new game asks for initials
    T.step(12);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ' }));       // letters are text here, not "jump"
    'ora 99!!'.split('').forEach(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: 'X' })));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace' }));
    T.step(1); const typing = GAME.state;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' })); T.step(1);
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    return { unlocked: s.unlocked, asked, typing, name: s.name, state: GAME.state, level: GAME.world.idx };
  });
  assert.deepStrictEqual(r, { unlocked: 2, asked: 'name', typing: 'name', name: 'ZORA 99', state: 'intro', level: 1 });
});

test('final level clear plays the ending and credits', async page => {
  const r = await page.evaluate(() => {
    T.play(9); GAME.levelComplete(); T.step(100);
    Input.pressed.add('confirm'); T.step(1);
    let guard = 0;
    while (GAME.dialog && guard++ < 5000) { Input.pressed.add('confirm'); GAME.update(); Input.endFrame(); }
    T.step(2); GAME.render();
    return GAME.state;
  });
  assert.strictEqual(r, 'credits');
});

test('every level has 3 crystals; collecting one scores and is remembered', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave();
    const counts = LEVELS.map((_, i) => { T.play(i); return GAME.world.crystalTotal; });
    T.play(0);
    const w = GAME.world, c = w.objects.find(o => o.type === 'crystal' && !o.hidden);
    w.player.x = c.x; w.player.y = c.y; T.step(8);
    const score = GAME.run.score, got = GAME.run.crystals.slice();
    GAME.respawn();
    const again = GAME.world.objects.find(o => o.type === 'crystal' && o.id === c.id);
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY)).cp.run.crystals;
    return { counts, score, got, stillGone: again.dead, saved };
  });
  assert.deepStrictEqual(r.counts, new Array(10).fill(3));
  assert.ok(r.score >= 500, `score was ${r.score}`);
  assert.deepStrictEqual(r.got, r.saved);
  assert.ok(r.stillGone, 'crystal came back after respawn');
});

test('secret walls: solid for shots and enemies, open for Pichonkun, reveal pays once', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave();
    T.play(1);
    const w = GAME.world, sc = w.secrets[0], [tx, ty] = sc.tiles[0];
    const solidForOthers = w.solidAt(tx, ty);
    w.ghost = true; const openForPlayer = !w.solidAt(tx, ty); w.ghost = false;
    w.player.x = tx * 16 + 3; w.player.y = ty * 16 - 2; w.player.vy = 0; T.step(3);
    const first = GAME.run.score;
    GAME.respawn(); const w2 = GAME.world;
    w2.player.x = tx * 16 + 3; w2.player.y = ty * 16 - 2; T.step(3);
    return { n: w.secrets.length, solidForOthers, openForPlayer, revealed: sc.revealed, first, second: GAME.run.score, kept: w2.secrets[0].revealed };
  });
  assert.ok(r.n >= 1 && r.solidForOthers && r.openForPlayer && r.revealed && r.kept);
  assert.ok(r.first >= 250, `reveal paid ${r.first}`);
  assert.strictEqual(r.second, r.first, 'secret paid twice');
});

test('combo: quick kills multiply, each enemy pays once per run', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave();
    T.play(0);
    const w = GAME.world, [a, b] = w.enemies;
    w.damageEnemy(a, 9, 1); const s1 = GAME.run.score;
    w.damageEnemy(b, 9, 1); const s2 = GAME.run.score - s1;
    const base = ENEMY_DEFS[b.ch].hp * SCORE.killPerHp;
    GAME.respawn();
    const again = GAME.world.enemies.find(e => e.id === a.id);
    GAME.world.damageEnemy(again, 9, 1);
    return { s1, s2, base, combo: w.combo, after: GAME.run.score - s1 - s2 };
  });
  assert.ok(r.s1 > 0);
  assert.strictEqual(r.s2, r.base * 2, 'second quick kill should be doubled');
  assert.strictEqual(r.after, 0, 'respawned enemy paid again');
});

test('level clear tallies a rank, stores the best score and updates the leaderboard', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.save.name = 'TST';
    T.play(0); GAME.run.score = 2000; GAME.levelComplete(); T.step(200); GAME.render();
    const t = GAME.tally, hi = GAME.save.hi[0];
    const board = JSON.parse(localStorage.getItem(BOARD_KEY));
    T.play(0); GAME.run.score = 10; GAME.run.hits = 2; GAME.run.time = 60 * 999; GAME.levelComplete();
    const board2 = JSON.parse(localStorage.getItem(BOARD_KEY));
    GAME.openBoard(); T.step(5); GAME.render();
    return { total: t.total, rank: t.rank, hi: hi.score, row: board.find(e => e.id === GAME.save.runId), sorted: board.every((e, i) => !i || board[i - 1].score >= e.score), n: board.length, keptBest: GAME.save.hi[0].score, rows2: board2.filter(e => e.id === GAME.save.runId).length, state: GAME.state };
  });
  assert.ok(r.total > 2000 && 'SABCD'.includes(r.rank));
  assert.strictEqual(r.hi, r.total);
  assert.ok(r.row && r.row.name === 'TST' && r.row.score === r.total, 'player row missing from the board');
  assert.ok(r.sorted && r.n <= 10);
  assert.strictEqual(r.keptBest, r.total, 'a worse replay overwrote the best score');
  assert.strictEqual(r.rows2, 1, 'player should have exactly one row');
  assert.strictEqual(r.state, 'board');
});

test('achievements unlock once, survive New Game and unlock reward skins', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta(); GAME.toasts = [];
    T.play(0);
    const c = GAME.world.objects.find(o => o.type === 'crystal' && !o.hidden);
    GAME.world.player.x = c.x; GAME.world.player.y = c.y; T.step(4);
    const first = Object.keys(GAME.meta.ach), toasts = GAME.toasts.length;
    GAME.award('crystal1');
    const noRepeat = GAME.toasts.length === toasts;
    GAME.render();
    // 10 crystals found over time -> MINT skin
    GAME.meta.cry = { 0: [0, 1, 2], 1: [0, 1, 2], 2: [0, 1, 2] }; GAME.onCrystal(3, 0);
    const skins = GAME.meta.skins.slice();
    GAME.meta.skin = 'mint'; GAME.applySkin(); const mint = SPR.pichon_idle[0];
    GAME.meta.skin = 'blue'; GAME.applySkin(); const blue = SPR.pichon_idle[0];
    GAME.newGame(false); GAME.dialog = null;
    const stored = JSON.parse(localStorage.getItem(META_KEY));
    GAME.state = 'awards'; GAME.boardT = 0; GAME.render();
    return { first, noRepeat, skins, differs: mint !== blue, kept: !!stored.ach.crystal1 && !!GAME.meta.ach.crystal1, ids: ACHIEVEMENTS.map(a => a[0]) };
  });
  assert.ok(r.first.includes('crystal1'));
  assert.ok(r.noRepeat, 'achievement was announced twice');
  assert.ok(r.skins.includes('mint'), 'mint skin not unlocked at 10 crystals');
  assert.ok(r.differs, 'skin did not change the sprites');
  assert.ok(r.kept, 'achievement lost on New Game');
  assert.strictEqual(new Set(r.ids).size, r.ids.length);
});

test('hard mode: unlocked by finishing, 2 hearts, tougher enemies, score x1.5', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta(); GAME.toasts = [];
    GAME.state = 'title'; GAME.sub = null; GAME.menu = 0;
    const press = () => { Input.pressed.add('confirm'); T.step(1); };
    press();                                   // NEW GAME on a fresh, unfinished game: straight into the story
    const lockedGoesToStory = GAME.state === 'story'; GAME.dialog = null;
    T.play(0); const nHp = GAME.world.enemies[0].hp, nBoss = (T.play(4), GAME.world.boss.maxHp);
    T.play(9); GAME.levelComplete();           // finishing the game unlocks hard mode
    const unlocked = GAME.meta.finished;
    GAME.dialog = null; GAME.state = 'title'; GAME.sub = null; GAME.confirmErase = false;
    GAME.menu = GAME.titleItems().indexOf('NEW GAME'); press(); press();   // confirm erase -> mode menu
    const sub = GAME.sub;
    GAME.menu = GAME.titleItems().indexOf('HARD'); press(); GAME.dialog = null;
    T.play(0);
    const w = GAME.world, hp = w.player.maxHp, eHp = w.enemies[0].hp;
    const pts = GAME.addScore(100);
    T.play(4); const boss = GAME.world.boss.maxHp;
    T.play(0); GAME.levelComplete(); GAME.render();
    return { lockedGoesToStory, unlocked, sub, hard: GAME.save.hard, hp, eHp, nHp, pts, boss, nBoss, ach: !!GAME.meta.ach.hard1, row: JSON.parse(localStorage.getItem(BOARD_KEY) || '[]').some(e => e.hard) };
  });
  assert.ok(r.lockedGoesToStory && r.unlocked);
  assert.strictEqual(r.sub, 'mode');
  assert.ok(r.hard, 'save is not in hard mode');
  assert.strictEqual(r.hp, 2);
  assert.strictEqual(r.eHp, r.nHp + 1);
  assert.strictEqual(r.pts, 150);
  assert.ok(r.boss > r.nBoss);
  assert.ok(r.ach, 'hard-mode achievement missing');
});

test('name can be changed from Options and the leaderboard row follows', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.save.name = 'OLD'; GAME.save.hi[0] = { score: 5000, rank: 'B', time: 60 };
    boardSubmit(GAME.save);
    Input.down.clear(); GAME.dialog = null; GAME.confirmErase = false; GAME.state = 'title'; GAME.sub = 'options'; GAME.menu = GAME.titleItems().findIndex(i => i.startsWith('NAME'));
    Input.pressed.add('confirm'); T.step(12); GAME.render();
    for (let i = 0; i < 3; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace' }));
    'newname99'.split('').forEach(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: 'X' })));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter' })); T.step(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ' }));
    const row = JSON.parse(localStorage.getItem(BOARD_KEY)).find(e => e.id === GAME.save.runId);
    return { state: GAME.state, name: GAME.save.name, row: row && row.name, keysBackToNormal: Input.pressed.has('jump') };
  });
  assert.deepStrictEqual(r, { state: 'title', name: 'NEWNAME9', row: 'NEWNAME9', keysBackToNormal: true });
});

test('splash power grows with water drops collected over the adventure', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta(); GAME.toasts = []; Input.down.clear(); GAME.dialog = null;
    const fire = (banked) => {
      GAME.save.best = { 5: banked }; T.play(0);
      const w = GAME.world; w.enemies = [];
      Input.pressed.add('shoot'); T.step(1);
      return { lv: GAME.splashLevel(), n: w.shots.length, dmg: w.shots.reduce((m, x) => Math.max(m, x.dmg), 0) };
    };
    const levels = [0, 15, 45, 85, 130].map(fire);
    // crossing a threshold while collecting announces the new power
    GAME.save.best = { 5: 14 }; T.play(0); GAME.toasts = [];
    const w = GAME.world, d = w.objects.find(o => o.type === 'drop');
    w.player.x = d.x; w.player.y = d.y; T.step(3);
    return { levels, announced: GAME.toasts.some(t => t.title.startsWith('SPLASH POWER 2')), now: GAME.splashLevel() };
  });
  assert.deepStrictEqual(r.levels.map(l => l.lv), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(r.levels.map(l => l.n), [1, 1, 2, 3, 3]);
  assert.strictEqual(r.levels[4].dmg, 2);
  assert.ok(r.announced && r.now === 2, 'power-up was not announced');
});

test('angel: earned with a full PURE AIR meter, temporary, shoots and levels up', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta(); GAME.toasts = []; Input.down.clear(); GAME.dialog = null;
    T.play(0);
    const w = GAME.world, p = w.player;
    const absentAtStart = w.wing === null;
    Input.pressed.add('angel'); T.step(1);
    const refusedWhenEmpty = w.wing === null;
    // cleaning enemies fills the meter, getting hurt drains it
    const [a, b] = w.enemies; w.damageEnemy(a, 9, 1); const afterKill = GAME.save.air;
    p.inv = 0; p.hurt(1); const afterHurt = GAME.save.air; p.hp = p.maxHp; p.inv = 0;
    GAME.save.air = AIR.full; GAME.save.angelXp = ANGEL.need[1] - 1;
    Input.pressed.add('angel'); T.step(1);
    const called = !!w.wing, meterSpent = GAME.save.air === 0, lv = w.wing.level, life = w.wing.life;
    GAME.addAir(50); const frozen = GAME.save.air === 0;
    // it shoots what is near and its kills are experience
    w.enemies.forEach(e => { e.x += 5000; });
    b.x = p.x + 60; b.y = p.y - 10; b.ox = b.x; b.oy = b.y; b.hp = 1;
    let angelShot = false;
    T.step(150, () => { GAME.dialog = null; p.inv = 2; if (w.shots.some(x => x.angel)) angelShot = true; });
    const xp = GAME.save.angelXp, lvAfter = GAME.angelLevel();
    T.step(life, () => { GAME.dialog = null; p.inv = 2; });
    return { absentAtStart, refusedWhenEmpty, afterKill, afterHurt, called, meterSpent, lv, seconds: life / 60, frozen, angelShot, xp, lvAfter, gone: w.wing === null };
  });
  assert.ok(r.absentAtStart && r.refusedWhenEmpty, 'angel must be earned');
  assert.ok(r.afterKill > 0 && r.afterHurt < r.afterKill, 'meter should fill on kills and drain on damage');
  assert.ok(r.called && r.meterSpent && r.frozen);
  assert.strictEqual(r.lv, 1); assert.strictEqual(r.seconds, 15);
  assert.ok(r.angelShot, 'angel never shot');
  assert.ok(r.xp >= 6 && r.lvAfter === 2, `angel did not level up (xp ${r.xp})`);
  assert.ok(r.gone, 'angel should leave when its time is up');
});

test('backup: export and import round-trip, bad files rejected, New Game can be undone', async page => {
  const r = await page.evaluate(() => {
    localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta(); GAME.toasts = []; Input.down.clear(); GAME.dialog = null;
    Object.assign(GAME.save, { started: true, unlocked: 6, name: 'ZORA', air: 40, angelXp: 7, hi: { 0: { score: 7000, rank: 'A', time: 80 } }, best: { 0: 17 } });
    GAME.meta.ach.crystal1 = 1; writeSave(GAME.save); writeMeta(GAME.meta); boardSubmit(GAME.save);
    const file = JSON.parse(JSON.stringify(GAME.exportData()));
    const bad = [GAME.importData(null), GAME.importData({ app: 'other' }), GAME.importData(Object.assign({}, file, { board: [{ name: 5 }] }))];
    const untouched = GAME.save.unlocked === 6;
    localStorage.clear(); GAME.save = defaultSave(); GAME.meta = defaultMeta();      // "the browser lost everything"
    const err = GAME.importData(file);
    const back = { unlocked: GAME.save.unlocked, name: GAME.save.name, xp: GAME.save.angelXp, ach: !!GAME.meta.ach.crystal1,
      row: loadBoard().some(e => e.name === 'ZORA' && e.score === 7000), stored: JSON.parse(localStorage.getItem(SAVE_KEY)).unlocked };
    GAME.newGame(false); GAME.dialog = null;
    const fresh = GAME.save.unlocked;
    GAME.restorePrevious();
    GAME.state = 'title'; GAME.sub = 'backup'; GAME.menu = 0; GAME.render();
    return { bad, untouched, err, back, fresh, undone: GAME.save.unlocked, items: GAME.titleItems() };
  });
  assert.ok(r.bad.every(e => e), 'a bad backup was accepted');
  assert.ok(r.untouched, 'a rejected import changed the save');
  assert.strictEqual(r.err, '');
  assert.deepStrictEqual(r.back, { unlocked: 6, name: 'ZORA', xp: 7, ach: true, row: true, stored: 6 });
  assert.strictEqual(r.fresh, 1); assert.strictEqual(r.undone, 6);
  assert.ok(r.items.includes('RESTORE LAST ADVENTURE'));
});

test('audio engine runs every track and sound effect', async page => {
  await page.evaluate(() => {
    AUDIO.init();
    ['title', 'meadow', 'city', 'duct', 'ice', 'drain', 'factory', 'boss', 'sky', 'victory', 'ending'].forEach(t => AUDIO.playMusic(t));
    ['jump', 'shoot', 'stomp', 'kill', 'drop', 'hurt', 'checkpoint', 'right', 'wrong', 'gate', 'bossDie', 'powerup', 'save', 'crystal', 'secret', 'combo', 'award'].forEach(s => AUDIO.sfx(s));
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
