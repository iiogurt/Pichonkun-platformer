// Procedural pixel-art sprites. Everything is painted at 2x the logical game
// resolution (so a 16px tile has 32 art pixels) using the GFX toolkit.
'use strict';

const PAL = {
  navy: '#0d1b5e', blue: '#1565d8', cyan: '#1cb8f2', light: '#b5ecfc',
  white: '#ffffff', gray: '#b4b4b4', black: '#000000', cream: '#fdf5e6',
};
const TILE = 16;
const SPR = {};

function hexRgb(h) { return GFX.rgb(h); }

// Sprite record: canvas is 2x, w/h are logical. oy = empty logical px below the feet.
function mkSpr(c, oy = 0) { return { img: c, flip: GFX.flipX(c), w: c.width / 2, h: c.height / 2, oy }; }
function drawSpr(ctx, spr, x, y, flip = false, scale = 1) {
  ctx.drawImage(flip ? spr.flip : spr.img, Math.round(x * 2) / 2, Math.round(y * 2) / 2, spr.w * scale, spr.h * scale);
}
function whiteVersion(spr) {
  return { img: GFX.silhouette(spr.img), flip: GFX.silhouette(spr.flip), w: spr.w, h: spr.h, oy: spr.oy };
}

const RAMPS = {
  water: GFX.ramp('#0c2f96', '#1352c8', '#1a80e6', '#1cb0f2', '#4fcdf8', '#a8e8fc', '#ffffff'),
  white: GFX.ramp('#8fa6c4', '#c2d4e6', '#e8f2fa', '#ffffff'),
  pollen: GFX.ramp('#8a4200', '#d07a08', '#f8b414', '#ffd83a', '#fff29a'),
  virus: GFX.ramp('#34085c', '#5c1a9a', '#8c36c8', '#b866ec', '#e2aaff'),
  knob: GFX.ramp('#157018', '#3cc030', '#8cf060', '#d8ffb0'),
  germ: GFX.ramp('#0e4418', '#1f7a28', '#3cb43a', '#7ae052', '#c8ff96'),
  dust: GFX.ramp('#3c3844', '#676270', '#948e9c', '#c2bcca', '#ece8f4'),
  smog: GFX.ramp('#101016', '#23232c', '#3a3a46', '#575764', '#7c7c8a', '#a2a2b0'),
  mold: GFX.ramp('#141e06', '#2c4416', '#4c6e1e', '#789a30', '#b0cc58', '#e0f090'),
  petal: GFX.ramp('#7a1450', '#c23684', '#ec66b0', '#ff9ed6', '#ffd8f0'),
  leaf: GFX.ramp('#0e4a1c', '#1f7a2a', '#3cb042', '#74dc5c', '#c4f8a0'),
  wood: GFX.ramp('#3c2110', '#6a3e1e', '#96602e', '#c08a4a', '#e4b878'),
  metal: GFX.ramp('#1c2434', '#38465e', '#5c6e8a', '#8a9cb8', '#bccadc', '#eef4fa'),
  ice: GFX.ramp('#2a62b0', '#5aa2e0', '#96d2f6', '#d0f0ff', '#ffffff'),
  heart: GFX.ramp('#6e0a24', '#b81640', '#f03a62', '#ff7c98', '#ffc8d4'),
  card: GFX.ramp('#6a5a3a', '#a08a5c', '#cdb888', '#ecdcb4', '#fff6dc'),
  cloud: GFX.ramp('#7888b4', '#a8b8d8', '#d4def0', '#f2f6fc', '#ffffff'),
  bee: GFX.ramp('#8a5200', '#e09a08', '#ffc81e', '#ffe870'),
  gold: GFX.ramp('#7a4a00', '#c88a08', '#ffc81e', '#ffec80', '#fffbe0'),
  red: GFX.ramp('#5c0c0c', '#a81c14', '#e83c24', '#ff7c50', '#ffc8a0'),
  green: GFX.ramp('#0c4a14', '#1c8a24', '#3cd040', '#8cff70', '#e0ffc8'),
};
const OUTL = { navy: [13, 27, 94], dark: [16, 12, 26] };

(function () {
  const { sd: S, tone, paint, outline, stack, clamp, hash, fbm, sphereLight, px } = GFX;
  const D = 0.18; // dithering strength for sprites
  const N = OUTL.navy;

  // shaded shape -> canvas
  function part(W, H, sdf, rmp, light, ol, dith = D) {
    const c = paint(W, H, (x, y, ix, iy) => {
      const d = sdf(x, y);
      if (d > 0) return null;
      const t = light(x, y, d);
      return Array.isArray(t) ? t : tone(rmp, t, ix, iy, dith);
    });
    return ol ? outline(c, ol) : c;
  }
  // cartoon eye: white ball + pupil + glint. lx/ly = pupil offset, lid = angry eyelid height
  function eye(g, x, y, r, lx = 0, ly = 0, lid = 0) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.hypot(i, j);
      if (d > r + 0.3) continue;
      let col = d > r - 0.7 ? '#10101c' : '#ffffff';
      const pd = Math.hypot(i - lx, j - ly);
      if (d <= r - 0.7 && pd < r * 0.52) col = '#10101c';
      if (lid && j < -r + lid) col = '#10101c';
      g.fillStyle = col; g.fillRect(Math.round(x + i), Math.round(y + j), 1, 1);
    }
    g.fillStyle = '#ffffff'; g.fillRect(Math.round(x + lx - 1), Math.round(y + ly - 1), 1, 1);
  }
  function line(g, col, x0, y0, x1, y1) {
    g.fillStyle = col;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / (n || 1)), Math.round(y0 + (y1 - y0) * i / (n || 1)), 1, 1);
  }

  // ============================================================ PICHONKUN
  function pichon(o = {}) {
    const W = 50, H = 56, base = 53, cx = 24;
    const sq = o.sq || 0, bob = o.bob || 0, lean = o.lean || 0, tipLen = o.tip || 20.5;
    const sxs = 1 + sq * 0.13, sys = 1 - sq * 0.13;
    const R = 13, WIDE = 1.1;
    const hy = base - 13 - R * sys + bob + (o.headY || 0); // head centre
    const legs = o.legs || [[0, 0], [0, 0]];
    const arms = o.arms || [0.25, -0.25];
    const eyes = o.eyes || 'open';

    const limb = (ax, ay, bx, by, r1, r2) => part(W, H, (x, y) => S.cone(x, y, ax, ay, r1, bx, by, r2), RAMPS.white,
      (x, y) => clamp(0.95 - (y - Math.min(ay, by)) * 0.07 + (x - ax) * 0.05), N, 0);
    const by0 = base - 9 + bob * 0.6;
    const mkLeg = (side, l) => limb(cx - 0.5 + side * 2.6, base - 6 + bob * 0.3, cx - 0.5 + side * 2.6 + l[0], base - 2.2 - l[1], 2.2, 2.5);
    const mkArm = (side, a) => limb(cx - 0.5 + side * 4.6, by0 - 1.5, cx - 0.5 + side * 4.6 + Math.sin(a) * 5.2, by0 - 1.5 + Math.cos(a) * 5.2, 1.8, 2.1);

    const body = part(W, H, (x, y) => S.box(x, y, cx - 0.5, by0, 4.8, 4.6, 3.2), RAMPS.white,
      (x, y) => clamp(0.62 + (x - cx) * 0.06 - (y - by0) * 0.08), N, 0);

    // head: a round droplet with a small soft tip (smooth union), in squash space
    const hshape = (X, Y) => S.sunion(S.circle(X, Y, 0, 0, R), S.cone(X, Y, 0, -7.5, 7, lean, -tipLen, 1.1), 3.5);
    const hsdf = (x, y) => hshape((x - cx) / (sxs * WIDE), (y - hy) / sys) * Math.min(sxs, sys);
    const head = part(W, H, hsdf, RAMPS.water, (x, y, d) => {
      const X = (x - cx) / (sxs * WIDE), Y = (y - hy) / sys;
      // ---- face patch (lower right); features are stamped on afterwards
      const fd = S.ellipse(X, Y, 5.8, 4.8, 10.4, 8.4);
      if (fd < 0) {
        if (fd > -1.5 && Y > 6.5) return [208, 230, 246];
        if (d > -2.2 && Y > 5) return [226, 240, 250];
        return [255, 255, 255];
      }
      // ---- water body
      let t = 0.24 + sphereLight(X, Y, 0, 0, R + 3, 0.55, -0.6) * 0.5;
      if (Y < -10.5) t = 0.5 + (X - lean * clamp((-Y - 10.5) / (tipLen - 10.5))) * 0.07; // tip: lit from the right
      if (d > -3.3 && X < 2 - Y * 0.2) t -= 0.2;                                         // deep shadow band, left
      if (fd < 1.5) t -= 0.08;                                                           // rim around the face
      const ang = Math.atan2(Y, X);
      if (Y > -11 && d < -2.4 && d > -5.4 && ang > -1.3 && ang < -0.3) t = 0.84;          // glossy streak
      if (Y > -11 && d < -3 && d > -4.6 && ang > -1.05 && ang < -0.7) t = 1;
      return clamp(t);
    }, N, 0);

    // ---- face: hand-placed pixel stamps, moved as one rigid unit so squash
    // and stretch never deform the eyes or mouth
    const fg = head.getContext('2d');
    const fx = Math.round(cx - 1 + (sxs - 1) * 5), fy = Math.round(hy + 3 * sys);
    const stamp = (rows, x, y) => rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '.') return;
      fg.fillStyle = ch === '#' ? GFX.css(N) : ch === 'p' ? '#ff96aa' : '#ffffff';
      fg.fillRect(x + i, y + j, 1, 1);
    }));
    const EYES = {
      open: ['.###.', '#www#', '#www#', '#www#', '.###.'],
      wide: ['.###.', '#www#', '#www#', '#www#', '#www#', '.###.'],
      blink: ['.....', '.....', '#####', '.....', '.....'],
      happy: ['.....', '.###.', '#...#', '.....', '.....'],
      hurt: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
    }[eyes];
    const ey = fy - (eyes === 'wide' ? 3 : 2);
    stamp(EYES, fx + 1, ey); stamp(EYES, fx + 8, ey);
    if (o.mouth === 'open') stamp(['.###.', '#ppp#', '#ppp#', '.###.'], fx + 5, fy + 4);
    else stamp(['#..#..#', '.##.##.'], fx + 4, fy + 4);

    return mkSpr(stack(mkArm(-1, arms[1]), mkLeg(-1, legs[1]), mkLeg(1, legs[0]), body, head, mkArm(1, arms[0])), 1.5);
  }

  function buildPichon() {
    SPR.pichon_idle = [0, 1, 2, 3, 4, 5].map(i => {
      const a = Math.sin(i / 6 * Math.PI * 2);
      return pichon({ sq: a * 0.14, bob: 0, arms: [0.28 + a * 0.08, -0.28 - a * 0.08], tip: 20.5 - a * 0.5 });
    });
    SPR.pichon_blink = pichon({ eyes: 'blink' });
    SPR.pichon_run = [0, 1, 2, 3, 4, 5, 6, 7].map(i => {
      const p = i / 8 * Math.PI * 2;
      const leg = (ph) => [Math.cos(ph) * 4.6, Math.max(0, Math.sin(ph)) * 3.6];
      return pichon({ legs: [leg(p), leg(p + Math.PI)], arms: [Math.cos(p + Math.PI) * 1.0, Math.cos(p) * 1.0], bob: -Math.abs(Math.sin(p)) * 1.6, lean: -3 - Math.sin(p * 2) * 0.8, sq: Math.sin(p * 2) * 0.1 });
    });
    SPR.pichon_jump = pichon({ sq: -0.42, legs: [[-1.5, 1.2], [-3, 0.2]], arms: [1.75, -1.8], lean: -1.5, tip: 21, eyes: 'open' });
    SPR.pichon_fall = pichon({ sq: -0.12, legs: [[2.4, 1.5], [-2.6, 1.2]], arms: [1.95, -1.95], lean: 1, tip: 22.5, eyes: 'wide' });
    SPR.pichon_land = pichon({ sq: 0.75, legs: [[2.6, 0], [-2.6, 0]], arms: [1.3, -1.3], tip: 17, headY: 1 });
    SPR.pichon_hurt = pichon({ sq: 0.2, legs: [[2, 2], [-3, 1]], arms: [1.9, -1.7], eyes: 'hurt', mouth: 'open', lean: -3 });
    SPR.pichon_happy = pichon({ sq: -0.25, legs: [[1.5, 0], [-1.5, 0]], arms: [2.0, -2.0], eyes: 'happy', mouth: 'open' });
    SPR.pichon_shoot = pichon({ arms: [1.55, -0.5], sq: 0.05, lean: -1 });
    SPR.pichon_white = whiteVersion(SPR.pichon_idle[0]);
  }

  // =============================================================== ENEMIES
  // All enemies face LEFT; k scales the whole drawing (bosses reuse the same art, bigger).
  function pollen(f, k = 1) {
    const W = 28 * k, H = 28 * k, c0 = 14 * k, rot = f * 0.22;
    const c = part(W, H, (x, y) => {
      const a = Math.atan2(y - c0, x - c0), r = Math.hypot(x - c0, y - c0);
      const sp = Math.pow(Math.max(0, Math.cos(a * 7 + rot * 7)), 2.2);
      return r - (8.2 + sp * 3.8) * k;
    }, RAMPS.pollen, (x, y) => {
      const r = Math.hypot(x - c0, y - c0) / k;
      let t = sphereLight(x, y, c0, c0, 11 * k) * 0.9 + 0.08;
      if (r > 9) t += 0.2;
      if (hash(Math.floor(x / (1.5 * k)), Math.floor(y / (1.5 * k)), 5) > 0.82 && r < 8) t -= 0.17;
      return clamp(t);
    }, '#4a2200');
    const g = c.getContext('2d');
    for (const s of [-1, 1]) {
      eye(g, c0 + s * 3.2 * k - k, c0 - 0.5 * k, Math.max(2, 2.1 * k), -0.6 * k, 0.3 * k);
      line(g, '#4a2200', c0 + s * 5.2 * k - k, c0 - 4.6 * k, c0 + s * 1.2 * k - k, c0 - 3 * k);
    }
    px(g, '#4a2200', [[c0 - 3 * k, c0 + 4 * k, 4 * k, Math.max(1, k)]]);
    return mkSpr(c, 0.5);
  }

  function virus(f, k = 1) {
    const W = 32 * k, H = 32 * k, c0 = 16 * k, wob = Math.sin(f / 4 * Math.PI * 2);
    const knobs = [];
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + 0.2 + wob * 0.06, len = (12.6 + (i % 2 ? wob : -wob) * 0.7) * k;
      knobs.push([Math.cos(a), Math.sin(a), len]);
    }
    const c = part(W, H, (x, y) => {
      let d = S.circle(x, y, c0, c0, 8.6 * k);
      for (const [ux, uy, len] of knobs) {
        d = Math.min(d, S.seg(x, y, c0 + ux * 8 * k, c0 + uy * 8 * k, c0 + ux * len, c0 + uy * len, 0.9 * k), S.circle(x, y, c0 + ux * len, c0 + uy * len, 2.1 * k));
      }
      return d;
    }, RAMPS.virus, (x, y) => {
      const r = Math.hypot(x - c0, y - c0) / k;
      if (r > 10.6) return tone(RAMPS.knob, sphereLight(x, y, c0, c0, 16 * k) + 0.15, x | 0, y | 0, D);
      let t = sphereLight(x, y, c0, c0, 9.5 * k);
      const wv = GFX.worley(x / (4 * k), y / (4 * k), 3);
      if (wv.d1 < 0.3) t -= 0.18;
      if (S.circle(x, y, c0 + 3 * k, c0 - 4.2 * k, 1.6 * k) < 0) t = 1;
      return clamp(t);
    }, '#1c0434');
    const g = c.getContext('2d');
    for (const s of [-1, 1]) {
      eye(g, c0 + s * 3.4 * k - k, c0 - 0.6 * k, Math.max(2, 2.3 * k), -0.5 * k, 0.4 * k, 1.4 * k);
      line(g, '#1c0434', c0 + s * 5.6 * k - k, c0 - 4.4 * k, c0 + s * 1.4 * k - k, c0 - 2.6 * k);
    }
    // zig-zag mouth
    for (let i = 0; i < 6 * k; i++) px(g, '#1c0434', [[c0 - 4 * k + i, c0 + 4.2 * k + (Math.floor(i / k) % 2 ? k * 0.8 : 0), 1, Math.max(1, k * 0.8)]]);
    return mkSpr(c, 0.5);
  }

  function bacteria(f, k = 1) {
    const W = 38 * k, H = 26 * k, cy = 11 * k, wig = f / 4 * Math.PI * 2;
    const legs = [];
    for (let i = 0; i < 6; i++) legs.push([9 * k + i * 3.6 * k, Math.sin(wig + i * 1.3) * 1.6 * k]);
    const body = (x, y) => S.seg(x, y, 10 * k, cy, 26 * k, cy, 7.6 * k);
    const c = part(W, H, (x, y) => {
      let d = body(x, y);
      for (const [lx, o] of legs) d = Math.min(d, S.seg(x, y, lx, cy + 6 * k, lx + o, cy + 11.5 * k, 0.8 * k));
      // flagellum
      for (let i = 0; i < 7; i++) {
        const fx = 33 * k + i * 0.8 * k, fx2 = fx + 0.8 * k;
        d = Math.min(d, S.seg(x, y, fx, cy + Math.sin(wig + i * 0.9) * (1 + i * 0.25) * k, fx2, cy + Math.sin(wig + (i + 1) * 0.9) * (1 + (i + 1) * 0.25) * k, 0.7 * k));
      }
      return d;
    }, RAMPS.germ, (x, y) => {
      if (body(x, y) > 0) return 0.12;
      let t = clamp(0.92 - (y - (cy - 7 * k)) / (15 * k) * 0.95 + (x - 18 * k) / (60 * k));
      const wv = GFX.worley(x / (5 * k), y / (5 * k), 9);
      if (wv.d1 < 0.26) t -= 0.2;
      if (S.seg(x, y, 13 * k, cy - 4.6 * k, 22 * k, cy - 4.6 * k, 1 * k) < 0) t = 1;
      return clamp(t);
    }, '#062a0c');
    const g = c.getContext('2d');
    eye(g, 8.5 * k, cy - 0.5 * k, Math.max(2, 2.6 * k), -0.8 * k, 0.3 * k);
    eye(g, 15 * k, cy - 0.5 * k, Math.max(2, 2.6 * k), -0.8 * k, 0.3 * k);
    px(g, '#062a0c', [[9 * k, cy + 4 * k, 5 * k, Math.max(1, k)], [8 * k, cy + 3 * k, k, k], [14 * k, cy + 3 * k, k, k]]);
    return mkSpr(c, 1);
  }

  function dustBunny(f, k = 1, baron = false) {
    const W = 36 * k, H = (baron ? 40 : 30) * k, top = (baron ? 10 : 0) * k;
    const sqv = [0, 0.12, 0, -0.1][f % 4], cx = 18 * k, cy = top + 17 * k + sqv * 2 * k;
    const rx = 11 * (1 + sqv * 0.1) * k, ry = 9.4 * (1 - sqv * 0.12) * k;
    const sdf = (x, y) => {
      const a = Math.atan2(y - cy, x - cx);
      const fuzz = (fbm(a * 2.4 + 10, f * 0.7, 3, 4) - 0.5) * 5 * k + Math.sin(a * 13 + f) * 0.7 * k;
      let d = S.ellipse(x, y, cx, cy, rx, ry) - fuzz;
      d = Math.min(d, S.cone(x, y, cx - 5 * k, cy - 6 * k, 3 * k, cx - 8 * k, cy - 14 * k - sqv * 2 * k, 1 * k), S.cone(x, y, cx + 4 * k, cy - 6 * k, 3 * k, cx + 5 * k, cy - 15 * k - sqv * 2 * k, 1 * k));
      d = Math.min(d, S.ellipse(x, y, cx - 5 * k, top + 27.2 * k, 3.4 * k, 1.8 * k), S.ellipse(x, y, cx + 6 * k, top + 27.2 * k, 3.4 * k, 1.8 * k));
      return d;
    };
    const c = part(W, H, sdf, RAMPS.dust, (x, y, d) => {
      if (y > top + 26 * k) return 0.1;
      let t = sphereLight(x, y, cx, cy, 13 * k) * 0.85 + 0.1;
      t += (fbm(x / (2.2 * k), y / (2.2 * k), 2, 8) - 0.5) * 0.5;
      if (d > -1.6 * k) t += 0.12;
      return clamp(t);
    }, '#201c28');
    const g = c.getContext('2d');
    const ey = cy - 1 * k;
    for (const ex of [cx - 6.5 * k, cx + 0.5 * k]) {
      const r = Math.max(2, 2.5 * k);
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (Math.hypot(i, j) <= r) px(g, '#14101c', [[Math.round(ex + i), Math.round(ey + j)]]);
      px(g, '#ffffff', [[Math.round(ex - r * 0.45), Math.round(ey - r * 0.5), Math.max(1, Math.round(k)), Math.max(1, Math.round(k))]]);
    }
    px(g, '#14101c', [[cx - 4.5 * k, ey + 4.5 * k, 3 * k, Math.max(1, k * 0.8)]]);
    px(g, '#ffb0c0', [[cx - 10 * k, ey + 2.5 * k, 2 * k, k], [cx + 3.6 * k, ey + 2.5 * k, 2 * k, k]]);
    if (baron) {
      // top hat, monocle and a twirly moustache
      const hx = cx - 3 * k, hy = cy - 9 * k;
      const hat = part(W, H, (x, y) => Math.min(S.box(x, y, hx, hy - 4 * k, 5 * k, 4 * k, 1), S.box(x, y, hx, hy, 8 * k, 1.2 * k, 1)), RAMPS.smog,
        (x, y) => (y > hy - 3.6 * k && y < hy - 1.4 * k) ? [200, 40, 50] : clamp(0.25 + (x - hx) / (22 * k)), '#000000');
      g.drawImage(hat, 0, 0);
      const mx = cx + 0.5 * k, r = 4 * k;
      for (let a = 0; a < 6.3; a += 0.05) px(g, '#ffd23f', [[Math.round(mx + Math.cos(a) * r), Math.round(ey + Math.sin(a) * r), Math.max(1, k * 0.6), Math.max(1, k * 0.6)]]);
      line(g, '#ffd23f', mx + r, ey + r * 0.6, mx + r + 2 * k, ey + 8 * k);
      for (const s of [-1, 1]) for (let i = 0; i < 6 * k; i++) px(g, '#f4f0fa', [[cx - 3 * k + s * i, ey + 5.5 * k - Math.sin(i / (6 * k) * 3) * 1.6 * k, 1, Math.max(2, k)]]);
    }
    return mkSpr(c, baron ? 2.2 : 1);
  }

  function smog(f, k = 1, boss = false) {
    const W = 46 * k, H = 32 * k, w = Math.sin(f / 4 * Math.PI * 2);
    const puffs = [[11, 19, 7.5], [20, 13, 9.5 + w * 0.5], [31, 15, 8.6 - w * 0.5], [38, 20, 5.6], [23, 21, 9], [6, 21, 4.6 + w * 0.4], [15, 12, 5.4 - w * 0.4], [28, 9.5, 5 + w * 0.5]];
    const sdf = (x, y) => { let d = 99; for (const [px0, py0, r] of puffs) d = Math.min(d, S.circle(x, y, px0 * k, py0 * k, r * k)); return d; };
    const c = part(W, H, sdf, RAMPS.smog, (x, y, d) => {
      let best = 0, bw = -99;
      for (const [px0, py0, r] of puffs) { const dd = -S.circle(x, y, px0 * k, py0 * k, r * k) / (r * k); if (dd > bw) { bw = dd; best = sphereLight(x, y, px0 * k, py0 * k, r * k * 1.15, 0.3, -0.8); } }
      let t = best * 0.9 + (fbm(x / (3 * k), y / (3 * k) + f * 0.3, 2, 3) - 0.5) * 0.3;
      if (y > 22 * k) t -= 0.18;
      if (d > -1.5 * k && y < 14 * k) t += 0.14;
      return clamp(t);
    }, '#050508');
    const g = c.getContext('2d');
    const ey = 16.5 * k;
    for (const ex of [15 * k, 26 * k]) {
      const r = 3 * k;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        const dd = Math.hypot(i, j * 1.25) / r;
        if (dd > 1 || j < -r * 0.45 + (i * (ex < 20 * k ? 0.45 : -0.45))) continue;
        px(g, dd < 0.34 ? '#fff6b0' : dd < 0.66 ? '#ff9a20' : '#e42a12', [[Math.round(ex + i), Math.round(ey + j)]]);
      }
    }
    // frown with teeth
    for (let i = -5 * k; i <= 5 * k; i++) {
      const yy = 24 * k + (i * i) / (11 * k) - 2 * k;
      px(g, '#050508', [[Math.round(20.5 * k + i), Math.round(yy), 1, Math.max(1, Math.round(k * (boss ? 1.6 : 1)))]]);
      if (boss && Math.abs(i) % (2 * k) < k && Math.abs(i) < 4.4 * k) px(g, '#e8e8f0', [[Math.round(20.5 * k + i), Math.round(yy + k * 0.4), 1, Math.round(k)]]);
    }
    return mkSpr(c, 0.5);
  }

  function mold(f, k = 1, queen = false) {
    const W = 34 * k, H = (queen ? 36 : 28) * k, top = (queen ? 8 : 0) * k, base = top + 26 * k;
    const sway = Math.sin(f / 4 * Math.PI * 2) * 1.2 * k;
    const lumps = [[9, 19, 6.5], [17, 16, 9], [25, 19, 7], [13, 21, 6], [22, 22, 6], [5, 23, 3.6], [29.5, 23, 3.6]];
    const stalks = [[10, 13, 7, 5], [18, 8, 18, -1], [25, 12, 27.5, 5]];
    const sdf = (x, y) => {
      if (y > base) return 1;
      let d = 99;
      for (const [lx, ly, r] of lumps) d = Math.min(d, S.circle(x, y, lx * k, top + ly * k, r * k));
      for (const [ax, ay, bx, by] of stalks) d = Math.min(d, S.seg(x, y, ax * k, top + ay * k, bx * k + sway, top + by * k, 0.9 * k), S.circle(x, y, bx * k + sway, top + by * k, 2.3 * k));
      return d;
    };
    const c = part(W, H, sdf, RAMPS.mold, (x, y, d) => {
      let t = clamp(0.95 - (y - top - 6 * k) / (21 * k)) * 0.7 + (x - 17 * k) / (90 * k) + 0.12;
      for (const [, , bx, by] of stalks) if (S.circle(x, y, bx * k + sway, top + by * k, 2.4 * k) < 0) return clamp(0.75 + sphereLight(x, y, bx * k + sway, top + by * k, 2.6 * k) * 0.3);
      const wv = GFX.worley(x / (4.5 * k), y / (4.5 * k), 21);
      if (wv.d1 < 0.3) t -= 0.22; else if (wv.d2 - wv.d1 < 0.1) t += 0.1;
      if (y > base - 2.5 * k) t -= 0.25;
      if (d > -1.4 * k && y < top + 16 * k) t += 0.15;
      return clamp(t);
    }, '#080e02');
    const g = c.getContext('2d');
    const ey = top + 18 * k;
    for (const s of [-1, 1]) {
      eye(g, 17 * k + s * 4.2 * k - k, ey, Math.max(2, 2.4 * k), -0.5 * k, 0.5 * k, 1.8 * k);
    }
    for (let i = 0; i < 7 * k; i++) px(g, '#080e02', [[12.5 * k + i, ey + 4.6 * k + Math.sin(i / (7 * k) * Math.PI) * 1.4 * k, 1, Math.max(1, k * 0.8)]]);
    if (queen) {
      const cxq = 17 * k, cyq = top + 5.5 * k;
      const crown = part(W, H, (x, y) => {
        if (y > cyq + 3 * k || Math.abs(x - cxq) > 8 * k) return 1;
        const tri = Math.abs(((x - cxq + 8 * k) % (5.33 * k)) - 2.66 * k);
        return y - (cyq - 5.5 * k + tri * 2.2) > 0 ? -1 : 1;
      }, RAMPS.gold, (x, y) => clamp(0.3 + (x - cxq + 8 * k) / (20 * k) + (y < cyq ? 0.2 : 0)), '#4a2c00');
      g.drawImage(crown, 0, 0);
      px(g, '#e8402a', [[cxq - 1.2 * k, cyq + 0.2 * k, 2.4 * k, 2 * k]]);
      px(g, '#5fd4ff', [[cxq - 6 * k, cyq + 0.6 * k, 1.6 * k, 1.4 * k], [cxq + 4.6 * k, cyq + 0.6 * k, 1.6 * k, 1.4 * k]]);
    }
    return mkSpr(c, 1);
  }

  function flower(f) {
    const W = 28, H = 36, sway = Math.sin(f / 4 * Math.PI * 2) * 1.3, hx = 14 + sway, hy = 11;
    const stem = part(W, H, (x, y) => Math.min(S.seg(x, y, 14, 33, hx, hy + 4, 1.3), S.ellipse(x, y, 9, 25, 4.4, 2), S.ellipse(x, y, 19.5, 28, 4.4, 2)), RAMPS.leaf,
      (x, y) => clamp(0.75 - (y - 20) * 0.03 + (x - 14) * 0.03), '#06300e');
    const head = part(W, H, (x, y) => {
      let d = 99;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; d = Math.min(d, S.circle(x, y, hx + Math.cos(a) * 5.6, hy + Math.sin(a) * 5.6, 4)); }
      return Math.min(d, S.circle(x, y, hx, hy, 5));
    }, RAMPS.petal, (x, y) => {
      const r = Math.hypot(x - hx, y - hy);
      if (r < 4.6) return tone(RAMPS.pollen, sphereLight(x, y, hx, hy, 5.2) + 0.1, x | 0, y | 0, D);
      return clamp(sphereLight(x, y, hx, hy, 11) + (r > 8 ? 0.12 : -0.12));
    }, '#4a0830');
    const g = head.getContext('2d');
    px(g, '#4a2200', [[hx - 3, hy - 1, 2, 2], [hx + 1, hy - 1, 2, 2]]);
    if (f === 3) px(g, '#4a2200', [[hx - 1.5, hy + 2, 3, 2]]); else px(g, '#4a2200', [[hx - 1.5, hy + 2.4, 3, 1]]);
    return mkSpr(stack(stem, head), 1.5);
  }

  function germfly(f) {
    const W = 28, H = 22, cx = 14, cy = 13, up = f % 2 === 0;
    const wings = part(W, H, (x, y) => Math.min(S.ellipse(x, y, cx + 3, up ? cy - 7.5 : cy - 4, 3.2, up ? 4.6 : 2.6), S.ellipse(x, y, cx + 7.5, up ? cy - 6 : cy - 3, 3, up ? 4 : 2.4)), RAMPS.cloud,
      () => [220, 240, 255, 170], '#5a7ab0');
    const body = part(W, H, (x, y) => Math.min(S.ellipse(x, y, cx, cy, 6.4, 5.2), S.cone(x, y, cx + 5, cy + 1, 2.4, cx + 11, cy + 2.5, 0.5)), RAMPS.germ,
      (x, y) => { let t = sphereLight(x, y, cx, cy, 7.5); if (Math.floor((x + 100) / 2.5) % 2 === 0 && x > cx + 2) t -= 0.22; return clamp(t); }, '#062a0c');
    const g = body.getContext('2d');
    eye(g, cx - 3.5, cy - 0.5, 2, -0.6, 0.3); eye(g, cx + 1, cy - 0.5, 2, -0.6, 0.3);
    px(g, '#062a0c', [[cx - 3, cy + 3, 3, 1]]);
    return mkSpr(stack(wings, body), 0.5);
  }

  // ================================================================== NPCs
  function legsOf(g, x1, x2, y, col = '#3c2110') { px(g, col, [[x1, y, 2, 4], [x2, y, 2, 4], [x1 - 1, y + 3, 3, 2], [x2, y + 3, 3, 2]]); }
  function cuteFace(g, x, y, gap = 7, smile = true) {
    eye(g, x - gap / 2, y, 2.4, 0.5, 0.2); eye(g, x + gap / 2, y, 2.4, 0.5, 0.2);
    px(g, '#ff9ab0', [[x - gap / 2 - 4, y + 3, 2, 1], [x + gap / 2 + 2, y + 3, 2, 1]]);
    if (smile) px(g, '#10101c', [[x - 2, y + 4, 1, 1], [x - 1, y + 5, 3, 1], [x + 2, y + 4, 1, 1]]);
  }
  function buildNpcs() {
    { // Leafa
      const W = 38, H = 44, cx = 19, cy = 23;
      const c = part(W, H, (x, y) => Math.min(S.cone(x, y, cx, cy, 12, cx + 3, 3, 1), S.seg(x, y, cx - 2, 36, cx - 5, 39, 1)), RAMPS.leaf, (x, y, d) => {
        let t = sphereLight(x, y, cx, cy, 15) * 0.9 + 0.1;
        const vx = Math.abs(x - cx - (cy - y) * 0.13);
        if (vx < 0.8 && y < 20) t += 0.25;
        if (Math.abs(((y + vx * 0.9) % 6) - 3) < 0.6 && y < 30 && vx > 1 && vx < 9) t += 0.14;
        if (d > -2) t -= 0.12;
        return clamp(t);
      }, '#06300e');
      const g = c.getContext('2d');
      cuteFace(g, cx, 24);
      legsOf(g, cx - 5, cx + 3, 36);
      SPR.npc_leafa = mkSpr(c, 1);
    }
    { // Prof. Mesh
      const W = 38, H = 42, cx = 19, cy = 18;
      const c = part(W, H, (x, y) => S.box(x, y, cx, cy, 14, 14, 2), RAMPS.card, (x, y, d) => {
        if (d > -2.6) return clamp(0.3 + (x - 5) / 50 - (y - 4) / 80);
        const pleat = ((x - 6) % 4) / 4;
        return clamp(0.52 + (pleat < 0.5 ? 0.22 : -0.1) - (y - 4) / 90 + (hash(x | 0, y | 0, 2) > 0.93 ? -0.25 : 0));
      }, '#2c2010');
      const g = c.getContext('2d');
      for (const ex of [cx - 5, cx + 5]) {
        for (let a = 0; a < 6.3; a += 0.08) px(g, '#2c2010', [[Math.round(ex + Math.cos(a) * 4.2), Math.round(15 + Math.sin(a) * 4.2)]]);
        px(g, '#d8f0ff', [[ex - 3, 13, 6, 5], [ex - 2, 12, 4, 7]]); px(g, '#ffffff', [[ex - 2, 13, 2, 1]]); px(g, '#10101c', [[ex, 15, 2, 2]]);
      }
      px(g, '#2c2010', [[cx - 1, 15, 2, 1], [cx - 8, 9, 6, 1], [cx + 3, 9, 6, 1]]);
      px(g, '#f8f8ff', [[cx - 8, 22, 16, 3], [cx - 10, 23, 3, 3], [cx + 7, 23, 3, 3], [cx - 5, 25, 10, 1]]);
      px(g, '#c8ccdc', [[cx - 8, 24, 16, 1]]);
      legsOf(g, cx - 7, cx + 5, 33, '#2c2010');
      SPR.npc_mesh = mkSpr(c, 1.5);
    }
    { // Frosty
      const W = 36, H = 40, cx = 18, cy = 17;
      const c = part(W, H, (x, y) => S.box(x, y, cx, cy, 13, 13, 4), RAMPS.ice, (x, y, d) => {
        let t = 0.5 + (cx - x) * 0.012 + (cy - y) * 0.018;
        if (d > -2.2) t += (x + y < cx + cy) ? 0.32 : -0.25;
        const dg = (x - y + 60) % 13;
        if (dg < 2.2 && d < -3) t += 0.28;
        if (S.box(x, y, cx + 2, cy + 3, 6, 6, 2) < 0 && S.box(x, y, cx + 2, cy + 3, 5, 5, 2) > 0) t -= 0.14;
        return clamp(t);
      }, '#123c7a');
      const g = c.getContext('2d');
      cuteFace(g, cx, 17, 8);
      legsOf(g, cx - 6, cx + 4, 31, '#123c7a');
      SPR.npc_frosty = mkSpr(c, 1.5);
    }
    { // Granny Cloud
      const W = 50, H = 38;
      const puffs = [[13, 22, 9], [24, 17, 11], [36, 21, 9], [42, 25, 6], [25, 26, 10], [8, 26, 6], [31, 8.5, 4.4]];
      const c = part(W, H, (x, y) => { let d = 99; for (const [a, b, r] of puffs) d = Math.min(d, S.circle(x, y, a, b, r)); return d; }, RAMPS.cloud, (x, y, d) => {
        let t = 0.95 - Math.max(0, y - 16) * 0.035 + (x - 25) * 0.004;
        if (d > -1.8 && y > 24) t -= 0.2;
        return clamp(t);
      }, '#4a5a8a');
      const g = c.getContext('2d');
      for (const ex of [19, 30]) { for (let a = 0; a < 6.3; a += 0.08) px(g, '#6a4a8a', [[Math.round(ex + Math.cos(a) * 3.8), Math.round(20 + Math.sin(a) * 3.8)]]); px(g, '#10101c', [[ex - 1, 20, 2, 2]]); }
      px(g, '#6a4a8a', [[23, 20, 4, 1]]);
      px(g, '#ff9ab0', [[13, 24, 3, 2], [33, 24, 3, 2]]);
      px(g, '#10101c', [[22, 26, 1, 1], [23, 27, 4, 1], [27, 26, 1, 1]]);
      SPR.npc_granny = mkSpr(c, 1);
    }
    { // Buzzby
      const W = 34, H = 30, cx = 17, cy = 17;
      const wings = part(W, H, (x, y) => Math.min(S.ellipse(x, y, cx - 4, cy - 10, 4, 6), S.ellipse(x, y, cx + 4, cy - 10, 4, 6)), RAMPS.cloud, () => [225, 242, 255, 190], '#5a7ab0');
      const c = part(W, H, (x, y) => Math.min(S.ellipse(x, y, cx, cy, 10, 8), S.cone(x, y, cx - 8, cy + 1, 2.5, cx - 13, cy + 2, 0.4)), RAMPS.bee, (x, y) => {
        if (x < cx - 1 && Math.floor((x + 2) / 3) % 2 === 0) return [34, 24, 28];
        return clamp(sphereLight(x, y, cx, cy, 11) + 0.1);
      }, '#22181c');
      const g = c.getContext('2d');
      eye(g, cx + 3, cy - 1, 2.4, 0.6, 0.2); eye(g, cx + 8, cy - 1, 2.2, 0.6, 0.2);
      px(g, '#22181c', [[cx + 4, cy + 4, 3, 1], [cx + 3, cy - 9, 1, 3], [cx + 7, cy - 9, 1, 3], [cx + 2, cy - 10, 2, 2], [cx + 7, cy - 10, 2, 2]]);
      SPR.npc_bee = mkSpr(stack(wings, c), 2);
    }
  }

  // =============================================================== OBJECTS
  function buildObjects() {
    // water drop pickup (shimmering)
    SPR.drop = [0, 1, 2, 3].map(f => {
      const W = 16, H = 20, cx = 8, cy = 12.5;
      return mkSpr(part(W, H, (x, y) => S.cone(x, y, cx, cy, 5.4, cx, 2.5, 0.7), RAMPS.water, (x, y, d) => {
        let t = 0.3 + sphereLight(x, y, cx, cy, 7) * 0.45;
        const sx = cx + 1.8 - f * 1.3;
        if (Math.abs(x - sx - (y - cy) * 0.3) < 0.9 && d < -1.2 && y > 7) t = 0.95;
        if (d > -1.6 && x < cx) t -= 0.18;
        return clamp(t);
      }, N), 0);
    });
    const heartSdf = (x, y, cx, cy, s) => {
      const X = (x - cx) / s, Y = (y - cy) / s;
      return Math.min(S.circle(X, Y, -2.6, -1.6, 3.1), S.circle(X, Y, 2.6, -1.6, 3.1), (Math.abs(X) + Y * 0.95 - 4.6 < 0 && Y > -1.6) ? -1 : 1) * s;
    };
    SPR.heart = mkSpr(part(18, 16, (x, y) => heartSdf(x, y, 9, 7, 1.15), RAMPS.heart, (x, y) => {
      let t = 0.35 + sphereLight(x, y, 9, 7, 9) * 0.55;
      if (S.circle(x, y, 6, 4.6, 1.5) < 0) t = 1;
      return clamp(t);
    }, '#3a0412'));
    SPR.heartEmpty = mkSpr(part(18, 16, (x, y) => heartSdf(x, y, 9, 7, 1.15), RAMPS.smog, () => [20, 26, 60, 150], '#0d1b5e'));
    // air crystal: the hidden treasure (3 per level), a faceted golden gem with a travelling glint
    const gem = (W, H, f) => {
      const cx = W / 2, cy = H / 2, rx = W / 2 - 2.5, ry = H / 2 - 2.5;
      return part(W, H, (x, y) => (Math.abs(x - cx) / rx + Math.abs(y - cy) / ry - 1) * Math.min(rx, ry) * 0.7, RAMPS.gold, (x, y, d) => {
        const X = x - cx, Y = y - cy;
        let t = X < 0 ? (Y < -ry * 0.25 ? 0.72 : 0.3) : (Y < -ry * 0.25 ? 0.95 : 0.52);
        if (Math.abs(Y + ry * 0.25) < 0.6) t += 0.14;                       // girdle
        if (Math.abs(X) < 0.6 && Y > -ry * 0.25) t -= 0.12;                  // keel
        if (f >= 0 && Math.abs(X + Y * 0.6 - (f * 5 - 7.5)) < 1.1 && d < -0.8) t = 1; // glint
        return clamp(t);
      }, '#4a2000');
    };
    SPR.crystal = [0, 1, 2, 3].map(f => mkSpr(gem(22, 28, f), 0));
    SPR.crystalIcon = mkSpr(gem(14, 16, -1), 0);
    SPR.crystalEmpty = mkSpr(part(14, 16, (x, y) => (Math.abs(x - 7) / 4.5 + Math.abs(y - 8) / 5.5 - 1) * 3.2, RAMPS.smog, () => [20, 26, 60, 150], '#0d1b5e'), 0);
    // projectiles (face right)
    SPR.shot = [0, 1].map(f => mkSpr(part(18, 12, (x, y) => S.cone(x, y, 12, 6, 4.2, 2 + f * 2, 6, 0.6), RAMPS.water, (x, y) => {
      let t = 0.45 + sphereLight(x, y, 12, 6, 5.5) * 0.45;
      if (S.circle(x, y, 13.4, 4.4, 1.1) < 0) t = 1;
      if (x < 8) t += 0.15;
      return clamp(t);
    }, N)));
    const ball = (rmp, ol, fuzzy) => mkSpr(part(10, 10, (x, y) => S.circle(x, y, 5, 5, 3.4) - (fuzzy ? (hash(x | 0, y | 0, 3) - 0.5) * 1.3 : 0), rmp, (x, y) => clamp(sphereLight(x, y, 5, 5, 4.4) + 0.12), ol));
    SPR.spore = ball(RAMPS.mold, '#080e02', true);
    SPR.soot = ball(RAMPS.smog, '#050508', true);
    SPR.pollenBall = ball(RAMPS.pollen, '#4a2200', false);

    // checkpoint flag: [0] inactive, [1..4] waving
    const flag = (active, f) => {
      const W = 36, H = 48;
      const pole = part(W, H, (x, y) => Math.min(S.box(x, y, 7, 26, 1.2, 20, 0.5), S.circle(x, y, 7, 5, 2.2), S.box(x, y, 7, 46, 6, 1.6, 1.5)), RAMPS.metal, (x, y) => clamp(0.55 + (x - 7) * 0.2 - (y > 44 ? 0.2 : 0) + (y < 8 ? 0.2 : 0)), '#0d1220');
      const cloth = part(W, H, (x, y) => {
        if (active) {
          if (x < 9 || x > 31) return 1;
          const k2 = (x - 9) / 22;
          return Math.abs(y - 15 - Math.sin(x * 0.42 - f * 1.57) * 2.2 * k2) - (8 - k2 * 1.2);
        }
        // drooping flag
        if (x < 9 || x > 17) return 1;
        return Math.abs(y - 18 - (x - 9) * 0.5) - (10 - (x - 9) * 0.5);
      }, active ? RAMPS.water : RAMPS.dust, (x, y) => {
        const k2 = (x - 9) / 22;
        if (!active) return clamp(0.6 - (x - 9) * 0.05 + Math.sin(x * 1.6) * 0.1);
        const sl = Math.cos(x * 0.42 - f * 1.57);
        const yo = Math.sin(x * 0.42 - f * 1.57) * 2.2 * k2;
        if (S.cone(x, y - yo, 19, 16.5, 3.2, 19, 10.5, 0.5) < 0) return [255, 255, 255]; // droplet emblem
        return clamp(0.5 + sl * 0.3 * k2 + 0.08);
      }, active ? N : '#201c28');
      return mkSpr(stack(cloth, pole), 0);
    };
    SPR.checkpoint = [flag(false, 0), flag(true, 0), flag(true, 1), flag(true, 2), flag(true, 3)];

    // wooden sign
    {
      const W = 36, H = 32;
      const c = part(W, H, (x, y) => Math.min(S.box(x, y, 18, 10.5, 15, 8.5, 2), S.box(x, y, 18, 25, 2, 6.5, 0.5)), RAMPS.wood, (x, y) => {
        if (y > 19.5) return clamp(0.35 + (x - 17) * 0.16);
        let t = 0.62 + Math.sin(y * 1.9 + Math.sin(x * 0.3) * 1.5) * 0.12 - (y - 3) * 0.012;
        if (y < 3.5) t += 0.2;
        if (y > 17) t -= 0.2;
        return clamp(t);
      }, '#1e0e04');
      const g = c.getContext('2d');
      px(g, '#3c2110', [[8, 7, 14, 1], [8, 10, 20, 1], [8, 13, 17, 1], [24, 7, 4, 1]]);
      px(g, '#e4e4f0', [[5, 4, 1, 1], [30, 4, 1, 1], [5, 16, 1, 1], [30, 16, 1, 1]]);
      SPR.sign = mkSpr(c, 0);
    }
    // riddle terminal: [0],[1] waiting (blinking "?"), [2] solved
    const terminal = (mode) => {
      const W = 36, H = 44;
      const c = part(W, H, (x, y) => Math.min(S.box(x, y, 18, 13, 14.5, 11.5, 3), S.box(x, y, 18, 31, 3.4, 8, 0.5), S.box(x, y, 18, 40.5, 11, 2.6, 2)), RAMPS.metal, (x, y, d) => {
        if (y < 25 && S.box(x, y, 18, 13, 11, 8, 1.5) < 0) {
          const scan = (y | 0) % 2 ? 0.86 : 1;
          const base = mode === 2 ? [10, 46, 22] : [8, 34, 40];
          const v = 0.8 + (1 - Math.hypot(x - 18, y - 13) / 14) * 0.5;
          return [base[0] * v * scan, base[1] * v * scan, base[2] * v * scan];
        }
        if (y > 37) return clamp(0.5 - (y - 38) * 0.08 + (x - 18) * 0.01);
        return clamp(0.62 - (y - 2) * 0.014 + (x - 18) * 0.012 + (d > -1.6 ? 0.18 : 0));
      }, '#0a0e18');
      const g = c.getContext('2d');
      const col = mode === 2 ? '#7cff4f' : (mode === 0 ? '#5ff4ff' : '#bffcff');
      if (mode === 2) px(g, col, [[12, 14], [13, 15], [14, 16], [15, 15], [16, 14], [17, 13], [18, 12], [19, 11], [20, 10], [21, 9], [13, 14], [14, 15], [15, 14], [16, 13], [17, 12], [18, 11], [19, 10], [20, 9]]);
      else px(g, col, [[15, 8, 6, 2], [14, 9, 2, 2], [20, 9, 2, 3], [18, 12, 3, 2], [17, 13, 2, 3], [17, 18, 2, 2]]);
      px(g, mode === 2 ? '#7cff4f' : '#ff5a3a', [[9, 23, 2, 1]]); px(g, '#ffd23f', [[13, 23, 2, 1]]); px(g, '#5fd4ff', [[17, 23, 2, 1]]);
      return mkSpr(c, 0.2);
    };
    SPR.terminal = [terminal(0), terminal(1), terminal(2)];
    // lever [off, on]
    SPR.lever = [false, true].map(on => {
      const W = 36, H = 24, bx = on ? 26 : 10;
      const c = part(W, H, (x, y) => Math.min(S.box(x, y, 18, 19.5, 12, 3.5, 2), S.seg(x, y, 18, 17, bx, 6, 1.2), S.circle(x, y, bx, 5, 3.4)), RAMPS.metal, (x, y) => {
        if (S.circle(x, y, bx, 5, 3.6) < 0) return tone(on ? RAMPS.green : RAMPS.red, sphereLight(x, y, bx, 5, 4.2) + 0.1, x | 0, y | 0, D);
        return clamp(0.6 - (y - 16) * 0.06 + (x - 18) * 0.012);
      }, '#0a0e18');
      px(c.getContext('2d'), on ? '#7cff4f' : '#ff5a3a', [[16, 19, 4, 2]]);
      return mkSpr(c, 0);
    });
    // spring [rest, extended]
    SPR.spring = [false, true].map(ext => {
      const W = 34, H = 34, top = ext ? 6 : 16;
      const c = part(W, H, (x, y) => {
        let d = Math.min(S.box(x, y, 17, 30.5, 13, 2.5, 1.5), S.box(x, y, 17, top + 2, 14, 2.6, 2));
        const n = 3;
        for (let i = 0; i < n; i++) {
          const y0 = top + 5 + (27 - top - 5) * i / n, y1 = top + 5 + (27 - top - 5) * (i + 1) / n;
          d = Math.min(d, S.seg(x, y, i % 2 ? 9 : 25, y0, i % 2 ? 25 : 9, y1, 1.3));
        }
        return d;
      }, RAMPS.metal, (x, y) => {
        if (y < top + 5) return tone(RAMPS.red, clamp(0.75 - (y - top) * 0.1 + (17 - x) * 0.01), x | 0, y | 0, D);
        if (y > 27.5) return clamp(0.45 - (y - 28) * 0.07);
        return clamp(0.7 + (17 - x) * 0.02);
      }, '#0a0e18');
      return mkSpr(c, 0.5);
    });
    // vapor jump power-up
    SPR.power = [0, 1].map(f => {
      const W = 34, H = 26, puffs = [[10, 15, 6], [17, 11, 7.5 + f * 0.5], [25, 15, 6], [17, 17, 7]];
      return mkSpr(part(W, H, (x, y) => { let d = 99; for (const [a, b, r] of puffs) d = Math.min(d, S.circle(x, y, a, b, r)); return d; }, RAMPS.cloud,
        (x, y, d) => clamp(0.98 - Math.max(0, y - 12) * 0.045 - (d > -1.5 && y > 16 ? 0.15 : 0)), '#3a78c8'));
    });
    // moving platform (48 logical px wide)
    {
      const W = 98, H = 26;
      const c = part(W, H, (x, y) => Math.min(S.box(x, y, 49, 7, 47.5, 5.5, 2), S.box(x, y, 49, 15.5, 30, 3.5, 2), S.box(x, y, 49, 21, 9, 3, 1.5)), RAMPS.metal, (x, y) => {
        if (y < 3.2) return 0.98;
        if (y < 12.5) {
          if (y > 5 && y < 9.5) return Math.floor((x + y) / 5) % 2 === 0 ? [255, 200, 40] : [40, 36, 44];
          return clamp(0.62 - (y - 3) * 0.03);
        }
        if (y > 18.5) return [95, 212, 255];
        return clamp(0.4 - (y - 12) * 0.03 + ((x | 0) % 12 < 2 ? 0.2 : 0));
      }, '#0a0e18');
      SPR.platform = mkSpr(c, 0);
    }
    // conveyor tile frames (belt moving right; mirrored for left)
    SPR.conveyor = [0, 1, 2, 3].map(f => mkSpr(paint(32, 32, (x, y, ix, iy) => {
      if (y < 2) return [20, 22, 30];
      if (y < 9) {
        const s = ((ix - f * 2) % 8 + 8) % 8;
        const chev = Math.abs(s - 4 + Math.abs(y - 5.5) * 0.8) < 1.3 && Math.abs(y - 5.5) < 2.6;
        return chev ? [255, 200, 40] : tone(RAMPS.smog, 0.5 - (y - 2) * 0.05, ix, iy, 0.3);
      }
      if (y < 11) return [20, 22, 30];
      // wheels & chassis
      const wx = ((ix + 8) % 16) - 8, wd = Math.hypot(wx, y - 19);
      if (wd < 6.5) {
        if (wd > 5) return [26, 30, 40];
        const a = Math.atan2(y - 19, wx) + f * 0.8;
        return tone(RAMPS.metal, 0.45 + (Math.cos(a * 3) > 0.6 ? 0.3 : 0) + (wd < 1.6 ? 0.4 : 0), ix, iy, 0.3);
      }
      return tone(RAMPS.metal, 0.22 - (y - 11) * 0.006 + (y > 28 ? -0.1 : 0), ix, iy, 0.4);
    })));
    // riddle gate (energy bars) frames + lever door
    SPR.gate = [0, 1, 2, 3].map(f => mkSpr(paint(32, 32, (x, y, ix, iy) => {
      const bx = ((ix + 5) % 11);
      const flick = hash(ix, Math.floor((iy + f * 9) / 3), f) * 0.5 + 0.5;
      if (bx < 5) {
        const c0 = Math.abs(bx - 2);
        if (c0 === 0) return [255, 250, 200];
        if (c0 === 1) return [255, 180 * flick + 60, 40];
        return [240, 70, 30, 200];
      }
      const a = 50 + 40 * flick * (Math.sin((iy + f * 8) * 0.4) * 0.5 + 0.5);
      return [255, 90, 30, a];
    })));
    SPR.door = mkSpr(paint(32, 32, (x, y, ix, iy) => {
      if (ix < 2 || ix > 29) return tone(RAMPS.metal, 0.2, ix, iy, 0.3);
      const slat = iy % 8;
      if ((iy >> 3) % 2 === 0 && slat > 1 && slat < 7 && ix > 4 && ix < 27) return ((ix + iy) >> 2) % 2 ? [255, 200, 40] : [40, 36, 44];
      return tone(RAMPS.metal, slat === 0 ? 0.9 : slat === 7 ? 0.15 : 0.55 - slat * 0.03, ix, iy, 0.3);
    }));
    // exit vent door: [closed, open]
    SPR.exit = [false, true].map(open => {
      const W = 52, H = 72;
      const c = part(W, H, (x, y) => S.box(x, y, 26, 38, 24, 33, 10), RAMPS.metal, (x, y, d) => {
        const inner = S.box(x, y, 26, 40, 17, 27, 6);
        if (inner < 0) {
          if (open) {
            const v = clamp(1 - Math.hypot(x - 26, (y - 44) * 0.7) / 30);
            const ray = Math.sin(Math.atan2(y - 70, x - 26) * 9) > 0.5 ? 0.12 : 0;
            return GFX.mixc([40, 150, 230], [235, 252, 255], clamp(v * 1.1 + ray));
          }
          const sl = (y | 0) % 6;
          return tone(RAMPS.metal, sl < 1 ? 0.5 : sl < 2 ? 0.1 : 0.26 - (y - 12) * 0.002, x | 0, y | 0, 0.3);
        }
        if (inner < 1.6) return 0.08;
        let t = 0.58 + (26 - x) * 0.008 - (y - 6) * 0.005 + (d > -2 ? 0.25 : 0);
        if (hash(Math.floor(x / 9), Math.floor(y / 9), 4) > 0.5 && Math.hypot((x % 9) - 4.5, (y % 9) - 4.5) < 1.3 && inner > 3) t -= 0.3;
        return clamp(t);
      }, '#0a0e18');
      px(c.getContext('2d'), open ? '#7cff4f' : '#ff3a2a', [[24, 7, 4, 3]]);
      px(c.getContext('2d'), '#ffffff', [[24, 7, 1, 1]]);
      return mkSpr(c, 0);
    });
  }

  window.buildSprites = function buildSprites() {
    buildPichon();
    SPR.pollen = [0, 1, 2, 3].map(f => pollen(f));
    SPR.virus = [0, 1, 2, 3].map(f => virus(f));
    SPR.bacteria = [0, 1, 2, 3].map(f => bacteria(f));
    SPR.dust = [0, 1, 2, 3].map(f => dustBunny(f));
    SPR.smog = [0, 1, 2, 3].map(f => smog(f));
    SPR.mold = [0, 1, 2, 3].map(f => mold(f));
    SPR.flower = [0, 1, 2, 3].map(f => flower(f));
    SPR.germfly = [0, 1].map(f => germfly(f));
    SPR.boss_dustbaron = [0, 1, 2, 3].map(f => dustBunny(f, 2.4, true));
    SPR.boss_moldqueen = [0, 1, 2, 3].map(f => mold(f, 2.2, true));
    SPR.boss_smogmaw = [0, 1, 2, 3].map(f => smog(f, 3, true));
    buildNpcs();
    buildObjects();
  };
})();
