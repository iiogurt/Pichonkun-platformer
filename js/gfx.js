// GFX core: a tiny procedural pixel-art toolkit.
// Sprites and terrain are "painted" per pixel from shape maths (signed distance
// functions), shaded with hand-picked colour ramps + ordered dithering, then
// outlined - so everything keeps a crisp pixel-art look at any size.
'use strict';
const GFX = (() => {
  // ------------------------------------------------------------ maths
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

  function hash(x, y, s = 0) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4, s = 0) {
    let v = 0, a = 0.5, n = 0;
    for (let i = 0; i < oct; i++) { v += vnoise(x, y, s + i * 17) * a; n += a; x *= 2.03; y *= 2.03; a *= 0.5; }
    return v / n;
  }
  // cellular noise: distance to nearest/second feature point + cell id
  function worley(x, y, s = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let d1 = 9, d2 = 9, id = 0, px = 0, py = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const fx = cx + hash(cx, cy, s), fy = cy + hash(cx, cy, s + 7);
      const d = Math.hypot(fx - x, fy - y);
      if (d < d1) { d2 = d1; d1 = d; id = hash(cx, cy, s + 13); px = fx; py = fy; } else if (d < d2) d2 = d;
    }
    return { d1, d2, id, px, py };
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (x, y) => (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

  // ----------------------------------------------------------- colour
  function rgb(hex) {
    if (Array.isArray(hex)) return hex;
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const ramp = (...cols) => cols.map(rgb);
  // pick a tone from a ramp (dark -> light) with ordered dithering between neighbours
  function tone(rmp, t, x, y, dith = 0.6) {
    const n = rmp.length - 1;
    const d = 0.5 + (bayer(x, y) - 0.5) * dith;
    return rmp[clamp(Math.floor(clamp(t) * n + d), 0, n)];
  }
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ------------------------------------------------------------- SDFs
  const sd = {
    circle: (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r,
    ellipse: (x, y, cx, cy, rx, ry) => { // cheap approximation, fine for pixel art
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const k = Math.hypot(dx, dy);
      return (k - 1) * Math.min(rx, ry);
    },
    box: (x, y, cx, cy, hw, hh, r = 0) => {
      const dx = Math.abs(x - cx) - hw + r, dy = Math.abs(y - cy) - hh + r;
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
    },
    seg: (x, y, ax, ay, bx, by, r) => {
      const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
      const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay || 1));
      return Math.hypot(pax - bax * h, pay - bay * h) - r;
    },
    // tapered capsule from (ax,ay) radius r1 to (bx,by) radius r2 -> teardrops, limbs, horns
    cone: (x, y, ax, ay, r1, bx, by, r2) => {
      const dx = bx - ax, dy = by - ay, h = Math.hypot(dx, dy) || 1;
      const ux = dx / h, uy = dy / h;
      const px = Math.abs((x - ax) * -uy + (y - ay) * ux), py = (x - ax) * ux + (y - ay) * uy;
      const b = (r1 - r2) / h, a = Math.sqrt(Math.max(0, 1 - b * b));
      const k = px * -b + py * a;
      if (k < 0) return Math.hypot(px, py) - r1;
      if (k > a * h) return Math.hypot(px, py - h) - r2;
      return px * a + py * b - r1;
    },
    union: (...d) => Math.min(...d),
    sunion: (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k); return lerp(b, a, h) - k * h * (1 - h); },
  };

  // ----------------------------------------------------------- canvas
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  // Paint a canvas per pixel. fn(x, y) -> null | [r,g,b] | [r,g,b,a]
  function paint(w, h, fn) {
    const c = canvas(w, h), g = c.getContext('2d');
    const id = g.createImageData(c.width, c.height), d = id.data;
    let i = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++, i += 4) {
      const col = fn(x + 0.5, y + 0.5, x, y);
      if (!col) continue;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col.length > 3 ? col[3] : 255;
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  // Add a 1px outline around opaque pixels (needs 1px of free margin).
  function outline(c, col, diag = false) {
    const g = c.getContext('2d'), w = c.width, h = c.height;
    const id = g.getImageData(0, 0, w, h), d = id.data, src = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) src[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    const o = rgb(col);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (src[i]) continue;
      let n = (x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) || (y > 0 && src[i - w]) || (y < h - 1 && src[i + w]);
      if (!n && diag) n = (x > 0 && y > 0 && src[i - w - 1]) || (x < w - 1 && y > 0 && src[i - w + 1]) || (x > 0 && y < h - 1 && src[i + w - 1]) || (x < w - 1 && y < h - 1 && src[i + w + 1]);
      if (n) { d[i * 4] = o[0]; d[i * 4 + 1] = o[1]; d[i * 4 + 2] = o[2]; d[i * 4 + 3] = 255; }
    }
    g.putImageData(id, 0, 0);
    return c;
  }
  // Stack canvases (same size) bottom -> top.
  function stack(...layers) {
    const c = canvas(layers[0].width, layers[0].height), g = c.getContext('2d');
    for (const l of layers) if (l) g.drawImage(l, 0, 0);
    return c;
  }
  function flipX(c) {
    const o = canvas(c.width, c.height), g = o.getContext('2d');
    g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
    return o;
  }
  function silhouette(c, col = '#ffffff') {
    const o = canvas(c.width, c.height), g = o.getContext('2d');
    g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, o.width, o.height);
    return o;
  }
  // set individual pixels: px(g, '#fff', [[x,y],...])
  function px(g, col, pts) { g.fillStyle = Array.isArray(col) ? css(col) : col; for (const p of pts) g.fillRect(p[0], p[1], p[2] || 1, p[3] || 1); }

  // Shading helper: lit sphere. Returns 0..1 brightness for a ramp.
  function sphereLight(x, y, cx, cy, r, lx = 0.55, ly = -0.65) {
    const nx = (x - cx) / r, ny = (y - cy) / r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    return clamp(0.42 + 0.5 * (nx * lx + ny * ly) + nz * 0.22);
  }

  // A soft radial light/glow texture (smooth on purpose - used for lighting & bloom).
  const glowCache = new Map();
  function glowTex(col, r, core = 0.55) {
    const k = col + '|' + r + '|' + core;
    let c = glowCache.get(k);
    if (c) return c;
    c = canvas(r * 2, r * 2);
    const g = c.getContext('2d'), [R, G, B] = rgb(col);
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, `rgba(${R},${G},${B},${core})`);
    gr.addColorStop(0.35, `rgba(${R},${G},${B},${core * 0.42})`);
    gr.addColorStop(0.7, `rgba(${R},${G},${B},${core * 0.1})`);
    gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
    glowCache.set(k, c);
    return c;
  }

  return { clamp, lerp, smooth, hash, vnoise, fbm, worley, bayer, rgb, ramp, tone, mixc, css, sd, canvas, paint, outline, stack, flipX, silhouette, px, sphereLight, glowTex };
})();
