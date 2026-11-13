// Terrain: every level's ground is painted per pixel in WORLD space (no repeating
// tiles) by a theme shader that knows how far each pixel is from open air.
// Also generates and scatters decorative props (some of which emit light).
'use strict';

const THEMES = {
  // liquid/liquidHi: hazard pools - fillHi: debris colour - amb: ambient light (multiplied over the scene)
  meadow:     { shader: 'soil',   liquid: '#2a6ad0', liquidHi: '#8fd0ff', fillHi: '#c08a50', amb: null, mote: '#fff8b0', fog: 'rgba(196,234,255,0.3)' },
  hills:      { shader: 'soil',   liquid: '#2a6ad0', liquidHi: '#8fd0ff', fillHi: '#cc9a5a', amb: null, mote: '#ffd0e8', fog: 'rgba(255,216,176,0.3)' },
  city:       { shader: 'brick',  liquid: '#4a4030', liquidHi: '#8a7a50', fillHi: '#a0a8bc', amb: '#c8c4d0', mote: '#9a9aa4', fog: 'rgba(126,112,138,0.3)' },
  duct:       { shader: 'panel',  liquid: '#20242e', liquidHi: '#5a6478', fillHi: '#86a2c4', amb: '#56628e', mote: '#c8d4e8', fog: 'rgba(8,14,32,0.4)' },
  filter:     { shader: 'pleat',  liquid: '#5a4a2a', liquidHi: '#8a7a50', fillHi: '#d2c08c', amb: '#8a7a66', mote: '#e8dcc0', fog: 'rgba(28,20,8,0.45)' },
  ice:        { shader: 'ice',    liquid: '#1a4a8a', liquidHi: '#7fd3f0', fillHi: '#c0e8ff', amb: '#8aa8e0', mote: '#ffffff', fog: 'rgba(6,22,64,0.6)' },
  drain:      { shader: 'brick',  liquid: '#4c8a10', liquidHi: '#c4f040', fillHi: '#5a8a78', amb: '#4a6a62', mote: '#a0e060', fog: 'rgba(3,12,9,0.5)' },
  compressor: { shader: 'panel',  liquid: '#e04a08', liquidHi: '#ffd040', fillHi: '#eaa860', amb: '#a8705a', mote: '#ffb040', fog: 'rgba(28,8,2,0.45)' },
  factory:    { shader: 'brick',  liquid: '#2a2a1a', liquidHi: '#7a7a2a', fillHi: '#b06a48', amb: '#a08878', mote: '#ff9040', fog: 'rgba(58,30,26,0.34)' },
  sky:        { shader: 'cloud',  liquid: '#3a3a4a', liquidHi: '#6a6a7a', fillHi: '#efeafc', amb: '#b0a4d8', mote: '#ffffff', fog: 'rgba(40,24,80,0.22)' },
};

const TERRAIN = (() => {
  const { ramp, tone, hash, vnoise, fbm, worley, clamp, smooth, sd: S, paint, outline, sphereLight } = GFX;
  const PX = 32;      // art pixels per tile
  const CH_W = 4;     // chunk width in tiles

  const R = {
    meadowGrass: ramp('#14562a', '#1f8236', '#36b446', '#6ada52', '#b4f67e'),
    meadowDirt: ramp('#2c170c', '#472612', '#63391a', '#825026', '#a06c38', '#be8c52'),
    hillsGrass: ramp('#2a5a14', '#44861e', '#70b62e', '#a6de4a', '#e2fa8c'),
    hillsDirt: ramp('#30190e', '#4e2c14', '#6e431e', '#8e5e2e', '#b07e44', '#d0a264'),
    stone: ramp('#34343f', '#54545f', '#787886', '#a2a2b0', '#cecedc'),
    cityBrick: ramp('#1e2030', '#303446', '#484e62', '#626a82', '#828ca4', '#a8b2c6'),
    cityCap: ramp('#4a5062', '#727a8c', '#a0a8b8', '#ccd4de', '#f0f4f8'),
    facBrick: ramp('#1c0e0c', '#361914', '#55271c', '#763828', '#964e38', '#b86c4e'),
    facCap: ramp('#1c1c22', '#34343c', '#54545e', '#7c7c88', '#a8a8b4'),
    drainStone: ramp('#0a1614', '#132823', '#1f3e36', '#2f574c', '#447264', '#5e9080'),
    moss: ramp('#123a0e', '#226418', '#3e9424', '#6cc43c', '#aaec66'),
    ductMetal: ramp('#111a2e', '#1e2c48', '#304466', '#476088', '#6484ac', '#90acd0', '#c8dcf0'),
    hotMetal: ramp('#200c06', '#3c170c', '#5e2a14', '#84401e', '#aa5e2c', '#d08444', '#f0b46c'),
    paper: ramp('#4a3c22', '#6e5c34', '#96824e', '#bca870', '#dccc98', '#f4e8c4'),
    lint: ramp('#3e3a36', '#5e5a54', '#86827a', '#b2aea4', '#dcd8cc'),
    ice: ramp('#0e2e6a', '#1c529e', '#3682cc', '#62b0ec', '#9cd8fc', '#d4f2ff', '#ffffff'),
    cloud: ramp('#6a5a9a', '#8f82bc', '#b6acdc', '#d8d0f0', '#f0ecfc', '#ffffff'),
    clay: ramp('#5a1e0c', '#8a3414', '#b8501e', '#dc7430', '#f49c50', '#ffc880'),
    pinkStone: ramp('#5a2048', '#8a3470', '#b4549a', '#d880be', '#f4b0de'),
    wood: ramp('#2c170a', '#4c2a12', '#70441e', '#946230', '#b88648', '#d8ac6c'),
    steel: ramp('#161c2a', '#2a3448', '#465672', '#6a7e9e', '#98acc8', '#d0dcec'),
    rust: ramp('#1e0e08', '#3c1c0e', '#643018', '#8c4a24', '#b06c38', '#cc9458'),
    thorn: ramp('#1a2a0c', '#34501a', '#5a7a2a', '#8aaa4a'),
    ember: ramp('#5a0c00', '#b02800', '#f05a08', '#ffa020', '#ffe880'),
    storm: ramp('#1c1430', '#34285a', '#54448a', '#8070b8'),
  };

  const SET = {
    meadow: { top: R.meadowGrass, body: R.meadowDirt, block: ['brick', R.clay], plank: R.wood, spike: R.thorn },
    hills: { top: R.hillsGrass, body: R.hillsDirt, block: ['brick', R.pinkStone], plank: R.wood, spike: R.thorn, flowers: true },
    city: { body: R.cityBrick, cap: R.cityCap, block: ['brick', R.clay], plank: R.steel, spike: R.steel },
    duct: { body: R.ductMetal, block: ['girder', R.steel], plank: R.steel, spike: R.steel },
    filter: { body: R.paper, top: R.lint, block: ['girder', R.wood], plank: R.wood, spike: R.steel },
    ice: { body: R.ice, block: ['brick', R.ice], plank: R.steel, spike: R.ice },
    drain: { body: R.drainStone, cap: R.moss, block: ['brick', R.drainStone], plank: R.rust, spike: R.rust, mossy: true },
    compressor: { body: R.hotMetal, block: ['girder', R.steel], plank: R.steel, spike: R.ember, hot: true },
    factory: { body: R.facBrick, cap: R.facCap, block: ['girder', R.rust], plank: R.rust, spike: R.steel, sooty: true },
    sky: { body: R.cloud, block: ['brick', R.cloud], plank: R.cloud, spike: R.storm },
  };

  // --------------------------------------------------------- shaders
  // P: wx, wy (world art px), lx, ly (0..31), dT/dB/dL/dR/edge (px to open air), ix, iy
  const SH = {
    soil(P, T) {
      const { wx, wy, dT } = P;
      const side = Math.min(P.dL, P.dR);
      const gh = 6 + vnoise(wx / 9, 3, 1) * 5 + (hash(wx >> 1, 7, 2) > 0.72 ? 3 : 0) + (side < 4 && dT < 20 ? (4 - side) * 3 : 0);
      if (dT < gh) {
        let t = 0.86 - (dT / gh) * 0.62 + (hash(wx >> 1, 3, 4) - 0.5) * 0.22;
        if (dT < 1.5) t = 1; else if (dT < 3.5) t += 0.1;
        if (dT > gh - 2) t -= 0.2;
        if (T.flowers && dT < 4 && hash(wx >> 2, 5, 9) > 0.9) return dT < 2.5 ? [[255, 150, 210], [255, 220, 80], [255, 255, 255]][(hash(wx >> 2, 1, 3) * 3) | 0] : tone(T.top, 0.4, P.ix, P.iy, 0.4);
        return tone(T.top, t, P.ix, P.iy, 0.5);
      }
      const dd = dT - gh;
      let t = 0.66 - smooth(0, 150, dT) * 0.34 + (fbm(wx / 46, wy / 13, 3, 5) - 0.5) * 0.42;
      if (dd < 4) t -= 0.26 - dd * 0.05;                           // shadow under the turf
      const w = worley(wx / 30, wy / 22, 11);                       // embedded stones (in loose clusters)
      const rad = 0.12 + w.id * 0.3;
      if (w.id > 0.3 && fbm(wx / 150, wy / 90, 2, 21) > 0.5 && w.d1 < rad && dd > 5) {
        if (w.d1 > rad - 0.06) return tone(T.body, 0.02, P.ix, P.iy, 0);
        const lt = 0.62 - ((wx / 30 - w.px) + (wy / 22 - w.py)) * 1.7;
        return tone(R.stone, lt - smooth(0, 200, dT) * 0.14, P.ix, P.iy, 0.5);
      }
      if (hash(wx >> 1, wy >> 1, 6) > 0.975) t += 0.2;              // grit
      const band = (wy + Math.sin(wx / 37) * 9 + fbm(wx / 60, 1, 2, 3) * 30) % 46;   // strata lines
      if (band < 2.2 && dd > 8) t -= 0.13;
      if (dd < 22 && hash(wx >> 1, 9, 8) > 0.9 && dd < 8 + hash(wx >> 1, 2, 2) * 14) t -= 0.18; // roots
      if (Math.min(side, P.dB) < 2) t = 0.02; else if (Math.min(side, P.dB) < 6) t -= 0.14;
      return tone(T.body, t, P.ix, P.iy, 0.7);
    },
    soilAir(P, T) {
      if (P.below !== '#' || P.dDown > 7) return null;
      const col = P.wx >> 1;
      const h1 = hash(col, 11, 3);
      const bh = h1 > 0.45 ? 1 + ((h1 * 97) % 5 | 0) : 0;
      if (P.dDown <= bh) return tone(T.top, 0.62 + (1 - P.dDown / (bh + 1)) * 0.4, P.ix, P.iy, 0);
      return null;
    },
    brick(P, T) {
      const { wx, wy, dT } = P;
      const capH = T.mossy ? 5 + vnoise(wx / 8, 2, 3) * 5 + (hash(wx >> 1, 4, 4) > 0.8 ? 5 : 0) : 5;
      if (dT < capH) {
        if (T.mossy) return tone(T.cap, 0.9 - (dT / capH) * 0.7 + (hash(wx >> 1, wy >> 1, 2) - 0.5) * 0.2, P.ix, P.iy, 0.5);
        return tone(T.cap, dT < 1.5 ? 1 : dT > 3.6 ? 0.12 : 0.62 + (hash(wx >> 3, 0, 1) - 0.5) * 0.15, P.ix, P.iy, 0.3);
      }
      const row = Math.floor(wy / 16), bx = wx + (row & 1) * 16, col = Math.floor(bx / 32);
      const by = wy - row * 16, bxl = bx - col * 32;
      const id = hash(col, row, 31);
      if (by < 1.5 || bxl < 1.5) return tone(T.body, 0.02, P.ix, P.iy, 0);            // mortar
      let t = 0.5 + (id - 0.5) * 0.3 - smooth(0, 170, dT) * 0.3;
      if (by < 3.5) t += 0.16; else if (by > 13.5) t -= 0.14;
      if (bxl < 3.5) t += 0.08; else if (bxl > 30) t -= 0.1;
      t += (hash(wx >> 1, wy >> 1, 5) - 0.5) * 0.1;
      if (id > 0.9) t -= 0.18;                                                        // odd dark brick
      if (id < 0.07 && Math.abs((bxl - 16) - (by - 8) * 1.4 + Math.sin(by) * 2) < 1) t -= 0.3; // crack
      if (dT - capH < 5) t -= 0.22 - (dT - capH) * 0.04;
      if (T.mossy) {                                                                   // moss creeping down + slime
        const m = fbm(wx / 30, wy / 30, 3, 8);
        if (m > 0.6 - smooth(60, 0, dT) * 0.2) return tone(T.cap, 0.15 + (m - 0.55) * 1.6 - smooth(0, 150, dT) * 0.2, P.ix, P.iy, 0.6);
        if (hash(wx >> 1, 3, 7) > 0.86 && dT - capH < 6 + hash(wx >> 1, 8, 1) * 26) return tone(T.cap, 0.35, P.ix, P.iy, 0.3);
      }
      if (T.sooty) { const s = fbm(wx / 12, wy / 60, 3, 4); if (s > 0.56) t -= (s - 0.56) * 1.6; }
      const e = Math.min(P.dL, P.dR, P.dB);
      if (e < 2) t = 0.02; else if (e < 5) t -= 0.12;
      return tone(T.body, t, P.ix, P.iy, 0.5);
    },
    panel(P, T) {
      const { wx, wy, dT } = P;
      const row = Math.floor(wy / 32), bx = wx + (row & 1) * 32, col = Math.floor(bx / 64);
      const pxl = bx - col * 64, pyl = wy - row * 32, id = hash(col, row, 17);
      if (dT < 4) return tone(T.body, dT < 1.5 ? 1 : 0.8, P.ix, P.iy, 0.2);
      if (dT < 6) return tone(T.body, 0.05, P.ix, P.iy, 0);
      let t = 0.44 + (id - 0.5) * 0.14 - smooth(0, 160, dT) * 0.24;
      t += (vnoise(wx / 34, wy / 1.6, 2) - 0.5) * 0.12;                               // brushed streaks
      const seam = pxl < 1.5 || pyl < 1.5;
      if (T.hot) {
        const heat = fbm(wx / 70, wy / 70, 3, 2);
        if (seam && heat > 0.5) return tone(R.ember, (heat - 0.45) * 3.2, P.ix, P.iy, 0.6);
        t += (heat - 0.5) * 0.3;
      }
      if (seam) t = 0.04;
      else if (pxl < 3.5 || pyl < 3.5) t += 0.2;
      else if (pxl > 61.5 || pyl > 29.5) t -= 0.16;
      // rivets
      const rx = Math.min(pxl - 7, 57 - pxl), ry = Math.min(pyl - 7, 25 - pyl);
      const rd = Math.hypot(Math.min(Math.abs(pxl - 7), Math.abs(pxl - 57)), Math.min(Math.abs(pyl - 7), Math.abs(pyl - 25)));
      if (rd < 2.2 && rx > -3 && ry > -3) t += (pxl % 50 < 8 ? 1 : 1) * ((pyl - (pyl < 16 ? 7 : 25)) < 0 ? 0.3 : -0.25);
      // vent grille on some panels
      if (id > 0.8 && pxl > 14 && pxl < 50 && pyl > 9 && pyl < 24) t = ((pyl | 0) % 4 < 2) ? 0.06 : 0.62;
      // scratches & drips
      if (hash(col, row, 3) > 0.6 && Math.abs((pxl - 30) + (pyl - 16) * 2.2 - id * 20) < 0.8 && pyl > 8 && pyl < 26) t += 0.16;
      const e = Math.min(P.dL, P.dR, P.dB);
      if (e < 2) t = 0.02; else if (e < 4) t += 0.14;
      return tone(T.body, t, P.ix, P.iy, 0.45);
    },
    pleat(P, T) {
      const { wx, wy, dT } = P;
      const lintH = 5 + vnoise(wx / 7, 1, 5) * 5 + (hash(wx >> 1, 2, 3) > 0.8 ? 3 : 0);
      if (dT < lintH) return tone(T.top, 0.92 - (dT / lintH) * 0.6 + (hash(wx >> 1, wy >> 1, 4) - 0.5) * 0.3, P.ix, P.iy, 0.6);
      const e = Math.min(P.dL, P.dR, P.dB);
      if (e < 5) return tone(R.wood, e < 1.5 ? 0.02 : 0.5 - e * 0.05, P.ix, P.iy, 0.3);  // cardboard frame
      const k = ((wx % 10) + 10) % 10;
      let t = 0.5 + (k < 5 ? (k - 2.5) * 0.11 : (7.5 - k) * 0.11) - smooth(0, 180, dT) * 0.26;
      if (k < 1) t += 0.14;
      const dust = fbm(wx / 34, wy / 26, 4, 12);
      if (dust > 0.56) return tone(T.top, 0.1 + (dust - 0.56) * 2.4 + (k < 5 ? 0.1 : -0.06) - smooth(0, 180, dT) * 0.2, P.ix, P.iy, 0.7);
      if (((wy % 96) + 96) % 96 < 4) t -= 0.2;                                         // glue bead lines
      if (dT - lintH < 5) t -= 0.2;
      return tone(T.body, t, P.ix, P.iy, 0.5);
    },
    ice(P, T) {
      const { wx, wy, dT } = P;
      const snowy = P.ch === 'i' || P.upIce;
      const sh = 6 + vnoise(wx / 8, 4, 2) * 4;
      if (snowy && dT < sh) {
        if (dT > sh - 2) return tone(T.body, 0.62, P.ix, P.iy, 0.3);
        return tone(T.body, dT < 2 ? 1 : 0.88 + (hash(wx >> 1, wy >> 1, 3) - 0.5) * 0.14, P.ix, P.iy, 0.4);
      }
      let t = 0.46 + (fbm(wx / 44, wy / 44, 3, 6) - 0.5) * 0.5 - smooth(0, 170, dT) * 0.3;
      const streak = ((wx + wy * 0.7) / 19 + fbm(wx / 60, wy / 60, 2, 3) * 3) % 1;
      if (streak < 0.13) t += 0.22; else if (streak < 0.2) t += 0.1;
      const w = worley(wx / 30, wy / 30, 4);
      if (w.d2 - w.d1 < 0.035) t += 0.34;                                             // cracks
      if (w.d1 < 0.1) t += 0.16;
      if (hash(wx, wy, 9) > 0.996) t = 1;                                             // sparkle
      const e = Math.min(P.dL, P.dR, P.dB);
      if (e < 1.5) t = 0.9; else if (e < 4) t += 0.14;                                 // glassy rim
      if (snowy && dT - sh < 4) t -= 0.16;
      return tone(T.body, t, P.ix, P.iy, 0.6);
    },
    iceAir(P, T) {
      if (P.dUp > 22 || !P.aboveSolid) return null;
      const cell = Math.floor(P.wx / 9), cxp = cell * 9 + 2 + hash(cell, 1, 5) * 5;
      const len = hash(cell, 2, 6) > 0.45 ? 5 + hash(cell, 3, 7) * 17 : 0;
      const half = (1 - P.dUp / len) * 3.2;
      if (len && P.dUp < len && Math.abs(P.wx - cxp) < half) return tone(T.body, 0.6 + (P.wx < cxp ? 0.3 : -0.12) + (P.dUp > len - 3 ? 0.3 : 0), P.ix, P.iy, 0.2);
      return null;
    },
    cloud(P, T) {
      const { wx, wy, dT } = P;
      const w = worley(wx / 20, wy / 16, 2);
      let t = 0.95 - smooth(0, 44, dT) * 0.34 + (0.42 - w.d1) * 0.3;
      if (w.d2 - w.d1 < 0.06) t -= 0.1;
      if (P.dB < 9) t -= 0.3 - P.dB * 0.02;
      if (Math.min(P.dL, P.dR) < 4) t -= 0.1;
      if (dT < 2) t = 1;
      return tone(T.body, t, P.ix, P.iy, 0.8);
    },
    cloudAir(P, T) {
      if (P.dDown <= 9 && P.belowSolid) {
        const bump = 2.5 + Math.abs(Math.sin(P.wx / 7.3 + hash((P.wx / 23) | 0, 1, 2) * 6)) * 5.5;
        if (P.dDown < bump) return tone(T.body, 0.86 + (bump - P.dDown) * 0.03, P.ix, P.iy, 0.4);
      }
      if (P.dUp <= 6 && P.aboveSolid) {
        const wisp = 1.5 + vnoise(P.wx / 6, 2, 4) * 4.5;
        if (P.dUp < wisp) return tone(T.body, 0.26 - P.dUp * 0.03, P.ix, P.iy, 0.8);
      }
      return null;
    },
    mossAir(P, T) { // slime drips under ledges in the drain
      if (P.dUp > 16 || !P.aboveSolid) return null;
      const cell = Math.floor(P.wx / 6), len = hash(cell, 5, 2) > 0.62 ? 3 + hash(cell, 4, 3) * 12 : 0;
      const cxp = cell * 6 + 3;
      if (len && P.dUp < len && Math.abs(P.wx - cxp) < (P.dUp > len - 2.5 ? 1.6 : 1)) return tone(T.cap, 0.5 + (P.dUp > len - 2 ? 0.3 : 0), P.ix, P.iy, 0);
      return null;
    },

    // ---- '=' blocks
    brickBlock(P, rmp) {
      const { lx, ly } = P, half = ly >= 16, bx = (lx + (half ? 16 : 0)) % 32, by = ly % 16;
      if (by < 1 || bx < 1) return tone(rmp, 0.03, P.ix, P.iy, 0);
      let t = 0.56 + (hash((P.wx + (half ? 16 : 0)) >> 5, P.wy >> 4, 3) - 0.5) * 0.26;
      if (by < 3) t += 0.24; else if (by > 13) t -= 0.2;
      if (bx < 3) t += 0.1; else if (bx > 29) t -= 0.14;
      t += (hash(P.wx >> 1, P.wy >> 1, 8) - 0.5) * 0.1;
      if (!P.sU && ly < 2) t = 1;
      if (!P.sD && ly > 29) t = 0.03;
      return tone(rmp, t, P.ix, P.iy, 0.4);
    },
    girder(P, rmp) {
      const { lx, ly } = P;
      const b = Math.min(lx, ly, 31 - lx, 31 - ly);
      if (b < 1) return tone(rmp, 0.03, P.ix, P.iy, 0);
      if (b < 5) {
        let t = 0.62 + (ly < 5 ? 0.25 : ly > 26 ? -0.25 : 0) + (lx < 5 ? 0.08 : lx > 26 ? -0.1 : 0);
        if ((Math.abs(lx - 3) < 1.2 || Math.abs(lx - 28) < 1.2) && (Math.abs(ly - 3) < 1.2 || Math.abs(ly - 28) < 1.2)) t += 0.3;
        return tone(rmp, t, P.ix, P.iy, 0.3);
      }
      const d1 = Math.abs(lx - ly), d2 = Math.abs(lx + ly - 31);
      if (Math.min(d1, d2) < 3) return tone(rmp, 0.55 + (d1 < d2 ? (lx > ly ? 0.14 : -0.08) : (lx + ly < 31 ? 0.14 : -0.08)), P.ix, P.iy, 0.3);
      return tone(rmp, 0.16 + (hash(P.wx >> 1, P.wy >> 1, 2) - 0.5) * 0.08, P.ix, P.iy, 0.5);
    },
    // ---- '-' one-way platform (top 11px of the tile)
    plank(P, rmp) {
      const { lx, ly } = P;
      if (ly > 10) {
        // little brackets at the ends
        const end = !P.oL ? lx : !P.oR ? 31 - lx : 99;
        if (end < 9 && ly < 21 - end * 1.2 && ly < 20) return tone(rmp, end < 2 || ly > 19 - end * 1.2 ? 0.05 : 0.4, P.ix, P.iy, 0.2);
        return null;
      }
      if (ly < 1 || ly > 9.5 || (!P.oL && lx < 1) || (!P.oR && lx > 30)) return tone(rmp, 0.03, P.ix, P.iy, 0);
      let t = 0.6 + Math.sin(P.wx * 0.5 + Math.sin(ly) * 2) * 0.07 - ly * 0.03;
      if (ly < 3) t += 0.28;
      if (ly > 7.5) t -= 0.2;
      if (lx % 16 < 1) t -= 0.3;
      if (((lx + 8) % 16 | 0) === 0 && ly > 3 && ly < 6) t += 0.3;
      return tone(rmp, t, P.ix, P.iy, 0.3);
    },
    spike(P, rmp, hot) {
      const { lx, ly } = P;
      if (ly > 28) return tone(rmp, 0.1, P.ix, P.iy, 0.2);
      const k = (lx % 8) - 4 + 0.5, h = (hash((P.wx >> 3), 3, 1) * 5) | 0;
      const topY = 9 + h, w = (ly - topY) / (28 - topY) * 4.2;
      if (ly < topY || Math.abs(k) > w) return null;
      if (Math.abs(k) > w - 0.9) return tone(rmp, 0.04, P.ix, P.iy, 0);
      let t = k < 0 ? 0.82 : 0.4;
      if (ly < topY + 4) t += 0.2;
      if (hot) t = 1 - (ly - topY) / 22;
      return tone(rmp, t, P.ix, P.iy, 0.3);
    },
  };

  // -------------------------------------------------------- renderer
  class Terrain {
    constructor(world) {
      this.w = world; this.theme = world.def.theme; this.T = SET[this.theme]; this.TH = THEMES[this.theme];
      this.chunks = new Map();
      this.nChunks = Math.ceil(world.W / CH_W);
      // static copy of the grid (gates/doors/crumble blocks are drawn as sprites)
      this.g = world.grid.map(r => r.map(c => (c === '%' ? '#' : '#=i-^'.includes(c) ? c : ' ')));
      this.crumble = this.makeCrumble();
    }
    at(tx, ty) { const W = this.w; if (tx < 0 || tx >= W.W) return '#'; if (ty < 0) return ' '; if (ty >= W.H) return this.g[W.H - 1][tx] === '#' ? '#' : ' '; return this.g[ty][tx]; }
    solid(tx, ty) { const c = this.at(tx, ty); return c === '#' || c === '=' || c === 'i'; }

    renderChunk(ci) {
      const W = this.w, T = this.T, sh = SH[this.TH.shader];
      const air = this.theme === 'ice' ? SH.iceAir : this.theme === 'sky' ? SH.cloudAir : this.theme === 'drain' ? SH.mossAir : this.TH.shader === 'soil' ? SH.soilAir : null;
      const x0 = ci * CH_W, cw = Math.min(CH_W, W.W - x0);
      const c = GFX.canvas(cw * PX, W.H * PX), g = c.getContext('2d');
      const id = g.createImageData(c.width, c.height), d = id.data;
      const P = {};
      for (let ty = 0; ty < W.H; ty++) for (let tx = x0; tx < x0 + cw; tx++) {
        const ch = this.at(tx, ty);
        const sU = this.solid(tx, ty - 1), sD = this.solid(tx, ty + 1), sL = this.solid(tx - 1, ty), sR = this.solid(tx + 1, ty);
        const isSolid = ch === '#' || ch === '=' || ch === 'i';
        if (!isSolid && ch === ' ' && !air) continue;
        if (!isSolid && ch === ' ' && !sU && !sD) continue;
        let up = 0;
        if (isSolid) while (up < 6 && this.solid(tx, ty - 1 - up)) up++;
        const sUL = this.solid(tx - 1, ty - 1), sUR = this.solid(tx + 1, ty - 1), sDL = this.solid(tx - 1, ty + 1), sDR = this.solid(tx + 1, ty + 1);
        P.ch = ch; P.sU = sU; P.sD = sD;
        P.upIce = false;
        if (isSolid) { let k = 1; while (k <= up && !P.upIce) { if (this.at(tx, ty - k) === 'i') P.upIce = true; k++; } if (up >= 6) P.upIce = false; }
        P.below = this.at(tx, ty + 1); P.belowSolid = sD; P.aboveSolid = sU;
        P.oL = this.at(tx - 1, ty) === '-'; P.oR = this.at(tx + 1, ty) === '-';
        for (let ly = 0; ly < PX; ly++) for (let lx = 0; lx < PX; lx++) {
          const ix = (tx - x0) * PX + lx, iy = ty * PX + ly;
          P.lx = lx; P.ly = ly; P.ix = tx * PX + lx; P.iy = iy; P.wx = tx * PX + lx; P.wy = iy;
          let col;
          if (isSolid) {
            P.dT = up >= 6 ? 999 : up * PX + ly;
            P.dB = sD ? 999 : PX - 1 - ly; P.dL = sL ? 999 : lx; P.dR = sR ? 999 : PX - 1 - lx;
            if (sU && sL && !sUL) { const dd = Math.hypot(lx, ly); P.dL = Math.min(P.dL, dd); }
            if (sU && sR && !sUR) { const dd = Math.hypot(PX - 1 - lx, ly); P.dR = Math.min(P.dR, dd); }
            if (sD && sL && !sDL) { const dd = Math.hypot(lx, PX - 1 - ly); P.dB = Math.min(P.dB, dd); }
            if (sD && sR && !sDR) { const dd = Math.hypot(PX - 1 - lx, PX - 1 - ly); P.dB = Math.min(P.dB, dd); }
            if (ch === '=') col = SH[T.block[0] === 'girder' ? 'girder' : 'brickBlock'](P, T.block[1]);
            else col = sh(P, T);
          } else if (ch === '-') col = SH.plank(P, T.plank);
          else if (ch === '^') col = SH.spike(P, T.spike, T.hot);
          else {
            P.dDown = sD ? PX - ly : 999; P.dUp = sU ? ly + 1 : 999;
            col = air(P, T);
          }
          if (!col) continue;
          const o = (iy * c.width + ix) * 4;
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
        }
      }
      g.putImageData(id, 0, 0);
      return c;
    }
    ensure(ci) {
      let c = this.chunks.get(ci);
      if (!c) { c = this.renderChunk(ci); this.chunks.set(ci, c); }
      return c;
    }
    // paint one not-yet-ready chunk near the camera (called once per frame -> no hitches later)
    prerender(camX) {
      const centre = Math.floor((camX + 192) / (CH_W * 16));
      for (let r = 0; r < this.nChunks; r++) for (const ci of [centre + r, centre - r]) {
        if (ci >= 0 && ci < this.nChunks && !this.chunks.has(ci)) { this.ensure(ci); return true; }
      }
      return false;
    }
    draw(ctx, camX, camY, viewW) {
      const c0 = Math.max(0, Math.floor(camX / (CH_W * 16))), c1 = Math.min(this.nChunks - 1, Math.floor((camX + viewW) / (CH_W * 16)));
      for (let ci = c0; ci <= c1; ci++) { const c = this.ensure(ci); ctx.drawImage(c, ci * CH_W * 16, 0, c.width / 2, c.height / 2); }
    }
    makeCrumble() {
      const T = this.T, rmp = T.block[1];
      return paint(PX, PX, (x, y, ix, iy) => {
        const b = Math.min(ix, iy, 31 - ix, 31 - iy);
        if (b < 1) return tone(rmp, 0.03, ix, iy, 0);
        let t = 0.72 + (hash(ix >> 1, iy >> 1, 3) - 0.5) * 0.14 - iy * 0.008;
        if (iy < 3) t += 0.2; if (iy > 28) t -= 0.25;
        const w = worley(ix / 11, iy / 11, 7);
        if (w.d2 - w.d1 < 0.09) t = 0.1;
        return tone(rmp, t, ix, iy, 0.4);
      });
    }
  }

  // ------------------------------------------------------------ props
  function part(W, H, sdf, rmp, light, ol, dith = 0.2) {
    const c = paint(W, H, (x, y, ix, iy) => { const d = sdf(x, y); if (d > 0) return null; const t = light(x, y, d); return Array.isArray(t) ? t : tone(rmp, t, ix, iy, dith); });
    return ol ? outline(c, ol) : c;
  }
  const PROPS = {};
  function buildProps() {
    const spr = (c) => ({ img: c, w: c.width / 2, h: c.height / 2 });
    const P = PROPS;
    const tuft = (rmp, seed, tall) => spr(paint(22, tall ? 26 : 14, (x, y, ix, iy) => {
      const H = tall ? 26 : 14;
      for (let i = 0; i < 6; i++) {
        const bx = 3 + i * 3.2, h = (0.45 + hash(i, seed, 1) * 0.55) * (H - 1), lean = (hash(i, seed, 2) - 0.5) * 7;
        const k = (H - y) / h;
        if (k < 0 || k > 1) continue;
        if (Math.abs(x - (bx + lean * k * k)) < 1.3 * (1 - k) + 0.4) return tone(rmp, 0.35 + k * 0.6 + (i % 2) * 0.1, ix, iy, 0);
      }
      return null;
    }));
    const flowerP = (petal, seed) => spr(paint(12, 20, (x, y, ix, iy) => {
      const hx = 6 + (hash(seed, 1) - 0.5) * 2;
      if (S.circle(x, y, hx, 5, 1.6) < 0) return [255, 216, 60];
      if (S.circle(x, y, hx, 5, 4) < 0 && (Math.abs(Math.abs(x - hx) - Math.abs(y - 5)) > 0.8 || Math.hypot(x - hx, y - 5) < 3)) return tone(petal, 0.5 + (5 - y) * 0.12 + (x - hx) * 0.06, ix, iy, 0);
      if (Math.abs(x - hx) < 0.8 && y > 8) return tone(R.meadowGrass, 0.45, ix, iy, 0);
      if (S.ellipse(x, y, hx + 2.5, 14, 2.4, 1.1) < 0) return tone(R.meadowGrass, 0.7, ix, iy, 0);
      return null;
    }));
    const mushroom = (capRamp, glowing) => spr(part(18, 18, (x, y) => Math.min(S.box(x, y, 9, 13, 1.8, 4, 1), (S.ellipse(x, y, 9, 8.5, 7.5, 5.5) < 0 && y < 9.5) ? -1 : 1), capRamp, (x, y) => {
      if (y > 9.4) return tone(RAMPS.white, 0.6 + (x - 9) * 0.1, x | 0, y | 0, 0);
      if (S.circle(x, y, 6, 6, 1.2) < 0 || S.circle(x, y, 11.5, 5, 1) < 0 || S.circle(x, y, 13, 8, 0.8) < 0) return glowing ? [230, 255, 250] : [255, 255, 255];
      return clamp(sphereLight(x, y, 9, 9, 8) + 0.1);
    }, glowing ? '#083a3a' : '#3a0a0a'));
    const bush = (rmp, berries) => spr(part(40, 24, (x, y) => { if (y > 22) return 1; let d = 99; for (const [a, b, r] of [[10, 16, 7], [19, 11, 9], [29, 15, 8], [20, 18, 8], [34, 19, 4.5], [5, 19, 4]]) d = Math.min(d, S.circle(x, y, a, b, r)); return d; }, rmp, (x, y, d) => {
      const w = worley(x / 5, y / 5, 3);
      let t = 0.85 - (y - 4) * 0.033 + (0.4 - w.d1) * 0.5 + (x - 20) * 0.004;
      if (berries && w.d1 < 0.13 && w.id > 0.6) return [232, 60, 80];
      if (d > -1.5 && y < 12) t += 0.15;
      return clamp(t);
    }, '#0a2a10', 0.3));
    const rock = (rmp, seed) => spr(part(26, 16, (x, y) => y > 14.5 ? 1 : Math.min(S.ellipse(x, y, 11, 11, 9 + hash(seed, 2) * 2, 6.5), S.ellipse(x, y, 19, 12, 5.5, 4)), rmp, (x, y, d) => clamp(0.82 - (y - 4) * 0.055 + (10 - x) * 0.012 + (d > -1.6 && y < 9 ? 0.14 : 0) - (worley(x / 6, y / 6, seed).d1 < 0.2 ? 0.14 : 0)), '#1a1a22', 0.4));
    const pile = (rmp, w, ol) => spr(part(w, 14, (x, y) => y > 12.5 ? 1 : Math.min(S.ellipse(x, y, w * 0.38, 11, w * 0.3, 6), S.ellipse(x, y, w * 0.66, 12, w * 0.26, 4.4)) - (hash(x | 0, y | 0, 3) - 0.5) * 1.6, rmp, (x, y) => clamp(0.9 - (y - 5) * 0.075 + (hash(x >> 1, y >> 1, 5) - 0.5) * 0.3), ol, 0.5));
    const lampPost = () => {
      const W = 26, H = 96;
      const c = part(W, H, (x, y) => Math.min(S.box(x, y, 9, 56, 1.5, 38, 0.5), S.box(x, y, 9, 93, 4.5, 2.5, 1), S.seg(x, y, 9, 18, 17, 10, 1.3), S.box(x, y, 18, 9, 5.5, 2.6, 1.5), S.box(x, y, 9, 76, 2.6, 1.2, 0.5)), R.steel, (x, y) => {
        if (y > 9.6 && y < 12 && x > 13) return [255, 240, 170];
        return clamp(0.4 + (x - 9) * 0.14 + (y < 12 ? 0.2 : 0));
      }, '#0a0c14');
      return { ...spr(c), light: { x: 9, y: 6, r: 78, col: '#ffdc8a', a: 0.9 } };
    };
    const hangLamp = (col, rgbc) => {
      const c = part(22, 26, (x, y) => Math.min(S.box(x, y, 11, 5, 0.8, 5.5, 0), (S.circle(x, y, 11, 21, 9.5) < 0 && y < 17 && y > 10) ? -1 : 1, S.circle(x, y, 11, 17.5, 3)), R.steel, (x, y) => {
        if (y > 16.6) return rgbc;
        return clamp(0.3 + (x - 6) * 0.05 + (y < 12 ? 0.2 : 0));
      }, '#0a0c14');
      return { ...spr(c), light: { x: 5.5, y: 12, r: 70, col, a: 0.85 }, ceil: true };
    };
    const crystal = (rmp, col) => {
      const c = part(22, 28, (x, y) => Math.min(S.cone(x, y, 10, 22, 4.5, 9, 3, 0.5), S.cone(x, y, 15, 24, 3.2, 18, 11, 0.4), S.cone(x, y, 5.5, 24, 2.6, 3, 14, 0.4)), rmp, (x, y) => clamp(0.55 + (((x + y * 0.4) | 0) % 5 < 2 ? 0.3 : 0) + (x < 10 ? 0.14 : -0.14) - (y - 4) * 0.008), '#0e2e6a', 0.2);
      return { ...spr(c), light: { x: 5, y: 7, r: 40, col, a: 0.75 } };
    };
    const barrel = (rmp, band, mark) => spr(part(26, 34, (x, y) => S.box(x, y, 13, 18, 10.5, 14.5, 3), rmp, (x, y) => {
      if (Math.abs(y - 10) < 1.3 || Math.abs(y - 26) < 1.3) return tone(R.steel, 0.3 + (13 - Math.abs(x - 9)) * 0.04, x | 0, y | 0, 0.2);
      if (mark && S.circle(x, y, 13, 18, 4.4) < 0) return (S.circle(x, y, 13, 18, 1.5) < 0 || (Math.abs(((Math.atan2(y - 18, x - 13) + 6.3) % 2.09) - 1.05) < 0.5 && Math.hypot(x - 13, y - 18) > 2.4)) ? [20, 20, 24] : band;
      return clamp(0.62 - Math.abs(x - 9) * 0.045 + (x < 6 ? -0.1 : 0));
    }, '#0c0a08', 0.3));
    const crate = () => spr(part(30, 30, (x, y) => S.box(x, y, 15, 15.5, 13, 13, 1), R.wood, (x, y) => {
      const b = Math.min(x - 2, y - 2.5, 28 - x, 28.5 - y);
      if (b < 3.4) return clamp(0.66 + (y < 6 ? 0.2 : y > 25 ? -0.25 : 0) + (x > 25 ? -0.12 : 0));
      if (Math.abs((x - 15) - (y - 15.5)) < 1.8) return 0.6;
      return clamp(0.36 + Math.sin(y * 1.6) * 0.06);
    }, '#140a04', 0.3));
    const valve = () => spr(part(26, 30, (x, y) => Math.min(S.box(x, y, 13, 22, 3, 7, 1), S.box(x, y, 13, 28, 7, 1.6, 1), Math.abs(S.circle(x, y, 13, 9, 7)) - 1.5, S.box(x, y, 13, 9, 7, 1, 0), S.box(x, y, 13, 9, 1, 7, 0)), R.steel, (x, y) => {
      if (y < 18) return tone(RAMPS.red, clamp(0.6 + (13 - x) * 0.03 - (y - 9) * 0.04), x | 0, y | 0, 0.2);
      return clamp(0.5 + (13 - x) * 0.07);
    }, '#0a0c14'));
    const chain = (len, hook) => ({ ...spr(paint(12, len, (x, y, ix, iy) => {
      const k = iy % 8;
      if (hook && iy > len - 12) { const dd = Math.abs(S.circle(x, y, 6, len - 7, 3.6)) - 1; return dd < 0 && !(x > 6 && y < len - 7) ? tone(R.steel, 0.5 + (6 - x) * 0.08, ix, iy, 0) : null; }
      if (k < 5 ? (Math.abs(x - 6) < 2.4 && Math.abs(Math.abs(x - 6) - 1.4) < 1.1 || k === 0 || k === 4 ? Math.abs(x - 6) < 2.4 : false) : Math.abs(x - 6) < 0.9) return tone(R.steel, 0.35 + (x < 6 ? 0.25 : 0), ix, iy, 0);
      return null;
    })), ceil: true });
    const cable = (seed) => ({ ...spr(paint(64, 20, (x, y, ix, iy) => {
      for (let i = 0; i < 2; i++) {
        const sag = 8 + hash(seed, i) * 9, yy = 1 + Math.sin(x / 64 * Math.PI) * sag - i * 2;
        if (Math.abs(y - yy) < 1.1) return i ? [28, 34, 52] : [50, 30, 34];
      }
      return null;
    })), ceil: true });
    const hydrant = () => spr(part(18, 26, (x, y) => Math.min(S.box(x, y, 9, 15, 4.5, 8, 2), S.circle(x, y, 9, 6.5, 4.5), S.box(x, y, 9, 23.5, 6.5, 1.6, 1), S.box(x, y, 9, 13, 7.5, 1.8, 1)), RAMPS.red, (x, y) => clamp(0.66 + (9 - x) * 0.06 - (y - 4) * 0.012), '#2a0606'));
    const acUnit = () => spr(part(40, 26, (x, y) => Math.min(S.box(x, y, 20, 13, 18, 10.5, 2), S.box(x, y, 8, 24.5, 2, 1, 0), S.box(x, y, 32, 24.5, 2, 1, 0)), R.cityCap, (x, y) => {
      const fd = S.circle(x, y, 13, 13, 7.5);
      if (fd < 0) return fd > -1.3 ? 0.1 : ((Math.atan2(y - 13, x - 13) * 2.4 + 9) % 1.5 < 0.5 ? 0.5 : 0.18);
      if (x > 24 && ((y | 0) % 4 < 2) && y > 6 && y < 20) return 0.3;
      return clamp(0.78 - (y - 3) * 0.018 + (20 - x) * 0.004);
    }, '#14161e'));
    const antenna = () => ({ ...spr(paint(16, 60, (x, y, ix, iy) => {
      if (Math.abs(x - 8) < 1) return tone(R.steel, 0.5, ix, iy, 0);
      if ((iy === 14 || iy === 24 || iy === 36) && Math.abs(x - 8) < 7 - iy * 0.1) return tone(R.steel, 0.4, ix, iy, 0);
      if (iy < 4 && Math.abs(x - 8) < 2) return [255, 60, 50];
      return null;
    })), light: { x: 4, y: 1, r: 26, col: '#ff3a2a', a: 0.9, blink: 60 } });
    const cobweb = () => ({ ...spr(paint(36, 36, (x, y) => {
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      if (r > 34) return null;
      const spoke = Math.abs(((a / (Math.PI / 2) * 5) % 1) - 0.5) > 0.44;
      const ring = Math.abs((r + Math.sin(a * 10) * 1.6) % 8 - 4) > 3.5;
      return (spoke || ring) ? [226, 226, 236, 150] : null;
    })), ceil: true });
    const gauge = () => spr(part(22, 30, (x, y) => Math.min(S.circle(x, y, 11, 10, 9), S.box(x, y, 11, 24, 2, 6, 0.5)), R.steel, (x, y) => {
      const r = Math.hypot(x - 11, y - 10);
      if (r < 7) { if (S.seg(x, y, 11, 10, 15, 6, 0.6) < 0) return [220, 40, 40]; return r > 5.6 && ((Math.atan2(y - 10, x - 11) * 6 + 40) % 1 < 0.3) ? [30, 30, 40] : [240, 240, 230]; }
      return clamp(0.5 + (11 - x) * 0.04 - (y - 10) * 0.02);
    }, '#0a0c14'));
    const weedDrip = () => ({ ...spr(paint(28, 26, (x, y, ix, iy) => {
      if (S.box(x, y, 14, 6, 12, 5.5, 2) < 0) { const o = S.box(x, y, 14, 6, 12, 5.5, 2); return tone(R.rust, o > -1.2 ? 0.04 : S.ellipse(x, y, 14, 6, 6, 3) < 0 ? 0.08 : 0.6 - y * 0.04, ix, iy, 0.3); }
      if (Math.abs(x - 14) < 1.2 && y < 22 && y > 10) return tone(R.moss, 0.7, ix, iy, 0);
      return null;
    })), ceil: true, drip: { x: 7, y: 11 } });
    const vane = () => spr(paint(26, 44, (x, y, ix, iy) => {
      if (Math.abs(x - 13) < 1 && y > 8) return tone(R.steel, 0.55, ix, iy, 0);
      if (S.cone(x, y, 8, 9, 3.4, 22, 9, 0.4) < 0) return tone(RAMPS.gold, 0.7 - (y - 7) * 0.1, ix, iy, 0);
      if (Math.abs(y - 20) < 1 && Math.abs(x - 13) < 7) return tone(R.steel, 0.4, ix, iy, 0);
      if (y > 41 && Math.abs(x - 13) < 5) return tone(R.steel, 0.3, ix, iy, 0);
      return null;
    }));
    const starlet = () => ({ ...spr(paint(14, 18, (x, y) => {
      const dx = Math.abs(x - 7), dy = Math.abs(y - 7);
      if (dx + dy < 2.2 || (dx < 0.9 && dy < 6) || (dy < 0.9 && dx < 5)) return [255, 250, 190];
      if (Math.abs(x - 7) < 0.7 && y > 11) return [150, 130, 190];
      return null;
    })), light: { x: 3.5, y: 3.5, r: 30, col: '#fff0a0', a: 0.7 } });

    P.tuft = [tuft(R.meadowGrass, 1), tuft(R.meadowGrass, 2), tuft(R.meadowGrass, 3, true)];
    P.tuftH = [tuft(R.hillsGrass, 4), tuft(R.hillsGrass, 5, true), tuft(R.hillsGrass, 6, true)];
    P.flower = [flowerP(RAMPS.petal, 1), flowerP(ramp('#b88a00', '#ffd020', '#fff08a', '#ffffff'), 2), flowerP(ramp('#8090c0', '#c8d4f4', '#ffffff', '#ffffff'), 3), flowerP(ramp('#7a1010', '#e03030', '#ff7060', '#ffb0a0'), 4), flowerP(ramp('#3a2a9a', '#6a5ae0', '#a09aff', '#d8d4ff'), 5)];
    P.mushroom = mushroom(RAMPS.red, false);
    P.glowshroom = { ...mushroom(ramp('#0a5a5a', '#14a09a', '#3ce0d0', '#a0fff0'), true), light: { x: 4.5, y: 4, r: 34, col: '#40ffe0', a: 0.7 } };
    P.bush = bush(R.meadowGrass, false); P.berryBush = bush(R.hillsGrass, true);
    P.rock = [rock(R.stone, 1), rock(R.stone, 2)];
    P.dustPile = pile(R.lint, 34, '#1e1c1a'); P.snowPile = pile(RAMPS.cloud, 40, '#4a6aa8'); P.sootPile = pile(RAMPS.smog, 30, '#050508');
    P.lampPost = lampPost();
    P.lampCool = hangLamp('#bcd8ff', [220, 240, 255]); P.lampWarm = hangLamp('#ffcf8a', [255, 236, 180]); P.lampHot = hangLamp('#ff8a3a', [255, 190, 110]);
    P.crystal = crystal(R.ice, '#8adcff');
    P.barrel = barrel(R.rust, [240, 200, 40], true); P.barrelBlue = barrel(R.steel, [240, 200, 40], false);
    P.crate = crate(); P.valve = valve(); P.gauge = gauge();
    P.chain = [chain(40, true), chain(64, false), chain(28, true)];
    P.cable = [cable(1), cable(2)];
    P.hydrant = hydrant(); P.acUnit = acUnit(); P.antenna = antenna(); P.cobweb = cobweb();
    P.pipeDrip = weedDrip(); P.vane = vane(); P.starlet = starlet();
  }

  // which props appear where: [prop key(s), chance] lists for floor and ceiling surfaces
  const SCATTER = {
    meadow: { floor: [['tuft', 0.5], ['flower', 0.26], ['bush', 0.07], ['rock', 0.06], ['mushroom', 0.05]], ceil: [] },
    hills: { floor: [['tuftH', 0.5], ['flower', 0.4], ['berryBush', 0.08], ['rock', 0.04]], ceil: [] },
    city: { floor: [['lampPost', 0.085], ['hydrant', 0.05], ['acUnit', 0.07], ['antenna', 0.05], ['barrelBlue', 0.04]], ceil: [] },
    duct: { floor: [['dustPile', 0.12], ['valve', 0.04], ['crate', 0.03]], ceil: [['lampCool', 0.1], ['cable', 0.12], ['cobweb', 0.04]] },
    filter: { floor: [['dustPile', 0.3], ['crate', 0.03]], ceil: [['lampWarm', 0.09], ['cobweb', 0.14], ['cable', 0.06]] },
    ice: { floor: [['crystal', 0.11], ['snowPile', 0.16]], ceil: [] },
    drain: { floor: [['glowshroom', 0.16], ['rock', 0.06], ['barrel', 0.03]], ceil: [['pipeDrip', 0.09], ['chain', 0.05], ['lampCool', 0.04]] },
    compressor: { floor: [['valve', 0.08], ['gauge', 0.07], ['barrelBlue', 0.05], ['crate', 0.04]], ceil: [['lampHot', 0.1], ['chain', 0.06]] },
    factory: { floor: [['barrel', 0.1], ['crate', 0.08], ['sootPile', 0.1], ['lampPost', 0.05], ['valve', 0.04]], ceil: [['chain', 0.1], ['lampHot', 0.06]] },
    sky: { floor: [['starlet', 0.12], ['vane', 0.04]], ceil: [] },
  };

  function scatter(world, terr) {
    if (!PROPS.tuft) buildProps();
    const out = [], rules = SCATTER[world.def.theme];
    const blocked = new Set();
    for (const o of world.objects) if (o.type !== 'drop' && o.type !== 'heart') for (let k = -1; k <= 1; k++) blocked.add((Math.floor((o.x + 8) / 16) + k) + ',' + Math.floor((o.y + o.h - 1) / 16));
    if (world.exit) for (let k = -1; k <= 1; k++) blocked.add((Math.floor(world.exit.x / 16) + k) + ',' + Math.floor((world.exit.y + 31) / 16));
    const pick = (list, tx, ty, seed) => {
      let r = hash(tx, ty, seed);
      for (const [key, p] of list) { if (r < p) { const v = PROPS[key]; return Array.isArray(v) ? v[(hash(tx, ty, seed + 1) * v.length) | 0] : v; } r -= p; }
      return null;
    };
    for (let ty = 0; ty < world.H; ty++) for (let tx = 1; tx < world.W - 1; tx++) {
      const c = terr.at(tx, ty);
      if (c !== '#' && c !== 'i' && c !== '=') continue;
      // floor props stand on tiles with 2 free tiles above
      if (ty > 1 && world.grid[ty - 1][tx] === ' ' && terr.at(tx, ty - 1) === ' ' && !blocked.has(tx + ',' + (ty - 1))) {
        const p = pick(rules.floor, tx, ty, 41);
        if (p && (p.h <= 16 || (terr.at(tx, ty - 2) === ' ' && terr.at(tx, ty - 3) === ' ' && (p.h <= 32 || terr.at(tx, ty - 4) === ' ')))) {
          const x = tx * 16 + 8 - p.w / 2 + (hash(tx, ty, 5) - 0.5) * 6, y = ty * 16 - p.h + 0.5;
          out.push({ p, x, y, behind: true });
        }
      }
      // ceiling props hang under tiles with free space below
      if (rules.ceil.length && ty < world.H - 3 && terr.at(tx, ty + 1) === ' ' && terr.at(tx, ty + 2) === ' ' && world.grid[ty + 1][tx] === ' ') {
        const p = pick(rules.ceil, tx, ty, 77);
        if (p && p.ceil && (p.h <= 20 || terr.at(tx, ty + 3) === ' ')) out.push({ p, x: tx * 16 + 8 - p.w / 2, y: (ty + 1) * 16 - 0.5, behind: true });
      }
    }
    return out;
  }

  return { Terrain, scatter, PX, CH_W, R };
})();
