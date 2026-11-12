// Chiptune audio: WebAudio square/triangle/noise synth, a tiny sequencer and SFX.
'use strict';
const AUDIO = (() => {
  let ctx = null, master, musicGain, sfxGain, noiseBuf;
  let musicOn = true, sfxOn = true;
  let current = null; // { name, track, step, nextTime }
  let timer = null;

  const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(tok) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(tok);
    if (!m) return 0;
    let n = NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const oct = +m[3];
    const midi = (oct + 1) * 12 + n;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = musicOn ? 0.55 : 0; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = sfxOn ? 0.8 : 0; sfxGain.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (current) startScheduler();
  }

  // ---- low-level voices
  function tone(type, f, t, dur, vol, dest, slideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t, dur, vol, dest, hp = 1000, lp = 12000) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f1 = ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  // ---- music
  const DRUMS = {
    basic: 'k . h . s . h . ',
    drive: 'k h k h s h k h ',
    soft:  'k . . . h . . . ',
    march: 'k . k . s . h h ',
    boss:  'k h s h k k s h ',
    none:  '. . . . . . . . ',
  };
  function parse(str) {
    return str.replace(/\|/g, ' ').trim().split(/\s+/);
  }
  function T(bpm, lead, bass, drums, opts = {}) {
    const l = parse(lead), b = parse(bass);
    const len = Math.max(l.length, b.length);
    const dr = parse(DRUMS[drums].repeat(Math.ceil(len / 8)));
    return { bpm, lead: l, bass: b, drums: dr, len, loop: opts.loop !== false, leadType: opts.leadType || 'square', vol: opts.vol || 1 };
  }

  const TRACKS = {
    title: T(120,
      'C5 - E5 - G5 - E5 G5 | A5 - G5 - E5 - C5 - | D5 - F5 - A5 - G5 F5 | E5 - D5 - C5 - - - | E5 - G5 - C6 - B5 A5 | G5 - E5 - C5 - D5 E5 | F5 - E5 - D5 - B4 - | C5 - - - . . . . ',
      'C3 . G2 . C3 . G2 . | F2 . C3 . F2 . C3 . | D3 . A2 . G2 . B2 . | C3 . G2 . C3 . G2 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . G2 . | D3 . A2 . G2 . G2 . | C3 . G2 . C3 . . . ',
      'basic'),
    meadow: T(132,
      'G4 - B4 D5 - B4 G4 - | A4 - C5 E5 - C5 A4 - | B4 - D5 G5 - F#5 E5 D5 | C5 - A4 - F#4 - D4 - | G4 B4 D5 G5 - D5 B4 G4 | E5 - D5 C5 B4 - A4 - | B4 - G4 - A4 - F#4 - | G4 - - - . . . . ',
      'G2 . D3 . G2 . D3 . | A2 . E3 . A2 . E3 . | G2 . D3 . E2 . B2 . | C3 . A2 . D3 . D2 . | G2 . D3 . G2 . D3 . | C3 . G2 . C3 . A2 . | G2 . D3 . D3 . D2 . | G2 . D3 . G2 . . . ',
      'basic'),
    city: T(116,
      'A4 . C5 . D5 Eb5 E5 . | G5 - E5 - D5 - C5 . | A4 . C5 . D5 Eb5 E5 . | D5 - C5 - A4 - - . | C5 . C5 D5 E5 . G5 . | A5 - G5 - E5 - D5 . | C5 . A4 . G4 . A4 . | A4 - - - . . . . ',
      'A2 . A2 C3 D3 . E3 . | A2 . A2 C3 D3 . E3 . | D3 . D3 F3 G3 . A3 . | A2 . A2 C3 D3 . E3 . | F2 . F2 A2 C3 . F3 . | E2 . E2 G#2 B2 . E3 . | A2 . A2 C3 D3 . E3 . | A2 . E2 . A2 . . . ',
      'march'),
    duct: T(100,
      'D4 F4 A4 D5 A4 F4 D4 F4 | C4 E4 G4 C5 G4 E4 C4 E4 | Bb3 D4 F4 Bb4 F4 D4 Bb3 D4 | A3 C#4 E4 A4 E4 C#4 A3 C#4 | D5 - - - F5 - E5 - | C5 - - - E5 - D5 - | Bb4 - D5 - F5 - E5 D5 | C#5 - - - A4 - - - ',
      'D2 - - - D2 - - - | C2 - - - C2 - - - | Bb1 - - - Bb1 - - - | A1 - - - A1 - - - | D2 - - - D2 - - - | C2 - - - C2 - - - | Bb1 - - - Bb1 - - - | A1 - - - A1 - - - ',
      'soft', { leadType: 'square' }),
    ice: T(92,
      'E5 . B4 . G4 . B4 . | E5 . F#5 . G5 - - . | D5 . A4 . F#4 . A4 . | D5 . E5 . F#5 - - . | C5 . G4 . E4 . G4 . | C5 . D5 . E5 - D5 . | B4 . F#4 . D#4 . F#4 . | B4 - - - - - - . ',
      'E2 - - - E2 - - - | E2 - - - E2 - - - | D2 - - - D2 - - - | D2 - - - D2 - - - | C2 - - - C2 - - - | C2 - - - C2 - - - | B1 - - - B1 - - - | B1 - - - B1 - - - ',
      'soft', { leadType: 'triangle', vol: 1.6 }),
    drain: T(108,
      'C4 . . Eb4 . . G4 . | F#4 . . . G4 . . . | C4 . . Eb4 . . Ab4 . | G4 - - - . . . . | C5 . B4 . Bb4 . A4 . | Ab4 - G4 - F#4 - G4 . | Eb4 . D4 . C4 . B3 . | C4 - - - . . . . ',
      'C2 . C2 . C2 . C2 . | D2 . D2 . D2 . D2 . | Ab1 . Ab1 . Ab1 . Ab1 . | G1 . G1 . G1 . B1 . | C2 . C2 . C2 . C2 . | F2 . F2 . G2 . G2 . | Ab1 . Ab1 . G1 . G1 . | C2 . G1 . C2 . . . ',
      'basic'),
    factory: T(140,
      'E4 E4 . E4 G4 . E4 . | D4 D4 . D4 F#4 . D4 . | C4 C4 . C4 E4 . G4 . | B3 . D4 . F#4 . B4 . | E5 - D5 - B4 - G4 - | A4 - B4 - D5 - B4 - | C5 - B4 - G4 - E4 - | F#4 - G4 - A4 - B4 - ',
      'E2 E3 E2 E3 E2 E3 E2 E3 | D2 D3 D2 D3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 | B1 B2 B1 B2 B1 B2 B1 B2 | E2 E3 E2 E3 E2 E3 E2 E3 | D2 D3 D2 D3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 | B1 B2 B1 B2 B1 B2 B1 B2 ',
      'drive'),
    boss: T(160,
      'E5 . E5 F5 E5 . D5 . | E5 . E5 F5 G5 . F5 . | E5 . B4 . C5 . A4 . | B4 . G#4 . A4 - B4 - | A5 . A5 G5 F5 . E5 . | F5 . F5 E5 D5 . C5 . | B4 . C5 . D5 . E5 . | G#5 - - - E5 - - - ',
      'A2 A2 A3 A2 A2 A2 A3 A2 | F2 F2 F3 F2 F2 F2 F3 F2 | D2 D2 D3 D2 D2 D2 D3 D2 | E2 E2 E3 E2 E2 E2 E3 E2 | A2 A2 A3 A2 A2 A2 A3 A2 | F2 F2 F3 F2 F2 F2 F3 F2 | D2 D2 D3 D2 D2 D2 D3 D2 | E2 E2 E3 E2 E2 E2 E3 E2 ',
      'boss'),
    sky: T(150,
      'C5 - G4 - C5 - Eb5 - | D5 - Bb4 - D5 - F5 - | Eb5 - D5 - C5 - Bb4 - | G4 - - - G4 Ab4 Bb4 B4 | C5 - G4 - C5 - Eb5 - | F5 - Eb5 - D5 - F5 - | G5 - F5 - Eb5 - D5 - | C5 - - - . . . . ',
      'C3 C3 G2 G2 C3 C3 G2 G2 | Bb2 Bb2 F2 F2 Bb2 Bb2 F2 F2 | Ab2 Ab2 Eb2 Eb2 Ab2 Ab2 Eb2 Eb2 | G2 G2 D2 D2 G2 G2 B2 B2 | C3 C3 G2 G2 C3 C3 G2 G2 | Ab2 Ab2 Eb2 Eb2 Bb2 Bb2 F2 F2 | Eb2 Eb2 Bb2 Bb2 G2 G2 D2 D2 | C3 C3 G2 G2 C3 . . . ',
      'march'),
    victory: T(150,
      'C5 E5 G5 C6 - G5 C6 - - - - . . . . . ',
      'C3 . G3 . C4 - - - - - - . . . . . ',
      'none', { loop: false }),
    ending: T(96,
      'A4 - C5 - F5 - E5 - | D5 - C5 - A4 - - - | Bb4 - D5 - G5 - F5 - | E5 - - - C5 - - - | A4 - C5 - F5 - A5 - | G5 - F5 - D5 - E5 - | F5 - - - C5 - A4 - | F4 - - - - - - - ',
      'F2 - - - C3 - - - | D2 - - - A2 - - - | Bb2 - - - G2 - - - | C3 - - - C2 - - - | F2 - - - C3 - - - | Bb2 - - - C3 - - - | F2 - - - C3 - - - | F2 - - - - - - - ',
      'soft', { leadType: 'triangle', vol: 1.6 }),
    gameover: T(100,
      'G4 - F#4 - F4 - E4 - - - - . ',
      'C3 - B2 - Bb2 - A2 - - - - . ',
      'none', { loop: false }),
  };

  function playMusic(name) {
    if (current && current.name === name) return;
    stopMusic();
    const track = TRACKS[name];
    if (!track) return;
    current = { name, track, step: 0, nextTime: 0 };
    if (ctx) startScheduler();
  }
  function startScheduler() {
    if (timer) clearInterval(timer);
    current.nextTime = ctx.currentTime + 0.05;
    timer = setInterval(schedule, 25);
  }
  function stopMusic() {
    if (timer) clearInterval(timer);
    timer = null;
    current = null;
  }
  function noteLen(arr, i) {
    let n = 1;
    while (arr[(i + n) % arr.length] === '-' && n < arr.length) n++;
    return n;
  }
  function schedule() {
    if (!current || !ctx) return;
    const tr = current.track;
    const stepDur = 60 / tr.bpm / 2; // 8th notes
    while (current.nextTime < ctx.currentTime + 0.12) {
      const i = current.step, t = current.nextTime;
      const ln = tr.lead[i], bs = tr.bass[i], dr = tr.drums[i];
      if (ln && ln !== '-' && ln !== '.') tone(tr.leadType, freq(ln), t, stepDur * noteLen(tr.lead, i) * 0.92, 0.11 * tr.vol, musicGain);
      if (bs && bs !== '-' && bs !== '.') tone('triangle', freq(bs), t, stepDur * noteLen(tr.bass, i) * 0.95, 0.28, musicGain);
      if (dr === 'k') tone('sine', 150, t, 0.12, 0.5, musicGain, 40);
      else if (dr === 's') noise(t, 0.12, 0.18, musicGain, 1500, 8000);
      else if (dr === 'h') noise(t, 0.04, 0.07, musicGain, 7000, 14000);
      current.step++;
      current.nextTime += stepDur;
      if (current.step >= tr.len) {
        if (tr.loop) current.step = 0;
        else { const n = current.name; stopMusic(); current = { name: n, track: { ...tr, lead: [], bass: [], drums: [], len: 1e9 }, step: 0, nextTime: 0 }; return; }
      }
    }
  }

  // ---- sound effects
  const SFX = {
    jump:   (t) => tone('square', 260, t, 0.14, 0.12, sfxGain, 620),
    djump:  (t) => { tone('square', 420, t, 0.1, 0.1, sfxGain, 900); tone('square', 600, t + 0.05, 0.1, 0.07, sfxGain, 1200); },
    shoot:  (t) => { tone('square', 900, t, 0.08, 0.08, sfxGain, 300); noise(t, 0.05, 0.05, sfxGain, 3000); },
    stomp:  (t) => { tone('square', 500, t, 0.1, 0.13, sfxGain, 120); },
    hit:    (t) => { tone('square', 300, t, 0.06, 0.1, sfxGain, 150); noise(t, 0.06, 0.1, sfxGain, 1000); },
    kill:   (t) => { tone('square', 700, t, 0.08, 0.1, sfxGain, 1400); tone('square', 1000, t + 0.06, 0.1, 0.08, sfxGain, 2000); noise(t, 0.15, 0.08, sfxGain, 2000); },
    drop:   (t) => { tone('square', 988, t, 0.06, 0.08, sfxGain); tone('square', 1319, t + 0.06, 0.12, 0.08, sfxGain); },
    heart:  (t) => { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, t + i * 0.06, 0.1, 0.08, sfxGain)); },
    hurt:   (t) => { tone('sawtooth', 400, t, 0.25, 0.12, sfxGain, 80); },
    die:    (t) => { [600, 500, 400, 300, 200].forEach((f, i) => tone('square', f, t + i * 0.08, 0.1, 0.1, sfxGain)); },
    checkpoint: (t) => { [523, 784, 1047, 1568].forEach((f, i) => tone('square', f, t + i * 0.07, 0.12, 0.08, sfxGain)); },
    right:  (t) => { [659, 784, 1047, 1319].forEach((f, i) => tone('square', f, t + i * 0.08, 0.14, 0.09, sfxGain)); },
    wrong:  (t) => { tone('square', 200, t, 0.18, 0.12, sfxGain); tone('square', 150, t + 0.18, 0.3, 0.12, sfxGain); },
    gate:   (t) => { for (let i = 0; i < 6; i++) noise(t + i * 0.05, 0.05, 0.08, sfxGain, 400, 2000); tone('square', 150, t, 0.35, 0.08, sfxGain, 600); },
    blip:   (t) => tone('square', 1200 + Math.random() * 200, t, 0.025, 0.035, sfxGain),
    select: (t) => tone('square', 880, t, 0.05, 0.08, sfxGain),
    confirm:(t) => { tone('square', 660, t, 0.06, 0.08, sfxGain); tone('square', 990, t + 0.06, 0.1, 0.08, sfxGain); },
    spring: (t) => tone('square', 200, t, 0.25, 0.12, sfxGain, 1200),
    lever:  (t) => { tone('square', 300, t, 0.05, 0.1, sfxGain); noise(t, 0.05, 0.1, sfxGain, 2000); },
    bossHit:(t) => { tone('sawtooth', 200, t, 0.15, 0.15, sfxGain, 60); noise(t, 0.15, 0.12, sfxGain, 500); },
    bossDie:(t) => { for (let i = 0; i < 10; i++) { noise(t + i * 0.1, 0.15, 0.15, sfxGain, 200 + i * 100); tone('square', 800 - i * 60, t + i * 0.1, 0.1, 0.08, sfxGain); } },
    powerup:(t) => { [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone('square', f, t + i * 0.07, 0.12, 0.08, sfxGain)); },
    save:   (t) => { tone('triangle', 784, t, 0.08, 0.2, sfxGain); tone('triangle', 1175, t + 0.08, 0.15, 0.2, sfxGain); },
    crumble:(t) => noise(t, 0.2, 0.1, sfxGain, 300, 3000),
    enemyShoot: (t) => tone('square', 300, t, 0.08, 0.05, sfxGain, 500),
    splash: (t) => { noise(t, 0.25, 0.12, sfxGain, 600, 6000); tone('sine', 900, t, 0.15, 0.1, sfxGain, 200); },
  };
  function sfx(name) {
    if (!ctx || !sfxOn) return;
    const f = SFX[name];
    if (f) f(ctx.currentTime + 0.001);
  }

  function setMusic(on) { musicOn = on; if (musicGain) musicGain.gain.value = on ? 0.55 : 0; }
  function setSfx(on) { sfxOn = on; if (sfxGain) sfxGain.gain.value = on ? 0.8 : 0; }

  return { init, playMusic, stopMusic, sfx, setMusic, setSfx, get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; } };
})();
