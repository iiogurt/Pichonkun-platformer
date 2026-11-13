// Main game: input, saving, state machine, rendering and UI.
'use strict';
const VIEW_W = 384, VIEW_H = 216, RES = 2;
const SAVE_KEY = 'pichonkun_save_v1';
const BOARD_KEY = 'pichonkun_scores_v1';
const PREV_KEY = 'pichonkun_save_prev';   // the adventure replaced by the last New Game
const GAME_VERSION = '1.6.0';

// ================================================================== INPUT
const Input = (() => {
  const down = new Set(), pressed = new Set();
  const MAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
    KeyX: 'shoot', KeyJ: 'shoot', KeyL: 'shoot', KeyC: 'angel', KeyV: 'angel',
    KeyE: 'interact', Enter: 'confirm', Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
  };
  const press = (a) => { if (!down.has(a)) pressed.add(a); down.add(a); };
  const release = (a) => down.delete(a);
  // While a name is being typed, letter keys are text, not game actions.
  const typed = [];
  let typing = false;
  window.addEventListener('keydown', (ev) => {
    AUDIO.init();
    if (typing) {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key.length === 1) typed.push(ev.key.toUpperCase());
      else if (ev.key === 'Backspace' || ev.key === 'Delete') typed.push('\b');
      else if (ev.key === 'Enter') press('confirm');
      else if (ev.code.startsWith('Arrow')) { if (!ev.repeat) press(MAP[ev.code]); }
      else return;
      ev.preventDefault();
      return;
    }
    const a = MAP[ev.code];
    if (!a) return;
    ev.preventDefault();
    if (!ev.repeat) press(a);
  });
  window.addEventListener('keyup', (ev) => { const a = MAP[ev.code]; if (a) release(a); });
  window.addEventListener('blur', () => down.clear());
  return {
    down, pressed, press, release, typed,
    setTyping: (on) => { typing = on; typed.length = 0; },
    is: (a) => down.has(a),
    hit: (a) => pressed.has(a),
    any: (...as) => as.some(a => pressed.has(a)),
    endFrame: () => pressed.clear(),
  };
})();
const CONFIRM = ['confirm', 'jump', 'interact', 'shoot'];

// =================================================================== SAVE
const newRunId = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
// Score state of the level being played. Kept across deaths, stored with every auto-save.
const newRun = () => ({ score: 0, time: 0, hits: 0, deaths: 0, kills: [], crystals: [], secrets: [], miss: {}, leverMiss: 0, bossDmg: 0, boss: false, bossHurt: 0, bestCombo: 0 });
function defaultSave() {
  return { unlocked: 1, level: 0, cp: null, vapor: false, best: {}, hi: {}, cry: {}, name: '', runId: newRunId(), hard: false, air: 0, angelXp: 0, stats: { kills: 0, deaths: 0, hits: 0 }, started: false, finished: false, music: true, sfx: true, gfx: 'high', gfxAuto: true };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.unlocked === 'number') return Object.assign(defaultSave(), s);
  } catch { /* corrupt or unavailable storage: start fresh */ }
  return defaultSave();
}
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }

// ============================================================ LEADERBOARD
// A local top-10 table (this browser only). The friends of Breezeville hold the
// starting scores so there is always somebody to beat.
const BOARD_SIZE = 10;
const BOARD_SEED = [['GRANNY', 60000], ['LEAFA', 48000], ['P. MESH', 38000], ['FROSTY', 29000], ['BUZZBY', 21000], ['BARON', 14000], ['QUEEN', 8000], ['SMOGMAW', 3000]];
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .-!', NAME_MAX = 8;
function loadBoard() {
  try {
    const b = JSON.parse(localStorage.getItem(BOARD_KEY));
    if (Array.isArray(b) && b.every(e => e && typeof e.name === 'string' && typeof e.score === 'number')) {
      // residents keep their current (longer) names even on boards stored by older versions
      for (const e of b) if (e.npc) e.name = (BOARD_SEED.find(s => s[1] === e.score) || [e.name])[0];
      return b;
    }
  } catch { /* corrupt or unavailable storage: start with the seed table */ }
  return BOARD_SEED.map(([name, score]) => ({ name, score, npc: true, cleared: 0 }));
}
function writeBoard(b) { try { localStorage.setItem(BOARD_KEY, JSON.stringify(b)); } catch { /* storage full or blocked */ } }
const totalScore = (save) => Object.values(save.hi).reduce((n, h) => n + h.score, 0);
// Put the current player's total on the board (one row per New Game). Returns their place (0-based) or -1.
function boardSubmit(save) {
  if (!save.name) return -1;
  const score = totalScore(save);
  let b = loadBoard().filter(e => e.id !== save.runId);
  if (score > 0) b.push({ id: save.runId, name: save.name, score, cleared: Object.keys(save.hi).length, hard: !!save.hard });
  b.sort((x, y) => y.score - x.score);
  b = b.slice(0, BOARD_SIZE);
  writeBoard(b);
  return b.findIndex(e => e.id === save.runId);
}

// =================================================================== GAME
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.save = loadSave();
    this.meta = loadMeta();
    // progress made before achievements existed still counts
    if (this.save.finished) this.meta.finished = true;
    for (const [lv, ids] of Object.entries(this.save.cry || {})) this.meta.cry[lv] = [...new Set([...(this.meta.cry[lv] || []), ...ids])];
    this.toasts = []; this.sub = null;
    this.checkRewards(true);
    this.applySkin();
    AUDIO.setMusic(this.save.music); AUDIO.setSfx(this.save.sfx);
    this.state = 'title';
    this.menu = 0; this.t = 0;
    this.world = null;
    this.dialog = null; this.riddle = null; this.pauseSel = 0;
    this.saveFlash = 0; this.saveLabel = '';
    this.stats = this.save.stats;
    this.collected = [];
    this.run = newRun();
    this.tally = null; this.nameEdit = null; this.board = null; this.scorePop = 0;
    this.confirmErase = false;
    this.iris = 0;          // >0: iris-in transition frames remaining
    this.terrainCache = null;
    this.perf = { ema: 0, slow: 0 };
  }

  // ----------------------------------------------------------- saving
  saveGame(label) {
    const w = this.world;
    if (w) {
      this.save.level = w.idx;
      this.save.cp = {
        x: w.checkpoint.x, y: w.checkpoint.y,
        solved: w.riddles.filter(r => r.solved).map(r => r.idx),
        levers: !!w.leversSolved,
        collected: this.collected.slice(),
        run: JSON.parse(JSON.stringify(this.run)),
      };
    }
    this.save.started = true;
    this.save.stats = this.stats;
    writeSave(this.save);
    this.saveFlash = 120; this.saveLabel = label || 'SAVED';
    AUDIO.sfx('save');
  }

  // ------------------------------------------------------------ flow
  startLevel(idx, cp) {
    this.collected = cp && cp.collected ? cp.collected.slice() : [];
    this.run = Object.assign(newRun(), cp && cp.run ? JSON.parse(JSON.stringify(cp.run)) : {});
    this.tally = null;
    this.world = new World(this, idx, cp);
    this.lastSplash = this.splashLevel();
    this.dialog = null; this.riddle = null;
    this.state = 'intro'; this.introT = 0; this.iris = 0;
    AUDIO.playMusic(LEVELS[idx].music);
    if (!cp) { this.save.level = idx; this.save.cp = null; this.save.started = true; writeSave(this.save); }
  }
  respawn() {
    const w = this.world;
    const cp = {
      x: w.checkpoint.x, y: w.checkpoint.y,
      solved: w.riddles.filter(r => r.solved).map(r => r.idx),
      levers: !!w.leversSolved, collected: this.collected.slice(),
    };
    this.run.bossHurt = 0;
    this.world = new World(this, w.idx, cp);
    if (w.bossDefeated && this.world.boss) { this.world.boss.dead = true; this.world.bossDefeated = true; }
    this.iris = 45;
    AUDIO.playMusic(LEVELS[w.idx].music);
  }
  // Adds points (x1.5 in hard mode) and returns what was actually added.
  addScore(n) { n = Math.round(n * this.scoreMult()); this.run.score += n; this.scorePop = 12; return n; }
  scoreMult() { return this.save.hard ? HARD.score : 1; }

  // ------------------------------------------------- splash power + angel
  // Water drops collected over the adventure (best per level; the current level counts live).
  dropsBanked() {
    const w = this.world;
    let n = 0;
    LEVELS.forEach((_, i) => { n += w && i === w.idx ? Math.max(this.save.best[i] || 0, w.drops) : (this.save.best[i] || 0); });
    return n;
  }
  splashLevel() { return levelFor(SPLASH.need, this.dropsBanked()); }
  angelLevel() { return levelFor(ANGEL.need, this.save.angelXp || 0); }
  onDrop() {
    const lv = this.splashLevel();
    if (lv > this.lastSplash) { this.toast(`SPLASH POWER ${lv}!`, SPLASH.name[lv - 1]); AUDIO.sfx('powerup'); }
    this.lastSplash = lv;
  }
  // The PURE AIR meter: fills with clean play, drains when hurt, frozen while Angel is out.
  addAir(n) {
    if (this.world && this.world.wing) return;
    const before = this.save.air || 0;
    this.save.air = Math.max(0, Math.min(AIR.full, before + n));
    if (before < AIR.full && this.save.air >= AIR.full) { this.toast('PURE AIR FULL!', 'PRESS C TO CALL ANGEL'); AUDIO.sfx('checkpoint'); }
  }
  callAngel() {
    const w = this.world;
    if (!w || w.wing || w.player.dead || (this.save.air || 0) < AIR.full) return;
    this.save.air = 0;
    w.callAngel(this.angelLevel());
  }
  angelXp(n) {
    const before = this.angelLevel();
    this.save.angelXp = (this.save.angelXp || 0) + n;
    const lv = this.angelLevel();
    if (lv > before) { this.toast(`ANGEL LEVEL ${lv}!`, 'STAYS LONGER, SHOOTS FASTER'); AUDIO.sfx('powerup'); }
  }

  // ------------------------------------------------------- backup + restore
  exportData() {
    return { app: 'pichonkun', format: 1, version: GAME_VERSION, date: new Date().toISOString(), save: this.save, board: loadBoard(), meta: this.meta };
  }
  // Returns '' on success or a short reason. Nothing is written unless the whole file is valid.
  importData(d) {
    if (!d || d.app !== 'pichonkun' || !d.save || typeof d.save.unlocked !== 'number' || typeof d.save.hi !== 'object') return 'NOT A PICHONKUN BACKUP';
    if (d.format !== 1) return 'BACKUP IS FROM A NEWER VERSION';
    if (d.board && !(Array.isArray(d.board) && d.board.every(e => e && typeof e.name === 'string' && typeof e.score === 'number'))) return 'BACKUP IS DAMAGED';
    if (d.meta && (typeof d.meta !== 'object' || typeof d.meta.ach !== 'object')) return 'BACKUP IS DAMAGED';
    if (this.save.started) { try { localStorage.setItem(PREV_KEY, JSON.stringify(this.save)); } catch { /* storage full or blocked */ } }
    writeSave(Object.assign(defaultSave(), d.save));
    if (d.board) writeBoard(d.board.slice(0, BOARD_SIZE).map(e => ({ id: e.id, name: String(e.name).slice(0, NAME_MAX), score: e.score, cleared: e.cleared | 0, hard: !!e.hard, npc: !!e.npc })));
    if (d.meta) writeMeta(Object.assign(defaultMeta(), d.meta));
    this.reloadFromStorage();
    return '';
  }
  reloadFromStorage() {
    this.save = loadSave(); this.meta = loadMeta(); this.stats = this.save.stats;
    this.world = null; this.terrainCache = null;
    AUDIO.setMusic(this.save.music); AUDIO.setSfx(this.save.sfx);
    this.checkRewards(true); this.applySkin();
  }
  downloadBackup() {
    const data = JSON.stringify(this.exportData());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `pichonkun-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.meta.lastBackup = new Date().toISOString().slice(0, 10); writeMeta(this.meta);
    this.backupMsg = 'BACKUP FILE SAVED TO YOUR DOWNLOADS';
  }
  pickBackupFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 2e6) { this.backupMsg = 'FILE IS TOO BIG'; return; }
      f.text().then(t => {
        let d = null;
        try { d = JSON.parse(t); } catch { /* not JSON: reported below */ }
        const err = this.importData(d);
        this.backupMsg = err || 'BACKUP LOADED!';
        AUDIO.sfx(err ? 'wrong' : 'right');
        this.menu = 0;
      });
    };
    inp.click();
  }
  // Swap the current adventure with the one replaced by the last New Game or backup load.
  restorePrevious() {
    let prev = null;
    try { prev = JSON.parse(localStorage.getItem(PREV_KEY)); } catch { /* corrupt: treated as missing */ }
    if (!prev || typeof prev.unlocked !== 'number') { this.backupMsg = 'NOTHING TO RESTORE'; return; }
    try { localStorage.setItem(PREV_KEY, JSON.stringify(this.save)); } catch { /* storage full or blocked */ }
    writeSave(Object.assign(defaultSave(), prev));
    this.reloadFromStorage();
    this.backupMsg = 'LAST ADVENTURE RESTORED!'; this.menu = 0;
    AUDIO.sfx('right');
  }

  // ------------------------------------------------- achievements + rewards
  toast(title, text) { this.toasts.push({ title, text, t: 0 }); }
  award(id) {
    if (this.meta.ach[id]) return;
    const a = ACHIEVEMENTS.find(x => x[0] === id);
    if (!a) return;
    this.meta.ach[id] = 1;
    this.toast('ACHIEVEMENT!', a[1]);
    this.checkRewards();
    writeMeta(this.meta);
  }
  // Unlock any skin whose condition is now met.
  checkRewards(silent) {
    for (const [id, name, , test] of SKINS) {
      if (this.meta.skins.includes(id) || !test(this.meta)) continue;
      this.meta.skins.push(id);
      if (!silent) this.toast('REWARD UNLOCKED!', `${name} PICHONKUN - SEE OPTIONS`);
    }
    writeMeta(this.meta);
  }
  applySkin() {
    const s = SKINS.find(x => x[0] === this.meta.skin && this.meta.skins.includes(x[0])) || SKINS[0];
    this.meta.skin = s[0];
    if (typeof SPR !== 'undefined' && SPR.pichon_idle) setSkin(s[0], s[4]);
  }
  onCrystal(lv, id) {
    this.meta.cry[lv] = [...new Set([...(this.meta.cry[lv] || []), id])];
    this.award('crystal1');
    if (crystalsEver(this.meta) >= 30) this.award('crystalAll');
    this.checkRewards();
  }
  onKill(combo) {
    this.meta.kills++;
    if (combo >= 3) this.award('combo3');
    if (combo >= 5) this.award('combo5');
    if (this.meta.kills >= 100) this.award('clean100');
    else if (this.meta.kills % 10 === 0) writeMeta(this.meta);
  }
  levelAwards(t) {
    const w = this.world, r = this.run, last = w.idx === LEVELS.length - 1;
    if (w.idx === 0) this.award('level1');
    if (r.hits === 0) this.award('noHit');
    if (w.drops === w.dropsTotal) this.award('allDrops');
    if ((w.def.riddles || []).length && Object.keys(r.miss).length === 0) this.award('quiz');
    if (r.time / 60 <= w.parTime() / 2) this.award('speed');
    if (t.rank === 'S') this.award('rankS');
    if (LEVELS.every((_, i) => this.save.hi[i] && 'SA'.includes(this.save.hi[i].rank))) this.award('allA');
    if (this.save.hard) this.award('hard1');
    if (last) { this.meta.finished = true; this.award('hero'); }
    if (last && this.save.hard) { this.meta.hardDone = true; this.award('hardHero'); }
    if (t.place === 0) this.award('top');
    this.checkRewards();
  }
  // Add up the end-of-level bonuses and decide the rank.
  makeTally() {
    const w = this.world, r = this.run, S = SCORE;
    const secs = Math.floor(r.time / 60);
    const lines = [['LEVEL SCORE', r.score], ['LEVEL CLEAR', S.clear]];
    const timeB = Math.max(0, w.parTime() - secs) * S.timePerSec;
    lines.push([`TIME ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, timeB]);
    if (r.hits === 0) lines.push(['NO DAMAGE', S.noHit]);
    else if (r.deaths === 0) lines.push(['NO DEATHS', S.noDeath]);
    if (w.drops === w.dropsTotal) lines.push(['ALL WATER DROPS', S.allDrops]);
    if (w.crystalTotal && r.crystals.length === w.crystalTotal) lines.push(['ALL CRYSTALS', S.allCrystals]);
    const m = this.scoreMult();
    for (let i = 1; i < lines.length; i++) lines[i][1] = Math.round(lines[i][1] * m);
    const total = lines.reduce((n, l) => n + l[1], 0);
    return { lines, total, rank: rankFor(total / m, w.parScore), crystals: r.crystals.length, crystalTotal: w.crystalTotal, combo: r.bestCombo };
  }
  // All hearts lost: say so clearly, then offer another try from the last checkpoint.
  gameOver() {
    if (this.state !== 'play') return;
    this.state = 'gameover'; this.overT = 0; this.overSel = 0;
    Input.down.clear();
    AUDIO.playMusic('gameover');
  }
  updateGameOver() {
    this.overT++;
    if (this.overT < 40) return;
    if (Input.hit('up') || Input.hit('down')) { this.overSel = 1 - this.overSel; AUDIO.sfx('select'); }
    if (Input.any('confirm', 'jump', 'interact')) {
      AUDIO.sfx('confirm');
      if (this.overSel === 0) { this.respawn(); this.state = 'play'; }
      else { this.state = 'title'; this.menu = 0; this.world = null; AUDIO.playMusic('title'); }
    }
  }
  levelComplete() {
    if (this.state !== 'play') return;
    const w = this.world;
    const prev = this.save.best[w.idx] || 0;
    this.save.best[w.idx] = Math.max(prev, w.drops);
    const t = this.tally = this.makeTally();
    const old = this.save.hi[w.idx];
    t.prev = old ? old.score : 0; t.isBest = !old || t.total > old.score;
    if (t.isBest) this.save.hi[w.idx] = { score: t.total, rank: t.rank, time: Math.floor(this.run.time / 60) };
    this.save.cry[w.idx] = [...new Set([...(this.save.cry[w.idx] || []), ...this.run.crystals])].sort();
    t.grand = totalScore(this.save);
    t.place = boardSubmit(this.save);
    this.levelAwards(t);
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length, w.idx + 2));
    this.save.level = Math.min(LEVELS.length - 1, w.idx + 1);
    this.save.cp = null;
    if (w.idx === LEVELS.length - 1) this.save.finished = true;
    this.saveGame('LEVEL CLEAR');
    this.state = 'clear'; this.clearT = 0;
    AUDIO.playMusic('victory');
  }
  // Called by the main loop with the time one frame took to draw. If FANCY graphics are
  // too slow on this device for a few seconds, switch to FAST once (unless the player chose).
  notePerf(ms) {
    const p = this.perf;
    p.ema = p.ema ? p.ema * 0.95 + ms * 0.05 : ms;
    if (this.state !== 'play' || this.save.gfx === 'low' || this.save.gfxAuto === false) { p.slow = 0; return; }
    p.slow = p.ema > 22 ? p.slow + 1 : 0;
    if (p.slow > 240) {
      this.save.gfx = 'low'; this.save.gfxAuto = false; writeSave(this.save);
      this.saveFlash = 180; this.saveLabel = 'GRAPHICS SET TO FAST';
    }
  }
  say(lines, cb) {
    if (!lines || !lines.length) { if (cb) cb(); return; }
    this.dialog = { lines, i: 0, chars: 0, cb };
  }
  openRiddle(r, ri) {
    this.riddle = { r, ri, sel: 0, msg: '', msgCol: '#fff', t: 0 };
    AUDIO.sfx('confirm');
  }

  // =========================================================== UPDATE
  update() {
    this.t++;
    if (this.saveFlash > 0) this.saveFlash--;
    if (this.toasts.length && ++this.toasts[0].t > 210) this.toasts.shift();
    if (this.toasts.length && this.toasts[0].t === 1) AUDIO.sfx('award');
    if (this.iris > 0) this.iris--;
    if (Input.hit('mute')) {
      this.save.music = !this.save.music; AUDIO.setMusic(this.save.music); writeSave(this.save);
    }
    if (this.dialog) { this.updateDialog(); return; }
    switch (this.state) {
      case 'title': this.updateTitle(); break;
      case 'levelselect': this.updateLevelSelect(); break;
      case 'story': if (!this.dialog) this.startLevel(0); break;
      case 'intro':
        this.introT++;
        if (this.world) this.world.terrain.prerender(this.world.cam.x);
        if (this.introT > 30 && (Input.any(...CONFIRM) || this.introT > 240)) { this.state = 'play'; this.iris = 45; }
        break;
      case 'play': this.updatePlay(); break;
      case 'pause': this.updatePause(); break;
      case 'gameover': this.updateGameOver(); break;
      case 'clear':
        this.clearT++;
        if (this.clearT > 90 && Input.any(...CONFIRM)) {
          if (!this.save.name) this.askName(() => this.afterClear());
          else this.afterClear();
        }
        break;
      case 'name': this.updateName(); break;
      case 'awards':
        this.boardT++;
        if (this.boardT > 15 && Input.any(...CONFIRM, 'pause')) { AUDIO.sfx('select'); this.state = 'title'; }
        break;
      case 'board':
        this.boardT++;
        if (this.boardT > 20 && Input.any(...CONFIRM, 'pause')) { AUDIO.sfx('select'); this.state = 'title'; this.menu = 0; AUDIO.playMusic('title'); }
        break;
      case 'ending': if (!this.dialog) { this.state = 'credits'; this.creditT = 0; } break;
      case 'credits':
        this.creditT++;
        if (this.creditT > 120 && Input.any(...CONFIRM)) this.openBoard();
        break;
    }
  }

  afterClear() {
    const w = this.world;
    if (w.idx === LEVELS.length - 1) this.startEnding();
    else this.startLevel(w.idx + 1);
  }
  // Name for the leaderboard: typed on the keyboard (up to 8 characters, Enter to finish).
  // Without a keyboard the touch buttons work too: up/shoot pick the letter, right adds one,
  // left deletes, jump finishes.
  askName(done) {
    this.nameEdit = { text: (this.save.name || this.save.lastName || '').slice(0, NAME_MAX), done, t: 0 };
    this.state = 'name';
    Input.setTyping(true);
  }
  updateName() {
    const e = this.nameEdit, n = NAME_CHARS.length;
    e.t++;
    const cycle = (d) => {
      if (!e.text) { e.text = 'A'; return; }
      const i = NAME_CHARS.indexOf(e.text[e.text.length - 1]);
      e.text = e.text.slice(0, -1) + NAME_CHARS[(i + d + n) % n];
    };
    for (const ch of Input.typed.splice(0)) {
      if (ch === '\b') e.text = e.text.slice(0, -1);
      else if (NAME_CHARS.includes(ch) && e.text.length < NAME_MAX) e.text += ch;
      else continue;
      AUDIO.sfx('blip');
    }
    if (Input.hit('up')) { cycle(1); AUDIO.sfx('select'); }
    if (Input.hit('down') || Input.hit('shoot')) { cycle(-1); AUDIO.sfx('select'); }
    if (Input.hit('left')) { e.text = e.text.slice(0, -1); AUDIO.sfx('select'); }
    if (Input.hit('right') && e.text.length < NAME_MAX) { e.text += 'A'; AUDIO.sfx('select'); }
    if (e.t > 10 && Input.any('confirm', 'jump')) {
      AUDIO.sfx('confirm');
      Input.setTyping(false);
      this.save.name = this.save.lastName = e.text.trim() || 'PLAYER';
      writeSave(this.save);
      if (this.tally) { this.tally.place = boardSubmit(this.save); if (this.tally.place === 0) this.award('top'); }
      this.nameEdit = null;
      e.done();
    }
  }
  openBoard() {
    this.board = loadBoard(); this.boardT = 0;
    this.state = 'board';
    AUDIO.playMusic('title');
  }

  updateDialog() {
    const d = this.dialog;
    const line = d.lines[d.i];
    const full = line.text.length;
    if (d.chars < full) {
      d.chars += 1.2;
      if (Math.floor(d.chars) % 3 === 0) AUDIO.sfx('blip');
      if (Input.any(...CONFIRM)) d.chars = full;
    } else if (Input.any(...CONFIRM)) {
      d.i++; d.chars = 0;
      AUDIO.sfx('select');
      if (d.i >= d.lines.length) {
        this.dialog = null;
        if (d.cb) d.cb();
      }
    }
  }

  titleItems() {
    if (this.sub === 'options') {
      const sk = SKINS.find(x => x[0] === this.meta.skin) || SKINS[0];
      return ['MUSIC: ' + (this.save.music ? 'ON' : 'OFF'), 'SOUND FX: ' + (this.save.sfx ? 'ON' : 'OFF'),
        'GRAPHICS: ' + (this.save.gfx === 'low' ? 'FAST' : 'FANCY'), `SKIN: ${sk[1]} (${this.meta.skins.length}/${SKINS.length})`, `NAME: ${this.save.name || '-'}`, 'BACKUP', 'BACK'];
    }
    if (this.sub === 'backup') {
      const items = ['SAVE BACKUP FILE', 'LOAD BACKUP FILE'];
      if (localStorage.getItem(PREV_KEY)) items.push('UNDO NEW GAME');
      return items.concat('BACK');
    }
    if (this.sub === 'mode') return ['NORMAL', 'HARD', 'BACK'];
    const items = [];
    if (this.save.started) items.push('CONTINUE');
    items.push('NEW GAME');
    if (this.save.unlocked > 1) items.push('LEVEL SELECT');
    items.push('LEADERBOARD', 'ACHIEVEMENTS', 'OPTIONS');
    return items;
  }
  // Wipe the adventure (not the settings, leaderboard or achievements) and start over.
  newGame(hard) {
    const k = this.save;
    // the adventure being replaced is kept, so a New Game chosen by mistake can be undone
    if (k.started) { try { localStorage.setItem(PREV_KEY, JSON.stringify(k)); } catch { /* storage full or blocked */ } }
    this.save = Object.assign(defaultSave(), { music: k.music, sfx: k.sfx, gfx: k.gfx, gfxAuto: k.gfxAuto, lastName: k.lastName, hard: !!hard });
    this.stats = this.save.stats; writeSave(this.save);
    this.sub = null;
    this.beginStory();
  }
  updateTitle() {
    if (this.t === 1) AUDIO.playMusic('title');
    const items = this.titleItems();
    if (this.confirmErase) {
      if (Input.any('confirm', 'jump')) {
        this.confirmErase = false;
        if (this.meta.finished) { this.sub = 'mode'; this.menu = 0; AUDIO.sfx('confirm'); } else this.newGame(false);
      } else if (Input.any('pause', 'shoot')) { this.confirmErase = false; AUDIO.sfx('select'); }
      return;
    }
    if (Input.hit('up')) { this.menu = (this.menu + items.length - 1) % items.length; AUDIO.sfx('select'); }
    if (Input.hit('down')) { this.menu = (this.menu + 1) % items.length; AUDIO.sfx('select'); }
    this.menu = Math.min(this.menu, items.length - 1);
    if (this.sub && Input.any('pause', 'shoot')) { this.sub = this.sub === 'backup' ? 'options' : null; this.menu = 0; AUDIO.sfx('select'); return; }
    if (Input.any('confirm', 'jump', 'interact')) {
      AUDIO.init();
      const it = items[this.menu];
      AUDIO.sfx('confirm');
      if (it === 'CONTINUE') this.startLevel(this.save.level, this.save.cp);
      else if (it === 'NEW GAME') {
        if (this.save.started) this.confirmErase = true;
        else if (this.meta.finished) { this.sub = 'mode'; this.menu = 0; } else this.newGame(false);
      }
      else if (it === 'NORMAL' || it === 'HARD') this.newGame(it === 'HARD');
      else if (it === 'LEADERBOARD') this.openBoard();
      else if (it === 'ACHIEVEMENTS') { this.state = 'awards'; this.boardT = 0; }
      else if (it === 'OPTIONS') { this.sub = 'options'; this.menu = 0; }
      else if (it === 'BACK') { this.sub = this.sub === 'backup' ? 'options' : null; this.menu = 0; }
      else if (it === 'LEVEL SELECT') { this.state = 'levelselect'; this.lsSel = Math.min(this.save.unlocked - 1, this.save.level); }
      else if (it.startsWith('MUSIC')) { this.save.music = !this.save.music; AUDIO.setMusic(this.save.music); writeSave(this.save); }
      else if (it.startsWith('SOUND')) { this.save.sfx = !this.save.sfx; AUDIO.setSfx(this.save.sfx); writeSave(this.save); AUDIO.sfx('confirm'); }
      else if (it.startsWith('GRAPHICS')) { this.save.gfx = this.save.gfx === 'low' ? 'high' : 'low'; this.save.gfxAuto = false; writeSave(this.save); }
      else if (it === 'BACKUP') { this.sub = 'backup'; this.menu = 0; this.backupMsg = ''; if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); }
      else if (it === 'SAVE BACKUP FILE') this.downloadBackup();
      else if (it === 'LOAD BACKUP FILE') this.pickBackupFile();
      else if (it === 'UNDO NEW GAME') this.restorePrevious();
      else if (it.startsWith('NAME')) { this.tally = null; this.askName(() => { boardSubmit(this.save); this.state = 'title'; }); }
      else if (it.startsWith('SKIN')) {
        const have = SKINS.filter(x => this.meta.skins.includes(x[0]));
        this.meta.skin = have[(have.findIndex(x => x[0] === this.meta.skin) + 1) % have.length][0];
        this.applySkin(); writeMeta(this.meta);
      }
    }
  }
  beginStory() {
    this.state = 'story';
    this.save.started = true; writeSave(this.save);
    this.say(STORY_INTRO);
  }
  updateLevelSelect() {
    const n = this.save.unlocked;
    if (Input.hit('left')) { this.lsSel = Math.max(0, this.lsSel - 1); AUDIO.sfx('select'); }
    if (Input.hit('right')) { this.lsSel = Math.min(n - 1, this.lsSel + 1); AUDIO.sfx('select'); }
    if (Input.hit('up')) { this.lsSel = Math.max(0, this.lsSel - 5); AUDIO.sfx('select'); }
    if (Input.hit('down')) { this.lsSel = Math.min(n - 1, this.lsSel + 5); AUDIO.sfx('select'); }
    if (Input.any('confirm', 'jump', 'interact')) { AUDIO.sfx('confirm'); this.startLevel(this.lsSel); }
    if (Input.hit('pause')) { this.state = 'title'; AUDIO.sfx('select'); }
  }

  updatePlay() {
    const w = this.world;
    if (this.riddle) { this.updateRiddle(); return; }
    if (Input.hit('pause')) { this.state = 'pause'; this.pauseSel = 0; AUDIO.sfx('select'); return; }
    const target = w.interactTarget();
    const wantsInteract = Input.hit('interact') || (target && Input.hit('up'));
    if (target && wantsInteract && !w.player.dead) { w.interact(target); return; }
    if (Input.hit('angel')) this.callAngel();
    const inp = {
      left: Input.is('left'), right: Input.is('right'), up: Input.is('up'), down: Input.is('down'),
      jump: Input.is('jump'), jumpPressed: Input.hit('jump'), shootPressed: Input.hit('shoot'),
    };
    this.run.time++;
    if (this.scorePop > 0) this.scorePop--;
    w.update(inp);
  }

  updateRiddle() {
    const r = this.riddle;
    r.t++;
    const n = r.r.a.length;
    if (Input.hit('up') || Input.hit('left')) { r.sel = (r.sel + n - 1) % n; AUDIO.sfx('select'); }
    if (Input.hit('down') || Input.hit('right')) { r.sel = (r.sel + 1) % n; AUDIO.sfx('select'); }
    if (Input.hit('pause')) { this.riddle = null; AUDIO.sfx('select'); return; }
    if (r.t > 10 && Input.any('confirm', 'jump', 'interact')) {
      if (r.sel === r.r.ok) {
        AUDIO.sfx('right');
        this.riddle = null;
        this.world.solveRiddle(r.ri);
        const pts = this.addScore(SCORE.riddle[Math.min(SCORE.riddle.length - 1, this.run.miss[r.ri] || 0)]);
        if (!this.run.miss[r.ri]) this.addAir(AIR.riddle);
        this.world.float(this.world.player.x - 24, this.world.player.y - 20, `CORRECT! +${pts}`, '#7cff4f');
        this.saveGame('RIDDLE SOLVED');
      } else {
        AUDIO.sfx('wrong');
        this.run.miss[r.ri] = (this.run.miss[r.ri] || 0) + 1;
        r.msg = 'NOT QUITE! HINT: ' + r.r.hint; r.msgCol = '#ff9a8a';
      }
    }
  }

  pauseItems() { return ['RESUME', 'RESTART FROM CHECKPOINT', 'MUSIC: ' + (this.save.music ? 'ON' : 'OFF'), 'SOUND FX: ' + (this.save.sfx ? 'ON' : 'OFF'), 'GRAPHICS: ' + (this.save.gfx === 'low' ? 'FAST' : 'FANCY'), 'QUIT TO TITLE']; }
  updatePause() {
    const items = this.pauseItems();
    if (Input.hit('up')) { this.pauseSel = (this.pauseSel + items.length - 1) % items.length; AUDIO.sfx('select'); }
    if (Input.hit('down')) { this.pauseSel = (this.pauseSel + 1) % items.length; AUDIO.sfx('select'); }
    if (Input.hit('pause')) { this.state = 'play'; return; }
    if (Input.any('confirm', 'jump', 'interact')) {
      AUDIO.sfx('confirm');
      const it = items[this.pauseSel];
      if (it === 'RESUME') this.state = 'play';
      else if (it.startsWith('RESTART')) { this.respawn(); this.state = 'play'; }
      else if (it.startsWith('MUSIC')) { this.save.music = !this.save.music; AUDIO.setMusic(this.save.music); writeSave(this.save); }
      else if (it.startsWith('SOUND')) { this.save.sfx = !this.save.sfx; AUDIO.setSfx(this.save.sfx); writeSave(this.save); }
      else if (it.startsWith('GRAPHICS')) { this.save.gfx = this.save.gfx === 'low' ? 'high' : 'low'; this.save.gfxAuto = false; writeSave(this.save); }
      else if (it === 'QUIT TO TITLE') { this.state = 'title'; this.menu = 0; this.world = null; AUDIO.playMusic('title'); }
    }
  }
  startEnding() {
    this.state = 'ending';
    AUDIO.playMusic('ending');
    this.say(STORY_ENDING);
  }
}

const WHITE_CACHE = new Map();
function whiteOf(spr) {
  let w = WHITE_CACHE.get(spr);
  if (!w) { w = whiteVersion(spr); WHITE_CACHE.set(spr, w); }
  return w;
}

