// Backdrops: multi-layer parallax scenery, painted procedurally per theme,
// with animated elements (clouds, fans, smoke, lightning, blinking lights...).
'use strict';
const BACKDROP = (() => {
  const { ramp, tone, hash, vnoise, fbm, clamp, paint, canvas, sd: S, bayer, rgb, mixc, sphereLight } = GFX;
  const LW = 640, DW = LW * 2, DH = 432; // layer size: logical width / art px
  const VW = 384, VH = 216;

  // ---------------------------------------------------------- helpers
  function sky(stops, bands = 20, extra) {
    const st = stops.map(([t, c]) => [t, rgb(c)]);
    return paint(VW * 2, DH, (x, y, ix, iy) => {
      const t = clamp(Math.floor((y / DH) * bands + bayer(ix, iy)) / bands);
      let i = 0;
      while (i < st.length - 2 && t > st[i + 1][0]) i++;
      const c = mixc(st[i][1], st[i + 1][1], clamp((t - st[i][0]) / (st[i + 1][0] - st[i][0])));
      return extra ? extra(x, y, c, ix, iy) : c;
    });
  }
  // periodic noise so layers tile seamlessly
  const pnoise = (x, seed, freq, oct = 4) => { const a = x / DW * Math.PI * 2; return fbm(Math.cos(a) * freq + 50, Math.sin(a) * freq + 50, oct, seed); };

  function ridge(o) {
    const h = new Float32Array(DW);
    for (let x = 0; x < DW; x++) {
      let v = o.base - (pnoise(x, o.seed, o.freq) - 0.5) * 2 * o.amp;
      if (o.detail) v -= (pnoise(x, o.seed + 9, o.freq * 5, 2) - 0.5) * o.detail;
      if (o.trees) {
        let tp = 0;
        for (const [w, off] of [[o.trees.w, 0], [o.trees.w * 1.37, 5]]) {
          const cell = Math.floor((x + off) / w), cxp = (cell + 0.3 + hash(cell, 1, o.seed) * 0.4) * w - off;
          const th = o.trees.h * (0.45 + hash(cell, 2, o.seed) * 0.55);
          const k = 1 - Math.abs(x - cxp) / (w * 0.5);
          if (k > 0) tp = Math.max(tp, o.trees.round ? th * Math.sqrt(k) : th * k - ((x | 0) % 3 === 0 ? 1.5 : 0));
        }
        v -= tp;
      }
      h[x] = v;
    }
    const c = paint(DW, DH, (x, y, ix, iy) => {
      const hh = h[ix];
      if (y < hh) return null;
      const depth = y - hh;
      const slope = h[(ix + 4) % DW] - h[(ix + DW - 4) % DW];
      let t = 0.52 + clamp(slope * (o.light || 0.03), -0.28, 0.28) * clamp(1 - depth / (o.lightDepth || 400)) - depth / (o.fade || 320);
      if (depth < 2.5) t += 0.2;
      t += (hash(ix >> 1, iy >> 1, o.seed) - 0.5) * (o.tex === undefined ? 0.1 : o.tex);
      if (o.strata) t += (Math.sin((y + pnoise(x, 3, 8, 2) * 60) / o.strata) > 0.6 ? -0.1 : 0);
      if (o.snow && depth < (o.snow - (hh - o.snowTop) * 0.35) * (0.5 + pnoise(x, o.seed + 4, 40, 2))) return tone(o.snowRamp || ramp('#b8cce8', '#dce8f8', '#ffffff'), 0.5 + clamp(slope * 0.1, -0.5, 0.5), ix, iy, 0.5);
      let col = tone(o.ramp, t, ix, iy, 0.7);
      if (o.haze) col = mixc(col, o.haze, clamp((y - (o.hazeFrom || 200)) / (DH - (o.hazeFrom || 200))) * (o.hazeAmt || 0.6));
      if (o.dots && depth > 3 && hash(ix >> 1, iy >> 1, 77) > 1 - o.dots.p * clamp(depth / 30)) return o.dots.cols[(hash(ix >> 1, iy >> 1, 5) * o.dots.cols.length) | 0];
      return col;
    });
    c.h = h;
    return c;
  }
  function puffCloud(w, h, seed, rmp, flat = true) {
    const puffs = [];
    const n = 4 + ((hash(seed, 1) * 4) | 0);
    for (let i = 0; i < n; i++) puffs.push([w * (0.16 + 0.68 * (i / (n - 1))), h * (0.62 - Math.sin(i / (n - 1) * Math.PI) * 0.26 + (hash(seed, i, 2) - 0.5) * 0.14), h * (0.24 + Math.sin(i / (n - 1) * Math.PI) * 0.2 + hash(seed, i, 3) * 0.08)]);
    return paint(w, h, (x, y, ix, iy) => {
      if (flat && y > h * 0.8) return null;
      let d = 99, bl = 0;
      for (const [a, b, r] of puffs) { const dd = S.circle(x, y, a, b, r); if (dd < d) { d = dd; bl = sphereLight(x, y, a, b, r * 1.2, 0.2, -0.85); } }
      if (d > 0) return null;
      return tone(rmp, bl * 0.9 + 0.12 - (y / h) * 0.2, ix, iy, 0.7);
    });
  }
  function treeSpr(size, rmp, seed, pine) {
    const W = Math.ceil(size * (pine ? 0.62 : 1.0)), H = Math.ceil(size * 1.25);
    return paint(W, H, (x, y, ix, iy) => {
      const cx = W / 2;
      if (pine) {
        const k = y / (H * 0.86);
        if (k < 1) {
          const tier = (k * 4) % 1, half = (0.14 + k * 0.86) * W * 0.5 * (0.62 + tier * 0.38);
          if (Math.abs(x - cx) < half) return tone(rmp, 0.5 + (cx - x) / W * 0.6 - tier * 0.25 + (hash(ix, iy, seed) - 0.5) * 0.2, ix, iy, 0.6);
        }
      } else {
        let d = 99;
        for (let i = 0; i < 5; i++) d = Math.min(d, S.circle(x, y, cx + (hash(seed, i, 1) - 0.5) * W * 0.5, H * 0.38 + (hash(seed, i, 2) - 0.5) * H * 0.3, W * (0.22 + hash(seed, i, 3) * 0.12)));
        if (d < 0) { const w = GFX.worley(x / 4.5, y / 4.5, seed); return tone(rmp, 0.8 - y / H * 0.75 + (cx - x) / W * 0.3 + (0.4 - w.d1) * 0.4, ix, iy, 0.6); }
      }
      if (Math.abs(x - cx) < Math.max(1, size * 0.05) && y > H * 0.55) return [70, 44, 30];
      return null;
    });
  }
  // draw an image so it repeats every `period` logical px
  function wrap(ctx, img, x, y, w, h, period = LW) {
    let xx = ((x % period) + period) % period;
    if (xx + w > period) ctx.drawImage(img, xx - period, y, w, h);
    if (xx < VW) ctx.drawImage(img, xx, y, w, h);
    else if (xx - period + w > 0) ctx.drawImage(img, xx - period, y, w, h);
  }
  function fanFrames(r, rmp, blades = 4, n = 6) {
    const out = [];
    for (let f = 0; f < n; f++) {
      const rot = f / n * (Math.PI * 2 / blades);
      out.push(paint(r * 2, r * 2, (x, y, ix, iy) => {
        const dx = x - r, dy = y - r, rr = Math.hypot(dx, dy);
        if (rr > r - 1) return null;
        if (rr < r * 0.2) return tone(rmp, 0.65 + (-dx - dy) / r, ix, iy, 0.3);
        const a = (((Math.atan2(dy, dx) + rot) % (Math.PI * 2 / blades)) + Math.PI * 2 / blades) % (Math.PI * 2 / blades);
        const wd = 0.26 + (rr / r) * 0.5;
        if (a < wd) return tone(rmp, 0.25 + (a / wd) * 0.6, ix, iy, 0.4);
        return null;
      }));
    }
    return out;
  }
  function buildings(o) {
    const c = canvas(DW, DH), g = c.getContext('2d');
    const lights = [], flick = [];
    let x = 0, i = 0;
    while (x < DW) {
      let w = o.minW + hash(i, 1, o.seed) * (o.maxW - o.minW) | 0;
      if (DW - x - w < o.minW) w = DW - x;
      const hgt = o.minH + hash(i, 2, o.seed) * (o.maxH - o.minH) | 0, top = o.base - hgt;
      const shade = hash(i, 3, o.seed);
      const body = o.ramp[1 + ((shade * (o.ramp.length - 2)) | 0)];
      g.fillStyle = GFX.css(body); g.fillRect(x, top, w - 2, DH - top);
      g.fillStyle = GFX.css(o.ramp[0]); g.fillRect(x + w - 2 - Math.max(3, w * 0.12 | 0), top, Math.max(3, w * 0.12 | 0), DH - top);       // shadow side
      g.fillStyle = GFX.css(o.ramp[o.ramp.length - 1]); g.fillRect(x, top, w - 2, 2);                                                       // roof ledge
      g.fillStyle = GFX.css(o.ramp[0]); g.fillRect(x, top + 2, w - 2, 2);
      if (o.win) {
        const ww = o.win.w, wh = o.win.h, gx = o.win.gx, gy = o.win.gy;
        for (let wy = top + 10; wy < DH - 10; wy += gy) for (let wx = x + 5; wx < x + w - 8 - ww; wx += gx) {
          const r = hash(wx, wy, o.seed);
          const lit = r < o.win.lit;
          g.fillStyle = lit ? o.win.cols[(r * 97 | 0) % o.win.cols.length] : GFX.css(o.ramp[0]);
          g.fillRect(wx, wy, ww, wh);
          if (lit) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(wx, wy, ww, 1); if (r < o.win.lit * 0.12) flick.push([wx / 2, wy / 2, ww / 2, wh / 2]); }
          else { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(wx, wy, 1, wh); }
        }
      }
      // rooftop clutter
      const k = hash(i, 5, o.seed);
      if (o.roof) {
        if (k < 0.3) { g.fillStyle = GFX.css(o.ramp[0]); g.fillRect(x + w * 0.3, top - 14, 16, 12); g.fillRect(x + w * 0.3 + 2, top - 2, 2, 2); g.fillRect(x + w * 0.3 + 12, top - 2, 2, 2); g.fillStyle = GFX.css(o.ramp[2]); g.fillRect(x + w * 0.3, top - 16, 16, 2); }
        else if (k < 0.55) { g.fillStyle = GFX.css(o.ramp[0]); g.fillRect(x + w * 0.5, top - 30, 2, 30); g.fillRect(x + w * 0.5 - 4, top - 22, 10, 1); lights.push([(x + w * 0.5) / 2, (top - 31) / 2]); }
        else if (k < 0.75) { g.fillStyle = GFX.css(o.ramp[1]); g.fillRect(x + 6, top - 8, 14, 8); g.fillStyle = GFX.css(o.ramp[0]); g.fillRect(x + 8, top - 6, 6, 4); }
      }
      x += w; i++;
    }
    c.lights = lights; c.flick = flick;
    return c;
  }
  const L = (img, factor, y = 0) => ({ img, factor, y });

  // ---------------------------------------------------------- themes
  const BUILD = {
    meadow() {
      const cloudR = ramp('#a8c8ee', '#cfe2f8', '#eef6ff', '#ffffff');
      const clouds = [0, 1, 2, 3, 4, 5].map(i => ({ img: puffCloud(90 + i * 24, 34 + i * 6, i + 3, cloudR), x: i * 131, y: 14 + (i * 37) % 70, sp: 0.02 + i * 0.008 }));
      const far = ridge({ base: 250, amp: 70, freq: 2.2, detail: 26, seed: 3, ramp: ramp('#6e94d0', '#88aede', '#a6c6ec', '#c6e0f8'), light: 0.05, fade: 500, snow: 22, snowTop: 180, haze: rgb('#c8eaff'), hazeFrom: 250, hazeAmt: 0.75, tex: 0.04 });
      const forest = ridge({ base: 300, amp: 34, freq: 3, seed: 8, lightDepth: 26, ramp: ramp('#2e7a62', '#429a72', '#5eb884', '#84d49a'), trees: { w: 13, h: 22 }, light: 0.02, fade: 260, haze: rgb('#a8e4d8'), hazeFrom: 300, hazeAmt: 0.5 });
      const hills = ridge({ base: 340, amp: 26, freq: 4, seed: 14, lightDepth: 26, ramp: ramp('#2c8a3a', '#46b04a', '#6ad058', '#9ae870'), light: 0.05, fade: 300, tex: 0.07, dots: { p: 0.02, cols: [[255, 255, 255], [255, 220, 90], [255, 160, 210]] } });
      const g = hills.getContext('2d');
      const trees = [0, 1, 2, 3].map(i => treeSpr(34 + i * 10, ramp('#17602c', '#268a36', '#44b448', '#7edc5c'), i + 2, i === 3));
      for (let i = 0; i < 22; i++) { const x = (hash(i, 1, 4) * DW) | 0, t = trees[i % 4]; g.drawImage(t, x, hills.h[x] - t.height + 6); }
      // cottages
      for (let i = 0; i < 4; i++) {
        const x = (120 + i * 330 + hash(i, 2, 2) * 60) | 0, y = (hills.h[x] | 0) - 14;
        g.fillStyle = '#f0e6d0'; g.fillRect(x, y, 26, 18); g.fillStyle = '#c8b898'; g.fillRect(x + 20, y, 6, 18);
        g.fillStyle = '#c84a32'; for (let k = 0; k < 10; k++) g.fillRect(x - 3 + k, y - k, 32 - k * 2, 1);
        g.fillStyle = '#8a2a1c'; g.fillRect(x - 3, y, 32, 2);
        g.fillStyle = '#5a3a1c'; g.fillRect(x + 4, y + 8, 6, 10); g.fillStyle = '#9adcff'; g.fillRect(x + 14, y + 6, 6, 6);
      }
      const near = ridge({ base: 412, amp: 12, freq: 6, seed: 22, lightDepth: 26, ramp: ramp('#1c6e30', '#2e9640', '#4cc050', '#84e468'), trees: { w: 9, h: 7, round: true }, light: 0.04, fade: 200, tex: 0.1 });
      return {
        layers: [
          L(sky([[0, '#2468d8'], [0.35, '#4aa4f4'], [0.7, '#96dcff'], [1, '#e2f8ff']], 22, (x, y, c) => {
            const d = Math.hypot(x - 600, y - 84);
            if (d < 26) return d < 22 ? [255, 250, 210] : [255, 236, 150];
            if (d < 120) return mixc(c, [255, 250, 220], clamp(0.5 - Math.floor(d / 16) * 0.075));
            return c;
          }), 0),
          L(far, 0.03),
          { factor: 0.05, draw(ctx, sx, t) { for (const c of clouds) wrap(ctx, c.img, c.x - sx + t * c.sp, c.y, c.img.width / 2, c.img.height / 2, LW + 100); } },
          L(forest, 0.09), L(hills, 0.2), L(near, 0.42),
        ],
      };
    },
    hills() {
      const cloudR = ramp('#d87a7a', '#f4a488', '#ffd0a4', '#fff0d0');
      const clouds = [0, 1, 2, 3, 4].map(i => ({ img: puffCloud(110 + i * 26, 30 + i * 5, i + 13, cloudR), x: i * 157, y: 20 + (i * 41) % 80, sp: 0.018 + i * 0.006 }));
      const m1 = ridge({ base: 240, amp: 80, freq: 2, detail: 30, seed: 31, ramp: ramp('#8a5aa0', '#a870ae', '#c88cba', '#e8acc4'), light: 0.05, fade: 600, haze: rgb('#ffc8a0'), hazeFrom: 230, hazeAmt: 0.8, tex: 0.04 });
      const m2 = ridge({ base: 290, amp: 50, freq: 3, detail: 16, seed: 37, ramp: ramp('#5e3c84', '#7c4e96', '#a066a6', '#c888b4'), light: 0.05, fade: 420, haze: rgb('#ffb890'), hazeFrom: 290, hazeAmt: 0.6, tex: 0.05 });
      const mid = ridge({ base: 338, amp: 28, freq: 4, seed: 41, lightDepth: 26, ramp: ramp('#4a6a22', '#6c902c', '#96b83c', '#c6dc5c'), light: 0.05, fade: 300, tex: 0.07, dots: { p: 0.08, cols: [[255, 130, 190], [255, 226, 90], [255, 255, 255], [230, 80, 80]] } });
      const g = mid.getContext('2d');
      const trees = [0, 1, 2].map(i => treeSpr(36 + i * 12, ramp('#3a5a1a', '#5c842a', '#8cb43a', '#d0dc5a'), i + 20, false));
      for (let i = 0; i < 16; i++) { const x = (hash(i, 4, 9) * DW) | 0, t = trees[i % 3]; g.drawImage(t, x, mid.h[x] - t.height + 6); }
      // windmills (bodies painted, blades animated)
      const mills = [260, 760, 1130].map(x => ({ x, y: (mid.h[x] | 0) - 46 }));
      for (const m of mills) {
        g.fillStyle = '#f4e4d0'; for (let k = 0; k < 50; k++) g.fillRect(m.x - 7 - k * 0.1, m.y + k, 14 + k * 0.2, 1);
        g.fillStyle = '#c8a890'; for (let k = 0; k < 50; k++) g.fillRect(m.x + 3 + k * 0.1, m.y + k, 4, 1);
        g.fillStyle = '#b04a3a'; for (let k = 0; k < 9; k++) g.fillRect(m.x - k, m.y - 9 + k, k * 2 + 1, 1);
        g.fillStyle = '#5a3a2a'; g.fillRect(m.x - 2, m.y + 38, 5, 10);
      }
      const blades = fanFrames(34, ramp('#7a4a2a', '#b07a4a', '#e8c890', '#fff0c8'), 4, 8);
      const near = ridge({ base: 410, amp: 12, freq: 6, seed: 47, lightDepth: 26, ramp: ramp('#3a6218', '#588a22', '#84b632', '#bcde56'), trees: { w: 8, h: 8, round: true }, light: 0.04, fade: 200, tex: 0.1, dots: { p: 0.16, cols: [[255, 130, 190], [255, 226, 90], [255, 255, 255], [240, 90, 90], [190, 140, 255]] } });
      return {
        layers: [
          L(sky([[0, '#5a3a8a'], [0.22, '#c8507a'], [0.48, '#ff8a5a'], [0.75, '#ffc070'], [1, '#fff0b0']], 22, (x, y, c) => {
            const d = Math.hypot(x - 180, y - 250);
            if (d < 54) return d < 48 ? [255, 244, 190] : [255, 220, 130];
            if (d < 200) return mixc(c, [255, 236, 170], clamp(0.55 - Math.floor(d / 20) * 0.06));
            return c;
          }), 0),
          { factor: 0.04, draw(ctx, sx, t) { for (const c of clouds) wrap(ctx, c.img, c.x - sx + t * c.sp, c.y, c.img.width / 2, c.img.height / 2, LW + 120); } },
          L(m1, 0.04), L(m2, 0.08), L(mid, 0.2),
          { factor: 0.2, draw(ctx, sx, t) { const f = blades[Math.floor(t / 7) % blades.length]; for (const m of mills) wrap(ctx, f, m.x / 2 - 17 - sx, m.y / 2 - 21, 34, 34); } },
          L(near, 0.42),
        ],
      };
    },
    city() {
      const smogR = ramp('#4a4452', '#625a66', '#7e747c', '#9a8e92');
      const smogs = [0, 1, 2, 3, 4].map(i => ({ img: puffCloud(150 + i * 30, 34 + i * 4, i + 30, smogR), x: i * 149, y: 26 + (i * 47) % 90, sp: 0.03 + i * 0.01 }));
      const far = buildings({ seed: 1, base: 330, minW: 34, maxW: 80, minH: 60, maxH: 210, ramp: ramp('#7a7488', '#888296', '#948ea0', '#a49cac'), win: null, roof: false });
      const fg = far.getContext('2d'); fg.globalAlpha = 0.5; fg.fillStyle = '#c0a8a0'; fg.fillRect(0, 280, DW, 160); fg.globalAlpha = 1;
      const mid = buildings({ seed: 2, base: 380, minW: 60, maxW: 130, minH: 110, maxH: 250, ramp: ramp('#33303f', '#48465a', '#57566c', '#6a6a82', '#8a8aa0'), win: { w: 6, h: 8, gx: 12, gy: 15, lit: 0.34, cols: ['#ffe9a0', '#ffd070', '#ffe9a0', '#a8e8ff'] }, roof: true });
      const near = buildings({ seed: 3, base: 440, minW: 90, maxW: 190, minH: 100, maxH: 190, ramp: ramp('#15141e', '#201f2c', '#2a2a3a', '#36364a', '#4c4c62'), win: { w: 8, h: 10, gx: 17, gy: 20, lit: 0.26, cols: ['#ffdc80', '#ffc860', '#ff9e50', '#8adcff'] }, roof: true });
      return {
        layers: [
          L(sky([[0, '#3e3c5c'], [0.3, '#6c5e7c'], [0.6, '#a8848a'], [0.85, '#dca88a'], [1, '#f0c8a0']], 20, (x, y, c) => {
            const d = Math.hypot(x - 540, y - 150);
            if (d < 30) return mixc(c, [255, 226, 190], 0.75);
            if (d < 110) return mixc(c, [255, 210, 170], clamp(0.3 - Math.floor(d / 14) * 0.04));
            return c;
          }), 0),
          L(far, 0.05),
          { factor: 0.08, draw(ctx, sx, t) { ctx.globalAlpha = 0.75; for (const c of smogs) wrap(ctx, c.img, c.x - sx + t * c.sp, c.y, c.img.width / 2, c.img.height / 2, LW + 160); ctx.globalAlpha = 1; } },
          L(mid, 0.16),
          { factor: 0.16, draw(ctx, sx, t) {
            for (const [x, y] of mid.lights) if ((t + x * 7) % 90 < 45) { ctx.fillStyle = '#ff4030'; const xx = (((x - sx) % LW) + LW) % LW; ctx.fillRect(xx, y, 1.5, 1.5); ctx.fillRect(xx - LW, y, 1.5, 1.5); }
            ctx.fillStyle = '#23222e';
            for (const [x, y, w, h] of mid.flick) if (hash(Math.floor(t / 22), x | 0, 3) < 0.3) { const xx = (((x - sx) % LW) + LW) % LW; ctx.fillRect(xx, y, w, h); ctx.fillRect(xx - LW, y, w, h); }
          } },
          L(near, 0.36),
        ],
      };
    },
    duct() {
      const M = TERRAIN.R.ductMetal;
      const fans = [200, 620, 1040];
      const wall = paint(DW, DH, (x, y, ix, iy) => {
        for (const fx of fans) { const d = Math.hypot(x - fx, y - 190); if (d < 96) return d > 88 ? tone(M, 0.3 + (fx - x + 190 - y) / 400, ix, iy, 0.3) : [7, 10, 20]; }
        const px0 = x % 160, py0 = y % 108;
        let t = 0.13 + (hash((x / 160) | 0, (y / 108) | 0, 3) - 0.5) * 0.06 + (vnoise(x / 50, y / 2, 4) - 0.5) * 0.04;
        if (px0 < 2 || py0 < 2) t = 0.02; else if (px0 < 4 || py0 < 4) t += 0.08;
        if (Math.hypot((px0 % 152) - 8, (py0 % 100) - 8) < 2) t += 0.12;
        return tone(M, t, ix, iy, 0.6);
      });
      const blades = fanFrames(86, ramp('#0e1626', '#18243c', '#263858', '#3a5278'), 5, 8);
      const front = paint(DW, DH, (x, y, ix, iy) => {
        for (const fx of fans) { // grille bars over the fans
          const d = Math.hypot(x - fx, y - 190);
          if (d < 90 && (Math.abs(((y - 190) % 22 + 22) % 22 - 11) < 1.5 || Math.abs(x - fx) < 2)) return tone(M, 0.3, ix, iy, 0.2);
        }
        for (const [py0, r, sd] of [[70, 9, 1], [330, 13, 2], [356, 5, 3]]) {  // long pipes
          const dy = y - py0;
          if (Math.abs(dy) < r) {
            let t = 0.36 - (dy / r) * 0.26 + (Math.abs(dy + r * 0.4) < 1.2 ? 0.2 : 0);
            if ((x + sd * 50) % 220 < 9) t += (x + sd * 50) % 220 < 2 ? -0.2 : 0.12;
            return tone(M, t, ix, iy, 0.4);
          }
        }
        return null;
      });
      const shaft = canvas(160, DH); { const g = shaft.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, DH); gr.addColorStop(0, 'rgba(160,200,255,0.2)'); gr.addColorStop(1, 'rgba(160,200,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(60, 0); g.lineTo(100, 0); g.lineTo(160, DH); g.lineTo(0, DH); g.fill(); }
      return {
        layers: [
          L(sky([[0, '#0a1020'], [1, '#141e38']], 8), 0), L(wall, 0.12),
          { factor: 0.12, draw(ctx, sx, t) { const f = blades[Math.floor(t / 3) % blades.length]; for (const fx of fans) wrap(ctx, f, fx / 2 - 43 - sx, 95 - 43, 86, 86); } },
          L(front, 0.12),
          { factor: 0.3, draw(ctx, sx, t) { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { ctx.globalAlpha = 0.5 + Math.sin(t * 0.02 + i * 2) * 0.25; wrap(ctx, shaft, i * 170 + 40 - sx, 0, 80, VH, LW + 40); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } },
        ],
      };
    },
    filter() {
      const Pp = TERRAIN.R.paper;
      const wall = paint(DW, DH, (x, y, ix, iy) => {
        const k = x % 26, glowv = clamp(1 - Math.hypot((x % 640) - 320, y - 200) / 360);
        let t = 0.1 + (k < 13 ? k / 13 : (26 - k) / 13) * 0.22 + glowv * 0.3;
        const dust = fbm(x / 80, y / 60, 4, 7);
        if (dust > 0.58) t -= (dust - 0.58) * 1.6;
        if (x % 320 < 14 || y % 216 < 10) return tone(TERRAIN.R.wood, 0.14 + (x % 320 < 3 || y % 216 < 3 ? 0.14 : 0), ix, iy, 0.4);
        return tone(Pp, t, ix, iy, 0.7);
      });
      const shaft = canvas(200, DH); { const g = shaft.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, DH); gr.addColorStop(0, 'rgba(255,220,150,0.22)'); gr.addColorStop(1, 'rgba(255,220,150,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(90, 0); g.lineTo(130, 0); g.lineTo(60, DH); g.lineTo(-40, DH); g.fill(); }
      const clumps = paint(DW, DH, (x, y, ix, iy) => {
        const v = fbm(x / 46, y / 30, 4, 19) - (y < 60 ? 0 : 0.14) + (y > 380 ? 0.1 : 0);
        if (v > 0.62 && (y < 110 || y > 350)) return tone(TERRAIN.R.lint, 0.1 + (v - 0.62) * 2.2, ix, iy, 0.7);
        return null;
      });
      return {
        layers: [
          L(sky([[0, '#1c160c'], [1, '#2e2414']], 8), 0), L(wall, 0.1),
          { factor: 0.2, draw(ctx, sx, t) { ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { ctx.globalAlpha = 0.55 + Math.sin(t * 0.015 + i * 2.4) * 0.3; wrap(ctx, shaft, i * 220 + 30 - sx, 0, 100, VH, LW + 40); } ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } },
          L(clumps, 0.32),
        ],
      };
    },
    ice() {
      const I = TERRAIN.R.ice;
      const coils = paint(DW, DH, (x, y, ix, iy) => {
        // rows of frosty copper tubes joined by U-bends, in front of thin fins
        const row = Math.floor((y - 20) / 62), ry = (y - 20) - row * 62 - 31;
        if (Math.abs(ry) < 11) {
          const frost = fbm(x / 20, y / 8, 3, 5);
          let t = 0.36 - (ry / 11) * 0.24 + (Math.abs(ry + 5) < 1.5 ? 0.22 : 0);
          if (frost > 0.55) return tone(I, 0.5 + (frost - 0.55) * 1.6 - ry / 40, ix, iy, 0.7);
          return tone(ramp('#2a1c3a', '#4a3050', '#7a4a52', '#a86a54', '#d09a6a'), t, ix, iy, 0.6);
        }
        if ((x % 8) < 1.2) return tone(I, 0.12 + (hash(ix >> 3, 1, 2) * 0.08), ix, iy, 0.3);
        return null;
      });
      const spikes = ridge({ base: 404, amp: 20, freq: 9, detail: 26, seed: 61, ramp: ramp('#123c7e', '#1e5aa6', '#3a84cc', '#6ab2ea'), light: 0.05, fade: 160, tex: 0.06 });
      const stal = paint(DW, 190, (x, y, ix, iy) => {
        const cell = Math.floor(x / 42), cxp = cell * 42 + 10 + hash(cell, 1, 9) * 22, len = 30 + hash(cell, 2, 9) * 130, half = (1 - y / len) * (6 + hash(cell, 3, 9) * 9);
        if (y < len && Math.abs(x - cxp) < half) return tone(ramp('#0e3270', '#1a4e98', '#3478c2', '#62a8e6', '#b0dcfa'), 0.4 + (x < cxp ? 0.3 : -0.14) + (Math.abs(x - cxp + half * 0.4) < 1 ? 0.3 : 0), ix, iy, 0.5);
        return null;
      });
      const aur = canvas(512, 160); { const g = aur.getContext('2d'); for (let x = 0; x < 512; x += 2) { const hh = 50 + Math.sin(x / 40) * 26 + Math.sin(x / 13) * 10; const gr = g.createLinearGradient(0, 20, 0, 20 + hh); gr.addColorStop(0, 'rgba(90,255,200,0)'); gr.addColorStop(0.4, `rgba(90,255,210,${0.16 + Math.sin(x / 9) * 0.06})`); gr.addColorStop(1, 'rgba(120,150,255,0)'); g.fillStyle = gr; g.fillRect(x, 20 + Math.sin(x / 60) * 14, 2, hh); } }
      return {
        layers: [
          L(sky([[0, '#040c28'], [0.5, '#0a2456'], [1, '#184a8a']], 14, (x, y, c, ix, iy) => hash(ix, iy, 5) > 0.9985 ? [220, 240, 255] : c), 0),
          { factor: 0.02, draw(ctx, sx, t) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7 + Math.sin(t * 0.01) * 0.3; wrap(ctx, aur, -sx + t * 0.05, 4, 512, 110, 512); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } },
          L(coils, 0.1), L(spikes, 0.24), L(stal, 0.3),
        ],
      };
    },
    drain() {
      const D0 = TERRAIN.R.drainStone, M = TERRAIN.R.moss;
      const wall = paint(DW, DH, (x, y, ix, iy) => {
        // arched alcoves
        const ax = (x % 320) - 160, arch = Math.abs(ax) < 70 && y > 130 - Math.sqrt(Math.max(0, 4900 - ax * ax)) * 0.7 && y < 400;
        const row = Math.floor(y / 20), bx = (x + (row & 1) * 22) % 44, by = y % 20;
        let t = (arch ? 0.03 : 0.16) + (hash(((x + (row & 1) * 22) / 44) | 0, row, 3) - 0.5) * 0.07;
        if (bx < 2 || by < 2) t -= 0.08;
        const m = fbm(x / 60, y / 40, 4, 3);
        if (!arch && m > 0.6) return tone(M, (m - 0.6) * 1.4, ix, iy, 0.7);
        if (arch && Math.abs(ax) > 66) t += 0.12;
        return tone(D0, t, ix, iy, 0.7);
      });
      const pipes = paint(DW, DH, (x, y, ix, iy) => {
        for (const [py0, r] of [[96, 16], [300, 22]]) {
          const dy = y - py0;
          if (Math.abs(dy) < r) {
            let t = 0.34 - (dy / r) * 0.24 + (Math.abs(dy + r * 0.45) < 1.5 ? 0.16 : 0);
            if (x % 260 < 12) t += x % 260 < 3 ? -0.2 : 0.1;
            if (fbm(x / 26, y / 12, 3, 8) > 0.6 && dy > -r * 0.2) return tone(M, 0.3 - dy / r * 0.2, ix, iy, 0.6);
            return tone(TERRAIN.R.rust, t, ix, iy, 0.6);
          }
        }
        // outflow pipe ends
        for (const ox of [150, 470, 790, 1110]) { const d = Math.hypot(x - ox, y - 200); if (d < 26) return d < 18 ? [4, 8, 6] : tone(TERRAIN.R.rust, 0.4 + (ox - x + 200 - y) / 90, ix, iy, 0.4); }
        return null;
      });
      const outs = [150, 470, 790, 1110];
      return {
        layers: [
          L(sky([[0, '#050c0a'], [1, '#0c1a14']], 8), 0), L(wall, 0.1), L(pipes, 0.2),
          { factor: 0.2, draw(ctx, sx, t) {
            for (const ox of outs) {   // sludge waterfalls
              const xx = (((ox / 2 - 5 - sx) % LW) + LW) % LW;
              for (const x0 of [xx, xx - LW]) {
                if (x0 < -12 || x0 > VW) continue;
                ctx.fillStyle = 'rgba(110,170,30,0.8)'; ctx.fillRect(x0, 104, 10, VH - 104);
                ctx.fillStyle = 'rgba(200,244,80,0.85)';
                for (let i = 0; i < 9; i++) ctx.fillRect(x0 + 1 + (i * 37) % 8, 104 + ((t * 2.2 + i * 29) % (VH - 104)), 1.5, 5);
                ctx.fillStyle = 'rgba(60,110,16,0.8)'; ctx.fillRect(x0 + 8.5, 104, 1.5, VH - 104);
              }
            }
          } },
        ],
      };
    },
    compressor() {
      const H = TERRAIN.R.hotMetal;
      const wall = paint(DW, DH, (x, y, ix, iy) => {
        const px0 = x % 128, py0 = y % 96;
        let t = 0.12 + (hash((x / 128) | 0, (y / 96) | 0, 5) - 0.5) * 0.06 + (vnoise(x / 40, y / 2, 3) - 0.5) * 0.04;
        if (px0 < 2 || py0 < 2) { const heat = fbm(x / 90, y / 90, 3, 2); if (heat > 0.52) return tone(TERRAIN.R.ember, (heat - 0.5) * 2.4, ix, iy, 0.6); t = 0.02; }
        return tone(H, t, ix, iy, 0.6);
      });
      const tanks = paint(DW, DH, (x, y, ix, iy) => {
        const cell = Math.floor(x / 320), lx = x - cell * 320;
        // big compressor tank
        if (lx > 40 && lx < 150 && y > 150) {
          const k = (lx - 95) / 55;
          if (y < 172 && Math.abs(k) > Math.sqrt(Math.max(0, 1 - Math.pow((172 - y) / 22, 2)))) return null;
          let t = 0.42 - k * 0.3 + (Math.abs(k + 0.45) < 0.06 ? 0.22 : 0);
          if (Math.abs(y - 230) < 4 || Math.abs(y - 330) < 4) t += 0.14;
          if (Math.hypot(lx - 95, y - 280) < 14) return Math.hypot(lx - 95, y - 280) > 11 ? tone(H, 0.9, ix, iy, 0) : [240, 240, 220];
          return tone(H, t, ix, iy, 0.6);
        }
        // glowing coil loops
        if (lx > 190 && lx < 300 && y > 110 && y < 390) {
          const cy0 = 110 + Math.floor((y - 110) / 40) * 40 + 20;
          const d = Math.abs(Math.hypot((lx - 245) * 0.42, y - cy0) - 14);
          if (d < 3.4) return tone(TERRAIN.R.ember, 0.75 - d * 0.16, ix, iy, 0.5);
        }
        return null;
      });
      const blades = fanFrames(60, ramp('#1e0c06', '#3a180c', '#5c2c14', '#80441e'), 3, 8);
      const piston = paint(40, 120, (x, y, ix, iy) => tone(TERRAIN.R.steel, 0.5 - Math.abs(x - 14) / 40 + (y > 100 ? -0.2 : 0) + (Math.abs(x - 10) < 2 ? 0.25 : 0), ix, iy, 0.4));
      return {
        layers: [
          L(sky([[0, '#1a0804'], [1, '#3c140a']], 8), 0), L(wall, 0.1),
          { factor: 0.1, draw(ctx, sx, t) { const f = blades[Math.floor(t / 2.5) % blades.length]; for (const fx of [240, 560]) wrap(ctx, f, fx - sx, 18, 60, 60); } },
          { factor: 0.22, draw(ctx, sx, t) { for (let i = 0; i < 4; i++) wrap(ctx, piston, i * 160 + 82 - sx, 12 + Math.sin(t * 0.08 + i * 1.6) * 14 - 30, 20, 60); } },
          L(tanks, 0.22),
          { factor: 0.22, draw(ctx, sx, t) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + Math.sin(t * 0.05) * 0.2; const gl = GFX.glowTex('#ff6a1a', 60); for (let i = 0; i < 4; i++) wrap(ctx, gl, i * 160 + 122 - 60 - sx, 125 - 60, 120, 120); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } },
        ],
      };
    },
    factory() {
      const stacksX = [130, 420, 700, 1010];
      const far = paint(DW, DH, (x, y, ix, iy) => {
        for (const sx0 of stacksX) {
          const w = 16 + (y - 120) * 0.03;
          if (y > 120 && Math.abs(x - sx0) < w) { let t = 0.4 - (x - sx0) / w * 0.3; if ((y - 120) % 60 < 8) return tone(ramp('#5a1410', '#8a241a', '#b83c28'), t + 0.2, ix, iy, 0.5); return tone(ramp('#3c2c2c', '#54403c', '#6e564e', '#8a7064'), t, ix, iy, 0.6); }
        }
        if (y > 300 + Math.floor(x / 90) % 3 * 16) return tone(ramp('#3c2c2c', '#54403c', '#6e564e'), 0.3 + (hash((x / 90) | 0, 1, 2) - 0.5) * 0.4, ix, iy, 0.6);
        return null;
      });
      const puff = puffCloud(70, 50, 5, ramp('#2a2224', '#3e3234', '#584648', '#766060'), false);
      const mid = buildings({ seed: 9, base: 400, minW: 110, maxW: 220, minH: 70, maxH: 150, ramp: ramp('#170e0e', '#241616', '#32201e', '#422c28', '#5a3e36'), win: { w: 10, h: 6, gx: 20, gy: 22, lit: 0.3, cols: ['#ff9a30', '#ffb040', '#ff7020', '#ffd060'] }, roof: true });
      const g = mid.getContext('2d');
      // pipes, tanks and a crane silhouette
      g.fillStyle = '#170e0e';
      for (let i = 0; i < 6; i++) { const x = i * 215 + 30; g.fillRect(x, 286, 150, 5); g.fillRect(x + 20, 286, 4, 120); g.fillRect(x + 120, 286, 4, 120); }
      for (const cx0 of [520, 1120]) { g.fillRect(cx0, 170, 6, 240); g.fillRect(cx0 - 70, 176, 160, 5); g.fillRect(cx0 + 60, 181, 1, 50); for (let k = 0; k < 16; k++) g.fillRect(cx0 - 70 + k * 10, 170 + (k % 2) * 3, 10, 2); }
      const fence = paint(DW, 120, (x, y) => { if (y < 4) return [14, 8, 8]; if (x % 96 < 4) return [14, 8, 8]; const a = (x + y) % 12, b = (x - y + 1200) % 12; return (a < 1.3 || b < 1.3) ? [20, 12, 12] : null; });
      return {
        layers: [
          L(sky([[0, '#2a1c2c'], [0.3, '#5c3436'], [0.6, '#a85c3a'], [0.85, '#e09a4a'], [1, '#f4c870']], 20, (x, y, c) => {
            const d = Math.hypot(x - 200, y - 240);
            return d < 40 ? mixc(c, [255, 220, 150], 0.8) : d < 130 ? mixc(c, [255, 190, 110], clamp(0.3 - Math.floor(d / 15) * 0.035)) : c;
          }), 0),
          L(far, 0.06),
          { factor: 0.06, draw(ctx, sx, t) {
            for (const [si, sx0] of stacksX.entries()) for (let i = 0; i < 7; i++) {
              const k = ((t * 0.004 + i / 7 + si * 0.13) % 1), sz = 16 + k * 44;
              ctx.globalAlpha = (1 - k) * 0.85;
              wrap(ctx, puff, sx0 / 2 - sz / 2 - sx + k * 46 + Math.sin(k * 9 + i) * 4, 58 - k * 70 - sz * 0.4, sz, sz * 0.72);
            }
            ctx.globalAlpha = 1;
          } },
          L(mid, 0.18),
          { factor: 0.18, draw(ctx, sx, t) { ctx.fillStyle = '#1a0e0e'; for (const [x, y, w, h] of mid.flick) if (hash(Math.floor(t / 9), x | 0, 5) < 0.4) { const xx = (((x - sx) % LW) + LW) % LW; ctx.fillRect(xx, y, w, h); ctx.fillRect(xx - LW, y, w, h); } } },
          L(fence, 0.4, 156),
        ],
      };
    },
    sky() {
      const stars = [];
      for (let i = 0; i < 90; i++) stars.push([hash(i, 1, 5) * VW, hash(i, 2, 5) * 120, hash(i, 3, 5)]);
      // cumulus silhouettes: stacked round lobes (periodic so the layer tiles)
      const lobes = (base, seed, amp) => {
        const h = new Float32Array(DW);
        for (let x = 0; x < DW; x++) {
          const u = x / DW * Math.PI;
          h[x] = base - (Math.abs(Math.sin(u * 5 + seed)) * 0.5 + Math.abs(Math.sin(u * 13 + seed * 2)) * 0.28 + Math.abs(Math.sin(u * 37 + seed * 3)) * 0.14) * amp - (pnoise(x, seed, 3, 2) - 0.5) * amp * 0.9;
        }
        return h;
      };
      const cloudLayer = (h, rmp, dim, fade) => paint(DW, DH, (x, y, ix, iy) => {
        const hh = h[ix];
        if (y < hh) return null;
        const d = y - hh, sl = h[(ix + 3) % DW] - h[(ix + DW - 3) % DW];
        return tone(rmp, 0.92 - d / fade - dim + clamp(sl * 0.03, -0.12, 0.12) * clamp(1 - d / 14) + (d < 2.5 ? 0.14 : 0) + (hash(ix >> 1, iy >> 1, 3) - 0.5) * 0.04, ix, iy, 0.8);
      });
      const bank = cloudLayer(lobes(262, 5, 64), ramp('#2c2250', '#40326c', '#584688', '#7a64a8', '#a892cc'), 0.2, 150);
      const seaR = ramp('#4e3c7c', '#6c589c', '#9080be', '#b8aadc', '#e0d8f4');
      const sea1 = cloudLayer(lobes(336, 21, 44), seaR, 0.3, 80), sea2 = cloudLayer(lobes(384, 33, 36), seaR, 0.06, 70);
      const city = paint(DW, 60, (x, y, ix, iy) => {
        const hh = 30 - hash((x / 14) | 0, 1, 8) * 26;
        if (y < hh) return null;
        return hash(ix >> 1, iy >> 1, 4) > 0.9 ? [255, 210, 120] : [38, 28, 62];
      });
      const bolt = paint(60, 150, (x, y) => { const cxp = 30 + Math.sin(y / 9) * 8 + (hash((y / 14) | 0, 3, 1) - 0.5) * 22; return Math.abs(x - cxp) < 1.6 ? [255, 255, 255] : Math.abs(x - cxp) < 4 ? [200, 180, 255, 120] : null; });
      const B = {
        flash: 0,
        layers: [
          L(sky([[0, '#140c34'], [0.3, '#3a2068'], [0.58, '#8a3a8a'], [0.8, '#e0607a'], [1, '#ffa870']], 22, (x, y, c) => {
            const d = Math.hypot(x - 610, y - 70);
            if (d < 30) return (Math.hypot(x - 598, y - 62) < 26) ? [250, 244, 220] : mixc(c, [250, 244, 220], 0.25);
            return d < 80 ? mixc(c, [240, 230, 255], clamp(0.2 - Math.floor(d / 12) * 0.03)) : c;
          }), 0),
          { factor: 0, draw(ctx, sx, t) { for (const [x, y, p] of stars) { const tw = Math.sin(t * 0.05 + p * 40); if (tw > -0.6) { ctx.fillStyle = tw > 0.7 ? '#ffffff' : '#b8a8e8'; ctx.fillRect(x, y, tw > 0.9 ? 1.5 : 1, tw > 0.9 ? 1.5 : 1); } } } },
          L(bank, 0.03),
          { factor: 0.03, draw(ctx, sx, t) {
            const cyc = t % 420, which = Math.floor(t / 420);
            B.flash = cyc < 6 ? 1 - cyc / 6 : (cyc > 12 && cyc < 16) ? 0.6 : 0;
            if (cyc < 16) { ctx.globalAlpha = cyc < 6 || cyc > 12 ? 1 : 0.2; wrap(ctx, bolt, hash(which, 1, 2) * LW - sx, 96, 30, 75); ctx.globalAlpha = 1; }
          } },
          L(city, 0.06, 176),
          { factor: 0.1, draw(ctx, sx, t) { wrap(ctx, sea1, -sx + t * 0.04, 0, LW, VH); } },
          { factor: 0.24, draw(ctx, sx, t) { wrap(ctx, sea2, -sx + t * 0.1, 0, LW, VH); } },
        ],
      };
      return B;
    },
  };

  const cache = new Map();
  function get(theme) {
    let b = cache.get(theme);
    if (!b) { b = BUILD[theme](); cache.set(theme, b); }
    return b;
  }
  function draw(ctx, b, camx, camy, t) {
    for (const l of b.layers) {
      const sx = camx * l.factor;
      if (l.draw) { l.draw(ctx, sx, t); continue; }
      if (l.factor === 0) { ctx.drawImage(l.img, 0, 0, VW, VH); continue; }
      const oy = (l.y || 0) - camy * l.factor * 0.5;
      wrap(ctx, l.img, -sx, oy, l.img.width / 2, l.img.height / 2);
    }
  }
  return { get, draw };
})();
