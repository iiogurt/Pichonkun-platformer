// World runtime: level loading, tile physics, player, enemies, bosses, objects.
'use strict';

const GRAV = 0.42, MAX_FALL = 7.5;
const RUN_SPEED = 2.4, JUMP_V = -7.8, DJUMP_V = -6.8, SPRING_V = -11.5;

const BOSS_INFO = {
  dustbaron: {
    name: 'DUST BARON', hp: 12,
    taunt: 'WHO DARES enter my lovely dusty filter? I am the DUST BARON! Achoo-hahaha!',
    defeat: 'Noooo... I\'m being... washed... away... *sneeze*',
  },
  moldqueen: {
    name: 'MOLD QUEEN', hp: 16,
    taunt: 'Sssso... a clean little droplet. My spores will make you green and fuzzy!',
    defeat: 'Impossssible... the drain... is... clean...',
  },
  smogmaw: {
    name: 'SMOGMAW', hp: 26,
    taunt: 'YOU! The little drip that ruined my plans! Come closer, let me fill you with SOOT!',
    defeat: 'Nooooo! I\'m... dissolving... into... rain...?!',
  },
};

// Every way to earn points, in one place.
const SCORE = {
  drop: 10, killPerHp: 100, stomp: 50, comboFrames: 150, comboMax: 5,
  bossHit: 100, boss: 3000, riddle: [500, 250, 100], lever: [500, 250, 100],
  crystal: 500, secret: 250, spareHeart: 200,
  clear: 1000, timePerSec: 20, noHit: 1500, noDeath: 500, allDrops: 1000, allCrystals: 1500,
  ranks: [['S', 0.9], ['A', 0.7], ['B', 0.5], ['C', 0.3], ['D', 0]],
};
const rankFor = (score, par) => SCORE.ranks.find(r => score >= par * r[1])[0];

class World {
  constructor(game, levelIdx, checkpoint) {
    this.game = game;
    this.idx = levelIdx;
    this.def = LEVELS[levelIdx];
    const { grid, W, H } = buildLevelGrid(this.def);
    this.grid = grid; this.W = W; this.H = H;
    this.pw = W * TILE; this.ph = H * TILE;
    this.bg = BACKDROP.get(this.def.theme);
    this.enemies = []; this.objects = []; this.shots = []; this.bullets = [];
    this.particles = []; this.platforms = []; this.winds = []; this.floaters = [];
    this.crumble = new Map();
    this.riddles = []; this.levers = []; this.leverSeq = [];
    this.dropsTotal = 0; this.drops = 0;
    this.crystalTotal = 0; this.secrets = []; this.secretOf = new Map();
    this.combo = 0; this.comboT = 0; this.ghost = false;
    this.hard = !!game.save.hard;
    this.boss = null; this.bossActive = false; this.bossDefeated = false;
    this.t = 0; this.shake = 0; this.hitstop = 0;
    this.exit = null;
    this.gateOwner = new Map();
    this.parse();
    // painted terrain + props are cached per level so respawning is instant
    const tc = game.terrainCache;
    if (tc && tc.idx === levelIdx) { this.terrain = tc.terrain; this.decor = tc.decor; }
    else {
      this.terrain = new TERRAIN.Terrain(this);
      this.decor = TERRAIN.scatter(this, this.terrain);
      game.terrainCache = { idx: levelIdx, terrain: this.terrain, decor: this.decor };
    }
    this.player = new Player(this, this.start.x, this.start.y);
    this.checkpoint = { x: this.start.x, y: this.start.y };
    if (checkpoint) {
      this.checkpoint = { x: checkpoint.x, y: checkpoint.y };
      this.player.x = checkpoint.x; this.player.y = checkpoint.y;
      for (const o of this.objects) if (o.type === 'checkpoint' && Math.abs(o.x - checkpoint.x) < 20) o.active = true;
      if (checkpoint.solved) for (const r of checkpoint.solved) this.solveRiddle(r, true);
      if (checkpoint.levers) this.openDoors(true);
      if (checkpoint.collected) {
        for (const o of this.objects) if (o.type === 'drop' && checkpoint.collected.includes(o.id)) { o.dead = true; this.drops++; }
      }
    }
    // crystals and secret rooms already found during this run stay found
    const run = game.run;
    for (const o of this.objects) if (o.type === 'crystal' && run.crystals.includes(o.id)) o.dead = true;
    for (const sc of this.secrets) if (run.secrets.includes(sc.id)) {
      sc.revealed = true; sc.a = 1;
      for (const o of this.objects) if (o.type === 'crystal' && this.secretAt(o) === sc) o.hidden = false;
    }
    this.parScore = this.calcParScore();
    this.player.lastSafe = { x: this.player.x, y: this.player.y };
    this.wing = null;
    this.cam = { x: 0, y: 0 };
    this.snapCamera();
  }

  parse() {
    const g = this.grid;
    const riddlePos = [];
    let signI = 0, npcI = 0, leverI = 0, dropId = 0, crystalId = 0, enemyId = 0;
    // Scan column-major so ordering follows left->right progress.
    for (let x = 0; x < this.W; x++) for (let y = 0; y < this.H; y++) {
      const c = g[y][x];
      const px = x * TILE, py = y * TILE;
      const clear = () => { g[y][x] = ' '; };
      switch (c) {
        case 'P': this.start = { x: px + 3, y: py + TILE - 18 }; clear(); break;
        case 'o': this.objects.push({ type: 'drop', id: dropId++, x: px + 4, y: py + 3, w: 8, h: 9, t: x * 3 }); this.dropsTotal++; clear(); break;
        case '*': {
          // a crystal tucked inside a secret wall stays hidden until the wall is found
          const hidden = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (g[y + dy] || [])[x + dx] === '%');
          this.objects.push({ type: 'crystal', id: crystalId++, x: px + 3, y: py + 2, w: 10, h: 12, t: x * 5, hidden });
          this.crystalTotal++;
          if (hidden) g[y][x] = '%'; else clear();
          break;
        }
        case 'H': this.objects.push({ type: 'heart', x: px + 4, y: py + 4, w: 8, h: 7, t: 0 }); clear(); break;
        case 'A': this.objects.push({ type: 'power', x: px + 2, y: py + 2, w: 12, h: 12, t: 0 }); clear(); break;
        case 'C': this.objects.push({ type: 'checkpoint', x: px, y: py, w: 16, h: 16, active: false }); clear(); break;
        case 'E': this.exit = { x: px, y: py - 16, w: 16, h: 32 }; clear(); break;
        case 'S': this.objects.push({ type: 'sign', x: px, y: py + 6, w: 16, h: 10, text: this.def.signs[signI++] || '...' }); clear(); break;
        case 'N': {
          const lines = (this.def.npcs || [])[npcI++] || [];
          const who = (lines.find(l => l.who !== 'pichon') || { who: 'leafa' }).who;
          this.objects.push({ type: 'npc', who, lines, x: px, y: py, w: 16, h: 16, talked: false, t: 0 });
          clear(); break;
        }
        case '?': {
          const ri = riddlePos.length;
          riddlePos.push(x);
          this.riddles.push({ idx: ri, solved: false });
          this.objects.push({ type: 'terminal', ri, x: px, y: py, w: 16, h: 16 });
          clear(); break;
        }
        case 'L': this.levers.push(this.objects[this.objects.push({ type: 'lever', li: leverI, label: (this.def.levers || { labels: [] }).labels[leverI] || '?', on: false, x: px, y: py + 6, w: 16, h: 10 }) - 1]); leverI++; clear(); break;
        case 'u': this.objects.push({ type: 'spring', x: px, y: py, w: 16, h: 16, t: 0 }); clear(); break;
        case 'w': this.winds.push({ x: px, y: (y - 7) * TILE, w: 16, h: 10 * TILE }); clear(); break;
        case 'M': this.platforms.push({ x: px, y: py + 4, w: 48, h: 8, ox: px, oy: py + 4, axis: 'x', range: 48, t: x * 7, dx: 0, dy: 0 }); clear(); break;
        case 'V': this.platforms.push({ x: px, y: py + 4, w: 48, h: 8, ox: px, oy: py + 4, axis: 'y', range: 48, t: x * 7, dx: 0, dy: 0 }); clear(); break;
        case 'B':
          this.boss = makeBoss(this, this.def.boss, px, py);
          if (this.hard) this.boss.hp = this.boss.maxHp = Math.ceil(this.boss.maxHp * HARD.bossHp);
          clear(); break;
        default:
          if (ENEMY_DEFS[c]) { const e = makeEnemy(c, px, py); e.id = enemyId++; if (this.hard) e.hp += HARD.enemyHp; this.enemies.push(e); clear(); }
      }
    }
    // gate ownership: each gate column belongs to the closest riddle terminal on its left
    for (let x = 0; x < this.W; x++) for (let y = 0; y < this.H; y++) {
      if (g[y][x] !== 'G') continue;
      let owner = -1;
      riddlePos.forEach((rx, i) => { if (rx < x) owner = i; });
      this.gateOwner.set(x + ',' + y, owner);
    }
    // secret walls ('%'): look solid, but Pichonkun can walk through. Group touching tiles into rooms.
    for (let x = 0; x < this.W; x++) for (let y = 0; y < this.H; y++) {
      if (g[y][x] !== '%' || this.secretOf.has(x + ',' + y)) continue;
      const sc = { id: this.secrets.length, tiles: [], revealed: false, a: 0 };
      const todo = [[x, y]];
      this.secretOf.set(x + ',' + y, sc);
      while (todo.length) {
        const [cx, cy] = todo.pop();
        sc.tiles.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
          if ((g[ny] || [])[nx] === '%' && !this.secretOf.has(k)) { this.secretOf.set(k, sc); todo.push([nx, ny]); }
        }
      }
      this.secrets.push(sc);
    }
  }
  // What a very good run of this level is worth; ranks are a share of this.
  calcParScore() {
    const S = SCORE, d = this.def;
    let n = this.dropsTotal * S.drop + S.clear + S.allDrops + S.noHit;
    for (const e of this.enemies) n += ENEMY_DEFS[e.ch].hp * S.killPerHp;
    n += (d.riddles || []).length * S.riddle[0] + (d.levers ? S.lever[0] : 0);
    if (this.boss) n += S.boss + this.boss.maxHp * S.bossHit;
    n += this.crystalTotal * S.crystal + (this.crystalTotal ? S.allCrystals : 0) + this.secrets.length * S.secret;
    return n + Math.round(this.parTime() * 0.35) * S.timePerSec;
  }
  parTime() { return this.W + (this.boss ? 60 : 0); }

  // --------------------------------------------------------------- angel
  // The guardian angel is called with a full PURE AIR meter and stays for a limited time.
  // It flies beside Pichonkun (through walls, so it never gets stuck) and splashes enemies itself.
  callAngel(level) {
    const p = this.player, i = level - 1;
    this.wing = { x: p.x - p.face * 30, y: p.y - 70, face: p.face, t: 0, cool: 20, shootT: 0, level, life: ANGEL.seconds[i] * 60, max: ANGEL.seconds[i] * 60 };
    this.burst(p.x + 5, p.y - 10, '#ffe894', 26, 2.6); this.ring(p.x + 5, p.y + 6, '#ffe894', 40);
    this.float(p.x - 26, p.y - 24, `ANGEL LV ${level}!`, '#ffe060');
    AUDIO.sfx('powerup');
  }
  updateWingman() {
    const a = this.wing, p = this.player;
    if (!a) return;
    a.t++;
    if (--a.life <= 0) {
      this.burst(a.x + 5, a.y + 6, '#ffe894', 18, 2); this.ring(a.x + 5, a.y + 6, '#ffffff', 22);
      this.float(a.x - 20, a.y - 10, 'BYE FOR NOW!', '#ffe894');
      this.wing = null; return;
    }
    const tx = p.x + p.w / 2 - p.face * 18 - 5, ty = p.y - 15 + Math.sin(a.t * 0.07) * 3;
    a.x += (tx - a.x) * 0.07; a.y += (ty - a.y) * 0.07;
    if (a.shootT > 0) a.shootT--;
    if (a.cool > 0) a.cool--;
    if (p.dead) return;
    const i = a.level - 1, range = ANGEL.range[i];
    // nearest enemy (or the boss) in range
    const cx = a.x + 5, cy = a.y + 6;
    let best = null, bd = range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy);
      if (d < bd) { bd = d; best = e; }
    }
    const b = this.boss;
    if (!best && b && this.bossActive && !b.dead && Math.hypot(b.x + b.w / 2 - cx, b.y + b.h / 2 - cy) < range * 1.3) best = b;
    a.face = best ? (best.x + best.w / 2 >= cx ? 1 : -1) : (Math.abs(tx - a.x) > 6 ? Math.sign(tx - a.x) : p.face);
    if (!best || a.cool > 0) return;
    const ang = Math.atan2(best.y + best.h / 2 - cy, best.x + best.w / 2 - cx), n = ANGEL.shots[i];
    for (let k = 0; k < n; k++) {
      const an = ang + (k - (n - 1) / 2) * 0.2;
      this.shots.push({ x: cx - 3, y: cy - 3, w: 6, h: 6, vx: Math.cos(an) * ANGEL.speed, vy: Math.sin(an) * ANGEL.speed, life: Math.ceil(range * 1.4 / ANGEL.speed), angel: true });
    }
    a.cool = ANGEL.cooldown[i]; a.shootT = 12;
    AUDIO.sfx('shoot');
  }

  // ---------------------------------------------------------------- tiles
  tile(tx, ty) {
    if (tx < 0 || tx >= this.W) return '#';
    if (ty < 0 || ty >= this.H) return ' ';
    return this.grid[ty][tx];
  }
  solidAt(tx, ty) {
    const c = this.tile(tx, ty);
    if (c === 'x') { const s = this.crumble.get(tx + ',' + ty); return !(s && s.broken); }
    if (c === '%') return !this.ghost; // secret wall: solid for everything except Pichonkun
    return c === '#' || c === '=' || c === 'i' || c === '<' || c === '>' || c === 'G' || c === 'D';
  }
  oneWayAt(tx, ty) { return this.tile(tx, ty) === '-'; }
  rectHitsSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.01) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidAt(tx, ty)) return true;
    return false;
  }
  rectTouches(x, y, w, h, chars, inset = 0) {
    const x0 = Math.floor((x + inset) / TILE), x1 = Math.floor((x + w - inset - 0.01) / TILE);
    const y0 = Math.floor((y + inset) / TILE), y1 = Math.floor((y + h - inset - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (chars.includes(this.tile(tx, ty))) return { tx, ty };
    return null;
  }

  // Generic body movement with tile collision. Returns flags.
  moveBody(b, dropThrough = false) {
    const res = { hitX: false, hitY: false, ground: false, ceil: false };
    // X
    b.x += b.vx;
    if (this.rectHitsSolid(b.x, b.y, b.w, b.h)) {
      if (b.vx > 0) b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w - 0.001;
      else if (b.vx < 0) b.x = (Math.floor(b.x / TILE) + 1) * TILE + 0.001;
      res.hitX = true; b.vx = 0;
    }
    // Y
    const prevBottom = b.y + b.h;
    b.y += b.vy;
    if (this.rectHitsSolid(b.x, b.y, b.w, b.h)) {
      if (b.vy > 0) { b.y = Math.floor((b.y + b.h) / TILE) * TILE - b.h; res.ground = true; }
      else if (b.vy < 0) { b.y = (Math.floor(b.y / TILE) + 1) * TILE; res.ceil = true; }
      res.hitY = true; b.vy = 0;
    } else if (b.vy >= 0 && !dropThrough) {
      // one-way platforms
      const bottom = b.y + b.h;
      const ty = Math.floor(bottom / TILE);
      const top = ty * TILE;
      if (prevBottom <= top + 0.01 && bottom >= top) {
        const x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.01) / TILE);
        for (let tx = x0; tx <= x1; tx++) if (this.oneWayAt(tx, ty)) {
          b.y = top - b.h; b.vy = 0; res.ground = true; res.hitY = true; break;
        }
      }
    }
    // moving platforms (one-way from top)
    if (b.vy >= 0 && !res.ground) {
      for (const p of this.platforms) {
        const bottom = b.y + b.h;
        if (b.x + b.w > p.x && b.x < p.x + p.w && prevBottom <= p.y + 2 + Math.max(0, p.dy) && bottom >= p.y) {
          b.y = p.y - b.h; b.vy = 0; res.ground = true; res.platform = p; break;
        }
      }
    }
    return res;
  }

  groundTileUnder(b) {
    const ty = Math.floor((b.y + b.h + 1) / TILE);
    const tx = Math.floor((b.x + b.w / 2) / TILE);
    return this.tile(tx, ty);
  }

  // ------------------------------------------------------------- update
  update(input) {
    this.terrain.prerender(this.cam.x);
    if (this.hitstop > 0) { this.hitstop--; if (input.jumpPressed) this.player.jumpBuf = 8; return; }
    this.t++;
    if (this.shake > 0) this.shake--;
    for (const p of this.platforms) {
      p.t++;
      const off = Math.sin(p.t * 0.02) * p.range;
      const nx = p.axis === 'x' ? p.ox + off : p.ox, ny = p.axis === 'y' ? p.oy + off : p.oy;
      p.dx = nx - p.x; p.dy = ny - p.y; p.x = nx; p.y = ny;
    }
    // crumbling blocks
    for (const [k, s] of this.crumble) {
      s.t++;
      if (!s.broken && s.t > 32) {
        s.broken = true; s.t = 0; AUDIO.sfx('crumble');
        const [tx, ty] = k.split(',').map(Number);
        this.burst(tx * TILE + 8, ty * TILE + 8, THEMES[this.def.theme].fillHi, 10);
      } else if (s.broken && s.t > 200) {
        const [tx, ty] = k.split(',').map(Number);
        const p = this.player;
        if (!(p.x < tx * TILE + 16 && p.x + p.w > tx * TILE && p.y < ty * TILE + 16 && p.y + p.h > ty * TILE)) this.crumble.delete(k);
      }
    }
    if (this.comboT > 0 && --this.comboT === 0) this.combo = 0;
    this.ghost = true; this.player.update(input); this.ghost = false;
    this.checkSecrets();
    this.updateWingman();
    // hard mode: enemies and bosses get an extra step every few frames, so they move and shoot faster
    const eN = this.hard && this.t % HARD.enemyTick === 0 ? 2 : 1, bN = this.hard && this.t % HARD.bossTick === 0 ? 2 : 1;
    for (const e of this.enemies) for (let k = 0; k < eN; k++) if (!e.dead && Math.abs(e.x - this.player.x) < VIEW_W * 1.2) updateEnemy(this, e);
    for (let k = 0; k < bN; k++) if (this.boss && !this.boss.dead) updateBoss(this, this.boss);
    this.updateShots();
    this.updateBullets();
    this.updateObjects();
    this.updateParticles();
    this.enemies = this.enemies.filter(e => !e.dead);
    this.updateCamera();
  }

  snapCamera() { this.updateCamera(true); }
  updateCamera(snap) {
    const p = this.player;
    let tx = p.x + p.w / 2 - VIEW_W / 2 + p.face * 28;
    let ty = p.y - VIEW_H * 0.55;
    tx = Math.max(0, Math.min(this.pw - VIEW_W, tx));
    ty = Math.max(0, Math.min(this.ph - VIEW_H, ty));
    if (snap) { this.cam.x = tx; this.cam.y = ty; }
    else { this.cam.x += (tx - this.cam.x) * 0.1; this.cam.y += (ty - this.cam.y) * 0.1; }
  }

  updateShots() {
    for (const s of this.shots) {
      s.x += s.vx; s.y += s.vy; s.life--;
      if (this.t % 2 === 0) this.particles.push({ x: s.x + 3, y: s.y + 3, vx: -s.vx * 0.1, vy: 0.2, life: 14, max: 14, col: '#b5ecfc', size: 2 });
      if (s.life <= 0 || this.rectHitsSolid(s.x + 1, s.y + 1, s.w - 2, s.h - 2)) { s.dead = true; this.splash(s.x + 3, s.y + 3); continue; }
      for (const e of this.enemies) {
        if (e.dead || !overlap(s, e)) continue;
        s.dead = true; this.damageEnemy(e, s.dmg || 1, s.vx > 0 ? 1 : -1, s); this.splash(s.x + 3, s.y + 3); break;
      }
      if (!s.dead && this.boss && this.bossActive && !this.boss.dead && overlap(s, this.boss)) {
        s.dead = true; this.damageBoss(s.dmg || 1, s); this.splash(s.x + 3, s.y + 3);
      }
      if (!s.dead) for (const b of this.bullets) if (!b.dead && overlap(s, b)) { b.dead = true; s.dead = true; this.splash(s.x + 3, s.y + 3); break; }
    }
    this.shots = this.shots.filter(s => !s.dead);
  }

  updateBullets() {
    const p = this.player;
    for (const b of this.bullets) {
      b.vy += b.grav || 0;
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || this.rectHitsSolid(b.x + 1, b.y + 1, b.w - 2, b.h - 2)) { b.dead = true; this.burst(b.x + 2, b.y + 2, b.col || '#888', 4); continue; }
      if (overlap(b, p)) { b.dead = true; p.hurt(b.x < p.x ? 1 : -1); }
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  updateObjects() {
    const p = this.player;
    for (const o of this.objects) {
      if (o.dead) continue;
      o.t = (o.t || 0) + 1;
      const near = overlap(p, { x: o.x - 6, y: o.y - 8, w: o.w + 12, h: o.h + 16 });
      o.near = near;
      switch (o.type) {
        case 'drop':
          if (overlap(p, o)) {
            o.dead = true; this.drops++; this.game.collected.push(o.id);
            AUDIO.sfx('drop'); this.burst(o.x + 4, o.y + 4, '#5fd4ff', 6, 1.5);
            this.game.addScore(SCORE.drop);
            this.game.onDrop();
          }
          break;
        case 'crystal':
          if (overlap(p, o)) {
            o.dead = true; this.game.run.crystals.push(o.id);
            AUDIO.sfx('crystal'); this.hitstop = 4;
            this.burst(o.x + 5, o.y + 6, '#ffe060', 22, 2.6); this.burst(o.x + 5, o.y + 6, '#ffffff', 10, 1.6);
            this.ring(o.x + 5, o.y + 6, '#ffe060', 26);
            this.float(o.x - 14, o.y - 8, `CRYSTAL! +${this.game.addScore(SCORE.crystal)}`, '#ffe060');
            this.game.onCrystal(this.idx, o.id);
            this.game.addAir(AIR.crystal);
            this.game.saveGame('CRYSTAL FOUND');
          }
          break;
        case 'heart':
          if (overlap(p, o)) {
            o.dead = true; AUDIO.sfx('heart');
            if (p.hp >= p.maxHp) this.float(o.x - 4, o.y, `+${this.game.addScore(SCORE.spareHeart)}`, '#ffe060');
            else { p.hp++; this.float(o.x, o.y, '+1', '#ff7a9a'); } this.burst(o.x + 4, o.y + 4, '#ff5a7a', 8);
          }
          break;
        case 'power':
          if (overlap(p, o)) {
            o.dead = true; this.game.save.vapor = true; p.canDouble = true;
            AUDIO.sfx('powerup'); this.burst(o.x + 6, o.y + 6, '#ffffff', 24, 2.5);
            this.game.saveGame('VAPOR JUMP');
            this.game.say([{ who: 'pichon', text: 'Whoa! I feel light as steam! I got the VAPOR JUMP! (Press jump again in mid-air.)' }]);
          }
          break;
        case 'checkpoint':
          if (!o.active && overlap(p, { x: o.x, y: o.y - 16, w: 16, h: 32 })) {
            for (const c of this.objects) if (c.type === 'checkpoint') c.active = false;
            o.active = true;
            this.checkpoint = { x: o.x + 3, y: o.y + TILE - 18 };
            AUDIO.sfx('checkpoint');     // checkpoints save, they do not heal: only heart pickups do
            this.burst(o.x + 8, o.y, '#5fd4ff', 16, 2);
            this.game.saveGame('CHECKPOINT');
          }
          break;
        case 'npc':
          if (!o.talked && Math.abs(p.x - o.x) < 40 && Math.abs(p.y - o.y) < 40) {
            o.talked = true; this.game.say(o.lines);
          }
          break;
        case 'spring':
          if (p.vy > 0 && overlap(p, { x: o.x + 2, y: o.y + 8, w: 12, h: 8 }) && p.y + p.h < o.y + 14) {
            p.vy = SPRING_V; p.y = o.y + 8 - p.h; p.jumpHeld = false; p.usedDouble = false; o.t = 0; o.pressed = 12;
            AUDIO.sfx('spring');
          }
          if (o.pressed) o.pressed--;
          break;
      }
    }
    this.objects = this.objects.filter(o => !o.dead);
    // exit
    if (this.exit && (!this.boss || this.bossDefeated) && overlap(p, this.exit)) this.game.levelComplete();
    // boss activation
    if (this.boss && !this.bossActive && !this.boss.dead && p.x > this.boss.x - 12 * TILE) {
      this.bossActive = true;
      AUDIO.playMusic('boss');
      this.game.say([{ who: 'boss', text: BOSS_INFO[this.boss.kind].taunt }]);
    }
  }

  // Interact with nearest object (signs auto-show; terminals, levers, npcs on UP/E)
  interactTarget() {
    for (const o of this.objects) {
      if (!o.near) continue;
      if (o.type === 'terminal' && !this.riddles[o.ri].solved) return o;
      if (o.type === 'lever' && !this.leversSolved) return o;
      if (o.type === 'npc') return o;
    }
    return null;
  }
  interact(o) {
    if (o.type === 'terminal') this.game.openRiddle(this.def.riddles[o.ri], o.ri);
    else if (o.type === 'npc') this.game.say(o.lines);
    else if (o.type === 'lever') this.pullLever(o);
  }

  pullLever(o) {
    if (o.on) return;
    o.on = true; AUDIO.sfx('lever');
    this.leverSeq.push(o.li);
    const def = this.def.levers;
    const n = this.leverSeq.length;
    if (this.leverSeq[n - 1] !== def.order[n - 1]) {
      AUDIO.sfx('wrong');
      this.shake = 10;
      this.leverSeq = [];
      this.game.run.leverMiss++;
      for (const l of this.levers) l.on = false;
      this.game.say([{ who: 'terminal', text: 'BZZT! Wrong order. All levers reset. HINT: ' + def.hint }]);
      return;
    }
    if (n === def.order.length) {
      this.openDoors(false);
      const pts = this.game.addScore(SCORE.lever[Math.min(SCORE.lever.length - 1, this.game.run.leverMiss)]);
      this.float(this.player.x - 6, this.player.y - 30, `+${pts}`, '#ffe060');
      this.game.saveGame('PUZZLE SOLVED');
    }
  }
  openDoors(silent) {
    this.leversSolved = true;
    for (const l of this.levers) l.on = true;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (this.grid[y][x] === 'D') {
      this.grid[y][x] = ' ';
      if (!silent) this.burst(x * TILE + 8, y * TILE + 8, '#7cff4f', 4);
    }
    if (!silent) { AUDIO.sfx('gate'); this.shake = 12; this.float(this.player.x - 10, this.player.y - 20, 'DOOR OPEN!', '#7cff4f'); }
  }
  solveRiddle(ri, silent) {
    this.riddles[ri].solved = true;
    for (const [k, owner] of this.gateOwner) {
      if (owner !== ri) continue;
      const [x, y] = k.split(',').map(Number);
      if (this.grid[y][x] === 'G') {
        this.grid[y][x] = ' ';
        if (!silent) this.burst(x * TILE + 8, y * TILE + 8, '#ffd23f', 4);
      }
    }
    if (!silent) { AUDIO.sfx('gate'); this.shake = 12; }
  }

  damageEnemy(e, dmg, dir, src) {
    e.hp -= dmg; e.flash = 6;
    if (e.hp <= 0) {
      e.dead = true; AUDIO.sfx('kill');
      this.hitstop = 3;
      this.burst(e.x + e.w / 2, e.y + e.h / 2, ENEMY_DEFS[e.ch].col, 14, 2.2);
      this.burst(e.x + e.w / 2, e.y + e.h / 2, '#b5ecfc', 8, 1.5);
      this.ring(e.x + e.w / 2, e.y + e.h / 2, '#ffffff', 16);
      for (let i = 0; i < 5; i++) this.particles.push({ x: e.x + e.w / 2 + (Math.random() - 0.5) * 14, y: e.y + e.h / 2 + (Math.random() - 0.5) * 12, vx: 0, vy: -0.3, life: 26 + i * 5, max: 40, col: '#ffffff', size: 1, shape: 'star', add: true });
      this.game.stats.kills++;
      // score: each enemy pays once per run; quick chains build a combo multiplier
      const run = this.game.run;
      if (e.id !== undefined && !run.kills.includes(e.id)) {
        run.kills.push(e.id);
        this.combo = this.comboT > 0 ? this.combo + 1 : 1; this.comboT = SCORE.comboFrames;
        const mult = Math.min(SCORE.comboMax, this.combo);
        const pts = this.game.addScore(ENEMY_DEFS[e.ch].hp * SCORE.killPerHp * mult + (dir === 0 ? SCORE.stomp : 0));
        this.game.onKill(this.combo);
        this.game.addAir(AIR.killBase + AIR.killPerCombo * mult);
        if (src && src.angel) this.game.angelXp(1);
        run.bestCombo = Math.max(run.bestCombo, this.combo);
        this.float(e.x - 4, e.y - 4, mult > 1 ? `+${pts} X${mult}` : `+${pts}`, mult > 1 ? '#ffe060' : '#b5ecfc');
        if (mult > 1) AUDIO.sfx('combo');
      } else this.float(e.x, e.y - 4, 'CLEAN!', '#b5ecfc');
    } else {
      AUDIO.sfx('hit');
      if (e.ground !== undefined && !ENEMY_DEFS[e.ch].fixed) e.vx += dir * 1.5;
    }
  }
  damageBoss(dmg, src) {
    const b = this.boss;
    if (b.inv > 0) return;
    this.game.addAir(AIR.bossHit);
    if (src && src.angel) this.game.angelXp(0.5);
    b.hp -= dmg; b.flash = 8; b.inv = 10;
    this.hitstop = 2;
    this.ring(b.x + b.w / 2, b.y + b.h / 2, '#ffffff', 26);
    AUDIO.sfx('bossHit');
    const run = this.game.run, dealt = b.maxHp - Math.max(0, b.hp);
    if (dealt > run.bossDmg) { this.game.addScore((dealt - run.bossDmg) * SCORE.bossHit); run.bossDmg = dealt; }
    if (b.hp <= 0) {
      if (!run.boss) {
        run.boss = true; this.float(b.x + b.w / 2 - 14, b.y - 8, `+${this.game.addScore(SCORE.boss)}`, '#ffe060');
        if (run.bossHurt === 0) this.game.award('bossFlawless');
      }
      b.dead = true; this.bossDefeated = true;
      AUDIO.sfx('bossDie'); this.shake = 40;
      for (let i = 0; i < 6; i++) { this.burst(b.x + Math.random() * b.w, b.y + Math.random() * b.h, i % 2 ? '#b5ecfc' : '#888', 20, 3); this.ring(b.x + Math.random() * b.w, b.y + Math.random() * b.h, '#b5ecfc', 30 + i * 8); }
      this.enemies.forEach(e => { if (e.spawned) { e.dead = true; this.burst(e.x, e.y, '#b5ecfc', 6); } });
      this.bullets = [];
      AUDIO.playMusic(this.def.music);
      this.game.say([{ who: 'boss', text: BOSS_INFO[b.kind].defeat }], () => {
        this.game.saveGame('BOSS DEFEATED');
        if (this.idx === LEVELS.length - 1) this.game.levelComplete();
      });
    }
  }

  // --------------------------------------------------------- particles
  burst(x, y, col, n, spd = 1.8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * spd + 0.4;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.8, life: 25 + Math.random() * 20, max: 45, col, size: 1 + Math.floor(Math.random() * 3), grav: 0.08 });
    }
  }
  splash(x, y) {
    AUDIO.sfx('splash');
    for (let i = 0; i < 8; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 2.5, life: 22, max: 22, col: i % 2 ? '#5fd4ff' : '#ffffff', size: 2, grav: 0.15 });
  }
  ring(x, y, col, r) { this.particles.push({ x, y, vx: 0, vy: 0, life: 16, max: 16, col, size: 1, shape: 'ring', r, add: true }); }
  secretAt(o) { return this.secretOf.get(Math.floor(o.x / TILE) + ',' + Math.floor(o.y / TILE)); }
  // Pichonkun stepping into a secret wall reveals the whole room
  checkSecrets() {
    const p = this.player;
    if (!this.secrets.length || p.dead) return;
    for (const sc of this.secrets) if (sc.revealed && sc.a < 1) sc.a = Math.min(1, sc.a + 0.08);
    const x0 = Math.floor((p.x + 2) / TILE), x1 = Math.floor((p.x + p.w - 3) / TILE);
    const y0 = Math.floor((p.y + 2) / TILE), y1 = Math.floor((p.y + p.h - 3) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const sc = this.secretOf.get(tx + ',' + ty);
      if (!sc || sc.revealed) continue;
      sc.revealed = true;
      for (const o of this.objects) if (o.type === 'crystal' && this.secretAt(o) === sc) o.hidden = false;
      if (!this.game.run.secrets.includes(sc.id)) {
        this.game.run.secrets.push(sc.id);
        AUDIO.sfx('secret');
        this.float(p.x - 22, p.y - 14, `SECRET! +${this.game.addScore(SCORE.secret)}`, '#ffe060');
        this.game.award('secret1');
        this.game.addAir(AIR.secret);
        for (const [sx, sy] of sc.tiles) this.burst(sx * TILE + 8, sy * TILE + 8, '#ffe060', 3, 1.2);
      }
    }
  }
  float(x, y, text, col) { this.floaters.push({ x, y, text, col, life: 50 }); }
  updateParticles() {
    for (const p of this.particles) {
      p.x += p.vx + (p.sway !== undefined ? Math.sin(this.t * 0.05 + p.sway) * 0.25 : 0); p.y += p.vy; p.vy += p.grav || 0; p.life--;
      if (p.hitGround && this.solidAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE))) { p.life = 0; for (let i = 0; i < 3; i++) this.particles.push({ x: p.x, y: p.y - 2, vx: (i - 1) * 0.6, vy: -1, grav: 0.12, life: 12, max: 12, col: p.col, size: 1 }); }
    }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    for (const f of this.floaters) { f.y -= 0.5; f.life--; }
    this.floaters = this.floaters.filter(f => f.life > 0);
    // ambient weather per theme
    if (this.game.save.gfx !== 'low') {
      const th = this.def.theme, t = this.t, cam = this.cam, rnd = Math.random;
      const rx = () => cam.x + rnd() * VIEW_W, ry = () => cam.y + rnd() * VIEW_H;
      const P = this.particles, mote = THEMES[th].mote;
      switch (th) {
        case 'meadow': case 'hills':
          if (t % 5 === 0) P.push({ x: rx(), y: ry(), vx: -0.1 - rnd() * 0.15, vy: (rnd() - 0.6) * 0.2, life: 160, max: 160, col: mote, size: 1, amb: true, add: true });
          if (t % (th === 'hills' ? 12 : 34) === 0) P.push({ x: cam.x + VIEW_W + 4, y: cam.y + rnd() * VIEW_H * 0.8, vx: -0.7 - rnd() * 0.5, vy: 0.2 + rnd() * 0.2, life: 520, max: 520, col: th === 'hills' ? ['#ff9ad6', '#ffd0ea', '#ffffff'][(rnd() * 3) | 0] : ['#8ae86a', '#c8f47a'][(rnd() * 2) | 0], size: 2, shape: 'leaf', amb: true, sway: rnd() * 6 });
          break;
        case 'city': case 'factory':
          if (t % 6 === 0) P.push({ x: rx() + 30, y: cam.y - 2, vx: -0.2 - rnd() * 0.15, vy: 0.3 + rnd() * 0.25, life: 520, max: 520, col: mote === '#ff9040' ? '#6a5a58' : mote, size: 1, amb: true, sway: rnd() * 6 });
          if (th === 'factory' && t % 5 === 0) P.push({ x: rx(), y: cam.y + VIEW_H + 2, vx: (rnd() - 0.5) * 0.5, vy: -0.5 - rnd() * 0.6, life: 170, max: 170, col: ['#ff6a1a', '#ffb040'][(rnd() * 2) | 0], size: 1, amb: true, add: true, sway: rnd() * 6 });
          break;
        case 'duct': case 'filter':
          if (t % 4 === 0) P.push({ x: rx(), y: ry(), vx: (rnd() - 0.5) * 0.25, vy: (rnd() - 0.5) * 0.2, life: 180, max: 180, col: mote, size: th === 'filter' && rnd() < 0.3 ? 2 : 1, amb: true, sway: rnd() * 6 });
          break;
        case 'ice':
          if (t % 2 === 0) P.push({ x: rx() + 50, y: cam.y - 2, vx: -0.35 - rnd() * 0.3, vy: 0.55 + rnd() * 0.5, life: 420, max: 420, col: '#ffffff', size: rnd() < 0.25 ? 2 : 1, amb: true, sway: rnd() * 6 });
          break;
        case 'drain':
          if (t % 6 === 0) P.push({ x: rx(), y: ry(), vx: (rnd() - 0.5) * 0.15, vy: -0.12 - rnd() * 0.1, life: 200, max: 200, col: mote, size: 1, amb: true, add: true, sway: rnd() * 6 });
          break;
        case 'compressor':
          if (t % 3 === 0) P.push({ x: rx(), y: cam.y + VIEW_H + 2, vx: (rnd() - 0.5) * 0.5, vy: -0.6 - rnd() * 0.8, life: 190, max: 190, col: ['#ff6a1a', '#ffb040', '#ffe080'][(rnd() * 3) | 0], size: 1, amb: true, add: true, sway: rnd() * 6 });
          break;
        case 'sky':
          if (t % 5 === 0) P.push({ x: cam.x + VIEW_W + 12, y: ry(), vx: -5 - rnd() * 3, vy: 0.08, life: 110, max: 110, col: '#d8d0f0', size: 1, len: 6 + rnd() * 10, amb: true });
          if (t % 9 === 0) P.push({ x: rx(), y: ry(), vx: -0.4, vy: 0, life: 70, max: 70, col: '#fff6c0', size: 1, shape: 'star', amb: true, add: true });
          break;
      }
      // dripping pipes
      if (t % 4 === 0) for (const d of this.decor) if (d.p.drip && (t + (d.x | 0) * 7) % 96 < 4 && Math.abs(d.x - cam.x - VIEW_W / 2) < VIEW_W) P.push({ x: d.x + d.p.drip.x, y: d.y + d.p.drip.y, vx: 0, vy: 0.5, grav: 0.12, life: 90, max: 90, col: THEMES[th].liquidHi, size: 1, len: 3, vert: true, hitGround: true });
    }
    for (const w of this.winds) if (this.t % 5 === 0) {
      this.particles.push({ x: w.x + Math.random() * 16, y: w.y + w.h, vx: 0, vy: -2.5, life: w.h / 2.5, max: w.h / 2.5, col: '#ffffff', size: 1, amb: true });
    }
  }
}

function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

// ================================================================= PLAYER
class Player {
  constructor(world, x, y) {
    this.world = world;
    this.x = x; this.y = y; this.w = 10; this.h = 18;
    this.vx = 0; this.vy = 0; this.face = 1;
    this.maxHp = world.hard ? HARD.hearts : 3; this.hp = this.maxHp;
    this.ground = false; this.coyote = 0; this.jumpBuf = 0; this.jumpHeld = false;
    this.usedDouble = false; this.canDouble = !!world.game.save.vapor || world.idx >= 3;
    this.inv = 0; this.shootCd = 0; this.anim = 0; this.landT = 0;
    this.platform = null; this.dead = false; this.deadT = 0; this.shootT = 0;
    this.sy = 1; this.blink = 0;
  }
  update(input) {
    const W = this.world;
    if (this.dead) {
      this.deadT++;
      if (this.deadT > 70) this.world.game.gameOver();
      return;
    }
    if (this.inv > 0) this.inv--;
    if (this.shootCd > 0) this.shootCd--;
    if (this.shootT > 0) this.shootT--;

    const under = this.ground ? W.groundTileUnder(this) : ' ';
    const onIce = under === 'i';
    const accel = this.ground ? (onIce ? 0.1 : 0.4) : 0.25;
    const fric = this.ground ? (onIce ? 0.97 : 0.75) : 0.92;
    let move = 0;
    if (input.left) move -= 1;
    if (input.right) move += 1;
    if (move) {
      this.face = move;
      // Running never pushes past RUN_SPEED; speed gained from outside (knock-back, ice) fades out.
      const lim = Math.max(RUN_SPEED, Math.abs(this.vx) * 0.95);
      this.vx += move * accel;
      if (Math.abs(this.vx) > lim) this.vx = Math.sign(this.vx) * lim;
    } else {
      this.vx *= fric;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }

    // jump
    if (input.jumpPressed) this.jumpBuf = 7;
    else if (this.jumpBuf > 0) this.jumpBuf--;
    if (this.ground) { this.coyote = 7; this.usedDouble = false; } else if (this.coyote > 0) this.coyote--;
    if (this.jumpBuf > 0) {
      if (this.coyote > 0) {
        this.vy = JUMP_V; this.coyote = 0; this.jumpBuf = 0; this.jumpHeld = true; this.ground = false; this.sy = 1.28;
        AUDIO.sfx('jump');
        W.burst(this.x + 5, this.y + this.h, '#ffffff', 4, 0.8);
      } else if (this.canDouble && !this.usedDouble && input.jumpPressed) {
        this.vy = DJUMP_V; this.usedDouble = true; this.jumpBuf = 0; this.jumpHeld = true; this.sy = 1.25;
        W.ring(this.x + 5, this.y + this.h, '#e8f8ff', 14);
        AUDIO.sfx('djump');
        for (let i = 0; i < 10; i++) W.particles.push({ x: this.x + 5, y: this.y + this.h, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 1.2, life: 25, max: 25, col: '#e8f8ff', size: 3, grav: -0.02 });
      }
    }
    if (this.jumpHeld && !input.jump && this.vy < -2.5) { this.vy *= 0.5; this.jumpHeld = false; }
    if (this.vy >= 0) this.jumpHeld = false;

    // gravity + wind
    this.vy += GRAV;
    for (const w of W.winds) if (overlap(this, w)) { this.vy -= 0.78; if (this.vy < -4.2) this.vy = -4.2; this.usedDouble = false; }
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    // conveyor
    let extVx = 0;
    if (this.ground) {
      if (under === '>') extVx = 1.1; else if (under === '<') extVx = -1.1;
    }
    // ride moving platform
    if (this.platform) { this.x += this.platform.dx; this.y += this.platform.dy; }

    // shoot
    const lv = W.game.splashLevel(), li = lv - 1;
    if (input.shootPressed && this.shootCd === 0 && W.shots.filter(s => !s.angel).length < SPLASH.maxShots[li]) {
      const up = input.up, life = SPLASH.life[li] - (up ? 6 : 0);
      const base = up ? -0.81 : 0;                 // aim: straight ahead, or diagonally up
      // power 1-2: one splash. 3: twin. 4: triple spread. 5: triple with a big middle splash.
      const fan = lv >= 4 ? [-0.2, 0, 0.2] : [0];
      const twin = lv === 3 ? [-3.5, 3.5] : [0];
      for (const off of fan) for (const dy of twin) {
        const an = base + off, big = lv === 5 && off === 0;
        W.shots.push({ x: this.x + (this.face > 0 ? 8 : -4), y: this.y + 5 + dy, w: 6, h: 6, vx: this.face * Math.cos(an) * 5, vy: Math.sin(an) * 5, life, dmg: big ? 2 : 1, big });
      }
      this.shootCd = SPLASH.cooldown[li]; this.shootT = 10;
      AUDIO.sfx('shoot');
    }

    const vxSave = this.vx;
    this.vx = vxSave + extVx;
    const wasGround = this.ground;
    const dropThrough = input.down && input.jumpPressed;
    const r = W.moveBody(this, dropThrough);
    if (r.hitX) this.vx = 0; else this.vx = vxSave;
    this.ground = r.ground;
    this.platform = r.platform || null;
    if (this.ground && !wasGround) {
      this.landT = 8; this.sy = 0.74;
      for (const d of [-1, 1]) for (let i = 0; i < 3; i++) W.particles.push({ x: this.x + 5 + d * 3, y: this.y + this.h - 1, vx: d * (0.5 + Math.random() * 0.9), vy: -0.3 - Math.random() * 0.5, life: 16 + i * 4, max: 28, col: THEMES[W.def.theme].mote, size: 2, grav: 0.03 });
    }
    this.sy += (1 - this.sy) * 0.2;
    if (this.blink > 0) this.blink--; else if (Math.random() < 0.008) this.blink = 8;
    if (this.ground && Math.abs(this.vx) > 1.6 && W.t % 7 === 0) W.particles.push({ x: this.x + 5 - this.face * 4, y: this.y + this.h - 1, vx: -this.face * 0.4, vy: -0.4, life: 16, max: 16, col: THEMES[W.def.theme].mote, size: 1 });
    if (W.t % 26 === 0 && !this.dead) W.particles.push({ x: this.x + 2 + Math.random() * 6, y: this.y + 10, vx: 0, vy: 0.3, grav: 0.1, life: 30, max: 30, col: '#8fdcff', size: 1, hitGround: true });
    if (this.landT > 0) this.landT--;
    if (this.x < 0) this.x = 0;
    if (this.x + this.w > W.pw) this.x = W.pw - this.w;

    // crumble trigger
    if (this.ground) {
      const ty = Math.floor((this.y + this.h + 1) / TILE);
      for (const tx of [Math.floor(this.x / TILE), Math.floor((this.x + this.w - 0.01) / TILE)]) {
        if (W.tile(tx, ty) === 'x') { const k = tx + ',' + ty; if (!W.crumble.has(k)) W.crumble.set(k, { t: 0, broken: false }); }
      }
      // remember safe ground
      if (!this.platform) {
        const tl = W.tile(Math.floor(this.x / TILE), ty), tr = W.tile(Math.floor((this.x + this.w) / TILE), ty);
        const safe = c => c === '#' || c === '=' || c === 'i' || c === '-' || c === '<' || c === '>';
        if (safe(tl) && safe(tr)) this.lastSafe = { x: this.x, y: this.y };
      }
    }

    // hazards
    if (W.rectTouches(this.x, this.y, this.w, this.h, '^', 3) || W.rectTouches(this.x, this.y + 6, this.w, this.h - 6, '~', 2)) {
      this.hazard();
    } else if (this.y > W.ph + 24) {
      this.hazard();
    }

    // enemies
    for (const e of W.enemies) {
      if (e.dead || !overlap(this, e)) continue;
      const def = ENEMY_DEFS[e.ch];
      const stomp = this.vy > 0.5 && this.y + this.h - this.vy <= e.y + 5;
      if (stomp && def.stomp) {
        this.vy = input.jump ? JUMP_V * 0.95 : -5; this.usedDouble = false;
        AUDIO.sfx('stomp');
        W.damageEnemy(e, 2, 0);
      } else {
        this.hurt(e.x + e.w / 2 < this.x + this.w / 2 ? 1 : -1);
      }
    }
    const b = W.boss;
    if (b && W.bossActive && !b.dead && overlap(this, b)) {
      const stomp = this.vy > 0.5 && this.y + this.h - this.vy <= b.y + 8;
      if (stomp && b.kind !== 'moldqueen') {
        this.vy = -6.5; this.usedDouble = false; AUDIO.sfx('stomp'); W.damageBoss(1);
      } else this.hurt(b.x + b.w / 2 < this.x + this.w / 2 ? 1 : -1);
    }
    this.anim += Math.abs(this.vx) * 0.2;
  }
  hurt(dir) {
    if (this.inv > 0 || this.dead) return;
    this.hp--;
    this.world.game.stats.hits++; this.world.game.run.hits++;
    if (this.world.bossActive) this.world.game.run.bossHurt++;
    this.world.game.addAir(AIR.hurt);
    this.inv = 80;
    this.vx = dir * 2.5; this.vy = -4;
    this.world.shake = 8;
    AUDIO.sfx('hurt');
    this.world.burst(this.x + 5, this.y + 8, '#5fd4ff', 10);
    if (this.hp <= 0) this.die();
  }
  hazard() {
    if (this.dead) return;
    if (this.inv <= 0) {
      this.hp--; this.world.game.stats.hits++; this.world.game.run.hits++;
      if (this.world.bossActive) this.world.game.run.bossHurt++;
      this.world.game.addAir(AIR.hurt);
      AUDIO.sfx('hurt');
    }
    this.world.burst(this.x + 5, this.y + 8, '#5fd4ff', 14, 2);
    if (this.hp <= 0) { this.die(); return; }
    this.x = this.lastSafe.x; this.y = this.lastSafe.y; this.vx = 0; this.vy = 0;
    this.inv = 80; this.world.shake = 8;
  }
  die() {
    this.dead = true; this.deadT = 0;
    this.world.game.stats.deaths++; this.world.game.run.deaths++;
    AUDIO.sfx('die');
    this.world.burst(this.x + 5, this.y + 8, '#5fd4ff', 30, 3);
    this.world.burst(this.x + 5, this.y + 8, '#ffffff', 15, 2);
  }
  sprite() {
    if (this.inv > 58) return SPR.pichon_hurt;
    if (!this.ground) return this.vy < 0 ? SPR.pichon_jump : SPR.pichon_fall;
    if (this.landT > 4) return SPR.pichon_land;
    if (Math.abs(this.vx) > 0.3) return SPR.pichon_run[Math.floor(this.anim) % SPR.pichon_run.length];
    if (this.shootT > 0) return SPR.pichon_shoot;
    if (this.blink > 0) return SPR.pichon_blink;
    return SPR.pichon_idle[Math.floor(this.world.t / 9) % SPR.pichon_idle.length];
  }
}

// ================================================================ ENEMIES
const ENEMY_DEFS = {
  p: { name: 'pollen', w: 11, h: 11, hp: 1, stomp: true, col: '#ffd23f', fly: true },
  f: { name: 'flower', w: 10, h: 12, hp: 2, stomp: true, col: '#e85ab0', fixed: true },
  b: { name: 'bacteria', w: 14, h: 9, hp: 2, stomp: true, col: '#3fae3f' },
  d: { name: 'dust', w: 12, h: 10, hp: 1, stomp: true, col: '#b4b4b4' },
  v: { name: 'virus', w: 11, h: 11, hp: 2, stomp: false, col: '#9b3fd0' },
  s: { name: 'smog', w: 18, h: 10, hp: 3, stomp: true, col: '#5e5e66', fly: true },
  m: { name: 'mold', w: 12, h: 9, hp: 3, stomp: false, col: '#6b8e23', fixed: true },
  g: { name: 'germfly', w: 10, h: 7, hp: 1, stomp: true, col: '#3fae3f', fly: true },
};

function makeEnemy(ch, px, py) {
  const d = ENEMY_DEFS[ch];
  const e = { ch, x: px + (16 - d.w) / 2, y: py + 16 - d.h, w: d.w, h: d.h, vx: 0, vy: 0, hp: d.hp, dir: -1, t: Math.floor(Math.random() * 100), flash: 0, ox: px, oy: py };
  if (d.fly) { e.y = py + 2; e.oy = e.y; }
  if (ch === 'b') e.vx = -0.5;
  if (ch === 'd') e.vx = -0.9;
  e.ground = false;
  return e;
}

function updateEnemy(W, e) {
  e.t++;
  if (e.flash > 0) e.flash--;
  const p = W.player;
  const dx = p.x - e.x, dy = p.y - e.y;
  const dist = Math.hypot(dx, dy);
  switch (e.ch) {
    case 'p': // pollen: drifts in a lazy loop
      e.x = e.ox + Math.sin(e.t * 0.02) * 28;
      e.y = e.oy + Math.sin(e.t * 0.05) * 10;
      e.dir = Math.cos(e.t * 0.02) > 0 ? 1 : -1;
      break;
    case 'g': // germ fly: figure-eight & occasional dive
      if (e.dive) {
        e.x += e.dvx; e.y += e.dvy; e.dive--;
        if (!e.dive) { e.ox = e.x; e.oy = e.y; e.t = 0; }
      } else {
        e.x = e.ox + Math.sin(e.t * 0.03) * 40;
        e.y = e.oy + Math.sin(e.t * 0.06) * 14;
        if (e.t % 180 === 120 && dist < 120) { e.dive = 40; e.dvx = dx / 40; e.dvy = dy / 40; }
      }
      e.dir = Math.cos(e.t * 0.03) > 0 ? 1 : -1;
      break;
    case 's': // smog: hovers toward the player, shoots soot
      if (dist < 170) {
        const tx = p.x - 20 * Math.sign(dx || 1), ty = p.y - 50;
        e.x += Math.sign(tx - e.x) * 0.45; e.y += Math.sign(ty - e.y) * 0.3;
        e.dir = dx > 0 ? 1 : -1;
        if (e.t % 110 === 0) {
          const a = Math.atan2(dy, dx);
          W.bullets.push({ x: e.x + 7, y: e.y + 5, w: 4, h: 4, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 140, spr: 'soot', col: '#555' });
          AUDIO.sfx('enemyShoot');
        }
      } else {
        e.y = e.oy + Math.sin(e.t * 0.04) * 6;
      }
      break;
    case 'f': // pollen flower: lobs pollen balls
      e.dir = dx > 0 ? 1 : -1;
      if (dist < 170 && e.t % 120 === 0) {
        const vx = Math.max(-2.2, Math.min(2.2, dx / 50));
        W.bullets.push({ x: e.x + 3, y: e.y, w: 4, h: 4, vx, vy: -4, grav: 0.14, life: 200, spr: 'pollenBall', col: '#ffd23f' });
        AUDIO.sfx('enemyShoot');
      }
      break;
    case 'm': // mold turret: spore fountain
      if (dist < 180 && e.t % 140 === 0) {
        for (let i = -1; i <= 1; i++) W.bullets.push({ x: e.x + 4, y: e.y, w: 4, h: 4, vx: i * 1.1 + Math.sign(dx) * 0.4, vy: -4.2 + Math.abs(i) * 0.6, grav: 0.13, life: 200, spr: 'spore', col: '#6b8e23' });
        AUDIO.sfx('enemyShoot');
      }
      break;
    case 'v': // virus: hops toward the player
      e.vy += GRAV;
      if (e.ground) {
        e.vx *= 0.8;
        if (e.t % 70 === 0) { e.vy = -5.5; e.vx = dist < 150 ? Math.sign(dx) * 1.2 : (Math.random() - 0.5) * 2; }
      }
      walkBody(W, e, false);
      break;
    case 'b': case 'd':
      e.vy += GRAV;
      if (e.ch === 'd' && e.ground && e.t % 100 === 0) e.vy = -4;
      walkBody(W, e, true);
      break;
  }
  if (e.y > W.ph + 40) e.dead = true;
  if (!ENEMY_DEFS[e.ch].fly && W.rectTouches(e.x, e.y, e.w, e.h, '^~', 2)) { e.dead = true; W.burst(e.x + e.w / 2, e.y + e.h / 2, ENEMY_DEFS[e.ch].col, 8); }
}

function walkBody(W, e, turnAtEdges) {
  const spd = e.ch === 'd' ? 0.9 : e.ch === 'b' ? 0.5 : Math.abs(e.vx);
  if (turnAtEdges && e.ground) {
    // look ahead for a ledge
    const ax = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
    const ty = Math.floor((e.y + e.h + 2) / TILE);
    const tx = Math.floor(ax / TILE);
    if (!W.solidAt(tx, ty) && !W.oneWayAt(tx, ty) && W.tile(tx, ty) !== '^') e.vx = -e.vx;
    if (W.tile(tx, ty) === '^' || W.tile(tx, ty) === '~') e.vx = -e.vx;
  }
  if (turnAtEdges && Math.abs(e.vx) < 0.1) e.vx = spd * (e.dir || -1);
  if (turnAtEdges) e.vx = Math.sign(e.vx) * Math.max(spd, Math.abs(e.vx) * 0.9);
  const before = e.vx;
  const r = W.moveBody(e);
  e.ground = r.ground;
  if (r.hitX && turnAtEdges) e.vx = -before;
  if (e.vx) e.dir = e.vx > 0 ? 1 : -1;
}

// ================================================================== BOSSES
function makeBoss(W, kind, px, py) {
  const info = BOSS_INFO[kind];
  const b = { kind, hp: info.hp, maxHp: info.hp, t: 0, flash: 0, inv: 0, dead: false, vx: 0, vy: 0, state: 'walk', st: 0, dir: -1 };
  if (kind === 'dustbaron') { b.w = 38; b.h = 30; }
  if (kind === 'moldqueen') { b.w = 32; b.h = 26; }
  if (kind === 'smogmaw') { b.w = 62; b.h = 38; }
  b.spr = 'boss_' + kind;
  b.x = px - b.w / 2; b.y = py + 16 - b.h;
  b.homeX = b.x; b.homeY = b.y;
  return b;
}

function updateBoss(W, b) {
  if (!W.bossActive) return;
  b.t++; b.st++;
  if (b.flash > 0) b.flash--;
  if (b.inv > 0) b.inv--;
  const p = W.player;
  const dx = (p.x + p.w / 2) - (b.x + b.w / 2);
  const angry = b.hp <= b.maxHp / 2;
  const spawned = W.enemies.filter(e => e.spawned && !e.dead).length;

  if (b.kind === 'dustbaron') {
    b.vy += GRAV;
    if (b.state === 'walk') {
      b.dir = Math.sign(dx) || 1;
      b.vx = b.dir * (angry ? 1.3 : 0.8);
      if (b.st > (angry ? 70 : 110)) { b.state = 'crouch'; b.st = 0; b.vx = 0; }
    } else if (b.state === 'crouch') {
      b.vx = 0;
      if (b.st > 24) { b.state = 'jump'; b.st = 0; b.vy = -9; b.vx = Math.max(-3, Math.min(3, dx / 50)); }
    } else if (b.state === 'jump') {
      if (b.ground && b.st > 5) {
        b.state = 'walk'; b.st = 0; W.shake = 14; AUDIO.sfx('stomp');
        W.burst(b.x + b.w / 2, b.y + b.h, '#b4b4b4', 20, 2.5);
        // shockwave dust balls
        for (const d of [-1, 1]) W.bullets.push({ x: b.x + b.w / 2, y: b.y + b.h - 6, w: 6, h: 6, vx: d * 2.2, vy: 0, life: 90, spr: 'soot', col: '#999' });
        if (spawned < (angry ? 3 : 2)) {
          const e = makeEnemy('d', b.x + b.w / 2 - 8, b.y + b.h - 16); e.spawned = true; e.vy = -4; e.vx = (Math.random() < 0.5 ? -1 : 1) * 0.9;
          W.enemies.push(e);
        }
      }
    }
    const r = W.moveBody(b);
    b.ground = r.ground;
    if (r.hitX) b.dir = -b.dir;
  } else if (b.kind === 'moldqueen') {
    b.vy += GRAV;
    const target = Math.max(b.homeX - 6 * TILE, Math.min(b.homeX + 2 * TILE, p.x - b.w / 2));
    b.vx = Math.sign(target - b.x) * (Math.abs(target - b.x) > 4 ? (angry ? 0.8 : 0.45) : 0);
    b.dir = Math.sign(dx) || 1;
    const period = angry ? 80 : 110;
    if (b.st % period === 0) {
      const n = angry ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        W.bullets.push({ x: b.x + b.w / 2, y: b.y + 4, w: 5, h: 5, vx: k * 0.8 + Math.sign(dx) * 0.5, vy: -5 + Math.abs(k) * 0.4, grav: 0.13, life: 220, spr: 'spore', col: '#6b8e23' });
      }
      AUDIO.sfx('enemyShoot');
    }
    if (b.st % 260 === 130 && spawned < (angry ? 3 : 2)) {
      const e = makeEnemy('g', b.x + b.w / 2, b.y - 30); e.spawned = true; e.ox = e.x; e.oy = e.y;
      W.enemies.push(e);
    }
    if (angry && b.st % 200 === 100) { b.vy = -6; }
    const r = W.moveBody(b);
    b.ground = r.ground;
  } else if (b.kind === 'smogmaw') {
    // floats in a figure-eight; swoops down when angry
    const cx = b.homeX - 4 * TILE, top = 5 * TILE;
    if (b.state === 'swoop') {
      const k = b.st / 90;
      const low = 12 * TILE - b.h - 2;
      b.x += (b.sx - b.x) * 0.04;
      b.y = (top + 48) + Math.sin(Math.min(1, k) * Math.PI) * (low - (top + 48));
      if (b.st > 90) { b.state = 'float'; b.st = 0; }
    } else {
      b.x += ((cx + Math.sin(b.t * 0.012) * 7 * TILE) - b.x) * 0.05;
      b.y += ((top + 48 + Math.sin(b.t * 0.03) * 26) - b.y) * 0.05;
      b.dir = Math.sign(dx) || 1;
      const rate = angry ? 70 : 100;
      if (b.st % rate === 0) {
        const a = Math.atan2(p.y - (b.y + b.h / 2), dx);
        const n = angry ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const aa = a + (i - (n - 1) / 2) * 0.22;
          W.bullets.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, w: 5, h: 5, vx: Math.cos(aa) * 2.2, vy: Math.sin(aa) * 2.2, life: 200, spr: 'soot', col: '#444' });
        }
        AUDIO.sfx('enemyShoot');
      }
      if (b.st % 320 === 160 && spawned < (angry ? 3 : 2)) {
        const e = makeEnemy(angry ? 'v' : 'g', b.x + b.w / 2, b.y + b.h); e.spawned = true; e.ox = e.x; e.oy = e.y;
        W.enemies.push(e);
      }
      const swoopEvery = angry ? 200 : 300;
      if (b.st >= swoopEvery && b.st % swoopEvery === 0) { b.state = 'swoop'; b.st = 0; b.sx = p.x - b.w / 2; }
    }
  }
}
