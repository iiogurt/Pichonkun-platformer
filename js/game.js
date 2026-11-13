// Main game: input, saving, state machine, rendering and UI.
'use strict';
const VIEW_W = 384, VIEW_H = 216, RES = 2;
const SAVE_KEY = 'pichonkun_save_v1';
const GAME_VERSION = '1.1.0';

// ================================================================== INPUT
const Input = (() => {
  const down = new Set(), pressed = new Set();
  const MAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
    KeyX: 'shoot', KeyJ: 'shoot', KeyL: 'shoot',
    KeyE: 'interact', Enter: 'confirm', Escape: 'pause', KeyP: 'pause', KeyM: 'mute',
  };
  const press = (a) => { if (!down.has(a)) pressed.add(a); down.add(a); };
  const release = (a) => down.delete(a);
  window.addEventListener('keydown', (ev) => {
    const a = MAP[ev.code];
    AUDIO.init();
    if (!a) return;
    ev.preventDefault();
    if (!ev.repeat) press(a);
  });
  window.addEventListener('keyup', (ev) => { const a = MAP[ev.code]; if (a) release(a); });
  window.addEventListener('blur', () => down.clear());
  return {
    down, pressed, press, release,
    is: (a) => down.has(a),
    hit: (a) => pressed.has(a),
    any: (...as) => as.some(a => pressed.has(a)),
    endFrame: () => pressed.clear(),
  };
})();
const CONFIRM = ['confirm', 'jump', 'interact', 'shoot'];

// =================================================================== SAVE
function defaultSave() {
  return { unlocked: 1, level: 0, cp: null, vapor: false, best: {}, stats: { kills: 0, deaths: 0, hits: 0 }, started: false, finished: false, music: true, sfx: true, gfx: 'high', gfxAuto: true };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.unlocked === 'number') return Object.assign(defaultSave(), s);
  } catch { /* corrupt or unavailable storage: start fresh */ }
  return defaultSave();
}
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ } }

// =================================================================== GAME
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.save = loadSave();
    AUDIO.setMusic(this.save.music); AUDIO.setSfx(this.save.sfx);
    this.state = 'title';
    this.menu = 0; this.t = 0;
    this.world = null;
    this.dialog = null; this.riddle = null; this.pauseSel = 0;
    this.saveFlash = 0; this.saveLabel = '';
    this.stats = this.save.stats;
    this.collected = [];
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
    this.world = new World(this, idx, cp);
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
    this.world = new World(this, w.idx, cp);
    if (w.bossDefeated && this.world.boss) { this.world.boss.dead = true; this.world.bossDefeated = true; }
    this.iris = 45;
    AUDIO.playMusic(LEVELS[w.idx].music);
  }
  levelComplete() {
    if (this.state !== 'play') return;
    const w = this.world;
    const prev = this.save.best[w.idx] || 0;
    this.save.best[w.idx] = Math.max(prev, w.drops);
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
      case 'clear':
        this.clearT++;
        if (this.clearT > 60 && Input.any(...CONFIRM)) {
          const w = this.world;
          if (w.idx === LEVELS.length - 1) this.startEnding();
          else this.startLevel(w.idx + 1);
        }
        break;
      case 'ending': if (!this.dialog) { this.state = 'credits'; this.creditT = 0; } break;
      case 'credits':
        this.creditT++;
        if (this.creditT > 120 && Input.any(...CONFIRM)) { this.state = 'title'; this.menu = 0; AUDIO.playMusic('title'); }
        break;
    }
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
    const items = [];
    if (this.save.started) items.push('CONTINUE');
    items.push('NEW GAME');
    if (this.save.unlocked > 1) items.push('LEVEL SELECT');
    items.push('MUSIC: ' + (this.save.music ? 'ON' : 'OFF'));
    items.push('SOUND FX: ' + (this.save.sfx ? 'ON' : 'OFF'));
    items.push('GRAPHICS: ' + (this.save.gfx === 'low' ? 'FAST' : 'FANCY'));
    return items;
  }
  updateTitle() {
    if (this.t === 1) AUDIO.playMusic('title');
    const items = this.titleItems();
    if (this.confirmErase) {
      if (Input.any('confirm', 'jump')) {
        this.confirmErase = false;
        const m = this.save.music, s = this.save.sfx;
        this.save = defaultSave(); this.save.music = m; this.save.sfx = s;
        this.stats = this.save.stats; writeSave(this.save);
        this.beginStory();
      } else if (Input.any('pause', 'shoot')) { this.confirmErase = false; AUDIO.sfx('select'); }
      return;
    }
    if (Input.hit('up')) { this.menu = (this.menu + items.length - 1) % items.length; AUDIO.sfx('select'); }
    if (Input.hit('down')) { this.menu = (this.menu + 1) % items.length; AUDIO.sfx('select'); }
    this.menu = Math.min(this.menu, items.length - 1);
    if (Input.any('confirm', 'jump', 'interact')) {
      AUDIO.init();
      const it = items[this.menu];
      AUDIO.sfx('confirm');
      if (it === 'CONTINUE') this.startLevel(this.save.level, this.save.cp);
      else if (it === 'NEW GAME') { if (this.save.started) this.confirmErase = true; else this.beginStory(); }
      else if (it === 'LEVEL SELECT') { this.state = 'levelselect'; this.lsSel = Math.min(this.save.unlocked - 1, this.save.level); }
      else if (it.startsWith('MUSIC')) { this.save.music = !this.save.music; AUDIO.setMusic(this.save.music); writeSave(this.save); }
      else if (it.startsWith('SOUND')) { this.save.sfx = !this.save.sfx; AUDIO.setSfx(this.save.sfx); writeSave(this.save); AUDIO.sfx('confirm'); }
      else if (it.startsWith('GRAPHICS')) { this.save.gfx = this.save.gfx === 'low' ? 'high' : 'low'; this.save.gfxAuto = false; writeSave(this.save); }
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
    const inp = {
      left: Input.is('left'), right: Input.is('right'), up: Input.is('up'), down: Input.is('down'),
      jump: Input.is('jump'), jumpPressed: Input.hit('jump'), shootPressed: Input.hit('shoot'),
    };
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
        this.world.float(this.world.player.x - 14, this.world.player.y - 20, 'CORRECT!', '#7cff4f');
        this.saveGame('RIDDLE SOLVED');
      } else {
        AUDIO.sfx('wrong');
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

