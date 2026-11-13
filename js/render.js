// Renderer: world drawing, dynamic lighting + bloom, particles, HUD, menus and scenes.
'use strict';
(function () {
  const G = Game.prototype;
  const glow = (c, r, core) => GFX.glowTex(c, r, core);
  const fancy = (g) => g.save.gfx !== 'low';

  // ------------------------------------------------------------ lighting
  // A low-res light map: filled with the level's ambient colour, lights are added
  // on top, then the whole thing is multiplied over the scene.
  const LM = { c: null, g: null };
  function lightPass(ctx, amb, lights, flash) {
    if (!LM.c) { LM.c = GFX.canvas(VIEW_W / 2, VIEW_H / 2); LM.g = LM.c.getContext('2d'); }
    const g = LM.g;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = amb; g.fillRect(0, 0, LM.c.width, LM.c.height);
    if (flash > 0) { g.globalAlpha = flash * 0.8; g.fillStyle = '#ffffff'; g.fillRect(0, 0, LM.c.width, LM.c.height); }
    g.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      g.globalAlpha = Math.min(1, l.a);
      g.drawImage(glow(l.col, 64, 1), (l.x - l.r) / 2, (l.y - l.r) / 2, l.r, l.r);
    }
    g.globalAlpha = 1;
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(LM.c, 0, 0, VIEW_W, VIEW_H);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
  }
  const BGC = { c: null, g: null, bg: null };
  let VIG = null;
  function vignette(ctx) {
    if (!VIG) {
      VIG = GFX.canvas(VIEW_W / 2, VIEW_H / 2);
      const g = VIG.getContext('2d');
      const gr = g.createRadialGradient(VIEW_W / 4, VIEW_H / 4, VIEW_H * 0.24, VIEW_W / 4, VIEW_H / 4, VIEW_W * 0.36);
      gr.addColorStop(0, 'rgba(0,0,16,0)'); gr.addColorStop(1, 'rgba(0,0,16,0.42)');
      g.fillStyle = gr; g.fillRect(0, 0, VIG.width, VIG.height);
    }
    ctx.imageSmoothingEnabled = true; ctx.drawImage(VIG, 0, 0, VIEW_W, VIEW_H); ctx.imageSmoothingEnabled = false;
  }

  // ================================================================ FRAME
  G.render = function () {
    const ctx = this.ctx;
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    switch (this.state) {
      case 'title': this.drawTitle(); break;
      case 'levelselect': this.drawLevelSelect(); break;
      case 'story': this.drawStory(); break;
      case 'intro': this.drawWorld(); this.drawIntro(); break;
      case 'play': this.drawWorld(); this.drawHUD(); if (this.riddle) this.drawRiddle(); break;
      case 'pause': this.drawWorld(); this.drawHUD(); this.drawPause(); break;
      case 'clear': this.drawWorld(); this.drawClear(); break;
      case 'name': if (this.tally) { this.drawWorld(); this.drawClear(); } else this.drawScene(0.6); this.drawName(); break;
      case 'board': this.drawBoard(); break;
      case 'awards': this.drawAwards(); break;
      case 'ending': this.drawEnding(); break;
      case 'credits': this.drawCredits(); break;
    }
    if (this.dialog) this.drawDialog();
    if (this.saveFlash > 0) this.drawSaveIcon();
    if (this.toasts.length) this.drawToast();
  };

  // ================================================================ WORLD
  G.drawWorld = function () {
    const ctx = this.ctx, w = this.world, T = THEMES[w.def.theme], hi = fancy(this);
    let cx = w.cam.x, cy = w.cam.y;
    if (w.shake > 0) { cx += (Math.random() - 0.5) * Math.min(6, w.shake * 0.5); cy += (Math.random() - 0.5) * Math.min(6, w.shake * 0.5); }
    cx = Math.round(cx * 2) / 2; cy = Math.round(cy * 2) / 2;
    const t = w.t, p = w.player;
    const lights = [];
    const L = (x, y, r, col, a = 1, bloom = 0) => lights.push({ x: x - cx, y: y - cy, r, col, a, bloom });
    const onScreen = (x, wd = 40) => x > cx - wd && x < cx + VIEW_W + wd;

    if (hi) {
      BACKDROP.draw(ctx, w.bg, cx, cy, t);
      ctx.fillStyle = T.fog; ctx.fillRect(0, 0, VIEW_W, VIEW_H);   // haze pushes the backdrop behind the playfield
    } else {
      // FAST mode: the parallax backdrop is composited into a cache every other frame
      if (!BGC.c) { BGC.c = GFX.canvas(VIEW_W * RES, VIEW_H * RES); BGC.g = BGC.c.getContext('2d'); BGC.g.imageSmoothingEnabled = false; }
      if (BGC.bg !== w.bg || (this.t & 1) === 0) {
        BGC.bg = w.bg; BGC.g.setTransform(RES, 0, 0, RES, 0, 0);
        BACKDROP.draw(BGC.g, w.bg, cx, cy, t);
        BGC.g.fillStyle = T.fog; BGC.g.fillRect(0, 0, VIEW_W, VIEW_H);
      }
      ctx.drawImage(BGC.c, 0, 0, VIEW_W, VIEW_H);
    }
    ctx.save();
    ctx.translate(-cx, -cy);

    // updraft columns
    for (const wd of w.winds) {
      if (!onScreen(wd.x)) continue;
      const gr = ctx.createLinearGradient(0, wd.y, 0, wd.y + wd.h);
      gr.addColorStop(0, 'rgba(220,245,255,0)'); gr.addColorStop(1, 'rgba(200,240,255,0.28)');
      ctx.fillStyle = gr; ctx.fillRect(wd.x, wd.y, wd.w, wd.h);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 5; i++) { const yy = wd.y + wd.h - ((t * 2.4 + i * 37) % wd.h); ctx.fillRect(wd.x + 2 + (i * 5) % 12 + Math.sin(yy * 0.1) * 1.5, yy, 0.5, 7); }
    }

    // props, then the painted terrain on top (grass blades overlap their feet)
    for (const d of w.decor) {
      if (!onScreen(d.x, 60)) continue;
      ctx.drawImage(d.p.img, d.x, d.y, d.p.w, d.p.h);
      const li = d.p.light;
      if (li && (!li.blink || (t + (d.x | 0)) % (li.blink * 2) < li.blink)) L(d.x + li.x, d.y + li.y, li.r * (1 + Math.sin(t * 0.13 + d.x) * 0.03), li.col, li.a, li.r * 0.34);
    }
    w.terrain.draw(ctx, cx, cy, VIEW_W);

    // dynamic tiles
    const x0 = Math.max(0, Math.floor(cx / TILE)), x1 = Math.min(w.W - 1, Math.floor((cx + VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE)), y1 = Math.min(w.H - 1, Math.floor((cy + VIEW_H) / TILE));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = w.grid[ty][tx];
      if (c === ' ' || c === '#') continue;
      const px = tx * TILE, py = ty * TILE;
      switch (c) {
        case 'G':
          ctx.drawImage(SPR.gate[((t >> 2) + ty) % 4].img, px, py, 16, 16);
          if ((ty & 1) === 0) L(px + 8, py + 8, 44, '#ff8a3a', 0.6, 14);
          break;
        case 'D': ctx.drawImage(SPR.door.img, px, py, 16, 16); break;
        case '%': {
          // secret wall: painted like solid ground. Found rooms are shown hollowed out;
          // unfound ones give themselves away with a faint twinkle now and then.
          const sc = w.secretOf.get(tx + ',' + ty);
          if (sc.a > 0) {
            ctx.fillStyle = `rgba(4,6,22,${0.8 * sc.a})`; ctx.fillRect(px, py, 16, 16);
            // golden rim where the room meets real wall or open air
            ctx.fillStyle = `rgba(255,216,74,${0.55 * sc.a})`;
            const same = (dx, dy) => w.secretOf.get((tx + dx) + ',' + (ty + dy)) === sc;
            if (!same(0, -1)) ctx.fillRect(px, py, 16, 1);
            if (!same(0, 1)) ctx.fillRect(px, py + 15, 16, 1);
            if (!same(-1, 0)) ctx.fillRect(px, py, 1, 16);
            if (!same(1, 0)) ctx.fillRect(px + 15, py, 1, 16);
            break;
          }
          const ph = (t + tx * 53 + ty * 97) % 210;
          if (ph < 18 && (w.tile(tx + 1, ty) === ' ' || w.tile(tx - 1, ty) === ' ' || w.tile(tx, ty + 1) === ' ' || w.tile(tx, ty - 1) === ' ')) {
            const r = ph < 9 ? ph / 3 : (18 - ph) / 3, sx = px + 4 + ((tx * 7 + ty * 3) % 8), sy = py + 4 + ((tx * 5 + ty * 11) % 8);
            ctx.fillStyle = '#fff8c8'; ctx.fillRect(sx - r, sy, r * 2 + 1, 1); ctx.fillRect(sx, sy - r, 1, r * 2 + 1);
          }
          break;
        }
        case 'x': {
          const s = w.crumble.get(tx + ',' + ty);
          if (s && s.broken) break;
          ctx.drawImage(w.terrain.crumble, px + (s ? (Math.random() - 0.5) * 1.5 : 0), py + (s ? (Math.random() - 0.5) : 0), 16, 16);
          break;
        }
        case '<': case '>': ctx.drawImage(SPR.conveyor[c === '>' ? (t >> 2) % 4 : 3 - ((t >> 2) % 4)].img, px, py, 16, 16); break;
        case '^': if (w.def.theme === 'compressor' && (tx & 1) === 0) L(px + 8, py + 10, 30, '#ff7a2a', 0.5, 12); break;
        case '~': {
          const top = ty === 0 || w.grid[ty - 1][tx] !== '~';
          if (!top) { ctx.fillStyle = T.liquid; ctx.fillRect(px, py, 16, 16); break; }
          // wavy surface, drawn in 2px columns
          for (let i = 0; i < 16; i += 1) {
            const wv = 3 + Math.sin((px + i) * 0.22 + t * 0.07) * 1.4 + Math.sin((px + i) * 0.5 - t * 0.05) * 0.6;
            const yy = Math.round((py + wv) * 2) / 2;
            ctx.fillStyle = T.liquid; ctx.fillRect(px + i, yy, 1, py + 16 - yy);
            ctx.fillStyle = T.liquidHi; ctx.fillRect(px + i, yy, 1, 1);
            ctx.globalAlpha = 0.35; ctx.fillRect(px + i, yy + 1, 1, 2.5); ctx.globalAlpha = 1;
          }
          ctx.fillStyle = T.liquidHi; ctx.globalAlpha = 0.5;
          ctx.fillRect(px + ((tx * 7 + (t >> 2)) % 13), py + 9 + (tx % 3), 3, 0.5); ctx.globalAlpha = 1;
          if (hi && Math.random() < 0.012) w.particles.push({ x: px + Math.random() * 16, y: py + 5, vx: 0, vy: -0.5, life: 34, max: 34, col: T.liquidHi, size: 1, amb: true, add: true });
          if ((tx & 1) === 0) L(px + 8, py + 4, 50, T.liquidHi, 0.5, 16);
          break;
        }
      }
    }

    // moving platforms
    for (const pl of w.platforms) {
      drawSpr(ctx, SPR.platform, pl.x - 0.5, pl.y - 1);
      L(pl.x + 24, pl.y + 11, 26, '#5fd4ff', 0.5, 9);
    }

    if (w.exit) this.drawExit(w, L);
    for (const o of w.objects) if (onScreen(o.x)) this.drawObject(o, w, L);

    // enemies
    for (const e of w.enemies) {
      if (!onScreen(e.x)) continue;
      const def = ENEMY_DEFS[e.ch], frames = SPR[def.name];
      let f = Math.floor((e.t || 0) / 9) % frames.length;
      if (e.ch === 'f') f = (e.t % 120 > 104) ? 3 : Math.floor(e.t / 14) % 3;
      if (e.ch === 'g') f = (e.t >> 2) % 2;
      const spr = frames[f];
      if (!def.fly) { ctx.fillStyle = 'rgba(0,0,20,0.28)'; ctx.fillRect(e.x + 1, e.y + e.h - 0.5, e.w - 2, 1.5); }
      drawSpr(ctx, e.flash > 0 && (e.flash & 1) ? whiteOf(spr) : spr, e.x + e.w / 2 - spr.w / 2, e.y + e.h - spr.h + (spr.oy || 0), e.dir > 0);
      if (e.ch === 's') L(e.x + 9, e.y + 5, 22, '#ff5a2a', 0.5, 0);
    }

    if (w.boss && !w.boss.dead) this.drawBoss(w.boss, w, L);

    // guardian angel
    if (w.wing) {
      const a = w.wing, spr = a.shootT > 0 ? SPR.angel_shoot : SPR.angel[(a.t >> 3) % 4];
      L(a.x + 5, a.y + 6, 46, '#fff0b8', 0.8, 0);
      if (hi) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.drawImage(glow('#fff0b8', 20, 0.5), a.x + 5 - 20, a.y + 2 - 20); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      const s = 0.8;
      ctx.drawImage(a.face < 0 ? spr.flip : spr.img, Math.round((a.x + 5 - spr.w * s / 2) * 2) / 2, Math.round((a.y + 14 - (spr.h - spr.oy) * s) * 2) / 2, spr.w * s, spr.h * s);
    }

    // player
    if (!p.dead) {
      L(p.x + 5, p.y + 6, 84, '#d4ecff', 1, 0);
      if (p.ground) { ctx.fillStyle = 'rgba(0,0,20,0.3)'; ctx.fillRect(p.x - 1, p.y + p.h - 0.5, 12, 1.5); ctx.fillRect(p.x + 1, p.y + p.h + 1, 8, 0.5); }
      if (!(p.inv > 0 && Math.floor(p.inv / 4) % 2)) {
        if (hi) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(glow('#5fd4ff', 24, 0.5), p.x + 5 - 24, p.y + 4 - 24); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
        const spr = p.sprite();
        ctx.save();
        ctx.translate(Math.round((p.x + p.w / 2) * 2) / 2, Math.round((p.y + p.h) * 2) / 2);
        ctx.scale(1 + (1 - p.sy) * 0.7, p.sy);
        ctx.drawImage(p.face < 0 ? spr.flip : spr.img, -spr.w / 2 + (p.face < 0 ? -0.5 : 0.5), -spr.h + spr.oy, spr.w, spr.h);
        ctx.restore();
      }
    }

    // projectiles
    for (const s of w.shots) {
      const spr = SPR.shot[(t >> 2) % 2];
      ctx.save(); ctx.translate(s.x + 3, s.y + 3);
      if (s.vy) ctx.rotate(Math.atan2(s.vy, Math.abs(s.vx)) * (s.vx < 0 ? -1 : 1));
      ctx.drawImage(s.vx < 0 ? spr.flip : spr.img, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      ctx.restore();
      L(s.x + 3, s.y + 3, 34, '#8fdcff', 0.8, 11);
    }
    for (const b of w.bullets) {
      const spr = SPR[b.spr], sc = Math.max(1, b.w / 4);
      drawSpr(ctx, spr, b.x + b.w / 2 - spr.w * sc / 2, b.y + b.h / 2 - spr.h * sc / 2, false, sc);
      if (b.spr === 'pollenBall') L(b.x + 2, b.y + 2, 16, '#ffd23f', 0.5, 6);
    }

    // particles
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const pt of w.particles) {
        if (!!pt.add !== !!pass) continue;
        const k = pt.life / pt.max;
        ctx.globalAlpha = Math.max(0, Math.min(1, k * 2)) * (pt.amb ? Math.min(1, (1 - k) * 6) * 0.75 : 1);
        ctx.fillStyle = pt.col;
        const x = Math.round(pt.x * 2) / 2, y = Math.round(pt.y * 2) / 2;
        if (pt.shape === 'ring') {
          const r = pt.r * (1 - k * k);
          for (let a = 0; a < 16; a++) ctx.fillRect(x + Math.cos(a * 0.3927) * r, y + Math.sin(a * 0.3927) * r * 0.8, 1, 1);
        } else if (pt.shape === 'star') { ctx.fillRect(x - 1, y, 2.5, 0.5); ctx.fillRect(x, y - 1, 0.5, 2.5); }
        else if (pt.shape === 'leaf') { if ((pt.life >> 3) & 1) ctx.fillRect(x, y, 2, 1); else ctx.fillRect(x, y, 1, 2); }
        else if (pt.len) { if (pt.vert) ctx.fillRect(x, y, 0.5, pt.len); else ctx.fillRect(x, y, pt.len, 0.5); }
        else ctx.fillRect(x, y, pt.size, pt.size);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // bloom halos for everything that glows
    if (hi) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.setTransform(RES, 0, 0, RES, 0, 0);
      for (const l of lights) if (l.bloom) { ctx.globalAlpha = Math.min(1, l.a * 0.8); const r = l.bloom; ctx.drawImage(glow(l.col, 32, 0.6), l.x - r, l.y - r, r * 2, r * 2); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(RES, 0, 0, RES, -cx * RES, -cy * RES);
    }

    for (const f of w.floaters) {
      ctx.globalAlpha = Math.min(1, f.life / 20);
      FONT.draw(ctx, f.text, f.x, f.y, f.col, { shadow: '#000' });
    }
    ctx.globalAlpha = 1;

    const tgt = w.interactTarget();
    if (tgt && !this.dialog && !this.riddle) {
      const bob = Math.round(Math.sin(this.t * 0.15) * 2);
      this.pill(tgt.x + 1.5, tgt.y - 22 + bob, 13, 11);
      FONT.draw(ctx, '↑', tgt.x + 5.5, tgt.y - 20 + bob, '#ffe680');
    }
    ctx.restore();

    // lighting / atmosphere
    if (hi && T.amb) lightPass(ctx, T.amb, lights, w.bg.flash || 0);
    else if (w.bg.flash) { ctx.fillStyle = `rgba(255,255,255,${w.bg.flash * 0.25})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (hi && (w.def.theme === 'meadow' || w.def.theme === 'hills')) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07; ctx.fillStyle = '#fff4c0';
      for (let i = 0; i < 5; i++) {
        const x = ((i * 110 - cx * 0.12) % 560 + 560) % 560 - 60, sw = Math.sin(t * 0.01 + i) * 6;
        ctx.beginPath(); ctx.moveTo(x + 60, 0); ctx.lineTo(x + 92 + sw, 0); ctx.lineTo(x + 10 + sw, VIEW_H); ctx.lineTo(x - 46, VIEW_H); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (hi) vignette(ctx);

    // iris-in transition centred on Pichonkun
    if (this.iris > 0 && this.state === 'play') {
      const k = 1 - this.iris / 45, r = k * k * 300 + 2;
      ctx.fillStyle = '#05081e';
      ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H); ctx.arc(p.x + 5 - cx, p.y + 6 - cy, r, 0, Math.PI * 2, true); ctx.fill('evenodd');
    }
    if (p.dead && p.deadT > 20) {
      ctx.fillStyle = `rgba(5,8,30,${Math.min(0.85, (p.deadT - 20) / 45)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      FONT.draw(ctx, 'SPLASH! TRY AGAIN!', VIEW_W / 2, VIEW_H / 2 - 6, '#5fd4ff', { align: 'center', scale: 2, shadow: '#0d1b5e' });
    }
  };

  G.drawExit = function (w, L) {
    const ctx = this.ctx, e = w.exit;
    const open = !w.boss || w.bossDefeated;
    const spr = SPR.exit[open ? 1 : 0];
    const x = e.x + 8 - spr.w / 2, y = e.y + 32 - spr.h;
    drawSpr(ctx, spr, x, y);
    if (open) {
      L(e.x + 8, e.y + 16, 96, '#bff4ff', 1, 34);
      for (let i = 0; i < 6; i++) {
        const yy = e.y + 30 - ((w.t * 0.5 + i * 6) % 30);
        ctx.fillStyle = i % 2 ? '#ffffff' : '#bff4ff'; ctx.globalAlpha = 0.8;
        ctx.fillRect(e.x + 2 + ((i * 5) % 12), Math.round(yy * 2) / 2, 0.5, 3);
      }
      ctx.globalAlpha = 1;
      if (w.t % 5 === 0) w.particles.push({ x: e.x + Math.random() * 16, y: e.y + 28, vx: (Math.random() - 0.5) * 0.3, vy: -0.7, life: 50, max: 50, col: '#ffffff', size: 1, amb: true, add: true });
      const bob = Math.round(Math.sin(w.t * 0.08) * 1.5);
      this.pill(e.x - 7, e.y - 19 + bob, 30, 11);
      FONT.draw(ctx, 'EXIT', e.x + 8, e.y - 17 + bob, '#bff4ff', { align: 'center' });
    } else L(e.x + 8, e.y + 2, 20, '#ff3a2a', 0.6, 6);
  };

  G.drawObject = function (o, w, L) {
    const ctx = this.ctx, t = w.t;
    switch (o.type) {
      case 'drop': {
        const bob = Math.sin(o.t * 0.08) * 2;
        drawSpr(ctx, SPR.drop[(o.t >> 3) % 4], o.x, o.y + bob);
        L(o.x + 4, o.y + 5 + bob, 26, '#7fd8ff', 0.55, 9);
        break;
      }
      case 'crystal': {
        if (o.hidden) break;
        const bob = Math.sin(o.t * 0.07) * 2;
        drawSpr(ctx, SPR.crystal[(o.t >> 3) % 8 < 4 ? (o.t >> 3) % 4 : 0], o.x - 0.5, o.y - 1 + bob);
        L(o.x + 5, o.y + 6 + bob, 40, '#ffd84a', 0.75, 14);
        if (o.t % 22 === 0) w.particles.push({ x: o.x + 5 + (Math.random() - 0.5) * 12, y: o.y + 6 + (Math.random() - 0.5) * 12, vx: 0, vy: -0.25, life: 24, max: 24, col: '#fff8c8', size: 1, shape: 'star', add: true });
        break;
      }
      case 'heart': {
        const s = 1 + Math.sin(o.t * 0.12) * 0.1;
        drawSpr(ctx, SPR.heart, o.x + 4 - 4.5 * s, o.y + 3.5 - 4 * s, false, s);
        L(o.x + 4, o.y + 3, 34, '#ff7a9a', 0.7, 12);
        break;
      }
      case 'power': {
        const bob = Math.sin(o.t * 0.06) * 3, spr = SPR.power[(o.t >> 4) % 2];
        drawSpr(ctx, spr, o.x + 6 - spr.w / 2, o.y + 6 - spr.h / 2 + bob);
        L(o.x + 6, o.y + 6 + bob, 80, '#ffffff', 1, 26);
        if (t % 6 === 0) w.particles.push({ x: o.x + 6 + (Math.random() - 0.5) * 22, y: o.y + 6 + (Math.random() - 0.5) * 18, vx: 0, vy: -0.25, life: 30, max: 30, col: '#ffffff', size: 1, shape: 'star', add: true });
        this.pill(o.x - 26, o.y - 20 + bob, 64, 11);
        FONT.draw(ctx, 'VAPOR JUMP', o.x + 6, o.y - 18 + bob, '#ffffff', { align: 'center' });
        break;
      }
      case 'checkpoint': {
        const spr = SPR.checkpoint[o.active ? 1 + ((t >> 3) % 4) : 0];
        drawSpr(ctx, spr, o.x - 1, o.y + 16 - spr.h);
        if (o.active) L(o.x + 8, o.y, 50, '#8fdcff', 0.8, 14);
        break;
      }
      case 'sign': drawSpr(ctx, SPR.sign, o.x - 1, o.y + 10 - SPR.sign.h); break;
      case 'terminal': {
        const solved = w.riddles[o.ri].solved, spr = SPR.terminal[solved ? 2 : (t >> 5) % 2];
        drawSpr(ctx, spr, o.x - 1, o.y + 16 - spr.h);
        L(o.x + 8, o.y, solved ? 30 : 44, solved ? '#7cff4f' : '#5ff4ff', 0.75, solved ? 8 : 14);
        break;
      }
      case 'lever': {
        const spr = SPR.lever[o.on ? 1 : 0];
        drawSpr(ctx, spr, o.x - 1, o.y + 10 - spr.h);
        const tw = FONT.measure(o.label) + 6;
        this.pill(o.x + 8 - tw / 2, o.y - 16, tw, 11);
        FONT.draw(ctx, o.label, o.x + 8, o.y - 14, o.on ? '#7cff4f' : '#ffe680', { align: 'center' });
        break;
      }
      case 'spring': { const spr = SPR.spring[o.pressed ? 1 : 0]; drawSpr(ctx, spr, o.x - 0.5, o.y + 16.5 - spr.h); break; }
      case 'npc': {
        const spr = SPR[PORTRAITS[o.who].spr];
        const bob = Math.round(Math.sin(o.t * 0.07) * 1.5) * 0.5;
        ctx.fillStyle = 'rgba(0,0,20,0.28)'; ctx.fillRect(o.x + 2, o.y + 15.5, 12, 1.5);
        drawSpr(ctx, spr, o.x + 8 - spr.w / 2, o.y + 16 - spr.h + (spr.oy || 0) + bob - (o.who === 'granny' || o.who === 'bee' ? 5 : 0), w.player.x < o.x);
        L(o.x + 8, o.y + 4, 46, '#fff0d0', 0.6, 0);
        if (!o.talked) { const b2 = Math.round(Math.sin(t * 0.15) * 2); this.pill(o.x + 2, o.y - 24 + b2, 12, 11); FONT.draw(ctx, '!', o.x + 5.5, o.y - 22 + b2, '#ffe680'); }
        break;
      }
    }
  };

  G.drawBoss = function (b, w, L) {
    const ctx = this.ctx;
    const frames = SPR[b.spr], spr = frames[Math.floor(b.t / 10) % frames.length];
    const img = b.flash > 0 && (b.flash & 1) ? whiteOf(spr) : spr;
    let sy = b.y + b.h - spr.h + (spr.oy || 0);
    if (b.kind === 'dustbaron' && b.state === 'crouch') sy += 2;
    if (b.kind !== 'smogmaw') { ctx.fillStyle = 'rgba(0,0,20,0.3)'; ctx.fillRect(b.x + 2, b.y + b.h - 0.5, b.w - 4, 2); }
    else {
      L(b.x + b.w / 2, b.y + b.h / 2, 120, '#ff5a3a', 0.7, 0);
      if (w.t % 3 === 0) w.particles.push({ x: b.x + Math.random() * b.w, y: b.y + b.h - 6, vx: (Math.random() - 0.5) * 0.5, vy: 0.5, life: 44, max: 44, col: '#2a2a34', size: 2 });
    }
    drawSpr(ctx, img, b.x + b.w / 2 - spr.w / 2, sy, b.dir > 0);
  };

  // =================================================================== UI
  // rounded panel with a soft drop shadow
  G.panel = function (x, y, w, h, alpha = 0.94) {
    const ctx = this.ctx;
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = 'rgba(0,0,10,0.35)'; ctx.fillRect(x + 2, y + 3, w, h);
    ctx.globalAlpha = alpha;
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, '#1c2f86'); gr.addColorStop(0.5, '#122064'); gr.addColorStop(1, '#0a1244');
    ctx.fillStyle = gr; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#5fd4ff';
    ctx.fillRect(x + 2, y, w - 4, 1); ctx.fillRect(x + 2, y + h - 1, w - 4, 1); ctx.fillRect(x, y + 2, 1, h - 4); ctx.fillRect(x + w - 1, y + 2, 1, h - 4);
    ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + w - 2, y + 1, 1, 1); ctx.fillRect(x + 1, y + h - 2, 1, 1); ctx.fillRect(x + w - 2, y + h - 2, 1, 1);
    ctx.fillStyle = 'rgba(181,236,252,0.35)'; ctx.fillRect(x + 3, y + 1.5, w - 6, 0.5);
    ctx.fillStyle = '#0d1b5e';
    ctx.fillRect(x + 2, y - 1, w - 4, 1); ctx.fillRect(x + 2, y + h, w - 4, 1); ctx.fillRect(x - 1, y + 2, 1, h - 4); ctx.fillRect(x + w, y + 2, 1, h - 4);
  };
  // small dark pill behind in-world labels
  G.pill = function (x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(6,10,40,0.78)';
    ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
  };

  G.drawHUD = function () {
    const ctx = this.ctx, w = this.world, p = w.player;
    const pw = 112 + (p.canDouble ? 14 : 0);
    this.pill(4, 4, pw, 15);
    ctx.fillStyle = 'rgba(95,212,255,0.5)'; ctx.fillRect(6, 4, pw - 4, 0.5);
    for (let i = 0; i < p.maxHp; i++) {
      const beat = (i < p.hp && p.hp === 1) ? 1 + Math.sin(this.t * 0.3) * 0.12 : 1;
      drawSpr(ctx, i < p.hp ? SPR.heart : SPR.heartEmpty, 8 + i * 11 + 4.5 * (1 - beat), 7.5 + 4 * (1 - beat), false, beat);
    }
    ctx.fillStyle = 'rgba(95,212,255,0.35)'; ctx.fillRect(43, 7, 0.5, 9);
    drawSpr(ctx, SPR.drop[(this.t >> 4) % 4], 47, 6);
    FONT.draw(ctx, `${w.drops}/${w.dropsTotal}`, 57, 8, w.drops === w.dropsTotal ? '#ffe680' : '#d4f2ff', { shadow: '#061040' });
    for (let i = 0; i < w.crystalTotal; i++) drawSpr(ctx, i < this.run.crystals.length ? SPR.crystalIcon : SPR.crystalEmpty, 88 + i * 8, 7.5);
    if (p.canDouble) drawSpr(ctx, SPR.power[0], 116, 8.5, false, 0.5);

    if (w.hard) { this.pill(4, 21, 30, 12); FONT.draw(ctx, 'HARD', 8, 23, '#ff7a6a', { shadow: '#3a0606' }); }

    // score + combo meter
    const sc = String(this.run.score).padStart(6, '0'), sw = FONT.measure(sc) + 12, sx = Math.round(VIEW_W / 2 - sw / 2) + 14;
    this.pill(sx, 4, sw, 15);
    ctx.fillStyle = 'rgba(255,224,96,0.5)'; ctx.fillRect(sx + 2, 4, sw - 4, 0.5);
    FONT.draw(ctx, sc, sx + 6, 8 - (this.scorePop > 8 ? 1 : 0), this.scorePop > 0 ? '#ffe680' : '#ffffff', { shadow: '#061040' });
    if (w.combo >= 2 && w.comboT > 0) {
      const txt = `COMBO X${Math.min(SCORE.comboMax, w.combo)}`, cw = FONT.measure(txt) + 10, bx = Math.round(sx + sw / 2 - cw / 2);
      this.pill(bx, 21, cw, 14);
      FONT.draw(ctx, txt, bx + 5, 24, Math.floor(this.t / 4) % 2 ? '#ffe680' : '#ffb040', { shadow: '#3a1a00' });
      ctx.fillStyle = '#ffe680'; ctx.fillRect(bx + 3, 33, (cw - 6) * w.comboT / SCORE.comboFrames, 1);
    }

    const name = `${w.idx + 1}. ${w.def.name}`, nw = FONT.measure(name) + 10;
    this.pill(VIEW_W - nw - 4, 4, nw, 15);
    ctx.fillStyle = 'rgba(95,212,255,0.5)'; ctx.fillRect(VIEW_W - nw - 2, 4, nw - 4, 0.5);
    FONT.draw(ctx, name, VIEW_W - 9, 8, '#ffffff', { align: 'right', shadow: '#061040' });

    // boss bar
    if (w.boss && w.bossActive && !w.boss.dead) {
      const b = w.boss, bw = 170, bx = VIEW_W / 2 - bw / 2, by = VIEW_H - 15;
      this.pill(bx - 5, by - 14, bw + 10, 25);
      FONT.draw(ctx, BOSS_INFO[b.kind].name, VIEW_W / 2, by - 11, '#ffb0a0', { align: 'center', shadow: '#3a0606' });
      ctx.fillStyle = '#12040a'; ctx.fillRect(bx - 1, by - 1, bw + 2, 8);
      const k = Math.max(0, b.hp / b.maxHp);
      const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      gr.addColorStop(0, '#ff2a2a'); gr.addColorStop(1, '#ffb040');
      ctx.fillStyle = gr; ctx.fillRect(bx, by, bw * k, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(bx, by, bw * k, 1.5);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx, by + 4.5, bw * k, 1.5);
      ctx.fillStyle = '#12040a'; for (let i = 1; i < b.maxHp; i++) ctx.fillRect(bx + bw * i / b.maxHp - 0.25, by, 0.5, 6);
      if (b.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(bx, by, bw * k, 6); }
    }

    // sign reading
    const sign = w.objects.find(o => o.type === 'sign' && o.near);
    if (sign && !this.dialog) {
      const lines = FONT.wrap(sign.text.toUpperCase(), 54);
      const h = lines.length * 10 + 10;
      this.panel(22, 26, VIEW_W - 44, h, 0.92);
      lines.forEach((l, i) => FONT.draw(ctx, l, 30, 32 + i * 10, '#ffe680', { shadow: '#061040' }));
    }
  };

  G.drawSaveIcon = function () {
    const ctx = this.ctx;
    ctx.globalAlpha = Math.min(1, this.saveFlash / 30);
    const label = this.saveLabel.startsWith('GRAPHICS') ? this.saveLabel : 'SAVED: ' + this.saveLabel;
    const bw = FONT.measure(label) + 22, x = VIEW_W - bw - 4, y = 23;
    this.pill(x, y, bw, 14);
    ctx.fillStyle = '#1565d8'; ctx.fillRect(x + 4, y + 2, 10, 10);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 6, y + 2, 6, 4);
    ctx.fillStyle = '#0d1b5e'; ctx.fillRect(x + 10, y + 2.5, 1.5, 3);
    ctx.fillStyle = '#b4c4d8'; ctx.fillRect(x + 6, y + 8, 6, 4);
    FONT.draw(ctx, label, x + 17, y + 4, '#7cff4f', { shadow: '#061040' });
    ctx.globalAlpha = 1;
  };

  function portraitScale(spr) { for (const s of [2, 1.5, 1, 0.5]) if (spr.w * s <= 44 && spr.h * s <= 44) return s; return 0.5; }

  G.drawDialog = function () {
    const ctx = this.ctx, d = this.dialog;
    const line = d.lines[d.i];
    const P = PORTRAITS[line.who] || PORTRAITS.narrator;
    // during play the box moves to the top when it would cover Pichonkun and whoever is talking
    const wd = this.world, low = wd && this.state === 'play' && wd.player.y - wd.cam.y > VIEW_H / 2 - 20;
    const x = 8, h = 64, y = low ? 24 : VIEW_H - h - 6, w = VIEW_W - 16;
    this.panel(x, y, w, h);
    let tx = x + 9;
    let spr = P.spr ? SPR[P.spr] : null;
    let name = P.name;
    if (line.who === 'boss' && this.world && this.world.boss) { spr = SPR[this.world.boss.spr]; name = BOSS_INFO[this.world.boss.kind].name; }
    if (Array.isArray(spr)) spr = spr[line.who === 'pichon' ? Math.floor(this.t / 9) % spr.length : Math.floor(this.t / 12) % spr.length];
    if (spr) {
      const gr = ctx.createLinearGradient(0, y + 7, 0, y + 55);
      gr.addColorStop(0, '#3a6ad0'); gr.addColorStop(1, '#0c1650');
      ctx.fillStyle = '#0d1b5e'; ctx.fillRect(x + 6, y + 7, 50, 50);
      ctx.fillStyle = gr; ctx.fillRect(x + 7, y + 8, 48, 48);
      ctx.fillStyle = 'rgba(95,212,255,0.7)'; ctx.fillRect(x + 7, y + 8, 48, 0.5);
      const sc = portraitScale(spr);
      drawSpr(ctx, spr, x + 31 - spr.w * sc / 2, y + 32 - spr.h * sc / 2 + (spr.oy || 0) * sc * 0.5, false, sc);
      tx = x + 64;
    }
    const nameCol = line.who === 'boss' ? '#ff7a6a' : P.color;
    if (name) FONT.draw(ctx, name, tx, y + 8, nameCol, { shadow: '#061040' });
    const maxChars = Math.floor((x + w - tx - 10) / FONT.CW);
    const shown = line.text.slice(0, Math.floor(d.chars));
    const lines = FONT.wrap(shown, maxChars);
    const ty = name ? y + 20 : y + 11;
    lines.slice(0, 5).forEach((l, i) => FONT.draw(ctx, l, tx, ty + i * 9, line.who === 'narrator' ? '#ffe680' : '#ffffff', { shadow: '#061040' }));
    if (d.chars >= line.text.length && Math.floor(this.t / 20) % 2) FONT.draw(ctx, '▶', x + w - 13, y + h - 12, '#5fd4ff');
  };

  G.drawRiddle = function () {
    const ctx = this.ctx, r = this.riddle;
    ctx.fillStyle = 'rgba(2,4,20,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const w = 320, x = (VIEW_W - w) / 2;
    const q = FONT.wrap(r.r.q.toUpperCase(), 50);
    const msg = r.msg ? FONT.wrap(r.msg.toUpperCase(), 50) : [];
    const h = 38 + q.length * 10 + r.r.a.length * 15 + msg.length * 10 + 12;
    const y = Math.round((VIEW_H - h) / 2);
    this.panel(x, y, w, h);
    drawSpr(ctx, SPR.terminal[(this.t >> 5) % 2], x + 7, y + 4, false, 1);
    FONT.draw(ctx, 'AIR-Q RIDDLE', x + 30, y + 10, '#7cff4f', { shadow: '#061040' });
    ctx.fillStyle = 'rgba(95,212,255,0.35)'; ctx.fillRect(x + 30, y + 20, w - 42, 0.5);
    q.forEach((l, i) => FONT.draw(ctx, l, x + 12, y + 32 + i * 10, '#ffffff', { shadow: '#061040' }));
    const oy = y + 38 + q.length * 10;
    r.r.a.forEach((a, i) => {
      const sel = i === r.sel;
      ctx.fillStyle = sel ? 'rgba(95,212,255,0.3)' : 'rgba(0,0,30,0.35)';
      ctx.fillRect(x + 11, oy + i * 15 - 3, w - 22, 13); ctx.fillRect(x + 10, oy + i * 15 - 2, w - 20, 11);
      if (sel) { ctx.fillStyle = '#5fd4ff'; ctx.fillRect(x + 10, oy + i * 15 - 2, 1.5, 11); }
      FONT.draw(ctx, (sel ? '▶ ' : '  ') + String.fromCharCode(65 + i) + ') ' + a, x + 17, oy + i * 15, sel ? '#ffe680' : '#b5ecfc', { shadow: '#061040' });
    });
    msg.forEach((l, i) => FONT.draw(ctx, l, x + 12, oy + r.r.a.length * 15 + 3 + i * 10, r.msgCol, { shadow: '#061040' }));
  };

  G.drawMenu = function (items, sel, x, y, w) {
    const ctx = this.ctx;
    items.forEach((it, i) => {
      const s = i === sel;
      if (s) { ctx.fillStyle = 'rgba(95,212,255,0.25)'; ctx.fillRect(x - 5, y + i * 14 - 3, w, 13); ctx.fillStyle = '#5fd4ff'; ctx.fillRect(x - 5, y + i * 14 - 3, 1.5, 13); }
      FONT.draw(ctx, (s ? '▶ ' : '  ') + it, x, y + i * 14, s ? '#ffe680' : '#ffffff', { shadow: '#061040' });
    });
  };

  G.drawPause = function () {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(2,4,20,0.65)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const items = this.pauseItems();
    const w = 210, h = 32 + items.length * 14, x = (VIEW_W - w) / 2, y = 36;
    this.panel(x, y, w, h);
    FONT.draw(ctx, 'PAUSED', VIEW_W / 2, y + 8, '#5fd4ff', { align: 'center', scale: 1, shadow: '#061040' });
    ctx.fillStyle = 'rgba(95,212,255,0.35)'; ctx.fillRect(x + 12, y + 19, w - 24, 0.5);
    this.drawMenu(items, this.pauseSel, x + 20, y + 27, w - 30);
    FONT.draw(ctx, 'ARROWS/WASD MOVE  Z/SPACE JUMP  X/J SHOOT', VIEW_W / 2, y + h + 12, '#b5ecfc', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, 'UP/E TALK + RIDDLES   UP+SHOOT AIM UP   M MUSIC', VIEW_W / 2, y + h + 24, '#b5ecfc', { align: 'center', shadow: '#000' });
  };

  G.drawIntro = function () {
    const ctx = this.ctx, w = this.world;
    const a = Math.min(1, this.introT / 20), slide = (1 - a) * (1 - a);
    ctx.globalAlpha = 0.55 * a; ctx.fillStyle = '#05081e'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = 1;
    // banner
    const by = 52;
    ctx.fillStyle = 'rgba(6,10,44,0.88)'; ctx.fillRect(0, by, VIEW_W, 62);
    ctx.fillStyle = '#5fd4ff'; ctx.fillRect(0, by, VIEW_W, 1); ctx.fillRect(0, by + 61, VIEW_W, 1);
    ctx.fillStyle = 'rgba(95,212,255,0.25)'; ctx.fillRect(0, by + 2, VIEW_W, 0.5); ctx.fillRect(0, by + 59.5, VIEW_W, 0.5);
    FONT.draw(ctx, 'LEVEL ' + (w.idx + 1), VIEW_W / 2 - slide * 300, by + 8, '#5fd4ff', { align: 'center', scale: 2, shadow: '#0d1b5e' });
    FONT.draw(ctx, w.def.name, VIEW_W / 2 + slide * 300, by + 30, '#ffffff', { align: 'center', scale: 3, shadow: '#1565d8' });
    ctx.globalAlpha = a;
    FONT.wrap(w.def.intro.toUpperCase(), 52).forEach((l, i) => FONT.draw(ctx, l, VIEW_W / 2, by + 74 + i * 11, '#ffe680', { align: 'center', shadow: '#000' }));
    if (this.introT > 30 && Math.floor(this.t / 25) % 2) FONT.draw(ctx, 'PRESS Z TO START', VIEW_W / 2, 178, '#ffffff', { align: 'center', shadow: '#000' });
    ctx.globalAlpha = 1;
  };

  G.drawClear = function () {
    const ctx = this.ctx, w = this.world;
    const a = Math.min(1, this.clearT / 30);
    ctx.globalAlpha = 0.72 * a; ctx.fillStyle = '#05081e'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.globalAlpha = a;
    // confetti of droplets
    for (let i = 0; i < 26; i++) {
      const x = (i * 53 + Math.sin(this.t * 0.02 + i) * 10) % VIEW_W, y = ((this.t * (0.5 + (i % 5) * 0.14) + i * 41) % (VIEW_H + 20)) - 10;
      drawSpr(ctx, SPR.drop[(i + (this.t >> 3)) % 4], x, y, false, i % 3 ? 0.5 : 1);
    }
    const ty = this.tally, T = this.clearT;
    FONT.draw(ctx, 'LEVEL CLEAR!', VIEW_W / 2, 8 + Math.sin(this.t * 0.08) * 1.5, '#7cff4f', { align: 'center', scale: 2, shadow: '#0d3b0e' });
    FONT.draw(ctx, w.def.name, VIEW_W / 2, 29, '#ffffff', { align: 'center', shadow: '#000' });
    // tally: one line appears every few frames, then the total counts up
    const n = ty.lines.length, lx = 22, lw = 214, top = 42, step = 12, shown = Math.min(n, Math.floor((T - 20) / 10));
    this.panel(lx, top, lw, n * step + 32);
    ty.lines.forEach((l, i) => {
      if (i >= shown) return;
      FONT.draw(ctx, l[0], lx + 10, top + 7 + i * step, i ? '#b5ecfc' : '#ffffff', { shadow: '#061040' });
      FONT.draw(ctx, (i ? '+' : '') + l[1], lx + lw - 10, top + 7 + i * step, l[1] ? '#ffe680' : '#6a78b0', { align: 'right', shadow: '#061040' });
    });
    const doneAt = 20 + n * 10, k = Math.max(0, Math.min(1, (T - doneAt) / 40));
    ctx.fillStyle = 'rgba(95,212,255,0.5)'; ctx.fillRect(lx + 8, top + n * step + 6, lw - 16, 1);
    if (T > doneAt) {
      FONT.draw(ctx, 'TOTAL', lx + 10, top + n * step + 13, '#ffffff', { scale: 2, shadow: '#061040' });
      FONT.draw(ctx, String(Math.round(ty.total * k)), lx + lw - 10, top + n * step + 13, '#ffe680', { align: 'right', scale: 2, shadow: '#3a1a00' });
    }
    // rank card
    const rx = 246, rw = 116, final = T > doneAt + 45;
    this.panel(rx, top, rw, 104);
    FONT.draw(ctx, 'RANK', rx + rw / 2, top + 6, '#b5ecfc', { align: 'center', shadow: '#061040' });
    if (final) {
      const pop = Math.max(0, 1 - (T - doneAt - 45) / 10), RC = { S: '#ffe060', A: '#7cff4f', B: '#5fd4ff', C: '#ffffff', D: '#9aa6c8' };
      FONT.draw(ctx, ty.rank, rx + rw / 2 + 1, top + 17 - pop * 4, RC[ty.rank], { align: 'center', scale: 5 + Math.round(pop * 2), shadow: '#061040' });
      FONT.draw(ctx, ty.isBest ? 'NEW BEST!' : `BEST ${ty.prev}`, rx + rw / 2, top + 64, ty.isBest && Math.floor(this.t / 10) % 2 ? '#ffe680' : '#ffffff', { align: 'center', shadow: '#061040' });
      for (let i = 0; i < ty.crystalTotal; i++) drawSpr(ctx, i < ty.crystals ? SPR.crystalIcon : SPR.crystalEmpty, rx + rw / 2 - ty.crystalTotal * 5 + i * 10 + 1.5, top + 76);
      drawSpr(ctx, SPR.drop[0], rx + 22, top + 88, false, 0.75); FONT.draw(ctx, `${w.drops}/${w.dropsTotal}`, rx + 31, top + 90, w.drops === w.dropsTotal ? '#ffe680' : '#d4f2ff', { shadow: '#061040' });
      if (ty.combo > 1) FONT.draw(ctx, `X${Math.min(SCORE.comboMax, ty.combo)}`, rx + rw - 14, top + 90, '#ffb040', { align: 'right', shadow: '#061040' });
    } else FONT.draw(ctx, '?', rx + rw / 2 + 1, top + 17, '#3a4a90', { align: 'center', scale: 5 });
    // leaderboard line + eco tip
    if (final) {
      const msg = ty.place >= 0 ? `TOTAL SCORE ${ty.grand}  -  NO. ${ty.place + 1} ON THE LEADERBOARD` : `TOTAL SCORE ${ty.grand}`;
      FONT.draw(ctx, msg, VIEW_W / 2, 152, '#ffe680', { align: 'center', shadow: '#000' });
    }
    this.panel(22, 164, VIEW_W - 44, 34);
    FONT.wrap(w.def.tip.toUpperCase(), 54).slice(0, 3).forEach((l, i) => FONT.draw(ctx, l, 30, 168 + i * 10, '#9cf07c', { shadow: '#061040' }));
    if (this.state === 'clear' && T > 90 && Math.floor(this.t / 25) % 2) FONT.draw(ctx, 'PRESS Z', VIEW_W - 8, 203, '#ffffff', { align: 'right', shadow: '#000' });
    ctx.globalAlpha = 1;
  };

  // leaderboard name entry (typed)
  G.drawName = function () {
    const ctx = this.ctx, e = this.nameEdit;
    if (!e) return;
    ctx.fillStyle = 'rgba(2,4,20,0.72)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.panel(52, 50, 280, 116);
    FONT.draw(ctx, this.tally ? 'YOU MADE THE LEADERBOARD!' : 'LEADERBOARD NAME', VIEW_W / 2, 60, '#ffe680', { align: 'center', shadow: '#061040' });
    FONT.draw(ctx, 'TYPE YOUR NAME', VIEW_W / 2, 73, '#ffffff', { align: 'center', shadow: '#061040' });
    const cw = 28, x0 = VIEW_W / 2 - NAME_MAX * cw / 2;
    for (let i = 0; i < NAME_MAX; i++) {
      const x = x0 + i * cw, ch = e.text[i], cur = i === Math.min(e.text.length, NAME_MAX - 1) && (e.text.length < NAME_MAX);
      ctx.fillStyle = cur ? 'rgba(95,212,255,0.28)' : 'rgba(6,10,40,0.6)'; ctx.fillRect(x + 1, 90, cw - 2, 30);
      ctx.fillStyle = ch ? '#ffe680' : '#5fd4ff'; ctx.fillRect(x + 1, 119, cw - 2, 1.5);
      if (ch && ch !== ' ') FONT.draw(ctx, ch, x + cw / 2 + 1, 97, '#ffffff', { align: 'center', scale: 2, shadow: '#061040' });
      if (cur && Math.floor(this.t / 18) % 2) { ctx.fillStyle = '#ffe680'; ctx.fillRect(x + 8, 111, cw - 16, 2); }
    }
    FONT.draw(ctx, 'ENTER: OK    BACKSPACE: DELETE', VIEW_W / 2, 132, '#b5ecfc', { align: 'center', shadow: '#061040' });
    FONT.draw(ctx, 'TOUCH: ARROWS PICK LETTERS, JUMP = OK', VIEW_W / 2, 148, '#6a78b0', { align: 'center' });
  };

  // achievement / reward banner, slides in under the HUD
  G.drawToast = function () {
    const ctx = this.ctx, o = this.toasts[0];
    const k = Math.min(1, o.t / 12, (210 - o.t) / 12), bw = Math.max(FONT.measure(o.text), FONT.measure(o.title)) + 34;
    const x = Math.round(VIEW_W / 2 - bw / 2), y = Math.round(-30 + k * 54);
    this.panel(x, y, bw, 26);
    drawSpr(ctx, SPR.crystalIcon, x + 7, y + 9 + Math.sin(this.t * 0.2));
    FONT.draw(ctx, o.title, x + 22, y + 5, '#ffe680', { shadow: '#061040' });
    FONT.draw(ctx, o.text, x + 22, y + 15, '#ffffff', { shadow: '#061040' });
  };

  G.drawAwards = function () {
    const ctx = this.ctx, m = this.meta, n = ACHIEVEMENTS.length, rows = Math.ceil(n / 2);
    this.drawScene(0.7);
    FONT.draw(ctx, 'ACHIEVEMENTS', VIEW_W / 2, 6, '#ffe680', { align: 'center', scale: 2, shadow: '#5a2a00' });
    FONT.draw(ctx, `${achCount(m)}/${n}`, VIEW_W - 10, 12, '#ffffff', { align: 'right', shadow: '#000' });
    this.panel(6, 28, VIEW_W - 12, rows * 18 + 8);
    ACHIEVEMENTS.forEach(([id, name, how], i) => {
      const x = 12 + (i >= rows ? 186 : 0), y = 33 + (i % rows) * 18, got = !!m.ach[id];
      drawSpr(ctx, got ? SPR.crystalIcon : SPR.crystalEmpty, x, y + 3);
      FONT.draw(ctx, name, x + 10, y, got ? '#ffe680' : '#8a98c8', { shadow: '#061040' });
      FONT.draw(ctx, how, x + 10, y + 9, got ? '#b5ecfc' : '#5a68a0');
    });
    const next = SKINS.find(s => !m.skins.includes(s[0]));
    FONT.draw(ctx, next ? `NEXT REWARD: ${next[1]} PICHONKUN - ${next[2]}` : 'ALL REWARDS UNLOCKED!', VIEW_W / 2, 203, '#7cff4f', { align: 'center', shadow: '#000' });
  };

  G.drawBoard = function () {
    const ctx = this.ctx, b = this.board || [];
    this.drawScene(0.6);
    FONT.draw(ctx, 'LEADERBOARD', VIEW_W / 2, 8, '#ffe680', { align: 'center', scale: 2, shadow: '#5a2a00' });
    this.panel(72, 32, 240, 158);
    FONT.draw(ctx, 'NO.  NAME    SCORE    LEVELS', 84, 39, '#5fd4ff', { shadow: '#061040' });
    ctx.fillStyle = 'rgba(95,212,255,0.4)'; ctx.fillRect(80, 50, 224, 1);
    for (let i = 0; i < BOARD_SIZE; i++) {
      const e = b[i], y = 55 + i * 13, me = e && e.id === this.save.runId;
      if (me) { ctx.fillStyle = 'rgba(255,224,96,0.2)'; ctx.fillRect(78, y - 2, 228, 12); }
      const col = !e ? '#3a4a90' : me ? (Math.floor(this.t / 12) % 2 ? '#ffe680' : '#ffffff') : i < 3 ? '#ffffff' : '#b5ecfc';
      FONT.draw(ctx, String(i + 1).padStart(2, ' ') + '.', 84, y, i === 0 ? '#ffe060' : col, { shadow: '#061040' });
      FONT.draw(ctx, e ? e.name : '---', 114, y, col, { shadow: '#061040' });
      FONT.draw(ctx, e ? String(e.score) : '-', 210, y, col, { align: 'right', shadow: '#061040' });
      if (e) FONT.draw(ctx, e.npc ? 'RESIDENT' : `${e.cleared}/${LEVELS.length}${e.hard ? ' HARD' : ''}`, 232, y, e.npc ? '#6a78b0' : e.hard ? '#ff9a8a' : col, { shadow: '#061040' });
      if (i === 0 && e) drawSpr(ctx, SPR.crystalIcon, 74, y - 1);
    }
    const mine = totalScore(this.save);
    FONT.draw(ctx, mine ? `YOUR TOTAL: ${mine}   BEST SCORES ON THIS DEVICE` : 'BEST SCORES ON THIS DEVICE', VIEW_W / 2, 195, '#ffffff', { align: 'center', shadow: '#000' });
    if (this.boardT > 20 && Math.floor(this.t / 25) % 2) FONT.draw(ctx, 'PRESS Z', VIEW_W - 8, 205, '#ffffff', { align: 'right', shadow: '#000' });
  };

  // ---------------------------------------------------------------- title
  let LOGO = null;
  function buildLogo() {
    const W = 580, H = 112, sc = 10, text = 'PICHONKUN';
    const mask = GFX.canvas(W, H), mg = mask.getContext('2d');
    mg.imageSmoothingEnabled = false;
    FONT.draw(mg, text, 16, 14, '#ffffff', { scale: sc });
    const fill = GFX.canvas(W, H), fg = fill.getContext('2d');
    fg.drawImage(mask, 0, 0);
    fg.globalCompositeOperation = 'source-in';
    const gr = fg.createLinearGradient(0, 14, 0, 14 + 7 * sc);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, '#b5ecfc'); gr.addColorStop(0.5, '#3cc4f6'); gr.addColorStop(0.52, '#1a8ee8'); gr.addColorStop(1, '#1040b8');
    fg.fillStyle = gr; fg.fillRect(0, 0, W, H);
    const tint = (col) => GFX.silhouette(mask, col);
    const out = GFX.canvas(W, H), og = out.getContext('2d');
    og.drawImage(tint('#030a36'), 6, 12);                                                     // deep shadow
    const navy = tint('#0d1b5e');
    for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-4, -4], [4, -4], [-4, 4], [4, 4], [0, 8], [-4, 8], [4, 8]]) og.drawImage(navy, dx, dy);
    og.drawImage(tint('#1565d8'), 0, 4);                                                       // extruded side
    og.drawImage(fill, 0, 0);
    LOGO = { out, mask, tmp: GFX.canvas(W, H), W, H };
  }
  G.drawLogo = function (cx, y) {
    if (!LOGO) buildLogo();
    const ctx = this.ctx, w = LOGO.W / 2, h = LOGO.H / 2;
    ctx.drawImage(LOGO.out, cx - w / 2, y, w, h);
    // moving shine, clipped to the letters
    const tg = LOGO.tmp.getContext('2d');
    tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, LOGO.W, LOGO.H);
    tg.drawImage(LOGO.mask, 0, 0);
    tg.globalCompositeOperation = 'source-in';
    const sx = ((this.t * 5) % 1500) - 200;
    const gr = tg.createLinearGradient(sx, 0, sx + 90, 60);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    tg.fillStyle = gr; tg.fillRect(0, 0, LOGO.W, LOGO.H);
    ctx.drawImage(LOGO.tmp, cx - w / 2, y, w, h);
  };

  let SCENE = null; // small painted diorama used behind the title/level-select
  function titleScene() {
    if (SCENE) return SCENE;
    const def = { theme: 'meadow', chunks: [[
      '                          ',
      '                          ',
      '                  ----    ',
      '#######                   ',
      '#########                 ',
      '##########################',
      '##########################',
      '##########################',
    ]] };
    const g = buildLevelGrid(def);
    const world = { def, grid: g.grid, W: g.W, H: g.H, objects: [], exit: null };
    const terrain = new TERRAIN.Terrain(world);
    SCENE = { world, terrain, decor: TERRAIN.scatter(world, terrain), bg: BACKDROP.get('meadow') };
    return SCENE;
  }
  G.drawScene = function (dim) {
    const ctx = this.ctx, S = titleScene(), t = this.t;
    BACKDROP.draw(ctx, S.bg, 40, 0, t);
    ctx.save(); ctx.translate(-8, -24);
    for (const d of S.decor) ctx.drawImage(d.p.img, d.x, d.y, d.p.w, d.p.h);
    S.terrain.draw(ctx, 0, 0, VIEW_W + 16);
    ctx.restore();
    if (dim) { ctx.fillStyle = `rgba(4,8,36,${dim})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  };

  G.drawTitle = function () {
    const ctx = this.ctx, t = this.t;
    this.drawScene(0);
    // drifting pollen motes
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) { ctx.globalAlpha = 0.5 + Math.sin(t * 0.03 + i) * 0.3; ctx.fillStyle = '#fff8b0'; ctx.fillRect(((i * 67 - t * (0.15 + (i % 4) * 0.05)) % 400 + 400) % 400 - 8, 60 + ((i * 41) % 130) + Math.sin(t * 0.02 + i * 2) * 6, 1, 1); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // floating drops over the plank + a patrolling pollen
    for (let i = 0; i < 3; i++) { const bob = Math.sin(t * 0.08 + i) * 2; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(glow('#7fd8ff', 9, 0.6), 290 + i * 16 - 5, 92 + bob - 4); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; drawSpr(ctx, SPR.drop[((t >> 3) + i) % 4], 290 + i * 16, 92 + bob); }
    const pol = SPR.pollen[(t >> 3) % 4];
    drawSpr(ctx, pol, 190 + Math.sin(t * 0.02) * 30, 150 + Math.sin(t * 0.05) * 6, Math.cos(t * 0.02) > 0);
    // Pichonkun on the hill
    const hero = (t % 260 > 250) ? SPR.pichon_blink : SPR.pichon_idle[Math.floor(t / 9) % 6];
    ctx.fillStyle = 'rgba(0,0,20,0.3)'; ctx.fillRect(34, 135.5, 30, 2.5);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45; ctx.drawImage(glow('#5fd4ff', 44, 0.5), 49 - 44, 104 - 44); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    drawSpr(ctx, hero, 23, 83, false, 2);
    vignette(ctx);

    const ly = 10 + Math.round(Math.sin(t * 0.04) * 2);
    this.drawLogo(VIEW_W / 2, ly);
    this.pill(VIEW_W / 2 - 88, ly + 57, 176, 12);
    FONT.draw(ctx, 'AND THE CLEAN AIR ADVENTURE', VIEW_W / 2, ly + 60, '#ffffff', { align: 'center', shadow: '#0d1b5e' });

    const items = this.titleItems();
    const mx = 232, my = 96, mh = items.length * 14 + 10;
    this.panel(mx - 12, my - 8, 148, mh, 0.9);
    this.drawMenu(items, this.menu, mx, my, 138);
    if (this.sub === 'mode') {
      this.panel(mx - 12, my + mh - 2, 148, 34, 0.9);
      const hard = items[this.menu] === 'HARD';
      FONT.wrap(hard ? '2 HEARTS, TOUGHER AND FASTER ENEMIES. SCORE X1.5!' : 'THE ADVENTURE AS YOU KNOW IT.', 22).forEach((l, i) => FONT.draw(ctx, l, mx - 5, my + mh + 3 + i * 9, hard ? '#ff9a8a' : '#b5ecfc', { shadow: '#061040' }));
    }
    if (this.sub === 'options') {
      const sk = SKINS.find(s => !this.meta.skins.includes(s[0]));
      // hint for the selected option, bottom left (the menu fills the right side)
      const it = items[this.menu];
      const tip = it.startsWith('WINGMAN') ? 'A GUARDIAN ANGEL FLIES WITH YOU AND SPLASHES NEARBY ENEMIES.'
        : it.startsWith('SKIN') && sk ? `NEXT SKIN: ${sk[1]} - ${sk[2]}`
          : it.startsWith('NAME') ? 'YOUR NAME ON THE LEADERBOARD.' : '';
      if (tip) { this.panel(8, 160, 196, 34, 0.9); FONT.wrap(tip, 30).forEach((l, i) => FONT.draw(ctx, l, 16, 166 + i * 9, '#b5ecfc', { shadow: '#061040' })); }
    }
    if (this.confirmErase) {
      ctx.fillStyle = 'rgba(2,4,20,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      this.panel(60, 80, VIEW_W - 120, 52);
      FONT.draw(ctx, 'START A NEW GAME?', VIEW_W / 2, 90, '#ffe680', { align: 'center', shadow: '#061040' });
      FONT.draw(ctx, 'LEVEL PROGRESS RESTARTS. AWARDS STAY.', VIEW_W / 2, 103, '#ffffff', { align: 'center', shadow: '#061040' });
      FONT.draw(ctx, 'Z / ENTER = YES      X / ESC = NO', VIEW_W / 2, 118, '#b5ecfc', { align: 'center', shadow: '#061040' });
    }
    FONT.draw(ctx, 'ARROWS + Z TO SELECT', 8, VIEW_H - 12, '#ffffff', { shadow: '#061040' });
    if (this.meta.finished && !this.sub) FONT.draw(ctx, this.meta.hardDone ? '* HARD MODE COMPLETED *' : '* GAME COMPLETED *', VIEW_W - 8, VIEW_H - 22, '#ffe680', { align: 'right', shadow: '#061040' });
    if (!this.sub) FONT.draw(ctx, 'V' + GAME_VERSION, VIEW_W - 8, VIEW_H - 12, '#ffffff', { align: 'right', shadow: '#061040' });
  };

  const THEME_TINT = { meadow: '#4cc04a', hills: '#ff9a5a', city: '#8a8aa8', duct: '#5a7ab8', filter: '#c8b070', ice: '#8ad4ff', drain: '#6ab040', compressor: '#f07a30', factory: '#b06a48', sky: '#b08ae8' };
  G.drawLevelSelect = function () {
    const ctx = this.ctx;
    this.drawScene(0.6);
    FONT.draw(ctx, 'LEVEL SELECT', VIEW_W / 2, 12, '#ffffff', { align: 'center', scale: 2, shadow: '#0d1b5e' });
    const bw = 64, bh = 54, gx = (VIEW_W - 5 * bw - 4 * 8) / 2;
    for (let i = 0; i < LEVELS.length; i++) {
      const cx = gx + (i % 5) * (bw + 8), cy = 40 + Math.floor(i / 5) * (bh + 10);
      const locked = i >= this.save.unlocked, sel = i === this.lsSel;
      this.panel(cx, cy, bw, bh, locked ? 0.55 : 0.94);
      if (!locked) { ctx.fillStyle = THEME_TINT[LEVELS[i].theme]; ctx.globalAlpha = 0.9; ctx.fillRect(cx + 2, cy + 2, bw - 4, 3); ctx.globalAlpha = 1; }
      if (sel) { ctx.fillStyle = '#ffe680'; const o = 2 + Math.round(Math.sin(this.t * 0.15)); ctx.fillRect(cx - o, cy - o, bw + o * 2, 1); ctx.fillRect(cx - o, cy + bh + o - 1, bw + o * 2, 1); ctx.fillRect(cx - o, cy - o, 1, bh + o * 2); ctx.fillRect(cx + bw + o - 1, cy - o, 1, bh + o * 2); }
      FONT.draw(ctx, String(i + 1), cx + bw / 2, cy + 8, locked ? '#4a5890' : '#5fd4ff', { align: 'center', scale: 2, shadow: '#061040' });
      if (locked) FONT.draw(ctx, 'LOCKED', cx + bw / 2, cy + 32, '#5a68a0', { align: 'center' });
      else {
        const words = LEVELS[i].name.toUpperCase().split(' ').filter(x => x !== 'THE');
        words.slice(0, 2).forEach((wd, k) => FONT.draw(ctx, wd.slice(0, 10), cx + bw / 2, cy + 26 + k * 9, '#ffffff', { align: 'center', shadow: '#061040' }));
        const best = this.save.best[i];
        if (best !== undefined) { drawSpr(ctx, SPR.drop[0], cx + 5, cy + 43, false, 0.75); FONT.draw(ctx, String(best), cx + 14, cy + 44, '#b5ecfc', { shadow: '#061040' }); }
        const hi = this.save.hi[i], got = (this.save.cry[i] || []).length;
        if (hi) {
          FONT.draw(ctx, hi.rank, cx + bw - 7, cy + 7, { S: '#ffe060', A: '#7cff4f', B: '#5fd4ff', C: '#ffffff', D: '#9aa6c8' }[hi.rank], { align: 'right', shadow: '#061040' });
          for (let k = 0; k < 3; k++) drawSpr(ctx, k < got ? SPR.crystalIcon : SPR.crystalEmpty, cx + bw - 28 + k * 8, cy + 42.5);
        }
      }
    }
    const Lv = LEVELS[this.lsSel];
    FONT.wrap(Lv.intro.toUpperCase(), 58).forEach((l, i) => FONT.draw(ctx, l, VIEW_W / 2, 174 + i * 10, '#ffe680', { align: 'center', shadow: '#000' }));
    const sh = this.save.hi[this.lsSel];
    FONT.draw(ctx, (sh ? `BEST ${sh.score}    ` : '') + 'Z = PLAY    ESC = BACK', VIEW_W / 2, VIEW_H - 11, '#ffffff', { align: 'center', shadow: '#000' });
    const tot = totalScore(this.save);
    if (tot) FONT.draw(ctx, `TOTAL ${tot}`, VIEW_W - 10, 14, '#ffe680', { align: 'right', shadow: '#000' });
  };

  // ---------------------------------------------------------------- story
  let HALL = null;
  function buildHall() {
    const { paint, tone, ramp, sd: S, hash } = GFX;
    const brick = ramp('#3a2a3c', '#5a4258', '#7a5c70', '#a07e8c', '#c8a8ac'), stone = ramp('#7a7a90', '#a0a0b4', '#c8c8d8', '#ececf6'), ac = ramp('#5c6a84', '#8a9ab4', '#bccadc', '#e4ecf6', '#ffffff');
    HALL = paint(300, 330, (x, y, ix, iy) => {
      // AC unit on the roof
      if (y > 20 && y < 104 && x > 62 && x < 238) {
        const b = Math.min(x - 62, 238 - x, y - 20, 104 - y);
        if (b < 2) return tone(ac, 0.05, ix, iy, 0);
        const fd = Math.hypot(x - 190, y - 62);
        if (fd < 34) return fd > 30 ? tone(ac, 0.2, ix, iy, 0) : [18, 24, 44];
        if (x < 146 && y > 32 && y < 92) return (y - 32) % 10 < 5 ? tone(ac, 0.25, ix, iy, 0.3) : tone(ac, 0.7, ix, iy, 0.3);
        return tone(ac, 0.82 - (y - 20) * 0.004 + (b < 5 ? 0.14 : 0), ix, iy, 0.4);
      }
      if (y >= 104 && y < 112 && x > 76 && x < 224 && (x < 96 || x > 204)) return tone(ac, 0.2, ix, iy, 0);
      // town hall: pediment, columns, clock
      const roof = 112 + Math.abs(x - 150) * 0.32;
      if (y > roof && y < 176 && x > 12 && x < 288) {
        const cd = Math.hypot(x - 150, y - 150);
        if (cd < 15) return cd > 12.5 ? tone(stone, 0.15, ix, iy, 0) : (S.seg(x, y, 150, 150, 150, 141, 0.8) < 0 || S.seg(x, y, 150, 150, 156, 153, 0.8) < 0 ? [30, 30, 50] : [250, 246, 230]);
        return tone(stone, y - roof < 4 ? 1 : 0.62 - (y - roof) * 0.004, ix, iy, 0.5);
      }
      if (y >= 176 && x > 20 && x < 280) {
        if (y < 184) return tone(stone, 0.85, ix, iy, 0.3);
        const col = (x - 20) % 52;
        if (col > 18 && col < 34) return tone(stone, 0.9 - (col - 18) * 0.035 + ((x | 0) % 4 === 0 ? -0.12 : 0), ix, iy, 0.4);
        const row = Math.floor(y / 10), bx = (x + (row & 1) * 9) % 18;
        if (y % 10 < 1.5 || bx < 1.5) return tone(brick, 0.05, ix, iy, 0);
        return tone(brick, 0.45 + (hash(((x + (row & 1) * 9) / 18) | 0, row, 3) - 0.5) * 0.3, ix, iy, 0.5);
      }
      return null;
    });
    HALL.fan = (function () { const f = []; for (let i = 0; i < 6; i++) { const rot = i / 6 * (Math.PI * 2 / 3); f.push(paint(60, 60, (x, y, ix, iy) => { const dx = x - 30, dy = y - 30, rr = Math.hypot(dx, dy); if (rr > 28) return null; if (rr < 6) return tone(ac, 0.7, ix, iy, 0); const a = (((Math.atan2(dy, dx) + rot) % 2.094) + 2.094) % 2.094; return a < 0.9 ? tone(ac, 0.3 + a * 0.5, ix, iy, 0.3) : null; })); } return f; })();
  }
  G.drawStory = function () {
    const ctx = this.ctx, t = this.t;
    if (!HALL) buildHall();
    const bg = BACKDROP.get('city');
    BACKDROP.draw(ctx, bg, 60 + t * 0.05, 0, t);
    const x = 117, y = 30;
    ctx.drawImage(HALL, x, y, 150, 165);
    const d = this.dialog, clogged = !d || d.i >= 2;
    ctx.drawImage(HALL.fan[clogged ? 0 : Math.floor(t / 3) % 6], x + 80, y + 16, 30, 30);
    // grille bars
    ctx.fillStyle = '#5c6a84'; for (let i = -12; i <= 12; i += 6) ctx.fillRect(x + 80, y + 30.5 + i, 30, 0.5);
    if (!clogged) { for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(190,240,255,0.7)'; const k = (t * 1.2 + i * 14) % 110; ctx.fillRect(x + 20 + k * 0.1 + (i % 4) * 10, y + 58 + k, 0.5, 5); } }
    // smog rolls in once the story gets there
    if (d && d.i >= 2) {
      const sm = SPR.boss_smogmaw[Math.floor(t / 10) % 4];
      for (let i = 0; i < 9; i++) { ctx.globalAlpha = 0.55; ctx.drawImage(glow('#2c2830', 42, 0.9), ((i * 61 + t * 0.4) % 470) - 50, 10 + (i * 37) % 80); }
      ctx.globalAlpha = 1;
      drawSpr(ctx, sm, 270 + Math.sin(t * 0.03) * 12, 26 + Math.sin(t * 0.05) * 5, false, 1);
    }
    if (d && d.i >= 4) { const hero = SPR.pichon_idle[Math.floor(t / 9) % 6]; drawSpr(ctx, hero, x + 36, y + 22 - Math.abs(Math.sin(t * 0.06)) * 3); }
    vignette(ctx);
  };

  function rainbow(ctx, cx, cy, r) {
    const cols = ['#ff5a5a', '#ffa040', '#ffe060', '#7cff4f', '#5fd4ff', '#8a7aff'];
    ctx.globalAlpha = 0.55;
    cols.forEach((c, i) => {
      ctx.fillStyle = c;
      const rr = r - i * 3;
      for (let a = Math.PI; a < Math.PI * 2; a += 0.006) ctx.fillRect(Math.round((cx + Math.cos(a) * rr) * 2) / 2, Math.round((cy + Math.sin(a) * rr) * 2) / 2, 1.5, 3);
    });
    ctx.globalAlpha = 1;
  }
  G.drawEnding = function () {
    const ctx = this.ctx, t = this.t;
    BACKDROP.draw(ctx, BACKDROP.get('meadow'), 200 + t * 0.2, 0, t);
    rainbow(ctx, VIEW_W / 2, VIEW_H + 30, 190);
    const y = 70 + Math.sin(t * 0.04) * 6;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(glow('#5fd4ff', 56, 0.6), VIEW_W / 2 - 56, y - 40); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    drawSpr(ctx, SPR.pichon_happy, VIEW_W / 2 - 25, y - 44, false, 2);
    drawSpr(ctx, SPR.npc_granny, 50, 36 + Math.sin(t * 0.03) * 3, false, 2);
    drawSpr(ctx, SPR.npc_leafa, 296, 76 + Math.sin(t * 0.05) * 3, true, 2);
    drawSpr(ctx, SPR.npc_bee, 250 + Math.sin(t * 0.04) * 14, 36 + Math.sin(t * 0.09) * 5, true, 1);
    drawSpr(ctx, SPR.npc_frosty, 72, 120 + Math.sin(t * 0.045) * 2, false, 1.5);
    drawSpr(ctx, SPR.npc_mesh, 20, 126 + Math.sin(t * 0.04 + 1) * 2, false, 1.5);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(190,236,255,0.7)'; ctx.fillRect((i * 47 + t * 0.3) % VIEW_W, (i * 71 + t * 2.4) % VIEW_H, 0.5, 4); }
    vignette(ctx);
  };
  G.drawCredits = function () {
    const ctx = this.ctx;
    this.drawEnding();
    ctx.fillStyle = 'rgba(4,8,36,0.62)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    FONT.draw(ctx, 'THE END', VIEW_W / 2, 24, '#ffffff', { align: 'center', scale: 4, shadow: '#1565d8' });
    FONT.draw(ctx, 'BREEZEVILLE BREATHES AGAIN!', VIEW_W / 2, 66, '#7cff4f', { align: 'center', shadow: '#000' });
    let total = 0, best = 0;
    LEVELS.forEach((Lv, i) => { best += this.save.best[i] || 0; total += buildLevelGrid(Lv).grid.flat().filter(c => c === 'o').length; });
    this.panel(82, 84, 220, 46);
    FONT.draw(ctx, `FINAL SCORE: ${totalScore(this.save)}`, VIEW_W / 2, 134, '#ffe680', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, `WATER DROPS COLLECTED: ${best} / ${total}`, VIEW_W / 2, 92, '#b5ecfc', { align: 'center', shadow: '#061040' });
    FONT.draw(ctx, `GERMS CLEANED: ${this.stats.kills}`, VIEW_W / 2, 104, '#b5ecfc', { align: 'center', shadow: '#061040' });
    FONT.draw(ctx, `SPLASHES (DEATHS): ${this.stats.deaths}`, VIEW_W / 2, 116, '#b5ecfc', { align: 'center', shadow: '#061040' });
    FONT.draw(ctx, 'THANK YOU FOR PLAYING PICHONKUN!', VIEW_W / 2, 150, '#ffe680', { align: 'center', shadow: '#000' });
    FONT.draw(ctx, 'KEEP YOUR FILTERS CLEAN AND YOUR AIR FRESH.', VIEW_W / 2, 162, '#ffffff', { align: 'center', shadow: '#000' });
    if (this.creditT > 120 && Math.floor(this.t / 25) % 2) FONT.draw(ctx, 'PRESS Z', VIEW_W / 2, 190, '#ffffff', { align: 'center', shadow: '#000' });
  };
})();
