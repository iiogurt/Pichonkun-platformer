// Pixel-art sprites (built from character maps) and procedural tiles/backgrounds.
'use strict';

// Base palette, taken from the Pichonkun style card.
const PAL = {
  navy: '#0d1b5e', blue: '#1565d8', cyan: '#1cb8f2', light: '#b5ecfc',
  white: '#ffffff', gray: '#b4b4b4', black: '#000000', cream: '#fdf5e6',
};

const KEYS = {
  K: PAL.navy, B: PAL.blue, C: PAL.cyan, L: PAL.light, W: PAL.white, G: PAL.gray, k: PAL.black,
  // enemy / misc colours
  Y: '#ffd23f', O: '#f08a24', D: '#8a4a00', y: '#fff3a0',
  P: '#9b3fd0', p: '#d48cff', g: '#7cff4f', Q: '#5a1f86',
  N: '#3fae3f', n: '#8cf06c', d: '#1d5e1d',
  S: '#5e5e66', s: '#8b8b95', T: '#34343c', t: '#c9c9d1',
  R: '#e8402a', r: '#ff9a8a', M: '#6b8e23', m: '#2d3b10',
  F: '#4caf50', f: '#a5e887', E: '#7a5230', e: '#c49a6c',
  I: '#d7f6ff', i: '#7fd3f0', U: '#ffb6c1', H: '#ff5a7a',
};

// ---- colour helpers (full-colour rendering on top of pixel maps)
function hexRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbStr(r, g, b, a = 1) {
  const c = v => Math.max(0, Math.min(255, Math.round(v)));
  return a >= 1 ? `rgb(${c(r)},${c(g)},${c(b)})` : `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}
function shade(hex, amt) { // amt -1..1 (darken..lighten)
  const [r, g, b] = hexRgb(hex);
  if (amt >= 0) return rgbStr(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  return rgbStr(r * (1 + amt), g * (1 + amt), b * (1 + amt));
}
function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbStr(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

// Builds a sprite from a character map. Rendered at 2x internal detail with
// soft per-pixel lighting (top-left light source) so sprites read as full-colour
// modern pixel art instead of flat 8-bit.
const SPRITE_SCALE = 2;
function makeSprite(rows, extra = {}) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const S = SPRITE_SCALE;
  const isOutline = (col) => col === PAL.navy || col === PAL.black || col === '#000000';
  const make = (flip) => {
    const c = document.createElement('canvas');
    c.width = w * S; c.height = h * S;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = extra[ch] || KEYS[ch];
        if (!col) continue;
        const dx = (flip ? w - 1 - x : x) * S, dy = y * S;
        if (isOutline(col)) { g.fillStyle = col; g.fillRect(dx, dy, S, S); continue; }
        // lighting: lighter towards top-left, darker bottom-right
        const lx = (flip ? (w - 1 - x) : x) / w, ly = y / h;
        const amt = 0.18 - (lx * 0.12 + ly * 0.32);
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
          const sub = (sx === 0 && sy === 0) ? 0.06 : (sx === S - 1 && sy === S - 1) ? -0.05 : 0;
          g.fillStyle = shade(col, Math.max(-0.5, Math.min(0.5, amt + sub)));
          g.fillRect(dx + sx, dy + sy, 1, 1);
        }
      }
    }
    return c;
  };
  return { img: make(false), flip: make(true), w, h };
}

// Draw helper: sprites are stored at 2x, drawn at logical size.
function drawSpr(ctx, spr, x, y, flip = false, scale = 1) {
  ctx.drawImage(flip ? spr.flip : spr.img, Math.round(x), Math.round(y), spr.w * scale, spr.h * scale);
}

// Make a white silhouette (used for damage flashes)
function whiteVersion(spr) {
  const mk = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    return c;
  };
  return { img: mk(spr.img), flip: mk(spr.flip), w: spr.w, h: spr.h };
}

const PICHON_HEAD = [
  '.......KK.......',
  '......KCCK......',
  '......KCLK......',
  '.....KCCLLK.....',
  '....KBCCCLLK....',
  '...KBCCCCCLLK...',
  '..KBCCCCCCCLCK..',
  '.KBBCCCCCCCCCCK.',
  '.KBCCCCCCCWWWWK.',
  'KBBCCCCCWWWWWWWK',
  'KBBCCCCWWkWWWkWK',
  'KBBBCCCWWkWWWkWK',
  'KBBBBCWWWWWkWkWK',
  '.KBBBBWWWWWWkWK.',
  '..KKBBWWWWWWWK..',
  '....KKKKKKKKK...',
];

const PICHON_LEGS = {
  idle: [
    '.....KWWWWK.....',
    '....KWWGWWWK....',
    '....KWK..KWK....',
    '....KK....KK....',
  ],
  run1: [
    '.....KWWWWK.....',
    '...KWWWGWWKK....',
    '..KWK....KWWK...',
    '..KK.......KK...',
  ],
  run2: [
    '.....KWWWWK.....',
    '....KWWWGWK.....',
    '....KWKKWK......',
    '.....KK.KK......',
  ],
  jump: [
    '..KWKWWWWWKWK...',
    '...KKWWWWWKK....',
    '.....KWK.KWK....',
    '......K...KK....',
  ],
  fall: [
    '.KWK.KWWWK.KWK..',
    '..K.KWWWWWK.K...',
    '.....KWKKWK.....',
    '.....KK..KK.....',
  ],
  land: [
    '................',
    '...KWWWWWWWWK...',
    '..KWWGWWWWGWWK..',
    '..KKKK....KKKK..',
  ],
};

const SPR = {};

function buildSprites() {
  for (const k in PICHON_LEGS) {
    let head = PICHON_HEAD;
    if (k === 'land') head = ['................', ...PICHON_HEAD.slice(0, 15)];
    SPR['pichon_' + k] = makeSprite([...head, ...PICHON_LEGS[k]]);
  }
  SPR.pichon_white = whiteVersion(SPR.pichon_idle);

  SPR.pollen = [makeSprite([
    '.....O......',
    '..O..Y..O...',
    '...OYYYO....',
    '..OYYYYYYO..',
    '.OYYYYYYYYO.',
    'OYYWkYYWkYYO',
    '.OYYYYYYYYO.',
    '..OYYDDYYO..',
    '...OYYYYO...',
    '..O..Y..O...',
    '.....O......',
  ]), makeSprite([
    '............',
    '.O...Y...O..',
    '...OYYYO....',
    '..OYYYYYYO..',
    'OOYYYYYYYYOO',
    '.OYYWkYYWkYO',
    '.OYYYYYYYYO.',
    'OOYYYDDYYYOO',
    '...OYYYYO...',
    '.O...Y...O..',
    '............',
  ])];

  SPR.virus = [makeSprite([
    '.....g......',
    '..g..P..g...',
    '...PPPPP....',
    '..PpPPPPPP..',
    '.PppPPPPPPP.',
    'gPPWkPPWkPPg',
    '.PPPPPPPPPP.',
    '.PPPkkkkPPP.',
    '..PPPPPPPP..',
    '...PPPPPP...',
    '..g..P..g...',
    '.....g......',
  ]), makeSprite([
    '............',
    '.g...P...g..',
    '...PPPPP....',
    '..PpPPPPPP..',
    'gPppPPPPPPPg',
    '.PPWkPPWkPP.',
    '.PPPPPPPPPP.',
    'gPPPkkkkPPPg',
    '..PPPPPPPP..',
    '...PPPPPP...',
    '.g...P...g..',
    '............',
  ])];

  SPR.bacteria = [makeSprite([
    '..NNNNNNNNNN..',
    '.NnnNNNNNNNNN.',
    'NnNNNWkNNWkNNN',
    'NNNNNWkNNWkNNN',
    'NNNdNNNNNNdNNN',
    '.NNNNNkkkNNNN.',
    '..NNNNNNNNNN..',
    '.d...d...d..d.',
    'd...d...d..d..',
  ]), makeSprite([
    '..NNNNNNNNNN..',
    '.NnnNNNNNNNNN.',
    'NnNNNWkNNWkNNN',
    'NNNNNWkNNWkNNN',
    'NNNdNNNNNNdNNN',
    '.NNNNNkkkNNNN.',
    '..NNNNNNNNNN..',
    '..d...d...d.d.',
    '.d.d...d.d...d',
  ])];

  SPR.dust = [makeSprite([
    '...s..s.......',
    '..sGs.sGs.....',
    '..sGGsGGs.....',
    '.sGGGGGGGs....',
    'sGGWkGGWkGs...',
    'sGGGGGGGGGGs..',
    'sGGGGkkGGGGGs.',
    '.sGGGGGGGGGGs.',
    '..sGGGGGGGGs..',
    '...SS....SS...',
  ]), makeSprite([
    '..s...s.......',
    '.sGs.sGs......',
    '.sGGsGGs......',
    '.sGGGGGGGs....',
    'sGGWkGGWkGs...',
    'sGGGGGGGGGGs..',
    'sGGGGkkGGGGGs.',
    '.sGGGGGGGGGGs.',
    '..sGGGGGGGGs..',
    '..SS......SS..',
  ])];

  SPR.smog = [makeSprite([
    '.....TTTT.........',
    '...TTSSSSTT.TTT...',
    '..TSSSSSSSSTSSST..',
    '.TSSsSSSSSSSSSSST.',
    'TSSSRkSSSSSRkSSSST',
    'TSSSkkSSSSSkkSSSST',
    'TSSSSSSSSSSSSSSSST',
    '.TSSSSkkkkkkSSSST.',
    '..TTSSSSSSSSSSTT..',
    '....TTTTTTTTTT....',
  ]), makeSprite([
    '......TTTT........',
    '..TTTSSSSTTTTT....',
    '.TSSSSSSSSSSSST...',
    'TSSsSSSSSSSSSSSTT.',
    'TSSSRkSSSSSRkSSSST',
    'TSSSkkSSSSSkkSSSST',
    'TSSSSSSSSSSSSSSSST',
    '.TSSSSkkkkkkSSSST.',
    '..TTSSSSSSSSSSTT..',
    '.....TTTTTTTTT....',
  ])];

  SPR.mold = [makeSprite([
    '...M....M...',
    '..MnM..MnM..',
    '...M.MM.M...',
    '....MnnM....',
    '..MMMMMMMM..',
    '.MMWkMMWkMM.',
    'MMMMMMMMMMMM',
    'MmMMmkkmMMmM',
    'mmmmmmmmmmmm',
  ]), makeSprite([
    '..M......M..',
    '.MnM....MnM.',
    '..M.M..M.M..',
    '....MnnM....',
    '..MMMMMMMM..',
    '.MMWkMMWkMM.',
    'MMMMMMMMMMMM',
    'MmMMmkkmMMmM',
    'mmmmmmmmmmmm',
  ])];

  SPR.flower = [makeSprite([
    '...RRR......',
    '..RrrrR.....',
    '.RrYYYrR....',
    '.RrYkYrR....',
    '.RrYYYrR....',
    '..RrrrR.....',
    '...RRR......',
    '....F.......',
    '..FFF.......',
    '....F.FF....',
    '....FF......',
    '....F.......',
  ], { R: '#e85ab0', r: '#ff9ad6' }), makeSprite([
    '...RRR......',
    '..RrrrR.....',
    '.RrYYYrR....',
    '.RrkkkrR....',
    '.RrYYYrR....',
    '..RrrrR.....',
    '...RRR......',
    '....F.......',
    '..FFF.......',
    '....F.FF....',
    '....FF......',
    '....F.......',
  ], { R: '#e85ab0', r: '#ff9ad6' })];

  SPR.germfly = [makeSprite([
    'tt......tt..',
    '.tt....tt...',
    '..tNNNNt....',
    '.NNWkNWkN...',
    '.NNNNNNNN...',
    '..NNkkNN....',
    '...NNNN.....',
  ]), makeSprite([
    '............',
    '............',
    'ttNNNNNNtt..',
    '.NNWkNWkN...',
    '.NNNNNNNN...',
    '..NNkkNN....',
    '...NNNN.....',
  ])];

  // projectiles & pickups
  SPR.shot = makeSprite([
    '..KK..',
    '.KCLK.',
    'KCCCLK',
    'KBCCCK',
    '.KBBK.',
    '..KK..',
  ]);
  SPR.drop = [makeSprite([
    '...K....',
    '..KCK...',
    '..KCK...',
    '.KCCLK..',
    'KCCCCLK.',
    'KBCCCCK.',
    'KBBCCCK.',
    '.KBBBK..',
    '..KKK...',
  ]), makeSprite([
    '...K....',
    '..KLK...',
    '..KLK...',
    '.KLLWK..',
    'KCLLLWK.',
    'KCCLLLK.',
    'KBCCCLK.',
    '.KBBBK..',
    '..KKK...',
  ])];
  SPR.heart = makeSprite([
    '.HH..HH.',
    'HrrHHrrH',
    'HrHHHHHH',
    'HHHHHHHH',
    '.HHHHHH.',
    '..HHHH..',
    '...HH...',
  ], { r: '#ffd0da' });
  SPR.heartEmpty = makeSprite([
    '.KK..KK.',
    'K..KK..K',
    'K......K',
    'K......K',
    '.K....K.',
    '..K..K..',
    '...KK...',
  ]);
  SPR.spore = makeSprite([
    '.MM.',
    'MnnM',
    'MnnM',
    '.MM.',
  ]);
  SPR.soot = makeSprite([
    '.TT.',
    'TSST',
    'TSST',
    '.TT.',
  ]);
  SPR.pollenBall = makeSprite([
    '.YY.',
    'YyyY',
    'YyyY',
    '.YY.',
  ]);
  SPR.leafPower = makeSprite([
    '.....FF.',
    '...FFfF.',
    '..FFffF.',
    '.FFfFFF.',
    '.FfFFF..',
    'FFFF....',
    'E.......',
  ]);

  // NPCs
  SPR.npc_leafa = makeSprite([
    '.......FF.......',
    '.....FFfFF......',
    '....FfffFFF.....',
    '...FffFFFFFF....',
    '..FfFFFFFFFFF...',
    '..FFFWkFFWkFF...',
    '.FFFFWkFFWkFFF..',
    '.FFFFFFFFFFFFF..',
    '.FFFFUFkkFUFFF..',
    '..FFFFFFFFFFF...',
    '...FFFFFFFFF....',
    '....FFFFFFF.....',
    '......FEF.......',
    '......E.E.......',
    '.....E...E......',
    '.....E...E......',
  ]);
  SPR.npc_mesh = makeSprite([
    '.KKKKKKKKKKKKKK.',
    '.KeEeEeEeEeEeEK.',
    '.KEeEeEeEeEeEeK.',
    '.KeEWWkeEWWkEeK.',
    '.KEeWWkEeWWkeEK.',
    '.KeEeEeEeEeEeEK.',
    '.KEGGGGGGGGGGeK.',
    '.KeEGG.kk.GGEeK.',
    '.KEeEeEeEeEeEeK.',
    '.KeEeEeEeEeEeEK.',
    '.KKKKKKKKKKKKKK.',
    '....KWK..KWK....',
    '....KWK..KWK....',
    '...KKWK..KWKK...',
  ], { e: '#e8dcc0', E: '#c8b890' });
  SPR.npc_frosty = makeSprite([
    '................',
    '..KKKKKKKKKKKK..',
    '..KIIIIIIIILLK..',
    '..KIiIIIIIIILK..',
    '..KIIWkIIWkIIK..',
    '..KIIWkIIWkIIK..',
    '..KIIIIIIIIIIK..',
    '..KIIUIkkIUIIK..',
    '..KIIIIIIIIIiK..',
    '..KiIIIIIIIiiK..',
    '..KKKKKKKKKKKK..',
    '...KIK....KIK...',
    '...KK......KK...',
  ]);
  SPR.npc_granny = makeSprite([
    '.....WWWWW.......',
    '...WWWLLLWWW.....',
    '..WLLWWWWWWLWWW..',
    '.WWWWWWWWWWWWWLW.',
    'WWWWkWWWWWkWWWWWW',
    'WWWkkkWWWkkkWWWWW',
    'WWWWWWWUWWWWWUWWW',
    '.WWWWWWkkkWWWWWW.',
    '..WWWWWWWWWWWWW..',
    '....LLLWWWLLL....',
    '....L..L..L......',
    '...L..L..L.......',
  ]);
  SPR.npc_bee = makeSprite([
    '...LL..LL...',
    '..LWWLLWWL..',
    '...LL..LL...',
    '..KKYYKKYY..',
    '.KYYKKYYKYK.',
    '.KWkYKKYWkK.',
    '.KYYKKYYKYKK',
    '..KKYYKKYY..',
    '...KK..KK...',
  ]);

  // Objects
  SPR.sign = makeSprite([
    '.EEEEEEEEEEEEEE.',
    'EeeeeeeeeeeeeeeE',
    'EeEEEEEEEEEEEEeE',
    'EeeeeeeeeeeeeeeE',
    'EeEEEEEEEEEEeeeE',
    'EeeeeeeeeeeeeeeE',
    '.EEEEEEEEEEEEEE.',
    '.......EE.......',
    '.......EE.......',
    '.......EE.......',
  ]);
  SPR.terminal = [makeSprite([
    '.KKKKKKKKKKKKKK.',
    '.KSSSSSSSSSSSSK.',
    '.KSTTTTTTTTTTSK.',
    '.KST..gg....TSK.',
    '.KST.g..g...TSK.',
    '.KST...g....TSK.',
    '.KST..g.....TSK.',
    '.KST........TSK.',
    '.KST..g.....TSK.',
    '.KSTTTTTTTTTTSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSRSSYSSgSSSK.',
    '.KKKKKKKKKKKKKK.',
    '.....KSSSSK.....',
    '.....KSSSSK.....',
    '...KKKKKKKKKK...',
  ]), makeSprite([
    '.KKKKKKKKKKKKKK.',
    '.KSSSSSSSSSSSSK.',
    '.KSTTTTTTTTTTSK.',
    '.KST........TSK.',
    '.KST.......gTSK.',
    '.KST......g.TSK.',
    '.KST.g...g..TSK.',
    '.KST..g.g...TSK.',
    '.KST...g....TSK.',
    '.KSTTTTTTTTTTSK.',
    '.KSSSSSSSSSSSSK.',
    '.KSSgSSgSSgSSSK.',
    '.KKKKKKKKKKKKKK.',
    '.....KSSSSK.....',
    '.....KSSSSK.....',
    '...KKKKKKKKKK...',
  ])];
  SPR.checkpoint = [makeSprite([
    '..K.............',
    '..KKKKKKK.......',
    '..KGsssGK.......',
    '..KsGsGsK.......',
    '..KssGssK.......',
    '..KsGsGsK.......',
    '..KKKKKKK.......',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '.KKK............',
    'KKKKK...........',
  ]), makeSprite([
    '..K.............',
    '..KKKKKKKKKKKK..',
    '..KCCCCCCCCCCK..',
    '..KCLLLCCWWCCK..',
    '..KCCCCCCCCCCK..',
    '..KCCWWCCLLLCK..',
    '..KKKKKKKKKKKK..',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '..K.............',
    '.KKK............',
    'KKKKK...........',
  ])];
  SPR.lever = [makeSprite([
    '..........KK....',
    '.........KRRK...',
    '.........KRRK...',
    '........KK.K....',
    '.......KK.......',
    '......KK........',
    '....KKKKKKKK....',
    '...KSSSSSSSSK...',
    '...KSTTTTTTSK...',
    '...KKKKKKKKKK...',
  ]), makeSprite([
    '....KK..........',
    '...KggK.........',
    '...KggK.........',
    '....K.KK........',
    '.......KK.......',
    '........KK......',
    '....KKKKKKKK....',
    '...KSSSSSSSSK...',
    '...KSTTTTTTSK...',
    '...KKKKKKKKKK...',
  ])];
  SPR.spring = [makeSprite([
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KRRRRRRRRRRRRK.',
    '.KKKKKKKKKKKKKK.',
    '...KGK....KGK...',
    '....KGK..KGK....',
    '...KGK....KGK...',
    '.KKKKKKKKKKKKKK.',
    '.KSSSSSSSSSSSSK.',
  ]), makeSprite([
    '................',
    '................',
    '................',
    '................',
    '.KKKKKKKKKKKKKK.',
    '.KRRRRRRRRRRRRK.',
    '.KKKKKKKKKKKKKK.',
    '...KGK....KGK...',
    '....KGK..KGK....',
    '.....KGKKGK.....',
    '....KGK..KGK....',
    '...KGK....KGK...',
    '....KGK..KGK....',
    '...KGK....KGK...',
    '.KKKKKKKKKKKKKK.',
    '.KSSSSSSSSSSSSK.',
  ])];
  SPR.key = makeSprite([
    '..YYY.......',
    '.YyyyY......',
    'Yy..yY......',
    'Yy..yYYYYYYY',
    '.YyyyY..Y.YY',
    '..YYY...Y..Y',
  ]);
}

// ---------------------------------------------------------------- Themes ----
// Each theme defines colours for tiles and a background painter.
const THEMES = {
  meadow: {
    sky: ['#5ec8ff', '#8fdcff', '#c4efff'],
    top: '#4cd04c', topHi: '#a2f07a', fill: '#9a5b2e', fillDk: '#6e3d1c', fillHi: '#c07a45',
    plat: '#e07a2e', platDk: '#8a3a10', spike: '#3c8c3c', liquid: '#3a7bd5', liquidHi: '#8fd0ff',
    bg: 'hills', bgCol: ['#7fd67f', '#4fb04f'],
  },
  hills: {
    sky: ['#ffb36b', '#ffd59a', '#fff0c8'],
    top: '#58c858', topHi: '#c0f090', fill: '#8a6a3a', fillDk: '#5a4020', fillHi: '#b08850',
    plat: '#d86ab0', platDk: '#7a2a60', spike: '#2d7a2d', liquid: '#3a7bd5', liquidHi: '#8fd0ff',
    bg: 'flowerhills', bgCol: ['#e0a070', '#9cc860'],
  },
  city: {
    sky: ['#7a7a8a', '#a09aa0', '#c8b8a8'],
    top: '#9a9aa8', topHi: '#d0d0dc', fill: '#6a6a78', fillDk: '#44444e', fillHi: '#8a8a98',
    plat: '#b05030', platDk: '#602010', spike: '#c0c0c0', liquid: '#4a4030', liquidHi: '#8a7a50',
    bg: 'city', bgCol: ['#5a5a68', '#3e3e4a'],
  },
  duct: {
    sky: ['#101830', '#18223e', '#202c4c'],
    top: '#8aa0b8', topHi: '#d0e0f0', fill: '#5a6e86', fillDk: '#38475a', fillHi: '#7890a8',
    plat: '#a0b4c8', platDk: '#4a5a6e', spike: '#d0d8e0', liquid: '#3a3a3a', liquidHi: '#6a6a6a',
    bg: 'duct', bgCol: ['#26324e', '#1a2440'],
  },
  filter: {
    sky: ['#3a3020', '#4a3e2a', '#5a4c34'],
    top: '#d8c8a0', topHi: '#fff4d0', fill: '#a89870', fillDk: '#786a48', fillHi: '#c8b890',
    plat: '#8a8a70', platDk: '#4a4a38', spike: '#6a6a6a', liquid: '#5a4a2a', liquidHi: '#8a7a50',
    bg: 'mesh', bgCol: ['#4a3e2a', '#2e2618'],
  },
  ice: {
    sky: ['#0c2a4a', '#164070', '#2a6098'],
    top: '#e0f8ff', topHi: '#ffffff', fill: '#7fc8ee', fillDk: '#3a88c0', fillHi: '#b5ecfc',
    plat: '#b5ecfc', platDk: '#3a88c0', spike: '#e0f8ff', liquid: '#1a4a8a', liquidHi: '#7fd3f0',
    bg: 'coils', bgCol: ['#1e5a8e', '#123c66'],
  },
  drain: {
    sky: ['#0e1a14', '#14261c', '#1c3226'],
    top: '#5a8a4a', topHi: '#8ac070', fill: '#4a5a52', fillDk: '#2a3830', fillHi: '#6a7a72',
    plat: '#6a7a72', platDk: '#2a3830', spike: '#8ac070', liquid: '#6a9a20', liquidHi: '#b0e040',
    bg: 'pipes', bgCol: ['#1e3428', '#14241c'],
  },
  compressor: {
    sky: ['#2a0e08', '#4a1a0c', '#6a2a10'],
    top: '#e09040', topHi: '#ffd090', fill: '#a05a28', fillDk: '#6a3414', fillHi: '#c87838',
    plat: '#c0c0c8', platDk: '#606068', spike: '#ff6a2a', liquid: '#ff5a10', liquidHi: '#ffd040',
    bg: 'machine', bgCol: ['#5a2410', '#3a1608'],
  },
  factory: {
    sky: ['#3a2a2a', '#5a3e34', '#7a5a44'],
    top: '#7a6a5a', topHi: '#a89a88', fill: '#5a4038', fillDk: '#3a2820', fillHi: '#7a5a50',
    plat: '#8a4a2a', platDk: '#4a2010', spike: '#b0b0b0', liquid: '#2a2a1a', liquidHi: '#6a6a2a',
    bg: 'factory', bgCol: ['#4a3830', '#2e221e'],
  },
  sky: {
    sky: ['#4a3a6a', '#6a5a8a', '#9a8aaa'],
    top: '#ffffff', topHi: '#ffffff', fill: '#dce8f4', fillDk: '#a8b8d0', fillHi: '#f0f8ff',
    plat: '#f0f0ff', platDk: '#9a9ac0', spike: '#5a5a6a', liquid: '#3a3a4a', liquidHi: '#6a6a7a',
    bg: 'clouds', bgCol: ['#7a6a9a', '#5a4a7a'],
  },
};

const TILE = 16;

// Pre-render tile images for a theme.
function buildTileset(themeName) {
  const T = THEMES[themeName];
  // Tiles are painted at logical 16x16 coordinates onto a 2x canvas, then a
  // texture pass adds per-pixel colour noise + soft vertical lighting.
  let seed = themeName.length * 977;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const mk = (fn, opts = {}) => {
    const c = document.createElement('canvas');
    c.width = TILE * 2; c.height = TILE * 2;
    const g = c.getContext('2d');
    g.scale(2, 2);
    fn(g);
    if (opts.texture !== false) {
      const id = g.getImageData(0, 0, 32, 32), d = id.data;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const i = (y * 32 + x) * 4;
        if (d[i + 3] === 0) continue;
        const n = (rnd() - 0.5) * 22 + (opts.light === false ? 0 : (8 - y * 0.5));
        d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
      }
      g.putImageData(id, 0, 0);
    }
    return c;
  };
  const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const ts = {};
  const fillPattern = (g) => {
    px(g, 0, 0, 16, 16, T.fill);
    switch (themeName) {
      case 'city': case 'factory':
        // bricks
        for (let r = 0; r < 4; r++) {
          px(g, 0, r * 4 + 3, 16, 1, T.fillDk);
          const off = r % 2 ? 0 : 8;
          px(g, off, r * 4, 1, 3, T.fillDk);
          px(g, (off + 8) % 16 === 0 ? 15 : off + 8 - 1, r * 4, 0, 3, T.fillDk);
          px(g, off + 1, r * 4, 6, 1, T.fillHi);
        }
        break;
      case 'duct': case 'compressor':
        px(g, 0, 0, 16, 1, T.fillHi); px(g, 0, 15, 16, 1, T.fillDk);
        px(g, 0, 0, 1, 16, T.fillHi); px(g, 15, 0, 1, 16, T.fillDk);
        px(g, 2, 2, 2, 2, T.fillDk); px(g, 12, 2, 2, 2, T.fillDk);
        px(g, 2, 12, 2, 2, T.fillDk); px(g, 12, 12, 2, 2, T.fillDk);
        px(g, 2, 2, 1, 1, T.fillHi); px(g, 12, 2, 1, 1, T.fillHi);
        break;
      case 'filter':
        for (let i = 0; i < 16; i += 4) { px(g, i, 0, 1, 16, T.fillDk); px(g, 0, i, 16, 1, T.fillDk); }
        px(g, 2, 2, 1, 1, T.fillHi); px(g, 10, 6, 1, 1, T.fillHi);
        break;
      case 'ice':
        px(g, 0, 0, 16, 1, T.fillHi); px(g, 0, 15, 16, 1, T.fillDk);
        px(g, 3, 3, 4, 1, T.fillHi); px(g, 3, 4, 1, 3, T.fillHi);
        px(g, 10, 10, 3, 1, '#ffffff');
        px(g, 15, 0, 1, 16, T.fillDk);
        break;
      case 'drain':
        px(g, 0, 7, 16, 2, T.fillDk); px(g, 7, 0, 2, 7, T.fillDk); px(g, 3, 9, 2, 7, T.fillDk);
        px(g, 1, 1, 3, 1, T.fillHi); px(g, 10, 11, 3, 1, T.fillHi);
        break;
      case 'sky':
        px(g, 0, 12, 16, 4, T.fillDk);
        px(g, 2, 3, 3, 2, '#ffffff'); px(g, 9, 7, 4, 2, '#ffffff');
        break;
      default:
        // dirt with stones
        px(g, 3, 4, 2, 2, T.fillDk); px(g, 11, 9, 3, 2, T.fillDk); px(g, 6, 12, 2, 1, T.fillDk);
        px(g, 3, 4, 1, 1, T.fillHi); px(g, 11, 9, 1, 1, T.fillHi);
        px(g, 13, 2, 1, 1, T.fillHi); px(g, 1, 13, 1, 1, T.fillHi);
    }
  };
  ts.fill = mk(fillPattern);
  ts.top = mk(g => {
    fillPattern(g);
    if (['meadow', 'hills', 'drain'].includes(themeName)) {
      px(g, 0, 0, 16, 5, T.top);
      px(g, 0, 0, 16, 1, T.topHi);
      for (let x = 0; x < 16; x += 3) px(g, x, 5, 2, (x * 7) % 3 + 1, T.top);
      if (themeName === 'hills') { px(g, 5, 1, 1, 1, '#ff9ad6'); px(g, 12, 2, 1, 1, '#ffd23f'); }
    } else if (themeName === 'ice') {
      px(g, 0, 0, 16, 4, T.top); px(g, 0, 0, 16, 1, T.topHi);
      px(g, 2, 4, 1, 3, T.top); px(g, 9, 4, 1, 4, T.top); px(g, 13, 4, 1, 2, T.top);
    } else if (themeName === 'sky') {
      px(g, 0, 0, 16, 16, T.fill);
      px(g, 0, 0, 16, 3, '#ffffff');
      px(g, 0, 12, 16, 4, T.fillDk);
      px(g, 3, 6, 4, 2, '#ffffff');
    } else {
      px(g, 0, 0, 16, 2, T.top); px(g, 0, 0, 16, 1, T.topHi);
    }
  });
  ts.plat = mk(g => {
    px(g, 0, 0, 16, 16, T.plat);
    px(g, 0, 0, 16, 1, '#ffffff55'.slice(0, 7));
    px(g, 0, 7, 16, 1, T.platDk); px(g, 0, 15, 16, 1, T.platDk);
    px(g, 7, 0, 1, 7, T.platDk); px(g, 3, 8, 1, 7, T.platDk); px(g, 11, 8, 1, 7, T.platDk);
    px(g, 15, 0, 1, 7, T.platDk);
  });
  ts.oneway = mk(g => {
    px(g, 0, 0, 16, 4, T.plat); px(g, 0, 0, 16, 1, T.topHi);
    px(g, 0, 4, 16, 1, T.platDk);
    px(g, 2, 5, 2, 3, T.platDk); px(g, 12, 5, 2, 3, T.platDk);
  });
  ts.spike = mk(g => {
    for (let i = 0; i < 4; i++) {
      const bx = i * 4;
      for (let h = 0; h < 8; h++) {
        const w = Math.max(1, Math.floor((8 - h) / 2));
        px(g, bx + 2 - Math.floor(w / 2), 8 + h, w, 1, T.spike);
      }
      px(g, bx + 1, 10, 1, 4, '#ffffff');
    }
    px(g, 0, 15, 16, 1, T.fillDk);
  });
  ts.ice = mk(g => {
    px(g, 0, 0, 16, 16, '#b5ecfc');
    px(g, 0, 0, 16, 2, '#ffffff');
    px(g, 2, 4, 6, 1, '#ffffff'); px(g, 9, 9, 4, 1, '#ffffff');
    px(g, 0, 15, 16, 1, '#3a88c0'); px(g, 15, 0, 1, 16, '#3a88c0');
  });
  ts.gate = mk(g => {
    px(g, 0, 0, 16, 16, '#2a2a3a');
    for (let x = 1; x < 16; x += 5) { px(g, x, 0, 3, 16, '#e8402a'); px(g, x, 0, 1, 16, '#ff9a8a'); }
    px(g, 0, 7, 16, 2, '#ffd23f');
  });
  ts.door = mk(g => {
    px(g, 0, 0, 16, 16, '#4a4a6a');
    px(g, 1, 1, 14, 14, '#6a6a9a');
    px(g, 3, 3, 10, 10, '#4a4a6a');
    px(g, 6, 6, 4, 4, '#7cff4f');
  });
  ts.crumble = mk(g => {
    px(g, 0, 0, 16, 16, T.fillHi);
    px(g, 0, 0, 16, 1, '#ffffff');
    px(g, 3, 0, 1, 6, T.fillDk); px(g, 4, 6, 1, 4, T.fillDk); px(g, 10, 4, 1, 8, T.fillDk);
    px(g, 11, 12, 1, 4, T.fillDk); px(g, 0, 15, 16, 1, T.fillDk);
  });
  ts.convL = mk(g => {
    px(g, 0, 0, 16, 16, '#3a3a40'); px(g, 0, 0, 16, 3, '#9a9aa0');
    for (let x = 0; x < 16; x += 4) px(g, x, 1, 2, 1, '#ffd23f');
    px(g, 3, 7, 3, 3, '#6a6a70'); px(g, 10, 7, 3, 3, '#6a6a70');
  });
  return ts;
}

// ------------------------------------------------------------ Backgrounds --
function buildBackground(themeName, W, H) {
  const T = THEMES[themeName];
  const layers = [];
  // layers are painted at 2x so shapes stay crisp on the 2x game canvas
  const mk = (w, h, fn, sc = 2) => {
    const c = document.createElement('canvas');
    c.width = w * sc; c.height = h * sc;
    const g = c.getContext('2d');
    g.scale(sc, sc);
    fn(g, w, h);
    c.lw = w; c.lh = h;
    return c;
  };
  // sky: smooth full-colour gradient with a soft glow
  const sky = mk(W, H, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    T.sky.forEach((c, i) => gr.addColorStop(i / (T.sky.length - 1), c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.78, h * 0.18, 4, w * 0.78, h * 0.18, h * 0.9);
    glow.addColorStop(0, 'rgba(255,255,235,0.35)');
    glow.addColorStop(1, 'rgba(255,255,235,0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
  }, 1);
  layers.push({ img: sky, factor: 0, y: 0 });

  let seed = 1234;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const LW = 512;
  const far = (fn) => mk(LW, H, fn);

  switch (T.bg) {
    case 'hills':
    case 'flowerhills': {
      layers.push({ factor: 0.05, img: far((g) => {
        // sun / clouds
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 6; i++) {
          const x = rnd() * LW, y = 10 + rnd() * 50;
          g.fillRect(x, y, 30, 8); g.fillRect(x + 6, y - 5, 16, 5); g.fillRect(x + 4, y + 8, 22, 3);
        }
        if (T.bg === 'hills') {
          const sg = g.createRadialGradient(410, 32, 4, 410, 32, 40);
          sg.addColorStop(0, 'rgba(255,250,200,0.9)'); sg.addColorStop(1, 'rgba(255,250,200,0)');
          g.fillStyle = sg; g.fillRect(370, 0, 80, 80);
          g.fillStyle = '#fff6b0'; g.beginPath(); g.arc(410, 32, 11, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(410, 32, 9, 0, Math.PI * 2); g.fill();
        }
      }) });
      layers.push({ factor: 0.2, img: far((g, w, h) => {
        g.fillStyle = T.bgCol[0];
        for (let x = 0; x < w; x++) {
          const y = h * 0.55 + Math.sin(x / 40) * 18 + Math.sin(x / 17) * 6;
          g.fillRect(x, Math.round(y / 2) * 2, 1, h);
        }
      }) });
      layers.push({ factor: 0.45, img: far((g, w, h) => {
        g.fillStyle = T.bgCol[1];
        for (let x = 0; x < w; x++) {
          const y = h * 0.7 + Math.sin(x / 25 + 2) * 12;
          g.fillRect(x, Math.round(y / 2) * 2, 1, h);
        }
        // little trees
        for (let i = 0; i < 10; i++) {
          const x = Math.floor(rnd() * w), y = Math.floor(h * 0.62);
          g.fillStyle = '#2e8a2e'; g.fillRect(x, y, 10, 12); g.fillRect(x + 2, y - 4, 6, 4);
          g.fillStyle = '#6a3a1a'; g.fillRect(x + 4, y + 12, 2, 6);
          if (T.bg === 'flowerhills') { g.fillStyle = ['#ff9ad6', '#ffd23f', '#ffffff'][i % 3]; g.fillRect(x + 3, y + 3, 2, 2); }
        }
      }) });
      break;
    }
    case 'city': {
      layers.push({ factor: 0.1, img: far((g, w, h) => {
        g.fillStyle = T.bgCol[0];
        let x = 0;
        while (x < w) { const bw = 20 + rnd() * 30, bh = 40 + rnd() * 70; g.fillRect(x, h - bh - 30, bw, bh + 30); x += bw + 2; }
        // smog haze
        g.fillStyle = '#8a7a6a55';
        g.fillRect(0, h * 0.35, w, 20);
      }) });
      layers.push({ factor: 0.3, img: far((g, w, h) => {
        let x = 0;
        while (x < w) {
          const bw = 30 + rnd() * 30, bh = 50 + rnd() * 60, y = h - bh - 10;
          g.fillStyle = T.bgCol[1]; g.fillRect(x, y, bw, bh + 10);
          for (let wy = y + 6; wy < h - 20; wy += 10)
            for (let wx = x + 4; wx < x + bw - 6; wx += 8) {
              g.fillStyle = rnd() < 0.35 ? '#ffe680' : '#2a2a34'; g.fillRect(wx, wy, 4, 5);
            }
          // rooftop AC unit
          if (rnd() < 0.6) { g.fillStyle = '#9a9aa8'; g.fillRect(x + 4, y - 8, 14, 8); g.fillStyle = '#5a5a68'; g.fillRect(x + 7, y - 6, 8, 4); }
          x += bw + 6;
        }
      }) });
      break;
    }
    case 'duct': case 'mesh': case 'machine': case 'pipes': case 'coils': case 'factory': {
      layers.push({ factor: 0.15, img: far((g, w, h) => {
        g.fillStyle = T.bgCol[0];
        if (T.bg === 'coils') {
          for (let x = 0; x < w; x += 16) { g.fillRect(x, 0, 6, h); g.fillStyle = '#2a7ab8'; g.fillRect(x + 1, 0, 1, h); g.fillStyle = T.bgCol[0]; }
          g.fillStyle = '#b5ecfc33';
          for (let y = 0; y < h; y += 24) g.fillRect(0, y, w, 3);
        } else if (T.bg === 'mesh') {
          for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
          for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1);
          g.fillStyle = '#6a5a3a';
          for (let i = 0; i < 60; i++) g.fillRect(rnd() * w, rnd() * h, 3 + rnd() * 6, 2 + rnd() * 4);
        } else if (T.bg === 'factory') {
          for (let i = 0; i < 6; i++) {
            const x = i * 90 + rnd() * 30, ch = 80 + rnd() * 60;
            g.fillRect(x, h - ch, 18, ch); g.fillStyle = '#c03020'; g.fillRect(x, h - ch + 6, 18, 4); g.fillStyle = T.bgCol[0];
            g.fillRect(x - 20, h - 50, 60, 50);
          }
          g.fillStyle = '#2a2a2a88';
          for (let i = 0; i < 20; i++) g.fillRect(rnd() * w, rnd() * h * 0.4, 20 + rnd() * 30, 8 + rnd() * 8);
        } else {
          // panels with rivets / pipes
          for (let x = 0; x < w; x += 64) {
            g.fillStyle = T.bgCol[0]; g.fillRect(x, 0, 62, h);
            g.fillStyle = T.bgCol[1]; g.fillRect(x + 62, 0, 2, h);
            for (let y = 8; y < h; y += 32) { g.fillStyle = T.bgCol[1]; g.fillRect(x + 4, y, 2, 2); g.fillRect(x + 56, y, 2, 2); }
          }
        }
      }) });
      layers.push({ factor: 0.35, img: far((g, w, h) => {
        const dark = T.bgCol[1];
        if (T.bg === 'duct' || T.bg === 'machine') {
          // big fans
          for (let i = 0; i < 3; i++) {
            const cx = 80 + i * 170, cy = h * 0.45, r = 34;
            g.fillStyle = dark;
            for (let y = -r; y <= r; y++) { const xx = Math.floor(Math.sqrt(r * r - y * y)); g.fillRect(cx - xx, cy + y, xx * 2, 1); }
            g.fillStyle = T.bg === 'machine' ? '#8a3a18' : '#3a4a6a';
            for (let a = 0; a < 3; a++) {
              const ang = a * 2.094;
              for (let t = 4; t < r - 4; t++) g.fillRect(cx + Math.cos(ang) * t - 3, cy + Math.sin(ang) * t - 3, 6, 6);
            }
          }
        } else if (T.bg === 'pipes') {
          g.fillStyle = dark;
          for (let i = 0; i < 6; i++) {
            const y = 20 + rnd() * (h - 60);
            g.fillRect(0, y, w, 10);
            g.fillStyle = '#2e4a3a'; g.fillRect(0, y + 1, w, 2); g.fillStyle = dark;
          }
          for (let i = 0; i < 25; i++) { g.fillStyle = '#4a7a30'; g.fillRect(rnd() * w, rnd() * h, 2, 6 + rnd() * 10); }
        } else if (T.bg === 'coils') {
          g.fillStyle = '#ffffff';
          for (let i = 0; i < 40; i++) g.fillRect(rnd() * w, rnd() * h, 1, 1);
          g.fillStyle = dark;
          for (let i = 0; i < 8; i++) { const x = rnd() * w; g.fillRect(x, 0, 4, 20 + rnd() * 30); g.fillRect(x + 1, 0, 2, 30 + rnd() * 30); }
        } else if (T.bg === 'factory') {
          g.fillStyle = dark;
          for (let x = 0; x < w; x += 40) { g.fillRect(x, h - 60, 36, 60); g.fillRect(x + 4, h - 70, 8, 10); }
        } else {
          g.fillStyle = dark;
          for (let i = 0; i < 12; i++) g.fillRect(rnd() * w, rnd() * h, 8, 8);
        }
      }) });
      break;
    }
    case 'clouds': {
      layers.push({ factor: 0.05, img: far((g, w, h) => {
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 50; i++) g.fillRect(rnd() * w, rnd() * h * 0.5, 1, 1);
        g.fillStyle = '#5a4a6a';
        g.fillRect(0, h - 40, w, 40);
        let x = 0;
        while (x < w) { const bw = 10 + rnd() * 20, bh = 10 + rnd() * 40; g.fillRect(x, h - 40 - bh, bw, bh); x += bw + 3; }
      }) });
      layers.push({ factor: 0.25, img: far((g, w, h) => {
        for (let i = 0; i < 10; i++) {
          const x = rnd() * w, y = rnd() * h * 0.8, s = 1 + rnd() * 2;
          g.fillStyle = '#8a7aaa'; g.fillRect(x, y, 30 * s, 8 * s); g.fillRect(x + 6 * s, y - 5 * s, 16 * s, 5 * s);
          g.fillStyle = '#aa9aca'; g.fillRect(x + 2, y, 30 * s - 4, 2);
        }
      }) });
      break;
    }
  }
  return layers;
}
