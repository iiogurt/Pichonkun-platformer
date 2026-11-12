// Main game: input, saving, state machine, rendering and UI.
'use strict';
const VIEW_W = 384, VIEW_H = 216, RES = 2;
const SAVE_KEY = 'pichonkun_save_v1';

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
  return { unlocked: 1, level: 0, cp: null, vapor: false, best: {}, stats: { kills: 0, deaths: 0, hits: 0 }, started: false, finished: false, music: true, sfx: true };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.unlocked === 'number') return Object.assign(defaultSave(), s);
  } catch (e) { /* ignore */ }
  return defaultSave();
}
function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

// ================================================================= GLOWS
const GLOW_CACHE = new Map();
function glow(col, r) {
  const k = col + r;
  let c = GLOW_CACHE.get(k);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  const [R, G, B] = hexRgb(col);
  gr.addColorStop(0, `rgba(${R},${G},${B},0.55)`);
  gr.addColorStop(0.4, `rgba(${R},${G},${B},0.2)`);
  gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
  GLOW_CACHE.set(k, c);
  return c;
}

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
    this.titleBg = buildBackground('meadow', VIEW_W, VIEW_H);
    this.storyBg = buildBackground('city', VIEW_W, VIEW_H);
    this.endBg = buildBackground('hills', VIEW_W, VIEW_H);
    this.confirmErase = false;
    this.fade = 0;
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
    this.state = 'intro'; this.introT = 0;
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
        if (this.introT > 30 && (Input.any(...CONFIRM) || this.introT > 240)) this.state = 'play';
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

  pauseItems() { return ['RESUME', 'RESTART FROM CHECKPOINT', 'MUSIC: ' + (this.save.music ? 'ON' : 'OFF'), 'SOUND FX: ' + (this.save.sfx ? 'ON' : 'OFF'), 'QUIT TO TITLE']; }
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
      else if (it === 'QUIT TO TITLE') { this.state = 'title'; this.menu = 0; this.world = null; AUDIO.playMusic('title'); }
    }
  }
  startEnding() {
    this.state = 'ending';
    AUDIO.playMusic('ending');
    this.say(STORY_ENDING);
  }

  // =========================================================== RENDER
  render() {
    const ctx = this.ctx;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    switch (this.state) {
      case 'title': this.drawTitle(); break;
      case 'levelselect': this.drawLevelSelect(); break;
      case 'story': this.drawStory(); break;
      case 'intro': this.drawWorld(); this.drawIntro(); break;
      case 'play': this.drawWorld(); this.drawHUD(); if (this.riddle) this.drawRiddle(); break;
      case 'pause': this.drawWorld(); this.drawHUD(); this.drawPause(); break;
      case 'clear': this.drawWorld(); this.drawClear(); break;
      case 'ending': this.drawEnding(); break;
      case 'credits': this.drawCredits(); break;
    }
    if (this.dialog) this.drawDialog();
    if (this.saveFlash > 0) this.drawSaveIcon();
  }

  drawBg(layers, camx, camy) {
    const ctx = this.ctx;
    for (const l of layers) {
      const lw = l.img.lw || VIEW_W;
      const lh = l.img.lh || VIEW_H;
      if (l.factor === 0) { ctx.drawImage(l.img, 0, 0, VIEW_W, VIEW_H); continue; }
      let ox = -((camx * l.factor) % lw);
      if (ox > 0) ox -= lw;
      const oy = -camy * l.factor * 0.4;
      for (let x = ox; x < VIEW_W; x += lw) ctx.drawImage(l.img, Math.round(x), Math.round(oy), lw, lh);
    }
  }

  drawWorld() {
    const ctx = this.ctx, w = this.world;
    const T = THEMES[w.def.theme];
    let cx = w.cam.x, cy = w.cam.y;
    if (w.shake > 0) { cx += (Math.random() - 0.5) * Math.min(6, w.shake * 0.5); cy += (Math.random() - 0.5) * Math.min(6, w.shake * 0.5); }
    cx = Math.round(cx); cy = Math.round(cy);
    this.drawBg(w.bg, cx, cy);
    ctx.save();
    ctx.translate(-cx, -cy);

    // wind columns
    for (const wd of w.winds) {
      const gr = ctx.createLinearGradient(0, wd.y, 0, wd.y + wd.h);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(200,240,255,0.25)');
      ctx.fillStyle = gr; ctx.fillRect(wd.x, wd.y, wd.w, wd.h);
    }

    // tiles
    const x0 = Math.max(0, Math.floor(cx / TILE)), x1 = Math.min(w.W - 1, Math.floor((cx + VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE)), y1 = Math.min(w.H - 1, Math.floor((cy + VIEW_H) / TILE));
    const ts = w.tiles;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = w.grid[ty][tx];
      if (c === ' ') continue;
      const px = tx * TILE, py = ty * TILE;
      const above = ty > 0 ? w.grid[ty - 1][tx] : ' ';
      switch (c) {
        case '#': ctx.drawImage(['#', '='].includes(above) || (above === 'i') ? ts.fill : ts.top, px, py, 16, 16); break;
        case '=': ctx.drawImage(ts.plat, px, py, 16, 16); break;
        case '-': ctx.drawImage(ts.oneway, px, py, 16, 16); break;
        case '^': ctx.drawImage(ts.spike, px, py, 16, 16); break;
        case 'i': ctx.drawImage(ts.ice, px, py, 16, 16); break;
        case 'G': ctx.drawImage(ts.gate, px, py, 16, 16); break;
        case 'D': ctx.drawImage(ts.door, px, py, 16, 16); break;
        case 'x': {
          const s = w.crumble.get(tx + ',' + ty);
          if (s && s.broken) break;
          const sh = s ? (Math.random() - 0.5) * 2 : 0;
          ctx.drawImage(ts.crumble, px + sh, py, 16, 16); break;
        }
        case '<': case '>': {
          ctx.drawImage(ts.convL, px, py, 16, 16);
          const off = ((w.t * (c === '>' ? 1 : -1)) % 4 + 4) % 4;
          ctx.fillStyle = '#ffd23f';
          for (let i = -4; i < 16; i += 4) { const xx = px + i + off; if (xx >= px && xx < px + 15) ctx.fillRect(xx, py + 1, 2, 1); }
          break;
        }
        case '~': {
          const top = above !== '~';
          w.liqGrad = w.liqGrad || new Map();
          let gr = w.liqGrad.get(py);
          if (!gr) { gr = ctx.createLinearGradient(0, py, 0, py + 16); gr.addColorStop(0, T.liquidHi); gr.addColorStop(1, T.liquid); w.liqGrad.set(py, gr); }
          ctx.fillStyle = top ? gr : T.liquid;
          const wave = top ? Math.round(Math.sin(w.t * 0.08 + tx) * 1.5) + 3 : 0;
          ctx.globalAlpha = 0.9;
          ctx.fillRect(px, py + wave, 16, 16 - wave);
          if (top) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.6; ctx.fillRect(px + ((tx * 5 + (w.t >> 3)) % 12), py + wave, 4, 1); }
          ctx.globalAlpha = 1;
          if (top && Math.random() < 0.01) w.particles.push({ x: px + Math.random() * 16, y: py + 4, vx: 0, vy: -0.6, life: 30, max: 30, col: T.liquidHi, size: 2, amb: true });
          break;
        }
      }
    }

    // moving platforms
    for (const p of w.platforms) {
      ctx.drawImage(ts.oneway, p.x, p.y - 1, 16, 16);
      ctx.drawImage(ts.oneway, p.x + 16, p.y - 1, 16, 16);
      ctx.drawImage(ts.oneway, p.x + 32, p.y - 1, 16, 16);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(p.x + 22, p.y + 4, 4, 2);
    }

    // exit portal
    if (w.exit) this.drawExit(w);

    // objects
    for (const o of w.objects) this.drawObject(o, w);

    // enemies
    for (const e of w.enemies) {
      const def = ENEMY_DEFS[e.ch];
      let spr = SPR[def.name];
      if (Array.isArray(spr)) spr = spr[Math.floor((e.t || 0) / 12) % spr.length];
      const sx = e.x + e.w / 2 - spr.w / 2, sy = e.y + e.h - spr.h;
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
      if (!def.fly) ctx.fillRect(e.x + 1, e.y + e.h - 1, e.w - 2, 2);
      ctx.globalAlpha = 1;
      drawSpr(ctx, e.flash > 0 && e.flash % 2 ? whiteOf(spr) : spr, sx, sy, e.dir > 0 && e.ch !== 'p');
    }

    // boss
    if (w.boss && !w.boss.dead) this.drawBoss(w.boss, w);

    // player
    const p = w.player;
    if (!p.dead && !(p.inv > 0 && Math.floor(p.inv / 4) % 2)) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow('#5fd4ff', 22), p.x + 5 - 22, p.y + 6 - 22);
      ctx.globalCompositeOperation = 'source-over';
      const spr = p.sprite();
      const bob = (spr === SPR.pichon_idle) ? Math.round(Math.sin(this.t * 0.08)) : 0;
      drawSpr(ctx, spr, p.x + p.w / 2 - 8, p.y + p.h - spr.h + bob, p.face < 0);
    }

    // shots and bullets
    ctx.globalCompositeOperation = 'lighter';
    for (const s of w.shots) ctx.drawImage(glow('#5fd4ff', 12), s.x + 3 - 12, s.y + 3 - 12);
    ctx.globalCompositeOperation = 'source-over';
    for (const s of w.shots) drawSpr(ctx, SPR.shot, s.x, s.y);
    for (const b of w.bullets) drawSpr(ctx, SPR[b.spr], b.x, b.y, false, b.w / SPR[b.spr].w);

    // particles
    for (const pt of w.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / (pt.max * 0.5))) * (pt.amb ? 0.6 : 1);
      ctx.fillStyle = pt.col;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    for (const f of w.floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 20);
      FONT.draw(ctx, f.text, f.x, f.y, f.col, { shadow: '#000' });
    }
    ctx.globalAlpha = 1;

    // interaction prompts
    const tgt = w.interactTarget();
    if (tgt && !this.dialog && !this.riddle) {
      const bob = Math.round(Math.sin(this.t * 0.15) * 2);
      FONT.draw(ctx, '\u2191', tgt.x + 5, tgt.y - 12 + bob, '#ffffff', { shadow: '#000' });
    }
    ctx.restore();

    // lighting / atmosphere
    const dark = { duct: 0.55, filter: 0.45, drain: 0.6, factory: 0.35, compressor: 0.3 }[w.def.theme];
    const pcx = p.x + 5 - cx, pcy = p.y + 8 - cy;
    if (dark) {
      const gr = ctx.createRadialGradient(pcx, pcy, 30, pcx, pcy, 230);
      gr.addColorStop(0, 'rgba(0,0,10,0)');
      gr.addColorStop(1, `rgba(0,0,12,${dark})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (w.def.theme === 'meadow' || w.def.theme === 'hills') {
      // sun rays
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#fff8c0';
      for (let i = 0; i < 4; i++) {
        const x = (i * 120 - cx * 0.1) % 480;
        ctx.beginPath(); ctx.moveTo(x + 40, 0); ctx.lineTo(x + 80, 0); ctx.lineTo(x - 20, VIEW_H); ctx.lineTo(x - 70, VIEW_H); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // vignette
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (p.dead && p.deadT > 20) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.8, (p.deadT - 20) / 50)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      FONT.draw(ctx, 'SPLASH! TRY AGAIN!', VIEW_W / 2, VIEW_H / 2 - 4, '#5fd4ff', { align: 'center', scale: 2, shadow: '#000' });
    }
  }

  drawExit(w) {
    const ctx = this.ctx, e = w.exit;
    const open = !w.boss || w.bossDefeated;
    const cx = e.x + 8, cy = e.y + 14;
    if (open) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glow('#7fe8ff', 40), cx - 40, cy - 40);
      ctx.globalCompositeOperation = 'source-over';
    }
    // frame: a fresh-air vent
    ctx.fillStyle = '#d8e8f0'; ctx.fillRect(e.x - 4, e.y - 6, 24, 38);
    ctx.fillStyle = '#7890a8'; ctx.fillRect(e.x - 2, e.y - 4, 20, 34);
    ctx.fillStyle = open ? '#bff4ff' : '#2a3040'; ctx.fillRect(e.x, e.y - 2, 16, 30);
    if (open) {
      for (let i = 0; i < 5; i++) {
        const yy = e.y + 26 - ((w.t * 0.6 + i * 6) % 30);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#5fd4ff';
        ctx.fillRect(e.x + 2 + ((i * 5) % 11), Math.round(yy), 2, 3);
      }
      if (w.t % 4 === 0) w.particles.push({ x: e.x + Math.random() * 16, y: e.y + 26, vx: (Math.random() - 0.5) * 0.3, vy: -0.8, life: 40, max: 40, col: '#ffffff', size: 1, amb: true });
    }
    for (let y = e.y; y < e.y + 28; y += 5) { ctx.fillStyle = 'rgba(40,60,90,0.6)'; ctx.fillRect(e.x, y, 16, 1); }
    FONT.draw(ctx, open ? 'EXIT' : '', cx, e.y - 14, '#ffffff', { align: 'center', shadow: '#000' });
  }

  drawObject(o, w) {
    const ctx = this.ctx;
    switch (o.type) {
      case 'drop': {
        const bob = Math.sin(o.t * 0.08) * 2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow('#5fd4ff', 12), o.x + 4 - 12, o.y + 4 - 12 + bob);
        ctx.globalCompositeOperation = 'source-over';
        drawSpr(ctx, SPR.drop[Math.floor(o.t / 20) % 2], o.x, o.y + bob);
        break;
      }
      case 'heart': {
        const s = 1 + Math.sin(o.t * 0.1) * 0.08;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow('#ff5a7a', 14), o.x + 4 - 14, o.y + 3 - 14);
        ctx.globalCompositeOperation = 'source-over';
        drawSpr(ctx, SPR.heart, o.x + 4 - 4 * s, o.y + 3 - 3.5 * s, false, s);
        break;
      }
      case 'power': {
        const bob = Math.sin(o.t * 0.06) * 3;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow('#ffffff', 26), o.x + 6 - 26, o.y + 6 - 26 + bob);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        const cx = o.x + 6, cy = o.y + 6 + bob;
        ctx.fillRect(cx - 6, cy - 2, 12, 5); ctx.fillRect(cx - 3, cy - 5, 7, 3); ctx.fillRect(cx - 4, cy + 3, 9, 2);
        ctx.fillStyle = '#b5ecfc'; ctx.fillRect(cx - 5, cy + 1, 10, 2);
        FONT.draw(ctx, 'VAPOR JUMP', cx, o.y - 12 + bob, '#ffffff', { align: 'center', shadow: '#0d1b5e' });
        break;
      }
      case 'checkpoint': drawSpr(ctx, SPR.checkpoint[o.active ? 1 : 0], o.x, o.y); break;
      case 'sign': drawSpr(ctx, SPR.sign, o.x, o.y); break;
      case 'terminal': {
        const solved = w.riddles[o.ri].solved;
        if (!solved) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glow('#7cff4f', 16), o.x + 8 - 16, o.y + 6 - 16);
          ctx.globalCompositeOperation = 'source-over';
        }
        drawSpr(ctx, SPR.terminal[solved ? 1 : 0], o.x, o.y);
        break;
      }
      case 'lever':
        drawSpr(ctx, SPR.lever[o.on ? 1 : 0], o.x, o.y);
        FONT.draw(ctx, o.label, o.x + 8, o.y - 12, o.on ? '#7cff4f' : '#ffe680', { align: 'center', shadow: '#000' });
        break;
      case 'spring': drawSpr(ctx, SPR.spring[o.pressed ? 0 : 1], o.x, o.y); break;
      case 'npc': {
        const spr = SPR[PORTRAITS[o.who].spr];
        const bob = Math.round(Math.sin(o.t * 0.07) * 1.5);
        const p = w.player;
        drawSpr(ctx, spr, o.x + 8 - spr.w / 2, o.y + 16 - spr.h + bob, p.x < o.x);
        break;
      }
    }
  }

  drawBoss(b, w) {
    const ctx = this.ctx;
    let spr = SPR[b.spr];
    spr = spr[Math.floor(b.t / 14) % spr.length];
    const sc = b.scale;
    if (b.kind === 'smogmaw') {
      ctx.globalAlpha = 0.35;
      ctx.drawImage(glow('#ff4a2a', 60), b.x + b.w / 2 - 60, b.y + b.h / 2 - 60);
      ctx.globalAlpha = 1;
      if (w.t % 3 === 0) w.particles.push({ x: b.x + Math.random() * b.w, y: b.y + b.h - 4, vx: (Math.random() - 0.5) * 0.5, vy: 0.4, life: 40, max: 40, col: '#444', size: 3 });
    }
    const img = b.flash > 0 && b.flash % 2 ? whiteOf(spr) : spr;
    const dw = spr.w * sc, dh = spr.h * sc;
    let sy = b.y + b.h - dh;
    if (b.kind === 'dustbaron' && b.state === 'crouch') sy += 3;
    drawSpr(ctx, img, b.x + b.w / 2 - dw / 2, sy, b.dir > 0, sc);
    if (b.kind === 'dustbaron') { // top hat!
      const hx = b.x + b.w / 2 - 8, hy = sy - 8;
      ctx.fillStyle = '#1a1a22'; ctx.fillRect(hx, hy, 16, 10); ctx.fillRect(hx - 4, hy + 9, 24, 3);
      ctx.fillStyle = '#c03030'; ctx.fillRect(hx, hy + 6, 16, 2);
    }
    if (b.kind === 'moldqueen') { // crown
      const hx = b.x + b.w / 2 - 9, hy = sy - 6;
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(hx, hy + 3, 18, 4); ctx.fillRect(hx, hy, 3, 3); ctx.fillRect(hx + 7, hy - 2, 4, 5); ctx.fillRect(hx + 15, hy, 3, 3);
      ctx.fillStyle = '#e8402a'; ctx.fillRect(hx + 8, hy + 4, 2, 2);
    }
  }

  // ---------------------------------------------------------------- UI
  panel(x, y, w, h, alpha = 0.92) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#1d2f7a'); gr.addColorStop(1, '#0a1240');
    ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5fd4ff'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = '#b5ecfc'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = '#0d1b5e'; ctx.fillRect(x - 1, y - 1, w + 2, 1); ctx.fillRect(x - 1, y + h, w + 2, 1); ctx.fillRect(x - 1, y, 1, h); ctx.fillRect(x + w, y, 1, h);
  }

  drawHUD() {
    const ctx = this.ctx, w = this.world, p = w.player;
    // hearts
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#000'; ctx.fillRect(4, 4, 104, 14); ctx.globalAlpha = 1;
    for (let i = 0; i < p.maxHp; i++) drawSpr(ctx, i < p.hp ? SPR.heart : SPR.heartEmpty, 8 + i * 11, 8);
    drawSpr(ctx, SPR.drop[0], 48, 7);
    FONT.draw(ctx, `${w.drops}/${w.dropsTotal}`, 59, 8, '#b5ecfc', { shadow: '#000' });
    FONT.draw(ctx, `${w.idx + 1}. ${w.def.name}`, VIEW_W - 6, 8, '#ffffff', { align: 'right', shadow: '#000' });
    if (p.canDouble) FONT.draw(ctx, '2X', 96, 8, '#ffffff', { shadow: '#5fd4ff' });

    // boss bar
    if (w.boss && w.bossActive && !w.boss.dead) {
      const b = w.boss, bw = 160, bx = VIEW_W / 2 - bw / 2, by = VIEW_H - 16;
      ctx.fillStyle = '#000'; ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      gr.addColorStop(0, '#ff3a2a'); gr.addColorStop(1, '#ffb040');
      ctx.fillStyle = gr; ctx.fillRect(bx, by, bw * Math.max(0, b.hp / b.maxHp), 6);
      FONT.draw(ctx, BOSS_INFO[b.kind].name, VIEW_W / 2, by - 11, '#ffb0a0', { align: 'center', shadow: '#000' });
    }

    // sign reading
    const sign = w.objects.find(o => o.type === 'sign' && o.near);
    if (sign && !this.dialog) {
      const lines = FONT.wrap(sign.text.toUpperCase(), 54);
      const h = lines.length * 10 + 10;
      this.panel(20, 24, VIEW_W - 40, h, 0.88);
      lines.forEach((l, i) => FONT.draw(ctx, l, 28, 30 + i * 10, '#ffe680'));
    }
    if (Input.is('mute') || this.t < 0) { /* noop */ }
  }

  drawSaveIcon() {
    const ctx = this.ctx;
    const a = Math.min(1, this.saveFlash / 30);
    ctx.globalAlpha = a;
    const x = VIEW_W - 92, y = 20;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 2, y - 2, 90, 14);
    // floppy
    ctx.fillStyle = '#1565d8'; ctx.fillRect(x, y, 10, 10);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 2, y, 6, 4);
    ctx.fillStyle = '#b4b4b4'; ctx.fillRect(x + 2, y + 6, 6, 4);
    FONT.draw(ctx, 'SAVED', x + 14, y + 2, '#7cff4f');
    FONT.draw(ctx, this.saveLabel.length > 8 ? '' : '', x + 48, y + 2, '#fff');
    ctx.globalAlpha = 1;
  }

  drawDialog() {
    const ctx = this.ctx, d = this.dialog;
    const line = d.lines[d.i];
    const P = PORTRAITS[line.who] || PORTRAITS.narrator;
    const x = 8, h = 62, y = VIEW_H - h - 6, w = VIEW_W - 16;
    this.panel(x, y, w, h);
    let tx = x + 8;
    let spr = P.spr ? SPR[P.spr] : null;
    let name = P.name;
    if (line.who === 'boss' && this.world && this.world.boss) { spr = SPR[this.world.boss.spr]; name = BOSS_INFO[this.world.boss.kind].name; }
    if (Array.isArray(spr)) spr = spr[0];
    if (spr) {
      ctx.fillStyle = '#0a1240'; ctx.fillRect(x + 6, y + 6, 46, 46);
      ctx.fillStyle = '#5fd4ff'; ctx.fillRect(x + 6, y + 6, 46, 1); ctx.fillRect(x + 6, y + 51, 46, 1);
      const sc = Math.min(2, 40 / Math.max(spr.w, spr.h));
      drawSpr(ctx, spr, x + 29 - spr.w * sc / 2, y + 29 - spr.h * sc / 2, false, sc);
      tx = x + 60;
    }
    const nameCol = line.who === 'boss' ? '#ff7a6a' : P.color;
    if (name) FONT.draw(ctx, name, tx, y + 7, nameCol, { shadow: '#000' });
    const maxChars = Math.floor((x + w - tx - 8) / FONT.CW);
    const shown = line.text.slice(0, Math.floor(d.chars));
    const lines = FONT.wrap(shown, maxChars);
    const ty = name ? y + 19 : y + 10;
    lines.slice(0, 5).forEach((l, i) => FONT.draw(ctx, l, tx, ty + i * 9, line.who === 'narrator' ? '#ffe680' : '#ffffff'));
    if (d.chars >= line.text.length && Math.floor(this.t / 20) % 2) FONT.draw(ctx, '\u25B6', x + w - 12, y + h - 11, '#5fd4ff');
  }

  drawRiddle() {
    const ctx = this.ctx, r = this.riddle;
    ctx.fillStyle = 'rgba(0,0,10,0.5)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 320, x = (VIEW_W - w) / 2;
    const q = FONT.wrap(r.r.q.toUpperCase(), 50);
    const msg = r.msg ? FONT.wrap(r.msg.toUpperCase(), 50) : [];
    const h = 34 + q.length * 10 + r.r.a.length * 14 + msg.length * 10 + 14;
    const y = (VIEW_H - h) / 2;
    this.panel(x, y, w, h);
    drawSpr(ctx, SPR.terminal[0], x + 8, y + 6);
    FONT.draw(ctx, 'AIR-Q RIDDLE', x + 30, y + 10, '#7cff4f', { shadow: '#000' });
    q.forEach((l, i) => FONT.draw(ctx, l, x + 12, y + 28 + i * 10, '#ffffff'));
    const oy = y + 34 + q.length * 10;
    r.r.a.forEach((a, i) => {
      const sel = i === r.sel;
      if (sel) { ctx.fillStyle = 'rgba(95,212,255,0.25)'; ctx.fillRect(x + 10, oy + i * 14 - 3, w - 20, 13); }
      FONT.draw(ctx, (sel ? '\u25B6 ' : '  ') + String.fromCharCode(65 + i) + ') ' + a, x + 16, oy + i * 14, sel ? '#ffe680' : '#b5ecfc');
    });
    msg.forEach((l, i) => FONT.draw(ctx, l, x + 12, oy + r.r.a.length * 14 + 4 + i * 10, r.msgCol));
  }

  drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,10,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const items = this.pauseItems();
    const w = 200, h = 30 + items.length * 14, x = (VIEW_W - w) / 2, y = 50;
    this.panel(x, y, w, h);
    FONT.draw(ctx, 'PAUSED', VIEW_W / 2, y + 8, '#5fd4ff', { align: 'center', shadow: '#000' });
    items.forEach((it, i) => FONT.draw(ctx, (i === this.pauseSel ? '\u25B6 ' : '  ') + it, x + 16, y + 26 + i * 14, i === this.pauseSel ? '#ffe680' : '#ffffff'));
    FONT.draw(ctx, 'ARROWS/WASD MOVE  Z/SPACE JUMP  X/J SHOOT', VIEW_W / 2, y + h + 12, '#b5ecfc', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, 'UP/E TALK + RIDDLES   UP+SHOOT AIM UP   M MUSIC', VIEW_W / 2, y + h + 24, '#b5ecfc', { align: 'center', shadow: '#000' });
  }

  drawIntro() {
    const ctx = this.ctx, w = this.world;
    const a = Math.min(1, this.introT / 20);
    ctx.globalAlpha = 0.75 * a; ctx.fillStyle = '#05081e'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = a;
    FONT.draw(ctx, 'LEVEL ' + (w.idx + 1), VIEW_W / 2, 56, '#5fd4ff', { align: 'center', scale: 2, shadow: '#0d1b5e' });
    FONT.draw(ctx, w.def.name, VIEW_W / 2, 80, '#ffffff', { align: 'center', scale: 3, shadow: '#1565d8' });
    FONT.wrap(w.def.intro.toUpperCase(), 52).forEach((l, i) => FONT.draw(ctx, l, VIEW_W / 2, 122 + i * 11, '#ffe680', { align: 'center', shadow: '#000' }));
    if (this.introT > 30 && Math.floor(this.t / 25) % 2) FONT.draw(ctx, 'PRESS Z TO START', VIEW_W / 2, 176, '#ffffff', { align: 'center' });
    ctx.globalAlpha = 1;
  }

  drawClear() {
    const ctx = this.ctx, w = this.world;
    const a = Math.min(1, this.clearT / 30);
    ctx.globalAlpha = 0.8 * a; ctx.fillStyle = '#05081e'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = a;
    FONT.draw(ctx, 'LEVEL CLEAR!', VIEW_W / 2, 30, '#7cff4f', { align: 'center', scale: 3, shadow: '#0d3b0e' });
    FONT.draw(ctx, w.def.name, VIEW_W / 2, 60, '#ffffff', { align: 'center', shadow: '#000' });
    drawSpr(ctx, SPR.drop[0], VIEW_W / 2 - 40, 78);
    FONT.draw(ctx, `WATER DROPS: ${w.drops} / ${w.dropsTotal}`, VIEW_W / 2 - 28, 79, '#b5ecfc');
    if (w.drops === w.dropsTotal) FONT.draw(ctx, 'PERFECT COLLECTION!', VIEW_W / 2, 92, '#ffe680', { align: 'center' });
    this.panel(30, 108, VIEW_W - 60, 48);
    FONT.wrap(w.def.tip.toUpperCase(), 52).forEach((l, i) => FONT.draw(ctx, l, 40, 116 + i * 10, '#8cf06c'));
    // pichon dancing
    const spr = Math.floor(this.t / 12) % 2 ? SPR.pichon_jump : SPR.pichon_idle;
    drawSpr(ctx, spr, VIEW_W / 2 - 16, 162 + (Math.floor(this.t / 12) % 2 ? -4 : 0), Math.floor(this.t / 24) % 2 === 0, 2);
    if (this.clearT > 60 && Math.floor(this.t / 25) % 2) FONT.draw(ctx, 'PRESS Z TO CONTINUE', VIEW_W / 2, 206, '#ffffff', { align: 'center' });
    ctx.globalAlpha = 1;
  }

  drawTitle() {
    const ctx = this.ctx;
    this.drawBg(this.titleBg, this.t * 0.6, 0);
    // ground strip
    const ts = this.titleTiles || (this.titleTiles = buildTileset('meadow'));
    const off = -((this.t * 0.6) % 16);
    for (let x = off; x < VIEW_W; x += 16) { ctx.drawImage(ts.top, x, VIEW_H - 32, 16, 16); ctx.drawImage(ts.fill, x, VIEW_H - 16, 16, 16); }
    // running pichon
    const spr = Math.floor(this.t / 8) % 2 ? SPR.pichon_run1 : SPR.pichon_run2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow('#5fd4ff', 40), 70 - 40 + 16, VIEW_H - 52 - 40 + 20);
    ctx.globalCompositeOperation = 'source-over';
    drawSpr(ctx, spr, 70, VIEW_H - 32 - 40, false, 2);
    // a floating pollen chased
    const pol = SPR.pollen[Math.floor(this.t / 12) % 2];
    drawSpr(ctx, pol, 150 + Math.sin(this.t * 0.03) * 10, VIEW_H - 70 + Math.sin(this.t * 0.07) * 6, false, 2);

    // logo
    const ly = 22 + Math.round(Math.sin(this.t * 0.04) * 2);
    FONT.draw(ctx, 'PICHONKUN', VIEW_W / 2 + 2, ly + 3, '#0d1b5e', { align: 'center', scale: 5 });
    FONT.draw(ctx, 'PICHONKUN', VIEW_W / 2, ly, '#1cb8f2', { align: 'center', scale: 5 });
    ctx.save(); ctx.beginPath(); ctx.rect(0, ly, VIEW_W, 14); ctx.clip();
    FONT.draw(ctx, 'PICHONKUN', VIEW_W / 2, ly, '#b5ecfc', { align: 'center', scale: 5 });
    ctx.restore();
    FONT.draw(ctx, 'AND THE CLEAN AIR ADVENTURE', VIEW_W / 2, ly + 42, '#ffffff', { align: 'center', shadow: '#0d1b5e' });

    const items = this.titleItems();
    const mx = VIEW_W / 2 + 40, my = 86;
    this.panel(mx - 12, my - 8, 140, items.length * 14 + 12, 0.8);
    items.forEach((it, i) => {
      const sel = i === this.menu;
      FONT.draw(ctx, (sel ? '\u25B6 ' : '  ') + it, mx, my + i * 14, sel ? '#ffe680' : '#ffffff', { shadow: '#000' });
    });
    if (this.confirmErase) {
      this.panel(60, 80, VIEW_W - 120, 50);
      FONT.draw(ctx, 'START A NEW GAME?', VIEW_W / 2, 90, '#ffe680', { align: 'center' });
      FONT.draw(ctx, 'YOUR SAVED PROGRESS WILL BE ERASED.', VIEW_W / 2, 102, '#ffffff', { align: 'center' });
      FONT.draw(ctx, 'Z / ENTER = YES      X / ESC = NO', VIEW_W / 2, 116, '#b5ecfc', { align: 'center' });
    }
    FONT.draw(ctx, 'ARROWS + Z TO SELECT', 8, VIEW_H - 12, '#ffffff', { shadow: '#000' });
    if (this.save.finished) FONT.draw(ctx, '* GAME COMPLETED *', VIEW_W - 8, VIEW_H - 12, '#ffe680', { align: 'right', shadow: '#000' });
  }

  drawLevelSelect() {
    const ctx = this.ctx;
    this.drawBg(this.titleBg, this.t * 0.3, 0);
    ctx.fillStyle = 'rgba(0,0,20,0.45)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    FONT.draw(ctx, 'LEVEL SELECT', VIEW_W / 2, 14, '#ffffff', { align: 'center', scale: 2, shadow: '#0d1b5e' });
    const bw = 64, bh = 52, gx = (VIEW_W - 5 * bw - 4 * 8) / 2;
    for (let i = 0; i < LEVELS.length; i++) {
      const cx = gx + (i % 5) * (bw + 8), cy = 42 + Math.floor(i / 5) * (bh + 10);
      const locked = i >= this.save.unlocked;
      const sel = i === this.lsSel;
      this.panel(cx, cy, bw, bh, locked ? 0.5 : 0.9);
      if (sel) { ctx.strokeStyle = '#ffe680'; ctx.lineWidth = 1; ctx.strokeRect(cx - 2.5, cy - 2.5, bw + 5, bh + 5); }
      FONT.draw(ctx, String(i + 1), cx + bw / 2, cy + 6, locked ? '#555' : '#5fd4ff', { align: 'center', scale: 2 });
      if (locked) FONT.draw(ctx, 'LOCKED', cx + bw / 2, cy + 30, '#666', { align: 'center' });
      else {
        const words = LEVELS[i].name.toUpperCase().split(' ').filter(x => x !== 'THE');
        words.slice(0, 2).forEach((wd, k) => FONT.draw(ctx, wd.slice(0, 10), cx + bw / 2, cy + 24 + k * 9, '#ffffff', { align: 'center' }));
        const best = this.save.best[i];
        if (best !== undefined) FONT.draw(ctx, '\uD83D\uDCA7' + best, cx + bw / 2, cy + 42, '#b5ecfc', { align: 'center' });
      }
    }
    const L = LEVELS[this.lsSel];
    FONT.wrap(L.intro.toUpperCase(), 58).forEach((l, i) => FONT.draw(ctx, l, VIEW_W / 2, 172 + i * 10, '#ffe680', { align: 'center', shadow: '#000' }));
    FONT.draw(ctx, 'Z = PLAY    ESC = BACK', VIEW_W / 2, VIEW_H - 12, '#ffffff', { align: 'center', shadow: '#000' });
  }

  drawStory() {
    const ctx = this.ctx;
    this.drawBg(this.storyBg, this.t * 0.2, 0);
    // the great air conditioner on the town hall
    const x = 150, y = 40;
    ctx.fillStyle = '#4a4a58'; ctx.fillRect(x - 10, y + 50, 100, 80);
    ctx.fillStyle = '#d8e0e8'; ctx.fillRect(x, y, 80, 50);
    ctx.fillStyle = '#9aa8b8'; for (let i = 0; i < 6; i++) ctx.fillRect(x + 6, y + 6 + i * 6, 44, 3);
    ctx.fillStyle = '#2a3040'; ctx.fillRect(x + 56, y + 8, 18, 34);
    const ang = this.t * 0.2;
    ctx.fillStyle = '#9aa8b8';
    for (let a = 0; a < 3; a++) ctx.fillRect(x + 65 + Math.cos(ang + a * 2.09) * 6 - 2, y + 25 + Math.sin(ang + a * 2.09) * 6 - 2, 4, 4);
    // smog
    for (let i = 0; i < 8; i++) {
      ctx.globalAlpha = 0.3;
      ctx.drawImage(glow('#333333', 30), ((i * 70 + this.t * 0.3) % 460) - 40, 10 + (i * 37) % 60);
    }
    ctx.globalAlpha = 1;
    // pichon peeking out
    drawSpr(ctx, SPR.pichon_idle, x + 30, y + 54 - Math.abs(Math.sin(this.t * 0.05)) * 4, false, 1);
  }

  drawEnding() {
    const ctx = this.ctx;
    this.drawBg(this.endBg, this.t * 0.3, 0);
    // rainbow
    const cols = ['#ff5a5a', '#ffa040', '#ffe060', '#7cff4f', '#5fd4ff', '#7a6aff'];
    ctx.globalAlpha = 0.5;
    cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(VIEW_W / 2, VIEW_H + 20, 170 - i * 4, Math.PI, 0); ctx.stroke(); });
    ctx.globalAlpha = 1;
    const y = 60 + Math.sin(this.t * 0.04) * 6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow('#5fd4ff', 50), VIEW_W / 2 - 50, y - 30);
    ctx.globalCompositeOperation = 'source-over';
    drawSpr(ctx, SPR.pichon_jump, VIEW_W / 2 - 16, y - 20, false, 2);
    drawSpr(ctx, SPR.npc_granny, 60, 40 + Math.sin(this.t * 0.03) * 3, false, 2);
    drawSpr(ctx, SPR.npc_leafa, 300, 70 + Math.sin(this.t * 0.05) * 3, true, 2);
  }

  drawCredits() {
    const ctx = this.ctx;
    this.drawEnding();
    ctx.fillStyle = 'rgba(0,0,20,0.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    FONT.draw(ctx, 'THE END', VIEW_W / 2, 30, '#ffffff', { align: 'center', scale: 4, shadow: '#1565d8' });
    FONT.draw(ctx, 'BREEZEVILLE BREATHES AGAIN!', VIEW_W / 2, 72, '#7cff4f', { align: 'center', shadow: '#000' });
    let total = 0, best = 0;
    LEVELS.forEach((L, i) => { best += this.save.best[i] || 0; total += buildLevelGrid(L).grid.flat().filter(c => c === 'o').length; });
    FONT.draw(ctx, `WATER DROPS COLLECTED: ${best} / ${total}`, VIEW_W / 2, 96, '#b5ecfc', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, `GERMS CLEANED: ${this.stats.kills}`, VIEW_W / 2, 108, '#b5ecfc', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, `SPLASHES (DEATHS): ${this.stats.deaths}`, VIEW_W / 2, 120, '#b5ecfc', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, 'THANK YOU FOR PLAYING PICHONKUN!', VIEW_W / 2, 146, '#ffe680', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, 'KEEP YOUR FILTERS CLEAN AND YOUR AIR FRESH.', VIEW_W / 2, 158, '#ffffff', { align: 'center', shadow: '#000' });
    if (this.creditT > 120 && Math.floor(this.t / 25) % 2) FONT.draw(ctx, 'PRESS Z', VIEW_W / 2, 190, '#ffffff', { align: 'center' });
  }
}

const WHITE_CACHE = new Map();
function whiteOf(spr) {
  let w = WHITE_CACHE.get(spr);
  if (!w) { w = whiteVersion(spr); WHITE_CACHE.set(spr, w); }
  return w;
}

// =================================================================== BOOT
(function boot() {
  const canvas = document.getElementById('game');
  canvas.width = VIEW_W * RES; canvas.height = VIEW_H * RES;
  buildSprites();
  const game = new Game(canvas);
  window.GAME = game;

  function fit() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const s = Math.min(ww / VIEW_W, wh / VIEW_H);
    canvas.style.width = Math.floor(VIEW_W * s) + 'px';
    canvas.style.height = Math.floor(VIEW_H * s) + 'px';
  }
  window.addEventListener('resize', fit); fit();

  // pause when tab hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.state = 'pause'; });

  // touch controls
  const touch = document.getElementById('touch');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) touch.classList.add('on');
  touch.querySelectorAll('[data-a]').forEach(btn => {
    const a = btn.dataset.a;
    const on = (ev) => { ev.preventDefault(); AUDIO.init(); Input.press(a); btn.classList.add('down'); };
    const off = (ev) => { ev.preventDefault(); Input.release(a); btn.classList.remove('down'); };
    btn.addEventListener('touchstart', on, { passive: false });
    btn.addEventListener('touchend', off, { passive: false });
    btn.addEventListener('touchcancel', off, { passive: false });
    btn.addEventListener('mousedown', on); btn.addEventListener('mouseup', off); btn.addEventListener('mouseleave', off);
  });
  canvas.addEventListener('pointerdown', () => AUDIO.init());

  let last = performance.now(), acc = 0;
  const STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.update();
      Input.endFrame();
      acc -= STEP; steps++;
    }
    game.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
